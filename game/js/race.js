// ===== レースエンジン + ジョッキーカメラ描画 =====
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  function makeCourse(venueKey, surf) {
    const V = VENUES[venueKey];
    let lap = V.lap * (surf === 'D' ? 0.88 : 1);
    const H = V.straight * (surf === 'D' ? 0.93 : 1);
    let T = (lap - 2 * H) / 2;
    if (T < 260) { T = 260; lap = 2 * H + 2 * T; }
    return { dir: V.dir, lap, H, T, R: T / Math.PI, name: V.name, width: surf === 'D' ? 22 : 27 };
  }
  // p: 1周上の位置。[0,H)=最後の直線（p=H がゴール）
  function curvAt(c, p) {
    p = ((p % c.lap) + c.lap) % c.lap;
    if (p >= c.H && p < c.H + c.T) return 1 / c.R;
    if (p >= 2 * c.H + c.T) return 1 / c.R;
    return 0;
  }
  function sectionName(c, p) {
    p = ((p % c.lap) + c.lap) % c.lap;
    if (p < c.H) return '直線';
    if (p < c.H + c.T) return 'コーナー';
    if (p < 2 * c.H + c.T) return '向正面';
    return '3〜4コーナー';
  }

  function baseSpeed(dist, surf) {
    let v = 17.75 - 0.00055 * (dist - 1200);
    if (surf === 'D') v -= 0.45;
    return Math.max(15.4, v);
  }

  class Runner {
    constructor(race, cfg, idx) {
      const h = cfg.horse;
      this.cfg = cfg; this.horse = h; this.idx = idx;
      this.isPlayer = !!cfg.isPlayer;
      this.auto = !this.isPlayer || !!cfg.auto;
      this.jSkill = cfg.jockeySkill || 60;
      this.color = cfg.color;
      this.num = idx + 1;
      const D = race.D;
      let spd = cfg.ability.spd, sta = cfg.ability.sta;
      const best = h.dist || 1800;
      spd -= Math.max(0, best - D - 200) * 0.012;
      sta -= Math.max(0, D - best - 200) * 0.025;
      if (h.surf !== "B" && h.surf !== race.surf) spd -= 6;
      spd -= ((cfg.weight || 56) - 56) * 0.6;
      spd += rnd(-3.5, 3.5) * (cfg.formNoise ?? 1); // 当日の調子
      this.spd = spd; this.sta = sta;
      this.kick = cfg.ability.kick; this.tmp = cfg.ability.tmp; this.style = h.style;
      this.vMax = race.vBase * (1 + (spd - 75) * 0.0011);
      const vB = race.vBase;
      const tn = Math.max(0, D - 600) / (vB * 0.975), ts = 600 / (vB * 1.03);
      this.drainBase = 1 / (tn + 1.39 * ts) / (1 + (sta - 75) * 0.006);
      this.st = 1.06;
      this.s = 0; this.X = 0.9 + idx * 1.05; this.tx = this.X;
      this.v = 0; this.effort = 0.5; this.kakari = 0;
      this.whipT = 0; this.whips = 0; this.started = false;
      this.reaction = this.auto ? (Math.random() < 0.06 + this.tmp * 0.0008 ? rnd(0.6, 1.1) : rnd(0.05, 0.35)) : null;
      this.finished = false; this.finishTime = null;
      this.blocked = false; this.covered = false; this.think = Math.random() * 0.4;
      this.spurtAt = [450, 520, 620, 690][this.style] * rnd(0.85, 1.15) * (0.9 + this.jSkill / 600);
      this.phase = Math.random() * 6;
      this.lateStart = false;
    }
  }

  class Race {
    constructor(cfg) {
      this.cfg = cfg;
      this.D = cfg.dist; this.surf = cfg.surf;
      this.course = makeCourse(cfg.venue, cfg.surf);
      this.startP = this.course.H - this.D;
      this.vBase = baseSpeed(this.D, this.surf) * (cfg.ground === '重' ? 0.985 : 1);
      this.runners = cfg.runners.map((r, i) => new Runner(this, r, i));
      this.t = 0; this.gateOpenAt = rnd(1.6, 3.0); this.open = false;
      this.player = this.runners.find(r => r.isPlayer) || null;
      this.done = false; this.events = [];
      this.input = { hold: false, push: false, left: false, right: false };
      this.message = null;
    }
    pAt(s) { return this.startP + s; }
    msg(text, dur = 1.6, color = '#fff') { this.message = { text, until: this.t + dur, color }; }

    playerStart() {
      const p = this.player;
      if (!p || p.started || p.reaction != null) return;
      if (!this.open) { p.reaction = 0.55; this.msg('焦ってしまった…', 1.4, '#ffb74d'); }
      else {
        const d = this.t - this.gateOpenAt;
        p.reaction = d;
        if (d < 0.25) this.msg('好スタート!', 1.4, '#81c784');
        else if (d > 0.6) { this.msg('出遅れ!', 1.6, '#e57373'); }
      }
    }
    whip() {
      const p = this.player;
      if (!p || !p.started || p.finished || p.whips >= 12) return;
      p.whipT = 1.3; p.whips++;
    }

    step(dt) {
      this.t += dt;
      if (!this.open && this.t >= this.gateOpenAt) { this.open = true; this.msg('スタート!', 1.0); }
      const R = this.runners;
      const order = R.slice().sort((a, b) => b.s - a.s);
      order.forEach((r, i) => r.rank = i + 1);
      const leader = order[0];
      for (const r of R) {
        // 発馬
        if (!r.started) {
          if (!this.open) continue;
          if (r.isPlayer && !r.auto && r.reaction == null && this.t - this.gateOpenAt > 1.2) {
            r.reaction = 1.2; this.msg('大きく出遅れた!', 1.6, '#e57373');
          }
          if (r.reaction != null && this.t - this.gateOpenAt >= r.reaction) { r.started = true; if (r.reaction > 0.6) r.lateStart = true; }
          else continue;
        }
        r.phase += dt * (r.v * 0.45 + 1);
        const rem = this.D - r.s;
        // 周囲の把握
        let ahead = null, aheadGap = 99; r.covered = false;
        for (const o of R) {
          if (o === r) continue;
          const ds = o.s - r.s, dx = Math.abs(o.X - r.X);
          if (ds > 0 && ds < 8 && dx < 1.25) { r.covered = true; }
          if (ds > 0 && dx < 0.95 && ds < aheadGap) { aheadGap = ds; ahead = o; }
        }
        // 判断
        if (r.finished) r.effort = 0.1;
        else if (r.auto) this.ai(r, rem, dt);
        else {
          const inp = this.input;
          r.effort = inp.hold ? 0.12 : inp.push ? 1.0 : 0.5;
          if (inp.left || inp.right) {
            const dirSign = this.course.dir === 'L' ? 1 : -1; // 画面右へ = X 増加(左回り)
            const want = (inp.right ? 1 : -1) * dirSign;
            r.tx = r.X + want * 0.8;
          } else r.tx = r.X;
        }
        // 折り合い
        if (!r.finished && r.started) {
          const restrain = r.effort < 0.45;
          const early = r.s < this.D - 700;
          const skill = (r.isPlayer && !r.auto ? (this.cfg.playerTech || 50) : r.jSkill) / 100;
          let gain = 0;
          if (early && restrain && !r.covered) gain = r.tmp / 100 * 0.16 * (r.effort < 0.2 ? 1.6 : 1);
          else if (early && !r.covered && r.effort <= 0.55) gain = r.tmp / 100 * 0.05;
          gain *= (1.2 - skill * 0.7);
          const loss = (r.covered ? 0.12 : 0.04) + (r.effort >= 0.7 ? 0.08 : 0);
          r.kakari = clamp(r.kakari + (gain - loss) * dt, 0, 1);
          if (r.kakari > 0.8) r.effort = Math.max(r.effort, 0.8);
        }
        // 目標速度
        let f = 0.93 + 0.09 * r.effort;
        if (r.effort >= 0.99) f += (r.kick - 70) * 0.0006 + (rem < 500 ? 0.006 : 0) + (r.style >= 2 && rem < 600 ? 0.007 : 0);
        if (r.whipT > 0) { r.whipT -= dt; if (r.effort > 0.9 && r.st > 0.05) f += 0.012; }
        if (!r.isPlayer || r.auto) { /* 見習い減量などは cfg.weight で反映済み */ }
        let vT = r.vMax * f;
        const fatigue = r.st < 0.25 ? 0.935 + 0.26 * Math.max(0, r.st) : 1;
        vT *= fatigue;
        if (r.s < 120) vT = Math.min(vT, r.vMax * 1.0);
        // 加減速
        const acc = r.v < this.vBase * 0.85 ? 3.4 : 0.45 + r.kick * 0.004;
        if (r.v < vT) r.v = Math.min(vT, r.v + acc * dt);
        else r.v = Math.max(vT, r.v - 0.8 * dt);
        // 前が壁
        r.blocked = false;
        if (ahead && aheadGap < 3.0) {
          r.blocked = aheadGap < 2.4 && r.effort >= 0.5;
          const cap = ahead.v - (aheadGap < 1.7 ? 0.35 : 0.05);
          if (r.v > cap) r.v = Math.max(0, cap);
        }
        // スタミナ消費
        if (!r.finished) {
          let drain = r.drainBase * Math.pow(r.v / (this.vBase * 0.975), 6);
          if (r.covered) drain *= 0.86;
          if (r.rank === 1) drain *= 1.06; // 先頭は風よけがない
          drain *= 1 + 0.9 * r.kakari;
          if (r.whipT > 0) drain *= 1.08;
          r.st -= drain * dt;
          if (r.st < 0) r.st = 0;
        }
        // 横移動
        const latSpeed = 1.1 + (r.isPlayer ? 0.4 : 0);
        let dX = clamp(r.tx - r.X, -latSpeed * dt, latSpeed * dt);
        if (dX !== 0) {
          const nx = r.X + dX;
          for (const o of R) {
            if (o === r) continue;
            if (Math.abs(o.s - r.s) < 2.3 && Math.abs(o.X - nx) < 0.95 && Math.sign(o.X - r.X) === Math.sign(dX)) { dX = 0; break; }
          }
          r.X = clamp(r.X + dX, 0.6, this.course.width - 0.6);
        }
        // 前進（コーナーでは外ほどロス）
        const k = curvAt(this.course, this.pAt(r.s));
        const prog = k > 0 ? this.course.R / (this.course.R + r.X) : 1;
        const prevS = r.s;
        r.s += r.v * prog * dt;
        if (!r.finished && r.s >= this.D) {
          r.finished = true;
          const frac = (this.D - prevS) / Math.max(1e-6, r.s - prevS);
          r.finishTime = this.t - dt + frac * dt - this.gateOpenAt;
          if (r === this.player) this.msg('ゴール!', 2.2);
        }
      }
      // 実況メッセージ
      const p = this.player;
      if (p && !p.finished && p.started && !p.auto) {
        const rem = this.D - p.s;
        if (!this._m600 && rem < 600) { this._m600 = true; this.msg('残り600m', 1.2, '#ffd54f'); }
        if (!this._m200 && rem < 200) { this._m200 = true; this.msg('ラスト200m!', 1.2, '#ffd54f'); }
        if (p.kakari > 0.7 && (!this.message || this.t > this.message.until)) this.msg('かかっている!', 0.9, '#ff8a65');
        if (p.blocked && rem < 700 && (!this.message || this.t > this.message.until)) this.msg('前が壁!', 0.8, '#ff8a65');
      }
      if (R.every(r => r.finished)) this.done = true;
      if (this.t > 600) { R.forEach(r => { if (!r.finished) { r.finished = true; r.finishTime = this.t + (this.D - r.s) / 10; } }); this.done = true; }
    }

    ai(r, rem, dt) {
      r.think -= dt;
      const n = this.runners.length;
      const posFrac = (r.rank - 1) / Math.max(1, n - 1);
      const target = [0, 0.22, 0.58, 0.88][r.style];
      if (rem < r.spurtAt * (r.st < 0.35 ? 0.7 : 1)) {
        r.effort = 1;
        if (rem < 380 && r.whipT <= 0 && r.whips < 10 && Math.random() < 0.6 * dt) { r.whipT = 1.3; r.whips++; }
      } else if (r.s < Math.min(420, this.D * 0.25)) {
        r.effort = [0.95, 0.72, 0.48, 0.32][r.style];
      } else {
        let e = 0.5;
        if (posFrac > target + 0.18) e = 0.6;
        else if (posFrac < target - 0.18) e = 0.4;
        if (r.style === 0 && r.rank > 1) e = 0.66;
        if (r.kakari > 0.4) e = Math.max(e, 0.55);
        r.effort = e;
      }
      if (r.think > 0) return;
      r.think = 0.4 + Math.random() * 0.3;
      const W = this.course.width;
      const clear = (x) => {
        let best = 40;
        for (const o of this.runners) {
          if (o === r) continue;
          const ds = o.s - r.s, dx = Math.abs(o.X - x);
          if (dx < 1.0) {
            if (ds > -2.3 && ds < 2.3 && Math.abs(x - r.X) > 0.3) return -1;
            if (ds > 0 && ds < best) best = ds;
          }
        }
        return best;
      };
      const k = curvAt(this.course, this.pAt(r.s));
      const cands = [r.X - 1.2, r.X, r.X + 1.2, r.X + 2.4].filter(x => x > 0.6 && x < W - 0.6);
      let bestX = r.X, bestScore = -1e9;
      const late = rem < 750;
      for (const x of cands) {
        const c = clear(x);
        if (c < 0) continue;
        let score = Math.min(c, late ? 30 : 12) * (late ? 1.4 : 0.6);
        score -= (x - 0.8) * (k > 0 ? 1.6 : late ? 0.25 : 0.7);
        if (score > bestScore) { bestScore = score; bestX = x; }
      }
      r.tx = bestX;
    }

    runToEnd() { let g = 0; while (!this.done && g++ < 40000) this.step(1 / 15); return this.results(); }

    results() {
      const R = this.runners.slice().sort((a, b) => a.finishTime - b.finishTime);
      const win = R[0];
      return R.map((r, i) => {
        let margin = '';
        if (i > 0) {
          const L = (r.finishTime - R[i - 1].finishTime) * (this.D / win.finishTime) / 2.4;
          margin = lenStr(L);
        }
        return { runner: r, horse: r.horse, cfg: r.cfg, pos: i + 1, time: r.finishTime, margin, lateStart: r.lateStart };
      });
    }
  }

  function lenStr(L) {
    if (L < 0.02) return '同着';
    if (L < 0.08) return 'ハナ';
    if (L < 0.18) return 'アタマ';
    if (L < 0.35) return 'クビ';
    if (L < 0.62) return '1/2';
    if (L < 0.87) return '3/4';
    if (L > 10) return '大差';
    const whole = Math.floor(L + 0.125);
    const frac = L + 0.125 - whole;
    const fs = frac < 0.25 ? '' : frac < 0.5 ? ' 1/4' : frac < 0.75 ? ' 1/2' : ' 3/4';
    return whole + fs;
  }
  function fmtTime(t) {
    if (t == null || !isFinite(t)) return '--';
    const m = Math.floor(t / 60), s = t - m * 60;
    return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(1);
  }

  // ===== 描画 =====
  class Renderer {
    constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.heading = 0; }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) {
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      }
      this.W = this.cv.width; this.H = this.cv.height; this.dpr = dpr;
    }
    draw(race) {
      this.resize();
      const ctx = this.ctx, W = this.W, H = this.H, c = race.course;
      const P = race.player;
      const s0 = P.s, X0 = P.X;
      const sgn = c.dir === 'L' ? 1 : -1;
      const bob = Math.sin(P.phase * 2) * H * 0.006 * Math.min(1, P.v / 10);
      const hor = H * 0.40 + bob;
      const F = H * 0.95, camH = 2.5;
      const cx = W / 2 + Math.sin(P.phase) * W * 0.002;
      // 視点の向き（背景のスクロール用）
      // 空
      const isDirt = race.surf === 'D';
      let g = ctx.createLinearGradient(0, 0, 0, hor);
      g.addColorStop(0, '#5b9be0'); g.addColorStop(1, '#cfe6f7');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, hor + 2);
      // 遠景の山
      const headAng = this.headingAt(race, s0);
      ctx.fillStyle = '#7d9fb3';
      const off = (headAng * W * 0.9 * sgn) % W;
      ctx.beginPath(); ctx.moveTo(-W, hor);
      for (let x = -W; x <= 2 * W; x += W / 24) {
        const xx = x + off;
        ctx.lineTo(xx, hor - H * (0.035 + 0.03 * Math.abs(Math.sin(x * 0.0021 + 1.3)) + 0.015 * Math.sin(x * 0.009)));
      }
      ctx.lineTo(2 * W, hor); ctx.fill();
      ctx.fillStyle = '#4e7a3a'; ctx.fillRect(0, hor, W, H - hor);

      // スライス計算
      const sl = [];
      let z = 2.2, cOff = 0, dc = 0;
      while (z < 420) {
        const dz = Math.max(0.8, z * 0.045);
        sl.push({ z, c: cOff, p: race.pAt(s0 + z) });
        const k = curvAt(c, race.pAt(s0 + z));
        dc += k * dz; cOff += dc * dz;
        z += dz;
      }
      this.slices = sl;
      const proj = (X, s, zz) => [cx + sgn * (X - s.c - X0) * F / zz, hor + camH * F / zz];
      // 遠い方から描く
      for (let i = sl.length - 2; i >= 0; i--) {
        const a = sl[i], b = sl[i + 1];
        const [ax0, ay] = proj(-0.2, a, a.z), [ax1] = proj(c.width + 0.2, a, a.z);
        const [bx0, by] = proj(-0.2, b, b.z), [bx1] = proj(c.width + 0.2, b, b.z);
        const stripe = Math.floor((s0 + a.z) / 9) % 2;
        ctx.fillStyle = isDirt ? (stripe ? '#a8784a' : '#9e6f43') : (stripe ? '#5fa84a' : '#55a043');
        ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.lineTo(bx1, by); ctx.lineTo(bx0, by); ctx.closePath(); ctx.fill();
        // スタンド（最後の直線・外側）
        const pp = ((a.p % c.lap) + c.lap) % c.lap;
        if (pp > c.H - 330 && pp < c.H + 40) {
          const [sx0, sy] = proj(c.width + 9, a, a.z), [sx1] = proj(c.width + 45, a, a.z);
          const hh = 14 * F / a.z;
          ctx.fillStyle = (Math.floor((s0 + a.z) / 6) % 2) ? '#b8bcc4' : '#a9aeb7';
          ctx.fillRect(Math.min(sx0, sx1), sy - hh, Math.abs(sx1 - sx0), hh);
          ctx.fillStyle = '#6d7480';
          ctx.fillRect(Math.min(sx0, sx1), sy - hh, Math.abs(sx1 - sx0), hh * 0.12);
        }
      }
      // ラチ
      for (const X of [-0.35, c.width + 0.35]) {
        ctx.strokeStyle = '#ffffff';
        for (let i = sl.length - 2; i >= 0; i--) {
          const a = sl[i], b = sl[i + 1];
          const [ax, ay] = proj(X, a, a.z), [bx, by] = proj(X, b, b.z);
          const hA = 1.0 * F / a.z, hB = 1.0 * F / b.z;
          ctx.lineWidth = Math.max(1, 0.1 * F / a.z);
          ctx.beginPath(); ctx.moveTo(ax, ay - hA); ctx.lineTo(bx, by - hB); ctx.stroke();
          if (Math.floor((s0 + a.z) / 4) !== Math.floor((s0 + b.z) / 4)) {
            ctx.lineWidth = Math.max(1, 0.06 * F / a.z);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - hA); ctx.stroke();
          }
        }
      }
      // ハロン棒とゴール
      const interp = (dz) => {
        for (let i = 0; i < sl.length - 1; i++) if (sl[i + 1].z >= dz) {
          const t = (dz - sl[i].z) / (sl[i + 1].z - sl[i].z);
          return { c: sl[i].c + (sl[i + 1].c - sl[i].c) * t };
        }
        return null;
      };
      this.interp = interp;
      for (let k = 0; k <= 12; k++) {
        const sMark = race.D - k * 200;
        const dz = sMark - s0;
        if (dz < 2.2 || dz > 400) continue;
        const s = interp(dz); if (!s) continue;
        const [x, y] = proj(-1.1, s, dz);
        const sc = F / dz;
        if (k === 0) {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.12 * sc, y - 5 * sc, 0.24 * sc, 5 * sc);
          ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(x, y - 5 * sc, 0.9 * sc, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 5 * sc, 0.45 * sc, 0, 7); ctx.fill();
          const [lx0, ly] = proj(0, s, dz), [lx1] = proj(c.width, s, dz);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, 0.15 * sc);
          ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx1, ly); ctx.stroke();
        } else {
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.08 * sc, y - 2.6 * sc, 0.16 * sc, 2.6 * sc);
          ctx.fillStyle = k % 2 ? '#1565c0' : '#c62828';
          ctx.fillRect(x - 0.5 * sc, y - 3.2 * sc, 1.0 * sc, 0.8 * sc);
          if (sc > 6) {
            ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(0.55 * sc)}px sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(String(k * 200), x, y - 2.62 * sc);
          }
        }
      }
      // 他馬
      const vis = race.runners.filter(r => r !== P && r.s - s0 > 1.4 && r.s - s0 < 400).sort((a, b) => b.s - a.s);
      for (const r of vis) {
        const dz = r.s - s0; const s = interp(dz); if (!s) continue;
        const [x, y] = proj(r.X, s, dz);
        this.drawHorse(x, y, F / dz, r);
      }
      // 横の馬インジケーター
      let leftNear = false, rightNear = false;
      for (const r of race.runners) {
        if (r === P) continue;
        const ds = r.s - s0, dx = (r.X - X0) * sgn;
        if (ds > -3.5 && ds <= 1.4 && Math.abs(dx) < 2.6) { if (dx < 0) leftNear = true; else rightNear = true; }
      }
      this.drawForeground(race, P, W, H, bob);
      this.drawHUD(race, P, W, H, leftNear, rightNear);
    }
    headingAt(race, s) {
      // 走った距離までの曲率の積分（＝向きの変化）
      const c = race.course; let ang = 0;
      const step = 10;
      for (let x = 0; x < s; x += step) ang += curvAt(c, race.pAt(x)) * Math.min(step, s - x);
      return ang;
    }
    drawHorse(x, y, sc, r) {
      const ctx = this.ctx;
      if (sc < 0.6) { ctx.fillStyle = '#3a2516'; ctx.fillRect(x - 0.4 * sc, y - 2 * sc, 0.8 * sc, 2 * sc); return; }
      const ph = r.phase * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y, 0.55 * sc, 0.16 * sc, 0, 0, 7); ctx.fill();
      // 脚
      ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = Math.max(1, 0.11 * sc);
      for (let i = 0; i < 4; i++) {
        const lx = x + (i < 2 ? -0.22 : 0.22) * sc + (i % 2 ? 0.04 : -0.04) * sc;
        const lift = Math.max(0, Math.sin(ph + i * 1.6)) * 0.35 * sc;
        ctx.beginPath(); ctx.moveTo(lx, y - 1.0 * sc); ctx.lineTo(lx, y - lift); ctx.stroke();
      }
      const bodyY = y - 1.35 * sc + Math.sin(ph) * 0.05 * sc;
      ctx.fillStyle = r.horse.coat || '#5a3420';
      ctx.beginPath(); ctx.ellipse(x, bodyY, 0.42 * sc, 0.5 * sc, 0, 0, 7); ctx.fill();
      // 尾
      ctx.strokeStyle = '#1e120a'; ctx.lineWidth = Math.max(1, 0.12 * sc);
      ctx.beginPath(); ctx.moveTo(x, bodyY - 0.3 * sc);
      ctx.quadraticCurveTo(x + Math.sin(ph * 0.5) * 0.25 * sc, bodyY + 0.2 * sc, x + Math.sin(ph * 0.5 + 1) * 0.15 * sc, bodyY + 0.55 * sc); ctx.stroke();
      // 騎手
      const jy = bodyY - 0.75 * sc;
      ctx.fillStyle = r.color;
      ctx.fillRect(x - 0.24 * sc, jy - 0.15 * sc, 0.48 * sc, 0.42 * sc);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x - 0.18 * sc, jy + 0.27 * sc, 0.36 * sc, 0.16 * sc);
      ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(x, jy - 0.3 * sc, 0.16 * sc, 0, 7); ctx.fill();
      if (r.whipT > 0) {
        ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(1, 0.04 * sc);
        const a = Math.sin(r.whipT * 12) * 0.6;
        ctx.beginPath(); ctx.moveTo(x + 0.25 * sc, jy); ctx.lineTo(x + 0.25 * sc + Math.cos(a) * 0.6 * sc, jy + Math.sin(a) * 0.6 * sc); ctx.stroke();
      }
      if (sc > 9) {
        ctx.fillStyle = WAKU_COLORS[r.cfg.waku - 1] || '#fff';
        const tw = 0.36 * sc;
        ctx.fillRect(x - tw / 2, jy - 0.85 * sc, tw, 0.32 * sc);
        ctx.fillStyle = [1, 5].includes(r.cfg.waku) ? '#000' : '#fff';
        ctx.font = `bold ${Math.round(0.26 * sc)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(String(r.num), x, jy - 0.6 * sc);
      }
    }
    drawForeground(race, P, W, H, bob) {
      const ctx = this.ctx;
      const sway = Math.sin(P.phase) * W * 0.004 + (P.kakari > 0.6 ? Math.sin(race.t * 9) * W * 0.012 : 0);
      const nodY = Math.sin(P.phase * 2 + 1) * H * 0.018 * Math.min(1, P.v / 10);
      const cx = W / 2 + sway;
      const topY = H * 0.70 + nodY + bob;
      // 首
      const coat = P.horse.coat || '#6b3e22';
      let g = this.ctx.createLinearGradient(cx - W * 0.12, 0, cx + W * 0.12, 0);
      g.addColorStop(0, shade(coat, -0.35)); g.addColorStop(0.5, coat); g.addColorStop(1, shade(coat, -0.35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.15, H);
      ctx.bezierCurveTo(cx - W * 0.12, H * 0.88, cx - W * 0.06, topY + H * 0.06, cx - W * 0.045, topY);
      ctx.lineTo(cx + W * 0.045, topY);
      ctx.bezierCurveTo(cx + W * 0.06, topY + H * 0.06, cx + W * 0.12, H * 0.88, cx + W * 0.15, H);
      ctx.closePath(); ctx.fill();
      // 頭頂と耳
      ctx.fillStyle = shade(coat, -0.15);
      ctx.beginPath(); ctx.ellipse(cx, topY + H * 0.005, W * 0.05, H * 0.035, 0, 0, 7); ctx.fill();
      const earA = Math.sin(race.t * 3) * 0.08;
      for (const s of [-1, 1]) {
        ctx.fillStyle = shade(coat, -0.25);
        ctx.beginPath();
        ctx.moveTo(cx + s * W * 0.03, topY - H * 0.005);
        ctx.lineTo(cx + s * W * (0.04 + earA * 0.1), topY - H * 0.075);
        ctx.lineTo(cx + s * W * 0.012, topY - H * 0.01);
        ctx.closePath(); ctx.fill();
      }
      // たてがみ
      ctx.strokeStyle = '#1b0f08'; ctx.lineWidth = W * 0.022; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, topY + H * 0.02);
      for (let i = 1; i <= 6; i++) ctx.lineTo(cx + Math.sin(race.t * 7 + i) * W * 0.006, topY + H * 0.02 + i * (H - topY) / 6);
      ctx.stroke(); ctx.lineCap = 'butt';
      // 手綱と手
      const handY = H * 0.95 + nodY * 0.3;
      const pull = race.input.hold && !P.auto ? H * 0.03 : 0;
      ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = Math.max(2, W * 0.004);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + s * W * 0.08, handY + pull);
        ctx.quadraticCurveTo(cx + s * W * 0.07, (handY + topY) / 2, cx + s * W * 0.04, topY + H * 0.03); ctx.stroke();
      }
      const silk = P.color;
      for (const s of [-1, 1]) {
        ctx.fillStyle = silk;
        ctx.beginPath(); ctx.ellipse(cx + s * W * 0.09, H * 1.02 + pull, W * 0.045, H * 0.06, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#f5f5f5';
        ctx.beginPath(); ctx.ellipse(cx + s * W * 0.085, handY + pull, W * 0.022, H * 0.03, 0, 0, 7); ctx.fill();
      }
      if (P.whipT > 0) {
        const a = -1.2 + Math.sin((1.3 - P.whipT) * 10) * 0.8;
        ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, W * 0.005);
        ctx.beginPath(); ctx.moveTo(cx + W * 0.1, handY);
        ctx.lineTo(cx + W * 0.1 + Math.cos(a) * W * 0.12, handY + Math.sin(a) * H * 0.25); ctx.stroke();
      }
      if (P.effort >= 0.99 && !P.finished) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 6; i++) { const y = (race.t * 900 + i * H / 6) % H; ctx.fillRect(0, y, W * 0.06, 2); ctx.fillRect(W * 0.94, (y + H / 3) % H, W * 0.06, 2); }
      }
    }
    drawHUD(race, P, W, H, leftNear, rightNear) {
      const ctx = this.ctx, u = H / 100;
      ctx.textAlign = 'left';
      // 左上パネル
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, u * 1.5, u * 1.5, u * 38, u * 15, u * 1.5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(u * 3.6)}px sans-serif`;
      ctx.fillText(race.cfg.name, u * 3, u * 6);
      ctx.font = `${Math.round(u * 3)}px sans-serif`;
      const rem = Math.max(0, race.D - P.s);
      ctx.fillText(`残り ${Math.ceil(rem)}m  ${sectionName(race.course, race.pAt(P.s))}`, u * 3, u * 10.5);
      const tt = race.open ? (P.finished ? P.finishTime : race.t - race.gateOpenAt) : 0;
      ctx.fillText(`${P.rank || '-'}番手 / ${race.runners.length}頭   ${fmtTime(tt)}`, u * 3, u * 14.5);
      // 隊列バー
      const ord = race.runners.slice().sort((a, b) => b.s - a.s);
      const lead = ord[0].s, last = ord[ord.length - 1].s;
      const span = Math.max(30, lead - last);
      const bx = W * 0.32, bw = W * 0.36, by = u * 5;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, bx - u * 2, by - u * 3, bw + u * 4, u * 6, u * 3); ctx.fill();
      ctx.font = `${Math.round(u * 2.2)}px sans-serif`; ctx.fillStyle = '#ddd';
      ctx.textAlign = 'right'; ctx.fillText('先頭▶', bx + bw + u * 1.5, by - u * 3.6);
      for (const r of ord) {
        const x = bx + bw - (lead - r.s) / span * bw;
        if (r === P) continue;
        ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(x, by, u * 1.1, 0, 7); ctx.fill();
      }
      const px = bx + bw - (lead - P.s) / span * bw;
      ctx.fillStyle = '#ffeb3b'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, by, u * 1.8, 0, 7); ctx.fill(); ctx.stroke();
      // ミニマップ
      this.drawMiniMap(race, P, W - u * 30, u * 2, u * 28, u * 15);
      // ゲージ
      const gx = u * 2, gy = u * 22, gh = u * 30, gw = u * 3.2;
      const st = clamp(P.st / 1.06, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, gx - u, gy - u * 4, gw * 2 + u * 5, gh + u * 5, u); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = st > 0.5 ? '#66bb6a' : st > 0.25 ? '#ffca28' : '#ef5350';
      ctx.fillRect(gx, gy + gh * (1 - st), gw, gh * st);
      ctx.fillStyle = '#333'; ctx.fillRect(gx + gw + u * 1.5, gy, gw, gh);
      ctx.fillStyle = P.kakari > 0.6 ? '#ef5350' : '#42a5f5';
      const ok = 1 - P.kakari;
      ctx.fillRect(gx + gw + u * 1.5, gy + gh * (1 - ok), gw, gh * ok);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `${Math.round(u * 2.2)}px sans-serif`;
      ctx.fillText('脚', gx + gw / 2, gy - u * 1.2); ctx.fillText('折合', gx + gw * 1.5 + u * 1.5, gy - u * 1.2);
      // 横の馬
      ctx.font = `bold ${Math.round(u * 3)}px sans-serif`;
      if (leftNear) { ctx.fillStyle = 'rgba(255,152,0,0.85)'; ctx.fillText('◀ 馬', W * 0.1, H * 0.6); }
      if (rightNear) { ctx.fillStyle = 'rgba(255,152,0,0.85)'; ctx.fillText('馬 ▶', W * 0.9, H * 0.6); }
      // 位置（ラチからの距離）
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `${Math.round(u * 2.6)}px sans-serif`;
      ctx.fillText(`内ラチから ${P.X.toFixed(1)}m`, W / 2, u * 13);
      // ゲート
      if (!race.open || !P.started) {
        if (!race.open) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H * 0.3, W, H * 0.2); }
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(u * 6)}px sans-serif`;
        ctx.fillText(race.open ? 'GO!' : 'ゲートイン…', W / 2, H * 0.42);
      }
      // メッセージ
      if (race.message && race.t < race.message.until) {
        ctx.font = `bold ${Math.round(u * 7)}px sans-serif`;
        ctx.lineWidth = u * 0.8; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(race.message.text, W / 2, H * 0.3);
        ctx.fillStyle = race.message.color; ctx.fillText(race.message.text, W / 2, H * 0.3);
      }
      ctx.textAlign = 'left';
    }
    drawMiniMap(race, P, x, y, w, h) {
      const ctx = this.ctx, c = race.course;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, x, y, w, h, h * 0.1); ctx.fill();
      const pad = h * 0.15;
      const totalW = c.H + 2 * c.R, totalH = 2 * c.R;
      const sc = Math.min((w - pad * 2) / totalW, (h - pad * 2) / totalH);
      const ox = x + w / 2, oy = y + h / 2;
      const sgn = c.dir === 'L' ? 1 : -1;
      const pt = (p) => {
        p = ((p % c.lap) + c.lap) % c.lap;
        // 直線(下側) → コーナー → 向正面(上側) → コーナー。左回り: 下側を右へ進む
        let px, py;
        const hw = c.H / 2;
        if (p < c.H) { px = -hw + p; py = c.R; }
        else if (p < c.H + c.T) { const a = (p - c.H) / c.R; px = hw + Math.sin(a) * c.R; py = Math.cos(a) * c.R; }
        else if (p < 2 * c.H + c.T) { px = hw - (p - c.H - c.T); py = -c.R; }
        else { const a = (p - 2 * c.H - c.T) / c.R; px = -hw - Math.sin(a) * c.R; py = -Math.cos(a) * c.R; }
        return [ox + px * sc * sgn, oy + py * sc];
      };
      ctx.strokeStyle = race.surf === 'D' ? '#c8a27a' : '#8bc34a'; ctx.lineWidth = Math.max(2, h * 0.06);
      ctx.beginPath();
      for (let p = 0; p <= c.lap; p += c.lap / 80) { const [a, b] = pt(p); p === 0 ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }
      ctx.closePath(); ctx.stroke();
      const [gx, gy] = pt(c.H); ctx.fillStyle = '#fff'; ctx.fillRect(gx - 1, gy - h * 0.12, 2, h * 0.24);
      for (const r of race.runners) {
        const [a, b] = pt(race.pAt(Math.min(r.s, race.D + 40)));
        ctx.fillStyle = r === P ? '#ffeb3b' : 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(a, b, r === P ? h * 0.055 : h * 0.03, 0, 7); ctx.fill();
      }
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }

  window.RaceEngine = { Race, Renderer, fmtTime, makeCourse };
})();
