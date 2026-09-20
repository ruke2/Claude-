// ============================================================
//  用地取得 — 売却情報・デューデリジェンス・入札
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN, USES, cityOf } from '../data/city.js';
import { uid } from '../core/state.js';
import { landAppraisal, devPlan, bestUseFit, subEffect } from './valuation.js';
import { orgPower } from './hr.js';
import { isHome, HOME, unlocked } from './company.js';
import { WEEKS_PER_QUARTER } from '../core/time.js';

/** 土地に潜むリスクと好材料 */
export const RISKS = [
  { id: 'soil',       name: '土壌汚染',             p: 0.115, bad: true, desc: '旧工場等に由来する汚染。除去費用が土地代の6〜16%発生する。' },
  { id: 'buried',     name: '埋蔵文化財の包蔵地',   p: 0.085, bad: true, desc: '試掘調査が必要で、着工が2四半期遅れる。' },
  { id: 'obstacle',   name: '地中障害物',           p: 0.100, bad: true, desc: '旧建物の基礎杭などが残存。建設費が7%増える。' },
  { id: 'opposition', name: '近隣住民の反対運動',   p: 0.115, bad: true, desc: '計画の縮小を求められ、容積消化率が15%落ち工期も延びる。' },
  { id: 'leasehold',  name: '借地権・底地の未整理', p: 0.075, bad: true, desc: '権利関係の整理に土地代の8%相当の追加費用がかかる。' },
  { id: 'shadow',     name: '日影規制の強い制約',   p: 0.095, bad: true, desc: '計画建物の階数が実質的に15%制限される。' },
  { id: 'road',       name: '接道条件が劣る',       p: 0.080, bad: true, desc: '工事車両の動線が取れず建設費4%増・工期1四半期増。' },
  { id: 'asbestos',   name: '既存建物のアスベスト', p: 0.070, bad: true, desc: '解体費用が土地代の5%相当増加する。' },
  { id: 'upzoning',   name: '容積率割増の見込み',   p: 0.085, bad: false, desc: '総合設計制度の適用が見込め、容積率が15%上乗せできる。' },
  { id: 'newstation', name: '新駅設置計画',         p: 0.055, bad: false, desc: '数年内に新駅が開業する見込み。将来の賃料・分譲単価が上がる。' },
];

/** 取得諸費用率（仲介手数料・不動産取得税・登録免許税ほか） */
export const ACQ_FEE = 0.052;

const KINDS = {
  tender:   { id: 'tender',   name: '一般競争入札', icon: '⚖', desc: '最高価格を提示した者が落札する。価格だけが評価される。' },
  proposal: { id: 'proposal', name: '事業提案コンペ', icon: '✎', desc: '価格に加えて企画内容が評価される。企画力が高ければ安値でも勝てる。' },
  nego:     { id: 'nego',     name: '相対（先着）', icon: '🤝', desc: '売主の提示額で即時取得できる。ただし価格は強気で、瑕疵が隠れていることも多い。' },
  public:   { id: 'public',   name: '公募型プロポーザル', icon: '⚑', desc: '自治体や公社が公有地を払い下げる案件。価格より企画が重く見られる。用途と公共貢献が条件として付き、守らなければ着工できない。' },
};
export { KINDS as LISTING_KINDS };

/**
 * 公共案件のひな型。
 * 公有地は相場より安く出るかわりに、用途が指定され、
 * 広場や保育所といった公共貢献施設を抱き合わせで作らされる。
 */
export const PUBLIC_PROGRAMS = [
  {
    id: 'station', name: '駅前拠点再整備事業', use: 'mixed', icon: '🚉',
    fit: ['T', 'B', 'I', 'S', 'M', 'K'],
    benefit: 0.085, minGrade: 'high', brand: 4.0, discount: 0.68,
    seller: '湊都市 都市整備局',
    desc: '駅前の市有地を一体で作り替える。低層に公共公益施設（図書館・行政窓口）を入れることが条件で、事業費が約8.5%増える。',
  },
  {
    id: 'housing', name: '市営住宅の建替え・余剰地活用', use: 'rental', icon: '🏘',
    fit: ['N', 'W', 'A', 'B', 'S', 'F'],
    benefit: 0.055, minGrade: 'standard', brand: 2.2, discount: 0.60,
    seller: '湊都市 住宅供給公社',
    desc: '老朽化した市営住宅を建て替え、余剰地を賃貸住宅として活用する。一定戸数を市に返す取り決めがあり、事業費が約5.5%増える。',
  },
  {
    id: 'park', name: '公園隣接地の活用（Park-PFI）', use: 'retail', icon: '🌳',
    fit: ['A', 'N', 'S', 'B', 'W', 'F', 'K'],
    benefit: 0.07, minGrade: 'high', brand: 3.0, discount: 0.58,
    seller: '湊都市 公園緑地課',
    desc: '公園の一部を賃借し、カフェや店舗を整備する。園路と広場の改修を負担する条件が付き、事業費が約7%増える。',
  },
  {
    id: 'logi', name: '産業用地の分譲（企業誘致）', use: 'logi', icon: '🚚',
    fit: ['J', 'E', 'N'],
    benefit: 0.03, minGrade: 'standard', brand: 1.6, discount: 0.52,
    seller: '湊都市 産業振興公社',
    desc: '市が造成した産業用地を、雇用創出を条件に安く払い下げる。取付道路の整備を負担する。',
  },
  {
    id: 'medical', name: '医療・研究拠点の誘致', use: 'office', icon: '⚕',
    fit: ['M', 'S', 'T', 'I'],
    benefit: 0.075, minGrade: 'high', brand: 3.4, discount: 0.64,
    seller: '湊都市 政策企画部',
    desc: '研究機関の誘致を前提に市有地を提供する。共同研究スペースの無償提供が条件で、事業費が約7.5%増える。',
  },
  {
    id: 'tourism', name: '観光拠点整備事業', use: 'hotel', icon: '⛩',
    fit: ['K', 'I', 'E', 'B'],
    benefit: 0.06, minGrade: 'high', brand: 3.2, discount: 0.62,
    seller: '湊都市 観光交流課',
    desc: '観光案内所と交流スペースの併設を条件に、市有地へ宿泊施設を整備する。事業費が約6%増える。',
  },
];

/**
 * 売却情報に出す区画の規模帯（想定地価・百万円）。
 * 区画を一様に引くと、区画数の多い地区に引きずられて
 * 大型案件が出る頻度が下がってしまう。面積ではなく金額で帯を切る。
 */
/** 進出先の都市から持ち込まれる割合 */
/**
 * 進出先の都市から持ち込まれる割合。
 * **合計を 1.00 に近づけないこと。** 残りが湊都市のぶんになる。
 * 新しい都市を足すたびに湊都市の案件が薄まるので、控えめに置く
 */
const CITY_SHARE = { tsurumino: 0.20, hinoura: 0.13, yakumo: 0.14, yukino: 0.12 };

const SIZE_BANDS = [
  { min: 0, max: 1500, w: 2.8 },          // 小口（〜15億／若葉町・千歳丘・テクノパーク・北野）
  { min: 1500, max: 6000, w: 2.7 },       // 中口（15〜60億／空港・鶴見野・桜川・神楽坂・瑞穂台）
  { min: 6000, max: 20000, w: 2.2 },      // 大口（60〜200億／汐見・銀鈴町・南雲）
  { min: 20000, max: 60000, w: 1.9 },     // 特大（200〜600億／常盤・汐凪・官庁街・港南）
  { min: 60000, max: Infinity, w: 1.2 },  // 超大型（600億〜／常盤・港南の大街区）
];

/**
 * 投資余力に対して、これを下回る案件は「持ち込まれにくい」とみなす割合。
 * 余力2兆円の会社に5億円の土地話は回ってこない、という手触りを出すための境目である。
 */
const SMALL_FLOOR = 0.05;

/**
 * 会社の規模に合わせて帯の重みを付け直す。
 *
 * 帯の境目は固定の金額なので、**これが無いと会社が兆円規模に育っても
 * 同じ割合で15億の土地が回ってくる。**
 * 実際には、大手デベロッパーに数億円の土地の話は持ち込まれない。
 * 仲介は決済できる相手を選ぶし、社内の用地部も小口を追わなくなる。
 *
 * `power` は投資余力（現金＋借入余力）。`finance.js` の `investPower()` で、
 * 一棟買い（`trading.js`）が出物を選ぶときと同じ物差しである。
 *
 * **小口をゼロにしないこと。** 地盤の小さな区画を押さえる動きは
 * 規模が大きくなっても残る。比の冪乗で薄くしているので、
 * どれだけ大きくなっても小口は4%ほど残り、絶えることはない。
 * **大きすぎるものも出さないこと。** 買えない案件ばかり並ぶと、
 * 見るものが無い週が続く（`trading.js` の `fit()` と同じ考え方）。
 *
 * **下駄（+0.12 のような定数）を履かせないこと。**
 * 定数を足すと、余力が10兆円を超えたあたりで全部の帯がその定数に潰れ、
 * かえって小口が戻ってくる（実測で 小口 10% → 15%）。
 * 比の冪乗だけにしておくと、ある規模から先は
 * 4 / 10 / 17 / 28 / 40% に落ち着いてそれ以上は動かない。
 */
function bandWeights(power) {
  const p = Math.max(2000, power || 2000);
  return SIZE_BANDS.map(b => {
    // 帯を代表する金額。上限の無い帯は下限の2.5倍で見る
    const mid = b.max === Infinity ? b.min * 2.5 : Math.sqrt(Math.max(b.min, 200) * b.max);
    const r = mid / p;
    // 買えない大きさは外す
    const big = r > 1.6 ? 0.04 : r > 1.0 ? 0.38 : 1;
    // 余力に対して小さすぎる案件は薄くなる
    const small = Math.min(1, Math.pow(r / SMALL_FLOOR, 0.55));
    return { ...b, w: b.w * big * small };
  });
}

/**
 * その帯に入る区画を選ぶ。
 *
 * 帯の境目は「いまの相場での評価額」で見る。
 * **固定の想定地価（baseValue）で切らないこと。** 相場が上がると
 * 区画が実際より安い帯に居座り、特大の帯が空になっていく。
 *
 * 帯が空だったときは**隣の帯にずらす**。
 * 以前はここで区画全体に戻していたため、自社が一等地を買い集めたあと
 * 「特大の帯を引いたのに小口の区画が出てくる」状態になり、
 * 長く遊ぶほど大型案件が出なくなっていた。
 */
function pickBand(g, pool, bandIdx) {
  const inBand = (c, b) => {
    const v = landAppraisal(g, c);
    return v >= b.min && v < b.max;
  };
  for (let step = 0; step < SIZE_BANDS.length; step++) {
    // 引いた帯 → 1つ下 → 1つ上 → 2つ下 … の順に探す
    for (const dir of step === 0 ? [0] : [-step, step]) {
      const b = SIZE_BANDS[bandIdx + dir];
      if (!b) continue;
      const s = pool.filter(c => inBand(c, b));
      if (s.length) return s;
    }
  }
  return pool;
}

/**
 * 公共案件の公募。
 * 民間の売却情報とは別枠で、ごくまれに出る。
 * 規模に届いていない会社には参加資格がない。
 */
export function generatePublic(g, rng, news) {
  if (!unlocked(g, 'public')) return;
  if (g.listings.filter(l => l.kind === 'public').length >= 2) return;
  if (!rng.chance(0.55 / WEEKS_PER_QUARTER)) return;           // 四半期に1件強

  const prog = rng.weighted(PUBLIC_PROGRAMS.map(p => ({ p, w: 1 }))).p;
  const pool = g.cells.filter(c =>
    c.terrain === TERRAIN.LOT && c.d && prog.fit.includes(c.d)
    && !c.onSale && c.owner !== 'player' && !c.projectId && !c.assetId && !c.invId);
  if (!pool.length) return;
  // 公有地は大きめの区画が出る
  const cand = rng.shuffle(pool).sort((a, b) => (b.area || 0) - (a.area || 0)).slice(0, 10);
  const c = rng.pick(cand);
  if (!c || c.onSale) return;

  const appraisal = landAppraisal(g, c);
  // 公有地の払下げは安い。そのかわり条件が付く
  const price = Math.round(appraisal * prog.discount * rng.range(0.94, 1.08));
  c.onSale = {
    id: uid('L'), cellId: c.id, kind: 'public', appraisal,
    askPrice: price, deadline: rng.int(6, 12),
    seller: prog.seller, risks: [], ddLevel: 0, bid: null,
    bestUse: prog.use,
    program: {
      id: prog.id, name: prog.name, icon: prog.icon, use: prog.use,
      benefit: prog.benefit, minGrade: prog.minGrade, brand: prog.brand, desc: prog.desc,
    },
    note: `${prog.seller}による公募型プロポーザル。提案内容の評価が7割、価格が3割で審査される。`,
    week: g.week,
  };
  g.listings.push(c.onSale);
  news && news.push({
    icon: '⚑', type: 'land', major: true,
    text: `${prog.seller}が${DISTRICTS[c.d].name}で「${prog.name}」の事業者公募を開始した。`,
  });
}

/** いま用地を取得できる都市 */
export function citiesOpen(g) {
  const set = new Set(['minato']);
  if (unlocked(g, 'city2')) set.add('tsurumino');
  if (unlocked(g, 'city3')) set.add('hinoura');
  if (unlocked(g, 'city4')) set.add('yakumo');
  if (unlocked(g, 'city5')) set.add('yukino');
  return set;
}

/**
 * 毎週の売却情報生成。
 *
 * `power` は投資余力（`finance.js` の `investPower()`）。
 * **`land.js` から `finance.js` を読まないこと**（`finance.js` が
 * `holdingCost` を読んでいるので相互参照になる）。呼ぶ側が渡す。
 */
export function generateListings(g, rng, news, power = 0) {
  const p = orgPower(g);
  // 用地部の情報力で入手できる案件数が増える
  // 販売仲介会社を傘下に持つと持ち込み件数が増える（landInfo）。
  // 以前は「持っているかどうか」の判定で、統合の進み具合も健全度も反映していなかった
  const infoPower = p.land.quality / 100 + p.land.capacity / 26 + subEffect(g, 'landInfo') * 2.5;
  // 週あたりの持ち込み件数（端数は確率的に切り上げる）
  const rate = (1.6 + infoPower * 1.5 + g.market.sentiment * 1.4) / 4.2;
  let n = Math.floor(rate);
  if (rng.next() < rate - n) n++;
  n = clamp(n, 0, 3);
  if (g.listings.length >= 20) return;
  // 進出していない都市の用地は情報が回ってこない
  const reach = citiesOpen(g);
  const pool = g.cells.filter(c =>
    c.terrain === TERRAIN.LOT && c.d && reach.has(cityOf(c.d))
    && !c.onSale && c.owner !== 'player' && !c.projectId && !c.assetId && !c.invId);
  if (!pool.length) return;

  // 帯の重みは会社の投資余力で変わる。
  // 大きくなるほど小口の話が減り、大型の話が増える
  const weights = bandWeights(power);

  for (let i = 0; i < n; i++) {
    // 情報の出どころを3段階で絞る。
    //  1) どの都市か … 進出先には地元のチームがいるので一定の割合で回ってくる
    //  2) どの金額帯か … 区画を一様に引くと、小口の区画が多い地区に引きずられて
    //                    大型案件がほとんど出てこなくなる
    //  3) 地盤か … 地元の地権者・仲介から先に話が来ることがある
    // 帯を先に決めてから都市と地盤で絞る。
    // 先に都市で絞ると、大型案件のある帯の出方まで動いてしまう
    const band = rng.weighted(weights);
    let scope = pickBand(g, pool, weights.indexOf(band));
    // 進出済みの都市のなかから、割合に従って1つ選ぶ
    // **`CITY_SHARE` に足した都市をこのループから漏らさないこと。**
    // 以前 yukino が抜けていて、雪野市の用地だけ一度も回ってこなかった
    let wantCity = 'minato';
    let roll = rng.next();
    for (const cid of Object.keys(CITY_SHARE)) {
      if (!reach.has(cid)) continue;
      if (roll < CITY_SHARE[cid]) { wantCity = cid; break; }
      roll -= CITY_SHARE[cid];
    }
    const byCity = scope.filter(c => cityOf(c.d) === wantCity);
    if (byCity.length) scope = byCity;
    if (rng.chance(HOME.info)) {
      const hm = scope.filter(c => isHome(g, c.d));
      if (hm.length) scope = hm;
    }
    // 更地 > 築古ビル > その他 の順に出やすい
    const cand = rng.shuffle(scope).sort((a, b) => score(b, g) - score(a, g)).slice(0, 14);
    const c = rng.pick(cand);
    if (!c || c.onSale) continue;

    const appraisal = landAppraisal(g, c);
    const kind = rng.weighted([
      { k: 'tender', w: 5 }, { k: 'proposal', w: 3 }, { k: 'nego', w: 2.4 },
    ]).k;
    const heat = 0.9 + g.market.sentiment * 0.3;
    const askMul = kind === 'nego' ? rng.range(1.02, 1.30) : rng.range(0.82, 1.06);

    const risks = [];
    for (const r of RISKS) {
      let pr = r.p;
      if (r.id === 'asbestos' && !c.building) pr = 0.01;
      if (r.id === 'soil' && c.d === 'J') pr *= 2.1;
      if (r.id === 'opposition' && (c.d === 'A' || c.d === 'K')) pr *= 1.9;
      if (r.id === 'buried' && c.d === 'K') pr *= 2.0;
      if (r.id === 'shadow' && (c.d === 'A' || c.d === 'N')) pr *= 1.7;
      if (r.id === 'newstation' && c.station > 0.85) pr *= 0.4;
      if (rng.chance(pr)) risks.push({ ...r, found: false });
    }

    const seller = rng.pick([
      '地方銀行（担保処分）', '事業会社（資産圧縮）', '個人地権者（相続）', '外資系ファンド（出口）',
      '製造業（工場移転）', '学校法人（校舎統合）', '鉄道会社（遊休地）', '自治体（公有地払下げ）',
    ]);

    c.onSale = {
      id: uid('L'), cellId: c.id, kind, appraisal,
      askPrice: Math.round(appraisal * askMul * heat),
      deadline: kind === 'nego' ? rng.int(5, 11) : rng.int(3, 8),
      seller, risks, ddLevel: 0, bid: null,
      bestUse: bestUseFit(c),
      note: rng.pick([
        '売主は早期の決済を希望している。', '同業各社にも情報が回っている。',
        '地元では以前から売却の噂があった土地である。', '入札参加者は多いと見られる。',
        '条件次第では価格交渉の余地がある。', '売主は価格よりも計画内容を重視している。',
      ]),
      week: g.week,
    };
    g.listings.push(c.onSale);
  }

  function score(c, g) {
    let s = rng.next() * 0.5;
    if (c.vacant) s += 1.2;
    if (c.building && c.building.year < 1998) s += 0.8;
    if (c.owner === 'other') s += 0.5;
    s += (g.market.sentiment - 0.5) * 0.4;
    return s;
  }
}

/** デューデリジェンス費用 */
export function ddCost(listing, level) {
  return Math.round(listing.askPrice * (level === 1 ? 0.004 : 0.013));
}

/** 調査を実施し、隠れた事実を発見する */
export function runDueDiligence(g, listing, level, rng) {
  const p = orgPower(g);
  const base = level === 1 ? 0.48 : 0.86;
  const skill = clamp01(base + (p.land.quality - 55) / 260 + (p.corp.quality - 55) / 420);
  let found = 0;
  for (const r of listing.risks) {
    if (r.found) continue;
    if (rng.chance(skill)) { r.found = true; found++; }
  }
  listing.ddLevel = Math.max(listing.ddLevel, level);
  listing.ddSkill = skill;
  return found;
}

/** 落札後に発生する追加負担を計算する */
export function riskImpact(g, cell, risks) {
  const eff = { extraCost: 0, delay: 0, buildMul: 1, farMul: 1, floorMul: 1, priceMul: 1 };
  const land = cell.lastPaid || landAppraisal(g, cell);
  for (const r of risks) {
    switch (r.id) {
      case 'soil': eff.extraCost += land * (0.06 + (r.mag ?? 0.5) * 0.10); break;
      case 'buried': eff.delay += 2; break;
      case 'obstacle': eff.buildMul *= 1.07; break;
      case 'opposition': eff.farMul *= 0.85; eff.delay += 1; break;
      case 'leasehold': eff.extraCost += land * 0.08; break;
      case 'shadow': eff.floorMul *= 0.85; break;
      case 'road': eff.buildMul *= 1.04; eff.delay += 1; break;
      case 'asbestos': eff.extraCost += land * 0.05; break;
      case 'upzoning': eff.farMul *= 1.15; break;
      case 'newstation': eff.priceMul *= 1.12; break;
    }
  }
  return eff;
}

/** ライバルの入札額を決める */
function rivalBid(g, listing, cell, rv, rng) {
  const use = listing.bestUse;
  const fit = DISTRICTS[cell.d].fit[use] ?? 0.3;
  // 大手は小粒な案件を相手にしない（売上規模に対する最低取引額）
  // 公共案件は実績として欲しいので、小さくても手を挙げる
  const minDeal = rv.rev * (listing.kind === 'public' ? 0.0018 : 0.0062);
  if (listing.appraisal < minDeal) return null;
  // 案件が大きすぎても手を出さない
  if (listing.appraisal > rv.cash * 0.9 + rv.equity * 0.22) return null;

  // 地盤の案件には必ず手を挙げてくるし、相場より高く出せる
  const home = rv.home === cell.d;
  // 湊都市の会社なので、海峡を渡った先には及び腰になる
  const away = cityOf(cell.d) !== 'minato' ? 0.42 : 1;
  const interest = (rv.focus[use] ?? 0.3) * (0.42 + fit * 0.72) * (0.5 + rv.aggression * 0.62) * (home ? 1.7 : 1) * away;
  if (!rng.chance(clamp01(interest * 0.72))) return null;

  const plan = devPlan(g, cell, use, rv.brand > 86 ? 'high' : 'standard', { landCost: listing.appraisal });
  const ceiling = Math.max(listing.appraisal * 0.72, plan.residualLand) * (home ? HOME.bidPower : 1);
  let bid = ceiling * rng.range(0.58, 1.00) * (0.84 + rv.aggression * 0.22);
  bid *= (0.95 + (rv.momentum || 0) * 0.05);
  if (bid < listing.askPrice * 0.58) return null;
  return {
    id: rv.id, name: rv.name, short: rv.short, color: rv.color, amount: Math.round(bid),
    quality: rv.brand * 0.45 + (rv.focus[use] ?? 0.3) * 45 + (home ? HOME.bidQuality : 0),
    home,
  };
}

/** 入札の解決 */
export function resolveListing(g, listing, rng, news) {
  const cell = g.cells.find(c => c.id === listing.cellId);
  if (!cell) return null;
  const p = orgPower(g);

  const bids = [];
  for (const rv of g.rivals) {
    const b = rivalBid(g, listing, cell, rv, rng);
    if (b) bids.push(b);
  }
  // 売主の最低売却価格
  const reserve = listing.appraisal * rng.range(0.72, 0.92);

  let playerBid = null;
  if (listing.bid) {
    const planQ = listing.bid.planQuality ?? 40;
    playerBid = {
      id: 'player', name: g.company.name, short: g.company.name, color: '#e3b558',
      amount: listing.bid.amount,
      quality: g.company.brand * 0.32 + p.plan.quality * 0.30 + planQ * 0.62
        + (isHome(g, cell.d) ? HOME.bidQuality : 0)
        // 公募は過去の受注実績も評価される
        + (listing.kind === 'public' ? Math.min(18, (g.kpi.publicWon || 0) * 3.5) : 0),
      isPlayer: true, home: isHome(g, cell.d),
    };
    bids.push(playerBid);
  }
  if (!bids.length) {
    return { winner: null, bids: [], listing, cell, reason: 'nobid' };
  }

  // 評価：一般競争入札は価格のみ、提案コンペは価格＋企画
  const scored = bids.map(b => ({
    ...b,
    score: listing.kind === 'public'
      // 公募型プロポーザルは企画7割・価格3割。価格で殴っても勝てない
      ? (b.amount / Math.max(1, listing.askPrice)) * 100 * 0.42 + b.quality * 1.55
      : listing.kind === 'proposal'
        ? (b.amount / Math.max(1, listing.appraisal)) * 100 * 0.78 + b.quality * 0.78
        : b.amount,
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  // 公募は最低売却価格ではなく、提示された公募価格を下回れないという決まりになる
  if (listing.kind === 'public') {
    if (top.amount < listing.askPrice) return { winner: null, bids: scored, listing, cell, reason: 'reserve', reserve: listing.askPrice };
    return { winner: top, bids: scored, listing, cell, second: scored[1] || null };
  }
  if (top.amount < reserve) return { winner: null, bids: scored, listing, cell, reason: 'reserve', reserve };
  return { winner: top, bids: scored, listing, cell, second: scored[1] || null };
}

/** 落札処理（プレイヤー） */
export function acquireForPlayer(g, listing, cell, amount, news) {
  const fee = Math.round(amount * ACQ_FEE);
  g.cash -= (amount + fee);
  g.finance.quarterAcc.landSpend += amount + fee;
  cell.owner = 'player';
  cell.vacant = true;
  cell.building = null;
  cell.lastPaid = amount;
  cell.acquiredWeek = g.week;
  cell.risks = listing.risks.map(r => ({ ...r }));
  // 公共案件の条件（用途・グレード下限・公共貢献の負担）は区画に残る
  cell.program = listing.program ? { ...listing.program } : null;
  cell.onSale = null;
  cell.holdCost = 0;
  const idx = g.listings.indexOf(listing);
  if (idx >= 0) g.listings.splice(idx, 1);
  if (listing.program) {
    g.company.brand = clamp(g.company.brand + listing.program.brand, 0, 100);
    g.kpi.publicWon = (g.kpi.publicWon || 0) + 1;
    news && news.push({
      icon: '⚑', type: 'land', major: true,
      text: `${listing.seller}の「${listing.program.name}」で当社の提案が選定された。${DISTRICTS[cell.d].name}の用地を${Math.round(amount / 100).toLocaleString()}億円で取得。企業ブランドが上がった。`,
    });
  } else {
    news && news.push({
      icon: '🏁', type: 'land',
      text: `${DISTRICTS[cell.d].name}の用地（${cell.area.toLocaleString()}坪）を${Math.round(amount / 100).toLocaleString()}億円で取得した。諸費用${Math.round(fee / 100).toLocaleString()}億円。`,
    });
  }
  return fee;
}

/** ライバルが落札したときの反映 */
export function acquireForRival(g, listing, cell, rvId, amount) {
  const rv = g.rivals.find(r => r.id === rvId);
  cell.owner = rvId; cell.onSale = null; cell.vacant = true; cell.building = null;
  cell.rivalDev = { week: g.week, weeks: 52 + Math.floor(Math.random() * 78), use: listing.bestUse };
  if (rv) { rv.cash -= amount; rv.lots++; rv.momentum = Math.min(3, (rv.momentum || 0) + 1); }
  const idx = g.listings.indexOf(listing);
  if (idx >= 0) g.listings.splice(idx, 1);
}

/** 所有しているだけで発生する保有コスト（固定資産税ほか・週あたり） */
export function holdingCost(g, cell) {
  const v = cell.lastPaid || landAppraisal(g, cell);
  return v * 0.0042 / WEEKS_PER_QUARTER;   // 年約1.7%相当
}
/** 四半期換算の保有コスト（表示用） */
export function holdingCostQ(g, cell) { return Math.round(holdingCost(g, cell) * WEEKS_PER_QUARTER); }
