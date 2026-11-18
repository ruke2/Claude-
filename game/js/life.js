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
    { job: '調教助手', how: (n) => [['', '朝4時の厩舎。暗がりで、馬に話しかけながら飼い葉をやっている人がいた。'], [n, 'あ、おはようございます。この子、あなたが乗るとよく走るって、うちの先生が言ってました。'], ['', `隣の厩舎の調教助手、${n}さん。手綱を持つ手が、誰よりも優しかった。`]] },
    { job: 'カフェの店員', how: (n) => [['', 'トレセンの近くの小さなカフェ。減量中なのでブラックコーヒーだけを頼むのが習慣だった。'], [n, 'いつもブラックですよね。……今日はレース勝ったって聞いたので、これ、サービスです。'], ['', `砂糖ひとつ分のクッキー。店員の${n}さんは、そう言って笑った。`]] },
    { job: '競馬学校の同期の妹', how: (n) => [['', '競馬学校の同期会。懐かしい顔ぶれの中に、見覚えのない人がいた。'], [n, '兄がいつもお世話になってます。……私、昔から競馬場であなたのこと見てました。'], ['', `同期の妹の${n}さん。話し始めたら、気づけば閉店の時間だった。`]] },
    { job: '病院の看護師', how: (n) => [['', '落馬の検査で訪れた病院。待合室で、レースの新聞を落としてしまった。'], [n, 'これ、落としましたよ。……あれ、騎手の方ですか？ 父が大ファンなんです。'], ['', `看護師の${n}さんは、検査の間ずっと、父親がどの馬券を当てたかの話をしてくれた。`]] },
    { job: '写真家', how: (n) => [['', 'パドックの柵の向こうで、ずっとこちらにカメラを向けている人がいた。'], [n, '急にすみません。競走馬と騎手の写真を撮っているんです。この前のゴールの瞬間、いい顔してました。'], ['', `写真家の${n}さん。見せてくれた写真の中の自分は、知らない顔で笑っていた。`]] },
    { job: '乗馬クラブのインストラクター', how: (n) => [['', '子ども向けの乗馬体験イベントに、ゲストとして呼ばれた。'], [n, '今日はありがとうございます。子どもたち、本物の騎手が来るって一週間前から大騒ぎで。'], ['', `インストラクターの${n}さんは、ポニーの手綱を引きながら、子どもより嬉しそうな顔をしていた。`]] },
    { job: '雨宿りの相手', how: (n) => [['', '開催日の帰り、急な夕立。コンビニの軒下で雨宿りをしていると、隣に人が駆け込んできた。'], [n, '……あ、今日の最終レース勝った人ですよね。単勝、持ってました。'], ['', `${n}さんは、払い戻しの券を見せて笑った。雨はなかなかやまなかった。`]] },
  ];
  const NAMES = ['美月', '遥', '彩花', '翔太', '湊', '結衣', '蒼', '千尋', '真央', '悠', '凛', '陽菜', '颯', '紗希', '透'];
  const DATES = [
    ['水族館', 'クラゲの水槽の前で、しばらく黙って並んでいた。'],
    ['海辺のドライブ', '窓を開けると潮の匂いがした。減量中なのを知っていて、相手はお弁当を小さめに作ってきてくれた。'],
    ['夜景の見えるレストラン', 'メニューを見て計量のことを考えていたら、「今日くらいいいでしょ」と笑われた。'],
    ['美術館', '馬の絵の前で立ち止まったら、「やっぱりそこで止まると思った」と言われた。'],
    ['温泉', '久しぶりに体の芯までほぐれた気がする。'],
    ['映画館', '競馬の映画だった。落馬のシーンで思わず手を握られた。'],
    ['牧場カフェ', 'ポニーに人参をあげた。「職業病だね」と笑われるくらい、蹄の形ばかり見ていた。'],
    ['動物園', 'キリンの前で「あれも走るの速いの？」と聞かれ、なぜか真剣に答えてしまった。'],
    ['遊園地', 'ジェットコースターで、相手だけが叫んでいた。「毎週時速60キロで走ってるからね」と言ったら、ずるいと言われた。'],
    ['植物園', '温室の中は湿気がこもっていて、汗で体重が少し減った気がした。'],
    ['夜の公園', 'ベンチで缶コーヒーを飲みながら、今週乗る馬の話を長々としてしまった。相手は最後まで聞いてくれた。'],
    ['ボウリング', '思ったより下手で、相手に1ゲーム目で負けた。2ゲーム目は意地で勝った。'],
    ['古い喫茶店', 'ナポリタンを半分ずつ分けた。減量中なので、こちらの皿は少なめにしてもらった。'],
    ['星を見に高原へ', '夜の牧草地で寝転がった。遠くで、どこかの牧場の馬がいなないた。'],
    ['料理教室', '減量食のレシピを教わるはずが、ふたりでケーキを焼いて帰ってきた。'],
    ['神社のお参り', '絵馬に「無事故」と書いた。相手の絵馬はのぞこうとしたら隠された。'],
    ['桜並木の散歩', '花びらが肩にのっていたのを、黙って払ってくれた。', [3, 4]],
    ['花火大会', '浴衣の相手に見とれて、最初の一発を見逃した。', [7, 8]],
    ['紅葉の山道', '真っ赤な葉の下を歩いた。「今度は馬で来たいね」と言われた。', [10, 11]],
    ['イルミネーション', '人混みの中、はぐれないように手をつないだ。', [12, 1]],
  ];
  const KID_NAMES = ['陽向', 'ひなた', '蓮', '結菜', '颯太', '凪', '大和', '芽衣'];

  // ---- 小さな出来事（関係の段階ごと）----
  // when：起きる条件 / lines：会話 / opts：[選択肢, 効果, その後の一言] / cd：もう一度起きるまでの週（0 なら一度だけ）
  const EP = [
    // ひとりのとき
    { id: 'friendWed', when: (W, S) => S.stage === 'none' && W.player.age >= 23, cd: 60, lines: () => [['', '競馬学校の同期から、結婚式の招待状が届いた。'], ['', '日取りは、重賞のある週の土曜日だ。']], opts: [['式に出る（調整ルームには夜に入る）', { fatigue: 6, friends: 10, cond: 4 }, '久しぶりに同期と大笑いした。帰り際、「次はお前の番だな」と言われた。'], ['お祝いの電報だけ送る', { friends: -4 }, '翌日、同期から写真が届いた。新郎は泣きはらした顔をしていた。']] },
    { id: 'goukon', when: (W, S) => S.stage === 'none' && W.player.age >= 21, cd: 30, lines: () => [['先輩騎手', 'おい、今度の休み、飲み会に人数が足りないんだ。来ないか。']], opts: [['行く', { weight: 0.3, cond: 3, love: 0, fans: ['young', 30] }, '騎手だと名乗ったら、なぜか体重の話で盛り上がった。'], ['減量中なので断る', { weight: -0.1 }, '先輩は「つれないなあ」と笑った。']] },
    { id: 'reunion', when: (W, S) => W.player.age >= 24, cd: 70, lines: () => [['', '高校の同窓会の案内が届いた。']], opts: [['顔を出す', { friends: 8, cond: 3, fatigue: 3 }, '担任の先生が、昔書いた作文をまだ持っていた。「将来の夢：ジョッキー」。'], ['欠席する', {}, '後日、集合写真が送られてきた。']] },
    // 知り合い・交際中
    { id: 'bento', when: (W, S) => S.stage === 'met' || S.stage === 'dating', cd: 26, lines: (W, S) => [['', `調整ルームに入る前、${S.partner}さんから小さな包みを渡された。`], [S.partner, '減量中でも食べられるもの、調べて作ってみた。']], opts: [['ありがたくいただく', { love: 8, cond: 4 }, 'ささみと野菜のスープ。ちゃんと計量の数字まで書いてあった。'], ['体重が心配なので半分だけ', { love: 3, weight: -0.1 }, '残りは翌朝に食べた。冷めてもおいしかった。']] },
    { id: 'watch', when: (W, S) => S.stage === 'met' || S.stage === 'dating', cd: 20, lines: (W, S) => [[S.partner, '今度の日曜、競馬場に見に行ってもいい？']], opts: [['来てほしい', { love: 6, pop: 0.2 }, 'パドックを回るとき、柵の向こうに小さく手を振る人がいた。'], ['緊張するから、テレビで見てて', { love: -2 }, '「わかった」と少しだけ寂しそうな声がした。']] },
    { id: 'photo', when: (W, S) => (S.stage === 'dating' || S.stage === 'engaged') && W.player.pop >= 25, cd: 0, lines: (W, S) => [['', '週刊誌に、ふたりで歩いている写真が載った。「人気騎手、深夜の密会」。'], [S.partner, '……ごめん、職場で大騒ぎになっちゃった。']], opts: [['交際を正直に認める', { love: 10, pop: 1.5, fans: ['women', -80] }, '取材に一言だけ答えた。「大切な人です」。翌週、応援の手紙が倍に増えた。'], ['ノーコメントで通す', { love: -6 }, 'しばらく記者に追いかけられた。']] },
    { id: 'quarrel', when: (W, S) => S.stage === 'dating' && S.love >= 40, cd: 40, lines: (W, S) => [[S.partner, '……また調整ルーム？ 先月の約束も、その前の約束も、仕事だったよね。'], ['', '電話の向こうで、声が震えていた。']], opts: [['会いに行って、きちんと謝る', { love: 6, fatigue: 5 }, '駅の改札で待っていた。何も言わずに、袖をつかまれた。'], ['仕事なんだから仕方ないと言う', { love: -12 }, '電話は切れた。その週、ずっと手綱が重かった。'], ['手紙を書いて送る', { love: 4 }, '3日後、短い返事が来た。「次の休み、空けといて」。']] },
    { id: 'sick', when: (W, S) => S.stage === 'dating' || S.stage === 'engaged', cd: 50, lines: (W, S) => [['', `${S.partner}さんが熱を出して寝込んでいると聞いた。今週は騎乗が詰まっている。`]], opts: [['夜にお見舞いに行く', { love: 10, fatigue: 6 }, 'おかゆを作った。味が薄いと笑われた。減量食に慣れすぎていた。'], ['差し入れだけ届けてもらう', { love: 3 }, '「ありがとう、勝ってね」とメッセージが来た。']] },
    { id: 'anniv', when: (W, S) => S.stage === 'dating' && W.abs - S.since >= 52, cd: 52, lines: (W, S) => [['', `${S.partner}さんと付き合って、また1年がたった。`]], opts: [['記念日に小さな旅行（20万円）', { love: 12, money: -20, cond: 6, fatigue: -4 }, '海の見える宿。夕食の品数に、ふたりで笑った。'], ['手作りのアルバムを渡す', { love: 9 }, '勝負服の写真の横に、ふたりの写真を貼った。'], ['忙しくて忘れていた', { love: -10 }, '気づいたのは日付が変わってからだった。']] },
    { id: 'dream', when: (W, S) => S.stage === 'dating' && S.love >= 60, cd: 0, lines: (W, S) => [[S.partner, 'ねえ、私にもやりたいことがあるの。'], [S.partner, `いつか、${S.job === '花屋' ? '自分のお店を持ちたい' : S.job === 'スポーツ記者' ? '海外の競馬を取材したい' : S.job === '獣医師' ? '引退馬の病院を開きたい' : '引退した馬が穏やかに暮らせる場所をつくりたい'}。……変かな。`]], opts: [['全力で応援すると伝える', { love: 10 }, '「あなたのレースと同じくらい、本気だよ」と言って笑った。'], ['自分の夢の話もする', { love: 7, cond: 3 }, 'ふたりで、夜が明けるまで話した。']] },
    // 結婚後
    { id: 'pet', when: (W, S) => S.stage === 'married' && !S.flags.pet, cd: 0, lines: (W, S) => [[S.partner, 'ねえ、犬を飼わない？ 保護犬の譲渡会があるんだって。']], opts: [['飼う', { love: 8, cond: 5, money: -10, set: 'pet' }, '茶色い雑種の子犬。名前は、初めて勝った馬からもらった。'], ['今は忙しいので見送る', { love: -2 }, '「そうだよね」と言いながら、パンフレットは冷蔵庫に貼られたままだった。']] },
    { id: 'cook', when: (W, S) => S.stage === 'married', cd: 30, lines: (W, S) => [[S.partner, '今日は私が仕事で遅くなるの。……たまには、ご飯作っておいてくれる？']], opts: [['腕をふるう', { love: 7, fatigue: 2 }, '鶏むね肉とブロッコリー。いつもの減量食を、少しだけ豪華にした。「騎手の料理だね」と言われた。'], ['出前にする', { love: 1 }, 'ふたりで、届いたピザを半分ずつ食べた。']] },
    { id: 'trip', when: (W, S) => S.stage === 'married' && S.kids.length > 0 && (W.month === 8 || W.month === 1), cd: 40, lines: (W, S) => [[S.kids[0].name, '夏休み、どこか行きたい！'], ['', '開催のない週が、1つだけある。']], opts: [['家族旅行に行く（40万円）', { love: 10, family: 12, cond: 10, fatigue: -10, money: -40 }, '北海道の牧場めぐり。子どもは、仔馬の前から一歩も動かなかった。'], ['近くの公園でピクニック', { love: 5, family: 6, cond: 4 }, 'お弁当を広げた。空が高かった。'], ['調教の手伝いに行く', { rep: 0.5, love: -6 }, '帰ると、子どもはもう寝ていた。']] },
    { id: 'parentsVisit', when: (W, S) => S.stage === 'married', cd: 60, lines: () => [['母', '今度、お父さんと一緒にそっちへ遊びに行ってもいい？ 孫の顔も見たいし。']], opts: [['ぜひ来てほしい', { family: 10, love: 3, fatigue: 2 }, '父は、居間に飾った勝負服の前で、長い間黙って立っていた。'], ['レースが続くので、また今度', { family: -4 }, '「体に気をつけてね」と電話は切れた。']] },
    { id: 'kidSick', when: (W, S) => S.stage === 'married' && S.kids.some(k => W.year - k.born <= 6), cd: 40, lines: (W, S) => [[S.partner, `${S.kids[0].name}が熱を出したの。……今日、早く帰れる？`]], opts: [['すぐ帰る', { love: 6, family: 6, fatigue: 4 }, '寝顔の横で、朝まで手を握っていた。'], ['調教が終わってから帰る', { love: -4 }, '帰ったときには熱は下がっていた。ほっとして、少し胸が痛んだ。']] },
    { id: 'lunch', when: (W, S) => S.stage === 'married' && S.kids.some(k => W.year - k.born >= 5), cd: 50, lines: (W, S) => [[S.kids[S.kids.length - 1].name, 'パパ、これ見て。学校で描いたの。'], ['', '画用紙いっぱいに、ピンクの勝負服の騎手と、大きな馬。']], opts: [['調整ルームに持っていく', { cond: 8, love: 4 }, '壁に貼った絵を、先輩騎手がのぞきこんで「お前より強そうだな」と笑った。'], ['リビングに飾る', { family: 6, love: 4 }, '翌日、額縁が増えていた。']] },
    // 家族・友人（いつでも）
    { id: 'sibling', when: (W) => W.player.age >= 22, cd: 0, lines: () => [['', '弟から電話が来た。'], ['弟', '兄ちゃん、俺さ……結婚することになった。式、来てくれる？']], opts: [['スピーチを引き受ける', { family: 12, fatigue: 4 }, 'スピーチの途中で言葉に詰まった。会場が温かく笑ってくれた。'], ['お祝いを送る（30万円）', { family: 6, money: -30 }, '「兄ちゃんらしいな」と返事が来た。']] },
    { id: 'grandma', when: (W) => W.player.age >= 20, cd: 0, lines: () => [['母', 'おばあちゃんがね、あなたのレースを見るために、テレビを大きいのに買い替えたのよ。'], ['母', '勝つたびに、近所に電話して回ってるんだって。']], opts: [['次の休みに顔を見に行く', { family: 10, cond: 6, fatigue: 3 }, 'おばあちゃんは、新聞の切り抜きをノートに貼っていた。1ページ目は、デビューの日の小さな記事だった。'], ['勝負服の写真を送る', { family: 5 }, '写真は、仏壇の横に飾られたらしい。']] },
    { id: 'fanLetter', when: (W) => W.player.pop >= 15, cd: 0, lines: () => [['', '厩舎に、一通の手紙が届いた。'], ['', '「入院中の父が、あなたのレースを見る日だけ、ベッドから起き上がります。どうか、これからも」']], opts: [['返事を書く', { pop: 0.6, cond: 4, fans: ['core', 50] }, '一か月後、また手紙が来た。「父が、ゴール前で声を出しました」。'], ['次のレースで勝って応える', { cond: 2 }, '手紙は、鞍袋の中にしまった。']] },
    { id: 'kidFan', when: (W) => W.player.pop >= 10, cd: 0, lines: () => [['', '開催日の帰り道。出口で、小学生くらいの子どもが色紙を持って待っていた。'], ['子ども', 'ぼく、大きくなったら騎手になりたいんです！']], opts: [['ゴーグルをあげる', { pop: 0.5, fans: ['young', 60] }, '子どもは、ゴーグルを額にのせて走って帰っていった。'], ['サインと握手', { pop: 0.3, fans: ['young', 30] }, '「手、ちっちゃい！」と驚かれた。騎手の手はみんなそうだ。']] },
    { id: 'rain', when: (W, S) => S.stage !== 'none', cd: 30, lines: (W, S) => [['', '雨の週。レースは中止になり、思いがけない休みができた。'], [S.partner, 'じゃあ、今日は一日、家で映画でも見ない？']], opts: [['のんびり過ごす', { love: 7, cond: 8, fatigue: -8 }, 'ソファで眠ってしまった。起きたら毛布がかけてあった。'], ['レースのビデオ研究をする', { rep: 0.3, love: -2 }, '隣で一緒に見てくれた。「この人、さっきから同じところで外に出てるね」。鋭かった。']] },
  ];
  function pickEpisode(W, S) {
    const f = S.flags.ep || (S.flags.ep = {});
    const ok = EP.filter(e => { const last = f[e.id]; if (last != null && (e.cd === 0 || W.abs - last < e.cd)) return false; try { return e.when(W, S); } catch (err) { return false; } });
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

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
    if (!W.story || W.story.pending.length > 1 || W.abs < S.next) return;
    const r = Math.random(), wk = W.abs;
    const gap = () => { S.next = wk + ri(2, 5); };
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
      push(W, m.how(n), { life: 'meet', choice: { key: 'meet', opts: [pick(['連絡先を交換する', '「よかったら、また話しませんか」', '名刺代わりに連絡先を渡す', '思い切って食事に誘う']), pick(['今は騎乗に集中する', '「応援ありがとう」とだけ伝える', '会釈して別れる'])] } });
      return gap();
    }
    // 小さな出来事（2割ほどの週で）
    if (Math.random() < 0.35) {
      const e = pickEpisode(W, S);
      if (e) { S.flags.ep[e.id] = wk; push(W, e.lines(W, S), { life: 'ep', ep: e.id, choice: { key: 'ep', opts: e.opts.map(o => o[0]) } }); return gap(); }
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
        const d = pick(DATES.filter(x => !x[2] || x[2].includes(W.month)));
        push(W, [[S.partner, `今度の月曜、${d[0]}に行かない？`]], { life: 'date', date: d, choice: { key: 'date', opts: [pick(['行く', '「行こう」', '「楽しみにしてる」', 'すぐに予定を空ける']), pick(['レース明けで疲れているので断る', '「ごめん、その日は調教がある」', '「次の休みにしよう」', '減量中なので今回は見送る'])] } });
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
      if (o.weight) P.weight = Math.round((P.weight + o.weight) * 100) / 100;
      if (o.friends) S.friends = clamp((S.friends || 50) + o.friends, 0, 100);
      if (o.set) S.flags[o.set] = W.abs;
    };
    const say = (lines) => push(W, lines);
    switch (sc.life) {
      case 'ep': { const e = EP.find(x => x.id === sc.ep); const o = e && e.opts[v]; if (!o) break; eff(o[1]); if (o[2]) say([['', o[2]]]); break; }
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
