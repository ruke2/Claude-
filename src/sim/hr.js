// ============================================================
//  人事シミュレーション — 組織力・採用・昇進・離職・給与
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, HIRE_CHANNELS, HR_PROGRAMS } from '../data/hrdata.js';
import { makeStaff, baseSalaryFor, avgAbility, uid } from '../core/state.js';

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

/** 四半期あたりの人件費（百万円） */
export function personnelCost(g) {
  const salary = g.staff.reduce((a, s) => a + s.salary, 0) / 4;
  const welfare = salary * 0.16;                              // 法定福利
  const programs = HR_PROGRAMS.reduce((a, p) => a + (g.hrPolicy.programs[p.field] ? p.cost / 4 : 0), 0);
  return salary + welfare + programs;
}

/** 社員が感じる給与の妥当性（1.0で適正） */
export function salaryFairness(g, s) {
  const std = baseSalaryFor(s) * g.hrPolicy.salaryMul;
  return s.salary / Math.max(0.1, std);
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
  const leavers = [];

  for (const s of g.staff) {
    // --- 成長 ---
    const youth = clamp(1.25 - (s.age - 22) * 0.028, 0.15, 1.25);
    for (const k of ABILITY_IDS) {
      const room = s.potential - s.abil[k];
      if (room > 0) {
        const isMain = DEPTS[s.dept].key === k;
        const gain = (room / 100) * youth * trainMul * (isMain ? 1.5 : 0.5) * rng.range(0.5, 1.5) * 1.05;
        s.abil[k] = clamp(s.abil[k] + gain, 0, 99);
      } else if (s.age > 48 && rng.chance(0.1)) {
        s.abil[k] = clamp(s.abil[k] - rng.range(0, 0.4), 0, 99);
      }
    }
    s.tenure += 0.25;

    // --- モチベーション ---
    const fair = salaryFairness(g, s);
    let dm = (fair - 1) * 0.10 + welfare * 0.028 - 0.012;
    if (s.rank >= 3) dm += 0.012;
    if (g.market.sentiment > 0.65) dm += 0.008;
    if (g.finance.pl && g.finance.pl.op < 0) dm -= 0.035;
    s.morale = clamp01(s.morale + dm + rng.normal(0, 0.03));

    // --- 離職判定 ---
    let risk = 0.012;
    risk += Math.max(0, 0.72 - s.morale) * 0.10;
    risk += Math.max(0, 1 - fair) * 0.09;
    risk += (1 - s.loyalty) * 0.022;
    if (pol.programs.welfare) risk *= 0.7;
    if (s.age > 60) risk += 0.16;
    if (avgAbility(s) > 76 && s.rank < 3) risk += 0.02;      // 高能力者の抜擢待ち
    if (rng.chance(clamp01(risk))) leavers.push(s);
  }

  for (const s of leavers) {
    g.staff.splice(g.staff.indexOf(s), 1);
    const why = s.age > 60 ? '定年退職' : salaryFairness(g, s) < 0.92 ? '待遇への不満' : s.morale < 0.45 ? 'モチベーション低下' : '他社への転職';
    news.push({ icon: '🚪', type: 'hr', text: `${DEPTS[s.dept].name}の${RANKS[s.rank].name}・${s.name}が退職した（${why}）。` });
  }

  // --- 新卒入社（Q1） ---
  if (g.quarter === 1 && g.turn > 0) {
    const plan = pol.newGradPlan;
    const p = orgPower(g);
    const appeal = clamp01(0.3 + g.company.brand / 160 + p.hr.quality / 320 + (pol.programs.brandpr ? 0.16 : 0) + (pol.newGradSalary - 5.2) * 0.07);
    const actual = Math.round(plan * clamp(0.55 + appeal * 0.75, 0.3, 1.15));
    const ch = HIRE_CHANNELS.newgrad;
    for (let i = 0; i < actual; i++) {
      const qual = clamp01(appeal + rng.normal(0, 0.18));
      const s = makeStaff(rng, {
        ageRange: ch.ageRange, rank: 0,
        abilityRange: [ch.abilityRange[0] + qual * 10, ch.abilityRange[1] * (0.82 + qual * 0.3)],
        potentialRange: [ch.potentialRange[0] + qual * 18, Math.min(99, ch.potentialRange[1] * (0.8 + qual * 0.28))],
        loyalty: ch.loyaltyBase, channel: 'newgrad',
        dept: rng.pick(DEPT_IDS),
      });
      s.tenure = 0; s.joined = { year: g.year, q: 1 };
      s.salary = Math.round(pol.newGradSalary * 10) / 10;
      g.staff.push(s);
    }
    if (actual > 0) {
      news.push({ icon: '🎓', type: 'hr', text: `${g.year}年度の新卒${actual}名が入社した（計画${plan}名／内定充足率 ${Math.round(actual / plan * 100)}%）。` });
    }
    if (actual < plan * 0.7) {
      news.push({ icon: '⚠', type: 'hr', text: `採用計画を大きく下回った。初任給とブランド力の見直しが必要である。` });
    }
  }

  // --- 定期昇給・昇進（Q1） ---
  if (g.quarter === 1 && g.turn > 0) {
    let promoted = 0;
    for (const s of g.staff) {
      s.age += 1;
      const std = baseSalaryFor(s) * pol.salaryMul;
      s.salary = Math.round((s.salary * 0.62 + std * 0.38) * 10) / 10;
    }
    // 上位役職は枠管理
    for (let r = RANKS.length - 2; r >= 1; r--) {
      const rank = RANKS[r];
      const cur = g.staff.filter(s => s.rank === r).length;
      const room = rank.slots === Infinity ? 99 : Math.max(0, rank.slots - cur);
      const cands = g.staff
        .filter(s => s.rank === r - 1 && avgAbility(s) >= rank.minAbility && s.tenure >= 2)
        .sort((a, b) => (avgAbility(b) + b.abil.lead * 0.4) - (avgAbility(a) + a.abil.lead * 0.4));
      const n = Math.min(room, Math.ceil(cands.length * (0.16 + pol.evalStrict * 0.14)));
      for (let i = 0; i < n; i++) {
        const s = cands[i]; if (!s) break;
        s.rank = r; s.salary = Math.max(s.salary, baseSalaryFor(s) * pol.salaryMul);
        s.morale = clamp01(s.morale + 0.14); promoted++;
        if (r >= 5) news.push({ icon: '⬆', type: 'hr', text: `${s.name}が${rank.name}に昇格した。` });
      }
    }
    if (promoted) news.push({ icon: '📋', type: 'hr', text: `${g.year}年度の人事異動で${promoted}名が昇格した。` });
  }

  // --- 社長が不在なら後継者を立てる ---
  if (!g.staff.some(s => s.rank === 7) && g.staff.length) {
    const next = g.staff.slice().sort((a, b) => (avgAbility(b) + b.abil.lead) - (avgAbility(a) + a.abil.lead))[0];
    next.rank = 7; next.salary = baseSalaryFor(next);
    news.push({ icon: '👑', type: 'hr', text: `${next.name}が新社長に就任した。` });
  }
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
    s.salary = Math.round(baseSalaryFor(s) * (channel === 'headhunt' ? 1.42 : 1.12) * 10) / 10;
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
  news && news.push({ icon: '🤝', type: 'hr', text: `${s.prevCompany || '他社'}から${s.name}（${RANKS[s.rank].name}相当）を採用した。` });
}

/** 組織図データを作る */
export function buildOrgTree(g) {
  const byRank = {};
  for (const s of g.staff) (byRank[s.rank] = byRank[s.rank] || []).push(s);
  return RANKS.map((r, i) => ({ rank: r, members: (byRank[i] || []).sort((a, b) => a.dept.localeCompare(b.dept)) })).reverse();
}
