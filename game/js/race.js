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
      // 道悪の巧拙（芝のみ。-1 苦手 〜 +1 得意）
      const mud = race.surf === 'T' ? (cfg.mud || 0) * race.groundIdx * 0.0022 : 0;
      this.vMax = race.vBase * (1 + (spd - 75) * 0.0011 + mud);
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
      // 馬場状態：芝は湿るほど時計がかかる。ダートは湿ると脚抜きがよくなり少し速くなる（不良まで行くと伸びは小さい）
      const gi = this.groundIdx = Math.max(0, ['良', '稍重', '重', '不良'].indexOf(cfg.ground || '良'));
      this.vBase = baseSpeed(this.D, this.surf) * (this.surf === 'D' ? [1, 1.005, 1.009, 1.004][gi] : [1, 0.992, 0.982, 0.97][gi]);
      // トラックバイアス：lane > 0 は内有利、< 0 は外有利。pace > 0 は前有利、< 0 は差し有利
      this.bias = Object.assign({ lane: 0, pace: 0 }, cfg.bias || {});
      this.runners = cfg.runners.map((r, i) => new Runner(this, r, i));
      this.t = 0; this.gateOpenAt = rnd(2.2, 3.6); this.open = false;
      this.player = this.runners.find(r => r.isPlayer) || null;
      this.done = false; this.events = [];
      // 操作入力: rein 0(抑える)〜1(行かせる), steer -1〜1(画面左右)
      this.input = { power: 0.4, steer: 0 }; // power: 手綱の加減 0(強く抑える)〜1(全力で追う)
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
      if (!p || !p.started || p.finished) return;
      p.whipT = 1.3; p.whips++;
      // 連続使用：2完歩あけずに打つと「連続」と数える。5回を超えると過度の使用として制裁の対象
      if (p.lastWhipPhase != null && p.phase - p.lastWhipPhase < 2) p.whipRun = (p.whipRun || 1) + 1; else p.whipRun = 1;
      p.lastWhipPhase = p.phase;
      if (p.whipRun > 5 && !p.whipOver) { p.whipOver = true; this.msg('ムチの連続使用（制裁の対象）', 1.6, '#ff8a80'); }
      else if (p.whipRun === 5) this.msg('ムチ連続5回。2完歩あけること', 1.2, '#ffb74d');
      // 馬はムチと反対側へ寄る。進行方向の右 = 左回りなら外、右回りなら内
      const rightIsOut = this.course.dir === 'L';
      const towardOut = (side === 'R') === rightIsOut; // ムチ側が外か
      p.whipPushDir = towardOut ? -1 : 1; // 外からムチ→内へ
      p.whipPushT = 0.35;
      p.whipSide = side === 'R' ? 1 : -1;
      if (p.s < this.D - 800) p.kakari = clamp(p.kakari + 0.15, 0, 1);
      if (!this.mods.noSulk && p.whips > 8 && p.tmp > 60 && Math.random() < 0.3) { p.sulkT = 2.5; this.msg('ムチに反抗した', 1.2, '#ff8a80'); }
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
        let latWant = 0; const k0 = curvAt(this.course, this.pAt(r.s));
        if (r.finished) { r.effort = 0.1; latWant = 0; }
        else if (r.auto) { this.ai(r, rem, dt); const lm = r.s < 450 ? 0.9 : k0 > 0 ? 0.55 : rem < 700 ? 0.6 : 0.6; latWant = clamp((r.tx - r.X) * 1.4, -lm, lm); }
        else {
          const inp = this.input;
          // 手綱の加減（0〜1）をそのまま馬への指示にする。急には変わらず、少しずつ伝わる
          const tech = (this.cfg.playerTech || 50) / 120;
          const want = 0.08 + 0.92 * clamp(inp.power, 0, 1);
          if (r.effort < want) r.effort = Math.min(want, r.effort + dt * (0.9 + tech));
          else r.effort = Math.max(want, r.effort - dt * 1.6);
          r.drive = clamp((r.effort - 0.6) / 0.4, 0, 1); // 追っている度合い（表示と騎手の動き用）
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
        // トラックバイアス（内外）：内ラチ沿いと外めで伸びが違う
        if (this.bias.lane) f *= 1 + this.bias.lane * 0.012 * (0.5 - Math.min(1, r.X / 7));
        r.grade = gr;
        let vT = r.vMax * f;
        vT *= r.st < 0.25 ? 0.9 + 0.4 * Math.max(0, r.st) : 1;
        // バテ：脚が上がった状態が長く続くほど、どんどん止まる（早仕掛けの代償）
        if (r.st < 0.25 && !r.finished) r.bate = (r.bate || 0) + dt;
        if (r.bate) vT *= 1 - Math.min(0.16, Math.pow(r.bate / 22, 2) * 0.16);
        if (r.checkedT > 0) { r.checkedT -= dt; vT *= 0.94; }
        // 発馬直後は強く加速（0→時速50km台まで約3秒）、その後はゆるやかに
        const acc = (r.s < 260 && r.v < this.vBase * 0.55 ? 7.0 : r.s < 260 && r.v < this.vBase * 0.85 ? 4.6 : r.v < this.vBase * 0.8 ? 1.2 : 0.2 + r.kick * 0.0028) * (M.sprint ? 1.1 : 1);
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
          // トラックバイアス（脚質）：前有利の馬場では前の馬が楽をし、差し有利では逆
          if (this.bias.pace) drain *= 1 + this.bias.pace * 0.1 * ((r.rank - 1) / Math.max(1, R.length - 1) - 0.5) * 2;
          drain *= 1 + 0.9 * r.kakari;
          if (r.whipT > 0) drain *= 1.08;
          drain *= 1 + 7 * Math.max(0, r.grade || 0) - 3 * Math.max(0, -(r.grade || 0));
          if (r.effort > 0.7) drain = Math.max(drain, r.drainBase * 1.05); // 追っている間は、失速していても脚を使う
          r.st = Math.max(0, r.st - drain * dt);
        }
        // 横の動き：意図 + 疲れによるヨレ + ムチによる修正
        let lat = latWant;
        if (r.started && !r.finished && r.st < 0.3 && r.effort > 0.7) lat += r.lean * (0.3 - r.st) * 2 * (r.auto ? 0.3 : 1);
        if (r.whipPushT > 0) { r.whipPushT -= dt; lat += r.whipPushDir * (r.auto ? 0 : 0.1); }
        r.latV += (lat - r.latV) * Math.min(1, dt * 4);
        let dX = r.latV * dt;
        if (Math.abs(dX) > 1e-4) {
          const nx = r.X + dX;
          for (const o of R) {
            if (o === r) continue;
            const ds = o.s - r.s;
            if (Math.sign(o.X - r.X) !== Math.sign(dX)) continue;
            // 斜行：すぐ後ろ（半馬身ほど以内）の馬の前へ、その馬が追いついてくる勢いのまま入ると、相手は手綱を引かされる
            //  発走直後のもみ合いは数えない。自分で寄せた（◀▶）ときは重く、疲れやムチで流れたときは軽く数える
            if (ds < 0 && ds > -1.5 && Math.abs(o.X - nx) < 0.9 && !r.auto && r.started && r.s > 60 && o.v > r.v - 0.25) {
              const close = 1 - (-ds) / 1.5, own = Math.abs(this.input.steer) > 0.1 ? 1 : 0.35;
              o.checkedT = Math.max(o.checkedT, 0.5 * close);
              const add = dt * 2.6 * close * own;
              r.foul += add; r.fouled[o.num] = (r.fouled[o.num] || 0) + add;
              if (close > 0.3 && own === 1 && (!this._foulMsg || this.t - this._foulMsg > 2.5)) { this._foulMsg = this.t; this.msg('他馬の前をカット（審議の対象）', 1.0, '#ff5252'); this.emit('foul'); }
            }
            if (Math.abs(ds) < 2.3 && Math.abs(o.X - nx) < 0.95) {
              if (!r.auto && Math.abs(r.latV) > 0.9 && r.s > 60) { r.sideContact = 0.3; o.v -= 0.15; r.v -= 0.1; r.foul += dt * 0.3; r.fouled[o.num] = (r.fouled[o.num] || 0) + dt * 0.1; this.emit('bump'); }
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
        // かかり・前が壁は、画面の札（手綱の上）で知らせるので、ここでは馬のヨレだけ
        if (p.st < 0.3 && p.effort > 0.7 && Math.abs(p.lean) > 0.15 && free && rem < 500 && !this._yore) { this._yore = true; this.msg('馬がヨレている', 1.0, '#ffb74d'); }
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
        if (rem < 380 && r.whipT <= 0 && r.whips < 12 && Math.random() < 0.6 * dt) { r.whipT = 1.3; r.whips++; r.whipSide = Math.random() < 0.7 ? 1 : -1; }
      } else if (r.s < Math.min(420, this.D * 0.25)) r.effort = [0.95, 0.72, 0.48, 0.32][r.style];
      else {
        let e = 0.5;
        if (posFrac > target + 0.18) e = 0.6; else if (posFrac < target - 0.18) e = 0.4;
        if (r.style === 0 && r.rank > 1) e = 0.66;
        if (r.kakari > 0.4) e = Math.max(e, 0.55);
        r.effort = e;
      }
      // 外から内へ入りたいのに、すぐ内に馬が並んでいる：先行型は脚を使って前に出てから、差し・追込型は少し下げて後ろから入る
      if (r.inBlocked && !(rem < r.spurtAt) && r.s < 700) r.effort = r.style <= 1 ? Math.max(r.effort, 0.85) : Math.min(r.effort, 0.3);
      if (r.think > 0) return;
      r.think = 0.25 + Math.random() * 0.2;
      this.chooseLane(r, rem);
    }

    // ---- 進路の選び方（CP） ----
    //  序盤：内ラチ沿いを目指して、並んでいる馬の前か後ろから内へ寄る
    //  道中：内が空けば内へ。前の馬の後ろについて風よけにする（差し・追込）
    //  直線：前が詰まっていれば、空いている所へ外へ持ち出す。空いていればまっすぐ
    chooseLane(r, rem) {
      const W = this.course.width, R = this.runners;
      const lane = (x) => {
        let ahead = 60, side = false;
        for (const o of R) {
          if (o === r || o.finished) continue;
          if (Math.abs(o.X - x) >= 1.0) continue;
          const ds = o.s - r.s;
          if (ds > -2.7 && ds < 2.7 && Math.abs(x - r.X) > 0.25) side = true; // 移りたい進路の真横に馬がいる
          if (ds >= 2.7 && ds < ahead) ahead = ds;
        }
        return { ahead, side };
      };
      const k = curvAt(this.course, this.pAt(r.s));
      const corner = k > 0;
      const spurt = rem < r.spurtAt * (r.st < 0.35 ? 0.7 : 1);
      const late = rem < 700;
      const here = lane(r.X);
      const lb = this.bias.lane || 0;
      let tx = r.X;
      r.inBlocked = false;
      if (late && !corner && spurt) {
        // 直線の追い比べ：前が8m以内に詰まっていたら、近い順に外（または内）の空いた進路を探す
        const wantOut = lb < -0.35 && r.X < 5;
        if (here.ahead < 8 || wantOut) {
          let best = null;
          for (const d of [1.1, -1.1, 2.2, 3.3, -2.2, 4.4]) {
            const x = r.X + d; if (x < 0.7 || x > W - 0.7) continue;
            const L = lane(x); if (L.side) continue;
            const sc = Math.min(L.ahead, 30) - Math.abs(d) * 1.5 + (wantOut && d > 0 ? 8 : 0) + (lb > 0.35 && d < 0 ? 4 : 0);
            if (L.ahead >= 12 && (!best || sc > best.sc)) best = { x, sc };
          }
          if (best) tx = best.x;
        }
      } else {
        // 内へ寄せる：1頭分内が空いていれば寄る。内に並ばれていたら、前後どちらかへずれてから入る
        // 道中に通りたい進路（1頭目＝内ラチ沿い・2頭目・3頭目）。外枠ほど外を回りやすい。コーナーでは1頭分内を狙う
        if (r.pref == null) { const u = Math.random() + (r.num / R.length - 0.5) * 0.35; r.pref = u < 0.45 ? 0 : u < 0.8 ? 1 : 2; }
        const floor = 0.8 + 1.05 * Math.max(0, r.pref - (corner ? 1 : 0));
        const xin = Math.max(floor, r.X - 1.05);
        if (r.X > xin + 0.3) {
          const L = lane(xin);
          const roomAhead = L.ahead >= (r.s < 400 ? 2.7 : 4);
          if (!L.side && roomAhead) tx = xin;
          else if (L.side) r.inBlocked = true;
        }
        // 前の馬にふさがれて抑えすぎになる先行・逃げ馬は、外へ1頭分出して前へ
        if (!late && r.style <= 1 && here.ahead < 3.5 && r.s > 250) {
          const L = lane(r.X + 1.05); if (!L.side && L.ahead > 8) tx = r.X + 1.05;
        }
        // 直線の手前（4コーナー）から、差し・追込で前が壁なら早めに外へ
        if (late && corner && spurt && r.style >= 2 && here.ahead < 6) {
          const L = lane(r.X + 1.05); if (!L.side) tx = r.X + 1.05;
        }
      }
      r.tx = Math.max(0.7, Math.min(W - 0.7, tx));
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
      if (p && p.foul > 0.8) {
        const me = res.find(x => x.runner === p);
        const victims = Object.keys(p.fouled).map(Number);
        const behind = res.filter(x => victims.includes(x.runner.num) && x.pos > me.pos && x.pos - me.pos <= 3);
        const severe = p.foul > 1.5;
        const demoteTo = behind.length && severe ? behind[behind.length - 1].pos : null;
        // 過怠金で済むことが多く、騎乗停止は大きく何度も進路を妨げたときだけ
        const weeks = p.foul > 3.2 ? 4 : p.foul > 2.2 ? 2 : p.foul > 1.5 ? 1 : 0;
        this.inquiry = { foul: Math.round(p.foul * 10) / 10, demoteTo, weeks, fine: weeks === 0 ? 5 : 0 };
        if (demoteTo) {
          res.splice(res.indexOf(me), 1);
          res.splice(demoteTo - 1, 0, me);
          res.forEach((x, i) => x.pos = i + 1);
          me.demoted = true;
        }
      }
      if (p && p.whipOver) { this.inquiry = this.inquiry || { foul: 0, demoteTo: null, weeks: 0, fine: 0 }; this.inquiry.whip = true; this.inquiry.fine = (this.inquiry.fine || 0) + 1; }
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
    // 先に0.1秒単位に丸めてから分と秒に分ける（59.97秒が「1:60.0」にならないように）
    const d = Math.round(t * 10), m = Math.floor(d / 600), s = (d - m * 600) / 10;
    return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(1);
  }

  window.RaceEngine = { Race, fmtTime, makeCourse, courseXY, curvAt, sectionName, STRIDE, elevAt, slopeAt };
})();
