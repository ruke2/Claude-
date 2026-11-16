// ===== 私生活の物語（家族・恋愛・結婚・子ども）と、重賞を勝ったときの特典 =====
// 会話シーンはストーリーと同じ仕組み（W.story.pending）で出す。選択肢の結果は Life.answer で受け取る。
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // 出会い方ごとの相手
  const MEET = [
    { job: '幼なじみ', how: (n) => [['', '久しぶりに帰省した地元の駅で、聞き覚えのある声に呼び止められた。'], [n, '……やっぱり！ テレビで見てるよ、ジョッキーになったんだね。'], ['', `幼なじみの${n}さんだ。昔と変わらない笑い方をしている。`]] },
    { job: 'スポーツ記者', how: (n) => [['', '勝利騎手インタビューのあと、若い記者が追いかけてきた。'], [n, `スポーツ紙の${n}です。今日の騎乗、仕掛けのタイミングをもう少し聞かせてもらえますか。`], ['', '質問が鋭い。気づけば30分も競馬の話をしていた。']] },
    { job: '獣医師', how: (n) => [['', '調教のあと、脚元を気にしていたお手馬を診てくれたのは、トレセンの若い獣医師だった。'], [n, '大丈夫、軽い打撲です。よく気づきましたね。馬のこと、よく見てるんですね。'], ['', `${n}先生はそう言って、少し笑った。`]] },
    { job: '牧場のスタッフ', how: (n) => [['', '北海道の生産牧場へ、お手馬の弟を見に行った。'], [n, 'この子、お兄ちゃんよりやんちゃなんですよ。……あ、写真撮ってもいいですか。ファンなんです。'], ['', `案内してくれたのは、牧場で働く${n}さんだった。`]] },
    { job: '花屋', how: (n) => [['', 'ファン感謝デーのサイン会。列の最後に、小さな花束を持った人がいた。'], [n, '近くで花屋をしています。初勝利のときから応援してます。'], ['', `${n}さん。花束には、勝負服と同じ色のリボンが結んであった。`]] },
  ];
  const NAMES = ['美月', '遥', '彩花', '翔太', '湊', '結衣', '蒼', '千尋', '真央', '悠', '凛', '陽菜', '颯', '紗希', '透'];
  const DATES = [
    ['水族館', 'クラゲの水槽の前で、しばらく黙って並んでいた。'],
    ['海辺のドライブ', '窓を開けると潮の匂いがした。減量中なのを知っていて、相手はお弁当を小さめに作ってきてくれた。'],
    ['夜景の見えるレストラン', 'メニューを見て計量のことを考えていたら、「今日くらいいいでしょ」と笑われた。'],
    ['美術館', '馬の絵の前で立ち止まったら、「やっぱりそこで止まると思った」と言われた。'],
    ['温泉', '久しぶりに体の芯までほぐれた気がする。'],
    ['映画館', '競馬の映画だった。落馬のシーンで思わず手を握られた。'],
  ];
  const KID_NAMES = ['陽向', 'ひなた', '蓮', '結菜', '颯太', '凪', '大和', '芽衣'];

  function L(W) {
    const l = W.life || (W.life = { stage: 'none', partner: null, love: 0, family: 60, friends: 50 });
    if (!l.flags) l.flags = {};
    if (!l.kids) l.kids = l.child ? [{ name: 'ひなた', born: W.year - 1 }] : [];
    if (l.next == null) l.next = 0;
    if (l.since == null) l.since = W.abs;
    return l;
  }
  const push = (W, lines, extra = {}) => { if (W.story) W.story.pending.push({ lines, ...extra }); };
  const ment = (W) => (W.story && W.story.mentor) || '師匠';
  const rival = (W) => W.rivals && W.rivals[0] && W.jockeys[W.rivals[0].jid] ? W.jockeys[W.rivals[0].jid].name : '同期';

  // ---- 毎週：私生活のシーンを1つまで ----
  function onWeek(W) {
    const S = L(W), P = W.player;
    if (!W.story || W.story.pending.length || W.abs < S.next) return;
    const r = Math.random(), wk = W.abs;
    const gap = () => { S.next = wk + ri(3, 6); };
    // 年末は帰省
    if (W.month === 12 && W.wk >= 50 && S.flags['home' + W.year] == null) {
      S.flags['home' + W.year] = 0;
      const kids = S.kids.length ? `${S.kids.map(k => k.name).join('と')}も連れて、` : '';
      push(W, [['母', `今年の暮れは帰ってこられそう？ ${S.stage === 'married' ? S.partner + 'さんと' : ''}${kids}みんなで年越しそばでも。`]], { life: 'home', choice: { key: 'home', opts: ['実家に帰る', '有馬記念の準備でトレセンに残る'] } });
      return gap();
    }
    // 父の入院（30歳を過ぎてから一度だけ）
    if (P.age >= 30 && !S.flags.dadSick && r < 0.01) {
      S.flags.dadSick = true;
      push(W, [['母', 'お父さんが入院したの。命に別状はないって。'], ['母', 'でもね、あなたの名前ばっかり呼んでるのよ。'], ['', '今週は騎乗の予定が詰まっている。']], { life: 'dad', choice: { key: 'dad', opts: ['見舞いに帰る', '電話だけして騎乗に集中する'] } });
      return gap();
    }
    // 恋愛
    if (S.stage === 'none' && P.age >= 20 && r < 0.07) {
      const m = pick(MEET), n = pick(NAMES);
      S.cand = { name: n, job: m.job };
      push(W, m.how(n), { life: 'meet', choice: { key: 'meet', opts: ['連絡先を交換する', '今は騎乗に集中する'] } });
      return gap();
    }
    if (S.stage === 'met' || S.stage === 'dating' || S.stage === 'engaged') {
      // すれ違い：長く会っていない
      if (S.stage !== 'met' && wk - (S.lastDate || wk) > 14 && !S.flags.miss && r < 0.5) {
        S.flags.miss = true;
        push(W, [[S.partner, '最近、全然会えてないね。'], [S.partner, '忙しいのはわかってる。わかってるけど……。']], { life: 'miss', choice: { key: 'miss', opts: ['調整ルームを出たらすぐ会いに行く', '今は仕事を優先させてほしいと伝える'] } });
        return gap();
      }
      // 誕生日
      if (S.stage !== 'met' && S.bday === W.month && S.flags['bd' + W.year] == null && r < 0.5) {
        S.flags['bd' + W.year] = 1;
        push(W, [['', `今週は${S.partner}さんの誕生日だ。`]], { life: 'bday', choice: { key: 'bday', opts: ['プレゼントを用意する（30万円）', '手紙を書く', '仕事で会えないと伝える'] } });
        return gap();
      }
      if (S.stage === 'met' && S.love >= 50 && r < 0.35) {
        push(W, [['', `${S.partner}さんと会うのは、もう何度目だろう。`], [S.partner, '……ねえ、私たちって、どういう関係なのかな。']], { life: 'confess', choice: { key: 'confess', opts: ['付き合ってほしいと伝える', 'まだ答えを出せない'] } });
        return gap();
      }
      if (S.stage === 'dating' && S.love >= 75 && !S.flags.parents && wk - S.since > 20 && r < 0.3) {
        S.flags.parents = true;
        push(W, [[S.partner, '今度、うちの両親に会ってくれない？ 父がね、競馬が大好きなの。'], ['', '週末、手土産を持って挨拶に行った。'], [`${S.partner}さんの父`, `${P.name}さん、この前の${P.g1Wins.length ? P.g1Wins[P.g1Wins.length - 1].replace(/^\d+ /, '') : '騎乗'}、テレビの前で叫びましたよ。`], [`${S.partner}さんの父`, '……娘をよろしくお願いします。']], { life: 'love', delta: 8 });
        return gap();
      }
      if (S.stage === 'dating' && S.love >= 85 && P.age >= 22 && S.flags.parents && !S.flags.propAsk && r < 0.25) {
        S.flags.propAsk = true;
        push(W, [['', `${S.partner}さんと付き合って、${Math.max(1, Math.round((wk - S.since) / 52))}年が過ぎた。指輪はもう、引き出しの奥にある。`], ['', 'どこで渡そう。']], { life: 'propose', choice: { key: 'propose', opts: ['最終レースの後、誰もいないゴール前で', 'ふたりの思い出のレストランで', '次にGⅠを勝ったら、インタビューで', 'まだ渡せない'] } });
        return gap();
      }
      if (S.stage === 'engaged' && wk >= S.wedAt) {
        push(W, [['', `${S.partner}さんとの結婚式の日。`], [ment(W), `${P.name}は見習いのころ、計量で泣きそうな顔をしていました。それが今では……（会場の笑い）`], [ment(W), `${S.partner}さん、こいつは馬のことしか考えていない男です。ですが、一度決めた相手は最後まで信じる。それは保証します。`], [rival(W), 'おめでとう。……先を越されたのは、これで二度目だな。'], ['', 'どんな式にしよう。']], { life: 'wedding', choice: { key: 'wedding', opts: ['お世話になった人を招いて盛大に（300万円）', '家族と親しい人だけで（80万円）'] } });
        return gap();
      }
      // デート
      if (r < (S.stage === 'met' ? 0.3 : 0.22)) {
        const d = pick(DATES);
        push(W, [[S.partner, `今度の月曜、${d[0]}に行かない？`]], { life: 'date', date: d, choice: { key: 'date', opts: ['行く', 'レース明けで疲れているので断る'] } });
        return gap();
      }
    }
    if (S.stage === 'married') {
      // 子ども
      if (!S.flags.baby && wk - S.since > 26 && wk - (S.lastBirth || 0) > 70 && S.kids.length < 3 && r < (S.kids.length ? 0.025 : 0.06)) {
        S.flags.baby = true; S.dueAt = wk + 30;
        push(W, [[S.partner, '……あのね。'], [S.partner, '赤ちゃんができたみたい。'], ['', '頭が真っ白になった。気づいたら、抱きしめていた。']], { life: 'love', delta: 10, cond: 10 });
        return gap();
      }
      if (S.flags.baby && wk >= S.dueAt) {
        S.flags.baby = false;
        push(W, [['', '早朝の調教中に電話が鳴った。'], ['母', '生まれたよ！ 元気な子だって！'], ['', `病院に駆けつけると、${S.partner}さんの腕の中で、小さな手が動いていた。`], ['', 'この子の名前を決めよう。']], { life: 'baby', input: true, inputLabel: '子どもの名前（9文字まで）', inputPh: pick(KID_NAMES), inputBtn: '名付ける' });
        return gap();
      }
      // 子どもの成長
      for (const k of S.kids) {
        const age = W.year - k.born;
        const key = (t) => 'kid' + k.name + t;
        if (age >= 1 && !S.flags[key(1)] && r < 0.3) { S.flags[key(1)] = 1; push(W, [[S.partner, `見て！ ${k.name}が歩いた！`], ['', '送られてきた動画を、調整ルームで何度も見返した。']], { life: 'love', delta: 4, cond: 6 }); return gap(); }
        if (age >= 4 && !S.flags[key(4)] && r < 0.3) { S.flags[key(4)] = 1; push(W, [[k.name, 'パパのおうまさん、どれ？'], ['', '週末、家族を競馬場に呼ぶことにした。']], { life: 'kidRace', kid: k.name, choice: { key: 'kidRace', opts: ['パドックで手を振る約束をする', '危ないので今回は家で見てもらう'] } }); return gap(); }
        if (age >= 6 && !S.flags[key(6)] && W.month >= 9 && W.month <= 10 && r < 0.5) { S.flags[key(6)] = 1; push(W, [[k.name, '今度の日曜、運動会なんだ。かけっこ、一番になるから見にきて！'], ['', 'その日曜日には、重賞の騎乗依頼が入っている。']], { life: 'sports', kid: k.name, choice: { key: 'sports', opts: ['騎乗を断って運動会へ行く', '騎乗する（ビデオで見る）'] } }); return gap(); }
        if (age >= 10 && !S.flags[key(10)] && r < 0.2) { S.flags[key(10)] = 1; push(W, [[k.name, 'ぼく、大きくなったらジョッキーになる。'], [k.name, 'それで、パパと同じレースに出て、パパに勝つ。'], ['', '何と答えようか、しばらく言葉が出なかった。']], { life: 'love', delta: 5, pop: 1 }); return gap(); }
      }
      if (r < 0.04) {
        push(W, [[S.partner, pick(['今日のレース、家族みんなで見てたよ。', 'お疲れさま。お風呂わいてるよ。', '体重、大丈夫？ 今夜は野菜スープにしたよ。'])]], { life: 'love', delta: 3, cond: 5 });
        return gap();
      }
    }
  }

  // ---- 選択の結果 ----
  function answer(W, sc, v) {
    const S = L(W), P = W.player;
    const eff = (o) => {
      if (o.love) S.love = clamp(S.love + o.love, 0, 100);
      if (o.family) S.family = clamp(S.family + o.family, 0, 100);
      if (o.cond) P.cond = clamp(P.cond + o.cond, 0, 100);
      if (o.fatigue) P.fatigue = Math.max(0, P.fatigue + o.fatigue);
      if (o.money) P.money = Math.round((P.money + o.money) * 10) / 10;
      if (o.pop) P.pop = clamp(P.pop + o.pop, 0, 100);
      if (o.rep) P.rep = clamp(P.rep + o.rep, 0, 100);
      if (o.sp) { P.sp += o.sp; W.toasts = (W.toasts || []).concat([`スキルポイント+${o.sp}`]); }
      if (o.fans && window.Progress) Progress.addFans(W, o.fans[0], o.fans[1]);
    };
    const say = (lines) => push(W, lines);
    switch (sc.life) {
      case 'love': eff({ love: sc.delta || 0, cond: sc.cond || 0, pop: sc.pop || 0 }); break;
      case 'home':
        if (v === 0) { eff({ family: 12, cond: 8, fatigue: -6 }); say([['父', '……よく帰ってきたな。'], ['', 'こたつで父と、今年のレースのビデオを見た。父はどのレースも、勝った場面で同じように手を叩いた。']]); }
        else { eff({ family: -4, rep: 0.5 }); say([['母', 'そう。体に気をつけてね。お父さん、テレビの前で応援してるって。']]); }
        break;
      case 'dad':
        if (v === 0) { eff({ family: 18, fatigue: 8, rep: -0.5 }); say([['父', '……来なくていいって言ったのに。'], ['父', 'お前の乗った馬、全部録画してあるんだ。退院したら、一緒に見よう。']]); }
        else { eff({ family: -8 }); say([['母', '大丈夫、ちゃんと伝えておくね。お父さん、「それでこそ騎手だ」って笑ってたよ。']]); }
        break;
      case 'meet':
        if (v === 0) { S.stage = 'met'; S.partner = S.cand.name; S.job = S.cand.job; S.love = 15; S.bday = ri(1, 12); S.lastDate = W.abs; World.news(W, `${P.name}騎手、プライベートは「ノーコメント」`, 'race'); }
        delete S.cand; break;
      case 'date':
        if (v === 0) { S.lastDate = W.abs; S.flags.miss = false; eff({ love: S.stage === 'met' ? 14 : 8, cond: 6, fatigue: -4 }); say([['', `${sc.date[0]}へ行った。${sc.date[1]}`]]); }
        else eff({ love: -5 });
        break;
      case 'miss':
        if (v === 0) { S.lastDate = W.abs; S.flags.miss = false; eff({ love: 10, fatigue: 6 }); say([[S.partner, '……来てくれたんだ。ありがとう。']]); }
        else { eff({ love: -14 }); S.flags.miss = false; S.lastDate = W.abs; if (S.love < 20 && S.stage !== 'engaged') { say([[S.partner, 'ごめん。少し距離を置きたい。'], ['', `${S.partner}さんとの連絡が途絶えた。`]]); S.stage = 'none'; S.partner = null; S.love = 0; S.flags.parents = false; S.flags.propAsk = false; } }
        break;
      case 'bday':
        if (v === 0) { eff({ love: 14, money: -30 }); say([[S.partner, 'え、これ前に欲しいって言ってたやつ……覚えててくれたの？']]); }
        else if (v === 1) { eff({ love: 10 }); say([[S.partner, '字、意外ときれいなんだね。……大事にする。']]); }
        else eff({ love: -6 });
        break;
      case 'confess':
        if (v === 0) { S.stage = 'dating'; S.since = W.abs; S.lastDate = W.abs; eff({ love: 15, cond: 8 }); say([[S.partner, '……はい。よろしくお願いします。']]); W.log.push({ abs: W.abs, text: `${W.date} ${S.partner}さんと交際を始める` }); }
        else eff({ love: -8 });
        break;
      case 'propose':
        if (v === 3) { S.flags.propAsk = false; break; }
        if (v === 2) { S.flags.g1Propose = true; say([['', '次にGⅠを勝ったら、インタビューで伝える。そう決めた。']]); break; }
        engage(W, v === 0 ? [['', '最終レースが終わり、スタンドの灯りが消えていく。誰もいないゴール板の前で、指輪の箱を開けた。'], [S.partner, '……ここ、あなたが初めて勝った場所だよね。'], [S.partner, 'はい。喜んで。']]
          : [['', 'ふたりが初めて食事をしたレストラン。デザートの皿の横に、指輪の箱をそっと置いた。'], [S.partner, '……ずるいよ、こんなの。'], [S.partner, 'はい。よろしくお願いします。']]);
        break;
      case 'wedding':
        eff(v === 0 ? { money: -300, pop: 3, fans: ['women', 400], family: 10 } : { money: -80, family: 14, cond: 6 });
        S.stage = 'married'; S.since = W.abs;
        World.news(W, `${P.name}騎手が${S.partner}さんと結婚`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${S.partner}さんと結婚` });
        if (window.Progress) Progress.addFans(W, 'women', 300);
        say([['', 'ふたりで写真を撮った。式場の窓から、遠くに馬場の白いラチが見えた。']]);
        push(W, [['', '新婚旅行はどうしよう。']], { life: 'honey', choice: { key: 'honey', opts: ['オフに海外へ（120万円）', '近場の温泉へ（20万円）', '落ち着いてから'] } });
        break;
      case 'honey':
        if (v === 0) eff({ money: -120, cond: 15, fatigue: -15, love: 8 });
        else if (v === 1) eff({ money: -20, cond: 10, fatigue: -10, love: 5 });
        break;
      case 'baby': {
        const name = String(v || sc.inputPh || 'ひなた').trim().slice(0, 9) || 'ひなた';
        S.kids.push({ name, born: W.year }); S.child = S.kids.length; S.lastBirth = W.abs;
        eff({ cond: 12, love: 10, family: 15, pop: 2, fans: ['women', 200] });
        World.news(W, `${P.name}騎手に第${S.kids.length}子が誕生`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} 第${S.kids.length}子「${name}」誕生` });
        say([['', `${name}。小さな手が、指を一本ぎゅっと握った。`], [ment(W), 'そうか、父親か。……これからは、帰る場所のある騎手だな。']]);
        break;
      }
      case 'kidRace':
        if (v === 0) { S.flags.kidWatch = sc.kid; eff({ love: 5, family: 6 }); say([['', `パドックで手を振ると、${sc.kid}が柵の向こうで跳びはねていた。`]]); }
        break;
      case 'sports':
        if (v === 0) { eff({ love: 10, family: 10, rep: -1, cond: 6 }); say([['', `${sc.kid}はかけっこで2着だった。悔しそうな顔が、自分にそっくりだった。`], [sc.kid, '次は勝つ！']]); }
        else { eff({ love: -6 }); say([['', `夜、ビデオを見た。${sc.kid}はゴールの後、カメラに向かってピースをしていた。`]]); }
        break;
    }
  }
  function engage(W, lines) {
    const S = L(W);
    S.stage = 'engaged'; S.wedAt = W.abs + ri(8, 16); S.flags.g1Propose = false;
    if (lines.length) push(W, lines);
    World.news(W, `${W.player.name}騎手が婚約を発表`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${S.partner}さんと婚約` });
  }

  // ---- 重賞を勝ったとき：特典と物語 ----
  function onGradedWin(W, race, me, f) {
    const S = L(W), P = W.player, h = me.horse;
    const g = race.overseas ? 0 : race.graded; // 0 = 海外
    const big = g === 1 || race.overseas;
    const gw = P.gWins || [];
    const firstGraded = gw.length === 1; // 今回の勝ちがすでに記録されている
    const firstThis = !gw.slice(0, -1).some(t => t.includes(' ' + race.name + '（'));
    // 特典
    const sp = (race.overseas ? 3 : g === 1 ? 2 : 1) + (firstGraded ? 1 : 0) + (firstThis && big ? 1 : 0);
    const gift = race.overseas ? ri(250, 400) : g === 1 ? ri(100, 250) : g === 2 ? ri(40, 80) : ri(20, 50);
    const tr = big ? 8 : 4;
    P.sp += sp; P.money = Math.round((P.money + gift) * 10) / 10;
    P.trust[h.trainer] = clamp((P.trust[h.trainer] || 0) + tr, 0, 100);
    P.otrust[h.owner] = clamp((P.otrust[h.owner] || 0) + tr, 0, 100);
    P.bond[h.id] = (P.bond[h.id] || 0) + (big ? 12 : 6);
    const owner = W.owners[h.owner] ? W.owners[h.owner].name : '馬主';
    const trainer = W.trainers[h.trainer] ? W.trainers[h.trainer].name.replace('厩舎', '') + '調教師' : '調教師';
    const gl = race.overseas ? '' : `（G${'ⅠⅡⅢ'[g - 1]}）`;
    const lines = [];
    if (race.overseas) lines.push(['', `${race.name}制覇。表彰台の上で、日の丸が揺れている。`]);
    else if (g === 1) lines.push(['', pick([`${race.name}${gl}、${h.name}。ウイナーズサークルに大きな拍手が降り注いだ。`, `検量室に戻ると、関係者が総立ちで迎えてくれた。${race.name}${gl}、${h.name}の勝利。`, `${h.name}の首筋を叩くと、スタンドから自分の名前を呼ぶ声が聞こえた。`])]);
    else lines.push(['', pick([`${race.name}${gl}を${h.name}で勝った。`, `${h.name}、${race.name}${gl}制覇。重賞の口取りは、何度やっても少し照れくさい。`])]);
    if (firstGraded) lines.push([ment(W), big ? 'いきなりGⅠで重賞初制覇とはな。……たいしたもんだ。' : '重賞ウィナーか。……見習いのころを思えば、上出来だ。'], [rival(W), 'くそ、重賞は俺が先だと思ってたのに。']);
    lines.push([owner, pick(big ? [`${P.name}さん、ありがとう。この馬を持っていてよかった。今夜は祝勝会です、ぜひ。`, '夢がかないました。ささやかですが、気持ちを受け取ってください。'] : ['いい騎乗でした。次も頼みますよ。', `${h.name}の次走も、お願いできますか。`])]);
    lines.push([trainer, pick(['指示どおり……いや、指示以上だった。', '馬がよく我慢してくれた。乗り手を信頼している証拠だ。', 'うちの厩舎の馬に、また乗ってくれ。'])]);
    // 家族
    if (S.stage === 'married') lines.push([S.partner, pick(['テレビの前で叫んじゃった。おめでとう！', 'おめでとう。今夜はごちそうにするね。'])]);
    if (S.kids.length && big) lines.push([pick(S.kids).name, S.flags.kidWatch ? '見てたよ！ パパがいちばん！' : 'パパ、テレビに出てた！']);
    else if (S.stage !== 'married' && big) lines.push(['母', 'お父さん、泣いてたよ。おめでとう。']);
    if (big && S.stage === 'dating' && S.flags.g1Propose) {
      lines.push(['', '勝利騎手インタビュー。マイクを向けられて、カメラの向こうに話しかけた。'], [P.name, `${S.partner}さん、見ていますか。……僕と、結婚してください。`], ['', 'スタンドがどよめき、やがて大きな拍手に変わった。'], ['', `その夜、${S.partner}さんから一言だけメッセージが届いた。「はい」`]);
      P.pop = clamp(P.pop + 6, 0, 100); if (window.Progress) Progress.addFans(W, 'women', 800);
      engage(W, []);
    }
    lines.push(['', `【特典】スキルポイント+${sp}${firstGraded ? '（初重賞ボーナス込み）' : firstThis && big ? '（このレース初制覇ボーナス込み）' : ''}　馬主からの祝儀 ${gift}万円　${trainer.replace('調教師', '')}厩舎・${owner}の信頼+${tr}　${h.name}との絆+${big ? 12 : 6}`]);
    const extra = big ? { life: 'party', choice: { key: 'party', opts: ['祝勝会に出る', '早めに切り上げて次に備える'] } } : {};
    push(W, lines, extra);
    World.news(W, `${P.name}騎手、${race.name}の勝利で特典（スキルポイント+${sp}）`, 'me');
  }
  // 祝勝会の選択は answer に追加
  const _answer = answer;
  function answer2(W, sc, v) {
    if (sc.life === 'party') {
      const P = W.player;
      if (v === 0) { P.pop = clamp(P.pop + 2, 0, 100); P.fatigue += 6; P.weight += 0.3; if (window.Progress) Progress.addFans(W, 'core', 200); push(W, [['', pick(['祝勝会では、馬主さんが何度も同じレースのビデオを流した。', '乾杯のあと、厩務員さんが涙ぐみながら握手を求めてきた。', '祝勝会の帰り道、夜風が気持ちよかった。体重計に乗るのは明日にしよう。'])]]); }
      else { P.cond = clamp(P.cond + 6, 0, 100); push(W, [['', 'ひとりでレースを見返した。勝ったレースにも、直すところはある。']]); }
      return;
    }
    _answer(W, sc, v);
  }

  window.Life = { onWeek, answer: answer2, onGradedWin, ensure: L };
})();
