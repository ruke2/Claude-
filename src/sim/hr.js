// ============================================================
//  人事シミュレーション — 組織力・採用・昇進・離職・給与
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, HIRE_CHANNELS, HR_PROGRAMS,
  CEO_RANK, OFFICER_RANKS, TOP_STAFF_RANK, rankName } from '../data/hrdata.js';
import { makeStaff, baseSalaryFor, stdSalary, rankPayOf, avgAbility, uid } from '../core/state.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR, isYearStart, isAprilFirstWeek } from '../core/time.js';
import { cultureEffects } from './culture.js';
import { oversightOf, ceoPayMorale, ceoPay } from './officers.js';

/** 部署ごとの「質」と「量」を集計する */
export function orgPower(g) {
  const out = {};
  for (const d of DEPT_IDS) {
    const list = g.staff.filter(s => s.dept === d && !s.subsidiary);
    let wsum = 0, asum = 0, cap = 0;
    for (const s of list) {
      const w = 1 + s.rank * 0.42;
      const eff = s.abil[DEPTS[d].key] * (0.72 + s.morale * 0.42);
      wsum += w; asum += eff * w;
      cap += w * (0.8 + s.morale * 0.4);
    }
    out[d] = {
      quality: wsum ? clamp(asum / wsum, 0, 120) : 0,
      capacity: cap,
      count: list.length,
    };
  }
  // 子会社によるブースト
  for (const sub of g.subsidiaries) {
    if (sub.type === 'sales') out.sales.quality *= 1.08;
    if (sub.type === 'construction') out.cons.quality *= 1.10;
    if (sub.type === 'pm') out.lease.quality *= 1.08;
    if (sub.type === 'reit') out.fin.quality *= 1.06;
  }
  for (const a of g.acquisitions) {
    if (a.failed) continue;
    if (a.kind === 'broker') out.sales.quality *= 1.06;
    if (a.kind === 'builder') out.cons.quality *= 1.07;
    if (a.kind === 'pm') out.lease.quality *= 1.06;
  }
  if (g.hrPolicy.programs.dx) for (const d of DEPT_IDS) out[d].capacity *= 1.12;
  // 役員の管掌。見てもらえている部門は質も処理能力も上がる
  const ov = oversightOf(g);
  for (const d of DEPT_IDS) {
    out[d].quality *= (1 + ov[d].quality);
    out[d].capacity *= (1 + ov[d].capacity);
    out[d].officer = ov[d].by || null;
  }
  // 企業カルチャーによる補正
  const ce = cultureEffects(g);
  for (const d of DEPT_IDS) {
    out[d].capacity *= ce.capacityMul;
    out[d].quality *= (0.97 + (g.culture ? g.culture.team : 0.5) * 0.06);
  }
  out.total = g.staff.filter(s => !s.subsidiary).length;
  out.avgSalary = g.staff.length ? g.staff.reduce((a, s) => a + s.salary, 0) / g.staff.length : 0;
  return out;
}

/** 同時に進行できる開発案件の上限 */
export function projectCapacity(g) {
  const p = orgPower(g);
  const base = (p.cons.capacity + p.plan.capacity) / 6;
  return Math.max(3, Math.floor(base) + 1 + g.subsidiaries.filter(s => s.type === 'construction').length * 2);
}

/** 1週あたりの人件費（百万円） */
export function personnelCost(g) {
  // 社長（プレイヤー）は社員ではないので、役員報酬をここで足す
  const salary = (g.staff.reduce((a, s) => a + s.salary, 0) + ceoPay(g)) / WEEKS_PER_YEAR;
  const welfare = salary * 0.16;                              // 法定福利
  const programs = HR_PROGRAMS.reduce((a, p) => a + (g.hrPolicy.programs[p.field] ? p.cost / WEEKS_PER_YEAR : 0), 0);
  return salary + welfare + programs;
}
/** 年額の人件費（表示用） */
export function personnelCostYear(g) { return personnelCost(g) * WEEKS_PER_YEAR; }

/**
 * 社員が感じる給与の妥当性（1.0で適正）。
 * 比べる相手は自社の給与テーブルではなく**業界標準**である。
 * 自社の表を基準にすると、表ごと下げれば不満が出ないことになってしまう。
 */
export function salaryFairness(g, s) {
  return s.salary / Math.max(0.1, baseSalaryFor(s));
}

/** 市場水準に対する自社の給与競争力 */
export function payIndex(g) {
  if (!g.staff.length) return 1;
  let sum = 0;
  for (const s of g.staff) sum += s.salary / Math.max(0.1, baseSalaryFor(s));
  return sum / g.staff.length;
}

// ------------------------------------------------------------
//  四半期処理
// ------------------------------------------------------------
export function stepHR(g, rng, news) {
  const pol = g.hrPolicy;
  const trainMul = pol.programs.training ? 1.35 : 1.0;
  const welfare = pol.programs.welfare ? 1 : 0;
  const W = WEEKS_PER_QUARTER;
  const ce = cultureEffects(g);
  const leavers = [];

  for (const s of g.staff) {
    // --- 成長 ---
    const youth = clamp(1.25 - (s.age - 22) * 0.028, 0.15, 1.25);
    for (const k of ABILITY_IDS) {
      const room = s.potential - s.abil[k];
      if (room > 0) {
        const isMain = DEPTS[s.dept].key === k;
        const gain = (room / 100) * youth * trainMul * ce.growthMul * (isMain ? 1.5 : 0.5) * rng.range(0.5, 1.5) * 1.05 / W;
        s.abil[k] = clamp(s.abil[k] + gain, 0, 99);
      } else if (s.age > 48 && rng.chance(0.1 / W)) {
        s.abil[k] = clamp(s.abil[k] - rng.range(0, 0.4), 0, 99);
      }
    }
    s.tenure += 1 / WEEKS_PER_YEAR;

    // --- モチベーション ---
    const fair = salaryFairness(g, s);
    let dm = (fair - 1) * 0.10 + welfare * 0.028 - 0.012 + ce.moraleShift;
    if (s.rank >= 3) dm += 0.012;
    if (g.market.sentiment > 0.65) dm += 0.008;
    if (g.finance.pl && g.finance.pl.op < 0) dm -= 0.035;
    s.morale = clamp01(s.morale + (dm + rng.normal(0, 0.03)) / W);

    // --- 離職判定 ---
    let risk = 0.012;
    risk += Math.max(0, 0.72 - s.morale) * 0.10;
    risk += Math.max(0, 1 - fair) * 0.09;
    risk += (1 - s.loyalty) * 0.022;
    if (pol.programs.welfare) risk *= 0.7;
    if (s.age > 60) risk += 0.16;
    if (avgAbility(s) > 76 && s.rank < 3) risk += 0.02;      // 高能力者の抜擢待ち
    // 成果主義なら優秀な人材は残り、伸び悩む社員は去る。年功序列はその逆
    const rel = (avgAbility(s) - 55) / 45;
    risk *= clamp(1 - rel * ce.meritLeave * 0.5, 0.45, 1.8);
    risk *= ce.leaveMul;
    if (rng.chance(clamp01(risk) / W)) leavers.push(s);
  }

  for (const s of leavers) {
    g.staff.splice(g.staff.indexOf(s), 1);
    const why = s.age > 60 ? '定年退職' : salaryFairness(g, s) < 0.92 ? '待遇への不満' : s.morale < 0.45 ? 'モチベーション低下' : '他社への転職';
    news.push({ icon: '🚪', type: 'hr', major: s.rank >= 4, text: `${DEPTS[s.dept].name}の${rankName(g, s.rank)}・${s.name}が退職した（${why}）。` });
  }

  // --- 定期昇給・昇格（年度初め） ---
  if (isYearStart(g) && g.week > 0) {
    let promoted = 0;
    for (const s of g.staff) {
      s.age += 1;
      const std = stdSalary(g, s);
      s.salary = Math.round((s.salary * 0.62 + std * 0.38) * 10) / 10;
    }
    // 自動で上がるのは部長まで。執行役員から上は社長が任命する
    for (let r = TOP_STAFF_RANK; r >= 1; r--) {
      if (OFFICER_RANKS.includes(r)) continue;
      const rank = RANKS[r];
      const cur = g.staff.filter(s => s.rank === r).length;
      const room = rank.slots === Infinity ? 99 : Math.max(0, rank.slots - cur);
      const cands = g.staff
        .filter(s => s.rank === r - 1 && avgAbility(s) >= rank.minAbility && s.tenure >= 2)
        .sort((a, b) => (avgAbility(b) + b.abil.lead * 0.4) - (avgAbility(a) + a.abil.lead * 0.4));
      const n = Math.min(room, Math.ceil(cands.length * (0.13 + pol.evalStrict * 0.12 + ce.promoteBoost * 0.14)));
      for (let i = 0; i < n; i++) {
        const s = cands[i]; if (!s) break;
        s.rank = r; s.salary = Math.max(s.salary, stdSalary(g, s));
        s.morale = clamp01(s.morale + 0.14); promoted++;
        if (r >= 4) news.push({ icon: '⬆', type: 'hr', major: true, text: `${s.name}が${rankName(g, r)}に昇格した。` });
      }
    }
    if (promoted) news.push({ icon: '📋', type: 'hr', major: true, text: `${g.year}年の定期人事で${promoted}名が昇格し、全社員の給与を改定した。` });
  }

  // 社長はプレイヤー本人なので、後継者を立てる処理は無い。
  // 万一、社員が社長の席に座っていたら（旧セーブ）一段下ろす
  for (const s of g.staff) if (s.rank >= CEO_RANK) s.rank = TOP_STAFF_RANK;

  // --- 社長の報酬が社内にどう映るか ---
  const gap = ceoPayMorale(g);
  if (gap) for (const s of g.staff) s.morale = clamp01(s.morale + gap);
}

/** 中途・ヘッドハントの候補者を生成 */
export function generateCandidates(g, rng, channel, n = 5) {
  const ch = HIRE_CHANNELS[channel];
  const p = orgPower(g);
  const appeal = clamp01(0.25 + g.company.brand / 150 + p.hr.quality / 300);
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = clamp01(appeal + rng.normal(0, 0.22));
    const s = makeStaff(rng, {
      ageRange: ch.ageRange,
      abilityRange: [ch.abilityRange[0] + q * 8, Math.min(97, ch.abilityRange[1] * (0.86 + q * 0.2))],
      potentialRange: ch.potentialRange,
      loyalty: ch.loyaltyBase, channel,
      dept: rng.pick(DEPT_IDS),
    });
    s.rank = clamp(Math.floor((avgAbility(s) - 42) / 11), 0, 5);
    s.salary = Math.round(stdSalary(g, s) * (channel === 'headhunt' ? 1.42 : 1.12) * 10) / 10;
    s.hireCost = Math.round(ch.costPerHead * (0.6 + avgAbility(s) / 70) * 10) / 10;
    s.prevCompany = rng.pick(g.rivals).name;
    out.push(s);
  }
  return out.sort((a, b) => avgAbility(b) - avgAbility(a));
}

export function hireStaff(g, s, news) {
  s.joined = { year: g.year, q: g.quarter };
  s.tenure = 0;
  delete s.hireCost;
  g.staff.push(s);
  news && news.push({ icon: '🤝', type: 'hr', text: `${s.prevCompany || '他社'}から${s.name}（${rankName(g, s.rank)}相当）を採用した。` });
}

/** 組織図データを作る */
export function buildOrgTree(g) {
  const byRank = {};
  for (const s of g.staff) (byRank[s.rank] = byRank[s.rank] || []).push(s);
  return RANKS.map((r, i) => ({ rank: r, members: (byRank[i] || []).sort((a, b) => a.dept.localeCompare(b.dept)) })).reverse();
}
