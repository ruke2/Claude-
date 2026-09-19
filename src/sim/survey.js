// ============================================================
//  エンゲージメントサーベイ — 年1回、社員に訊く
//    数字にしないと、どこが崩れかけているのか社長には見えない。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPTS, DEPT_IDS, rankName } from '../data/hrdata.js';
import { orgPower, salaryFairness } from './hr.js';
import { workload, workEffects, OVERTIME_DANGER } from './workload.js';
import { oversightOf } from './officers.js';
import { cultureEffects } from './culture.js';
import { avgAbility } from '../core/state.js';

/** 設問の柱。合計で100点になる */
export const SURVEY_AXES = [
  { id: 'motivation', name: '仕事のやりがい', w: 0.26, desc: '任されている仕事に手応えがあるか' },
  { id: 'pay', name: '報酬への納得感', w: 0.20, desc: '働きに見合った報酬が支払われているか' },
  { id: 'hours', name: '働き方・労働時間', w: 0.20, desc: '無理のない時間で仕事が終わっているか' },
  { id: 'lead', name: '上司・経営への信頼', w: 0.16, desc: '方針が示され、見てもらえていると感じるか' },
  { id: 'growth', name: '成長の実感', w: 0.10, desc: '力がついている手応えがあるか' },
  { id: 'culture', name: '職場の雰囲気', w: 0.08, desc: '働く場として居心地がよいか' },
];

const score100 = v => Math.round(clamp01(v) * 1000) / 10;

/** 残業時間を点数に直す（月45時間で50点、0時間で100点） */
function hoursScore(ot) {
  if (ot <= 10) return 1.0;
  if (ot <= 25) return 0.88;
  if (ot <= 45) return 0.66;
  if (ot <= OVERTIME_DANGER) return 0.42;
  if (ot <= 80) return 0.22;
  return 0.08;
}

/**
 * いまの状態でサーベイを取ったらどうなるか。
 * 実施していなくても常に計算できる（画面のプレビューに使う）。
 */
export function surveyNow(g) {
  const power = orgPower(g);
  const wl = workload(g, power);
  const ov = oversightOf(g);
  const ce = cultureEffects(g);
  const we = workEffects(g);

  const depts = {};
  for (const d of DEPT_IDS) {
    const list = g.staff.filter(s => s.dept === d && !s.subsidiary);
    if (!list.length) { depts[d] = null; continue; }
    const n = list.length;
    const morale = list.reduce((a, s) => a + s.morale, 0) / n;
    const fair = list.reduce((a, s) => a + salaryFairness(g, s), 0) / n;
    const loyalty = list.reduce((a, s) => a + s.loyalty, 0) / n;
    const room = list.reduce((a, s) => a + Math.max(0, s.potential - avgAbility(s)), 0) / n;
    const ot = wl[d].overtime;
    const hasOfficer = !!ov[d].by;

    const axes = {
      motivation: clamp01(morale * 0.8 + (hasOfficer ? 0.08 : 0) + 0.08),
      pay: clamp01(0.20 + (fair - 0.85) * 1.55),
      hours: clamp01(hoursScore(ot) + we.surveyBonus / 100),
      lead: clamp01(0.32 + (hasOfficer ? 0.26 : 0) + loyalty * 0.30 + (g.midPlan ? 0.08 : 0)),
      growth: clamp01(0.34 + (g.hrPolicy.programs.training ? 0.18 : 0) + clamp(room / 46, 0, 0.34)
        + ce.growthMul * 0.08),
      culture: clamp01(0.36 + morale * 0.30 + (g.hrPolicy.programs.welfare ? 0.14 : 0) + ce.appealShift * 1.2),
    };
    const total = SURVEY_AXES.reduce((a, x) => a + axes[x.id] * x.w, 0);
    depts[d] = {
      id: d, n, axes, score: score100(total),
      overtime: ot, officer: ov[d].by ? ov[d].by.name : null,
      morale: score100(morale), fair,
      weakest: SURVEY_AXES.slice().sort((a, b) => axes[a.id] - axes[b.id])[0],
    };
  }

  const live = DEPT_IDS.map(d => depts[d]).filter(Boolean);
  const head = live.reduce((a, x) => a + x.n, 0);
  const score = head ? live.reduce((a, x) => a + x.score * x.n, 0) / head : 0;
  const axes = {};
  for (const x of SURVEY_AXES) {
    axes[x.id] = head ? live.reduce((a, d) => a + d.axes[x.id] * d.n, 0) / head : 0;
  }
  return {
    score: Math.round(score * 10) / 10,
    axes, depts, headcount: head,
    worst: live.slice().sort((a, b) => a.score - b.score)[0] || null,
    best: live.slice().sort((a, b) => b.score - a.score)[0] || null,
    weakest: SURVEY_AXES.slice().sort((a, b) => axes[a.id] - axes[b.id])[0],
  };
}

/** 社員の生の声。点数だけでは伝わらないことを一行で出す */
export function voices(g, res) {
  const out = [];
  const used = {};
  const D = d => DEPTS[d].name;
  // 同じ種類の声ばかりにならないよう、1種類につき2件までにする
  const push = (kind, d, tone, text) => {
    if ((used[kind] || 0) >= 2) return;
    used[kind] = (used[kind] || 0) + 1;
    out.push({ d, tone, text });
  };
  for (const d of DEPT_IDS) {
    const x = res.depts[d];
    if (!x) continue;
    if (x.overtime > 60) push('hours', d, 'bad', `${D(d)}：「この人数でこの案件数は回らない。誰か採ってほしい」`);
    else if (x.axes.pay < 0.35) push('pay', d, 'bad', `${D(d)}：「同業他社の友人と比べて、明らかに低い」`);
    else if (!x.officer) push('lead', d, 'warn', `${D(d)}：「誰がこの部署を見ているのか、正直わからない」`);
    else if (x.axes.growth < 0.4) push('growth', d, 'warn', `${D(d)}：「同じ仕事の繰り返しで、力がついている気がしない」`);
    else if (x.score > 76) push('good', d, 'good', `${D(d)}：「任される範囲が広く、やりがいがある」`);
  }
  if (res.score < 45) out.push({ d: null, tone: 'bad', text: '全社：「経営が何を目指しているのか、現場まで下りてきていない」' });
  if (g.midPlan) out.push({ d: null, tone: 'good', text: '全社：「中期計画の数字が示されてから、判断に迷いが減った」' });
  return out.slice(0, 6);
}

/**
 * サーベイを実施する（年1回）。
 * 結果は記録として残り、前年との比較ができるようになる。
 */
export function runSurvey(g, news) {
  const res = surveyNow(g);
  g.surveys = g.surveys || [];
  const prev = g.surveys[g.surveys.length - 1];
  const rec = {
    year: g.year, week: g.week, score: res.score, headcount: res.headcount,
    axes: { ...res.axes },
    depts: Object.fromEntries(DEPT_IDS.map(d => [d, res.depts[d] ? res.depts[d].score : null])),
    worst: res.worst ? res.worst.id : null,
    weakest: res.weakest.id,
  };
  g.surveys.push(rec);
  if (g.surveys.length > 40) g.surveys.shift();

  const d = prev ? res.score - prev.score : 0;
  const arrow = !prev ? '' : d > 1 ? `（前年比 +${d.toFixed(1)}）` : d < -1 ? `（前年比 ${d.toFixed(1)}）` : '（前年並み）';
  news && news.push({
    icon: '📝', type: 'hr', major: true,
    text: `${g.year}年のエンゲージメントサーベイを実施した。全社スコアは ${res.score.toFixed(1)} ${arrow}。`
      + (res.worst ? `いちばん低いのは${DEPTS[res.worst.id].name}（${res.worst.score.toFixed(1)}）で、${res.weakest.name}が弱い。` : ''),
  });
  return rec;
}

/** 前年のスコア（無ければ null） */
export function lastSurvey(g) {
  const list = g.surveys || [];
  return list.length ? list[list.length - 1] : null;
}
