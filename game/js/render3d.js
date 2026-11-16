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
      const hemi = this.hemi = new T.HemisphereLight('#d6e8ff', '#5d6b3a', 0.55);
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
      this.applyWeather(G, race.cfg.weather || '晴');
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
      this.camYaw = null; this.intro = null; this.replay = false;
      this.lastPhase = race.runners.map(r => r.phase);
      this.screenT = 0;
      this.resize();
    }
    // 天気：空の明るさ、かすみ、雨
    applyWeather(G, w) {
      const P = ({
        '晴': { sun: 2.4, hemi: 0.55, exp: 0.95, fog: ['#cdd9e3', 500, 4200], veil: 0, col: '#ffffff', rain: 0 },
        '曇': { sun: 0.9, hemi: 0.8, exp: 0.86, fog: ['#c3c8cc', 350, 3000], veil: 0.6, col: '#b4b9bf', rain: 0 },
        '小雨': { sun: 0.5, hemi: 0.85, exp: 0.8, fog: ['#b4b9bd', 220, 2200], veil: 0.78, col: '#a2a8ae', rain: 700 },
        '雨': { sun: 0.3, hemi: 0.85, exp: 0.74, fog: ['#a4a9ad', 140, 1500], veil: 0.9, col: '#8e949a', rain: 1900 },
      })[w] || null;
      if (!P) return;
      this.sun.intensity = P.sun; this.hemi.intensity = P.hemi; this.renderer.toneMappingExposure = P.exp;
      this.scene.fog.color.set(P.fog[0]); this.scene.fog.near = P.fog[1]; this.scene.fog.far = P.fog[2];
      this.veil = null; this.rain = null;
      if (P.veil > 0) { // 空を雲で覆う
        const v = new T.Mesh(new T.SphereGeometry(5200, 24, 12), new T.MeshBasicMaterial({ color: P.col, transparent: true, opacity: P.veil, side: T.BackSide, fog: false, depthWrite: false }));
        v.renderOrder = -1; G.add(v); this.veil = v;
      }
      if (P.rain) {
        const n = P.rain, pos = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) { const x = rnd(-16, 16), y = rnd(-4, 14), z = rnd(-16, 16); pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
        const r = new T.LineSegments(g, new T.LineBasicMaterial({ color: '#e6edf3', transparent: true, opacity: 0.38, fog: false, depthWrite: false }));
        r.frustumCulled = false; G.add(r); this.rain = r;
      }
    }
    stepWeather(dt) {
      const cp = this.camera.position;
      if (this.veil) this.veil.position.copy(cp);
      if (this.rain) {
        const a = this.rain.geometry.attributes.position, d = (dt || 0.016) * 24;
        for (let i = 0; i < a.count; i += 2) { let y = a.getY(i) - d; if (y < -4) y += 18; a.setY(i, y); a.setY(i + 1, y - 0.7); }
        a.needsUpdate = true; this.rain.position.copy(cp);
      }
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
    // ラチ：支柱はコースの外側の地面から斜めに立ち上がり、先でラチを支える（馬がぶつかっても脚を取られにくい形）
    rail(G, c, X, mat, postMat, side = 1) {
      G.add(this.wall(c, X, 0.93, 1.06, mat));
      G.add(this.ribbon(c, X - 0.07, X + 0.07, 1.06, mat, { step: 3 }));
      const n = Math.floor(c.lap / 2.5);
      const len = Math.hypot(0.55, 1.0);
      const im = new T.InstancedMesh(new T.CylinderGeometry(0.035, 0.04, len, 6), postMat, n);
      const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0), d = new T.Vector3();
      for (let i = 0; i < n; i++) {
        const p = i * 2.5, a = CXY(c, p, X), b = CXY(c, p, X + side * 0.55), e = this.E ? this.E(p) : 0;
        d.set(a.x - b.x, 1.0, a.z - b.z).normalize(); Q.setFromUnitVectors(up, d);
        M.compose(P.set((a.x + b.x) / 2, e + 0.5, (a.z + b.z) / 2), Q, S); im.setMatrixAt(i, M);
      }
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
      const wet = ['重', '不良'].includes(race.cfg.ground);
      // 芝の種類：洋芝（札幌・函館）は深い緑、野芝（新潟）は明るい緑
      const turfTint = V.turf === 'yoshiba' ? '#bcd4ac' : V.turf === 'noshiba' ? '#e6f2d0' : '#d6e4c6';
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
      this.rail(G, c, -0.35, railMat, railMat, -1);
      this.rail(G, c, W + 0.35, railMat, railMat);
      this.rail(G, c, other[0] - 0.3, railMat, railMat, -1);
      this.rail(G, c, other[1] + 0.3, railMat, railMat);
      const hx = -2.2;
      const hedgeSide = new T.MeshStandardMaterial({ color: '#3f6a2c', roughness: 1, side: T.DoubleSide });
      G.add(this.wall(c, hx - 0.6, 0, 0.75, hedgeSide)); G.add(this.wall(c, hx + 0.6, 0, 0.75, hedgeSide));
      G.add(this.ribbon(c, hx - 0.6, hx + 0.6, atE(0.75), hedgeMat, { step: 3 }));
      this.buildPoles(G, c, race);
      this.buildStand(G, c, R);
      this.buildScreen(G, c);
      this.buildScenery(G, c, R, other);
      this.buildExtras(G, c, R, other, race);
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

    // スタンド：中山競馬場の写真を手本にした形（大きく張り出した屋根、暗い軒裏、白い帯状の上層階、青緑のガラス面、階段状の下段席、舗装された前庭）
    buildStand(G, c, R) {
      const W = c.width;
      const sk = ((VENUES[c.key] || {}).scene || {}).stand || 1;
      const p0 = Math.max(10, c.H - 480 * sk), p1 = c.H + 30;
      const L = p1 - p0;
      const a0 = CXY(c, p0, 0);
      const grp = new T.Group();
      const nz = a0.nz;
      grp.position.set(a0.x, this.E ? this.E((p0 + p1) / 2) : 0, a0.z);
      grp.scale.z = nz >= 0 ? 1 : -1; // grp ローカル: x = 直線方向, z = 外向き
      const M = (col, o) => new T.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.8 }, o || {}));
      const white = M('#eeeeea', { roughness: 0.55 }), offwhite = M('#d9d8d2', { roughness: 0.7 }), soffit = M('#4b463f', { roughness: 0.9 }), recess = M('#23262b', { roughness: 0.9 });
      const dark = M('#3b4048', { roughness: 0.6 });
      // 舗装（タイル）と、ガラスの方立て、座席の列
      const paveT = canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const v = 168 + ((i * 3 + j * 5) % 4) * 9 + Math.random() * 8; x.fillStyle = `rgb(${v},${v},${v - 4})`; x.fillRect(i * 16, j * 16, 16, 16); } x.strokeStyle = 'rgba(90,90,90,.35)'; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); } });
      paveT.wrapS = paveT.wrapT = T.RepeatWrapping; paveT.repeat.set(L / 6, 26 / 6);
      const glassT = canvasTex(256, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5fa3b3'); g.addColorStop(0.55, '#2f6f82'); g.addColorStop(1, '#1f4f60'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.08})`; x.fillRect(i * 16 + 1, 0, 14, h); } x.fillStyle = '#dfe5e6'; for (let i = 0; i <= 16; i++) x.fillRect(i * 16 - 1, 0, 2, h); x.fillRect(0, h * 0.5 - 1, w, 2); });
      glassT.wrapS = T.RepeatWrapping; glassT.repeat.set(L / 32, 1);
      const glass = M('#ffffff', { map: glassT, roughness: 0.12, metalness: 0.55 });
      const seatT = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#c9c8c2'; x.fillRect(0, 0, w, h); for (let j = 0; j < 10; j++) for (let i = 0; i < 32; i++) { const blk = Math.floor(i / 8); x.fillStyle = blk % 2 ? '#2d4f9a' : '#b3312c'; if (i % 8 !== 7) x.fillRect(i * 8 + 1, j * 12.8 + 3, 6, 6); } });
      seatT.wrapS = T.RepeatWrapping; seatT.repeat.set(L / 40, 1);
      const box = (w, h, d, x, y, z, m, rx = 0) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; b.receiveShadow = true; grp.add(b); return b; };
      // --- 馬場ぎわ：生け垣と白い柵、芝の斜面、舗装された前庭 ---
      box(L, 0.9, 0.9, L / 2, 0.45, W + 2.4, M('#2f5a27', { roughness: 1 }));
      box(L, 0.06, 0.06, L / 2, 1.25, W + 3.3, white); box(L, 0.05, 0.05, L / 2, 0.75, W + 3.3, white);
      { const posts = new T.InstancedMesh(new T.BoxGeometry(0.07, 1.25, 0.07), white, Math.floor(L / 2.5)); const mm = new T.Matrix4(); for (let i = 0; i < posts.count; i++) { mm.makeTranslation(i * 2.5 + 1, 0.62, W + 3.3); posts.setMatrixAt(i, mm); } grp.add(posts); }
      box(L, 0.2, 26, L / 2, 0.06, W + 25, M('#ffffff', { map: paveT, roughness: 0.9 }));
      // --- 下段の階段席 ---
      const t0 = W + 38, t1 = W + 53, ty0 = 0.4, ty1 = 7.2;
      { const d = Math.hypot(t1 - t0, ty1 - ty0), ang = Math.atan2(ty1 - ty0, t1 - t0);
        box(L, 0.8, d, L / 2, (ty0 + ty1) / 2 - 0.4, (t0 + t1) / 2, offwhite, -ang);
        const seats = new T.Mesh(new T.PlaneGeometry(L, d), M('#ffffff', { map: seatT, roughness: 0.85 })); seats.rotation.x = -Math.PI / 2 - ang; seats.position.set(L / 2, (ty0 + ty1) / 2 + 0.06, (t0 + t1) / 2); seats.receiveShadow = true; grp.add(seats);
        box(L, 1.1, 0.25, L / 2, ty0 + 0.5, t0 - 0.1, white); }
      // --- ガラス面と上層階（白い帯が前へせり出す） ---
      box(L, 14, 0.5, L / 2, 14.2, W + 54, glass);
      box(L, 2.0, 2.4, L / 2, 22.2, W + 53, white);
      box(L, 3.4, 0.5, L / 2, 24.9, W + 56, recess);
      box(L, 1.7, 3.2, L / 2, 27.4, W + 51.5, white);
      box(L, 3.2, 0.5, L / 2, 29.8, W + 55, recess);
      box(L, 1.6, 3.6, L / 2, 32.2, W + 50, white);
      box(L, 2.6, 0.5, L / 2, 34.3, W + 54, recess);
      // 建物本体（裏側）
      box(L, 36, 30, L / 2, 18, W + 71, offwhite);
      // --- 屋根：後ろから前へ持ち上がる片持ちの大屋根。上と縁は白、軒裏は暗い ---
      const roofLen = 62, tilt = 0.13;
      const roof = new T.Mesh(new T.BoxGeometry(L + 26, 1.6, roofLen), [white, white, white, soffit, white, white]);
      roof.position.set(L / 2, 39.5, W + 56); roof.rotation.x = tilt; roof.castShadow = true; roof.receiveShadow = true; grp.add(roof);
      const fz = W + 56 - Math.cos(tilt) * roofLen / 2, fy = 39.5 + Math.sin(tilt) * roofLen / 2;
      box(L + 26, 1.0, 1.0, L / 2, fy - 0.1, fz, white, tilt);
      // 屋根を支える梁（軒裏に見える）と、屋根の上の照明
      for (let x = 14; x < L; x += 28) { const bm = box(1.0, 1.6, roofLen - 6, x, 38.3, W + 57, soffit, tilt); bm.castShadow = false; }
      { const n = Math.floor(L / 8), lamps = new T.InstancedMesh(new T.BoxGeometry(1.5, 0.9, 0.7), dark, n), mm = new T.Matrix4(); for (let i = 0; i < n; i++) { mm.makeTranslation(i * 8 + 4, fy + 1.0, fz + 0.8); lamps.setMatrixAt(i, mm); } grp.add(lamps); }
      // --- 端の建物（白い棟と、丸いガラスの棟） ---
      box(34, 26, 44, -19, 13, W + 62, white); box(34.4, 1.2, 44.4, -19, 26.5, W + 62, offwhite); box(30, 9, 0.4, -19, 12, W + 39.9, glass);
      { const cyl = new T.Mesh(new T.CylinderGeometry(15, 15, 17, 32), M('#4f93b0', { roughness: 0.15, metalness: 0.6 })); cyl.position.set(-52, 8.5, W + 58); cyl.castShadow = true; grp.add(cyl);
        const cap = new T.Mesh(new T.CylinderGeometry(15.6, 15.6, 1.2, 32), white); cap.position.set(-52, 17.5, W + 58); grp.add(cap); }
      box(18, 18, 36, L + 11, 9, W + 62, white);

      // --- 観客：胴体と頭の2部品。前庭の立ち見と、階段席 ---
      const big = this.race && (this.race.cfg.name || '').match(/G|賞|記念|ステークス|カップ|ダービー|オークス/) ? 1 : 0.55;
      const nA = Math.min(5200, Math.floor(L * 9 * big)), nS = Math.min(2600, Math.floor(L * 5 * big)), N = nA + nS;
      // 人の形：脚・胴と腕・頭・髪の4部品（遠くからは人の群れ、近くでは人影に見える）
      const merge = (list) => { const pos = [], nor = []; list.forEach(g0 => { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }); const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return g; };
      const bx = (w, h, d, x, y, z, rz = 0) => { const g = new T.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
      const taper = (wt, wb, h, d, y) => { const g = new T.BoxGeometry(1, h, d); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (p.getY(i) > 0 ? wt : wb)); g.translate(0, y, 0); g.computeVertexNormals(); return g; };
      const legsG = merge([bx(0.13, 0.82, 0.15, 0.085, 0.41, 0), bx(0.13, 0.82, 0.15, -0.085, 0.41, 0)]);
      const torsoG = merge([taper(0.42, 0.33, 0.58, 0.21, 1.1), bx(0.09, 0.56, 0.11, 0.255, 1.08, 0, 0.06), bx(0.09, 0.56, 0.11, -0.255, 1.08, 0, -0.06)]);
      const torsoUpG = merge([taper(0.42, 0.33, 0.58, 0.21, 1.1), bx(0.09, 0.56, 0.11, 0.3, 1.58, 0, -0.25), bx(0.09, 0.56, 0.11, -0.3, 1.58, 0, 0.25)]);
      const headG = new T.SphereGeometry(0.105, 8, 6); headG.scale(0.92, 1.08, 1); headG.translate(0, 1.52, 0);
      const hairG = new T.SphereGeometry(0.112, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55); hairG.rotateX(0.35); hairG.translate(0, 1.535, 0.012);
      // 歓声に合わせて体が弾む（頂点シェーダーで、人ごとに拍をずらす）
      const U = this.crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
      const cm = (o) => { const mt = M('#ffffff', o); mt.onBeforeCompile = (sh) => { sh.uniforms.uTime = U.uTime; sh.uniforms.uCheer = U.uCheer; sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float cph = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;\n transformed.y += uCheer * 0.11 * max(0.0, sin(uTime * 7.5 + cph)) * step(0.3, fract(cph * 0.37));\n#endif'); }; return mt; };
      const legs = new T.InstancedMesh(legsG, cm({ roughness: 0.9 }), N), torsos = new T.InstancedMesh(torsoG, cm({ roughness: 0.85 }), N), torsosUp = new T.InstancedMesh(torsoUpG, cm({ roughness: 0.85 }), Math.ceil(N * 0.2));
      const heads = new T.InstancedMesh(headG, cm({ roughness: 0.75 }), N), hairs = new T.InstancedMesh(hairG, cm({ roughness: 0.9 }), N);
      const bodies = torsos;
      const Mx = new T.Matrix4(), C = new T.Color(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
      const cloth = ['#1f2329', '#2b3340', '#3a4252', '#565d66', '#7c8288', '#b9bcbd', '#e4e3de', '#24324f', '#3d5a80', '#6b4a3a', '#8a7f6a', '#4a5a3c', '#7a2e2e', '#c9b458', '#f0efe9', '#101214', '#8d2f3a', '#2f6b5a'];
      const pants = ['#1b1d22', '#262b36', '#3b3f47', '#2a3550', '#5a5348', '#8b8676', '#15161a'];
      const hair = ['#17130f', '#221a14', '#2e2620', '#151515', '#3a3028', '#8c8a86', '#1b1b1d'];
      const skin = ['#d8ad8c', '#cfa07e', '#e0b898', '#c4946f'];
      let k = 0, ku = 0;
      const put = (x, y, z, sit) => {
        const h = 0.92 + R() * 0.14, drop = sit ? 0.5 * h : 0;
        Q.setFromAxisAngle(UP, Math.PI + (R() - 0.5) * 0.9); // 馬場の方を向く
        Mx.compose(P.set(x, y, z), Q, S.set(sit ? 0.001 : 1, sit ? 0.001 : h, sit ? 0.001 : 1)); legs.setMatrixAt(k, Mx); legs.setColorAt(k, C.set(pants[Math.floor(R() * pants.length)]));
        const up = !sit && R() < 0.14 && ku < torsosUp.count;
        C.set(cloth[Math.floor(R() * cloth.length)]);
        if (up) { Mx.compose(P.set(x, -50, z), Q, S.set(1, h, 1)); torsos.setMatrixAt(k, Mx); torsos.setColorAt(k, C); }
        Mx.compose(P.set(x, y - drop, z), Q, S.set(1, h, 1));
        if (up) { torsosUp.setMatrixAt(ku, Mx); torsosUp.setColorAt(ku, C); ku++; } else { torsos.setMatrixAt(k, Mx); torsos.setColorAt(k, C); }
        heads.setMatrixAt(k, Mx); heads.setColorAt(k, C.set(skin[Math.floor(R() * skin.length)]));
        hairs.setMatrixAt(k, Mx); hairs.setColorAt(k, R() < 0.82 ? C.set(hair[Math.floor(R() * hair.length)]) : C.set(cloth[Math.floor(R() * cloth.length)])); // 帽子の人もいる
        k++;
      };
      for (let i = 0; i < nA; i++) put(R() * L, 0.16, W + 12.5 + Math.pow(R(), 1.8) * 24, false); // 柵ぎわほど混む
      for (let i = 0; i < nS; i++) { const t = Math.floor(R() * 10) / 10 + 0.05; put(R() * L, ty0 + (ty1 - ty0) * t + 0.1, t0 + (t1 - t0) * t, true); }
      [legs, torsos, heads, hairs].forEach(o => { o.count = k; o.receiveShadow = true; grp.add(o); });
      torsosUp.count = ku; grp.add(torsosUp);
      this.crowd = bodies;
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
      const leafG = Render3D.leafGeo();
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
        // 着順掲示板とビジョンの前、駐車場には植えない
        if (inField && X > -90 && Math.abs(z) < 100 && x > c.H / 2 - 340) continue;
        if (outside && X < W + 215 && Math.abs(z) < W + 230 && x > -c.H / 2 - 20 && x < c.H / 2 + 60) continue;
        // スタンド前は避ける
        if (outside && Math.abs(z) < W + 160 && x > -c.H / 2 && x < c.H / 2 + 60 && X < W + 200) continue;
        const h = rnd(6, 14);
        M.compose(P.set(x, 0, z), Q.identity(), S.set(1, h * 0.45, 1)); trunks.setMatrixAt(ti, M);
        const r1 = h * rnd(0.32, 0.45);
        Cc.setHSL(0.26 + R() * 0.06, 0.5 + R() * 0.2, 0.09 + R() * 0.07);
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
      const pond = new T.Mesh(new T.CircleGeometry(pr, 48), new T.MeshStandardMaterial({ color: '#4f7f9c', roughness: 0.06, metalness: 0.65, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(-c.H * (SC.pond === 'large' ? 0.05 : 0.15), base + 0.1, c.R * sgn); pond.scale.set(SC.pond === 'large' ? 2.3 : 1.8, 1, 1); G.add(pond);
      if (SC.pond === 'large') { // 中島と木
        const isl = new T.Mesh(new T.CircleGeometry(pr * 0.18, 24), new T.MeshStandardMaterial({ color: '#6f8f4e', roughness: 1 })); isl.rotation.x = -Math.PI / 2; isl.position.set(pond.position.x + pr * 0.4, base + 0.3, c.R * sgn); G.add(isl);
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
          if (SC.flat || ['tokyo', 'nakayama', 'niigata', 'chukyo'].includes(c.key)) hgt = 14 + hgt * 0.1; // 平野にある場は山を見せず、低い丘と木立ちだけ
          rp.setY(i, hgt);
        } else rp.setY(i, -5);
      }
      ring.computeVertexNormals();
      const hills = new T.Mesh(ring, new T.MeshLambertMaterial({ color: '#5f7868', side: T.BackSide }));
      hills.position.set(0, base, c.R * sgn);
      G.add(hills);
      // 函館：津軽海峡（向正面の向こうに海）
      if (SC.sea) {
        const sea = new T.Mesh(new T.PlaneGeometry(6000, 2600), new T.MeshStandardMaterial({ color: '#3d6f95', roughness: 0.15, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
        sea.rotation.x = -Math.PI / 2; sea.position.set(0, base + 0.15, 2 * sgn * c.R + sgn * (c.width + 260 + 1300)); G.add(sea);
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

    // 着順掲示板・巡回の塔・周りの道と駐車場・街並み・並木・花壇
    buildExtras(G, c, R, other, race) {
      const V = VENUES[c.key] || {}, SC = V.scene || {}, W = c.width, E = this.E, base = this.meanE || 0;
      const std = (col, o) => new T.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.85 }, o || {}));
      const at = (p, X, y) => { const a = CXY(c, p, X); const g = new T.Group(); g.position.set(a.x, y, a.z); g.userData.a = a; G.add(g); return g; };
      const faceOut = (g) => { const a = g.userData.a; g.lookAt(g.position.x + a.nx * 100, g.position.y, g.position.z + a.nz * 100); };
      const geoBox = new T.BoxGeometry(1, 1, 1);
      const bx = (g, sx, sy, sz, x, y, z, m) => { const o = new T.Mesh(geoBox, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      const slopeY = (p, X) => { const e = E(p); return e + (base - e) * Math.max(0, Math.min(1, (X - W - 36) / 84)); };

      // --- 着順掲示板（内馬場、ゴール前）。着順が出るとここに馬番が点く ---
      {
        const g = at(c.H - 60, -54, base); faceOut(g);
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 300;
        const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
        this.tote = { ctx: cv.getContext('2d'), tex, shown: -1 };
        const dark = std('#20242a', { roughness: 0.6 });
        const face = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
        const b = new T.Mesh(new T.BoxGeometry(36, 10.5, 1.6), [dark, dark, dark, dark, face, dark]); b.position.set(0, 9.5, 0); b.castShadow = true; g.add(b);
        for (const x of [-13, 0, 13]) bx(g, 1.2, 4.5, 1.2, x, 2.2, 0, dark);
        this.drawTote(race, []);
      }
      // --- 巡回の塔（コーナーと向正面の外側） ---
      {
        const white = std('#eef0ee', { roughness: 0.5 }), glass = std('#2b3b4a', { roughness: 0.2, metalness: 0.4 });
        for (const p of [c.H + c.T * 0.5, c.H + c.T + c.H * 0.5, 2 * c.H + c.T + c.T * 0.5]) {
          const g = at(p, W + 10, slopeY(p, W + 10) - 0.2); faceOut(g);
          for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) bx(g, 0.16, 12, 0.16, x, 6, z, white);
          for (const y of [3, 6, 9]) { bx(g, 2.1, 0.1, 0.1, 0, y, 1, white); bx(g, 2.1, 0.1, 0.1, 0, y, -1, white); bx(g, 0.1, 0.1, 2.1, 1, y, 0, white); bx(g, 0.1, 0.1, 2.1, -1, y, 0, white); }
          bx(g, 3, 0.2, 3, 0, 12, 0, white); bx(g, 2.6, 1.0, 2.6, 0, 12.6, 0, white); bx(g, 2.5, 1.2, 2.5, 0, 13.7, 0, glass); bx(g, 3.2, 0.2, 3.2, 0, 14.4, 0, white);
        }
      }
      // --- 外周の道と、内馬場の遊歩道 ---
      const po = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
      const asphalt = std('#3c3f43', Object.assign({ roughness: 0.95, side: T.DoubleSide }, po)), gravel = std('#cfc3a4', Object.assign({ roughness: 1, side: T.DoubleSide }, po));
      G.add(this.ribbon(c, W + 98, W + 105, (p, X) => slopeY(p, X) + 0.07, asphalt, { step: 4 }));
      G.add(this.ribbon(c, W + 101.3, W + 101.7, (p, X) => slopeY(p, X) + 0.09, std('#e8e8e2', { side: T.DoubleSide }), { step: 4 }));
      G.add(this.ribbon(c, -39.5, -37, (p) => E(p) + 0.02, gravel, { step: 4 }));
      // --- 駐車場（スタンドの裏） ---
      {
        const sk = SC.stand || 1, p0 = Math.max(10, c.H - 480 * sk) + 10, p1 = c.H + 20, L = p1 - p0;
        const mid = CXY(c, (p0 + p1) / 2, W + 162);
        const lot = new T.Mesh(new T.PlaneGeometry(L, 96), asphalt); lot.rotation.x = -Math.PI / 2; lot.position.set(mid.x, base + 0.05, mid.z); lot.receiveShadow = true; G.add(lot);
        const rows = 12, per = Math.floor(L / 3.1), cars = new T.InstancedMesh(geoBox, std('#ffffff', { roughness: 0.35, metalness: 0.5 }), rows * per);
        const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), C = new T.Color();
        const pal = ['#f2f2f2', '#d8dadc', '#1c1c1e', '#8a8f96', '#27408b', '#9c1f1f', '#3a3a3c', '#e8e4d8'];
        let k = 0;
        for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
          if (R() < 0.3) continue;
          const a = CXY(c, p0 + 1.5 + i * 3.1, W + 119 + r * 7.6 + (r % 2 ? -1.2 : 1.2));
          M.compose(P.set(a.x, base + 0.75, a.z), Q, S.set(1.75, 1.3 + R() * 0.35, 4.3)); cars.setMatrixAt(k, M); cars.setColorAt(k, C.set(pal[Math.floor(R() * pal.length)])); k++;
        }
        cars.count = k; G.add(cars);
      }
      // --- 街並み（外周の先。建物の形や並びは実際の街を写したものではない） ---
      {
        const dens = ({ tokyo: 1, nakayama: 1, hanshin: 1, kyoto: 0.8, chukyo: 0.8, kokura: 1, fukushima: 0.8, sapporo: 0.9, hakodate: 0.7, niigata: 0.35 })[c.key] ?? 0.8;
        // 街の地面（道と区画の模様）。田畑の多い場は畑の色にする
        const urban = dens >= 0.5;
        const plotT = canvasTex(512, 512, (x, w, h) => {
          x.fillStyle = urban ? '#8f9488' : '#7f9a58'; x.fillRect(0, 0, w, h);
          const cols = urban ? ['#a9a69c', '#9a9d94', '#b3ada0', '#7d8f68', '#8a8d88', '#6f8a55', '#a39e93'] : ['#8fa85c', '#7b9a4e', '#a3a860', '#6f8f4a', '#9a8f5a', '#86a257'];
          for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = cols[Math.floor(Math.random() * cols.length)]; x.fillRect(i * 64 + 4, j * 64 + 4, 56, 56); if (urban) for (let k = 0; k < 5; k++) { x.fillStyle = ['#c9c5ba', '#77797a', '#b88f7a', '#8e959c'][Math.floor(Math.random() * 4)]; x.fillRect(i * 64 + 6 + Math.random() * 40, j * 64 + 6 + Math.random() * 40, 8 + Math.random() * 10, 8 + Math.random() * 10); } }
        });
        plotT.wrapS = plotT.wrapT = T.RepeatWrapping;
        const r0 = c.H / 2 + c.R + W + 225, r1 = 3400;
        const rg = new T.RingGeometry(r0, r1, 96, 6, SC.sea ? (c.dir === 'L' ? Math.PI : 0) : 0, SC.sea ? Math.PI : Math.PI * 2);
        const ruv = rg.attributes.uv, rps = rg.attributes.position; for (let i = 0; i < ruv.count; i++) ruv.setXY(i, rps.getX(i) / 420, rps.getY(i) / 420);
        const ring = new T.Mesh(rg, std('#7d7f78', Object.assign({ map: plotT, roughness: 1 }, po))); ring.rotation.x = -Math.PI / 2; ring.position.set(0, base + 0.02, c.R * (c.dir === 'L' ? -1 : 1)); ring.receiveShadow = true; G.add(ring);
        const winT = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#d9d6cf'; x.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { x.fillStyle = Math.random() < 0.15 ? '#8fa3b5' : '#56606c'; x.fillRect(6 + i * 21, 8 + j * 21, 13, 11); } });
        const side = std('#ffffff', { map: winT, roughness: 0.8 }), top = std('#9a9c9e', { roughness: 0.9 });
        const N = Math.round(1500 * dens), bl = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), [side, side, top, top, side, side], N);
        const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), C = new T.Color(), up = new T.Vector3(0, 1, 0);
        const sgn = c.dir === 'L' ? -1 : 1, span = c.H / 2 + c.R + 1500;
        let k = 0;
        for (let tries = 0; k < N && tries < 30000; tries++) {
          const x = (R() * 2 - 1) * span, z = c.R * sgn + (R() * 2 - 1) * (c.R + 1500);
          const X = this.Xof(c, x, z);
          if (X < W + 240 || X > W + 1500) continue;
          if (Math.hypot(x, z - c.R * sgn) < r0 + 20) continue;
          if (R() < (X - W - 240) / 1700) continue; // 遠くほどまばらに
          if (SC.sea && sgn * z > 2 * c.R + W + 230) continue; // 海の上には建てない
          const u = R(), h = u < 0.68 ? 6 + R() * 9 : u < 0.95 ? 15 + R() * 22 : 40 + R() * 35;
          const w = 10 + R() * (h > 15 ? 26 : 14), d = 10 + R() * 18;
          Q.setFromAxisAngle(up, Math.floor(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.3);
          M.compose(P.set(x, base + h / 2, z), Q, S.set(w, h, d)); bl.setMatrixAt(k, M);
          const t = 0.32 + R() * 0.38; bl.setColorAt(k, C.setRGB(t, t * (0.95 + R() * 0.05), t * (0.86 + R() * 0.12))); k++;
        }
        bl.count = k; G.add(bl);
      }
      // --- コース沿いの並木 ---
      {
        const trunkG = new T.CylinderGeometry(0.22, 0.34, 1, 6); trunkG.translate(0, 0.5, 0);
        const leafG = Render3D.leafGeo();
        const n = Math.floor((c.lap - c.H) / 17) + 2;
        const tr = new T.InstancedMesh(trunkG, std('#4a3a2c', { roughness: 1 }), n), lf = new T.InstancedMesh(leafG, std('#ffffff', { roughness: 0.95 }), n * 3);
        const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), C = new T.Color();
        let k = 0, kl = 0;
        for (let p = c.H + 45; p < c.lap - 30 && k < n; p += 15 + R() * 4) {
          const X = W + 52 + R() * 6, a = CXY(c, p, X), y = slopeY(p, X) - 0.1, h = 8 + R() * 4;
          M.compose(P.set(a.x, y, a.z), Q, S.set(1, h * 0.5, 1)); tr.setMatrixAt(k, M);
          const r = h * 0.36; C.setHSL(0.27 + R() * 0.05, 0.5 + R() * 0.15, 0.09 + R() * 0.06);
          for (const [ox, oy, oz, rs] of [[0, 0.66, 0, 1], [r * 0.55, 0.56, r * 0.3, 0.72], [-r * 0.5, 0.6, -r * 0.35, 0.78]]) { M.compose(P.set(a.x + ox, y + h * oy, a.z + oz), Q, S.set(r * rs, r * rs * 0.95, r * rs)); lf.setMatrixAt(kl, M); lf.setColorAt(kl++, C); }
          k++;
        }
        tr.count = k; lf.count = kl; tr.castShadow = lf.castShadow = true; G.add(tr); G.add(lf);
      }
      // --- ゴール前の花壇 ---
      {
        const n = 1500, fl = new T.InstancedMesh(new T.SphereGeometry(0.085, 6, 4), std('#ffffff', { roughness: 0.7 }), n);
        const M = new T.Matrix4(), C = new T.Color(), pal = ['#e53935', '#fdd835', '#ffffff', '#ec407a', '#fb8c00'];
        for (let i = 0; i < n; i++) {
          const p = c.H - 46 + R() * 60, X = -5.8 + R() * 2.2, a = CXY(c, p, X);
          M.makeTranslation(a.x, E(p) + 0.1 + R() * 0.06, a.z); fl.setMatrixAt(i, M); fl.setColorAt(i, C.set(pal[Math.floor(p / 4) % pal.length]));
        }
        G.add(fl);
        G.add(this.ribbon(c, -6.1, -3.3, (p) => (p > c.H - 48 && p < c.H + 16) ? E(p) + 0.05 : E(p) - 0.3, std('#5b3f28', { roughness: 1, side: T.DoubleSide }), { step: 2 }));
      }
    }
    // 着順掲示板の表示（上位5頭の馬番）
    drawTote(race, top) {
      const S = this.tote; if (!S) return;
      const x = S.ctx, w = 1024, h = 300;
      x.fillStyle = '#0b0d10'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#3a3f46'; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16);
      x.textBaseline = 'middle';
      const rn = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
      for (let i = 0; i < 5; i++) {
        const y = 36 + i * 50;
        x.fillStyle = '#e8e8e8'; x.font = 'bold 34px serif'; x.textAlign = 'center'; x.fillText(rn[i], 60, y);
        x.fillStyle = '#16191d'; x.fillRect(100, y - 21, 110, 42);
        x.fillStyle = '#ffb300'; x.font = 'bold 38px Arial'; x.fillText(top[i] != null ? String(top[i]) : '', 155, y + 2);
      }
      x.fillStyle = '#e8e8e8'; x.font = 'bold 30px sans-serif'; x.textAlign = 'left';
      x.fillText('タイム', 270, 50); x.fillText('馬場', 270, 170);
      x.fillStyle = '#16191d'; x.fillRect(270, 76, 300, 56); x.fillRect(270, 196, 300, 56);
      x.fillStyle = '#ffb300'; x.font = 'bold 44px Arial';
      const win = top.length ? race.runners.find(r => r.num === top[0]) : null;
      x.fillText(win && win.finishTime ? RaceEngine.fmtTime(win.finishTime) : '', 290, 106);
      x.font = 'bold 38px sans-serif'; x.fillText(`${race.surf === 'D' ? 'ダート' : '芝'}  ${race.cfg.ground || '良'}`, 290, 226);
      // 確定・審議のランプ
      x.fillStyle = top.length >= 5 ? '#e53935' : '#3a1414'; x.fillRect(640, 60, 150, 70);
      x.fillStyle = '#12351c'; x.fillRect(820, 60, 150, 70);
      x.fillStyle = top.length >= 5 ? '#fff' : '#777'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText('確定', 715, 97);
      x.fillStyle = '#777'; x.fillText('審議', 895, 97);
      x.fillStyle = '#e8e8e8'; x.font = 'bold 34px sans-serif'; x.fillText(race.cfg.name || '', 805, 210);
      S.tex.needsUpdate = true;
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
      this.gateDoors = []; this.gateRear = [];
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
          const r = new T.Mesh(new T.PlaneGeometry(dw, 1.5), doorMat); r.position.set(REAR, 1.15, zOf(Xa + W / 2 + (side ? 1 : -1) * dw / 2)); r.rotation.y = Math.PI / 2; grp.add(r); this.gateRear.push(r);
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
      this.gate = { grp, base: grp.position.clone(), out: new T.Vector3(a.nx, 0, a.nz), dist: c.width + 8 };
      // 発走委員の台（スタート台）と赤い旗。位置と形はゲーム上の表現
      const sp = CXY(c, race.pAt(0) + 13, -2.4);
      const st = new T.Group(); st.position.set(sp.x, this.E ? this.E(race.pAt(0) + 13) : 0, sp.z); st.rotation.y = Math.atan2(-sp.hz, sp.hx);
      const sbox = (sx, sy, sz, x, y, z, m) => { const o = new T.Mesh(geoBox, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; st.add(o); return o; };
      sbox(0.9, 0.5, 1.4, 0, 0.55, 0, steelL); sbox(0.14, 2.6, 0.14, 0, 1.9, 0, steelL); sbox(1.1, 0.08, 1.1, 0, 3.2, 0, steelL);
      for (const [x, z] of [[0.52, 0], [-0.52, 0], [0, 0.52], [0, -0.52]]) sbox(x ? 0.04 : 1.1, 0.04, x ? 1.1 : 0.04, x, 4.2, z, steelL);
      for (const [x, z] of [[0.52, 0.52], [-0.52, 0.52], [0.52, -0.52], [-0.52, -0.52]]) sbox(0.04, 1.0, 0.04, x, 3.7, z, steelL);
      const man = new T.Mesh(new T.CapsuleGeometry(0.2, 1.0, 3, 8), new T.MeshStandardMaterial({ color: '#2c3440', roughness: 0.8 })); man.position.set(0, 4.0, 0); st.add(man);
      const hd = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), new T.MeshStandardMaterial({ color: '#e8c9a8', roughness: 0.8 })); hd.position.set(0, 4.85, 0); st.add(hd);
      const cap = new T.Mesh(new T.CylinderGeometry(0.17, 0.19, 0.1, 12), steelL); cap.position.set(0, 4.98, 0); st.add(cap);
      const arm = new T.Group(); arm.position.set(0, 4.55, 0.25); st.add(arm);
      const stick = new T.Mesh(geoBox, steelL); stick.scale.set(0.03, 1.0, 0.03); stick.position.y = 0.5; arm.add(stick);
      const flag = new T.Mesh(new T.PlaneGeometry(0.6, 0.42), new T.MeshStandardMaterial({ color: '#d21f2b', side: T.DoubleSide, roughness: 0.8 })); flag.position.set(0.3, 0.8, 0); arm.add(flag);
      arm.rotation.z = -2.2;
      this.starterArm = arm;
      G.add(st);
    }

    // ---------- 出走前の演出 ----------
    // コースを上から見せる → 枠入り（奇数番が先、次に偶数番、最後に大外）→ ゲートの中
    startIntro() {
      const n = this.race.runners.length, ord = [];
      for (let i = 0; i < n - 1; i += 2) ord.push(i);
      for (let i = 1; i < n - 1; i += 2) ord.push(i);
      ord.push(n - 1);
      const T0 = 4.6, startAt = new Array(n);
      ord.forEach((idx, j) => { startAt[idx] = T0 + j * 0.3; });
      const BACK = 11, WALK = 2.4;
      this.intro = { t: 0, stage: 'fly', T0, BACK, WALK, startAt, back: new Array(n).fill(BACK), loadEnd: T0 + (n - 1) * 0.3 + BACK / WALK + 0.7, setLen: 1.4, done: false };
      this.gateRear.forEach(d => d.visible = false);
      if (this.playerModel) this.playerModel.setPlayerView(false);
      this.updateFov();
    }
    setReplay(on) { this.replay = !!on; this.camSnap = false; if (this.playerModel) this.playerModel.setPlayerView(!on && this.camMode === 'jockey'); this.updateFov(); }
    endIntro() {
      if (!this.intro) return;
      this.intro = null; this.camSnap = false; this.camYaw = null;
      this.gateRear.forEach(d => d.visible = true);
      if (this.starterArm) this.starterArm.rotation.z = -2.2;
      if (this.playerModel) this.playerModel.setPlayerView(this.camMode === 'jockey');
      this.updateFov();
    }
    stepIntro(dt) {
      const I = this.intro; I.t += dt;
      const was = I.stage;
      I.stage = I.t < I.T0 ? 'fly' : I.t < I.loadEnd ? 'load' : 'set';
      for (let i = 0; i < I.back.length; i++) I.back[i] = Math.max(0, I.BACK - Math.max(0, I.t - I.startAt[i]) * I.WALK);
      this.gateRear.forEach((d, k) => { d.visible = I.back[k >> 1] <= 0.01; });
      // 発走委員が赤旗を振る
      if (this.starterArm) this.starterArm.rotation.z = I.stage === 'set' ? -2.2 : -0.5 + 0.55 * Math.sin(I.t * 5);
      if (I.stage !== was) { if (I.stage === 'set') { this.camSnap = false; this.camYaw = null; if (this.playerModel) this.playerModel.setPlayerView(this.camMode === 'jockey'); } this.updateFov(); }
      if (I.t > I.loadEnd + I.setLen) I.done = true;
    }
    introCamera(race) {
      const I = this.intro, c = race.course, cam = this.camera, n = race.runners.length;
      const sm = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
      const p0 = race.pAt(0), Xm = 0.375 + n * 1.05 / 2, e0 = this.E(p0);
      const g = CXY(c, p0, Xm);
      cam.up.set(0, 1, 0);
      if (I.stage === 'fly') {
        const k = sm(I.t / I.T0);
        const A = CXY(c, c.H - 80, c.width + 34), B = CXY(c, p0 + 26, Xm + n * 0.5 + 6);
        const eA = this.E(c.H - 80);
        cam.position.set(A.x + (B.x - A.x) * k, eA + 30 + (e0 + 6 - eA - 30) * k + Math.sin(Math.PI * k) * 34, A.z + (B.z - A.z) * k);
        const L0 = CXY(c, c.H - 200, c.width / 2);
        cam.lookAt(L0.x + (g.x - L0.x) * sm(k * 1.4), e0 + 1.5, L0.z + (g.z - L0.z) * sm(k * 1.4));
        this.camTarget = new T.Vector3(g.x, 0, g.z);
      } else {
        const k = (I.t - I.T0) / (I.loadEnd - I.T0);
        const B = CXY(c, p0 + 12 - 3 * k, Xm + (n * 0.5 + 3) * (1 - 1.5 * k));
        cam.position.set(B.x, e0 + 1.9 + 0.5 * k, B.z);
        const L = CXY(c, p0 - 3, Xm);
        cam.lookAt(L.x, e0 + 1.5, L.z);
        this.camTarget = new T.Vector3(g.x, 0, g.z);
      }
    }

    resize() {
      const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.updateFov();
    }
    updateFov() {
      const asp = this.camera.aspect;
      const mode = this.intro && this.intro.stage !== 'set' ? 'chase' : this.camMode;
      const hfov = this.replay ? 62 : mode === 'jockey' ? 100 : mode === 'tv' ? 21 : 75;
      this.camera.fov = Math.min(80, 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / asp) * 180 / Math.PI);
      this.camera.updateProjectionMatrix();
    }
    setCamMode(m) { this.camMode = m; this.camSnap = false; this.updateFov(); if (this.playerModel) this.playerModel.setPlayerView(m === 'jockey' && !(this.intro && this.intro.stage !== 'set')); }

    // ---------- 毎フレーム ----------
    render(race, dt) {
      this.clock += dt;
      const I = this.intro;
      if (I) this.stepIntro(dt);
      const c = race.course;
      const P = race.player;
      // 馬の配置
      const camPos = this.camera.position;
      const dirtCol = new T.Color(race.surf === 'D' ? '#8a6a4c' : '#5a4a32'), turfCol = new T.Color('#4f6b2c');
      let winner = null; for (const r of race.runners) if (r.finished && !this.replay && (!winner || r.finishTime < winner.finishTime)) winner = r;
      // 観客：直線に入ると沸き、ゴール後はしばらく続いて収まる
      if (this.crowdU) { let lead = 0; for (const r of race.runners) if (r.s > lead) lead = r.s; const want = race.open && lead > race.D - 420 ? (race.done ? 0.35 : 1) : 0; this.crowdU.uCheer.value += (want - this.crowdU.uCheer.value) * Math.min(1, (dt || 0.016) * 1.5); this.crowdU.uTime.value = this.clock; }
      race.runners.forEach((r, i) => {
        const m = this.horses[i];
        const back = I ? I.back[i] : 0, walking = I && back > 0.01 && back < I.BACK - 0.01;
        const a = CXY(c, race.pAt(r.s) - back, r.X);
        let yaw = Math.atan2(-a.hz, a.hx);
        // 横移動の向き
        const sgnOut = c.dir === 'L' ? -1 : 1; // X増加方向は進行方向に対して右(左回り)
        if (r.v > 1) yaw += Math.atan2(r.latV || 0, r.v) * sgnOut;
        m.root.position.set(a.x, this.E ? this.E(race.pAt(r.s) - back) : 0, a.z);
        m.root.rotation.y = yaw;
        const d2 = (a.x - camPos.x) ** 2 + (a.z - camPos.z) ** 2;
        const near = d2 < 140 * 140 || r.isPlayer;
        m.root.visible = d2 < 900 * 900 || r.isPlayer;
        if (near || Math.floor(this.clock * 10) % 4 === i % 4) {
          m.update({ ease: r.finished, win: r.finished && r === winner, phase: walking ? (I.BACK - back) / 1.75 + i * 0.37 : r.phase, walk: walking ? 1 : 0, speed: r.v, effort: r.effort, whipT: r.whipT, whipSide: r.whipSide, kakari: r.kakari, lean: r.latV * 0.3 }, dt, this.clock);
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
        // 発走後、ゲートは外へ引き出して片づける（周回して戻ってきた時にコース上に残らない）
        const gt = this.gate;
        if (gt) {
          const d = race.open ? Math.max(0, Math.min(1, (k - 5) / 8)) : 0, sd = d * d * (3 - 2 * d);
          gt.grp.visible = d < 1;
          gt.grp.position.copy(gt.base).addScaledVector(gt.out, sd * (gt.dist + race.runners.length * 1.05));
        }
      }
      this.stepParticles(dt);
      // カメラ
      if (I && I.stage !== 'set') this.introCamera(race); else this.updateCamera(race, dt);
      // 影の範囲をカメラに追従
      const tgt = this.camTarget || camPos;
      this.sun.position.copy(tgt).addScaledVector(this.sunDir, 150);
      this.sun.target.position.copy(tgt);
      // ターフビジョン
      this.screenT -= dt;
      if (this.screenT <= 0) {
        this.drawScreen(race); this.screenT = 0.5;
        if (this.tote) { const fin = race.runners.filter(r => r.finished).sort((a, b) => a.finishTime - b.finishTime).slice(0, 5); if (fin.length !== this.tote.shown) { this.tote.shown = fin.length; this.drawTote(race, fin.map(r => r.num)); } }
      }
      this.stepWeather(dt);
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
      if (this.replay) { // ゴール前のリプレイ：決勝線の外から、先頭の馬を追ってゴール板で止める
        const lead = race.runners.reduce((b, r) => r.s > b.s ? r : b, race.runners[0]);
        const eH = this.E ? this.E(c.H) : 0;
        const camP = CXY(c, c.H - 6, c.width + 5.5);
        cam.position.set(camP.x, eH + 3.3, camP.z); cam.up.set(0, 1, 0);
        const lp = Math.min(c.H + 0.5, race.pAt(lead.s) + 1.5), L = CXY(c, lp, Math.min(lead.X, c.width * 0.5));
        cam.lookAt(L.x, eH + 1.3, L.z);
        this.camTarget = new T.Vector3(L.x, 0, L.z);
        return;
      }
      if (this.camMode === 'jockey') {
        m.root.updateMatrixWorld(true);
        const hp = new T.Vector3(); m.jockey.head.getWorldPosition(hp);
        const fwd = new T.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        if (this.lookBack) { // 後方確認：振り返って後ろの馬を見る
          cam.position.copy(hp).addScaledVector(fwd, -0.9); cam.position.y += 0.25;
          const lk = cam.position.clone().addScaledVector(fwd, -10); lk.y -= 1.6;
          cam.up.set(0, 1, 0); cam.lookAt(lk);
          this.camTarget = new T.Vector3(a.x, 0, a.z).addScaledVector(fwd, -15);
          return;
        }
        // 騎手の頭より少し上・後ろから、馬の耳と首ごしに前を見る
        cam.position.copy(hp).addScaledVector(fwd, -0.42); cam.position.y += 0.34;
        const pitch = -0.27 + (P.effort > 0.9 ? -0.02 : 0);
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
        const out = CXY(c, race.pAt(P.s) - 6, c.width + 30);
        const ey2 = this.E ? this.E(race.pAt(P.s)) : 0;
        const want = new T.Vector3(out.x, 9.5 + ey2, out.z);
        if (!this.camSnap) { cam.position.copy(want); this.camSnap = true; } else cam.position.lerp(want, Math.min(1, dt * 3));
        cam.lookAt(a.x, 1.4 + ey2, a.z);
        this.camTarget = new T.Vector3(a.x, 0, a.z);
      }
    }
  }
  // 木の葉のかたまり：球を場所ごとに決まった量だけ凹凸させ、なめらかな陰影にする
  Render3D.leafGeo = function () {
    const g = new T.SphereGeometry(1, 12, 9), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 + y * 2.9) * 0.5 + Math.sin(x * 9.3 + z * 7.1 + y * 8.3) * 0.25; const f = 0.9 + 0.22 * n; p.setXYZ(i, x * f, y * f * 0.9, z * f); }
    g.computeVertexNormals();
    return g;
  };
  Render3D.loaded = 0; Render3D.toLoad = 0;
  window.Render3D = Render3D;
})();
