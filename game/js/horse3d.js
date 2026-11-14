// ===== 3D 馬・騎手モデル（手続き生成） =====
// 外部の glb モデル（assets/horse.glb）が用意された場合はそちらを優先できるよう、
// 生成部分は create() の内側に閉じている。
(function () {
  const T = THREE;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => t * t * (3 - 2 * t);

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
  };
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
    const mCloth = new T.MeshStandardMaterial({ map: clothT, roughness: 0.85, side: T.DoubleSide });
    for (const s of [1, -1]) { const c = mesh(g.cloth, mCloth, false); c.position.set(0.2, 1.4, s * 0.305); c.rotation.set(0, s > 0 ? 0 : Math.PI, 0); c.rotation.x = s * 0.12; body.add(c); }
    const girth = mesh(g.girth, mTack, false); girth.position.set(0.36, 1.3, 0); girth.rotation.x = Math.PI / 2; girth.rotation.z = Math.PI / 2; girth.scale.set(1, 1, 1.02); body.add(girth);

    // 騎手
    const J = buildJockey(opt, g);
    body.add(J.root);

    // 手綱（毎フレーム、手とハミの間に伸ばす）
    const reins = [mesh(g.strap, mTack, false), mesh(g.strap, mTack, false)];
    reins.forEach(r => root.add(r));
    const bitL = pivot(0.38, -0.3, 0.07, headP), bitR = pivot(0.38, -0.3, -0.07, headP);

    const model = {
      root, body, neckP, headP, legs, mane, tail, jockey: J, reins, bitL, bitR, clothT,
      lastPhase: 0,
      update(st, dt, time) { animate(model, st, dt, time); },
      setPlayerView(on) { model.pov = on; J.whip.visible = !on; J.torso.visible = J.head.visible = J.helmet.visible = !on; J.goggle.visible = !on; J.arms.forEach(a => { a.up.visible = !on; a.fo.scale.setScalar(on ? 0.85 : 1); }); },
      dispose() { clothT.dispose(); },
    };
    if (opt.isPlayer) model.setPlayerView(true);
    return model;
  }

  // 騎手：上体・腕・脚をなめらかな断面のつながりで作る（向きは +x が前）
  let JG = null;
  function jockeyGeoms() {
    if (JG) return JG;
    JG = {};
    // 上体（腰→肩）。y が背骨方向、h が胸の厚み、w が肩幅
    JG.torso = loft([
      { x: 0, y: -0.02, h: 0.02, w: 0.02 },
      { x: 0, y: 0.03, h: 0.11, w: 0.15 },
      { x: 0, y: 0.14, h: 0.115, w: 0.145 },
      { x: 0, y: 0.27, h: 0.13, w: 0.175 },
      { x: 0, y: 0.38, h: 0.12, w: 0.2, sq: 0.08 },
      { x: 0, y: 0.45, h: 0.085, w: 0.17 },
      { x: 0, y: 0.5, h: 0.05, w: 0.06 },
      { x: 0, y: 0.54, h: 0.045, w: 0.05 },
    ], 22, 4);
    const limb = (r0, r1, L) => loft([
      { x: 0, y: 0.015, h: 0.005, w: 0.005 },
      { x: 0, y: 0, h: r0, w: r0 },
      { x: 0, y: -L * 0.35, h: r0 * 0.95, w: r0 * 0.95 },
      { x: 0, y: -L, h: r1, w: r1 },
      { x: 0, y: -L - 0.015, h: 0.005, w: 0.005 },
    ], 12, 3);
    JG.upperArm = limb(0.05, 0.04, 0.27);
    JG.foreArm = limb(0.04, 0.032, 0.25);
    JG.thigh = limb(0.085, 0.058, 0.33);
    JG.shin = limb(0.056, 0.042, 0.32);
    JG.cuff = new T.CylinderGeometry(0.062, 0.058, 0.07, 12, 1, true);
    JG.foot = new T.SphereGeometry(1, 12, 8);
    JG.head = new T.SphereGeometry(1, 20, 16);
    JG.helmet = new T.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI * 0.56);
    JG.peak = new T.CylinderGeometry(1, 1, 1, 20, 1, false, -0.8, 1.6);
    JG.goggle = new T.CylinderGeometry(1, 1, 1, 20, 1, true, -0.9, 1.8);
    JG.hand = new T.SphereGeometry(1, 12, 10);
    JG.collar = new T.TorusGeometry(0.06, 0.018, 8, 16);
    return JG;
  }

  function buildJockey(opt, g) {
    const jg = jockeyGeoms();
    const s = opt.silks || { base: '#c62828', accent: '#ffffff', pattern: 'plain', cap: '#c62828' };
    const tex = silksTexture(s);
    const mSilk = new T.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.0 });
    const mSleeve = new T.MeshStandardMaterial({ map: tex, roughness: 0.38 });
    const mCap = std(s.cap || s.base, 0.3);
    const mBreech = std('#f4f2ed', 0.62);
    const mBoot = std('#0b0b0b', 0.22);
    const mCuff = std('#8a5a32', 0.5);
    const mSkin = std('#d6a184', 0.55);
    const mGlove = std('#efefef', 0.6);
    const mGog = new T.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.08, metalness: 0.6 });
    const root = pivot(0.26, 1.66, 0); root.scale.setScalar(1.05);
    // 腰（鐙の上で立って腰を浮かせる）
    const hips = pivot(-0.04, 0.34, 0, root);
    const seat = mesh(jg.head, mBreech); seat.scale.set(0.09, 0.075, 0.12); seat.position.x = 0.03; hips.add(seat);
    // 脚：太もも→膝→すね。膝で馬体を挟む
    const legs = [];
    for (const sd of [1, -1]) {
      const thP = pivot(0, -0.02, sd * 0.1, hips); thP.rotation.set(sd * 0.32, 0, 0.95);
      thP.add(mesh(jg.thigh, mBreech));
      const kn = pivot(0, -0.33, 0, thP); kn.rotation.z = -2.15;
      kn.add(mesh(jg.shin, mBoot));
      const cuff = mesh(jg.cuff, mCuff, false); cuff.position.y = -0.03; kn.add(cuff);
      const ft = mesh(jg.foot, mBoot); ft.scale.set(0.11, 0.045, 0.05); ft.position.set(0.05, -0.34, 0); kn.add(ft);
      legs.push({ thP, kn });
    }
    // 上体（ほぼ水平の前傾）
    const torsoP = pivot(0, 0.0, 0, hips); torsoP.rotation.z = -1.3;
    const torso = mesh(jg.torso, mSilk); torsoP.add(torso);
    // 首と頭（前を向く）
    const neck = pivot(0, 0.5, 0, torsoP); neck.rotation.z = 1.12;
    const head = mesh(jg.head, mSkin); head.scale.set(0.095, 0.11, 0.088); head.position.set(0.03, 0.09, 0); neck.add(head);
    const helmet = mesh(jg.helmet, mCap); helmet.scale.set(0.118, 0.13, 0.11); helmet.position.set(0.015, 0.115, 0); helmet.rotation.z = 0.35; neck.add(helmet);
    const peak = mesh(jg.peak, mCap, false); peak.scale.set(0.12, 0.012, 0.11); peak.position.set(0.075, 0.12, 0); peak.rotation.set(0, Math.PI / 2, -0.25); neck.add(peak);
    const goggle = mesh(jg.goggle, mGog, false); goggle.scale.set(0.1, 0.045, 0.098); goggle.position.set(0.02, 0.095, 0); goggle.rotation.y = Math.PI / 2; neck.add(goggle);
    // 腕
    const arms = [];
    for (const sd of [1, -1]) {
      const sh = pivot(0.0, 0.42, sd * 0.16, torsoP);
      const up = mesh(jg.upperArm, mSleeve); sh.add(up);
      const el = pivot(0, -0.27, 0, sh);
      const fo = mesh(jg.foreArm, mSleeve); el.add(fo);
      const hand = pivot(0, -0.27, 0, el);
      const gl = mesh(jg.hand, mGlove); gl.scale.set(0.042, 0.05, 0.04); hand.add(gl);
      arms.push({ sh, el, hand, sd, up, fo });
    }
    const whip = mesh(g.whip, mBoot, false); arms[1].hand.add(whip); whip.rotation.z = -2.2;
    return { root, hips, torsoP, torso, head, helmet: { set visible(v) { helmet.visible = v; peak.visible = v; } }, goggle, arms, whip, neck, legs };
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
    // 騎手：馬の上下動を膝で吸収して頭の位置を保つ
    const J = m.jockey;
    J.root.position.y = 1.66 - bounce * 0.8;
    J.root.rotation.z = -pitch * 0.85;
    const push = st.effort > 0.85 ? 1 : st.effort > 0.6 ? 0.5 : 0.15;
    const pumpPh = TAU * ph + 1.4;
    J.torsoP.rotation.z = -1.3 + 0.07 * push * Math.sin(pumpPh) - (st.effort < 0.3 ? 0.2 : 0);
    J.hips.position.x = -0.04 + 0.05 * push * Math.sin(pumpPh);
    J.hips.position.y = 0.34 - (st.effort < 0.3 ? 0.04 : 0) + 0.02 * push * Math.sin(pumpPh + 1);
    J.arms.forEach((a, i) => {
      const reach = 0.25 * push * Math.sin(pumpPh);
      let sh = 2.05 + reach - (st.effort < 0.3 ? 0.35 : 0);
      let el = -0.55 + 0.3 * push * Math.sin(pumpPh + 0.4);
      if (a.sd === st.whipSide && st.whipT > 0 && !m.pov) { // ムチを振る腕（騎手視点では画面を覆うので振り上げない）
        const t = 1.3 - st.whipT; const sw = Math.sin(Math.min(1, t / 0.45) * Math.PI);
        sh = 2.4 + 1.3 * sw; el = -0.2 - 0.8 * sw;
      }
      a.sh.rotation.z = sh; a.el.rotation.z = el;
      a.sh.rotation.x = a.sd * 0.15;
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

  window.Horse3D = { create, coatFor, COATS, silksTexture };
})();
