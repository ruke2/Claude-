// ============================================================
//  財務 — 四半期決算・BS・資金調達・株価
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { blankPL, isOwnedCell } from '../core/state.js';
import { totalFundEquity } from './fund.js';
import { orgPower, personnelCost } from './hr.js';
import { holdingCost } from './land.js';
import { landAppraisal, assetValue } from './valuation.js';
import { TERRAIN } from '../data/city.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';
import { planPremium } from './midplan.js';
import { irPremium, outlookSpread } from './ir.js';

export const RATINGS = [
  { id: 'AAA', min: 0.50, spread: 0.0020, label: '最上級。調達コストは業界最安水準。' },
  { id: 'AA',  min: 0.40, spread: 0.0034, label: '極めて高い信用力。' },
  { id: 'A',   min: 0.30, spread: 0.0058, label: '良好な信用力。大型調達も問題ない。' },
  { id: 'BBB', min: 0.20, spread: 0.0082, label: '投資適格の下限。銀行は慎重になる。' },
  { id: 'BB',  min: 0.12, spread: 0.0162, label: '投機的水準。金利が重い。' },
  { id: 'B',   min: -9,   spread: 0.0190, label: '危険水域。新規調達は極めて難しい。' },
];

export function ratingOf(g) {
  const bs = buildBS(g);
  const er = bs.total > 0 ? bs.equity / bs.total : 0;
  const profitable = g.finance.history.slice(-4).filter(h => h.pl.net > 0).length;
  let r = RATINGS.find(x => er >= x.min) || RATINGS[RATINGS.length - 1];
  if (profitable === 0 && g.finance.history.length >= 4) {
    const i = RATINGS.indexOf(r);
    r = RATINGS[Math.min(RATINGS.length - 1, i + 1)];
  }
  return r;
}

export function effectiveRate(g) {
  const od = overdraft(g);
  const penalty = g.debt > 0 ? (od / g.debt) * 0.035 : 0;
  // 格付けそのものに加え、見通し（ポジティブ／ネガティブ）も金利に効く
  return g.market.rate + ratingOf(g).spread + outlookSpread(g) + penalty;
}

/** 借入可能上限（コーポレート枠＋不動産担保によるプロジェクト枠） */
export function debtCapacity(g) {
  const p = orgPower(g);
  const lev = 1.05 + clamp(p.fin.quality / 90, 0, 1.0) + (g.company.listed ? 0.5 : 0);
  const bs = buildBS(g);
  const ltv = 0.62 + clamp(p.fin.quality / 620, 0, 0.1);
  const collateral = (bs.inventory + bs.land + bs.cip + bs.rental) * ltv + bs.hq * 0.45;
  return Math.round(Math.max(0, bs.equity * lev + collateral));
}

/**
 * 投資余力（百万円）。いま手元にある現金と、まだ引ける借入枠の合計。
 *
 * 「この会社にどれくらいの大きさの話が持ち込まれるか」の物差しである。
 * `trading.js` の一棟買いと `land.js` の売却情報が、どちらもこれを見ている。
 * **片方だけ別の式にしないこと。** 一棟買いには200億のビルが回ってくるのに
 * 用地は15億ばかり、といった食い違いが出る。
 */
export function investPower(g) {
  return Math.max(2000, g.cash + Math.max(0, debtCapacity(g) - g.debt));
}

/** 借入枠を超えた分（当座借越）— 高い金利がかかる */
export function overdraft(g) {
  return Math.max(0, g.debt - debtCapacity(g));
}

/** 貸借対照表を組み立てる */
export function buildBS(g) {
  let inventory = 0;
  for (const inv of g.inventory) inventory += inv.cost * (1 - inv.soldRatio);
  let land = 0;
  for (const c of g.cells) {
    // ファンドに拠出した区画（fundId）は売却済みなので資産に載せない
    if (isOwnedCell(c) && !c.projectId && !c.assetId && !c.invId && !c.isHQ) land += (c.bookValue ?? c.lastPaid ?? 0);
  }
  let cip = 0;
  for (const p of g.projects) cip += p.spent + p.landCost;
  let rental = 0;
  for (const a of g.assets) rental += a.bookLand + a.bookBuild;
  const subs = g.subsidiaries.reduce((s, x) => s + (x.bookValue || 0), 0);
  // ファンドへの出資持分（物件そのものは資産から外れている）
  const fund = totalFundEquity(g);
  const total = g.cash + inventory + land + cip + rental + g.hqBook + g.goodwill + subs + fund;
  return {
    cash: g.cash, inventory: Math.round(inventory), land: Math.round(land), cip: Math.round(cip),
    rental: Math.round(rental), hq: g.hqBook, goodwill: g.goodwill, subs, fund,
    total: Math.round(total), debt: g.debt, equity: Math.round(total - g.debt),
  };
}

/** 保有不動産の含み益 */
export function unrealizedGain(g) {
  let mv = 0, bv = 0;
  for (const a of g.assets) { mv += assetValue(g, a); bv += a.bookLand + a.bookBuild; }
  for (const c of g.cells) {
    if (c.owner === 'player' && !c.projectId && !c.assetId && !c.invId && !c.isHQ) {
      mv += landAppraisal(g, c); bv += (c.bookValue ?? c.lastPaid ?? 0);
    }
  }
  return { mv: Math.round(mv), bv: Math.round(bv), gain: Math.round(mv - bv) };
}

/** 借入 */
export function borrow(g, amount, news) {
  const cap = debtCapacity(g);
  const room = Math.max(0, cap - g.debt);
  const amt = Math.min(amount, room);
  if (amt <= 0) return 0;
  g.debt += amt; g.cash += amt;
  news && news.push({ icon: '🏦', type: 'fin', text: `${Math.round(amt / 100).toLocaleString()}億円を借り入れた（金利 ${(effectiveRate(g) * 100).toFixed(2)}%）。` });
  return amt;
}

export function repay(g, amount, news) {
  const amt = Math.min(amount, g.debt, Math.max(0, g.cash));
  if (amt <= 0) return 0;
  g.debt -= amt; g.cash -= amt;
  news && news.push({ icon: '🏦', type: 'fin', text: `借入金${Math.round(amt / 100).toLocaleString()}億円を返済した。` });
  return amt;
}

/** 上場の可否 */
export function ipoStatus(g) {
  if (g.company.listed) return { ok: false, reason: '上場済み' };
  const bs = buildBS(g);
  const h = g.finance.history;
  const profits = h.slice(-8).filter(x => x.pl.net > 0).length;
  const reqs = [
    { label: '純資産 300億円以上', ok: bs.equity >= 30000, now: `${Math.round(bs.equity / 100)}億円` },
    { label: '直近8四半期のうち6期以上が黒字', ok: profits >= 6, now: `${profits}期` },
    { label: '竣工実績 3件以上', ok: g.kpi.builtCount >= 3, now: `${g.kpi.builtCount}件` },
    { label: '従業員 60名以上', ok: g.staff.length >= 60, now: `${g.staff.length}名` },
  ];
  return { ok: reqs.every(r => r.ok), reqs };
}

export function doIPO(g, news) {
  const bs = buildBS(g);
  const newShares = Math.round(g.company.shares * 0.28);
  const price = sharePrice(g) * 0.88;
  const raise = Math.round(price * newShares / 1e6);
  g.company.shares += newShares;
  g.company.listed = true;
  g.cash += raise;
  g.company.brand = clamp(g.company.brand + 8, 0, 100);
  news && news.push({ icon: '🔔', type: 'fin', text: `東証プライム市場に新規上場。公募${(newShares / 10000).toFixed(0)}万株で${Math.round(raise / 100).toLocaleString()}億円を調達した。` });
  return raise;
}

/** 公募増資 */
export function issueShares(g, ratio, news) {
  const newShares = Math.round(g.company.shares * ratio);
  const price = sharePrice(g) * 0.92;
  const raise = Math.round(price * newShares / 1e6);
  g.company.shares += newShares;
  g.cash += raise;
  news && news.push({ icon: '📑', type: 'fin', text: `公募増資により${Math.round(raise / 100).toLocaleString()}億円を調達した（希薄化 ${(ratio * 100).toFixed(0)}%）。` });
  return raise;
}

/** 1株あたり株価（円） */
export function sharePrice(g) {
  const bs = buildBS(g);
  const h = g.finance.history.slice(-4);
  const annualNet = h.length ? h.reduce((a, x) => a + x.pl.net, 0) * (4 / h.length) : 0;
  const growth = growthRate(g);
  const per = clamp(11 + growth * 55 + g.company.brand / 11, 7, 30);
  const eps = annualNet * 1e6 / g.company.shares;
  const bps = bs.equity * 1e6 / g.company.shares;
  const ug = unrealizedGain(g).gain * 1e6 / g.company.shares;
  const byEarn = eps * per;
  const byAsset = (bps + ug * 0.5) * clamp(0.65 + g.company.brand / 200, 0.6, 1.25);
  // 中期経営計画を掲げていると、その進捗ぶんだけ市場が織り込む
  // 中期経営計画の進捗と、決算説明会での受け答えが市場の見方を動かす
  return Math.max(30, Math.round((byEarn * 0.58 + byAsset * 0.42) * planPremium(g) * irPremium(g)));
}

export function marketCap(g) { return Math.round(sharePrice(g) * g.company.shares / 1e6); }

/** 直近の売上成長率（年率） */
export function growthRate(g) {
  const h = g.finance.history;
  if (h.length < 8) return 0.08;
  const recent = h.slice(-4).reduce((a, x) => a + x.pl.revenue, 0);
  const prev = h.slice(-8, -4).reduce((a, x) => a + x.pl.revenue, 0);
  if (prev <= 0) return 0.3;
  return clamp((recent - prev) / prev, -0.5, 1.2);
}

// ------------------------------------------------------------
//  毎週の費用計上と資金繰り
// ------------------------------------------------------------
export function weeklyCosts(g, news) {
  const acc = g.finance.quarterAcc;
  const W = WEEKS_PER_QUARTER;

  // --- 販売費及び一般管理費 ---
  const personnel = personnelCost(g);                       // 週あたり
  const fixedQ = 88 + g.assets.length * 12 + g.inventory.length * 8 + g.projects.length * 16
    + g.subsidiaries.reduce((a, x) => a + x.upkeep / 4, 0);
  const fixed = fixedQ / W;
  const ad = (g.inventory.length * 22 + g.projects.filter(p => p.saleArea > 0).length * 14) / W;
  const dxCut = g.hrPolicy.programs.dx ? 0.94 : 1;
  const sga = (personnel + fixed + ad) * dxCut;
  acc.personnel += personnel * dxCut;
  acc.sga += sga;
  g.cash -= sga;

  // --- 用地の保有コスト ---
  let hold = 0;
  for (const c of g.cells) {
    if (isOwnedCell(c) && !c.assetId && !c.invId && !c.isHQ) hold += holdingCost(g, c);
  }
  acc.cogsOther += hold;
  g.cash -= hold;

  // --- 支払利息（建設中案件に対応する分は取得原価に算入する） ---
  const rate = effectiveRate(g);
  const interestAll = g.debt * rate / WEEKS_PER_YEAR;
  g.cash -= interestAll;
  const bsNow = buildBS(g);
  const cipRatio = bsNow.total > 0 ? Math.min(0.45, bsNow.cip / bsNow.total) : 0;
  const capitalized = interestAll * cipRatio;
  if (capitalized > 0 && g.projects.length) {
    const totalCip = g.projects.reduce((a, p) => a + p.spent + p.landCost, 0) || 1;
    for (const p of g.projects) p.spent += capitalized * (p.spent + p.landCost) / totalCip;
  }
  acc.interest += interestAll - capitalized;
  acc.capitalizedInterest = (acc.capitalizedInterest || 0) + capitalized;

  // --- 資金が尽きたら調達する ---
  if (g.cash < 0) {
    const burn = Math.max(200, (sga + interestAll) * 8);
    const need = Math.ceil((-g.cash + burn) / 100) * 100;
    const room = Math.max(0, debtCapacity(g) - g.debt);
    const normal = Math.min(need, room);
    if (normal > 0) { g.debt += normal; g.cash += normal; }
    const short = need - normal;
    if (short > 0) {
      g.debt += short; g.cash += short;
      g.overdraftWeeks = (g.overdraftWeeks || 0) + 1;
      if (g.overdraftWeeks % 4 === 1) {
        news.push({
          icon: '🚨', type: 'fin', major: true,
          text: `借入枠を${Math.round(short / 100).toLocaleString()}億円超過して当座借越を実行した。ペナルティ金利がかかっている。`,
        });
      }
    } else if (news) {
      news.push({ icon: '🏦', type: 'fin', text: `運転資金として${Math.round(normal / 100).toLocaleString()}億円を借り入れた。` });
    }
  }
}

// ------------------------------------------------------------
//  四半期決算
// ------------------------------------------------------------
export function closeQuarter(g, rng, news) {
  const acc = g.finance.quarterAcc;

  const revenue = acc.revSale + acc.revLease + acc.revFee + acc.revOther;
  const cogs = acc.cogsSale + acc.cogsLease + acc.cogsOther;
  const gross = revenue - cogs;
  const op = gross - acc.sga;
  const interest = acc.interest;
  const nonop = -interest;
  const ordinary = op + nonop;
  const extra = acc.gainSale - acc.impairment + acc.extraordinary;
  const pretax = ordinary + extra;
  const tax = pretax > 0 ? Math.round(pretax * 0.305) : 0;
  acc.tax = tax;
  g.cash -= tax;
  const net = pretax - tax;

  const R = v => Math.round(v);
  const pl = {
    revenue: R(revenue), revSale: R(acc.revSale), revLease: R(acc.revLease), revFee: R(acc.revFee),
    revOther: R(acc.revOther),
    cogs: R(cogs), cogsSale: R(acc.cogsSale), cogsLease: R(acc.cogsLease), cogsOther: R(acc.cogsOther),
    gross: R(gross), sga: R(acc.sga), personnel: R(acc.personnel), op: R(op),
    interest: R(interest), ordinary: R(ordinary),
    gainSale: R(acc.gainSale), impairment: R(acc.impairment), extra: R(extra),
    pretax: R(pretax), tax, net: R(net),
    landSpend: R(acc.landSpend), buildSpend: R(acc.buildSpend),
    capitalizedInterest: R(acc.capitalizedInterest || 0),
  };
  const bs = buildBS(g);
  g.equity = bs.equity;
  g.finance.pl = pl; g.finance.bs = bs;
  g.finance.history.push({
    year: g.year, q: g.quarter, week: g.week, pl, bs,
    rating: ratingOf(g).id, price: g.company.listed ? sharePrice(g) : 0,
  });
  if (g.finance.history.length > 200) g.finance.history.shift();
  g.kpi.cumRevenue += pl.revenue; g.kpi.cumProfit += pl.net;
  g.kpi.bestQuarter = Math.max(g.kpi.bestQuarter, pl.net);

  // 借入枠の超過が続いているかを四半期単位で見る
  if (overdraft(g) > 0) g.crisis = (g.crisis || 0) + 1;
  else { g.crisis = 0; g.overdraftWeeks = 0; }

  // 期末配当（上場していて、通期が黒字のときだけ）。
  // **四半期ごとに払わないこと。** 年4回配当する日本の不動産会社はほとんど無い
  if (g.company.listed && g.quarter === 4) {
    const year = ttm(g);
    if (year.net > 0) {
      const payout = clamp(g.company.payout ?? 0.22, 0, 0.8);
      const div = Math.round(year.net * payout);
      if (div > 0) {
        g.cash -= div;
        g.finance.quarterAcc.dividend = div;
        g.company.lastDividend = { year: g.year, amount: div, payout };
        news && news.push({
          icon: '💴', type: 'ir',
          text: `期末配当を実施した。配当総額 ${Math.round(div / 100).toLocaleString()}億円（配当性向 ${(payout * 100).toFixed(0)}%）。`,
        });
      }
    }
  }

  g.finance.quarterAcc = blankPL();
  return pl;
}

/** 直近4四半期合計（年換算の実績） */
export function ttm(g) {
  const h = g.finance.history.slice(-4);
  const z = { revenue: 0, op: 0, ordinary: 0, net: 0, revSale: 0, revLease: 0, revFee: 0 };
  for (const x of h) for (const k in z) z[k] += x.pl[k] || 0;
  return z;
}

/** 主要経営指標 */
export function kpis(g) {
  const t = ttm(g);
  const bs = g.finance.bs || buildBS(g);
  return {
    revenue: t.revenue, op: t.op, net: t.net,
    opMargin: t.revenue > 0 ? t.op / t.revenue : 0,
    roe: bs.equity > 0 ? t.net / bs.equity : 0,
    roa: bs.total > 0 ? t.net / bs.total : 0,
    equityRatio: bs.total > 0 ? bs.equity / bs.total : 0,
    de: bs.equity > 0 ? g.debt / bs.equity : 0,
    eps: t.net * 1e6 / g.company.shares,
    bps: bs.equity * 1e6 / g.company.shares,
    price: sharePrice(g), cap: marketCap(g),
    rating: ratingOf(g), rate: effectiveRate(g),
    capacity: debtCapacity(g), room: Math.max(0, debtCapacity(g) - g.debt),
    unrealized: unrealizedGain(g),
  };
}
