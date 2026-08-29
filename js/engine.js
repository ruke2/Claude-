/* =========================================================
 *  SOGO SHOSHA - game engine
 *  金額単位: 億円 / 会計は純資産＝現金＋簿価資産－有利子負債 で一貫
 * ======================================================= */
window.ENGINE = (function () {
  const D = window.GAME;
  const SAVE_KEY = 'sogoshosha.save.v1';

  /* ---------------- utils ---------------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function wpick(list, key) {
    let t = 0;
    for (const x of list) t += x[key];
    let r = Math.random() * t;
    for (const x of list) { r -= x[key]; if (r <= 0) return x; }
    return list[list.length - 1];
  }
  let _uid = 1;
  function uid() { return 'd' + (_uid++) + '_' + Math.floor(Math.random() * 1e6); }

  function money(v) {
    const a = Math.abs(v);
    const sg = v < 0 ? '-' : '';
    if (a >= 10000) return sg + (a / 10000).toFixed(a >= 100000 ? 1 : 2) + '兆';
    if (a >= 1000) return sg + Math.round(a).toLocaleString('ja-JP') + '億';
    if (a >= 10) return sg + a.toFixed(0) + '億';
    return sg + a.toFixed(1) + '億';
  }
  function signed(v) { return (v >= 0 ? '+' : '') + money(v); }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }

  /* ---------------- state ---------------- */
  let S = null;

  function ratingScore() {
    const eq = Math.max(1, S.cash + bookAssets() - S.debt);
    const de = S.debt / eq;
    const roeS = clamp((S.roeTTM || 0) * 100 - 6, -12, 16);
    const deS = clamp((1.15 - de) * 13, -20, 10);
    return clamp(S.credit * 0.62 + roeS + deS + corpOf('esg') * 2.2 + 14, 0, 100);
  }
  function rating() {
    const sc = ratingScore();
    for (const r of D.RATINGS) if (sc >= r.min) return r;
    return D.RATINGS[D.RATINGS.length - 1];
  }
  function stage() { return D.STAGES[S.stage]; }
  function scale() { return stage().scale; }
  function dateLabel(y, m) { return y + '年' + m + '月'; }
  function now() { return dateLabel(S.y, S.m); }

  function log(text, kind) {
    S.log.unshift({ t: S.y + '/' + ('0' + S.m).slice(-2), b: text, k: kind || '' });
    if (S.log.length > 160) S.log.length = 160;
  }

  /* 市況ファクター: 対象商品の指数平均 /100 */
  function mfac(comms) {
    if (!comms || !comms.length) return 1;
    let s = 0;
    for (const c of comms) s += S.mk[c];
    return (s / comms.length) / 100;
  }
  function fxFac() { return 0.72 + 0.28 * (S.fx / 145); }

  function newSeg() {
    const o = {};
    D.DIVISIONS.forEach(function (d) {
      o[d.id] = { gross: 0, dividend: 0, reval: 0, impair: 0, deals: 0 };
    });
    return o;
  }
  function seg(divId) {
    if (!S.seg) S.seg = newSeg();
    if (!S.seg[divId]) S.seg[divId] = { gross: 0, dividend: 0, reval: 0, impair: 0, deals: 0 };
    return S.seg[divId];
  }
  function segTotal(x) { return x.gross + x.dividend + x.reval + x.impair; }

  function boostOf(id) { return (S.boost && S.boost[id]) || 0; }
  function corpOf(id) { return (S.corp && S.corp[id]) || 0; }

  function divOf(id) { return S.div[id]; }
  function hasOffice(r) { return S.offices.indexOf(r) >= 0; }

  function capacity() { return Math.min(40, 4 + Math.floor(Math.sqrt(S.staff) * 1.2) + Math.floor(corpOf('hr') * 2.2)); }
  function slotsMax() {
    return clamp(3 + Math.floor(Math.sqrt(S.staff) / 3.5) + Math.floor(S.offices.length / 3) + Math.floor(corpOf('dx')), 3, 11);
  }
  function borrowLimit() { return Math.max(0, equity() * rating().lev - S.debt); }
  function interestRate() { return Math.max(0.004, S.rateBase + rating().spread); }

  function bookAssets() {
    let v = 0;
    for (const a of S.assets) v += a.value;
    for (const a of S.active) {
      if (a.type === 'trade') v += a.capital;
      else if (a.type === 'project') v += a.wip - a.adv;
    }
    return v;
  }
  function equity() { return S.cash + bookAssets() - S.debt; }
  function eqAfterRaw() { return Math.max(1, equity()); }

  /* ---------------- new game ---------------- */
  function newGame(name) {
    _uid = 1;
    S = {
      company: (name || '蒼龍商事').slice(0, 12),
      y: 2026, m: 4, turn: 0,
      stage: 0,
      cash: 75, debt: 0,
      staff: 14, wageRate: 0.012,
      credit: 42,
      offices: ['jp'],
      div: {}, mk: {}, mkPrev: {},
      fx: 148, fxPrev: 148, rateBase: 0.022,
      market: [], active: [], assets: [],
      slots: 3,
      log: [], monthly: [],
      fy: { profit: 0, startEquity: 75, deals: 0, wage: 0, sga: 0, interest: 0, gain: 0 },
      fyHistory: [],
      rivals: D.RIVALS.map(function (r) { return { name: r.name, eq: r.base, g: r.g }; }),
      mod: { impair: 1, creditRisk: 1, delay: 1 },
      stats: { won: 0, lost: 0, done: 0, impair: 0, defaults: 0, cumProfit: 0 },
      lastProfit: 0, lastCapex: 0, lastLedger: null,
      pend: { capex: 0, gain: 0 },
      seg: {}, segPrev: null,
      budget: {}, boost: {}, corp: { dx: 0, hr: 0, esg: 0 },
      shares: 0.30, pbr: 0.85, trust: 52, roeTTM: 0, pbrPrev: 0.85,
      over: false, cleared: false, insolvent: 0,
      pendingEvent: null,
    };
    D.DIVISIONS.forEach(function (d, i) { S.div[d.id] = { lv: i < 2 ? 2 : 1, exp: 0 }; S.boost[d.id] = 0; });
    S.seg = newSeg();
    D.COMM_KEYS.forEach(function (k) { S.mk[k] = 100 + randn() * 6; S.mkPrev[k] = S.mk[k]; });
    S.slots = slotsMax();
    for (let i = 0; i < 6; i++) S.market.push(genDeal());
    log('創業。東京に本社を構えた。', 'gold');
    return S;
  }

  /* ---------------- deal generation ---------------- */
  function typeWeights() {
    const s = S.stage;
    if (s === 0) return [{ t: 'trade', w: 76 }, { t: 'project', w: 12 }, { t: 'investment', w: 9 }, { t: 'concession', w: 3 }];
    if (s === 1) return [{ t: 'trade', w: 62 }, { t: 'project', w: 16 }, { t: 'investment', w: 14 }, { t: 'concession', w: 8 }];
    if (s === 2) return [{ t: 'trade', w: 50 }, { t: 'project', w: 18 }, { t: 'investment', w: 18 }, { t: 'concession', w: 14 }];
    return [{ t: 'trade', w: 40 }, { t: 'project', w: 18 }, { t: 'investment', w: 22 }, { t: 'concession', w: 20 }];
  }

  function genDeal(big) {
    const sc = scale();
    const type = wpick(typeWeights(), 'w').t;
    const dv = wpick(D.DIVISIONS.map(function (x) {
      return { d: x, w: 1 + boostOf(x.id) * 0.7 };
    }), 'w').d;
    // 拠点のある地域が出やすい
    let reg;
    if (Math.random() < 0.45 && S.offices.length) reg = pick(S.offices);
    else reg = pick(D.REGIONS).id;
    const item = pick(D.ITEMS[type][dv.id]);
    const sm = (big ? rnd(2.4, 4.0) : rnd(0.75, 1.35)) * (1 + boostOf(dv.id) * 0.20);
    const rg = D.REGION_BY_ID[reg];

    const d = {
      id: uid(), type: type, div: dv.id, region: reg, big: !!big,
      name: rg.name + '／' + item,
      comms: dv.comms.slice(),
      ttl: ri(2, 5),
      rivals: ri(1, 5),
      diff: rnd(0.45, 1.45) + (type === 'concession' ? 0.25 : 0) + (big ? 0.35 : 0),
    };

    if (type === 'trade') {
      d.volume = sc * rnd(30, 110) * sm;
      d.marginRate = rnd(0.025, 0.075) * (1 + boostOf(dv.id) * 0.10);
      d.months = ri(1, 4);
      d.capital = d.volume * rnd(0.16, 0.30);
      d.risk = rnd(0.006, 0.042);
      d.upfront = d.capital;
      d.exposure = d.capital;
    } else if (type === 'project') {
      d.contract = sc * rnd(48, 200) * sm;
      d.marginRate = rnd(0.05, 0.17) * (1 + boostOf(dv.id) * 0.10);
      d.months = ri(6, 20);
      d.adv = d.contract * rnd(0.12, 0.25);
      d.cost = d.contract * (1 - d.marginRate);
      d.upfront = 0;
      d.exposure = d.cost * 0.45;
      d.risk = rnd(0.02, 0.07);
    } else if (type === 'concession') {
      d.invest = sc * rnd(60, 270) * sm;
      d.yieldRate = rnd(0.0095, 0.021) * (1 + boostOf(dv.id) * 0.08);
      d.life = ri(48, 140);
      d.upfront = d.invest;
      d.exposure = d.invest;
      d.risk = rnd(0.03, 0.09);
    } else {
      d.invest = sc * rnd(38, 200) * sm;
      d.yieldRate = rnd(0.0062, 0.0128) * (1 + boostOf(dv.id) * 0.08);
      d.growth = rnd(0.0022, 0.0068);
      d.upfront = d.invest;
      d.exposure = d.invest;
      d.risk = rnd(0.005, 0.02);
    }
    return d;
  }

  function refreshMarket() {
    for (let i = S.market.length - 1; i >= 0; i--) {
      S.market[i].ttl--;
      if (S.market[i].ttl <= 0) S.market.splice(i, 1);
    }
    const target = 7 + Math.min(5, S.offices.length - 1) + Math.min(4, S.stage);
    while (S.market.length < target) S.market.push(genDeal());
  }

  /* ---------------- bidding ---------------- */
  function winScore(d, stanceIdx) {
    const st = D.STANCES[stanceIdx];
    let s = 46;
    s += divOf(d.div).lv * 4.2;
    s += boostOf(d.div) * 8;
    s += rating().win;
    s += S.credit * 0.13;
    s += hasOffice(d.region) ? 10 : 0;
    s -= d.rivals * 4.6;
    s -= d.diff * 12;
    s += st.win;
    // 与信・規模の余裕
    const room = (equity() + borrowLimit());
    const need = d.exposure;
    if (room > 0) s += clamp(6 * (1 - need / room), -14, 6);
    return clamp(s, 4, 93) / 100;
  }

  function bidCheck(d) {
    if (S.slots <= 0) return '今月の商談枠を使い切っている';
    if (S.active.length >= capacity() && (d.type === 'trade' || d.type === 'project'))
      return '人員が足りず、これ以上の案件は回せない（現行 ' + S.active.length + '/' + capacity() + '）';
    if (d.upfront > S.cash) return '手元資金が不足（必要 ' + money(d.upfront) + ' / 現金 ' + money(S.cash) + '）';
    const eq = equity();
    if (eq > 0 && d.exposure > eq * 0.62 + borrowLimit() * 0.4)
      return '単一案件としてリスクが大きすぎる（与信枠超過）';
    if (d.type === 'project' && d.cost / d.months > S.cash * 0.5 + borrowLimit() * 0.2)
      return '毎月の工事原価を賄えない資金繰りだ';
    return null;
  }

  function bid(dealId, stanceIdx) {
    const i = S.market.findIndex(function (x) { return x.id === dealId; });
    if (i < 0) return { ok: false, msg: '案件が見つからない' };
    const d = S.market[i];
    const err = bidCheck(d);
    if (err) return { ok: false, msg: err };

    S.slots--;
    const p = winScore(d, stanceIdx);
    const won = Math.random() < p;
    S.market.splice(i, 1);
    const st = D.STANCES[stanceIdx];

    if (!won) {
      S.stats.lost++;
      divOf(d.div).exp += 0.35;
      log('「' + d.name + '」失注。競合が条件で上回った。', 'down');
      return { ok: true, won: false, prob: p, deal: d };
    }

    S.stats.won++;
    S.credit = clamp(S.credit + 0.55, 0, 100);
    const dd = divOf(d.div);
    dd.exp += d.big ? 2.5 : 1;
    checkLevel(d.div);

    if (d.type === 'trade') {
      S.cash -= d.capital;
      S.active.push({
        id: d.id, type: 'trade', name: d.name, div: d.div, region: d.region, comms: d.comms,
        volume: d.volume, marginRate: d.marginRate * st.mult, capital: d.capital,
        months: d.months, prog: 0, risk: d.risk, big: d.big,
        mkAtBid: mfac(d.comms), fxAtBid: S.fx,
      });
    } else if (d.type === 'project') {
      S.cash += d.adv;
      S.active.push({
        id: d.id, type: 'project', name: d.name, div: d.div, region: d.region, comms: d.comms,
        contract: d.contract * (0.82 + 0.18 * st.mult),
        cost: d.cost, months: d.months, prog: 0, wip: 0, adv: d.adv,
        risk: d.risk, delays: 0, big: d.big,
      });
    } else {
      S.cash -= d.invest;
      S.assets.push({
        id: d.id, type: d.type, name: d.name, div: d.div, region: d.region, comms: d.comms,
        basis: d.invest, value: d.invest, yieldRate: d.yieldRate * (0.85 + 0.15 * st.mult),
        growth: d.growth || 0, life: d.life || 0, age: 0, cum: 0, impaired: 0, big: d.big,
      });
    }
    log('「' + d.name + '」を獲得（' + st.n + '条件）。', 'up');
    return { ok: true, won: true, prob: p, deal: d };
  }

  function checkLevel(divId) {
    const dd = S.div[divId];
    while (dd.lv < 25 && dd.exp >= dd.lv * 3) {
      dd.exp -= dd.lv * 3;
      dd.lv++;
      log(D.DIV_BY_ID[divId].name + ' が Lv.' + dd.lv + ' に成長した。', 'gold');
    }
  }

  /* ---------------- management actions ---------------- */
  function hireBlock() { return [10, 25, 100, 400, 1500, 6000][S.stage]; }
  function hireCost() { return hireBlock() * 0.022; }
  function hire() {
    const c = hireCost();
    if (S.cash < c) return { ok: false, msg: '採用費が足りない' };
    S.cash -= c; capex(c);
    S.staff += hireBlock();
    S.slots = Math.min(slotsMax(), S.slots + (slotsMax() > S.slots ? 1 : 0));
    log(hireBlock() + '名を採用した（採用費 ' + money(c) + '）。', '');
    return { ok: true };
  }

  function upgradeCost(divId) {
    const lv = S.div[divId].lv;
    return scale() * (2.5 + lv * lv * 0.55);
  }
  function upgrade(divId) {
    const c = upgradeCost(divId);
    if (S.div[divId].lv >= 25) return { ok: false, msg: '既に最高水準' };
    if (S.cash < c) return { ok: false, msg: '資金が足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c);
    S.div[divId].lv++;
    log(D.DIV_BY_ID[divId].name + ' に ' + money(c) + ' を投資、Lv.' + S.div[divId].lv + ' へ。', 'gold');
    return { ok: true };
  }

  function officeCost() { return scale() * 16 + 5; }
  function openOffice(regId) {
    if (hasOffice(regId)) return { ok: false, msg: '既に拠点がある' };
    const c = officeCost();
    if (S.cash < c) return { ok: false, msg: '資金が足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c);
    S.offices.push(regId);
    S.credit = clamp(S.credit + 1.5, 0, 100);
    log(D.REGION_BY_ID[regId].name + 'に拠点を開設した。', 'gold');
    return { ok: true };
  }

  function borrow(amt) {
    amt = Math.max(0, Math.min(amt, borrowLimit()));
    if (amt <= 0) return { ok: false, msg: '借入枠がない' };
    S.cash += amt; S.debt += amt;
    log('銀行団から ' + money(amt) + ' を調達（金利 ' + pct(interestRate()) + '）。', '');
    return { ok: true };
  }
  function repay(amt) {
    amt = Math.max(0, Math.min(amt, Math.min(S.debt, S.cash)));
    if (amt <= 0) return { ok: false, msg: '返済できる資金・債務がない' };
    S.cash -= amt; S.debt -= amt;
    S.credit = clamp(S.credit + amt / Math.max(1, equity()) * 6, 0, 100);
    log(money(amt) + ' を繰上返済した。', '');
    return { ok: true };
  }

  /* 年次の資源配分 */
  function budgetPool() { return Math.max(0, S.cash * 0.65); }
  function budgetUnit() { return Math.max(0.1, Math.round(budgetPool() / 16 * 10) / 10); }
  function allocateBudget(map) {
    let total = 0;
    for (const k in map) total += Math.max(0, map[k] || 0);
    total = Math.min(total, Math.max(0, S.cash));
    D.DIVISIONS.forEach(function (d) {
      S.boost[d.id] = clamp((map[d.id] || 0) / (scale() * 5), 0, 3);
    });
    D.BUDGET_CORP.forEach(function (c) {
      S.corp[c.id] = Math.min(6, S.corp[c.id] * 0.86 + (map[c.id] || 0) / (scale() * 9));
    });
    S.cash -= total; capex(total);
    S.budget = map;
    if (total > 0) log('年度予算 ' + money(total) + ' を配分した。', 'gold');
    else log('今年度は投資を見送った。各本部の地力が落ちていく。', 'down');
    save();
    return total;
  }

  function sellAsset(id) {
    const i = S.assets.findIndex(function (a) { return a.id === id; });
    if (i < 0) return { ok: false, msg: '見つからない' };
    const a = S.assets[i];
    const proceeds = a.value * rnd(0.88, 1.06);
    S.cash += proceeds;
    S.assets.splice(i, 1);
    const g = proceeds - a.value;
    if (!S.pend) S.pend = { capex: 0, gain: 0 };
    S.pend.gain += g;
    log('「' + a.name + '」を ' + money(proceeds) + ' で売却（' + signed(proceeds - a.basis) + ' vs 簿価取得原価）。', g >= 0 ? 'up' : 'down');
    return { ok: true, proceeds: proceeds };
  }

  /* ---------------- monthly step ---------------- */
  function stepMarket() {
    D.COMM_KEYS.forEach(function (k) {
      const c = D.COMMODITIES[k];
      S.mkPrev[k] = S.mk[k];
      const mr = Math.log(100 / S.mk[k]) * 0.035;
      const sh = randn() * c.vol * 0.55 + c.drift;
      S.mk[k] = clamp(S.mk[k] * Math.exp(mr + sh), 32, 340);
    });
    S.fxPrev = S.fx;
    S.fx = clamp(S.fx * Math.exp(Math.log(145 / S.fx) * 0.04 + randn() * 0.018), 90, 260);
    S.rateBase = clamp(S.rateBase + randn() * 0.0012 + (0.022 - S.rateBase) * 0.05, 0.002, 0.075);
  }

  function rollEvent() {
    if (Math.random() > 0.30) return null;
    const e = wpick(D.EVENTS, 'w');
    if (e.shock) for (const k in e.shock) S.mk[k] = clamp(S.mk[k] * (1 + e.shock[k]), 32, 340);
    if (e.fx) S.fx = clamp(S.fx * (1 + e.fx), 90, 260);
    if (e.rate) S.rateBase = clamp(S.rateBase + e.rate, 0.002, 0.09);
    if (e.credit) S.credit = clamp(S.credit + e.credit, 0, 100);
    if (e.impairRisk) S.mod.impair = e.impairRisk;
    if (e.creditRisk) S.mod.creditRisk = e.creditRisk;
    if (e.delayRisk) S.mod.delay = e.delayRisk;
    if (e.wageUp) S.wageRate *= (1 + e.wageUp);
    if (e.bigDeal) { S.market.push(genDeal(true)); }
    log('【' + e.title + '】', 'info');
    return e;
  }

  function newLedger() {
    const g = S.pend ? S.pend.gain : 0;
    if (S.pend) S.pend.gain = 0;
    return { trade: 0, project: 0, dividend: 0, reval: 0, impair: 0, gain: g,
             wage: 0, sga: 0, interest: 0, defaults: 0 };
  }
  function sumLedger(L) { let t = 0; for (const k in L) t += L[k]; return t; }
  function capex(v) { if (!S.pend) S.pend = { capex: 0, gain: 0 }; S.pend.capex += v; }

  function processActive(L) {
    for (let i = S.active.length - 1; i >= 0; i--) {
      const a = S.active[i];
      if (a.type === 'trade') {
        a.prog++;
        if (a.prog >= a.months) {
          // 与信リスク
          if (Math.random() < a.risk * S.mod.creditRisk) {
            const loss = a.capital * rnd(0.35, 0.85);
            S.cash += a.capital - loss;
            L.defaults -= loss; seg(a.div).gross -= loss;
            S.stats.defaults++;
            S.credit = clamp(S.credit - 4, 0, 100);
            log('「' + a.name + '」で相手方がデフォルト。' + money(loss) + ' の貸倒損失。', 'down');
          } else {
            const mkNow = mfac(a.comms);
            const swing = mkNow / a.mkAtBid;
            const fxs = 1 + (S.fx / a.fxAtBid - 1) * (a.region === 'jp' ? 0.2 : 0.7);
            let profit = a.volume * a.marginRate * (0.35 + 0.65 * swing) * fxs;
            profit *= rnd(0.85, 1.15);
            S.cash += a.capital + profit;
            L.trade += profit; seg(a.div).gross += profit; seg(a.div).deals++;
            S.fy.deals++;
            S.stats.done++;
            divOf(a.div).exp += 0.6; checkLevel(a.div);
            log('「' + a.name + '」決済完了。取扱高 ' + money(a.volume) + '、利益 ' + signed(profit) + '。',
              profit >= 0 ? 'up' : 'down');
          }
          S.active.splice(i, 1);
        }
      } else if (a.type === 'project') {
        // 遅延判定
        if (Math.random() < a.risk * S.mod.delay * 0.5) {
          a.months++; a.delays++;
          a.cost *= 1.03;
          log('「' + a.name + '」で工程遅延。原価が膨らんだ。', 'down');
        }
        const c = a.cost / a.months;
        S.cash -= c; a.wip += c;
        a.prog++;
        if (a.prog >= a.months) {
          const remain = a.contract - a.adv;
          S.cash += remain;
          const profit = a.contract - a.wip;
          L.project += profit; seg(a.div).gross += profit; seg(a.div).deals++;
          S.active.splice(i, 1);
          S.fy.deals++; S.stats.done++;
          divOf(a.div).exp += 1.5; checkLevel(a.div);
          S.credit = clamp(S.credit + 1.5, 0, 100);
          log('「' + a.name + '」竣工・引渡し。請負 ' + money(a.contract) + '、利益 ' + signed(profit) + '。',
            profit >= 0 ? 'up' : 'down');
        }
      }
    }
  }

  function processAssets(L) {
    for (let i = S.assets.length - 1; i >= 0; i--) {
      const a = S.assets[i];
      a.age++;
      const mf = mfac(a.comms);
      const sens = a.type === 'concession' ? 1.0 : 0.35;
      const mAdj = 1 + (mf - 1) * sens;

      // 配当・持分利益
      const div = a.value * a.yieldRate * clamp(mAdj, 0.15, 2.2) * fxFac() * (a.region === 'jp' ? 1 : 1.05);
      S.cash += div; L.dividend += div; a.cum += div; seg(a.div).dividend += div;

      // 評価
      let target;
      if (a.type === 'concession') {
        const dep = a.life ? Math.max(0, 1 - a.age / a.life) : 1;
        target = a.basis * dep * clamp(mAdj, 0.2, 2.4) * (1 - a.impaired);
      } else {
        target = a.basis * Math.pow(1 + a.growth, a.age) * clamp(mAdj, 0.4, 2.0) * (1 - a.impaired);
      }
      const nv = a.value + (target - a.value) * 0.22;
      L.reval += nv - a.value; seg(a.div).reval += nv - a.value;
      a.value = Math.max(0, nv);

      // 減損
      if (a.value < a.basis * 0.68 &&
          Math.random() < 0.09 * S.mod.impair * (1 - Math.min(0.60, corpOf('esg') * 0.16))) {
        const w = a.value * rnd(0.18, 0.42);
        a.value -= w; a.impaired = clamp(a.impaired + 0.12, 0, 0.8);
        L.impair -= w; seg(a.div).impair -= w;
        S.stats.impair++;
        S.credit = clamp(S.credit - 3, 0, 100);
        log('「' + a.name + '」で減損損失 ' + money(w) + ' を計上。', 'down');
      }

      if (a.type === 'concession' && a.life && a.age >= a.life) {
        S.cash += a.value; L.gain += 0; // 残存簿価を回収（売却相当、損益ゼロ）
        log('「' + a.name + '」が可採期間を終了。累計配当 ' + money(a.cum) + '。', 'info');
        S.assets.splice(i, 1);
      }
    }
  }

  function financeCosts(L) {
    const wage = S.staff * S.wageRate;
    const sga = (S.offices.length * 0.5 * Math.sqrt(scale()) + Math.max(0, equity()) * 0.0006 + 0.25)
      * (1 - Math.min(0.35, corpOf('dx') * 0.10));
    const int = S.debt * interestRate() / 12;
    S.cash -= (wage + sga + int);
    L.wage -= wage; L.sga -= sga; L.interest -= int;
  }

  function rescue(L) {
    // 現金不足 → 借入 → 資産売却 → 危機
    if (S.cash >= 0) return;
    const need = -S.cash + 5;
    const b = Math.min(need, borrowLimit());
    if (b > 0) { S.cash += b; S.debt += b; log('資金繰り悪化により ' + money(b) + ' を緊急借入。', 'down'); }
    while (S.cash < 0 && S.assets.length) {
      S.assets.sort(function (x, y) { return x.value - y.value; });
      const a = S.assets[0];
      const proceeds = a.value * rnd(0.62, 0.82);
      S.cash += proceeds; L.gain += proceeds - a.value;
      S.assets.shift();
      S.credit = clamp(S.credit - 2, 0, 100);
      log('資金確保のため「' + a.name + '」を投売り（' + money(proceeds) + '）。', 'down');
    }
    if (S.cash < 0) {
      S.credit = clamp(S.credit - 4, 0, 100);
      log('債務不履行の瀬戸際。取引銀行が態度を硬化させている。', 'down');
    }
  }

  function stepRivals() {
    const boom = (S.mk.crude + S.mk.iron + S.mk.copper) / 300;
    S.rivals.forEach(function (r) {
      r.eq *= (1 + r.g * (0.6 + 0.8 * boom) + randn() * 0.016);
      r.eq = Math.max(500, r.eq);
    });
  }

  /* ---------------- 株式市場 ---------------- */
  function roeTrailing() {
    const n = Math.min(12, S.monthly.length);
    if (!n) return 0;
    let p = 0;
    for (let i = S.monthly.length - n; i < S.monthly.length; i++) p += S.monthly[i].p;
    return (p * (12 / n)) / Math.max(1, equity());
  }
  function growthTrailing() {
    const n = S.monthly.length;
    if (n < 13) return 0;
    const past = S.monthly[n - 13].e, nowE = S.monthly[n - 1].e;
    if (past <= 0) return 0;
    return nowE / past - 1;
  }
  function stepEquityMarket() {
    S.roeTTM = roeTrailing();
    const g = clamp(growthTrailing(), -0.6, 1.4);
    let t = 0.55 + S.roeTTM * 5.0 + (S.trust - 50) * 0.008 + g * 0.55 + corpOf('esg') * 0.03;
    t = clamp(t, 0.28, 3.4);
    S.pbrPrev = S.pbr;
    S.pbr = clamp(S.pbr + (t - S.pbr) * 0.13 + randn() * 0.018, 0.22, 4.0);
    S.trust = clamp(S.trust + (48 - S.trust) * 0.008, 0, 100);
  }
  function mcap() { return Math.max(0, equity()) * S.pbr; }
  function sharePrice() { return mcap() / Math.max(0.0001, S.shares); }
  function bps() { return Math.max(0, equity()) / Math.max(0.0001, S.shares); }

  function ranking() {
    const list = S.rivals.map(function (r) { return { name: r.name, eq: r.eq, me: false }; });
    list.push({ name: S.company, eq: equity(), me: true });
    list.sort(function (a, b) { return b.eq - a.eq; });
    return list;
  }
  function myRank() {
    const l = ranking();
    return l.findIndex(function (x) { return x.me; }) + 1;
  }

  /* ---------------- advance one month ---------------- */
  function advance() {
    if (S.over || S.cleared) return { over: true };
    const eqBefore = equity();
    const out = { event: null, fy: null, promote: null, over: false, cleared: false };

    S.m++; if (S.m > 12) { S.m = 1; S.y++; }
    S.turn++;

    // modifier decay
    S.mod.impair += (1 - S.mod.impair) * 0.5;
    S.mod.creditRisk += (1 - S.mod.creditRisk) * 0.5;
    S.mod.delay += (1 - S.mod.delay) * 0.5;

    stepMarket();
    out.event = rollEvent();

    const L = newLedger();
    S.lastLedger = L;
    processActive(L);
    processAssets(L);
    financeCosts(L);
    rescue(L);

    // 信用の自然回復・減衰と財務規律（D/Eレバレッジは格付を蝕む）
    S.credit += (46 - S.credit) * 0.012;
    const de = S.debt / Math.max(1, eqAfterRaw());
    if (de > 1.0) S.credit -= Math.min(12, (de - 1.0) * 4.0);
    else S.credit += 0.35 * (1 - de);
    S.credit = clamp(S.credit, 0, 100);

    // 予算をつけなかった本部は地力を失う
    D.DIVISIONS.forEach(function (d) {
      const dd = S.div[d.id], b = boostOf(d.id);
      if (b > 0) dd.exp += b * 0.35;
      else {
        dd.exp -= 0.3;
        if (dd.exp < -dd.lv * 2 && dd.lv > 1) {
          dd.lv--; dd.exp = 0;
          log(D.DIV_BY_ID[d.id].name + ' が Lv.' + dd.lv + ' へ後退した。投資を絞りすぎている。', 'down');
        }
      }
      checkLevel(d.id);
    });
    S.credit = clamp(S.credit + corpOf('esg') * 0.07 + corpOf('hr') * 0.05, 0, 100);

    stepRivals();
    refreshMarket();
    S.slots = slotsMax();

    const eqAfter = equity();
    const profit = sumLedger(L);
    S.lastProfit = profit;
    S.lastCapex = S.pend.capex;
    S.pend.capex = 0;
    S.stats.cumProfit += profit;
    S.fy.profit += profit;
    S.fy.wage = (S.fy.wage || 0) + L.wage;
    S.fy.sga = (S.fy.sga || 0) + L.sga;
    S.fy.interest = (S.fy.interest || 0) + L.interest;
    S.fy.gain = (S.fy.gain || 0) + L.gain;
    S.monthly.push({ t: S.y + '/' + S.m, p: profit, e: eqAfter });
    if (S.monthly.length > 240) S.monthly.shift();
    stepEquityMarket();

    // 債務超過チェック
    if (eqAfter < 0) {
      S.insolvent++;
      log('債務超過（' + S.insolvent + 'ヶ月連続）。抜本的な立て直しが必要だ。', 'down');
      if (S.insolvent >= 4) { S.over = true; out.over = true; }
    } else S.insolvent = 0;

    // 決算（3月）
    if (S.m === 3) {
      const eqAvg = Math.max(1, (S.fy.startEquity + eqAfter) / 2);
      const rec = {
        fy: S.y, profit: S.fy.profit, deals: S.fy.deals,
        eqStart: S.fy.startEquity, eqEnd: eqAfter, rank: myRank(), rating: rating().label,
        roe: S.fy.profit / eqAvg, pbr: S.pbr, price: sharePrice(), mcap: mcap(),
        trust: S.trust, staff: S.staff, seg: S.seg,
        wage: S.fy.wage || 0, sga: S.fy.sga || 0, interest: S.fy.interest || 0, gain: S.fy.gain || 0,
        debt: S.debt, cash: S.cash, shares: S.shares,
      };
      S.fyHistory.push(rec);
      if (S.fyHistory.length > 40) S.fyHistory.shift();
      S.segPrev = S.seg; S.seg = newSeg();
      out.fy = rec;
    }

    // 昇格
    if (!S.over && eqAfter >= stage().goal) {
      if (S.stage >= D.STAGES.length - 1) {
        S.cleared = true; out.cleared = true;
      } else {
        S.stage++;
        S.credit = clamp(S.credit + 5, 0, 100);
        out.promote = D.STAGES[S.stage];
        log('【昇格】' + D.STAGES[S.stage].name + ' へ。', 'gold');
        if (S.pbr >= 1.0) {
          const add = S.shares * 0.32;
          const raise = add * sharePrice() * 0.94;
          S.shares += add; S.cash += raise;
          out.raise = raise;
          log('公募増資により ' + money(raise) + ' を調達（PBR ' + S.pbr.toFixed(2) + ' 倍）。', 'gold');
        }
        for (let i = 0; i < 2; i++) S.market.push(genDeal());
      }
    }
    if (S.stage === D.STAGES.length - 1 && myRank() === 1) {
      S.cleared = true; out.cleared = true;
    }
    save();
    return out;
  }

  /* 決算時の株主還元: 配当性向 + 自社株買い */
  function payoutMax() { return Math.max(0, S.cash * 0.6); }
  function payout(opt) {
    if (typeof opt === 'string') opt = { ratio: opt === 'none' ? 0 : opt === 'high' ? 0.6 : 0.3, buyback: 0 };
    const profit = S.fy.profit;
    let div = profit > 0 ? profit * clamp(opt.ratio || 0, 0, 1) : 0;
    div = Math.min(div, payoutMax());
    let bb = Math.min(Math.max(0, opt.buyback || 0), Math.max(0, S.cash - div) * 0.8);

    S.cash -= (div + bb); capex(div + bb);

    if (bb > 0) {
      const p = sharePrice();
      if (p > 0.01) S.shares = Math.max(0.02, S.shares - bb / p);
      S.pbr = clamp(S.pbr * 1.04, 0.22, 4.0);
    }

    const r = profit > 0 ? div / profit : 0;
    S.trust = clamp(S.trust + (r >= 0.5 ? 9 : r >= 0.3 ? 6 : r > 0 ? 2 : -7) + (bb > 0 ? 4 : 0), 0, 100);
    S.credit = clamp(S.credit + (r >= 0.3 ? 3 : r > 0 ? 1 : -2), 0, 100);

    if (div > 0 && bb > 0) log('配当 ' + money(div) + '、自社株買い ' + money(bb) + ' を実施。', 'gold');
    else if (div > 0) log('配当 ' + money(div) + '（配当性向 ' + pct(r, 0) + '）を実施。', 'gold');
    else if (bb > 0) log('自社株買い ' + money(bb) + ' を実施。', 'gold');
    else log('無配・還元なしを決定。株主の目は厳しい。', 'down');

    S.fy = { profit: 0, startEquity: equity(), deals: 0, wage: 0, sga: 0, interest: 0, gain: 0 };
    save();
    return { div: div, buyback: bb };
  }

  /* ---------------- save / load ---------------- */
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      S = JSON.parse(raw);
      if (!S || !S.div) return null;
      migrate();
      return S;
    } catch (e) { return null; }
  }
  /* 旧セーブに新フィールドを補う */
  function migrate() {
    if (!S.seg) S.seg = newSeg();
    if (!S.boost) S.boost = {};
    D.DIVISIONS.forEach(function (d) { if (S.boost[d.id] == null) S.boost[d.id] = 0; });
    if (!S.corp) S.corp = { dx: 0, hr: 0, esg: 0 };
    if (!S.budget) S.budget = {};
    if (S.shares == null) S.shares = 0.30;
    if (S.pbr == null) S.pbr = 0.85;
    if (S.pbrPrev == null) S.pbrPrev = S.pbr;
    if (S.trust == null) S.trust = 52;
    if (S.roeTTM == null) S.roeTTM = 0;
    if (!S.pend) S.pend = { capex: 0, gain: 0 };
    if (S.lastCapex == null) S.lastCapex = 0;
  }

  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ } }

  /* ---------------- public ---------------- */
  return {
    get S() { return S; },
    newGame: newGame, advance: advance, bid: bid, bidCheck: bidCheck, winScore: winScore,
    hire: hire, hireBlock: hireBlock, hireCost: hireCost,
    upgrade: upgrade, upgradeCost: upgradeCost,
    openOffice: openOffice, officeCost: officeCost,
    borrow: borrow, repay: repay, borrowLimit: borrowLimit, interestRate: interestRate,
    sellAsset: sellAsset, payout: payout,
    equity: equity, bookAssets: bookAssets, rating: rating, ratingScore: ratingScore,
    stage: stage, scale: scale,
    seg: seg, segTotal: segTotal, boostOf: boostOf, corpOf: corpOf,
    budgetPool: budgetPool, budgetUnit: budgetUnit, allocateBudget: allocateBudget,
    mcap: mcap, sharePrice: sharePrice, bps: bps, payoutMax: payoutMax,
    capacity: capacity, slotsMax: slotsMax, mfac: mfac, hasOffice: hasOffice,
    ranking: ranking, myRank: myRank, now: now,
    save: save, load: load, hasSave: hasSave, wipe: wipe,
    money: money, signed: signed, pct: pct, clamp: clamp,
  };
})();
