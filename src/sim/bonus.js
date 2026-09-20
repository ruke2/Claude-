// ============================================================
//  賞与（夏季・冬季）
//    年2回、支給月数を社長が決める。
//
//    目安は業績連動だが、**決めるのは社長である。**
//    自動で払うと、儲かった年に報いる／苦しい年に絞るという
//    いちばん経営らしい判断が消えてしまう。
//
//    効き目は3つ。
//      ・士気と定着（世間水準と、去年の自社との比較で決まる）
//      ・人件費（支給した期の販管費に立つ）
//      ・春闘の要求（賞与が薄い年はベアの要求が強くなる）
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { RANKS } from '../data/hrdata.js';
import { WEEKS_PER_YEAR } from '../core/time.js';
import { ttm } from './finance.js';

/** 夏季・冬季の別 */
export const SEASONS = {
  summer: { id: 'summer', name: '夏季賞与', decideWeek: 22, payWeek: 26, label: '6月に決めて7月に支給する' },
  winter: { id: 'winter', name: '冬季賞与', decideWeek: 44, payWeek: 48, label: '11月に決めて12月に支給する' },
};

/** 月数の上限・下限 */
export const MONTHS_MIN = 0;
export const MONTHS_MAX = 6.0;

/** 社員の月給の合計（百万円／月）。社長は含めない */
export function monthlyPayroll(g) {
  const st = (g.staff || []).filter(s => !s.subsidiary);
  const rp = g.hrPolicy.rankPay || [];
  // 年収は賞与を含まない「基準年収」として扱い、12で割って月給とする
  return st.reduce((a, s) => a + (rp[s.rank] ?? RANKS[s.rank].baseSalary), 0) / 12;
}

/**
 * 業績から見た支給月数の目安。
 * 営業利益が人件費の何倍出ているかで決まる。
 */
export function suggestedMonths(g) {
  const t = ttm(g);
  const payYear = monthlyPayroll(g) * 12;
  if (payYear <= 0) return 2.0;
  const ratio = t.op / payYear;                    // 営業利益 ÷ 年間人件費
  const m = 1.5 + clamp(ratio, -0.5, 6) * 0.42;
  return Math.round(clamp(m, 0.5, 5.0) * 10) / 10;
}

/** 世間水準（競合の平均年収から、賞与ぶんを逆算した目安） */
export function marketMonths(g) {
  const rivals = (g.rivals || []).map(r => r.pay).filter(x => x > 0);
  if (!rivals.length) return 2.4;
  const mkt = rivals.reduce((a, v) => a + v, 0) / rivals.length;
  const rp = g.hrPolicy.rankPay || [];
  const st = (g.staff || []).filter(s => !s.subsidiary);
  const mine = st.length ? st.reduce((a, s) => a + (rp[s.rank] ?? RANKS[s.rank].baseSalary), 0) / st.length : mkt;
  // 世間の年収のうち、基準年収を超えているぶんが賞与だとみなす
  return Math.round(clamp((mkt - mine) / Math.max(0.1, mine / 12) + 2.4, 0.5, 5.5) * 10) / 10;
}

/** 支給総額（百万円） */
export function bonusCost(g, months) {
  return Math.round(monthlyPayroll(g) * months);
}

/** 去年の同じ季節に払った月数 */
export function lastYearMonths(g, seasonId) {
  const h = (g.bonuses || []).filter(b => b.season === seasonId);
  return h.length ? h[h.length - 1].months : null;
}

/**
 * 賞与を支給する。
 * 支給額は週次の販管費ではなく、その週にまとめて立てる。
 */
export function payBonus(g, seasonId, months, news) {
  const S = SEASONS[seasonId];
  if (!S) return { err: '季節が正しくない' };
  const m = Math.round(clamp(months, MONTHS_MIN, MONTHS_MAX) * 10) / 10;
  const cost = bonusCost(g, m);
  const mkt = marketMonths(g);
  const last = lastYearMonths(g, seasonId);

  g.cash -= cost;
  if (g.finance && g.finance.quarterAcc) {
    g.finance.quarterAcc.sga += cost;
    g.finance.quarterAcc.personnel += cost;
  }

  // 世間より厚ければ喜び、薄ければ冷める。
  // 去年より下げたときの落胆は、上げたときの喜びより大きい
  const vsMkt = clamp((m - mkt) / 1.6, -1, 1);
  const vsLast = last == null ? 0 : clamp((m - last) / 1.2, -1, 1);
  const delta = vsMkt * 0.10 + (vsLast >= 0 ? vsLast * 0.05 : vsLast * 0.09);
  for (const s of (g.staff || [])) {
    if (s.subsidiary) continue;
    s.morale = clamp01(s.morale + delta);
    s.loyalty = clamp01(s.loyalty + delta * 0.6);
  }

  g.bonuses = g.bonuses || [];
  g.bonuses.push({ year: g.year, season: seasonId, months: m, cost, market: mkt, week: g.week });
  if (g.bonuses.length > 40) g.bonuses.shift();

  news && news.push({
    icon: delta >= 0.02 ? '🎁' : delta <= -0.03 ? '🧊' : '💰',
    type: 'hr', major: Math.abs(delta) > 0.05,
    text: `${S.name}を${m.toFixed(1)}ヶ月で支給した（総額 ${Math.round(cost / 100).toLocaleString()}億円、世間水準 ${mkt.toFixed(1)}ヶ月）。`
      + (delta <= -0.05 ? '社内には落胆が広がっている。' : delta >= 0.06 ? '社内の空気は明るい。' : ''),
  });
  return { months: m, cost, market: mkt, delta };
}

/** 直近1年に払った賞与の合計月数（春闘の要求に効く） */
export function annualMonths(g) {
  const cut = g.week - WEEKS_PER_YEAR;
  return (g.bonuses || []).filter(b => b.week > cut).reduce((a, b) => a + b.months, 0);
}

/** 年間の賞与見込み（表示用・百万円） */
export function bonusYearCost(g) {
  const m = annualMonths(g);
  return Math.round(monthlyPayroll(g) * (m > 0 ? m : suggestedMonths(g) * 2));
}
