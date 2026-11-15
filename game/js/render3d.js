// ===== 3D レース描画（Three.js） =====
(function () {
  const T = THREE;
  T.ColorManagement.legacyMode = false;
  const CXY = RaceEngine.courseXY;
  const ASSET = (window.ASSET_BASE || 'assets/');
  const rnd = (a, b) => a + Math.random() * (b - a);

  // 乱数（場ごとに配置を固定する）
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  const texCache = {};
  function loadTex(name, repeat) {
    if (texCache[name]) return texCache[name];
    // 読み込みに失敗しても先へ進めるよう、失敗も「済み」として数える
    const t = new T.TextureLoader().load(ASSET + name, () => { Render3D.loaded++; }, undefined, () => { Render3D.loaded++; console.warn('texture failed', name); });
    Render3D.toLoad++;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    if (!/_n\./.test(name)) t.encoding = T.sRGBEncoding;
    return (texCache[name] = t);
  }

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  class Render3D {
    constructor(container) {
      this.container = container;
      const r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      r.outputEncoding = T.sRGBEncoding;
      r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.physicallyCorrectLights = false;
      container.appendChild(r.domElement);
      r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(60, 2, 0.08, 6000);
      this.camMode = 'jockey';
      this.clock = 0;
      this.buildSky();
      this.buildLights();
      this.particles = this.buildParticles();
      this.raceGroup = null;
      this.quality = 1;
    }
    buildSky() {
      const sky = loadTex('sky.jpg');
      sky.mapping = T.EquirectangularReflectionMapping; sky.wrapS = T.ClampToEdgeWrapping;
      this.scene.background = sky;
      const pm = new T.PMREMGenerator(this.renderer);
      const self = this;
      const img = new Image();
      img.onload = () => {
        const t = new T.Texture(img); t.mapping = T.EquirectangularReflectionMapping; t.encoding = T.sRGBEncoding; t.needsUpdate = true;
        self.scene.environment = pm.fromEquirectangular(t).texture;
      };
      img.src = ASSET + 'sky.jpg';
      this.scene.fog = new T.Fog('#cdd9e3', 500, 4200);
    }
    buildLights() {
      const hemi = new T.HemisphereLight('#d6e8ff', '#5d6b3a', 0.55);
      this.scene.add(hemi);
      const sun = this.sun = new T.DirectionalLight('#fff1dc', 2.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      this.scene.add(sun); this.scene.add(sun.target);
      this.sunDir = new T.Vector3(0.45, 0.75, -0.48).normalize();
    }
    buildParticles() {
      const N = 900;
      const g = new T.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const sprite = canvasTex(32, 32, (x) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); });
      const m = new T.PointsMaterial({ size: 0.09, map: sprite, vertexColors: true, transparent: true, depthWrite: false });
      const pts = new T.Points(g, m); pts.frustumCulled = false;
      this.scene.add(pts);
      return { pts, pos, col, vel: new Float32Array(N * 3), life: new Float32Array(N), N, i: 0 };
    }
    emit(x, y, z, vx, vy, vz, c) {
      const P = this.particles; const i = P.i = (P.i + 1) % P.N;
      (P.floor || (P.floor = new Float32Array(P.N)))[i] = y - 0.07;
      P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
      P.col[i * 3] = c.r; P.col[i * 3 + 1] = c.g; P.col[i * 3 + 2] = c.b; P.life[i] = rnd(0.5, 0.9);
    }
    stepParticles(dt) {
      const P = this.particles;
      for (let i = 0; i < P.N; i++) {
        if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -100; continue; }
        P.life[i] -= dt;
        P.vel[i * 3 + 1] -= 9.8 * dt;
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        const fl = P.floor ? P.floor[i] : 0;
        if (P.pos[i * 3 + 1] < fl) { P.pos[i * 3 + 1] = fl + 0.01; P.vel[i * 3] *= 0.5; P.vel[i * 3 + 2] *= 0.5; P.vel[i * 3 + 1] = 0; }
      }
      P.pts.geometry.attributes.position.needsUpdate = true;
      P.pts.geometry.attributes.color.needsUpdate = true;
    }

    // ---------- コースとレースのセットアップ ----------
    setupRace(race, info) {
      if (this.raceGroup) { this.scene.remove(this.raceGroup); this.disposeGroup(this.raceGroup); }
      const G = this.raceGroup = new T.Group();
      this.scene.add(G);
      this.race = race; this.info = info || {};
      const c = race.course;
      this.buildCourse(G, c, race);
      this.buildGate(G, race);
      // 馬
      this.horses = race.runners.map((r, i) => {
        const h = r.horse;
        const m = Horse3D.create({
          coat: Horse3D.coatFor(h), coatKey: h.coatKey, number: r.num, raceLabel: info.label || '',
          silks: r.cfg.silks || { base: r.color, accent: '#ffffff', pattern: 'plain', cap: r.color },
          socks: h.socks || [], hood: h.hood || null, isPlayer: r.isPlayer,
        });
        G.add(m.root);
        return m;
      });
      this.playerModel = this.horses[race.runners.indexOf(race.player)];
      this.camYaw = null;
      this.lastPhase = race.runners.map(r => r.phase);
      this.screenT = 0;
      this.resize();
    }
    disposeGroup(g) {
      g.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); });
    }

    // 平面座標の点がコースの内ラチから外へどれだけ離れているか（負=内側）
    Xof(c, x, z) {
      const s = c.dir === 'L' ? -1 : 1, H = c.H, R = c.R;
      if (x > H / 2) return Math.hypot(x - H / 2, z - s * R) - R;
      if (x < -H / 2) return Math.hypot(x + H / 2, z - s * R) - R;
      const zz = z * s;
      if (zz >= 0 && zz <= 2 * R) return -Math.min(zz, 2 * R - zz);
      return zz < 0 ? -zz : zz - 2 * R;
    }

    ribbon(c, X0, X1, y, mat, opts = {}) {
      const step = opts.step || 2, n = Math.ceil(c.lap / step);
      const pos = [], uv = [], col = [], idx = [];
      const us = opts.uvScale || 6;
      for (let i = 0; i <= n; i++) {
        const p = Math.min(c.lap, i * step);
        const a = CXY(c, p, X0), b = CXY(c, p, X1);
        const ya = typeof y === 'function' ? y(p, X0) : y + (this.E && !opts.flat ? this.E(p) : 0), yb = typeof y === 'function' ? y(p, X1) : y + (this.E && !opts.flat ? this.E(p) : 0);
        pos.push(a.x, ya, a.z, b.x, yb, b.z);
        uv.push(p / us, X0 / us, p / us, X1 / us);
        if (opts.color) { const k = opts.color(p); col.push(k, k, k, k, k, k); }
        if (i < n) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      if (opts.color) g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      // 法線を上向きに揃える（左右の向きで裏返らないように）
      const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) { if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); }
      const m = new T.Mesh(g, mat); m.receiveShadow = true;
      if (opts.double) mat.side = T.DoubleSide;
      return m;
    }
    wall(c, X, y0, y1, mat, step = 2) {
      const n = Math.ceil(c.lap / step), pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const pp = Math.min(c.lap, i * step), a = CXY(c, pp, X), e = this.E ? this.E(pp) : 0;
        pos.push(a.x, y0 + e, a.z, a.x, y1 + e, a.z);
        if (i < n) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
    }
    rail(G, c, X, mat, postMat) {
      G.add(this.wall(c, X, 0.92, 1.05, mat));
      G.add(this.ribbon(c, X - 0.07, X + 0.07, 1.05, mat, { step: 3 }));
      const n = Math.floor(c.lap / 2.5);
      const im = new T.InstancedMesh(new T.CylinderGeometry(0.035, 0.035, 1.0, 6), postMat, n);
      const M = new T.Matrix4();
      for (let i = 0; i < n; i++) { const a = CXY(c, i * 2.5, X); M.makeTranslation(a.x, 0.5 + (this.E ? this.E(i * 2.5) : 0), a.z); im.setMatrixAt(i, M); }
      im.castShadow = true; G.add(im);
    }

    buildCourse(G, c, race) {
      const R = rng(c.key.length * 977 + Math.round(c.lap));
      const V = VENUES[c.key] || {};
      const E = this.E = (p) => RaceEngine.elevAt(c, p);
      // 平均の高さ（周りの地面の高さ）
      // 周りの地面はコースの一番低いところに合わせ、コースが高い所は土手で下ろす
      let lo = Infinity; for (let i = 0; i < 200; i++) lo = Math.min(lo, E(i * c.lap / 200)); const mean = this.meanE = lo;
      const turfMap = loadTex('turf.jpg'), turfN = loadTex('turf_n.jpg'), dirtMap = loadTex('dirt.jpg'), dirtN = loadTex('dirt_n.jpg'), fieldMap = loadTex('field.jpg');
      const wet = race.cfg.ground === '重';
      // 芝の種類：洋芝（札幌・函館）は深い緑、野芝（新潟）は明るい緑
      const turfTint = V.turf === 'yoshiba' ? '#cfe3c0' : V.turf === 'noshiba' ? '#f2fbe2' : '#ffffff';
      const turfMat = new T.MeshStandardMaterial({ map: turfMap, normalMap: turfN, normalScale: new T.Vector2(0.6, 0.6), roughness: 0.92, vertexColors: true, color: wet ? '#b9c4ad' : turfTint });
      const dirtMat = new T.MeshStandardMaterial({ map: wet ? loadTex('dirt_wet.jpg') : dirtMap, normalMap: dirtN, normalScale: new T.Vector2(0.8, 0.8), roughness: wet ? 0.55 : 0.95, color: wet ? '#9b8a78' : '#ffffff' });
      const fieldMat = new T.MeshStandardMaterial({ map: fieldMap, roughness: 1, color: V.turf === 'yoshiba' ? '#a9bd90' : '#b7c69a' });
      const railMat = new T.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.35, emissive: '#222', emissiveIntensity: 0.15 });
      const hedgeMat = new T.MeshStandardMaterial({ map: fieldMap, color: '#4d7a34', roughness: 1 });
      // 地面（周りは平均の高さ。コースとの間は土手でつなぐ）
      const gsize = 7000;
      const gg = new T.PlaneGeometry(gsize, gsize, 1, 1); gg.rotateX(-Math.PI / 2);
      const uvA = gg.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * gsize / 14, uvA.getY(i) * gsize / 14);
      const ground = new T.Mesh(gg, fieldMat); ground.position.y = mean - 0.05; ground.receiveShadow = true; G.add(ground);
      const W = c.width;
      const atE = (o) => (p) => E(p) + o;
      G.add(this.ribbon(c, W + 0.6, W + 36, atE(-0.02), fieldMat, { uvScale: 14 }));
      G.add(this.ribbon(c, W + 36, W + 120, (p, X) => X < W + 40 ? E(p) - 0.02 : mean - 0.04, fieldMat, { uvScale: 14 }));
      G.add(this.ribbon(c, -42, -0.6, atE(-0.02), fieldMat, { uvScale: 14 }));
      G.add(this.ribbon(c, -Math.min(c.R - 8, 90), -42, (p, X) => X > -45 ? E(p) - 0.02 : mean - 0.04, fieldMat, { uvScale: 14 }));
      const stripe = (p) => (Math.floor(p / 12) % 2 ? 1.0 : 0.8) * (0.96 + 0.04 * Math.sin(p * 0.05));
      const isTurf = race.surf === 'T';
      G.add(this.ribbon(c, -0.6, W + 0.6, atE(0), isTurf ? turfMat : dirtMat, { uvScale: isTurf ? 5 : 7, color: isTurf ? stripe : null }));
      let other;
      if (isTurf) { other = [-31, -8]; G.add(this.ribbon(c, other[0], other[1], atE(-0.01), dirtMat, { uvScale: 7 })); }
      else { other = [W + 7, W + 34]; G.add(this.ribbon(c, other[0], other[1], atE(-0.01), turfMat, { uvScale: 5, color: stripe })); }
      this.rail(G, c, -0.35, railMat, railMat);
      this.rail(G, c, W + 0.35, railMat, railMat);
      this.rail(G, c, other[0] - 0.3, railMat, railMat);
      this.rail(G, c, other[1] + 0.3, railMat, railMat);
      const hx = -2.2;
      const hedgeSide = new T.MeshStandardMaterial({ color: '#3f6a2c', roughness: 1, side: T.DoubleSide });
      G.add(this.wall(c, hx - 0.6, 0, 0.75, hedgeSide)); G.add(this.wall(c, hx + 0.6, 0, 0.75, hedgeSide));
      G.add(this.ribbon(c, hx - 0.6, hx + 0.6, atE(0.75), hedgeMat, { step: 3 }));
      this.buildPoles(G, c, race);
      this.buildStand(G, c, R);
      this.buildScreen(G, c);
      this.buildScenery(G, c, R, other);
    }

    // ハロン棒（日本経済新聞の記事による）
    //  芝：赤と白の縞の棒の上に白い円盤、赤い数字（残り距離÷100）
    //  ダート：水色と白の縞。数字部分の形は場によって違う（ひし形・三角・下向き三角・四角・あんどん）
    poleTex(num, turf, shape, invert) {
      const key = [num, turf, shape, invert].join('|');
      this._pt = this._pt || {};
      if (this._pt[key]) return this._pt[key];
      return (this._pt[key] = canvasTex(160, 160, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        const bg = turf ? (invert ? '#c8102e' : '#ffffff') : '#ffffff';
        const fg = turf ? (invert ? '#ffffff' : '#c8102e') : '#1e88c8';
        x.fillStyle = bg; x.strokeStyle = turf ? '#c8102e' : '#1e88c8'; x.lineWidth = 6;
        x.beginPath();
        if (turf || shape === 'circle') x.arc(80, 80, 74, 0, Math.PI * 2);
        else if (shape === 'diamond') { x.moveTo(80, 4); x.lineTo(156, 80); x.lineTo(80, 156); x.lineTo(4, 80); x.closePath(); }
        else if (shape === 'triangle') { x.moveTo(80, 8); x.lineTo(154, 150); x.lineTo(6, 150); x.closePath(); }
        else if (shape === 'invtriangle') { x.moveTo(6, 10); x.lineTo(154, 10); x.lineTo(80, 152); x.closePath(); }
        else if (shape === 'andon') { x.rect(22, 6, 116, 148); }
        else x.rect(8, 8, 144, 144);
        x.fill(); x.stroke();
        x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
        const s = String(num); x.font = `bold ${s.length > 1 ? 74 : 96}px Arial, Helvetica, sans-serif`;
        x.fillText(s, 80, shape === 'triangle' && !turf ? 100 : shape === 'invtriangle' && !turf ? 64 : 84);
      }));
    }
    stripeTex(turf) {
      const k = turf ? 'st_t' : 'st_d'; this._pt = this._pt || {};
      if (this._pt[k]) return this._pt[k];
      const t = canvasTex(16, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : (turf ? '#c8102e' : '#5ab4e6'); x.fillRect(0, i * 8, 16, 8); } });
      t.wrapT = T.RepeatWrapping; t.repeat.set(1, 4);
      return (this._pt[k] = t);
    }
    addPole(G, c, p, X, num, turf, shape, invert, scale = 1) {
      const E = this.E, a = CXY(c, p, X);
      const grp = new T.Group(); grp.position.set(a.x, E(p), a.z); grp.rotation.y = Math.atan2(-a.hz, a.hx); grp.scale.setScalar(scale);
      const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2.4, 10), new T.MeshStandardMaterial({ map: this.stripeTex(turf), roughness: 0.5 }));
      pole.position.y = 1.2; pole.castShadow = true; grp.add(pole);
      const face = new T.MeshStandardMaterial({ map: this.poleTex(num, turf, shape, invert), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.4 });
      const board = new T.Mesh(new T.PlaneGeometry(0.75, 0.75), face); board.position.y = 2.75; board.rotation.y = Math.PI / 2; grp.add(board);
      G.add(grp);
    }
    buildPoles(G, c, race) {
      const V = VENUES[c.key] || {}, turf = race.surf === 'T', shape = V.pole || 'square';
      const nLap = Math.floor(c.lap / 200);
      for (let k = 1; k <= nLap; k++) {
        // 発走地点より手前（周回の外）のものは色を反転する（芝のみ）
        const inv = turf && k * 200 > race.D;
        this.addPole(G, c, c.H - k * 200, -0.9, k * 2, turf, shape, inv);
      }
      if (V.scene && V.scene.pole15) this.addPole(G, c, c.H - 1500, -0.9, 15, turf, shape, turf && 1500 > race.D);
      // 新潟の直線は外ラチ沿いにも小さなハロン棒（赤地に白い数字）
      if (V.scene && V.scene.outerPoles) for (let k = 1; k * 200 < c.H; k++) this.addPole(G, c, c.H - k * 200, c.width + 0.9, k * 2, true, 'circle', true, 0.7);
      this.buildGoal(G, c);
      // 決勝線
      const E = this.E;
      const l0 = CXY(c, c.H, 0), l1 = CXY(c, c.H, c.width);
      const line = new T.Mesh(new T.PlaneGeometry(Math.hypot(l1.x - l0.x, l1.z - l0.z), 0.12), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }));
      line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(l1.z - l0.z, l1.x - l0.x) * -1; line.position.set((l0.x + l1.x) / 2, E(c.H) + 0.02, (l0.z + l1.z) / 2);
      G.add(line);
    }
    // ゴール板：決勝線の延長上、内ラチ側に立つ板状の鏡（JRA 競馬用語辞典）。上に競馬場名の板
    buildGoal(G, c) {
      const E = this.E, V = VENUES[c.key] || {};
      const a = CXY(c, c.H, -1.6);
      const goal = new T.Group(); goal.position.set(a.x, E(c.H), a.z); goal.rotation.y = Math.atan2(-a.hz, a.hx);
      const white = new T.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.35, metalness: 0.2 });
      const navy = new T.MeshStandardMaterial({ color: '#1f3a6b', roughness: 0.4, metalness: 0.3 });
      const mirror = new T.MeshStandardMaterial({ color: '#dfe6ec', roughness: 0.04, metalness: 1.0 });
      // 2本の柱（板はコースを横切る向き＝スタンド側を向く）
      for (const x of [-0.7, 0.7]) { const pst = new T.Mesh(new T.BoxGeometry(0.16, 4.2, 0.16), navy); pst.position.set(x, 2.1, 0); pst.castShadow = true; goal.add(pst); }
      const frame = new T.Mesh(new T.BoxGeometry(1.5, 1.9, 0.12), white); frame.position.set(0, 2.55, 0); frame.castShadow = true; goal.add(frame);
      const face = c.dir === 'L' ? 0 : Math.PI; // 外側（スタンド側）へ向ける
      const m1 = new T.Mesh(new T.PlaneGeometry(1.36, 1.76), mirror); m1.position.set(0, 2.55, 0); m1.rotation.y = face; m1.translateZ(0.065); goal.add(m1);
      const vline = new T.Mesh(new T.PlaneGeometry(0.05, 1.76), new T.MeshBasicMaterial({ color: '#c8102e' })); vline.position.copy(m1.position); vline.rotation.y = face; vline.translateZ(0.003); goal.add(vline);
      const nameT = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#1f3a6b'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d6b15a'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = '#ffffff'; x.font = 'bold 66px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(V.en || c.name, w / 2, h / 2 + 4); });
      const nameM = new T.MeshStandardMaterial({ map: nameT, roughness: 0.5 });
      const plate = new T.Mesh(new T.BoxGeometry(1.7, 0.42, 0.1), [white, white, white, white, nameM, nameM]); plate.position.set(0, 3.84, 0); plate.castShadow = true; goal.add(plate);
      G.add(goal);
    }

    buildStand(G, c, R) {
      const W = c.width;
      const sk = ((VENUES[c.key] || {}).scene || {}).stand || 1;
      const p0 = Math.max(10, c.H - 480 * sk), p1 = c.H + 30;
      const L = p1 - p0;
      const a0 = CXY(c, p0, 0);
      const grp = new T.Group();
      // 直線は x 軸に平行。外側方向 nz
      const nz = a0.nz;
      grp.position.set(a0.x, this.E ? this.E((p0 + p1) / 2) : 0, a0.z);
      // grp ローカル: x = 直線方向, z = 外向き(nz>0 なら +z)
      grp.scale.z = nz >= 0 ? 1 : -1;
      const concrete = new T.MeshStandardMaterial({ color: '#bdbcb6', roughness: 0.9 });
      const dark = new T.MeshStandardMaterial({ color: '#3b4048', roughness: 0.6 });
      const roofMat = new T.MeshStandardMaterial({ color: '#e8e9eb', roughness: 0.5, metalness: 0.2, side: T.DoubleSide });
      const glassTex = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#1d2a36'; x.fillRect(0, 0, w, h); for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `rgba(${150 + Math.random() * 60},${180 + Math.random() * 50},${200 + Math.random() * 40},${0.25 + Math.random() * 0.3})`; x.fillRect(i * 8 + 1, j * 16 + 2, 6, 12); } });
      glassTex.wrapS = T.RepeatWrapping; glassTex.repeat.set(L / 40, 1);
      const glass = new T.MeshStandardMaterial({ map: glassTex, roughness: 0.15, metalness: 0.4 });
      const box = (w, h, d, x, y, z, m, rx = 0) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; b.receiveShadow = true; grp.add(b); return b; };
      // 前庭（エプロン）
      box(L, 0.2, 30, L / 2, 0.08, W + 16, concrete);
      // 観客席（3層）
      const tiers = [[W + 32, W + 52, 1, 10], [W + 50, W + 66, 13, 22], [W + 64, W + 78, 25, 33]];
      tiers.forEach(([z0, z1, y0, y1]) => {
        const d = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0);
        const b = box(L, 0.6, d, L / 2, (y0 + y1) / 2, (z0 + z1) / 2, concrete); b.rotation.x = -ang;
        box(L, 3, 0.4, L / 2, y1 + 1.2, z1, glass);
      });
      // 建物本体と屋根
      box(L, 36, 8, L / 2, 18, W + 84, glass);
      const roof = box(L + 20, 0.8, 54, L / 2, 41, W + 60, roofMat); roof.rotation.x = 0.08;
      for (let x = 10; x < L; x += 40) box(1.2, 40, 1.2, x, 20, W + 80, dark);
      // 観客（立ち見＋座席）
      const n1 = Math.min(5200, Math.floor(L * 9));
      const ppl = new T.InstancedMesh(new T.CapsuleGeometry(0.22, 0.85, 3, 6), new T.MeshStandardMaterial({ roughness: 0.8 }), n1 + 3000);
      const M = new T.Matrix4(), C = new T.Color();
      const pal = ['#2b2b2b', '#e8e8e8', '#3f51b5', '#c62828', '#455a64', '#8d6e63', '#fbc02d', '#1b5e20', '#7b1fa2', '#f5f5f5', '#212121', '#90a4ae'];
      let k = 0;
      for (let i = 0; i < n1; i++) {
        const zz = W + 3 + Math.pow(R(), 1.6) * 24, xx = R() * L;
        M.makeTranslation(xx, 0.75 + 0.2, zz); ppl.setMatrixAt(k, M); ppl.setColorAt(k, C.set(pal[Math.floor(R() * pal.length)])); k++;
      }
      tiers.forEach(([z0, z1, y0, y1], ti) => {
        for (let i = 0; i < 1000; i++) {
          const t = R(), xx = R() * L; const zz = z0 + (z1 - z0) * t, yy = y0 + (y1 - y0) * t + 0.9;
          M.makeTranslation(xx, yy, zz); ppl.setMatrixAt(k, M); ppl.setColorAt(k, C.set(pal[Math.floor(R() * pal.length)])); k++;
        }
      });
      ppl.count = k; ppl.castShadow = false; ppl.receiveShadow = true;
      grp.add(ppl);
      this.crowd = ppl;
      G.add(grp);
    }

    buildScreen(G, c) {
      const p = Math.max(80, c.H - 220);
      const a = CXY(c, p, -70);
      const grp = new T.Group(); grp.position.set(a.x, this.meanE || 0, a.z);
      const sc = (((VENUES[c.key] || {}).scene || {}).screen) || 1; grp.scale.set(sc, sc, sc);
      grp.rotation.y = Math.atan2(-a.hz, a.hx);
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
      const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      this.screen = { cv, ctx: cv.getContext('2d'), tex };
      const frame = new T.MeshStandardMaterial({ color: '#222', roughness: 0.6 });
      const face = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
      const body = new T.Mesh(new T.BoxGeometry(66, 17, 1.5), [frame, frame, frame, frame, face, frame]);
      // 正面（+z面）をスタンド＝外向きへ
      body.position.set(0, 16, 0);
      body.rotation.y = (a.nz >= 0 || a.nx >= 0) ? 0 : Math.PI;
      const out = new T.Vector3(a.nx, 0, a.nz);
      body.lookAt(out.clone().multiplyScalar(100).add(body.getWorldPosition(new T.Vector3())));
      body.position.set(0, 16, 0);
      grp.add(body);
      for (const s of [-20, 20]) { const leg = new T.Mesh(new T.BoxGeometry(1.5, 8, 1.5), frame); leg.position.set(s, 4, 0); grp.add(leg); }
      G.add(grp);
      // 向きを正しく：グループの回転を消してワールド基準で外向きにする
      grp.rotation.set(0, 0, 0);
      body.lookAt(new T.Vector3(a.x + a.nx * 100, 16, a.z + a.nz * 100));
    }
    drawScreen(race) {
      const S = this.screen; if (!S) return;
      const x = S.ctx, w = 1024, h = 256;
      x.fillStyle = '#05080c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffd54f'; x.font = 'bold 40px sans-serif'; x.textAlign = 'left';
      x.fillText(race.cfg.name, 24, 52);
      const ord = race.runners.slice().sort((a, b) => b.s - a.s).slice(0, 6);
      x.font = 'bold 30px sans-serif';
      ord.forEach((r, i) => {
        x.fillStyle = WAKU_COLORS[(r.cfg.waku || 1) - 1]; x.fillRect(24 + i * 165, 92, 46, 46);
        x.fillStyle = [1, 5].includes(r.cfg.waku) ? '#000' : '#fff'; x.textAlign = 'center'; x.fillText(String(r.num), 47 + i * 165, 126);
        x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(r.horse.name.slice(0, 4), 76 + i * 165, 126);
      });
      x.fillStyle = '#9fd3ff'; x.font = '28px sans-serif';
      const t = race.open ? race.t - race.gateOpenAt : 0;
      x.fillText(`${RaceEngine.fmtTime(t)}   残り ${Math.max(0, Math.ceil(race.D - ord[0].s))}m`, 24, 210);
      S.tex.needsUpdate = true;
    }

    buildScenery(G, c, R, other) {
      // 木
      const trunkG = new T.CylinderGeometry(0.25, 0.4, 1, 6); trunkG.translate(0, 0.5, 0);
      const leafG = new T.IcosahedronGeometry(1, 2);
      const lp = leafG.attributes.position;
      for (let i = 0; i < lp.count; i++) { const f = 0.82 + Math.random() * 0.32; lp.setXYZ(i, lp.getX(i) * f, lp.getY(i) * f * 0.9, lp.getZ(i) * f); }
      leafG.computeVertexNormals();
      const nT = 520;
      const trunks = new T.InstancedMesh(trunkG, new T.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }), nT);
      const leaves = new T.InstancedMesh(leafG, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), nT * 2);
      const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), Cc = new T.Color();
      let ti = 0, li = 0;
      const span = c.H / 2 + c.R + 700;
      const W = c.width;
      for (let tries = 0; ti < nT && tries < 20000; tries++) {
        const x = (R() * 2 - 1) * span, z = c.R * (c.dir === 'L' ? -1 : 1) + (R() * 2 - 1) * (c.R + 700);
        const X = this.Xof(c, x, z);
        const inField = X < other[0] - 12 && X < -40 && X > -c.R + 25;
        const outside = X > W + 110 && X < W + 650;
        if (!inField && !outside) continue;
        // スタンド前は避ける
        if (outside && Math.abs(z) < W + 160 && x > -c.H / 2 && x < c.H / 2 + 60 && X < W + 200) continue;
        const h = rnd(6, 14);
        M.compose(P.set(x, 0, z), Q.identity(), S.set(1, h * 0.45, 1)); trunks.setMatrixAt(ti, M);
        const r1 = h * rnd(0.32, 0.45);
        Cc.setHSL(0.25 + R() * 0.07, 0.35 + R() * 0.2, 0.18 + R() * 0.1);
        M.compose(P.set(x, h * 0.62, z), Q.identity(), S.set(r1, r1 * 1.1, r1)); leaves.setMatrixAt(li, M); leaves.setColorAt(li++, Cc);
        M.compose(P.set(x + rnd(-1, 1), h * 0.85, z + rnd(-1, 1)), Q.identity(), S.set(r1 * 0.7, r1 * 0.8, r1 * 0.7)); leaves.setMatrixAt(li, M); leaves.setColorAt(li++, Cc);
        ti++;
      }
      trunks.count = ti; leaves.count = li;
      leaves.castShadow = true; trunks.castShadow = true;
      G.add(trunks); G.add(leaves);
      const SC = (VENUES[c.key] || {}).scene || {}, sgn = c.dir === 'L' ? -1 : 1, base = this.meanE || 0;
      trunks.position.y = leaves.position.y = base;
      // 池（内馬場）。京都は内馬場の大きな池が名物
      const pr = SC.pond === 'large' ? Math.min(150, c.R * 0.62) : Math.min(60, c.R * 0.35);
      const pond = new T.Mesh(new T.CircleGeometry(pr, 48), new T.MeshStandardMaterial({ color: '#4f7f9c', roughness: 0.06, metalness: 0.65 }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(-c.H * (SC.pond === 'large' ? 0.05 : 0.15), base + 0.03, c.R * sgn); pond.scale.set(SC.pond === 'large' ? 2.3 : 1.8, 1, 1); G.add(pond);
      if (SC.pond === 'large') { // 中島と木
        const isl = new T.Mesh(new T.CircleGeometry(pr * 0.18, 24), new T.MeshStandardMaterial({ color: '#6f8f4e', roughness: 1 })); isl.rotation.x = -Math.PI / 2; isl.position.set(pond.position.x + pr * 0.4, base + 0.05, c.R * sgn); G.add(isl);
      }
      // 遠くの山並み（函館は海側を低くする）
      const ring = new T.CylinderGeometry(2600, 2600, 1, 96, 1, true);
      const rp = ring.attributes.position;
      const seaDir = Math.atan2(2 * sgn * c.R + sgn * 2000 - c.R * sgn, 0); // 向正面の外側
      for (let i = 0; i < rp.count; i++) {
        const y = rp.getY(i);
        if (y > 0) {
          const ang = Math.atan2(rp.getZ(i), rp.getX(i));
          let hgt = 60 + 260 * Math.pow(Math.abs(Math.sin(ang * 2.3 + 1)), 1.5) * (0.55 + 0.45 * Math.sin(ang * 5.3)) + 50 * Math.abs(Math.sin(ang * 13));
          if (SC.sea) { const da = Math.abs(Math.atan2(Math.sin(ang - seaDir), Math.cos(ang - seaDir))); if (da < 1.3) hgt = 6 + 40 * Math.max(0, (da - 1.0) / 0.3); }
          if (SC.flat) hgt *= 0.4;
          rp.setY(i, hgt);
        } else rp.setY(i, -5);
      }
      ring.computeVertexNormals();
      const hills = new T.Mesh(ring, new T.MeshLambertMaterial({ color: '#4d6a55', side: T.BackSide }));
      hills.position.set(0, base, c.R * sgn);
      G.add(hills);
      // 函館：津軽海峡（向正面の向こうに海）
      if (SC.sea) {
        const sea = new T.Mesh(new T.PlaneGeometry(6000, 2600), new T.MeshStandardMaterial({ color: '#3d6f95', roughness: 0.15, metalness: 0.5 }));
        sea.rotation.x = -Math.PI / 2; sea.position.set(0, base - 0.4, 2 * sgn * c.R + sgn * (c.width + 260 + 1300)); G.add(sea);
        const far = new T.Mesh(new T.CylinderGeometry(9000, 9000, 1, 64, 1, true, 0, Math.PI * 2), new T.MeshBasicMaterial({ color: '#8fa6b8', side: T.BackSide, fog: false }));
        const fp = far.geometry.attributes.position; for (let i = 0; i < fp.count; i++) { const ang = Math.atan2(fp.getZ(i), fp.getX(i)); fp.setY(i, fp.getY(i) > 0 ? 70 + 90 * Math.abs(Math.sin(ang * 3.1)) : -5); }
        far.position.set(0, base, 0); G.add(far);
      }
      // 東京：スタンドから晴れた日に見える富士山（向正面の向こう）
      if (SC.fuji) {
        const fg = new T.ConeGeometry(2600, 1500, 64, 6, true);
        const fpos = fg.attributes.position, cols = [];
        for (let i = 0; i < fpos.count; i++) { const y = fpos.getY(i) + 750; const snow = y > 1050; cols.push(...(snow ? [0.95, 0.97, 1] : [0.42, 0.52, 0.66])); }
        fg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
        const fuji = new T.Mesh(fg, new T.MeshBasicMaterial({ vertexColors: true, fog: false }));
        fuji.position.set(-c.H * 0.3, base + 750 - 120, 2 * sgn * c.R + sgn * 7800); G.add(fuji);
      }
    }

    buildGate(G, race) {
      // 発馬機：鉄骨の枠・クッション材の仕切り・格子の前扉（観音開き）と後扉・上部の通路・車輪
      const c = race.course, n = race.runners.length;
      const grp = new T.Group();
      const a = CXY(c, race.pAt(0), 0);
      grp.position.set(a.x, this.E ? this.E(race.pAt(0)) : 0, a.z);
      grp.rotation.y = Math.atan2(-a.hz, a.hx);
      const outSign = c.dir === 'L' ? 1 : -1;
      const zOf = (X) => X * outSign;
      const W = 1.05, X0 = 0.375, FRONT = 1.45, REAR = -1.55, LEN = FRONT - REAR;
      const steel = new T.MeshStandardMaterial({ color: '#1f5a3f', roughness: 0.45, metalness: 0.6 });
      const steelL = new T.MeshStandardMaterial({ color: '#e9ece8', roughness: 0.35, metalness: 0.5 });
      const pad = new T.MeshStandardMaterial({ color: '#1e3a64', roughness: 0.85 });
      const padEdge = new T.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 });
      const tire = new T.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
      // 格子（扉）のテクスチャ
      const grid = canvasTex(128, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = '#e9ece8'; x.lineWidth = 7; x.strokeRect(4, 4, w - 8, h - 8); x.lineWidth = 4; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); } for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(i * w / 3, 0); x.lineTo(i * w / 3, h); x.stroke(); } });
      const doorMat = new T.MeshStandardMaterial({ map: grid, transparent: true, alphaTest: 0.4, side: T.DoubleSide, metalness: 0.5, roughness: 0.4 });
      const geoBox = new T.BoxGeometry(1, 1, 1), geoCyl = new T.CylinderGeometry(1, 1, 1, 10);
      const box = (sx, sy, sz, x, y, z, m, parent = grp) => { const o = new T.Mesh(geoBox, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
      const post = (x, z, h, r = 0.05, m = steel) => { const o = new T.Mesh(geoCyl, m); o.scale.set(r, h, r); o.position.set(x, h / 2, z); o.castShadow = true; grp.add(o); return o; };
      const totalW = n * W;
      // 仕切り（クッション材）と柱
      for (let i = 0; i <= n; i++) {
        const X = X0 + i * W, z = zOf(X);
        const end = i === 0 || i === n;
        box(LEN - 0.2, end ? 2.2 : 1.45, end ? 0.16 : 0.13, (FRONT + REAR) / 2, end ? 1.25 : 1.05, z, end ? steel : pad);
        if (!end) box(LEN - 0.2, 0.08, 0.15, (FRONT + REAR) / 2, 1.8, z, padEdge);
        post(FRONT, z, 2.75, 0.055); post(REAR, z, 2.75, 0.055); post((FRONT + REAR) / 2, z, 2.75, 0.045);
      }
      // 上部の梁・通路・手すり
      const midZ = zOf(X0 + totalW / 2), spanZ = totalW + 0.2;
      box(0.18, 0.22, spanZ, FRONT, 2.7, midZ, steel);
      box(0.18, 0.22, spanZ, REAR, 2.7, midZ, steel);
      box(LEN, 0.06, spanZ, (FRONT + REAR) / 2, 2.85, midZ, steelL);
      box(0.06, 0.06, spanZ, FRONT, 3.55, midZ, steelL); box(0.06, 0.06, spanZ, REAR, 3.55, midZ, steelL);
      for (let i = 0; i <= n; i += 2) { const z = zOf(X0 + i * W); const p1 = post(FRONT, z, 0.7, 0.025, steelL); p1.position.y = 3.2; const p2 = post(REAR, z, 0.7, 0.025, steelL); p2.position.y = 3.2; }
      // 前の梁の番号板と、前扉・後扉
      this.gateDoors = [];
      for (let i = 0; i < n; i++) {
        const Xa = X0 + i * W;
        const t = canvasTex(96, 64, (x) => { x.fillStyle = '#f7f7f2'; x.fillRect(0, 0, 96, 64); x.fillStyle = '#111'; x.font = 'bold 46px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 48, 34); });
        const nb = new T.Mesh(new T.PlaneGeometry(0.42, 0.28), new T.MeshStandardMaterial({ map: t }));
        nb.position.set(FRONT + 0.1, 2.7, zOf(Xa + W / 2)); nb.rotation.y = Math.PI / 2; grp.add(nb);
        for (const side of [0, 1]) {
          const hinge = new T.Group(); hinge.position.set(FRONT, 0, zOf(Xa + side * W)); grp.add(hinge);
          const dw = W / 2 - 0.04;
          const d = new T.Mesh(new T.PlaneGeometry(dw, 1.5), doorMat); d.position.set(0, 1.15, zOf((side ? -1 : 1) * dw / 2)); d.rotation.y = Math.PI / 2; d.castShadow = true; hinge.add(d);
          const bar = new T.Mesh(geoBox, steelL); bar.scale.set(0.04, 0.05, dw); bar.position.set(0, 1.9, zOf((side ? -1 : 1) * dw / 2)); hinge.add(bar);
          hinge.userData.open = (side ? -1 : 1) * outSign;
          this.gateDoors.push(hinge);
          const r = new T.Mesh(new T.PlaneGeometry(dw, 1.5), doorMat); r.position.set(REAR, 1.15, zOf(Xa + W / 2 + (side ? 1 : -1) * dw / 2)); r.rotation.y = Math.PI / 2; grp.add(r);
        }
      }
      // 両端の車輪
      for (const X of [X0 - 0.35, X0 + totalW + 0.35]) for (const x of [FRONT - 0.5, REAR + 0.5]) {
        const w = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.32, 20), tire); w.rotation.x = Math.PI / 2; w.position.set(x, 0.55, zOf(X)); w.castShadow = true; grp.add(w);
        const hub = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.34, 12), steelL); hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); grp.add(hub);
      }
      // 牽引用のトラクター（外側の端に連結）
      const red = new T.MeshStandardMaterial({ color: '#b3261e', roughness: 0.45, metalness: 0.3 });
      const tx = (FRONT + REAR) / 2, tz = zOf(X0 + totalW + 2.6);
      const tr = new T.Group(); tr.position.set(tx, 0, tz); tr.rotation.y = outSign > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(tr);
      box(1.1, 0.8, 2.6, 0, 1.15, 0.2, red, tr); box(0.9, 0.6, 1.2, 0, 1.5, 0.9, red, tr);
      box(1.0, 1.1, 0.05, 0, 2.15, -0.45, steelL, tr); box(0.05, 1.1, 1.0, 0.5, 2.15, -0.95, steelL, tr); box(0.05, 1.1, 1.0, -0.5, 2.15, -0.95, steelL, tr); box(1.1, 0.06, 1.1, 0, 2.72, -0.95, red, tr);
      for (const [x, z, r, w] of [[0.75, -0.8, 0.75, 0.42], [-0.75, -0.8, 0.75, 0.42], [0.62, 1.1, 0.42, 0.26], [-0.62, 1.1, 0.42, 0.26]]) { const wh = new T.Mesh(new T.CylinderGeometry(r, r, w, 18), tire); wh.rotation.z = Math.PI / 2; wh.position.set(x, r, z); wh.castShadow = true; tr.add(wh); }
      G.add(grp);
    }

    resize() {
      const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.updateFov();
    }
    updateFov() {
      const asp = this.camera.aspect;
      const hfov = this.camMode === 'jockey' ? 100 : this.camMode === 'tv' ? 30 : 75;
      this.camera.fov = Math.min(80, 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / asp) * 180 / Math.PI);
      this.camera.updateProjectionMatrix();
    }
    setCamMode(m) { this.camMode = m; this.camSnap = false; this.updateFov(); if (this.playerModel) this.playerModel.setPlayerView(m === 'jockey'); }

    // ---------- 毎フレーム ----------
    render(race, dt) {
      this.clock += dt;
      const c = race.course;
      const P = race.player;
      // 馬の配置
      const camPos = this.camera.position;
      const dirtCol = new T.Color(race.surf === 'D' ? '#8a6a4c' : '#5a4a32'), turfCol = new T.Color('#4f6b2c');
      race.runners.forEach((r, i) => {
        const m = this.horses[i];
        const a = CXY(c, race.pAt(r.s), r.X);
        let yaw = Math.atan2(-a.hz, a.hx);
        // 横移動の向き
        const sgnOut = c.dir === 'L' ? -1 : 1; // X増加方向は進行方向に対して右(左回り)
        if (r.v > 1) yaw += Math.atan2(r.latV || 0, r.v) * sgnOut;
        m.root.position.set(a.x, this.E ? this.E(race.pAt(r.s)) : 0, a.z);
        m.root.rotation.y = yaw;
        const d2 = (a.x - camPos.x) ** 2 + (a.z - camPos.z) ** 2;
        const near = d2 < 140 * 140 || r.isPlayer;
        m.root.visible = d2 < 900 * 900 || r.isPlayer;
        if (near || Math.floor(this.clock * 10) % 4 === i % 4) {
          m.update({ phase: r.phase, speed: r.v, effort: r.effort, whipT: r.whipT, whipSide: r.whipSide, kakari: r.kakari, lean: r.latV * 0.3 }, dt, this.clock);
        }
        const sh = d2 < 45 * 45 || r.isPlayer;
        if (sh !== m._sh) { m._sh = sh; m.root.traverse(o => { if (o.isMesh) o.castShadow = sh; }); }
        if (m.lod) m.lod(r.isPlayer ? 0 : Math.sqrt(d2));
        // 蹄が地面を蹴るたびに土・芝を飛ばす
        if (r.v > 6 && d2 < 70 * 70) {
          const prev = this.lastPhase[i] % 1, now = r.phase % 1;
          for (const off of [0, 0.1, 0.36, 0.46]) {
            const u0 = (prev + off) % 1, u1 = (now + off) % 1;
            if (u1 < u0 || (u0 < 0.3 && u1 >= 0.3)) {
              const k = race.surf === 'D' ? 6 : 2;
              const ey = this.E ? this.E(race.pAt(r.s)) : 0;
              for (let j = 0; j < k; j++) this.emit(a.x - a.hx * 0.6 + rnd(-0.3, 0.3), ey + 0.08, a.z - a.hz * 0.6 + rnd(-0.3, 0.3), -a.hx * rnd(2, 6) + a.hx * r.v * 0.2, rnd(1.2, 3.2), -a.hz * rnd(2, 6) + a.hz * r.v * 0.2, race.surf === 'D' ? dirtCol : (Math.random() < 0.5 ? turfCol : dirtCol));
              if (r.isPlayer && this.onHoof) this.onHoof(off);
            }
          }
        }
        this.lastPhase[i] = r.phase;
      });
      // ゲートの扉
      if (this.gateDoors) {
        // バネで勢いよく開き、少し跳ね返って止まる
        const k = race.open ? (race.t - race.gateOpenAt) : 0;
        const ang = race.open ? 1.75 * (1 - Math.exp(-k * 14) * Math.cos(k * 18)) : 0;
        this.gateDoors.forEach(hg => hg.rotation.y = hg.userData.open * ang);
      }
      this.stepParticles(dt);
      // カメラ
      this.updateCamera(race, dt);
      // 影の範囲をカメラに追従
      const tgt = this.camTarget || camPos;
      this.sun.position.copy(tgt).addScaledVector(this.sunDir, 150);
      this.sun.target.position.copy(tgt);
      // ターフビジョン
      this.screenT -= dt;
      if (this.screenT <= 0) { this.drawScreen(race); this.screenT = 0.5; }
      this.renderer.render(this.scene, this.camera);
    }

    updateCamera(race, dt) {
      const c = race.course, P = race.player, m = this.playerModel;
      const cam = this.camera;
      const a = CXY(c, race.pAt(P.s), P.X);
      const yawHorse = m.root.rotation.y;
      if (this.camYaw == null) this.camYaw = yawHorse;
      // 角度の差を -π..π に
      let dy = yawHorse - this.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.camYaw += dy * Math.min(1, dt * 6);
      if (this.camMode === 'jockey') {
        m.root.updateMatrixWorld(true);
        const hp = new T.Vector3(); m.jockey.head.getWorldPosition(hp);
        const fwd = new T.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        cam.position.copy(hp).addScaledVector(fwd, -0.12); cam.position.y += 0.06;
        const pitch = -0.2 + (P.effort > 0.9 ? -0.03 : 0);
        const look = cam.position.clone().addScaledVector(fwd, Math.cos(pitch) * 10); look.y += Math.sin(pitch) * 10;
        cam.up.set(0, 1, 0);
        cam.lookAt(look);
        cam.rotateZ(-(P.latV || 0) * 0.03);
        this.camTarget = new T.Vector3(a.x, 0, a.z).addScaledVector(fwd, 25);
      } else if (this.camMode === 'chase') {
        const fwd = new T.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        const ey = this.E ? this.E(race.pAt(P.s)) : 0;
        const want = new T.Vector3(a.x, 3.4 + ey, a.z).addScaledVector(fwd, -8.5);
        if (!this.camSnap) { cam.position.copy(want); this.camSnap = true; } else cam.position.lerp(want, Math.min(1, dt * 5));
        cam.lookAt(a.x + fwd.x * 6, 1.6 + ey, a.z + fwd.z * 6);
        this.camTarget = new T.Vector3(a.x, 0, a.z);
      } else { // tv: 外側からの横移動カメラ
        const out = CXY(c, race.pAt(P.s) - 6, c.width + 38);
        const ey2 = this.E ? this.E(race.pAt(P.s)) : 0;
        const want = new T.Vector3(out.x, 9 + ey2, out.z);
        if (!this.camSnap) { cam.position.copy(want); this.camSnap = true; } else cam.position.lerp(want, Math.min(1, dt * 3));
        cam.lookAt(a.x, 1.4 + ey2, a.z);
        this.camTarget = new T.Vector3(a.x, 0, a.z);
      }
    }
  }
  Render3D.loaded = 0; Render3D.toLoad = 0;
  window.Render3D = Render3D;
})();
