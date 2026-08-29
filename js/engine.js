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
  function fiscalYear() { return S.m >= 4 ? S.y + 1 : S.y; }
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

  /* ---- 中期経営計画：重点戦略カードの効果 ---- */
  function planCards() { return (S.plan && S.plan.cards) || []; }
  function hasCard(id) { return planCards().indexOf(id) >= 0; }
  function fx(k, base) {
    let v = base;
    planCards().forEach(function (id) {
      const c = D.CARD_BY_ID[id];
      if (c && c.fx && c.fx[k] != null) v *= c.fx[k];
    });
    return v;
  }
  function fxAdd(k) {
    let v = 0;
    planCards().forEach(function (id) {
      const c = D.CARD_BY_ID[id];
      if (c && c.fx && c.fx[k] != null) v += c.fx[k];
    });
    return v;
  }
  function regionWin(regId) {
    let v = 0;
    planCards().forEach(function (id) {
      const c = D.CARD_BY_ID[id];
      if (!c || !c.prefRegions) return;
      v += c.prefRegions.indexOf(regId) >= 0 ? (c.prefWin || 0) : (c.otherWin || 0);
    });
    return v;
  }
  function regionSize(regId) {
    let v = 1;
    planCards().forEach(function (id) {
      const c = D.CARD_BY_ID[id];
      if (c && c.prefRegions && c.prefRegions.indexOf(regId) >= 0) v *= (c.prefSize || 1);
    });
    return v;
  }
  function divCardW(divId) {
    let v = 1;
    planCards().forEach(function (id) {
      const c = D.CARD_BY_ID[id];
      if (c && c.divBoost && c.divBoost[divId]) v *= c.divBoost[divId];
    });
    return v;
  }
  /* 投資額の累計（中計の投資目標に効く） */
  function countInvest(v) {
    if (v <= 0) return;
    if (S.plan) S.plan.cumInvest = (S.plan.cumInvest || 0) + v;
    S.cumInvest = (S.cumInvest || 0) + v;
  }

  /* ---- 組織形態 ---- */
  function org() { return D.ORG_BY_ID[S.org] || D.ORGS[1]; }
  function ofx(k, base) { const v = org().fx[k]; return v == null ? base : base * v; }
  function ofxAdd(k) { return org().fx[k] || 0; }
  function orgSwitchCost() { return Math.max(3, Math.max(0, equity()) * 0.035); }
  function canSwitchOrg(id) {
    const o = D.ORG_BY_ID[id];
    if (!o) return '組織形態が不正';
    if (id === S.org) return '既にその体制だ';
    if (S.stage < o.minStage) return D.STAGES[o.minStage].name + ' 以上でなければ移行できない';
    if (fiscalYear() - S.orgSwitchFY < 3) return '前回の移行から3年は経たないと現場がもたない';
    if (S.cash < orgSwitchCost()) return '移行コストが足りない（必要 ' + money(orgSwitchCost()) + '）';
    return null;
  }
  function switchOrg(id) {
    const err = canSwitchOrg(id);
    if (err) return { ok: false, msg: err };
    const c = orgSwitchCost();
    S.cash -= c; capex(c);
    S.org = id; S.orgSwitchFY = fiscalYear();
    S.morale = clamp(S.morale - 8, 0, 100);
    log('組織を' + D.ORG_BY_ID[id].name + 'へ移行した（移行費用 ' + money(c) + '）。現場は当面混乱する。', 'gold');
    save();
    return { ok: true };
  }
  /* カンパニー制の自律収益 */
  function autonomyIncome() {
    if (!ofxAdd('autonomy')) return 0;
    let v = 0;
    D.DIVISIONS.forEach(function (d) {
      const pt = divSalesPt(d.id);
      if (pt > 0) v += pt / 100 * scale() * 1.5 * (1 + boostOf(d.id) * 0.2);
    });
    return v;
  }

  function boostOf(id) { return ((S.boost && S.boost[id]) || 0) + (S.planBonus || 0) * 0.25; }
  function corpOf(id) { return (S.corp && S.corp[id]) || 0; }

  function divOf(id) { return S.div[id]; }
  function hasOffice(r) { return S.offices.indexOf(r) >= 0; }

  function capacity() { return Math.min(40, 4 + Math.floor(Math.sqrt(S.staff) * 1.2) + Math.floor(corpOf('hr') * 2.2) + fxAdd('cap')
      + Math.floor(S.people.reduce(function (a, p) { return a + p.lead / 100 * roleW(p); }, 0) * 1.1))
      * (org().fx.capMul || 1) | 0; }
  function slotsMax() {
    let ppl = 0;
    S.people.forEach(function (p) { ppl += roleW(p); });
    return clamp(2 + Math.floor(Math.sqrt(S.staff) / 6) + Math.floor(S.offices.length / 3)
      + Math.floor(corpOf('dx')) + fxAdd('slots') + ofxAdd('slots') + Math.floor(ppl / 1.9), 3, 14);
  }
  function borrowLimit() { return Math.max(0, equity() * fx('lev', rating().lev) - S.debt); }
  function interestRate() { return Math.max(0.004, S.rateBase + rating().spread - fxAdd('spread') - traitBest('spread')); }

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
      plan: null, planNo: 0, planHistory: [], cumInvest: 0, planBonus: 0,
      people: [], gradQueue: [], morale: 62, peopleNews: [], hunted: 0,
      ma: [], maStats: { done: 0, pmiOk: 0, pmiNg: 0, exits: 0 }, tobCooldown: 0,
      org: 'div', orgSwitchFY: 0, gov: 72, scandals: 0, ceoFY: 2027, ceoTerms: 0,
      over: false, cleared: false, insolvent: 0,
      pendingEvent: null,
    };
    D.DIVISIONS.forEach(function (d, i) { S.div[d.id] = { lv: i < 2 ? 2 : 1, exp: 0 }; S.boost[d.id] = 0; });
    S.seg = newSeg();
    D.COMM_KEYS.forEach(function (k) { S.mk[k] = 100 + randn() * 6; S.mkPrev[k] = S.mk[k]; });
    // 創業メンバー3名
    ['energy', 'metals', 'food'].forEach(function (dv, i) {
      const p = genPerson({ tier: 'founder', div: dv });
      p.role = i === 0 ? 3 : 1;
      S.people.push(p);
    });
    S.slots = slotsMax();
    for (let i = 0; i < 6; i++) S.market.push(genDeal());
    log('創業。東京に本社を構えた。', 'gold');
    return S;
  }

  /* ---------------- 人材 ---------------- */
  function genPerson(o) {
    o = o || {};
    const female = Math.random() < 0.32;
    const name = pick(D.SURNAMES) + ' ' + pick(female ? D.GIVEN_F : D.GIVEN_M);
    const tier = o.tier || 'career';
    let age, lo, hi;
    if (tier === 'grad') { age = ri(27, 31); lo = 18; hi = 42; }
    else if (tier === 'hunt') { age = ri(38, 52); lo = 58; hi = 92; }
    else if (tier === 'founder') { age = ri(33, 44); lo = 34; hi = 58; }
    else { age = ri(31, 46); lo = 34; hi = 70; }
    const q = o.q || 1;
    function ab() { return Math.round(clamp(rnd(lo, hi) * q, 5, 99)); }
    const traitPool = tier === 'grad'
      ? D.TRAITS.map(function (t) { return { t: t, w: t.id === 'none' ? 70 : t.w * 0.5 }; })
      : D.TRAITS.map(function (t) { return { t: t, w: t.id === 'none' ? (tier === 'hunt' ? 6 : 24) : t.w }; });
    return {
      id: uid(), name: name, face: pick(female ? D.FACES_F : D.FACES_M), female: female,
      age: age, tone: pick(D.TONES).id,
      div: o.div || pick(D.DIVISIONS).id, region: null, role: 0,
      sales: ab(), eye: ab(), lead: ab(),
      trait: wpick(traitPool, 'w').t.id,
      joinFY: S ? fiscalYear() : 2026, promoFY: S ? fiscalYear() : 2026,
    };
  }
  function toneOf(p) { return D.TONES.filter(function (t) { return t.id === p.tone; })[0] || D.TONES[0]; }
  function traitOf(p) { return D.TRAIT_BY_ID[p.trait] || D.TRAIT_BY_ID.none; }
  function roleW(p) { return D.ROLE_W[p.role] || 0.45; }
  function personPower(p) { return (p.sales + p.eye + p.lead) / 3; }
  function personCost(p) { return (0.014 + p.role * 0.011) * Math.pow(scale(), 0.45); }
  function rosterCost() { let c = 0; S.people.forEach(function (p) { c += personCost(p); }); return c; }
  function rosterMax() { return 24; }
  function divPeople(divId) { return S.people.filter(function (p) { return p.div === divId; }); }
  function divHead(divId) {
    return S.people.filter(function (p) { return p.div === divId && p.role >= 3; })
      .sort(function (a, b) { return b.lead - a.lead; })[0] || null;
  }
  /* 特性の最大値（同じ特性が複数いても効果は重ねない） */
  function traitBest(key) {
    let v = 0;
    S.people.forEach(function (p) {
      const t = traitOf(p);
      if (t[key] != null && t[key] > v) v = t[key];
    });
    return v;
  }
  function traitMin(key, base) {
    let v = base;
    S.people.forEach(function (p) {
      const t = traitOf(p);
      if (t[key] != null && t[key] < v) v = t[key];
    });
    return v;
  }
  function hasTrait(id) { return S.people.some(function (p) { return p.trait === id; }); }

  /* 本部の営業力（落札力に効く） */
  function divSalesPt(divId) {
    const ps = divPeople(divId);
    if (!ps.length) return -9;           // 人がいない本部はまともに戦えない
    let v = 0;
    ps.forEach(function (p) { v += p.sales / 100 * roleW(p); });
    return Math.min(34, v * 9) + (divHead(divId) ? 0 : -5);
  }
  function divLeadPt(divId) {
    let v = 0;
    divPeople(divId).forEach(function (p) { v += p.lead / 100 * roleW(p); });
    return v;
  }
  function eyePt() {
    let v = 0;
    S.people.forEach(function (p) { v += p.eye / 100 * roleW(p); });
    return v;
  }
  /* 案件ごとの人材ボーナス */
  function peopleWin(d) {
    let v = divSalesPt(d.div);
    S.people.forEach(function (p) {
      const t = traitOf(p);
      if (t.region && t.region === d.region && p.div === d.div) v += t.win;
      if (t.bigWin && d.big && p.div === d.div) v += t.bigWin;
      if (p.region && p.region === d.region) v += 6;
    });
    return v;
  }
  function divTraitMargin(divId) {
    let v = 0;
    divPeople(divId).forEach(function (p) {
      const t = traitOf(p);
      if (t.div === divId && t.margin) v = Math.max(v, t.margin);
    });
    return v;
  }
  /* 幹部の厚みは実現利益そのものを動かす（−25%〜+35%） */
  function divExec(divId) {
    return 1 + clamp(divSalesPt(divId) / 100, -0.25, 0.35);
  }
  function divSniff(divId) {
    let v = 1;
    divPeople(divId).forEach(function (p) { if (traitOf(p).sniff) v = Math.max(v, traitOf(p).sniff); });
    return v;
  }

  function pnews(text, kind, face) {
    S.peopleNews.unshift({ t: S.y + '/' + ('0' + S.m).slice(-2), b: text, k: kind || '', f: face || '' });
    if (S.peopleNews.length > 60) S.peopleNews.length = 60;
    log(text, kind);
  }

  /* ---- 配属・任命・駐在・昇進 ---- */
  function findPerson(id) { return S.people.filter(function (p) { return p.id === id; })[0]; }
  function assignDiv(id, divId) {
    const p = findPerson(id); if (!p) return { ok: false, msg: '見つからない' };
    p.div = divId; p.region = null;
    log(p.name + ' を ' + D.DIV_BY_ID[divId].name + ' に配属した。', '');
    save(); return { ok: true };
  }
  function appointHead(id) {
    const p = findPerson(id); if (!p) return { ok: false, msg: '見つからない' };
    if (p.role >= 3) return { ok: false, msg: '既に本部長級' };
    S.people.forEach(function (q) { if (q.div === p.div && q.role === 3) q.role = 2; });
    p.role = 3; p.promoFY = fiscalYear();
    pnews(p.name + ' を ' + D.DIV_BY_ID[p.div].name + ' の本部長に任命した。「' + toneOf(p).promo + '」', 'gold', p.face);
    save(); return { ok: true };
  }
  function dispatchTo(id, regId) {
    const p = findPerson(id); if (!p) return { ok: false, msg: '見つからない' };
    if (regId && !hasOffice(regId)) return { ok: false, msg: 'その地域に拠点がない' };
    p.region = regId || null;
    if (regId) log(p.name + ' を ' + D.REGION_BY_ID[regId].name + ' に駐在させた。', '');
    else log(p.name + ' を本社に呼び戻した。', '');
    save(); return { ok: true };
  }
  function promotePerson(id) {
    const p = findPerson(id); if (!p) return { ok: false, msg: '見つからない' };
    if (p.role >= 4) return { ok: false, msg: 'これ以上の役職はない' };
    p.role++; p.promoFY = fiscalYear();
    S.morale = clamp(S.morale + 1.5, 0, 100);
    pnews(p.name + ' が ' + D.ROLES[p.role] + ' に昇進。「' + toneOf(p).promo + '」', 'gold', p.face);
    save(); return { ok: true };
  }
  function promoteSlots() { return 1 + Math.floor(S.staff / 220); }

  /* ---- 採用 ---- */
  function gradCost(n) { return n * 0.014 * Math.pow(scale(), 0.42); }
  function hireGrads(n) {
    const c = gradCost(n);
    if (n <= 0) return { ok: true, n: 0 };
    if (S.cash < c) return { ok: false, msg: '採用費が足りない' };
    S.cash -= c; capex(c);
    S.staff += n;
    S.gradQueue.push({ fy: fiscalYear() + 4, n: n });
    pnews(n + '名の新卒を採用した。幹部として立つのは4年後になる。', '', '🌱');
    save(); return { ok: true, n: n, cost: c };
  }
  function careerCost() { return 1.2 * Math.pow(scale(), 0.5) + 0.6; }
  function careerCandidates() {
    return [0, 1, 2].map(function () { return genPerson({ tier: 'career', q: rnd(0.85, 1.12) }); });
  }
  function hireCareer(p) {
    const c = careerCost();
    if (S.people.length >= rosterMax()) return { ok: false, msg: '幹部の枠がいっぱいだ（' + rosterMax() + '名）' };
    if (S.cash < c) return { ok: false, msg: '採用コストが足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c);
    p.joinFY = fiscalYear(); p.promoFY = fiscalYear();
    S.people.push(p);
    pnews(p.name + '（' + p.age + '）がキャリア採用で入社。「' + toneOf(p).join + '」', 'up', p.face);
    save(); return { ok: true };
  }
  function huntCost() { return 5.5 * Math.pow(scale(), 0.5) + 2; }
  function headhunt() {
    const c = huntCost();
    if (S.people.length >= rosterMax()) return { ok: false, msg: '幹部の枠がいっぱいだ（' + rosterMax() + '名）' };
    if (S.cash < c) return { ok: false, msg: '資金が足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c);
    const prob = clamp(0.42 + S.credit * 0.004 + S.morale * 0.002, 0.2, 0.9);
    if (Math.random() > prob) {
      S.credit = clamp(S.credit - 2, 0, 100);
      pnews('ヘッドハントは不調に終わった。業界に話が漏れ、体裁が悪い。', 'down', '🎯');
      save(); return { ok: true, won: false, prob: prob };
    }
    const p = genPerson({ tier: 'hunt', q: rnd(1.0, 1.15) });
    p.joinFY = fiscalYear(); p.promoFY = fiscalYear(); p.role = 2;
    S.people.push(p);
    pnews(pick(S.rivals).name + ' の ' + p.name + '（' + p.age + '）を引き抜いた。「' + toneOf(p).join + '」', 'gold', p.face);
    save(); return { ok: true, won: true, person: p, prob: prob };
  }

  /* ---- 月次：士気と離職 ---- */
  function stepPeople() {
    const tgt = 45 + clamp((S.roeTTM || 0) * 100, -22, 22) + (S.trust - 50) * 0.2
      + corpOf('hr') * 3 + (hasTrait('charmer') ? 4 : 0);
    S.morale = clamp(S.morale + (clamp(tgt, 5, 95) - S.morale) * 0.12, 0, 100);

    const retain = 1 - Math.min(0.5, traitBest('retain'));
    for (let i = S.people.length - 1; i >= 0; i--) {
      const p = S.people[i];
      const stale = Math.max(0, fiscalYear() - p.promoFY);
      let f = 0.004 * (1 + (65 - S.morale) / 45) * (1 + stale * 0.07)
        * (1 + personPower(p) / 260) * retain;
      if (p.role >= 3) f *= 0.7;
      if (Math.random() < clamp(f, 0, 0.06)) {
        S.people.splice(i, 1);
        pnews(p.name + '（' + D.ROLES[p.role] + '）が退職。「' + toneOf(p).leave + '」', 'down', p.face);
        S.morale = clamp(S.morale - 2.5, 0, 100);
      }
    }
  }

  /* ---- 年次：成長・定年・新卒パイプライン ---- */
  function annualPeople() {
    const out = { retired: [], graduated: [], grown: 0 };
    const g = 1 + corpOf('hr') * 0.16 + fxAdd('hrYear');
    for (let i = S.people.length - 1; i >= 0; i--) {
      const p = S.people[i];
      p.age++;
      if (p.age >= 63) {
        S.people.splice(i, 1);
        out.retired.push(p);
        pnews(p.name + '（' + p.age + '・' + D.ROLES[p.role] + '）が退任。長い勤めだった。', 'info', p.face);
        continue;
      }
      const af = p.age < 32 ? 1.7 : p.age < 40 ? 1.2 : p.age < 50 ? 0.7 : 0.28;
      const inc = function (v) { return Math.round(clamp(v + g * af * rnd(1.2, 3.4) * (p.region ? 1.35 : 1), 1, 99)); };
      p.sales = inc(p.sales); p.eye = inc(p.eye); p.lead = inc(p.lead);
      out.grown++;
    }
    const fy = fiscalYear();
    const per = Math.max(4, hireBlock());
    for (let i = S.gradQueue.length - 1; i >= 0; i--) {
      const q = S.gradQueue[i];
      if (q.fy > fy) continue;
      const n = Math.min(4, Math.floor(q.n / per));
      for (let k = 0; k < n && S.people.length < rosterMax(); k++) {
        const p = genPerson({ tier: 'grad', q: rnd(0.9, 1.15) });
        p.joinFY = fy; p.promoFY = fy;
        S.people.push(p);
        out.graduated.push(p);
        pnews(p.name + '（' + p.age + '）が幹部候補として頭角を現した。「' + toneOf(p).join + '」', 'up', p.face);
      }
      S.gradQueue.splice(i, 1);
    }
    return out;
  }

  /* ---------------- M&A ---------------- */
  function genTarget() {
    const dv = pick(D.DIVISIONS);
    const sc = scale();
    const na = sc * rnd(25, 190);
    const trueYield = rnd(0.060, 0.200);
    const hidden = Math.random() < 0.34 ? na * rnd(0.05, 0.28) : 0;
    return {
      id: uid(),
      name: pick(D.MA_PREFIX) + pick(D.MA_BIZ[dv.id]),
      div: dv.id,
      region: Math.random() < 0.45 ? 'jp' : pick(D.REGIONS).id,
      listed: Math.random() < 0.45,
      netAssets: na,
      trueProfit: na * trueYield,                       // 年間の実力純利益
      shownProfit: na * trueYield * rnd(0.75, 1.45),    // 表面上の数字
      hidden: hidden,
      rivals: ri(0, 3),
      ttl: ri(2, 5),
      dd: false,
    };
  }
  function refreshMA() {
    if (S.stage < 1) { S.ma = []; return; }
    for (let i = S.ma.length - 1; i >= 0; i--) {
      S.ma[i].ttl--;
      if (S.ma[i].ttl <= 0) S.ma.splice(i, 1);
    }
    const target = Math.min(5, S.stage + 1);
    while (S.ma.length < target) S.ma.push(genTarget());
  }
  function findTarget(id) { return S.ma.filter(function (t) { return t.id === id; })[0]; }

  function ddCost(t) { return t.netAssets * 0.022 * (1 - Math.min(0.5, eyePt() * 0.07)); }
  function runDD(id) {
    const t = findTarget(id);
    if (!t) return { ok: false, msg: '見つからない' };
    if (t.dd) return { ok: false, msg: '実施済み' };
    const c = ddCost(t);
    if (S.cash < c) return { ok: false, msg: 'DD費用が足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c);
    t.dd = true;
    log('「' + t.name + '」のデューデリジェンスを実施（' + money(c) + '）。', '');
    save();
    return { ok: true, cost: c };
  }

  function maPrice(t, oi) { return t.netAssets * D.MA_OFFERS[oi].k; }
  function maWin(t, oi) {
    let s = 52 + D.MA_OFFERS[oi].win;
    s -= t.rivals * 9;
    s += rating().win + S.credit * 0.10;
    s += divSalesPt(t.div) * 0.3;
    s += t.listed ? -8 : 0;
    return clamp(s, 3, 96) / 100;
  }
  function maCheck(t, oi) {
    const p = maPrice(t, oi);
    if (p > S.cash) return '手元資金が不足（必要 ' + money(p) + ' / 現金 ' + money(S.cash) + '）';
    if (p > Math.max(1, equity()) * 0.55 + borrowLimit() * 0.35) return '会社の体力に対して大きすぎる買収だ';
    return null;
  }
  function acquire(id, oi) {
    const t = findTarget(id);
    if (!t) return { ok: false, msg: '見つからない' };
    const err = maCheck(t, oi);
    if (err) return { ok: false, msg: err };
    const price = maPrice(t, oi);
    const p = maWin(t, oi);
    S.ma.splice(S.ma.indexOf(t), 1);
    if (Math.random() > p) {
      log('「' + t.name + '」の買収は競合に競り負けた。', 'down');
      return { ok: true, won: false, prob: p, target: t };
    }
    S.cash -= price; countInvest(price);
    const goodwill = price - t.netAssets;
    // DDを省くと簿外債務をそのまま掴む
    const surprise = t.dd ? 0 : t.hidden;
    const dvm = D.DIV_BY_ID[t.div];
    S.assets.push({
      id: t.id, type: 'company', name: t.name, div: t.div, region: t.region,
      comms: dvm.comms.slice(),
      basis: price, value: price - surprise,
      goodwill: goodwill, netAssets: t.netAssets,
      profitBase: t.trueProfit / 12, growth: rnd(0.0040, 0.0110),
      yieldRate: t.trueProfit / 12 / Math.max(1, price),
      pmiLeft: 12, pmiLeader: null, pmiDone: false, synergy: 0, ddDone: t.dd,
      age: 0, cum: 0, impaired: 0, life: 0,
    });
    S.maStats.done++;
    S.credit = clamp(S.credit + 1.5, 0, 100);
    log('「' + t.name + '」を ' + money(price) + ' で買収（のれん ' + money(goodwill) + '）。', 'gold');
    if (surprise > 0) {
      log('DDを省いたツケで、' + money(surprise) + ' の簿外債務が発覚した。', 'down');
      S.credit = clamp(S.credit - 4, 0, 100);
    }
    save();
    return { ok: true, won: true, prob: p, target: t, price: price, goodwill: goodwill, surprise: surprise };
  }

  function setPMILeader(assetId, personId) {
    const a = S.assets.filter(function (x) { return x.id === assetId; })[0];
    if (!a || a.type !== 'company') return { ok: false, msg: '見つからない' };
    S.assets.forEach(function (x) { if (x.pmiLeader === personId && x.id !== assetId) x.pmiLeader = null; });
    a.pmiLeader = personId || null;
    const p = personId ? findPerson(personId) : null;
    if (p) pnews(p.name + ' を「' + a.name + '」の統合責任者に指名した。', 'gold', p.face);
    save();
    return { ok: true };
  }
  function pmiChance(a) {
    const p = a.pmiLeader ? findPerson(a.pmiLeader) : null;
    let c = 0.30;
    if (p) c += p.lead / 220 + (traitOf(p).pmi || 0);
    if (a.ddDone) c += 0.12;
    c += corpOf('hr') * 0.03 + S.morale * 0.0015;
    c -= Math.min(0.25, a.goodwill / Math.max(1, a.netAssets) * 0.25);
    return clamp(c, 0.05, 0.95);
  }
  function divSynergy(divId) {
    let v = 0;
    S.assets.forEach(function (a) { if (a.type === 'company' && a.div === divId) v += a.synergy; });
    return Math.min(0.30, v * 0.09) * (org().fx.synergy || 1);
  }
  function exitCompany(id) {
    const i = S.assets.findIndex(function (a) { return a.id === id; });
    if (i < 0) return { ok: false, msg: '見つからない' };
    const a = S.assets[i];
    if (!a.pmiDone) return { ok: false, msg: '統合が終わっていない会社は売れない' };
    const mult = 1 + a.synergy * 0.22 + a.age * 0.0022;
    const proceeds = a.value * clamp(mult, 0.7, 1.9) * rnd(0.93, 1.08);
    S.cash += proceeds;
    S.assets.splice(i, 1);
    S.pend.gain += proceeds - a.value;
    S.maStats.exits++;
    log('「' + a.name + '」を ' + money(proceeds) + ' で売却（取得原価比 ' + signed(proceeds - a.basis) + '）。', proceeds >= a.basis ? 'up' : 'down');
    save();
    return { ok: true, proceeds: proceeds };
  }

  /* ---------------- deal generation ---------------- */
  function typeWeights() {
    const s = S.stage;
    let b;
    if (s === 0) b = [76, 12, 9, 3];
    else if (s === 1) b = [62, 16, 14, 8];
    else if (s === 2) b = [50, 18, 18, 14];
    else b = [40, 18, 22, 20];
    return [
      { t: 'trade', w: b[0] * fx('tradeW', 1) },
      { t: 'project', w: b[1] },
      { t: 'investment', w: b[2] * fx('invW', 1) },
      { t: 'concession', w: b[3] * fx('concW', 1) },
    ];
  }

  function genDeal(big) {
    const sc = scale();
    const type = wpick(typeWeights(), 'w').t;
    const dv = wpick(D.DIVISIONS.map(function (x) {
      return { d: x, w: (1 + boostOf(x.id) * 0.7) * divCardW(x.id) * divSniff(x.id) };
    }), 'w').d;
    // 拠点のある地域が出やすい
    let reg;
    if (Math.random() < 0.45 && S.offices.length) reg = pick(S.offices);
    else reg = pick(D.REGIONS).id;
    const item = pick(D.ITEMS[type][dv.id]);
    const sm = (big ? rnd(2.4, 4.0) : rnd(0.75, 1.35)) * (1 + boostOf(dv.id) * 0.20)
      * fx('sizeAll', 1) * regionSize(reg);
    const rg = D.REGION_BY_ID[reg];

    const d = {
      id: uid(), type: type, div: dv.id, region: reg, big: !!big,
      name: rg.name + '／' + item,
      comms: dv.comms.slice(),
      ttl: ri(2, 5),
      rivals: ri(1, 5) + fxAdd('rivals'),
      diff: rnd(0.45, 1.45) + (type === 'concession' ? 0.25 : 0) + (big ? 0.35 : 0),
    };

    if (type === 'trade') {
      d.volume = sc * rnd(30, 110) * sm;
      d.marginRate = rnd(0.025, 0.075) * (1 + boostOf(dv.id) * 0.10) * fx('margin', 1) * (1 + divTraitMargin(dv.id) + divSynergy(dv.id));
      d.months = ri(1, 4);
      d.capital = d.volume * rnd(0.16, 0.30);
      d.risk = rnd(0.006, 0.042);
      d.upfront = d.capital;
      d.exposure = d.capital;
    } else if (type === 'project') {
      d.contract = sc * rnd(48, 200) * sm;
      d.marginRate = rnd(0.05, 0.17) * (1 + boostOf(dv.id) * 0.10) * (1 + divTraitMargin(dv.id) + divSynergy(dv.id));
      d.months = ri(6, 20);
      d.adv = d.contract * rnd(0.12, 0.25);
      d.cost = d.contract * (1 - d.marginRate);
      d.upfront = 0;
      d.exposure = d.cost * 0.45;
      d.risk = rnd(0.02, 0.07);
    } else if (type === 'concession') {
      d.invest = sc * rnd(60, 270) * sm;
      d.yieldRate = rnd(0.0095, 0.021) * (1 + boostOf(dv.id) * 0.08) * fx('concYield', 1)
        * (dv.id === 'energy' ? fx('fossilYield', 1) : 1);
      d.life = ri(48, 140);
      d.upfront = d.invest;
      d.exposure = d.invest;
      d.risk = rnd(0.03, 0.09);
    } else {
      d.invest = sc * rnd(38, 200) * sm;
      d.yieldRate = rnd(0.0062, 0.0128) * (1 + boostOf(dv.id) * 0.08);
      d.growth = rnd(0.0022, 0.0068) * fx('margin', 1);
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
    if (Math.random() < fxAdd('bigChance')) S.market.push(genDeal(true));
  }

  /* ---------------- bidding ---------------- */
  function winScore(d, stanceIdx) {
    const st = D.STANCES[stanceIdx];
    let s = 46;
    s += divOf(d.div).lv * 4.2;
    s += boostOf(d.div) * 8;
    s += regionWin(d.region);
    s += peopleWin(d);
    s += divSynergy(d.div) * 40;
    s += (S.morale - 60) * 0.16;
    s += rating().win;
    s += S.credit * 0.13;
    s += hasOffice(d.region) ? 10 : 0;
    s -= d.rivals * 4.6;
    s -= d.diff * 12;
    s += st.win < 0 ? st.win * (1 - traitBest('stance')) : st.win;
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
      S.cash -= d.invest; countInvest(d.invest);
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
    S.cash -= c; capex(c); countInvest(c);
    S.div[divId].lv++;
    log(D.DIV_BY_ID[divId].name + ' に ' + money(c) + ' を投資、Lv.' + S.div[divId].lv + ' へ。', 'gold');
    return { ok: true };
  }

  function officeCost() { return fx('officeCost', scale() * 16 + 5); }
  function openOffice(regId) {
    if (hasOffice(regId)) return { ok: false, msg: '既に拠点がある' };
    const c = officeCost();
    if (S.cash < c) return { ok: false, msg: '資金が足りない（必要 ' + money(c) + '）' };
    S.cash -= c; capex(c); countInvest(c);
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
  function budgetPool() { return ofx('budget', Math.max(0, S.cash * (0.65 + (S.planBonus || 0) * 0.12))); }
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
    S.cash -= total; capex(total); countInvest(total);
    S.budget = map;
    if (total > 0) log('年度予算 ' + money(total) + ' を配分した。', 'gold');
    else log('今年度は投資を見送った。各本部の地力が落ちていく。', 'down');
    save();
    return total;
  }

  /* ---------------- 中期経営計画 ---------------- */
  function planTargetOptions() {
    const eq = Math.max(1, equity());
    const last = S.fyHistory.length ? S.fyHistory[S.fyHistory.length - 1].profit : eq * 0.10;
    const base = Math.max(eq * 0.06, last, 1);
    return {
      profit: [base * 3.6, base * 7.5, base * 14.0],
      roe: [0.15, 0.26, 0.40],
      invest: [eq * 1.05, eq * 2.10, eq * 3.60],
    };
  }
  function formulatePlan(tiers, cards) {
    const opt = planTargetOptions();
    S.planNo = (S.planNo || 0) + 1;
    S.plan = {
      no: S.planNo,
      startFY: fiscalYear() + 1, endFY: fiscalYear() + 3,
      tiers: tiers,
      targets: {
        profit: opt.profit[tiers.profit],
        roe: opt.roe[tiers.roe],
        invest: opt.invest[tiers.invest],
      },
      cards: cards.slice(0, 2),
      cumInvest: 0,
    };
    log('第' + S.planNo + '次中期経営計画（' + S.plan.startFY + '〜' + S.plan.endFY + '年3月期）を策定した。', 'gold');
    save();
    return S.plan;
  }
  function evaluatePlan(rec) {
    const p = S.plan;
    if (!p) return null;
    const res = {
      no: p.no, startFY: p.startFY, endFY: p.endFY, cards: p.cards.slice(),
      items: [
        { id: 'profit', target: p.targets.profit, actual: rec.profit, ok: rec.profit >= p.targets.profit },
        { id: 'roe', target: p.targets.roe, actual: rec.roe, ok: rec.roe >= p.targets.roe },
        { id: 'invest', target: p.targets.invest, actual: p.cumInvest || 0, ok: (p.cumInvest || 0) >= p.targets.invest },
      ],
    };
    res.count = res.items.filter(function (x) { return x.ok; }).length;
    const hard = (p.tiers.profit + p.tiers.roe + p.tiers.invest) / 6;
    if (res.count === 3) {
      S.trust = clamp(S.trust + 12 + hard * 10, 0, 100);
      S.credit = clamp(S.credit + 6 + hard * 4, 0, 100);
      S.pbr = clamp(S.pbr * (1.15 + hard * 0.18), 0.22, 4.0);
      res.gain = 0.30 + hard * 0.50;
      res.msg = '全項目を達成。市場は当社の実行力を認め、投資余力と現場の勢いが積み上がった。';
      res.tone = 'up';
    } else if (res.count === 2) {
      S.trust = clamp(S.trust + 5, 0, 100);
      S.credit = clamp(S.credit + 2, 0, 100);
      res.gain = 0.12;
      res.msg = '概ね計画線。ただし積み残しは記憶される。';
      res.tone = '';
    } else if (res.count === 1) {
      S.trust = clamp(S.trust - 5, 0, 100);
      res.gain = -0.20;
      res.msg = '未達が目立つ。説明責任を問う声が出ている。';
      res.tone = 'warn';
    } else {
      S.trust = clamp(S.trust - (14 + hard * 8), 0, 100);
      S.credit = clamp(S.credit - 6, 0, 100);
      S.pbr = clamp(S.pbr * 0.78, 0.22, 4.0);
      res.gain = -0.60;
      res.msg = '全項目未達。株主は経営陣の姿勢そのものを疑い始めた。';
      res.tone = 'down';
    }
    S.planBonus = clamp((S.planBonus || 0) + res.gain, 0, 1.2);
    res.bonus = S.planBonus;
    log('第' + p.no + '次中計 ' + res.count + '/3 達成。' + res.msg, res.tone === 'up' ? 'gold' : res.tone === 'down' ? 'down' : 'info');
    S.planHistory.push(res);
    S.plan = null;
    save();
    return res;
  }
  function planProgress() {
    if (!S.plan) return null;
    const t = S.plan.targets;
    return {
      no: S.plan.no, endFY: S.plan.endFY, cards: S.plan.cards,
      yearsLeft: Math.max(0, S.plan.endFY - fiscalYear() + 1),
      profit: { cur: S.fy.profit, target: t.profit },
      roe: { cur: S.roeTTM, target: t.roe },
      invest: { cur: S.plan.cumInvest || 0, target: t.invest },
    };
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
            profit *= rnd(0.85, 1.15) * divExec(a.div);
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
          const profit = (a.contract - a.wip) * (a.contract > a.wip ? divExec(a.div) : 1);
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

  /* 買収した事業会社: PMI → 稼働 → のれん減損 */
  function processCompany(a, L) {
    a.age++;
    const mAdj = 1 + (mfac(a.comms) - 1) * 0.30;
    if (!a.pmiDone) {
      a.pmiLeft--;
      const d0 = a.profitBase * 0.30 * clamp(mAdj, 0.3, 1.6);
      S.cash += d0; L.dividend += d0; a.cum += d0; seg(a.div).dividend += d0;
      if (a.pmiLeft <= 0) {
        a.pmiDone = true;
        if (Math.random() < pmiChance(a)) {
          a.synergy = rnd(0.70, 1.30);
          S.maStats.pmiOk++;
          S.credit = clamp(S.credit + 3, 0, 100);
          S.trust = clamp(S.trust + 3, 0, 100);
          log('「' + a.name + '」の統合が完了。シナジーが立ち上がった。', 'up');
        } else {
          a.synergy = rnd(0, 0.25);
          const w = a.goodwill * rnd(0.55, 1.0);
          a.value = Math.max(0, a.value - w);
          a.impaired = clamp(a.impaired + 0.30, 0, 0.9);
          L.impair -= w; seg(a.div).impair -= w;
          S.maStats.pmiNg++; S.stats.impair++;
          S.credit = clamp(S.credit - 6, 0, 100);
          S.trust = clamp(S.trust - 8, 0, 100);
          log('「' + a.name + '」の統合に失敗。のれん ' + money(w) + ' を減損した。', 'down');
        }
      }
      return;
    }
    const d = a.profitBase * (1 + a.synergy * 0.55) * clamp(mAdj, 0.25, 2.0) * fxFac();
    S.cash += d; L.dividend += d; a.cum += d; seg(a.div).dividend += d;
    const target = a.basis * Math.pow(1 + a.growth * (1 + a.synergy * 0.5), a.age)
      * clamp(mAdj, 0.5, 1.9) * (1 - a.impaired);
    const nv = a.value + (target - a.value) * 0.18;
    L.reval += nv - a.value; seg(a.div).reval += nv - a.value;
    a.value = Math.max(0, nv);
    if (a.goodwill > 0 && a.value < a.basis * 0.70 &&
        Math.random() < 0.05 * S.mod.impair * traitMin('impair', 1)) {
      const w = Math.min(a.goodwill, a.value * rnd(0.15, 0.35));
      a.value -= w; a.impaired = clamp(a.impaired + 0.10, 0, 0.9);
      L.impair -= w; seg(a.div).impair -= w;
      S.stats.impair++;
      S.credit = clamp(S.credit - 3, 0, 100);
      log('「' + a.name + '」ののれんを ' + money(w) + ' 減損した。', 'down');
    }
  }

  function processAssets(L) {
    for (let i = S.assets.length - 1; i >= 0; i--) {
      const a = S.assets[i];
      if (a.type === 'company') { processCompany(a, L); continue; }
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
          Math.random() < fx('impair', 0.09) * traitMin('impair', 1) * S.mod.impair
            * (1 - Math.min(0.60, corpOf('esg') * 0.16)) * (1 - Math.min(0.40, eyePt() * 0.05))) {
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
    const wage = S.staff * fx('wage', S.wageRate) + fx('wage', rosterCost());
    const sga = (S.offices.length * 0.5 * Math.sqrt(scale()) + Math.max(0, equity()) * 0.0006 + 0.25)
      * (1 - Math.min(0.35, corpOf('dx') * 0.10));
    const sgaF = ofx('sga', fx('sga', sga));
    const int = S.debt * interestRate() / 12;
    S.cash -= (wage + sgaF + int);
    L.wage -= wage; L.sga -= sgaF; L.interest -= int;
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
      const proceeds = a.value * (rnd(0.62, 0.82) + traitBest('rescue'));
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
    S.roeTTM = clamp(roeTrailing(), -3, 3);
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

  /* ---------------- ガバナンスと不祥事 ---------------- */
  function stepGov() {
    let d = 0.22 + corpOf('esg') * 0.30 + ofxAdd('gov');
    const de = S.debt / Math.max(1, equity());
    if (de > 1.2) d -= 0.30;
    if (S.people.length < 6) d -= 0.20;          // 監督する人がいない
    S.gov = clamp(S.gov + d, 0, 100);
  }
  function checkScandal(L) {
    if (Math.random() > (100 - S.gov) / 100 * 0.030) return null;
    const sc = pick(D.SCANDALS);
    const fine = Math.max(0.4, Math.max(0, equity()) * rnd(0.008, 0.038));
    S.cash -= fine; L.defaults -= fine;
    S.credit = clamp(S.credit - 9, 0, 100);
    S.trust = clamp(S.trust - 9, 0, 100);
    S.morale = clamp(S.morale - 6, 0, 100);
    S.gov = clamp(S.gov + 7, 0, 100);
    S.scandals++;
    log('【不祥事】' + sc.t + '。制裁金・対応費用 ' + money(fine) + '。', 'down');
    return { ic: '📰', title: sc.t, text: sc.d + ' 制裁金と対応費用で ' + money(fine) + ' を失った。' };
  }

  /* ---------------- 社長信任 ---------------- */
  function confidenceScore() {
    const recent = (S.planHistory || []).slice(-2);
    const planOk = recent.reduce(function (a, x) { return a + x.count; }, 0);
    const r = myRank();
    return clamp(
      S.trust * 0.5 + planOk * 5 + clamp((S.roeTTM || 0) * 100, -15, 15)
      + (S.gov - 60) * 0.25 - S.scandals * 4
      + (r <= 3 ? 8 : r <= 6 ? 3 : 0), 0, 100);
  }
  function confidenceDetail() {
    const recent = (S.planHistory || []).slice(-2);
    const planOk = recent.reduce(function (a, x) { return a + x.count; }, 0);
    const r = myRank();
    return [
      { k: '株主信任', v: S.trust * 0.5 },
      { k: '直近2期の中計達成（' + planOk + '/6項目）', v: planOk * 5 },
      { k: 'ROE', v: clamp((S.roeTTM || 0) * 100, -15, 15) },
      { k: 'ガバナンス', v: (S.gov - 60) * 0.25 },
      { k: '不祥事（' + S.scandals + '件）', v: -S.scandals * 4 },
      { k: '世界順位（' + r + '位）', v: r <= 3 ? 8 : r <= 6 ? 3 : 0 },
    ];
  }
  function ceoVote() {
    const sc = confidenceScore();
    const pass = sc >= 40;
    S.ceoFY = fiscalYear();
    S.ceoTerms = (S.ceoTerms || 0) + 1;
    S.scandals = 0;
    if (pass) {
      S.planBonus = clamp((S.planBonus || 0) + 0.12, 0, 1.2);
      S.trust = clamp(S.trust + 5, 0, 100);
      log('社長信任投票を通過（信任スコア ' + Math.round(sc) + '）。任期が延長された。', 'gold');
    } else {
      S.over = true; S.overReason = 'ousted';
      log('社長信任投票で不信任（信任スコア ' + Math.round(sc) + '）。経営陣は退陣した。', 'down');
    }
    save();
    return { score: sc, pass: pass, detail: confidenceDetail() };
  }

  /* ---------------- 敵対的買収 ---------------- */
  function checkTOB() {
    if (S.tobCooldown > 0) { S.tobCooldown--; return null; }
    if (S.stage < 2 || S.over) return null;
    if (S.pbr > 0.72 || S.trust > 48) return null;
    if (Math.random() > 0.07) return null;
    const raider = pick(['外資系プライベート・エクイティ', pick(S.rivals).name + '（同業）', 'アクティビスト・ファンド']);
    const premium = rnd(0.25, 0.55);
    S.tob = { raider: raider, premium: premium, price: mcap() * (1 + premium) };
    S.tobCooldown = 20;
    log('【敵対的買収提案】' + raider + ' が当社株の公開買付を表明した。', 'down');
    return S.tob;
  }
  function defendCost() { return mcap() * 0.22; }
  function defendTOB(kind) {
    let ok = false, msg = '';
    if (kind === 'buyback') {
      const need = defendCost();
      if (S.cash < need) return { ok: false, msg: '自社株買いの資金がない（必要 ' + money(need) + '）' };
      S.cash -= need; capex(need);
      const pr = sharePrice();
      if (pr > 0.01) S.shares = Math.max(0.02, S.shares - need / pr);
      S.pbr = clamp(S.pbr * 1.28, 0.22, 4.0);
      ok = Math.random() < clamp(0.55 + S.trust * 0.005, 0.30, 0.92);
      msg = ok ? '自社株買いで株価を押し上げ、公開買付は不成立に終わった。'
               : '自社株買いでは足りなかった。株主は高値の誘惑に勝てなかった。';
    } else if (kind === 'white') {
      const give = 0.24;
      const raise = mcap() * give * 0.8;
      S.shares *= (1 + give);
      S.cash += raise;
      S.trust = clamp(S.trust + 6, 0, 100);
      ok = Math.random() < 0.86;
      msg = ok ? '同業のホワイトナイトが現れ、買収提案は退けられた。独立性の一部と引き換えに ' + money(raise) + ' を得た。'
               : 'ホワイトナイトの支援も間に合わなかった。';
    } else {
      const p = clamp(S.trust / 100 * 0.95, 0.05, 0.88);
      ok = Math.random() < p;
      S.trust = clamp(S.trust - 8, 0, 100);
      msg = ok ? '株主説明が奏功し、公開買付は否決された。'
               : '株主は経営陣の説明を信じなかった。';
    }
    if (!ok) { S.over = true; S.overReason = 'tob'; }
    else { S.tob = null; S.credit = clamp(S.credit + 3, 0, 100); }
    save();
    return { ok: true, defended: ok, msg: msg };
  }

  /* ---------------- advance one month ---------------- */
  function advance() {
    if (S.over || S.cleared) return { over: true };
    const eqBefore = equity();
    const out = { event: null, fy: null, promote: null, over: false, cleared: false, tob: null };

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
    const auto = autonomyIncome();
    if (auto > 0) { S.cash += auto; L.dividend += auto; }
    stepGov();
    const scd = checkScandal(L);
    if (scd && !out.event) out.event = scd;
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
      dd.exp += divLeadPt(d.id) * 0.05;
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
    S.credit = clamp(S.credit + corpOf('esg') * 0.07 + corpOf('hr') * 0.05 + fxAdd('credit') + traitBest('credit'), 0, 100);

    stepPeople();
    stepRivals();
    refreshMarket();
    refreshMA();
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
      if (S.insolvent >= 4) { S.over = true; S.overReason = 'insolvent'; out.over = true; }
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
      if (S.plan) {
        S.corp.dx = Math.min(6, S.corp.dx + fxAdd('dxYear'));
        S.corp.hr = Math.min(6, S.corp.hr + fxAdd('hrYear'));
        S.corp.esg = Math.min(6, S.corp.esg + fxAdd('esgYear'));
      }
      rec.people = annualPeople();
      rec.morale = S.morale;
      rec.needVote = S.stage >= 1 && (rec.fy - (S.ceoFY || 2027)) >= D.CONFIDENCE_EVERY;
      rec.needEval = !!(S.plan && S.plan.endFY <= S.y);
      rec.needPlan = !S.plan || rec.needEval;
      rec.plan = S.plan;
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
    if (!S.over && !S.cleared) out.tob = checkTOB();
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
    if (S.planNo == null) S.planNo = 0;
    if (!S.planHistory) S.planHistory = [];
    if (S.plan === undefined) S.plan = null;
    if (S.cumInvest == null) S.cumInvest = 0;
    if (S.planBonus == null) S.planBonus = 0;
    if (!S.people) S.people = [];
    if (!S.gradQueue) S.gradQueue = [];
    if (S.morale == null) S.morale = 62;
    if (!S.peopleNews) S.peopleNews = [];
    if (!S.ma) S.ma = [];
    if (!S.maStats) S.maStats = { done: 0, pmiOk: 0, pmiNg: 0, exits: 0 };
    if (S.tobCooldown == null) S.tobCooldown = 0;
    if (!S.org) S.org = 'div';
    if (S.orgSwitchFY == null) S.orgSwitchFY = 0;
    if (S.gov == null) S.gov = 72;
    if (S.scandals == null) S.scandals = 0;
    if (S.ceoFY == null) S.ceoFY = 2027;
    if (S.ceoTerms == null) S.ceoTerms = 0;
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
    planTargetOptions: planTargetOptions, formulatePlan: formulatePlan,
    evaluatePlan: evaluatePlan, planProgress: planProgress, hasCard: hasCard,
    fiscalYear: fiscalYear,
    genPerson: genPerson, toneOf: toneOf, traitOf: traitOf, roleW: roleW,
    personPower: personPower, personCost: personCost, rosterCost: rosterCost, rosterMax: rosterMax,
    divPeople: divPeople, divExec: divExec, divHead: divHead, divSalesPt: divSalesPt, divLeadPt: divLeadPt, eyePt: eyePt,
    peopleWin: peopleWin, hasTrait: hasTrait, traitBest: traitBest, findPerson: findPerson,
    assignDiv: assignDiv, appointHead: appointHead, dispatchTo: dispatchTo,
    promotePerson: promotePerson, promoteSlots: promoteSlots,
    gradCost: gradCost, hireGrads: hireGrads, careerCost: careerCost, careerCandidates: careerCandidates,
    hireCareer: hireCareer, huntCost: huntCost, headhunt: headhunt,
    genTarget: genTarget, findTarget: findTarget, ddCost: ddCost, runDD: runDD,
    maPrice: maPrice, maWin: maWin, maCheck: maCheck, acquire: acquire,
    setPMILeader: setPMILeader, pmiChance: pmiChance, divSynergy: divSynergy,
    exitCompany: exitCompany, defendTOB: defendTOB, defendCost: defendCost,
    org: org, orgSwitchCost: orgSwitchCost, canSwitchOrg: canSwitchOrg, switchOrg: switchOrg,
    autonomyIncome: autonomyIncome, confidenceScore: confidenceScore,
    confidenceDetail: confidenceDetail, ceoVote: ceoVote,
    capacity: capacity, slotsMax: slotsMax, mfac: mfac, hasOffice: hasOffice,
    ranking: ranking, myRank: myRank, now: now,
    save: save, load: load, hasSave: hasSave, wipe: wipe,
    money: money, signed: signed, pct: pct, clamp: clamp,
  };
})();
