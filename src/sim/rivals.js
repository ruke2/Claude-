// ============================================================
//  競合デベロッパーAI — 業績推移・開発活動・干渉
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN, USES } from '../data/city.js';
import { makeBuilding } from '../core/state.js';
import { ttm, marketCap, buildBS } from './finance.js';
import { avgAbility } from '../core/state.js';
import { DEPTS, RANKS } from '../data/hrdata.js';

/** 競合各社の四半期更新 */
export function stepRivals(g, rng, news) {
  const m = g.market;
  const cyc = (m.sentiment - 0.5) * 2;

  for (const rv of g.rivals) {
    // 業績
    const growth = rv.growth / 4 + cyc * 0.012 + rng.normal(0, 0.011);
    rv.lastRev = rv.rev;
    rv.rev = Math.max(10000, Math.round(rv.rev * (1 + growth)));
    const marginBase = rv.op / Math.max(1, rv.lastRev);
    const margin = clamp(marginBase * (1 + cyc * 0.14 + rng.normal(0, 0.035)), 0.01, 0.34);
    rv.lastOp = rv.op;
    rv.op = Math.round(rv.rev * margin);
    rv.np = Math.round(rv.op * (0.62 + rng.range(-0.05, 0.05)));
    rv.equity = Math.round(rv.equity + rv.np * 0.72);
    rv.assets = Math.round(rv.assets * (1 + growth * 0.85));
    rv.debt = Math.max(0, Math.round(rv.assets - rv.equity));
    rv.cash = Math.round(rv.cash + rv.np * 0.5 - rv.rev * 0.02);
    rv.employees = Math.round(rv.employees * (1 + growth * 0.35));
    rv.stock = Math.round(rv.stock * (1 + growth * 1.6 + cyc * 0.03 + rng.normal(0, 0.03)) * 100) / 100;
    rv.momentum = Math.max(0, (rv.momentum || 0) - 0.34);
    rv.history.push({ turn: g.turn, rev: rv.rev, op: rv.op, np: rv.np });
    if (rv.history.length > 60) rv.history.shift();
  }

  // 競合が保有地で進めている開発の竣工
  for (const c of g.cells) {
    if (!c.rivalDev) continue;
    if (g.turn - c.rivalDev.turn < c.rivalDev.quarters) continue;
    const rv = g.rivals.find(r => r.id === c.owner);
    const use = c.rivalDev.use;
    const d = DISTRICTS[c.d];
    const cover = { office: .38, resi: .28, rental: .30, retail: .68, hotel: .36, logi: .76, house: .46, mixed: .40 }[use] || 0.4;
    const floors = Math.max(1, Math.round(c.area * (c.far / 100) * 0.9 / Math.max(1, c.area * cover)));
    c.building = makeBuilding(rng, { use, floors, d: c.d, owner: c.owner, grade: rv && rv.brand > 88 ? 'high' : 'standard', year: g.year });
    c.vacant = false; c.rivalDev = null;
    if (rv && rng.chance(0.5)) {
      news.push({ icon: '🏢', type: 'rival', rival: rv.id, text: `${rv.name}が${d.name}で「${c.building.name}」（${USES[use].name}・地上${floors}階）を竣工させた。` });
    }
  }

  // 競合の新規プロジェクト着手（保有する空地）
  for (const rv of g.rivals) {
    if (!rng.chance(0.22 * rv.aggression)) continue;
    const owned = g.cells.filter(c => c.owner === rv.id && !c.building && !c.rivalDev && c.d);
    if (!owned.length) {
      // 手持ちが無ければ第三者所有地を取得する
      const pool = g.cells.filter(c => c.owner === 'other' && c.d && !c.onSale && c.building && c.building.year < 1996);
      if (pool.length && rng.chance(0.5)) {
        const c = rng.pick(pool);
        c.owner = rv.id; c.building = null; c.vacant = true;
        c.rivalDev = { turn: g.turn, quarters: rng.int(4, 10), use: pickUse(rv, c, rng) };
        rv.lots++;
        if (rng.chance(0.4)) news.push({ icon: '◈', type: 'rival', rival: rv.id, text: `${rv.name}が${DISTRICTS[c.d].name}で用地を取得し、建替え計画を進めている。` });
      }
      continue;
    }
    const c = rng.pick(owned);
    c.rivalDev = { turn: g.turn, quarters: rng.int(4, 10), use: pickUse(rv, c, rng) };
  }

  // 競合からの干渉
  interfere(g, rng, news);
}

function pickUse(rv, c, rng) {
  const d = DISTRICTS[c.d];
  const arr = Object.keys(d.fit).map(u => ({ u, w: (d.fit[u] ?? 0.1) * (rv.focus[u] ?? 0.3) + 0.02 }));
  return rng.weighted(arr).u;
}

/** プレイヤーへの干渉イベント */
function interfere(g, rng, news) {
  const t = ttm(g);
  // 引き抜き
  if (g.staff.length > 12 && rng.chance(0.14)) {
    const cands = g.staff.filter(s => !s.subsidiary && avgAbility(s) > 62 && s.morale < 0.72);
    if (cands.length) {
      const s = rng.pick(cands);
      const rv = rng.pick(g.rivals);
      const resist = clamp01(s.loyalty * 0.6 + s.morale * 0.5 + (g.hrPolicy.programs.welfare ? 0.1 : 0));
      if (!rng.chance(resist)) {
        g.staff.splice(g.staff.indexOf(s), 1);
        news.push({ icon: '🎯', type: 'rival', rival: rv.id, text: `${rv.name}に${DEPTS[s.dept].name}の${RANKS[s.rank].name}・${s.name}が引き抜かれた。` });
      } else {
        news.push({ icon: '🛡', type: 'hr', text: `${s.name}が${rv.name}からのオファーを断り、残留を決めた。` });
      }
    }
  }
  // 大型案件の発表（プレイヤーの地区と競合）
  if (rng.chance(0.18)) {
    const rv = rng.pick(g.rivals);
    const d = DISTRICTS[rng.pick(Object.keys(DISTRICTS))];
    news.push({
      icon: '📰', type: 'rival', rival: rv.id,
      text: rng.pick([
        `${rv.name}が${d.name}で延床${(rng.int(4, 26) * 10000).toLocaleString()}㎡の大型開発計画を発表した。`,
        `${rv.name}が${d.name}の再開発組合に参画。地域の地価が刺激されそうだ。`,
        `${rv.name}が${(rng.int(3, 20) * 100).toLocaleString()}億円規模の物件取得を発表した。`,
        `${rv.name}が通期業績予想を上方修正した。`,
      ]),
    });
  }
  // 買収提案（プレイヤーが上場していて時価総額が小さいとき）
  if (g.company.listed && !g.takeoverOffer && rng.chance(0.05)) {
    const cap = marketCap(g);
    const rv = g.rivals.find(r => r.cash > cap * 1.3 && r.rev > ttm(g).revenue * 2.2);
    if (rv && cap > 0) {
      const premium = rng.range(1.22, 1.55);
      g.takeoverOffer = { rival: rv.id, name: rv.name, price: Math.round(cap * premium), premium, turn: g.turn };
      news.push({ icon: '🦈', type: 'rival', rival: rv.id, text: `${rv.name}が当社に対し、時価総額に${Math.round((premium - 1) * 100)}%のプレミアムを乗せた買収提案を行った。` });
    }
  }
}

/** 業界ランキング（プレイヤーを含む） */
export function ranking(g, key = 'rev') {
  const t = ttm(g);
  const bs = buildBS(g);
  const me = {
    id: 'player', name: g.company.name, short: g.company.name, color: '#e3b558',
    rev: t.revenue, op: t.op, np: t.net, assets: bs.total, equity: bs.equity,
    debt: g.debt, employees: g.staff.length, brand: g.company.brand, isPlayer: true,
    stock: g.company.listed ? Math.round(marketCap(g) / 100) / 100 : 0,
  };
  const all = [...g.rivals.map(r => ({
    id: r.id, name: r.name, short: r.short, color: r.color, rev: r.rev, op: r.op, np: r.np,
    assets: r.assets, equity: r.equity, debt: r.debt, employees: r.employees, brand: r.brand,
    stock: r.stock, tagline: r.tagline, profile: r.profile, focus: r.focus, listed: r.listed,
    history: r.history, style: r.style, aggression: r.aggression,
  })), me];
  all.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  all.forEach((x, i) => x.rank = i + 1);
  return all;
}
