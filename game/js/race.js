// ===== レースエンジン（描画とは独立。オート騎乗・見送りレースもこれで計算する） =====
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const STRIDE = 7.0; // ギャロップ1完歩の長さ(m)の目安

  // ---- コース形状 ----
  function makeCourse(venueKey, surf) {
    const V = VENUES[venueKey];
    let lap = V.lap * (surf === 'D' ? 0.88 : 1);
    const H = V.straight * (surf === 'D' ? 0.93 : 1);
    let T = (lap - 2 * H) / 2;
    if (T < 260) { T = 260; lap = 2 * H + 2 * T; }
    const c = { key: venueKey, dir: V.dir, lap, H, T, R: T / Math.PI, name: V.name, width: surf === 'D' ? 22 : 27, surf };
    // 起伏：基準点を1周上の距離（ゴールからの距離）に直す
    const at = { g: 0, c2: T, bm: T + H / 2, c3: T + H, c34: T + H + T / 2, c4: 2 * T + H };
    let pts = (V.elev || [['g', 0, 0]]).map(([k, off, h]) => [k === 'r' ? lap - off : at[k] + off, h]);
    if (surf === 'D' && V.elev) { // ダートは全体の高低差に合わせて縮める
      const hs = pts.map(x => x[1]), rng = Math.max(...hs) - Math.min(...hs) || 1;
      const k = (V.dirtElev ?? rng) / rng; pts = pts.map(([d, h]) => [d, h * k]);
    }
    pts = pts.map(([d, h]) => [Math.max(0, Math.min(lap - 1, d)), h]).sort((a, b) => a[0] - b[0]);
    c.elevPts = pts;
    return c;
  }
  // 高さ（m）：ゴールからの距離で線形補間し、角をなめらかにする
  function elevAt(c, p) {
    const P = c.elevPts; if (!P || P.length < 2) return P && P[0] ? P[0][1] : 0;
    const d = (((p - c.H) % c.lap) + c.lap) % c.lap;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = i + 1 < P.length ? P[i + 1] : [P[0][0] + c.lap, P[0][1]];
      if (d >= a[0] && d < b[0]) { const t = (d - a[0]) / (b[0] - a[0]); const st = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * st; }
    }
    const a = P[P.length - 1], b = [P[0][0] + c.lap, P[0][1]];
    const t = (d + c.lap - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t);
  }
  function slopeAt(c, p) { return (elevAt(c, p + 2) - elevAt(c, p - 2)) / 4; }
  const wrap = (c, p) => ((p % c.lap) + c.lap) % c.lap;
  // p: 1周上の位置。[0,H)=最後の直線（p=H がゴール）
  function curvAt(c, p) {
    p = wrap(c, p);
    if (p >= c.H && p < c.H + c.T) return 1 / c.R;
    if (p >= 2 * c.H + c.T) return 1 / c.R;
    return 0;
  }
  function sectionName(c, p) {
    p = wrap(c, p);
    if (p < c.H) return '直線';
    if (p < c.H + c.T) return '1〜2コーナー';
    if (p < 2 * c.H + c.T) return '向正面';
    return '3〜4コーナー';
  }
  // 平面座標（x,z）。X は内ラチからの距離。左回りは内側が進行方向の左。
  function courseXY(c, p, X) {
    p = wrap(c, p);
    const s = c.dir === 'L' ? -1 : 1; // 内側(中心)のz方向
    const H = c.H, T = c.T, R = c.R;
    let x, z, hx, hz, nx, nz;
    if (p < H) { x = -H / 2 + p; z = 0; hx = 1; hz = 0; nx = 0; nz = -s; }
    else if (p < H + T) {
      const a = (p - H) / R; const cx = H / 2, cz = s * R;
      x = cx + R * Math.sin(a); z = cz - s * R * Math.cos(a);
      hx = Math.cos(a); hz = s * Math.sin(a); nx = Math.sin(a); nz = -s * Math.cos(a);
    } else if (p < 2 * H + T) { const q = p - H - T; x = H / 2 - q; z = 2 * s * R; hx = -1; hz = 0; nx = 0; nz = s; }
    else {
      const a = (p - 2 * H - T) / R; const cx = -H / 2, cz = s * R;
      x = cx - R * Math.sin(a); z = cz + s * R * Math.cos(a);
      hx = -Math.cos(a); hz = -s * Math.sin(a); nx = -Math.sin(a); nz = s * Math.cos(a);
    }
    return { x: x + nx * X, z: z + nz * X, hx, hz, nx, nz };
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
      if (h.surf !== 'B' && h.surf !== race.surf) spd -= 6;
      spd -= ((cfg.weight || 56) - 56) * 0.6;
      spd += rnd(-3.5, 3.5) * (cfg.formNoise ?? 1) + (cfg.condBonus || 0);
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
      this.phase = Math.random(); // 完歩の位相 0..1
      this.lateStart = false;
      this.lean = (Math.random() < 0.5 ? -1 : 1) * rnd(0.05, 0.25); // 疲れた時にヨレる癖
      this.drive = 0; this.rhythmT = 0; this.latV = 0; this.whipPushT = 0; this.whipPushDir = 0;
      this.foul = 0; this.fouled = {}; this.checkedT = 0; this.sideContact = 0; this.sulkT = 0;
      this.whipSide = 1;
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
      this.t = 0; this.gateOpenAt = rnd(2.2, 3.6); this.open = false;
      this.player = this.runners.find(r => r.isPlayer) || null;
      this.done = false; this.events = [];
      // 操作入力: rein 0(抑える)〜1(行かせる), steer -1〜1(画面左右)
      this.input = { rein: 0.5, steer: 0, push: false };
      this.message = null;
      this.leaderSplits = []; this.playerSplits = []; this.player3F = null;
      this.onEvent = null;
      this.mods = cfg.mods || {};
    }
    pAt(s) { return this.startP + s; }
    emit(type, data) { if (this.onEvent) this.onEvent(type, data || {}); }
    msg(text, dur = 1.6, color = '#fff') { this.message = { text, until: this.t + dur, color }; }

    // ---- プレイヤー操作 ----
    playerStart() {
      const p = this.player;
      if (!p || p.started || p.reaction != null) return;
      if (!this.open) { p.reaction = 0.55; this.msg('ゲートに突進…出負け', 1.4, '#ffb74d'); }
      else {
        const d = Math.max(0, this.t - this.gateOpenAt - (this.mods.start || 0));
        p.reaction = d;
        if (d < 0.2) this.msg('好スタート!', 1.4, '#9be27a');
        else if (d > 0.6) this.msg('出遅れ!', 1.6, '#ff8a80');
      }
    }
    // 押す：完歩のリズムに合わせて押すほど伸びる
    push() {
      const p = this.player;
      if (!p || !p.started || p.finished) return 0;
      const ph = p.phase % 1; // 0 が「首が伸びきる」タイミング
      const diff = Math.min(ph, 1 - ph);
      const q = clamp(1 - diff / 0.22, 0, 1);
      p.drive = clamp(p.drive + 0.22 + 0.2 * q, 0, 1.25);
      if (q < 0.2) { p.rhythmT = 0.5; this.msg('リズムが合わない', 0.6, '#ffb74d'); }
      this.emit('push', { q });
      return q;
    }
    whip(side) { // side: 'L' | 'R'（騎手から見て）
      const p = this.player;
      if (!p || !p.started || p.finished || p.whips >= 10) return;
      p.whipT = 1.3; p.whips++;
      // 馬はムチと反対側へ寄る。進行方向の右 = 左回りなら外、右回りなら内
      const rightIsOut = this.course.dir === 'L';
      const towardOut = (side === 'R') === rightIsOut; // ムチ側が外か
      p.whipPushDir = towardOut ? -1 : 1; // 外からムチ→内へ
      p.whipPushT = 0.5;
      p.whipSide = side === 'R' ? 1 : -1;
      if (p.s < this.D - 800) p.kakari = clamp(p.kakari + 0.15, 0, 1);
      if (!this.mods.noSulk && p.whips > 6 && p.tmp > 60 && Math.random() < 0.35) { p.sulkT = 2.5; this.msg('ムチに反抗した', 1.2, '#ff8a80'); }
      this.emit('whip', { side });
    }

    step(dt) {
      this.t += dt;
      if (!this.open && this.t >= this.gateOpenAt) { this.open = true; this.msg('スタート!', 1.0); this.emit('gate'); }
      const R = this.runners;
      const order = R.slice().sort((a, b) => b.s - a.s);
      order.forEach((r, i) => r.rank = i + 1);
      const leader = order[0];
      if (this.open) {
        const k = Math.floor(leader.s / 200);
        if (k > 0 && !this.leaderSplits[k]) this.leaderSplits[k] = this.t - this.gateOpenAt;
        const pl = this.player;
        if (pl) { const kp = Math.floor(Math.min(pl.s, this.D) / 200); if (kp > 0 && !this.playerSplits[kp]) this.playerSplits[kp] = this.t - this.gateOpenAt; if (!this.player3F && pl.s >= this.D - 600) this.player3F = this.t - this.gateOpenAt; }
      }
      for (const r of R) {
        if (!r.started) {
          if (!this.open) continue;
          if (r.isPlayer && !r.auto && r.reaction == null && this.t - this.gateOpenAt > 1.2) { r.reaction = 1.2; this.msg('大きく出遅れた!', 1.6, '#ff8a80'); }
          if (r.reaction != null && this.t - this.gateOpenAt >= r.reaction) { r.started = true; r.v = 3.0; if (r.reaction > 0.6) r.lateStart = true; } // ゲートを蹴って一気に飛び出す
          else continue;
        }
        r.phase += dt * Math.max(0.6, r.v / STRIDE);
        const rem = this.D - r.s;
        let ahead = null, aheadGap = 99; r.covered = false;
        for (const o of R) {
          if (o === r) continue;
          const ds = o.s - r.s, dx = Math.abs(o.X - r.X);
          if (ds > 0 && ds < 8 && dx < 1.25) r.covered = true;
          if (ds > 0 && dx < 0.95 && ds < aheadGap) { aheadGap = ds; ahead = o; }
        }
        let latWant = 0;
        if (r.finished) { r.effort = 0.1; latWant = 0; }
        else if (r.auto) { this.ai(r, rem, dt); latWant = clamp((r.tx - r.X) * 1.6, -1.1, 1.1); }
        else {
          const inp = this.input;
          const eRein = 0.08 + inp.rein * 0.74; // 0.08〜0.82
          // 追う：押している間、騎手が完歩に合わせて自動で押し、追いが段々強まる
          if (inp.push) r.drive = Math.min(1.1, r.drive + dt * (1.1 + (this.cfg.playerTech || 50) / 120));
          else r.drive = Math.max(0, r.drive - dt * 0.85);
          const eDrive = r.drive > 0.05 ? 0.6 + 0.4 * Math.min(1, r.drive) : 0;
          r.effort = Math.max(eRein, eDrive);
          if (r.rhythmT > 0) r.rhythmT -= dt;
          const sgn = this.course.dir === 'L' ? 1 : -1; // 画面右 = X増加（左回り）
          latWant = inp.steer * 1.5 * sgn;
        }
        if (!r.finished && r.started) {
          const early = r.s < this.D - 700;
          const skill = (r.isPlayer && !r.auto ? (this.cfg.playerTech || 50) : r.jSkill) / 100;
          let gain = 0;
          if (early && r.effort < 0.45 && !r.covered) gain = r.tmp / 100 * 0.16 * (r.effort < 0.2 ? 1.6 : 1);
          else if (early && !r.covered && r.effort <= 0.55) gain = r.tmp / 100 * 0.05;
          gain *= (1.2 - skill * 0.7) * (r.isPlayer ? (this.mods.calm || 1) : 1);
          const loss = (r.covered ? 0.12 : 0.04) + (r.effort >= 0.7 ? 0.08 : 0);
          r.kakari = clamp(r.kakari + (gain - loss) * dt, 0, 1);
          if (r.kakari > 0.8) r.effort = Math.max(r.effort, 0.8);
        }
        let f = 0.93 + 0.09 * Math.min(1, r.effort);
        if (r.effort >= 0.95) f += (r.kick - 70) * 0.0006 + (rem < 500 ? 0.006 : 0) + (r.style >= 2 && rem < 600 ? 0.007 : 0);
        const M = r.isPlayer ? this.mods : {};
        if (r.whipT > 0) { r.whipT -= dt; if (r.effort > 0.9 && r.st > 0.05) f += 0.012 * (M.whip || 1); }
        if (M.closer && r.style >= 2 && rem < 600 && r.effort >= 0.95) f += 0.004;
        if (r.rhythmT > 0) f -= 0.015;
        if (r.sulkT > 0) { r.sulkT -= dt; f -= 0.02; }
        const gr = slopeAt(this.course, this.pAt(r.s)); // 上り坂ほど遅く
        f *= 1 - 0.55 * gr;
        r.grade = gr;
        let vT = r.vMax * f;
        vT *= r.st < 0.25 ? 0.935 + 0.26 * Math.max(0, r.st) : 1;
        if (r.checkedT > 0) { r.checkedT -= dt; vT *= 0.94; }
        // 発馬直後は強く加速（0→時速50km台まで約3秒）、その後はゆるやかに
        const acc = (r.v < this.vBase * 0.55 ? 7.0 : r.v < this.vBase * 0.85 ? 4.6 : 0.45 + r.kick * 0.004) * (M.sprint ? 1.1 : 1);
        if (r.v < vT) r.v = Math.min(vT, r.v + acc * dt); else r.v = Math.max(vT, r.v - 0.8 * dt);
        r.blocked = false;
        if (ahead && aheadGap < 3.0) {
          r.blocked = aheadGap < 2.4 && r.effort >= 0.5;
          const cap = ahead.v - (aheadGap < 1.7 ? (M.inside ? 0.15 : 0.35) : 0.05);
          if (r.v > cap) r.v = Math.max(0, cap);
        }
        if (!r.finished) {
          let drain = r.drainBase * Math.pow(r.v / (this.vBase * 0.975), 6);
          if (r.covered) drain *= 0.86;
          if (r.rank === 1) drain *= M.front ? 1.0 : 1.06;
          if (M.stayer) drain *= 0.96;
          drain *= 1 + 0.9 * r.kakari;
          if (r.whipT > 0) drain *= 1.08;
          drain *= 1 + 7 * Math.max(0, r.grade || 0) - 3 * Math.max(0, -(r.grade || 0));
          r.st = Math.max(0, r.st - drain * dt);
        }
        // 横の動き：意図 + 疲れによるヨレ + ムチによる修正
        let lat = latWant;
        if (r.started && !r.finished && r.st < 0.4 && r.effort > 0.7) lat += r.lean * (0.4 - r.st) * 5 * (r.auto ? 0.3 : 1);
        if (r.whipPushT > 0) { r.whipPushT -= dt; lat += r.whipPushDir * 1.2; }
        r.latV += (lat - r.latV) * Math.min(1, dt * 4);
        let dX = r.latV * dt;
        if (Math.abs(dX) > 1e-4) {
          const nx = r.X + dX;
          for (const o of R) {
            if (o === r) continue;
            const ds = o.s - r.s;
            if (Math.sign(o.X - r.X) !== Math.sign(dX)) continue;
            if (ds < 0 && ds > -2.6 && Math.abs(o.X - nx) < 0.95 && !r.auto && r.started) {
              o.checkedT = 0.6; r.foul += dt * 3; r.fouled[o.num] = (r.fouled[o.num] || 0) + dt;
              if (!this._foulMsg || this.t - this._foulMsg > 2) { this._foulMsg = this.t; this.msg('他馬の進路をカット!', 1.0, '#ff5252'); this.emit('foul'); }
            }
            if (Math.abs(ds) < 2.3 && Math.abs(o.X - nx) < 0.95) {
              if (!r.auto && Math.abs(r.latV) > 0.6) { r.sideContact = 0.3; o.v -= 0.15; r.v -= 0.1; r.foul += dt * 0.8; r.fouled[o.num] = (r.fouled[o.num] || 0) + dt * 0.3; this.emit('bump'); }
              dX = 0;
              break;
            }
          }
          r.X = clamp(r.X + dX, 0.6, this.course.width - 0.6);
          if (r.X <= 0.6 || r.X >= this.course.width - 0.6) r.latV = 0;
        }
        if (r.sideContact > 0) r.sideContact -= dt;
        const k = curvAt(this.course, this.pAt(r.s));
        const prog = k > 0 ? this.course.R / (this.course.R + r.X) : 1;
        const prevS = r.s;
        r.s += r.v * prog * dt;
        if (!r.finished && r.s >= this.D) {
          r.finished = true;
          const frac = (this.D - prevS) / Math.max(1e-6, r.s - prevS);
          r.finishTime = this.t - dt + frac * dt - this.gateOpenAt;
          if (r === this.player) { this.msg('ゴール!', 2.2); this.emit('finish'); }
        }
      }
      const p = this.player;
      if (p && !p.finished && p.started && !p.auto) {
        const rem = this.D - p.s;
        if (!this._m600 && rem < 600) { this._m600 = true; this.msg('残り600m', 1.2, '#ffd54f'); }
        if (!this._m200 && rem < 200) { this._m200 = true; this.msg('ラスト200m!', 1.2, '#ffd54f'); }
        const free = !this.message || this.t > this.message.until;
        if (p.kakari > 0.7 && free) this.msg('かかっている! 馬の後ろに入れて', 0.9, '#ff8a65');
        else if (p.blocked && rem < 700 && free) this.msg('前が壁! 進路を探せ', 0.8, '#ff8a65');
        else if (p.st < 0.3 && p.effort > 0.7 && Math.abs(p.lean) > 0.15 && free && rem < 500) this.msg('馬がヨレている', 0.8, '#ffb74d');
      }
      if (R.every(r => r.finished)) this.done = true;
      if (this.t > 600) { R.forEach(r => { if (!r.finished) { r.finished = true; r.finishTime = this.t + (this.D - r.s) / 10; } }); this.done = true; }
    }

    // 先頭の200m（1ハロン）ごとのラップタイム。距離が200で割り切れない場合は最初の区間が短い
    laps(arr) {
      const sp = arr || this.leaderSplits, out = [];
      let prev = 0;
      for (let k = 1; k < sp.length; k++) { if (sp[k] == null) break; out.push(sp[k] - prev); prev = sp[k]; }
      return out;
    }
    pace() {
      const k = Math.min(this.leaderSplits.length - 1, Math.floor(this.D / 400));
      if (k < 3 || !this.leaderSplits[k]) return null;
      const v = k * 200 / this.leaderSplits[k];
      const ratio = v / (this.vBase * 0.975 * 0.97);
      return ratio > 1.012 ? 'ハイ' : ratio < 0.985 ? 'スロー' : '平均';
    }

    ai(r, rem, dt) {
      r.think -= dt;
      const n = this.runners.length;
      const posFrac = (r.rank - 1) / Math.max(1, n - 1);
      const target = [0, 0.22, 0.58, 0.88][r.style];
      if (rem < r.spurtAt * (r.st < 0.35 ? 0.7 : 1)) {
        r.effort = 1;
        if (rem < 380 && r.whipT <= 0 && r.whips < 10 && Math.random() < 0.6 * dt) { r.whipT = 1.3; r.whips++; r.whipSide = Math.random() < 0.7 ? 1 : -1; }
      } else if (r.s < Math.min(420, this.D * 0.25)) r.effort = [0.95, 0.72, 0.48, 0.32][r.style];
      else {
        let e = 0.5;
        if (posFrac > target + 0.18) e = 0.6; else if (posFrac < target - 0.18) e = 0.4;
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
      if (this._results) return this._results;
      const R = this.runners.slice().sort((a, b) => a.finishTime - b.finishTime);
      const win = R[0];
      const res = R.map((r, i) => {
        let margin = '';
        if (i > 0) margin = lenStr((r.finishTime - R[i - 1].finishTime) * (this.D / win.finishTime) / 2.4);
        return { runner: r, horse: r.horse, cfg: r.cfg, pos: i + 1, time: r.finishTime, margin, lateStart: r.lateStart };
      });
      // 審議（プレイヤーの斜行・接触）
      const p = this.player;
      this.inquiry = null;
      if (p && p.foul > 0.6) {
        const me = res.find(x => x.runner === p);
        const victims = Object.keys(p.fouled).map(Number);
        const behind = res.filter(x => victims.includes(x.runner.num) && x.pos > me.pos && x.pos - me.pos <= 3);
        const severe = p.foul > 2.2;
        const demoteTo = behind.length && severe ? behind[behind.length - 1].pos : null;
        const weeks = p.foul > 3.5 ? 4 : p.foul > 2.2 ? 2 : p.foul > 1.2 ? 1 : 0;
        this.inquiry = { foul: Math.round(p.foul * 10) / 10, demoteTo, weeks, fine: weeks === 0 ? 5 : 0 };
        if (demoteTo) {
          res.splice(res.indexOf(me), 1);
          res.splice(demoteTo - 1, 0, me);
          res.forEach((x, i) => x.pos = i + 1);
          me.demoted = true;
        }
      }
      this._results = res;
      return res;
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
    return whole + (frac < 0.25 ? '' : frac < 0.5 ? ' 1/4' : frac < 0.75 ? ' 1/2' : ' 3/4');
  }
  function fmtTime(t) {
    if (t == null || !isFinite(t)) return '--';
    const m = Math.floor(t / 60), s = t - m * 60;
    return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(1);
  }

  window.RaceEngine = { Race, fmtTime, makeCourse, courseXY, curvAt, sectionName, STRIDE, elevAt, slopeAt };
})();
