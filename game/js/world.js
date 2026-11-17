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
  const SAVE_KEY = 'jockey-life-save-v2';

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

  // 2026年と同じ月日に一番近い日曜に開催する（土曜開催は翌日の日曜の週）
  function nearestSunday(year, month, day) {
    const d = new Date(year, month - 1, day);
    const back = d.getDay(); // 0=日曜
    d.setDate(d.getDate() + (back <= 3 ? -back : 7 - back));
    return d;
  }
  function gradedForWeek(year, sunday) {
    return GRADED.filter(g => {
      const d = new Date(g.date + 'T00:00:00');
      if (g.sat || d.getDay() === 6) d.setDate(d.getDate() + 1);
      const t = nearestSunday(year, d.getMonth() + 1, d.getDate());
      return t.getFullYear() === sunday.getFullYear() && t.getMonth() === sunday.getMonth() && t.getDate() === sunday.getDate();
    });
  }
  function overseasForWeek(sunday) {
    const m = sunday.getMonth() + 1, nth = nthSundayOfMonth(sunday);
    return OVERSEAS.filter(o => o.month === m && o.nth === nth);
  }

  // ---- ローテーション（有力馬の1年の出走予定） ----
  // spring / autumn に分け、目標のレースへ間隔をあけて向かう。お手馬は調教師と相談して決める
  const ROUTES = {
    colt3: [
      { k: 'triple', name: '牡馬三冠路線', desc: '皐月賞→日本ダービー→菊花賞', spring: ['弥生賞', '皐月賞', '日本ダービー'], autumn: ['セントライト記念', '菊花賞', '有馬記念'] },
      { k: 'nhk', name: '変則二冠路線', desc: 'NHKマイルC→日本ダービー→天皇賞（秋）', spring: ['スプリングS', 'NHKマイルC', '日本ダービー'], autumn: ['毎日王冠', '天皇賞（秋）'] },
      { k: 'derby', name: 'ダービー一本', desc: '青葉賞から日本ダービーへ。秋はジャパンC・有馬記念', spring: ['共同通信杯', '青葉賞', '日本ダービー'], autumn: ['ジャパンC', '有馬記念'] },
      { k: 'mile3', name: 'マイル路線', desc: 'NHKマイルC→マイルチャンピオンシップ', spring: ['共同通信杯', 'NHKマイルC'], autumn: ['関屋記念', '毎日王冠', 'マイルチャンピオンシップ'] },
    ],
    filly3: [
      { k: 'ftriple', name: '牝馬三冠路線', desc: '桜花賞→オークス→秋華賞', spring: ['チューリップ賞', '桜花賞', 'オークス'], autumn: ['秋華賞', 'エリザベス女王杯'] },
      { k: 'fderby', name: 'ダービー挑戦', desc: '桜花賞から牡馬相手の日本ダービーへ', spring: ['チューリップ賞', '桜花賞', '日本ダービー'], autumn: ['秋華賞', 'ジャパンC'] },
      { k: 'fmile', name: 'マイル路線', desc: '桜花賞→NHKマイルC→マイルチャンピオンシップ', spring: ['チューリップ賞', '桜花賞', 'NHKマイルC'], autumn: ['秋華賞', 'マイルチャンピオンシップ'] },
    ],
    older: [
      { k: 'classic', name: '王道路線（古馬三冠）', desc: '大阪杯→宝塚記念、秋は天皇賞（秋）→ジャパンC→有馬記念', spring: ['京都記念', '大阪杯', '宝塚記念'], autumn: ['天皇賞（秋）', 'ジャパンC', '有馬記念'] },
      { k: 'stayer', name: 'ステイヤー路線', desc: '阪神大賞典→天皇賞（春）、暮れは有馬記念', spring: ['阪神大賞典', '天皇賞（春）', '宝塚記念'], autumn: ['アルゼンチン共和国杯', '有馬記念'] },
      { k: 'mile', name: 'マイル路線', desc: '安田記念→毎日王冠→マイルチャンピオンシップ', spring: ['安田記念'], autumn: ['関屋記念', '毎日王冠', 'マイルチャンピオンシップ'] },
      { k: 'sprint', name: 'スプリント路線', desc: '高松宮記念→スプリンターズS', spring: ['高松宮記念', '安田記念'], autumn: ['スプリンターズS', 'マイルチャンピオンシップ'] },
      { k: 'dirt', name: 'ダート路線', desc: 'フェブラリーS→チャンピオンズC', spring: ['フェブラリーS'], autumn: ['チャンピオンズC'] },
    ],
  };
  const FILLY_SWAP = { 'ジャパンC': 'エリザベス女王杯', '安田記念': 'ヴィクトリアマイル' };
  const routeCat = (W, h) => { const a = W.year - h.born; return a === 3 ? (h.sex === '牝' ? 'filly3' : 'colt3') : a >= 4 ? 'older' : null; };
  function routeOptions(W, h) { const c = routeCat(W, h); return c ? ROUTES[c] : []; }
  function autoRoute(W, h) {
    const c = routeCat(W, h); if (!c) return null;
    const d = h.dist || 1800, rr = ROUTES[c], by = (k) => rr.find(x => x.k === k);
    if (c === 'colt3') return h.surf === 'D' ? null : d <= 1600 ? by('mile3') : d >= 2200 ? (Math.random() < 0.7 ? by('triple') : by('derby')) : (Math.random() < 0.65 ? by('triple') : by('nhk'));
    if (c === 'filly3') return h.surf === 'D' ? null : d <= 1600 && Math.random() < 0.4 ? by('fmile') : by('ftriple');
    if (h.surf === 'D') return by('dirt');
    return d <= 1200 ? by('sprint') : d <= 1600 ? by('mile') : d >= 3000 ? by('stayer') : by('classic');
  }
  function routeRaces(W, h, r, half) {
    let list = half === 'autumn' ? r.autumn : half === 'spring' ? r.spring : r.spring.concat(r.autumn);
    if (h.sex === '牝' && routeCat(W, h) === 'older') list = list.map(n => FILLY_SWAP[n] || n);
    return list.slice();
  }
  // 重賞の、その年の週番号
  const _gw = {};
  function gradedWeek(year, name) {
    if (!_gw[year]) { _gw[year] = {}; weekSundays(year).forEach((sun, i) => gradedForWeek(year, sun).forEach(g => { _gw[year][g.name] = i; })); }
    return _gw[year][name];
  }
  // 次の目標レースまで何週か（なければ Infinity）
  function nextPlan(W, h) {
    const pl = h.plan; if (!pl || pl.y !== W.year) return null;
    let best = null;
    for (const n of pl.races) { const wk = gradedWeek(W.year, n); if (wk == null || wk < W.wk) continue; if (!best || wk < best.wk) best = { name: n, wk, inW: wk - W.wk }; }
    return best;
  }
  function setPlan(W, h, r, half) {
    const pl = (h.plan && h.plan.y === W.year) ? h.plan : (h.plan = { y: W.year, races: [], route: null });
    if (half === 'autumn') { const done = pl.races.filter(n => (gradedWeek(W.year, n) ?? 99) < W.wk); pl.races = done.concat(routeRaces(W, h, r, 'autumn')); }
    else pl.races = routeRaces(W, h, r, half === 'spring' ? 'all' : half);
    pl.route = r.name;
  }
  // 年のはじめ（と7月）に、有力馬の予定を決める。プレイヤーのお手馬は相談イベントで決める
  function assignPlans(W, half) {
    const alive = Object.values(W.horses).filter(h => !h.retired && !h.foreign);
    const take = (arr, n) => arr.sort((a, b) => rating(b, W.year) - rating(a, W.year)).slice(0, n);
    const groups = [
      take(alive.filter(h => W.year - h.born === 3 && h.sex !== '牝' && h.cls >= 2), 40),
      take(alive.filter(h => W.year - h.born === 3 && h.sex === '牝' && h.cls >= 2), 26),
      take(alive.filter(h => W.year - h.born >= 4 && h.cls >= 5), 80),
    ];
    groups.flat().forEach(h => {
      if (h.mainJ === -1 && (W.player.bond[h.id] || 0) >= 8 && !h.real) { h.consult = half; if (!h.plan || h.plan.y !== W.year) h.plan = { y: W.year, races: [], route: null }; return; }
      const r = autoRoute(W, h); if (r) setPlan(W, h, r, half === 'autumn' ? 'autumn' : 'spring');
    });
  }
  // 2歳の暮れのGⅠ
  function assign2yo(W) {
    const two = Object.values(W.horses).filter(h => !h.retired && W.year - h.born === 2 && h.cls >= 2).sort((a, b) => rating(b, W.year) - rating(a, W.year));
    two.slice(0, 40).forEach(h => { h.plan = { y: W.year, route: '2歳GⅠ', races: [h.sex === '牝' && Math.random() < 0.8 ? '阪神ジュベナイルF' : (h.dist || 1600) <= 1600 ? '朝日杯フューチュリティS' : 'ホープフルS'] }; });
  }

  // ---- 名前 ----
  // 馬主の好みに合わせて名付ける。冠名を持つ馬主は「冠名＋言葉」が多い。意味も残す（パドックで見られる）
  function namedHorse(used, owner) {
    const langs = (window.OWNER_NAMING && OWNER_NAMING[owner]) || Object.keys(HORSE_WORDS || {});
    const km = window.KANMEI && KANMEI[owner];
    for (let i = 0; i < 300; i++) {
      const lang = pick(langs), [w, mean] = pick(HORSE_WORDS[lang]);
      let name, m;
      const r = Math.random();
      if (km && r < 0.65 && (km + w).length <= 9) { name = km + w; m = `冠名＋${mean}（${lang}）`; }
      else if (r < 0.88 || !HORSE_WORDS[lang]) { name = w; m = `${mean}（${lang}）`; }
      else {
        // 同じ言葉どうしで2語：「月の光」「春の風」のような組み合わせ
        const [w2, mean2] = pick(HORSE_WORDS[lang]);
        if (w2 === w) continue;
        name = w + w2; m = `${mean}＋${mean2}（${lang}）`;
      }
      if (name.length >= 2 && name.length <= 9 && !used.has(name)) { used.add(name); return { name, mean: m }; }
    }
    return { name: horseName(used), mean: '' };
  }
  function horseName(used) {
    for (let i = 0; i < 400; i++) {
      // 2語の組み合わせが基本。足りなくなったら冠名風の3語も使う
      const n = i < 200 ? pick(NAME_A) + pick(NAME_B) : pick(NAME_A) + pick(NAME_C) + pick(NAME_B);
      if (n.length >= 2 && n.length <= 9 && !used.has(n)) { used.add(n); return n; }
    }
    return 'ナナシ' + ri(100, 999);
  }
  function foreignName() { let n; do { n = pick(FOREIGN_A) + pick(FOREIGN_B); } while (n.length > 9); return n; }
  function personName() { return pick(SURNAMES) + ' ' + pick(GIVEN); }
  function realJockey(id, rj) {
    const skill = clamp(Math.round(40 + rj.rate * 180 + Math.min(10, rj.w / 15)), 45, 95);
    return { id, name: rj.n, real: true, region: rj.r, skill, age: START_YEAR - rj.b, wins: 0, years: {}, pop: clamp(Math.round(rj.w / 2.2), 5, 80) };
  }
  // 同じ名前の騎手が2人いないように（プレイヤーの名前とも重ならないように）
  function uniqueName(taken) { for (let i = 0; i < 200; i++) { const n = personName(); if (!taken.has(n)) { taken.add(n); return n; } } return personName(); }
  function dedupeJockeys(W) {
    const taken = new Set([W.player && W.player.name].filter(Boolean));
    (W.jockeys || []).forEach(j => { if (taken.has(j.name)) j.name = uniqueName(taken); else taken.add(j.name); });
  }

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
      last: -10, trainer: ri(0, W.trainers.length - 1), owner: ownerFor(W), coatKey: pickCoat(), socks: pickSocks(), retired: false, earn: 0,
    };
    if (Math.random() < 0.12) h.hood = pick(['#1e3a8a', '#b91c1c', '#e5e7eb', '#065f46']);
    if (surf === 'D' && h.dist > 2100) h.dist = 1800;
    // 仮の名前を外して、馬主に合わせた名前を付け直す
    if (window.HORSE_WORDS && !opts.keepName) { W.usedNames.delete(h.name); const nm = namedHorse(W.usedNames, h.owner); h.name = nm.name; h.nameMean = nm.mean; }
    W.horses[h.id] = h;
    return h;
  }
  function realToHorse(W, r) {
    const h = {
      id: W.nextId++, name: r.n, sex: r.s, born: r.b, real: true, src: r.src, runs2026: r.runs,
      base: r.r - 2, spd: r.r, sta: clamp(r.r - 4 + (r.d - 2000) / 100, 60, 99), kick: clamp(r.r - 2 + (r.st >= 2 ? 3 : -2), 60, 99),
      tmp: ri(20, 60), style: r.st, dist: r.d, surf: 'T', grow: '普', cls: 5, starts: 0, wins: 0, g1: [],
      last: -10, trainer: ri(0, W.trainers.length - 1), owner: ownerFor(W), coatKey: pickCoat(), socks: pickSocks(), retired: false, earn: 0,
    };
    W.usedNames.add(r.n);
    W.horses[h.id] = h;
    return h;
  }
  function pickCoat() { return pick(['bay', 'bay', 'bay', 'darkbay', 'darkbay', 'brown', 'chestnut', 'chestnut', 'grey']); }
  function pickSocks() { const s = []; ['LF', 'RF', 'LH', 'RH'].forEach(k => { if (Math.random() < 0.13) s.push(k); }); return s; }
  function ownerFor(W) {
    // 大馬主ほど多くの馬を持つ
    const tot = W.owners.reduce((a, o) => a + o.size, 0);
    let r = Math.random() * tot;
    for (const o of W.owners) { if ((r -= o.size) <= 0) return o.id; }
    return 0;
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
        pop: 3, fans: 300, money: 150, weight: 48.5, cond: 80, agent: null, contract: null,
        suspended: 0, otrust: {}, schedule: ['train', 'study', 'rest'], hh: {}, interviews: 0,
      },
      news: [], events: [],
    };
    W.player.color = opts.color || '#e53935';
    // 調教師（架空）
    // 馬主（架空）
    W.owners = OWNERS.map((o, i) => ({ id: i, ...o }));
    for (let i = 0; i < 24; i++) W.trainers.push({ id: i, name: pick(SURNAMES) + '厩舎', region: i < 12 ? '美浦' : '栗東' });
    W.player.stable = W.player.region === '美浦' ? ri(0, 11) : ri(12, 23);
    W.trainers.forEach(t => W.player.trust[t.id] = t.id === W.player.stable ? 55 : t.region === W.player.region ? ri(8, 20) : ri(0, 8));
    W.owners.forEach(o => W.player.otrust[o.id] = ri(0, 10));
    W.agents = AGENTS.map((a, i) => ({ id: i, ...a }));
    // ライバル騎手（架空）
    const takenNames = new Set([opts && opts.name].filter(Boolean));
    // 他の騎手は実在の騎手（2026年のJRAリーディング上位）。腕は2026年の勝率と勝利数から決める（ゲーム上の換算）
    (window.REAL_JOCKEYS || []).forEach((rj) => {
      if (takenNames.has(rj.n)) return; takenNames.add(rj.n);
      W.jockeys.push(realJockey(W.jockeys.length, rj));
    });
    // 物語に出てくる同期と兄弟子は架空の騎手（実在の人の言葉を作らないため）
    const rookie = { id: W.jockeys.length, name: uniqueName(takenNames), skill: 58, age: 18, wins: 0, years: {}, pop: 8, region: opts.region || '美浦', fictional: true };
    W.jockeys.push(rookie);
    const senior = { id: W.jockeys.length, name: uniqueName(takenNames), skill: 70, age: 26, wins: 0, years: {}, pop: 20, region: opts.region || '美浦', fictional: true };
    W.jockeys.push(senior);
    while (W.jockeys.length < 34) W.jockeys.push({ id: W.jockeys.length, name: uniqueName(takenNames), skill: ri(45, 70), age: ri(20, 40), wins: 0, years: {}, pop: ri(5, 30), fictional: true });
    const top = W.jockeys.slice().sort((a, b) => b.skill - a.skill)[0];
    W.rivals = [{ jid: rookie.id, kind: '同期' }, { jid: senior.id, kind: '兄弟子' }, { jid: top.id, kind: 'トップ騎手' }];
    W.rivals.forEach(r => W.player.hh[r.jid] = { w: 0, l: 0 });
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
    if (window.Progress) Progress.init(W);
    prepareWeek(W);
    if (window.Story) Story.init(W);
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
      // 1世代をまとめて登録し、成長の早い馬から順に、6月〜翌春にかけてデビューさせる
      for (let i = 0; i < 760; i++) {
        const h = genHorse(W, { born: W.year - 2, base: rnd(48, 76), cls: 0 });
        h.ready = W.abs + (h.grow === '早' ? ri(0, 8) : h.grow === '晩' ? ri(14, 40) : ri(0, 28));
      }
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
    if (W.planYear !== W.year) { W.planYear = W.year; assignPlans(W, 'spring'); }
    if (m >= 7 && W.planAut !== W.year) { W.planAut = W.year; assignPlans(W, 'autumn'); }
    if (m >= 10 && W.plan2 !== W.year) { W.plan2 = W.year; assign2yo(W); }
    rideTalks(W);
    const graded = gradedForWeek(W.year, sun);
    const regionIdx = W.player.region === '美浦' ? 0 : 1;
    let venue = MONTH_VENUES[m][regionIdx];
    // 重賞があれば、その開催場へ（評価が高いほど遠征先のGⅠに呼ばれやすい）
    const gTop = graded.slice().sort((a, b) => a.g - b.g);
    const homeG = gTop.find(g => g.v === venue);
    const mainG = homeG || (gTop[0] && (W.player.rep > 45 || VENUES[gTop[0].v] && MONTH_VENUES[m].indexOf(gTop[0].v) === regionIdx) ? gTop[0] : null);
    if (mainG) venue = mainG.v;
    // 騎乗を約束したお手馬の目標レースがある週は、その競馬場へ
    const prom = Object.values(W.horses).find(h => !h.retired && h.promise && graded.some(g => g.name === h.promise));
    if (prom) venue = graded.find(g => g.name === prom.promise).v;
    W.venue = venue;
    const gHere = graded.filter(g => g.v === venue);
    W.card = buildCard(W, venue, gHere);
    W.requests = buildRequests(W);
    W.offers = buildOverseasOffers(W, sun);
    if (W.away) { W.requests = []; W.offers = []; } // 海外武者修行中は日本で乗れない
  }

  function eligible(W, h, cond) {
    if (h.retired) return false;
    const age = W.year - h.born;
    if (cond.age === 'A2' && age !== 2) return false;
    if (cond.age === 'A3' && age !== 3) return false;
    if (cond.age === 'U3' && age < 3) return false;
    if (cond.age === 'U4' && age < 4) return false;
    if (cond.sex === 'F' && h.sex !== '牝') return false;
    if (h.ready != null && W.abs < h.ready) return false; // 同世代でも、デビューの準備ができた馬から順に出てくる
    if (cond.cls != null && h.cls !== cond.cls && !(cond.cls === 1 && h.cls === 0)) return false; // 未勝利戦には未出走の馬も出られる
    if (cond.clsMin != null && h.cls < cond.clsMin) return false;
    if (cond.surf && h.surf !== 'B' && h.surf !== cond.surf && Math.random() < 0.85) return false;
    if (W.abs - h.last < 3) return false;
    // オープン馬は間隔をあける（目標のレースへ向かうときは別）
    if (h.cls >= 5 && !cond.plan && W.abs - h.last < 5) return false;
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
    const day = makeDay();
    const races = slots.map((sl, i) => {
      let name;
      if (sl.graded) name = sl.gname;
      else if (sl.special) name = pick(specialNames) + (sl.label === 'オープン' ? 'ステークス' : '特別');
      else name = sl.label;
      if (sl.surf === 'D' && sl.dist > 2100) sl.dist = 1800;
      const race = { no: i + 1, name, label: sl.label, cls: sl.cls, clsMin: sl.clsMin, graded: sl.graded || 0, age: sl.age, sex: sl.sex, surf: sl.surf, dist: sl.dist, venue, field: [], result: null };
      Object.assign(race, dayCond(day, i, sl.surf));
      return race;
    });
    // 同じ日に同じ馬が2つのレースに出ないようにする。有力馬が集まる重賞・上のクラスから先に出走馬を決める
    const used = new Set();
    races.slice().sort((a, b) => ((b.graded ? 10 - b.graded : 0) - (a.graded ? 10 - a.graded : 0)) || ((b.cls ?? b.clsMin ?? 0) - (a.cls ?? a.clsMin ?? 0)))
      .forEach(r => { r.field = buildField(W, r, used); r.field.forEach(f => used.add(f.hid)); });
    return races;
  }
  // 古いセーブで、同じ日の2つのレースに同じ馬がいたら後ろのレースから外して補充する
  function fixCardDupes(W) {
    const seen = new Set();
    (W.card || []).forEach(r => {
      if (r.result) { r.field.forEach(f => seen.add(f.hid)); return; }
      const dup = r.field.filter(f => seen.has(f.hid));
      r.field.forEach(f => seen.add(f.hid));
      if (!dup.length) return;
      const keep = r.field.filter(f => !dup.includes(f));
      const extra = buildField(W, Object.assign({}, r), seen).filter(f => !keep.some(k => k.hid === f.hid)).slice(0, dup.length);
      extra.forEach(f => seen.add(f.hid));
      r.field = keep.concat(extra); r.drawDone = false;
      if (W.requests) W.requests = W.requests.filter(q => !(q.raceNo === r.no && dup.some(d => d.hid === q.hid)));
    });
  }

  function buildField(W, race, used) {
    const size = race.graded === 1 ? ri(15, 18) : race.graded ? ri(12, 16) : ri(10, 16);
    const cond = { age: race.age, sex: race.sex, cls: race.cls, clsMin: race.clsMin, surf: race.surf };
    let pool = Object.values(W.horses).filter(h => !(used && used.has(h.id)) && eligible(W, h, cond));
    if (race.graded) {
      // 目標にしてきた馬から先に入れる（ローテーション）
      const planned = Object.values(W.horses).filter(h => !(used && used.has(h.id)) && h.plan && h.plan.y === W.year && h.plan.races.includes(race.name) && eligible(W, h, { ...cond, clsMin: Math.min(2, cond.clsMin ?? 2), plan: true }));
      planned.sort((a, b) => (b.promise === race.name) - (a.promise === race.name) || rating(b, W.year) - rating(a, W.year));
      const pick1 = planned.slice(0, size);
      // それ以外は、近くに目標のレースがある馬を除いて能力順
      pool = pool.filter(h => !pick1.includes(h) && W.abs - h.last >= 5 && !(nextPlan(W, h) && nextPlan(W, h).inW < 7));
      pool.forEach(h => h._k = rating(h, W.year) - Math.abs((h.dist || 1800) - race.dist) / 120 - (h.surf !== 'B' && h.surf !== race.surf ? 18 : 0) + (h.real ? 4 : 0) + rnd(-6, 6));
      pool.sort((a, b) => b._k - a._k);
      pool = pick1.concat(pool.slice(0, size - pick1.length));
      // オープン馬が足りなければ、条件クラスの馬を能力順に加える（2歳重賞など。実際も1勝クラスの馬が重賞に挑戦する）
      if (pool.length < size) {
        const more = Object.values(W.horses).filter(h => !(used && used.has(h.id)) && !pool.includes(h) && h.cls >= 2 && W.abs - h.last >= 5 && eligible(W, h, { ...cond, clsMin: 2 }) && !(nextPlan(W, h) && nextPlan(W, h).inW < 7));
        more.forEach(h => h._k = rating(h, W.year) + h.cls * 3 - Math.abs((h.dist || 1800) - race.dist) / 120 + rnd(-4, 4));
        more.sort((a, b) => b._k - a._k);
        pool = pool.concat(more.slice(0, size - pool.length));
      }
    } else {
      pool = pool.filter(h => !(nextPlan(W, h) && nextPlan(W, h).inW < 7));
      pool.forEach(h => h._k = Math.random() - Math.abs((h.dist || 1800) - race.dist) / 3000 + (W.abs - h.last) * 0.01 - (h.real ? 0.5 : 0));
      pool.sort((a, b) => b._k - a._k);
      pool = pool.slice(0, size);
    }
    // 頭数が少なくても、7頭以上いればそのまま行う（実際のレースも少頭数になることがある）
    if (pool.length >= 7 && pool.length < size) return pool.map((h) => ({ hid: h.id }));
    // それでも足りないときだけ新しく補う（その世代の馬として登録される）
    while (pool.length < Math.min(size, 7)) {
      if (W._fillLog) W._fillLog.push(race.label + race.surf + '/' + W.month + '月');
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
  const GEAR = 2.0; // 鞍などの装備重量（ゲーム上の概算）
  function kinryo(W, race, h, forPlayer) {
    const age = W.year - h.born;
    let w = race.graded || race.overseas ? (h.sex === '牝' ? 56 : 58) : (h.sex === '牝' ? 55 : 57);
    if (age <= 2) w = h.sex === '牝' ? 54 : 55;
    else if (age === 3 && W.month < 9) w -= 1;
    if (forPlayer && !race.graded && !race.overseas) w -= apprenticeAllowance(W.player);
    return w;
  }
  function gearOf(P) { return 2.0 + (P.gear && window.Progress ? (Progress.GEAR.saddle[P.gear.saddle || 0].gear || 0) : 0); }
  function canMakeWeight(P, kin) { return P.weight + gearOf(P) <= kin + 0.05; }

  // 取り合いになったとき、自分に依頼が残る見込み（0〜1）
  function contestChance(W, h, j) {
    const P = W.player;
    const me = P.rep * 0.9 + P.pop * 0.4 + (P.trust[h.trainer] || 0) * 0.5 + (P.otrust[h.owner] || 0) * 0.3 + (P.bond[h.id] || 0) * 0.8 + (P.agent != null ? W.agents[P.agent].net * 4 : 0);
    const them = j.skill * 0.9 + j.pop * 0.5 + 15;
    // 続けて負けているほど少しずつ上がる（運の偏りで何度も外れ続けないように。ゲーム上の補正）
    return clamp(0.5 + (me - them) / 120 + 0.07 * (W.contestFails || 0), 0.08, 0.92);
  }
  // 依頼を断ったとき・取り合いに負けたときの後始末。その馬には別の騎手が乗る
  // ---- 調教師の指示 ----
  // 脚質に合わせた位置取りの指示。道中（レースの35〜60%の区間）の平均の位置で、守れたかを見る
  const ORDER_DEF = [
    { k: 'nige', text: 'ハナを切って、自分のペースで運んでくれ', short: '逃げる（先頭か2番手）', lo: 0, hi: 0.15 },
    { k: 'senko', text: '好位につけて、早めに動いてくれ', short: '好位につける（前のほう）', lo: 0, hi: 0.42 },
    { k: 'sashi', text: '中団で脚をためて、直線で外へ出してくれ', short: '中団で脚をためる', lo: 0.28, hi: 0.78, save: true },
    { k: 'oikomi', text: '後方でじっくり構えて、直線だけの競馬でいい', short: '後方で脚をためる', lo: 0.55, hi: 1, save: true },
  ];
  function orderFor(W, race, h) {
    const P = W.player, n = race.field.length;
    if ((P.trust[h.trainer] || 0) >= 70 && (h.id + W.abs) % 3 === 0 || (h.id + W.abs) % 7 === 0) return { k: 'free', text: '乗り方は任せる。馬と相談して決めてくれ', short: '任せる', free: true };
    const d = ORDER_DEF[h.style] || ORDER_DEF[1];
    const lo = Math.max(1, Math.round(1 + d.lo * (n - 1))), hi = Math.max(d.k === 'nige' ? 2 : lo + 1, Math.round(1 + d.hi * (n - 1)));
    return { ...d, lo, hi };
  }
  // trace：race.js が残した100mごとの記録
  function judgeOrder(W, race, hid, trace, pos) {
    const P = W.player, h = W.horses[hid], o = orderFor(W, race, h);
    if (o.free || !trace || trace.length < 4) return { order: o, kept: null, text: o.free ? '指示なし（任された）' : '' };
    const mid = trace.filter(t => t.s >= race.dist * 0.35 && t.s <= race.dist * 0.6);
    const pts = mid.length ? mid : trace;
    const avg = pts.reduce((a, t) => a + t.r, 0) / pts.length, eff = pts.reduce((a, t) => a + t.e, 0) / pts.length;
    const inPos = avg >= o.lo - 0.6 && avg <= o.hi + 0.6, saved = !o.save || eff <= 0.72;
    const kept = inPos && saved;
    // 守れなかったときの下がり幅は小さく（上位に来れば不問）。守れたときのほうを大きく
    let d = kept ? 1.5 + (pos <= 3 ? 0.5 : 0) : pos <= 3 ? 0 : pos <= 5 ? -0.3 : -0.6;
    P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) + d, 0, 100);
    const why = kept ? '指示どおりの競馬' : !inPos ? (avg < o.lo ? '指示より前で運んだ' : '指示より後ろになった') : '道中で脚を使いすぎた';
    return { order: o, kept, avg: Math.round(avg * 10) / 10, dTrust: d, text: why + (!kept && pos <= 3 ? '（上位に来たので不問）' : '') };
  }

  function giveRide(W, race, hid, jid, why) {
    race.forcedJ = race.forcedJ || {}; race.forcedJ[hid] = jid;
    const h = W.horses[hid]; if (h) h.mainJ = jid;
    if (why) news(W, `${h ? h.name : ''}（${race.name}）は${W.jockeys[jid].name}騎手が騎乗${why}`, 'race');
  }
  function declineRide(W, race, q) {
    const P = W.player, h = W.horses[q.hid];
    P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) - 4, 0, 100);
    P.otrust[h.owner] = clamp((P.otrust[h.owner] || 0) - 3, 0, 100);
    P.bond[h.id] = Math.max(0, (P.bond[h.id] || 0) - 3);
    const used = new Set(Object.values(race.forcedJ || {}));
    const j = W.jockeys.filter(x => !used.has(x.id)).sort((a, b) => (b.skill + rnd(-8, 8)) - (a.skill + rnd(-8, 8)))[0];
    giveRide(W, race, h.id, j.id, '（' + P.name + '騎手は別の馬を選択）');
    race.declined = (race.declined || []).concat([h.id]);
  }
  // 有力馬への売り込み（週1回）。成功すると依頼が来て、もともと乗る予定だった騎手からは恨まれる
  function pitchTargets(W) {
    const P = W.player, have = new Set(W.requests.map(q => q.hid));
    const out = [];
    W.card.forEach(race => race.field.forEach(f => { const h = W.horses[f.hid]; if (!have.has(h.id) && f.pop <= 4) out.push({ race, f, h }); }));
    return out.sort((a, b) => (b.race.graded ? 4 - b.race.graded : 0) * 3 - (a.race.graded ? 4 - a.race.graded : 0) * 3 + a.f.pop - b.f.pop).slice(0, 6)
      .map(o => ({ raceNo: o.race.no, hid: o.h.id, pop: o.f.pop, chance: clamp(0.03 + P.rep / 220 + (P.trust[o.h.trainer] || 0) / 300 + (P.otrust[o.h.owner] || 0) / 400 - (o.race.graded === 1 ? 0.1 : 0) - o.f.pop * 0.02 + 0.06 * (W.pitchFails || 0), 0.04, 0.75) }));
  }
  function pitch(W, raceNo, hid) {
    const P = W.player, race = W.card[raceNo - 1], h = W.horses[hid];
    const t = pitchTargets(W).find(x => x.hid === hid);
    W.pitchUsed = W.wk;
    if (!t || Math.random() > t.chance) { P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) - 1, 0, 100); W.pitchFails = (W.pitchFails || 0) + 1; return false; }
    W.pitchFails = 0;
    const f = race.field.find(x => x.hid === hid);
    const kin = kinryo(W, race, h, true);
    W.requests.push({ raceNo, hid, trainer: h.trainer, owner: h.owner, pop: f.pop, odds: f.odds, kin, okWeight: canMakeWeight(P, kin), accepted: false, bondHorse: (P.bond[hid] || 0) > 0, pitched: true });
    W.requests.sort((a, b) => a.raceNo - b.raceNo);
    news(W, `${P.name}騎手が${h.name}（${race.name}）の騎乗を射止める`, 'me');
    return true;
  }
  // ---- お手馬の路線相談と、次走の騎乗の打診 ----
  function rideTalks(W) {
    if (!W.story) return;
    const P = W.player, pend = W.story.pending;
    const mine = Object.values(W.horses).filter(h => !h.retired && h.mainJ === -1 && !h.foreign && !h.story)
      .sort((a, b) => rating(b, W.year) - rating(a, W.year));
    let scenes = 0; // 1週に出す相談・打診は2つまで（残りは翌週以降）
    for (const h of mine) {
      const t = W.trainers[h.trainer], tn = t ? t.name.replace('厩舎', '') + '調教師' : '調教師';
      if (h.consult) {
        if (scenes >= 2) continue;
        scenes++;
        const half = h.consult; h.consult = null;
        const opts = routeOptions(W, h); if (!opts.length) continue;
        const age = W.year - h.born, a = ability(h, W.year);
        const sug = autoRoute(W, h) || opts[0];
        pend.push({ lines: [
          ['', `${tn}から呼ばれた。${h.name}（${age}歳）の${half === 'autumn' ? '秋' : '今年'}の路線の相談だ。`],
          [tn, `${h.name}は${h.wins}勝。${half === 'autumn' ? '夏を越して、体がひと回り大きくなった。' : 'この冬でずいぶん力をつけた。'}`],
          [tn, `距離は${h.dist}mくらいが合うと見ている。私は${sug.name}がいいと思うが、乗っている${P.name}くんの意見を聞きたい。`],
        ], route: { hid: h.id, half, keys: opts.map(o => o.k) }, choice: { key: 'route', opts: opts.map(o => `${o.name}（${o.desc}）`) } });
        continue;
      }
      // 次の目標レースの2〜3週前に打診
      const np = nextPlan(W, h);
      if (np && np.inW >= 1 && np.inW <= 3 && h.promise !== np.name && h.asked !== W.year + np.name) {
        const g = GRADED.find(x => x.name === np.name);
        const other = mine.find(o => o !== h && o.promise === np.name);
        // GⅡ・GⅢは話が早い（ほかに約束した馬がいなければ、そのまま騎乗が決まる）
        if (!other && g && g.g >= 2) { h.asked = W.year + np.name; h.promise = np.name; news(W, `${h.name}の次走${np.name}も${P.name}騎手が騎乗予定`, 'me'); continue; }
        if (scenes >= 2) continue;
        scenes++; h.asked = W.year + np.name;
        if (other) {
          pend.push({ lines: [
            [tn, `${h.name}は${np.inW}週後の${np.name}に向かう。乗ってもらえるか。`],
            ['', `${np.name}には、すでに${other.name}で乗る約束をしている。どちらに乗るか決めなければならない。`],
          ], ride: { hid: h.id, race: np.name, other: other.id }, choice: { key: 'ride', opts: [`${h.name}に乗る（${other.name}は降りる）`, `${other.name}に乗る（${h.name}は断る）`] } });
          continue;
        }
        pend.push({ lines: [
          [tn, `${h.name}は${np.inW}週後の${np.name}${g ? `（G${'ⅠⅡⅢ'[g.g - 1]}）` : ''}に向かう。${pick(['状態はいい。', '調教の動きは文句なしだ。', '前走の疲れも抜けた。'])}`],
          [tn, '引き続き、手綱を任せたい。乗ってくれるか。'],
        ], ride: { hid: h.id, race: np.name }, choice: { key: 'ride', opts: ['乗る（騎乗を約束する）', '断る（主戦を降りる）'] } });
      }
    }
  }
  function talkAnswer(W, sc, v) {
    const P = W.player;
    if (sc.route) {
      const h = W.horses[sc.route.hid]; if (!h) return;
      const r = routeOptions(W, h).find(o => o.k === sc.route.keys[v]) || routeOptions(W, h)[0];
      setPlan(W, h, r, sc.route.half === 'autumn' ? 'autumn' : 'spring');
      P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) + 2, 0, 100);
      news(W, `${h.name}は${r.name}へ（${r.desc}）`, 'me');
      W.story.pending.unshift({ lines: [[W.trainers[h.trainer] ? W.trainers[h.trainer].name.replace('厩舎', '') + '調教師' : '調教師', `よし、${r.name}で行こう。予定は「${h.plan.races.filter(n => (gradedWeek(W.year, n) ?? 99) >= W.wk).join('→')}」だ。`]] });
      return true;
    }
    if (sc.ride) {
      const h = W.horses[sc.ride.hid]; if (!h) return;
      const drop = (x) => {
        const j = W.jockeys.slice().sort((a, b) => b.skill - a.skill)[ri(0, 4)];
        x.mainJ = j.id; x.promise = null;
        P.trust[x.trainer] = clamp((P.trust[x.trainer] || 0) - 4, 0, 100); P.otrust[x.owner] = clamp((P.otrust[x.owner] || 0) - 3, 0, 100);
        news(W, `${x.name}の${sc.ride.race}は${j.name}騎手に乗り替わり`, 'race');
      };
      if (sc.ride.other != null) { const o = W.horses[sc.ride.other]; if (v === 0) { h.promise = sc.ride.race; if (o) drop(o); } else drop(h); return true; }
      if (v === 0) { h.promise = sc.ride.race; P.bond[h.id] = (P.bond[h.id] || 0) + 2; news(W, `${P.name}騎手、${h.name}で${sc.ride.race}へ`, 'me'); }
      else {
        const j = W.jockeys.slice().sort((a, b) => b.skill - a.skill)[ri(0, 4)];
        h.mainJ = j.id; h.promise = null;
        P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) - 4, 0, 100); P.otrust[h.owner] = clamp((P.otrust[h.owner] || 0) - 3, 0, 100);
        news(W, `${h.name}の${sc.ride.race}は${j.name}騎手に乗り替わり`, 'race');
      }
      return true;
    }
  }

  function buildRequests(W) {
    const P = W.player;
    W.card.forEach(r => estimateOdds(W, r));
    const ag = P.agent != null ? W.agents[P.agent] : null;
    const net = ag ? ag.net : 0;
    const n = clamp(Math.round(1.5 + P.rep * 0.12 + net * 1.2 + P.pop * 0.03 + rnd(-1, 1.5) + (window.Progress && Progress.has && Progress.has(W, 'scout') ? 1.5 : 0) + (P.free ? 1.5 : 0)), 1, 14); // フリーの騎手は依頼が増える
    const target = P.rep * 0.65 + 40 + net * 4 + P.pop * 0.08;
    const reqs = [];
    // 自分が主戦の馬は、毎回まず自分に依頼が来る。騎乗を約束した馬は最初から受けた状態
    const pinned = [], pinRaces = new Set();
    if (!W.injury && !W.away && !(P.suspended > 0)) W.card.forEach(race => race.field.forEach(f => {
      const h = W.horses[f.hid]; if (!h || h.mainJ !== -1) return;
      const kin = kinryo(W, race, h, true), ok = canMakeWeight(P, kin), prom = h.promise === race.name;
      pinned.push({ raceNo: race.no, hid: h.id, trainer: h.trainer, owner: h.owner, pop: f.pop, odds: f.odds, kin, okWeight: ok, accepted: prom && ok && !pinned.some(q => q.raceNo === race.no && q.accepted), bondHorse: true, main: true, promised: prom });
      pinRaces.add(race.no);
    }));
    // 同じレースに主戦の馬が2頭いれば、どちらに乗るか選ぶ
    pinned.forEach(q => { if (pinned.filter(o => o.raceNo === q.raceNo).length > 1) q.clash = q.raceNo; });
    const races = W.card.slice().filter(r => !pinRaces.has(r.no)).sort(() => Math.random() - 0.5);
    for (const race of races) {
      if (reqs.length >= n + 3) break;
      const cands = race.field.map(f => {
        const h = W.horses[f.hid];
        const trust = P.trust[h.trainer] || 0;
        const ot = P.otrust[h.owner] || 0;
        const bond = P.bond[h.id] || 0;
        const quality = 1 - (f.pop - 1) / race.field.length;
        // 評価が低いと人気薄、高いと人気馬に乗れる
        let sc = trust * 0.55 + ot * 0.45 + bond * 1.5 + rnd(0, 30) - Math.abs(quality * 100 - target) * 0.6;
        if (P.contract === h.owner) sc += 35;
        if (h.mainJ === -1) sc += 15; // 自分が主戦の馬
        else if (h.mainJ != null && (P.bond[h.id] || 0) < 10) sc -= 10; // 別の騎手が主戦の馬は依頼が来にくい
        if (race.graded === 1 && P.rep < 30 && bond < 10) sc -= 40;
        if (h.real && P.rep < 55 && bond < 10) sc -= 30;
        return { f, h, sc };
      }).sort((a, b) => b.sc - a.sc);
      const c = cands[0];
      if (!c) continue;
      if (c.sc < -15 && reqs.length >= n) continue;
      const mk = (cc) => { const kin = kinryo(W, race, cc.h, true); return { raceNo: race.no, hid: cc.h.id, trainer: cc.h.trainer, owner: cc.h.owner, pop: cc.f.pop, odds: cc.f.odds, kin, okWeight: canMakeWeight(P, kin), accepted: false, bondHorse: (P.bond[cc.h.id] || 0) > 0, viaAgent: net > 0 && Math.random() < 0.35 }; };
      const q = mk(c);
      // 同じレースに、これまで乗ってきた馬（お手馬）がもう1頭いて、そちらからも依頼が来ることがある
      const other = cands.slice(1).find(o => (P.bond[o.h.id] || 0) >= 8 && o.sc > c.sc - 25);
      if (other && (P.bond[c.h.id] || 0) >= 6 && Math.random() < 0.55) { const q2 = mk(other); q.clash = q2.clash = race.no; reqs.push(q2); }
      // 人気馬の依頼は、他の騎手と取り合いになることがある
      if (c.f.pop <= 3 && (P.bond[c.h.id] || 0) < 12 && P.contract !== c.h.owner && Math.random() < 0.2) {
        let rival = W.jockeys.slice().sort((a, b) => (b.skill + b.pop * 0.3) - (a.skill + a.pop * 0.3))[ri(0, 5)];
        if (window.Drama) rival = Drama.contestRival(W, rival);
        q.contest = { jid: rival.id, chance: contestChance(W, c.h, rival) };
      }
      reqs.push(q);
    }
    const out = pinned.concat(reqs.slice(0, Math.max(0, Math.max(n, 1) + 2 - pinned.length)));
    out.sort((a, b) => a.raceNo - b.raceNo);
    return out;
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
    const race = { no: 1, name: o.name, label: 'G1', graded: 1, surf: o.surf, dist: o.dist, venue: o.v, field: [], result: null, overseas: true };
    Object.assign(race, dayCond(makeDay(), ri(0, 11), o.surf));
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
      race.field.forEach((f, i) => { f.waku = wakuOf(i + 1, n); });
      if (race.field[0].pop == null) estimateOdds(W, race);
      const forced = race.forcedJ || {}, fset = new Set(Object.values(forced).map(Number));
      const on = (j) => !window.Drama || Drama.avail(W, j); // デビュー前の後輩・来日していない外国人騎手は乗らない
      const js = W.jockeys.filter(j => !fset.has(j.id) && on(j)).sort((a, b) => (b.skill + rnd(-10, 10)) - (a.skill + rnd(-10, 10)));
      const order = race.field.slice().sort((a, b) => a.pop - b.pop);
      // 主戦騎手：馬ごとに決まった騎手が続けて乗る。主戦が同じレースで別の馬に乗るときや、たまの乗り替わりのときだけ別の騎手
      const taken = new Set(Object.values(forced).map(Number));
      order.forEach(f => {
        if (f.hid === playerHid || forced[f.hid] != null) return;
        const h = W.horses[f.hid]; if (!h || h.foreign) return;
        const big = (h.cls || 0) >= 5 || (h.g1 && h.g1.length);
        if (h.mainJ === -1 && !W.injury && !W.away && !(W.player.suspended > 0)) { h.skip = (h.skip || 0) + 1; if (h.skip >= 2) { h.mainJ = null; h.promise = null; news(W, `${h.name}の主戦が乗り替わり（${W.player.name}騎手が2度続けて乗らなかったため）`, 'bad'); } }
        if (h.mainJ != null && h.mainJ >= 0 && W.jockeys[h.mainJ] && on(W.jockeys[h.mainJ]) && !taken.has(h.mainJ) && Math.random() > (big ? 0.03 : 0.12)) { f.jid = h.mainJ; taken.add(h.mainJ); }
      });
      const pool = js.filter(j => !taken.has(j.id));
      let ji = 0;
      order.forEach(f => {
        if (f.hid === playerHid) { f.jid = -1; return; }
        if (f.jid != null && f.jid >= 0 && taken.has(f.jid) && forced[f.hid] == null) return; // 主戦が乗る
        if (race.overseas && W.horses[f.hid].foreign) { const used = new Set(race.field.map(x => x.jname).filter(Boolean)); const fj = FOREIGN_JOCKEYS.filter(n => !used.has(n)); f.jname = fj.length ? pick(fj) : pick(FOREIGN_JOCKEYS); f.jskill = ri(80, 95); return; }
        if (forced[f.hid] != null) { f.jid = +forced[f.hid]; return; }
        const j = pool[ji++ % Math.max(1, pool.length)] || js[0]; f.jid = j.id;
        // 主戦がいない馬は、この騎手が主戦になる（主戦が別のレースや別の馬に回った一時的な乗り替わりなら、主戦は変えない）
        const h = W.horses[f.hid]; if (h && (h.mainJ == null || (h.mainJ >= 0 && !W.jockeys[h.mainJ]))) h.mainJ = j.id;
      });
      if (W.story && W.story.rivalHorse != null) {
        const rf = race.field.find(f => f.hid === W.story.rivalHorse);
        const rj = W.rivals[0].jid;
        if (rf && rf.jid !== -1) { const other = race.field.find(f => f.jid === rj); if (other) other.jid = rf.jid; rf.jid = rj; }
      }
    }
    const mods = window.Progress && playerHid != null ? Progress.raceMods(W, race) : null;
    const runners = race.field.map(f => {
      const h = W.horses[f.hid];
      const isP = f.hid === playerHid;
      const j = f.jid >= 0 ? W.jockeys[f.jid] : null;
      const own = W.owners[h.owner] || W.owners[0];
      const silks = h.foreign ? { base: SILKS[(h.id * 5) % SILKS.length], accent: SILKS[(h.id * 3 + 4) % SILKS.length], pattern: ['plain', 'hoops', 'stripes', 'sash', 'halves'][h.id % 5], cap: SILKS[(h.id * 3 + 4) % SILKS.length] } : own.silks;
      return {
        horse: h, ability: ability(h, W.year), isPlayer: isP, auto: isP && playerMode === 'auto',
        jockeySkill: isP ? (P.tech + P.judge) / 2 : (j ? j.skill : f.jskill || 70),
        // 帽子の色は枠番で決まる（1枠白・2枠黒・3枠赤・4枠青・5枠黄・6枠緑・7枠橙・8枠桃）
        color: silks.base, silks: { ...silks, cap: race.overseas ? silks.cap : WAKU_COLORS[(f.waku || 1) - 1] }, waku: f.waku, weight: kinryo(W, race, h, isP), jname: isP ? P.name : j ? j.name : f.jname,
        mud: mudOf(h),
        condBonus: isP ? (P.cond - 70) * 0.08 + (mods ? mods.big : 0) + (h.tune && h.tune.abs === W.abs ? h.tune.v : 0) : 0, // 追い切りの出来も調子に入る
      };
    });
    return new RaceEngine.Race({ name: `${VENUES[race.venue].name}${race.overseas ? '' : race.no + 'R'} ${race.name}`, venue: race.venue, surf: race.surf, dist: race.dist, runners, ground: race.ground || '良', weather: race.weather || '晴', bias: race.bias, playerTech: P.tech, mods });
  }
  // ---- 天気・馬場状態・トラックバイアス（開催日ごとに決め、1日の中でも変わっていく） ----
  const WEATHERS = ['晴', '曇', '小雨', '雨'];
  const GROUNDS = ['良', '稍重', '重', '不良'];
  function makeDay() {
    const u = Math.random();
    let w = u < 0.6 ? 0 : u < 0.86 ? 1 : u < 0.95 ? 2 : 3;
    // 前日までの雨の残り
    let moist = w >= 2 ? rnd(0.3, 0.8) : Math.random() < 0.25 ? rnd(0.2, 0.6) : rnd(0, 0.12);
    const seq = [];
    // 芝：開催が進んで内が荒れているか（外有利）、開幕直後で内が良いか（内有利）
    let laneT = clamp(rnd(-1, 1) + rnd(-0.3, 0.3), -1, 1), paceT = clamp(rnd(-0.9, 0.9), -1, 1);
    let laneD = clamp(rnd(-0.6, 0.6), -1, 1), paceD = clamp(rnd(-0.5, 0.9), -1, 1);
    for (let i = 0; i < 13; i++) {
      if (Math.random() < 0.09) w = clamp(w + (Math.random() < 0.6 ? -1 : 1), 0, 3);
      moist = clamp(moist + [-0.045, -0.015, 0.06, 0.13][w], 0, 1);
      // 雨の中で使われると、芝は内から傷んで外が伸びるようになる
      if (w >= 2) laneT = clamp(laneT - 0.07, -1, 1);
      seq.push({ w, moist, laneT, paceT, laneD, paceD });
    }
    return seq;
  }
  function dayCond(day, i, surf) {
    const d = day[Math.min(i, day.length - 1)];
    const m = d.moist, turf = surf !== 'D';
    // ダートは水はけがよく、芝より早く乾く
    const g = turf ? (m < 0.25 ? 0 : m < 0.5 ? 1 : m < 0.75 ? 2 : 3) : (m < 0.3 ? 0 : m < 0.55 ? 1 : m < 0.8 ? 2 : 3);
    // 湿ったダートは前が止まりにくい
    const bias = turf ? { lane: d.laneT, pace: d.paceT } : { lane: d.laneD, pace: clamp(d.paceD + g * 0.15, -1, 1) };
    return { weather: WEATHERS[d.w], ground: GROUNDS[g], bias: { lane: Math.round(bias.lane * 100) / 100, pace: Math.round(bias.pace * 100) / 100 } };
  }
  // 道悪の巧拙（馬ごとに決まった値。-1 苦手 〜 +1 得意）
  function mudOf(h) { const x = Math.sin((h.id + 1) * 12.9898) * 43758.5453; return Math.round(((x - Math.floor(x)) * 2 - 1) * 100) / 100; }
  function biasText(b) {
    if (!b) return 'フラット';
    const a = b.lane > 0.35 ? '内有利' : b.lane < -0.35 ? '外有利' : '', c = b.pace > 0.35 ? '前有利' : b.pace < -0.35 ? '差し有利' : '';
    return [a, c].filter(Boolean).join('・') || 'フラット';
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
  const RIDE_FEE = 3; // 1騎乗あたりの手当（万円・ゲーム上の概算）
  const PRIZE_SHARE = 0.05; // 賞金のうち騎手の取り分（ゲーム上の概算）

  function news(W, text, kind = '') { W.news.unshift({ abs: W.abs, date: W.date, text, kind }); if (W.news.length > 60) W.news.length = 60; }
  function updateFans(P) { if (P.fanSeg) P.fans = Math.round(Object.values(P.fanSeg).reduce((a, b) => a + b, 0)); else P.fans = Math.round(300 + P.pop * P.pop * 55 + P.wins * 18); }

  // ---- 結果の反映 ----
  function applyResult(W, race, results, playerHid, mode, inquiry) {
    const P = W.player;
    race.result = results.map(r => ({ hid: r.horse.id, pos: r.pos, time: r.time, margin: r.margin, jname: r.cfg.jname, pop: race.field.find(f => f.hid === r.horse.id).pop, isP: r.horse.id === playerHid, demoted: !!r.demoted }));
    const prize1 = race.overseas ? 50000 : race.graded ? GPRIZE[race.graded] * (race.graded === 1 && /ジャパンC|有馬/.test(race.name) ? 2.5 : 1) : PRIZE[race.cls ?? 5];
    const share = [1, 0.4, 0.25, 0.15, 0.1];
    results.forEach(r => {
      const h = r.horse; h.starts++; h.last = W.abs;
      // お手馬（乗ったことのある馬）は、戦績を1走ずつ残す
      if (h.id === playerHid || W.player.bond[h.id] != null) {
        const ff = race.field.find(x => x.hid === h.id) || {};
        (h.hist = h.hist || []).push({ y: W.year, d: (W.date || '').replace(/^\d+年/, '').replace(/\(.\)$/, ''), n: race.name, g: race.overseas ? 9 : (race.graded || 0), v: VENUES[race.venue] ? VENUES[race.venue].name : '', c: (race.surf === 'D' ? 'ダ' : '芝') + race.dist, gr: race.ground || '良', pos: r.pos, of: results.length, pop: ff.pop || 0, me: h.id === playerHid, j: h.id === playerHid ? W.player.name : (r.cfg.jname || ''), t: r.time, mg: r.margin || '' });
        if (h.hist.length > 40) h.hist.shift();
      }
      if (r.pos <= 5) h.earn += Math.round(prize1 * share[r.pos - 1]);
      const f = race.field.find(f => f.hid === h.id);
      if (f.jid >= 0) { const j = W.jockeys[f.jid]; const st = (j.ys = j.ys || {})[W.year] || (j.ys[W.year] = { rides: 0, wins: 0, earn: 0 }); st.rides++; if (r.pos === 1) st.wins++; if (r.pos <= 5) st.earn += Math.round(prize1 * share[r.pos - 1]); }
      if (r.pos === 1) {
        h.wins++;
        if (!race.graded && !race.overseas && h.cls < 5) h.cls = Math.max(h.cls + 1, 2);
        if (race.graded || race.overseas) h.cls = 5; // 重賞を勝てばオープン馬
        if (h.cls === 0) h.cls = 2;
        if (race.graded === 1) h.g1.push(`${W.year} ${race.name}`);
        if (h.story) h.cls = 5; // 物語の馬は勝ち上がったら重賞路線へ
        if (f.jid >= 0) { const j = W.jockeys[f.jid]; j.wins++; j.years[W.year] = (j.years[W.year] || 0) + 1; j.pop = Math.min(100, j.pop + (race.graded === 1 ? 4 : race.graded ? 1 : 0.15)); }
        if (race.graded && playerHid !== h.id) news(W, `${race.name}は${h.name}${h.real ? '' : ''}が制した（${f.jid >= 0 ? W.jockeys[f.jid].name : f.jname || ''}騎手）`, 'race');
      } else if (h.cls === 0) h.cls = 1;
      // 重賞で上位に来た馬も、賞金を加えて上のクラスへ（GⅠの3着以内はオープン）
      if (r.pos > 1 && race.graded && h.cls < 5) { if (race.graded === 1 && r.pos <= 3) h.cls = 5; else if (r.pos === 2) h.cls = Math.min(5, Math.max(h.cls + 1, 3)); }
    });
    let ev = null;
    if (playerHid != null && race.declined && race.declined.length) {
      const myPos = results.find(r => r.horse.id === playerHid).pos;
      race.declined.forEach(dh => {
        const d = results.find(r => r.horse.id === dh); if (!d) return;
        if (d.pos < myPos) { P.rep = clamp(P.rep - 0.4, 0, 100); news(W, `${race.name}：${P.name}騎手が選ばなかった${d.horse.name}が${d.pos}着、騎乗馬に先着`, 'bad'); }
        else { P.rep = clamp(P.rep + 0.3, 0, 100); news(W, `${race.name}：${P.name}騎手の選択が的中（選ばなかった${d.horse.name}は${d.pos}着）`, 'me'); }
      });
    }
    if (playerHid != null) {
      const me = results.find(r => r.horse.id === playerHid);
      const f = race.field.find(f => f.hid === playerHid);
      const h = me.horse;
      const n = results.length;
      P.rides++;
      P.rep = Math.min(100, P.rep + 0.04);
      const ys = P.years[W.year] || (P.years[W.year] = { rides: 0, wins: 0, seconds: 0, thirds: 0, earn: 0, g: [], income: 0 });
      ys.rides++;
      if (me.pos === 1) {
        P.wins++; ys.wins++;
        // 通算勝利の節目
        if ([100, 300, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000].includes(P.wins)) { W.milestonePending = { wins: P.wins, race: race.name, horse: h.name, date: W.date }; news(W, `${P.name}騎手がJRA通算${P.wins}勝を達成（${race.name}・${h.name}）`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} 通算${P.wins}勝（${h.name}）` }); }
      }
      if (me.pos === 2) { P.seconds++; ys.seconds++; }
      if (me.pos === 3) { P.thirds++; ys.thirds++; }
      if (me.pos <= 5) { const e = Math.round(prize1 * share[me.pos - 1]); P.earn += e; ys.earn += e; }
      // 収入
      let income = RIDE_FEE + (me.pos <= 5 ? prize1 * share[me.pos - 1] * PRIZE_SHARE : 0);
      const ag = P.agent != null ? W.agents[P.agent] : null;
      const fee = ag ? income * ag.fee / 100 : 0;
      income = Math.round((income - fee) * 10) / 10;
      P.money = Math.round((P.money + income) * 10) / 10; ys.income = (ys.income || 0) + income;
      // 騎乗評価：人気と着順の比較
      const diff = (f.pop - me.pos) / n;
      let score = 50 + diff * 120 + (me.pos === 1 ? 20 : me.pos <= 3 ? 8 : 0) - (me.lateStart ? 10 : 0) - (inquiry && inquiry.weeks ? 15 : 0);
      score = clamp(score, 0, 100);
      const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D';
      const gMul = race.overseas ? 3 : race.graded === 1 ? 2.2 : race.graded ? 1.5 : 1;
      let dRep = ((score - 50) / 50) * 0.6 * gMul + (me.pos === 1 ? 0.6 * gMul : 0);
      if (dRep < 0) dRep *= 0.65; // 負けたときの下がり方は、勝ったときの上がり方より小さく
      dRep *= P.rep > 85 ? 0.3 : P.rep > 70 ? 0.5 : 1;
      P.rep = clamp(P.rep + dRep, 0, 100);
      // 人気（ファン）
      let dPop = me.pos === 1 ? 0.25 * gMul * gMul : 0;
      if (me.pos === 1 && f.pop >= 8) dPop += 0.6; // 大穴
      if (f.pop === 1 && me.pos > 5 && P.pop > 30) dPop -= 0.6; // 1番人気で大敗
      P.pop = clamp(P.pop + dPop, 0, 100); updateFans(P);
      const charm = window.Progress && Progress.has(W, 'charm') && score > 45 ? 1.3 : 1;
      P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) + (score - 45) / 10 * charm, 0, 100);
      P.otrust[h.owner] = clamp((P.otrust[h.owner] || 0) + (score - 45) / 12 * charm, 0, 100);
      P.bond[h.id] = clamp((P.bond[h.id] || 0) + (me.pos <= 3 ? 6 : 2) + (score > 60 ? 3 : 0), 0, 100);
      // 結果を出せば、その馬の主戦になる（負け続けると、前の主戦に戻されることもある）
      if (me.pos <= 3 || P.bond[h.id] >= 15 || (race.graded && me.pos <= 5)) h.mainJ = -1;
      h.skip = 0; if (h.promise === race.name) h.promise = null;
      // ライバルとの対戦成績
      (W.rivals || []).forEach(rv => {
        const rf = race.field.find(x => x.jid === rv.jid);
        if (!rf) return;
        const rr = results.find(x => x.horse.id === rf.hid);
        const hh = P.hh[rv.jid] || (P.hh[rv.jid] = { w: 0, l: 0 });
        if (me.pos < rr.pos) hh.w++; else hh.l++;
      });
      // 成長（実際に操作した騎乗の方が伸びる）
      const gain = (mode === 'manual' ? 1.0 : 0.45) * (P.age < 35 ? 1 : P.age < 45 ? 0.6 : 0.3);
      P.exp += gain;
      const gfx = window.Progress && Progress.gearFx ? Progress.gearFx(W) : { tech: 1, fall: 1, heal: 1 };
      P.tech = clamp(P.tech + gain * gfx.tech * (0.05 + score / 2000) * (1 - P.tech / 110), 0, 99);
      P.judge = clamp(P.judge + gain * (0.06 + (race.graded ? 0.05 : 0)) * (1 - P.judge / 110), 0, 99);
      P.fatigue += 1.2 * (1.25 - (P.phys || 55) / 200); // 体力があるほど疲れにくい
      let interview = null;
      if (me.pos === 1) {
        if (race.graded || race.overseas) {
          const t = `${W.year} ${race.name}（${h.name}）`;
          P.gWins.push(t); ys.g.push(t);
          if (race.graded === 1 || race.overseas) P.g1Wins.push(t);
          W.log.push({ abs: W.abs, text: `${W.date} ${race.name} を ${h.name} で制覇!` });
          news(W, `${P.name}騎手が${h.name}で${race.name}を制覇!`, 'me');
          interview = { kind: race.graded === 1 || race.overseas ? 'big' : 'graded', race: race.name, horse: h.name };
        }
        if (P.wins === 1) { W.log.push({ abs: W.abs, text: `${W.date} ${h.name} で初勝利` }); news(W, `${P.name}騎手がデビュー${P.rides}戦目で初勝利`, 'me'); interview = interview || { kind: 'first', horse: h.name }; }
        else if (f.pop >= 10 && !interview) interview = { kind: 'upset', horse: h.name, pop: f.pop };
        if (P.wins % 100 === 0) { W.log.push({ abs: W.abs, text: `${W.date} 通算${P.wins}勝達成` }); news(W, `${P.name}騎手が通算${P.wins}勝を達成`, 'me'); }
      }
      // 審議
      if (inquiry) {
        if (inquiry.weeks) {
          P.suspended = Math.max(P.suspended, inquiry.weeks);
          P.money -= 10 * inquiry.weeks; P.rep = clamp(P.rep - 1.5 * inquiry.weeks, 0, 100); P.pop = clamp(P.pop - 0.8, 0, 100);
          W.log.push({ abs: W.abs, text: `${W.date} 斜行で${inquiry.weeks}週間の騎乗停止` });
          news(W, `${P.name}騎手に${inquiry.weeks}週間の騎乗停止処分（${race.name}での斜行）`, 'bad');
        } else { P.money -= inquiry.fine || 5; news(W, `${P.name}騎手に過怠金（${race.name}）`, 'bad'); }
        if (inquiry.demoteTo) news(W, `${race.name}で${h.name}が${inquiry.demoteTo}着に降着`, 'bad');
      }
      // 落馬（低確率）
      if (Math.random() < 0.002 * gfx.fall) { W.injury = Math.max(1, Math.round(ri(2, 6) * gfx.heal)); W.log.push({ abs: W.abs, text: `${W.date} 落馬負傷（${W.injury}週休養）` }); news(W, `${P.name}騎手が落馬負傷、${W.injury}週の休養`, 'bad');  if (window.Drama) Drama.onInjury(W); }
      if (window.Story) Story.onResult(W, race, me, f);
      if (window.Drama) Drama.afterRace(W, race, results, me);
      if (window.Progress) Progress.onResult(W, race, me, f, { grade, mode });
      ev = { grade, score: Math.round(score), dRep: Math.round(dRep * 10) / 10, dPop: Math.round(dPop * 10) / 10, income, pos: me.pos, pop: f.pop, interview, inquiry, demoted: !!me.demoted };
    }
    return ev;
  }

  // 自分が乗らないレース・オート騎乗
  function simulate(W, race, playerHid, mode) {
    const r = setupRace(W, race, playerHid, mode || 'auto');
    const res = r.runToEnd();
    race.laps = r.laps();
    return applyResult(W, race, res, playerHid, mode || 'auto', null);
  }

  // ---- 取材 ----
  const INTERVIEW = {
    big: { q: '大一番を制した今の気持ちは?', a: [['馬のおかげです。厩舎スタッフに感謝しています', { rep: 1.2, pop: 1.5, trust: 3 }], ['自分の騎乗プランどおり。狙っていました', { rep: 0.4, pop: 3, trust: 0 }], ['ファンの声援が力になりました!', { rep: 0.3, pop: 4, trust: 0 }]] },
    graded: { q: '重賞勝利、おめでとうございます', a: [['馬が頑張ってくれました', { rep: 0.6, pop: 0.6, trust: 2 }], ['もっと上を狙える馬です', { rep: 0.2, pop: 1.2, otrust: 3 }], ['次はGⅠを勝ちたい', { rep: 0, pop: 1.6 }]] },
    first: { q: '待望の初勝利です。今の気持ちを', a: [['お世話になった方々に感謝したいです', { rep: 0.8, pop: 0.5, trust: 3 }], ['ここからが本当のスタートです', { rep: 0.4, pop: 1 }], ['リーディングを目指します!', { rep: -0.2, pop: 2 }]] },
    upset: { q: '人気薄での勝利でした', a: [['馬の力を信じていました', { rep: 0.6, pop: 1, trust: 2 }], ['展開が向きました', { rep: 0.3, pop: 0.4 }], ['もっと評価されていい馬です', { rep: 0.1, pop: 1.4, otrust: 2 }]] },
  };
  function answerInterview(W, iv, idx, horseTrainer, horseOwner) {
    const P = W.player; const eff = INTERVIEW[iv.kind].a[idx][1];
    P.rep = clamp(P.rep + (eff.rep || 0), 0, 100); P.pop = clamp(P.pop + (eff.pop || 0), 0, 100); updateFans(P);
    if (eff.trust && horseTrainer != null) P.trust[horseTrainer] = clamp((P.trust[horseTrainer] || 0) + eff.trust, 0, 100);
    if (eff.otrust && horseOwner != null) P.otrust[horseOwner] = clamp((P.otrust[horseOwner] || 0) + eff.otrust, 0, 100);
    P.interviews++;
    return eff;
  }

  // ---- 平日の予定 ----
  const ACTIVITIES = {
    train: { name: '調教騎乗', desc: '所属地の厩舎の信頼↑ 疲労↑', fat: 6 },
    owner: { name: '馬主へのあいさつ回り', desc: '馬主の信頼↑', fat: 3 },
    study: { name: 'レース研究', desc: '判断力↑', fat: 2 },
    gym: { name: 'トレーニング', desc: '体力↑ 体重↓', fat: 5 },
    diet: { name: '減量（サウナ）', desc: '体重↓↓ 体調↓', fat: 4 },
    fan: { name: 'ファンサービス', desc: '人気↑', fat: 4 },
    media: { name: 'メディア出演', desc: '人気↑ 収入↑', fat: 5, needPop: 25 },
    rest: { name: '休養', desc: '疲労↓↓ 体調↑', fat: -18 },
  };
  function doActivities(W) {
    const P = W.player;
    (P.schedule || []).forEach(a => {
      const A = ACTIVITIES[a]; if (!A) return;
      P.fatigue = Math.max(0, P.fatigue + A.fat);
      if (a === 'train') { const t = pick(W.trainers.filter(t => t.region === P.region)); P.trust[t.id] = clamp((P.trust[t.id] || 0) + 3, 0, 100); P.weight -= 0.05; }
      if (a === 'owner') { const o = W.owners.slice().sort((x, y) => (P.otrust[x.id] || 0) - (P.otrust[y.id] || 0))[ri(0, 4)]; P.otrust[o.id] = clamp((P.otrust[o.id] || 0) + 3.5, 0, 100); }
      if (a === 'study') P.judge = clamp(P.judge + 0.3 * (P.judge < 80 ? 1 : 0.4), 0, 99);
      if (a === 'gym') { P.phys = clamp(P.phys + 0.35, 0, 99); P.weight -= 0.15; }
      if (a === 'diet') { P.weight -= 0.6; P.cond -= 7; }
      if (a === 'fan') { P.pop = clamp(P.pop + 0.5, 0, 100); }
      if (a === 'media') { P.pop = clamp(P.pop + 0.8, 0, 100); P.money += Math.round(P.pop * 0.6); }
      if (a === 'rest') { P.cond = Math.min(100, P.cond + 6); }
    });
    updateFans(P);
  }

  // ---- 週ごとの出来事 ----
  function genEvents(W) {
    const P = W.player; const out = [];
    const r = Math.random;
    const trainerName = (id) => W.trainers[id].name;
    if (r() < 0.12 && P.pop >= 5) out.push({ title: '取材の依頼', text: '競馬専門誌から密着取材の依頼が来た。', choices: [['受ける', { pop: 1.5, fatigue: 6 }], ['断る', {}]] });
    if (r() < 0.08) { const t = pick(W.trainers.filter(t => t.region === P.region)); out.push({ title: '食事の誘い', text: `${t.name}の調教師から食事に誘われた。`, choices: [['行く', { trust: [t.id, 5], weight: 0.4 }], ['体重管理を理由に断る', { trust: [t.id, -1] }]] }); }
    if (P.weight + GEAR > 54.5 && r() < 0.3) out.push({ title: '体重が増えてきた', text: `体重が${P.weight.toFixed(1)}kg。軽い斤量の依頼を受けられなくなる。`, choices: [['食事制限を徹底する', { weight: -0.8, cond: -8 }], ['無理はしない', {}]] });
    if (P.agent == null && P.rep >= 12 && r() < 0.15) { const a = W.agents.filter(a => P.rep >= a.needRep).pop(); if (a) out.push({ title: 'エージェントからの売り込み', text: `${a.name}（手数料${a.fee}%）が騎乗依頼の仲介を申し出てきた。依頼の数と質が上がる。`, choices: [['契約する', { agent: a.id }], ['断る', {}]] }); }
    const topOwner = W.owners.filter(o => (P.otrust[o.id] || 0) >= 45 && P.contract !== o.id).sort((a, b) => P.otrust[b.id] - P.otrust[a.id])[0];
    if (topOwner && r() < 0.15) out.push({ title: '主戦騎手の打診', text: `${topOwner.name}から、所有馬の主戦を任せたいという話が来た。受けるとこの馬主の馬の依頼が優先して来るが、他の馬主の印象は少し下がる。`, choices: [['引き受ける', { contract: topOwner.id }], ['今はフリーでいたい', { otrust: [topOwner.id, -3] }]] });
    if (P.pop >= 35 && r() < 0.08) out.push({ title: 'CM出演のオファー', text: '飲料メーカーからCM出演の依頼。', choices: [['出演する', { money: 120, pop: 3, fatigue: 10 }], ['騎乗に専念する', { rep: 0.5 }]] });
    if (P.pop >= 10 && r() < 0.06) out.push({ title: 'ファン感謝イベント', text: '競馬場のファン感謝イベントへの参加依頼。', choices: [['参加する', { pop: 2, fatigue: 5 }], ['欠席する', {}]] });
    const riv = (W.rivals || [])[0];
    if (riv && r() < 0.06) { const j = W.jockeys[riv.jid]; out.push({ title: 'ライバルの挑発', text: `同期の${j.name}騎手が「今年は負けない」と雑誌で発言した。`, choices: [['受けて立つと言い返す', { pop: 1.5, rep: -0.3 }], ['自分の騎乗をするだけ', { rep: 0.3 }]] }); }
    if (P.fatigue > 45 && r() < 0.35) out.push({ title: '疲れがたまっている', text: '体が重い。このままだと体調を崩しそうだ。', choices: [['今週は休養に専念する', { fatigue: -25, cond: 8, sched: 'rest' }], ['気合で乗り切る', { cond: -10 }]] });
    return out.slice(0, 2);
  }
  function applyEvent(W, e, idx) {
    const P = W.player; const eff = e.choices[idx][1];
    if (eff.pop) P.pop = clamp(P.pop + eff.pop, 0, 100);
    if (eff.rep) P.rep = clamp(P.rep + eff.rep, 0, 100);
    if (eff.money) P.money += eff.money;
    if (eff.fatigue) P.fatigue = Math.max(0, P.fatigue + eff.fatigue);
    if (eff.cond) P.cond = clamp(P.cond + eff.cond, 0, 100);
    if (eff.weight) P.weight += eff.weight;
    if (eff.trust) P.trust[eff.trust[0]] = clamp((P.trust[eff.trust[0]] || 0) + eff.trust[1], 0, 100);
    if (eff.otrust) P.otrust[eff.otrust[0]] = clamp((P.otrust[eff.otrust[0]] || 0) + eff.otrust[1], 0, 100);
    if (eff.agent != null) { P.agent = eff.agent; news(W, `${P.name}騎手が${W.agents[eff.agent].name}と契約`, 'me'); }
    if (eff.contract != null) { P.contract = eff.contract; W.owners.forEach(o => { if (o.id !== eff.contract) P.otrust[o.id] = clamp((P.otrust[o.id] || 0) - 3, 0, 100); }); news(W, `${P.name}騎手が${W.owners[eff.contract].name}の主戦騎手に`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${W.owners[eff.contract].name}の主戦騎手に` }); }
    if (eff.sched) P.schedule = [eff.sched, eff.sched, eff.sched];
    if (window.Progress) Progress.applyLife(W, eff);
    updateFans(P);
    // 体重が変わったら依頼の斤量判定をやり直す
    (W.requests || []).forEach(q => { q.okWeight = canMakeWeight(P, q.kin); if (!q.okWeight) q.accepted = false; });
  }

  // ---- 週の終了 ----
  function endWeek(W) {
    const P = W.player;
    doActivities(W);
    // 体重・体調・疲労の自然な変化
    // 何もしなければ少しずつ増える（年齢とともに増えやすい）。適正体重より重いほど戻りにくい
    P.weight += 0.03 + (P.age > 30 ? 0.02 : 0) + (P.age > 40 ? 0.02 : 0);
    P.weight = clamp(P.weight, 44, 62);
    P.cond = clamp(P.cond + (P.fatigue < 25 ? 3 : P.fatigue < 50 ? 0 : -4), 20, 100);
    P.fatigue = Math.max(0, P.fatigue - 6);
    P.money = Math.round((P.money - 5) * 10) / 10; // 生活費
    if (P.age >= 42) P.phys = Math.max(10, P.phys - 0.03 * (P.age - 41));
    for (const k in P.trust) if (P.trust[k] > 15 && +k !== P.stable) P.trust[k] -= 0.08;
    for (const k in P.otrust) if (P.otrust[k] > 15 && +k !== P.contract) P.otrust[k] -= 0.06;
    P.pop = Math.max(0, P.pop - 0.04); updateFans(P);
    if (W.injury > 0) W.injury--;
    if (W.away) W.away.left--; // 海外武者修行の残り
    if (P.suspended > 0) P.suspended--;
    W.abs++; W.wk++;
    const weeks = weekSundays(W.year);
    let yearEnd = null;
    if (W.wk >= weeks.length) {
      yearEnd = yearSummary(W);
      W.year++; W.wk = 0; P.age++;
      P.yearsActive = (P.yearsActive || 0) + 1;
      Object.values(W.horses).forEach(h => {
        const age = W.year - h.born;
        if (h.retired) return;
        if (age >= 8 || (age >= 4 && h.cls <= 1) || (age >= 6 && Math.random() < 0.35) || (age >= 3 && h.cls === 1 && Math.random() < 0.4)) { h.retired = true; if (P.bond[h.id] >= 20) news(W, `お手馬の${h.name}が引退`, 'me'); }
      });
      Object.values(W.horses).forEach(h => { if (h.retired && !P.bond[h.id] && !h.g1.length && !h.real) { W.usedNames.delete(h.name); delete W.horses[h.id]; } });
      W.jockeys.forEach(j => { j.age++; if (j.age > 30) j.skill = Math.max(35, j.skill - (j.age > 45 ? 1 : 0)); else j.skill = Math.min(95, j.skill + 1); j.pop = Math.max(0, j.pop * 0.9); // 引退：55歳を過ぎると年ごとに引退しやすくなる（ゲーム上の決まり）。後には架空の新人が入る
      if (j.age >= 56 && Math.random() < (j.age - 54) * 0.12 || j.age >= 63) { if (j.real) news(W, `${j.name}騎手が引退`, 'race'); j.debut = W.year + 1; j.name = uniqueName(new Set(W.jockeys.map(x => x.name).concat([W.player.name]))); j.real = false; j.fictional = true; j.age = 18; j.skill = ri(35, 55); j.years = {}; j.ys = {}; j.wins = 0; j.pop = 3; } });
    }
    prepareWeek(W);
    W.events = genEvents(W);
    if (window.Progress) Progress.onWeekEnd(W);
    if (window.Story) Story.onWeekStart(W);
    if (window.Drama) Drama.onWeek(W);
    return yearEnd;
  }
  function yearSummary(W) {
    const P = W.player;
    const ys = P.years[W.year] || { rides: 0, wins: 0, seconds: 0, thirds: 0, earn: 0, g: [] };
    const rows = W.jockeys.map(j => { const st = (j.ys || {})[W.year] || { rides: 0, wins: j.years[W.year] || 0, earn: 0 }; return { name: j.name, jid: j.id, wins: st.wins, rides: st.rides, earn: st.earn, rookie: j.debut === W.year }; });
    rows.push({ name: P.name, me: true, wins: ys.wins, rides: ys.rides, earn: ys.earn || 0, rookie: (P.yearsActive || 0) === 0 });
    const table = rows.slice().sort((a, b) => b.wins - a.wins);
    const rank = table.findIndex(t => t.me) + 1;
    const popRank = W.jockeys.filter(j => j.pop > P.pop).length + 1;
    // JRA賞（騎手部門）。MVJ は勝利数・勝率・獲得賞金・騎乗回数の順位を点数にして合計する（JRAの説明による）。
    // 勝率の対象になる騎乗回数の下限と、順位の点数の付け方はゲーム上の決まり
    const top = (arr, key) => arr.slice().sort((a, b) => b[key] - a[key])[0];
    const minRides = Math.max(30, Math.round(Math.max(...rows.map(r => r.rides)) * 0.3));
    rows.forEach(r => { r.rate = r.rides ? r.wins / r.rides : 0; });
    const elig = rows.filter(r => r.rides >= minRides);
    const pts = new Map(rows.map(r => [r, 0]));
    ['wins', 'rate', 'earn', 'rides'].forEach(k => { (k === 'rate' ? elig : rows).slice().sort((a, b) => b[k] - a[k]).slice(0, 10).forEach((r, i) => pts.set(r, pts.get(r) + 10 - i)); });
    rows.forEach(r => { r.mvj = pts.get(r); });
    const rookies = rows.filter(r => r.rookie && r.wins > 0);
    const jra = [
      { name: '最多勝利騎手', who: top(rows, 'wins'), stat: (r) => `${r.wins}勝` },
      { name: '最高勝率騎手', who: top(elig.length ? elig : rows, 'rate'), stat: (r) => `勝率${(r.rate * 100).toFixed(1)}%（${r.rides}騎乗）` },
      { name: '最多賞金獲得騎手', who: top(rows, 'earn'), stat: (r) => `${(r.earn / 10000).toFixed(2)}億円` },
      { name: '最多勝利新人騎手', who: rookies.length ? top(rookies, 'wins') : null, stat: (r) => `${r.wins}勝` },
      { name: 'MVJ', who: top(rows, 'mvj'), stat: (r) => `${r.mvj}ポイント` },
    ].map(a => ({ name: a.name, winner: a.who ? a.who.name : null, me: !!(a.who && a.who.me), stat: a.who ? a.stat(a.who) : '該当者なし' }));
    const awards = jra.filter(a => a.me).map(a => a.name);
    // 年度代表馬（その年のGⅠ勝利が最も多い馬）
    let hoy = null;
    Object.values(W.horses).forEach(h => { const n = (h.g1 || []).filter(t => t.startsWith(String(W.year))).length; if (n && (!hoy || n > hoy.n)) hoy = { h, n }; });
    const hoyInfo = hoy ? { name: hoy.h.name, n: hoy.n, races: hoy.h.g1.filter(t => t.startsWith(String(W.year))).map(t => t.slice(5)), mine: (P.trophies || []).some(t => t.horse === hoy.h.name && t.year === W.year) } : null;
    // 顕彰馬（殿堂入り）：自分が乗ってGⅠを勝った引退馬から、記者投票で4分の3以上の票を集めると選ばれる（JRAの方式。投票の中身はゲーム上の計算）
    const hof = [];
    const ridden = new Set((P.trophies || []).map(t => t.horse));
    Object.values(W.horses).forEach(h => {
      if (!h.retired || h.hof || !ridden.has(h.name) || (h.g1 || []).length < 3 || h.hofTried >= 3) return;
      const g = h.g1.length, tri = ['皐月賞', '日本ダービー', '菊花賞'].every(n => h.g1.some(t => t.includes(n))) || ['桜花賞', 'オークス', '秋華賞'].every(n => h.g1.some(t => t.includes(n)));
      const pct = Math.min(0.99, 0.35 + g * 0.09 + (tri ? 0.3 : 0) + rnd(-0.06, 0.06));
      h.hofTried = (h.hofTried || 0) + 1;
      const ok = pct >= 0.75; if (ok) { h.hof = W.year; P.hofHorses = (P.hofHorses || 0) + 1; news(W, `${h.name}が顕彰馬に選定（得票率${(pct * 100).toFixed(1)}%）`, 'me'); }
      hof.push({ name: h.name, g1: g, pct, ok });
    });
    W.log.push({ abs: W.abs, text: `${W.year}年 ${ys.wins}勝（リーディング${rank}位）${awards.length ? '・' + awards.join('・') : ''}` });
    news(W, `${W.year}年の成績：${ys.wins}勝、リーディング${rank}位`, 'me');
    if (awards.length) news(W, `${P.name}騎手がJRA賞（${awards.join('・')}）を受賞`, 'me');
    if (awards.includes('MVJ')) P.mvjYears = (P.mvjYears || 0) + 1;
    const ye = { year: W.year, ys, rank, popRank, table: table.slice(0, 10).map(t => ({ name: t.me ? t.name + '（あなた）' : t.name, wins: t.wins, me: t.me })), awards, jra, hoy: hoyInfo, hof };
    if (window.Progress) Progress.yearEnd(W, ye);
    return ye;
  }

  // ---- セーブ ----
  // ---- セーブ ----
  // 保存先の名前（SAVE_KEY）は今後も変えない。中身の形が変わっても migrate で古いセーブを読めるようにする
  const SAVE_VER = 5;
  const BAK_KEY = SAVE_KEY + '-bak';
  const OLD_KEYS = ['jockey-life-save', 'jockey-life-save-v1'];
  let onSaved = null;
  function serialize(W) { return JSON.stringify({ ...W, usedNames: [...(W.usedNames || [])], saveVer: SAVE_VER, savedAt: Date.now() }); }
  function save(W) {
    try {
      const str = serialize(W);
      // 直前のセーブを控えに残してから上書きする（書き込みに失敗しても片方は残る）
      try { const cur = localStorage.getItem(SAVE_KEY); if (cur) localStorage.setItem(BAK_KEY, cur); } catch (e) {}
      localStorage.setItem(SAVE_KEY, str);
      if (onSaved) try { onSaved(str); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }
  // 文字列から読み込む（端末のセーブ・控え・書き出したファイル・クラウドの共通の入口）
  function parse(str) {
    try {
      const o = JSON.parse(str);
      if (!o || !o.player || !o.horses || !o.card) return null;
      return migrate(o);
    } catch (e) { return null; }
  }
  // 古い版のセーブに、新しい版で増えた項目を補う
  function migrate(o) {
    o.usedNames = new Set(o.usedNames || []);
    const fresh = newGame({ name: (o.player && o.player.name) || 'あなた', region: o.player && o.player.region, color: o.player && o.player.color });
    for (const k of Object.keys(fresh)) if (o[k] === undefined) o[k] = fresh[k];
    for (const k of Object.keys(fresh.player)) if (o.player[k] === undefined) o.player[k] = fresh.player[k];
    (o.card || []).forEach((r) => { if (!r.weather) r.weather = '晴'; if (!r.ground) r.ground = '良'; if (!r.bias) r.bias = { lane: 0, pace: 0 }; });
    // 古いセーブの架空の騎手を、実在の騎手に入れ替える（物語のライバルと、すでに引退後の新人はそのまま）
    if ((o.saveVer || 0) < 5 && window.REAL_JOCKEYS && o.jockeys) {
      const keep = new Set((o.rivals || []).slice(0, 2).map(r => r.jid));
      const used = new Set(o.jockeys.filter(j => keep.has(j.id)).map(j => j.name).concat([o.player.name]));
      const list = REAL_JOCKEYS.filter(rj => !used.has(rj.n));
      let k = 0;
      o.jockeys.forEach(j => { if (keep.has(j.id)) { j.fictional = true; return; } const rj = list[k++]; if (!rj) return; const nj = realJockey(j.id, rj); nj.age = (o.year || START_YEAR) - rj.b; Object.assign(j, { name: nj.name, real: true, region: nj.region, skill: nj.skill, age: nj.age, pop: nj.pop }); });
      // 足りない分の実在の騎手を足す
      for (; k < list.length; k++) { const nj = realJockey(o.jockeys.length, list[k]); nj.age = (o.year || START_YEAR) - list[k].b; o.jockeys.push(nj); }
      const top = o.jockeys.slice().sort((a, b) => b.skill - a.skill)[0];
      if (o.rivals && o.rivals[2]) { o.rivals[2].jid = top.id; o.player.hh = o.player.hh || {}; if (!o.player.hh[top.id]) o.player.hh[top.id] = { w: 0, l: 0 }; }
    }
    dedupeJockeys(o);
    fixCardDupes(o);
    // 古い名付け方の馬名（英単語の組み合わせ）を付け直す。乗ったことのある馬・実在馬・物語の馬・GⅠ馬はそのまま
    if ((o.saveVer || 0) < 4 && window.HORSE_WORDS) {
      const keep = (h) => h.real || h.story || h.nameMean || (o.player.bond && o.player.bond[h.id]) || (h.g1 && h.g1.length) || (o.story && o.story.partner === h.id);
      Object.values(o.horses || {}).forEach(h => { if (keep(h) || h.foreign) return; o.usedNames.delete(h.name); const nm = namedHorse(o.usedNames, h.owner); h.name = nm.name; h.nameMean = nm.mean; });
    }
    o.saveVer = SAVE_VER;
    return o;
  }
  function rawSave() {
    try {
      let s = localStorage.getItem(SAVE_KEY);
      if (!s) for (const k of OLD_KEYS) { s = localStorage.getItem(k); if (s) break; }
      return s || null;
    } catch (e) { return null; }
  }
  function load() {
    try {
      const W = parse(rawSave() || '');
      if (W) return W;
      // 本体が壊れていたら控えから
      const b = localStorage.getItem(BAK_KEY);
      return b ? parse(b) : null;
    } catch (e) { return null; }
  }
  function hasSave() { try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(BAK_KEY) || OLD_KEYS.some(k => localStorage.getItem(k))); } catch (e) { return false; } }
  // 消すときも控えは残す（引退後に新しく始めた場合など）
  function deleteSave() { try { const cur = localStorage.getItem(SAVE_KEY); if (cur) localStorage.setItem(BAK_KEY, cur); localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function saveInfo(str) {
    try { const o = JSON.parse(str); return { name: o.player.name, date: o.date, wins: o.player.wins, savedAt: o.savedAt || null }; } catch (e) { return null; }
  }

  window.World = {
    mudOf, biasText, contestChance, giveRide, declineRide, pitchTargets, pitch, serialize, parse, rawSave, saveInfo, setOnSaved(f) { onSaved = f; }, newGame, prepareWeek, setupRace, applyResult, simulate, endWeek, save, load, hasSave, deleteSave,
    rating, ability, CLASS_NAMES, apprenticeAllowance, fmtDate, estimateOdds,
    answerInterview, INTERVIEW, ACTIVITIES, applyEvent, genEvents, canMakeWeight, kinryo, GEAR, news,
    buildCard, buildRequests, gradedForWeek, orderFor, judgeOrder, talkAnswer, nextPlan, routeOptions, genHorse, sundayOfWeek, eligible, gearOf,
  };
})();
