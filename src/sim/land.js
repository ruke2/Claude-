// ============================================================
//  用地取得 — 売却情報・デューデリジェンス・入札
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN, USES } from '../data/city.js';
import { uid } from '../core/state.js';
import { landAppraisal, devPlan, bestUseFit } from './valuation.js';
import { orgPower } from './hr.js';

/** 土地に潜むリスクと好材料 */
export const RISKS = [
  { id: 'soil',       name: '土壌汚染',             p: 0.115, bad: true, desc: '旧工場等に由来する汚染。除去費用が土地代の6〜16%発生する。' },
  { id: 'buried',     name: '埋蔵文化財の包蔵地',   p: 0.085, bad: true, desc: '試掘調査が必要で、着工が2四半期遅れる。' },
  { id: 'obstacle',   name: '地中障害物',           p: 0.100, bad: true, desc: '旧建物の基礎杭などが残存。建設費が7%増える。' },
  { id: 'opposition', name: '近隣住民の反対運動',   p: 0.115, bad: true, desc: '計画の縮小を求められ、容積消化率が15%落ち工期も延びる。' },
  { id: 'leasehold',  name: '借地権・底地の未整理', p: 0.075, bad: true, desc: '権利関係の整理に土地代の8%相当の追加費用がかかる。' },
  { id: 'shadow',     name: '日影規制の強い制約',   p: 0.095, bad: true, desc: '計画建物の階数が実質的に15%制限される。' },
  { id: 'road',       name: '接道条件が劣る',       p: 0.080, bad: true, desc: '工事車両の動線が取れず建設費4%増・工期1四半期増。' },
  { id: 'asbestos',   name: '既存建物のアスベスト', p: 0.070, bad: true, desc: '解体費用が土地代の5%相当増加する。' },
  { id: 'upzoning',   name: '容積率割増の見込み',   p: 0.085, bad: false, desc: '総合設計制度の適用が見込め、容積率が15%上乗せできる。' },
  { id: 'newstation', name: '新駅設置計画',         p: 0.055, bad: false, desc: '数年内に新駅が開業する見込み。将来の賃料・分譲単価が上がる。' },
];

/** 取得諸費用率（仲介手数料・不動産取得税・登録免許税ほか） */
export const ACQ_FEE = 0.052;

const KINDS = {
  tender:   { id: 'tender',   name: '一般競争入札', icon: '⚖', desc: '最高価格を提示した者が落札する。価格だけが評価される。' },
  proposal: { id: 'proposal', name: '事業提案コンペ', icon: '✎', desc: '価格に加えて企画内容が評価される。企画力が高ければ安値でも勝てる。' },
  nego:     { id: 'nego',     name: '相対（先着）', icon: '🤝', desc: '売主の提示額で即時取得できる。ただし価格は強気で、瑕疵が隠れていることも多い。' },
};
export { KINDS as LISTING_KINDS };

/** 毎四半期の売却情報生成 */
export function generateListings(g, rng, news) {
  const p = orgPower(g);
  // 用地部の情報力で入手できる案件数が増える
  const infoPower = p.land.quality / 100 + p.land.capacity / 26 + (g.acquisitions.some(a => a.kind === 'broker' && !a.failed) ? 0.5 : 0);
  const n = clamp(Math.round(1.6 + infoPower * 1.5 + g.market.sentiment * 1.4 + rng.range(-0.6, 0.9)), 1, 7);

  if (g.listings.length >= 10) return;
  const pool = g.cells.filter(c =>
    c.terrain === TERRAIN.LOT && c.d && !c.onSale && c.owner !== 'player' && !c.projectId && !c.assetId && !c.invId);
  if (!pool.length) return;

  for (let i = 0; i < n; i++) {
    // 更地 > 築古ビル > その他 の順に出やすい
    const cand = rng.shuffle(pool).sort((a, b) => score(b, g) - score(a, g)).slice(0, 14);
    const c = rng.pick(cand);
    if (!c || c.onSale) continue;

    const appraisal = landAppraisal(g, c);
    const kind = rng.weighted([
      { k: 'tender', w: 5 }, { k: 'proposal', w: 3 }, { k: 'nego', w: 2.4 },
    ]).k;
    const heat = 0.9 + g.market.sentiment * 0.3;
    const askMul = kind === 'nego' ? rng.range(1.02, 1.30) : rng.range(0.82, 1.06);

    const risks = [];
    for (const r of RISKS) {
      let pr = r.p;
      if (r.id === 'asbestos' && !c.building) pr = 0.01;
      if (r.id === 'soil' && c.d === 'J') pr *= 2.1;
      if (r.id === 'opposition' && (c.d === 'A' || c.d === 'K')) pr *= 1.9;
      if (r.id === 'buried' && c.d === 'K') pr *= 2.0;
      if (r.id === 'shadow' && (c.d === 'A' || c.d === 'N')) pr *= 1.7;
      if (r.id === 'newstation' && c.station > 0.85) pr *= 0.4;
      if (rng.chance(pr)) risks.push({ ...r, found: false });
    }

    const seller = rng.pick([
      '地方銀行（担保処分）', '事業会社（資産圧縮）', '個人地権者（相続）', '外資系ファンド（出口）',
      '製造業（工場移転）', '学校法人（校舎統合）', '鉄道会社（遊休地）', '自治体（公有地払下げ）',
    ]);

    c.onSale = {
      id: uid('L'), cellId: c.id, kind, appraisal,
      askPrice: Math.round(appraisal * askMul * heat),
      deadline: kind === 'nego' ? rng.int(2, 4) : rng.int(1, 3),
      seller, risks, ddLevel: 0, bid: null,
      bestUse: bestUseFit(c),
      note: rng.pick([
        '売主は早期の決済を希望している。', '同業各社にも情報が回っている。',
        '地元では以前から売却の噂があった土地である。', '入札参加者は多いと見られる。',
        '条件次第では価格交渉の余地がある。', '売主は価格よりも計画内容を重視している。',
      ]),
      turn: g.turn,
    };
    g.listings.push(c.onSale);
  }

  function score(c, g) {
    let s = rng.next() * 0.5;
    if (c.vacant) s += 1.2;
    if (c.building && c.building.year < 1998) s += 0.8;
    if (c.owner === 'other') s += 0.5;
    s += (g.market.sentiment - 0.5) * 0.4;
    return s;
  }
}

/** デューデリジェンス費用 */
export function ddCost(listing, level) {
  return Math.round(listing.askPrice * (level === 1 ? 0.004 : 0.013));
}

/** 調査を実施し、隠れた事実を発見する */
export function runDueDiligence(g, listing, level, rng) {
  const p = orgPower(g);
  const base = level === 1 ? 0.48 : 0.86;
  const skill = clamp01(base + (p.land.quality - 55) / 260 + (p.corp.quality - 55) / 420);
  let found = 0;
  for (const r of listing.risks) {
    if (r.found) continue;
    if (rng.chance(skill)) { r.found = true; found++; }
  }
  listing.ddLevel = Math.max(listing.ddLevel, level);
  listing.ddSkill = skill;
  return found;
}

/** 落札後に発生する追加負担を計算する */
export function riskImpact(g, cell, risks) {
  const eff = { extraCost: 0, delay: 0, buildMul: 1, farMul: 1, floorMul: 1, priceMul: 1 };
  const land = cell.lastPaid || landAppraisal(g, cell);
  for (const r of risks) {
    switch (r.id) {
      case 'soil': eff.extraCost += land * (0.06 + (r.mag ?? 0.5) * 0.10); break;
      case 'buried': eff.delay += 2; break;
      case 'obstacle': eff.buildMul *= 1.07; break;
      case 'opposition': eff.farMul *= 0.85; eff.delay += 1; break;
      case 'leasehold': eff.extraCost += land * 0.08; break;
      case 'shadow': eff.floorMul *= 0.85; break;
      case 'road': eff.buildMul *= 1.04; eff.delay += 1; break;
      case 'asbestos': eff.extraCost += land * 0.05; break;
      case 'upzoning': eff.farMul *= 1.15; break;
      case 'newstation': eff.priceMul *= 1.12; break;
    }
  }
  return eff;
}

/** ライバルの入札額を決める */
function rivalBid(g, listing, cell, rv, rng) {
  const use = listing.bestUse;
  const fit = DISTRICTS[cell.d].fit[use] ?? 0.3;
  // 大手は小粒な案件を相手にしない（売上規模に対する最低取引額）
  const minDeal = rv.rev * 0.0062;
  if (listing.appraisal < minDeal) return null;
  // 案件が大きすぎても手を出さない
  if (listing.appraisal > rv.cash * 0.9 + rv.equity * 0.22) return null;

  const interest = (rv.focus[use] ?? 0.3) * (0.42 + fit * 0.72) * (0.5 + rv.aggression * 0.62);
  if (!rng.chance(clamp01(interest * 0.72))) return null;

  const plan = devPlan(g, cell, use, rv.brand > 86 ? 'high' : 'standard', { landCost: listing.appraisal });
  const ceiling = Math.max(listing.appraisal * 0.72, plan.residualLand);
  let bid = ceiling * rng.range(0.58, 1.00) * (0.84 + rv.aggression * 0.22);
  bid *= (0.95 + (rv.momentum || 0) * 0.05);
  if (bid < listing.askPrice * 0.58) return null;
  return {
    id: rv.id, name: rv.name, short: rv.short, color: rv.color, amount: Math.round(bid),
    quality: rv.brand * 0.45 + (rv.focus[use] ?? 0.3) * 45,
  };
}

/** 入札の解決 */
export function resolveListing(g, listing, rng, news) {
  const cell = g.cells.find(c => c.id === listing.cellId);
  if (!cell) return null;
  const p = orgPower(g);

  const bids = [];
  for (const rv of g.rivals) {
    const b = rivalBid(g, listing, cell, rv, rng);
    if (b) bids.push(b);
  }
  // 売主の最低売却価格
  const reserve = listing.appraisal * rng.range(0.72, 0.92);

  let playerBid = null;
  if (listing.bid) {
    const planQ = listing.bid.planQuality ?? 40;
    playerBid = {
      id: 'player', name: g.company.name, short: g.company.name, color: '#e3b558',
      amount: listing.bid.amount,
      quality: g.company.brand * 0.32 + p.plan.quality * 0.30 + planQ * 0.62,
      isPlayer: true,
    };
    bids.push(playerBid);
  }
  if (!bids.length) {
    return { winner: null, bids: [], listing, cell, reason: 'nobid' };
  }

  // 評価：一般競争入札は価格のみ、提案コンペは価格＋企画
  const scored = bids.map(b => ({
    ...b,
    score: listing.kind === 'proposal'
      ? (b.amount / Math.max(1, listing.appraisal)) * 100 * 0.78 + b.quality * 0.78
      : b.amount,
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top.amount < reserve) return { winner: null, bids: scored, listing, cell, reason: 'reserve', reserve };
  return { winner: top, bids: scored, listing, cell, second: scored[1] || null };
}

/** 落札処理（プレイヤー） */
export function acquireForPlayer(g, listing, cell, amount, news) {
  const fee = Math.round(amount * ACQ_FEE);
  g.cash -= (amount + fee);
  g.finance.quarterAcc.landSpend += amount + fee;
  cell.owner = 'player';
  cell.vacant = true;
  cell.building = null;
  cell.lastPaid = amount;
  cell.acquiredTurn = g.turn;
  cell.risks = listing.risks.map(r => ({ ...r }));
  cell.onSale = null;
  cell.holdCost = 0;
  const idx = g.listings.indexOf(listing);
  if (idx >= 0) g.listings.splice(idx, 1);
  news && news.push({
    icon: '🏁', type: 'land',
    text: `${DISTRICTS[cell.d].name}の用地（${cell.area.toLocaleString()}坪）を${Math.round(amount / 100).toLocaleString()}億円で取得した。諸費用${Math.round(fee / 100).toLocaleString()}億円。`,
  });
  return fee;
}

/** ライバルが落札したときの反映 */
export function acquireForRival(g, listing, cell, rvId, amount) {
  const rv = g.rivals.find(r => r.id === rvId);
  cell.owner = rvId; cell.onSale = null; cell.vacant = true; cell.building = null;
  cell.rivalDev = { turn: g.turn, quarters: 4 + Math.floor(Math.random() * 6), use: listing.bestUse };
  if (rv) { rv.cash -= amount; rv.lots++; rv.momentum = Math.min(3, (rv.momentum || 0) + 1); }
  const idx = g.listings.indexOf(listing);
  if (idx >= 0) g.listings.splice(idx, 1);
}

/** 所有しているだけで発生する保有コスト（固定資産税・金利） */
export function holdingCost(g, cell) {
  const v = cell.lastPaid || landAppraisal(g, cell);
  return Math.round(v * 0.0042);   // 四半期あたり（年約1.7%相当）
}
