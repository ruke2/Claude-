// ============================================================
//  不動産の評価ロジック — 用地査定・事業収支・資産価値
//  すべての金額は百万円、面積は坪
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { orgPower } from './hr.js';
import { brandEffect } from './brands.js';
import { cultureEffects } from './culture.js';
import { homeMul } from './company.js';

/** 用途別の建築面積率（敷地に対する各階の床の割合） */
export const COVER = { office: .38, resi: .28, rental: .30, retail: .68, hotel: .36, logi: .76, house: .46, mixed: .40 };
/** 用途別のキャップレート・スプレッド（リスクプレミアム） */
export const CAP_SPREAD = { office: 0, retail: 0.0065, hotel: 0.0105, logi: 0.0018, rental: 0.0, resi: 0, mixed: 0.0025, house: 0.004 };
/**
 * 地区適合から収益倍率を出す。
 * 幅を広く取ることで「地区ごとに本命の用途が1つ決まる」設計が成立する。
 * 適合1.00 → 1.06倍、0.80 → 0.90倍、0.50 → 0.66倍、0.10 → 0.34倍。
 */
export const FIT_MUL = fit => 0.26 + fit * 0.80;

/**
 * 分譲の販売手数料率。
 * 販売子会社（saleSpeed / feeCut）を持つと外部への手数料流出が止まる。
 */
export const SALE_FEE = 0.04;
export function saleFeeRate(g) {
  return clamp(SALE_FEE - subEffect(g, 'feeCut'), 0.012, SALE_FEE);
}

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

  // --- 工期（週） ---
  const sizePenalty = Math.floor(floors / 14) * 6 + (gfa > 20000 ? 8 : 0);
  const ce = cultureEffects(g);
  const speedUp = subEffect(g, 'speed') + clamp((p.cons.quality - 55) / 260, -0.05, 0.16);
  const weeks = Math.max(16, Math.round((U.weeks + sizePenalty) * (1 - speedUp) / ce.speedMul));

  // --- 収入 ---
  const brandMul = (1 + (g.company.brand - 40) / 420) * homeMul(g, c.d);   // 地盤では地元の信用が単価に乗る
  // 立地に合わない用途は収益が大きく落ちる。
  // 以前は 0.74〜1.02 の幅しかなく、適合0.3の用途でも相場の8割が取れてしまい、
  // 素の賃料がいちばん高い用途（ホテル）がどの地区でも勝っていた
  const fitMul = FIT_MUL(fit);
  const bf = brandEffect(g, opt.brandId);            // 自社ブランドによる上乗せ
  const out = { gfa, floors, heightM, sellable, buildCost, weeks, fit, use: useId, grade: gradeId, farUse };

  const saleShare = useId === 'mixed' ? 0.45 : (U.model === 'sale' ? 1 : 0);
  const leaseShare = 1 - saleShare;
  // 竣工時に総事業費を分譲在庫と保有資産に割り振る比率。
  // これを持たせないと、複合開発で原価の配分が実態とずれる
  out.saleCostShare = saleShare;
  out.leaseUse = leaseShare > 0 ? (useId === 'mixed' ? 'office' : useId) : null;

  if (saleShare > 0) {
    const unitPrice = d.priceResi * G.priceMul * g.market.priceIdx
      * (0.88 + (g.market.demand[useId] ?? 1) * 0.16) * (0.9 + c.station * 0.2) * brandMul
      * (useId === 'house' ? 0.95 : 1) * fitMul * bf.price;
    out.salePrice = Math.round(unitPrice * 1000) / 1000;     // 百万円/専有坪
    out.saleArea = Math.round(sellable * saleShare);
    out.saleRevenue = Math.round(out.saleArea * unitPrice);
    out.units = Math.max(1, Math.round(out.saleArea / (useId === 'house' ? 34 : 26)));
  }
  if (leaseShare > 0) {
    const rentKey = { office: 'rentOffice', retail: 'rentRetail', hotel: 'rentHotel', logi: 'rentLogi', rental: 'rentResi', resi: 'rentResi', mixed: 'rentOffice', house: 'rentResi' }[useId];
    const baseRent = d[rentKey] ?? d.rentOffice * 0.6;
    const rent = baseRent * G.priceMul * (0.86 + (g.market.demand[useId] ?? 1) * 0.2) * (0.92 + c.station * 0.16) * brandMul * fitMul * bf.rent;
    out.rent = Math.round(rent);                             // 円/坪/月
    out.nra = Math.round(sellable * leaseShare);
    out.grossRent = Math.round(out.nra * rent * 12 / 1e6);    // 百万円/年
    out.noi = Math.round(out.grossRent * 0.76 * 0.95);   // 標準稼働率95%前提
    out.capRate = clamp(d.capRate + (CAP_SPREAD[useId] ?? 0) + g.market.capShift + (fit < 0.5 ? 0.006 : 0) - subEffect(g, 'exitPremium') * 0.05, 0.024, 0.09);
    out.assetValue = Math.round(out.noi / out.capRate);
  }

  out.brandId = opt.brandId || null;
  out.landCost = opt.landCost ?? landAppraisal(g, c);
  out.totalCost = out.landCost + out.buildCost;
  out.grossValue = (out.saleRevenue || 0) + (out.assetValue || 0);
  const fee = saleFeeRate(g);
  out.profit = out.grossValue - out.totalCost - (out.saleRevenue || 0) * fee;
  out.margin = out.grossValue > 0 ? out.profit / out.grossValue : 0;
  out.yieldOnCost = out.noi ? out.noi / Math.max(1, out.totalCost) : null;
  // 土地に払える上限（残余法：目標利益率15%を確保する前提）
  out.residualLand = Math.round(out.grossValue * 0.85 - out.buildCost - (out.saleRevenue || 0) * fee);
  return out;
}

// ------------------------------------------------------------
//  フロアスタック（複合開発）
// ------------------------------------------------------------
/** 用途ごとの適正な階層帯 */
export const STACK_RULE = {
  retail: { label: '低層', best: [1, 6], desc: '商業は歩行者が上がってこられる低層階でこそ力を発揮する。' },
  office: { label: '低〜中層', best: [1, 44], desc: 'オフィスは階層をあまり選ばない。基準階が広いほど効率がよい。' },
  hotel: { label: '中〜高層', best: [5, 60], desc: 'ホテルは眺望と静粛性が価値になるため、低層階では単価が落ちる。' },
  resi: { label: '高層', best: [7, 70], desc: '分譲住宅は上層階ほど高く売れる。低層階は価格が伸びない。' },
  rental: { label: '中〜高層', best: [5, 70], desc: '賃貸住宅も上層階のほうが賃料が取れる。' },
  logi: { label: '低層', best: [1, 5], desc: '物流は荷捌きの都合で低層に限られ、複合には向かない。' },
  house: { label: '不可', best: [1, 2], desc: '戸建は複合建物には組み込めない。' },
  mixed: { label: '—', best: [1, 70], desc: '' },
};

/** セグメントの階層による収益補正 */
export function stackFloorMul(use, from, to, total) {
  const R = STACK_RULE[use] || STACK_RULE.office;
  const mid = (from + to) / 2;
  let m = 1;
  if (use === 'retail') m = from <= 3 ? 1.00 : from <= 6 ? 0.88 : 0.50;
  else if (use === 'hotel') m = from >= 5 ? 0.97 + Math.min(0.08, (mid / Math.max(1, total)) * 0.10) : 0.82;
  else if (use === 'resi' || use === 'rental') {
    const h = mid / Math.max(1, total);
    m = 0.82 + h * 0.32;
    if (from <= 3) m *= 0.9;
  } else if (use === 'office') m = 0.95 + Math.min(0.06, (mid / Math.max(1, total)) * 0.08);
  else if (use === 'logi') m = from <= 3 ? 0.9 : 0.5;
  else if (use === 'house') m = 0.45;
  return m;
}

/** 複合開発の事業収支を組む
 *  stack: [{ use, floors }] を下から順に積む
 */
export function devPlanStack(g, c, stack, gradeId = 'standard', opt = {}) {
  const d = DISTRICTS[c.d];
  const G = GRADES[gradeId];
  const p = orgPower(g);
  const bf = brandEffect(g, opt.brandId);
  const clean = (stack || []).filter(x => x && x.floors > 0);
  if (!clean.length) return null;

  // 建築面積は用途構成の加重平均
  const totalFloors = clean.reduce((a, x) => a + x.floors, 0);
  const cover = clean.reduce((a, x) => a + COVER[x.use] * x.floors, 0) / totalFloors;
  const plate = c.area * cover * (opt.coverMul ?? 1);      // 基準階の床面積（坪）

  const fitAvg = clean.reduce((a, x) => a + (d.fit[x.use] ?? 0.3) * x.floors, 0) / totalFloors;
  const mixedBonus = 1.18;                                  // 総合設計制度の容積割増
  const farUse = clamp01(0.80 + fitAvg * 0.18 + p.plan.quality / 900) * (opt.farPenalty ?? 1) * mixedBonus;
  const maxGfa = c.area * (c.far / 100) * farUse;
  const gfa = plate * totalFloors;

  const heightM = clean.reduce((a, x) => a + FLOOR_H[x.use] * x.floors, 0);
  const brandMul = (1 + (g.company.brand - 40) / 420) * homeMul(g, c.d);

  const segs = [];
  let cursor = 1, saleRevenue = 0, saleArea = 0, units = 0, noi = 0, nra = 0, grossRent = 0, build = 0;

  for (const seg of clean) {
    const from = cursor, to = cursor + seg.floors - 1;
    cursor = to + 1;
    const U = USES[seg.use];
    const area = plate * seg.floors;
    const fit = d.fit[seg.use] ?? 0.3;
    const fitMul = FIT_MUL(fit);
    const fmul = stackFloorMul(seg.use, from, to, totalFloors);
    const usable = area * U.efficiency;

    // 建設費（複合は構造が複雑になるため割増）
    const highRise = 1 + Math.max(0, to - 28) * 0.0045;
    const costCut = 1 - subEffect(g, 'costCut') - clamp((p.cons.quality - 55) / 100 * 0.10, -0.05, 0.10);
    const segBuild = area * U.build * 1.08 * g.market.costIdx * G.costMul * highRise * costCut;
    build += segBuild;

    const rec = { ...seg, from, to, area: Math.round(area), usable: Math.round(usable), floorMul: fmul, build: Math.round(segBuild * 1.085) };

    if (U.model === 'sale') {
      const unitPrice = d.priceResi * G.priceMul * g.market.priceIdx
        * (0.88 + (g.market.demand[seg.use] ?? 1) * 0.16) * (0.9 + c.station * 0.2)
        * brandMul * fitMul * fmul * bf.price * (seg.use === 'house' ? 0.95 : 1);
      rec.model = 'sale';
      rec.price = Math.round(unitPrice * 1000) / 1000;
      rec.revenue = Math.round(usable * unitPrice);
      rec.units = Math.max(1, Math.round(usable / 26));
      saleRevenue += rec.revenue; saleArea += usable; units += rec.units;
    } else {
      const rentKey = { office: 'rentOffice', retail: 'rentRetail', hotel: 'rentHotel', logi: 'rentLogi', rental: 'rentResi', resi: 'rentResi' }[seg.use] || 'rentOffice';
      const baseRent = d[rentKey] ?? d.rentOffice * 0.6;
      const rent = baseRent * G.priceMul * (0.86 + (g.market.demand[seg.use] ?? 1) * 0.2)
        * (0.92 + c.station * 0.16) * brandMul * fitMul * fmul * bf.rent;
      rec.model = 'lease';
      rec.rent = Math.round(rent);
      rec.grossRent = Math.round(usable * rent * 12 / 1e6);
      rec.noi = Math.round(rec.grossRent * 0.76 * 0.95);
      nra += usable; grossRent += rec.grossRent; noi += rec.noi;
    }
    segs.push(rec);
  }

  const softCost = build * 0.085;
  const buildCost = Math.round(build + softCost);
  const sizePenalty = Math.floor(totalFloors / 14) * 6 + (gfa > 20000 ? 8 : 0) + 12;
  const ceS = cultureEffects(g);
  const speedUp = subEffect(g, 'speed') + clamp((p.cons.quality - 55) / 260, -0.05, 0.16);
  const weeks = Math.max(26, Math.round((USES.mixed.weeks + sizePenalty) * (1 - speedUp) / ceS.speedMul));

  const capRate = clamp(d.capRate + 0.0025 + g.market.capShift - subEffect(g, 'exitPremium') * 0.05, 0.024, 0.09);
  const assetValue = noi > 0 ? Math.round(noi / capRate) : 0;

  // 案件全体の代表値。セグメントごとの値の面積加重平均を取る。
  // これを返さないと startProject で salePrice/rent が 0 になり、
  // 竣工時に「売上0・原価満額」の在庫と「賃料0」の保有資産ができてしまう
  const saleSegs = segs.filter(x => x.model === 'sale');
  const leaseSegs = segs.filter(x => x.model === 'lease');
  const salePrice = saleArea > 0 ? Math.round(saleRevenue / saleArea * 1000) / 1000 : 0;
  const rent = nra > 0
    ? Math.round(leaseSegs.reduce((a, x) => a + x.rent * x.usable, 0) / nra)
    : 0;
  // 原価は実際のセグメント建設費で分ける（固定45%ではない）
  const saleBuild = saleSegs.reduce((a, x) => a + x.build, 0);
  const leaseBuild = leaseSegs.reduce((a, x) => a + x.build, 0);
  const saleCostShare = saleBuild + leaseBuild > 0 ? saleBuild / (saleBuild + leaseBuild) : (saleArea > 0 ? 1 : 0);
  // 賃貸部分の主用途（面積がいちばん大きいもの）。保有資産の賃料相場の基準になる
  const mainLease = leaseSegs.slice().sort((a, b) => b.usable - a.usable)[0];

  const out = {
    stack: segs, gfa: Math.round(gfa), maxGfa: Math.round(maxGfa), plate: Math.round(plate),
    floors: totalFloors, heightM: Math.round(heightM * 10) / 10,
    farUse, over: gfa > maxGfa * 1.001,
    buildCost, weeks, use: 'mixed', grade: gradeId, brandId: opt.brandId || null,
    saleRevenue: Math.round(saleRevenue), saleArea: Math.round(saleArea), units,
    nra: Math.round(nra), grossRent, noi, capRate, assetValue,
    sellable: Math.round(saleArea + nra),
    salePrice, rent,
    saleCostShare, leaseUse: mainLease ? mainLease.use : null,
  };
  out.landCost = opt.landCost ?? landAppraisal(g, c);
  out.totalCost = out.landCost + out.buildCost;
  out.grossValue = out.saleRevenue + out.assetValue;
  const fee = saleFeeRate(g);
  out.profit = out.grossValue - out.totalCost - out.saleRevenue * fee;
  out.margin = out.grossValue > 0 ? out.profit / out.grossValue : 0;
  out.yieldOnCost = noi ? noi / Math.max(1, out.totalCost) : null;
  out.residualLand = Math.round(out.grossValue * 0.85 - out.buildCost - out.saleRevenue * fee);
  return out;
}

/** 容積率から積める最大階数を求める */
export function maxFloorsFor(g, c, stack) {
  const clean = (stack || []).filter(x => x && x.floors > 0);
  const p = orgPower(g);
  const d = DISTRICTS[c.d];
  const tf = clean.reduce((a, x) => a + x.floors, 0) || 1;
  const cover = clean.length ? clean.reduce((a, x) => a + COVER[x.use] * x.floors, 0) / tf : 0.4;
  const fitAvg = clean.length ? clean.reduce((a, x) => a + (d.fit[x.use] ?? 0.3) * x.floors, 0) / tf : 0.5;
  const farUse = clamp01(0.80 + fitAvg * 0.18 + p.plan.quality / 900) * 1.18;
  const plate = c.area * cover;
  return Math.max(1, Math.floor(c.area * (c.far / 100) * farUse / Math.max(1, plate)));
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

/** 用途ごとに参照する地区の賃料項目 */
export const RENT_KEY = {
  office: 'rentOffice', retail: 'rentRetail', hotel: 'rentHotel', logi: 'rentLogi',
  rental: 'rentResi', resi: 'rentResi', house: 'rentResi', mixed: 'rentOffice',
};

/**
 * 地区の相場賃料（円/坪·月）。
 * グレードやブランド、駅力は含まない“素の相場”で、
 * 物件ごとの上振れ・下振れは `a.rentIndex` で持つ。
 * 竣工時の賃料と同じ物差しで比べられるようにするための基準値。
 */
export function marketRentRaw(g, a) {
  const d = DISTRICTS[a.district];
  if (!d) return 0;
  const dem = g.market.demand[a.use] ?? 1;
  const base = d[RENT_KEY[a.use] || 'rentOffice'] ?? d.rentOffice * 0.6;
  const aged = 1 - Math.min(0.22, (a.age || 0) * 0.006);
  return base * (0.86 + dem * 0.2) * g.market.priceIdx * aged;
}

/** 保有資産の現在NOI（年額） */
export function currentNOI(g, a) {
  const dem = g.market.demand[a.use] ?? 1;
  const gross = a.nra * a.rent * 12 / 1e6 * a.occupancy;
  const opex = 0.24 - subEffect(g, 'feeRate') * 2;
  // ホテルは運営会社（hotelNoi）を傘下に持つと運営効率が上がる
  const hotelMul = a.use === 'hotel' ? (0.7 + dem * 0.35) * (1 + subEffect(g, 'hotelNoi')) : 1;
  return Math.round(gross * (1 - clamp(opex, 0.16, 0.30)) * hotelMul);
}
