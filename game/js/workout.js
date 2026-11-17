// ===== 追い切り（調教）のミニゲーム =====
// 4ハロン（800m）を、調教師の指示した時計で乗る。右側を上下になぞって手綱を加減する。
// 速すぎても遅すぎても評価が下がる。終い（最後の1ハロン）の時計も指示に入る。
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 指示の種類
  const ORDERS = {
    nari: { name: '馬なり', say: '今日は軽めでいい。馬なりで、終いだけ少し伸ばしてくれ。', t4: 54.5, l1: 13.0 },
    shimai: { name: '終い重点', say: '前半は我慢させて、終いをしっかり伸ばしてくれ。', t4: 53.5, l1: 12.2 },
    ippai: { name: '一杯に追う', say: 'レースが近い。最後まで一杯に追って、負荷をかけてくれ。', t4: 51.5, l1: 11.9 },
  };
  // 馬の力に合わせた目標の時計（4ハロンの合計と、各ハロン）
  function plan(kind, rating) {
    const o = ORDERS[kind], adj = clamp((rating - 70) * 0.035, -0.9, 0.9);
    const t4 = Math.round((o.t4 - adj) * 10) / 10, l1 = Math.round((o.l1 - adj * 0.25) * 10) / 10;
    const rest = (t4 - l1) / 3, laps = [rest + 0.35, rest, rest - 0.35, l1].map(x => Math.round(x * 10) / 10);
    return { kind, name: o.name, say: o.say, t4: Math.round(laps.reduce((a, b) => a + b, 0) * 10) / 10, l1, laps };
  }
  function grade(pl, laps) {
    const t4 = laps.reduce((a, b) => a + b, 0), l1 = laps[3];
    const err = Math.abs(t4 - pl.t4) + 1.5 * Math.abs(l1 - pl.l1);
    const g = err < 0.5 ? 'S' : err < 1.1 ? 'A' : err < 2.2 ? 'B' : 'C';
    return { g, err, t4, l1, fast: t4 < pl.t4 - 1.0 };
  }

  let S = null;
  // opt = { name, coat, silk, rating, tmp, kind, dy(e, x0, y0), onDone(result | null) }
  function open(host, opt) {
    close();
    const pl = plan(opt.kind, opt.rating);
    const el = document.createElement('div'); el.id = 'workout';
    el.innerHTML = `<canvas></canvas>
      <div class="wo-top"><div class="wo-order"><small>調教師の指示</small><b>${pl.name}</b><span>4F ${pl.t4.toFixed(1)}秒・終い ${pl.l1.toFixed(1)}秒</span></div>
        <div class="wo-laps">${pl.laps.map((x, i) => `<div data-i="${i}"><small>${4 - i}F目標 ${x.toFixed(1)}</small><b>--.-</b></div>`).join('')}</div>
        <button class="hbtn" id="wo-quit">やめる</button></div>
      <div class="wo-pace"><small>いまのペース（1ハロン換算）</small><b id="wo-p">--.-</b><span id="wo-d"></span></div>
      <div class="wo-thr"><i id="wo-knob"></i><em style="top:8%">追う</em><em style="top:46%">馬なり</em><em style="top:84%">抑える</em></div>
      <div class="wo-msg" id="wo-msg">右側を上下になぞって手綱を加減する<br><b>画面を押してスタート</b></div>`;
    host.appendChild(el);
    const cv = el.querySelector('canvas'), x = cv.getContext('2d');
    S = { el, cv, x, pl, opt, t: 0, s: -40, v: 0, power: 0.45, laps: [], lapT: 0, run: false, done: false, raf: 0, last: 0, ph: 0, pull: 0 };
    // 手綱：右半分を上下になぞる
    let id = null, x0 = 0, y0 = 0, p0 = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.id === 'wo-quit') return;
      if (!S.run && !S.done) { S.run = true; el.querySelector('#wo-msg').style.display = 'none'; }
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; p0 = S.power;
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; S.power = clamp(p0 - opt.dy(e, x0, y0) / 150, 0, 1); });
    ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, (e) => { if (e.pointerId === id) id = null; }));
    el.querySelector('#wo-quit').onclick = () => { const cb = opt.onDone; close(); cb(null); };
    S.last = performance.now(); S.raf = requestAnimationFrame(loop);
  }
  function close() { if (!S) return; cancelAnimationFrame(S.raf); S.el.remove(); S = null; }

  const SPEEDUP = 1.75; // 実際の時計より速く進める（1本およそ30秒）
  function loop(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - S.last) / 1000) * SPEEDUP; S.last = now;
    const o = S.opt, pl = S.pl;
    if (S.run && !S.done) {
      S.t += dt;
      // 手綱の加減 → 目標の速さ。馬の力で上限が変わる。気性の激しい馬は、抑えすぎると行きたがる
      const top = 200 / (11.3 - clamp((o.rating - 70) * 0.03, -0.6, 0.6)), low = 200 / 16.0;
      let want = low + (top - low) * Math.pow(S.power, 0.85);
      const hot = clamp((o.tmp - 35) / 50, 0, 1);
      if (S.power < 0.3 && S.s > 0) S.pull = clamp(S.pull + dt * hot * 0.5, 0, 1); else S.pull = Math.max(0, S.pull - dt * 0.6);
      want += S.pull * 1.6;
      S.v += clamp(want - S.v, -1.6 * dt, (S.s < 0 ? 3.2 : 1.1) * dt);
      const s0 = S.s; S.s += S.v * dt; S.ph += S.v * dt / 6.4;
      if (S.s >= 0) S.lapT += s0 < 0 ? dt * (S.s / (S.s - s0)) : dt;
      if (S.laps.length < 4 && S.s >= (S.laps.length + 1) * 200) {
        const over = (S.s - (S.laps.length + 1) * 200) / S.v;
        const lt = S.lapT - over; S.laps.push(lt); S.lapT = over;
        const cell = S.el.querySelector(`.wo-laps [data-i="${S.laps.length - 1}"] b`);
        const d = lt - pl.laps[S.laps.length - 1];
        cell.textContent = lt.toFixed(1); cell.className = Math.abs(d) < 0.25 ? 'ok' : d < 0 ? 'fast' : 'slow';
        if (S.laps.length === 4) finish();
      }
      const pace = S.v > 1 ? 200 / S.v : 99;
      S.el.querySelector('#wo-p').textContent = pace < 30 ? pace.toFixed(1) : '--.-';
      const tgt = pl.laps[Math.min(3, Math.max(0, S.laps.length))], d = pace - tgt;
      const de = S.el.querySelector('#wo-d');
      de.textContent = S.s < 0 ? '助走' : Math.abs(d) < 0.25 ? '指示どおり' : d < 0 ? `速い ${(-d).toFixed(1)}` : `遅い ${d.toFixed(1)}`;
      de.className = S.s < 0 ? '' : Math.abs(d) < 0.25 ? 'ok' : d < 0 ? 'fast' : 'slow';
    }
    S.el.querySelector('#wo-knob').style.top = (8 + (1 - S.power) * 76) + '%';
    draw();
  }
  function finish() {
    S.done = true;
    const r = grade(S.pl, S.laps);
    const msg = S.el.querySelector('#wo-msg');
    const txt = { S: '指示どおりの完璧な追い切り。', A: 'ほぼ指示どおり。いい内容だ。', B: '少し時計がずれた。', C: r.fast ? '時計が速すぎた。馬に余計な負荷がかかった。' : '指示の時計から大きく外れた。' }[r.g];
    msg.innerHTML = `<div class="wo-grade g${r.g}">${r.g}</div><div>4F <b>${r.t4.toFixed(1)}</b>秒（指示 ${S.pl.t4.toFixed(1)}）　終い <b>${r.l1.toFixed(1)}</b>秒（指示 ${S.pl.l1.toFixed(1)}）</div><div class="small">${txt}</div><button class="btn primary" id="wo-ok">厩舎へ戻る</button>`;
    msg.style.display = 'block'; msg.classList.add('res');
    msg.querySelector('#wo-ok').onclick = (e) => { e.stopPropagation(); const cb = S.opt.onDone; close(); cb(r); };
  }

  function draw() {
    const cv = S.cv, x = S.x, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gy = h * 0.72, px = 26; // 1m = 26px
    // 空と朝もや
    const sky = x.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#ffd9b0'); sky.addColorStop(0.55, '#ffeeda'); sky.addColorStop(1, '#eaf3ea');
    x.fillStyle = sky; x.fillRect(0, 0, w, gy);
    x.fillStyle = '#fff3c4'; x.beginPath(); x.arc(w * 0.78, gy * 0.42, 26, 0, 7); x.fill();
    // 遠くの森（ゆっくり流れる）
    const far = (S.s * 3) % 260;
    x.fillStyle = '#9cc7a0'; for (let i = -1; i < w / 260 + 2; i++) { const bx = i * 260 - far; x.beginPath(); x.ellipse(bx + 60, gy - 6, 90, 34, 0, Math.PI, 0); x.ellipse(bx + 190, gy - 6, 70, 24, 0, Math.PI, 0); x.fill(); }
    // 馬場（ウッドチップ）
    x.fillStyle = '#b98858'; x.fillRect(0, gy, w, h - gy);
    x.fillStyle = '#a97848'; const ch = (S.s * px) % 46; for (let i = -1; i < w / 46 + 2; i++) for (let j = 0; j < 4; j++) x.fillRect(i * 46 - ch + (j * 17) % 46, gy + 8 + j * ((h - gy) / 4.4), 9, 3);
    // ラチとハロン棒
    const horseX = w * 0.34, m2x = (m) => horseX + (m - S.s) * px;
    x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, gy - 16); x.lineTo(w, gy - 16); x.stroke();
    x.lineWidth = 2; const p0 = Math.floor((S.s - horseX / px) / 4) * 4; for (let m = p0; m < S.s + w / px; m += 4) { const bx = m2x(m); x.beginPath(); x.moveTo(bx, gy - 16); x.lineTo(bx, gy); x.stroke(); }
    for (let k = 0; k <= 4; k++) { const bx = m2x(k * 200); if (bx < -40 || bx > w + 40) continue; x.fillStyle = k === 4 ? '#ff4d5e' : '#fff'; x.fillRect(bx - 3, gy - 86, 6, 86); x.fillStyle = k === 4 ? '#ff4d5e' : '#2c3350'; x.fillRect(bx - 20, gy - 110, 40, 26); x.fillStyle = '#fff'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.fillText(k === 4 ? 'ゴール' : `${4 - k}F`, bx, gy - 92); }
    // 馬と騎手
    const ph = S.ph * Math.PI * 2, sp = clamp(S.v / 16, 0, 1.1), by = gy - 62 - Math.abs(Math.sin(ph)) * 7 * sp;
    const o = S.opt, coat = o.coat || '#8a5a36';
    x.save(); x.translate(horseX, by);
    x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(0, gy - by + 4, 62, 9, 0, 0, 7); x.fill();
    const leg = (hx, a) => { x.save(); x.translate(hx, 16); x.rotate(a); x.fillStyle = coat; x.fillRect(-5, 0, 10, 30); x.translate(0, 30); x.rotate(-a * 0.8 + 0.2); x.fillRect(-4, 0, 8, 24); x.fillStyle = '#2a2019'; x.fillRect(-5, 22, 10, 6); x.restore(); };
    const sw = 0.95 * sp;
    leg(-36, Math.sin(ph) * sw); leg(-28, Math.sin(ph + 0.6) * sw); leg(30, -Math.sin(ph) * sw); leg(38, -Math.sin(ph + 0.6) * sw);
    x.fillStyle = coat; x.beginPath(); x.ellipse(0, 4, 52, 21, 0, 0, 7); x.fill();
    x.save(); x.translate(40, -6); x.rotate(-0.72 + Math.sin(ph) * 0.07 * sp); x.fillRect(-9, -44, 20, 50); x.translate(2, -46); x.rotate(0.95); x.beginPath(); x.ellipse(12, 0, 22, 10, 0, 0, 7); x.fill(); x.fillStyle = '#2a2019'; x.fillRect(-8, -12, 5, 12); x.restore();
    x.strokeStyle = '#2a2019'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(-50, -4); x.quadraticCurveTo(-74, -6 + Math.sin(ph) * 6, -80, 18); x.stroke();
    x.fillStyle = '#3a2a22'; x.fillRect(-14, -20, 30, 8);
    const lean = -0.5 - S.power * 0.35;
    x.save(); x.translate(2, -22); x.rotate(lean); x.fillStyle = o.silk || '#ff5c7a'; x.fillRect(-9, -34, 20, 34); x.fillStyle = '#fff'; x.fillRect(-9, -22, 20, 6); x.fillStyle = '#ffd9b8'; x.beginPath(); x.arc(2, -42, 9, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(2, -45, 10, Math.PI, 0); x.fill(); x.restore();
    x.fillStyle = '#f3f3f3'; x.fillRect(-12, -8, 12, 22);
    x.restore();
    // 進み具合
    const bw = Math.min(360, w * 0.5), bx0 = (w - bw) / 2, pr = clamp(S.s / 800, 0, 1);
    x.fillStyle = 'rgba(39,43,69,.35)'; x.fillRect(bx0, h - 16, bw, 6); x.fillStyle = '#ff4d7e'; x.fillRect(bx0, h - 16, bw * pr, 6);
    x.fillStyle = '#fff'; for (let k = 1; k < 4; k++) x.fillRect(bx0 + bw * k / 4 - 1, h - 18, 2, 10);
  }

  window.Workout = { open, close, plan, ORDERS };
})();
