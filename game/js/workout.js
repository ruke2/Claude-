// ===== 追い切り（調教）のミニゲーム =====
// 朝の調教コースを、レースと同じ馬のモデルで4ハロン（800m）走る。
// ・右側を上下になぞって手綱を加減し、下のペース計の針を「緑の帯」（指示の時計）に合わせる
// ・1ハロンごとに PERFECT / GOOD / MISS の判定が出る（最後の1ハロンは点が2倍）
// ・途中で出る「合図」の輪を、重なった瞬間に押すと加点
(function () {
  const T = window.THREE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ORDERS = {
    nari: { name: '馬なり', say: '今日は軽めでいい。馬なりで、終いだけ少し伸ばしてくれ。', t4: 54.5, l1: 13.0 },
    shimai: { name: '終い重点', say: '前半は我慢させて、終いをしっかり伸ばしてくれ。', t4: 53.5, l1: 12.2 },
    ippai: { name: '一杯に追う', say: 'レースが近い。最後まで一杯に追って、負荷をかけてくれ。', t4: 51.5, l1: 11.9 },
  };
  function plan(kind, rating) {
    const o = ORDERS[kind], adj = clamp((rating - 70) * 0.035, -0.9, 0.9);
    const t4 = o.t4 - adj, l1 = Math.round((o.l1 - adj * 0.25) * 10) / 10;
    const rest = (t4 - l1) / 3, laps = [rest + 0.35, rest, rest - 0.35, l1].map(x => Math.round(x * 10) / 10);
    return { kind, name: o.name, say: o.say, t4: Math.round(laps.reduce((a, b) => a + b, 0) * 10) / 10, l1, laps };
  }
  // 点数：1ハロンごとに PERFECT 3 / GOOD 2 / MISS 0（最後は2倍）＋合図 2。満点 17
  const judgeLap = (d) => Math.abs(d) < 0.3 ? 'PERFECT' : Math.abs(d) < 0.7 ? 'GOOD' : 'MISS';
  const PTS = { PERFECT: 3, GOOD: 2, MISS: 0 };
  function gradeOf(score, laps, pl) {
    const g = score >= 14 ? 'S' : score >= 10 ? 'A' : score >= 6 ? 'B' : 'C';
    const t4 = laps.reduce((a, b) => a + b, 0);
    return { g, score, t4, l1: laps[3], fast: t4 < pl.t4 - 1.0 };
  }
  // スキップ：騎手の技術に応じた出来で済ませる（自分で乗るより少し控えめ）
  function auto(kind, rating, tech) {
    const pl = plan(kind, rating), sd = clamp(0.75 - tech / 160, 0.2, 0.7);
    const laps = pl.laps.map(x => x + (Math.random() + Math.random() - 1) * sd);
    let score = 0; laps.forEach((x, i) => { score += PTS[judgeLap(x - pl.laps[i])] * (i === 3 ? 2 : 1); });
    return Object.assign(gradeOf(Math.min(score, 13), laps, pl), { auto: true });
  }

  let S = null;
  function buildScene(o) {
    const sc = new T.Scene();
    sc.background = new T.Color('#f6d9b4'); sc.fog = new T.Fog('#f3dcc0', 60, 260);
    sc.add(new T.HemisphereLight('#fff1dc', '#9a7b58', 0.9));
    const sun = new T.DirectionalLight('#ffe2b8', 1.05); sun.position.set(-30, 26, 40); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.left = -12; c.right = 12; c.top = 10; c.bottom = -10; c.near = 1; c.far = 120; sun.shadow.bias = -0.0008;
    sc.add(sun); sc.add(sun.target);
    const cv = (w, h, f) => { const e = document.createElement('canvas'); e.width = w; e.height = h; f(e.getContext('2d')); const t = new T.CanvasTexture(e); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    // ウッドチップの馬場
    const chip = cv(256, 256, (x) => { x.fillStyle = '#a97a4e'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { x.fillStyle = ['#8f643c', '#c09465', '#7d5632', '#b58556'][i % 4]; x.save(); x.translate(Math.random() * 256, Math.random() * 256); x.rotate(Math.random() * 3); x.fillRect(-4, -1.2, 8, 2.4); x.restore(); } });
    chip.repeat.set(260, 4);
    const track = new T.Mesh(new T.PlaneGeometry(1040, 16.5), new T.MeshStandardMaterial({ map: chip, roughness: 1 })); track.rotation.x = -Math.PI / 2; track.position.set(400, 0, 2.25); track.receiveShadow = true; sc.add(track);
    const grass = new T.Mesh(new T.PlaneGeometry(1400, 500), new T.MeshStandardMaterial({ color: '#7fb565', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.set(400, -0.03, 0); sc.add(grass);
    // ラチ
    const white = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    [-6, 10.5].forEach(z => { const r = new T.Mesh(new T.BoxGeometry(1040, 0.08, 0.1), white); r.position.set(400, 1.05, z); sc.add(r); }); // 手前のラチはカメラの後ろ
    const post = new T.InstancedMesh(new T.CylinderGeometry(0.04, 0.04, 1.05, 6), white, 520), M = new T.Matrix4();
    for (let i = 0; i < 260; i++) { M.makeTranslation(-110 + i * 4, 0.52, -6); post.setMatrixAt(i * 2, M); M.makeTranslation(-110 + i * 4, 0.52, 10.5); post.setMatrixAt(i * 2 + 1, M); }
    sc.add(post);
    // ハロン棒
    for (let k = 0; k <= 4; k++) {
      const g = new T.Group(), goal = k === 4;
      const p = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 3.2, 8), new T.MeshStandardMaterial({ color: goal ? '#ff4d5e' : '#ffffff' })); p.position.y = 1.6; g.add(p);
      const tx = cv(128, 64, (x) => { x.fillStyle = goal ? '#ff4d5e' : '#272b45'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#fff'; x.font = 'bold 38px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(goal ? 'GOAL' : (4 - k) + 'F', 64, 34); });
      const s = new T.Mesh(new T.PlaneGeometry(1.5, 0.75), new T.MeshBasicMaterial({ map: tx, side: T.DoubleSide })); s.position.y = 3.3; g.add(s);
      g.position.set(k * 200, 0, -6.4); sc.add(g);
    }
    // 向こう側の木立と山
    const leaf = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: '#4f9a55', flatShading: true, roughness: 1 }), 150);
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.22, 2, 6), new T.MeshStandardMaterial({ color: '#7a5638' }), 150);
    const Q = new T.Quaternion(), V1 = new T.Vector3(), V2 = new T.Vector3();
    for (let i = 0; i < 150; i++) { const x = -100 + i * 7 + rnd(-2, 2), z = -rnd(13, 34), s = rnd(1.6, 3); M.compose(V1.set(x, 2 + s * 0.6, z), Q, V2.set(s, s * 1.15, s)); leaf.setMatrixAt(i, M); M.compose(V1.set(x, 1, z), Q, V2.set(1, 1, 1)); trunk.setMatrixAt(i, M); }
    sc.add(leaf); sc.add(trunk);
    for (let i = 0; i < 9; i++) { const h = new T.Mesh(new T.ConeGeometry(rnd(50, 90), rnd(22, 40), 6), new T.MeshBasicMaterial({ color: '#b9c4b0' })); h.position.set(-80 + i * 130, 8, -rnd(150, 210)); sc.add(h); }
    // 調教スタンド
    const st = new T.Group(); const b1 = new T.Mesh(new T.BoxGeometry(22, 5, 6), new T.MeshStandardMaterial({ color: '#eef1f7' })); b1.position.y = 2.5; st.add(b1);
    const b2 = new T.Mesh(new T.BoxGeometry(23, 0.4, 8), new T.MeshStandardMaterial({ color: '#5468d4' })); b2.position.set(0, 5.4, 0.6); st.add(b2); st.position.set(800, 0, -16); sc.add(st);
    // 馬（レースと同じモデル）
    const m = window.Horse3D.create({ coat: o.coatMat, coatKey: o.coatKey, number: 1, raceLabel: '', cloth: { kind: 'normal', num: '', horse: o.name }, silks: o.silks, socks: o.socks || [], hood: o.hood || null, isPlayer: false });
    m.root.traverse(q => { if (q.isMesh) q.castShadow = true; });
    sc.add(m.root);
    return { sc, sun, m };
  }

  // opt = { name, coatMat, coatKey, silks, socks, hood, rating, tmp, kind, dy(e,x0,y0), onDone(result|null) }
  function open(host, opt) {
    close();
    const pl = plan(opt.kind, opt.rating);
    const el = document.createElement('div'); el.id = 'workout';
    el.innerHTML = `<canvas></canvas>
      <div class="wo-top"><div class="wo-order"><small>調教師の指示</small><b>${pl.name}</b><span>4F ${pl.t4.toFixed(1)}秒</span></div>
        <div class="wo-laps">${pl.laps.map((x, i) => `<div data-i="${i}"><small>${4 - i}F ${x.toFixed(1)}</small><b>--.-</b></div>`).join('')}</div>
        <div class="wo-score"><small>SCORE</small><b id="wo-sc">0</b></div>
        <button class="hbtn" id="wo-quit">やめる</button></div>
      <div class="wo-meter"><div class="wo-scale"><i id="wo-band"></i><i id="wo-perf"></i><em id="wo-needle"></em></div><div class="wo-mt"><span>遅い</span><b id="wo-p">--.-</b><span>速い</span></div></div>
      <div class="wo-thr"><i id="wo-knob"></i><em style="top:8%">追う</em><em style="top:46%">馬なり</em><em style="top:84%">抑える</em></div>
      <button class="wo-cue" id="wo-cue"><span></span><b>合図</b></button>
      <div class="wo-pop" id="wo-pop"></div>
      <div class="wo-msg" id="wo-msg"><b>針を緑の帯に合わせる</b><br>右側を上下になぞって手綱を加減する。途中の「合図」は輪が重なった瞬間に押す。<br><span class="wo-go">画面を押してスタート</span></div>`;
    host.appendChild(el);
    const cv = el.querySelector('canvas');
    const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.outputEncoding = T.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const B = buildScene(opt);
    const cam = new T.PerspectiveCamera(38, 2, 0.1, 600);
    S = { el, cv, renderer, cam, B, pl, opt, t: 0, s: -45, v: 0, power: 0.45, laps: [], lapT: 0, run: false, done: false, raf: 0, last: 0, ph: 0, pull: 0, score: 0, cue: null, cueAt: rnd(330, 470), cueDone: false, clock: 0, w: 0, h: 0 };
    let id = null, x0 = 0, y0 = 0, p0 = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#wo-quit') || e.target.closest('#wo-cue') || e.target.closest('#wo-ok')) return;
      if (!S.run && !S.done) { S.run = true; el.querySelector('#wo-msg').style.display = 'none'; }
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; p0 = S.power;
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id || !S) return; S.power = clamp(p0 - opt.dy(e, x0, y0) / 150, 0, 1); });
    ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, (e) => { if (e.pointerId === id) id = null; }));
    el.querySelector('#wo-quit').onclick = () => { const cb = opt.onDone; close(); cb(null); };
    el.querySelector('#wo-cue').addEventListener('pointerdown', (e) => { e.stopPropagation(); hitCue(); });
    S.last = performance.now(); S.raf = requestAnimationFrame(loop);
  }
  function close() { if (!S) return; cancelAnimationFrame(S.raf); try { S.renderer.dispose(); S.renderer.forceContextLoss && S.renderer.forceContextLoss(); } catch (e) {} S.el.remove(); S = null; }

  function pop(text, cls) { const p = S.el.querySelector('#wo-pop'); p.textContent = text; p.className = 'wo-pop on ' + cls; clearTimeout(S.popT); S.popT = setTimeout(() => { if (S) p.className = 'wo-pop'; }, 900); }
  function addScore(n) { S.score += n; S.el.querySelector('#wo-sc').textContent = S.score; }
  // 合図：輪が縮んで中の円に重なる瞬間に押す
  function hitCue() {
    if (!S || !S.cue || S.cue.hit) return;
    const k = S.cue.t / S.cue.len, d = Math.abs(k - 0.78);
    S.cue.hit = true;
    if (d < 0.1) { addScore(2); pop('NICE 合図！ +2', 'perfect'); } else if (d < 0.22) { addScore(1); pop('合図 +1', 'good'); } else pop('合図が早い', 'miss');
    S.el.querySelector('#wo-cue').classList.remove('on');
  }

  const SPEEDUP = 1.9; // 実際の時計より速く進める（1本およそ28秒）
  const P2X = (pace) => clamp((16 - pace) / 5.2, 0, 1) * 100; // ペース計の位置（左=遅い 16秒、右=速い 10.8秒）
  function loop(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(loop);
    const real = Math.min(0.05, (now - S.last) / 1000), dt = real * SPEEDUP; S.last = now; S.clock += real;
    const o = S.opt, pl = S.pl;
    if (S.run && !S.done) {
      S.t += dt;
      const top = 200 / (11.2 - clamp((o.rating - 70) * 0.03, -0.6, 0.6)), low = 200 / 16.0;
      let want = low + (top - low) * Math.pow(S.power, 0.85);
      // 気性の激しい馬は、抑えすぎると行きたがる
      const hot = clamp((o.tmp - 35) / 50, 0, 1);
      if (S.power < 0.3 && S.s > 0) S.pull = clamp(S.pull + dt * hot * 0.5, 0, 1); else S.pull = Math.max(0, S.pull - dt * 0.6);
      want += S.pull * 1.6;
      S.v += clamp(want - S.v, -1.6 * dt, (S.s < 0 ? 3.4 : 1.1) * dt);
      const s0 = S.s; S.s += S.v * dt; S.ph += dt * Math.max(0.6, S.v / 7);
      if (S.s >= 0) S.lapT += s0 < 0 ? dt * (S.s / (S.s - s0)) : dt;
      if (S.laps.length < 4 && S.s >= (S.laps.length + 1) * 200) {
        const over = (S.s - (S.laps.length + 1) * 200) / S.v, lt = S.lapT - over; S.laps.push(lt); S.lapT = over;
        const i = S.laps.length - 1, d = lt - pl.laps[i], j = judgeLap(d);
        const cell = S.el.querySelector(`.wo-laps [data-i="${i}"]`); cell.querySelector('b').textContent = lt.toFixed(1); cell.className = j.toLowerCase();
        addScore(PTS[j] * (i === 3 ? 2 : 1));
        pop(j === 'MISS' ? (d < 0 ? 'MISS 速すぎ' : 'MISS 遅すぎ') : `${j}${i === 3 ? ' ×2' : ''}`, j.toLowerCase());
        if (S.laps.length === 4) finish();
      }
      // 合図
      if (!S.cueDone && S.s >= S.cueAt) { S.cueDone = true; S.cue = { t: 0, len: 1.5, hit: false }; S.el.querySelector('#wo-cue').classList.add('on'); }
      if (S.cue && !S.cue.hit) { S.cue.t += real; const k = S.cue.t / S.cue.len; S.el.querySelector('#wo-cue span').style.transform = `scale(${2.6 - k * 2.05})`; if (k >= 1) { S.cue.hit = true; S.el.querySelector('#wo-cue').classList.remove('on'); pop('合図を逃した', 'miss'); } }
      // ペース計
      const pace = S.v > 1 ? 200 / S.v : 99, tgt = pl.laps[Math.min(3, S.laps.length)];
      S.el.querySelector('#wo-p').textContent = pace < 30 ? pace.toFixed(1) : '--.-';
      S.el.querySelector('#wo-needle').style.left = P2X(pace) + '%';
      const band = S.el.querySelector('#wo-band'), perf = S.el.querySelector('#wo-perf');
      band.style.left = P2X(tgt + 0.7) + '%'; band.style.width = (P2X(tgt - 0.7) - P2X(tgt + 0.7)) + '%';
      perf.style.left = P2X(tgt + 0.3) + '%'; perf.style.width = (P2X(tgt - 0.3) - P2X(tgt + 0.3)) + '%';
    }
    S.el.querySelector('#wo-knob').style.top = (8 + (1 - S.power) * 76) + '%';
    draw(real);
  }
  function finish() {
    S.done = true;
    const r = gradeOf(S.score, S.laps, S.pl);
    const msg = S.el.querySelector('#wo-msg');
    const txt = { S: '指示どおりの完璧な追い切り。', A: 'ほぼ指示どおり。いい内容だ。', B: '少し時計がずれた。', C: r.fast ? '時計が速すぎた。馬に余計な負荷がかかった。' : '指示の時計から大きく外れた。' }[r.g];
    setTimeout(() => {
      if (!S) return;
      msg.innerHTML = `<div class="wo-grade g${r.g}">${r.g}</div><div>SCORE <b>${r.score}</b> / 17　4F <b>${r.t4.toFixed(1)}</b>秒（指示 ${S.pl.t4.toFixed(1)}）</div><div class="small">${txt}</div><button class="btn primary" id="wo-ok">厩舎へ戻る</button>`;
      msg.style.display = 'block'; msg.classList.add('res');
      msg.querySelector('#wo-ok').onclick = (e) => { e.stopPropagation(); const cb = S.opt.onDone; close(); cb(r); };
    }, 900);
  }

  function draw(dt) {
    const w = S.cv.clientWidth, h = S.cv.clientHeight;
    if (w !== S.w || h !== S.h) { S.w = w; S.h = h; S.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); S.renderer.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); }
    const m = S.B.m, x = S.s;
    // ゴール後は流す
    if (S.done) { S.v = Math.max(6, S.v - dt * 2.2); S.s += S.v * dt * SPEEDUP; S.ph += dt * SPEEDUP * Math.max(0.6, S.v / 7); }
    m.root.position.set(x, 0, 0); m.root.rotation.y = 0;
    const eff = S.done ? 0.2 : 0.3 + S.power * 0.7;
    m.update({ ease: S.done, win: false, photo: false, phase: S.ph, walk: 0, speed: S.v, effort: eff, whipT: 0, whipSide: 1, kakari: S.pull, lean: 0 }, dt * SPEEDUP, S.clock);
    // カメラ：外ラチ側から並走。追うほど寄って低くなる
    const k = S.power, cz = 8.2 - k * 1.6, cy = 1.9 - k * 0.35;
    S.cam.position.set(x + 3.4, cy, cz); S.cam.lookAt(x + 0.9, 1.25, 0);
    S.B.sun.position.set(x - 30, 26, 40); S.B.sun.target.position.set(x, 0, 0); S.B.sun.target.updateMatrixWorld();
    S.renderer.render(S.B.sc, S.cam);
  }

  window.Workout = { open, close, plan, auto, ORDERS };
})();
