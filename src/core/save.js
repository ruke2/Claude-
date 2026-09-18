// ============================================================
//  セーブ／ロード
//    localStorage に4つのスロット（オート＋手動3つ）と、
//    オートセーブの1つ前を保持する
//
//  ◆ 保存先のキーは絶対に変えないこと ◆
//    キーを変えると、それまでのセーブが二度と見つからなくなる。
//    データの形を変えたときは SAVE_VERSION を上げて migrate() で吸収する。
// ============================================================
import { createGame, syncUid, defaultRankPay } from './state.js';
import { RANKS } from '../data/hrdata.js';
import { salePriceOf, rentOf, saleCostShareOf } from '../sim/project.js';
import { marketRentRaw } from '../sim/valuation.js';
import { clamp } from './format.js';
import { syncCalendar } from './time.js';

const PREFIX = 'skyline_v3_';          // ← 変更禁止
const META = 'skyline_v3_meta';        // ← 変更禁止
const KEY = k => PREFIX + k;

export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
export const BACKUP = 'autoPrev';      // オートセーブの1つ前（自動で退避する）
export const SLOT_LABEL = {
  auto: 'オートセーブ', slot1: 'スロット 1', slot2: 'スロット 2', slot3: 'スロット 3',
  autoPrev: 'ひとつ前の自動セーブ',
};
export const SAVE_VERSION = 4;

/** 保存用にゲーム状態を文字列化する（一時データは除く） */
export function serialize(g) {
  const { pendingReport, quarterNews, candidates, ...rest } = g;
  return JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), g: rest });
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
    } else if (Array.isArray(sv) && Array.isArray(target[k]) && isObj(sv[0])) {
      // 配列の中身にも、新しく増えた項目を足す
      for (const item of target[k]) if (isObj(item)) fill(item, sv[0], depth + 1);
    }
  }
}

const SKIP_TOP = new Set(['cells']);

/**
 * 形が変わったところを、ひな型で埋める前に手当てする。
 * 新しい版を出すたびにここへ足していく。古い順に並べること。
 */
const STEPS = [
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
    const obj = JSON.parse(raw);
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
      try { at = JSON.parse(raw).savedAt || 0; } catch (e) { /* noop */ }
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

/** 保存する。戻り値は成否とメッセージ */
export function saveTo(slot, g) {
  try {
    const text = serialize(g);
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
    localStorage.setItem(KEY(slot), text);
    const meta = readMeta();
    meta[slot] = metaOf(g);
    writeMeta(meta);
    return { ok: true, size: text.length };
  } catch (e) {
    const full = /quota|exceeded/i.test(String(e && e.message));
    // 容量が足りないときは、まず退避分を捨ててもう一度だけ試す
    if (full && slot !== BACKUP) {
      try {
        localStorage.removeItem(KEY(BACKUP));
        localStorage.setItem(KEY(slot), serialize(g));
        const meta = readMeta();
        meta[slot] = metaOf(g); delete meta[BACKUP];
        writeMeta(meta);
        return { ok: true, size: 0, note: '空き容量が足りないため、退避分を消した' };
      } catch (e2) { /* それでも駄目なら下へ */ }
    }
    return {
      ok: false,
      message: full
        ? '保存領域が足りない。不要なスロットを削除するか、ファイルに書き出すこと。'
        : 'この環境では保存できない（プライベートモードの可能性がある）。',
    };
  }
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
    const obj = JSON.parse(String(text).trim());
    return migrate(obj && obj.g ? obj.g : obj);
  } catch (e) { return null; }
}

/** 保存データの合計サイズ（KB） */
export function totalSize() {
  let n = 0;
  for (const s of SLOTS.concat(BACKUP)) {
    try { n += (localStorage.getItem(KEY(s)) || '').length; } catch (e) { /* noop */ }
  }
  return Math.round(n / 1024);
}

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
