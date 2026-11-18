// ===== 3D 馬・騎手モデル（手続き生成） =====
// 外部の glb モデル（assets/horse.glb）が用意された場合はそちらを優先できるよう、
// 生成部分は create() の内側に閉じている。
(function () {
  const T = THREE;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => t * t * (3 - 2 * t);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- ジオメトリ生成：xy平面上の中心線に沿って楕円断面をつなぐ ----
  function loft(samples, seg = 18, rings = 3) {
    // samples: [{x,y,h,w,oy?}] h=縦半径, w=横半径
    // 間を Catmull-Rom 風に補間して滑らかにする
    const pts = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[i], c = samples[i + 1], d = samples[Math.min(samples.length - 1, i + 2)];
      for (let k = 0; k < rings; k++) {
        const t = k / rings, t2 = t * t, t3 = t2 * t;
        const cr = (p0, p1, p2, p3) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        pts.push({ x: cr(a.x, b.x, c.x, d.x), y: cr(a.y, b.y, c.y, d.y), h: Math.max(0, cr(a.h, b.h, c.h, d.h)), w: Math.max(0, cr(a.w, b.w, c.w, d.w)), sq: lerp(b.sq ?? 0, c.sq ?? 0, t) });
      }
    }
    pts.push({ ...samples[samples.length - 1], sq: samples[samples.length - 1].sq ?? 0 });
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(pts.length - 1, i + 1)];
      let tx = q1.x - q0.x, ty = q1.y - q0.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty, ny = tx; // 断面の上方向
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU;
        let cy = Math.cos(a), cz = Math.sin(a);
        // 断面を少し角ばらせる（筋肉感）
        const e = 1 + (p.sq || 0) * (1 - Math.abs(Math.cos(2 * a)));
        cy *= e; cz *= e;
        pos.push(p.x + nx * p.h * cy, p.y + ny * p.h * cy, p.w * cz);
        uv.push(j / seg, i / (pts.length - 1));
      }
    }
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- 共有ジオメトリ ----
  let G = null;
  function geoms() {
    if (G) return G;
    G = {};
    // 胴体（前が +x）。肩〜胸を厚く、腹は締まり、トモは丸く
    G.torso = loft([
      { x: -0.96, y: 1.36, h: 0.02, w: 0.02 },
      { x: -0.90, y: 1.38, h: 0.17, w: 0.15 },
      { x: -0.76, y: 1.38, h: 0.27, w: 0.25, sq: 0.06 },
      { x: -0.55, y: 1.35, h: 0.31, w: 0.28, sq: 0.06 },
      { x: -0.30, y: 1.29, h: 0.315, w: 0.28 },
      { x: -0.02, y: 1.27, h: 0.33, w: 0.29 },
      { x: 0.26, y: 1.31, h: 0.34, w: 0.28 },
      { x: 0.50, y: 1.36, h: 0.32, w: 0.25, sq: 0.05 },
      { x: 0.68, y: 1.33, h: 0.26, w: 0.2 },
      { x: 0.80, y: 1.29, h: 0.15, w: 0.13 },
      { x: 0.84, y: 1.27, h: 0.02, w: 0.02 },
    ], 32, 4);
    // 首（付け根が原点）
    G.neck = loft([
      { x: -0.2, y: -0.16, h: 0.34, w: 0.21 },
      { x: 0.04, y: 0.04, h: 0.3, w: 0.18 },
      { x: 0.26, y: 0.2, h: 0.235, w: 0.135 },
      { x: 0.46, y: 0.34, h: 0.18, w: 0.105 },
      { x: 0.6, y: 0.42, h: 0.14, w: 0.09 },
    ], 28, 6);
    // 頭（項＝耳の付け根が原点、鼻先へ前下がり）
    G.head = loft([
      { x: -0.08, y: 0.05, h: 0.11, w: 0.09 },
      { x: 0.05, y: -0.02, h: 0.15, w: 0.11 },
      { x: 0.2, y: -0.13, h: 0.135, w: 0.1 },
      { x: 0.36, y: -0.27, h: 0.1, w: 0.078 },
      { x: 0.5, y: -0.39, h: 0.088, w: 0.075 },
      { x: 0.58, y: -0.46, h: 0.07, w: 0.068 },
      { x: 0.62, y: -0.5, h: 0.01, w: 0.01 },
    ], 26, 6);
    G.ear = new T.ConeGeometry(0.035, 0.13, 14); G.ear.translate(0, 0.065, 0);
    G.eye = new T.SphereGeometry(0.022, 8, 6);
    // 脚（テーパー付き円柱。原点が上端）
    const seg = (r1, r2, L, n = 10) => { const g = new T.CylinderGeometry(r1, r2, L, n, 1); g.translate(0, -L / 2, 0); return g; };
    G.foreUpper = seg(0.075, 0.05, 0.5); G.foreMuscle = new T.SphereGeometry(1, 12, 10);
    G.cannon = seg(0.034, 0.03, 0.34); G.cannonH = seg(0.036, 0.031, 0.38);
    G.joint = new T.SphereGeometry(0.044, 10, 8);
    G.pastern = seg(0.03, 0.028, 0.14);
    G.hoof = seg(0.045, 0.06, 0.09, 12);
    G.thigh = seg(0.13, 0.09, 0.4); G.gaskin = seg(0.075, 0.048, 0.42);
    G.tailSeg = seg(0.05, 0.04, 0.16, 8);
    G.tailHair = new T.ConeGeometry(0.1, 0.75, 10, 1, true); G.tailHair.translate(0, -0.37, 0); G.tailHair.scale(1, 1, 0.5);
    G.tuft = new T.BoxGeometry(0.016, 0.16, 0.05); G.tuft.translate(0, -0.06, 0);
    G.saddle = new T.BoxGeometry(0.42, 0.05, 0.36);
    G.cloth = new T.PlaneGeometry(0.72, 0.46);
    G.girth = new T.CylinderGeometry(0.335, 0.335, 0.06, 24, 1, true);
    G.strap = new T.BoxGeometry(0.012, 0.012, 1);
    // 騎手
    G.capsule = new T.CapsuleGeometry(1, 1, 6, 12);
    G.sphere = new T.SphereGeometry(1, 16, 12);
    G.helmet = new T.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI * 0.55);
    G.visor = new T.CylinderGeometry(1, 1, 0.1, 16, 1, false, -0.7, 1.4);
    G.goggle = new T.TorusGeometry(1, 0.25, 6, 16, Math.PI * 0.9);
    G.whip = new T.CylinderGeometry(0.006, 0.01, 0.62, 6); G.whip.translate(0, 0.31, 0);
    return G;
  }

  // ---- マテリアル ----
  const matCache = {};
  function mat(key, make) { return matCache[key] || (matCache[key] = make()); }
  function std(color, rough = 0.5, extra = {}) { return mat('s' + color + rough + JSON.stringify(extra), () => new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra })); }

  // 毛色: 鹿毛・黒鹿毛・青鹿毛・栗毛・芦毛
  const COATS = {
    bay: { body: '#6a3a1f', points: '#1b130d', mane: '#140e0a' },
    darkbay: { body: '#3e2414', points: '#140d08', mane: '#0d0906' },
    brown: { body: '#2a1a12', points: '#110b07', mane: '#0a0705' },
    chestnut: { body: '#8a4a22', points: '#7a3f1c', mane: '#a0602e' },
    grey: { body: '#b9b6b1', points: '#5b5855', mane: '#d9d6d0' },
    black: { body: '#1a1512', points: '#0e0b09', mane: '#080605' },          // 青毛
    liver: { body: '#5a2c16', points: '#4a2412', mane: '#3e1e10' },          // 栃栗毛
    flaxen: { body: '#9a5426', points: '#8a4a20', mane: '#e8d6a8' },         // 尾花栗毛（たてがみと尾が白っぽい）
    darkgrey: { body: '#6f6b67', points: '#2f2c2a', mane: '#4a4744' },       // 若い芦毛（まだ黒っぽい）
    white: { body: '#ece8e2', points: '#e2ddd6', mane: '#f1eee8' },          // 白毛
  };
  const COAT_JP = { bay: '鹿毛', darkbay: '黒鹿毛', brown: '青鹿毛', chestnut: '栗毛', grey: '芦毛', black: '青毛', liver: '栃栗毛', flaxen: '尾花栗毛', darkgrey: '芦毛', white: '白毛' };
  // 馬ごとの模様（毎回同じになるよう、馬の番号から決める）。顔の白、脚の白、芦毛のまだら、白毛のブチ
  function marksFor(h, year) {
    if (!h) return {};
    let s = (h.id || 1) * 2654435761 >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const mk = { seed: r() * 10, tint: (r() - 0.5) * 1.4 };
    // 顔
    const f = r();
    if (f < 0.34) {} else if (f < 0.54) mk.star = 0.03 + r() * 0.03;
    else if (f < 0.72) { mk.face = [0.05, 0.75 + r() * 0.2, 0.014, 0.012 + r() * 0.01]; if (r() < 0.5) mk.star = 0.035; }   // 流星
    else if (f < 0.86) mk.face = [0.0, 1.0, 0.035 + r() * 0.02, 0.05 + r() * 0.03];                                     // 大流星
    else if (f < 0.94) { mk.star = 0.04; mk.face = [0.82, 1.0, 0.02, 0.035]; }                                         // 星と鼻白
    else mk.face = [0.0, 1.0, 0.07, 0.11];                                                                           // 白面
    // 脚の白：後ろ脚に出やすい。h.socks があればそれを使う
    const legs = ['LF', 'RF', 'LH', 'RH'], socks = [0, 0, 0, 0];
    const has = h.socks && h.socks.length ? h.socks : legs.filter((k, i) => r() < (i >= 2 ? 0.34 : 0.2));
    has.forEach(k => { const i = legs.indexOf(k); if (i >= 0) socks[i] = [0.1, 0.16, 0.24, 0.34][Math.floor(r() * 4)]; });
    mk.socks = socks;
    const key = h.coatKey;
    if (key === 'grey' || key === 'darkgrey') {
      // 芦毛は年とともに白くなる：若いうちは連銭（まだら）、年を重ねると小さな斑点
      const age = year && h.born ? year - h.born : 4;
      mk.dapple = Math.max(0.2, 1 - Math.max(0, age - 3) * 0.2); mk.spots = Math.min(0.8, Math.max(0, (age - 4) * 0.2));
    }
    if (key === 'white' && r() < 0.5) { mk.pinto = 0.3 + r() * 0.5; mk.pintoC = ['#4a2e1c', '#2a1e16', '#7a4a26', '#5d5a56'][Math.floor(r() * 4)]; }  // 白毛：鹿毛色・黒・栗色・灰色の斑（ブチ）が出る馬も
    if (h.marks) Object.assign(mk, h.marks);
    return mk;
  }
  function coatFor(h) {
    if (h.coatKey && COATS[h.coatKey]) return COATS[h.coatKey];
    const keys = ['bay', 'bay', 'darkbay', 'darkbay', 'brown', 'chestnut', 'chestnut', 'grey'];
    return COATS[keys[(h.id * 13 + 7) % keys.length]];
  }

  // 勝負服テクスチャ
  const silkTex = {};
  function silksTexture(s) {
    const key = s.base + s.accent + s.pattern;
    if (silkTex[key]) return silkTex[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = s.base; x.fillRect(0, 0, 128, 128);
    x.fillStyle = s.accent;
    switch (s.pattern) {
      case 'hoops': for (let i = 0; i < 4; i++) x.fillRect(0, 12 + i * 32, 128, 12); break;
      case 'stripes': for (let i = 0; i < 8; i++) x.fillRect(i * 16, 0, 7, 128); break;
      case 'chevron': x.lineWidth = 12; x.strokeStyle = s.accent; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(0, 20 + i * 40); x.lineTo(64, 50 + i * 40); x.lineTo(128, 20 + i * 40); x.stroke(); } break;
      case 'sash': x.save(); x.translate(64, 64); x.rotate(0.8); x.fillRect(-90, -12, 180, 24); x.restore(); break;
      case 'diamonds': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); const cx = 16 + i * 32, cy = 16 + j * 32; x.moveTo(cx, cy - 12); x.lineTo(cx + 9, cy); x.lineTo(cx, cy + 12); x.lineTo(cx - 9, cy); x.fill(); } break;
      case 'spots': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 8, 16 + j * 32, 7, 0, TAU); x.fill(); } break;
      case 'halves': x.fillRect(64, 0, 64, 128); break;
      case 'cross': x.fillRect(52, 0, 24, 128); x.fillRect(0, 52, 128, 24); break;
      default: break;
    }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping;
    return (silkTex[key] = t);
  }
  function clothTexture(num, label) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 150;
    const x = c.getContext('2d');
    x.fillStyle = '#f7f7f4'; x.fillRect(0, 0, 256, 150);
    x.fillStyle = '#111'; x.font = 'bold 92px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(num), 128, 70);
    if (label) { x.font = 'bold 20px sans-serif'; x.fillText(label.slice(0, 10), 128, 132); }
    x.strokeStyle = '#c9c4b8'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 144);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  function mesh(g, m, cast = true) { const o = new T.Mesh(g, m); o.castShadow = cast; o.receiveShadow = false; return o; }
  function pivot(x, y, z, parent) { const p = new T.Group(); p.position.set(x, y, z); if (parent) parent.add(p); return p; }

  // ---- 馬＋騎手を生成 ----
  function create(opt) {
    const g = geoms();
    const coat = opt.coat || COATS.bay;
    const mBody = std(coat.body, 0.42);
    const mPoints = std(coat.points, 0.5);
    const mMane = std(coat.mane, 0.8);
    const mHoof = std(opt.coatKey === 'grey' ? '#3a3632' : '#1c1814', 0.6);
    const mWhite = std('#efece6', 0.6);
    const mTack = std('#151515', 0.55);
    const mEye = std('#050505', 0.15);

    const root = new T.Group();
    const body = pivot(0, 0, 0, root);
    body.add(mesh(g.torso, mBody));

    // 首・頭
    const neckP = pivot(0.6, 1.5, 0, body);
    neckP.add(mesh(g.neck, mBody));
    const headP = pivot(0.6, 0.42, 0, neckP);
    const headM = mesh(g.head, mBody); headP.add(headM);
    const earL = mesh(g.ear, mBody); earL.position.set(-0.02, 0.07, 0.05); earL.rotation.set(0.25, 0, -0.35); headP.add(earL);
    const earR = mesh(g.ear, mBody); earR.position.set(-0.02, 0.07, -0.05); earR.rotation.set(-0.25, 0, -0.35); headP.add(earR);
    for (const s of [1, -1]) { const e = mesh(g.eye, mEye, false); e.position.set(0.1, -0.03, s * 0.085); headP.add(e); }
    // 頭絡（鼻革・額革）
    const nose = mesh(new T.TorusGeometry(0.085, 0.01, 6, 16), mTack, false); nose.position.set(0.36, -0.26, 0); nose.rotation.set(0, Math.PI / 2, 0.75); headP.add(nose);
    const brow = mesh(new T.TorusGeometry(0.105, 0.01, 6, 16), mTack, false); brow.position.set(0.0, 0.0, 0); brow.rotation.set(0, Math.PI / 2, 0.2); headP.add(brow);
    // メンコ（覆面）を付ける馬もいる
    if (opt.hood) { const hood = mesh(new T.SphereGeometry(0.135, 12, 8, 0, TAU, 0, 1.2), std(opt.hood, 0.7), false); hood.position.set(0.02, 0.0, 0); hood.rotation.z = -0.6; headP.add(hood); }
    // たてがみ（房を並べて風になびかせる）
    const mane = [];
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const tp = pivot(lerp(-0.06, 0.62, t), lerp(0.16, 0.56, t) + 0.0, 0.0, neckP);
      const tf = mesh(g.tuft, mMane, false); tf.scale.set(1, lerp(1.2, 0.7, t), 1); tp.add(tf);
      tp.rotation.set(1.1, 0, -0.3); mane.push(tp);
    }
    const forelock = pivot(-0.02, 0.07, 0, headP); forelock.add(mesh(g.tuft, mMane, false)); forelock.rotation.z = -2.3;

    // 尾
    const tail = [];
    let tp = pivot(-0.9, 1.52, 0, body); tp.rotation.z = -0.9;
    for (let i = 0; i < 4; i++) {
      tp.add(mesh(g.tailSeg, mMane, false));
      tail.push(tp);
      const n = pivot(0, -0.16, 0, tp); tp = n;
    }
    const tailHair = mesh(g.tailHair, mMane); tp.add(tailHair); tail.push(tp);

    // 脚
    const legs = [];
    function foreLeg(z, white) {
      const sh = pivot(0.56, 1.08, z, body);
      const mus = mesh(g.foreMuscle, mBody); mus.scale.set(0.12, 0.2, 0.085); mus.position.set(-0.01, -0.06, 0); sh.add(mus);
      sh.add(mesh(g.foreUpper, mBody));
      const knee = pivot(0, -0.5, 0, sh); knee.add(mesh(g.joint, white ? mWhite : mPoints, false));
      knee.add(mesh(g.cannon, white ? mWhite : mPoints));
      const fet = pivot(0, -0.34, 0, knee); fet.add(mesh(g.joint, white ? mWhite : mPoints, false));
      fet.add(mesh(g.pastern, white ? mWhite : mPoints));
      const hf = pivot(0, -0.14, 0, fet); hf.add(mesh(g.hoof, mHoof));
      return { type: 'F', a: sh, b: knee, c: fet, d: hf };
    }
    function hindLeg(z, white) {
      const hip = pivot(-0.58, 1.32, z * 0.9, body);
      const hm = mesh(g.foreMuscle, mBody); hm.scale.set(0.24, 0.3, 0.12); hm.position.set(-0.02, -0.02, 0); hip.add(hm);
      hip.add(mesh(g.thigh, mBody));
      const st = pivot(0, -0.4, 0, hip); st.add(mesh(g.gaskin, mBody));
      const hock = pivot(0, -0.42, 0, st); hock.add(mesh(g.joint, mPoints, false));
      hock.add(mesh(g.cannonH, white ? mWhite : mPoints));
      const fet = pivot(0, -0.38, 0, hock); fet.add(mesh(g.joint, white ? mWhite : mPoints, false));
      fet.add(mesh(g.pastern, white ? mWhite : mPoints));
      const hf = pivot(0, -0.14, 0, fet); hf.add(mesh(g.hoof, mHoof));
      return { type: 'H', a: hip, b: st, c: hock, d: fet, e: hf };
    }
    const socks = opt.socks || [];
    const LF = foreLeg(0.15, socks.includes('LF')), RF = foreLeg(-0.15, socks.includes('RF'));
    const LH = hindLeg(0.16, socks.includes('LH')), RH = hindLeg(-0.16, socks.includes('RH'));
    // 右手前の交叉襲歩: 左後→右後→左前→右前
    LH.off = 0.0; RH.off = 0.1; LF.off = 0.36; RF.off = 0.46;
    legs.push(LF, RF, LH, RH);

    // 鞍・ゼッケン・腹帯
    const saddle = mesh(g.saddle, mTack); saddle.position.set(0.24, 1.68, 0); body.add(saddle);
    const clothT = clothTexture(opt.number || 1, opt.raceLabel);
    const zc = opt.cloth || null;
    for (const s of [1, -1]) { const mCloth = new T.MeshStandardMaterial({ map: zc && window.Zekken ? Zekken.texture(zc, s > 0 ? 'R' : 'L') : clothT, roughness: 0.85, side: T.DoubleSide, alphaTest: 0.5 }); const c = mesh(g.cloth, mCloth, false); c.position.set(0.2, 1.4, s * 0.305); c.rotation.set(0, s > 0 ? 0 : Math.PI, 0); c.rotation.x = s * 0.12; body.add(c); }
    const girth = mesh(g.girth, mTack, false); girth.position.set(0.36, 1.3, 0); girth.rotation.x = Math.PI / 2; girth.rotation.z = Math.PI / 2; girth.scale.set(1, 1, 1.02); body.add(girth);

    // 騎手
    const J = buildJockey({ ...opt, bodyHalfWidth: 0.27 }, g);
    const jockeyG = pivot(0.24, 0, 0, root); jockeyG.add(J.root);

    // 手綱（毎フレーム、手とハミの間に伸ばす）
    const reins = [mesh(g.strap, mTack, false), mesh(g.strap, mTack, false)];
    reins.forEach(r => root.add(r));
    const bitL = pivot(0.38, -0.3, 0.07, headP), bitR = pivot(0.38, -0.3, -0.07, headP);

    const model = {
      root, body, neckP, headP, legs, mane, tail, jockey: J, reins, bitL, bitR, clothT,
      lastPhase: 0,
      update(st, dt, time) { animate(model, st, dt, time); },
      setPlayerView(on) { model.pov = on; J.setPov(on); },
      dispose() { clothT.dispose(); },
    };
    if (opt.isPlayer) model.setPlayerView(true);
    return model;
  }

  // ---- アニメーション ----
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
  function animate(m, st, dt, time) {
    const ph = st.phase % 1;
    const run = Math.min(1, st.speed / 12); // 0:停止 1:全速
    const A = run;
    // 胴の上下と前後の揺れ（ギャロップは1完歩に1回の浮遊期）
    const bounce = 0.06 * A * Math.sin(TAU * (ph - 0.62)) + 0.015 * A * Math.sin(TAU * 2 * ph);
    const pitch = 0.05 * A * Math.sin(TAU * ph + 0.9);
    m.body.position.y = bounce - 0.02 * A;
    m.body.rotation.z = pitch;
    // 首：伸縮しながら上下（追うほど大きく）
    const drive = st.effort > 0.85 ? 1 : 0.6;
    m.neckP.rotation.z = -0.16 * A - 0.12 * A * drive * Math.sin(TAU * ph + 1.4) + (st.kakari > 0.6 ? 0.25 : 0) + 0.05 * (1 - A);
    m.headP.rotation.z = -0.12 * A + 0.08 * A * Math.sin(TAU * ph + 1.8) + (st.kakari > 0.6 ? 0.2 * Math.sin(time * 9) : 0);
    m.neckP.rotation.y = (st.lean || 0) * 0.15;
    // 脚
    for (const L of m.legs) {
      const u = (ph + L.off) % 1;
      if (A < 0.05) { setLegRest(L); continue; }
      if (L.type === 'F') {
        let s, k, f;
        if (u < 0.32) { const t = u / 0.32; s = lerp(0.55, -0.55, t); k = 0; f = 0.55 + 0.45 * Math.sin(Math.PI * t); }
        else { const t = (u - 0.32) / 0.68; s = lerp(-0.55, 0.55, sm(t)); k = -1.9 * Math.sin(Math.PI * Math.min(1, t * 1.25)); f = 0.55 - 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.15)); }
        L.a.rotation.z = s * A; L.b.rotation.z = k * A; L.c.rotation.z = f * A + 0.5 * (1 - A); L.d.rotation.z = -f * A - 0.5 * (1 - A) + 0.05;
      } else {
        let h, s, k, f;
        if (u < 0.32) { const t = u / 0.32; h = lerp(0.95, 0.05, t); s = lerp(-1.0, -0.75, t); k = lerp(0.55, 0.75, t); f = 0.6 + 0.4 * Math.sin(Math.PI * t); }
        else { const t = (u - 0.32) / 0.68; const w = Math.sin(Math.PI * Math.min(1, t * 1.2)); h = lerp(0.05, 0.95, sm(t)); s = -0.75 - 0.6 * w; k = 0.75 + 0.9 * w; f = 0.6 - 1.2 * w; }
        L.a.rotation.z = lerp(0.45, h, A); L.b.rotation.z = lerp(-0.95, s, A); L.c.rotation.z = lerp(0.55, k, A); L.d.rotation.z = lerp(0.55, f, A); L.e.rotation.z = -lerp(0.55, f, A) + 0.0;
      }
    }
    // たてがみ・尾
    const wind = Math.min(1, st.speed / 15);
    m.mane.forEach((p, i) => { p.rotation.x = 1.1 - 0.5 * wind + 0.3 * Math.sin(time * 14 + i * 0.7) * wind; p.rotation.z = -0.3 - 0.9 * wind + 0.1 * Math.sin(time * 11 + i); });
    m.tail.forEach((p, i) => { if (i === 0) p.rotation.z = -0.9 - 0.45 * wind + 0.08 * Math.sin(TAU * ph); else p.rotation.z = 0.12 * Math.sin(time * 8 + i) * wind - 0.05 * i * wind; p.rotation.x = 0.1 * Math.sin(time * 6 + i * 0.8) * wind; });
    animateJockey(m, st, ph, bounce, pitch, 1.7);
  }
  // ===== 騎手（関節の位置から手足をつなぐ方式） =====
  // 鞍の上面を原点に、足（鐙）・腰・肩・手の位置を決め、膝と肘は2関節IKで求める。
  // 足は馬と一緒に動き、上体は膝で上下動を吸収する。向きは +x が前、z が左右。
  let JG = null;
  // 両端を閉じた、長さ1（y方向・中心が原点）の手足。[位置0〜1, 前後の半径, 左右の半径]
  function shaped(list, seg = 16) {
    const first = list[0], last = list[list.length - 1];
    const all = [[first[0] - 0.015, 0.004, 0.004], ...list, [last[0] + 0.015, 0.004, 0.004]];
    const g = loft(all.map(([t, h, w, sq]) => ({ x: 0, y: t, h, w, sq: sq || 0 })), seg, 3);
    g.translate(0, -0.5, 0);
    return g;
  }
  function jockeyGeoms() {
    if (JG) return JG;
    JG = {};
    JG.ball = new T.SphereGeometry(1, 18, 14);
    // 太もも（腰→膝）、すね＝長靴（膝→足首）、上腕、前腕
    JG.thigh = shaped([[0, 0.07, 0.078], [0.2, 0.076, 0.082], [0.55, 0.066, 0.07], [0.9, 0.054, 0.056], [1, 0.05, 0.052]]);
    JG.shin = shaped([[0, 0.056, 0.056], [0.25, 0.064, 0.06], [0.6, 0.05, 0.048], [0.92, 0.04, 0.04], [1, 0.042, 0.042]]);
    JG.upArm = shaped([[0, 0.055, 0.056], [0.3, 0.056, 0.054], [0.85, 0.045, 0.044], [1, 0.042, 0.042]], 12);
    JG.foArm = shaped([[0, 0.043, 0.043], [0.3, 0.046, 0.044], [0.85, 0.034, 0.036], [1, 0.032, 0.034]], 12);
    JG.neck = shaped([[0, 0.05, 0.052], [1, 0.045, 0.047]], 10);
    // 上体（腰→肩）。背中はやや丸く、肩で広がる
    JG.torso = shaped([[0, 0.1, 0.135], [0.18, 0.105, 0.14], [0.45, 0.112, 0.155], [0.72, 0.122, 0.185, 0.1], [0.9, 0.105, 0.2, 0.15], [0.98, 0.07, 0.15], [1.03, 0.045, 0.06]], 24);
    JG.torso.translate(0, 0.5, 0); // 腰を原点に
    // 靴（+x がつま先）
    JG.shoe = (() => { const g = loft([[-0.06, 0.004, 0.004], [-0.05, 0.03, 0.034], [0, 0.034, 0.04], [0.06, 0.028, 0.04], [0.11, 0.018, 0.032], [0.125, 0.004, 0.004]].map(([x, h, w]) => ({ x, y: 0, h, w, sq: 0.2 })), 12, 3); return g; })();
    JG.stirrup = new T.TorusGeometry(0.058, 0.006, 6, 16);
    JG.strap = new T.BoxGeometry(0.02, 1, 0.004);
    JG.helmet = new T.SphereGeometry(1, 24, 14, 0, TAU, 0, Math.PI * 0.6);
    JG.peak = (() => { const sh = new T.Shape(); sh.absarc(0, 0, 1, -1.05, 1.05, false); sh.absarc(-0.25, 0, 0.9, 0.95, -0.95, true); const g = new T.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false, curveSegments: 16 }); g.rotateX(Math.PI / 2); return g; })();
    JG.lens = new T.CylinderGeometry(1, 0.96, 1, 20, 1, true, -1.1, 2.2);
    JG.band = new T.CylinderGeometry(1, 1, 1, 24, 1, true);
    JG.whip = (() => { const g = new T.CylinderGeometry(0.004, 0.009, 0.62, 6); g.translate(0, 0.31 - 0.06, 0); return g; })();
    JG.flap = (() => { const g = new T.BoxGeometry(0.004, 0.09, 0.026); g.translate(0, 0.62 - 0.06 + 0.03, 0); return g; })();
    return JG;
  }

  function buildJockey(opt, g) {
    const jg = jockeyGeoms();
    const s = opt.silks || { base: '#c62828', accent: '#ffffff', pattern: 'plain', cap: '#c62828' };
    const tex = silksTexture(s);
    const mSilk = new T.MeshStandardMaterial({ map: tex, roughness: 0.42 });
    const mCap = std(s.cap || s.base, 0.3);
    const mBreech = std('#f1efe8', 0.65);
    const mBoot = std('#0e0e0f', 0.25);
    const mCuff = std('#8a5a33', 0.5);
    const mSkin = std('#c9997c', 0.6);
    const mGlove = std('#ecebe6', 0.7);
    const mMetal = std('#b9bcc0', 0.3, { metalness: 0.8 });
    const mLeather = std('#2a1c12', 0.6);
    const mGog = new T.MeshStandardMaterial({ color: '#1a2026', roughness: 0.06, metalness: 0.85 });
    const root = new T.Group();
    const add = (geo, mat, cast = true) => { const m = mesh(geo, mat, cast); root.add(m); return m; };
    const J = { root, arms: [], legs: [], pov: [] };
    J.torso = add(jg.torso, mSilk);
    J.pelvis = add(jg.ball, mBreech); J.pelvis.scale.set(0.11, 0.088, 0.13);
    J.hipBall = J.pelvis;
    J.neckM = add(jg.neck, mSkin);
    // 頭：顔・ヘルメット（帽色）・ひさし・ゴーグル・あごひも
    J.headG = new T.Group(); root.add(J.headG);
    J.head = mesh(jg.ball, mSkin); J.head.scale.set(0.092, 0.104, 0.086); J.headG.add(J.head);
    const helmet = mesh(jg.helmet, mCap); helmet.scale.set(0.116, 0.118, 0.108); helmet.position.set(-0.008, 0.012, 0); helmet.rotation.z = 0.42; J.headG.add(helmet);
    const peak = mesh(jg.peak, mCap, false); peak.scale.set(0.105, 0.14, 0.1); peak.position.set(0.035, 0.05, 0); peak.rotation.z = -0.2; J.headG.add(peak);
    const lens = mesh(jg.lens, mGog, false); lens.scale.set(0.099, 0.042, 0.093); lens.position.set(0.004, 0.012, 0); lens.rotation.set(0, Math.PI / 2, 0); J.headG.add(lens);
    const band = mesh(jg.band, mLeather, false); band.scale.set(0.1195, 0.016, 0.1115); band.position.set(-0.008, 0.03, 0); band.rotation.z = 0.3; J.headG.add(band);
    const chin = mesh(jg.band, mLeather, false); chin.scale.set(0.004, 0.13, 0.088); chin.position.set(0.02, -0.045, 0); chin.rotation.set(0, 0, 0.1); J.headG.add(chin);
    const nose = mesh(jg.ball, mSkin, false); nose.scale.set(0.02, 0.022, 0.014); nose.position.set(0.09, -0.03, 0); J.headG.add(nose);
    J.goggle = lens;
    J.helmet = { set visible(v) { helmet.visible = v; peak.visible = v; band.visible = v; chin.visible = v; } };
    // 腕
    for (const sd of [1, -1]) {
      const up = add(jg.upArm, mSilk), fo = add(jg.foArm, mSilk);
      const sh = add(jg.ball, mSilk); sh.scale.set(0.054, 0.052, 0.054);
      const el = add(jg.ball, mSilk); el.scale.setScalar(0.045);
      const hand = new T.Group(); root.add(hand);
      const gl = mesh(jg.ball, mGlove); gl.scale.set(0.044, 0.036, 0.038); hand.add(gl);
      const cuff = add(jg.band, mGlove, false); cuff.scale.set(0.036, 0.03, 0.038);
      J.arms.push({ sd, up, fo, hand, sh, el, cuff });
    }
    // 脚：白い乗馬ズボン、黒い長靴（上は茶色の折り返し）、鐙と鐙革
    for (const sd of [1, -1]) {
      const th = add(jg.thigh, mBreech), sn = add(jg.shin, mBoot);
      const kn = add(jg.ball, mBreech); kn.scale.setScalar(0.06);
      const cuff = add(jg.band, mCuff, false);
      const foot = add(jg.shoe, mBoot);
      const iron = add(jg.stirrup, mMetal, false);
      const strap = add(jg.strap, mLeather, false);
      J.legs.push({ sd, th, sn, kn, cuff, foot, iron, strap });
    }
    // ムチ（右手）
    J.whip = new T.Group(); J.whip.add(mesh(jg.whip, mBoot, false)); J.whip.add(mesh(jg.flap, mLeather, false));
    J.arms[0].hand.add(J.whip);
    // 騎手視点では、自分の頭や胴は消し、前腕と手だけを見せる
    J.pov = [J.torso, J.pelvis, J.neckM, J.headG, ...J.arms.flatMap(a => [a.up, a.sh])];
    J.setPov = (on) => { J.pov.forEach(o => { o.visible = !on; }); };
    J.cfg = { hw: opt.bodyHalfWidth || 0.26 };
    J.st = { whipDir: new T.Vector3(-0.5, -0.8, 0.2) };
    return J;
  }

  // 2点を結ぶように長さ1の手足を置く
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _Y = new T.Vector3(0, 1, 0), _X = new T.Vector3(1, 0, 0), _q = new T.Quaternion(), _m4 = new T.Matrix4(), _z = new T.Vector3(), _x2 = new T.Vector3();
  // side: 手足の「前」をどちらへ向けるか（ひねりを決める）。なければ最短の回転
  function place(m, a, b, side) {
    _d.subVectors(b, a); const L = _d.length(); _d.multiplyScalar(1 / (L || 1));
    m.position.addVectors(a, b).multiplyScalar(0.5);
    if (side) { _z.crossVectors(side, _d).normalize(); _x2.crossVectors(_d, _z).normalize(); _m4.makeBasis(_x2, _d, _z); m.quaternion.setFromRotationMatrix(_m4); }
    else m.quaternion.setFromUnitVectors(_Y, _d);
    m.scale.set(1, L, 1);
  }
  // 2関節IK：根元 A、先端 C、長さ l1/l2、曲がる向き bend
  function ik(A, C, l1, l2, bend, out) {
    _d.subVectors(C, A); let L = _d.length();
    const maxL = (l1 + l2) * 0.999; if (L > maxL) { _d.multiplyScalar(maxL / L); C = _a.copy(A).add(_d); L = maxL; }
    const dir = _d.clone().normalize();
    const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const perp = bend.clone().addScaledVector(dir, -bend.dot(dir)).normalize();
    out.copy(A).addScaledVector(dir, x).addScaledVector(perp, h);
    return C;
  }

  // 騎手のアニメーション（手続き馬・glb馬の共通）
  // baseY: 鞍上面の高さ（揺れの平均）、bounce: 今の鞍の上下ずれ
  //  st.effort: 0=強く抑える 〜 1=全力で追う / st.whipT: ムチの残り時間 / st.ease: ゴール後に腰を上げて流す / st.win: 勝ってガッツポーズ
  const V = () => new T.Vector3();
  const P = { hip: V(), sh: V(), head: V(), foot: V(), knee: V(), hipS: V(), shS: V(), hand: V(), rein: V(), elb: V(), wind: V(), hit: V(), dir: V(), up: V() };
  const FWD = new T.Vector3(1, 0, 0);
  const lerp3 = (out, a, b, t) => out.copy(a).lerp(b, t);
  function animateJockey(m, st, ph, bounce, pitch, baseY) {
    const J = m.jockey, S = J.st;
    J.root.position.y = baseY + bounce; // 足（鐙）は馬と一緒に動く
    J.root.rotation.z = pitch * 0.6;
    // 追う強さ・抑える強さは急に切り替えず、なめらかに移る
    const e = st.effort == null ? 0.5 : st.effort;
    const pushT = clamp((e - 0.55) / 0.4, 0, 1), relaxT = clamp((0.34 - e) / 0.2, 0, 1) + (st.kakari > 0.6 ? 0.5 : 0);
    S.push = S.push == null ? pushT : S.push + (pushT - S.push) * 0.15;
    S.relax = S.relax == null ? relaxT : S.relax + (Math.min(1, relaxT) - S.relax) * 0.15;
    S.ease = (S.ease || 0) + ((st.ease ? 1 : 0) - (S.ease || 0)) * 0.05;
    const push = S.push * (1 - S.ease), relax = S.relax * (1 - S.ease), ease = S.ease;
    const w = TAU * ph + 1.4, sw = Math.sin(w), cw = Math.cos(w);
    const hw = J.cfg.hw;
    const absorb = -bounce * 0.85; // 上体は膝で上下動を吸収する
    const lean = (st.lean || 0) * 0.06;
    // 腰・肩・頭。追うと腰と肩が前後に大きく動き、抑えると上体が起きて後ろへ体重をかける
    P.hip.set(-0.17 + 0.055 * push * sw - 0.05 * relax + 0.04 * ease, 0.35 + absorb - 0.04 * push + 0.025 * push * Math.sin(w + 1) - 0.02 * relax + 0.1 * ease, lean);
    const back = 0.3 - 0.14 * push + 0.3 * relax + 0.9 * ease - 0.07 * push * sw; // 背中の角度（0=水平）
    P.sh.set(P.hip.x + 0.5 * Math.cos(back), P.hip.y + 0.5 * Math.sin(back), lean * 1.5);
    place(J.torso, P.hip, P.sh, FWD.set(-Math.sin(back), Math.cos(back), 0)); J.torso.position.copy(P.hip);
    J.torso.scale.set(1, 0.5, 1);
    J.pelvis.position.set(P.hip.x - 0.01, P.hip.y - 0.01, P.hip.z);
    // 頭：肩の前・上。前を見る。追うときは少し下がる
    P.head.set(P.sh.x + 0.1 - 0.07 * ease - 0.03 * relax, P.sh.y + 0.14 + 0.05 * ease + 0.02 * relax - 0.012 * push * sw, P.sh.z);
    J.headG.position.copy(P.head);
    J.headG.rotation.z = -0.1 * push + 0.08 * relax + (st.win ? 0.15 : 0);
    J.headG.rotation.y = (st.lean || 0) * 0.2;
    place(J.neckM, _b.set(P.sh.x - 0.01, P.sh.y + 0.01, P.sh.z).clone(), _a.set(P.head.x - 0.03, P.head.y - 0.07, P.head.z).clone());
    // 脚：足は鐙（鞍の少し前・下）。太ももはほぼ水平、すねは後ろへ傾く
    J.legs.forEach(L => {
      const z = L.sd * (hw + 0.055);
      P.foot.set(0.07 - 0.03 * relax, -0.25, z);
      P.hipS.set(P.hip.x + 0.02, P.hip.y - 0.04, P.hip.z + L.sd * 0.105);
      const bend = _x2.set(1, 0.45, L.sd * 0.3).clone();
      const f = ik(P.hipS, P.foot, 0.41, 0.45, bend, P.knee).clone();
      place(L.th, P.hipS, P.knee); place(L.sn, P.knee, f);
      L.kn.position.copy(P.knee);
      L.cuff.position.copy(P.knee).lerp(f, 0.13); L.cuff.quaternion.copy(L.sn.quaternion); L.cuff.scale.set(0.061, 0.07, 0.06);
      L.foot.position.set(f.x - 0.01, f.y - 0.035, f.z); L.foot.rotation.set(0, L.sd * -0.12, -0.18 - 0.1 * relax);
      L.iron.position.set(f.x + 0.03, f.y - 0.02, f.z); L.iron.rotation.set(0, Math.PI / 2, 0);
      place(L.strap, _a.set(f.x + 0.03, f.y + 0.035, f.z).clone(), _b.set(-0.02, 0.0, L.sd * (hw + 0.01)).clone());
    });
    // 腕：手は首すじ（たてがみ）の上で手綱を持つ。追うと肘を使って前へ押し出す
    const t = st.whipT > 0 ? 1.3 - st.whipT : -1;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    J.arms.forEach(a => {
      P.shS.set(P.sh.x - 0.03, P.sh.y - 0.035, P.sh.z + a.sd * 0.185);
      const reach = 0.14 * push * sw;
      P.rein.set(0.52 + reach - 0.14 * relax - 0.16 * ease, 0.08 + 0.035 * push * cw + 0.07 * relax + 0.12 * ease, a.sd * 0.085 + lean);
      P.hand.copy(P.rein);
      let bend = _x2.set(-0.25, -0.75, a.sd * 0.75);
      const whipArm = a.sd === (st.whipSide || 1);
      if (whipArm && t >= 0 && J.whip.parent !== a.hand) a.hand.add(J.whip); // 打つ側の手に持ち替える
      let wd = P.dir.set(-0.45, -0.8, a.sd * 0.25); // ムチは普段、馬の肩に沿って下げて持つ
      if (whipArm && t >= 0) {
        // 振りかぶる → 馬の腰のあたりを打つ → 手綱へ戻す
        P.wind.set(P.sh.x - 0.04, P.sh.y + 0.13, P.sh.z + a.sd * 0.42);
        P.hit.set(P.hip.x - 0.1, P.hip.y - 0.03, P.hip.z + a.sd * 0.44);
        if (t < 0.2) { const k = sm(t / 0.2); lerp3(P.hand, P.rein, P.wind, k); wd.lerp(_a.set(-0.35, 0.9, a.sd * 0.25), k); }
        else if (t < 0.34) { const k = Math.pow((t - 0.2) / 0.14, 2); lerp3(P.hand, P.wind, P.hit, k); wd.copy(_a.set(-0.35, 0.9, a.sd * 0.25)).lerp(_b.set(-0.95, -0.3, a.sd * 0.05), Math.min(1, k * 1.3)); }
        else if (t < 0.8) { const k = sm((t - 0.34) / 0.46); lerp3(P.hand, P.hit, P.rein, k); wd.copy(_b.set(-0.95, -0.3, a.sd * 0.05)).lerp(_a.set(-0.45, -0.8, a.sd * 0.25), k); }
        bend = _x2.set(-0.5, 0.25, a.sd * 1.0);
      } else if (st.win && !whipArm) {
        // 勝ったら片手を突き上げる
        const k = ease, pump = 0.04 * Math.sin(now * 7);
        P.hand.lerp(_a.set(P.sh.x + 0.12, P.sh.y + 0.44 + pump, P.sh.z + a.sd * 0.3), k);
        bend = _x2.set(0.3, -0.2, a.sd * 1.0);
      }
      const hnd = ik(P.shS, P.hand, 0.29, 0.27, bend.clone(), P.elb).clone();
      place(a.up, P.shS, P.elb); place(a.fo, P.elb, hnd);
      a.sh.position.copy(P.shS); a.el.position.copy(P.elb);
      a.hand.position.copy(hnd);
      a.cuff.position.copy(hnd).lerp(P.elb, 0.16); a.cuff.quaternion.copy(a.fo.quaternion);
      if (J.whip.parent === a.hand) { S.whipDir.lerp(wd.normalize(), 0.5).normalize(); J.whip.quaternion.setFromUnitVectors(_Y, S.whipDir); }
    });
    // 手綱
    m.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const hand = J.arms[i].hand, bit = i === 0 ? m.bitL : m.bitR;
      hand.getWorldPosition(tmpV); bit.getWorldPosition(tmpV2);
      m.root.worldToLocal(tmpV); m.root.worldToLocal(tmpV2);
      const r = m.reins[i];
      r.position.copy(tmpV).add(tmpV2).multiplyScalar(0.5);
      r.scale.set(1, 1, tmpV.distanceTo(tmpV2));
      r.lookAt(tmpV2.applyMatrix4(m.root.matrixWorld));
    }
  }

  function setLegRest(L) {
    if (L.type === 'F') { L.a.rotation.z = 0; L.b.rotation.z = 0; L.c.rotation.z = 0.5; L.d.rotation.z = -0.45; }
    else { L.a.rotation.z = 0.45; L.b.rotation.z = -0.95; L.c.rotation.z = 0.55; L.d.rotation.z = 0.55; L.e.rotation.z = -0.55; }
  }

  // 実物の馬モデル（glb）が読み込めていればそちらを使う
  function createAny(opt) {
    if (window.HorseGLB && HorseGLB.ready) { try { return HorseGLB.create(opt); } catch (e) { console.warn('glb horse failed', e); } }
    return create(opt);
  }
  window.Horse3D = { create: createAny, marksFor, COAT_JP, createProcedural: create, coatFor, COATS, silksTexture, _geoms: geoms, _clothTexture: clothTexture, _buildJockey: buildJockey, _animateJockey: animateJockey };
})();
