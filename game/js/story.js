// ===== ストーリーモード =====
// 師匠・同期のライバル・相棒の馬との物語。章ごとに目標があり、節目に会話シーンが入る。
(function () {
  const CH = [
    null,
    { title: '第1章 見習い', goal: (W) => `初勝利を挙げる`, done: (W) => W.player.wins >= 1 },
    { title: '第2章 一人前へ', goal: (W) => `通算30勝で減量卒業（いま${W.player.wins}勝）`, done: (W) => W.player.wins >= 30 },
    { title: '第3章 相棒', goal: (W) => `${pn(W)}で暮れのホープフルSへ`, done: () => false },
    { title: '第4章 クラシック', goal: (W) => `${pn(W)}で日本ダービーを勝つ`, done: () => false },
    { title: '第5章 世界へ', goal: (W) => `海外のGⅠを勝つ（いま${W.player.g1Wins.filter(t => /凱旋門|ドバイ|香港|サウジ|キングジョージ|ブリーダーズ|メルボルン/.test(t)).length}勝）`, done: () => false },
    { title: '第6章 伝説へ', goal: (W) => `GⅠ通算10勝（いま${W.player.g1Wins.length}勝）・リーディング獲得`, done: () => false },
  ];
  // 相棒の出走予定（年ごと）
  const SCHED = {
    2: ['debut', 'ホープフルS'],
    3: ['弥生賞', '皐月賞', '日本ダービー', '凱旋門賞', 'ジャパンC', '有馬記念'],
    4: ['大阪杯', '宝塚記念', '天皇賞（秋）', 'ジャパンC', '有馬記念'],
    5: ['大阪杯', '天皇賞（春）', '宝塚記念', '天皇賞（秋）', 'ジャパンC', '有馬記念'],
  };
  const pn = (W) => W.story && W.story.partner != null && W.horses[W.story.partner] ? W.horses[W.story.partner].name : '相棒';
  const rn = (W) => W.jockeys[W.rivals[0].jid].name;
  const mn = (W) => W.story.mentor;
  const say = (W, lines, extra = {}) => W.story.pending.push({ lines, ...extra });

  function init(W) {
    const P = W.player;
    const t = W.trainers[P.stable];
    W.story = { ch: 1, flags: {}, mentor: t.name.replace('厩舎', '') + '先生', partner: null, rivalHorse: null, pending: [], ran: {} };
    say(W, [
      ['', `${W.date}。${P.region}トレーニング・センター。`],
      [mn(W), `今日からお前もジョッキーだ。最初は人気のない馬ばかり回ってくるだろう。`],
      [mn(W), `だが、どんな馬にも全力で乗れ。その一鞍が、次の依頼を連れてくる。`],
      [rn(W), `よう、同期。デビューしてどっちが先に勝つか、勝負な。`],
      ['', `${CH[1].title}　目標：${CH[1].goal(W)}`],
    ]);
  }

  function goal(W) {
    if (!W.story) return null;
    const c = CH[W.story.ch];
    return c ? { title: c.title, goal: c.goal(W) } : null;
  }
  function setCh(W, n) {
    W.story.ch = n;
    say(W, [['', `${CH[n].title}　目標：${CH[n].goal(W)}`]]);
    World.news(W, `ストーリー：${CH[n].title}`, 'me');
  }

  // ---- 毎週のはじめ ----
  function onWeekStart(W) {
    const S = W.story; if (!S) return;
    const P = W.player, m = W.month, y = W.year;
    if (S.ch === 2 && P.wins >= 30 && !S.flags.grad) { S.flags.grad = true; say(W, [[mn(W), '減量が取れたな。これからは腕一本の勝負だ。'], [mn(W), '減量があるから乗せてもらえた馬もいた。その恩は、勝って返せ。']]); }
    // 相棒との出会い（デビュー年の10月）
    if (!S.flags.meet && (y > 2027 || m >= 10)) {
      S.flags.meet = true;
      say(W, [
        [mn(W), '見せたいものがある。牧場まで付き合え。'],
        ['', '放牧地を、1頭の1歳馬が駆けてくる。まだ線は細いが、首の使い方がやわらかい。'],
        [mn(W), '来年うちに入る馬だ。血統は地味だが、この走りには何かある。'],
        [mn(W), 'この馬の主戦はお前に任せたい。名前を付けてやってくれ、と馬主さんが言っている。'],
      ], { input: 'partner' });
    }
    if (S.partner == null) return;
    const h = W.horses[S.partner];
    if (!h || h.retired) return;
    const age = y - h.born;
    // 章の進行
    if (S.ch < 3 && age === 2 && m >= 6) setCh(W, 3);
    if (S.ch < 4 && age >= 3) setCh(W, 4);
    if (S.ch === 4 && S.flags.derbyDone && m >= 6) setCh(W, 5);
    if (S.ch === 5 && y >= h.born + 4) setCh(W, 6);
    // ライバルの馬
    if (!S.rivalHorse && age === 2 && m >= 10) {
      const rh = World.genHorse(W, { born: h.born, base: 89, cls: 5, style: 1, surf: 'T' });
      rh.dist = 2200; rh.story = 'rival'; rh.trainer = (P.stable + 13) % 24; rh.owner = 0;
      S.rivalHorse = rh.id;
      say(W, [[rn(W), `お前の${h.name}、強いらしいな。`], [rn(W), `俺にもいい馬が回ってきた。${rh.name}だ。クラシックで会おうぜ。`]]);
    }
    // 引退（5歳の暮れ）
    if (age >= 6 && !h.retired) { h.retired = true; }
    if (age === 5 && m === 12 && !S.flags.partnerRetire) {
      S.flags.partnerRetire = true;
      say(W, [[mn(W), `${h.name}は今年いっぱいで引退だ。種牡馬になる。`], [mn(W), 'お前を一人前にしたのは、案外この馬かもしれんな。'], ['', `${h.name}、通算${h.starts}戦${h.wins}勝。`]]);
    }
    if (y >= 2034 && !S.flags.mentorRetire) {
      S.flags.mentorRetire = true;
      say(W, [[mn(W), 'わしも今年で定年だ。'], [mn(W), '最後にひとつだけ。いい騎手かどうかは、勝った数より、馬に信頼された数で決まる。'], [mn(W), '……元気でやれよ。']]);
    }
    placePartner(W, h, age);
    if (S.rivalHorse) placeRival(W, age);
  }

  // 相棒をその週のレースに出走させ、騎乗依頼を出す
  function placePartner(W, h, age) {
    const S = W.story, P = W.player;
    // 調教師と相談して決めた路線があればそれに従う（登録したレース）。なければ決まった予定
    let plan = SCHED[age] || [];
    if (h.plan && h.plan.y === W.year && h.plan.races.length) plan = h.plan.races.concat(plan.filter(n => n === 'debut' || n === '凱旋門賞'));
    if (W.isOverseas) return;
    let race = null;
    if (plan.includes('debut') && h.starts === 0 && W.month >= 6 && W.wk % 1 === 0) {
      race = W.card.find(r => r.cls === 0 && r.age === 'A2' && r.surf === 'T') || W.card.find(r => r.cls === 0 && r.age === 'A2');
      if (race && !S.flags.debutTalk) { S.flags.debutTalk = true; say(W, [[mn(W), `${h.name}のデビュー戦だ。焦るな。馬に競馬を教えるつもりで乗ってこい。`]]); }
    } else if (h.wins === 0 && h.starts > 0 && W.abs - h.last >= 4) {
      race = W.card.find(r => r.cls === 1 && r.age === (age === 2 ? 'A2' : 'A3'));
    } else if (h.wins > 0) {
      // 予定のGⅠ・重賞の週なら、その競馬場に行く
      const graded = World.gradedForWeek(W.year, World.sundayOfWeek(W));
      const g = graded.find(g => plan.includes(g.name) && !S.ran[W.year + g.name] && World.eligible(W, { ...h, last: -99 }, { age: g.age, sex: g.sex }));
      if (g) {
        if (W.venue !== g.v) {
          W.venue = g.v;
          W.card = World.buildCard(W, g.v, graded.filter(x => x.v === g.v));
          W.requests = World.buildRequests(W);
        }
        race = W.card.find(r => r.name === g.name);
        if (race && g.name === '日本ダービー' && !S.flags.derbyTalk) {
          S.flags.derbyTalk = true;
          say(W, [[mn(W), 'ダービーは運のいい馬が勝つと言われる。'], [mn(W), 'だが、運は準備をした者のところにしか来ない。お前と' + h.name + 'がやってきたことを信じろ。']].concat(S.rivalHorse && race.field.some(f => f.hid === S.rivalHorse) ? [[rn(W), '今日だけは負けない。']] : []));
        }
      }
      // 凱旋門賞：ダービーの後で陣営から打診
      if (age === 3 && S.flags.derbyDone && !S.flags.arcAsk && W.month === 8) {
        S.flags.arcAsk = true;
        say(W, [[W.owners[h.owner].name, `${h.name}を凱旋門賞に挑戦させたい。乗ってくれるか。`]], { choice: { key: 'arc', opts: ['パリへ行く', '国内に専念する'] } });
      }
      if (S.flags.arc && !S.ran[W.year + '凱旋門賞']) {
        const o = OVERSEAS.find(x => x.name === '凱旋門賞');
        const sun = World.sundayOfWeek(W);
        if (sun.getMonth() + 1 === o.month && Math.floor((sun.getDate() - 1) / 7) + 1 === o.nth) {
          S.ran[W.year + '凱旋門賞'] = true;
          W.pendingOverseas = { race: o, hid: h.id, abs: W.abs, date: W.date };
          World.prepareWeek(W);
          say(W, [['', 'フランス、パリロンシャン競馬場。世界の頂点を決めるレースの日。'], [mn(W), '気負うな。いつもの' + h.name + 'の競馬をさせてやれ。']]);
          return;
        }
      }
    }
    if (!race) return;
    if (!race.field.some(f => f.hid === h.id)) race.field[race.field.length - 1] = { hid: h.id };
    if (race.graded) S.ran[W.year + race.name] = true;
    World.estimateOdds(W, race);
    W.requests = W.requests.filter(q => q.raceNo !== race.no);
    const f = race.field.find(x => x.hid === h.id);
    const kin = World.kinryo(W, race, h, true);
    W.requests.push({ raceNo: race.no, hid: h.id, trainer: h.trainer, owner: h.owner, pop: f.pop, odds: f.odds, kin, okWeight: World.canMakeWeight(P, kin), accepted: World.canMakeWeight(P, kin), bondHorse: true, story: true });
    W.requests.sort((a, b) => a.raceNo - b.raceNo);
  }
  function placeRival(W, age) {
    const f0 = (hid) => hid !== W.story.partner && !(W.requests || []).some(q => q.hid === hid);
    const S = W.story, rh = W.horses[S.rivalHorse];
    if (!rh || rh.retired || W.isOverseas) return;
    const p = W.horses[S.partner];
    const race = W.card.find(r => r.graded && r.field.some(f => f.hid === S.partner));
    if (!race || race.field.some(f => f.hid === rh.id)) return;
    if (!World.eligible(W, { ...rh, last: -99 }, { age: race.age, sex: race.sex })) return;
    // 騎乗依頼の来ている馬とは入れ替えない
    const slot = race.field.map((f, i) => i).reverse().find(i => i > 0 && f0(race.field[i].hid));
    if (slot == null) return;
    race.field[slot] = { hid: rh.id };
    World.estimateOdds(W, race);
  }

  // ---- レース結果のあと ----
  function onResult(W, race, me, f) {
    const S = W.story; if (!S) return;
    const P = W.player, h = me.horse;
    if (S.ch === 1 && P.wins >= 1) {
      say(W, [[mn(W), 'おめでとう。だが浮かれるな。'], [mn(W), '勝った馬の名前と、その馬をつくった人たちの顔を忘れるなよ。'], [rn(W), 'ちぇっ、先を越されたか。次は負けないからな。']]);
      setCh(W, 2);
    }
    if (h.story === 'partner') {
      if (me.pos === 1 && h.wins === 1) { say(W, [[mn(W), `${h.name}、やったな。この馬は大きいところを狙える。`], [mn(W), '暮れのホープフルSに向かうぞ。']]); }
      if (race.name === 'ホープフルS') {
        say(W, me.pos === 1 ? [[mn(W), `GⅠ馬だ。来年はクラシックの主役だぞ、${h.name}。`]] : [[mn(W), `${me.pos}着。まだ子どもだ。来年、もうひと回り大きくなる。`]]);
      }
      // ライバルの騎手がこのレースに乗っていたか（乗っていなければ、レースの話はしない）
      const rodeRival = W.rivals && W.rivals[0] && race.field.some(f => f.jid === W.rivals[0].jid);
      if (race.name === '日本ダービー') {
        S.flags.derbyDone = true; S.flags.derbyWin = me.pos === 1;
        say(W, me.pos === 1 ? [['', `${h.name}、日本ダービー制覇。`], [mn(W), '……よくやった。今日からお前はダービージョッキーだ。'], ].concat(rodeRival ? [[rn(W), 'おめでとう。でも、まだ終わりじゃないからな。']] : [])
          : [[mn(W), `${me.pos}着か。`], [mn(W), '悔しいなら、もっと強くなれ。' + h.name + 'の競馬はまだ終わっていない。']]);
      }
      if (race.name === '凱旋門賞') say(W, me.pos === 1 ? [['', `${h.name}、凱旋門賞制覇。日本の競馬の歴史が変わった日。`], [mn(W), '……言葉がない。']] : [[mn(W), `${me.pos}着。世界の壁は厚い。だが、お前たちはそこに立った。`]]);
    }
    if (race.graded === 1 && me.pos === 1 && P.g1Wins.length === 1) say(W, [['', 'GⅠ初制覇。'], [mn(W), 'ここからだぞ。勝った後に何をするかで、騎手の値打ちは決まる。']]);
    if (P.g1Wins.length === 10 && me.pos === 1 && race.graded === 1 && !S.flags.g1ten) { S.flags.g1ten = true; say(W, [['', 'GⅠ通算10勝。'], [mn(W), 'もう誰もお前を見習いとは呼ばないな。']]); }
    if (me.pos === 1 && (race.graded || race.overseas) && window.Life) Life.onGradedWin(W, race, me, f);
  }

  // シーンの選択肢・入力の結果
  function answer(W, scene, value) {
    const S = W.story;
    if (scene.life && window.Life) return Life.answer(W, scene, value);
    if (scene.route || scene.ride) return World.talkAnswer(W, scene, value);
    if (scene.dr && window.Drama) return Drama.answer(W, scene, value);
    if (scene.input === 'partner') {
      const name = (value || '').trim() || 'ツギノカゼ';
      const P = W.player;
      const h = World.genHorse(W, { born: W.year - 1, base: 90, cls: 0, style: 2, surf: 'T', sex: '牡' });
      h.name = name.slice(0, 9); h.dist = 2400; h.grow = '普'; h.tmp = 55; h.trainer = P.stable; h.owner = 5; h.story = 'partner';
      h.spd = 91; h.sta = 90; h.kick = 92;
      S.partner = h.id; P.bond[h.id] = 40;
      say(W, [[mn(W), `${h.name}か。いい名前だ。`], [mn(W), 'デビューは来年の夏。それまでに、お前も腕を磨いておけ。']]);
      World.news(W, `相棒の1歳馬を「${h.name}」と名付けた`, 'me');
      W.log.push({ abs: W.abs, text: `${W.date} 相棒「${h.name}」と出会う` });
    }
    if (scene.choice && scene.choice.key === 'arc') {
      S.flags.arc = value === 0;
      if (S.flags.arc) World.news(W, `${pn(W)}が凱旋門賞へ挑戦を表明`, 'me');
    }
  }

  function epilogue(W) {
    const P = W.player, S = W.story || { flags: {} };
    const lines = [['', `${P.name}、${P.age}歳で現役を引退。`], ['', `通算${P.wins}勝、GⅠ${P.g1Wins.length}勝。`]];
    if (S.partner != null && W.horses[S.partner]) lines.push(['', `相棒${W.horses[S.partner].name}との日々は、今も語り草になっている。`]);
    if (S.flags.derbyWin) lines.push(['', 'ダービージョッキーの称号とともに。']);
    lines.push([S.mentor || '師匠', '……よく頑張ったな。']);
    return lines;
  }

  window.Story = { init, onWeekStart, onResult, goal, answer, epilogue };
})();
