// ===== 騎手の成長・人気・お金・目標・私生活 =====
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  // ---- スキル ----
  const SKILLS = [
    { id: 'start', name: 'スタート名人', cat: '騎乗', cost: 1, desc: 'ゲートの反応がよくなり、出遅れにくい' },
    { id: 'calm', name: '折り合い名人', cat: '騎乗', cost: 1, desc: '馬がかかりにくくなる（折合ゲージが減りにくい）' },
    { id: 'whip', name: 'ムチさばき', cat: '騎乗', cost: 1, desc: 'ムチの効果が1.5倍。打っても馬が反抗しない' },
    { id: 'inside', name: 'イン突き', cat: '騎乗', cost: 2, desc: '馬群の狭いところでも減速が小さい' },
    { id: 'closer', name: '追い込みの鬼', cat: '戦法', cost: 2, desc: '差し・追込の馬で、直線の伸びが上がる' },
    { id: 'front', name: '逃げの名手', cat: '戦法', cost: 2, desc: '先頭を走るときのスタミナ消費が減る' },
    { id: 'stayer', name: '長距離の達人', cat: '戦法', cost: 2, desc: '2400m以上でスタミナ消費が減る' },
    { id: 'sprint', name: '短距離の鬼', cat: '戦法', cost: 2, desc: '1400m以下で加速がよくなる' },
    { id: 'bigstage', name: '大舞台に強い', cat: '戦法', cost: 3, desc: 'GⅠと海外で馬の力を引き出す' },
    { id: 'weight', name: '体重管理', cat: '生活', cost: 1, desc: '体重が増えにくくなる' },
    { id: 'charm', name: '人たらし', cat: '生活', cost: 1, desc: '調教師・馬主の信頼が上がりやすい' },
    { id: 'fanservice', name: 'ファンサービス', cat: '生活', cost: 1, desc: '人気・ファンが増えやすい' },
  ];
  const has = (W, id) => !!(W.player.skills && W.player.skills[id]);
  const xpNeed = (lv) => 60 + lv * 30;

  // ---- 装備・スタッフ・住まい ----
  // cat: race=レースで使う装備 / body=体を守る装備 / home=自宅の設備
  // 最上位の品を買うと強化できる。up は強化1回目の上がり幅で、回を重ねるごとに少しずつ小さくなる（×UP_DECAY）
  const GEAR = {
    saddle: [{ name: '支給の鞍', price: 0 }, { name: '軽量鞍', price: 180, gear: -0.4, desc: '装備重量 -0.4kg' }, { name: '特注カーボン鞍', price: 650, gear: -0.8, desc: '装備重量 -0.8kg', up: { gear: -0.04 } }],
    whip: [{ name: '支給のムチ', price: 0 }, { name: '競技用ムチ', price: 60, whip: 1.15, desc: 'ムチの効果 +15%' }, { name: '特注ムチ', price: 240, whip: 1.3, desc: 'ムチの効果 +30%', up: { whip: 0.02 } }],
    boots: [{ name: '支給のブーツ', price: 0 }, { name: '革ブーツ', price: 90, start: 0.04, desc: 'スタートの反応 +0.04秒' }, { name: '特注ブーツ', price: 300, start: 0.08, desc: 'スタートの反応 +0.08秒', up: { start: 0.006 } }],
    goggles: [{ name: '支給のゴーグル', price: 0 }, { name: '曇り止めゴーグル', price: 50, calm: 0.9, desc: 'かかりにくさ +10%' }, { name: '特注ゴーグル', price: 160, calm: 0.8, desc: 'かかりにくさ +20%', up: { calm: -0.015 } }],
    gloves: [{ name: '支給のグローブ', price: 0 }, { name: '滑り止めグローブ', price: 70, drive: 0.001, desc: '追い出しの伸び +0.1%' }, { name: '特注レザーグローブ', price: 260, drive: 0.002, desc: '追い出しの伸び +0.2%', up: { drive: 0.00015 } }],
    helmet: [{ name: '支給のヘルメット', price: 0 }, { name: '軽量ヘルメット', price: 120, fall: 0.8, desc: '落馬の危険 -20%' }, { name: '特注カーボンヘルメット', price: 420, fall: 0.6, desc: '落馬の危険 -40%', up: { fall: -0.03 } }],
    vest: [{ name: '支給のプロテクター', price: 0 }, { name: '衝撃吸収ベスト', price: 150, heal: 0.8, desc: 'けがの休養期間 -20%' }, { name: 'エアバッグベスト', price: 520, heal: 0.6, desc: 'けがの休養期間 -40%', up: { heal: -0.025 } }],
    sim: [{ name: 'なし', price: 0 }, { name: '木馬', price: 400, tech: 1.1, desc: '技術の伸び +10%' }, { name: '騎乗シミュレーター', price: 1200, tech: 1.2, desc: '技術の伸び +20%', up: { tech: 0.02 } }],
    capsule: [{ name: 'なし', price: 0 }, { name: 'マッサージチェア', price: 250, rest: 0.6, desc: '毎週の疲労回復 +0.6' }, { name: '酸素カプセル', price: 900, rest: 1.2, desc: '毎週の疲労回復 +1.2', up: { rest: 0.12 } }],
    sauna: [{ name: 'なし', price: 0 }, { name: '家庭用サウナ', price: 200, slim: 0.01, desc: '体重の増え方 -0.01kg/週' }, { name: '本格サウナ室', price: 700, slim: 0.02, desc: '体重の増え方 -0.02kg/週', up: { slim: 0.002 } }],
    gym: [{ name: 'なし', price: 0 }, { name: 'トレーニング器具', price: 300, fit: 0.03, desc: '体力 +0.03/週' }, { name: 'ホームジム', price: 1000, fit: 0.06, desc: '体力 +0.06/週', up: { fit: 0.006 } }],
  };
  const GEAR_LABEL = { saddle: '鞍', whip: 'ムチ', boots: 'ブーツ', goggles: 'ゴーグル', gloves: 'グローブ', helmet: 'ヘルメット', vest: 'プロテクター', sim: '騎乗練習', capsule: '疲労回復', sauna: '減量', gym: 'トレーニング' };
  const GEAR_CAT = [['race', 'レース装備', ['saddle', 'whip', 'boots', 'goggles', 'gloves']], ['body', '安全装備', ['helmet', 'vest']], ['home', '自宅の設備', ['sim', 'capsule', 'sauna', 'gym']]];
  const UP_MAX = 20, UP_DECAY = 0.93, UP_COST = 0.3, UP_GROW = 1.25;
  const topLv = (k) => GEAR[k].length - 1;
  const upLv = (W, k) => (W.player.gearUp && W.player.gearUp[k]) || 0;
  const upCost = (k, n) => Math.round(GEAR[k][topLv(k)].price * UP_COST * Math.pow(UP_GROW, n) / 5) * 5;
  const upSum = (n) => (1 - Math.pow(UP_DECAY, n)) / (1 - UP_DECAY); // 強化n回分の合計（1回目=1）
  // 装備の実際の値（強化を含む）。持っていなければ def
  function gv(W, k, key, def) {
    const P = W.player, lv = (P.gear && P.gear[k]) || 0, it = GEAR[k][lv];
    let v = it[key] != null ? it[key] : def;
    if (lv === topLv(k) && it.up && it.up[key] != null) v += it.up[key] * upSum(upLv(W, k));
    return v;
  }
  // 表示用：いまの効果（強化込み）
  const FMT = {
    gear: (v) => `装備重量 ${v.toFixed(2)}kg`, whip: (v) => `ムチの効果 +${Math.round((v - 1) * 100)}%`, start: (v) => `スタートの反応 +${v.toFixed(3)}秒`,
    calm: (v) => `かかりにくさ +${Math.round((1 - v) * 100)}%`, drive: (v) => `追い出しの伸び +${(v * 100).toFixed(2)}%`, fall: (v) => `落馬の危険 -${Math.round((1 - v) * 100)}%`,
    heal: (v) => `けがの休養期間 -${Math.round((1 - v) * 100)}%`, tech: (v) => `技術の伸び +${Math.round((v - 1) * 100)}%`, rest: (v) => `毎週の疲労回復 +${v.toFixed(2)}`,
    slim: (v) => `体重の増え方 -${v.toFixed(3)}kg/週`, fit: (v) => `体力 +${v.toFixed(3)}/週`,
  };
  function gearEffect(W, k, extra) {
    const it = GEAR[k][topLv(k)], key = Object.keys(it.up)[0], P = W.player;
    const lv = (P.gear && P.gear[k]) || 0, n = upLv(W, k) + (extra || 0);
    const v = (GEAR[k][lv][key] != null ? GEAR[k][lv][key] : 0) + (lv === topLv(k) ? it.up[key] * upSum(n) : 0);
    return FMT[key](v);
  }
  const STAFF = [
    { id: 'trainer', name: 'パーソナルトレーナー', weekly: 6, desc: '体力が伸び、疲労が抜けやすい' },
    { id: 'nutrition', name: '栄養士', weekly: 4, desc: '体重が増えにくく、体調が安定する' },
    { id: 'manager', name: 'マネージャー', weekly: 8, desc: 'メディアの依頼が増え、人気が上がりやすい' },
  ];
  const HOMES = [
    { name: '騎手寮', price: 0, weekly: 0, cond: 0 },
    { name: 'トレセン近くのマンション', price: 300, weekly: 3, cond: 2 },
    { name: '一戸建て', price: 1500, weekly: 6, cond: 4 },
  ];

  // ---- 称号 ----
  const TITLES = [
    { name: '見習い', need: (P) => true },
    { name: '新人', need: (P) => P.wins >= 10 },
    { name: '若手', need: (P) => P.wins >= 50 },
    { name: '中堅', need: (P) => P.wins >= 150 },
    { name: '一流', need: (P) => P.wins >= 300 && P.g1Wins.length >= 1 },
    { name: '名手', need: (P) => P.wins >= 600 && P.g1Wins.length >= 5 },
    { name: 'トップジョッキー', need: (P) => P.wins >= 1000 && P.g1Wins.length >= 15 },
    { name: 'レジェンド', need: (P) => P.wins >= 1800 && P.g1Wins.length >= 30 },
  ];
  function title(W) { const P = W.player; let t = TITLES[0].name; TITLES.forEach(x => { if (x.need(P)) t = x.name; }); return t; }

  // ---- 実績 ----
  // ---- 称号（同じ馬・同じ年でのGⅠ制覇の組み合わせ） ----
  // trophies: [{ year, name, horse }]（自分が騎乗して勝ったGⅠ・海外GⅠ）
  const TR = (W) => W.player.trophies || [];
  const won = (W, race) => TR(W).filter(t => t.name === race);
  // 同じ馬で races をすべて勝ったか（sameYear なら同じ年に）。進み具合 [最大数, 全体] も返す
  function combo(W, races, sameYear) {
    let best = 0, done = false;
    const keys = new Set(TR(W).filter(t => races.includes(t.name)).map(t => t.horse + (sameYear ? '|' + t.year : '')));
    keys.forEach(k => {
      const [h, y] = k.split('|');
      const n = races.filter(r => TR(W).some(t => t.name === r && t.horse === h && (!sameYear || String(t.year) === y))).length;
      best = Math.max(best, n); if (n === races.length) done = true;
    });
    return { done, best, total: races.length };
  }
  // 騎手として races をすべて勝ったか（馬は問わない）
  function career(W, races) { const n = races.filter(r => won(W, r).length).length; return { done: n === races.length, best: n, total: races.length }; }
  const T3 = (name, races, sameYear, desc, cat = '称号') => ({ id: 't_' + name, cat, name, desc: desc || races.join('・') + (sameYear ? '（同じ馬・同じ年）' : '（同じ馬）'), test: (W) => combo(W, races, sameYear).done, prog: (W) => combo(W, races, sameYear), title: true });
  const C1 = ['皐月賞', '日本ダービー', '菊花賞'], C2 = ['桜花賞', 'オークス', '秋華賞'];
  const JRA_G1 = (window.GRADED || []).filter(g => g.g === 1).map(g => g.name);
  const TITLES_ACH = [
    T3('牡馬三冠', C1, false),
    T3('牝馬三冠', C2, false),
    { id: 't_二冠', cat: '称号', name: '二冠', desc: '皐月賞・日本ダービー・菊花賞のうち2つ（同じ馬）', test: (W) => combo(W, C1, false).best >= 2, prog: (W) => ({ best: Math.min(2, combo(W, C1, false).best), total: 2 }), title: true },
    { id: 't_牝馬二冠', cat: '称号', name: '牝馬二冠', desc: '桜花賞・オークス・秋華賞のうち2つ（同じ馬）', test: (W) => combo(W, C2, false).best >= 2, prog: (W) => ({ best: Math.min(2, combo(W, C2, false).best), total: 2 }), title: true },
    T3('変則二冠', ['NHKマイルC', '日本ダービー'], false),
    T3('春古馬三冠', ['大阪杯', '天皇賞（春）', '宝塚記念'], true),
    T3('秋古馬三冠', ['天皇賞（秋）', 'ジャパンC', '有馬記念'], true),
    T3('春秋グランプリ制覇', ['宝塚記念', '有馬記念'], true),
    T3('天皇賞春秋制覇', ['天皇賞（春）', '天皇賞（秋）'], true),
    T3('春秋スプリント制覇', ['高松宮記念', 'スプリンターズS'], true),
    T3('春秋マイル制覇', ['安田記念', 'マイルチャンピオンシップ'], true),
    T3('ダート王', ['フェブラリーS', 'チャンピオンズC'], true),
    { id: 't_2歳王者', cat: '称号', name: '2歳王者', desc: '朝日杯フューチュリティS・ホープフルS・阪神ジュベナイルFのどれか', test: (W) => ['朝日杯フューチュリティS', 'ホープフルS', '阪神ジュベナイルF'].some(r => won(W, r).length), title: true },
    // 騎手としての記録（馬は問わない）
    { id: 't_八大', cat: '騎手の記録', name: '八大競走制覇', desc: '桜花賞・皐月賞・オークス・日本ダービー・菊花賞・天皇賞（春）・天皇賞（秋）・有馬記念をすべて勝つ', test: (W) => career(W, ['桜花賞', '皐月賞', 'オークス', '日本ダービー', '菊花賞', '天皇賞（春）', '天皇賞（秋）', '有馬記念']).done, prog: (W) => career(W, ['桜花賞', '皐月賞', 'オークス', '日本ダービー', '菊花賞', '天皇賞（春）', '天皇賞（秋）', '有馬記念']) },
    { id: 't_classic5', cat: '騎手の記録', name: '五大クラシック制覇', desc: '桜花賞・皐月賞・オークス・日本ダービー・菊花賞をすべて勝つ', test: (W) => career(W, ['桜花賞', '皐月賞', 'オークス', '日本ダービー', '菊花賞']).done, prog: (W) => career(W, ['桜花賞', '皐月賞', 'オークス', '日本ダービー', '菊花賞']) },
    { id: 't_allg1', cat: '騎手の記録', name: 'JRA・GⅠ完全制覇', desc: `JRAの平地GⅠ ${JRA_G1.length}競走をすべて勝つ（このゲームにある競走）`, test: (W) => JRA_G1.length > 0 && career(W, JRA_G1).done, prog: (W) => career(W, JRA_G1) },
    { id: 't_year5', cat: '騎手の記録', name: '年間GⅠ 5勝', desc: '1年のうちにGⅠ・海外GⅠを5勝', test: (W) => yearMax(W) >= 5, prog: (W) => ({ best: Math.min(5, yearMax(W)), total: 5 }) },
    { id: 't_3peat', cat: '騎手の記録', name: '同一GⅠ 3連覇', desc: '同じGⅠを3年続けて勝つ（馬は問わない）', test: (W) => repeatMax(W) >= 3, prog: (W) => ({ best: Math.min(3, repeatMax(W)), total: 3 }) },
    { id: 't_abroad3', cat: '騎手の記録', name: '海外GⅠ 3勝', desc: '海外のGⅠを3勝', test: (W) => abroad(W) >= 3, prog: (W) => ({ best: Math.min(3, abroad(W)), total: 3 }) },
  ];
  const OVERSEAS_NAMES = (window.OVERSEAS || []).map(o => o.name);
  function abroad(W) { return TR(W).filter(t => OVERSEAS_NAMES.includes(t.name)).length; }
  function yearMax(W) { const c = {}; TR(W).forEach(t => c[t.year] = (c[t.year] || 0) + 1); return Math.max(0, ...Object.values(c)); }
  function repeatMax(W) {
    let best = 0; const by = {};
    TR(W).forEach(t => (by[t.name] = by[t.name] || new Set()).add(t.year));
    Object.values(by).forEach(ys => { ys.forEach(y => { let n = 1; while (ys.has(y + n)) n++; best = Math.max(best, n); }); });
    return best;
  }
  const ACH = [
    { id: 'win1', cat: '勝利', name: '初勝利', test: (W) => W.player.wins >= 1 },
    { id: 'win10', cat: '勝利', name: '10勝', test: (W) => W.player.wins >= 10 },
    { id: 'win100', cat: '勝利', name: '100勝', test: (W) => W.player.wins >= 100 },
    { id: 'win500', cat: '勝利', name: '500勝', test: (W) => W.player.wins >= 500 },
    { id: 'win1000', cat: '勝利', name: '1000勝', test: (W) => W.player.wins >= 1000 },
    { id: 'graded1', cat: '重賞', name: '重賞初制覇', test: (W) => W.player.gWins.length >= 1 },
    { id: 'g1', cat: '重賞', name: 'GⅠ初制覇', test: (W) => W.player.g1Wins.length >= 1 },
    { id: 'g1x10', cat: '重賞', name: 'GⅠ 10勝', test: (W) => W.player.g1Wins.length >= 10 },
    { id: 'derby', cat: '重賞', name: 'ダービージョッキー', test: (W) => W.player.g1Wins.some(t => /日本ダービー/.test(t)) },
    { id: 'arima', cat: '重賞', name: '有馬記念を制覇', test: (W) => W.player.g1Wins.some(t => /有馬記念/.test(t)) },
    { id: 'world', cat: '海外', name: '海外GⅠ制覇', test: (W) => W.player.g1Wins.some(t => /凱旋門|ドバイ|香港|サウジ|キングジョージ|ブリーダーズ|メルボルン/.test(t)) },
    { id: 'arc', cat: '海外', name: '凱旋門賞制覇', test: (W) => W.player.g1Wins.some(t => /凱旋門/.test(t)) },
    { id: 'upset', cat: '騎乗', name: '10番人気以下で勝利', test: (W, c) => c && c.pos === 1 && c.pop >= 10 },
    { id: 'grandS', cat: '騎乗', name: '騎乗評価S', test: (W, c) => c && c.grade === 'S' },
    { id: 'leading', cat: '年間', name: 'リーディングジョッキー', test: (W) => W.player.leadingYears > 0 },
    { id: 'pop1', cat: '人気', name: '人気投票1位', test: (W) => W.player.voteWins > 0 },
    { id: 'fans10k', cat: '人気', name: 'ファン1万人', test: (W) => W.player.fans >= 10000 },
    { id: 'fans100k', cat: '人気', name: 'ファン10万人', test: (W) => W.player.fans >= 100000 },
    { id: 'lv10', cat: '成長', name: 'レベル10', test: (W) => W.player.lv >= 10 },
    { id: 'lv30', cat: '成長', name: 'レベル30', test: (W) => W.player.lv >= 30 },
    { id: 'rich', cat: '生活', name: '貯金3億円', test: (W) => W.player.money >= 30000 },
    { id: 'house', cat: '生活', name: 'マイホーム', test: (W) => W.player.home >= 2 },
    { id: 'gearTop', cat: '生活', name: 'こだわりの道具', test: (W) => Object.keys(GEAR).every(k => (W.player.gear[k] || 0) === GEAR[k].length - 1) },
    { id: 'gearUp10', cat: '生活', name: '道具を育てる', test: (W) => Object.values(W.player.gearUp || {}).some(n => n >= 10) },
    { id: 'gearMax', cat: '生活', name: '究極の一品', test: (W) => Object.values(W.player.gearUp || {}).some(n => n >= UP_MAX) },
    { id: 'married', cat: '生活', name: '結婚', test: (W) => W.life && W.life.stage === 'married' },
    ...TITLES_ACH,
  ];

  // ---- ファン層 ----
  const SEGS = [['core', '競馬ファン'], ['young', '若い世代'], ['women', '女性ファン'], ['local', '地元ファン']];
  function fansTotal(P) { return Math.round(Object.values(P.fanSeg).reduce((a, b) => a + b, 0)); }
  function addFans(W, seg, n) {
    const P = W.player;
    const mul = has(W, 'fanservice') ? 1.3 : 1;
    P.fanSeg[seg] = Math.max(0, P.fanSeg[seg] + n * mul);
    P.fans = fansTotal(P);
    P.sns = Math.round(P.fanSeg.young * 2.2 + P.fanSeg.women * 1.6 + P.fanSeg.core * 0.4);
  }

  function init(W) {
    const P = W.player;
    Object.assign(P, { lv: 1, xp: 0, sp: 1, skills: {}, gear: { saddle: 0, whip: 0, boots: 0, goggles: 0 }, gearUp: {}, staff: {}, home: 0,
      fanSeg: { core: 200, young: 40, women: 30, local: 80 }, sns: 0, ach: {}, trophies: [], voteWins: 0, leadingYears: 0, cheers: [] });
    P.fans = fansTotal(P);
    W.life = { stage: 'none', partner: null, love: 0, family: 60, friends: 50 };
    W.seasonGoal = null;
    W.pendingGoal = true;
  }
  function ensure(W) { if (W.player.lv == null) init(W); if (!W.player.gearUp) W.player.gearUp = {}; }

  // ---- レースに渡す補正 ----
  function raceMods(W, race) {
    ensure(W);
    return {
      start: (has(W, 'start') ? 0.1 : 0) + gv(W, 'boots', 'start', 0),
      calm: (has(W, 'calm') ? 0.6 : 1) * gv(W, 'goggles', 'calm', 1),
      whip: (has(W, 'whip') ? 1.5 : 1) * gv(W, 'whip', 'whip', 1), noSulk: has(W, 'whip'), drive: gv(W, 'gloves', 'drive', 0),
      inside: has(W, 'inside'), closer: has(W, 'closer'), front: has(W, 'front'),
      stayer: has(W, 'stayer') && race.dist >= 2400, sprint: has(W, 'sprint') && race.dist <= 1400,
      big: has(W, 'bigstage') && (race.graded === 1 || race.overseas) ? 2.5 : 0,
    };
  }
  function gearWeight(W) { ensure(W); return 2.0 + gv(W, 'saddle', 'gear', 0); }
  // 自宅の設備・安全装備の効果（world.js から使う）
  function gearFx(W) { ensure(W); return { tech: gv(W, 'sim', 'tech', 1), fall: gv(W, 'helmet', 'fall', 1), heal: gv(W, 'vest', 'heal', 1) }; }

  // ---- 結果のあと ----
  function onResult(W, race, me, f, ev) {
    ensure(W);
    const P = W.player, gMul = race.overseas ? 3 : race.graded === 1 ? 2.2 : race.graded ? 1.5 : 1;
    // 経験値
    const xp = (ev.mode === 'manual' ? 6 : 3) + (me.pos === 1 ? 6 * gMul : me.pos <= 3 ? 2 : 0) + (ev.grade === 'S' ? 4 : ev.grade === 'A' ? 2 : 0);
    gainXp(W, xp);
    // ファン層
    if (me.pos === 1) {
      addFans(W, 'core', 25 * gMul * gMul); addFans(W, 'young', 6 * gMul * gMul); addFans(W, 'local', race.venue && VENUES[race.venue].jp ? 8 : 0);
      if (race.graded === 1 || race.overseas) addFans(W, 'women', 40 * gMul);
      if (f.pop >= 10) addFans(W, 'core', 120);
    }
    // 応援メッセージ
    if (me.pos === 1 && Math.random() < 0.6) cheer(W, race, me);
    // 実績
    if (me.pos === 1 && (race.graded === 1 || race.overseas)) P.trophies.push({ year: W.year, name: race.name, horse: me.horse.name });
    checkAch(W, { pos: me.pos, pop: f.pop, grade: ev.grade, race: race.name, horse: me.horse.name });
  }
  function gainXp(W, xp) {
    const P = W.player; P.xp += xp;
    while (P.xp >= xpNeed(P.lv)) {
      P.xp -= xpNeed(P.lv); P.lv++; P.sp++;
      P.tech = clamp(P.tech + 0.4, 0, 99); P.judge = clamp(P.judge + 0.3, 0, 99);
      W.toasts = (W.toasts || []).concat([`レベル${P.lv}に上がった（スキルポイント+1）`]);
      checkAch(W);
    }
  }
  function learn(W, id) {
    const P = W.player, sk = SKILLS.find(s => s.id === id);
    if (!sk || P.skills[id] || P.sp < sk.cost) return false;
    P.sp -= sk.cost; P.skills[id] = W.year; return true;
  }
  function checkAch(W, ctx) {
    const P = W.player;
    ACH.forEach(a => {
      if (P.ach[a.id] || !a.test(W, ctx)) return;
      P.ach[a.id] = W.date;
      W.toasts = (W.toasts || []).concat([`${a.cat === '称号' || a.cat === '騎手の記録' ? '称号獲得' : '実績解除'}：${a.name}`]);
      if (a.cat === '称号' || a.cat === '騎手の記録') {
        // 大きな称号はニュースと歩みに残し、レース後に祝う画面を出す
        const horse = a.cat === '称号' && ctx && ctx.horse ? `（${ctx.horse}）` : '';
        if (window.World && World.news) World.news(W, `${P.name}騎手が${a.name}を達成${horse}`, 'me');
        (W.log = W.log || []).push({ abs: W.abs, text: `${W.date} ${a.name}を達成${horse}` });
        (W.titlePending = W.titlePending || []).push({ name: a.name, desc: a.desc, horse: ctx && ctx.horse, race: ctx && ctx.race });
        addFans(W, 'core', 400); addFans(W, 'young', 150); P.pop = Math.min(100, P.pop + 2);
      }
    });
  }
  const CHEERS = {
    core: ['あの仕掛けのタイミング、完璧でした', '人気薄でも諦めない騎乗、ずっと応援してます', '馬券当たりました！ありがとう'],
    young: ['推しジョッキーが勝った！', 'レース映像、何回も見返してます', 'SNSで切り抜き回ってきて知りました。かっこいい'],
    women: ['勝利騎手インタビュー、感動しました', '馬への声かけが優しくて好きです', 'パドックで手を振ってくれた！'],
    local: ['地元の星！これからも応援してます', '競馬場で応援してました！', '子どもが騎手になりたいって言い出しました'],
  };
  function cheer(W, race, me) {
    const P = W.player;
    const segs = Object.entries(P.fanSeg).sort((a, b) => b[1] * Math.random() - a[1] * Math.random());
    const seg = segs[0][0];
    P.cheers.unshift({ date: W.date, seg, text: pick(CHEERS[seg]), race: race.name, horse: me.horse.name });
    if (P.cheers.length > 20) P.cheers.length = 20;
  }

  // ---- 週の終わり：お金・スタッフ・住まい・私生活 ----
  function onWeekEnd(W) {
    ensure(W);
    const P = W.player;
    let cost = 0;
    STAFF.forEach(s => { if (P.staff[s.id]) { cost += s.weekly; } });
    cost += HOMES[P.home].weekly;
    P.money = Math.round((P.money - cost) * 10) / 10;
    if (P.staff.trainer) { P.phys = clamp(P.phys + 0.06, 0, 99); P.fatigue = Math.max(0, P.fatigue - 3); }
    if (P.staff.nutrition) { P.weight -= 0.03; P.cond = clamp(P.cond + 1, 0, 100); }
    if (P.staff.manager) { P.pop = clamp(P.pop + 0.08, 0, 100); addFans(W, 'young', 5); addFans(W, 'women', 4); }
    if (has(W, 'weight')) P.weight -= 0.02;
    P.weight -= gv(W, 'sauna', 'slim', 0);
    P.fatigue = Math.max(0, P.fatigue - gv(W, 'capsule', 'rest', 0));
    P.phys = clamp(P.phys + gv(W, 'gym', 'fit', 0) * (P.age >= 42 ? 0.5 : 1), 0, 99);
    P.cond = clamp(P.cond + HOMES[P.home].cond * 0.5, 0, 100);
    // 人気が上がるとファンも自然に増える
    addFans(W, 'core', P.pop * 0.6); addFans(W, 'local', P.pop * 0.2);
    lifeEvents(W);
    checkAch(W);
  }

  // ---- 私生活 ----
  const PARTNER_NAMES = ['美月', '遥', '彩花', '翔太', '湊', '結衣', '蒼', '千尋', '真央', '悠'];
  function lifeEvents(W) {
    const L = W.life, P = W.player, ev = W.events || (W.events = []);
    if (ev.length >= 2) return;
    const r = Math.random();
    if (r < 0.04) ev.push({ title: '家族からの電話', text: '実家の家族から電話が来た。「ちゃんと食べてる？ 無理しないでね」', choices: [['ゆっくり話す', { cond: 5, life: { family: 6 } }], ['忙しいので手短に', { life: { family: -2 } }]] });
    else if (r < 0.07) ev.push({ title: '友人からの誘い', text: '学生時代の友人に飲みに誘われた。', choices: [['行く（体重に注意）', { cond: 6, weight: 0.4, life: { friends: 6 } }], ['断る', { life: { friends: -3 } }]] });
    else if (L.stage === 'none' && P.age >= 20 && r < 0.11) {
      const name = pick(PARTNER_NAMES);
      ev.push({ title: '出会い', text: `ファン感謝イベントで、${name}さんと話が弾んだ。連絡先を交換しようか。`, choices: [['連絡先を交換する', { lifeStage: 'met', partner: name, life: { love: 15 } }], ['今は騎乗に集中する', {}]] });
    } else if (L.stage === 'met' && r < 0.14) ev.push({ title: `${L.partner}さんとの食事`, text: `${L.partner}さんから食事の誘いが来た。`, choices: [['会いに行く', { cond: 6, life: { love: 15 } }], ['レース前なので断る', { life: { love: -5 } }]] });
    else if (L.stage === 'met' && L.love >= 50 && r < 0.2) ev.push({ title: '気持ちを伝える', text: `${L.partner}さんと過ごす時間が増えてきた。気持ちを伝えようか。`, choices: [['伝える', { lifeStage: 'dating', life: { love: 15 } }], ['まだ早い', {}]] });
    else if (L.stage === 'dating' && r < 0.12) ev.push({ title: `${L.partner}さんと休日`, text: '久しぶりの休日。どう過ごそう？', choices: [['一緒に出かける', { cond: 8, fatigue: -8, life: { love: 8 } }], ['ジムで体を絞る', { weight: -0.3, life: { love: -4 } }]] });
    else if (L.stage === 'dating' && L.love >= 85 && P.age >= 24 && r < 0.16) ev.push({ title: 'プロポーズ', text: `${L.partner}さんと付き合って長くなった。プロポーズしようか。`, choices: [['プロポーズする', { lifeStage: 'married', money: -150, pop: 2, life: { love: 10 } }], ['もう少し先にする', {}]] });
    else if (L.stage === 'married' && !L.child && r < 0.03) ev.push({ title: '家族が増える', text: `${L.partner}さんから、子どもが生まれるという知らせ。`, choices: [['喜ぶ', { cond: 10, life: { child: 1 } }]] });
    else if (P.money > 400 && r < 0.03) ev.push({ title: '寄付の依頼', text: '引退馬の支援団体から寄付の相談を受けた。', choices: [['100万円寄付する', { money: -100, pop: 2, fans: ['core', 300] }], ['今回は見送る', {}]] });
  }
  function applyLife(W, eff) {
    const L = W.life;
    if (eff.life) Object.entries(eff.life).forEach(([k, v]) => { L[k] = clamp((L[k] || 0) + v, 0, 100); });
    if (eff.lifeStage) {
      L.stage = eff.lifeStage;
      if (eff.partner) L.partner = eff.partner;
      if (eff.lifeStage === 'married') { World.news(W, `${W.player.name}騎手が結婚を発表`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${L.partner}さんと結婚` }); addFans(W, 'women', 300); }
    }
    if (eff.fans) addFans(W, eff.fans[0], eff.fans[1]);
  }

  // ---- シーズン目標 ----
  function goalOptions(W) {
    const P = W.player, ys = P.years[W.year - 1];
    const base = ys ? ys.wins : 12;
    const w1 = Math.max(10, Math.round(base * 1.1 / 5) * 5), w2 = Math.max(15, Math.round(base * 1.4 / 5) * 5);
    const g = Math.max(1, Math.round(P.gWins.length / Math.max(1, P.yearsActive || 1)) + 1);
    return [
      { kind: 'wins', target: w1, name: `年間${w1}勝`, reward: '評価+3・賞金100万円', diff: '堅実' },
      { kind: 'wins', target: w2, name: `年間${w2}勝`, reward: '評価+6・賞金300万円・スキルポイント+2', diff: '挑戦' },
      { kind: 'graded', target: g, name: `重賞${g}勝`, reward: '評価+5・人気+4・スキルポイント+1', diff: '大物狙い' },
    ];
  }
  function setGoal(W, i) { W.seasonGoal = { ...goalOptions(W)[i], year: W.year }; W.pendingGoal = false; }
  function goalProgress(W) {
    const G = W.seasonGoal; if (!G || G.year !== W.year) return null;
    const ys = W.player.years[W.year] || { wins: 0, g: [] };
    const cur = G.kind === 'wins' ? ys.wins : ys.g.length;
    return { ...G, cur, rate: Math.min(1, cur / G.target) };
  }
  function evalGoal(W) {
    const G = goalProgress(W); if (!G) return null;
    const P = W.player, ok = G.cur >= G.target;
    if (ok) {
      if (G.kind === 'wins' && G.target === goalOptions(W)[0].target) { P.rep = clamp(P.rep + 3, 0, 100); P.money += 100; }
      else if (G.kind === 'wins') { P.rep = clamp(P.rep + 6, 0, 100); P.money += 300; P.sp += 2; }
      else { P.rep = clamp(P.rep + 5, 0, 100); P.pop = clamp(P.pop + 4, 0, 100); P.sp += 1; }
    } else P.rep = clamp(P.rep - 1, 0, 100);
    return { ...G, ok };
  }

  // ---- 年末：人気投票 ----
  function yearEnd(W, ye) {
    ensure(W);
    const P = W.player;
    if (ye.rank === 1) P.leadingYears++;
    const table = W.jockeys.map(j => ({ name: j.name, score: j.pop * (0.8 + Math.random() * 0.4) }));
    table.push({ name: P.name + '（あなた）', score: P.pop * (0.9 + Math.random() * 0.3) + fansTotal(P) / 2000, me: true });
    table.sort((a, b) => b.score - a.score);
    const vote = table.findIndex(t => t.me) + 1;
    if (vote === 1) { P.voteWins++; addFans(W, 'women', 500); addFans(W, 'young', 400); }
    ye.vote = { rank: vote, top: table.slice(0, 5) };
    ye.goal = evalGoal(W);
    W.pendingGoal = true;
    checkAch(W);
  }

  // ---- ショップ ----
  function buyGear(W, slot, lv) {
    const P = W.player, it = GEAR[slot][lv];
    if (!it || P.gear[slot] >= lv || P.money < it.price) return false;
    P.money -= it.price; P.gear[slot] = lv; checkAch(W); return true;
  }
  function upgradeGear(W, slot) {
    ensure(W);
    const P = W.player, n = upLv(W, slot), c = upCost(slot, n);
    if ((P.gear[slot] || 0) !== topLv(slot) || n >= UP_MAX || P.money < c) return false;
    P.money = Math.round((P.money - c) * 10) / 10; P.gearUp[slot] = n + 1; checkAch(W); return true;
  }
  function toggleStaff(W, id) { const P = W.player; P.staff[id] = !P.staff[id]; return P.staff[id]; }
  function moveHome(W, i) { const P = W.player, h = HOMES[i]; if (i <= P.home || P.money < h.price) return false; P.money -= h.price; P.home = i; checkAch(W); return true; }

  window.Progress = { SKILLS, GEAR, GEAR_LABEL, GEAR_CAT, UP_MAX, topLv, upLv, upCost, gearEffect, gearFx, upgradeGear, STAFF, HOMES, ACH, SEGS, TITLES, init, ensure, raceMods, gearWeight, onResult, onWeekEnd, learn, title, xpNeed, addFans, applyLife, goalOptions, setGoal, goalProgress, yearEnd, buyGear, toggleStaff, moveHome, has };
})();
