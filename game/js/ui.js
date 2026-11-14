// ===== 画面遷移・UI =====
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let W = null, quick = false, selColor = SILKS[0];
  const STYLE = ['逃げ', '先行', '差し', '追込'];
  const SURF = { T: '芝', D: 'ダ', B: '芝・ダ' };
  const ORDERS = ['ハナを切って自分のペースで', '好位で流れに乗って', '中団で脚をためて', '後方で脚をためて直線勝負'];

  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); window.scrollTo(0, 0); }
  function gradeTag(race) {
    if (race.graded) return `<span class="pill g${race.graded}">G${'ⅠⅡⅢ'[race.graded - 1]}</span>`;
    if (race.label === race.name) return '';
    return `<span class="pill">${esc(race.label)}</span>`;
  }
  function raceCond(race) { return `${SURF[race.surf]}${race.dist}m${race.ground === '重' ? ' 重' : ''}`; }
  function horseAge(h) { return W.year - h.born; }
  function sexAge(h) { return `${h.sex}${horseAge(h)}`; }
  function realTag(h) { return h.real ? ' <span class="pill" title="実在馬（2026年JRA GⅠ出走馬）">実在</span>' : h.foreign ? ' <span class="pill">外国馬</span>' : ''; }
  function stars(v) { const n = Math.max(1, Math.min(5, Math.round((v - 40) / 12))); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function P() { return W.player; }
  // 2回押しで確定（埋め込み環境では confirm() が使えないため）
  function confirmTap(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; }, 3000);
  }

  // ---------- タイトル ----------
  function refreshTitle() { $('b-continue').disabled = !World.hasSave(); }
  refreshTitle();
  $('b-new').onclick = () => { renderSwatches(); show('s-new'); };
  $('b-continue').onclick = () => { const w = World.load(); if (w) { W = w; quick = false; showWeek(); } };
  $('b-quick').onclick = quickRace;
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
    World.save(W);
    showWeek();
  };

  // ---------- 週の画面 ----------
  function topBar(extra = '') {
    const p = P(); const ys = p.years[W.year] || { wins: 0, rides: 0 };
    const allow = World.apprenticeAllowance(p);
    return `<div><h2>${esc(W.date)}　${esc(VENUES[W.venue].name)}${W.isOverseas ? '（海外遠征）' : ''}</h2>
      <div class="muted small">${esc(p.name)}（${p.age}歳・${p.region}）${allow ? ` ▲${allow}kg減` : ''}　今年 ${ys.wins}勝 / ${ys.rides}騎乗　通算 ${p.wins}勝 / ${p.rides}騎乗</div></div>
      <div class="grow"></div>
      <div style="width:110px;flex:none"><div class="small muted">評価 ${Math.round(p.rep)}</div><div class="bar"><i style="width:${p.rep}%"></i></div></div>${extra}`;
  }
  function showWeek() {
    if (P().retired) return showRetire();
    show('s-week');
    $('week-top').innerHTML = topBar(`<button class="btn small" id="b-career">キャリア</button><button class="btn small ghost" id="b-quit">セーブして終了</button>`);
    $('b-career').onclick = showCareer;
    $('b-quit').onclick = () => { World.save(W); refreshTitle(); show('s-title'); };
    const L = $('week-left'), R = $('week-right');
    W.action = W.action || 'train';
    if (W.injury > 0) {
      L.innerHTML = `<div class="card"><h2>負傷療養中</h2><p class="muted">復帰まであと${W.injury}週。今週は騎乗できない。</p><button class="btn primary" id="b-skip">次の週へ</button></div>`;
      $('b-skip').onclick = () => { W.card.forEach((r, i) => { if (!r.result) World.simulate(W, r, null); }); advanceWeek('rest'); };
      R.innerHTML = statsCard();
      return;
    }
    let html = '';
    if (W.isOverseas) {
      const race = W.card[0], h = W.horses[W.booked[1]];
      html += `<div class="card" style="margin-bottom:8px;border-color:var(--accent)"><div class="small muted">海外遠征</div>
        <h2>${esc(race.name)} ${gradeTag(race)}</h2><div>${esc(VENUES[race.venue].country)}・${esc(VENUES[race.venue].name)}　${raceCond(race)}</div>
        <div style="margin-top:6px">騎乗馬: <b>${esc(h.name)}</b>${realTag(h)}（${sexAge(h)}）</div></div>`;
    } else {
      html += `<div class="row" style="margin-bottom:6px"><h2>騎乗依頼</h2><span class="muted small">タップで受ける。1レース1頭まで</span></div>`;
      if (!W.requests.length) html += `<p class="muted">今週の依頼はない。</p>`;
      W.requests.forEach((q, i) => {
        const race = W.card[q.raceNo - 1], h = W.horses[q.hid], t = W.trainers[h.trainer];
        html += `<div class="req ${q.accepted ? 'on' : ''}" data-i="${i}"><div class="no">${q.raceNo}R</div>
          <div class="grow"><div><b>${esc(h.name)}</b>${realTag(h)} <span class="muted small">${sexAge(h)} ${STYLE[h.style]}</span>${q.bondHorse ? ' <span class="pill" style="border-color:var(--accent)">お手馬</span>' : ''}</div>
          <div class="small muted">${gradeTag(race)} ${esc(race.name)}　${raceCond(race)}　${esc(t.name)}</div></div>
          <div style="text-align:right"><div>${q.pop}番人気</div><div class="small muted">想定${q.odds}倍</div></div></div>`;
      });
      if (W.offers && W.offers.length) {
        W.offers.forEach((o, i) => {
          const h = W.horses[o.hid];
          html += `<div class="card" style="margin-top:10px;border-color:var(--blue)"><div class="small muted">海外遠征の騎乗依頼（${esc(o.date)}）</div>
            <div><b>${esc(o.race.name)}</b>（${esc(VENUES[o.race.v].country)}・${SURF[o.race.surf]}${o.race.dist}m）</div>
            <div class="small">騎乗馬: ${esc(h.name)}${realTag(h)}（${sexAge(h)}）</div>
            <div class="row" style="margin-top:6px"><button class="btn small primary" data-oa="${i}">受ける</button><button class="btn small" data-od="${i}">断る</button></div></div>`;
        });
      }
      if (W.pendingOverseas) html += `<div class="card" style="margin-top:10px"><span class="small muted">予定:</span> ${esc(W.pendingOverseas.date)} ${esc(W.pendingOverseas.race.name)} へ遠征</div>`;
    }
    L.innerHTML = html;
    L.querySelectorAll('.req').forEach(el => el.onclick = () => {
      const q = W.requests[+el.dataset.i];
      const on = !q.accepted;
      W.requests.forEach(o => { if (o.raceNo === q.raceNo) o.accepted = false; });
      q.accepted = on; showWeek();
    });
    L.querySelectorAll('[data-oa]').forEach(b => b.onclick = () => { const o = W.offers[+b.dataset.oa]; W.pendingOverseas = o; W.offers = []; W.log.push({ abs: W.abs, text: `${W.date} ${o.race.name}への遠征が決定（${W.horses[o.hid].name}）` }); showWeek(); });
    L.querySelectorAll('[data-od]').forEach(b => b.onclick = () => { W.offers.splice(+b.dataset.od, 1); showWeek(); });
    const acts = [['train', '調教騎乗', '厩舎の信頼が上がる'], ['study', 'レース研究', '判断力が上がる'], ['gym', 'トレーニング', '体力が上がる'], ['rest', '休養', '疲労を抜く']];
    R.innerHTML = `<div class="card" style="margin-bottom:8px"><h2 style="margin-bottom:6px">平日の過ごし方</h2><div class="opt">${acts.map(a => `<label><input type="radio" name="act" value="${a[0]}" ${W.action === a[0] ? 'checked' : ''}><span>${a[1]}</span></label>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">${acts.find(a => a[0] === W.action)[2]}</div></div>
      <button class="btn primary" style="width:100%;margin-bottom:8px" id="b-day">開催日へ（${W.isOverseas ? 1 : W.requests.filter(q => q.accepted).length}鞍）</button>${statsCard()}`;
    R.querySelectorAll('input[name=act]').forEach(r => r.onchange = () => { W.action = r.value; showWeek(); });
    $('b-day').onclick = () => {
      if (!W.isOverseas) { W.booked = {}; W.requests.filter(q => q.accepted).forEach(q => W.booked[q.raceNo] = q.hid); }
      W.dayIdx = W.dayIdx || 0; World.save(W); showDay();
    };
  }
  function statsCard() {
    const p = P();
    const s = (k, v) => `<div class="stat"><span>${k}</span><span>${Math.round(v)}</span></div><div class="bar"><i style="width:${v}%"></i></div>`;
    return `<div class="card"><h2 style="margin-bottom:4px">騎手能力</h2>${s('騎乗技術', p.tech)}${s('判断力', p.judge)}${s('体力', p.phys)}
      <div class="stat"><span>疲労</span><span>${Math.round(p.fatigue)}</span></div>
      <div class="stat"><span>重賞勝利</span><span>${p.gWins.length}（GⅠ ${p.g1Wins.length}）</span></div></div>`;
  }

  // ---------- 開催日 ----------
  function showDay() {
    show('s-day');
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
        res = me ? `<b style="color:${me.pos === 1 ? 'var(--accent)' : 'inherit'}">${me.pos}着</b>（${me.pop}人気）` : `<span class="muted small">1着 ${esc(wh ? wh.name : '')}</span>`;
      }
      t += `<tr class="${i === W.dayIdx ? 'cur' : ''}"><td>${race.no}</td><td>${gradeTag(race)} ${esc(race.name)}</td><td>${raceCond(race)}</td><td>${h ? '<b>' + esc(h.name) + '</b>' : '<span class="muted">—</span>'}</td><td>${res}</td></tr>`;
    });
    $('day-table').innerHTML = t + '</table>';
    const S = $('day-side');
    if (W.dayIdx >= W.card.length) {
      S.innerHTML = `<div class="card"><h2>本日の全レース終了</h2><p class="muted small">お疲れさまでした。</p><button class="btn primary" id="b-wend">今週の結果へ</button></div>`;
      $('b-wend').onclick = showWeekEnd; return;
    }
    const race = W.card[W.dayIdx];
    const hid = W.booked[race.no];
    let html = `<div class="card" style="margin-bottom:8px"><div class="small muted">次のレース</div><h2>${race.no}R ${esc(race.name)} ${gradeTag(race)}</h2><div>${raceCond(race)}・${race.field.length}頭</div>`;
    if (hid) {
      const h = W.horses[hid];
      html += `<div style="margin-top:6px">騎乗馬: <b>${esc(h.name)}</b>${realTag(h)}</div></div>
        <button class="btn primary" style="width:100%;margin-bottom:6px" id="b-pad">パドックへ</button>`;
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
      $('b-skipn').onclick = () => {
        while (W.dayIdx < W.card.length && !W.booked[W.card[W.dayIdx].no]) { World.simulate(W, W.card[W.dayIdx], null); W.dayIdx++; }
        World.save(W); showDay();
      };
    }
    $('b-allauto').onclick = () => {
      while (W.dayIdx < W.card.length) {
        const r = W.card[W.dayIdx]; const hh = W.booked[r.no] || null;
        const ev = World.simulate(W, r, hh, 'auto');
        if (ev) logRide(r, hh, ev, 'auto');
        W.dayIdx++;
      }
      World.save(W); showDay();
    };
  }
  function logRide(race, hid, ev, mode) {
    W.weekLog.push({ no: race.no, name: race.name, graded: race.graded, horse: W.horses[hid].name, pos: ev.pos, pop: ev.pop, grade: ev.grade, mode });
  }

  // ---------- パドック ----------
  function showPaddock(race) {
    show('s-paddock');
    const hid = W.booked[race.no];
    const h = W.horses[hid];
    World.setupRace(W, race, hid, 'manual'); // 枠順・騎手を確定
    const f = race.field.find(x => x.hid === hid);
    const ab = World.ability(h, W.year);
    $('pad-top').innerHTML = `<h2>${race.no}R ${esc(race.name)} ${gradeTag(race)}</h2><span class="muted">${esc(VENUES[race.venue].name)} ${raceCond(race)}（${VENUES[race.venue].dir === 'L' ? '左回り' : '右回り'}）</span><div class="grow"></div>
      <button class="btn small ghost" id="b-padback">戻る</button>`;
    $('b-padback').onclick = showDay;
    const t = W.trainers[h.trainer];
    let src = '';
    if (h.real) src = `<div class="small muted" style="margin-top:6px">2026年GⅠ: ${h.runs2026.map(r => `${esc(r[0])} ${r[1]}着`).join(' / ')}<br>出典: ${h.src.map(u => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--blue)">JRA</a>`).join(' ')}</div>`;
    $('pad-left').innerHTML = `<div class="card" style="margin-bottom:8px">
      <div class="row"><div class="swatch on" style="background:${P().color};width:22px;height:22px"></div><h2>${f.waku}枠${race.field.indexOf(f) + 1}番 ${esc(h.name)}</h2>${realTag(h)}</div>
      <div class="small muted">${sexAge(h)}　${esc(t.name)}　${f.pop}番人気（${f.odds}倍）</div>
      <div class="stat"><span>脚質</span><span>${STYLE[h.style]}</span></div>
      <div class="stat"><span>得意距離</span><span>${h.dist}m前後</span></div>
      <div class="stat"><span>馬場</span><span>${SURF[h.surf]}</span></div>
      <div class="stat"><span>スピード</span><span>${stars(ab.spd)}</span></div>
      <div class="stat"><span>スタミナ</span><span>${stars(ab.sta)}</span></div>
      <div class="stat"><span>瞬発力</span><span>${stars(ab.kick)}</span></div>
      <div class="stat"><span>気性</span><span>${h.tmp > 65 ? '激しい（かかりやすい）' : h.tmp > 40 ? 'ふつう' : '素直'}</span></div>
      <div class="stat"><span>本作での戦績</span><span>${h.starts}戦${h.wins}勝${h.g1.length ? ' GⅠ' + h.g1.length + '勝' : ''}</span></div>${src}</div>
      <div class="card" style="margin-bottom:8px"><div class="small muted">調教師の指示</div><div>「${ORDERS[h.style]}乗ってほしい」</div></div>
      <button class="btn primary" style="width:100%;margin-bottom:6px" id="b-ride">ジョッキーカメラで騎乗</button>
      <button class="btn" style="width:100%" id="b-auto">オート騎乗（結果のみ）</button>`;
    let tb = `<table><tr><th>枠</th><th>番</th><th>馬名</th><th>性齢</th><th>騎手</th><th>人気</th><th>オッズ</th></tr>`;
    race.field.forEach((x, i) => {
      const hh = W.horses[x.hid];
      const jn = x.hid === hid ? P().name : x.jid >= 0 ? W.jockeys[x.jid].name : x.jname;
      tb += `<tr class="${x.hid === hid ? 'me' : ''}"><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${WAKU_COLORS[x.waku - 1]};border:1px solid #555"></span></td><td>${i + 1}</td><td>${esc(hh.name)}${realTag(hh)}</td><td>${sexAge(hh)}</td><td>${esc(jn)}</td><td>${x.pop}</td><td>${x.odds}</td></tr>`;
    });
    $('pad-right').innerHTML = tb + '</table>';
    $('b-ride').onclick = () => startRace(race, hid);
    $('b-auto').onclick = () => {
      const r = World.setupRace(W, race, hid, 'auto');
      const res = r.runToEnd();
      const ev = World.applyResult(W, race, res, hid, 'auto');
      logRide(race, hid, ev, 'auto');
      showResult(race, hid, ev);
    };
  }

  // ---------- レース ----------
  let engine = null, renderer = null, rafId = 0, lastT = 0, acc = 0, paused = false, endAt = 0, curRace = null, curHid = null;
  function startRace(race, hid) {
    curRace = race; curHid = hid;
    engine = World.setupRace(W, race, hid, 'manual');
    if (!renderer) renderer = new RaceEngine.Renderer($('cv'));
    show('race');
    const L = engine.course.dir === 'L';
    $('c-left-l').textContent = L ? '内' : '外';
    $('c-right-l').textContent = L ? '外' : '内';
    $('startBtn').style.display = '';
    paused = false; $('pause').classList.remove('on');
    endAt = 0; acc = 0; lastT = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function loop(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const Pl = engine.player;
    if (!paused) {
      const speed = Pl.finished ? 5 : !Pl.started ? 1 : 1.5; // 発馬までは実時間、レース中は1.5倍速
      acc += dt * speed;
      let n = 0;
      while (acc >= 1 / 60 && n++ < 400) { engine.step(1 / 60); acc -= 1 / 60; }
      if (Pl.started || Pl.auto) $('startBtn').style.display = 'none';
    }
    renderer.draw(engine);
    $('c-whip-n').textContent = String(12 - Pl.whips);
    if (engine.done) {
      if (!endAt) endAt = now;
      if (now - endAt > 900) return finishRace();
    }
    rafId = requestAnimationFrame(loop);
  }
  function finishRace() {
    const res = engine.results();
    const mode = engine.player.auto ? 'auto' : 'manual';
    const ev = World.applyResult(W, curRace, res, curHid, mode);
    if (!quick) logRide(curRace, curHid, ev, mode);
    showResult(curRace, curHid, ev);
  }
  // 操作
  function bindHold(id, key) {
    const el = $(id);
    const on = (e) => { e.preventDefault(); if (engine) engine.input[key] = true; el.classList.add('act'); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = (e) => { if (engine) engine.input[key] = false; el.classList.remove('act'); };
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => el.addEventListener(ev, off));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindHold('c-left', 'left'); bindHold('c-right', 'right'); bindHold('c-hold', 'hold'); bindHold('c-push', 'push');
  $('c-whip').addEventListener('pointerdown', (e) => { e.preventDefault(); if (engine) { engine.whip(); $('c-whip').classList.add('act'); setTimeout(() => $('c-whip').classList.remove('act'), 150); } });
  $('startBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (engine) engine.playerStart(); });
  $('pauseBtn').onclick = () => { paused = true; $('pause').classList.add('on'); };
  $('p-resume').onclick = () => { paused = false; $('pause').classList.remove('on'); lastT = performance.now(); };
  $('p-auto').onclick = () => {
    const Pl = engine.player; Pl.auto = true;
    if (Pl.reaction == null) Pl.reaction = Math.max(0, engine.t - engine.gateOpenAt) + 0.2;
    paused = false; $('pause').classList.remove('on'); lastT = performance.now();
  };
  const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', z: 'hold', Z: 'hold', x: 'push', X: 'push' };
  window.addEventListener('keydown', (e) => {
    if (!engine || !$('race').classList.contains('on')) return;
    if (keyMap[e.key]) { engine.input[keyMap[e.key]] = true; e.preventDefault(); }
    if (e.key === ' ') { e.preventDefault(); if (!engine.player.started) engine.playerStart(); else engine.whip(); }
    if (e.key === 'Escape') $('pauseBtn').click();
  });
  window.addEventListener('keyup', (e) => { if (engine && keyMap[e.key]) engine.input[keyMap[e.key]] = false; });

  // ---------- 結果 ----------
  function showResult(race, hid, ev) {
    show('s-result');
    $('res-top').innerHTML = `<h2>${race.no}R ${esc(race.name)} ${gradeTag(race)} 結果</h2><span class="muted">${esc(VENUES[race.venue].name)} ${raceCond(race)}</span>`;
    let tb = `<table><tr><th>着</th><th>枠</th><th>馬名</th><th>騎手</th><th>タイム</th><th>着差</th><th>人気</th></tr>`;
    race.result.forEach(r => {
      const h = W.horses[r.hid]; const f = race.field.find(x => x.hid === r.hid);
      tb += `<tr class="${r.isP ? 'me' : ''}"><td>${r.pos}</td><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${WAKU_COLORS[f.waku - 1]};border:1px solid #555"></span></td><td>${esc(h.name)}${realTag(h)}</td><td>${esc(r.jname || '')}</td><td>${RaceEngine.fmtTime(r.time)}</td><td>${r.margin}</td><td>${r.pop}</td></tr>`;
    });
    $('res-table').innerHTML = tb + '</table>';
    const comment = ev.pos === 1 ? (race.graded === 1 || race.overseas ? '大舞台で見事な勝利!' : '勝利!') : ev.pos <= 3 ? '馬券圏内を確保。' : ev.pos <= ev.pop ? '人気以上の着順。' : '期待には届かなかった。';
    $('res-side').innerHTML = `<div class="card" style="margin-bottom:8px;text-align:center"><div class="small muted">騎乗評価</div><div class="eval">${ev.grade}</div>
      <div style="margin-top:4px"><b>${ev.pos}着</b>（${ev.pop}番人気）</div><div class="small muted">${comment}</div>
      <div class="small" style="margin-top:6px">評価 ${ev.dRep >= 0 ? '+' : ''}${ev.dRep}</div></div>
      <button class="btn primary" style="width:100%" id="b-resnext">${quick ? 'タイトルへ' : '次へ'}</button>`;
    $('b-resnext').onclick = () => {
      if (quick) { quick = false; W = null; refreshTitle(); show('s-title'); return; }
      W.dayIdx++; World.save(W); showDay();
    };
  }

  // ---------- 週の終わり ----------
  function showWeekEnd() {
    show('s-info');
    const wins = W.weekLog.filter(l => l.pos === 1).length;
    $('info-top').innerHTML = `<h2>今週の成績</h2><span class="muted">${esc(W.date)}　${W.weekLog.length}騎乗 ${wins}勝</span><div class="grow"></div><button class="btn primary" id="b-next">次の週へ</button>`;
    let t = `<div class="card" style="padding:0;max-width:760px"><table><tr><th>R</th><th>レース</th><th>騎乗馬</th><th>着順</th><th>人気</th><th>評価</th><th></th></tr>`;
    W.weekLog.forEach(l => t += `<tr><td>${l.no}</td><td>${esc(l.name)}</td><td>${esc(l.horse)}</td><td><b>${l.pos}着</b></td><td>${l.pop}</td><td>${l.grade}</td><td class="muted small">${l.mode === 'auto' ? 'オート' : ''}</td></tr>`);
    if (!W.weekLog.length) t += `<tr><td colspan="7" class="muted">騎乗なし</td></tr>`;
    $('info-body').innerHTML = t + '</table></div>';
    $('b-next').onclick = () => advanceWeek(W.action);
  }
  function advanceWeek(action) {
    const ye = World.endWeek(W, action);
    World.save(W);
    if (ye) showYearEnd(ye); else showWeek();
  }
  function showYearEnd(ye) {
    show('s-info');
    $('info-top').innerHTML = `<h2>${ye.year}年 シーズン終了</h2><div class="grow"></div><button class="btn primary" id="b-ny">${ye.year + 1}年へ</button>`;
    const ys = ye.ys;
    let t = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="card"><h2>あなたの成績</h2>
      <div class="stat"><span>勝利</span><span>${ys.wins}勝（2着${ys.seconds} 3着${ys.thirds}）</span></div>
      <div class="stat"><span>騎乗</span><span>${ys.rides}</span></div>
      <div class="stat"><span>勝率</span><span>${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}%</span></div>
      <div class="stat"><span>リーディング</span><span>${ye.rank}位</span></div>
      <div class="stat"><span>重賞勝利</span><span>${ys.g.length}</span></div>
      ${ys.g.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      ${ye.awards.length ? `<div style="margin-top:8px;color:var(--accent)">受賞: ${ye.awards.map(esc).join('、')}</div>` : ''}</div>
      <div class="card" style="padding:0"><table><tr><th>順位</th><th>騎手</th><th>勝利</th></tr>${ye.table.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.wins}</td></tr>`).join('')}</table>
      <div class="small muted" style="padding:6px">※この画面の開催（1週1場）で集計したリーディング</div></div></div>`;
    $('info-body').innerHTML = t;
    $('b-ny').onclick = showWeek;
  }

  // ---------- キャリア ----------
  function showCareer() {
    show('s-info');
    const p = P();
    $('info-top').innerHTML = `<h2>キャリア</h2><span class="muted">${esc(p.name)}　${p.age}歳　騎手${(p.yearsActive || 0) + 1}年目</span><div class="grow"></div>
      <button class="btn small ghost" id="b-retire">引退する</button><button class="btn primary" id="b-cback">戻る</button>`;
    const years = Object.keys(p.years).sort();
    const bonds = Object.entries(p.bond).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => W.horses[id]).filter(Boolean);
    $('info-body').innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr">
      <div><div class="card" style="margin-bottom:8px"><h2>通算成績</h2>
        <div class="stat"><span>勝利</span><span>${p.wins}勝（2着${p.seconds} 3着${p.thirds}）/ ${p.rides}騎乗</span></div>
        <div class="stat"><span>勝率</span><span>${p.rides ? (p.wins / p.rides * 100).toFixed(1) : '0.0'}%</span></div>
        <div class="stat"><span>獲得賞金（騎乗馬）</span><span>${p.earn.toLocaleString()}万円</span></div>
        <div class="stat"><span>重賞</span><span>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</span></div>
        ${p.gWins.slice(-12).map(g => `<div class="small">・${esc(g)}</div>`).join('')}</div>
        <div class="card" style="padding:0;margin-bottom:8px"><table><tr><th>年</th><th>騎乗</th><th>勝利</th><th>重賞</th></tr>${years.map(y => `<tr><td>${y}</td><td>${p.years[y].rides}</td><td>${p.years[y].wins}</td><td>${p.years[y].g.length}</td></tr>`).join('')}</table></div></div>
      <div><div class="card" style="margin-bottom:8px"><h2>お手馬</h2>${bonds.length ? bonds.map(h => `<div class="stat"><span>${esc(h.name)}${realTag(h)}</span><span class="small">${h.retired ? '引退' : sexAge(h)}・${h.starts}戦${h.wins}勝・絆${Math.round(p.bond[h.id])}</span></div>`).join('') : '<p class="muted small">まだいない</p>'}</div>
        <div class="card"><h2>歩み</h2><ul class="log" style="padding-left:16px;margin:4px 0">${W.log.slice(-15).reverse().map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div></div></div>`;
    $('b-cback').onclick = showWeek;
    $('b-retire').onclick = () => confirmTap($('b-retire'), 'もう一度押すと引退', () => { p.retired = true; W.log.push({ abs: W.abs, text: `${W.date} ${p.age}歳で現役引退` }); World.save(W); showRetire(); });
  }
  function showRetire() {
    show('s-info');
    const p = P();
    $('info-top').innerHTML = `<h2>引退 — ${esc(p.name)}</h2><div class="grow"></div><button class="btn primary" id="b-end">タイトルへ</button>`;
    $('info-body').innerHTML = `<div class="card" style="max-width:720px"><p>${p.age}歳で鞭を置いた。</p>
      <div class="stat"><span>通算</span><span>${p.wins}勝 / ${p.rides}騎乗</span></div>
      <div class="stat"><span>重賞</span><span>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</span></div>
      ${p.g1Wins.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      <ul class="log" style="padding-left:16px">${W.log.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div>`;
    $('b-end').onclick = () => { World.deleteSave(); refreshTitle(); show('s-title'); };
  }

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

  // 画面の拡大縮小を抑止（iOS）
  document.addEventListener('gesturestart', e => e.preventDefault());
})();
