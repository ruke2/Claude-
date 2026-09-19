// ============================================================
//  表示フォーマット
//  ゲーム内部の金額単位はすべて「百万円」で保持する
// ============================================================

/** 百万円 → 億円表記 */
export function money(mm, opt = {}) {
  const { sign = false, unit = true } = opt;
  if (mm === undefined || mm === null || Number.isNaN(mm)) return '—';
  const abs = Math.abs(mm);
  if (abs < 0.5) return unit ? '0億円' : '0';
  const s = mm < 0 ? '△' : (sign && mm > 0 ? '+' : '');
  let v, u;
  if (abs >= 1000000) { v = (abs / 1000000).toFixed(2); u = '兆円'; }
  else if (abs >= 10000) { v = Math.round(abs / 100).toLocaleString('ja-JP'); u = '億円'; }
  else if (abs >= 100) { v = (abs / 100).toFixed(1); u = '億円'; }
  else { v = Math.round(abs).toLocaleString('ja-JP'); u = '百万円'; }
  return s + v + (unit ? u : '');
}

/**
 * money() が選ぶ単位だけを返す。
 * 数字だけを大きく出して単位を小さく添えるとき、
 * 単位を「億円」と決め打ちすると兆円・百万円の桁で嘘になる。
 */
export function moneyUnit(mm) {
  const abs = Math.abs(mm ?? 0);
  if (!Number.isFinite(abs)) return '';
  if (abs < 0.5) return '億円';
  if (abs >= 1000000) return '兆円';
  if (abs >= 100) return '億円';
  return '百万円';
}

/** 百万円 → 数値と単位を分けたHTML（大きな数字の表示用） */
export function moneyHTML(mm) {
  const s = money(mm);
  const m = s.match(/^(△?\+?[\d,.]+)(.*)$/);
  if (!m) return s;
  return `${m[1]}<small style="font-size:.5em;margin-left:.15em;opacity:.7">${m[2]}</small>`;
}

/** 百万円 → 億円の数値のみ */
export function oku(mm) { return mm / 100; }

/** 整数カンマ区切り */
export function num(n, digits = 0) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 比率(0-1) → パーセント */
export function pct(r, digits = 1) {
  if (r === undefined || r === null || Number.isNaN(r)) return '—';
  return (r * 100).toFixed(digits) + '%';
}

/** 増減の符号つきパーセント */
export function pctDelta(r, digits = 1) {
  const s = r > 0 ? '+' : '';
  return s + (r * 100).toFixed(digits) + '%';
}

/** 万円（年収など）*/
export function man(mm) { return num(Math.round(mm * 100)) + '万円'; }

/** 増減に応じたCSSクラス */
export function dcls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }

/** 増減記号 */
export function arrow(v) { return v > 0 ? '▲' : v < 0 ? '▼' : '―'; }

/** 年Q表記 */
export function ym(year, q) { return `${year}年 Q${q}`; }

/** 四半期→季節 */
export const SEASON = ['春', '夏', '秋', '冬'];

/** 0-100 のスコアを星に */
export function stars(v, max = 100) {
  const n = Math.round((v / max) * 5);
  return '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));
}

/** HTMLエスケープ */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 値を 0..1 に丸める */
export function clamp01(v) { return Math.max(0, Math.min(1, v)); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** 線形補間 */
export function lerp(a, b, t) { return a + (b - a) * t; }
