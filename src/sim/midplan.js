// ============================================================
//  中期経営計画
//    社長（プレイヤー）が3〜5年の数値目標を掲げ、社内外に公表する。
//    公表した瞬間に社員の目線は揃うが、未達なら責任を問われる。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';
import { TERRAIN } from '../data/city.js';

/**
 * 掲げられる目標。
 *  get   … いまの値を返す
 *  fmt   … 画面に出す形
 *  unit  … 入力欄の単位（内部の値 = 入力値 / scale）
 *  hard  … 難易度の係数。積み上げにくい指標ほど大きい
 */
export const PLAN_METRICS = {
  revenue: {
    id: 'revenue', name: '売上高', icon: '¥', unit: '億円', scale: 100, hard: 1.0,
    desc: '直近4四半期の売上高。分譲の引き渡しが乗るので、期末に山が来る。',
    get: g => ttmOf(g, 'revenue'),
  },
  op: {
    id: 'op', name: '営業利益', icon: '📈', unit: '億円', scale: 100, hard: 1.15,
    desc: '直近4四半期の営業利益。原価と販管費を抑えないと伸びない。',
    get: g => ttmOf(g, 'op'),
  },
  opMargin: {
    id: 'opMargin', name: '営業利益率', icon: '%', unit: '%', scale: 0.01, hard: 1.3,
    desc: '売上高に対する営業利益の比率。規模を追うだけでは上がらない。',
    get: g => { const r = ttmOf(g, 'revenue'); return r > 0 ? ttmOf(g, 'op') / r : 0; },
  },
  roe: {
    id: 'roe', name: 'ROE', icon: '◎', unit: '%', scale: 0.01, hard: 1.35,
    desc: '純資産に対する当期純利益。資本を厚くするほど達成は難しくなる。',
    get: g => {
      const bs = g.finance.bs;
      return bs && bs.equity > 0 ? ttmOf(g, 'net') / bs.equity : 0;
    },
  },
  leaseNoi: {
    id: 'leaseNoi', name: '賃貸事業のNOI', icon: '▤', unit: '億円', scale: 100, hard: 1.1,
    desc: '保有している賃貸物件の年間NOIの合計。ストックをどれだけ積んだかで決まる。',
    get: g => (g.assets || []).reduce((a, x) => a + (x.noi || 0), 0),
  },
  assetCount: {
    id: 'assetCount', name: '保有物件数', icon: '🏢', unit: '件', scale: 1, hard: 1.0,
    desc: '賃貸として保有している物件の数。',
    get: g => (g.assets || []).length,
  },
  soldUnits: {
    id: 'soldUnits', name: '累計引渡戸数', icon: '🔑', unit: '戸', scale: 1, hard: 1.0,
    desc: '創業からの累計。分譲を回し続けないと積み上がらない。',
    get: g => (g.kpi && g.kpi.soldUnits) || 0,
  },
  lots: {
    id: 'lots', name: '保有区画数', icon: '◈', unit: '区画', scale: 1, hard: 1.0,
    desc: '自社が持っている土地の数。仕入れの力がそのまま出る。',
    get: g => (g.cells || []).filter(c => c.owner === 'player' && c.terrain === TERRAIN.LOT).length,
  },
  brand: {
    id: 'brand', name: '企業ブランド', icon: '◆', unit: '点', scale: 1, hard: 1.25,
    desc: '0〜100。良い物件を供給し、公共案件を取り、上場することで上がる。',
    get: g => g.company.brand,
  },
  equityRatio: {
    id: 'equityRatio', name: '自己資本比率', icon: '⚖', unit: '%', scale: 0.01, hard: 1.2,
    desc: '総資産に対する純資産。借入で規模を追うと下がる。',
    get: g => { const bs = g.finance.bs; return bs && bs.total > 0 ? bs.equity / bs.total : 0; },
  },
  staff: {
    id: 'staff', name: '従業員数', icon: '☗', unit: '名', scale: 1, hard: 0.9,
    desc: '連結の従業員数。採用と定着の両方が要る。',
    get: g => (g.staff || []).length,
  },
};
export const PLAN_METRIC_IDS = Object.keys(PLAN_METRICS);

/** 計画期間の選択肢 */
export const PLAN_SPANS = [
  { years: 3, weeks: WEEKS_PER_YEAR * 3, name: '3か年計画', reward: 1.0 },
  { years: 5, weeks: WEEKS_PER_YEAR * 5, name: '5か年計画', reward: 1.45 },
];

function ttmOf(g, key) {
  const h = (g.finance && g.finance.history) || [];
  let v = 0;
  for (const x of h.slice(-4)) v += (x.pl && x.pl[key]) || 0;
  return v;
}

/** いまの値 */
export function valueOf(g, id) {
  const m = PLAN_METRICS[id];
  return m ? m.get(g) : 0;
}

/**
 * 目標の背伸び具合（1.0 = 現状維持）。
 * これが大きいほど達成時の見返りも、未達のときの痛手も大きい。
 */
export function stretchOf(base, target, hard) {
  if (!(target > 0)) return 0;
  if (base <= 0) return clamp(1.6 * hard, 0, 4);
  return clamp((target / base - 1) * hard + 1, 0.2, 4);
}

/** 計画全体の野心度（見返りの倍率になる） */
export function ambitionOf(plan) {
  if (!plan || !plan.targets.length) return 0;
  const s = plan.targets.reduce((a, t) => a + Math.max(0, t.stretch - 1), 0) / plan.targets.length;
  return clamp(s, 0, 2.2);
}

/** 目標ごとの進捗（0〜1以上） */
export function progressOf(g, t) {
  const now = valueOf(g, t.id);
  const base = t.base;
  const span = t.target - base;
  if (Math.abs(span) < 1e-9) return now >= t.target ? 1 : 0;
  return (now - base) / span;
}

/** 計画全体の達成率 */
export function planProgress(g, plan) {
  if (!plan || !plan.targets.length) return 0;
  return plan.targets.reduce((a, t) => a + clamp(progressOf(g, t), 0, 1.4), 0) / plan.targets.length;
}

/** 残り週数 */
export function weeksLeft(g, plan) { return Math.max(0, plan.endWeek - g.week); }

/**
 * 計画を策定して公表する。
 * 公表した時点で社員の目線が揃い、士気が少し上がる。
 */
export function startPlan(g, { name, spanIdx, targets }, news) {
  const span = PLAN_SPANS[spanIdx] || PLAN_SPANS[0];
  const list = (targets || [])
    .filter(t => PLAN_METRICS[t.id] && t.target > 0)
    .slice(0, 4)
    .map(t => {
      const base = valueOf(g, t.id);
      return {
        id: t.id, base, target: t.target,
        stretch: stretchOf(base, t.target, PLAN_METRICS[t.id].hard),
      };
    });
  if (!list.length) return '目標を1つ以上決めること';

  g.midPlan = {
    name: (name || `${g.year}年度 中期経営計画`).slice(0, 24),
    startWeek: g.week, startYear: g.year,
    endWeek: g.week + span.weeks,
    years: span.years, reward: span.reward,
    targets: list,
    status: 'running',
    announced: true,
  };
  const amb = ambitionOf(g.midPlan);
  for (const s of g.staff) s.morale = clamp01(s.morale + 0.05 + amb * 0.02);
  news && news.push({
    icon: '📋', type: 'plan', major: true,
    text: `中期経営計画「${g.midPlan.name}」を公表した。${span.years}年後に向けて、${
      list.map(t => `${PLAN_METRICS[t.id].name} ${fmtTarget(t.id, t.target)}`).join('、')}を掲げる。`,
  });
  return null;
}

/** 計画を取り下げる。掲げたものを下ろすのは、それ自体が傷になる */
export function abandonPlan(g, news) {
  const p = g.midPlan;
  if (!p || p.status !== 'running') return '進行中の計画がない';
  p.status = 'abandoned';
  p.endedWeek = g.week;
  g.company.brand = clamp(g.company.brand - 3.5, 0, 100);
  for (const s of g.staff) s.morale = clamp01(s.morale - 0.12);
  g.planHistory = g.planHistory || [];
  g.planHistory.push(summarize(g, p));
  g.midPlan = null;
  news && news.push({
    icon: '🗑', type: 'plan', major: true,
    text: `中期経営計画「${p.name}」を取り下げた。掲げた目標を自ら下ろしたことで、社内外の信頼が傷ついた。`,
  });
  return null;
}

function summarize(g, p) {
  return {
    name: p.name, years: p.years, startYear: p.startYear, endYear: g.year,
    status: p.status, score: planProgress(g, p),
    targets: p.targets.map(t => ({ id: t.id, base: t.base, target: t.target, actual: valueOf(g, t.id) })),
  };
}

/**
 * 四半期ごとの判定。期限が来たら成否を確定させる。
 * 達成度に応じてブランド・士気・格付けが動く。
 */
export function stepPlan(g, news) {
  const p = g.midPlan;
  if (!p || p.status !== 'running') return null;
  if (g.week < p.endWeek) return null;

  const score = planProgress(g, p);
  const hit = p.targets.filter(t => progressOf(g, t) >= 1).length;
  const amb = ambitionOf(p);
  const mul = p.reward * (1 + amb * 0.55);
  p.status = score >= 1 ? 'achieved' : score >= 0.8 ? 'partial' : 'missed';
  p.endedWeek = g.week;
  p.score = score;

  let brand = 0, morale = 0, text = '';
  if (p.status === 'achieved') {
    brand = 5.5 * mul; morale = 0.16;
    text = `中期経営計画「${p.name}」を達成した（${hit}/${p.targets.length}項目）。社内は沸き、市場の評価も上がった。`;
  } else if (p.status === 'partial') {
    brand = 1.2 * mul; morale = 0.03;
    text = `中期経営計画「${p.name}」は${hit}/${p.targets.length}項目の達成にとどまった（進捗 ${(score * 100).toFixed(0)}%）。おおむね評価されたが、宿題も残った。`;
  } else {
    brand = -4.5 * (1 + amb * 0.4); morale = -0.14;
    text = `中期経営計画「${p.name}」は未達に終わった（進捗 ${(score * 100).toFixed(0)}%）。掲げた数字に届かず、経営責任を問う声が出ている。`;
  }
  g.company.brand = clamp(g.company.brand + brand, 0, 100);
  for (const s of g.staff) s.morale = clamp01(s.morale + morale);
  g.planHistory = g.planHistory || [];
  g.planHistory.push(summarize(g, p));
  news && news.push({ icon: p.status === 'missed' ? '📉' : '🏁', type: 'plan', major: true, text });
  const done = { ...p };
  g.midPlan = null;
  return done;
}

/** 目標値の表示 */
export function fmtTarget(id, v) {
  const m = PLAN_METRICS[id];
  if (!m) return String(v);
  if (m.scale === 0.01) return `${(v * 100).toFixed(1)}%`;
  if (m.scale === 100) return `${Math.round(v / 100).toLocaleString()}億円`;
  return `${Math.round(v).toLocaleString()}${m.unit}`;
}

/** 計画があるときの株価プレミアム（掲げた数字に市場が期待する） */
export function planPremium(g) {
  const p = g.midPlan;
  if (!p || p.status !== 'running') return 1;
  const score = planProgress(g, p);
  const elapsed = clamp01((g.week - p.startWeek) / Math.max(1, p.endWeek - p.startWeek));
  // 序盤は期待だけで買われ、進捗が遅れると剥がれていく
  const expect = 0.03 * (1 - elapsed) + (score - elapsed) * 0.10;
  return clamp(1 + expect, 0.92, 1.12);
}
