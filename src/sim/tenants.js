// ============================================================
//  テナント企業（リーシング）
//
//    自社の賃貸物件に、名前のある会社が大口で入る。
//    オフィスのテナントは就職先ランキングの40社（`data/employers.js`）から引く。
//    ランキングで見た会社が自社のビルに入居する、という繋がりを作るためである。
//    商業と物流は顔ぶれが違うので `data/tenants.js` に別のマスタを持つ。
//
//    **大口テナントを「良いことだけ」にしないこと。**
//    契約している間は賃料を動かせないので、相場が上がっても据え置きになる。
//    フリーレントの間は賃料が入らない。抜けるときは床が一度に空く。
//    安定と引き換えに上振れを手放す、というのがこの仕組みの肝である。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS } from '../data/city.js';
import { uid } from '../core/state.js';
import { EMPLOYERS } from '../data/employers.js';
import { RETAIL_TENANTS, RETAIL_CATS, LOGI_TENANTS, LOGI_CATS, officeDemand, officeGrade } from '../data/tenants.js';
import { orgPower } from './hr.js';
import { isHome } from './company.js';
import { areaEffect } from './area.js';
import { WEEKS_PER_YEAR } from '../core/time.js';

/** 大口テナントが入る用途 */
export const ANCHOR_USES = ['office', 'retail', 'logi', 'mixed'];

/**
 * 1棟のうち大口テナントに出せる上限。
 * **1棟まるごとを1社に貸さないこと。** 共用部も一般テナントも無くなり、
 * 稼働率という指標そのものが意味を失う。
 */
export const ANCHOR_CAP = 0.62;

/** 同時に抱えられる引き合いの数 */
export const MAX_LEADS = 6;

/** 更新の打診が来るのは満了の何週前か */
const RENEW_LEAD = 26;

/** フリーレントの上限（ヶ月） */
export const FREE_MAX = 12;

/** グレードの質（0〜1） */
const GRADE_Q = { standard: 0.35, high: 0.68, luxury: 0.94 };

/** 建物の格。グレードと築年と駅力で決まる */
export function qualityOf(g, a) {
  const d = DISTRICTS[a.district];
  const aged = Math.max(0, 1 - (a.age || 0) * 0.012);
  return clamp01((GRADE_Q[a.grade] ?? 0.35) * (0.72 + aged * 0.28) + (d ? d.station * 0.12 : 0));
}

/** その物件が結んでいる契約 */
export function tenanciesOf(g, assetId) {
  return (g.tenancies || []).filter(t => t.assetId === assetId);
}

/** 大口テナントが押さえている面積（坪） */
export function anchorArea(g, a) {
  let s = 0;
  for (const t of tenanciesOf(g, a.id)) s += t.area;
  return s;
}

/**
 * まだ大口に出せる面積（坪）。
 * 上限（`ANCHOR_CAP`）と、いま空いている床の両方で頭を押さえる。
 * **空室と無関係に決めないこと。** 満室のビルに大口が入る話が来ると、
 * いま入っている一般テナントはどこへ行ったのか、という話になる
 */
export function roomOf(g, a) {
  const cap = a.nra * ANCHOR_CAP - anchorArea(g, a);
  const vacant = a.nra * (1 - clamp01(a.occupancy || 0)) * 1.25;
  return Math.max(0, Math.min(cap, vacant));
}

/**
 * 各物件の `anchorShare` / `anchorRent` を契約から作り直す。
 * 保有資産の実効賃料（`valuation.js` の `effectiveRent`）と
 * 稼働率の下支え（`sales.js`）がこの2つだけを見ている。
 *
 * **フリーレント中の契約は賃料0で数えること。** 床は押さえているのに
 * 賃料は入らない、という期間を表に出すためである。
 */
export function syncAnchors(g) {
  const byAsset = {};
  for (const t of g.tenancies || []) {
    const b = byAsset[t.assetId] || (byAsset[t.assetId] = { area: 0, rentArea: 0 });
    b.area += t.area;
    b.rentArea += t.area * (g.week < (t.freeUntil || 0) ? 0 : t.rent);
  }
  for (const a of g.assets) {
    const b = byAsset[a.id];
    if (!b || !(a.nra > 0)) { a.anchorShare = 0; a.anchorRent = 0; continue; }
    a.anchorShare = clamp01(b.area / a.nra);
    a.anchorRent = Math.round(b.rentArea / Math.max(1, b.area));
  }
}

/** テナントの候補（用途ごとに顔ぶれが違う） */
function candidates(g, a) {
  const q = qualityOf(g, a);
  const room = roomOf(g, a);
  const taken = new Set(tenanciesOf(g, a.id).map(t => t.tid));
  const out = [];
  // 複合施設はオフィスと商業の両方から来る
  const kinds = a.use === 'mixed' ? ['office', 'retail'] : [a.use];
  for (const kind of kinds) {
    if (kind === 'office') {
      for (const e of EMPLOYERS) {
        const need = officeDemand(e);
        if (taken.has(e.id) || need > room * 1.15) continue;
        const grade = officeGrade(e);
        if (grade > q + 0.24) continue;
        out.push({
          kind: 'office', tid: e.id, name: e.name, icon: '🏢',
          catName: e.ind, need, grade,
          pay: 0.88 + grade * 0.30, term: 5 + Math.round(grade * 5), credit: grade,
        });
      }
    } else {
      const list = kind === 'retail' ? RETAIL_TENANTS : LOGI_TENANTS;
      const cats = kind === 'retail' ? RETAIL_CATS : LOGI_CATS;
      for (const t of list) {
        if (taken.has(t.id) || t.size > room * 1.15) continue;
        if (t.grade > q + 0.24) continue;
        out.push({
          kind, tid: t.id, name: t.name, icon: (cats[t.cat] || {}).icon || '🏬',
          catName: (cats[t.cat] || {}).name || '', need: t.size, grade: t.grade,
          pay: t.pay, term: t.term,
          credit: clamp01(0.32 + t.grade * 0.42 + (t.term >= 10 ? 0.12 : 0)),
        });
      }
    }
  }
  return out;
}

/** 引き合いが来る確率（週あたり） */
function leadChance(g, a, p) {
  const room = roomOf(g, a);
  if (room < 60) return 0;
  const d = DISTRICTS[a.district];
  const fit = d ? (d.fit[a.use] ?? 0.4) : 0.4;
  const dem = g.market.demand[a.use] ?? 1;
  return clamp01(
    Math.min(0.9, room / (a.nra * 0.5)) * 0.10
    * (0.55 + fit * 0.70) * (0.60 + dem * 0.45)
    * (0.72 + p.lease.quality / 200)
    * (0.90 + g.company.brand / 400)
    * (isHome(g, a.district) ? 1.12 : 1)
    * (1 + areaEffect(g, a.district, 'lead')));
}

/**
 * 相手が出せる賃料（月坪円）。
 * 物件の相場賃料（`a.marketRent`）に、テナントの支払い力を掛ける。
 * **素の相場（`marketRentRaw`）から作り直さないこと。**
 * 物件ごとの上振れ・下振れ（`rentIndex`）が抜けて、
 * 一等地のビルにも場末の賃料しか出ない引き合いが来る
 */
function wantRent(g, a, cand, rng) {
  const base = a.marketRent > 0 ? a.marketRent : a.rent;
  const mood = 0.94 + (g.market.demand[a.use] ?? 1) * 0.08;
  return Math.max(1, Math.round(base * cand.pay * mood * rng.range(0.95, 1.06)));
}

/** 引き合いを1件作る */
function makeLead(g, a, rng, cand, renewOf) {
  const room = renewOf ? renewOf.area : roomOf(g, a);
  const area = Math.max(30, Math.round(Math.min(cand.need, room) * (renewOf ? 1 : rng.range(0.78, 1.0))));
  const term = renewOf ? Math.max(3, Math.round(cand.term * 0.8)) : cand.term;
  return {
    id: uid('TN'), assetId: a.id, assetName: a.name, district: a.district,
    kind: cand.kind, tid: cand.tid, name: cand.name, icon: cand.icon, catName: cand.catName,
    area, term, credit: cand.credit, grade: cand.grade,
    want: wantRent(g, a, cand, rng),
    deadline: rng.int(4, 9),
    renewOf: renewOf ? renewOf.id : null,
    offer: null, answerAt: 0, week: g.week,
  };
}

/**
 * 提示条件が受け入れられる確率。
 * 画面にもそのまま出すので、**ここ以外で計算し直さないこと。**
 */
export function acceptChance(g, lead, offer) {
  const a = g.assets.find(x => x.id === lead.assetId);
  if (!a) return 0;
  const p = orgPower(g);
  const months = lead.term * 12;
  // フリーレントは実質賃料を下げる
  const eff = (offer.rent / Math.max(1, lead.want)) * (1 - clamp01((offer.free || 0) / months));
  let c = clamp01(0.60 + (1 - eff) * 2.5);
  const q = qualityOf(g, a);
  c *= clamp01(0.55 + (q - lead.grade) * 1.1) * 1.45;       // 求める格に届いているか
  c *= 0.80 + p.lease.quality / 260;
  c *= 0.88 + g.company.brand / 100 * 0.26;
  if (isHome(g, a.district)) c *= 1.06;
  c *= 1 + areaEffect(g, a.district, 'lead') * 0.6;
  if (lead.renewOf) c *= 1.22;                              // 動くのは相手も面倒である
  return clamp01(c);
}

/** 条件を提示する。返事は社内稟議のぶん1〜3週かかる */
export function respondLead(g, lead, offer, rng) {
  const a = g.assets.find(x => x.id === lead.assetId);
  if (!a) return { ok: false, message: '物件が見つからない' };
  const months = lead.term * 12;
  const free = clamp(Math.round(offer.free || 0), 0, Math.min(FREE_MAX, Math.floor(months * 0.25)));
  const rent = Math.max(1, Math.round(offer.rent));
  lead.offer = { rent, free };
  lead.answerAt = g.week + rng.int(1, 3);
  lead.deadline = Math.max(lead.deadline, lead.answerAt - g.week + 1);
  return { ok: true };
}

/** 引き合いを断る */
export function declineLead(g, lead) {
  const i = (g.leads || []).indexOf(lead);
  if (i >= 0) g.leads.splice(i, 1);
}

/** 契約を結ぶ */
function sign(g, lead, news) {
  const a = g.assets.find(x => x.id === lead.assetId);
  if (!a) return;
  const free = lead.offer.free || 0;
  if (lead.renewOf) {
    const t = (g.tenancies || []).find(x => x.id === lead.renewOf);
    if (t) {
      t.rent = lead.offer.rent;
      t.term = lead.term;
      t.start = g.week;
      t.endWeek = g.week + Math.round(lead.term * WEEKS_PER_YEAR);
      t.freeUntil = g.week + Math.round(free * WEEKS_PER_YEAR / 12);
      t.renewAsked = false;
      t.renewals = (t.renewals || 0) + 1;
      news.push({
        icon: '🤝', type: 'lease', major: true,
        text: `【${a.name}】${lead.name}との賃貸借契約を更新した（${lead.area.toLocaleString()}坪・月坪${lead.offer.rent.toLocaleString()}円・${lead.term}年）。`,
      });
    }
    return;
  }
  g.tenancies.push({
    id: uid('T'), assetId: a.id, kind: lead.kind, tid: lead.tid,
    name: lead.name, icon: lead.icon, catName: lead.catName,
    area: lead.area, rent: lead.offer.rent, term: lead.term, credit: lead.credit,
    start: g.week, endWeek: g.week + Math.round(lead.term * WEEKS_PER_YEAR),
    freeUntil: g.week + Math.round(free * WEEKS_PER_YEAR / 12),
    renewAsked: false, renewals: 0,
  });
  // 名の通った会社が入ると、会社の信用にも効く
  if (lead.credit > 0.78) g.company.brand = clamp(g.company.brand + 0.5, 0, 100);
  news.push({
    icon: '🤝', type: 'lease', major: true,
    text: `【${a.name}】${lead.name}が${lead.area.toLocaleString()}坪を賃借することで合意した`
      + `（月坪${lead.offer.rent.toLocaleString()}円・${lead.term}年・フリーレント${free}ヶ月）。`,
  });
}

/** 契約が切れる（更新せず退去） */
function vacate(g, t, reason, news) {
  const a = g.assets.find(x => x.id === t.assetId);
  const i = g.tenancies.indexOf(t);
  if (i >= 0) g.tenancies.splice(i, 1);
  if (!a) return;
  news.push({
    icon: '📤', type: 'lease', major: true,
    text: `【${a.name}】${t.name}が${t.area.toLocaleString()}坪を退去した（${reason}）。`
      + `貸室の${Math.round(t.area / Math.max(1, a.nra) * 100)}%が一度に空く。`,
  });
}

/** 毎週の処理 */
export function stepTenants(g, rng, news) {
  if (!g.tenancies) g.tenancies = [];
  if (!g.leads) g.leads = [];
  const p = orgPower(g);

  // 物件ごと引き当てを直してから動かす
  syncAnchors(g);

  // --- 既存契約 ---
  for (const t of g.tenancies.slice()) {
    const a = g.assets.find(x => x.id === t.assetId);
    if (!a) { const i = g.tenancies.indexOf(t); if (i >= 0) g.tenancies.splice(i, 1); continue; }
    // 中途解約（業績不振・撤退）。信用の低いテナントほど起きやすい
    if (rng.chance((0.030 / WEEKS_PER_YEAR) * (1.6 - t.credit))) {
      const penalty = Math.round(t.area * t.rent * 6 / 1e6);
      g.cash += penalty;
      g.finance.quarterAcc.revLease += penalty;
      vacate(g, t, `中途解約。違約金${penalty.toLocaleString()}百万円を受領`, news);
      continue;
    }
    // 満了が近づくと更新の打診が来る
    if (!t.renewAsked && g.week >= t.endWeek - RENEW_LEAD) {
      t.renewAsked = true;
      const cand = {
        kind: t.kind, tid: t.tid, name: t.name, icon: t.icon, catName: t.catName,
        need: t.area, grade: t.credit, pay: 0, term: t.term, credit: t.credit,
      };
      // 更新時の支払い力は、いまの賃料と相場の関係から引き直す
      const base = a.marketRent > 0 ? a.marketRent : a.rent;
      cand.pay = clamp(t.rent / Math.max(1, base), 0.55, 1.75);
      const lead = makeLead(g, a, rng, cand, t);
      lead.deadline = Math.max(6, Math.min(RENEW_LEAD - 2, lead.deadline + 8));
      g.leads.push(lead);
      news.push({
        icon: '📄', type: 'lease',
        text: `【${a.name}】${t.name}の賃貸借契約が${Math.round((t.endWeek - g.week) / 4.33)}ヶ月後に満了する。更新条件の提示を求められている。`,
      });
    }
    // 満了。更新していなければ退去
    if (g.week >= t.endWeek) vacate(g, t, '契約期間の満了', news);
  }

  // --- 回答待ちの引き合い ---
  for (const l of g.leads.slice()) {
    if (l.offer && g.week >= l.answerAt) {
      const ok = rng.chance(acceptChance(g, l, l.offer));
      const i = g.leads.indexOf(l);
      if (i >= 0) g.leads.splice(i, 1);
      if (ok) sign(g, l, news);
      else {
        const a = g.assets.find(x => x.id === l.assetId);
        news.push({
          icon: '✖', type: 'lease',
          text: `【${a ? a.name : ''}】${l.name}との${l.renewOf ? '更新' : '入居'}交渉はまとまらなかった`
            + `（提示 月坪${l.offer.rent.toLocaleString()}円／先方の水準 ${l.want.toLocaleString()}円）。`,
        });
      }
      continue;
    }
    if (!l.offer) {
      l.deadline--;
      if (l.deadline <= 0) {
        const i = g.leads.indexOf(l);
        if (i >= 0) g.leads.splice(i, 1);
        const a = g.assets.find(x => x.id === l.assetId);
        news.push({
          icon: '⌛', type: 'lease',
          text: `【${a ? a.name : ''}】${l.name}からの引き合いは、回答が無いまま取り下げられた。`,
        });
      }
    }
  }

  // --- 新規の引き合い ---
  if (g.leads.filter(l => !l.renewOf).length < MAX_LEADS) {
    for (const a of g.assets) {
      if (!ANCHOR_USES.includes(a.use)) continue;
      if (g.leads.some(l => l.assetId === a.id && !l.renewOf)) continue;
      if (!rng.chance(leadChance(g, a, p))) continue;
      const cands = candidates(g, a);
      if (!cands.length) continue;
      const room = roomOf(g, a);
      // 空いている床にちょうど収まる規模のテナントほど来やすい
      const cand = rng.weighted(cands.map(c => ({ c, w: Math.pow(clamp01(c.need / Math.max(1, room)), 0.6) + 0.15 }))).c;
      g.leads.push(makeLead(g, a, rng, cand, null));
      break;                                   // 1週に1件まで
    }
  }

  syncAnchors(g);
}

/** 表示用：テナント収入の内訳 */
export function tenantSummary(g) {
  const ts = g.tenancies || [];
  let area = 0, rentAnnual = 0, free = 0;
  for (const t of ts) {
    area += t.area;
    if (g.week < (t.freeUntil || 0)) free++;
    else rentAnnual += t.area * t.rent * 12 / 1e6;
  }
  const nra = g.assets.filter(a => ANCHOR_USES.includes(a.use)).reduce((s, a) => s + a.nra, 0);
  return { count: ts.length, area, share: nra > 0 ? area / nra : 0, rentAnnual: Math.round(rentAnnual), free };
}
