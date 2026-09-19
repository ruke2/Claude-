// ============================================================
//  労働時間 — 仕事量と人員のバランス、残業、離職
//    案件を増やしても人を増やさなければ、現場は残業で埋める。
//    残業は人件費として出ていき、士気を削り、いずれ人が辞める。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPT_IDS, DEPTS } from '../data/hrdata.js';
import { WEEKS_PER_YEAR, WEEKS_PER_QUARTER } from '../core/time.js';
import { TERRAIN } from '../data/city.js';

/** 所定内の労働時間（月） */
export const BASE_HOURS = 160;
/** これを超えると健康リスクが上がる（月あたり） */
export const OVERTIME_DANGER = 60;
/** 法定の上限（月あたり）。超えると是正勧告の対象になる */
export const OVERTIME_LIMIT = 80;
/** 残業代の割増率 */
export const OT_PREMIUM = 1.25;

/**
 * 部署ごとの仕事量。
 * 何が増えるとどこが忙しくなるのかを、一箇所に集めておく。
 */
function workOf(g) {
  const projects = g.projects || [];
  const running = projects.filter(p => p.status === 'construction').length;
  const planning = projects.length - running;
  const inv = g.inventory || [];
  const assets = g.assets || [];
  const lots = (g.cells || []).filter(c => c.owner === 'player' && c.terrain === TERRAIN.LOT);
  const idleLots = lots.filter(c => !c.building && !c.projectId).length;
  const listings = (g.listings || []).length;
  const staff = (g.staff || []).filter(s => !s.subsidiary).length;
  const subs = (g.subsidiaries || []).length + (g.acquisitions || []).filter(a => !a.failed).length;
  const units = inv.reduce((a, x) => a + (x.units || 0) * (1 - (x.soldRatio || 0)), 0);
  const nra = assets.reduce((a, x) => a + (x.nra || 0), 0);

  // 内製化した子会社・買収先は、その部門の実務を引き受けてくれる
  const has = t => (g.subsidiaries || []).some(x => x.type === t);
  const got = k => (g.acquisitions || []).some(a => !a.failed && a.kind === k);
  const relief = {
    cons: (has('construction') ? 0.82 : 1) * (got('builder') ? 0.90 : 1),
    sales: (has('sales') ? 0.78 : 1) * (got('broker') ? 0.88 : 1),
    lease: (has('pm') ? 0.72 : 1) * (got('pm') ? 0.86 : 1),
    fin: (has('reit') ? 0.85 : 1),
  };
  const mul = workEffects(g).workMul;
  const W = (v, k) => v * mul * (relief[k] || 1);
  return {
    land: W(listings * 0.55 + idleLots * 0.9 + lots.length * 0.12, 'land'),
    plan: W(planning * 2.6 + projects.length * 0.8 + idleLots * 0.35, 'plan'),
    cons: W(running * 3.1 + projects.length * 0.5, 'cons'),
    sales: W(inv.length * 1.7 + units / 46, 'sales'),
    // 棟数と床。管理そのものは外に出せるので、伸び方はゆるやかにしてある
    lease: W(assets.length * 0.85 + nra / 9000, 'lease'),
    // 借入は残高そのものではなく、その平方根で効かせる。
    // 1兆円の借入は100億円の10倍の手間ではない
    fin: W(Math.sqrt(Math.max(0, g.debt || 0) / 9000) * 1.2
      + projects.length * 0.4 + assets.length * 0.18 + (g.company.listed ? 2.2 : 0), 'fin'),
    hr: W(staff / 26 + ((g.recruit && g.recruit.ng && g.recruit.ng.pool) || []).length / 34, 'hr'),
    corp: W(subs * 1.5 + (g.maTargets || []).length * 0.35 + (g.midPlan ? 1.6 : 0) + (g.company.listed ? 1.8 : 0), 'corp'),
  };
}

/**
 * 部署ごとの負荷と残業時間。
 * capacity は orgPower が出す処理能力。
 * 仕事量がそれを超えたぶんが、そのまま残業として現場に乗る。
 */
export function workload(g, power) {
  const work = workOf(g);
  const out = {};
  let sumH = 0, sumN = 0;
  for (const d of DEPT_IDS) {
    const cap = Math.max(0.8, power[d].capacity);
    const n = power[d].count;
    const load = work[d] / cap;
    // 負荷1.0でちょうど定時。超えたぶんを残業で埋める。
    // 伸び方は寝かせてある（際限なく働けるわけではない）。
    // 人が少ない部署ほど、ひとりに集中して急に効いてくる
    const over = Math.max(0, load - 1);
    const raw = Math.pow(over, 0.75) * 55 * (n ? clamp(1 + (3 - n) * 0.12, 0.85, 1.5) : 1);
    const ot = n ? clamp(raw, 0, 140) : 0;
    out[d] = {
      work: work[d], capacity: cap, load,
      overtime: Math.round(ot * 10) / 10,
      hours: Math.round((BASE_HOURS + ot) * 10) / 10,
      count: n,
      danger: ot >= OVERTIME_DANGER,
      illegal: ot > OVERTIME_LIMIT,
    };
    if (n) { sumH += ot * n; sumN += n; }
  }
  const avg = sumN ? sumH / sumN : 0;
  out.total = {
    overtime: Math.round(avg * 10) / 10,
    hours: Math.round((BASE_HOURS + avg) * 10) / 10,
    worst: DEPT_IDS.reduce((a, d) => (out[d].overtime > (out[a] ? out[a].overtime : -1) ? d : a), DEPT_IDS[0]),
    illegal: DEPT_IDS.some(d => out[d].illegal),
    headcount: sumN,
  };
  return out;
}

/** 1週あたりの残業代（百万円） */
export function overtimeCost(g, power) {
  const w = workload(g, power);
  let yen = 0;
  for (const d of DEPT_IDS) {
    const list = g.staff.filter(s => s.dept === d && !s.subsidiary);
    for (const s of list) {
      // 時間単価 = 年収 / (所定内時間 × 12)。残業は割増
      const hourly = s.salary / (BASE_HOURS * 12);
      yen += hourly * w[d].overtime * 12 * OT_PREMIUM / WEEKS_PER_YEAR;
    }
  }
  return yen;
}

/**
 * 残業が士気と体調に効く（週次）。
 * 月45時間くらいまでは我慢できるが、その先は目に見えて削れる。
 */
export function overtimeMorale(ot) {
  if (ot <= 25) return 0.0008;            // 適度に忙しいほうが張りがある
  if (ot <= 45) return -0.0004;
  if (ot <= OVERTIME_DANGER) return -0.0022;
  if (ot <= OVERTIME_LIMIT) return -0.0048;
  return -0.0085;
}

/** 残業による離職リスクの上乗せ（週次の確率に足す係数） */
export function overtimeAttrition(ot) {
  if (ot <= 45) return 0;
  return clamp((ot - 45) / 100, 0, 0.55);
}

/**
 * 働き方への投資メニュー。
 * 人を増やす以外に、負荷そのものを下げる手を用意しておく。
 */
export const WORK_PROGRAMS = [
  {
    id: 'flex', name: 'フレックス・裁量労働の導入', cost: 160, icon: '🕘',
    desc: '働き方の自由度が上がる。残業の体感が和らぎ、士気の目減りが3割減る。',
  },
  {
    id: 'outsource', name: '定型業務のアウトソース', cost: 520, icon: '📦',
    desc: '事務処理を外に出す。全部署の仕事量が12%減る。',
  },
  {
    id: 'health', name: '産業医・健康経営', cost: 210, icon: '🩺',
    desc: '長時間労働による離職を4割抑える。エンゲージメントも上がる。',
  },
];

/** 投資による軽減係数 */
export function workEffects(g) {
  const p = (g.hrPolicy && g.hrPolicy.work) || {};
  return {
    workMul: p.outsource ? 0.88 : 1,
    moraleMul: p.flex ? 0.7 : 1,
    attritionMul: p.health ? 0.6 : 1,
    surveyBonus: (p.flex ? 3 : 0) + (p.health ? 4 : 0),
  };
}

/** 年間の残業代（表示用） */
export function overtimeCostYear(g, power) { return overtimeCost(g, power) * WEEKS_PER_YEAR; }
