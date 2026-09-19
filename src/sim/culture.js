// ============================================================
//  企業カルチャー — 5つの軸で会社の性格を決める
//    値は 0〜1。低い側と高い側でそれぞれ長所と短所がある
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { perWeek, WEEKS_PER_QUARTER } from '../core/time.js';

export const AXES = [
  {
    id: 'merit', name: '評価と処遇', low: '年功序列', high: '成果主義',
    lowDesc: '勤続に応じて処遇する。全体の定着は良いが、若手の抜擢は進まず、優秀な人材が物足りなさを感じる。',
    highDesc: '実績で処遇する。優秀な人材は残り、成長も速いが、伸び悩む社員は去っていく。給与の格差も広がる。',
  },
  {
    id: 'challenge', name: '事業姿勢', low: '安定志向', high: '挑戦志向',
    lowDesc: '手堅い案件を着実に積む。工事も販売も計画どおりに進みやすいが、大きな伸びは望めない。',
    highDesc: '大型案件と新しい用途に踏み込む。当たれば大きいが、工事も市況も振れ幅が大きくなる。',
  },
  {
    id: 'team', name: '仕事の単位', low: '個人主義', high: 'チーム重視',
    lowDesc: '個人の裁量が大きい。突出した人材の力が発揮されるが、組織としての底上げは弱い。',
    highDesc: '組織で成果を出す。部署全体の実行力が上がり、離職も減るが、個人の成長はやや鈍る。',
  },
  {
    id: 'speed', name: '仕事の進め方', low: '品質重視', high: 'スピード重視',
    lowDesc: '時間をかけて作り込む。工期は延びるが、原価は崩れにくく、ブランドの評判も積み上がる。',
    highDesc: '早さを優先する。工期は縮むが、手戻りと原価超過が起きやすく、評判を落とすこともある。',
  },
  {
    id: 'wlb', name: '労働環境', low: '猛烈主義', high: '働きやすさ',
    lowDesc: '長時間働いて量をこなす。処理できる案件は増えるが、士気は下がり人は辞めていく。',
    highDesc: '働きやすさを重んじる。定着と士気は高まるが、一人あたりが抱えられる仕事量は減る。',
  },
];

export const AXIS_IDS = AXES.map(a => a.id);

/** 初期のカルチャー（中庸） */
export function initCulture() {
  const c = { target: {}, changedWeek: 0, transitionCost: 0 };
  for (const a of AXIS_IDS) { c[a] = 0.5; c.target[a] = 0.5; }
  return c;
}

/** カルチャーによる各種の補正 */
export function cultureEffects(g) {
  const c = g.culture || initCulture();
  const merit = c.merit, ch = c.challenge, team = c.team, sp = c.speed, wlb = c.wlb;
  return {
    // --- 人事 ---
    growthMul: 0.88 + ch * 0.22 + (1 - wlb) * 0.16 - team * 0.06,
    leaveMul: 1.24 - wlb * 0.34 - team * 0.10,          // 離職率に掛ける係数
    meritLeave: (merit - 0.5) * 0.9,                    // 能力で離職傾向を分ける強さ
    moraleShift: (wlb - 0.5) * 0.028 + (team - 0.5) * 0.014 - Math.abs(merit - 0.5) * 0.004,
    capacityMul: 0.86 + (1 - wlb) * 0.24 + team * 0.10,
    promoteBoost: merit,                                 // 昇格の抜擢しやすさ
    payGap: 0.8 + merit * 0.5,                           // 能力による給与差の広がり
    // --- 事業 ---
    speedMul: 0.88 + sp * 0.24,                          // 工期の短縮率（大きいほど速い）
    costRisk: 0.82 + sp * 0.38,                          // 原価超過・手戻りの起きやすさ
    eventSwing: 0.84 + ch * 0.34,                        // 工事・市況イベントの振れ幅
    bigDeal: 0.85 + ch * 0.32,                           // 大型案件への適性
    qualityMul: 1.12 - sp * 0.24,                        // 竣工品質（ブランド評判に効く）
    // --- 採用 ---
    appealShift: (wlb - 0.5) * 0.06 + (merit - 0.5) * 0.02,
  };
}

/** 学生・候補者の志向とカルチャーの相性（0〜1） */
export function cultureMatch(g, pref) {
  if (!pref) return 0.5;
  const c = g.culture || initCulture();
  let d = 0;
  for (const a of AXIS_IDS) d += Math.abs((c[a] ?? 0.5) - (pref[a] ?? 0.5));
  return clamp01(1 - d / AXIS_IDS.length);
}

/** 候補者の志向をランダムに作る */
export function randomPreference(rng) {
  const p = {};
  for (const a of AXIS_IDS) p[a] = clamp01(rng.normal(0.5, 0.22));
  return p;
}

/** 方針転換のコスト（社員数と変更幅に比例） */
export function changeCost(g, target) {
  const c = g.culture || initCulture();
  let d = 0;
  for (const a of AXIS_IDS) d += Math.abs((target[a] ?? c[a]) - c[a]);
  return Math.round(d * (60 + g.staff.length * 14));
}

/** 方針を変更する（すぐには変わらず、数年かけて浸透する） */
export function setCulture(g, target, news) {
  const cost = changeCost(g, target);
  g.cash -= cost;
  g.finance.quarterAcc.sga += cost;
  const c = g.culture;
  let moved = 0;
  for (const a of AXIS_IDS) {
    const v = clamp01(target[a] ?? c[a]);
    moved += Math.abs(v - c.target[a]);
    c.target[a] = v;
  }
  c.changedWeek = g.week;
  c.transitionCost = cost;
  // 急な方針転換は現場を混乱させる
  const shock = Math.min(0.12, moved * 0.06);
  for (const s of g.staff) s.morale = clamp01(s.morale - shock);
  news && news.push({
    icon: '🧭', type: 'hr', major: true,
    text: `企業文化の方針を見直した（組織変革コスト ${Math.round(cost / 100 * 10) / 10}億円）。浸透には数年かかる。`,
  });
  return cost;
}

const K_CULTURE = perWeek(0.09);

/** 毎週、現在値が目標値へ少しずつ近づく */
export function stepCulture(g, rng, news) {
  const c = g.culture;
  if (!c) { g.culture = initCulture(); return; }
  for (const a of AXIS_IDS) {
    const t = c.target[a] ?? 0.5;
    if (Math.abs(t - c[a]) < 0.002) { c[a] = t; continue; }
    c[a] += (t - c[a]) * K_CULTURE;
  }
}

/** 浸透率（0〜1）。方針と実態がどれだけ一致しているか */
export function cultureAlignment(g) {
  const c = g.culture || initCulture();
  let d = 0;
  for (const a of AXIS_IDS) d += Math.abs((c.target[a] ?? 0.5) - c[a]);
  return clamp01(1 - d / AXIS_IDS.length * 2);
}

/** 文化を一言で表すラベル */
export function cultureLabel(g) {
  const c = g.culture || initCulture();
  const parts = [];
  for (const a of AXES) {
    const v = c[a.id];
    if (v >= 0.66) parts.push(a.high);
    else if (v <= 0.34) parts.push(a.low);
  }
  return parts.length ? parts.join('・') : 'バランス型';
}
