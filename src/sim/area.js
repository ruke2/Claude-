// ============================================================
//  エリアマネジメント
//
//    同じ地区に物件を持ち寄り、街区そのものを運営する。
//    丸の内や大手町でデベロッパーがやっている、あの仕事である。
//
//    なぜ要るか。物件を1棟ずつ買って建てるだけだと、
//    「どこに建てても同じ」になってしまう。
//    同じ地区に集めた会社だけが得をする道を1本通すと、
//    地図の上で自分の街を作る意味が出る。
//
//    **効果は地区全体に及ぶ。** 自社物件だけでなく、
//    その地区の地価そのものが上がる。つまり他社の土地も一緒に値上がりし、
//    自分の次の用地取得は高くつく。**先に買い集めてから始めるのが筋**という、
//    順番のある仕組みにしてある。
//
//    **`valuation.js` から読まれる側である。** ここから valuation を読まないこと
//    （`landAppraisal` が `areaLift` を掛けているので相互参照になる）。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN } from '../data/city.js';
import { WEEKS_PER_YEAR, WEEKS_PER_QUARTER } from '../core/time.js';

/** 設立に必要な、その地区の自社保有物件の数 */
export const AREA_MIN_ASSETS = 3;

/** 効果が満額になるまでの年数 */
export const MATURE_YEARS = 5;

/**
 * エリアマネジメントの施策。
 *
 * `cost` は年額（百万円／自社延床1万坪あたり）。
 * 効果のキーは `areaEffect(g, d, key)` で引く。
 * **キーを足したら必ずどこかで読むこと。** 読まれないキーは
 * 「説明文に書いてあるのに何も起きない」状態になる。
 */
export const AREA_PROGRAMS = [
  {
    id: 'safety', name: '共同防災・帰宅困難者支援', icon: '🛟', cost: 34,
    effect: { safety: 0.30, brand: 0.9 },
    desc: '防災備蓄と一時滞在施設を街区で共同運用し、帰宅困難者の受け入れ訓練を行う。'
      + '災害時の被害を3割抑える。自治体との関係もできる。',
    reads: '災害時の被害',
  },
  {
    id: 'green', name: 'まちなみ緑化と広場の維持管理', icon: '🌳', cost: 46,
    effect: { land: 0.030, occ: 0.020, brand: 0.7 },
    desc: '歩道の植栽、広場の清掃・警備、street furniture の更新を街区でまとめて行う。'
      + '地区の地価が上がり、オフィスと住宅の稼働率も上向く。',
    reads: '地区の地価・稼働率',
  },
  {
    id: 'event', name: 'にぎわいイベントとオープンカフェ', icon: '🎪', cost: 52,
    effect: { land: 0.014, occRetail: 0.045, pop: 0.05, brand: 1.2 },
    desc: 'マルシェ、屋外席の道路占用、季節のイベントを street の側から仕掛ける。'
      + '商業とホテルの稼働率が上がり、その地区に住みたい人も増える。',
    reads: '商業とホテルの稼働率・地区の人口',
  },
  {
    id: 'mobility', name: 'エリア内交通とモビリティ', icon: '🚌', cost: 58,
    effect: { land: 0.034, occ: 0.014 },
    desc: '街区を巡るシャトルバスと自転車シェアを運行し、駅からの動線をつなぐ。'
      + '駅から遠い街区ほど効き目が大きく、地価に効く。',
    reads: '地区の地価・稼働率',
  },
  {
    id: 'digital', name: 'エリアデータとサイネージ', icon: '📡', cost: 30,
    effect: { lead: 0.22, fee: 0.004, brand: 0.5 },
    desc: '人流データの計測とサイネージ広告を街区で共同運用する。'
      + 'テナントからの引き合いが増え、広告料の分配も入る。',
    reads: 'テナントの引き合い・フィー収入',
  },
];

export const programById = id => AREA_PROGRAMS.find(p => p.id === id);

/** その地区のエリアマネジメント団体（無ければ null） */
export function areaOf(g, d) {
  return (g.areas || []).find(a => a.d === d) || null;
}

/** その地区の自社保有物件 */
export function assetsIn(g, d) {
  return (g.assets || []).filter(a => a.district === d);
}

/**
 * その地区の延床に対する自社のシェア。
 * 既存の街並み（`cell.building`）も分母に入れる。
 * **自社物件だけで割らないこと。** 1棟建てただけでシェア100%になる
 *
 * **この値は必ずキャッシュを通して引くこと。**
 * 分母は全区画（6,400）の走査である。`areaLift()` は `landAppraisal()` から
 * 呼ばれていて、`land.js` の `pickBand()` は毎週それを区画の数だけ叩く。
 * 素で計算すると 1週あたり数百万回のループになり、週送りが目に見えて重くなる。
 * 分母（街の延床）は週単位でしか動かないので、週ごとに1回数えれば足りる。
 */
const SHARE_CACHE = { key: '', v: {} };

export function areaShare(g, d) {
  // 鍵に区画数と物件数を混ぜる。セーブを読み込んで別の局面に移ったとき、
  // 同じ週のまま古い値を返さないようにするため
  const key = `${g.week}|${(g.assets || []).length}|${(g.areas || []).length}|${g.cells.length}`;
  if (SHARE_CACHE.key !== key) { SHARE_CACHE.key = key; SHARE_CACHE.v = {}; }
  const hit = SHARE_CACHE.v[d];
  if (hit !== undefined) return hit;

  let mine = 0, all = 0;
  for (const a of assetsIn(g, d)) mine += a.gfa || a.nra * 1.4;
  for (const c of g.cells) {
    if (c.d !== d || c.terrain !== TERRAIN.LOT) continue;
    const b = c.building;
    if (b) all += (b.gfa || c.area * (b.floors || 4) * 0.55);
  }
  all = Math.max(all, mine);
  const r = all > 0 ? clamp01(mine / all) : 0;
  SHARE_CACHE.v[d] = r;
  return r;
}

/** 設立できるか。理由を返す（できるときは null） */
export function canFound(g, d) {
  if (!DISTRICTS[d]) return '地区が見つからない';
  if (areaOf(g, d)) return 'すでに設立している';
  const n = assetsIn(g, d).length;
  if (n < AREA_MIN_ASSETS) return `この地区に保有物件が${AREA_MIN_ASSETS}棟必要である（いま${n}棟）`;
  return null;
}

/** 設立する */
export function found(g, d, news) {
  const err = canFound(g, d);
  if (err) return { ok: false, message: err };
  if (!g.areas) g.areas = [];
  const name = `${DISTRICTS[d].name}エリアマネジメント協議会`;
  g.areas.push({ d, name, since: g.week, programs: [], cumCost: 0 });
  g.company.brand = clamp(g.company.brand + 1.2, 0, 100);
  news && news.push({
    icon: '🏙', type: 'area', major: true,
    text: `【${name}】を設立した。街区の共同運営を通じて、${DISTRICTS[d].name}そのものの価値を引き上げる。`,
  });
  return { ok: true };
}

/** 解散する */
export function dissolve(g, d, news) {
  const i = (g.areas || []).findIndex(a => a.d === d);
  if (i < 0) return { ok: false, message: '設立していない' };
  const a = g.areas[i];
  g.areas.splice(i, 1);
  g.company.brand = clamp(g.company.brand - 1.6, 0, 100);
  news && news.push({ icon: '🏚', type: 'area', text: `【${a.name}】を解散した。街区の共同運営は終了する。` });
  return { ok: true };
}

/** 施策の入れ替え */
export function toggleProgram(g, d, id) {
  const a = areaOf(g, d);
  if (!a || !programById(id)) return false;
  const i = a.programs.indexOf(id);
  if (i >= 0) a.programs.splice(i, 1);
  else a.programs.push(id);
  return true;
}

/**
 * 効き目の強さ（0〜1）。
 * 設立からの年数（`MATURE_YEARS` で満額）と、自社のシェアの掛け算。
 *
 * **シェアを無視しないこと。** 1棟しか持っていない地区で
 * 街区の運営ができてしまうと、地価だけ上げて他社の土地を
 * 買い叩く道具になる
 */
export function maturityOf(g, a) {
  const years = (g.week - a.since) / WEEKS_PER_YEAR;
  const age = clamp01(years / MATURE_YEARS);
  const share = clamp01(areaShare(g, a.d) / 0.45);
  return clamp01(age * (0.35 + share * 0.65));
}

/**
 * 施策の効果を引く。
 * 読み手は `valuation.js`（land）・`sales.js`（occ / occRetail）・
 * `tenants.js`（lead）・`population.js`（pop）・`cityevents.js`（safety）である。
 */
export function areaEffect(g, d, key) {
  const a = areaOf(g, d);
  if (!a || !a.programs || !a.programs.length) return 0;
  const m = maturityOf(g, a);
  let v = 0;
  for (const id of a.programs) {
    const p = programById(id);
    if (p && p.effect[key]) v += p.effect[key];
  }
  return v * m;
}

/**
 * 地価に乗る倍率。
 * **天井を外さないこと。** 施策を全部入れて長く続けると
 * 地価が青天井に伸び、残余法がどの用途でも通ってしまう
 */
export function areaLift(g, d) {
  if (!g.areas || !g.areas.length) return 1;
  return 1 + Math.min(0.10, areaEffect(g, d, 'land'));
}

/** 稼働率に乗る倍率 */
export function areaOcc(g, d, use) {
  if (!g.areas || !g.areas.length) return 1;
  const base = areaEffect(g, d, 'occ');
  const retail = (use === 'retail' || use === 'hotel' || use === 'mixed') ? areaEffect(g, d, 'occRetail') : 0;
  return 1 + Math.min(0.08, base + retail);
}

/** 災害の被害に掛かる倍率（小さいほど被害が軽い） */
export function areaSafety(g, d) {
  if (!g.areas || !g.areas.length) return 1;
  return 1 - Math.min(0.30, areaEffect(g, d, 'safety'));
}

/** 年間の運営費（百万円） */
export function areaCost(g, d) {
  const a = typeof d === 'string' ? areaOf(g, d) : d;
  if (!a) return 0;
  let gfa = 0;
  for (const x of assetsIn(g, a.d)) gfa += x.gfa || x.nra * 1.4;
  const unit = Math.max(0.6, gfa / 10000);          // 自社延床1万坪を1単位とする
  let c = 0;
  for (const id of a.programs) {
    const p = programById(id);
    if (p) c += p.cost * unit;
  }
  return Math.round(c);
}

/** 全地区の年間運営費 */
export function totalAreaCost(g) {
  return (g.areas || []).reduce((s, a) => s + areaCost(g, a), 0);
}

/** 毎週の処理 — 運営費の計上とブランドの積み上げ */
export function stepArea(g, rng, news) {
  if (!g.areas || !g.areas.length) return;
  const cost = totalAreaCost(g) / WEEKS_PER_YEAR;
  if (cost > 0) {
    g.cash -= cost;
    g.finance.quarterAcc.sga += cost;
    for (const a of g.areas) a.cumCost = (a.cumCost || 0) + areaCost(g, a) / WEEKS_PER_YEAR;
  }
  // サイネージ・広告の分配（digital）
  let fee = 0;
  for (const a of g.areas) {
    const f = areaEffect(g, a.d, 'fee');
    if (f <= 0) continue;
    for (const x of assetsIn(g, a.d)) fee += x.nra * x.rent * 12 / 1e6 * f / WEEKS_PER_YEAR;
  }
  if (fee > 0) { g.cash += fee; g.finance.quarterAcc.revFee += fee; }

  // 四半期に1回だけブランドに効かせる（毎週積むと伸びすぎる）
  if (g.week % WEEKS_PER_QUARTER !== 0) return;
  let br = 0;
  for (const a of g.areas) br += areaEffect(g, a.d, 'brand');
  if (br > 0) g.company.brand = clamp(g.company.brand + br * 0.25, 0, 100);
}

/** 表示用：設立できる／している地区の一覧 */
export function areaCandidates(g) {
  const seen = new Set();
  const out = [];
  for (const a of g.assets || []) {
    if (seen.has(a.district)) continue;
    seen.add(a.district);
    const n = assetsIn(g, a.district).length;
    out.push({
      d: a.district, name: DISTRICTS[a.district].name, assets: n,
      share: areaShare(g, a.district), area: areaOf(g, a.district),
    });
  }
  for (const x of g.areas || []) if (!seen.has(x.d)) {
    out.push({ d: x.d, name: DISTRICTS[x.d].name, assets: 0, share: areaShare(g, x.d), area: x });
  }
  return out.sort((a, b) => (b.area ? 1 : 0) - (a.area ? 1 : 0) || b.assets - a.assets);
}
