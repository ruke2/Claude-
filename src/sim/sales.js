// ============================================================
//  販売・賃貸運用 — 分譲在庫／保有資産のNOI／物件売却
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES } from '../data/city.js';
import { orgPower } from './hr.js';
import { contractSpeed } from './project.js';
import { assetValue, currentNOI, subEffect } from './valuation.js';

/** 分譲在庫の販売 */
export function stepInventory(g, rng, news) {
  const p = orgPower(g);
  const finished = [];
  for (const inv of g.inventory) {
    inv.quartersOnSale++;
    if (inv.soldRatio >= 0.999) { finished.push(inv); continue; }

    let speed = contractSpeed(g, inv.use, inv.price, inv.basePrice, p, inv.district);
    // 長期在庫はさらに売れにくくなる（築古感）
    if (inv.quartersOnSale > 6) speed *= 0.82;
    if (inv.quartersOnSale > 12) speed *= 0.7;
    speed *= rng.range(0.78, 1.24);

    const before = inv.soldRatio;
    inv.soldRatio = clamp01(inv.soldRatio + speed);
    const delta = inv.soldRatio - before;
    if (delta > 0) {
      const rev = Math.round(inv.totalValue * delta);
      const cogs = Math.round(inv.cost * delta);
      g.finance.quarterAcc.revSale += rev;
      g.finance.quarterAcc.cogsSale += cogs;
      g.cash += rev;
      inv.revenue += rev;
      g.kpi.soldUnits += Math.round(inv.units * delta);
    }

    // 長期滞留在庫の評価損
    if (inv.quartersOnSale >= 8 && inv.soldRatio < 0.8 && rng.chance(0.42)) {
      const remain = inv.totalValue * (1 - inv.soldRatio);
      const loss = Math.round(remain * rng.range(0.05, 0.12));
      inv.impaired += loss;
      g.finance.quarterAcc.impairment += loss;
      inv.totalValue -= loss;
      inv.price = Math.round(inv.price * (1 - loss / Math.max(1, remain)) * 1000) / 1000;
      news.push({ icon: '📉', type: 'sales', text: `【${inv.name}】販売が長期化し、棚卸資産評価損${Math.round(loss / 100).toLocaleString()}億円を計上した。` });
    }
    if (inv.soldRatio >= 0.999) finished.push(inv);
  }
  for (const inv of finished) {
    const cell = g.cells.find(c => c.id === inv.cellId);
    if (cell) { cell.invId = null; cell.soldOut = true; }
    const i = g.inventory.indexOf(inv);
    if (i >= 0) g.inventory.splice(i, 1);
    g.company.brand = clamp(g.company.brand + 0.8, 0, 100);
    news.push({ icon: '✅', type: 'sales', text: `【${inv.name}】全${inv.units}戸が完売。累計売上${Math.round(inv.revenue / 100).toLocaleString()}億円。` });
  }
}

/** 保有資産の運用 */
export function stepAssets(g, rng, news) {
  const p = orgPower(g);
  for (const a of g.assets) {
    a.age += 0.25;
    const d = DISTRICTS[a.district];
    const dem = g.market.demand[a.use] ?? 1;

    // 市場賃料の変動
    const rentKey = { office: 'rentOffice', retail: 'rentRetail', hotel: 'rentHotel', logi: 'rentLogi', rental: 'rentResi', resi: 'rentResi' }[a.use] || 'rentOffice';
    const base = (d[rentKey] ?? d.rentOffice * 0.6);
    a.marketRent = Math.round(base * (0.86 + dem * 0.2) * g.market.priceIdx * (1 - Math.min(0.22, a.age * 0.006)));

    // 稼働率：賃料が市場より高いと埋まりにくい
    const gap = a.rent / Math.max(1, a.marketRent);
    const lease = 0.80 + p.lease.quality / 340 + subEffect(g, 'occupancy') * 2;
    let target = clamp01((1.34 - gap * 0.36) * (0.70 + dem * 0.31) * lease);
    if (a.use === 'logi') target = clamp01(target * 1.06 + 0.04);
    if (a.use === 'hotel') target = clamp01(target * (0.74 + dem * 0.34));
    if (a.age > 25) target *= 0.94;
    a.occupancy = clamp01(a.occupancy + (target - a.occupancy) * 0.34 + rng.normal(0, 0.022));

    // 賃料改定（2年ごと）
    if (g.turn - a.lastRentReview >= 8) {
      const power = 0.35 + p.lease.quality / 260;
      const newRent = Math.round(a.rent + (a.marketRent - a.rent) * clamp01(power));
      if (Math.abs(newRent - a.rent) / a.rent > 0.03) {
        news.push({
          icon: newRent > a.rent ? '📈' : '📉', type: 'lease',
          text: `【${a.name}】賃料改定。月坪${a.rent.toLocaleString()}円 → ${newRent.toLocaleString()}円（稼働${Math.round(a.occupancy * 100)}%）。`,
        });
      }
      a.rent = newRent; a.lastRentReview = g.turn;
    }

    // 収益計上（四半期）
    const noiY = currentNOI(g, a);
    a.noi = noiY;
    const grossQ = Math.round(a.nra * a.rent * 12 / 1e6 * a.occupancy / 4);
    const opexQ = Math.round(grossQ * 0.24);
    const deprQ = Math.round(a.bookBuild / 200);      // 50年定額
    a.bookBuild = Math.max(0, a.bookBuild - deprQ);
    a.cumNoi += grossQ - opexQ;
    g.finance.quarterAcc.revLease += grossQ;
    g.finance.quarterAcc.cogsLease += opexQ + deprQ;
    g.cash += grossQ - opexQ;

    // 管理子会社のフィー収入
    const fee = subEffect(g, 'feeRate');
    if (fee > 0) {
      const f = Math.round(grossQ * fee * 4);
      g.finance.quarterAcc.revFee += f; g.cash += f;
    }
  }

  // 大規模修繕（築15年以上でときどき）
  for (const a of g.assets) {
    if (a.age > 14 && rng.chance(0.028)) {
      const cost = Math.round(a.bookBuild * 0.07 + 200);
      g.cash -= cost; g.finance.quarterAcc.cogsLease += cost;
      news.push({ icon: '🔧', type: 'lease', text: `【${a.name}】大規模修繕を実施。${Math.round(cost / 100).toLocaleString()}億円を支出した。` });
    }
  }
}

/** 保有物件を売却する */
export function sellAsset(g, a, news) {
  const price = Math.round(assetValue(g, a) * (1 + subEffect(g, 'exitPremium')));
  const book = a.bookLand + a.bookBuild;
  const gain = price - book;
  const fee = Math.round(price * 0.025);
  g.cash += price - fee;
  g.finance.quarterAcc.gainSale += gain - fee;
  const cell = g.cells.find(c => c.id === a.cellId);
  if (cell) {
    cell.assetId = null; cell.owner = 'other';
    if (cell.building) cell.building.owner = 'other';
  }
  const i = g.assets.indexOf(a);
  if (i >= 0) g.assets.splice(i, 1);
  news && news.push({
    icon: '💰', type: 'lease',
    text: `【${a.name}】を${Math.round(price / 100).toLocaleString()}億円で売却。売却${gain >= 0 ? '益' : '損'}${Math.round(Math.abs(gain) / 100).toLocaleString()}億円を計上した。`,
  });
  return { price, gain };
}

/** 在庫の値付けを変更する */
export function repriceInventory(g, inv, newPrice, news) {
  const old = inv.price;
  inv.price = Math.round(newPrice * 1000) / 1000;
  const remain = 1 - inv.soldRatio;
  inv.totalValue = Math.round(inv.revenue + inv.area * remain * inv.price);
  if (newPrice < old * 0.94) {
    g.company.brand = clamp(g.company.brand - 0.6, 0, 100);
    news && news.push({ icon: '🏷', type: 'sales', text: `【${inv.name}】販売価格を坪${(old * 100).toFixed(0)}万円→${(inv.price * 100).toFixed(0)}万円に改定した。` });
  }
}
