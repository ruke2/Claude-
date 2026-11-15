// ===== 画面遷移・UI =====
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let W = null, quick = false, selColor = SILKS[0], tab = 'week', newsPage = 0;
  const STYLE = ['逃げ', '先行', '差し', '追込'];
  const SURF = { T: '芝', D: 'ダ', B: '芝・ダ' };
  const ORDERS = ['ハナを切って自分のペースで', '好位で流れに乗って', '中団で脚をためて', '後方で脚をためて直線勝負'];

  // ---- 画面の向き：縦（向きロック中）なら、画面ごと横向きに回す ----
  let rotDir = 'cw';
  try { rotDir = localStorage.getItem('jl-rot') || 'cw'; } catch (e) {}
  function applyRotation() {
    // Safari はアドレスバーの分だけ 100vh が実際より大きいので、見えている大きさ（px）で合わせる
    // 実際に描ける範囲は、画面に固定した body の大きさで測る（visualViewport は下の帯の分だけ小さいことがある）
    const br = document.body.getBoundingClientRect();
    const vv = window.visualViewport;
    const w = Math.round(br.width || (vv ? vv.width : window.innerWidth)), h = Math.round(br.height || (vv ? vv.height : window.innerHeight));
    const portrait = h > w;
    const root = document.documentElement, app = $('app');
    root.classList.toggle('rot', portrait);
    root.classList.toggle('ccw', portrait && rotDir === 'ccw');
    if (portrait) {
      // 時計やノッチのある帯（上）には何も描かない。そこにアプリ側のぼかしが重なって白っぽく見えるため。下は端まで使う
      const top = parseFloat(getComputedStyle($('safe-probe')).paddingTop) || 0;
      const len = h - top;
      app.style.width = len + 'px'; app.style.height = w + 'px';
      app.style.transform = rotDir === 'ccw' ? `translate(0px, ${h}px) rotate(-90deg)` : `translate(${w}px, ${top}px) rotate(90deg)`;
    } else { app.style.width = ''; app.style.height = ''; app.style.transform = ''; }
    window.scrollTo(0, 0);
    if (window.__R3) setTimeout(() => window.__R3.resize(), 50);
  }
  window.addEventListener('resize', applyRotation);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyRotation);
  window.addEventListener('orientationchange', () => setTimeout(applyRotation, 250));
  applyRotation();
  // 回転中は画面上の左右と指の動きの向きが変わる
  function uiDX(e, x0, y0) {
    if (!document.documentElement.classList.contains('rot')) return e.clientX - x0;
    return rotDir === 'ccw' ? -(e.clientY - y0) : (e.clientY - y0);
  }

  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); closeDrawer(); flushToasts(); }
  function gradeTag(race) {
    if (race.graded) return `<span class="badge g${race.graded}">G${'ⅠⅡⅢ'[race.graded - 1]}</span>`;
    if (race.overseas) return '<span class="badge g1">海外GⅠ</span>';
    if (race.label === race.name) return '';
    return `<span class="badge">${esc(race.label)}</span>`;
  }
  function raceCond(race) { return `${SURF[race.surf]}${race.dist}m${race.ground === '重' ? '・重' : ''}`; }
  const horseAge = (h) => W.year - h.born;
  const sexAge = (h) => `${h.sex}${horseAge(h)}`;
  function realTag(h) { return h.real ? ' <span class="badge gold" title="実在馬（2026年JRA GⅠ出走馬）">実在</span>' : h.foreign ? ' <span class="badge">外国馬</span>' : h.story === 'partner' ? ' <span class="badge gold">相棒</span>' : ''; }
  function stars(v) { const n = clamp(Math.round((v - 40) / 12), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function silkChip(o) { const s = o.silks; return `<span class="silk" style="background:linear-gradient(90deg,${s.base} 50%,${s.accent} 50%)"></span>`; }
  function waku(n) { const c = WAKU_COLORS[n - 1]; return `<span class="waku" style="background:${c};color:${[1, 5].includes(n) ? '#000' : '#fff'}">${n}</span>`; }
  function tip(text) { return `<span class="tip" tabindex="0" role="button" aria-label="説明">?<span class="tt">${esc(text)}</span></span>`; }
  const P = () => W.player;
  const money = (v) => `${Math.round(v).toLocaleString()}万円`;
  function confirmTap(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; }, 3000);
  }
  function modal(html, bind, head = '') { $('modal-body').innerHTML = (head ? `<div class="mh">${esc(head)}</div>` : '') + `<div class="mb">${html}</div>`; $('modal').classList.add('on'); if (bind) bind($('modal-body')); }
  function closeModal() { $('modal').classList.remove('on'); }
  // ツールチップはタップでも開く
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.tip'); document.querySelectorAll('.tip.open').forEach(x => { if (x !== t) x.classList.remove('open'); }); if (t) t.classList.toggle('open'); });

  // ---- トースト ----
  function toast(text) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  function flushToasts() { if (W && W.toasts && W.toasts.length) { W.toasts.splice(0).slice(-4).forEach((t, i) => setTimeout(() => toast(t), i * 400)); } }

  // ---- グローバルナビゲーション ----
  function gnav(id, extra = '') {
    const p = P(); const ys = p.years[W.year] || { wins: 0, rides: 0 };
    const allow = World.apprenticeAllowance(p);
    const gw = World.gearOf(p);
    $(id).innerHTML = `<div class="logo">ジョッキー・ライフ<small>${esc(Progress.title(W))}</small></div>
      <div class="date"><b>${esc(W.date.replace('(日)', ''))}</b> ${esc(VENUES[W.venue].name)}${W.isOverseas ? '（遠征）' : ''}</div>
      <div class="stats grow">
        <span class="gchip">Lv<b>${p.lv}</b></span>
        <span class="gchip">今年<b>${ys.wins}</b>勝</span>
        <span class="gchip">評価<b>${Math.round(p.rep)}</b></span>
        <span class="gchip">ファン<b>${p.fans.toLocaleString()}</b></span>
        <span class="gchip ${p.weight + gw > 55 ? 'warn' : ''}">体重${p.weight.toFixed(1)}kg</span>
        <span class="gchip ${p.cond < 50 ? 'warn' : ''}">体調${Math.round(p.cond)}</span>
        <span class="gchip">${money(p.money)}</span>${allow ? `<span class="gchip">▲${allow}kg減</span>` : ''}
      </div>${extra}<button class="burger" aria-label="メニュー" data-menu>☰</button>`;
    $(id).querySelector('[data-menu]').onclick = openDrawer;
  }
  function crumbs(id, items) {
    $(id).innerHTML = items.map((it, i) => (i ? '<span class="sep">›</span>' : '') + (it[1] ? `<a data-i="${i}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`)).join('');
    $(id).querySelectorAll('a').forEach(a => a.onclick = items[+a.dataset.i][1]);
  }
  const weekLabel = () => `${W.year}年 ${W.month}月`;

  // ---- ドロワーメニュー ----
  function openDrawer() {
    const inGame = !!W && !quick;
    $('drawer').innerHTML = `<h3>メニュー</h3>
      ${inGame ? '<button class="item" data-a="save">💾 セーブする</button><button class="item" data-a="home">🏠 今週の画面へ</button>' : ''}
      <button class="item" data-a="tut">🎓 チュートリアル</button>
      <button class="item" data-a="rot">🔄 画面の回転方向を反転（縦持ち時）</button>
      <button class="item" data-a="snd">🔈 効果音：${Sound.isMuted() ? 'OFF' : 'ON'}</button>
      <button class="item" data-a="title">↩ タイトルへ${inGame ? '（自動でセーブ）' : ''}</button>
      <p class="small muted" style="margin-top:auto">縦向きのまま（向きロック中）でも、画面は横向きに回して表示する。</p>`;
    $('drawer').classList.add('on'); $('drawer-bg').classList.add('on');
    $('drawer').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a; closeDrawer();
      if (a === 'save') { World.save(W); toast('セーブした'); }
      if (a === 'home') showWeek();
      if (a === 'tut') { if (W && !quick) World.save(W); startTutorial(); }
      if (a === 'rot') { rotDir = rotDir === 'cw' ? 'ccw' : 'cw'; try { localStorage.setItem('jl-rot', rotDir); } catch (e) {} applyRotation(); }
      if (a === 'snd') Sound.toggleMute();
      if (a === 'title') { if (W && !quick) World.save(W); W = null; quick = false; refreshTitle(); show('s-title'); }
    });
  }
  function closeDrawer() { $('drawer').classList.remove('on'); $('drawer-bg').classList.remove('on'); }
  $('drawer-bg').onclick = closeDrawer;

  // ---------- タイトル ----------
  function refreshTitle() { $('b-continue').disabled = !World.hasSave(); }
  refreshTitle();
  $('b-new').onclick = () => { renderSwatches(); show('s-new'); };
  $('b-continue').onclick = () => { const w = World.load(); if (w) { W = w; Progress.ensure(W); quick = false; tab = 'week'; showWeek(); } };
  $('b-quick').onclick = quickRace;
  $('b-tut').onclick = () => startTutorial();
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  document.querySelectorAll('#s-new .radio input').forEach(r => r.onchange = () => document.querySelectorAll('#s-new .radio').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  function renderSwatches() {
    const box = $('swatches'); box.innerHTML = '';
    SILKS.slice(0, 10).forEach(c => {
      const d = document.createElement('button'); d.className = 'swatch'; d.style.cssText = `width:26px;height:26px;border-radius:50%;background:${c};border:${c === selColor ? '3px solid var(--gold)' : '1px solid var(--rule)'}`;
      d.setAttribute('aria-label', '色を選ぶ');
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
    else { show('s-week'); gnav('week-nav'); modal(`<h2>操作に慣れておこう</h2><p>レースの操作と画面の見方を、練習レースで1つずつ説明するチュートリアルがある（3分ほど）。</p><div class="choices"><button class="btn primary" id="m-tut">チュートリアルをやる（キャリアは保存済み。終わったら「つづきから」）</button><button class="btn" id="m-no">あとで</button></div>`, () => { $('m-tut').onclick = () => { closeModal(); startTutorial(); }; $('m-no').onclick = () => { closeModal(); showWeek(); }; }, 'ようこそ'); }
  };

  // ---------- 週の画面（タブ） ----------
  const TABS = [['week', '今週'], ['goal', '目標・成績'], ['me', '騎手'], ['skill', 'スキル'], ['fans', '人気'], ['shop', 'ショップ'], ['people', '人脈'], ['life', '私生活'], ['news', 'ニュース'], ['ach', '実績'], ['career', 'キャリア']];
  function showWeek() {
    if (P().retired) return showRetire();
    Progress.ensure(W);
    show('s-week');
    gnav('week-nav');
    const sp = P().sp;
    $('tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" role="tab" data-t="${k}">${n}${(k === 'news' && W.news.some(x => x.abs >= W.abs - 1)) || (k === 'skill' && sp > 0) ? '<span class="dot"></span>' : ''}</button>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; showWeek(); });
    const pane = $('tabpane');
    ({ week: renderWeekTab, goal: renderGoal, me: renderMe, skill: renderSkill, fans: renderFans, shop: renderShop, people: renderPeople, life: renderLife, news: renderNews, ach: renderAch, career: renderCareer }[tab] || renderWeekTab)(pane);
    // ストーリー → シーズン目標 → 出来事
    if (W.story && W.story.pending.length) playScenes(() => showWeek());
    else if (W.pendingGoal) showGoalPick();
    else if (W.events && W.events.length) showEvent();
  }
  function playScenes(done) {
    const S = W && W.story;
    if (!S || !S.pending.length) { if (done) done(); return; }
    const sc = S.pending[0]; let i = 0;
    const render = () => {
      const [who, text] = sc.lines[i];
      const last = i >= sc.lines.length - 1;
      let extra = '';
      if (last && sc.input) extra = `<div style="margin-top:10px"><label class="small muted" for="sc-in">名前（カタカナ9文字まで）</label><br><input type="text" id="sc-in" maxlength="9" placeholder="例：ツギノカゼ" style="margin-top:4px"></div>`;
      const btns = last && sc.choice ? sc.choice.opts.map((o, k) => `<button class="btn ${k ? '' : 'primary'}" data-k="${k}">${esc(o)}</button>`).join('') : `<button class="btn primary" id="sc-next">${last ? (sc.input ? '名付ける' : '閉じる') : '次へ ›'}</button>`;
      modal(`${who ? `<div class="speaker">${esc(who)}</div>` : ''}<p style="margin:2px 0 6px;font-size:15px;line-height:1.75;font-family:var(--serif)">${esc(text)}</p>${extra}<div class="choices">${btns}</div>`, (el) => {
        const finish = (val) => { S.pending.shift(); Story.answer(W, sc, val); closeModal(); World.save(W); playScenes(done); };
        el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => finish(+b.dataset.k));
        const nx = $('sc-next');
        if (nx) nx.onclick = () => { if (!last) { i++; render(); } else finish(sc.input ? ($('sc-in').value || 'ツギノカゼ') : null); };
      }, `ストーリー　${i + 1} / ${sc.lines.length}`);
    };
    render();
  }
  function showEvent() {
    const e = W.events[0];
    modal(`<h2 style="margin:0 0 6px">${esc(e.title)}</h2><p style="margin:0;line-height:1.7">${esc(e.text)}</p>
      <div class="choices">${e.choices.map((c, i) => `<button class="btn ${i ? '' : 'primary'}" data-c="${i}">${esc(c[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { World.applyEvent(W, e, +b.dataset.c); W.events.shift(); closeModal(); World.save(W); showWeek(); });
    }, '今週の出来事');
  }
  function showGoalPick() {
    const opts = Progress.goalOptions(W);
    modal(`<h2 style="margin-bottom:4px">${W.year}年のシーズン目標</h2><p class="small muted" style="margin:0 0 8px">年末に達成度で評価される。達成すると報酬、届かないと評価が少し下がる。</p>
      ${opts.map((o, i) => `<label class="radio ${i === 0 ? 'on' : ''}"><input type="radio" name="sg" value="${i}" ${i === 0 ? 'checked' : ''}><span><b>${esc(o.name)}</b> <span class="badge">${esc(o.diff)}</span><br><span class="small muted">報酬：${esc(o.reward)}</span></span></label>`).join('')}
      <div class="choices"><button class="btn primary" id="sg-ok">この目標で始める</button></div>`, (el) => {
      el.querySelectorAll('input[name=sg]').forEach(r => r.onchange = () => el.querySelectorAll('.radio').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
      $('sg-ok').onclick = () => { Progress.setGoal(W, +el.querySelector('input[name=sg]:checked').value); closeModal(); World.save(W); showWeek(); };
    }, 'シーズン目標');
  }

  function renderWeekTab(pane) {
    const p = P();
    const sg = window.Story && W.story ? Story.goal(W) : null;
    const gp = Progress.goalProgress(W);
    if (W.injury > 0 || p.suspended > 0) {
      const why = W.injury > 0 ? `負傷療養中（あと${W.injury}週）` : `騎乗停止中（あと${p.suspended}週）`;
      pane.innerHTML = `<div class="cols"><div class="card"><div class="sec"><h3>${why}</h3></div><p class="muted">今週は騎乗できない。平日の予定はこなせる。</p><button class="btn primary" id="b-skip">次の週へ</button></div><div class="card">${scheduleHtml()}</div></div>`;
      bindSchedule(pane);
      $('b-skip').onclick = () => { W.card.forEach(r => { if (!r.result) World.simulate(W, r, null); }); advanceWeek(); };
      return;
    }
    let L = '';
    if (sg) L += `<div class="card" style="margin-bottom:8px;border-left:4px solid var(--gold)"><div class="small muted">${esc(sg.title)}</div><div style="font-family:var(--serif);font-weight:700">${esc(sg.goal)}</div></div>`;
    if (W.isOverseas) {
      const race = W.card[0], h = W.horses[W.booked[1]];
      L += `<div class="card"><div class="sec"><h3>海外遠征</h3><span class="sub">${esc(VENUES[race.venue].country)}・${esc(VENUES[race.venue].name)}</span></div>
        <div class="big" style="font-size:20px">${esc(race.name)} ${gradeTag(race)}</div><div class="small">${raceCond(race)}　騎乗馬 <b>${esc(h.name)}</b>${realTag(h)}（${sexAge(h)}）</div></div>`;
    } else {
      const n = W.requests.length;
      L += `<div class="sec"><h3>騎乗依頼</h3><span class="sub">${n}件・タップで受ける（1レース1頭）</span>${tip('体重＋装備が斤量を超える依頼は受けられない。相棒・お手馬・主戦の馬には印が付く。')}</div>`;
      if (!n) L += `<p class="muted">今週の依頼はない。</p>`;
      L += `<div class="ctrack" id="reqs">${W.requests.map((q, i) => {
        const race = W.card[q.raceNo - 1], h = W.horses[q.hid], t = W.trainers[h.trainer], o = W.owners[h.owner];
        const tags = [q.story ? '<span class="badge gold">相棒</span>' : q.bondHorse ? '<span class="badge gold">お手馬</span>' : '', p.contract === h.owner ? '<span class="badge green">主戦</span>' : '', q.viaAgent ? '<span class="badge">仲介</span>' : '', !q.okWeight ? '<span class="badge warn">斤量オーバー</span>' : ''].join(' ');
        return `<div class="reqcard ${q.accepted ? 'on' : ''} ${q.okWeight ? '' : 'ng'}" data-i="${i}"><span class="ck">✓</span>
          <div class="row"><span class="rno">${q.raceNo}R</span>${gradeTag(race)}<span class="small muted">${raceCond(race)}</span></div>
          <div class="small" style="margin-top:2px">${esc(race.name)}</div>
          <div class="hn">${esc(h.name)}${realTag(h)}</div>
          <div class="small muted">${sexAge(h)}・${STYLE[h.style]}・斤量${q.kin}kg</div>
          <div class="row" style="margin-top:4px"><span class="big" style="font-size:18px">${q.pop}<small>番人気</small></span><span class="small muted">${q.odds}倍</span></div>
          <div class="small muted" style="margin-top:2px">${esc(t.name)}・${silkChip(o)} ${esc(o.name)}</div>
          <div style="margin-top:3px">${tags}</div></div>`;
      }).join('')}</div>
      ${n > 2 ? `<div class="cnav"><button class="cbtnn" id="c-prev" aria-label="前へ">‹</button>${W.requests.map((_, i) => `<span class="cdot" data-d="${i}"></span>`).join('')}<button class="cbtnn" id="c-next" aria-label="次へ">›</button></div>` : ''}`;
      (W.offers || []).forEach((o, i) => {
        const h = W.horses[o.hid];
        L += `<div class="card" style="margin-top:8px;border-color:var(--blue)"><div class="small muted">海外遠征の騎乗依頼（${esc(o.date)}）</div>
          <div><b>${esc(o.race.name)}</b>（${esc(VENUES[o.race.v].country)}・${SURF[o.race.surf]}${o.race.dist}m）　騎乗馬 ${esc(h.name)}${realTag(h)}</div>
          <div class="row" style="margin-top:6px"><button class="btn small primary" data-oa="${i}">受ける</button><button class="btn small" data-od="${i}">断る</button></div></div>`;
      });
      if (W.pendingOverseas) L += `<div class="card" style="margin-top:8px"><span class="small muted">予定：</span>${esc(W.pendingOverseas.date)} ${esc(W.pendingOverseas.race.name)} へ遠征</div>`;
    }
    const n = W.isOverseas ? 1 : W.requests.filter(q => q.accepted).length;
    const goalCard = gp ? `<div class="card" style="margin-bottom:8px"><div class="sec"><h3>シーズン目標</h3><span class="sub">${esc(gp.name)}</span></div><div class="row"><span class="big">${gp.cur}<small> / ${gp.target}</small></span><div class="grow"><div class="bar gold"><i style="width:${gp.rate * 100}%"></i></div></div></div></div>` : '';
    pane.innerHTML = `<div class="cols"><div class="scroll">${L}</div><div class="scroll">
      ${goalCard}
      <div class="card" style="margin-bottom:8px">${scheduleHtml()}</div>
      <button class="btn primary" style="width:100%;padding:11px" id="b-day">開催日へ進む（${n}鞍に騎乗）</button>
    </div></div>`;
    pane.querySelectorAll('.reqcard').forEach(el => el.onclick = () => {
      const q = W.requests[+el.dataset.i];
      if (!q.okWeight) { toast('斤量オーバーで受けられない'); return; }
      const on = !q.accepted;
      W.requests.forEach(o => { if (o.raceNo === q.raceNo) o.accepted = false; });
      q.accepted = on;
      const sc = $('reqs').scrollLeft; showWeek(); if ($('reqs')) $('reqs').scrollLeft = sc;
    });
    // カルーセル
    const tr = $('reqs');
    if (tr && $('c-prev')) {
      const step = () => (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width + 8 : 200);
      $('c-prev').onclick = () => tr.scrollBy({ left: -step(), behavior: 'smooth' });
      $('c-next').onclick = () => tr.scrollBy({ left: step(), behavior: 'smooth' });
      const dots = () => { const i = Math.round(tr.scrollLeft / step()); document.querySelectorAll('.cdot').forEach((d, k) => d.classList.toggle('on', k === i)); };
      tr.addEventListener('scroll', dots); dots();
    }
    pane.querySelectorAll('[data-oa]').forEach(b => b.onclick = () => { const o = W.offers[+b.dataset.oa]; W.pendingOverseas = o; W.offers = []; W.log.push({ abs: W.abs, text: `${W.date} ${o.race.name}への遠征が決定（${W.horses[o.hid].name}）` }); World.news(W, `${P().name}騎手が${W.horses[o.hid].name}で${o.race.name}へ遠征`, 'me'); showWeek(); });
    pane.querySelectorAll('[data-od]').forEach(b => b.onclick = () => { W.offers.splice(+b.dataset.od, 1); showWeek(); });
    bindSchedule(pane);
    $('b-day').onclick = () => {
      if (!W.isOverseas) { W.booked = {}; W.requests.filter(q => q.accepted).forEach(q => W.booked[q.raceNo] = q.hid); }
      W.dayIdx = W.dayIdx || 0; World.save(W); showDay();
    };
  }
  // 平日の予定：チェックボックスで3つ選ぶ
  function scheduleHtml() {
    const p = P();
    const opts = Object.entries(World.ACTIVITIES).filter(([k, a]) => !a.needPop || p.pop >= a.needPop);
    const sel = new Set(p.schedule);
    return `<div class="sec"><h3>平日の予定</h3><span class="sub">3つ選ぶ（${sel.size}/3）</span></div><div class="checks">${opts.map(([k, a]) => `<label class="chk ${sel.has(k) ? 'on' : ''} ${!sel.has(k) && sel.size >= 3 ? 'dis' : ''}" title="${esc(a.desc)}"><input type="checkbox" data-act="${k}" ${sel.has(k) ? 'checked' : ''} ${!sel.has(k) && sel.size >= 3 ? 'disabled' : ''}>${esc(a.name)}</label>`).join('')}</div>
      <div class="small muted" style="margin-top:5px">${[...sel].map(k => `${World.ACTIVITIES[k].name}：${World.ACTIVITIES[k].desc}`).join('　')}</div>`;
  }
  function bindSchedule(root) {
    root.querySelectorAll('input[data-act]').forEach(c => c.onchange = () => {
      const p = P(); const set = new Set(p.schedule);
      if (c.checked) set.add(c.dataset.act); else set.delete(c.dataset.act);
      p.schedule = [...set].slice(0, 3); showWeek();
    });
  }

  function renderGoal(pane) {
    const p = P(), gp = Progress.goalProgress(W), ys = p.years[W.year] || { rides: 0, wins: 0, seconds: 0, thirds: 0, g: [], income: 0 };
    const table = W.jockeys.map(j => ({ name: j.name, wins: j.years[W.year] || 0 })).concat([{ name: p.name, wins: ys.wins, me: true }]).sort((a, b) => b.wins - a.wins);
    const rank = table.findIndex(t => t.me) + 1;
    pane.innerHTML = `<div class="cols"><div class="scroll">
      <div class="card"><div class="sec"><h3>${W.year}年の成績</h3><span class="sub">リーディング ${rank}位</span></div>
        <div class="row wrap" style="gap:18px">
          <div><div class="small muted">勝利</div><div class="big">${ys.wins}<small>勝</small></div></div>
          <div><div class="small muted">騎乗</div><div class="big">${ys.rides}</div></div>
          <div><div class="small muted">勝率</div><div class="big">${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}<small>%</small></div></div>
          <div><div class="small muted">連対率</div><div class="big">${ys.rides ? ((ys.wins + ys.seconds) / ys.rides * 100).toFixed(1) : '0.0'}<small>%</small></div></div>
          <div><div class="small muted">重賞</div><div class="big">${ys.g.length}</div></div>
        </div></div>
      <div class="card"><div class="sec"><h3>シーズン目標</h3></div>${gp ? `<div class="kv"><span>${esc(gp.name)}</span><b>${gp.cur} / ${gp.target}</b></div><div class="bar gold"><i style="width:${gp.rate * 100}%"></i></div><div class="small muted" style="margin-top:4px">報酬：${esc(gp.reward)}</div>` : '<p class="small muted">未設定</p>'}</div>
    </div><div class="scroll card" style="padding:0"><table><tr><th>順位</th><th>騎手</th><th>勝利</th></tr>${table.slice(0, 15).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.wins}</td></tr>`).join('')}${rank > 15 ? `<tr class="me"><td>${rank}</td><td>${esc(p.name)}</td><td>${ys.wins}</td></tr>` : ''}</table></div></div>`;
  }

  function radarSVG(vals) {
    const n = vals.length, R = 80, cx = 110, cy = 105;
    const pt = (i, r) => [cx + r * Math.sin(i / n * Math.PI * 2), cy - r * Math.cos(i / n * Math.PI * 2)];
    const grid = [0.25, 0.5, 0.75, 1].map(k => `<polygon points="${vals.map((_, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="#d8d4c7" stroke-width="1"/>`).join('');
    const axes = vals.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="#ebe8de"/>`).join('');
    const poly = vals.map((v, i) => pt(i, R * clamp(v[1] / 100, 0, 1)).join(',')).join(' ');
    const labels = vals.map((v, i) => { const [x, y] = pt(i, R + 16); return `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="#1c1c1a">${v[0]} ${Math.round(v[1])}</text>`; }).join('');
    return `<svg class="radar" viewBox="0 0 220 215" role="img" aria-label="能力">${grid}${axes}<polygon points="${poly}" fill="rgba(11,93,59,.22)" stroke="#0b5d3b" stroke-width="2"/>${labels}</svg>`;
  }
  function renderMe(pane) {
    const p = P(), need = Progress.xpNeed(p.lv), gw = World.gearOf(p);
    const L = W.life;
    pane.innerHTML = `<div class="cols"><div class="scroll"><div class="card">
      <div class="profile"><div class="avatar" style="background:radial-gradient(circle at 50% 35%,#fff 0 18%,${p.color} 19%)"></div>
        <div class="grow"><div style="font-family:var(--serif);font-size:19px;font-weight:900">${esc(p.name)}</div>
        <div class="small muted">${p.age}歳・${esc(p.region)}所属・騎手${(p.yearsActive || 0) + 1}年目</div>
        <div><span class="badge gold">${esc(Progress.title(W))}</span> <span class="badge green">Lv ${p.lv}</span> ${p.sp ? `<span class="badge warn">スキルポイント ${p.sp}</span>` : ''}</div></div></div>
      <div class="small muted" style="margin-top:8px">次のレベルまで ${Math.max(0, Math.round(need - p.xp))} 経験値</div><div class="bar"><i style="width:${p.xp / need * 100}%"></i></div>
      ${radarSVG([['技術', p.tech], ['判断', p.judge], ['体力', p.phys], ['評価', p.rep], ['人気', p.pop]])}
    </div></div><div class="scroll">
      <div class="card"><div class="sec"><h3>コンディション</h3></div>
        <div class="kv"><span>体重 ${tip('体重＋装備が斤量以下でないと騎乗できない。装備の重さはショップの鞍で軽くできる。')}</span><b>${p.weight.toFixed(1)}kg（装備${gw.toFixed(1)}kg → 斤量${(p.weight + gw).toFixed(1)}kg〜）</b></div>
        <div class="kv"><span>体調 ${tip('レースでの馬の力の出方に影響する。疲労がたまると下がる。')}</span><b>${Math.round(p.cond)}</b></div>
        <div class="kv"><span>疲労</span><b>${Math.round(p.fatigue)}</b></div></div>
      <div class="card"><div class="sec"><h3>装備・暮らし</h3></div>
        ${Object.keys(Progress.GEAR).map(k => `<div class="kv"><span>${Progress.GEAR_LABEL[k]}</span><b>${esc(Progress.GEAR[k][p.gear[k] || 0].name)}</b></div>`).join('')}
        <div class="kv"><span>住まい</span><b>${esc(Progress.HOMES[p.home].name)}</b></div>
        <div class="kv"><span>所持金</span><b>${money(p.money)}</b></div></div>
    </div></div>`;
  }
  function renderSkill(pane) {
    const p = P(), cats = [...new Set(Progress.SKILLS.map(s => s.cat))];
    pane.innerHTML = `<div class="scroll" style="padding-top:8px"><div class="row" style="margin-bottom:6px"><h2>スキル</h2><span class="badge warn">スキルポイント ${p.sp}</span><span class="small muted">レベルが上がると1ポイント。シーズン目標の報酬でももらえる。</span></div>
      ${cats.map((c, ci) => `<details class="acc" ${ci === 0 ? 'open' : ''}><summary>${esc(c)}のスキル <span class="small muted">${Progress.SKILLS.filter(s => s.cat === c && p.skills[s.id]).length}/${Progress.SKILLS.filter(s => s.cat === c).length}習得</span></summary><div class="in">
        ${Progress.SKILLS.filter(s => s.cat === c).map(s => `<div class="kv"><span><b>${esc(s.name)}</b> <span class="small muted">${esc(s.desc)}</span></span>${p.skills[s.id] ? '<span class="badge green">習得済み</span>' : `<button class="btn small ${p.sp >= s.cost ? 'primary' : ''}" data-sk="${s.id}" ${p.sp >= s.cost ? '' : 'disabled'}>習得（${s.cost}pt）</button>`}</div>`).join('')}
      </div></details>`).join('')}</div>`;
    pane.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => { if (Progress.learn(W, b.dataset.sk)) { toast('スキルを習得した'); World.save(W); showWeek(); } });
  }
  function renderFans(pane) {
    const p = P(), tot = Math.max(1, p.fans);
    const popRank = W.jockeys.filter(j => j.pop > p.pop).length + 1;
    pane.innerHTML = `<div class="cols"><div class="scroll">
      <div class="card"><div class="sec"><h3>人気</h3><span class="sub">騎手人気 ${popRank}位</span></div>
        <div class="row wrap" style="gap:18px"><div><div class="small muted">ファン</div><div class="big">${p.fans.toLocaleString()}<small>人</small></div></div>
        <div><div class="small muted">SNSフォロワー</div><div class="big">${(p.sns || 0).toLocaleString()}</div></div>
        <div><div class="small muted">人気度 ${tip('勝利、取材、ファンサービスで上がる。年末の人気投票に影響する。')}</div><div class="big">${Math.round(p.pop)}</div></div>
        <div><div class="small muted">人気投票1位</div><div class="big">${p.voteWins}<small>回</small></div></div></div></div>
      <div class="card"><div class="sec"><h3>ファン層</h3></div>${Progress.SEGS.map(([k, n]) => `<div class="kv"><span>${n}</span><b>${Math.round(p.fanSeg[k]).toLocaleString()}人（${Math.round(p.fanSeg[k] / tot * 100)}%）</b></div><div class="bar ${k === 'women' || k === 'young' ? 'gold' : ''}"><i style="width:${p.fanSeg[k] / tot * 100}%"></i></div>`).join('')}
        <p class="small muted" style="margin:6px 0 0">GⅠを勝つと女性・若い世代、穴馬で勝つと競馬ファン、地元の競馬場で勝つと地元ファンが増える。</p></div>
    </div><div class="scroll card"><div class="sec"><h3>応援メッセージ</h3></div>${p.cheers.length ? p.cheers.map(c => `<div class="cheer">「${esc(c.text)}」<div class="m">${esc(c.date)}・${esc(c.race)}（${esc(c.horse)}）</div></div>`).join('') : '<p class="small muted">勝つと届く。</p>'}</div></div>`;
  }
  function renderShop(pane) {
    const p = P();
    pane.innerHTML = `<div class="scroll" style="padding-top:8px"><div class="row" style="margin-bottom:6px"><h2>ショップ</h2><span class="small muted">所持金 ${money(p.money)}</span></div>
      <details class="acc" open><summary>装備</summary><div class="in">${Object.keys(Progress.GEAR).map(k => `<div class="kv"><span><b>${Progress.GEAR_LABEL[k]}</b>：${esc(Progress.GEAR[k][p.gear[k] || 0].name)}</span><span class="row">${Progress.GEAR[k].slice(1).map((it, i) => p.gear[k] >= i + 1 ? `<span class="badge green">${esc(it.name)}</span>` : `<button class="btn small" data-gear="${k}:${i + 1}" ${p.money >= it.price ? '' : 'disabled'} title="${esc(it.desc)}">${esc(it.name)} ${it.price}万</button>`).join('')}</span></div>`).join('')}
        <p class="small muted" style="margin:6px 0 0">${Object.keys(Progress.GEAR).map(k => Progress.GEAR[k].slice(1).map(it => `${it.name}：${it.desc}`).join(' / ')).join('　')}</p></div></details>
      <details class="acc"><summary>スタッフ <span class="small muted">（毎週の費用がかかる）</span></summary><div class="in"><div class="checks">${Progress.STAFF.map(s => `<label class="chk ${p.staff[s.id] ? 'on' : ''}"><input type="checkbox" data-staff="${s.id}" ${p.staff[s.id] ? 'checked' : ''}>${esc(s.name)}（週${s.weekly}万）</label>`).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">${Progress.STAFF.map(s => `${s.name}：${s.desc}`).join('　')}</p></div></details>
      <details class="acc"><summary>住まい</summary><div class="in">${Progress.HOMES.map((h, i) => `<div class="kv"><span><b>${esc(h.name)}</b> <span class="small muted">体調の回復 +${h.cond}・週${h.weekly}万</span></span>${p.home === i ? '<span class="badge green">住んでいる</span>' : i < p.home ? '' : `<button class="btn small" data-home="${i}" ${p.money >= h.price ? '' : 'disabled'}>引っ越す ${h.price}万</button>`}</div>`).join('')}</div></details></div>`;
    pane.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { const [k, l] = b.dataset.gear.split(':'); if (Progress.buyGear(W, k, +l)) { toast('購入した'); World.save(W); showWeek(); } });
    pane.querySelectorAll('[data-staff]').forEach(c => c.onchange = () => { Progress.toggleStaff(W, c.dataset.staff); World.save(W); showWeek(); });
    pane.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { if (Progress.moveHome(W, +b.dataset.home)) { toast('引っ越した'); World.save(W); showWeek(); } });
  }
  function renderPeople(pane) {
    const p = P();
    const trs = W.trainers.slice().sort((a, b) => (p.trust[b.id] || 0) - (p.trust[a.id] || 0)).slice(0, 10);
    const ag = p.agent != null ? W.agents[p.agent] : null;
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card"><div class="sec"><h3>馬主</h3>${tip('信頼が高いと良い馬の依頼が来る。信頼が45を超えると主戦契約の話が来ることがある。')}</div>${W.owners.map(o => `<div class="kv"><span>${silkChip(o)} ${esc(o.name)}${p.contract === o.id ? ' <span class="badge green">主戦</span>' : ''}</span><b>${Math.round(p.otrust[o.id] || 0)}</b></div><div class="bar"><i style="width:${p.otrust[o.id] || 0}%"></i></div>`).join('')}
        ${p.contract != null ? `<button class="btn small" id="b-endc" style="margin-top:6px">主戦契約を解消する</button>` : ''}</div>
      <div class="card"><div class="sec"><h3>調教師</h3><span class="sub">信頼の高い順</span></div>${trs.map(t => `<div class="kv"><span>${esc(t.name)}（${t.region}）${t.id === p.stable ? ' <span class="badge">所属</span>' : ''}</span><b>${Math.round(p.trust[t.id] || 0)}</b></div>`).join('')}</div>
    </div><div class="scroll">
      <div class="card"><div class="sec"><h3>エージェント</h3>${tip('騎乗依頼の数と質が上がる。収入から手数料が引かれる。')}</div>
        ${ag ? `<div class="kv"><span>${esc(ag.name)}</span><b>手数料 ${ag.fee}%</b></div><button class="btn small" id="b-fire" style="margin-top:6px">契約を解除する</button>` : W.agents.map(a => `<div class="kv"><span>${esc(a.name)}（手数料${a.fee}%）</span>${p.rep >= a.needRep ? `<button class="btn small primary" data-hire="${a.id}">契約する</button>` : `<span class="small muted">評価${a.needRep}以上</span>`}</div>`).join('')}</div>
      <div class="card"><div class="sec"><h3>ライバル</h3></div>${(W.rivals || []).map(r => { const j = W.jockeys[r.jid]; const hh = p.hh[r.jid] || { w: 0, l: 0 }; return `<div class="kv"><span>${esc(j.name)}<span class="small muted">（${r.kind}・${j.age}歳）</span></span><b>今年${j.years[W.year] || 0}勝・対戦${hh.w}勝${hh.l}敗</b></div>`; }).join('')}</div>
    </div></div>`;
    pane.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => { p.agent = +b.dataset.hire; World.news(W, `${p.name}騎手が${W.agents[p.agent].name}と契約`, 'me'); showWeek(); });
    if ($('b-fire')) $('b-fire').onclick = () => { p.agent = null; showWeek(); };
    if ($('b-endc')) $('b-endc').onclick = () => confirmTap($('b-endc'), 'もう一度押すと解消', () => { p.otrust[p.contract] = Math.max(0, (p.otrust[p.contract] || 0) - 15); p.contract = null; showWeek(); });
  }
  function renderLife(pane) {
    const L = W.life, p = P();
    const stage = { none: 'ひとり', met: `${L.partner}さんと知り合った`, dating: `${L.partner}さんと交際中`, married: `${L.partner}さんと結婚` }[L.stage];
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll card"><div class="sec"><h3>私生活</h3></div>
      <div class="kv"><span>パートナー</span><b>${esc(stage)}</b></div>${L.stage !== 'none' ? `<div class="kv"><span>${esc(L.partner)}さんとの仲</span><b>${Math.round(L.love)}</b></div><div class="bar gold"><i style="width:${L.love}%"></i></div>` : ''}
      ${L.child ? '<div class="kv"><span>家族</span><b>子どもがいる</b></div>' : ''}
      <div class="kv"><span>家族との関係</span><b>${Math.round(L.family)}</b></div><div class="bar"><i style="width:${L.family}%"></i></div>
      <div class="kv"><span>友人との関係</span><b>${Math.round(L.friends)}</b></div><div class="bar"><i style="width:${L.friends}%"></i></div>
      <p class="small muted" style="margin:6px 0 0">私生活の出来事は「今週の出来事」として届く。選んだ答えで関係や体調が変わる。</p></div>
      <div class="scroll card"><div class="sec"><h3>住まい</h3></div><div class="kv"><span>今の住まい</span><b>${esc(Progress.HOMES[p.home].name)}</b></div><p class="small muted">ショップから引っ越せる。広い家ほど体調が回復しやすい。</p></div></div>`;
  }
  function renderNews(pane) {
    const per = 9, pages = Math.max(1, Math.ceil(W.news.length / per));
    newsPage = Math.min(newsPage, pages - 1);
    const items = W.news.slice(newsPage * per, newsPage * per + per);
    pane.innerHTML = `<div class="scroll card" style="margin-top:8px"><div class="sec"><h3>ニュース</h3><span class="sub">${W.news.length}件</span></div><ul class="news">${items.map(n => `<li class="${n.kind}"><span class="d">${esc(n.date || '')}</span><span class="t">${esc(n.text)}</span></li>`).join('') || '<li class="muted">まだニュースはない</li>'}</ul>
      <div class="pager">${pages > 1 ? `<button data-pg="${Math.max(0, newsPage - 1)}" aria-label="前のページ">‹</button>` + Array.from({ length: pages }, (_, i) => `<button class="${i === newsPage ? 'on' : ''}" data-pg="${i}">${i + 1}</button>`).join('') + `<button data-pg="${Math.min(pages - 1, newsPage + 1)}" aria-label="次のページ">›</button>` : ''}</div></div>`;
    pane.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { newsPage = +b.dataset.pg; showWeek(); });
  }
  function renderAch(pane) {
    const p = P(), cats = [...new Set(Progress.ACH.map(a => a.cat))];
    const got = Progress.ACH.filter(a => p.ach[a.id]).length;
    pane.innerHTML = `<div class="scroll" style="padding-top:8px">
      <div class="card"><div class="sec"><h3>トロフィー棚</h3><span class="sub">GⅠ・海外GⅠの優勝 ${p.trophies.length}個</span></div>
        ${p.trophies.length ? `<div class="ctrack">${p.trophies.map(t => `<div class="trophy"><div class="cup">🏆</div><b>${esc(t.name)}</b><div class="small muted">${t.year}年・${esc(t.horse)}</div></div>`).join('')}</div>` : '<p class="small muted">GⅠを勝つと並ぶ。</p>'}</div>
      <div class="card"><div class="sec"><h3>実績</h3><span class="sub">${got} / ${Progress.ACH.length}</span></div>
        ${cats.map(c => `<div class="small muted" style="margin:6px 0 3px">${esc(c)}</div><div class="ach">${Progress.ACH.filter(a => a.cat === c).map(a => `<div class="achi ${p.ach[a.id] ? 'on' : 'off'}">${p.ach[a.id] ? '🏅' : '🔒'} <b>${esc(a.name)}</b>${p.ach[a.id] ? `<div class="small muted">${esc(p.ach[a.id])}</div>` : ''}</div>`).join('')}</div>`).join('')}</div></div>`;
  }
  function renderCareer(pane) {
    const p = P();
    const years = Object.keys(p.years).sort();
    const bonds = Object.entries(p.bond).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => W.horses[id]).filter(Boolean);
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card"><div class="sec"><h3>通算成績</h3></div>
        <div class="kv"><span>勝利</span><b>${p.wins}勝（2着${p.seconds} 3着${p.thirds}）/ ${p.rides}騎乗</b></div>
        <div class="kv"><span>勝率</span><b>${p.rides ? (p.wins / p.rides * 100).toFixed(1) : '0.0'}%</b></div>
        <div class="kv"><span>獲得賞金（騎乗馬）</span><b>${money(p.earn)}</b></div>
        <div class="kv"><span>重賞</span><b>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</b></div></div>
      <div class="card" style="padding:0"><table><tr><th>年</th><th>騎乗</th><th>勝利</th><th>重賞</th></tr>${years.map(y => `<tr><td>${y}</td><td>${p.years[y].rides}</td><td>${p.years[y].wins}</td><td>${p.years[y].g.length}</td></tr>`).join('')}</table></div>
    </div><div class="scroll">
      <details class="acc" open><summary>お手馬</summary><div class="in">${bonds.length ? bonds.map(h => `<div class="kv"><span>${esc(h.name)}${realTag(h)}</span><b class="small">${h.retired ? '引退' : sexAge(h)}・${h.starts}戦${h.wins}勝</b></div>`).join('') : '<p class="muted small">まだいない</p>'}</div></details>
      <details class="acc"><summary>歩み</summary><div class="in"><ul class="log" style="padding-left:16px;margin:4px 0">${W.log.slice(-20).reverse().map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div></details>
      <button class="btn small" id="b-retire" style="margin-top:6px">引退する</button>
    </div></div>`;
    $('b-retire').onclick = () => confirmTap($('b-retire'), 'もう一度押すと引退', () => { p.retired = true; W.log.push({ abs: W.abs, text: `${W.date} ${p.age}歳で現役引退` }); World.save(W); showRetire(); });
  }

  // ---------- 開催日 ----------
  function showDay() {
    show('s-day');
    gnav('day-nav');
    crumbs('day-crumbs', [['今週', () => showWeek()], [weekLabel(), null], [`${VENUES[W.venue].name} 開催日`, null]]);
    if (W.story && W.story.pending.length) setTimeout(() => playScenes(), 0);
    const nRide = Object.keys(W.booked).length;
    let t = `<table><tr><th>R</th><th>レース</th><th>条件</th><th>頭数</th><th>騎乗馬</th><th>結果</th></tr>`;
    W.card.forEach((race, i) => {
      const hid = W.booked[race.no];
      const h = hid ? W.horses[hid] : null;
      let res = '';
      if (race.result) {
        const w = race.result[0], wh = W.horses[w.hid];
        const me = race.result.find(r => r.isP);
        res = me ? `<b style="color:${me.pos === 1 ? 'var(--green)' : 'inherit'}">${me.pos}着</b>（${me.pop}人気）${me.demoted ? ' <span class="badge warn">降着</span>' : ''}` : `<span class="muted small">1着 ${esc(wh ? wh.name : '')}</span>`;
      }
      t += `<tr class="${i === W.dayIdx ? 'cur' : ''}"><td><b>${race.overseas ? '-' : race.no}</b></td><td>${gradeTag(race)} ${esc(race.name)}</td><td>${raceCond(race)}</td><td>${race.field.length}</td><td>${h ? '<b>' + esc(h.name) + '</b>' : '<span class="muted">—</span>'}</td><td>${res}</td></tr>`;
    });
    $('day-table').innerHTML = t + '</table>';
    const S = $('day-side');
    if (W.dayIdx >= W.card.length) {
      S.innerHTML = `<div class="card"><div class="sec"><h3>本日の全レース終了</h3></div><p class="muted small">お疲れさまでした。</p><button class="btn primary" style="width:100%" id="b-wend">今週の結果へ</button></div>`;
      $('b-wend').onclick = showWeekEnd; return;
    }
    const race = W.card[W.dayIdx];
    const hid = W.booked[race.no];
    let html = `<div class="card" style="margin-top:8px"><div class="small muted">次のレース</div><div style="font-family:var(--serif);font-size:18px;font-weight:900">${race.overseas ? '' : race.no + 'R '}${esc(race.name)} ${gradeTag(race)}</div><div class="small">${raceCond(race)}・${race.field.length}頭・騎乗 ${nRide}鞍</div>`;
    if (hid) {
      const h = W.horses[hid];
      html += `<div style="margin-top:6px">騎乗馬 <b style="font-family:var(--serif);font-size:15px">${esc(h.name)}</b>${realTag(h)}</div></div><button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-pad">パドックへ</button>`;
    } else {
      html += `<div class="muted small" style="margin-top:6px">このレースは騎乗なし</div></div>
        <button class="btn" style="width:100%;margin-top:8px" id="b-skip1">見送る（結果だけ見る）</button>
        <button class="btn primary" style="width:100%;margin-top:6px" id="b-skipn">次の騎乗まで進める</button>`;
    }
    html += `<button class="btn ghost small" style="width:100%;margin-top:6px" id="b-allauto">残りをすべてオートで進める</button>`;
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
  function nextInterview() { const q = W.pendingInterviews && W.pendingInterviews.shift(); if (q) showInterview(q.iv, q.hid, nextInterview); }
  function logRide(race, hid, ev, mode) { W.weekLog.push({ no: race.no, name: race.name, graded: race.graded, horse: W.horses[hid].name, pos: ev.pos, pop: ev.pop, grade: ev.grade, mode, income: ev.income }); }

  // ---------- パドック（出馬表） ----------
  function showPaddock(race) {
    show('s-paddock');
    gnav('pad-nav');
    const hid = W.booked[race.no];
    const h = W.horses[hid];
    crumbs('pad-crumbs', quick ? [['タイトル', () => { quick = false; W = null; show('s-title'); }], ['お試し騎乗', null]] : [['今週', () => showWeek()], [`${VENUES[race.venue].name} 開催日`, () => showDay()], [`${race.overseas ? '' : race.no + 'R '}${race.name}`, null], ['パドック', null]]);
    World.setupRace(W, race, hid, 'manual');
    const f = race.field.find(x => x.hid === hid);
    const ab = World.ability(h, W.year);
    const t = W.trainers[h.trainer], o = W.owners[h.owner];
    let src = '';
    if (h.real) src = `<div class="small muted" style="margin-top:6px">2026年GⅠ：${h.runs2026.map(r => `${esc(r[0])} ${r[1]}着`).join(' / ')}<br>出典：${h.src.map(u => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--green)">JRA</a>`).join(' ')}</div>`;
    $('pad-left').innerHTML = `<div class="card" style="margin-top:8px">
      <div class="row">${waku(f.waku)}<span class="small muted">${race.field.indexOf(f) + 1}番</span><div class="grow"></div>${realTag(h)}</div>
      <div style="font-family:var(--serif);font-size:21px;font-weight:900;margin:2px 0">${esc(h.name)}</div>
      <div class="small muted">${sexAge(h)}・${esc(t.name)}・${silkChip(o)} ${esc(o.name)}</div>
      <div class="row" style="margin:6px 0"><span class="big">${f.pop}<small>番人気</small></span><span class="muted">単勝 ${f.odds}倍</span></div>
      <div class="kv"><span>脚質</span><b>${STYLE[h.style]}</b></div>
      <div class="kv"><span>得意距離・馬場</span><b>${h.dist}m前後・${SURF[h.surf]}</b></div>
      <div class="kv"><span>スピード</span><b style="color:var(--gold)">${stars(ab.spd)}</b></div>
      <div class="kv"><span>スタミナ</span><b style="color:var(--gold)">${stars(ab.sta)}</b></div>
      <div class="kv"><span>瞬発力</span><b style="color:var(--gold)">${stars(ab.kick)}</b></div>
      <div class="kv"><span>気性 ${tip('激しい馬は前に馬がいないとかかりやすい。馬の後ろに入れて落ち着かせる。')}</span><b>${h.tmp > 65 ? '激しい' : h.tmp > 40 ? 'ふつう' : '素直'}</b></div>
      <div class="kv"><span>本作での戦績</span><b>${h.starts}戦${h.wins}勝${h.g1.length ? '・GⅠ' + h.g1.length + '勝' : ''}</b></div>${src}</div>
      <div class="card"><div class="small muted">調教師の指示</div><div style="font-family:var(--serif)">「${ORDERS[h.style]}乗ってほしい」</div></div>
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-ride">ジョッキーカメラで騎乗</button>
      <button class="btn" style="width:100%;margin-top:6px" id="b-auto">オート騎乗（結果のみ）</button>`;
    let tb = `<table><tr><th>枠</th><th>番</th><th>馬名</th><th>性齢</th><th>騎手</th><th>斤量</th><th>人気</th><th>単勝</th></tr>`;
    race.field.forEach((x, i) => {
      const hh = W.horses[x.hid];
      const jn = x.hid === hid ? P().name : x.jid >= 0 ? W.jockeys[x.jid].name : x.jname;
      tb += `<tr class="${x.hid === hid ? 'me' : ''}"><td>${waku(x.waku)}</td><td>${i + 1}</td><td>${esc(hh.name)}${realTag(hh)}</td><td>${sexAge(hh)}</td><td>${esc(jn)}</td><td>${World.kinryo(W, race, hh, x.hid === hid)}</td><td>${x.pop}</td><td>${x.odds}</td></tr>`;
    });
    $('pad-right').innerHTML = tb + '</table>';
    $('b-ride').onclick = () => startRace(race, hid);
    $('b-auto').onclick = () => {
      const r = World.setupRace(W, race, hid, 'auto');
      const res = r.runToEnd();
      race.laps = r.laps(); race.my3F = null;
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
  function startRace(race, hid, opt = {}) {
    curRace = race; curHid = hid; introStage = '';
    Sound.init();
    $('tut').style.display = 'none';
    engine = World.setupRace(W, race, hid, 'manual');
    engine.onEvent = (t) => { if (t === 'gate') { Sound.gate(); Sound.cheer(0.6); } else if (t === 'whip') Sound.whip(); else if (t === 'bump' || t === 'foul') Sound.bump(); else if (t === 'finish') Sound.cheer(1.4); };
    window.__cheered = false;
    show('race');
    if (!glbDone) { HorseGLB.load().then(() => { glbDone = true; R3.setupRace(engine, { label: race.graded || race.overseas ? race.name : '' }); R3.setCamMode(camMode); }); }
    if (!R3) { R3 = new Render3D($('r3d')); window.__R3 = R3; R3.onHoof = () => Sound.hoof(engine.surf); window.addEventListener('resize', () => R3 && R3.resize()); }
    R3.setupRace(engine, { label: race.graded || race.overseas ? race.name : '' });
    R3.setCamMode(camMode); updateCamBtn();
    $('b-snd').textContent = Sound.isMuted() ? '音OFF' : '音ON';
    const L = engine.course.dir === 'L';
    $('lbl-l').textContent = L ? '内へ' : '外へ'; $('lbl-r').textContent = L ? '外へ' : '内へ';
    engine.input.steer = 0; setPower(0.42);
    $('startBtn').style.display = '';
    $('loading').style.display = 'flex';
    paused = false; endAt = 0; acc = 0;
    cancelAnimationFrame(rafId);
    const waitStart = performance.now();
    const wait = () => {
      // 素材の読み込みが遅くても、12秒たったら始める（読み込めた分だけで描く）
      const ready = (Render3D.loaded >= Render3D.toLoad && glbDone) || performance.now() - waitStart > 12000;
      if (!ready) { $('loading').textContent = `コースを準備中…（${Render3D.loaded}/${Render3D.toLoad}）`; rafId = requestAnimationFrame(wait); return; }
      $('loading').style.display = 'none';
      R3.resize();
      if (!opt.noIntro) { R3.startIntro(); $('race').classList.add('intro'); } else $('race').classList.remove('intro');
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
    // 出走前の演出（コース紹介 → 枠入り → ゲートの中）。この間レースの時計は進めない
    if (R3.intro) {
      const I = R3.intro;
      if (I.stage !== introStage) { introStage = I.stage; introCard(I.stage); if (I.stage === 'load') Sound.fanfare(); }
      R3.render(engine, rdt);
      Sound.update(0, 0, 0.16);
      if (I.done) endIntro();
      rafId = requestAnimationFrame(loop);
      return;
    }
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
    if (!window.__cheered && engine.open && engine.D - Pl.s < 300) { window.__cheered = true; Sound.cheer(1); }
    const crowd = engine.open ? (Pl.s > engine.D - engine.course.H ? 0.4 + 0.6 * Math.min(1, (Pl.s - (engine.D - engine.course.H)) / engine.course.H) : 0.12) : 0.2;
    Sound.update(paused ? 0 : Pl.v, paused ? 0 : nearby, paused ? 0.05 : crowd);
    if (engine.done) {
      if (!endAt) endAt = now;
      if (now - endAt > 1500) { Sound.stopAll(); return finishRace(); }
    }
    rafId = requestAnimationFrame(loop);
  }
  let introStage = '';
  function introCard(stage) {
    const e = engine, race = curRace, Pl = e.player, card = $('intro-card');
    const f = race.field.find(x => x.hid === curHid) || {};
    const g = race.graded ? `G${'ⅠⅡⅢ'[race.graded - 1]}　` : race.overseas ? '海外GⅠ　' : '';
    let html;
    if (stage === 'fly') html = `<div class="k">${esc(VENUES[race.venue].name)}競馬場${race.overseas ? '' : `　第${race.no}競走`}</div><h2>${g}${esc(race.name)}</h2><div class="d">${raceCond(race)}・${e.course.dir === 'L' ? '左' : '右'}回り・${e.runners.length}頭</div>`;
    else if (stage === 'load') html = `<div class="k">枠入り</div><h2>${waku(f.waku || 1)} ${Pl.num}番 ${esc(Pl.horse.name)}</h2><div class="d">${f.pop || '-'}番人気・単勝${f.odds || '-'}倍・騎手 ${esc(P().name)}</div>`;
    else html = `<div class="k">まもなく発走</div><h2>ゲートが開いたら「スタート」</h2>`;
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    card.innerHTML = html;
  }
  function endIntro() { if (R3) R3.endIntro(); $('race').classList.remove('intro'); introStage = ''; lastT = performance.now(); }
  $('intro-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); endIntro(); });
  function updateHud(dt) {
    const e = engine, Pl = e.player;
    const rem = Math.max(0, e.D - Pl.s);
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      const t = e.open ? (Pl.finished ? Pl.finishTime : e.t - e.gateOpenAt) : 0;
      const pace = e.pace();
      $('hud-info').innerHTML = `<b>${esc(e.cfg.name)}</b><br>残り ${Math.ceil(rem)}m・${RaceEngine.sectionName(e.course, e.pAt(Pl.s))}<br>${Pl.rank || '-'}番手/${e.runners.length}頭　${RaceEngine.fmtTime(t)}${pace ? `<br>ペース: ${pace}` : ''}<br>内ラチから ${Pl.X.toFixed(1)}m`;
      // 時速とラップ（先頭の1ハロンごと）
      $('spd-v').textContent = String(Math.round(Pl.v * 3.6));
      const lp = e.laps().slice(-4);
      $('laps').innerHTML = lp.length ? 'ラップ ' + lp.map((x, i) => i === lp.length - 1 ? `<b>${x.toFixed(1)}</b>` : x.toFixed(1)).join(' - ') : 'ラップ —';
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
    if (rem < sustain + 30 && P.drive < 0.5) return { t: '仕掛けどき！ 手綱を上まで上げて追う', go: true };
    if (P.drive > 0.5) return { t: rem < 300 ? '追って！ ムチでもうひと伸び' : '追っている：このまま', go: rem < 300 };
    const n = e.runners.length, fr = (P.rank - 1) / Math.max(1, n - 1), ord = ORDER_RANGE[P.horse.style];
    if (fr < ord[0] - 0.05 && e.input.power > 0.3) return { t: '指示より前すぎる：手綱を下げて抑える' };
    if (fr > ord[1] + 0.1 && e.input.power < 0.55) return { t: '指示より後ろ：手綱を少し上げる' };
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
    curRace.laps = engine.laps();
    const me = res.find(x => x.runner === engine.player);
    curRace.my3F = engine.player3F ? me.time - engine.player3F : null;
    const ev = World.applyResult(W, curRace, res, curHid, mode, engine.inquiry);
    if (!quick) logRide(curRace, curHid, ev, mode);
    showResult(curRace, curHid, ev);
  }

  // ---- 操作 ----
  // 左：◀▶（押している間だけ進路を変える）
  function setSteer(v) { if (engine) engine.input.steer = v; }
  // 右：手綱の加減（縦のスライダー。離してもその位置のまま）
  function setPower(v) {
    v = clamp(v, 0, 1);
    if (engine) engine.input.power = v;
    const pc = (v * 100).toFixed(1) + '%';
    $('thr-fill').style.clipPath = `inset(${(100 - v * 100).toFixed(1)}% 0 0 0)`; $('thr-knob').style.bottom = pc; $('thr-v').textContent = String(Math.round(v * 100));
    $('thr-knob').style.background = v >= 0.65 ? 'var(--red)' : v >= 0.38 ? 'var(--green)' : 'var(--blue)';
  }
  function holdBtn(el, on, off) {
    let id = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (_) {} el.classList.add('act'); on(e); });
    const end = (e) => { if (e.pointerId === id) { id = null; el.classList.remove('act'); off(e); } };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
    return () => id;
  }
  holdBtn($('c-left'), () => setSteer(-1), () => setSteer(0));
  holdBtn($('c-right'), () => setSteer(1), () => setSteer(0));
  (function bindThrottle() {
    const tr = $('thr-track'); let id = null;
    const at = (e) => {
      const r = tr.getBoundingClientRect();
      let v;
      if (!document.documentElement.classList.contains('rot')) v = 1 - (e.clientY - r.top) / r.height;
      else { v = (e.clientX - r.left) / r.width; if (rotDir === 'ccw') v = 1 - v; }
      // 端まで指を運ばなくても 0 と 100 に届くよう、少し余裕を持たせる
      setPower((v - 0.06) / 0.88);
    };
    tr.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { tr.setPointerCapture(id); } catch (_) {} at(e); });
    tr.addEventListener('pointermove', (e) => { if (e.pointerId === id) at(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => tr.addEventListener(t, (e) => { if (e.pointerId === id) id = null; }));
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
      <b>手綱の加減（右の縦スライダー）</b> 指で上下に動かして、馬を走らせる強さを自分で決める。下ほど強く抑え、真ん中が馬なり、上ほど強く追う。離してもその位置のまま続く。前半は下げて脚をためるが、前に馬がいないと気の強い馬はかかる（折合ゲージ）。馬の後ろに入れると落ち着く。上げるほど脚色（スタミナ）を多く使う<br>
      <b>ムチ（右端）</b> 強く追っている間の伸びを上乗せ（10回まで）。打つ側は自動で選ばれる<br>
      <b>コーチ（画面上）</b> 緑のバーは「今から全力で追って持つ距離」。バーが残り距離に届いたら仕掛けどき<br>
      <b>キーボード</b> ←→ 進路 / ↑↓ 手綱の加減 / Space スタート・全力 / W ムチ / C 視点</div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="p-resume">再開</button><button class="btn" id="p-auto">ここからオート騎乗</button></div>`, () => {
      $('p-resume').onclick = () => { paused = false; closeModal(); lastT = performance.now(); };
      $('p-auto').onclick = () => { const Pl = engine.player; Pl.auto = true; if (Pl.reaction == null) Pl.reaction = Math.max(0, engine.t - engine.gateOpenAt) + 0.2; paused = false; closeModal(); lastT = performance.now(); };
    });
  };
  window.addEventListener('keydown', (e) => {
    if (!engine || !$('race').classList.contains('on') || paused) return;
    if (e.key === 'ArrowLeft') setSteer(-1); else if (e.key === 'ArrowRight') setSteer(1);
    else if (e.key === 'ArrowUp') setPower(engine.input.power + 0.1);
    else if (e.key === 'ArrowDown') setPower(engine.input.power - 0.1);
    else if (e.key === 'w' || e.key === 'W') autoWhip();
    else if (e.key === ' ') { if (!engine.player.started) engine.playerStart(); else setPower(1); }
    else if (e.key === 'q' || e.key === 'Q') engine.whip('L');
    else if (e.key === 'e' || e.key === 'E') engine.whip('R');
    else if (e.key === 'c' || e.key === 'C') $('b-cam').click();
    else if (e.key === 'Escape') $('pauseBtn').click();
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (!engine) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setSteer(0); });

  // ---------- 結果 ----------
  function showResult(race, hid, ev) {
    show('s-result');
    gnav('res-nav');
    crumbs('res-crumbs', quick ? [['タイトル', () => { quick = false; W = null; show('s-title'); }], ['お試し騎乗の結果', null]] : [['今週', () => showWeek()], [`${VENUES[race.venue].name} 開催日`, null], [`${race.overseas ? '' : race.no + 'R '}${race.name}`, null], ['結果', null]]);
    let tb = `<table><tr><th>着</th><th>枠</th><th>馬名</th><th>騎手</th><th>タイム</th><th>着差</th><th>人気</th></tr>`;
    race.result.forEach(r => {
      const h = W.horses[r.hid]; const f = race.field.find(x => x.hid === r.hid);
      tb += `<tr class="${r.isP ? 'me' : ''}"><td><b>${r.pos}</b>${r.demoted ? ' <span class="badge warn">降着</span>' : ''}</td><td>${waku(f.waku)}</td><td>${esc(h.name)}${realTag(h)}</td><td>${esc(r.jname || '')}</td><td>${RaceEngine.fmtTime(r.time)}</td><td>${r.margin}</td><td>${r.pop}</td></tr>`;
    });
    const laps = race.laps || [];
    const lapHtml = laps.length ? `<div style="padding:8px 10px;border-top:1px solid var(--rule)"><div class="small muted">ラップ（先頭の馬の200mごとの通過から算出）</div><div class="tnum" style="font-size:12.5px;line-height:1.7">${laps.map(x => x.toFixed(1)).join(' - ')}</div>
      <div class="small muted">前半${laps.length >= 3 ? laps.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(1) : '-'}　後半${laps.length >= 3 ? laps.slice(-3).reduce((a, b) => a + b, 0).toFixed(1) : '-'}${race.my3F ? `　あなたの上がり3F ${race.my3F.toFixed(1)}` : ''}</div></div>` : '';
    $('res-table').innerHTML = tb + '</table>' + lapHtml;
    const comment = ev.pos === 1 ? (race.graded === 1 || race.overseas ? '大舞台で見事な勝利!' : '勝利!') : ev.pos <= 3 ? '馬券圏内を確保。' : ev.pos <= ev.pop ? '人気以上の着順。' : '期待には届かなかった。';
    let inq = '';
    if (ev.inquiry) {
      const q = ev.inquiry;
      inq = `<div class="card" style="margin-top:8px;border-color:var(--red)"><div class="small" style="color:var(--red)">審議</div><b>${q.demoteTo ? `斜行で${q.demoteTo}着に降着` : '斜行・接触あり'}</b><div class="small">${q.weeks ? `${q.weeks}週間の騎乗停止` : '過怠金'}</div></div>`;
    }
    $('res-side').innerHTML = `${inq}<div class="card" style="margin-top:8px;text-align:center"><div class="small muted">騎乗評価</div><div class="eval">${ev.grade}</div>
      <div style="margin-top:2px;font-family:var(--serif)"><b style="font-size:18px">${ev.pos}着</b>（${ev.pop}番人気）</div><div class="small muted">${comment}</div></div>
      <div class="card"><div class="kv"><span>評価</span><b>${ev.dRep >= 0 ? '+' : ''}${ev.dRep}</b></div><div class="kv"><span>人気</span><b>${ev.dPop >= 0 ? '+' : ''}${ev.dPop}</b></div><div class="kv"><span>収入</span><b>${ev.income}万円</b></div></div>
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-resnext">${quick ? 'タイトルへ' : '次へ'}</button>`;
    $('b-resnext').onclick = () => {
      if (quick) { quick = false; W = null; refreshTitle(); show('s-title'); if (tutDone) { tutDone = false; modal(`<h2>チュートリアル完了</h2><p>基本の操作はこれで全部。あとは実戦で仕掛けどころを覚えていこう。操作の説明はレース中の「停止」からいつでも見られる。</p><div class="choices"><button class="btn primary" id="m-ok">OK</button></div>`, () => { $('m-ok').onclick = closeModal; }, 'チュートリアル'); } return; }
      W.dayIdx++; World.save(W); showDay();
    };
    if (ev.interview && !quick) showInterview(ev.interview, hid, () => playScenes());
    else if (!quick) playScenes();
  }
  function showInterview(iv, hid, after) {
    const def = World.INTERVIEW[iv.kind];
    const h = W.horses[hid];
    modal(`<h2 style="margin:0 0 8px">「${esc(def.q)}」</h2>
      <div class="choices">${def.a.map((a, i) => `<button class="btn" data-a="${i}">${esc(a[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { World.answerInterview(W, iv, +b.dataset.a, h ? h.trainer : null, h ? h.owner : null); Progress.addFans(W, 'women', 30); closeModal(); World.save(W); if (after) after(); });
    }, `勝利騎手インタビュー${iv.race ? '　' + iv.race : ''}`);
  }

  // ---------- 週の終わり ----------
  function showWeekEnd() {
    show('s-info');
    gnav('info-nav');
    const wins = W.weekLog.filter(l => l.pos === 1).length;
    const inc = W.weekLog.reduce((a, l) => a + (l.income || 0), 0);
    let t = `<div class="cols" style="padding-top:0"><div class="card" style="padding:0"><table><tr><th>R</th><th>レース</th><th>騎乗馬</th><th>着順</th><th>人気</th><th>評価</th><th></th></tr>`;
    W.weekLog.forEach(l => t += `<tr><td>${l.no}</td><td>${esc(l.name)}</td><td>${esc(l.horse)}</td><td><b>${l.pos}着</b></td><td>${l.pop}</td><td>${l.grade}</td><td class="muted small">${l.mode === 'auto' ? 'オート' : ''}</td></tr>`);
    if (!W.weekLog.length) t += `<tr><td colspan="7" class="muted">騎乗なし</td></tr>`;
    t += `</table></div><div><div class="card"><div class="sec"><h3>今週の成績</h3></div><div class="row wrap" style="gap:18px"><div><div class="small muted">騎乗</div><div class="big">${W.weekLog.length}</div></div><div><div class="small muted">勝利</div><div class="big">${wins}</div></div><div><div class="small muted">収入</div><div class="big">${Math.round(inc * 10) / 10}<small>万円</small></div></div></div></div>
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-next">次の週へ</button></div></div>`;
    $('info-body').innerHTML = t;
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
    gnav('info-nav');
    const ys = ye.ys, g = ye.goal, v = ye.vote;
    $('info-body').innerHTML = `<div style="text-align:center;margin-bottom:6px"><div class="small muted" style="letter-spacing:.3em">SEASON REVIEW</div><h1 style="font-size:24px">${ye.year}年 シーズン総括</h1></div>
      <div class="cols" style="grid-template-columns:1fr 1fr 1fr;padding-top:0">
      <div class="card"><div class="sec"><h3>成績</h3></div>
        <div class="big">${ys.wins}<small>勝 / ${ys.rides}騎乗</small></div>
        <div class="kv"><span>勝率</span><b>${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}%</b></div>
        <div class="kv"><span>リーディング</span><b>${ye.rank}位</b></div>
        <div class="kv"><span>重賞</span><b>${ys.g.length}勝</b></div>
        <div class="kv"><span>収入</span><b>${money(ys.income || 0)}</b></div>
        ${ye.awards.length ? `<div style="margin-top:6px">${ye.awards.map(a => `<span class="badge gold">${esc(a)}</span>`).join(' ')}</div>` : ''}</div>
      <div class="card"><div class="sec"><h3>シーズン目標</h3></div>${g ? `<div style="font-family:var(--serif);font-weight:700">${esc(g.name)}</div><div class="big">${g.cur}<small> / ${g.target}</small></div><div class="bar gold"><i style="width:${g.rate * 100}%"></i></div><div style="margin-top:6px">${g.ok ? `<span class="badge green">達成</span> <span class="small">${esc(g.reward)}</span>` : '<span class="badge warn">未達成</span> <span class="small">評価 -1</span>'}</div>` : '<p class="small muted">目標なし</p>'}</div>
      <div class="card" style="padding:0"><div class="sec" style="margin:8px 10px 4px"><h3>騎手人気投票</h3><span class="sub">あなたは${v ? v.rank : '-'}位</span></div><table>${v ? v.top.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td></tr>`).join('') : ''}</table></div>
      </div>
      <div style="text-align:center;margin-top:8px"><button class="btn primary" style="padding:11px 30px" id="b-ny">${ye.year + 1}年へ</button></div>`;
    $('b-ny').onclick = showWeek;
  }
  function showRetire() {
    show('s-info');
    gnav('info-nav');
    const p = P();
    $('info-body').innerHTML = `<div class="card" style="max-width:720px;margin:0 auto"><div class="sec"><h3>引退 — ${esc(p.name)}</h3><span class="sub">${esc(Progress.title(W))}</span></div>
      <div class="kv"><span>通算</span><b>${p.wins}勝 / ${p.rides}騎乗</b></div>
      <div class="kv"><span>重賞</span><b>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</b></div>
      <div class="kv"><span>ファン</span><b>${p.fans.toLocaleString()}人</b></div>
      <div class="kv"><span>実績</span><b>${Object.keys(p.ach).length} / ${Progress.ACH.length}</b></div>
      ${p.g1Wins.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      <ul class="log" style="padding-left:16px">${W.log.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>
      <button class="btn primary" id="b-end">タイトルへ</button></div>`;
    $('b-end').onclick = () => { World.deleteSave(); refreshTitle(); W = null; show('s-title'); };
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
    { text: '右の<b>手綱スライダー</b>を指で<b>下</b>へ動かし、「抑える」まで下げる。前半は脚（スタミナ）をためるのが基本。指を離してもその位置のまま続く。', hl: ['thr'], speed: 0.6, until: () => engine.input.power < 0.3, hold: 1.2 },
    { text: '前に馬がいないと、抑えた馬は<b>かかる</b>（折合ゲージが減る）。左下の<b>◀ ▶</b>を押して、前の馬の<b>真後ろ</b>に入れよう。', hl: ['c-left', 'c-right', 'hud-gauges'], speed: 0.7, until: () => engine.player.covered, hold: 2, timeout: 14 },
    { text: 'いい位置。画面上の<b>コーチ</b>が仕掛けどきを教えてくれる。緑のバーは「全力で走りきれる距離」。それまで我慢。<br>（早送り中）', hl: ['coach'], speed: 3, until: () => engine.D - engine.player.s < 650 },
    { text: '仕掛けどき。<b>手綱スライダーを一番上</b>まで上げる。上げるほど強く追って加速する。途中で止めれば、その強さで走る。', hl: ['thr', 'coach'], speed: 0.6, until: () => engine.player.drive > 0.8 },
    { text: '追いながら右端の<b>「ムチ」</b>をタップ。もうひと伸びする（10回まで）。', hl: ['c-whip'], speed: 0.6, until: () => engine.player.whips >= 1 },
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
    startRace(race, pickF.hid, { noIntro: true });
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
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  // iOS でページ自体がずれてスクロールすると、見た目とタッチ位置がずれるので止める（スクロールする枠の中は除く）
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.scroll, .ctrack, .tabs, .stats, .crumbs, .drawer, .modal')) e.preventDefault(); }, { passive: false });
  window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });
  window.__jl = { get W() { return W; }, get engine() { return engine; } };
})();
