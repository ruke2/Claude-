// ============================================================
//  セーブ／ロード
//    localStorage に4つのスロット（オート＋手動3つ）を持つ
// ============================================================
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
export const SLOT_LABEL = { auto: 'オートセーブ', slot1: 'スロット 1', slot2: 'スロット 2', slot3: 'スロット 3' };
const KEY = k => `skyline_v3_${k}`;
const META = 'skyline_v3_meta';
export const SAVE_VERSION = 3;

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
    assets: g.assets.length, staff: g.staff.length,
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

/** スロットの一覧（空きスロットは null） */
export function listSaves() {
  const meta = readMeta();
  return SLOTS.map(id => ({ id, label: SLOT_LABEL[id], meta: meta[id] || null }));
}

/** 保存する。戻り値は成否とメッセージ */
export function saveTo(slot, g) {
  try {
    const text = serialize(g);
    localStorage.setItem(KEY(slot), text);
    const meta = readMeta();
    meta[slot] = metaOf(g);
    writeMeta(meta);
    return { ok: true, size: text.length };
  } catch (e) {
    const full = /quota|exceeded/i.test(String(e && e.message));
    return { ok: false, message: full ? '保存領域が足りない。不要なスロットを削除すること。' : '保存できなかった。' };
  }
}

/** 読み込む */
export function loadFrom(slot) {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.g || !obj.g.cells) return null;
    return obj.g;
  } catch (e) { return null; }
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

/** 貼り付けたテキストから復元する */
export function importText(text) {
  try {
    const obj = JSON.parse(text.trim());
    const g = obj && obj.g ? obj.g : obj;
    if (!g || !g.cells || !g.cells.length) return null;
    return g;
  } catch (e) { return null; }
}

/** 保存データの合計サイズ（KB） */
export function totalSize() {
  let n = 0;
  for (const s of SLOTS) {
    try { n += (localStorage.getItem(KEY(s)) || '').length; } catch (e) { /* noop */ }
  }
  return Math.round(n / 1024);
}
