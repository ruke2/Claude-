// ============================================================
//  開発プロジェクト — 企画・着工・工事進捗・竣工
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { uid, makeBuilding } from '../core/state.js';
import { devPlan, devPlanStack, subEffect, marketRentRaw, saleFeeRate } from './valuation.js';
import { riskImpact } from './land.js';
import { orgPower, projectCapacity } from './hr.js';
import { WEEKS_PER_QUARTER } from '../core/time.js';
import { BRAND_PREFIX, BRAND_CORE, OFFICE_SUFFIX } from '../data/hrdata.js';
import { brandEffect, growBrand, getBrand } from './brands.js';
import { demandMul } from './population.js';
import { jvEffect, shareOf } from './jv.js';
import { applyRebuild } from './rebuild.js';
import { cultureEffects } from './culture.js';

/** 複合開発（フロアスタック）の事業計画 */
export function feasibilityStack(g, cell, stack, gradeId, brandId) {
  const eff = riskImpact(g, cell, cell.risks || []);
  const plan = devPlanStack(g, cell, stack, gradeId, {
    farPenalty: eff.farMul, landCost: cell.lastPaid || undefined, brandId,
  });
  if (!plan) return null;
  plan.buildCost = Math.round(plan.buildCost * eff.buildMul + eff.extraCost);
  plan.weeks += eff.delay;
  plan.riskExtra = Math.round(eff.extraCost);
  applyProgram(cell, plan);
  applyRebuild(cell, plan);
  applyJV(g, cell, plan, plan.leaseUse || stack[0].use);
  plan.totalCost = plan.landCost + plan.buildCost;
  plan.saleRevenue = Math.round(plan.saleRevenue * eff.priceMul);
  plan.assetValue = Math.round(plan.assetValue * eff.priceMul);
  plan.grossValue = plan.saleRevenue + plan.assetValue;
  plan.profit = plan.grossValue - plan.totalCost - plan.saleRevenue * saleFeeRate(g);
  plan.margin = plan.grossValue > 0 ? plan.profit / plan.grossValue : 0;
  plan.yieldOnCost = plan.noi ? plan.noi / Math.max(1, plan.totalCost) : null;
  return plan;
}

/** 企画段階の事業計画を作る（リスク反映済み） */
/**
 * 共同事業の効きを計画に乗せる。
 * 相手の調達力で建設費が下がり、得意分野なら工期も縮む。
 * 連名のブランドで単価がわずかに上がる。
 *
 * **持分をここで掛けないこと。** 計画は建物まるごと（100%）の姿で持ち、
 * 持分は金が動くところ（出来高払い・竣工時）だけに効かせる
 */
function applyJV(g, cell, plan, useId) {
  if (!cell.jv) return;
  const e = jvEffect(g, cell.jv.rivalId, cell.jv.share, useId);
  plan.buildCost = Math.round(plan.buildCost * (1 - e.costCut));
  plan.weeks = Math.max(14, Math.round(plan.weeks * (1 - e.speedUp)));
  if (plan.salePrice) plan.salePrice = Math.round(plan.salePrice * (1 + e.priceUp) * 1000) / 1000;
  if (plan.saleRevenue) plan.saleRevenue = Math.round(plan.saleRevenue * (1 + e.priceUp));
  if (plan.rent) plan.rent = Math.round(plan.rent * (1 + e.priceUp));
  if (plan.noi) { plan.noi = Math.round(plan.noi * (1 + e.priceUp)); plan.assetValue = Math.round(plan.noi / plan.capRate); }
  plan.jv = { ...cell.jv, effect: e };
}

export function feasibility(g, cell, useId, gradeId, brandId) {
  const eff = riskImpact(g, cell, (cell.risks || []).filter(r => true));
  const plan = devPlan(g, cell, useId, gradeId, {
    farPenalty: eff.farMul, coverMul: 1 / Math.max(0.6, eff.floorMul) * eff.floorMul,
    landCost: cell.lastPaid || undefined, brandId,
  });
  plan.floors = Math.max(1, Math.round(plan.floors * eff.floorMul));
  plan.heightM = Math.round(plan.heightM * eff.floorMul * 10) / 10;
  plan.buildCost = Math.round(plan.buildCost * eff.buildMul + eff.extraCost);
  plan.weeks += eff.delay;
  plan.riskExtra = Math.round(eff.extraCost);
  applyProgram(cell, plan);
  applyRebuild(cell, plan);
  applyJV(g, cell, plan, useId);
  plan.totalCost = plan.landCost + plan.buildCost;
  if (plan.saleRevenue) plan.saleRevenue = Math.round(plan.saleRevenue * eff.priceMul);
  if (plan.assetValue) plan.assetValue = Math.round(plan.assetValue * eff.priceMul);
  plan.grossValue = (plan.saleRevenue || 0) + (plan.assetValue || 0);
  plan.profit = plan.grossValue - plan.totalCost - (plan.saleRevenue || 0) * saleFeeRate(g);
  plan.margin = plan.grossValue > 0 ? plan.profit / plan.grossValue : 0;
  plan.yieldOnCost = plan.noi ? plan.noi / Math.max(1, plan.totalCost) : null;
  return plan;
}

/**
 * 公共案件の条件を事業費に織り込む。
 * 広場・図書館・保育所といった公共貢献施設は収益を生まないが、
 * 作らなければ事業者に選ばれない。
 */
function applyProgram(cell, plan) {
  const pg = cell && cell.program;
  if (!pg || !pg.benefit) return;
  const extra = Math.round(plan.buildCost * pg.benefit);
  plan.buildCost += extra;
  plan.programCost = extra;
  plan.program = pg;
  plan.weeks += 4;                       // 協議と手続きのぶん工期が伸びる
}

/** ブランドを冠した物件名 */
function brandedName(rng, brand, use, districtId) {
  const d = DISTRICTS[districtId];
  if (use === 'office' || use === 'mixed') return `${brand.name}${d.short}`;
  if (use === 'logi') return `${brand.name}${d.short}`;
  if (use === 'hotel') return `${brand.name} ${d.short}`;
  if (use === 'retail') return `${brand.name}${d.short}`;
  return `${brand.name}${d.short}${rng.pick(['', '', 'ザ・タワー', 'イースト', 'ウエスト', 'テラス'])}`;
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
export function startProject(g, cell, useId, gradeId, rng, news, brandId = null, stack = null) {
  const plan = stack ? feasibilityStack(g, cell, stack, gradeId, brandId) : feasibility(g, cell, useId, gradeId, brandId);
  if (!plan) return null;
  const bd = getBrand(g, brandId);
  const pj = {
    id: uid('P'), cellId: cell.id, district: cell.d,
    name: bd ? brandedName(rng, bd, useId, cell.d) : projectName(rng, useId, cell.d, gradeId),
    use: useId, grade: gradeId, brandId, stack: plan.stack || null,
    gfa: plan.gfa, floors: plan.floors, heightM: plan.heightM,
    sellable: plan.sellable, saleArea: plan.saleArea || 0, nra: plan.nra || 0,
    budget: plan.buildCost, spent: 0, overrun: 0,
    landCost: plan.landCost,
    weeks: plan.weeks, elapsed: 0, progress: 0, delay: 0,
    status: 'construction', startWeek: g.week, seed: rng.int(0, 99999),
    plan, salePrice: plan.salePrice || 0, rent: plan.rent || 0,
    // 竣工時に総事業費を分譲／賃貸へ割り振る比率と、賃貸部分の主用途
    saleCostShare: typeof plan.saleCostShare === 'number' ? plan.saleCostShare : (plan.saleArea > 0 ? 1 : 0),
    leaseUse: plan.leaseUse || null,
    preContract: 0, marketing: false, events: [],
    // 共同事業。区画に貼ってあれば案件に引き継ぐ。
    // **pj の数字は建物まるごと（100%）のままにしておくこと。**
    // 持分を掛けるのは金が動くところ（出来高払い・竣工時の在庫と資産）だけである
    jv: cell.jv ? { ...cell.jv } : null,
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
  { id: 'weather', p: 0.07, icon: '🌧', bad: true, text: '記録的な長雨で外構工事が止まった。工期が3週延びる。', apply: pj => { pj.delay += 3; } },
  { id: 'overrun', p: 0.10, icon: '💸', bad: true, text: '資材価格の再見積りで請負金額の増額を求められた。', apply: (pj, g, rng) => { const up = pj.budget * rng.range(0.03, 0.09); pj.budget += up; pj.overrun += up; } },
  { id: 'accident', p: 0.035, icon: '⚠', bad: true, text: '現場で労災事故が発生。安全対策のため工事を4週間中断した。', apply: pj => { pj.delay += 4; pj.safety = true; } },
  { id: 'labor', p: 0.055, icon: '👷', bad: true, text: '型枠工の確保が難航し、躯体工事が2週遅れている。', apply: pj => { pj.delay += 2; } },
  { id: 'vecut', p: 0.075, icon: '✂', bad: false, text: 'VE提案により仕様を見直し、工事費を圧縮できた。', apply: (pj, g, rng) => { const cut = pj.budget * rng.range(0.02, 0.055); pj.budget -= cut; pj.overrun -= cut; } },
  { id: 'fast', p: 0.060, icon: '⚡', bad: false, text: '施工が計画を上回るペースで進み、工程を3週短縮できた。', apply: pj => { pj.delay = Math.max(-Math.round(pj.weeks * 0.12), pj.delay - 3); } },
  { id: 'media', p: 0.050, icon: '📣', bad: false, text: '建築専門誌に計画が大きく取り上げられ、引き合いが増えた。', apply: (pj, g) => { pj.hype = (pj.hype || 0) + 0.12; g.company.brand += 0.4; } },
];

/** 毎週の工事進捗 */
export function stepProjects(g, rng, news) {
  const p = orgPower(g);
  const done = [];
  const ce = cultureEffects(g);
  for (const pj of g.projects) {
    if (pj.status !== 'construction') continue;
    pj.elapsed += 1;
    const total = Math.max(4, pj.weeks + pj.delay);
    pj.progress = clamp01(pj.elapsed / total);

    // 出来高払い。共同事業なら自社の持分ぶんだけ払う
    const pay = Math.round(pj.budget / total);
    const myPay = Math.round(pay * shareOf(pj));
    pj.spent += pay;                 // 案件の出来高は100%で持つ
    g.cash -= myPay;
    g.finance.quarterAcc.buildSpend += myPay;

    // 工事イベント
    for (const ev of BUILD_EVENTS) {
      let pr = ev.p * ce.eventSwing;
      if (ev.bad) pr *= clamp(1.35 - p.cons.quality / 110, 0.45, 1.6) * ce.costRisk;
      else pr *= clamp(0.55 + p.cons.quality / 110, 0.5, 1.6);
      if (g.subsidiaries.some(s => s.type === 'construction')) pr *= ev.bad ? 0.78 : 1.18;
      if (rng.chance(pr / Math.max(1, total * 0.55 / WEEKS_PER_QUARTER))) {
        ev.apply(pj, g, rng);
        pj.events.push({ ...ev, week: g.week });
        news.push({ icon: ev.icon, type: 'dev', text: `【${pj.name}】${ev.text}` });
      }
    }

    // 分譲の事前契約（青田売り）
    if (pj.saleArea > 0 && pj.progress > 0.25) {
      const speed = contractSpeed(g, pj.use, pj.salePrice, pj.plan.salePrice, p, pj.district, pj.brandId) * (1 + (pj.hype || 0));
      pj.preContract = clamp01(pj.preContract + speed * 0.62);
    }

    if (pj.elapsed >= total) { pj.status = 'done'; pj.progress = 1; done.push(pj); }
  }
  for (const pj of done) completeProject(g, pj, rng, news);
}

/** 分譲の1週あたり契約進捗率 */
export function contractSpeed(g, use, price, marketPrice, p, districtId, brandId) {
  const gapRaw = marketPrice > 0 ? (price / marketPrice) : 1;
  const gap = clamp(2.15 - gapRaw * 1.15, 0.12, 1.85);        // 価格が安いほど速い
  // 人が増えている地区は売れ足が速い
  const dem = (g.market.demand[use] ?? 1) * demandMul(g, districtId, use);
  const sales = 0.55 + (p.sales.quality / 100) * 0.55 + p.sales.capacity / 130;
  const brand = 0.82 + g.company.brand / 260;
  // 販売子会社・販売仲介会社の寄与。
  // 以前は「持っているかどうか」だけを見ていたため、
  // 効果表に書いてある saleSpeed / salesPower がまったく効いていなかった
  const sub = 1 + subEffect(g, 'saleSpeed') + subEffect(g, 'salesPower') / 100;
  const bf = brandEffect(g, brandId).speed;
  return clamp(0.15 * gap * dem * sales * brand * sub * bf / WEEKS_PER_QUARTER, 0.0012, 0.055);
}

// ------------------------------------------------------------
//  竣工時の値の引き直し
//    旧版の複合開発は salePrice / rent / saleCostShare を持っていない。
//    そのまま竣工させると「売上0・原価満額」の在庫と「賃料0」の資産ができる。
// ------------------------------------------------------------

/** 総事業費のうち分譲在庫が負担する割合 */
export function saleCostShareOf(pj) {
  if (typeof pj.saleCostShare === 'number') return clamp01(pj.saleCostShare);
  if (pj.plan && typeof pj.plan.saleCostShare === 'number') return clamp01(pj.plan.saleCostShare);
  // 積層があれば、実際のセグメント建設費で分ける
  const segs = Array.isArray(pj.stack) ? pj.stack : null;
  if (segs && segs.length) {
    const isSale = x => (x.model ? x.model === 'sale' : (USES[x.use] || {}).model === 'sale');
    const all = segs.reduce((a, x) => a + (x.build || x.area || 0), 0);
    if (all > 0) {
      const sale = segs.filter(isSale).reduce((a, x) => a + (x.build || x.area || 0), 0);
      return clamp01(sale / all);
    }
  }
  if (pj.nra > 0 && pj.saleArea > 0) return clamp01(pj.saleArea / (pj.saleArea + pj.nra));
  return pj.saleArea > 0 ? 1 : 0;
}

/** 面積加重の平均を取るための小さな補助 */
function weighted(list, valueKey, areaKey) {
  const items = (list || []).filter(x => x && x[valueKey] > 0 && x[areaKey] > 0);
  const area = items.reduce((a, x) => a + x[areaKey], 0);
  return area > 0 ? items.reduce((a, x) => a + x[valueKey] * x[areaKey], 0) / area : 0;
}

/** 分譲の坪単価（百万円/坪） */
export function salePriceOf(pj) {
  if (pj.salePrice > 0) return pj.salePrice;
  const pl = pj.plan || {};
  if (pl.salePrice > 0) return pl.salePrice;
  if (pl.saleRevenue > 0 && pl.saleArea > 0) return Math.round(pl.saleRevenue / pl.saleArea * 1000) / 1000;
  const w = weighted((pj.stack || []).filter(x => x.model === 'sale'), 'price', 'usable');
  return w > 0 ? Math.round(w * 1000) / 1000 : 0;
}

/** 賃貸の募集賃料（円/坪·月） */
export function rentOf(pj) {
  if (pj.rent > 0) return pj.rent;
  const pl = pj.plan || {};
  if (pl.rent > 0) return pl.rent;
  if (pl.grossRent > 0 && pl.nra > 0) return Math.round(pl.grossRent * 1e6 / (pl.nra * 12));
  const w = weighted((pj.stack || []).filter(x => x.model === 'lease'), 'rent', 'usable');
  return w > 0 ? Math.round(w) : 0;
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
  if (pj.stack) cell.building.stack = pj.stack.map(x => ({ use: x.use, floors: x.floors, from: x.from, to: x.to }));
  g.kpi.builtCount++;
  g.company.brand = clamp(g.company.brand + GRADES[pj.grade].brandGain * (pj.gfa > 12000 ? 1.6 : 1), 0, 100);
  const ceq = cultureEffects(g);
  if (pj.brandId) growBrand(g, pj.brandId, {
    area: pj.gfa, units: pj.plan.units || 0, supplied: true,
    base: 4.2 * ceq.qualityMul, reputation: 1.5 * ceq.qualityMul,
  });

  const cost = pj.landCost + pj.spent;
  const my = shareOf(pj);                 // 自社の持分（共同事業でなければ 1.00）
  // 総事業費を分譲と賃貸に割り振る比率。複合開発は実際のセグメント建設費で分ける
  const saleShare = saleCostShareOf(pj);
  // --- 分譲部分 ---
  if (pj.saleArea > 0) {
    // 坪単価が抜けている案件（旧版の複合開発）は、計画値から引き直す。
    // 0のまま在庫にすると「売上0・原価満額」になり、竣工のたびに巨額の赤字が出る
    const price = salePriceOf(pj);
    const basePrice = pj.plan && pj.plan.salePrice > 0 ? pj.plan.salePrice : price;
    const inv = {
      id: uid('I'), cellId: cell.id, projectId: pj.id, name: pj.name,
      use: pj.use, district: cell.d, grade: pj.grade, brandId: pj.brandId,
      // 共同事業は自社の持分ぶんだけを在庫に載せる。
      // **売上と原価の両方に同じ持分を掛けること。** 片方だけだと利益が歪む
      area: Math.round(pj.saleArea * my), units: Math.max(1, Math.round((pj.plan.units || Math.round(pj.saleArea / 26)) * my)),
      price, basePrice,
      totalValue: Math.round(pj.saleArea * my * price),
      cost: Math.round(cost * saleShare * my),
      jv: pj.jv ? { ...pj.jv } : null,
      soldRatio: 0, revenue: 0, weeksOnSale: 0, completedWeek: g.week,
      impaired: 0, discount: 0,
      gfa: pj.gfa, floors: pj.floors,        // 表彰の審査に使う
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
    const share = 1 - saleShare;
    // 複合開発は賃貸部分の主用途を資産の用途にする（従来は一律オフィス扱いだった）
    const use = pj.use === 'mixed' ? (pj.leaseUse || (pj.plan && pj.plan.leaseUse) || 'office') : pj.use;
    const asset = {
      id: uid('A'), cellId: cell.id, projectId: pj.id, name: pj.name,
      use, district: cell.d, grade: pj.grade, brandId: pj.brandId,
      nra: Math.round(pj.nra * my), rent: 0, marketRent: 0,
      occupancy: use === 'logi' ? 0.86 : 0.42,          // 竣工直後は稼働が低い
      bookLand: Math.round(pj.landCost * share * my),
      bookBuild: Math.round(pj.spent * share * my),
      jv: pj.jv ? { ...pj.jv } : null,
      completedWeek: g.week, age: 0, lastRentReview: g.week,
      noi: 0, cumNoi: 0,
      gfa: pj.gfa, floors: pj.floors,        // 表彰の審査に使う
      seismic: 1.0,                          // 耐震性能（1.0 = 現行基準）
      damage: 0,                             // 災害で受けた損傷の累計
    };
    // 募集賃料を決める。抜けている案件は相場から引き直す
    const raw = Math.max(1, marketRentRaw(g, asset));
    const ask = rentOf(pj) || raw;
    asset.rent = Math.round(ask);
    asset.rentIndex = clamp(asset.rent / raw, 0.4, 3.5);   // 相場に対する自社物件の位置
    asset.marketRent = Math.round(raw * asset.rentIndex);
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
  g.completed.push({ ...pj, cost, completedWeek: g.week });
}

/** 着工可否のチェック */
export function canStart(g, cell, useId, gradeId) {
  if (!cell || cell.owner !== 'player') return '自社が所有していない区画である';
  if (cell.projectId) return 'すでに開発中である';
  if (cell.assetId || cell.invId) return 'すでに建物が建っている';
  const running = g.projects.filter(p => p.status === 'construction').length;
  if (running >= projectCapacity(g)) return `同時進行できる案件数の上限（${projectCapacity(g)}件）に達している`;
  // 公共案件は提案どおりに作る義務がある
  const pg = cell.program;
  if (pg) {
    if (useId && useId !== pg.use) {
      return `この用地は「${pg.name}」の公募条件により、${USES[pg.use].name}として整備する義務がある`;
    }
    if (gradeId && pg.minGrade) {
      const order = ['standard', 'high', 'luxury'];
      if (order.indexOf(gradeId) < order.indexOf(pg.minGrade)) {
        return `公募条件により、${GRADES[pg.minGrade].name}以上の仕様が求められている`;
      }
    }
  }
  return null;
}
