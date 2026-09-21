// ============================================================
//  セーブ／ロード
//    localStorage に4つのスロット（オート＋手動3つ）と、
//    オートセーブの1つ前を保持する
//
//  ◆ 保存先のキーは絶対に変えないこと ◆
//    キーを変えると、それまでのセーブが二度と見つからなくなる。
//    データの形を変えたときは SAVE_VERSION を上げて migrate() で吸収する。
// ============================================================
import { createGame, syncUid, defaultRankPay, isOwnedCell } from './state.js';
import { RANKS, CEO_RANK, TOP_STAFF_RANK, defaultRankNames, teamsOf, teamById } from '../data/hrdata.js';
import { RIVAL_DEFS } from '../data/companies.js';
import { salePriceOf, rentOf, saleCostShareOf } from '../sim/project.js';
import { marketRentRaw } from '../sim/valuation.js';
import { costEquilibrium } from '../sim/market.js';
import { ensurePopulation } from '../sim/population.js';
import { grantExisting } from '../sim/company.js';
import { clamp } from './format.js';
import { syncCalendar } from './time.js';
import { compress, decompress, MARK } from './lzw.js';

const PREFIX = 'skyline_v3_';          // ← 変更禁止
const META = 'skyline_v3_meta';        // ← 変更禁止
const KEY = k => PREFIX + k;

export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
export const BACKUP = 'autoPrev';      // オートセーブの1つ前（自動で退避する）
export const SLOT_LABEL = {
  auto: 'オートセーブ', slot1: 'スロット 1', slot2: 'スロット 2', slot3: 'スロット 3',
  autoPrev: 'ひとつ前の自動セーブ',
};
export const SAVE_VERSION = 10;

/**
 * 小数の桁を落とす。
 * 乱数から出た値は `0.513797406386584` のように17桁も持っており、
 * 意味の無い下の桁がセーブの1割を占めていた。おまけにこの桁は
 * まったく規則が無いので、圧縮がいちばん苦手とする並びでもある。
 * 小数第6位まで残す（金額の単位は百万円なので、誤差は1円に満たない）。
 */
const shrink = (k, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || Number.isInteger(v)) return v;
  const a = Math.abs(v);
  // 桁が大きすぎると ×1e6 が整数の安全範囲（9,007兆）を超える。
  // そこまで育った値は下の桁を落としても意味が無いので、そのまま置く
  if (a >= 1e9) return v;
  const r = Math.round(v * 1e6) / 1e6;
  // 丸めて0になるほど小さい値は、0にすると割り算で壊れることがある
  return r === 0 && v !== 0 ? v : r;
};

/** 保存用にゲーム状態を文字列化する（一時データは除く） */
export function serialize(g) {
  const { pendingReport, quarterNews, candidates, ...rest } = g;
  return JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), g: rest }, shrink);
}

function metaOf(g) {
  const bs = g.finance && g.finance.bs;
  return {
    company: g.company.name,
    year: g.year, month: g.month, weekOfMonth: g.weekOfMonth, week: g.week,
    equity: bs ? bs.equity : g.equity,
    assets: (g.assets || []).length, staff: (g.staff || []).length,
    difficulty: g.difficulty,
    savedAt: Date.now(),
  };
}

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch (e) { return {}; }
}
function writeMeta(m) {
  try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* 保存できないときは黙って諦める */ }
}

// ------------------------------------------------------------
//  互換処理
//    ゲームを更新して項目が増えても、前のセーブが読めるようにする。
//    新しいゲームを1つ作ってひな型にし、足りない項目だけを補う。
// ------------------------------------------------------------
let _tpl = null;
function template() {
  if (!_tpl) _tpl = createGame({ companyName: 'ひな型', difficulty: 'normal', seed: 1 });
  return _tpl;
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * src（新しいゲーム）にあって target（古いセーブ）に無い項目を足す。
 * すでに値がある項目には一切触らない。null は「意図して空」なので上書きしない。
 * skip に入れた項目は見ない。
 */
function fill(target, src, depth = 0, skip = null) {
  if (depth > 6) return;
  for (const k of Object.keys(src)) {
    if (skip && skip.has(k)) continue;
    const sv = src[k];
    if (target[k] === undefined) {
      target[k] = clone(sv);
    } else if (isObj(sv) && isObj(target[k])) {
      fill(target[k], sv, depth + 1);
    } else if (Array.isArray(sv) && Array.isArray(target[k]) && sv.length && isObj(sv[0])) {
      // 配列の中身にも、新しく増えた項目を足す。
      // ◆ ひな型の先頭だけで埋めないこと ◆
      //   要素ごとに中身が違う配列（競合各社など）だと、
      //   全要素が1社目の値で埋まってしまう。
      //   IDで突き合わせ、無ければ同じ位置のものを使う
      const byId = new Map();
      for (const t of sv) if (isObj(t) && t.id != null) byId.set(t.id, t);
      target[k].forEach((item, i) => {
        if (!isObj(item)) return;
        const proto = (item.id != null && byId.get(item.id)) || sv[i] || sv[0];
        if (isObj(proto)) fill(item, proto, depth + 1);
      });
    }
  }
}

const SKIP_TOP = new Set(['cells']);

/**
 * 形が変わったところを、ひな型で埋める前に手当てする。
 * 新しい版を出すたびにここへ足していく。古い順に並べること。
 */
const STEPS = [
  // REIT・私募ファンド（fund.js）を足した。入れ物だけ用意する。
  // **既存の物件を勝手にファンドへ移さないこと。** 拠出はプレイヤーの判断である
  g => { if (!Array.isArray(g.funds)) g.funds = []; },

  // ゼネコン選定と環境認証（build.js）を足した。
  // 既存の案件・物件には**認証を後付けしないこと。**
  // 取っていないものを取ったことにすると、賃料と評価が勝手に上がる。
  // 発注先は既定（準大手）として扱い、質の補正が中立になるようにする
  g => {
    if (!g.builderRel || typeof g.builderRel !== 'object') g.builderRel = {};
    for (const pj of g.projects || []) {
      if (!pj.builderId) pj.builderId = 'takanawa';
      if (!pj.certId) pj.certId = 'none';
    }
    for (const a of (g.assets || []).concat(g.inventory || [])) {
      if (!a.builderId) a.builderId = 'takanawa';
      if (!a.certId) a.certId = 'none';
    }
  },

  // 大口テナント（tenants.js）とエリアマネジメント（area.js）を足した。
  // 入れ物が無い古いセーブでも落ちないようにする。
  // **既存の物件に契約をでっち上げないこと。** 契約していない床の賃料が
  // いきなり固定されて、賃料改定が効かなくなる
  g => {
    if (!Array.isArray(g.tenancies)) g.tenancies = [];
    if (!Array.isArray(g.leads)) g.leads = [];
    if (!Array.isArray(g.areas)) g.areas = [];
    for (const a of g.assets || []) {
      if (typeof a.anchorShare !== 'number') a.anchorShare = 0;
      if (typeof a.anchorRent !== 'number') a.anchorRent = 0;
    }
  },

  // 部の下に課を置いた。課の無い社員には、その部の課を配る。
  // **ID の無い社員を落とさないこと。** 課は見せ方の単位で、
  // 付いていなくても計算は回る（`affiliation()` が部だけ返す）
  g => {
    for (const s of g.staff || []) {
      if (s.team && teamById(s.team)) continue;
      const list = teamsOf(s.dept);
      if (!list.length) continue;
      // 同じ社員がいつ読んでも同じ課になるよう、IDから決める
      let h = 0;
      for (const ch of String(s.id || s.name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      s.team = list[h % list.length].id;
    }
  },

  // 給与を「全体の係数」から「役職ごとの基準額」に変えた
  g => {
    const pol = g.hrPolicy;
    if (!pol || Array.isArray(pol.rankPay)) return;
    const mul = typeof pol.salaryMul === 'number' ? pol.salaryMul : 1;
    pol.rankPay = RANKS.map(r => Math.round(r.baseSalary * mul * 10) / 10);
  },

  // 複合開発の坪単価・募集賃料・原価配分が入っていない案件を引き直す。
  // 旧版は devPlanStack がこれらを返しておらず 0 のまま保存されていた。
  // そのまま竣工すると「売上0・原価満額」の在庫と「賃料0」の資産ができる。
  g => {
    for (const pj of g.projects || []) {
      if (typeof pj.saleCostShare !== 'number') pj.saleCostShare = saleCostShareOf(pj);
      if (!pj.leaseUse && pj.plan && pj.plan.leaseUse) pj.leaseUse = pj.plan.leaseUse;
      if (pj.saleArea > 0) {
        const base = salePriceOf({ ...pj, salePrice: 0 });      // 計画から引いた単価
        if (base > 0) {
          if (!(pj.plan && pj.plan.salePrice > 0)) { pj.plan = pj.plan || {}; pj.plan.salePrice = base; }
          // 値付け画面が壊れていた時期に入った異常な安値も戻す（調整幅の下限は基準の60%）
          if (!(pj.salePrice > 0) || pj.salePrice < base * 0.55) pj.salePrice = base;
        }
      }
      if (pj.nra > 0 && !(pj.rent > 0)) {
        const r = rentOf({ ...pj, rent: 0 });
        if (r > 0) pj.rent = r;
      }
    }
  },

  // 総販売額が0の在庫を、坪単価から引き直す
  g => {
    for (const inv of g.inventory || []) {
      if (inv.totalValue > 0) continue;
      const price = inv.price > 0 ? inv.price : (inv.basePrice > 0 ? inv.basePrice : 0);
      if (price > 0 && inv.area > 0) {
        inv.price = price;
        inv.basePrice = inv.basePrice > 0 ? inv.basePrice : price;
        // すでに引き渡した分の売上は動かさず、残りぶんだけ評価し直す
        inv.totalValue = Math.round(inv.revenue + inv.area * (1 - (inv.soldRatio || 0)) * price);
      }
    }
  },

  // 賃料が0／未設定の保有資産に相場の賃料を入れ、相場との位置（rentIndex）を持たせる
  g => {
    for (const a of g.assets || []) {
      const raw = Math.max(1, marketRentRaw(g, a));
      if (!(a.rent > 0)) a.rent = Math.round(raw);
      if (!(a.rentIndex > 0)) a.rentIndex = clamp(a.rent / raw, 0.4, 3.5);
      // 相場も新しい基準で引き直す。そうしないと読み込み直後だけ市場比が狂って見える
      a.marketRent = Math.round(raw * a.rentIndex);
    }
  },

  // 建設費指数が片道で膨らんでいたセーブを、いまの落ち着きどころまで戻す。
  // 旧版の建設費指数には下がる項が無く、長く遊ぶと価格指数から大きく乖離して
  // どの用途でも残余法がマイナスになっていた。
  // 平均回帰に任せると2年ほどかかるので、読み込み時に一度だけ寄せる
  g => {
    const m = g.market;
    if (!m || !(m.costIdx > 0)) return;
    const eq = costEquilibrium(g);
    if (m.costIdx > eq * 1.12) m.costIdx = Math.round(eq * 1.06 * 1000) / 1000;
  },

  // 建設費指数の落ち着きどころの式が変わったときに、
  // いまの水準が新しい目標から離れすぎていたら寄せ直す。
  // 好況の資材高を片側だけ取っていた頃のセーブは、建設費が6%ほど高い位置にいる
  g => {
    const m = g.market;
    if (!m || !(m.costIdx > 0)) return;
    const eq = costEquilibrium(g);
    if (m.costIdx > eq * 1.06) m.costIdx = Math.round(eq * 1.03 * 1000) / 1000;
  },

  // 人口・株主総会・労働組合を後から足す。
  // 人口は区画から逆算して置く（地区を足したぶんも作られる）
  g => {
    ensurePopulation(g);
    const c = g.company;
    if (c) {
      if (typeof c.payout !== 'number') c.payout = 0.22;
      if (typeof c.activistShare !== 'number') c.activistShare = 0.06;
      if (typeof c.mtgLoss !== 'number') c.mtgLoss = 0;
      if (typeof c.outsideDirectors !== 'number') c.outsideDirectors = 0;
    }
    if (!Array.isArray(g.meetings)) g.meetings = [];
    if (!Array.isArray(g.agenda)) g.agenda = [];
    if (!Array.isArray(g.bonuses)) g.bonuses = [];
    if (!Array.isArray(g.jvOffers)) g.jvOffers = [];
    if (!Array.isArray(g.standing)) g.standing = [];
    if (!Array.isArray(g.assemblies)) g.assemblies = [];
    if (!g.relations || typeof g.relations !== 'object') g.relations = {};
    if (!g.union || typeof g.union !== 'object') g.union = { formed: false, disputes: 0, history: [] };
    if (!Array.isArray(g.union.history)) g.union.history = [];
  },

  // 地盤（創業の地）と、売上に応じた解禁を後から足す。
  // 地盤が決まっていないセーブは、いちばん多く区画を持っている地区を地盤とみなす
  g => {
    if (!g.company) return;
    if (!g.company.home) {
      const n = {};
      for (const c of g.cells || []) if (isOwnedCell(c) && c.d) n[c.d] = (n[c.d] || 0) + 1;
      for (const a of g.assets || []) if (a.district) n[a.district] = (n[a.district] || 0) + 2;
      const top = Object.entries(n).sort((x, y) => y[1] - x[1])[0];
      g.company.home = top ? top[0] : 'W';
    }
    // すでに使っている機能は、売上が段階に届いていなくても取り上げない
    grantExisting(g);
  },

  // 競合各社の地盤・平均年収・平均年齢・勤続年数を定義から引き直す。
  // 以前は配列をひな型の先頭だけで埋めていたため、
  // 読み込んだセーブでは全社が1社目（四井不動産）と同じ値になっていた
  g => {
    for (const rv of g.rivals || []) {
      const def = RIVAL_DEFS.find(d => d.id === rv.id);
      if (!def) continue;
      rv.home = def.home;
      rv.payBase = def.avgPay;
      rv.payMargin = def.op / Math.max(1, def.rev);
      // 創業時からの伸びを年収に反映する（賞与で振れるぶんは次の決算から）
      const grow = Math.min(2.2, Math.max(0.6, (rv.rev || def.rev) / def.rev));
      rv.avgPay = Math.round(def.avgPay * Math.pow(grow, 0.45) * 10) / 10;
      rv.avgAge = def.avgAge;
      rv.avgTenure = def.avgTenure;
      // 過去の推移に年収は残っていない。
      // ここで埋めると「ずっと横ばい」の折れ線になってしまうので、
      // 次の決算から本物の値だけを積む
    }
  },

  // 社長をプレイヤー本人にした。
  // 旧セーブでは架空の社員が社長の席に座っているので、その人を取締役に下ろし、
  // 名前を社長（プレイヤー）として引き継ぐ
  g => {
    if (!g.company) return;
    const sitting = (g.staff || []).filter(s => s.rank >= CEO_RANK);
    if (!g.company.ceo) {
      const top = sitting[0];
      g.company.ceo = {
        name: (top && top.name) || '社長',
        age: (top && top.age) || 46,
        since: g.company.founded || 2026,
      };
    }
    for (const s of sitting) {
      s.rank = TOP_STAFF_RANK;
      s.note = s.note || '創業メンバー';
    }
    if (!Array.isArray(g.hrPolicy.rankNames)) g.hrPolicy.rankNames = defaultRankNames();
    // 役員には管掌部門の枠を持たせる
    for (const s of g.staff || []) {
      if (!Array.isArray(s.oversee)) s.oversee = [];
    }
  },

  // 労働時間・サーベイ・表彰・災害・鉄道・IR を後から足す
  g => {
    g.hrPolicy = g.hrPolicy || {};
    if (!g.hrPolicy.work) g.hrPolicy.work = {};
    for (const k of ['surveys', 'awards', 'disasters', 'rails', 'postings', 'ratingHistory', 'planHistory']) {
      if (!Array.isArray(g[k])) g[k] = [];
    }
    if (g.ratingReport === undefined) g.ratingReport = null;
    const c = g.company || {};
    if (typeof c.irTrust !== 'number') c.irTrust = 0;
    if (typeof c.irPrice !== 'number') c.irPrice = 0;
    if (typeof c.irLastWeek !== 'number') c.irLastWeek = -1;
    // 既存の保有物件に耐震性能と延床を持たせる。
    // 築年から逆算するので、古い物件ほど弱い
    for (const a of g.assets || []) {
      if (typeof a.seismic !== 'number') {
        a.seismic = Math.max(0.55, Math.min(1, 1 - Math.max(0, (a.age || 0) - 12) * 0.012));
      }
      if (typeof a.damage !== 'number') a.damage = 0;
      if (!(a.gfa > 0)) a.gfa = Math.round((a.nra || 0) / 0.62);
      if (!(a.floors > 0)) a.floors = Math.max(1, Math.round((a.gfa || 1000) / 900));
    }
    for (const inv of g.inventory || []) {
      if (!(inv.gfa > 0)) inv.gfa = Math.round((inv.area || 0) / 0.72);
      if (!(inv.floors > 0)) inv.floors = Math.max(1, Math.round((inv.gfa || 1000) / 900));
    }
  },
];

/** 読み込んだ状態を、いまのゲームで動く形に整える。壊れていれば null */
export function migrate(g) {
  if (!g || !Array.isArray(g.cells) || !g.cells.length || !g.company) return null;
  try {
    for (const step of STEPS) step(g);
    const tpl = template();
    remapCells(g, tpl);
    fill(g, tpl, 0, SKIP_TOP);
    // 週から年月を引き直す（カレンダーの決め方が変わっても破綻しない）
    if (typeof g.week === 'number') syncCalendar(g);
    // 持ち越さない一時データ
    g.pendingReport = null;
    delete g.quarterNews;
    delete g.candidates;
    // 続きから始めたときにIDがぶつからないようにする
    syncUid(g);
    return g;
  } catch (e) {
    return null;
  }
}

/**
 * 区画をいまの地図に合わせる。
 * 区画IDは `p<x>_<y>` なので、位置が同じものどうしを突き合わせられる。
 * 地図を広げても、元からあった場所の所有者・建物・進行中の案件はそのまま残る。
 */
function remapCells(g, tpl) {
  // 数が同じなら並びも同じ。そのまま項目だけ補う
  // （1つのひな型でまとめて埋めると、道路や海に敷地面積が付いてしまうので位置ごとに見る）
  if (g.cells.length === tpl.cells.length) {
    for (let i = 0; i < g.cells.length; i++) {
      if (isObj(g.cells[i]) && isObj(tpl.cells[i])) fill(g.cells[i], tpl.cells[i]);
    }
    return;
  }
  // 数が変わった＝地図を広げた。IDで突き合わせて、合う区画は古いものを使う
  const byId = new Map();
  for (const c of g.cells) if (isObj(c) && c.id) byId.set(c.id, c);
  let kept = 0;
  g.cells = tpl.cells.map(nc => {
    const oc = byId.get(nc.id);
    // 地形と地区が一致するときだけ引き継ぐ。変わっていたら新しい区画にする
    if (oc && oc.terrain === nc.terrain && (oc.d ?? null) === (nc.d ?? null)) {
      fill(oc, nc);
      kept++;
      return oc;
    }
    return clone(nc);
  });
  g.mapGrew = { keptCells: kept, totalCells: g.cells.length };
}

// ------------------------------------------------------------
//  読み書き
// ------------------------------------------------------------
function rawRead(slot) {
  let raw = null;
  try { raw = localStorage.getItem(KEY(slot)); } catch (e) { return null; }
  // 見つからなければ、別の版のキーで保存されていないか探す（キーを変えても拾えるように）
  if (!raw) raw = scanLegacy(slot);
  if (!raw) return null;
  try {
    const obj = JSON.parse(decompress(raw));
    const g = obj && obj.g ? obj.g : obj;
    return g && g.cells ? g : null;
  } catch (e) { return null; }
}

/** skyline_v◯_<slot> という形のキーを総なめして、いちばん新しいものを返す */
function scanLegacy(slot) {
  let best = null, bestAt = -1;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === KEY(slot)) continue;
      if (!new RegExp(`^skyline_v\\d+_${slot}$`).test(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let at = 0;
      try { at = JSON.parse(decompress(raw)).savedAt || 0; } catch (e) { /* noop */ }
      if (at >= bestAt) { bestAt = at; best = raw; }
    }
  } catch (e) { return null; }
  return best;
}

/** スロットの一覧（空きスロットは null）。メタが壊れていれば中身から作り直す */
export function listSaves() {
  const meta = readMeta();
  let dirty = false;
  const out = SLOTS.map(id => {
    let m = meta[id] || null;
    if (!m) {
      const g = rawRead(id);
      if (g) { m = metaOf(g); meta[id] = m; dirty = true; }
    }
    return { id, label: SLOT_LABEL[id], meta: m };
  });
  if (dirty) writeMeta(meta);
  return out;
}

/** オートセーブの1つ前（復旧用）。無ければ null */
export function backupSave() {
  const meta = readMeta();
  let m = meta[BACKUP] || null;
  if (!m) {
    const g = rawRead(BACKUP);
    if (!g) return null;
    m = metaOf(g); meta[BACKUP] = m; writeMeta(meta);
  }
  return { id: BACKUP, label: SLOT_LABEL[BACKUP], meta: m };
}

/**
 * 保存する。戻り値は成否とメッセージ。
 *
 * localStorage は1オリジンあたり 5MB 前後しか使えない。
 * 長く遊ぶと素のJSONは 2MB を超え、オート＋退避＋手動3つで必ず溢れる。
 * **必ず `compress()` を通してから書くこと。** だいたい 1/12 になる。
 */
export function saveTo(slot, g) {
  const isFull = e => /quota|exceeded|storage/i.test(String((e && (e.name + ' ' + e.message)) || ''));
  let text = '';
  try {
    text = compress(serialize(g));
  } catch (e) {
    return { ok: false, message: 'セーブデータを作れなかった。' };
  }

  // オートセーブは上書きする前に1つ前を退避する。
  // 万一おかしな状態が自動保存されても、直前まで戻れるようにするため。
  if (slot === 'auto') {
    try {
      const prev = localStorage.getItem(KEY('auto'));
      if (prev) {
        localStorage.setItem(KEY(BACKUP), prev);
        const meta0 = readMeta();
        if (meta0.auto) { meta0[BACKUP] = meta0.auto; writeMeta(meta0); }
      }
    } catch (e) { /* 退避できなくても本体の保存は続ける */ }
  }

  // 書けるまで、捨ててよいものから順に手放す。
  // **いきなり諦めないこと。** 昔のまま圧縮されていないセーブが1つ残っているだけで
  // 空きを食い潰していることがあり、それを退かせば入る。
  const giveUp = [
    null,
    () => localStorage.removeItem(KEY(BACKUP)),       // 1つ前の自動セーブ
    () => slot !== 'auto' && localStorage.removeItem(KEY('auto')),
    () => dropOtherOrigins(),                          // このゲーム以外の置き土産
  ];
  let freed = '';
  for (let i = 0; i < giveUp.length; i++) {
    try {
      if (giveUp[i]) {
        const note = giveUp[i]();
        if (note === false) continue;
        freed = i === 1 ? '空きが足りないので、ひとつ前の自動セーブを消した'
          : i === 2 ? '空きが足りないので、古い自動セーブを消した'
            : '空きが足りないので、使っていない保存データを消した';
      }
      localStorage.setItem(KEY(slot), text);
      const meta = readMeta();
      meta[slot] = metaOf(g);
      if (i >= 1) delete meta[BACKUP];
      if (i >= 2 && slot !== 'auto') delete meta.auto;
      writeMeta(meta);
      return { ok: true, size: text.length, note: freed || undefined };
    } catch (e) {
      if (!isFull(e)) {
        return { ok: false, message: 'この環境では保存できない（プライベートモードの可能性がある）。' };
      }
    }
  }
  return {
    ok: false,
    message: '保存領域が足りない。不要なスロットを削除するか、ファイルに書き出すこと。',
  };
}

/**
 * このゲームが使っていない `skyline_` のキーを片づける。
 * 昔の版のキー（`skyline_v1_` など）が残っていることがある。
 * **いま使っているキーには触らないこと。**
 */
function dropOtherOrigins() {
  const keep = new Set([META, ...SLOTS.map(KEY), KEY(BACKUP)]);
  const doomed = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('skyline_') && !keep.has(k)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch (e) { /* noop */ }
  return doomed.length ? true : false;
}

/** 読み込む。古いセーブは自動で今の形に直す */
export function loadFrom(slot) {
  return migrate(rawRead(slot));
}

export function deleteSlot(slot) {
  try {
    localStorage.removeItem(KEY(slot));
    const meta = readMeta();
    delete meta[slot];
    writeMeta(meta);
    return true;
  } catch (e) { return false; }
}

/** 直近のセーブ（オート優先、なければ最新の手動） */
export function latestSave() {
  const list = listSaves().filter(s => s.meta);
  if (!list.length) return null;
  list.sort((a, b) => (b.meta.savedAt || 0) - (a.meta.savedAt || 0));
  return list[0];
}

/** 書き出し用のテキスト（コピーして保管できる） */
export function exportText(g) { return serialize(g); }

/**
 * 書き出すファイル名。
 * 日本語を含めるとブラウザによっては名前が捨てられるので、英数字だけにする。
 */
export function exportName(g) {
  const p = n => String(n).padStart(2, '0');
  return `skyline-${g.year}-${p(g.month)}-w${g.weekOfMonth}.json`;
}

/** 貼り付けたテキスト／読み込んだファイルから復元する */
export function importText(text) {
  try {
    const obj = JSON.parse(decompress(String(text).trim()));
    return migrate(obj && obj.g ? obj.g : obj);
  } catch (e) { return null; }
}

/**
 * すでに保存されているのに圧縮されていないものを、圧縮して置き直す。
 * 起動時に1回だけ呼ぶ。
 *
 * **中身を解釈し直さないこと。** 文字列のまま縮めて書き戻す。
 * `migrate()` を通すと、古いセーブがいまの形に書き換わってしまう。
 */
export function compactStorage() {
  let saved = 0;
  for (const slot of SLOTS.concat(BACKUP)) {
    let raw = null;
    try { raw = localStorage.getItem(KEY(slot)); } catch (e) { continue; }
    if (!raw || raw.startsWith(MARK)) continue;
    try {
      const packed = compress(raw);
      if (packed.length >= raw.length) continue;      // 縮まないなら触らない
      localStorage.setItem(KEY(slot), packed);
      saved += raw.length - packed.length;
    } catch (e) { /* 1つ失敗しても残りは続ける */ }
  }
  return Math.round(saved / 1024);
}

/**
 * 保存データの合計サイズ（KB）。
 * **文字数をそのままKBにしないこと。** localStorage は1文字を2バイトで数える。
 * 半分の数字を見せていると、上限に近いことに気づけない。
 */
export function totalSize() {
  let n = 0;
  for (const s of SLOTS.concat(BACKUP)) {
    try { n += (localStorage.getItem(KEY(s)) || '').length; } catch (e) { /* noop */ }
  }
  return Math.round(n * 2 / 1024);
}

/** だいたいの上限（KB）。ブラウザは 5MB 前後で切ってくる */
export const SIZE_LIMIT = 5 * 1024;

/** この環境でセーブできるか */
export function storageAvailable() {
  try {
    localStorage.setItem('skyline_probe', '1');
    localStorage.removeItem('skyline_probe');
    return true;
  } catch (e) { return false; }
}

/**
 * ブラウザに「このサイトのデータを勝手に消さないでほしい」と申請する。
 * 断られても実害はないので、結果は気にしない。
 */
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(() => false);
    }
  } catch (e) { /* noop */ }
  return Promise.resolve(false);
}
