// ============================================================
//  ゲーム内カレンダー — 1ターン = 1週
//    1年 = 52週 ／ 1四半期 = 13週
// ============================================================
export const WEEKS_PER_YEAR = 52;
export const WEEKS_PER_QUARTER = 13;
export const START_YEAR = 2026;

/** 各月の開始週（0始まり）。週数は 5,4,4 / 5,4,4 / 5,4,4 / 5,4,4 */
const MONTH_START = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
export const MONTH_WEEKS = [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4];

/** 通算週からカレンダーを求める */
export function calendar(week) {
  const y = Math.floor(week / WEEKS_PER_YEAR);
  const woy = week % WEEKS_PER_YEAR;
  let m = 0;
  for (let i = 0; i < 12; i++) if (woy >= MONTH_START[i]) m = i;
  return {
    week,
    year: START_YEAR + y,
    weekOfYear: woy,
    month: m + 1,
    weekOfMonth: woy - MONTH_START[m] + 1,
    quarter: Math.floor(woy / WEEKS_PER_QUARTER) + 1,
    weekOfQuarter: woy % WEEKS_PER_QUARTER,
  };
}

/** ゲーム状態にカレンダーを書き戻す */
export function syncCalendar(g) {
  const c = calendar(g.week);
  g.year = c.year; g.month = c.month; g.weekOfMonth = c.weekOfMonth;
  g.quarter = c.quarter; g.weekOfYear = c.weekOfYear; g.weekOfQuarter = c.weekOfQuarter;
  return c;
}

/** 四半期の最終週か（この週末に決算を締める） */
export function isQuarterEnd(g) { return g.weekOfQuarter === WEEKS_PER_QUARTER - 1; }
/** 年度の最初の週か */
export function isYearStart(g) { return g.weekOfYear === 0; }
/** 4月第1週か（新卒入社） */
export function isAprilFirstWeek(g) { return g.weekOfYear === MONTH_START[3]; }

/** 表示用 */
export function dateLabel(g) { return `${g.year}年 ${g.month}月 第${g.weekOfMonth}週目`; }
/** 通算週から日付ラベルを作る */
export function dateLabelOf(week) {
  const c = calendar(week);
  return `${c.year}年 ${c.month}月 第${c.weekOfMonth}週目`;
}
/** 年月のみ */
export function monthLabelOf(week) {
  const c = calendar(week);
  return `${c.year}年 ${c.month}月`;
}
export function shortDate(g) { return `${String(g.year).slice(2)}/${String(g.month).padStart(2, '0')}·W${g.weekOfMonth}`; }

/** 週数を「◯年◯ヶ月」「◯週」の読みやすい表記に */
export function weeksLabel(w) {
  if (w <= 0) return '—';
  if (w < 8) return `${w}週`;
  const months = Math.round(w / (WEEKS_PER_YEAR / 12));
  if (months < 24) return `約${months}ヶ月`;
  return `約${(months / 12).toFixed(1)}年`;
}

/** 四半期あたりの変化率を週あたりに換算（漸近率） */
export function perWeek(quarterRate) {
  return 1 - Math.pow(1 - Math.min(0.999, quarterRate), 1 / WEEKS_PER_QUARTER);
}

/** 季節（描画の時間帯に使う） */
export const SEASON_OF_MONTH = ['冬', '冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬'];
