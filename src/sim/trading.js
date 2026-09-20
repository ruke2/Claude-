// ============================================================
//  収益物件の売買（ビルの一棟買い）
//
//    用地を仕入れて建てるだけでは、長く遊ぶと大型案件が尽きる。
//    地図の区画は有限で、60億以上の区画は全1,137区画のうち266しかない。
//    大きく育った会社がそこを買い切ると、以後は小口しか回ってこない。
//
//    実際の大手デベロッパーの取引は、更地の仕入れよりも
//    **稼働中のビルを一棟まるごと売買する**ほうが金額が大きい。
//    ここはその市場である。競合や第三者が持っているビルが対象なので、
//    街に建物が建っているかぎり在庫が尽きない。
//
//    ・値段はキャップレート（NOI ÷ 利回り）で決まる。坪単価ではない
//    ・買った瞬間から賃料が入る。工期も工事費もかからない
//    ・そのかわり、利回りは開発（YoC 5.8〜7.2%）より低い
//      —— 出来上がったものを買うのだから当然である
//
//    **開発より儲かるようにしないこと。** 開発する意味が消える。
//    一棟買いの旨みは「時間を買えること」と「規模を一気に増やせること」。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES, GRADES, TERRAIN, cityOf } from '../data/city.js';
import { uid } from '../core/state.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';
import { landAppraisal, marketRentRaw, currentNOI, subEffect, CAP_SPREAD, cityBuildMul } from './valuation.js';
import { orgPower } from './hr.js';
import { citiesOpen } from './land.js';
import { debtCapacity } from './finance.js';
import { isHome, HOME } from './company.js';

/** 一棟で売買できる用途（分譲は区分所有なので対象外） */
const TRADABLE = ['office', 'rental', 'retail', 'hotel', 'logi', 'mixed'];

/** 同時に出ている売り物件の上限 */
const MAX_OFFERS = 4;

/** 1件につき提示できる回数。粘りすぎると売主に嫌われる */
export const MAX_BIDS = 3;

/** グレードごとの賃料の位置（相場を1.00として） */
const GRADE_RENT = { standard: 0.96, high: 1.14, luxury: 1.38 };

/** 売主の顔ぶれ。誰が売るかで急ぎ具合が変わる */
const SELLERS = [
  { name: '外資系ファンド（出口）', hurry: 0.72, note: 'ファンドの償還期限が迫っており、年度内の決済を求めている。' },
  { name: 'J-REIT（ポートフォリオ入替）', hurry: 0.40, note: '資産入替の一環で、価格には強気である。' },
  { name: '事業会社（本社移転）', hurry: 0.58, note: '本社機能の移転にともなう売却で、時期は柔軟である。' },
  { name: '生命保険会社（資産圧縮）', hurry: 0.35, note: '簿価が低く、売り急ぐ理由がない。' },
  { name: '創業家の資産管理会社（相続）', hurry: 0.80, note: '相続の納税資金が必要で、早期の決済を強く希望している。' },
  { name: '地方銀行（担保処分）', hurry: 0.85, note: '担保処分であり、条件よりも確実に決済できる相手を選ぶ。' },
  { name: '海外年金基金（本国回帰）', hurry: 0.62, note: '為替を理由に日本市場から撤退する方針という。' },
];

/**
 * 既存の建物から、収益物件としての姿を組み立てる。
 *
 * **容積率いっぱいに建っていることにしないこと。**
 * 築古のビルは容積を余していることが多く、だからこそ建て替えの種地になる。
 * 容積からの上限と、階数×建築面積の両方を見て小さいほうを取る。
 */
export function standingSpec(g, cell) {
  const b = cell.building;
  const d = DISTRICTS[cell.d];
  if (!b || !d) return null;
  const use = TRADABLE.includes(b.use) ? b.use : 'office';
  const U = USES[use];
  const byFar = cell.area * (cell.far || 200) / 100;
  const byFloors = cell.area * 0.58 * (b.floors || 3);        // 建蔽率58%とみなす
  const gfa = Math.max(200, Math.round(Math.min(byFar, byFloors)));
  const age = Math.max(0, g.year - (b.year || g.year));
  const grade = b.grade || 'standard';
  return {
    use, grade, age, gfa,
    floors: b.floors || 3,
    nra: Math.round(gfa * U.efficiency),
    rentIndex: GRADE_RENT[grade] ?? 1,
  };
}

/** 売り物件1件ぶんの数字をそろえる（査定・NOI・利回り） */
export function appraiseStanding(g, cell, spec) {
  const s = spec || standingSpec(g, cell);
  if (!s) return null;
  const d = DISTRICTS[cell.d];
  // 仮の資産を組んで、保有物件とまったく同じ関数で評価する。
  // **ここで独自に計算しないこと。** 買った後の数字と食い違う
  const probe = {
    district: cell.d, use: s.use, nra: s.nra, age: s.age,
    rent: 0, occupancy: 0, rentIndex: s.rentIndex,
  };
  const raw = Math.max(1, marketRentRaw(g, probe));
  probe.rent = Math.round(raw * s.rentIndex);
  // 築古ほど空室が出やすい。物流は用途の性質上いつも高稼働
  probe.occupancy = clamp(
    (s.use === 'logi' ? 0.94 : 0.92) - Math.max(0, s.age - 15) * 0.004,
    0.62, 0.97);
  const noi = currentNOI(g, probe);
  const cap = clamp(
    d.capRate + (CAP_SPREAD[s.use] ?? 0) + g.market.capShift
    + (s.age > 30 ? 0.006 : s.age > 20 ? 0.003 : 0)
    - subEffect(g, 'exitPremium') * 0.05,
    0.026, 0.095);
  const value = noi > 0 ? Math.round(noi / cap) : 0;
  return { ...s, rent: probe.rent, marketRent: Math.round(raw), occupancy: probe.occupancy, noi, cap, value };
}

/**
 * 売り物件を市場に出す。
 * 地図に建っているビルが対象なので、区画を買い切っても尽きない。
 */
export function stepStanding(g, rng, news) {
  g.standing = (g.standing || []).filter(o => o.deadline > g.week);
  if (g.standing.length >= MAX_OFFERS) return;
  // 用地の情報力が高いほど話が回ってくる
  const p = orgPower(g);
  const info = p.land.quality / 100 + subEffect(g, 'landInfo') * 2.0;
  if (!rng.chance((0.9 + info * 0.7) / WEEKS_PER_QUARTER)) return;

  const reach = citiesOpen(g);
  const pool = g.cells.filter(c =>
    c.terrain === TERRAIN.LOT && c.d && reach.has(cityOf(c.d))
    && c.building && TRADABLE.includes(c.building.use)
    && c.owner !== 'player' && !c.assetId && !c.projectId && !c.invId
    && !(g.standing || []).some(o => o.cellId === c.id));
  if (!pool.length) return;

  // 大きいものほど話題になる。**一様に引かないこと。**
  // 一様だと小さな賃貸レジデンスばかりが出て、一棟買いの意味が無くなる。
  //
  // ただし大きいほうにだけ寄せると、創業まもない会社に2,000億のビルを
  // 見せ続けることになる。**買える体力に見合ったものを出すこと。**
  // 実際にも、一棟の売り物件は決済できる相手にしか話が回らない。
  const power = Math.max(2000, g.cash + Math.max(0, debtCapacity(g) - g.debt));
  // **買えない大きさだけを外すこと。** 「ちょうどいい大きさ」に寄せると、
  // 街のどのビルより体力が大きくなった会社に小口ばかりが回るようになる。
  // 買えるかぎりは大きいほうが話題になる、でよい
  const fit = v => (v > power * 1.6 ? 0.02 : v > power ? 0.35 : 1);
  const scored = pool.map(c => {
    const a = appraiseStanding(g, c);
    return a && a.value > 0
      ? { c, a, w: Math.pow(a.value, 0.55) * fit(a.value) * (isHome(g, c.d) ? 1 + HOME.info : 1) }
      : null;
  }).filter(Boolean);
  if (!scored.length) return;
  const pick = rng.weighted(scored);
  const seller = rng.pick(SELLERS);

  // 売主の最低ライン。急いでいる売主ほど安く手放す
  const reserve = Math.round(pick.a.value * (1.14 - seller.hurry * 0.26 + rng.range(-0.04, 0.05)));
  const offer = {
    id: uid('S'), cellId: pick.c.id, week: g.week,
    deadline: g.week + rng.int(5, 12),
    ask: Math.round(reserve * rng.range(1.04, 1.14)),   // 表に出ている売出価格
    reserve,                                            // 非公開の最低ライン
    seller: seller.name, note: seller.note,
    bids: 0,
    spec: pick.a,
  };
  g.standing.push(offer);
  news && news.push({
    icon: '🏢', type: 'land', major: pick.a.value >= 20000,
    text: `${DISTRICTS[pick.c.d].name}の${USES[pick.a.use].name}「${pick.c.building.name}」が売りに出た`
      + `（${pick.a.nra.toLocaleString()}坪／売出 ${Math.round(offer.ask / 100).toLocaleString()}億円）。`,
  });
}

/** その区画に出ている売り物件 */
export function standingFor(g, cellId) {
  return (g.standing || []).find(o => o.cellId === cellId) || null;
}

/**
 * 価格を提示する。
 * その場で返事が来る。**入札の開札を待たせないこと。**
 * 用地の入札とまったく同じ手触りにすると、二つある意味が無くなる。
 */
export function bidStanding(g, offer, price, rng, news) {
  if (offer.bids >= MAX_BIDS) return { ok: false, message: 'これ以上の交渉には応じてもらえない' };
  // **手数料を忘れないこと。** 価格ちょうどで通すと、決済した瞬間に現金が赤になる
  if (price * 1.05 > g.cash) return { ok: false, message: '手元資金が足りない（仲介手数料と税で価格の5%がかかる）' };
  offer.bids++;

  // 交渉力。用地開発部と経営企画部の力、そして地盤かどうかで決まる
  const p = orgPower(g);
  const cell = g.cells.find(c => c.id === offer.cellId);
  const skill = clamp01(0.5 + (p.land.quality - 55) / 240 + (p.corp.quality - 55) / 380
    + (cell && isHome(g, cell.d) ? 0.06 : 0) + g.company.brand / 900);
  // 粘るほど下がる余地は減る
  const room = offer.reserve * (0.05 * skill) * (1 - (offer.bids - 1) * 0.4);
  const line = Math.round(offer.reserve - Math.max(0, room));

  if (price >= line) {
    const asset = acquireStanding(g, offer, price, news);
    return { ok: true, asset, price };
  }
  const gap = (line - price) / line;
  return {
    ok: false,
    message: gap > 0.18
      ? '売主は「話にならない」と席を立った。' + (offer.bids >= MAX_BIDS ? 'この物件の交渉は終わった。' : '')
      : 'もう少し出してもらえないか、と返ってきた。'
        + (offer.bids >= MAX_BIDS ? 'これ以上は取り合ってもらえない。' : `（あと${MAX_BIDS - offer.bids}回）`),
    close: gap <= 0.18,
  };
}

/**
 * 買った物件を保有資産に組み入れる。
 *
 * **簿価を取得価格のまま1つに置かないこと。**
 * 土地と建物を分けないと減価償却が回らず、利益が実態より大きく出る。
 * 土地は路線価相当（landAppraisal）、残りを建物とする。
 */
export function acquireStanding(g, offer, price, news) {
  const cell = g.cells.find(c => c.id === offer.cellId);
  if (!cell) return null;
  const s = offer.spec;
  // 土地と建物への割り振り。
  // **土地を「路線価そのまま」で置かないこと。** 地価の安い街では
  // 取得価格の1割しか土地にならず、償却が過大に出る。
  // 実務と同じく、土地の評価額と建物の再調達価格の比で按分する。
  const landApp = Math.max(1, landAppraisal(g, cell));
  const newCost = Math.max(1, s.gfa * USES[s.use].build * g.market.costIdx * cityBuildMul(cell.d));
  // 築年ぶん価値が落ちた建物として見る（下限は再調達の3割）
  const usedCost = newCost * clamp(1 - s.age * 0.015, 0.30, 1);
  const landShare = clamp(landApp / (landApp + usedCost), 0.12, 0.85);
  const land = Math.round(price * landShare);
  const build = Math.max(0, price - land);
  // 仲介手数料（3%＋登録免許税・不動産取得税をまとめて5%とみなす）
  const fee = Math.round(price * 0.05);
  g.cash -= price + fee;
  g.finance.quarterAcc.sga = (g.finance.quarterAcc.sga || 0) + fee;

  const b = cell.building;
  const asset = {
    id: uid('A'), cellId: cell.id, projectId: null,
    name: (b && b.name) || `${DISTRICTS[cell.d].name}ビル`,
    use: s.use, district: cell.d, grade: s.grade, brandId: null,
    nra: s.nra, rent: s.rent, marketRent: s.marketRent, rentIndex: s.rentIndex,
    occupancy: s.occupancy,
    bookLand: land, bookBuild: build,
    jv: null,
    completedWeek: g.week - Math.round(s.age * WEEKS_PER_YEAR),
    age: s.age, lastRentReview: g.week,
    noi: s.noi, cumNoi: 0,
    gfa: s.gfa, floors: s.floors,
    // 築年に応じて耐震性能を落とす（新築より弱い）
    seismic: clamp(1 - Math.max(0, s.age - 12) * 0.012, 0.55, 1),
    damage: 0,
    acquired: true,                    // 自社で建てたものではない
    // 中古で買った建物は、残りの使える年数が短い（税務の簡便法に近い扱い）
    deprYears: Math.max(12, 50 - Math.round(s.age * 0.8)),
  };
  g.assets.push(asset);
  cell.assetId = asset.id;
  cell.owner = 'player';
  if (cell.building) cell.building.owner = 'player';

  const o = (g.standing || []).indexOf(offer);
  if (o >= 0) g.standing.splice(o, 1);

  news && news.push({
    icon: '🤝', type: 'lease', major: true,
    text: `【${asset.name}】を${Math.round(price / 100).toLocaleString()}億円で取得した`
      + `（貸室${asset.nra.toLocaleString()}坪／稼働${Math.round(asset.occupancy * 100)}%`
      + `／NOI利回り ${(s.noi / price * 100).toFixed(2)}%）。`,
  });
  return asset;
}

/** 見送る */
export function passStanding(g, offer, news) {
  const i = (g.standing || []).indexOf(offer);
  if (i >= 0) g.standing.splice(i, 1);
  news && news.push({ icon: '—', type: 'land', text: '売り物件の検討を見送った。' });
}

/** 表示用：いま出ている売り物件 */
export function standingRows(g) {
  return (g.standing || []).map(o => {
    const cell = g.cells.find(c => c.id === o.cellId);
    return {
      offer: o, cell,
      district: cell ? DISTRICTS[cell.d] : null,
      weeksLeft: Math.max(0, o.deadline - g.week),
      // 表に見せる利回りは、売出価格に対するNOI
      yieldOnAsk: o.ask > 0 ? o.spec.noi / o.ask : 0,
    };
  }).sort((a, b) => b.offer.spec.value - a.offer.spec.value);
}
