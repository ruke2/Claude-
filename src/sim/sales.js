// ============================================================
//  販売・賃貸運用 — 分譲在庫／保有資産のNOI／物件売却
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES } from '../data/city.js';
import { orgPower } from './hr.js';
import { contractSpeed } from './project.js';
import { assetValue, currentNOI, subEffect, marketRentRaw, effectiveRent } from './valuation.js';
import { demandMul } from './population.js';
import { growBrand, damageBrand } from './brands.js';
import { isHome, HOME } from './company.js';
import { areaOcc } from './area.js';
import { certOccBonus } from './build.js';
import { perWeek, WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';

/** 分譲在庫の販売 */
export function stepInventory(g, rng, news) {
  const p = orgPower(g);
  const finished = [];
  for (const inv of g.inventory) {
    inv.weeksOnSale++;
    // 安全弁：総販売額が0のまま原価だけ立つのを防ぐ。
    // 坪単価が抜けている在庫を売ると、売上0・原価満額の巨額赤字になる
    if (!(inv.totalValue > 0) && inv.cost > 0) {
      const price = inv.price > 0 ? inv.price : (inv.basePrice > 0 ? inv.basePrice : 0);
      if (price > 0 && inv.area > 0) {
        inv.totalValue = Math.round(inv.revenue + inv.area * (1 - (inv.soldRatio || 0)) * price);
      } else {
        continue;     // 値付けができないものは販売を進めない
      }
    }
    if (inv.soldRatio >= 0.999) { finished.push(inv); continue; }

    let speed = contractSpeed(g, inv.use, inv.price, inv.basePrice, p, inv.district, inv.brandId);
    // 長期在庫はさらに売れにくくなる（新築プレミアムの喪失）
    if (inv.weeksOnSale > 78) speed *= 0.82;
    if (inv.weeksOnSale > 156) speed *= 0.7;
    speed *= rng.range(0.7, 1.3);

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
    if (inv.weeksOnSale >= 104 && inv.soldRatio < 0.8 && rng.chance(0.42 / WEEKS_PER_QUARTER)) {
      const remain = inv.totalValue * (1 - inv.soldRatio);
      const loss = Math.round(remain * rng.range(0.05, 0.12));
      inv.impaired += loss;
      if (inv.brandId) damageBrand(g, inv.brandId, 0.8, 2.5);
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
    if (inv.brandId) growBrand(g, inv.brandId, { area: inv.area, base: inv.weeksOnSale < 52 ? 3.4 : 1.2, reputation: inv.weeksOnSale < 52 ? 3 : -1 });
    news.push({ icon: '✅', type: 'sales', major: true, text: `【${inv.name}】全${inv.units}戸が完売（販売期間${Math.round(inv.weeksOnSale / 4.33)}ヶ月）。累計売上${Math.round(inv.revenue / 100).toLocaleString()}億円。` });
  }
}

/** 保有資産の運用 */
const K_OCC = perWeek(0.34);

export function stepAssets(g, rng, news) {
  const p = orgPower(g);
  for (const a of g.assets) {
    a.age += 1 / WEEKS_PER_YEAR;
    const dem = g.market.demand[a.use] ?? 1;

    // 市場賃料の変動。
    // 素の相場に、この物件の位置（rentIndex）を掛ける。
    // グレードやブランド、駅力のぶんを相場側にも織り込まないと、
    // 高級物件は永久に「市場比+100%」と判定されて空室が増えてしまう
    const raw = marketRentRaw(g, a);
    if (!(a.rentIndex > 0)) a.rentIndex = clamp(a.rent / Math.max(1, raw), 0.25, 3.5);
    a.marketRent = Math.round(raw * a.rentIndex);

    // 賃料が抜けている物件（旧版の複合開発）は相場で埋める
    if (!(a.rent > 0)) {
      a.rent = Math.max(1, Math.round(a.marketRent || raw));
      a.rentIndex = clamp(a.rent / Math.max(1, raw), 0.25, 3.5);
      a.marketRent = Math.round(raw * a.rentIndex);
      news.push({
        icon: '🏢', type: 'lease',
        text: `【${a.name}】募集賃料が未設定だったため、相場の月坪${a.rent.toLocaleString()}円で募集を開始した。`,
      });
    }

    // 稼働率：賃料が市場より高いと埋まりにくい
    const gap = a.rent / Math.max(1, a.marketRent);
    // 地盤では地元のテナント網が効いて空室が埋まりやすい
    const lease = 0.80 + p.lease.quality / 340 + subEffect(g, 'occupancy') * 2
      + (isHome(g, a.district) ? HOME.occupancy : 0);
    // 地区の人口。増えていれば埋まりやすく、減っていれば空室が出る。
    // **倍率は population.js の demandMul で 0.88〜1.14 に抑えてある。**
    // ここで生の人口比を掛けると、人口が1割動いただけで収支がひっくり返る
    const popMul = demandMul(g, a.district, a.use);
    // エリアマネジメントの効き目（緑化・にぎわい・モビリティ）
    let target = clamp01((1.34 - gap * 0.36) * (0.70 + dem * 0.31) * lease * popMul
      * areaOcc(g, a.district, a.use));
    if (a.use === 'logi') target = clamp01(target * 1.06 + 0.04);
    if (a.use === 'hotel') target = clamp01(target * (0.74 + dem * 0.34));
    if (a.age > 25) target *= 0.94;
    // 大口テナントが押さえている床は空かない。
    // **一般の稼働率に足さず、残りの床にだけ一般の稼働率を掛けること。**
    // 足すと 100% を超えて、契約と空室の合計が貸室面積を上回る
    // 環境認証は空室を埋めやすくする（借りる側の選定基準に入っている）
    target = clamp01(target + certOccBonus(a));
    const anchor = clamp01(a.anchorShare || 0);
    if (anchor > 0) target = clamp01(anchor + (1 - anchor) * target);
    // 被災して復旧工事中の物件は、そのぶん埋まらない
    if (a.repairUntil && g.week < a.repairUntil) target *= 0.55;
    a.occupancy = clamp01(a.occupancy + (target - a.occupancy) * K_OCC + rng.normal(0, 0.006));

    // 賃料改定（2年ごと）。
    // **動かせるのは募集中の一般区画だけである。** 契約期間中の大口テナントは
    // `tenants.js` の契約賃料で固定されていて、ここでは動かない
    if (g.week - a.lastRentReview >= 104) {
      const power = 0.35 + p.lease.quality / 260;
      const newRent = Math.round(a.rent + (a.marketRent - a.rent) * clamp01(power));
      if (a.rent > 0 && Math.abs(newRent - a.rent) / a.rent > 0.03) {
        news.push({
          icon: newRent > a.rent ? '📈' : '📉', type: 'lease',
          text: `【${a.name}】賃料改定。月坪${a.rent.toLocaleString()}円 → ${newRent.toLocaleString()}円（稼働${Math.round(a.occupancy * 100)}%）。`,
        });
      }
      a.rent = newRent; a.lastRentReview = g.week;
    }

    // 収益計上（週次）
    const noiY = currentNOI(g, a);
    a.noi = noiY;
    // 大口テナントの契約賃料を織り込んだ実効賃料で計上する。
    // **`a.rent` のまま計上しないこと。** currentNOI（画面に出るNOI）とずれる
    const grossW = a.nra * effectiveRent(g, a) * 12 / 1e6 * a.occupancy / WEEKS_PER_YEAR;
    const opexW = grossW * 0.24;
    // 償却年数。自社で建てたものは50年、中古で取得したものは残りが短い
    // （`a.deprYears` が無い古いセーブは従来どおり50年で回る）
    const deprW = a.bookBuild / ((a.deprYears || 50) * WEEKS_PER_YEAR);
    a.bookBuild = Math.max(0, a.bookBuild - deprW);
    a.cumNoi += grossW - opexW;
    g.finance.quarterAcc.revLease += grossW;
    g.finance.quarterAcc.cogsLease += opexW + deprW;
    g.cash += grossW - opexW;

    // 管理子会社のフィー収入
    const fee = subEffect(g, 'feeRate');
    if (fee > 0) {
      const f = grossW * fee * WEEKS_PER_YEAR / 12;
      g.finance.quarterAcc.revFee += f; g.cash += f;
    }
  }

  // 大規模修繕（築15年以上でときどき）
  for (const a of g.assets) {
    if (a.age > 14 && rng.chance(0.028 / WEEKS_PER_QUARTER)) {
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
  // 基準単価の40%〜200%に収める。0を許すと売上が立たないまま原価だけが出る
  const base = inv.basePrice > 0 ? inv.basePrice : (old > 0 ? old : 0);
  const lo = base > 0 ? base * 0.4 : 0.01;
  const hi = base > 0 ? base * 2.0 : Number.MAX_SAFE_INTEGER;
  inv.price = Math.round(clamp(newPrice, lo, hi) * 1000) / 1000;
  const remain = 1 - inv.soldRatio;
  inv.totalValue = Math.round(inv.revenue + inv.area * remain * inv.price);
  if (newPrice < old * 0.94) {
    g.company.brand = clamp(g.company.brand - 0.6, 0, 100);
    if (inv.brandId) damageBrand(g, inv.brandId, 1.2, 3);
    news && news.push({ icon: '🏷', type: 'sales', text: `【${inv.name}】販売価格を坪${(old * 100).toFixed(0)}万円→${(inv.price * 100).toFixed(0)}万円に改定した。` });
  }
}
