// ===== キャリア・世界の状態 =====
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const START_YEAR = 2027;
  const CLASS_BASE = [60, 54, 60, 65, 70, 76];
  const CLASS_NAMES = ['新馬', '未勝利', '1勝クラス', '2勝クラス', '3勝クラス', 'オープン'];
  const COATS = ['#6b3e22', '#5a3420', '#3d2416', '#7a4a2a', '#2a1a12', '#8d5a34', '#9e9e9e', '#4a2c1a'];
  const SAVE_KEY = 'jockey-life-save-v1';

  // ---- 日付 ----
  function nthSundayOfMonth(date) { return Math.floor((date.getDate() - 1) / 7) + 1; }
  function sundayOf(year, month, nth) {
    const d = new Date(year, month - 1, 1);
    const first = (7 - d.getDay()) % 7 + 1; // 第1日曜の日
    let day = first + (nth - 1) * 7;
    const last = new Date(year, month, 0).getDate();
    while (day > last) day -= 7;
    return new Date(year, month - 1, day);
  }
  function weekSundays(year) {
    const res = []; let d = sundayOf(year, 1, 1);
    while (d.getFullYear() === year) { res.push(new Date(d)); d.setDate(d.getDate() + 7); }
    return res;
  }
  function fmtDate(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(日)`; }

  // 2026年の日付を「その月の第n日曜」に変換して、他の年に当てはめる
  function gradedForWeek(year, sunday) {
    const m = sunday.getMonth() + 1, nth = nthSundayOfMonth(sunday);
    return GRADED.filter(g => {
      const d = new Date(g.date + 'T00:00:00');
      let dm = d.getMonth() + 1, dn;
      if (g.sat || d.getDay() === 6) { const s = new Date(d); s.setDate(s.getDate() + 1); dm = s.getMonth() + 1; dn = nthSundayOfMonth(s); if (dm !== m) return false; return dn === nth; }
      dn = nthSundayOfMonth(d);
      return dm === m && dn === nth;
    });
  }
  function overseasForWeek(sunday) {
    const m = sunday.getMonth() + 1, nth = nthSundayOfMonth(sunday);
    return OVERSEAS.filter(o => o.month === m && o.nth === nth);
  }

  // ---- 名前 ----
  function horseName(used) {
    for (let i = 0; i < 50; i++) {
      const n = pick(NAME_A) + pick(NAME_B);
      if (n.length <= 9 && !used.has(n)) { used.add(n); return n; }
    }
    return 'ナナシ' + ri(100, 999);
  }
  function foreignName() { let n; do { n = pick(FOREIGN_A) + pick(FOREIGN_B); } while (n.length > 9); return n; }
  function personName() { return pick(SURNAMES) + ' ' + pick(GIVEN); }

  // ---- 馬 ----
  function growthFactor(h, year) {
    const age = year - h.born;
    const peak = { '早': 3, '普': 4, '晩': 5 }[h.grow] || 4;
    if (age <= 2) return h.grow === '早' ? 0.95 : 0.9;
    if (age < peak) return 1 - (peak - age) * 0.035;
    if (age <= peak + 1) return 1;
    return 1 - (age - peak - 1) * 0.04;
  }
  function genHorse(W, opts) {
    const base = opts.base ?? rnd(45, 75);
    const style = opts.style ?? pick([0, 1, 1, 1, 2, 2, 2, 3]);
    const surf = opts.surf ?? pick(['T', 'T', 'T', 'D', 'D', 'B']);
    const h = {
      id: W.nextId++, name: horseName(W.usedNames), sex: opts.sex || pick(['牡', '牡', '牝', 'セ']),
      born: opts.born, real: false, base,
      spd: clamp(base + rnd(-4, 4), 30, 99), sta: clamp(base + rnd(-8, 8), 30, 99),
      kick: clamp(base + rnd(-8, 8), 30, 99), tmp: ri(10, 85), style,
      dist: pick([1200, 1400, 1600, 1600, 1800, 1800, 2000, 2000, 2200, 2400, 2500, 3000]), surf,
      grow: pick(['早', '普', '普', '晩']), cls: opts.cls ?? 0, starts: 0, wins: 0, g1: [],
      last: -10, trainer: ri(0, W.trainers.length - 1), coat: pick(COATS), retired: false, earn: 0,
    };
    if (surf === 'D' && h.dist > 2100) h.dist = 1800;
    W.horses[h.id] = h;
    return h;
  }
  function realToHorse(W, r) {
    const h = {
      id: W.nextId++, name: r.n, sex: r.s, born: r.b, real: true, src: r.src, runs2026: r.runs,
      base: r.r - 2, spd: r.r, sta: clamp(r.r - 4 + (r.d - 2000) / 100, 60, 99), kick: clamp(r.r - 2 + (r.st >= 2 ? 3 : -2), 60, 99),
      tmp: ri(20, 60), style: r.st, dist: r.d, surf: 'T', grow: '普', cls: 5, starts: 0, wins: 0, g1: [],
      last: -10, trainer: ri(0, W.trainers.length - 1), coat: pick(COATS), retired: false, earn: 0,
    };
    W.usedNames.add(r.n);
    W.horses[h.id] = h;
    return h;
  }
  function ability(h, year) {
    const g = growthFactor(h, year);
    return { spd: h.spd * g, sta: h.sta * (0.6 + 0.4 * g), kick: h.kick * g, tmp: h.tmp };
  }
  function rating(h, year) { const a = ability(h, year); return a.spd * 0.5 + a.sta * 0.25 + a.kick * 0.25; }

  // ---- 新規ゲーム ----
  function newGame(opts) {
    const W = {
      v: 1, year: START_YEAR, wk: 0, abs: 0, nextId: 1, horses: {}, usedNames: new Set(),
      trainers: [], jockeys: [], log: [], pendingOverseas: null, injury: 0,
      player: {
        name: opts.name || '新人 騎手', region: opts.region || '美浦', age: 18,
        tech: 42, judge: 38, phys: 55, exp: 0, rep: 5,
        rides: 0, wins: 0, seconds: 0, thirds: 0, earn: 0, gWins: [], g1Wins: [],
        years: {}, bond: {}, trust: {}, fatigue: 0, retired: false,
      },
    };
    W.player.color = opts.color || '#e53935';
    // 調教師（架空）
    for (let i = 0; i < 24; i++) W.trainers.push({ id: i, name: pick(SURNAMES) + '厩舎', region: i < 12 ? '美浦' : '栗東' });
    W.player.stable = W.player.region === '美浦' ? ri(0, 11) : ri(12, 23);
    W.trainers.forEach(t => W.player.trust[t.id] = t.id === W.player.stable ? 55 : t.region === W.player.region ? ri(8, 20) : ri(0, 8));
    // ライバル騎手（架空）
    for (let i = 0; i < 34; i++) W.jockeys.push({ id: i, name: personName(), skill: clamp(Math.round(rnd(40, 92) - (i > 20 ? 10 : 0)), 35, 95), age: ri(19, 52), wins: 0, years: {} });
    // 実在馬
    for (const r of REAL_HORSES) {
      const age = START_YEAR - r.b;
      if (age >= 8) continue; // 2027年に8歳以上は引退扱い（ゲーム上のルール）
      realToHorse(W, r);
    }
    // 架空馬の初期プール
    const crop = (born, n, clsDist) => {
      for (let i = 0; i < n; i++) {
        const base = rnd(42, 80);
        let cls = 1;
        const roll = Math.random() + (base - 60) / 60;
        for (let c = 0; c < clsDist.length; c++) if (roll > clsDist[c]) cls = c + 2;
        cls = Math.min(cls, 5);
        // クラスごとに能力をそろえる（同じクラスの馬は力が近い）
        genHorse(W, { born, base: CLASS_BASE[cls] + rnd(-6, 6), cls });
      }
    };
    crop(2024, 420, [0.75, 1.05, 1.25, 1.4]);   // 3歳
    crop(2023, 260, [0.3, 0.65, 0.95, 1.15]);   // 4歳
    crop(2022, 200, [0.15, 0.45, 0.75, 0.95]);  // 5歳
    crop(2021, 110, [0.1, 0.4, 0.7, 0.9]);      // 6歳
    crop(2020, 50, [0.1, 0.4, 0.7, 0.9]);       // 7歳
    // デビューは3月第1週
    const weeks = weekSundays(W.year);
    W.wk = weeks.findIndex(d => d.getMonth() === 2);
    prepareWeek(W);
    return W;
  }

  // ---- 週の準備 ----
  function sundayOfWeek(W) { return weekSundays(W.year)[W.wk]; }
  function prepareWeek(W) {
    const sun = sundayOfWeek(W);
    const m = sun.getMonth() + 1;
    W.date = fmtDate(sun);
    W.month = m;
    if (m === 6 && !W['crop' + W.year]) { // 2歳馬デビュー
      W['crop' + W.year] = true;
      for (let i = 0; i < 330; i++) genHorse(W, { born: W.year - 2, base: rnd(48, 76), cls: 0 });
    }
    W.booked = {}; W.dayIdx = 0; W.weekLog = [];
    if (W.pendingOverseas && W.pendingOverseas.abs < W.abs) W.pendingOverseas = null;
    // 海外遠征が決まっている週
    if (W.pendingOverseas && W.pendingOverseas.abs === W.abs) {
      W.card = buildOverseasCard(W, W.pendingOverseas);
      W.venue = W.pendingOverseas.race.v;
      W.requests = [];
      W.offers = [];
      W.booked = { 1: W.pendingOverseas.hid };
      W.isOverseas = true;
      return;
    }
    W.isOverseas = false;
    const graded = gradedForWeek(W.year, sun);
    const regionIdx = W.player.region === '美浦' ? 0 : 1;
    let venue = MONTH_VENUES[m][regionIdx];
    // 重賞があれば、その開催場へ（評価が高いほど遠征先のGⅠに呼ばれやすい）
    const gTop = graded.slice().sort((a, b) => a.g - b.g);
    const homeG = gTop.find(g => g.v === venue);
    const mainG = homeG || (gTop[0] && (W.player.rep > 45 || VENUES[gTop[0].v] && MONTH_VENUES[m].indexOf(gTop[0].v) === regionIdx) ? gTop[0] : null);
    if (mainG) venue = mainG.v;
    W.venue = venue;
    const gHere = graded.filter(g => g.v === venue);
    W.card = buildCard(W, venue, gHere);
    W.requests = buildRequests(W);
    W.offers = buildOverseasOffers(W, sun);
  }

  function eligible(W, h, cond) {
    if (h.retired) return false;
    const age = W.year - h.born;
    if (cond.age === 'A2' && age !== 2) return false;
    if (cond.age === 'A3' && age !== 3) return false;
    if (cond.age === 'U3' && age < 3) return false;
    if (cond.age === 'U4' && age < 4) return false;
    if (cond.sex === 'F' && h.sex !== '牝') return false;
    if (cond.cls != null && h.cls !== cond.cls) return false;
    if (cond.clsMin != null && h.cls < cond.clsMin) return false;
    if (cond.surf && h.surf !== 'B' && h.surf !== cond.surf && Math.random() < 0.85) return false;
    if (W.abs - h.last < 3) return false;
    return true;
  }

  function buildCard(W, venue, gradedHere) {
    const m = W.month;
    const twoYo = m >= 6;
    const threeMaiden = m <= 9;
    const T = (surf, dists) => ({ surf, dist: pick(dists) });
    const tD = [1200, 1400, 1600, 1800, 2000, 2200, 2400];
    const dD = [1200, 1400, 1700, 1800, 1900];
    const local = ['fukushima', 'kokura', 'niigata', 'sapporo', 'hakodate'].includes(venue);
    const slots = [];
    const maiden = (n) => (twoYo && Math.random() < 0.45) ? { cls: 1, age: 'A2', label: '2歳未勝利' } : threeMaiden ? { cls: 1, age: 'A3', label: '3歳未勝利' } : { cls: 2, age: 'U3', label: '1勝クラス' };
    slots.push({ ...maiden(), ...T('D', dD) });
    slots.push({ ...maiden(), ...T(pick(['T', 'D']), tD) });
    slots.push({ ...maiden(), ...T('T', tD) });
    slots.push(twoYo ? { cls: 0, age: 'A2', label: '2歳新馬', ...T('T', [1200, 1400, 1600, 1800]) } : { ...maiden(), ...T('D', dD) });
    slots.push(twoYo ? { cls: 0, age: 'A2', label: '2歳新馬', ...T(pick(['T', 'D']), [1400, 1600, 1800, 2000]) } : { cls: 2, age: 'U3', label: '1勝クラス', ...T('T', tD) });
    slots.push({ cls: 2, age: 'U3', label: '1勝クラス', ...T('D', dD) });
    slots.push({ cls: 2, age: 'U3', label: '1勝クラス', ...T('T', tD) });
    slots.push({ cls: 2, age: 'U3', label: '1勝クラス', ...T(pick(['T', 'D']), tD) });
    slots.push({ cls: 3, age: 'U3', label: '2勝クラス', special: true, ...T('T', tD) });
    slots.push({ cls: local ? 3 : 4, age: 'U3', label: local ? '2勝クラス' : '3勝クラス', special: true, ...T(pick(['T', 'D']), tD) });
    // メイン
    const main = gradedHere[0];
    if (main) slots.push({ clsMin: 5, age: main.age, sex: main.sex, surf: main.surf, dist: main.dist, label: `G${'ⅠⅡⅢ'[main.g - 1]}`, graded: main.g, gname: main.name });
    else slots.push({ clsMin: 5, age: 'U3', label: 'オープン', special: true, ...T(pick(['T', 'T', 'D']), tD), gname: pick(['ステークス', '特別', 'S']) });
    // 12R（同週2つ目の重賞があれば10Rと入れ替え）
    if (gradedHere[1]) {
      const g2 = gradedHere[1];
      slots[9] = { clsMin: 5, age: g2.age, sex: g2.sex, surf: g2.surf, dist: g2.dist, label: `G${'ⅠⅡⅢ'[g2.g - 1]}`, graded: g2.g, gname: g2.name };
    }
    slots.push({ cls: 3, age: 'U3', label: '2勝クラス', ...T('D', dD) });
    const specialNames = ['若葉', '春風', '夏空', '秋晴', '紅葉', '雪見', '飛燕', '鳳凰', '白鷺', '銀河', '朝日', '月光', '彗星', '天馬'];
    return slots.map((sl, i) => {
      let name;
      if (sl.graded) name = sl.gname;
      else if (sl.special) name = pick(specialNames) + (sl.label === 'オープン' ? 'ステークス' : '特別');
      else name = sl.label;
      if (sl.surf === 'D' && sl.dist > 2100) sl.dist = 1800;
      const race = { no: i + 1, name, label: sl.label, cls: sl.cls, clsMin: sl.clsMin, graded: sl.graded || 0, age: sl.age, sex: sl.sex, surf: sl.surf, dist: sl.dist, venue, field: [], result: null, ground: Math.random() < 0.15 ? '重' : '良' };
      race.field = buildField(W, race);
      return race;
    });
  }

  function buildField(W, race) {
    const size = race.graded === 1 ? ri(15, 18) : race.graded ? ri(12, 16) : ri(10, 16);
    const cond = { age: race.age, sex: race.sex, cls: race.cls, clsMin: race.clsMin, surf: race.surf };
    let pool = Object.values(W.horses).filter(h => eligible(W, h, cond));
    if (race.graded) {
      // 能力・距離適性・(実在馬優先) でソート
      pool.forEach(h => h._k = rating(h, W.year) - Math.abs((h.dist || 1800) - race.dist) / 120 + (h.real ? 4 : 0) + rnd(-6, 6));
      pool.sort((a, b) => b._k - a._k);
      pool = pool.slice(0, size);
    } else {
      pool.forEach(h => h._k = Math.random() - Math.abs((h.dist || 1800) - race.dist) / 3000 + (W.abs - h.last) * 0.01 - (h.real ? 0.5 : 0));
      pool.sort((a, b) => b._k - a._k);
      pool = pool.slice(0, size);
    }
    // 頭数不足なら新規に補充
    while (pool.length < size) {
      const age = race.age === 'A2' ? 2 : race.age === 'A3' ? 3 : ri(3, 6);
      const clsBase = CLASS_BASE[race.cls ?? race.clsMin ?? 5] + (race.graded ? 3 * (4 - race.graded) : 0);
      const h = genHorse(W, { born: W.year - age, base: clsBase + rnd(-6, 6), cls: race.cls ?? Math.max(5, race.clsMin || 5), sex: race.sex === 'F' ? '牝' : undefined, surf: race.surf });
      pool.push(h);
    }
    return pool.map((h, i) => ({ hid: h.id }));
  }

  // 人気（予想オッズ）
  function estimateOdds(W, race) {
    const rs = race.field.map(f => {
      const h = W.horses[f.hid];
      let k = rating(h, W.year) - Math.abs((h.dist || 1800) - race.dist) / 150 - (h.surf !== 'B' && h.surf !== race.surf ? 8 : 0);
      return { f, k: k + rnd(-3, 3) };
    });
    rs.sort((a, b) => b.k - a.k);
    const top = rs[0].k;
    let sum = 0;
    rs.forEach(r => { r.p = Math.exp((r.k - top) / 4.5); sum += r.p; });
    rs.forEach((r, i) => { r.f.pop = i + 1; r.f.odds = Math.max(1.1, Math.round(0.8 / (r.p / sum) * 10) / 10); });
  }

  // ---- 騎乗依頼 ----
  function buildRequests(W) {
    const P = W.player;
    W.card.forEach(r => estimateOdds(W, r));
    const n = clamp(Math.round(1.5 + P.rep * 0.12 + rnd(-1, 1.5)), 1, 12);
    const reqs = [];
    const races = W.card.slice().sort(() => Math.random() - 0.5);
    for (const race of races) {
      if (reqs.length >= n + 3) break;
      const cands = race.field.map(f => {
        const h = W.horses[f.hid];
        const trust = P.trust[h.trainer] || 0;
        const bond = P.bond[h.id] || 0;
        const quality = 1 - (f.pop - 1) / race.field.length;
        // 評価が低いと人気薄、高いと人気馬に乗れる
        let sc = trust * 0.6 + bond * 1.5 + rnd(0, 30) - Math.abs(quality * 100 - (P.rep * 0.65 + 40)) * 0.6;
        if (race.graded === 1 && P.rep < 30 && bond < 10) sc -= 40;
        if (h.real && P.rep < 55 && bond < 10) sc -= 30;
        return { f, h, sc };
      }).sort((a, b) => b.sc - a.sc);
      const c = cands[0];
      if (!c) continue;
      if (c.sc < -15 && reqs.length >= n) continue;
      reqs.push({ raceNo: race.no, hid: c.h.id, trainer: c.h.trainer, pop: c.f.pop, odds: c.f.odds, accepted: false, bondHorse: (P.bond[c.h.id] || 0) > 0 });
    }
    reqs.sort((a, b) => a.raceNo - b.raceNo);
    // 少し多めに来るが、受けられるのは1レース1頭
    return reqs.slice(0, Math.max(n, 1) + 2);
  }

  // ---- 海外遠征 ----
  function buildOverseasOffers(W, sun) {
    const P = W.player;
    if (P.rep < 40 || W.pendingOverseas) return [];
    // 4週後の海外レース
    const weeks = weekSundays(W.year);
    const target = weeks[W.wk + 4];
    if (!target) return [];
    const os = overseasForWeek(target);
    const offers = [];
    for (const o of os) {
      // お手馬か評価で依頼
      const ops = Object.values(W.horses).filter(h => !h.retired && !h.foreign && h.cls === 5 && W.year - h.born >= 3 && (h.surf === 'B' || h.surf === o.surf));
      ops.forEach(h => h._k = rating(h, W.year) + (P.bond[h.id] || 0) * 0.6 - Math.abs(h.dist - o.dist) / 150 + rnd(-4, 4));
      ops.sort((a, b) => b._k - a._k);
      const cand = ops.slice(0, 6).find(h => (P.bond[h.id] || 0) >= 8 || Math.random() < (P.rep - 35) / 100);
      if (cand) offers.push({ race: o, hid: cand.id, abs: W.abs + 4, date: fmtDate(target) });
    }
    return offers.slice(0, 1);
  }
  function buildOverseasCard(W, offer) {
    const o = offer.race;
    const race = { no: 1, name: o.name, label: 'G1', graded: 1, surf: o.surf, dist: o.dist, venue: o.v, field: [], result: null, ground: '良', overseas: true };
    const h0 = W.horses[offer.hid];
    const fieldN = ri(10, 14);
    const field = [{ hid: h0.id }];
    // 日本からの他の遠征馬
    const jp = Object.values(W.horses).filter(h => h.id !== h0.id && !h.retired && !h.foreign && h.cls === 5 && W.year - h.born >= 3 && (h.surf === 'B' || h.surf === o.surf))
      .sort((a, b) => rating(b, W.year) - rating(a, W.year)).slice(0, ri(1, 3));
    jp.forEach(h => field.push({ hid: h.id }));
    while (field.length < fieldN) {
      const h = genHorse(W, { born: W.year - ri(3, 6), base: rnd(80, 92), cls: 5, surf: o.surf });
      h.name = foreignName(); h.foreign = true; h.retired = true; // 外国馬はこのレースのみ h.dist = o.dist + ri(-2, 2) * 200;
      field.push({ hid: h.id });
    }
    race.field = field.sort(() => Math.random() - 0.5);
    return [race];
  }

  // ---- レースの出走設定 ----
  function setupRace(W, race, playerHid, playerMode) {
    const P = W.player;
    if (!race.field[0].waku) {
      const n = race.field.length;
      race.field.forEach((f, i) => { f.waku = Math.min(8, Math.ceil((i + 1) / Math.max(1, n / 8))); });
      if (race.field[0].pop == null) estimateOdds(W, race);
      // 騎手の割り当て（上手い騎手ほど人気馬）
      const js = W.jockeys.slice().sort((a, b) => (b.skill + rnd(-10, 10)) - (a.skill + rnd(-10, 10)));
      const order = race.field.slice().sort((a, b) => a.pop - b.pop);
      let ji = 0;
      order.forEach(f => {
        if (f.hid === playerHid) { f.jid = -1; return; }
        if (race.overseas && W.horses[f.hid].foreign) { f.jname = pick(FOREIGN_JOCKEYS); f.jskill = ri(80, 95); return; }
        const j = js[ji++ % js.length]; f.jid = j.id;
      });
      race.field.forEach(f => { if (!f.color) f.color = SILKS[(f.hid * 7) % SILKS.length]; });
    }
    const runners = race.field.map(f => {
      const h = W.horses[f.hid];
      const isP = f.hid === playerHid;
      const j = f.jid >= 0 ? W.jockeys[f.jid] : null;
      const age = W.year - h.born;
      let weight = race.graded ? (h.sex === '牝' ? 56 : 58) : (h.sex === '牝' ? 55 : 57);
      if (age <= 2) weight = h.sex === '牝' ? 54 : 55;
      else if (age === 3 && W.month < 9) weight -= 1;
      if (isP && !race.graded && !race.overseas) weight -= apprenticeAllowance(P);
      return {
        horse: h, ability: ability(h, W.year), isPlayer: isP, auto: isP && playerMode === 'auto',
        jockeySkill: isP ? (P.tech + P.judge) / 2 : (j ? j.skill : f.jskill || 70),
        color: isP ? P.color : f.color, waku: f.waku, weight, jname: isP ? P.name : j ? j.name : f.jname,
      };
    });
    return new RaceEngine.Race({ name: `${VENUES[race.venue].name}${race.no}R ${race.name}`, venue: race.venue, surf: race.surf, dist: race.dist, runners, ground: race.ground, playerTech: P.tech });
  }
  function apprenticeAllowance(P) {
    // ゲーム独自の簡易ルール（実際のJRAの見習騎手規定とは異なる場合がある）
    if (P.yearsActive >= 5) return 0;
    if (P.wins <= 30) return 3;
    if (P.wins <= 50) return 2;
    if (P.wins <= 100) return 1;
    return 0;
  }

  const PRIZE = { 0: 720, 1: 560, 2: 850, 3: 1100, 4: 1550, 5: 2400 };
  const GPRIZE = { 1: 20000, 2: 6000, 3: 4000 };

  // ---- 結果の反映 ----
  function applyResult(W, race, results, playerHid, mode) {
    const P = W.player;
    race.result = results.map(r => ({ hid: r.horse.id, pos: r.pos, time: r.time, margin: r.margin, jname: r.cfg.jname, pop: race.field.find(f => f.hid === r.horse.id).pop, isP: r.horse.id === playerHid }));
    const prize1 = race.overseas ? 50000 : race.graded ? GPRIZE[race.graded] * (race.graded === 1 && /ジャパンC|有馬/.test(race.name) ? 2.5 : 1) : PRIZE[race.cls ?? 5];
    const share = [1, 0.4, 0.25, 0.15, 0.1];
    results.forEach(r => {
      const h = r.horse; h.starts++; h.last = W.abs;
      if (r.pos <= 5) h.earn += Math.round(prize1 * share[r.pos - 1]);
      if (r.pos === 1) {
        h.wins++;
        if (!race.graded && !race.overseas && h.cls < 5) h.cls = Math.max(h.cls + 1, 2);
        if (h.cls === 0) h.cls = 2;
        if (race.graded === 1) h.g1.push(`${W.year} ${race.name}`);
        const f = race.field.find(f => f.hid === h.id);
        if (f.jid >= 0) { const j = W.jockeys[f.jid]; j.wins++; j.years[W.year] = (j.years[W.year] || 0) + 1; }
      } else if (h.cls === 0) h.cls = 1;
    });
    let eval_ = null;
    if (playerHid != null) {
      const me = results.find(r => r.horse.id === playerHid);
      const f = race.field.find(f => f.hid === playerHid);
      const h = me.horse;
      const n = results.length;
      P.rides++;
      P.rep = Math.min(100, P.rep + 0.04);
      const ys = P.years[W.year] || (P.years[W.year] = { rides: 0, wins: 0, seconds: 0, thirds: 0, earn: 0, g: [] });
      ys.rides++;
      if (me.pos === 1) { P.wins++; ys.wins++; }
      if (me.pos === 2) { P.seconds++; ys.seconds++; }
      if (me.pos === 3) { P.thirds++; ys.thirds++; }
      if (me.pos <= 5) { const e = Math.round(prize1 * share[me.pos - 1]); P.earn += e; ys.earn += e; }
      // 騎乗評価：人気と着順の比較
      const diff = (f.pop - me.pos) / n;
      let score = 50 + diff * 120 + (me.pos === 1 ? 20 : me.pos <= 3 ? 8 : 0) - (me.lateStart ? 10 : 0);
      score = clamp(score, 0, 100);
      const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D';
      // 評判・信頼
      const gMul = race.overseas ? 3 : race.graded === 1 ? 2.2 : race.graded ? 1.5 : 1;
      let dRep = ((score - 50) / 50) * 0.6 * gMul + (me.pos === 1 ? 0.6 * gMul : 0);
      dRep *= P.rep > 70 ? 0.6 : 1;
      P.rep = clamp(P.rep + dRep, 0, 100);
      P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) + (score - 45) / 10, 0, 100);
      P.bond[h.id] = clamp((P.bond[h.id] || 0) + (me.pos <= 3 ? 6 : 2) + (score > 60 ? 3 : 0), 0, 100);
      // 成長（実際に操作した騎乗の方が伸びる）
      const gain = (mode === 'manual' ? 1.0 : 0.45) * (P.age < 35 ? 1 : P.age < 45 ? 0.6 : 0.3);
      P.exp += gain;
      P.tech = clamp(P.tech + gain * (0.05 + score / 2000) * (1 - P.tech / 110), 0, 99);
      P.judge = clamp(P.judge + gain * (0.06 + (race.graded ? 0.05 : 0)) * (1 - P.judge / 110), 0, 99);
      if (me.pos === 1) {
        if (race.graded || race.overseas) {
          const t = `${W.year} ${race.name}（${h.name}）`;
          P.gWins.push(t); ys.g.push(t);
          if (race.graded === 1) P.g1Wins.push(t);
          W.log.push({ abs: W.abs, text: `${W.date} ${race.name} を ${h.name} で制覇!` });
        }
        if (P.wins === 1) W.log.push({ abs: W.abs, text: `${W.date} ${h.name} で初勝利` });
        if (P.wins % 100 === 0) W.log.push({ abs: W.abs, text: `${W.date} 通算${P.wins}勝達成` });
      }
      // 落馬（低確率）
      if (Math.random() < 0.002) { W.injury = ri(2, 6); W.log.push({ abs: W.abs, text: `${W.date} 落馬負傷（${W.injury}週休養）` }); }
      eval_ = { grade, score: Math.round(score), dRep: Math.round(dRep * 10) / 10, pos: me.pos, pop: f.pop };
    }
    return eval_;
  }

  // 自分が乗らないレース・オート騎乗
  function simulate(W, race, playerHid, mode) {
    const r = setupRace(W, race, playerHid, mode || 'auto');
    const res = r.runToEnd();
    return applyResult(W, race, res, playerHid, mode || 'auto');
  }

  // ---- 週の終了 ----
  function endWeek(W, action) {
    const P = W.player;
    // 平日の過ごし方
    if (action === 'train') { const t = W.trainers.filter(t => t.region === P.region); const tt = pick(t); P.trust[tt.id] = clamp((P.trust[tt.id] || 0) + 4, 0, 100); P.fatigue += 8; }
    if (action === 'study') { P.judge = clamp(P.judge + 0.4, 0, 99); P.fatigue += 4; }
    if (action === 'gym') { P.phys = clamp(P.phys + 0.4, 0, 99); P.fatigue += 6; }
    if (action === 'rest') { P.fatigue = Math.max(0, P.fatigue - 25); }
    P.fatigue = Math.max(0, P.fatigue - 6);
    // 加齢による衰え
    if (P.age >= 42) { P.phys = Math.max(10, P.phys - 0.03 * (P.age - 41)); }
    // 信頼の自然減
    for (const k in P.trust) if (P.trust[k] > 15 && +k !== P.stable) P.trust[k] -= 0.08;
    if (W.injury > 0) W.injury--;
    W.abs++; W.wk++;
    const weeks = weekSundays(W.year);
    let yearEnd = null;
    if (W.wk >= weeks.length) {
      yearEnd = yearSummary(W);
      W.year++; W.wk = 0; P.age++;
      P.yearsActive = (P.yearsActive || 0) + 1;
      // 引退（ゲーム上のルール）
      Object.values(W.horses).forEach(h => {
        const age = W.year - h.born;
        if (h.retired) return;
        if (age >= 8 || (age >= 4 && h.cls <= 1) || (age >= 6 && Math.random() < 0.35) || (age >= 3 && h.cls === 1 && Math.random() < 0.4)) h.retired = true;
      });
      // 古い引退馬は削除（セーブ容量対策。お手馬とGⅠ馬は残す）
      Object.values(W.horses).forEach(h => { if (h.retired && !P.bond[h.id] && !h.g1.length && !h.real) delete W.horses[h.id]; });
      W.jockeys.forEach(j => { j.age++; if (j.age > 30) j.skill = Math.max(35, j.skill - (j.age > 45 ? 1 : 0)); else j.skill = Math.min(95, j.skill + 1); if (j.age >= 58) { j.name = personName(); j.age = 18; j.skill = ri(35, 55); j.years = {}; j.wins = 0; } });
    }
    prepareWeek(W);
    return yearEnd;
  }
  function yearSummary(W) {
    const P = W.player;
    const ys = P.years[W.year] || { rides: 0, wins: 0, seconds: 0, thirds: 0, earn: 0, g: [] };
    const table = W.jockeys.map(j => ({ name: j.name, wins: j.years[W.year] || 0 }));
    table.push({ name: P.name + '（あなた）', wins: ys.wins, me: true });
    table.sort((a, b) => b.wins - a.wins);
    const rank = table.findIndex(t => t.me) + 1;
    const awards = [];
    if (rank === 1) awards.push('最多勝利騎手');
    if (ys.g.length >= 3) awards.push('重賞ハンター賞（ゲーム独自）');
    if (P.yearsActive === 0 && ys.wins >= 10) awards.push('最多勝利新人騎手');
    W.log.push({ abs: W.abs, text: `${W.year}年 ${ys.wins}勝（リーディング${rank}位）` });
    return { year: W.year, ys, rank, table: table.slice(0, 10), awards };
  }

  // ---- セーブ ----
  function save(W) {
    try {
      const o = { ...W, usedNames: [...W.usedNames] };
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }
  function load() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      const o = JSON.parse(s);
      o.usedNames = new Set(o.usedNames || []);
      return o;
    } catch (e) { return null; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  window.World = {
    newGame, prepareWeek, setupRace, applyResult, simulate, endWeek, save, load, hasSave, deleteSave,
    rating, ability, CLASS_NAMES, apprenticeAllowance, fmtDate, estimateOdds,
  };
})();
