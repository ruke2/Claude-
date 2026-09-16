// ============================================================
//  開発プロジェクト — 企画・着工・工事進捗・竣工
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { uid, makeBuilding } from '../core/state.js';
import { devPlan, subEffect } from './valuation.js';
import { riskImpact } from './land.js';
import { orgPower, projectCapacity } from './hr.js';
import { BRAND_PREFIX, BRAND_CORE, OFFICE_SUFFIX } from '../data/hrdata.js';

/** 企画段階の事業計画を作る（リスク反映済み） */
export function feasibility(g, cell, useId, gradeId) {
  const eff = riskImpact(g, cell, (cell.risks || []).filter(r => true));
  const plan = devPlan(g, cell, useId, gradeId, {
    farPenalty: eff.farMul, coverMul: 1 / Math.max(0.6, eff.floorMul) * eff.floorMul,
    landCost: cell.lastPaid || undefined,
  });
  plan.floors = Math.max(1, Math.round(plan.floors * eff.floorMul));
  plan.heightM = Math.round(plan.heightM * eff.floorMul * 10) / 10;
  plan.buildCost = Math.round(plan.buildCost * eff.buildMul + eff.extraCost);
  plan.quarters += eff.delay;
  plan.riskExtra = Math.round(eff.extraCost);
  plan.totalCost = plan.landCost + plan.buildCost;
  if (plan.saleRevenue) plan.saleRevenue = Math.round(plan.saleRevenue * eff.priceMul);
  if (plan.assetValue) plan.assetValue = Math.round(plan.assetValue * eff.priceMul);
  plan.grossValue = (plan.saleRevenue || 0) + (plan.assetValue || 0);
  plan.profit = plan.grossValue - plan.totalCost - (plan.saleRevenue || 0) * 0.04;
  plan.margin = plan.grossValue > 0 ? plan.profit / plan.grossValue : 0;
  plan.yieldOnCost = plan.noi ? plan.noi / Math.max(1, plan.totalCost) : null;
  return plan;
}

function projectName(rng, use, districtId, grade) {
  const d = DISTRICTS[districtId];
  if (use === 'office' || use === 'mixed') return `${d.short}${rng.pick(OFFICE_SUFFIX)}`;
  if (use === 'logi') return `${d.short}ロジスティクスパーク`;
  if (use === 'hotel') return `${rng.pick(['ホテル', 'ザ・', 'グランド'])}${d.short}${grade === 'luxury' ? 'ラグジュアリー' : ''}`;
  if (use === 'retail') return `${d.short}${rng.pick(['モール', 'テラス', 'プラザ', 'アベニュー'])}`;
  if (use === 'house') return `${d.short}${rng.pick(['ガーデンタウン', 'ヒルサイド', 'テラスタウン'])}`;
  return `${rng.pick(BRAND_PREFIX)}${d.short}${rng.pick(BRAND_CORE)}`;
}

/** 着工 */
export function startProject(g, cell, useId, gradeId, rng, news) {
  const plan = feasibility(g, cell, useId, gradeId);
  const pj = {
    id: uid('P'), cellId: cell.id, district: cell.d,
    name: projectName(rng, useId, cell.d, gradeId),
    use: useId, grade: gradeId,
    gfa: plan.gfa, floors: plan.floors, heightM: plan.heightM,
    sellable: plan.sellable, saleArea: plan.saleArea || 0, nra: plan.nra || 0,
    budget: plan.buildCost, spent: 0, overrun: 0,
    landCost: plan.landCost,
    quarters: plan.quarters, elapsed: 0, progress: 0, delay: 0,
    status: 'construction', startTurn: g.turn, seed: rng.int(0, 99999),
    plan, salePrice: plan.salePrice || 0, rent: plan.rent || 0,
    preContract: 0, marketing: false, events: [],
  };
  cell.projectId = pj.id;
  cell.vacant = false;
  g.projects.push(pj);
  news && news.push({
    icon: '🏗', type: 'dev',
    text: `${DISTRICTS[cell.d].name}で「${pj.name}」（${USES[useId].name}・地上${pj.floors}階）が着工。総事業費${Math.round((plan.totalCost) / 100).toLocaleString()}億円。`,
  });
  return pj;
}

const BUILD_EVENTS = [
  { id: 'weather', p: 0.07, icon: '🌧', bad: true, text: '記録的な長雨で外構工事が止まった。工期が1四半期延びる。', apply: pj => { pj.delay++; } },
  { id: 'overrun', p: 0.10, icon: '💸', bad: true, text: '資材価格の再見積りで請負金額の増額を求められた。', apply: (pj, g, rng) => { const up = pj.budget * rng.range(0.03, 0.09); pj.budget += up; pj.overrun += up; } },
  { id: 'accident', p: 0.035, icon: '⚠', bad: true, text: '現場で労災事故が発生。安全対策のため工事を一時中断した。', apply: pj => { pj.delay++; pj.safety = true; } },
  { id: 'labor', p: 0.055, icon: '👷', bad: true, text: '型枠工の確保が難航し、躯体工事が遅れている。', apply: pj => { pj.delay++; } },
  { id: 'vecut', p: 0.075, icon: '✂', bad: false, text: 'VE提案により仕様を見直し、工事費を圧縮できた。', apply: (pj, g, rng) => { const cut = pj.budget * rng.range(0.02, 0.055); pj.budget -= cut; pj.overrun -= cut; } },
  { id: 'fast', p: 0.060, icon: '⚡', bad: false, text: '施工が計画を上回るペースで進み、工程を短縮できた。', apply: pj => { pj.delay = Math.max(-2, pj.delay - 1); } },
  { id: 'media', p: 0.050, icon: '📣', bad: false, text: '建築専門誌に計画が大きく取り上げられ、引き合いが増えた。', apply: (pj, g) => { pj.hype = (pj.hype || 0) + 0.12; g.company.brand += 0.4; } },
];

/** 四半期ごとの工事進捗 */
export function stepProjects(g, rng, news) {
  const p = orgPower(g);
  const done = [];
  for (const pj of g.projects) {
    if (pj.status !== 'construction') continue;
    pj.elapsed += 1;
    const total = pj.quarters + pj.delay;
    pj.progress = clamp01(pj.elapsed / total);

    // 出来高払い
    const pay = Math.round(pj.budget / total);
    pj.spent += pay;
    g.cash -= pay;
    g.finance.quarterAcc.buildSpend += pay;

    // 工事イベント
    for (const ev of BUILD_EVENTS) {
      let pr = ev.p;
      if (ev.bad) pr *= clamp(1.35 - p.cons.quality / 110, 0.45, 1.6);
      else pr *= clamp(0.55 + p.cons.quality / 110, 0.5, 1.6);
      if (g.subsidiaries.some(s => s.type === 'construction')) pr *= ev.bad ? 0.78 : 1.18;
      if (rng.chance(pr / Math.max(1, total * 0.55))) {
        ev.apply(pj, g, rng);
        pj.events.push({ ...ev, turn: g.turn });
        news.push({ icon: ev.icon, type: 'dev', text: `【${pj.name}】${ev.text}` });
      }
    }

    // 分譲の事前契約（青田売り）
    if (pj.saleArea > 0 && pj.progress > 0.25) {
      const speed = contractSpeed(g, pj.use, pj.salePrice, pj.plan.salePrice, p, pj.district) * (1 + (pj.hype || 0));
      pj.preContract = clamp01(pj.preContract + speed * 0.62);
    }

    if (pj.elapsed >= total) { pj.status = 'done'; pj.progress = 1; done.push(pj); }
  }
  for (const pj of done) completeProject(g, pj, rng, news);
}

/** 分譲の四半期あたり契約進捗率 */
export function contractSpeed(g, use, price, marketPrice, p, districtId) {
  const gapRaw = marketPrice > 0 ? (price / marketPrice) : 1;
  const gap = clamp(2.15 - gapRaw * 1.15, 0.12, 1.85);        // 価格が安いほど速い
  const dem = g.market.demand[use] ?? 1;
  const sales = 0.55 + (p.sales.quality / 100) * 0.55 + p.sales.capacity / 130;
  const brand = 0.82 + g.company.brand / 260;
  const sub = 1 + (g.subsidiaries.some(s => s.type === 'sales') ? 0.15 : 0)
    + (g.acquisitions.some(a => a.kind === 'broker' && !a.failed) ? 0.09 : 0);
  return clamp(0.15 * gap * dem * sales * brand * sub, 0.02, 0.62);
}

/** 竣工処理 */
function completeProject(g, pj, rng, news) {
  const cell = g.cells.find(c => c.id === pj.cellId);
  if (!cell) return;
  const U = USES[pj.use];
  cell.projectId = null;
  cell.building = makeBuilding(rng, {
    use: pj.use, floors: pj.floors, d: cell.d, owner: 'player',
    grade: pj.grade, year: g.year, name: pj.name,
  });
  cell.building.height = pj.heightM;
  g.kpi.builtCount++;
  g.company.brand = clamp(g.company.brand + GRADES[pj.grade].brandGain * (pj.gfa > 12000 ? 1.6 : 1), 0, 100);

  const cost = pj.landCost + pj.spent;
  // --- 分譲部分 ---
  if (pj.saleArea > 0) {
    const inv = {
      id: uid('I'), cellId: cell.id, projectId: pj.id, name: pj.name,
      use: pj.use, district: cell.d, grade: pj.grade,
      area: pj.saleArea, units: pj.plan.units || Math.round(pj.saleArea / 26),
      price: pj.salePrice, basePrice: pj.plan.salePrice,
      totalValue: Math.round(pj.saleArea * pj.salePrice),
      cost: Math.round(cost * (pj.use === 'mixed' ? 0.45 : 1)),
      soldRatio: 0, revenue: 0, quartersOnSale: 0, completedTurn: g.turn,
      impaired: 0, discount: 0,
    };
    // 事前契約分を即時に売上計上
    const pre = clamp01(pj.preContract);
    if (pre > 0) {
      const rev = Math.round(inv.totalValue * pre);
      const cogs = Math.round(inv.cost * pre);
      g.finance.quarterAcc.revSale += rev;
      g.finance.quarterAcc.cogsSale += cogs;
      g.cash += rev;
      inv.soldRatio = pre; inv.revenue = rev;
      g.kpi.soldUnits += Math.round(inv.units * pre);
    }
    g.inventory.push(inv);
    cell.invId = inv.id;
    news.push({
      icon: '🎉', type: 'dev',
      text: `「${pj.name}」が竣工。全${inv.units}戸のうち${Math.round(pre * 100)}%が引渡済み。引渡売上${Math.round(inv.revenue / 100).toLocaleString()}億円。`,
    });
  }
  // --- 賃貸部分 ---
  if (pj.nra > 0) {
    const share = pj.use === 'mixed' ? 0.55 : 1;
    const asset = {
      id: uid('A'), cellId: cell.id, projectId: pj.id, name: pj.name,
      use: pj.use === 'mixed' ? 'office' : pj.use, district: cell.d, grade: pj.grade,
      nra: pj.nra, rent: pj.rent, marketRent: pj.rent,
      occupancy: pj.use === 'logi' ? 0.86 : 0.42,       // 竣工直後は稼働が低い
      bookLand: Math.round(pj.landCost * share),
      bookBuild: Math.round(pj.spent * share),
      completedTurn: g.turn, age: 0, lastRentReview: g.turn,
      noi: 0, cumNoi: 0,
    };
    g.assets.push(asset);
    cell.assetId = asset.id;
    news.push({
      icon: '🏢', type: 'dev',
      text: `「${pj.name}」が竣工。貸室${asset.nra.toLocaleString()}坪／募集賃料 月坪${asset.rent.toLocaleString()}円でリーシングを開始した。`,
    });
  }
  const i = g.projects.indexOf(pj);
  if (i >= 0) g.projects.splice(i, 1);
  g.completed = g.completed || [];
  g.completed.push({ ...pj, cost, completedTurn: g.turn });
}

/** 着工可否のチェック */
export function canStart(g, cell) {
  if (!cell || cell.owner !== 'player') return '自社が所有していない区画である';
  if (cell.projectId) return 'すでに開発中である';
  if (cell.assetId || cell.invId) return 'すでに建物が建っている';
  const running = g.projects.filter(p => p.status === 'construction').length;
  if (running >= projectCapacity(g)) return `同時進行できる案件数の上限（${projectCapacity(g)}件）に達している`;
  return null;
}
