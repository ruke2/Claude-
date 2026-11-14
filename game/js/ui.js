// ===== 画面遷移・UI =====
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let W = null, quick = false, selColor = SILKS[0], tab = 'week';
  const STYLE = ['逃げ', '先行', '差し', '追込'];
  const SURF = { T: '芝', D: 'ダ', B: '芝・ダ' };
  const ORDERS = ['ハナを切って自分のペースで', '好位で流れに乗って', '中団で脚をためて', '後方で脚をためて直線勝負'];

  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }
  function gradeTag(race) {
    if (race.graded) return `<span class="pill g${race.graded}">G${'ⅠⅡⅢ'[race.graded - 1]}</span>`;
    if (race.label === race.name) return '';
    return `<span class="pill">${esc(race.label)}</span>`;
  }
  function raceCond(race) { return `${SURF[race.surf]}${race.dist}m${race.ground === '重' ? ' 重' : ''}`; }
  const horseAge = (h) => W.year - h.born;
  const sexAge = (h) => `${h.sex}${horseAge(h)}`;
  function realTag(h) { return h.real ? ' <span class="pill" title="実在馬（2026年JRA GⅠ出走馬）">実在</span>' : h.foreign ? ' <span class="pill">外国馬</span>' : ''; }
  function stars(v) { const n = clamp(Math.round((v - 40) / 12), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function silkChip(o) { const s = o.silks; return `<span class="silk" style="background:linear-gradient(90deg,${s.base} 50%,${s.accent} 50%)"></span>`; }
  const P = () => W.player;
  const money = (v) => `${Math.round(v).toLocaleString()}万円`;

  // 2回押しで確定（埋め込み環境では confirm() が使えないため）
  function confirmTap(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; }, 3000);
  }
  function modal(html, bind) { $('modal-body').innerHTML = html; $('modal').classList.add('on'); if (bind) bind($('modal-body')); }
  function closeModal() { $('modal').classList.remove('on'); }

  // ---------- タイトル ----------
  function refreshTitle() { $('b-continue').disabled = !World.hasSave(); }
  refreshTitle();
  $('b-new').onclick = () => { renderSwatches(); show('s-new'); };
  $('b-continue').onclick = () => { const w = World.load(); if (w) { W = w; quick = false; showWeek(); } };
  $('b-quick').onclick = quickRace;
  $('b-tut').onclick = () => startTutorial();
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  function renderSwatches() {
    const box = $('swatches'); box.innerHTML = '';
    SILKS.slice(0, 10).forEach(c => {
      const d = document.createElement('div'); d.className = 'swatch' + (c === selColor ? ' on' : ''); d.style.background = c;
      d.onclick = () => { selColor = c; renderSwatches(); }; box.appendChild(d);
    });
  }
  $('b-start').onclick = () => {
    if (World.hasSave() && !$('b-start').dataset.armed) return confirmTap($('b-start'), 'もう一度押すとセーブを上書き', () => {});
    const name = $('in-name').value.trim() || '新人 騎手';
    const region = document.querySelector('input[name=region]:checked').value;
    W = World.newGame({ name, region, color: selColor });
    quick = false;
    W.log.push({ abs: 0, text: `${W.date} ${region}所属の見習騎手としてデビュー` });
    World.news(W, `${name}騎手が${region}所属でデビュー`, 'me');
    World.save(W);
    tab = 'week';
    let seen = false; try { seen = localStorage.getItem('jl-tut') === '1'; } catch (e) {}
    if (seen) showWeek();
    else setTimeout(() => modal(`<h2>操作に慣れておこう</h2><p>レースの操作と画面の見方を、練習レースで1つずつ説明するチュートリアルがある（3分ほど）。</p><div class="choices"><button class="btn primary" id="m-tut">チュートリアルをやる（キャリアは保存済み。終わったら「つづきから」）</button><button class="btn" id="m-no">あとで</button></div>`, () => { $('m-tut').onclick = () => { closeModal(); World.save(W); startTutorial(); }; $('m-no').onclick = () => { closeModal(); showWeek(); }; }), 50);
  };

  // ---------- 週の画面 ----------
  function topBar(extra = '') {
    const p = P(); const ys = p.years[W.year] || { wins: 0, rides: 0 };
    const allow = World.apprenticeAllowance(p);
    const minKin = (p.weight + World.GEAR).toFixed(1);
    const sg = window.Story && W.story ? Story.goal(W) : null;
    return `<div class="grow"><h2>${esc(W.date)}　${esc(VENUES[W.venue].name)}${W.isOverseas ? '（海外遠征）' : ''}${sg ? `<span class="pill gold" style="margin-left:8px;font-size:11.5px">${esc(sg.title)}：${esc(sg.goal)}</span>` : ''}</h2>
      <div class="chips" style="margin-top:3px">
        <span class="chip">${esc(p.name)} ${p.age}歳${allow ? ` ▲${allow}kg` : ''}</span>
        <span class="chip">今年 <b>${ys.wins}</b>勝/${ys.rides}</span>
        <span class="chip">評価 <b>${Math.round(p.rep)}</b></span>
        <span class="chip">人気 <b>${Math.round(p.pop)}</b>（ファン${p.fans.toLocaleString()}人）</span>
        <span class="chip ${p.weight + World.GEAR > 55 ? 'warn' : ''}">体重 ${p.weight.toFixed(1)}kg（斤量${minKin}〜）</span>
        <span class="chip ${p.cond < 50 ? 'warn' : ''}">体調 ${Math.round(p.cond)}</span>
        <span class="chip">${money(p.money)}</span>
      </div></div>${extra}`;
  }
  const TABS = [['week', '今週'], ['news', 'ニュース'], ['people', '人脈'], ['me', '騎手'], ['career', 'キャリア']];
  function showWeek() {
    if (P().retired) return showRetire();
    show('s-week');
    $('week-top').innerHTML = topBar(`<button class="btn small ghost" id="b-quit">セーブして終了</button>`);
    $('b-quit').onclick = () => { World.save(W); refreshTitle(); show('s-title'); };
    $('tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${n}${k === 'news' && W.news.some(x => x.abs === W.abs - 1 || x.abs === W.abs) ? '<span class="dot"></span>' : ''}</button>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; showWeek(); });
    const pane = $('tabpane');
    if (tab === 'week') renderWeekTab(pane);
    else if (tab === 'news') pane.innerHTML = `<div class="scroll card"><h3>ニュース</h3><ul class="news">${W.news.map(n => `<li class="${n.kind}"><span class="d">${esc(n.date || '')}</span>${esc(n.text)}</li>`).join('') || '<li class="muted">まだニュースはない</li>'}</ul></div>`;
    else if (tab === 'people') renderPeople(pane);
    else if (tab === 'me') renderMe(pane);
    else if (tab === 'career') renderCareer(pane);
    // ストーリー → 今週の出来事
    if (W.story && W.story.pending.length) playScenes(() => showWeek());
    else if (W.events && W.events.length) showEvent();
  }
  // ストーリーの会話シーン
  function playScenes(done) {
    const S = W && W.story;
    if (!S || !S.pending.length) { if (done) done(); return; }
    const sc = S.pending[0]; let i = 0;
    const render = () => {
      const [who, text] = sc.lines[i];
      const last = i >= sc.lines.length - 1;
      let extra = '';
      if (last && sc.input) extra = `<div style="margin-top:10px"><label class="small muted" for="sc-in">名前（カタカナ9文字まで）</label><br><input type="text" id="sc-in" maxlength="9" value="ツギノカゼ" style="margin-top:4px"></div>`;
      const btns = last && sc.choice ? sc.choice.opts.map((o, k) => `<button class="btn ${k ? '' : 'primary'}" data-k="${k}">${esc(o)}</button>`).join('') : `<button class="btn primary" id="sc-next">${last ? (sc.input ? '名付ける' : '閉じる') : '次へ'}</button>`;
      modal(`<div class="small muted">ストーリー</div>${who ? `<div class="pill gold" style="margin:4px 0">${esc(who)}</div>` : ''}<p style="margin:6px 0;font-size:15px;line-height:1.7">${esc(text)}</p>${extra}<div class="choices">${btns}</div>`, (el) => {
        const finish = (val) => { S.pending.shift(); Story.answer(W, sc, val); closeModal(); World.save(W); playScenes(done); };
        el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => finish(+b.dataset.k));
        const nx = $('sc-next');
        if (nx) nx.onclick = () => { if (!last) { i++; render(); } else finish(sc.input ? $('sc-in').value : null); };
      });
    };
    render();
  }
  function showEvent() {
    const e = W.events[0];
    modal(`<div class="small muted">今週の出来事</div><h2 style="margin:2px 0 6px">${esc(e.title)}</h2><p style="margin:0">${esc(e.text)}</p>
      <div class="choices">${e.choices.map((c, i) => `<button class="btn" data-c="${i}">${esc(c[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { World.applyEvent(W, e, +b.dataset.c); W.events.shift(); closeModal(); World.save(W); showWeek(); });
    });
  }

  function renderWeekTab(pane) {
    const p = P();
    if (W.injury > 0 || p.suspended > 0) {
      const why = W.injury > 0 ? `負傷療養中（あと${W.injury}週）` : `騎乗停止中（あと${p.suspended}週）`;
      pane.innerHTML = `<div class="card"><h2>${why}</h2><p class="muted">今週は騎乗できない。平日の予定はこなせる。</p>${scheduleHtml()}<button class="btn primary" id="b-skip" style="margin-top:8px">次の週へ</button></div>`;
      bindSchedule(pane);
      $('b-skip').onclick = () => { W.card.forEach(r => { if (!r.result) World.simulate(W, r, null); }); advanceWeek(); };
      return;
    }
    let L = '';
    if (W.isOverseas) {
      const race = W.card[0], h = W.horses[W.booked[1]];
      L += `<div class="card" style="border-color:var(--accent)"><div class="small muted">海外遠征</div>
        <h2>${esc(race.name)} ${gradeTag(race)}</h2><div>${esc(VENUES[race.venue].country)}・${esc(VENUES[race.venue].name)}　${raceCond(race)}</div>
        <div style="margin-top:6px">騎乗馬: <b>${esc(h.name)}</b>${realTag(h)}（${sexAge(h)}）</div></div>`;
    } else {
      L += `<div class="row" style="margin-bottom:5px"><h2>騎乗依頼</h2><span class="muted small">タップで受ける（1レース1頭）</span></div>`;
      if (!W.requests.length) L += `<p class="muted">今週の依頼はない。</p>`;
      W.requests.forEach((q, i) => {
        const race = W.card[q.raceNo - 1], h = W.horses[q.hid], t = W.trainers[h.trainer], o = W.owners[h.owner];
        const tags = [q.story ? '<span class="pill gold">相棒</span>' : q.bondHorse ? '<span class="pill gold">お手馬</span>' : '', p.contract === h.owner ? '<span class="pill gold">主戦</span>' : '', q.viaAgent ? '<span class="pill">エージェント経由</span>' : '', !q.okWeight ? '<span class="pill warn">斤量オーバー</span>' : ''].join(' ');
        L += `<div class="req ${q.accepted ? 'on' : ''} ${q.okWeight ? '' : 'ng'}" data-i="${i}"><div class="no">${q.raceNo}R</div>
          <div class="grow"><div><b>${esc(h.name)}</b>${realTag(h)} <span class="muted small">${sexAge(h)} ${STYLE[h.style]}</span> ${tags}</div>
          <div class="small muted">${gradeTag(race)} ${esc(race.name)} ${raceCond(race)}・斤量${q.kin}kg・${esc(t.name)}・${silkChip(o)} ${esc(o.name)}</div></div>
          <div style="text-align:right"><div>${q.pop}番人気</div><div class="small muted">想定${q.odds}倍</div></div></div>`;
      });
      (W.offers || []).forEach((o, i) => {
        const h = W.horses[o.hid];
        L += `<div class="card" style="margin-top:8px;border-color:var(--blue)"><div class="small muted">海外遠征の騎乗依頼（${esc(o.date)}）</div>
          <div><b>${esc(o.race.name)}</b>（${esc(VENUES[o.race.v].country)}・${SURF[o.race.surf]}${o.race.dist}m）</div>
          <div class="small">騎乗馬: ${esc(h.name)}${realTag(h)}（${sexAge(h)}）</div>
          <div class="row" style="margin-top:6px"><button class="btn small primary" data-oa="${i}">受ける</button><button class="btn small" data-od="${i}">断る</button></div></div>`;
      });
      if (W.pendingOverseas) L += `<div class="card" style="margin-top:8px"><span class="small muted">予定:</span> ${esc(W.pendingOverseas.date)} ${esc(W.pendingOverseas.race.name)} へ遠征</div>`;
    }
    const n = W.isOverseas ? 1 : W.requests.filter(q => q.accepted).length;
    pane.innerHTML = `<div class="cols"><div class="scroll">${L}</div><div class="scroll">
      <div class="card" style="margin-bottom:8px">${scheduleHtml()}</div>
      <button class="btn primary" style="width:100%;margin-bottom:8px" id="b-day">開催日へ（${n}鞍）</button>
      <div class="card small muted">ヒント：体重＋装備（${World.GEAR}kg）が斤量を超える依頼は受けられない。減量やトレーニングで体重を管理する。</div>
    </div></div>`;
    pane.querySelectorAll('.req').forEach(el => el.onclick = () => {
      const q = W.requests[+el.dataset.i];
      if (!q.okWeight) return;
      const on = !q.accepted;
      W.requests.forEach(o => { if (o.raceNo === q.raceNo) o.accepted = false; });
      q.accepted = on; showWeek();
    });
    pane.querySelectorAll('[data-oa]').forEach(b => b.onclick = () => { const o = W.offers[+b.dataset.oa]; W.pendingOverseas = o; W.offers = []; W.log.push({ abs: W.abs, text: `${W.date} ${o.race.name}への遠征が決定（${W.horses[o.hid].name}）` }); World.news(W, `${P().name}騎手が${W.horses[o.hid].name}で${o.race.name}へ遠征`, 'me'); showWeek(); });
    pane.querySelectorAll('[data-od]').forEach(b => b.onclick = () => { W.offers.splice(+b.dataset.od, 1); showWeek(); });
    bindSchedule(pane);
    $('b-day').onclick = () => {
      if (!W.isOverseas) { W.booked = {}; W.requests.filter(q => q.accepted).forEach(q => W.booked[q.raceNo] = q.hid); }
      W.dayIdx = W.dayIdx || 0; World.save(W); showDay();
    };
  }
  function scheduleHtml() {
    const p = P();
    const opts = Object.entries(World.ACTIVITIES).filter(([k, a]) => !a.needPop || p.pop >= a.needPop);
    return `<h3>平日の予定（3つ）</h3>${[0, 1, 2].map(i => `<div style="margin-bottom:5px"><select id="sch${i}" data-i="${i}" aria-label="予定${i + 1}">${opts.map(([k, a]) => `<option value="${k}" ${p.schedule[i] === k ? 'selected' : ''}>${a.name}：${a.desc}</option>`).join('')}</select></div>`).join('')}`;
  }
  function bindSchedule(root) { root.querySelectorAll('select[data-i]').forEach(s => s.onchange = () => { P().schedule[+s.dataset.i] = s.value; }); }

  function renderPeople(pane) {
    const p = P();
    const trs = W.trainers.slice().sort((a, b) => (p.trust[b.id] || 0) - (p.trust[a.id] || 0)).slice(0, 10);
    const ag = p.agent != null ? W.agents[p.agent] : null;
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card" style="margin-bottom:8px"><h3>馬主</h3>${W.owners.map(o => `<div class="stat"><span>${silkChip(o)} ${esc(o.name)}${p.contract === o.id ? ' <span class="pill gold">主戦契約</span>' : ''}</span><span>信頼 ${Math.round(p.otrust[o.id] || 0)}</span></div>`).join('')}
        ${p.contract != null ? `<button class="btn small" id="b-endc" style="margin-top:6px">主戦契約を解消する</button>` : ''}</div>
      <div class="card"><h3>調教師（信頼の高い順）</h3>${trs.map(t => `<div class="stat"><span>${esc(t.name)}（${t.region}）${t.id === p.stable ? ' <span class="pill">所属</span>' : ''}</span><span>信頼 ${Math.round(p.trust[t.id] || 0)}</span></div>`).join('')}</div>
    </div><div class="scroll">
      <div class="card" style="margin-bottom:8px"><h3>エージェント</h3>
        ${ag ? `<div class="stat"><span>${esc(ag.name)}</span><span>手数料 ${ag.fee}%</span></div><button class="btn small" id="b-fire" style="margin-top:6px">契約を解除する</button>` : '<p class="small muted" style="margin:0 0 6px">契約なし。評価が上がると売り込みが来る。こちらから頼むこともできる。</p>'}
        ${!ag ? W.agents.map(a => `<div class="stat"><span>${esc(a.name)}（手数料${a.fee}%）</span><span>${p.rep >= a.needRep ? `<button class="btn small" data-hire="${a.id}">契約する</button>` : `評価${a.needRep}以上`}</span></div>`).join('') : ''}</div>
      <div class="card"><h3>ライバル</h3>${(W.rivals || []).map(r => { const j = W.jockeys[r.jid]; const hh = p.hh[r.jid] || { w: 0, l: 0 }; return `<div class="stat"><span>${esc(j.name)}（${r.kind}・${j.age}歳）</span><span>今年${j.years[W.year] || 0}勝・対戦 ${hh.w}勝${hh.l}敗</span></div>`; }).join('')}
        <p class="small muted" style="margin:6px 0 0">対戦成績は同じレースに乗ったときの先着数。</p></div>
    </div></div>`;
    pane.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => { p.agent = +b.dataset.hire; World.news(W, `${p.name}騎手が${W.agents[p.agent].name}と契約`, 'me'); showWeek(); });
    if ($('b-fire')) $('b-fire').onclick = () => { p.agent = null; showWeek(); };
    if ($('b-endc')) $('b-endc').onclick = () => confirmTap($('b-endc'), 'もう一度押すと解消', () => { p.otrust[p.contract] = Math.max(0, (p.otrust[p.contract] || 0) - 15); p.contract = null; showWeek(); });
  }
  function renderMe(pane) {
    const p = P();
    const s = (k, v, note = '') => `<div class="stat"><span>${k}</span><span>${Math.round(v)}${note}</span></div><div class="bar"><i style="width:${clamp(v, 0, 100)}%"></i></div>`;
    const popRank = W.jockeys.filter(j => j.pop > p.pop).length + 1;
    const ys = p.years[W.year] || { income: 0 };
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll"><div class="card">
      <h3>騎手能力</h3>${s('騎乗技術', p.tech)}${s('判断力', p.judge)}${s('体力', p.phys)}${s('関係者の評価', p.rep)}${s('人気', p.pop, `（騎手${popRank}位）`)}
    </div></div><div class="scroll"><div class="card" style="margin-bottom:8px"><h3>コンディション</h3>
      <div class="stat"><span>体重</span><span>${p.weight.toFixed(1)}kg（騎乗できる斤量 ${(p.weight + World.GEAR).toFixed(1)}kg〜）</span></div>
      <div class="stat"><span>体調</span><span>${Math.round(p.cond)}（レースの出来に影響）</span></div>
      <div class="stat"><span>疲労</span><span>${Math.round(p.fatigue)}</span></div></div>
      <div class="card"><h3>お金とファン</h3>
      <div class="stat"><span>所持金</span><span>${money(p.money)}</span></div>
      <div class="stat"><span>今年の収入</span><span>${money(ys.income || 0)}</span></div>
      <div class="stat"><span>ファン数</span><span>${p.fans.toLocaleString()}人</span></div>
      <div class="stat"><span>取材対応</span><span>${p.interviews}回</span></div>
      <p class="small muted" style="margin:6px 0 0">収入は騎乗手当と賞金の取り分（ゲーム上の概算）。エージェント手数料と生活費が引かれる。</p></div></div></div>`;
  }
  function renderCareer(pane) {
    const p = P();
    const years = Object.keys(p.years).sort();
    const bonds = Object.entries(p.bond).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => W.horses[id]).filter(Boolean);
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card" style="margin-bottom:8px"><h3>通算成績</h3>
        <div class="stat"><span>勝利</span><span>${p.wins}勝（2着${p.seconds} 3着${p.thirds}）/ ${p.rides}騎乗</span></div>
        <div class="stat"><span>勝率</span><span>${p.rides ? (p.wins / p.rides * 100).toFixed(1) : '0.0'}%</span></div>
        <div class="stat"><span>獲得賞金（騎乗馬）</span><span>${money(p.earn)}</span></div>
        <div class="stat"><span>重賞</span><span>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</span></div>
        ${p.gWins.slice(-10).map(g => `<div class="small">・${esc(g)}</div>`).join('')}</div>
      <div class="card" style="padding:0"><table><tr><th>年</th><th>騎乗</th><th>勝利</th><th>重賞</th></tr>${years.map(y => `<tr><td>${y}</td><td>${p.years[y].rides}</td><td>${p.years[y].wins}</td><td>${p.years[y].g.length}</td></tr>`).join('')}</table></div>
    </div><div class="scroll">
      <div class="card" style="margin-bottom:8px"><h3>お手馬</h3>${bonds.length ? bonds.map(h => `<div class="stat"><span>${esc(h.name)}${realTag(h)}</span><span class="small">${h.retired ? '引退' : sexAge(h)}・${h.starts}戦${h.wins}勝・絆${Math.round(p.bond[h.id])}</span></div>`).join('') : '<p class="muted small">まだいない</p>'}</div>
      <div class="card" style="margin-bottom:8px"><h3>歩み</h3><ul class="log" style="padding-left:16px;margin:4px 0">${W.log.slice(-15).reverse().map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div>
      <button class="btn small ghost" id="b-retire">引退する</button>
    </div></div>`;
    $('b-retire').onclick = () => confirmTap($('b-retire'), 'もう一度押すと引退', () => { p.retired = true; W.log.push({ abs: W.abs, text: `${W.date} ${p.age}歳で現役引退` }); World.save(W); showRetire(); });
  }

  // ---------- 開催日 ----------
  function showDay() {
    show('s-day');
    if (W.story && W.story.pending.length) setTimeout(() => playScenes(), 0);
    const nRide = Object.keys(W.booked).length;
    $('day-top').innerHTML = topBar(`<span class="pill">騎乗 ${nRide}鞍</span>`);
    let t = `<table><tr><th>R</th><th>レース</th><th>条件</th><th>騎乗馬</th><th>結果</th></tr>`;
    W.card.forEach((race, i) => {
      const hid = W.booked[race.no];
      const h = hid ? W.horses[hid] : null;
      let res = '';
      if (race.result) {
        const w = race.result[0], wh = W.horses[w.hid];
        const me = race.result.find(r => r.isP);
        res = me ? `<b style="color:${me.pos === 1 ? 'var(--accent)' : 'inherit'}">${me.pos}着</b>（${me.pop}人気）${me.demoted ? ' 降着' : ''}` : `<span class="muted small">1着 ${esc(wh ? wh.name : '')}</span>`;
      }
      t += `<tr class="${i === W.dayIdx ? 'cur' : ''}"><td>${race.overseas ? '-' : race.no}</td><td>${gradeTag(race)} ${esc(race.name)}</td><td>${raceCond(race)}</td><td>${h ? '<b>' + esc(h.name) + '</b>' : '<span class="muted">—</span>'}</td><td>${res}</td></tr>`;
    });
    $('day-table').innerHTML = t + '</table>';
    const S = $('day-side');
    if (W.dayIdx >= W.card.length) {
      S.innerHTML = `<div class="card"><h2>本日の全レース終了</h2><p class="muted small">お疲れさまでした。</p><button class="btn primary" id="b-wend">今週の結果へ</button></div>`;
      $('b-wend').onclick = showWeekEnd; return;
    }
    const race = W.card[W.dayIdx];
    const hid = W.booked[race.no];
    let html = `<div class="card" style="margin-bottom:8px"><div class="small muted">次のレース</div><h2>${race.overseas ? '' : race.no + 'R '}${esc(race.name)} ${gradeTag(race)}</h2><div>${raceCond(race)}・${race.field.length}頭</div>`;
    if (hid) {
      const h = W.horses[hid];
      html += `<div style="margin-top:6px">騎乗馬: <b>${esc(h.name)}</b>${realTag(h)}</div></div><button class="btn primary" style="width:100%;margin-bottom:6px" id="b-pad">パドックへ</button>`;
    } else {
      html += `<div class="muted small" style="margin-top:6px">このレースは騎乗なし</div></div>
        <button class="btn" style="width:100%;margin-bottom:6px" id="b-skip1">見送る（結果だけ見る）</button>
        <button class="btn primary" style="width:100%;margin-bottom:6px" id="b-skipn">次の騎乗まで進める</button>`;
    }
    html += `<button class="btn ghost small" style="width:100%" id="b-allauto">残りをすべてオートで進める</button>`;
    S.innerHTML = html;
    if (hid) $('b-pad').onclick = () => showPaddock(race);
    else {
      $('b-skip1').onclick = () => { World.simulate(W, race, null); W.dayIdx++; World.save(W); showDay(); };
      $('b-skipn').onclick = () => { while (W.dayIdx < W.card.length && !W.booked[W.card[W.dayIdx].no]) { World.simulate(W, W.card[W.dayIdx], null); W.dayIdx++; } World.save(W); showDay(); };
    }
    $('b-allauto').onclick = () => {
      while (W.dayIdx < W.card.length) {
        const r = W.card[W.dayIdx]; const hh = W.booked[r.no] || null;
        const ev = World.simulate(W, r, hh, 'auto');
        if (ev) { logRide(r, hh, ev, 'auto'); if (ev.interview) W.pendingInterviews = (W.pendingInterviews || []).concat([{ iv: ev.interview, hid: hh }]); }
        W.dayIdx++;
      }
      World.save(W); showDay(); nextInterview();
    };
  }
  function nextInterview() {
    const q = W.pendingInterviews && W.pendingInterviews.shift();
    if (q) showInterview(q.iv, q.hid, nextInterview);
  }
  function logRide(race, hid, ev, mode) {
    W.weekLog.push({ no: race.no, name: race.name, graded: race.graded, horse: W.horses[hid].name, pos: ev.pos, pop: ev.pop, grade: ev.grade, mode, income: ev.income });
  }

  // ---------- パドック ----------
  function showPaddock(race) {
    show('s-paddock');
    const hid = W.booked[race.no];
    const h = W.horses[hid];
    World.setupRace(W, race, hid, 'manual'); // 枠順・騎手を確定
    const f = race.field.find(x => x.hid === hid);
    const ab = World.ability(h, W.year);
    $('pad-top').innerHTML = `<h2>${race.overseas ? '' : race.no + 'R '}${esc(race.name)} ${gradeTag(race)}</h2><span class="muted">${esc(VENUES[race.venue].name)} ${raceCond(race)}（${VENUES[race.venue].dir === 'L' ? '左回り' : '右回り'}）</span><div class="grow"></div>
      <button class="btn small ghost" id="b-padback">戻る</button>`;
    $('b-padback').onclick = showDay;
    const t = W.trainers[h.trainer], o = W.owners[h.owner];
    let src = '';
    if (h.real) src = `<div class="small muted" style="margin-top:6px">2026年GⅠ: ${h.runs2026.map(r => `${esc(r[0])} ${r[1]}着`).join(' / ')}<br>出典: ${h.src.map(u => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--blue)">JRA</a>`).join(' ')}</div>`;
    $('pad-left').innerHTML = `<div class="card" style="margin-bottom:8px">
      <div class="row"><h2>${f.waku}枠${race.field.indexOf(f) + 1}番 ${esc(h.name)}</h2>${realTag(h)}</div>
      <div class="small muted">${sexAge(h)}　${esc(t.name)}　${silkChip(o)} ${esc(o.name)}　${f.pop}番人気（${f.odds}倍）</div>
      <div class="stat"><span>脚質</span><span>${STYLE[h.style]}</span></div>
      <div class="stat"><span>得意距離 / 馬場</span><span>${h.dist}m前後 / ${SURF[h.surf]}</span></div>
      <div class="stat"><span>スピード</span><span>${stars(ab.spd)}</span></div>
      <div class="stat"><span>スタミナ</span><span>${stars(ab.sta)}</span></div>
      <div class="stat"><span>瞬発力</span><span>${stars(ab.kick)}</span></div>
      <div class="stat"><span>気性</span><span>${h.tmp > 65 ? '激しい（かかりやすい）' : h.tmp > 40 ? 'ふつう' : '素直'}</span></div>
      <div class="stat"><span>本作での戦績</span><span>${h.starts}戦${h.wins}勝${h.g1.length ? ' GⅠ' + h.g1.length + '勝' : ''}</span></div>${src}</div>
      <div class="card" style="margin-bottom:8px"><div class="small muted">調教師の指示</div><div>「${ORDERS[h.style]}乗ってほしい」</div></div>
      <button class="btn primary" style="width:100%;margin-bottom:6px" id="b-ride">ジョッキーカメラで騎乗</button>
      <button class="btn" style="width:100%" id="b-auto">オート騎乗（結果のみ）</button>`;
    let tb = `<table><tr><th>枠</th><th>番</th><th>馬名</th><th>性齢</th><th>騎手</th><th>斤量</th><th>人気</th></tr>`;
    race.field.forEach((x, i) => {
      const hh = W.horses[x.hid];
      const jn = x.hid === hid ? P().name : x.jid >= 0 ? W.jockeys[x.jid].name : x.jname;
      tb += `<tr class="${x.hid === hid ? 'me' : ''}"><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${WAKU_COLORS[x.waku - 1]};border:1px solid #555"></span></td><td>${i + 1}</td><td>${esc(hh.name)}${realTag(hh)}</td><td>${sexAge(hh)}</td><td>${esc(jn)}</td><td>${World.kinryo(W, race, hh, x.hid === hid)}</td><td>${x.pop}</td></tr>`;
    });
    $('pad-right').innerHTML = tb + '</table>';
    $('b-ride').onclick = () => startRace(race, hid);
    $('b-auto').onclick = () => {
      const r = World.setupRace(W, race, hid, 'auto');
      const res = r.runToEnd();
      const ev = World.applyResult(W, race, res, hid, 'auto', null);
      if (!quick) logRide(race, hid, ev, 'auto');
      showResult(race, hid, ev);
    };
  }

  // ---------- レース ----------
  let glbDone = false;
  HorseGLB.load().then(() => { glbDone = true; });
  let engine = null, R3 = null, rafId = 0, lastT = 0, acc = 0, paused = false, endAt = 0, curRace = null, curHid = null, camMode = 'jockey', hudT = 0;
  const CAMS = [['jockey', '騎手'], ['chase', '後方'], ['tv', '中継']];
  try { camMode = localStorage.getItem('jl-cam') || 'jockey'; } catch (e) {}
  function startRace(race, hid) {
    curRace = race; curHid = hid;
    Sound.init();
    $('tut').style.display = 'none';
    engine = World.setupRace(W, race, hid, 'manual');
    engine.onEvent = (t) => { if (t === 'gate') Sound.gate(); else if (t === 'whip') Sound.whip(); else if (t === 'bump' || t === 'foul') Sound.bump(); };
    show('race');
    if (!glbDone) { HorseGLB.load().then(() => { glbDone = true; R3.setupRace(engine, { label: race.graded || race.overseas ? race.name : '' }); R3.setCamMode(camMode); }); }
    if (!R3) { R3 = new Render3D($('r3d')); R3.onHoof = () => Sound.hoof(engine.surf); window.addEventListener('resize', () => R3 && R3.resize()); }
    R3.setupRace(engine, { label: race.graded || race.overseas ? race.name : '' });
    R3.setCamMode(camMode); updateCamBtn();
    $('b-snd').textContent = Sound.isMuted() ? '音OFF' : '音ON';
    const L = engine.course.dir === 'L';
    $('lbl-l').textContent = L ? '内へ' : '外へ'; $('lbl-r').textContent = L ? '外へ' : '内へ';
    engine.input.steer = 0; setRein(0.5);
    $('startBtn').style.display = '';
    $('loading').style.display = 'flex';
    paused = false; endAt = 0; acc = 0;
    cancelAnimationFrame(rafId);
    const wait = () => {
      if (Render3D.loaded < Render3D.toLoad || !glbDone) { rafId = requestAnimationFrame(wait); return; }
      $('loading').style.display = 'none';
      R3.resize();
      lastT = performance.now();
      rafId = requestAnimationFrame(loop);
    };
    wait();
  }
  function loop(now) {
    const rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const Pl = engine.player;
    let sdt = 0;
    if (tut) tutTick(rdt);
    if (!paused && !(tut && tut.hold)) {
      const speed = (Pl.finished ? 4 : !Pl.started ? 1 : 1.15) * (tut ? tut.speed : 1);
      acc += rdt * speed; sdt = rdt * speed;
      let n = 0;
      while (acc >= 1 / 60 && n++ < 300) { engine.step(1 / 60); acc -= 1 / 60; }
      if (Pl.started || Pl.auto) $('startBtn').style.display = 'none';
    }
    R3.render(engine, paused || (tut && tut.hold) ? 0 : sdt);
    updateHud(rdt);
    const nearby = engine.runners.filter(r => r !== Pl && Math.abs(r.s - Pl.s) < 15).length;
    const inStraight = engine.pAt(Pl.s) % engine.course.lap;
    const crowd = engine.open ? (Pl.s > engine.D - engine.course.H ? 0.4 + 0.6 * Math.min(1, (Pl.s - (engine.D - engine.course.H)) / engine.course.H) : 0.12) : 0.2;
    Sound.update(paused ? 0 : Pl.v, paused ? 0 : nearby, paused ? 0.05 : crowd);
    if (engine.done) {
      if (!endAt) endAt = now;
      if (now - endAt > 1500) { Sound.stopAll(); return finishRace(); }
    }
    rafId = requestAnimationFrame(loop);
  }
  function updateHud(dt) {
    const e = engine, Pl = e.player;
    const rem = Math.max(0, e.D - Pl.s);
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      const t = e.open ? (Pl.finished ? Pl.finishTime : e.t - e.gateOpenAt) : 0;
      const pace = e.pace();
      $('hud-info').innerHTML = `<b>${esc(e.cfg.name)}</b><br>残り ${Math.ceil(rem)}m・${RaceEngine.sectionName(e.course, e.pAt(Pl.s))}<br>${Pl.rank || '-'}番手/${e.runners.length}頭　${RaceEngine.fmtTime(t)}${pace ? `<br>ペース: ${pace}` : ''}<br>内ラチから ${Pl.X.toFixed(1)}m`;
      // 隊列
      const ord = e.runners.slice().sort((a, b) => b.s - a.s);
      const lead = ord[0].s, last = ord[ord.length - 1].s, span = Math.max(30, lead - last);
      const bar = $('hud-bar');
      if (!bar.children.length) bar.innerHTML = e.runners.map(r => `<span class="d${r === Pl ? ' me' : ''}" style="background:${r === Pl ? (W.player.color || '#ffeb3b') : r.color}"></span>`).join('') + '<span class="lead">先頭▶</span>';
      const w = bar.clientWidth - 16;
      e.runners.forEach((r, i) => { bar.children[i].style.left = (8 + w - (lead - r.s) / span * w) + 'px'; });
      drawMap();
      // 横の馬
      let l = false, rr = false;
      const sgn = e.course.dir === 'L' ? 1 : -1;
      for (const o of e.runners) { if (o === Pl) continue; const ds = o.s - Pl.s, dx = (o.X - Pl.X) * sgn; if (ds > -3.5 && ds < 2.5 && Math.abs(dx) < 2.4) { if (dx < 0) l = true; else rr = true; } }
      $('side-l').textContent = l ? '◀ 馬' : ''; $('side-r').textContent = rr ? '馬 ▶' : '';
      $('whip-n').textContent = String(10 - Pl.whips);
    }
    // コーチ：全力で持つ距離と、いまやるべきこと
    if (hudT === 0.1) {
      const sustain = estimateSustain(e, Pl);
      const ratio = clamp(sustain / Math.max(1, rem), 0, 1);
      $('coach-b').style.width = (ratio * 100) + '%';
      $('coach-b').style.background = ratio >= 1 ? '#66bb6a' : ratio > 0.75 ? '#ffca28' : '#90a4ae';
      $('coach-m').textContent = `全力で持つ距離 約${Math.round(sustain / 10) * 10}m ／ 残り${Math.ceil(rem)}m`;
      const tip = coachTip(e, Pl, rem, sustain);
      $('coach-t').textContent = tip.t; $('coach').classList.toggle('go', !!tip.go);
    }
    // ゲージ（毎フレーム）
    const st = clamp(Pl.st / 1.06, 0, 1);
    const g = $('g-st'); g.style.height = (st * 100) + '%'; g.style.background = st > 0.5 ? '#66bb6a' : st > 0.25 ? '#ffca28' : '#ef5350';
    const ok = 1 - Pl.kakari; const g2 = $('g-ok'); g2.style.height = (ok * 100) + '%'; g2.style.background = Pl.kakari > 0.6 ? '#ef5350' : '#42a5f5';
    const g3 = $('g-dr'); g3.style.height = (Math.min(1, Pl.drive) * 100) + '%'; g3.style.background = '#ffb74d';
    const m = e.message && e.t < e.message.until ? e.message : null;
    const msgEl = $('hud-msg');
    if (m) { if (msgEl.textContent !== m.text) msgEl.textContent = m.text; msgEl.style.color = m.color; } else if (msgEl.textContent) msgEl.textContent = '';
  }
  function estimateSustain(e, P) {
    // 今から全力（追う＋ムチ）で走ったときに、脚が残る距離の目安
    const vFull = P.vMax * (1.02 + (P.kick - 70) * 0.0006);
    const rate = P.drainBase * Math.pow(vFull / (e.vBase * 0.975), 6) * 1.04 * (1 + 0.9 * P.kakari);
    return Math.max(0, (P.st - 0.12) / rate * vFull);
  }
  const ORDER_RANGE = [[0, 0.12], [0.1, 0.4], [0.35, 0.7], [0.6, 1.01]];
  function coachTip(e, P, rem, sustain) {
    if (!e.open) return { t: 'ゲートが開いたらスタート' };
    if (!P.started) return { t: 'スタートを押す!' };
    if (P.finished) return { t: 'ゴール!' };
    if (P.drive > 0.5 && P.st < 0.12) return { t: '脚が上がった…最後まで押し切れ' };
    if (P.blocked && rem < 800) return { t: '前が壁！ ◀▶ で空いている所へ' };
    if (P.kakari > 0.55) return { t: 'かかっている：前の馬の後ろに入れる' };
    if (rem < sustain + 30 && P.drive < 0.5) return { t: '仕掛けどき！「追う」を長押し', go: true };
    if (P.drive > 0.5) return { t: rem < 300 ? '追って！ ムチでもうひと伸び' : '追っている：このまま', go: rem < 300 };
    const n = e.runners.length, fr = (P.rank - 1) / Math.max(1, n - 1), ord = ORDER_RANGE[P.horse.style];
    if (fr < ord[0] - 0.05 && e.input.rein > 0.4) return { t: '指示より前すぎる：手綱を「抑える」' };
    if (fr > ord[1] + 0.1 && e.input.rein < 0.6) return { t: '指示より後ろ：手綱を「行かせる」' };
    return { t: 'いい位置。仕掛けどきまで我慢' };
  }
  function drawMap() {
    const cv = $('hud-map'), x = cv.getContext('2d'), c = engine.course;
    const w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(8,12,18,.55)'; x.fillRect(0, 0, w, h);
    const pad = 16, totalW = c.H + 2 * c.R, totalH = 2 * c.R;
    const sc = Math.min((w - pad * 2) / totalW, (h - pad * 2) / totalH);
    const s = c.dir === 'L' ? -1 : 1;
    const pt = (p, X = 0) => { const a = RaceEngine.courseXY(c, p, X); return [w / 2 + a.x * sc, h / 2 + (a.z - s * c.R) * sc]; };
    x.strokeStyle = engine.surf === 'D' ? '#c8a27a' : '#8bc34a'; x.lineWidth = 7;
    x.beginPath(); for (let p = 0; p <= c.lap; p += c.lap / 80) { const [a, b] = pt(p, c.width / 2); p === 0 ? x.moveTo(a, b) : x.lineTo(a, b); } x.closePath(); x.stroke();
    const [gx, gy] = pt(c.H, c.width / 2); x.fillStyle = '#fff'; x.fillRect(gx - 1.5, gy - 9, 3, 18);
    engine.runners.forEach(r => { const [a, b] = pt(engine.pAt(Math.min(r.s, engine.D + 30)), r.X); x.fillStyle = r === engine.player ? '#ffeb3b' : 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(a, b, r === engine.player ? 5 : 3, 0, 7); x.fill(); });
  }
  function finishRace() {
    const res = engine.results();
    const mode = engine.player.auto ? 'auto' : 'manual';
    const ev = World.applyResult(W, curRace, res, curHid, mode, engine.inquiry);
    if (!quick) logRide(curRace, curHid, ev, mode);
    showResult(curRace, curHid, ev);
  }

  // ---- 操作 ----
  // 左：◀▶（押している間だけ進路を変える）
  function setSteer(v) { if (engine) engine.input.steer = v; }
  function setRein(v) {
    if (engine) engine.input.rein = v;
    document.querySelectorAll('#rein .rb').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.r - v) < 0.01));
  }
  function drawPad() { if (engine) setRein(engine.input.rein); }
  function holdBtn(el, on, off) {
    let id = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (_) {} el.classList.add('act'); on(e); });
    const end = (e) => { if (e.pointerId === id) { id = null; el.classList.remove('act'); off(e); } };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
    return () => id;
  }
  holdBtn($('c-left'), () => setSteer(-1), () => setSteer(0));
  holdBtn($('c-right'), () => setSteer(1), () => setSteer(0));
  // 右：手綱3段階
  document.querySelectorAll('#rein .rb').forEach(b => b.addEventListener('pointerdown', (e) => { e.preventDefault(); setRein(+b.dataset.r); }));
  // 追う（長押し）。押したまま左右にはじいてもムチ
  (function bindPush() {
    const b = $('c-push'); let x0 = 0, lastWhip = 0;
    const isDown = holdBtn(b, (e) => { x0 = e.clientX; if (engine) engine.input.push = true; }, () => { if (engine) engine.input.push = false; });
    b.addEventListener('pointermove', (e) => {
      if (isDown() == null || !engine) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 28 && performance.now() - lastWhip > 350) { lastWhip = performance.now(); x0 = e.clientX; engine.whip(dx < 0 ? 'L' : 'R'); flash($('c-whip')); }
    });
  })();
  // ムチ：打つ側は自動（馬がヨレている向きを戻す側。ヨレがなければ外側）
  function autoWhip() {
    if (!engine) return;
    const P = engine.player, L = engine.course.dir === 'L';
    const outer = L ? 'R' : 'L', inner = L ? 'L' : 'R';
    const drift = P.latV || 0; // +なら外へ流れている
    engine.whip(drift < -0.15 ? inner : outer);
  }
  $('c-whip').addEventListener('pointerdown', (e) => { e.preventDefault(); autoWhip(); flash($('c-whip')); });
  const flash = (el) => { el.classList.add('act'); setTimeout(() => el.classList.remove('act'), 150); };
  $('startBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (engine) engine.playerStart(); });
  document.querySelectorAll('.ctl, #startBtn').forEach(el => el.addEventListener('contextmenu', e => e.preventDefault()));
  function updateCamBtn() { $('b-cam').textContent = '視点:' + CAMS.find(c => c[0] === camMode)[1]; }
  $('b-cam').onclick = () => { const i = CAMS.findIndex(c => c[0] === camMode); camMode = CAMS[(i + 1) % CAMS.length][0]; try { localStorage.setItem('jl-cam', camMode); } catch (e) {} R3.setCamMode(camMode); updateCamBtn(); };
  $('b-snd').onclick = () => { const m = Sound.toggleMute(); $('b-snd').textContent = m ? '音OFF' : '音ON'; };
  $('pauseBtn').onclick = () => {
    paused = true;
    modal(`<h2 style="margin-bottom:8px">一時停止</h2>
      <div class="small" style="line-height:1.75">
      <b>◀ ▶（左下）</b> 押している間、内・外へ進路を変える。前に馬がいると壁になる。コーナーは外を回るほど距離をロスする。横に馬がいるのに寄せると接触・斜行になり、審議の対象になる<br>
      <b>手綱（右）</b> 行かせる／ふつう／抑える の3段階。前半は抑えて脚をためるが、前に馬がいないと気の強い馬はかかる（折合ゲージ）。馬の後ろに入れると落ち着く<br>
      <b>追う（長押し）</b> 押している間、騎手が追い続けて加速する。脚色（スタミナ）を大きく使う<br>
      <b>ムチ</b> 追っている間の伸びを上乗せ（10回まで）。打つ側は、馬のヨレを戻す向きに自動で選ばれる。追うボタンを押したまま左右にはじいても打てる<br>
      <b>コーチ（画面上）</b> 緑のバーは「今から全力で追って持つ距離」。バーが残り距離に届いたら仕掛けどき<br>
      <b>キーボード</b> ←→ 進路 / ↑↓ 手綱 / Space 長押しで追う・スタート / W ムチ / C 視点</div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="p-resume">再開</button><button class="btn" id="p-auto">ここからオート騎乗</button></div>`, () => {
      $('p-resume').onclick = () => { paused = false; closeModal(); lastT = performance.now(); };
      $('p-auto').onclick = () => { const Pl = engine.player; Pl.auto = true; if (Pl.reaction == null) Pl.reaction = Math.max(0, engine.t - engine.gateOpenAt) + 0.2; paused = false; closeModal(); lastT = performance.now(); };
    });
  };
  window.addEventListener('keydown', (e) => {
    if (!engine || !$('race').classList.contains('on') || paused) return;
    if (e.key === 'ArrowLeft') setSteer(-1); else if (e.key === 'ArrowRight') setSteer(1);
    else if (e.key === 'ArrowUp') setRein(Math.min(1, engine.input.rein + 0.5));
    else if (e.key === 'ArrowDown') setRein(Math.max(0, engine.input.rein - 0.5));
    else if (e.key === 'w' || e.key === 'W') autoWhip();
    else if (e.key === ' ') { if (!engine.player.started) engine.playerStart(); else engine.input.push = true; }
    else if (e.key === 'q' || e.key === 'Q') engine.whip('L');
    else if (e.key === 'e' || e.key === 'E') engine.whip('R');
    else if (e.key === 'c' || e.key === 'C') $('b-cam').click();
    else if (e.key === 'Escape') $('pauseBtn').click();
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (!engine) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setSteer(0); if (e.key === ' ') engine.input.push = false; });

  // ---------- 結果 ----------
  function showResult(race, hid, ev) {
    show('s-result');
    $('res-top').innerHTML = `<h2>${race.overseas ? '' : race.no + 'R '}${esc(race.name)} ${gradeTag(race)} 結果</h2><span class="muted">${esc(VENUES[race.venue].name)} ${raceCond(race)}</span>`;
    let tb = `<table><tr><th>着</th><th>枠</th><th>馬名</th><th>騎手</th><th>タイム</th><th>着差</th><th>人気</th></tr>`;
    race.result.forEach(r => {
      const h = W.horses[r.hid]; const f = race.field.find(x => x.hid === r.hid);
      tb += `<tr class="${r.isP ? 'me' : ''}"><td>${r.pos}${r.demoted ? '<span class="pill warn">降着</span>' : ''}</td><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${WAKU_COLORS[f.waku - 1]};border:1px solid #555"></span></td><td>${esc(h.name)}${realTag(h)}</td><td>${esc(r.jname || '')}</td><td>${RaceEngine.fmtTime(r.time)}</td><td>${r.margin}</td><td>${r.pop}</td></tr>`;
    });
    $('res-table').innerHTML = tb + '</table>';
    const comment = ev.pos === 1 ? (race.graded === 1 || race.overseas ? '大舞台で見事な勝利!' : '勝利!') : ev.pos <= 3 ? '馬券圏内を確保。' : ev.pos <= ev.pop ? '人気以上の着順。' : '期待には届かなかった。';
    let inq = '';
    if (ev.inquiry) {
      const q = ev.inquiry;
      inq = `<div class="card" style="margin-bottom:8px;border-color:var(--bad)"><div class="small muted">審議</div><b>${q.demoteTo ? `斜行で${q.demoteTo}着に降着` : '斜行・接触あり'}</b><div class="small">${q.weeks ? `${q.weeks}週間の騎乗停止` : '過怠金'}</div></div>`;
    }
    $('res-side').innerHTML = `${inq}<div class="card" style="margin-bottom:8px;text-align:center"><div class="small muted">騎乗評価</div><div class="eval">${ev.grade}</div>
      <div style="margin-top:4px"><b>${ev.pos}着</b>（${ev.pop}番人気）</div><div class="small muted">${comment}</div>
      <div class="small" style="margin-top:6px">評価 ${ev.dRep >= 0 ? '+' : ''}${ev.dRep}　人気 ${ev.dPop >= 0 ? '+' : ''}${ev.dPop}　収入 ${ev.income}万円</div></div>
      <button class="btn primary" style="width:100%" id="b-resnext">${quick ? 'タイトルへ' : '次へ'}</button>`;
    $('b-resnext').onclick = () => {
      if (quick) { quick = false; W = null; refreshTitle(); show('s-title'); if (tutDone) { tutDone = false; modal(`<h2>チュートリアル完了</h2><p>基本の操作はこれで全部。あとは実戦で仕掛けどころを覚えていこう。操作の説明はレース中の「一時停止」からいつでも見られる。</p><div class="choices"><button class="btn primary" id="m-ok">OK</button></div>`, () => { $('m-ok').onclick = closeModal; }); } return; }
      W.dayIdx++; World.save(W); showDay();
    };
    if (ev.interview && !quick) showInterview(ev.interview, hid, () => playScenes());
    else if (!quick) playScenes();
  }
  function showInterview(iv, hid, after) {
    const def = World.INTERVIEW[iv.kind];
    const h = W.horses[hid];
    modal(`<div class="small muted">勝利騎手インタビュー${iv.race ? `・${esc(iv.race)}` : ''}</div><h2 style="margin:2px 0 8px">「${esc(def.q)}」</h2>
      <div class="choices">${def.a.map((a, i) => `<button class="btn" data-a="${i}">${esc(a[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { World.answerInterview(W, iv, +b.dataset.a, h ? h.trainer : null, h ? h.owner : null); closeModal(); World.save(W); if (after) after(); });
    });
  }

  // ---------- 週の終わり ----------
  function showWeekEnd() {
    show('s-info');
    const wins = W.weekLog.filter(l => l.pos === 1).length;
    const inc = W.weekLog.reduce((a, l) => a + (l.income || 0), 0);
    $('info-top').innerHTML = `<div class="grow"><h2>今週の成績</h2><span class="muted small">${esc(W.date)}　${W.weekLog.length}騎乗 ${wins}勝　収入 ${Math.round(inc * 10) / 10}万円</span></div><button class="btn primary" id="b-next">次の週へ</button>`;
    let t = `<div class="card" style="padding:0;max-width:760px"><table><tr><th>R</th><th>レース</th><th>騎乗馬</th><th>着順</th><th>人気</th><th>評価</th><th></th></tr>`;
    W.weekLog.forEach(l => t += `<tr><td>${l.no}</td><td>${esc(l.name)}</td><td>${esc(l.horse)}</td><td><b>${l.pos}着</b></td><td>${l.pop}</td><td>${l.grade}</td><td class="muted small">${l.mode === 'auto' ? 'オート' : ''}</td></tr>`);
    if (!W.weekLog.length) t += `<tr><td colspan="7" class="muted">騎乗なし</td></tr>`;
    $('info-body').innerHTML = t + '</table></div>';
    $('b-next').onclick = () => advanceWeek();
  }
  function advanceWeek() {
    const ye = World.endWeek(W);
    World.save(W);
    tab = 'week';
    if (ye) showYearEnd(ye); else showWeek();
  }
  function showYearEnd(ye) {
    show('s-info');
    $('info-top').innerHTML = `<div class="grow"><h2>${ye.year}年 シーズン終了</h2></div><button class="btn primary" id="b-ny">${ye.year + 1}年へ</button>`;
    const ys = ye.ys;
    $('info-body').innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="card"><h3>あなたの成績</h3>
      <div class="stat"><span>勝利</span><span>${ys.wins}勝（2着${ys.seconds} 3着${ys.thirds}）</span></div>
      <div class="stat"><span>騎乗</span><span>${ys.rides}</span></div>
      <div class="stat"><span>勝率</span><span>${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}%</span></div>
      <div class="stat"><span>リーディング</span><span>${ye.rank}位</span></div>
      <div class="stat"><span>人気</span><span>騎手${ye.popRank}位</span></div>
      <div class="stat"><span>収入</span><span>${money(ys.income || 0)}</span></div>
      <div class="stat"><span>重賞勝利</span><span>${ys.g.length}</span></div>
      ${ys.g.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      ${ye.awards.length ? `<div style="margin-top:8px;color:var(--accent)">受賞: ${ye.awards.map(esc).join('、')}</div>` : ''}</div>
      <div class="card" style="padding:0"><table><tr><th>順位</th><th>騎手</th><th>勝利</th></tr>${ye.table.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.wins}</td></tr>`).join('')}</table>
      <div class="small muted" style="padding:6px">※この開催（1週1場）で集計したリーディング</div></div></div>`;
    $('b-ny').onclick = showWeek;
  }
  function showRetire() {
    show('s-info');
    const p = P();
    $('info-top').innerHTML = `<div class="grow"><h2>引退 — ${esc(p.name)}</h2></div><button class="btn primary" id="b-end">タイトルへ</button>`;
    $('info-body').innerHTML = `<div class="card" style="max-width:720px"><p>${p.age}歳で鞭を置いた。</p>
      <div class="stat"><span>通算</span><span>${p.wins}勝 / ${p.rides}騎乗</span></div>
      <div class="stat"><span>重賞</span><span>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</span></div>
      <div class="stat"><span>ファン</span><span>${p.fans.toLocaleString()}人</span></div>
      ${p.g1Wins.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      <ul class="log" style="padding-left:16px">${W.log.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div>`;
    $('b-end').onclick = () => { World.deleteSave(); refreshTitle(); show('s-title'); };
    if (W.story && !W.story.flags.ended) { W.story.flags.ended = true; W.story.pending.push({ lines: Story.epilogue(W) }); playScenes(); }
  }

  // ---------- チュートリアル ----------
  let tut = null, tutDone = false;
  const TUT = [
    { text: 'ようこそ。まずは画面の見方から。<br>（このあいだレースは止まっている）', tap: true },
    { text: '<b>左上</b>：レース名、残り距離、今の位置（何番手か）、タイム、ペース、内ラチからの距離。', tap: true, hl: ['hud-info'] },
    { text: '<b>上の帯</b>：隊列。右端が先頭で、大きい丸が自分。<br><b>右上</b>：コース全体の地図。黄色が自分。', tap: true, hl: ['hud-bar', 'hud-map'] },
    { text: '<b>脚色</b>＝残りのスタミナ。<b>折合</b>＝馬の落ち着き（下がると「かかって」スタミナを浪費）。<b>追い</b>＝いまどれだけ追っているか。', tap: true, hl: ['hud-gauges'] },
    { text: '<b>視点</b>は騎手・後方・中継を切り替えられる。迷ったら「後方」が見やすい。', tap: true, hl: ['b-cam'] },
    { text: 'ではスタート。ゲートが開いた瞬間に<b>「スタート」</b>を押す。早すぎても遅すぎても出負けする。', hl: ['startBtn'], start: true, until: () => engine.player.started },
    { text: '右の<b>手綱</b>で<b>「抑える」</b>を押す。前半は脚（スタミナ）をためるのが基本。選んだ手綱はそのまま続く。', hl: ['rein'], speed: 0.6, until: () => engine.input.rein < 0.35, hold: 1.2 },
    { text: '前に馬がいないと、抑えた馬は<b>かかる</b>（折合ゲージが減る）。左下の<b>◀ ▶</b>を押して、前の馬の<b>真後ろ</b>に入れよう。', hl: ['c-left', 'c-right', 'hud-gauges'], speed: 0.7, until: () => engine.player.covered, hold: 2, timeout: 14 },
    { text: 'いい位置。画面上の<b>コーチ</b>が仕掛けどきを教えてくれる。緑のバーは「全力で走りきれる距離」。それまで我慢。<br>（早送り中）', hl: ['coach'], speed: 3, until: () => engine.D - engine.player.s < 650 },
    { text: '仕掛けどき。右下の<b>「追う」を長押し</b>。押している間、騎手が追い続けて加速する。', hl: ['c-push', 'coach'], speed: 0.6, until: () => engine.player.drive > 0.8 },
    { text: '追いながら<b>「ムチ」</b>をタップ（別の指で）。もうひと伸びする。打つ側は、馬がヨレた向きを戻すように自動で選ばれる。', hl: ['c-whip'], speed: 0.6, until: () => engine.player.whips >= 1 },
    { text: 'ゴールまで追い続けよう！ 前が壁になったら ◀ ▶ で進路を探す。', speed: 1, until: () => engine.player.finished },
  ];
  function startTutorial() {
    try { localStorage.setItem('jl-tut', '1'); } catch (e) {}
    W = World.newGame({ name: 'あなた', region: '美浦', color: '#fbc02d' });
    quick = true;
    const race = W.card[10];
    race.dist = 1600; race.surf = 'T'; race.ground = '良';
    World.estimateOdds(W, race);
    const pickF = race.field.slice().sort((a, b) => a.pop - b.pop)[1];
    W.booked = { [race.no]: pickF.hid };
    startRace(race, pickF.hid);
    engine.gateOpenAt = 1e9;
    tut = { i: -1, speed: 1, hold: false, t: 0, ok: 0 };
    tutStep(0);
  }
  function tutStep(i) {
    document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
    if (i >= TUT.length) { tut = null; tutDone = true; $('tut').style.display = 'none'; return; }
    const st = TUT[i];
    tut.i = i; tut.t = 0; tut.ok = 0; tut.speed = st.speed || 1; tut.hold = !!st.tap;
    $('tut').style.display = 'block';
    $('tut-text').innerHTML = st.text;
    $('tut-step').textContent = `${i + 1} / ${TUT.length}`;
    $('tut-next').style.display = st.tap ? '' : 'none';
    (st.hl || []).forEach(id => $(id) && $(id).classList.add('hl'));
    if (st.start) engine.gateOpenAt = engine.t + 2 + Math.random() * 1.5;
  }
  function tutTick(dt) {
    const st = TUT[tut.i];
    if (!st || st.tap) return;
    tut.t += dt;
    if (st.until()) tut.ok += dt; else tut.ok = 0;
    if (tut.ok >= (st.hold || 0.01) || (st.timeout && tut.t > st.timeout)) tutStep(tut.i + 1);
  }
  $('tut-next').onclick = () => { if (tut) tutStep(tut.i + 1); };
  $('tut-skip').onclick = () => { if (!tut) return; document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl')); tut = null; $('tut').style.display = 'none'; if (engine.gateOpenAt > 1e8) engine.gateOpenAt = engine.t + 2; };

  // ---------- お試し騎乗 ----------
  function quickRace() {
    W = World.newGame({ name: 'あなた', region: Math.random() < 0.5 ? '美浦' : '栗東', color: '#fbc02d' });
    quick = true;
    const race = W.card[10];
    World.estimateOdds(W, race);
    const sorted = race.field.slice().sort((a, b) => a.pop - b.pop);
    const pickF = sorted[Math.min(sorted.length - 1, 2)];
    W.booked = { [race.no]: pickF.hid };
    showPaddock(race);
    $('b-padback').onclick = () => { quick = false; W = null; show('s-title'); };
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  window.__jl = { get W() { return W; }, get engine() { return engine; } };
})();
