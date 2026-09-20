// ============================================================
//  建て替え（スクラップ & ビルド）
//
//    築古になった自社の物件を解体し、建て直す。
//
//    なぜ要るか。地図の一等地は数が限られていて、
//    一度建ててしまうとその区画は二度と使えなくなっていた。
//    実際のデベロッパーは同じ土地を30年・50年おきに建て直して使う。
//    持っている一等地が「繰り返し使える資産」になると、
//    大型案件の出どころがもう一つ増える。
//
//    建て替えの旨みは**容積率の割増**にある。
//    昔の建物は今の容積を使い切っていないことが多く、
//    総合設計制度で公開空地を提供すればさらに上積みできる。
//    そのかわり解体費がかかり、工事のあいだ賃料が完全に止まる。
//
//    **「壊せば必ず得」にしないこと。**
//    稼いでいる物件を壊すのは、失う賃料と除却損に見合うときだけである。
// ============================================================
import { clamp } from '../core/format.js';
import { DISTRICTS, USES, TERRAIN } from '../data/city.js';
import { WEEKS_PER_YEAR } from '../core/time.js';
import { assetValue, currentNOI, cityBuildMul } from './valuation.js';

/** 建て替えを検討できる築年数 */
export const REBUILD_AGE = 30;

/**
 * 建て替えの進め方。
 * 容積の割増を取るほど、金と時間と手続きがかかる。
 */
export const SCHEMES = {
  plain: {
    id: 'plain', name: '単純建替え', farBonus: 1.00, costMul: 1.00, delay: 0,
    desc: '既存の建物を解体し、そのまま建て直す。手続きは軽いが、容積の上積みは無い。',
  },
  design: {
    id: 'design', name: '総合設計制度', farBonus: 1.25, costMul: 1.05, delay: 12,
    minArea: 800,
    desc: '敷地の一部を公開空地として提供するかわりに、容積率の割増を受ける。'
      + '広場の整備で工事費が5%増え、特定行政庁との協議で着工が3ヶ月ほど遅れる。',
  },
  district: {
    id: 'district', name: '再開発等促進区', farBonus: 1.55, costMul: 1.11, delay: 30,
    minArea: 2200, minValue: 8000,
    desc: '地区計画を定めて大幅な容積割増を受ける。歩行者デッキや広場の整備が条件となり、'
      + '工事費が11%増える。都市計画の手続きに7ヶ月あまりかかる。',
  },
};

/** 解体費（百万円／延床坪）。用途で手間が違う */
const DEMO_COST = { office: 0.14, retail: 0.12, hotel: 0.13, rental: 0.10, mixed: 0.14, logi: 0.07, resi: 0.10, house: 0.08 };

/** 建て替えられるか。理由を返す（建てられるときは null） */
export function canRebuild(g, a) {
  if (!a) return '物件が見つからない';
  const cell = g.cells.find(c => c.id === a.cellId);
  if (!cell) return '区画が見つからない';
  if (cell.projectId) return 'すでに工事中である';
  if (a.retrofit) return '耐震改修の工事中である';
  if ((a.age || 0) < REBUILD_AGE) return `築${REBUILD_AGE}年を過ぎてからでなければ、建て替えの合理性を説明できない（いま築${a.age || 0}年）`;
  return null;
}

/** その手法が使えるか */
export function schemeAvailable(g, a, scheme) {
  const cell = g.cells.find(c => c.id === a.cellId);
  if (!cell) return false;
  if (scheme.minArea && cell.area < scheme.minArea) return false;
  if (scheme.minValue && assetValue(g, a) < scheme.minValue) return false;
  return true;
}

/** 解体費 */
export function demolitionCost(g, a) {
  const rate = DEMO_COST[a.use] ?? 0.12;
  const cell = g.cells.find(c => c.id === a.cellId);
  return Math.round((a.gfa || a.nra * 1.4) * rate * g.market.costIdx * cityBuildMul(cell ? cell.d : 'T'));
}

/**
 * 建て替えの見積り。
 * **失うものを必ず一緒に出すこと。**
 * 解体費だけ見せると、賃料が何年ぶん消えるのかが分からない。
 */
export function rebuildQuote(g, a, schemeId) {
  const scheme = SCHEMES[schemeId] || SCHEMES.plain;
  const cell = g.cells.find(c => c.id === a.cellId);
  if (!cell) return null;
  const demo = demolitionCost(g, a);
  const loss = Math.max(0, Math.round(a.bookBuild || 0));      // 建物の残存簿価は除却損になる
  const noi = currentNOI(g, a);
  // 解体から竣工までのおおよその期間（工期は用途で決まる）
  const weeks = Math.round(USES[a.use].weeks * 1.05) + 8 + scheme.delay;
  return {
    scheme, demo, loss, noi,
    weeks,
    lostRent: Math.round(noi * weeks / WEEKS_PER_YEAR),        // 工事中に入らなくなる賃料
    farNow: cell.far,
    farAfter: Math.round(cell.far * scheme.farBonus),
    // いま建っているものが容積をどれだけ使っているか
    usedFar: Math.round((a.gfa || 0) / Math.max(1, cell.area) * 100),
    marketValue: assetValue(g, a),
  };
}

/**
 * 解体して更地に戻す。
 * このあとは普通の未着工用地として、いつもの事業化の流れに乗る。
 *
 * **土地の簿価を引き継ぐこと。** 取得時の土地代を捨てると、
 * 建て替えのたびに土地をただで手に入れたことになってしまう。
 */
export function demolish(g, a, schemeId, news) {
  const err = canRebuild(g, a);
  if (err) return { ok: false, message: err };
  const scheme = SCHEMES[schemeId] || SCHEMES.plain;
  if (!schemeAvailable(g, a, scheme)) return { ok: false, message: 'この敷地では、その手法の要件を満たさない' };
  const cell = g.cells.find(c => c.id === a.cellId);
  const q = rebuildQuote(g, a, schemeId);

  g.cash -= q.demo;
  // 解体費は土地の取得原価に含める（次の建物の原価になる）
  // 建物の残存簿価は除却損として、その期の損益に落ちる
  g.finance.quarterAcc.cogsLease = (g.finance.quarterAcc.cogsLease || 0) + q.loss;

  cell.assetId = null;
  cell.building = null;
  cell.vacant = true;
  cell.owner = 'player';
  cell.bookValue = Math.round((a.bookLand || 0) + q.demo);
  // **`lastPaid` も更新すること。** `feasibility()` は土地の原価をここから取る。
  // 置き忘れると、次の事業計画が土地をいまの相場で買い直したことになってしまう
  cell.lastPaid = cell.bookValue;
  // 容積の割増と、その代償（工事費の上乗せ・手続きの遅れ）を区画に貼る。
  // `feasibility()` が着工のたびにこれを読む
  cell.rebuild = {
    scheme: scheme.id, name: scheme.name,
    farBonus: scheme.farBonus, costMul: scheme.costMul, delay: scheme.delay,
    since: g.week, prevName: a.name,
  };

  const i = g.assets.indexOf(a);
  if (i >= 0) g.assets.splice(i, 1);

  news && news.push({
    icon: '🚧', type: 'dev', major: true,
    text: `【${a.name}】（築${a.age}年）の解体に着手した。解体費${Math.round(q.demo / 100).toLocaleString()}億円、`
      + `建物の除却損${Math.round(q.loss / 100).toLocaleString()}億円を計上。`
      + (scheme.farBonus > 1
        ? `${scheme.name}により容積率は ${cell.far}% → ${Math.round(cell.far * scheme.farBonus)}% となる。`
        : '同じ容積率で建て直す。'),
  });
  return { ok: true, quote: q };
}

/**
 * 建て替えの条件を事業計画に織り込む。
 * `project.js` の `applyProgram()` と同じ位置で呼ぶ。
 */
export function applyRebuild(cell, plan) {
  const rb = cell && cell.rebuild;
  if (!rb) return;
  const extra = Math.round(plan.buildCost * (rb.costMul - 1));
  plan.buildCost += extra;
  plan.rebuildCost = extra;
  plan.rebuild = rb;
  plan.weeks += rb.delay;
}

/** 容積の割増（1.00 = 割増なし）。valuation が読む */
export const farBonusOf = c => (c && c.rebuild ? c.rebuild.farBonus : 1);

/** 表示用：建て替えを検討できる保有物件 */
export function rebuildTargets(g) {
  return (g.assets || [])
    .filter(a => !canRebuild(g, a))
    .map(a => {
      const cell = g.cells.find(c => c.id === a.cellId);
      const q = rebuildQuote(g, a, 'plain');
      return {
        asset: a, cell, quote: q,
        // いまの建物が容積を使い残している割合。大きいほど建て替えの効果が大きい
        slack: cell ? clamp(1 - (a.gfa || 0) / Math.max(1, cell.area * cell.far / 100), 0, 0.9) : 0,
      };
    })
    .sort((x, y) => y.slack - x.slack);
}
