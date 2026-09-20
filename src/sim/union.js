// ============================================================
//  労働組合と春闘
//    社員が一定数を超えると組合ができる。
//    毎年2月に要求が出され、3月に妥結するまで交渉する。
//
//    要求の中身を決めるのは会社の状態である。
//      ・利益が出ているのに賃金を据え置いていれば要求は跳ね上がる
//      ・残業が長ければ「働き方」が要求の柱になる
//      ・世間相場（競合の平均年収）から離れていれば、そこを突かれる
//
//    **要求を一方的に飲む／蹴るの二択にしないこと。**
//    回答の水準をこちらが決め、その差で妥結か決裂かが決まる。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { RANKS, rankName } from '../data/hrdata.js';
import { WEEKS_PER_YEAR } from '../core/time.js';
import { ttm } from './finance.js';
import { workload } from './workload.js';
import { orgPower } from './hr.js';
import { surveyNow } from './survey.js';
import { annualMonths, marketMonths } from './bonus.js';

/** 組合ができる人数 */
export const UNION_MIN_STAFF = 60;
/** 要求が出る週（2月）と、妥結の期限（3月中旬） */
export const DEMAND_WEEK = 6;
export const SETTLE_WEEKS = 6;

/** 組合が組織されているか */
export function hasUnion(g) {
  return !!(g.union && g.union.formed);
}

/** 組織率。大きい会社ほど高い */
export function densityOf(g) {
  const n = (g.staff || []).filter(s => !s.subsidiary).length;
  if (n < UNION_MIN_STAFF) return 0;
  return clamp01(0.42 + Math.log10(Math.max(1, n / UNION_MIN_STAFF)) * 0.34);
}

/** 社員の平均年収（百万円）。社長は含めない */
export function avgPay(g) {
  const st = (g.staff || []).filter(s => !s.subsidiary);
  if (!st.length) return 0;
  const rp = g.hrPolicy.rankPay || [];
  return st.reduce((a, s) => a + (rp[s.rank] ?? RANKS[s.rank].baseSalary), 0) / st.length;
}

/** 世間相場（競合8社の平均年収の中央値） */
export function marketPay(g) {
  const v = (g.rivals || []).map(r => r.pay).filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return avgPay(g);
  return v[Math.floor(v.length / 2)];
}

/**
 * 春闘の要求を組む。
 * 返すのは要求のベースアップ率（%）と、要求の理由。
 */
export function demandOf(g) {
  const mine = avgPay(g);
  const mkt = marketPay(g);
  const t = ttm(g);
  const margin = t.revenue > 0 ? t.op / t.revenue : 0;
  const wl = workload(g, orgPower(g));
  const ot = wl.total.overtime;
  const sv = surveyNow(g);

  const reasons = [];
  // 1) 世間相場との差。下回っていれば、そのぶんを要求に乗せる
  const gap = mkt > 0 ? (mkt - mine) / mkt : 0;
  let base = 1.4 + clamp(gap, -0.06, 0.22) * 18;
  if (gap > 0.04) reasons.push({ k: 'market', text: `同業他社の平均年収（${mkt.toFixed(1)}百万円）を下回っている` });

  // 2) 会社の儲け。利益率が高い年は分配を求められる
  base += clamp((margin - 0.08) * 16, -1.2, 3.0);
  if (margin > 0.14) reasons.push({ k: 'profit', text: `営業利益率${(margin * 100).toFixed(1)}%の好業績が続いている` });
  if (margin < 0.02) reasons.push({ k: 'bad', text: '業績が振るわず、組合も大きくは踏み込めない' });

  // 3) 物価。価格指数が上がった年は実質賃金が目減りする
  base += clamp((g.market.priceIdx - 1) * 2.4, -1.0, 2.4);

  // 3b) 賞与。年間の支給月数が世間より薄ければ、そのぶんベアで取りにくる
  const bm = annualMonths(g), bmkt = marketMonths(g) * 2;
  if (bm > 0 || (g.bonuses || []).length) {
    base += clamp((bmkt - bm) * 0.45, -1.2, 2.2);
    if (bm < bmkt - 0.8) reasons.push({ k: 'bonus', text: `年間の賞与が${bm.toFixed(1)}ヶ月にとどまり、世間水準（${bmkt.toFixed(1)}ヶ月）を下回っている` });
  }

  // 4) 働き方。残業が長い年は賃上げより時短を求める
  const wantHours = ot >= 45;
  if (wantHours) reasons.push({ k: 'hours', text: `全社平均の残業が月${ot.toFixed(0)}時間に達している` });
  if (sv.total < 55) reasons.push({ k: 'survey', text: `エンゲージメントスコアが${sv.total.toFixed(0)}点まで落ちている` });

  return {
    base: Math.round(clamp(base, 0.4, 9.0) * 10) / 10,     // 要求ベア（%）
    wantHours,
    reasons,
    mine, mkt, margin, ot, survey: sv.total,
    density: densityOf(g),
  };
}

/**
 * 会社回答に対する組合の受け止め。
 * 0 = 到底のめない ～ 1 = 満額回答
 */
export function acceptanceOf(dem, answer) {
  const ratio = dem.base > 0 ? answer.raise / dem.base : 1;
  let a = clamp01(ratio * 0.92);
  if (dem.wantHours) a += answer.hours ? 0.16 : -0.14;   // 時短の約束
  if (answer.bonus) a += 0.08;                           // 一時金の上積み
  return clamp01(a);
}

/** 春闘を始める（2月） */
export function openRound(g, news) {
  if (!hasUnion(g)) return null;
  const dem = demandOf(g);
  g.union.round = {
    year: g.year, week: g.week, deadline: g.week + SETTLE_WEEKS,
    demand: dem, answer: null, result: null,
  };
  news && news.push({
    icon: '📣', type: 'hr', major: true,
    text: `労働組合が春季交渉の要求書を提出した。ベースアップ ${dem.base.toFixed(1)}%`
      + (dem.wantHours ? '、あわせて時間外労働の削減を求めている。' : '。'),
  });
  return g.union.round;
}

/**
 * 会社回答を出して妥結させる。
 * answer = { raise（%）, hours（時短に踏み込むか）, bonus（一時金を積むか） }
 */
export function answerRound(g, answer, news) {
  const r = g.union && g.union.round;
  if (!r || r.result) return { err: '交渉が開かれていない' };
  const dem = r.demand;
  const acc = acceptanceOf(dem, answer);
  r.answer = answer;

  const staff = (g.staff || []).filter(s => !s.subsidiary);
  const dens = dem.density;

  if (acc >= 0.62) {
    // 妥結。賃金表を引き上げる
    applyRaise(g, answer.raise);
    if (answer.hours) g.hrPolicy.work = { ...(g.hrPolicy.work || {}), flex: true, outsource: true };
    for (const s of staff) {
      s.morale = clamp01(s.morale + 0.06 + acc * 0.10);
      s.loyalty = clamp01(s.loyalty + 0.04 + acc * 0.06);
    }
    r.result = { ok: true, acc, kind: acc >= 0.95 ? 'full' : 'settle' };
    news && news.push({
      icon: '🤝', type: 'hr', major: true,
      text: `春季交渉が妥結した。ベースアップ ${answer.raise.toFixed(1)}%（要求 ${dem.base.toFixed(1)}%）。`
        + (answer.hours ? '時間外労働の削減にも踏み込んだ。' : ''),
    });
  } else if (acc >= 0.34) {
    // 不満を残したまま妥結。士気が落ちる
    applyRaise(g, answer.raise);
    for (const s of staff) {
      s.morale = clamp01(s.morale - 0.06 * dens);
      s.loyalty = clamp01(s.loyalty - 0.05 * dens);
    }
    r.result = { ok: true, acc, kind: 'grudging' };
    news && news.push({
      icon: '😐', type: 'hr', major: true,
      text: `春季交渉は ${answer.raise.toFixed(1)}% で決着したが、組合は不満を表明している（要求 ${dem.base.toFixed(1)}%）。`,
    });
  } else {
    // 決裂。士気が大きく落ち、離職が増える
    applyRaise(g, answer.raise);
    for (const s of staff) {
      s.morale = clamp01(s.morale - 0.18 * dens);
      s.loyalty = clamp01(s.loyalty - 0.14 * dens);
    }
    g.union.disputes = (g.union.disputes || 0) + 1;
    g.company.brand = Math.max(0, g.company.brand - 1.2);
    r.result = { ok: false, acc, kind: 'break' };
    news && news.push({
      icon: '⚡', type: 'hr', major: true,
      text: `春季交渉が決裂した。回答 ${answer.raise.toFixed(1)}% に対し、組合は要求 ${dem.base.toFixed(1)}% を取り下げていない。`
        + '職場の空気が悪くなり、退職者が増える見込みである。',
    });
  }
  g.union.history = g.union.history || [];
  g.union.history.push({
    year: g.year, demand: dem.base, answer: answer.raise,
    hours: !!answer.hours, acc: Math.round(acc * 100) / 100, kind: r.result.kind,
  });
  if (g.union.history.length > 40) g.union.history.shift();
  return r.result;
}

/** 賃金表を一律に引き上げる */
function applyRaise(g, pct) {
  const k = 1 + pct / 100;
  g.hrPolicy.rankPay = (g.hrPolicy.rankPay || []).map(v => Math.round(v * k * 10) / 10);
}

/**
 * 毎週の処理。
 * 組合の結成、要求の提出、回答しないまま期限が来た場合の扱い。
 */
export function stepUnion(g, rng, news) {
  const staff = (g.staff || []).filter(s => !s.subsidiary);
  g.union = g.union || { formed: false, disputes: 0, history: [] };

  // 組合の結成。人数が増え、士気が低いか残業が長い年に立ち上がる
  if (!g.union.formed && staff.length >= UNION_MIN_STAFF) {
    const wl = workload(g, orgPower(g));
    const morale = staff.reduce((a, s) => a + s.morale, 0) / staff.length;
    const p = clamp01(0.004 + (0.62 - morale) * 0.05 + Math.max(0, wl.total.overtime - 35) * 0.0014);
    if (rng.chance(p)) {
      g.union.formed = true;
      g.union.since = g.year;
      news && news.push({
        icon: '🧑‍🤝‍🧑', type: 'hr', major: true,
        text: `社内に労働組合が結成された（組織率 ${(densityOf(g) * 100).toFixed(0)}%）。`
          + '以後、毎年2月に春季交渉の要求が出される。',
      });
    }
    return null;
  }
  if (!g.union.formed) return null;

  const r = g.union.round;
  // 要求の提出。
  // **`=== DEMAND_WEEK` で判定しないこと。** 4週まとめて進めると飛び越える
  if ((!r || r.year < g.year) && g.weekOfYear >= DEMAND_WEEK) return openRound(g, news);
  // 期限切れ：回答しないのは「ゼロ回答」と同じ
  if (r && !r.result && g.week >= r.deadline) {
    answerRound(g, { raise: 0, hours: false, bonus: false }, news);
  }
  return null;
}

/** 決裂を引きずっているあいだの離職の上乗せ */
export function unrestMul(g) {
  const r = g.union && g.union.round;
  if (!r || !r.result || r.result.ok) return 1;
  const weeks = g.week - r.week;
  if (weeks > WEEKS_PER_YEAR / 2) return 1;      // 半年で収まる
  return 1 + 0.55 * densityOf(g) * (1 - weeks / (WEEKS_PER_YEAR / 2));
}
