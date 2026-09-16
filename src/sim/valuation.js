// ============================================================
//  不動産の評価ロジック — 用地査定・事業収支・資産価値
//  すべての金額は百万円、面積は坪
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { orgPower } from './hr.js';

/** 用途別の建築面積率（敷地に対する各階の床の割合） */
export const COVER = { office: .38, resi: .28, rental: .30, retail: .68, hotel: .36, logi: .76, house: .46, mixed: .40 };
/** 用途別のキャップレート・スプレッド（リスクプレミアム） */
export const CAP_SPREAD = { office: 0, retail: 0.0065, hotel: 0.0105, logi: 0.0018, rental: 0.0, resi: 0, mixed: 0.0025, house: 0.004 };
/** 用途別の階高(m) */
export const FLOOR_H = { office: 4.1, resi: 3.25, rental: 3.15, retail: 5.4, hotel: 3.4, logi: 7.2, house: 3.0, mixed: 3.9 };

/** 区画の更地としての査定額 */
export function landAppraisal(g, c) {
  if (!c.baseValue) return 0;
  const d = DISTRICTS[c.d];
  const best = bestUseFit(c);
  const demand = g.market.demand[best] ?? 1;
  return Math.round(c.baseValue * g.market.priceIdx * (0.82 + demand * 0.24) * (0.94 + d.station * 0.1));
}

/** その区画で最も適した用途 */
export function bestUseFit(c) {
  const d = DISTRICTS[c.d];
  let best = 'office', bv = -1;
  for (const u in d.fit) { if (d.fit[u] > bv) { bv = d.fit[u]; best = u; } }
  return best;
}

/** 区画＋用途＋グレードから事業収支を組む */
export function devPlan(g, c, useId, gradeId = 'standard', opt = {}) {
  const d = DISTRICTS[c.d];
  const U = USES[useId];
  const G = GRADES[gradeId];
  const p = orgPower(g);
  const fit = d.fit[useId] ?? 0.4;

  // --- 規模 ---
  const mixedBonus = useId === 'mixed' ? 1.18 : 1;   // 総合設計制度による容積割増
  const farUse = clamp01(0.80 + fit * 0.18 + p.plan.quality / 900) * (opt.farPenalty ?? 1) * mixedBonus;
  const gfa = Math.round(c.area * (c.far / 100) * farUse);
  const cover = COVER[useId] * (opt.coverMul ?? 1);
  const floors = Math.max(1, Math.round(gfa / Math.max(1, c.area * cover)));
  const heightM = Math.round(floors * FLOOR_H[useId] * 10) / 10;
  const sellable = Math.round(gfa * U.efficiency);

  // --- 建設費 ---
  const highRise = 1 + Math.max(0, floors - 28) * 0.0045;
  const costCut = 1 - subEffect(g, 'costCut') - clamp((p.cons.quality - 55) / 100 * 0.10, -0.05, 0.10);
  const build = gfa * U.build * g.market.costIdx * G.costMul * highRise * costCut;
  const softCost = build * 0.085;                      // 設計・監理・広告宣伝ほか
  const buildCost = Math.round(build + softCost);

  // --- 工期 ---
  const sizePenalty = Math.floor(floors / 14) + (gfa > 20000 ? 1 : 0);
  const speedUp = subEffect(g, 'speed') + clamp((p.cons.quality - 55) / 260, -0.05, 0.16);
  const quarters = Math.max(2, Math.round((U.quarters + sizePenalty) * (1 - speedUp)));

  // --- 収入 ---
  const brandMul = 1 + (g.company.brand - 40) / 420;
  const fitMul = 0.74 + fit * 0.28;                  // 立地に合わない用途は収益が落ちる
  const out = { gfa, floors, heightM, sellable, buildCost, quarters, fit, use: useId, grade: gradeId, farUse };

  const saleShare = useId === 'mixed' ? 0.45 : (U.model === 'sale' ? 1 : 0);
  const leaseShare = 1 - saleShare;

  if (saleShare > 0) {
    const unitPrice = d.priceResi * G.priceMul * g.market.priceIdx
      * (0.88 + (g.market.demand[useId] ?? 1) * 0.16) * (0.9 + c.station * 0.2) * brandMul
      * (useId === 'house' ? 0.95 : 1) * fitMul;
    out.salePrice = Math.round(unitPrice * 1000) / 1000;     // 百万円/専有坪
    out.saleArea = Math.round(sellable * saleShare);
    out.saleRevenue = Math.round(out.saleArea * unitPrice);
    out.units = Math.max(1, Math.round(out.saleArea / (useId === 'house' ? 34 : 26)));
  }
  if (leaseShare > 0) {
    const rentKey = { office: 'rentOffice', retail: 'rentRetail', hotel: 'rentHotel', logi: 'rentLogi', rental: 'rentResi', resi: 'rentResi', mixed: 'rentOffice', house: 'rentResi' }[useId];
    const baseRent = d[rentKey] ?? d.rentOffice * 0.6;
    const rent = baseRent * G.priceMul * (0.86 + (g.market.demand[useId] ?? 1) * 0.2) * (0.92 + c.station * 0.16) * brandMul * fitMul;
    out.rent = Math.round(rent);                             // 円/坪/月
    out.nra = Math.round(sellable * leaseShare);
    out.grossRent = Math.round(out.nra * rent * 12 / 1e6);    // 百万円/年
    out.noi = Math.round(out.grossRent * 0.73 * 0.95);   // 標準稼働率95%前提
    out.capRate = clamp(d.capRate + (CAP_SPREAD[useId] ?? 0) + g.market.capShift + (fit < 0.5 ? 0.006 : 0) - subEffect(g, 'exitPremium') * 0.05, 0.024, 0.09);
    out.assetValue = Math.round(out.noi / out.capRate);
  }

  out.landCost = opt.landCost ?? landAppraisal(g, c);
  out.totalCost = out.landCost + out.buildCost;
  out.grossValue = (out.saleRevenue || 0) + (out.assetValue || 0);
  out.profit = out.grossValue - out.totalCost - (out.saleRevenue || 0) * 0.04;
  out.margin = out.grossValue > 0 ? out.profit / out.grossValue : 0;
  out.yieldOnCost = out.noi ? out.noi / Math.max(1, out.totalCost) : null;
  // 土地に払える上限（残余法：目標利益率15%を確保する前提）
  out.residualLand = Math.round(out.grossValue * 0.85 - out.buildCost - (out.saleRevenue || 0) * 0.04);
  return out;
}

/** 子会社・買収による効果を合算 */
export function subEffect(g, key) {
  let v = 0;
  for (const s of g.subsidiaries) if (s.effect && s.effect[key]) v += s.effect[key] * (s.health ?? 1);
  for (const a of g.acquisitions) if (!a.failed && a.effect && a.effect[key]) v += a.effect[key] * (a.integration ?? 1);
  return v;
}

/** 保有資産の時価 */
export function assetValue(g, a) {
  const d = DISTRICTS[a.district];
  const cap = clamp(d.capRate + (CAP_SPREAD[a.use] ?? 0) + g.market.capShift + (a.age > 30 ? 0.004 : 0), 0.024, 0.09);
  const noi = currentNOI(g, a);
  return Math.round(noi / cap);
}

/** 保有資産の現在NOI（年額） */
export function currentNOI(g, a) {
  const dem = g.market.demand[a.use] ?? 1;
  const gross = a.nra * a.rent * 12 / 1e6 * a.occupancy;
  const opex = 0.27 - subEffect(g, 'feeRate') * 2;
  return Math.round(gross * (1 - clamp(opex, 0.18, 0.32)) * (a.use === 'hotel' ? (0.7 + dem * 0.35) : 1));
}
