// ============================================================
//  着工から完売までの金の流れを一件ずつ突き合わせる監査
//    node scripts/check-lifecycle.mjs
//
//  見ているもの
//   ・分譲の坪単価と賃貸の賃料が、計画どおり案件に入っているか
//   ・在庫の総販売額が「分譲面積 × 坪単価」と一致しているか
//   ・在庫原価＋資産簿価が総事業費と一致しているか（二重計上・取りこぼし）
//   ・売上と原価が、売れた割合と同じ歩調で立っているか
//   ・竣工直後の賃料が市場比±10%に収まっているか
//   ・保有資産のNOIが立つか
// ============================================================
import { createGame } from '../src/core/state.js';
import { RNG } from '../src/core/rng.js';
import { DISTRICTS, USES, TERRAIN } from '../src/data/city.js';
import { devPlan, devPlanStack, marketRentRaw } from '../src/sim/valuation.js';
import { startProject, stepProjects } from '../src/sim/project.js';
import { stepInventory, stepAssets } from '../src/sim/sales.js';

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)));
const f = v => (v / 100).toFixed(1);
let bad = 0;
const fail = m => { console.log('   ★ ' + m); bad++; };

const CASES = [];
for (const u of Object.keys(USES)) if (u !== 'mixed') CASES.push({ label: USES[u].name, use: u, stack: null });
CASES.push({ label: '複合：商業3＋オフィス10', use: 'mixed', stack: [{ use: 'retail', floors: 3 }, { use: 'office', floors: 10 }] });
CASES.push({ label: '複合：商業2＋分譲12', use: 'mixed', stack: [{ use: 'retail', floors: 2 }, { use: 'resi', floors: 12 }] });
CASES.push({ label: '複合：商業3＋ホテル8＋分譲10', use: 'mixed', stack: [{ use: 'retail', floors: 3 }, { use: 'hotel', floors: 8 }, { use: 'resi', floors: 10 }] });
CASES.push({ label: '複合：賃貸のみ（オフィス14）', use: 'mixed', stack: [{ use: 'office', floors: 14 }] });
CASES.push({ label: '複合：分譲のみ（分譲16）', use: 'mixed', stack: [{ use: 'resi', floors: 16 }] });

console.log(pad('案件', 30) + pad('計画の販売額', 14) + pad('在庫の販売額', 14) + pad('計画賃料', 10) + pad('資産賃料', 10) + pad('原価配分', 10) + '判定');
for (const cs of CASES) {
  const g = createGame({ companyName: '監査', difficulty: 'normal', seed: 11 });
  const rng = new RNG(7);
  // 適地を選ぶ。
  // **用途に合わない地区で建てないこと。** 以前は先頭の区画を固定で使っており、
  // 地区を足して並び順が変わったとたん、官庁街に物流施設を建てる検算になって
  // 「市場比が竣工直後からずれ」と誤検知していた
  const wantFit = cs.stack ? cs.stack[cs.stack.length - 1].use : cs.use;
  const cells = g.cells.filter(c => c.terrain === TERRAIN.LOT && c.d && !c.building && c.area > 800);
  const cell = cells.find(c => (DISTRICTS[c.d].fit[wantFit] ?? 0) >= 0.7) || cells[0];
  cell.owner = 'player'; cell.vacant = true; cell.lastPaid = 5000; cell.bookValue = 5000;
  g.cash = 2_000_000;

  const plan = cs.stack ? devPlanStack(g, cell, cs.stack, 'standard') : devPlan(g, cell, cs.use, 'standard');
  if (!plan) { fail(`${cs.label}: 計画が作れない`); continue; }
  const pj = startProject(g, cell, cs.use, 'standard', rng, [], null, cs.stack);
  if (!pj) { fail(`${cs.label}: 着工できない`); continue; }

  // 想定どおりの値が入っているか
  const issues = [];
  if (pj.saleArea > 0 && !(pj.salePrice > 0)) issues.push('坪単価0');
  if (pj.nra > 0 && !(pj.rent > 0)) issues.push('賃料0');
  if (typeof pj.saleCostShare !== 'number') issues.push('原価配分なし');

  // 竣工まで回す
  const news = [];
  let guard = 0;
  while (g.projects.length && guard++ < 400) {
    pj.spent = pj.budget * Math.min(1, (pj.elapsed + 1) / pj.weeks);
    stepProjects(g, rng, news);
    g.week++;
  }
  const inv = g.inventory[0] || null;
  const asset = g.assets[0] || null;
  const totalCost = pj.landCost + pj.spent;

  if (pj.saleArea > 0) {
    if (!inv) issues.push('在庫ができない');
    else {
      if (!(inv.totalValue > 0)) issues.push('在庫の販売額0');
      const expect = Math.round(pj.saleArea * pj.salePrice);
      if (Math.abs(inv.totalValue - expect) > Math.max(2, expect * 0.02)) issues.push(`販売額が想定とずれ(${f(inv.totalValue)}≠${f(expect)})`);
      if (!(inv.cost > 0)) issues.push('在庫原価0');
    }
  } else if (inv) issues.push('分譲がないのに在庫ができた');

  if (pj.nra > 0) {
    if (!asset) issues.push('保有資産ができない');
    else {
      if (!(asset.rent > 0)) issues.push('資産の賃料0');
      if (!(asset.marketRent > 0)) issues.push('市場賃料0');
      const gap = asset.rent / Math.max(1, asset.marketRent);
      if (gap < 0.9 || gap > 1.1) issues.push(`市場比が竣工直後からずれ(${((gap - 1) * 100).toFixed(0)}%)`);
    }
  } else if (asset) issues.push('賃貸がないのに資産ができた');

  // 原価の合計が総事業費と一致するか（二重計上・取りこぼしがないか）
  const booked = (inv ? inv.cost : 0) + (asset ? asset.bookLand + asset.bookBuild : 0);
  if (Math.abs(booked - totalCost) > Math.max(2, totalCost * 0.02)) {
    issues.push(`原価の合計が総事業費と不一致(${f(booked)}≠${f(totalCost)})`);
  }

  console.log(pad(cs.label, 30)
    + pad(f(plan.saleRevenue || 0) + '億', 14)
    + pad(inv ? f(inv.totalValue) + '億' : '—', 14)
    + pad(plan.rent ? plan.rent.toLocaleString() : '—', 10)
    + pad(asset ? asset.rent.toLocaleString() : '—', 10)
    + pad(pj.saleCostShare !== undefined ? (pj.saleCostShare * 100).toFixed(0) + '%' : '—', 10)
    + (issues.length ? '★ ' + issues.join('／') : 'ok'));
  if (issues.length) bad += issues.length;

  // 売れた割合に応じて、売上と原価が同じ歩調で立つか
  if (inv) {
    const accBefore = { ...g.finance.quarterAcc };
    const tv0 = inv.totalValue, cost0 = inv.cost, sold0 = inv.soldRatio;   // 竣工時の事前契約ぶんは除く
    for (let k = 0; k < 208; k++) { stepInventory(g, rng, []); g.week++; }   // 4年
    const revTotal = g.finance.quarterAcc.revSale - accBefore.revSale;
    const cogsTotal = g.finance.quarterAcc.cogsSale - accBefore.cogsSale;
    const sold = inv.soldRatio - sold0;
    // 売上／原価が、売れた割合とほぼ同じ比率で立っているか
    const revRatio = revTotal / Math.max(1, tv0), cogsRatio = cogsTotal / Math.max(1, cost0);
    const okRev = Math.abs(revRatio - sold) < 0.06;
    const okCogs = Math.abs(cogsRatio - sold) < 0.06;
    const ng = !okRev || !okCogs || (sold > 0.02 && revTotal <= 0);
    console.log(`      竣工時の事前契約 ${(sold0 * 100).toFixed(0)}% → 4年後に追加で ${(sold * 100).toFixed(0)}%　売上 ${f(revTotal)}億(${(revRatio * 100).toFixed(0)}%)　原価 ${f(cogsTotal)}億(${(cogsRatio * 100).toFixed(0)}%)${ng ? ' ★' : ''}`);
    if (ng) bad++;
  }
  // 保有資産のNOIが立つか
  if (asset) {
    for (let k = 0; k < 160; k++) { stepAssets(g, rng, []); g.week++; }
    if (!(asset.noi > 0)) { fail(`${cs.label}: 3年運用してもNOIが立たない（賃料 ${asset.rent}／稼働 ${(asset.occupancy * 100).toFixed(0)}%）`); }
  }
}
console.log(bad ? `\n★ 問題 ${bad}件` : '\n問題なし');
