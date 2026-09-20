// ============================================================
//  共同事業（ジョイントベンチャー）
//    大型の案件は、1社で抱えるには重い。
//    競合から共同事業の打診が来て、出資比率を決めて組む。
//
//    組むと何が変わるか：
//      ・土地の持分を相手に売るので、その場で現金が戻る
//      ・工事費の負担も持分ぶんだけになる
//      ・売上も保有床も持分ぶんに減る
//      ・相手の得意分野が建設費・工期・単価に効く
//
//    **「利益が減るだけ」にしないこと。**
//    資金が軽くなり、相手の力を借りられるから組む。
//    単独より儲かる場合があるから悩ましい、というのが狙いである。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, USES } from '../data/city.js';
import { uid } from '../core/state.js';
import { WEEKS_PER_QUARTER } from '../core/time.js';
import { landAppraisal, bestUseFit } from './valuation.js';
import { cityOf } from '../data/city.js';

/** 打診が来る最低の規模（想定地価・百万円）。小口には来ない */
export const JV_MIN_VALUE = 4000;      // 40億円

/** 持分の下限・上限 */
export const SHARE_MIN = 0.30;
export const SHARE_MAX = 0.80;

/** 相手との関係値（0〜1）。組むほど上がり、断ると少し下がる */
export function relationOf(g, rivalId) {
  return clamp01((g.relations || {})[rivalId] ?? 0.35);
}
function setRelation(g, rivalId, v) {
  g.relations = g.relations || {};
  g.relations[rivalId] = clamp01(v);
}

/**
 * 相手が組みたがる度合い。
 * 得意な用途・自社のブランド・関係値・懐具合で決まる。
 */
export function appetiteOf(g, rv, cell) {
  const use = bestUseFit(cell);
  const focus = rv.focus[use] ?? 0.3;
  const rel = relationOf(g, rv.id);
  const brand = clamp((g.company.brand - 30) / 70, -0.3, 0.5);
  // 地元の会社は自分の庭に強い。海峡の向こうには出たがらない
  const away = cityOf(cell.d) === 'minato' ? 1 : 0.55;
  return clamp01((focus * 0.42 + rel * 0.30 + brand * 0.22 + 0.06) * away);
}

/**
 * 共同事業の効き目。
 * 相手の得意分野と規模が、建設費・工期・単価に乗る。
 * 持分が小さいほど相手の色が濃く出る。
 */
export function jvEffect(g, rivalId, share, use) {
  const rv = (g.rivals || []).find(r => r.id === rivalId);
  if (!rv) return { costCut: 0, speedUp: 0, priceUp: 0, riskCut: 0 };
  const w = clamp01(1 - share);                       // 相手の持分
  const focus = rv.focus[use] ?? 0.3;
  const scale = clamp01(Math.log10(Math.max(1, rv.employees)) / 4.6);
  return {
    // 大手ほど調達が効く
    costCut: clamp(w * scale * 0.12, 0, 0.09),
    // 得意分野なら工程も速い
    speedUp: clamp(w * focus * 0.14, 0, 0.11),
    // ブランドの連名で単価が少し上がる
    priceUp: clamp(w * (rv.brand - 60) / 400, -0.02, 0.06),
    // 事業リスクの分担
    riskCut: w,
  };
}

/**
 * 打診を作る。
 * プレイヤーが持っている更地のうち、規模の大きいものに来る。
 */
export function stepJV(g, rng, news) {
  g.jvOffers = (g.jvOffers || []).filter(o => o.deadline > g.week);
  if (g.jvOffers.length >= 2) return;
  if (!rng.chance(0.55 / WEEKS_PER_QUARTER)) return;      // 四半期に1件弱

  const lots = g.cells.filter(c =>
    c.owner === 'player' && c.vacant && !c.projectId && !c.assetId && !c.invId
    && !g.jvOffers.some(o => o.cellId === c.id)
    && landAppraisal(g, c) >= JV_MIN_VALUE);
  if (!lots.length) return;

  const cell = rng.pick(lots);
  const cands = (g.rivals || [])
    .map(rv => ({ rv, a: appetiteOf(g, rv, cell) }))
    .filter(x => x.a > 0.24);
  if (!cands.length) return;
  const pick = rng.weighted(cands.map(x => ({ ...x, w: x.a })));
  const rv = pick.rv;

  // 相手が取りたい持分。乗り気なほど大きく出る
  const want = clamp(0.28 + pick.a * 0.42 + rng.range(-0.06, 0.06), 0.2, 0.6);
  const offer = {
    id: uid('J'), cellId: cell.id, rivalId: rv.id,
    theirShare: Math.round(want * 100) / 100,
    week: g.week, deadline: g.week + rng.int(6, 12),
    use: bestUseFit(cell),
    appetite: Math.round(pick.a * 100) / 100,
  };
  g.jvOffers.push(offer);
  news && news.push({
    icon: '🤝', type: 'land', major: true,
    text: `${rv.name}から${DISTRICTS[cell.d].name}の用地について共同事業の打診があった。`
      + `先方は${Math.round(offer.theirShare * 100)}%の出資を希望している。`,
  });
}

/** その区画に来ている打診 */
export function offerFor(g, cellId) {
  return (g.jvOffers || []).find(o => o.cellId === cellId) || null;
}

/**
 * 打診を受ける。
 * 区画に `jv` を貼り、着工時に startProject が拾う。
 * 土地の持分を相手に売るので、その場で現金が戻る。
 */
export function acceptJV(g, cell, offer, myShare, news) {
  const rv = (g.rivals || []).find(r => r.id === offer.rivalId);
  if (!rv) return { err: '相手が見つからない' };
  const share = clamp(myShare, SHARE_MIN, SHARE_MAX);
  // 相手の希望から離れるほど、まとまらなくなる
  const want = 1 - offer.theirShare;
  const gap = Math.abs(share - want);
  if (gap > 0.18 + relationOf(g, rv.id) * 0.10) {
    setRelation(g, rv.id, relationOf(g, rv.id) - 0.04);
    g.jvOffers = (g.jvOffers || []).filter(o => o.id !== offer.id);
    news && news.push({
      icon: '🙅', type: 'land', major: true,
      text: `${rv.name}との共同事業は、出資比率で折り合わず流れた。`,
    });
    return { err: '出資比率で折り合わなかった' };
  }

  // 土地の持分を売る。簿価ベースで受け取る（含み益は出さない）
  const book = cell.bookValue || landAppraisal(g, cell);
  const paid = Math.round(book * (1 - share));
  g.cash += paid;
  cell.bookValue = book - paid;

  cell.jv = { rivalId: rv.id, share: Math.round(share * 100) / 100, landPaid: paid };
  g.jvOffers = (g.jvOffers || []).filter(o => o.id !== offer.id);
  setRelation(g, rv.id, relationOf(g, rv.id) + 0.12);

  news && news.push({
    icon: '🤝', type: 'land', major: true,
    text: `${rv.name}と${DISTRICTS[cell.d].name}の共同事業で合意した`
      + `（自社${Math.round(share * 100)}%／${rv.short}${Math.round((1 - share) * 100)}%）。`
      + `土地持分の譲渡で${Math.round(paid / 100).toLocaleString()}億円を受け取った。`,
  });
  return { share, paid, rival: rv };
}

/** 打診を断る */
export function declineJV(g, offer, news) {
  const rv = (g.rivals || []).find(r => r.id === offer.rivalId);
  g.jvOffers = (g.jvOffers || []).filter(o => o.id !== offer.id);
  if (rv) setRelation(g, rv.id, relationOf(g, rv.id) - 0.03);
  news && news.push({ icon: '—', type: 'land', text: `${rv ? rv.name : '先方'}からの共同事業の打診を見送った。` });
}

/** 案件の自社持分（共同でなければ 1.00） */
export const shareOf = pj => (pj && pj.jv ? pj.jv.share : 1);

/** 表示用：進行中の共同事業 */
export function jvRows(g) {
  const out = [];
  for (const pj of g.projects || []) {
    if (!pj.jv) continue;
    const rv = (g.rivals || []).find(r => r.id === pj.jv.rivalId);
    out.push({ pj, rival: rv, share: pj.jv.share });
  }
  for (const a of g.assets || []) {
    if (!a.jv) continue;
    const rv = (g.rivals || []).find(r => r.id === a.jv.rivalId);
    out.push({ asset: a, rival: rv, share: a.jv.share });
  }
  return out;
}
