// ===== 人物のいる物語：ライバル騎手たちと、騎手人生の節目 =====
// 会話シーンはストーリーと同じ仕組み（W.story.pending）で出す。選択の結果は Drama.answer で受け取る。
// 人物は4人とも架空（同期・先輩・後輩・短期免許の外国人騎手）。実在の騎手には台詞を持たせない。
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // ---- 人物 ----
  const CAST = {
    douki: { kind: '同期', persona: '負けず嫌いの熱血漢。口は悪いが、裏表がない。', rel0: 45,
      win: ['よっしゃあ！ 見たか、今日は俺の勝ちだ。', 'どうだ。これで今年の直接対決は俺がリードだな。'],
      lose: ['くそっ……あそこで外に出されたのが痛かった。次は負けねえ。', 'ちっ。お前、いつの間にあんな追い方覚えたんだよ。'],
      take: ['悪いな、あの馬は俺がもらった。恨むなよ。', '陣営が俺を選んだんだ。勝負の世界だろ。'],
      lost: ['おい、あの馬は俺が乗るはずだったんだぞ。……結果出さなかったら承知しねえからな。'],
      lead: ['数字見たか？ お前とは{d}勝差だ。年末まで勝負だな。'] },
    senpai: { kind: '先輩', persona: '面倒見のいい職人肌。多くを語らず、背中で教える。', rel0: 55,
      win: ['今日は俺の番だったな。……お前の馬、4コーナーで少し外に張ってたぞ。直しておけ。'],
      lose: ['いい仕掛けだった。あの間は、教えて身につくもんじゃない。', '負けたよ。もう俺が教えることは少ないな。'],
      take: ['すまんな。馬主さんに頼まれてな。次はお前に回るよう言っておく。'],
      lost: ['あの馬、お前に替わったのか。癖のある馬だ。3コーナーで息を入れてやれ。'],
      lead: ['リーディング、俺と{d}勝差か。追われるのは悪くない気分だ。'] },
    kouhai: { kind: '後輩', persona: '天才肌で生意気。だが誰よりも早く調教に出てくる。', rel0: 35,
      win: ['先輩、今日はごちそうさまでした。あ、勝ったの僕でしたね。', '馬が強かっただけっスよ。……まあ、乗ってたのは僕ですけど。'],
      lose: ['今日はたまたまっスよ。馬の差です。……次は負けません。', '……あの進路、どうやって見つけたんスか。教えてくださいよ。'],
      take: ['あの馬、僕が乗ることになりました。先輩には悪いですけど、結果で返します。'],
      lost: ['えっ、乗り替わりっスか。……いいですよ別に。すぐ取り返しますから。'],
      lead: ['先輩、いま{d}勝差ですよ。背中、見えてきました。'] },
    gaijin: { kind: '外国人騎手', persona: '世界を渡り歩く陽気な名手。日本語は片言だが、馬とはどの国でも話せる。', rel0: 40,
      win: ['ナイスレース！ でも今日はボクの馬がベストだったネ。', 'ユーの馬も良かった。ゴール前、少しだけボクが早かった。'],
      lose: ['ワオ、ナイスライド！ ユーの馬、最後までファイトしたネ。', 'マイッタ。日本のジョッキー、とても強い。'],
      take: ['ソーリー。オーナーがボクを指名した。ビジネスね。'],
      lost: ['オーケー、あの馬はユーに任せる。グッドラック！'],
      lead: ['ボクとユー、{d}勝差。ジャパンのリーディング、エキサイティングね。'] },
  };
  const ORDER = ['douki', 'senpai', 'kouhai', 'gaijin'];
  // 選択肢の言い回し：同じ意味でも毎回同じセリフにならないよう、いくつかの中から選ぶ（順番は 0=称える 1=闘志 2=黙る）
  const LOSE_OPTS = [
    ['「強かった。おめでとう」', '「完敗だ。いい競馬だった」', '「おめでとう。あの仕掛けは見事だった」', '「今日はお前の日だったな」', '「さすがだな」'],
    ['「次は負けない」', '「次で返す」', '「覚えておけよ」', '「次は俺の番だ」', '「この借りは大きいぞ」'],
    ['何も言わずに引き上げる', '黙って会釈だけする', '目をそらして検量室を出る', '手を上げて応えるだけにする'],
  ];
  const CONTEST_OPTS = [
    ['「いい馬だ。大事に乗ってくれ」', '「あの馬、頼んだぞ」', '「あいつのいいところを引き出してやってくれ」', '「仕方ない。勝ってこいよ」'],
    ['「次は譲らない」', '「次の依頼は俺がもらう」', '「結果で取り返す」', '「今回だけだからな」'],
  ];
  const varied = (sets) => sets.map(a => pick(a));

  function push(W, lines, extra = {}) { if (W.story) W.story.pending.push({ lines, ...extra }); }
  const ment = (W) => (W.story && W.story.mentor) || '師匠';
  const D = (W) => W.drama || (W.drama = { rel: {}, next: 0, flags: {} });
  const who = (W, cid) => { const r = (W.rivals || []).find(x => x.cid === cid); return r ? W.jockeys[r.jid] : null; };
  const cidOf = (W, jid) => { const r = (W.rivals || []).find(x => x.jid === jid && x.cid); return r ? r.cid : null; };
  const rel = (W, cid, d = 0) => { const R = D(W).rel; if (R[cid] == null) R[cid] = CAST[cid].rel0; R[cid] = clamp(R[cid] + d, 0, 100); return R[cid]; };
  // いまレースに乗っているか（後輩はデビュー後、外国人騎手は短期免許の月だけ）
  function avail(W, j) { return !(j.from && W.year < j.from) && !(j.months && !j.months.includes(W.month)); }

  // 古いセーブにも人物をそろえる
  function ensure(W) {
    if (!W.rivals || !W.jockeys) return;
    const d = D(W), P = W.player;
    if (W.rivals[0] && !W.rivals[0].cid) W.rivals[0].cid = 'douki';
    if (W.rivals[1] && !W.rivals[1].cid) { W.rivals[1].cid = 'senpai'; W.rivals[1].kind = '先輩'; }
    const names = new Set(W.jockeys.map(j => j.name).concat([P.name]));
    const add = (cid, j) => { j.id = W.jockeys.length; j.wins = 0; j.years = {}; j.fictional = true; W.jockeys.push(j); W.rivals.push({ jid: j.id, kind: CAST[cid].kind, cid }); P.hh[j.id] = { w: 0, l: 0 }; };
    if (!W.rivals.some(r => r.cid === 'kouhai')) {
      let nm; for (let i = 0; i < 50; i++) { nm = pick(SURNAMES) + ' ' + pick(GIVEN); if (!names.has(nm)) break; }
      names.add(nm);
      const start = (W.startYear || W.year) + 3;
      add('kouhai', { name: nm, skill: 66, age: 18 - Math.max(0, start - W.year), pop: 10, region: P.region, from: Math.max(start, W.year + (W.abs > 60 ? 1 : 0)) });
    }
    if (!W.rivals.some(r => r.cid === 'gaijin')) {
      const nm = (window.FOREIGN_JOCKEYS || ['R.ムーアズ']).find(n => !names.has(n)) || 'J.モレイラン';
      add('gaijin', { name: nm, skill: 90, age: 34, pop: 55, region: P.region === '美浦' ? '栗東' : '美浦', months: [10, 11, 12, 1, 4, 5] });
    }
    ORDER.forEach(c => rel(W, c));
  }

  // その年の勝利数の順位
  function leading(W) {
    const P = W.player, my = (P.years[W.year] || { wins: 0 }).wins;
    const rows = W.jockeys.filter(j => !(j.from && W.year < j.from)).map(j => ({ j, w: j.years[W.year] || 0 })).sort((a, b) => b.w - a.w);
    return { my, rank: rows.filter(r => r.w > my).length + 1, rows };
  }

  // ---- 毎週 ----
  function onWeek(W) {
    if (!W.story) return;
    ensure(W);
    const d = D(W), P = W.player, f = d.flags;
    career(W);
    if (W.story.pending.length || W.abs < d.next) return;
    const gap = (a = 3, b = 6) => { d.next = W.abs + ri(a, b); };
    const k = who(W, 'kouhai'), g = who(W, 'gaijin'), s = who(W, 'senpai'), dk = who(W, 'douki');
    // 後輩のデビュー
    if (k && !f.kDebut && W.year >= k.from && W.month >= 3) {
      f.kDebut = true;
      push(W, [[ment(W), '今年うちの地区に入った新人だ。競馬学校を首席で出たそうだ。面倒を見てやれ。'], [k.name, `${k.name}です。先輩のレース、全部ビデオで見てます。`], [k.name, '……直線で外に出すとき、いつも一瞬だけ迷いますよね。僕ならあそこで行きます。'], ['', '生意気だが、目は確かだ。']], { dr: 'kDebut', choice: { key: 'dr', opts: ['「口より結果で見せてみろ」', '「よく見てるな。今度一緒に調教に乗るか」'] } });
      return gap();
    }
    // 外国人騎手の来日
    if (g && !f.gCome && avail(W, g) && W.year >= (W.startYear || W.year) + 1) {
      f.gCome = true;
      push(W, [['', '検量室がざわついている。短期免許で、世界的な名手が来日したらしい。'], [g.name, `ハロー。${g.name}デス。ジャパンの競馬、ずっと乗りたかった。`], [g.name, 'ユーが、この地区の若いホープ？ レースで会うのが楽しみネ。']], { dr: 'gCome', choice: { key: 'dr', opts: ['英語で話しかけてみる', '黙って会釈する'] } });
      return gap();
    }
    // 同期：差がついたとき
    if (dk && W.month === 7 && !f['mid' + W.year]) {
      f['mid' + W.year] = true;
      const L = leading(W), dw = dk.years[W.year] || 0, df = L.my - dw;
      push(W, df >= 0 ? [['', '夏競馬の開幕。検量室で、同期と並んで鞍を下ろす。'], [dk.name, `上半期、お前${L.my}勝か。俺は${dw}勝。……${df === 0 ? '並んでるじゃねえか' : df + '勝も離されてる'}。`], [dk.name, '夏で追いつく。見てろよ。']]
        : [['', '夏競馬の開幕。検量室で、同期と並んで鞍を下ろす。'], [dk.name, `上半期は俺が${dw}勝、お前は${L.my}勝。${-df}勝差だ。`], [dk.name, '……でもな、お前がこのまま終わるとは思ってねえよ。']]);
      rel(W, 'douki', 2); return gap();
    }
    // 先輩：長い付き合いになってからの助言
    if (s && !f.sAdvice && (P.rides || 0) >= 150 && rel(W, 'senpai') >= 55) {
      f.sAdvice = true;
      push(W, [[s.name, 'ちょっと付き合え。'], ['', '夜の調整ルーム。先輩は、自分の落馬の映像を何度も巻き戻して見せた。'], [s.name, 'ここだ。前の馬の騎手の肩が、一瞬だけ動いてる。斜行の前には必ず合図がある。'], [s.name, '馬を見るな。前の騎手の肩と手綱を見ろ。それで俺は20年、大きな怪我をしていない。']], { dr: 'sAdvice' });
      return gap();
    }
    // リーディング争い（月のはじめ）
    if (W.month >= 4 && d.leadM !== W.year * 100 + W.month) {
      d.leadM = W.year * 100 + W.month;
      const L = leading(W);
      const near = ORDER.map(c => ({ c, j: who(W, c) })).filter(x => x.j && avail(W, x.j) && !(x.j.from && W.year < x.j.from)).map(x => ({ ...x, d: (x.j.years[W.year] || 0) - L.my })).filter(x => Math.abs(x.d) <= 4 && (L.my >= 5));
      World.news(W, `リーディング：1位 ${L.rows[0].j.name} ${L.rows[0].w}勝。${P.name}騎手は${L.my}勝で${L.rank}位`, 'race');
      if (near.length && Math.random() < 0.6) {
        const x = pick(near), c = CAST[x.c];
        push(W, [['', `${W.month}月。今年の勝利数は${L.my}勝、全国${L.rank}位。`], [x.j.name, pick(c.lead).replace('{d}', Math.abs(x.d))]]);
        return gap();
      }
    }
  }

  // ---- レースのあと：控室での会話 ----
  function afterRace(W, race, results, me) {
    if (!W.story || !me) return;
    ensure(W);
    const d = D(W);
    const inRace = (W.rivals || []).filter(r => r.cid).map(r => { const f = race.field.find(x => x.jid === r.jid); const rr = f && results.find(x => x.horse.id === f.hid); return rr ? { cid: r.cid, j: W.jockeys[r.jid], pos: rr.pos, horse: rr.horse } : null; }).filter(Boolean);
    if (!inRace.length) return;
    const big = race.graded || race.overseas;
    // 1・2着を分け合ったとき、または重賞で上位を争ったときは必ず。それ以外はときどき
    const x = inRace.sort((a, b) => a.pos - b.pos)[0];
    const duel = (me.pos === 1 && x.pos <= 3) || (x.pos === 1 && me.pos <= 3);
    // 出すぎないよう間をあける：重賞で上位を争ったときは2週、ふだんは6週以上
    const wait = W.abs - (d.talkAt ?? -99);
    if (!(duel && big && wait >= 2) && !(wait >= 6 && (duel ? Math.random() < 0.6 : Math.random() < 0.1 && (me.pos <= 5 || x.pos <= 5)))) return;
    d.talkAt = W.abs;
    const c = CAST[x.cid], iWon = me.pos < x.pos;
    const head = ['', `${race.name}のあと、検量室で${x.j.name}騎手と目が合った。（あなた${me.pos}着・${x.j.name}騎手${x.pos}着）`];
    if (iWon) { rel(W, x.cid, 1); push(W, [head, [x.j.name, pick(c.lose)]]); }
    else push(W, [head, [x.j.name, pick(c.win)]], { dr: 'lockerLose', cid: x.cid, choice: { key: 'dr', opts: varied(LOSE_OPTS) } });
  }

  // ---- 騎乗依頼の取り合い ----
  function onContest(W, jid, won, h) {
    if (!W.story) return;
    const cid = cidOf(W, jid); if (!cid) return;
    const j = W.jockeys[jid], c = CAST[cid];
    if (won) { rel(W, cid, -2); push(W, [['', `${h.name}の鞍上は、あなたに決まった。`], [j.name, pick(c.lost)]]); }
    else { rel(W, cid, -1); push(W, [['', `${h.name}の鞍上は、${j.name}騎手に決まった。`], [j.name, pick(c.take)]], { dr: 'contestLose', cid, choice: { key: 'dr', opts: varied(CONTEST_OPTS) } }); }
  }
  // 取り合いの相手を選ぶ：物語の人物が出やすい
  function contestRival(W, fallback) {
    ensure(W);
    const cs = (W.rivals || []).filter(r => r.cid).map(r => W.jockeys[r.jid]).filter(j => j && avail(W, j) && j.skill >= 60);
    return cs.length && Math.random() < 0.55 ? pick(cs) : fallback;
  }

  // ===== 騎手人生の節目 =====
  function career(W) {
    const d = D(W), f = d.flags, P = W.player, S = W.story;
    if (S.pending.length >= 4) return; // ほかの会話が多い週は見送る
    const y0 = W.startYear || (W.startYear = W.year - (P.yearsActive || 0));
    // 海外武者修行から帰国
    if (W.away && W.away.left <= 0) {
      const a = W.away; W.away = null;
      const up = (k, v) => { P[k] = clamp(P[k] + v * (1 - P[k] / 115), 0, 99); };
      Object.entries(a.gain).forEach(([k, v]) => up(k, v));
      P.pop = clamp(P.pop + 2, 0, 100); P.cond = clamp(P.cond + 10, 0, 100); P.fatigue = Math.max(0, P.fatigue - 10);
      d.abroad = (d.abroad || 0) + 1;
      push(W, [['', `${a.weeks}週間の${a.name}修行を終えて、帰国した。`], ['', a.back], [ment(W), 'いい顔になって帰ってきたな。向こうで覚えたことを、日本の馬に教えてやれ。'], ['', `【修行の成果】${a.eff}・人気+2`]]);
      World.news(W, `${P.name}騎手が${a.name}での武者修行から帰国`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${a.name}での武者修行から帰国` });
      return;
    }
    if (W.away) return;
    // けがからの復帰
    if (f.rehab && !W.injury) {
      const r = f.rehab; f.rehab = null;
      if (r.rush && Math.random() < 0.35) {
        W.injury = 2; push(W, [['', '復帰に向けた最後の調教で、古傷に痛みが走った。'], ['医師', '無理をしましたね。もう2週間は乗れません。'], ['', '焦りは禁物だった。']]);
        World.news(W, `${P.name}騎手、復帰が2週間延びる`, 'bad'); f.rehab = { rush: false, back: true }; return;
      }
      if (!r.rush) { P.phys = clamp(P.phys + 0.8, 0, 99); P.cond = clamp(P.cond + 10, 0, 100); } else P.rep = clamp(P.rep + 1, 0, 100);
      P.pop = clamp(P.pop + 1, 0, 100);
      push(W, [['', '復帰の日。パドックに出ると、スタンドから拍手が起きた。'], ['ファン', 'おかえり！ 待ってたぞ！'], [ment(W), '怖いか。……怖くていい。怖さを知っている騎手は、馬を無理に動かさない。']]);
      return;
    }
    // フリーになるか（3年目以降、減量が取れてから。断ったら3年後にもう一度）
    if (!P.free && P.wins >= 30 && W.year >= y0 + 2 && W.month >= 2 && W.month <= 4 && (!f.freeAsk || W.year >= f.freeAsk + 3)) {
      f.freeAsk = W.year;
      push(W, [[ment(W), '話がある。お前もそろそろ、所属を離れてフリーになることを考える時期だ。'], [ment(W), 'フリーになれば、どの厩舎の馬にも乗りやすくなる。そのかわり、黙っていても馬が回ってくることはなくなる。'], [ment(W), 'うちに残るなら、うちの馬は優先してお前に回す。どちらを選んでも、わしは応援する。']],
        { dr: 'free', choice: { key: 'dr', opts: ['フリーになる（依頼が増える。所属厩舎の後ろ盾はなくなる）', '所属のまま残る（所属厩舎の信頼+10）'] } });
      return;
    }
    // エージェント選び
    if (P.agent == null && P.rep >= 22 && (!f.agentAsk || (f.agentRe && W.year >= f.agentRe)) && W.agents) {
      f.agentAsk = true; f.agentRe = null;
      const ok = W.agents.filter(a => P.rep >= a.needRep);
      const desc = { 0: '「若手同士、一緒に上がっていきましょう！」足で稼ぐ新米。', 1: '「無理な数は取りません。勝てる馬を選びます」堅実な中堅。', 2: '「私と組めば、GⅠの馬を用意します」業界一の敏腕。' };
      push(W, [['', '騎乗依頼が増えてきた。依頼の窓口になるエージェント（騎乗依頼仲介者）を付ける時期かもしれない。'], ...ok.map(a => [a.name, `${desc[a.id]}（手数料${a.fee}%）`]), ['', '誰に頼もうか。']],
        { dr: 'agent', ids: ok.map(a => a.id), choice: { key: 'dr', opts: ok.map(a => `${a.name}（手数料${a.fee}%）`).concat(['自分で営業を続ける']) } });
      return;
    }
    // 敏腕エージェントからの誘い
    if (P.agent != null && W.agents[P.agent].net < 3 && P.rep >= 58 && !f.agentUp) {
      f.agentUp = true; const a = W.agents[2], cur = W.agents[P.agent];
      push(W, [[a.name, `${P.name}さん。今の成績なら、もっと上の馬に乗れる。私に任せませんか。`], ['', `いまの${cur.name}には、駆け出しのころから世話になっている。`]],
        { dr: 'agentUp', choice: { key: 'dr', opts: [`${a.name}に替える（手数料${a.fee}%・いい馬が増える）`, `${cur.name}と続ける（義理を通す）`] } });
      return;
    }
    // 海外武者修行（冬のあいだ。2回まで）
    if (W.month === 1 && W.year >= y0 + 1 && P.age <= 32 && (d.abroad || 0) < 2 && f.abroadAsk !== W.year && P.rep >= 12 && !W.injury && !(P.suspended > 0)) {
      f.abroadAsk = W.year;
      const g = who(W, 'gaijin'), by = g && rel(W, 'gaijin') >= 50 && f.gCome ? g.name : ment(W);
      push(W, [[by, by === ment(W) ? '冬のあいだ、海外で乗ってみる気はないか。向こうの厩舎に話は通せる。' : 'ユー、冬のあいだ海外で乗ってみないか？ ボクのフレンドの厩舎、紹介するヨ。'], ['', '日本を離れるあいだは、レースに乗れない。そのかわり、日本では学べないことがある。']],
        { dr: 'abroad', choice: { key: 'dr', opts: ['フランスへ8週間（判断+3・技術+1.5／費用150万円）', 'アメリカへ8週間（技術+3・体力+1／費用150万円）', 'オーストラリアへ6週間（体力+2.5・技術+1.5／費用120万円）', '今年は日本で乗る'] } });
      return;
    }
  }
  // 落馬で長く休むとき
  function onInjury(W) {
    if (!W.story || W.injury < 3) return;
    const d = D(W), w = W.injury;
    push(W, [['', '病院のベッドの上。天井を見ていると、落ちた瞬間のことばかり思い出す。'], ['医師', `全治${w}週間です。骨はきれいに付きます。ただ、焦って動くと長引きますよ。`], [ment(W), '休むのも仕事のうちだ。……と言っても、お前は聞かんだろうがな。']],
      { dr: 'rehab', choice: { key: 'dr', opts: ['じっくり治す（予定どおり復帰。体力+0.8・体調+10）', `早期復帰をめざす（${Math.max(1, Math.ceil(w * 0.6))}週で復帰。ぶり返すおそれあり）`] } });
    d.flags.rehab = { rush: false };
  }

  // ---- 選択の結果 ----
  function answer(W, sc, v) {
    const d = D(W), P = W.player, f = d.flags;
    const say = (lines) => W.story.pending.unshift({ lines });
    switch (sc.dr) {
      case 'kDebut': { const k = who(W, 'kouhai'); rel(W, 'kouhai', v === 0 ? -3 : 8); say(v === 0 ? [[k.name, 'はい。見ててください。']] : [[k.name, '……いいんスか。じゃあ明日、5時に坂路で。'], ['', '翌朝、後輩は4時半にはもう来ていた。']]); if (v === 1) P.tech = clamp(P.tech + 0.2, 0, 99); break; }
      case 'gCome': { const g = who(W, 'gaijin'); rel(W, 'gaijin', v === 0 ? 10 : 2); if (v === 0) say([[g.name, 'オー、グッド！ 今度、ヨーロッパの乗り方を教えるヨ。そのかわり、スシの店を教えて。']]); break; }
      case 'sAdvice': P.judge = clamp(P.judge + 1.2, 0, 99); rel(W, 'senpai', 5); W.toasts = (W.toasts || []).concat(['判断+1.2（先輩の助言）']); break;
      case 'lockerLose': { const j = who(W, sc.cid); if (v === 0) { rel(W, sc.cid, 4); P.cond = clamp(P.cond + 2, 0, 100); } else if (v === 1) { rel(W, sc.cid, 1); P.pop = clamp(P.pop + 0.3, 0, 100); say([[j.name, sc.cid === 'gaijin' ? 'イエス、それでこそライバル。' : sc.cid === 'senpai' ? 'その意気だ。' : sc.cid === 'kouhai' ? '望むところっス。' : 'おう、いつでも来い。']]); } else rel(W, sc.cid, -3); break; }
      case 'contestLose': rel(W, sc.cid, v === 0 ? 5 : -1); break;
      case 'free':
        if (v === 0) { P.free = true; World.news(W, `${P.name}騎手がフリーに転身`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} フリーに転身` }); say([[ment(W), 'そうか。……寂しくなるな。困ったら、いつでも戻ってこい。'], ['', '【フリー】毎週の騎乗依頼が増える。所属厩舎からの優先はなくなる。']]); }
        else { P.trust[P.stable] = clamp((P.trust[P.stable] || 0) + 10, 0, 100); say([[ment(W), 'わかった。うちの馬で、もっと大きいところを獲ろう。']]); }
        break;
      case 'agent':
        if (v < sc.ids.length) { P.agent = sc.ids[v]; const a = W.agents[P.agent]; World.news(W, `${P.name}騎手が${a.name}と契約`, 'me'); say([[a.name, 'よろしくお願いします。まずは来週の依頼から、整理させてください。']]); }
        else f.agentRe = W.year + 1; // 来年また声がかかる
        break;
      case 'agentUp':
        if (v === 0) { const old = W.agents[P.agent]; P.agent = 2; P.pop = clamp(P.pop - 1, 0, 100); World.news(W, `${P.name}騎手が${W.agents[2].name}と契約`, 'me'); say([[old.name, '……そうですか。あなたなら、もっと上へ行ける。応援しています。']]); }
        else { P.rep = clamp(P.rep + 1.5, 0, 100); say([[W.agents[P.agent].name, 'ありがとうございます。その信頼に、馬の質で応えます。'], ['', '義理を通した話は、厩舎の間にも伝わった。（評価+1.5）']]); }
        break;
      case 'abroad': {
        const T = [
          { name: 'フランス', weeks: 8, cost: 150, gain: { judge: 3, tech: 1.5 }, eff: '判断+3・技術+1.5', go: 'シャンティイの森の調教場。馬群はぎっしり詰まり、誰も動かない。仕掛けを待つ我慢を覚えた。', back: '最後の週、重賞で3着に入った。ゴール前で、現地の騎手が初めて握手を求めてきた。' },
          { name: 'アメリカ', weeks: 8, cost: 150, gain: { tech: 3, phys: 1 }, eff: '技術+3・体力+1', go: 'カリフォルニアのダート。ゲートが開いた瞬間に全馬が殺到する。スタートの一完歩で勝負が決まる。', back: '朝5時から1日8頭の調教に乗った。手の皮は3回むけた。' },
          { name: 'オーストラリア', weeks: 6, cost: 120, gain: { phys: 2.5, tech: 1.5 }, eff: '体力+2.5・技術+1.5', go: 'メルボルンの厩舎。朝は海辺を馬で駆け、午後は牧場で若馬を馴らす。とにかく乗る量が多い。', back: '現地の新聞に小さく載った。「日本から来た、よく働く若者」。' },
        ][v];
        if (!T) break;
        if (P.money < T.cost) { say([['', `費用が足りず、今年は見送った。（${T.cost}万円が必要）`]]); break; }
        P.money = Math.round((P.money - T.cost) * 10) / 10;
        W.away = { name: T.name, weeks: T.weeks, left: T.weeks, gain: T.gain, eff: T.eff, back: T.back };
        W.requests = []; W.booked = {};
        World.news(W, `${P.name}騎手が${T.name}へ武者修行（${T.weeks}週間）`, 'me'); W.log.push({ abs: W.abs, text: `${W.date} ${T.name}へ武者修行に出発` });
        say([['', `${T.name}へ発った。`], ['', T.go]]);
        break;
      }
      case 'rehab':
        if (v === 1) { W.injury = Math.max(1, Math.ceil(W.injury * 0.6)); f.rehab = { rush: true }; say([['', '翌週から、痛み止めを飲んでプールでのリハビリを始めた。']]); }
        else say([['', '窓の外で、朝の調教の蹄の音がする。今は、聞くだけにした。']]);
        break;
      case 'after': afterCareer(W, v); break;
    }
  }

  // ---- 引退後の道 ----
  function retireScene(W) {
    if (!W.story) return;
    const P = W.player;
    push(W, [['', `${P.age}歳。鞭を置く日が来た。`], [ment(W), 'ご苦労だった。……で、これからどうする。'], ['', '馬のそばにいる道は、ひとつではない。']],
      { dr: 'after', choice: { key: 'dr', opts: ['調教師をめざす', '競馬の解説者になる', '牧場で馬を育てる', '競馬学校の教官になる'] } });
  }
  function afterCareer(W, v) {
    const P = W.player, d = D(W);
    const avgT = Object.values(P.trust).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(P.trust).length);
    let lines, title;
    if (v === 0) {
      const pass = Math.random() < clamp(0.25 + P.judge / 180 + avgT / 150, 0.2, 0.92);
      title = '調教師';
      lines = pass ? [['', '調教師試験。筆記も面接も、馬の顔を思い浮かべながら答えた。'], ['', '合格。翌年、厩舎を開業した。'], ['', '初出走の朝。鞍上の若い騎手に、かつて自分が言われた言葉をそのまま伝えた。'], [P.name, 'どんな馬にも全力で乗れ。その一鞍が、次の依頼を連れてくる。']]
        : [['', '調教師試験。1度目は不合格だった。'], ['', '1年間、厩舎で助手として働きながら勉強を続けた。2度目の春、合格の通知が届いた。'], ['', '開業した厩舎の最初の1頭は、かつてのお手馬の仔だった。']];
    } else if (v === 1) { title = '競馬解説者'; lines = [['', '放送席に座る。マイクの前では、馬に乗るより緊張した。'], ['', `「今の騎乗、${P.name}さんならどう乗りましたか」と聞かれるたびに、少しだけ手綱を握る感覚が戻ってくる。`], ['', 'パドックで馬を見る目は、騎手のころより確かになった気がする。']]; }
    else if (v === 2) { title = '牧場主'; lines = [['', '北海道・日高。小さな牧場を買った。'], ['', '春、最初の仔馬が生まれた。立ち上がるまでの30分、ずっとそばにいた。'], ['', 'いつかこの牧場から、ダービー馬を。'], ['', 'その馬に乗る若い騎手の顔を、今から想像している。']]; }
    else { title = '競馬学校の教官'; lines = [['', '千葉の競馬学校。15歳の生徒たちが、木馬の上で必死に姿勢を保っている。'], ['', '「教官、どうしたら勝てる騎手になれますか」'], [P.name, '勝った数より、馬に信頼された数を数えなさい。'], ['', '昔、同じことを言われた。今ならその意味がわかる。']]; }
    d.after = title;
    W.log.push({ abs: W.abs, text: `引退後は${title}の道へ` });
    W.story.pending.unshift({ lines });
  }

  window.Drama = { CAST, ensure, onWeek, afterRace, onContest, contestRival, onInjury, answer, retireScene, avail, rel, leading, who };
})();
