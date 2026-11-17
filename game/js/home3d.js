// ===== ホーム画面：トレセンの町の立体マップ =====
// 小さな島の上に競馬場・厩舎・ショップなどが並ぶ。建物の上の札を押すと、その画面へ移る。
// 季節（月）で芝や木の色が変わり、馬がコースを走り、雲が流れる。
(function () {
  const T = window.THREE;
  if (!T) { window.Home3D = { mount() {}, stop() {}, drag() {} }; return; }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // 季節ごとの色
  function season(m) {
    if (m >= 3 && m <= 5) return { k: 'spring', grass: '#8fd470', grass2: '#7fc763', tree: m <= 4 ? ['#ffb7d5', '#ffc9e0', '#f8a5c8'] : ['#6fc45a', '#82d06a'], sky: ['#aee0ff', '#eaf6ff'] };
    if (m >= 6 && m <= 8) return { k: 'summer', grass: '#63c04a', grass2: '#55b03f', tree: ['#2f9a48', '#3fae55'], sky: ['#7fcbff', '#dff3ff'] };
    if (m >= 9 && m <= 11) return { k: 'autumn', grass: '#a9c860', grass2: '#9aba52', tree: ['#f08a3c', '#e2562f', '#f2b441'], sky: ['#ffd9a8', '#fff3e2'] };
    return { k: 'winter', grass: '#eef4f8', grass2: '#dfe9f0', tree: ['#3d7f5a', '#4a8f68'], sky: ['#c9d8f0', '#f1f5fb'] };
  }

  const H = { cache: {}, key: null, cam: { fitW: 43, hhMin: 16.6, look: [0, 3, 0], el: 0.62, sway: 0.6 }, el: null, canvas: null, labels: null, renderer: null, scene: null, camera: null, raf: 0, t: 0, az: 0, azV: 0, azT: 0, spots: [], horses: [], anim: [], month: null, onGo: null, w: 0, h: 0, last: 0 };

  const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
  function box(w, h, d, c, x = 0, y = 0, z = 0, o) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; }
  function cyl(r, h, c, x = 0, y = 0, z = 0, seg = 16, r2) { const m = new T.Mesh(new T.CylinderGeometry(r2 ?? r, r, h, seg), mat(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; }
  // 切妻屋根（三角柱）
  function gable(w, h, d, c, x, y, z) {
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    const m = new T.Mesh(g, mat(c)); m.position.set(x, y, z); m.castShadow = true; return m;
  }
  function pyramid(w, h, c, x, y, z) { const m = new T.Mesh(new T.ConeGeometry(w * 0.72, h, 4), mat(c)); m.rotation.y = Math.PI / 4; m.position.set(x, y + h / 2, z); m.castShadow = true; return m; }
  function tree(S, x, z, s = 1) {
    const g = new T.Group();
    g.add(cyl(0.16 * s, 0.9 * s, '#8a6242', 0, 0, 0, 6));
    const c = S.tree[Math.floor(Math.random() * S.tree.length)];
    if (S.k === 'winter') { const a = new T.Mesh(new T.ConeGeometry(0.75 * s, 1.7 * s, 7), mat(c)); a.position.y = 1.6 * s; a.castShadow = true; g.add(a); const b = new T.Mesh(new T.ConeGeometry(0.42 * s, 0.6 * s, 7), mat('#ffffff')); b.position.y = 2.25 * s; g.add(b); }
    else { const a = new T.Mesh(new T.IcosahedronGeometry(0.85 * s, 0), mat(c, { flatShading: true })); a.position.y = 1.5 * s; a.castShadow = true; g.add(a); const b = new T.Mesh(new T.IcosahedronGeometry(0.55 * s, 0), mat(c, { flatShading: true })); b.position.set(0.45 * s, 1.95 * s, 0.2 * s); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, z); g.rotation.y = rnd(0, 6); return g;
  }
  function flag(c, x, y, z, h = 2.2) {
    const g = new T.Group(); g.add(cyl(0.05, h, '#f4f4f4', 0, 0, 0, 6));
    const f = new T.Mesh(new T.PlaneGeometry(0.9, 0.55, 6, 1), new T.MeshStandardMaterial({ color: c, side: T.DoubleSide, roughness: 0.8 })); f.position.set(0.47, h - 0.32, 0); g.add(f);
    g.position.set(x, y, z); H.anim.push((t) => { const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 0.45) / 0.9; p.setZ(i, Math.sin(t * 5 + u * 4 + x) * 0.09 * u); } p.needsUpdate = true; });
    return g;
  }
  // 楕円コース上の点（lane は外側へのずれ）
  const TR = { cx: 0, cz: -5.5, a: 12.5, b: 5.2 };
  function trackPt(u, lane = 0) {
    const th = u * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const x = TR.a * c, z = TR.b * s;
    let nx = c / TR.a, nz = s / TR.b; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    return { x: TR.cx + x + nx * lane, z: TR.cz + z + nz * lane, tx: -TR.a * s, tz: TR.b * c };
  }
  function ring(inner, outer, c, y) {
    const N = 96, pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const a = trackPt(i / N, inner), b = trackPt(i / N, outer); pos.push(a.x, y, a.z, b.x, y, b.z); }
    for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, mat(c)); m.receiveShadow = true; return m;
  }
  function rail(lane, y = 0.42) {
    const pts = []; for (let i = 0; i < 80; i++) { const p = trackPt(i / 80, lane); pts.push(new T.Vector3(p.x, y, p.z)); }
    const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 160, 0.05, 5, true), mat('#ffffff')); m.castShadow = true;
    const g = new T.Group(); g.add(m);
    for (let i = 0; i < 40; i++) { const p = trackPt(i / 40, lane); g.add(cyl(0.035, y, '#ffffff', p.x, 0, p.z, 5)); }
    return g;
  }
  // 小さな馬と騎手
  function horse(coat, silk, rider = true) {
    const g = new T.Group(), legs = [];
    g.add(box(1.25, 0.5, 0.42, coat, 0, 0.62, 0));
    const neck = box(0.3, 0.62, 0.3, coat, 0.62, 0.85, 0); neck.rotation.z = -0.55; g.add(neck);
    const head = box(0.5, 0.26, 0.26, coat, 0.98, 1.3, 0); head.rotation.z = -0.25; g.add(head);
    const tail = box(0.1, 0.5, 0.1, '#2a2019', -0.68, 0.55, 0); tail.rotation.z = -0.5; g.add(tail);
    [[0.45, 0.13], [0.45, -0.13], [-0.45, 0.13], [-0.45, -0.13]].forEach(([x, z], i) => { const p = new T.Group(); p.position.set(x, 0.66, z); const l = box(0.12, 0.66, 0.12, coat, 0, -0.66, 0); p.add(l); g.add(p); legs.push(p); });
    if (rider) { const r = box(0.3, 0.38, 0.3, silk, -0.02, 1.12, 0); r.rotation.z = -0.5; g.add(r); const hd = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), mat('#ffffff')); hd.position.set(0.2, 1.62, 0); g.add(hd); }
    return { g, legs, head, neck };
  }

  // cfg = { region: 'miho' | 'ritto', home: 所属のトレセンか }
  function buildTown(month, cfg) {
    const S = season(month);
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight('#ffffff', S.k === 'winter' ? '#c9d6e6' : '#b9d6a0', 0.95));
    const sun = new T.DirectionalLight(S.k === 'autumn' ? '#ffe7c4' : '#fff6e6', 0.9);
    sun.position.set(-22, 34, 18); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.left = -44; c.right = 44; c.top = 30; c.bottom = -30; c.near = 1; c.far = 110; sun.shadow.bias = -0.0015;
    sc.add(sun);

    // 島（角の丸い板）
    const rr = (w, d, r) => { const s = new T.Shape(); s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return s; };
    const isl = new T.Mesh(new T.ExtrudeGeometry(rr(80, 36, 7), { depth: 2.6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3 }), [mat(S.grass), mat(S.k === 'winter' ? '#b9a48c' : '#c59a6a')]);
    isl.rotation.x = -Math.PI / 2; isl.position.set(5, -3.1, 0); isl.receiveShadow = true; sc.add(isl);
    const blob = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ color: '#27406b', transparent: true, opacity: 0.16 })); blob.rotation.x = -Math.PI / 2; blob.scale.set(43, 20, 1); blob.position.set(5, -7, 0); sc.add(blob);
    // 道
    const road = (x, z, w, d) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), mat(S.k === 'winter' ? '#d9d2c4' : '#f1dfb8')); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; sc.add(m); };
    road(4, 4.6, 70, 1.7); road(33, -2, 1.7, 13); road(-21, -2, 1.7, 13); road(21, -2, 1.7, 13); road(0, 2.4, 1.7, 3);

    const spot = (tab, x, y, z, g) => { H.spots.push({ tab, pos: new T.Vector3(x, y, z), g }); if (g) sc.add(g); };
    const home = cfg.home;

    // ---- 競馬場（今週のレース） ----
    sc.add(ring(-1.25, 1.25, S.k === 'winter' ? '#9fc98a' : '#4fae3f', 0.03)); // 芝コース
    sc.add(ring(-2.6, -1.45, '#c9a57a', 0.03)); // ダートコース
    const inf = new T.Mesh(new T.CircleGeometry(1, 48), mat(S.grass2)); inf.rotation.x = -Math.PI / 2; inf.scale.set(TR.a - 2.7, TR.b - 2.7, 1); inf.position.set(TR.cx, 0.025, TR.cz); inf.receiveShadow = true; sc.add(inf);
    const pond = new T.Mesh(new T.CircleGeometry(1, 28), mat('#7fd0f2', { roughness: 0.25 })); pond.rotation.x = -Math.PI / 2; pond.scale.set(2.6, 1.1, 1); pond.position.set(-2.5, 0.04, TR.cz); sc.add(pond);
    sc.add(rail(1.35)); sc.add(rail(-1.35)); sc.add(rail(-2.7, 0.34));
    const st = new T.Group(); // スタンド
    st.add(box(13, 1.4, 2.6, '#e9edf7', 0, 0, 0));
    for (let i = 0; i < 4; i++) st.add(box(13, 0.5, 0.62, ['#5b7cfa', '#7a94ff', '#ff8a5b', '#ffb05b'][i], 0, 1.4 + i * 0.5, -0.95 + i * 0.62 - 0.0));
    st.add(box(13, 2.2, 0.5, '#dfe5f3', 0, 1.4, -1.5));
    const roof = box(13.6, 0.22, 3.6, '#5468d4', 0, 4.4, -0.3); roof.rotation.x = 0.16; st.add(roof);
    [-6.2, -2, 2, 6.2].forEach(x => st.add(cyl(0.1, 4.3, '#ffffff', x, 0, -1.6, 6)));
    st.add(flag('#ff5c7a', -6.4, 4.5, -1.5)); st.add(flag('#ffd24a', 0, 4.6, -1.5)); st.add(flag('#5b7cfa', 6.4, 4.5, -1.5));
    st.position.set(0, 0, -13.2); spot(home ? 'week' : 'stand', 0, 6.2, -13.2, st);
    // ゴール板と着順掲示板
    sc.add(cyl(0.07, 1.6, '#ffffff', 3, 0, -9.3, 6)); const gp = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.08, 16), mat('#ff4d5e')); gp.rotation.x = Math.PI / 2; gp.position.set(3, 1.75, -9.3); sc.add(gp);
    sc.add(box(2.6, 1.3, 0.3, '#1b1f2a', 3.5, 0.5, -5.5)); sc.add(box(2.2, 0.9, 0.05, '#ffb21a', 3.5, 0.7, -5.33, { emissive: '#ff9a00', emissiveIntensity: 0.5 }));
    // 走る馬
    const coats = ['#8a5a36', '#5a3a26', '#b5773f', '#d9d6d0', '#3a2a22'], silks = ['#ff5c7a', '#5b7cfa', '#ffd24a', '#35c98b', '#b06cff'];
    for (let i = 0; i < 5; i++) { const h = horse(coats[i], silks[i]); h.u = 0.18 - i * 0.022 + rnd(-0.004, 0.004); h.lane = -0.8 + (i % 3) * 0.75; h.v = 0.034 + rnd(-0.0015, 0.0015); h.ph = rnd(0, 6); h.g.scale.setScalar(0.82); sc.add(h.g); H.horses.push(h); }

    // ---- 厩舎（人脈：調教師・馬主） ----
    const barn = new T.Group();
    barn.add(box(5.4, 2.2, 3.4, '#d8573f', 0, 0, 0)); barn.add(gable(5.8, 1.5, 3.8, '#7c4a34', 0, 2.2, 0));
    barn.add(box(1.3, 1.5, 0.1, '#f6e7c8', 0, 0, 1.72)); barn.add(box(0.9, 0.7, 0.1, '#f6e7c8', -1.8, 0.9, 1.72)); barn.add(box(0.9, 0.7, 0.1, '#f6e7c8', 1.8, 0.9, 1.72));
    barn.add(cyl(0.9, 2.8, '#eadfcd', 3.9, 0, -0.4, 12)); barn.add(pyramid(1.3, 1.1, '#d8573f', 3.9, 2.8, -0.4)); // サイロ
    barn.position.set(-21, 0, -9.5); spot(home ? 'people' : 'spot:visit', -21, 5.2, -9.5, barn);
    // 放牧地
    const pad = new T.Group();
    for (let i = 0; i < 10; i++) { pad.add(cyl(0.06, 0.6, '#ffffff', -3 + i * 0.66, 0, 1.6, 5)); pad.add(cyl(0.06, 0.6, '#ffffff', -3 + i * 0.66, 0, -1.6, 5)); }
    pad.add(box(6, 0.07, 0.07, '#ffffff', 0, 0.5, 1.6)); pad.add(box(6, 0.07, 0.07, '#ffffff', 0, 0.5, -1.6)); pad.add(box(0.07, 0.07, 3.2, '#ffffff', -3, 0.5, 0)); pad.add(box(0.07, 0.07, 3.2, '#ffffff', 3, 0.5, 0));
    pad.position.set(-22, 0, -3.6); sc.add(pad);
    if (cfg.home) spot('horses', -22, 2.3, -3.6, null);
    [['#b5773f', -23.2, -3.9, 0.6], ['#d9d6d0', -20.9, -3.2, 2.6]].forEach(([c2, x, z, ry], i) => { const h = horse(c2, null, false); h.g.position.set(x, 0, z); h.g.rotation.y = ry; h.g.scale.setScalar(0.8); sc.add(h.g); H.anim.push((t) => { const k = Math.max(0, Math.sin(t * 0.6 + i * 2.4)); h.neck.rotation.z = -0.55 - k * 0.9; h.head.position.y = 1.3 - k * 0.75; h.head.position.x = 0.98 + k * 0.12; }); });

    if (home) {
    // ---- 本部（目標・成績）：時計塔 ----
    const hq = new T.Group();
    hq.add(box(4.6, 2.6, 3.2, '#f3f0ff', 0, 0, 0)); hq.add(box(4.9, 0.3, 3.5, '#8b7cf0', 0, 2.6, 0));
    hq.add(box(1.5, 3.4, 1.5, '#f3f0ff', 0, 2.9, 0)); hq.add(pyramid(1.7, 1.3, '#8b7cf0', 0, 6.3, 0));
    const clock = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.08, 20), mat('#ffffff')); clock.rotation.x = Math.PI / 2; clock.position.set(0, 5.4, 0.78); hq.add(clock);
    const hand = box(0.06, 0.4, 0.04, '#272b45', 0, 5.4, 0.84); hq.add(hand); H.anim.push((t) => { hand.rotation.z = -t * 0.4; });
    for (let i = 0; i < 4; i++) hq.add(box(0.6, 0.8, 0.06, '#a9c4ff', -1.6 + i * 1.07, 1.1, 1.62));
    hq.position.set(21, 0, -9.5); spot('goal', 21, 7.9, -9.5, hq);

    // ---- 騎手会館（騎手）：勝負服の旗と像 ----
    const jh = new T.Group();
    jh.add(box(4.2, 2.2, 3, '#fff3d6', 0, 0, 0)); jh.add(box(4.6, 0.35, 3.4, '#ff9f43', 0, 2.2, 0)); jh.add(box(1.1, 1.5, 0.08, '#8a5a36', 0, 0, 1.52));
    jh.add(cyl(0.5, 0.5, '#cfd5e6', 3.2, 0, 0.8, 12)); const stt = horse('#e8c15a', '#e8c15a'); stt.g.scale.setScalar(0.62); stt.g.position.set(3.1, 0.5, 0.8); stt.g.rotation.y = -0.6; stt.legs[0].rotation.z = 0.9; stt.legs[1].rotation.z = 0.7; stt.g.rotation.z = 0.22; jh.add(stt.g);
    jh.add(flag('#ff5c7a', -2.4, 0, 1.4, 3));
    jh.position.set(-21, 0, 8.6); spot('me', -21, 4.4, 8.6, jh);

    // ---- 自宅（私生活） ----
    const hm = new T.Group();
    hm.add(box(3.2, 2, 2.8, '#fff7ea', 0, 0, 0)); hm.add(gable(3.7, 1.4, 3.1, '#ff7b8a', 0, 2, 0));
    hm.add(box(0.7, 1.2, 0.08, '#8a5a36', -0.6, 0, 1.42)); hm.add(box(0.8, 0.7, 0.08, '#a9dcff', 0.75, 0.8, 1.42)); hm.add(box(0.5, 1.1, 0.5, '#e9c9a8', 0.9, 2.3, -0.5));
    hm.position.set(-11.5, 0, 9.2); spot('life', -11.5, 4.6, 9.2, hm);
    sc.add(box(0.5, 0.75, 0.3, '#ff5c7a', -9.1, 0.35, 8)); sc.add(cyl(0.04, 0.4, '#ffffff', -9.1, 0, 8, 5)); // 郵便受け

    // ---- トレーニングジム（スキル） ----
    const gym = new T.Group();
    gym.add(box(4.2, 2.3, 3, '#e3f6ff', 0, 0, 0)); const dome = new T.Mesh(new T.CylinderGeometry(1.55, 1.55, 4.2, 18, 1, false, 0, Math.PI), mat('#35b6e8')); dome.rotation.z = Math.PI / 2; dome.rotation.y = Math.PI / 2; dome.scale.set(1, 1, 0.75); dome.position.y = 2.3; dome.castShadow = true; gym.add(dome);
    gym.add(box(2.6, 1.3, 0.06, '#9be1ff', 0, 0.5, 1.52));
    const mok = horse('#b98a5a', '#35c98b'); mok.g.scale.setScalar(0.55); mok.g.position.set(3, 0.25, 0.9); mok.g.rotation.y = -0.5; gym.add(mok.g); gym.add(box(0.9, 0.25, 0.5, '#7a8296', 3, 0, 0.9)); // 木馬
    H.anim.push((t) => { mok.g.rotation.z = Math.sin(t * 3) * 0.12; });
    gym.position.set(-1.5, 0, 9.2); spot('skill', -1.5, 4.9, 9.2, gym);

    // ---- ショップ ----
    const shop = new T.Group();
    shop.add(box(3.6, 2.1, 2.6, '#fff0f5', 0, 0, 0)); shop.add(box(3.9, 0.3, 2.9, '#ff5c9a', 0, 2.1, 0));
    for (let i = 0; i < 6; i++) { const a = box(0.6, 0.12, 1, i % 2 ? '#ffffff' : '#ff5c9a', -1.5 + i * 0.6, 1.55, 1.75); a.rotation.x = 0.5; shop.add(a); }
    shop.add(box(1.8, 0.9, 0.06, '#bfe9ff', -0.4, 0.45, 1.32)); shop.add(box(0.6, 1.3, 0.06, '#8a5a36', 1.2, 0, 1.32));
    const sign = box(1.6, 0.7, 0.15, '#ffd24a', 0, 2.6, 0.8); shop.add(sign);
    shop.add(box(0.5, 0.5, 0.5, '#c59a6a', 2.4, 0, 1.2)); shop.add(box(0.4, 0.4, 0.4, '#d9b382', 2.45, 0.5, 1.15));
    shop.position.set(8.2, 0, 9.2); spot('shop', 8.2, 4.4, 9.2, shop);

    // ---- 新聞スタンド（ニュース） ----
    const ns = new T.Group();
    ns.add(box(2.4, 1.7, 1.8, '#eef3f9', 0, 0, 0)); ns.add(box(2.8, 0.22, 2.3, '#3d8bfd', 0, 1.7, 0.1)); ns.add(box(2.2, 0.5, 0.5, '#ffffff', 0, 0.55, 1.05));
    for (let i = 0; i < 4; i++) ns.add(box(0.42, 0.04, 0.34, i % 2 ? '#ffe9a8' : '#ffffff', -0.75 + i * 0.5, 1.05, 1.05));
    const ant = cyl(0.03, 1.3, '#9aa3b8', 0.9, 1.9, -0.5, 5); ns.add(ant); const dish = new T.Mesh(new T.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat('#dfe5f3', { side: T.DoubleSide })); dish.position.set(0.9, 3.1, -0.5); dish.rotation.x = -0.9; ns.add(dish);
    ns.position.set(16.2, 0, 9.4); spot('news', 16.2, 4.2, 9.4, ns);

    // ---- 記念館（実績）：柱とトロフィー ----
    const mu = new T.Group();
    mu.add(box(4.6, 0.4, 3.4, '#f1ece0', 0, 0, 0)); mu.add(box(4, 2, 2.6, '#fbf7ee', 0, 0.4, -0.2));
    for (let i = 0; i < 5; i++) mu.add(cyl(0.16, 2, '#ffffff', -1.8 + i * 0.9, 0.4, 1.3, 10));
    mu.add(gable(4.8, 1.1, 3.5, '#e8c15a', 0, 2.4, 0));
    const tp = new T.Group(); tp.add(cyl(0.28, 0.2, '#8a5a36', 0, 0, 0, 10)); tp.add(cyl(0.07, 0.4, '#f2c318', 0, 0.2, 0, 8)); const cup = new T.Mesh(new T.CylinderGeometry(0.36, 0.14, 0.5, 12), mat('#f2c318', { metalness: 0.6, roughness: 0.3 })); cup.position.y = 0.85; tp.add(cup);
    tp.position.set(3.2, 0, 1); mu.add(tp); H.anim.push((t) => { tp.rotation.y = t * 0.8; });
    mu.position.set(24, 0, 0.6); spot('ach', 24, 5, 0.6, mu);

    // ---- ファン広場（人気）：ステージと風船 ----
    const fp = new T.Group();
    fp.add(cyl(2.1, 0.3, '#ffe2ef', 0, 0, 0, 24)); fp.add(box(2.6, 1.8, 0.2, '#b06cff', 0, 0.3, -1.3)); fp.add(box(2.2, 1.2, 0.05, '#ffffff', 0, 0.6, -1.18));
    ['#ff5c7a', '#ffd24a', '#5b7cfa', '#35c98b'].forEach((c2, i) => { const b = new T.Mesh(new T.SphereGeometry(0.32, 12, 10), mat(c2, { roughness: 0.4 })); const bx = -1.4 + i * 0.95, by = 2.6 + (i % 2) * 0.5; b.position.set(bx, by, 0.6); fp.add(b); const s2 = cyl(0.012, by - 0.3, '#ffffff', bx, 0.3, 0.6, 4); fp.add(s2); H.anim.push((t) => { b.position.y = by + Math.sin(t * 1.6 + i) * 0.12; }); });
    for (let i = 0; i < 5; i++) { const p = new T.Group(); p.add(cyl(0.14, 0.42, ['#ff8a5b', '#5b7cfa', '#35c98b', '#ffd24a', '#ff5c9a'][i], 0, 0, 0, 8)); const hd = new T.Mesh(new T.SphereGeometry(0.13, 8, 6), mat('#ffd9b8')); hd.position.y = 0.55; p.add(hd); p.position.set(-1.2 + i * 0.6, 0.3, 0.9 + (i % 2) * 0.35); fp.add(p); H.anim.push((t) => { p.position.y = 0.3 + Math.max(0, Math.sin(t * 4 + i * 1.3)) * 0.14; }); }
    fp.position.set(-11, 0, -0.2); spot('fans', -11, 4.6, -0.2, fp);

    // ---- 資料館（キャリア）：風車つきの塔 ----
    const lib = new T.Group();
    lib.add(cyl(1.4, 3.4, '#fff6e0', 0, 0, 0, 14, 1.05)); lib.add(new T.Mesh(new T.ConeGeometry(1.35, 1.3, 14), mat('#3fae8f'))); lib.children[1].position.y = 4.05; lib.children[1].castShadow = true;
    const fan = new T.Group(); for (let i = 0; i < 4; i++) { const bl = box(0.28, 2, 0.05, '#ffffff', 0, 0.2, 0); const pv = new T.Group(); pv.add(bl); pv.rotation.z = i * Math.PI / 2; fan.add(pv); }
    fan.position.set(0, 3, 1.25); lib.add(fan); H.anim.push((t) => { fan.rotation.z = t * 0.9; });
    lib.add(box(0.7, 1.1, 0.08, '#8a5a36', 0, 0, 1.36));
    lib.position.set(12.5, 0, -0.6); spot('career', 12.5, 6.3, -0.6, lib);

    } else {
      // ---- 出張先：出張者の宿舎と食堂だけがある ----
      const inn = new T.Group();
      inn.add(box(6, 2.4, 3, '#f4efe6', 0, 0, 0)); inn.add(box(6.4, 0.3, 3.4, '#6a8caf', 0, 2.4, 0)); inn.add(box(6, 2, 3, '#f4efe6', 0, 2.7, 0)); inn.add(box(6.4, 0.3, 3.4, '#6a8caf', 0, 4.7, 0));
      for (let i = 0; i < 5; i++) { inn.add(box(0.6, 0.7, 0.06, '#a9dcff', -2.2 + i * 1.1, 1.0, 1.52)); inn.add(box(0.6, 0.7, 0.06, '#a9dcff', -2.2 + i * 1.1, 3.4, 1.52)); }
      inn.position.set(-2, 0, 9.4); spot('inn', -2, 6.4, 9.4, inn);
      const can = new T.Group(); can.add(box(4, 1.9, 2.8, '#fff5dc', 0, 0, 0)); can.add(gable(4.4, 1.1, 3.1, '#e2703a', 0, 1.9, 0)); can.add(box(1.6, 1, 0.06, '#bfe9ff', 0, 0.5, 1.42)); can.add(cyl(0.12, 1.2, '#9aa3b8', 1.5, 2.2, -0.6, 6));
      can.position.set(10, 0, 9.4); sc.add(can);
      [[-12, 9], [-17, 9.5], [18, 9], [22, 1], [14, -1], [-11, 0], [-8, 9.6], [24, 9.5]].forEach(([x, z]) => sc.add(tree(S, x, z, rnd(1, 1.4))));
    }
    // ---- そのトレセンにしかない場所 ----
    if (cfg.region === 'ritto') {
      // 坂路コース：長い上り坂をウッドチップの馬道が走る
      const hr = new T.Group();
      const slope = new T.Mesh(new T.BoxGeometry(3.2, 0.3, 12), mat('#b9895a')); slope.rotation.x = 0.2; slope.position.set(0, 1.25, 0); slope.castShadow = true; slope.receiveShadow = true; hr.add(slope);
      const hill = new T.Shape(); hill.moveTo(-6, 0); hill.lineTo(6, 0); hill.lineTo(6, 0.1); hill.lineTo(-6, 2.5); hill.closePath();
      const hg = new T.Mesh(new T.ExtrudeGeometry(hill, { depth: 4.4, bevelEnabled: false }), mat(S.grass2)); hg.rotation.y = Math.PI / 2; hg.position.set(-2.2, 0, 0); hg.castShadow = true; hg.receiveShadow = true; hr.add(hg);
      for (let i = 0; i < 9; i++) { const z = 5.4 - i * 1.35, y = 0.2 + (5.4 - z) * 0.2; hr.add(cyl(0.04, 0.5, '#ffffff', -1.7, y, z, 5)); hr.add(cyl(0.04, 0.5, '#ffffff', 1.7, y, z, 5)); }
      const hh = [horse('#5a3a26', '#ff5c7a'), horse('#b5773f', '#5b7cfa')];
      hh.forEach((h, i) => { h.g.scale.setScalar(0.75); h.g.rotation.y = Math.PI / 2; h.g.rotation.z = 0; hr.add(h.g); H.anim.push((t) => { const u = ((t * 0.11 + i * 0.5) % 1), z = 5.6 - u * 11.2; h.g.position.set(i ? 0.6 : -0.6, 0.42 + (5.6 - z) * 0.2 + Math.abs(Math.sin(t * 11 + i)) * 0.08, z); const sn = Math.sin(t * 11 + i); h.legs[0].rotation.z = sn * 0.9; h.legs[1].rotation.z = sn * 0.9 - 0.3; h.legs[2].rotation.z = -sn * 0.9; h.legs[3].rotation.z = -sn * 0.9 + 0.3; }); });
      hr.add(box(1.6, 1.4, 1.2, '#f3f0ff', 2.9, 2.3, -5.2)); hr.add(pyramid(1.5, 0.7, '#8b7cf0', 2.9, 3.7, -5.2));
      hr.position.set(33.5, 0, -8.6); spot('spot:hanro', 33.5, 6.2, -9.5, hr);
      // 琵琶湖：湖と桟橋、湖岸の道
      const lk = new T.Group();
      const w = new T.Mesh(new T.CircleGeometry(1, 36), mat('#58bfee', { roughness: 0.2 })); w.rotation.x = -Math.PI / 2; w.scale.set(5.6, 3.6, 1); w.position.y = 0.05; lk.add(w);
      const sh = new T.Mesh(new T.RingGeometry(1, 1.12, 36), mat('#f1dfb8')); sh.rotation.x = -Math.PI / 2; sh.scale.set(5.6, 3.6, 1); sh.position.y = 0.04; lk.add(sh);
      lk.add(box(0.5, 0.12, 2.2, '#b98a5a', -3.2, 0.1, 1.2));
      const boat = new T.Group(); boat.add(box(1.2, 0.3, 0.5, '#ffffff', 0, 0, 0)); boat.add(cyl(0.03, 1.1, '#8a5a36', 0, 0.3, 0, 5)); const sail = new T.Mesh(new T.ConeGeometry(0.5, 0.9, 3), mat('#ff8a5b')); sail.position.set(0.1, 0.95, 0); boat.add(sail); lk.add(boat);
      H.anim.push((t) => { boat.position.set(Math.cos(t * 0.25) * 2.6, 0.08 + Math.sin(t * 2) * 0.03, Math.sin(t * 0.25) * 1.5); boat.rotation.y = -t * 0.25 + Math.PI / 2; });
      const run = new T.Group(); run.add(cyl(0.13, 0.45, '#ff5c7a', 0, 0, 0, 8)); const rh = new T.Mesh(new T.SphereGeometry(0.13, 8, 6), mat('#ffd9b8')); rh.position.y = 0.58; run.add(rh); lk.add(run);
      H.anim.push((t) => { const a = -t * 0.5; run.position.set(Math.cos(a) * 6.1, Math.abs(Math.sin(t * 9)) * 0.1, Math.sin(a) * 4); });
      lk.position.set(34.5, 0, 9.2); spot('spot:biwako', 34.5, 2.6, 9.2, lk);
      // 京の料亭：瓦屋根と提灯
      const ry = new T.Group();
      ry.add(box(4, 1.7, 2.8, '#f3e6cf', 0, 0, 0)); ry.add(gable(5, 1.2, 3.6, '#3d4354', 0, 1.7, 0)); ry.add(box(1.2, 1.3, 0.06, '#7a4a2a', 0, 0, 1.42));
      [-1.5, 1.5].forEach(x => { const l = new T.Mesh(new T.SphereGeometry(0.26, 10, 8), mat('#ff5c4a', { emissive: '#ff3a2a', emissiveIntensity: 0.5 })); l.scale.y = 1.25; l.position.set(x, 1.25, 1.6); ry.add(l); });
      ry.add(box(0.3, 0.9, 0.3, '#9aa3a8', 2.7, 0, 1.2)); ry.add(pyramid(0.5, 0.3, '#7d868c', 2.7, 0.9, 1.2));
      ry.position.set(33, 0, 0.8); spot('spot:kaishoku', 33, 4.2, 0.8, ry);
    } else {
      // 森林馬道：木立の中を抜ける道
      const fr = new T.Group();
      const path = new T.Mesh(new T.PlaneGeometry(1.4, 12), mat('#c9a57a')); path.rotation.x = -Math.PI / 2; path.position.y = 0.03; fr.add(path);
      for (let i = 0; i < 26; i++) { const sd = i % 2 ? 1 : -1; fr.add(tree(S, sd * rnd(1.4, 4.6), rnd(-6, 6), rnd(1.1, 1.7))); }
      const wk = horse('#8a5a36', '#35c98b'); wk.g.scale.setScalar(0.75); wk.g.rotation.y = -Math.PI / 2; fr.add(wk.g);
      H.anim.push((t) => { const u = (t * 0.035) % 1; wk.g.position.set(0, 0.03, -5.6 + u * 11.2); const sn = Math.sin(t * 4); wk.legs[0].rotation.z = sn * 0.4; wk.legs[1].rotation.z = -sn * 0.4; wk.legs[2].rotation.z = -sn * 0.4; wk.legs[3].rotation.z = sn * 0.4; });
      fr.position.set(34, 0, -8.6); spot('spot:shinrin', 34, 5.4, -8.6, fr);
      // 南馬場ウッドチップコース：小さな周回コース
      const wd = new T.Group();
      const o1 = new T.Mesh(new T.RingGeometry(0.62, 1, 40), mat('#a9744a')); o1.rotation.x = -Math.PI / 2; o1.scale.set(5.4, 3.3, 1); o1.position.y = 0.04; o1.receiveShadow = true; wd.add(o1);
      const o2 = new T.Mesh(new T.CircleGeometry(0.62, 40), mat(S.grass2)); o2.rotation.x = -Math.PI / 2; o2.scale.set(5.4, 3.3, 1); o2.position.y = 0.035; wd.add(o2);
      const wh = [horse('#3a2a22', '#ffd24a'), horse('#b5773f', '#b06cff')];
      wh.forEach((h, i) => { h.g.scale.setScalar(0.7); wd.add(h.g); H.anim.push((t) => { const a = -(t * 0.55 + i * 0.25); h.g.position.set(Math.cos(a) * 4.4, 0.04 + Math.abs(Math.sin(t * 11 + i)) * 0.08, Math.sin(a) * 2.7 + (i ? 0.25 : -0.25)); h.g.rotation.y = -a + Math.PI / 2; const sn = Math.sin(t * 11 + i); h.legs[0].rotation.z = sn * 0.9; h.legs[1].rotation.z = sn * 0.9 - 0.3; h.legs[2].rotation.z = -sn * 0.9; h.legs[3].rotation.z = -sn * 0.9 + 0.3; }); });
      wd.add(box(1.4, 1.6, 1.2, '#eef3f9', 0, 0, -0.2)); wd.add(box(1.7, 0.2, 1.5, '#3d8bfd', 0, 1.6, -0.2));
      wd.position.set(34, 0, 9.4); spot('spot:wood', 34, 3.6, 9.4, wd);
      // ふれあい広場：ポニーと見学の人たち
      const fu = new T.Group();
      fu.add(cyl(2.6, 0.12, '#f6e7c8', 0, 0, 0, 24));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; fu.add(cyl(0.05, 0.5, '#ffffff', Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5, 5)); }
      const pn = horse('#e8dcc8', null, false); pn.g.scale.setScalar(0.55); fu.add(pn.g); H.anim.push((t) => { const a = -t * 0.5; pn.g.position.set(Math.cos(a) * 1.3, 0.12, Math.sin(a) * 1.3); pn.g.rotation.y = -a + Math.PI / 2; const sn = Math.sin(t * 5); pn.legs[0].rotation.z = sn * 0.4; pn.legs[1].rotation.z = -sn * 0.4; pn.legs[2].rotation.z = -sn * 0.4; pn.legs[3].rotation.z = sn * 0.4; });
      for (let i = 0; i < 6; i++) { const a = 0.4 + i * 0.5, pp = new T.Group(); pp.add(cyl(0.13, i % 3 ? 0.42 : 0.28, ['#ff8a5b', '#5b7cfa', '#35c98b', '#ffd24a', '#ff5c9a', '#b06cff'][i], 0, 0, 0, 8)); const hd = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), mat('#ffd9b8')); hd.position.y = i % 3 ? 0.54 : 0.4; pp.add(hd); pp.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); fu.add(pp); H.anim.push((t) => { pp.position.y = Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.1; }); }
      fu.add(flag('#35c98b', -2.9, 0, -1.6, 2.6));
      fu.position.set(33, 0, 0.6); spot('spot:fureai', 33, 3.4, 0.6, fu);
    }
    // 木・花壇・街灯
    [[-30, -13], [-28, 2], [-30, 10], [-16, -14], [-14, 4.4], [-6.5, 13], [3.5, 13.5], [12.3, 13], [21, 13], [28.6, 13.5], [28.5, -4.5], [28.5, -14], [13, -14], [-9, -14.5], [17.5, 3], [-16.5, 9], [28.5, 5.5], [-27, -6], [4, 2.2], [-4.5, 2.4]].forEach(([x, z]) => sc.add(tree(S, x, z, rnd(0.85, 1.25))));
    for (let i = 0; i < 7; i++) { const x = -26 + i * 8.6, lp = new T.Group(); lp.add(cyl(0.05, 1.7, '#5a6072', 0, 0, 0, 5)); const b = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), mat('#fff3b8', { emissive: '#ffe27a', emissiveIntensity: 0.7 })); b.position.y = 1.8; lp.add(b); lp.position.set(x, 0, 5.9); sc.add(lp); }
    if (S.k !== 'winter') for (let i = 0; i < 26; i++) { const f = new T.Mesh(new T.SphereGeometry(0.13, 6, 5), mat(['#ff7aa8', '#ffd24a', '#ffffff', '#b06cff'][i % 4])); f.position.set(rnd(-30, 30), 0.12, rnd(11.5, 15.5)); sc.add(f); }
    // 雲
    for (let i = 0; i < 5; i++) { const g = new T.Group(); for (let j = 0; j < 4; j++) { const s = new T.Mesh(new T.SphereGeometry(rnd(0.9, 1.6), 10, 8), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 })); s.position.set(j * 1.3 - 2, rnd(-0.2, 0.3), rnd(-0.4, 0.4)); s.scale.y = 0.6; g.add(s); } const x0 = rnd(-40, 40), y = rnd(11, 15), z = rnd(-16, 6), v = rnd(0.5, 1.1); g.position.set(x0, y, z); sc.add(g); H.anim.push((t) => { g.position.x = ((x0 + t * v + 48) % 96) - 48; }); }
    // 冬は雪
    if (S.k === 'winter') { const N = 260, p = new Float32Array(N * 3); for (let i = 0; i < N; i++) { p[i * 3] = rnd(-36, 36); p[i * 3 + 1] = rnd(0, 20); p[i * 3 + 2] = rnd(-18, 18); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); const pts = new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 0.28, transparent: true, opacity: 0.9 })); sc.add(pts); H.anim.push((t, dt) => { for (let i = 0; i < N; i++) { p[i * 3 + 1] -= dt * 2.2; p[i * 3] += Math.sin(t + i) * dt * 0.4; if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 20; } g.attributes.position.needsUpdate = true; }); }
    // 春は花びら
    if (S.k === 'spring' && month <= 4) { const N = 120, p = new Float32Array(N * 3); for (let i = 0; i < N; i++) { p[i * 3] = rnd(-34, 34); p[i * 3 + 1] = rnd(0, 12); p[i * 3 + 2] = rnd(-16, 16); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); sc.add(new T.Points(g, new T.PointsMaterial({ color: '#ffc2dc', size: 0.22, transparent: true, opacity: 0.95 }))); H.anim.push((t, dt) => { for (let i = 0; i < N; i++) { p[i * 3 + 1] -= dt * 1.1; p[i * 3] += dt * (0.8 + Math.sin(t * 2 + i) * 0.6); if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 12; p[i * 3] = rnd(-34, 34); } } g.attributes.position.needsUpdate = true; }); }
    return { scene: sc, sky: S.sky, cam: { fitW: 43, hhMin: 16.6, look: [5, 3.4, -1.2], el: 0.62, sway: 0.6 } };
  }

  // ===== 日本地図 =====
  // 海岸線は経度・緯度のおおまかな折れ線（ゲーム用に簡略化したもの）
  const COAST = {
    hokkaido: [[140.1, 41.4], [139.8, 42.2], [140.4, 43.3], [141.3, 43.2], [141.6, 44.3], [141.7, 45.4], [142.9, 44.7], [144.3, 44.1], [145.3, 44.3], [145.7, 43.4], [144.8, 42.95], [143.3, 41.95], [142.0, 42.55], [141.0, 42.35], [140.4, 42.45], [140.35, 42.1], [141.15, 41.8], [140.7, 41.4]],
    honshu: [[141.4, 41.4], [141.5, 40.5], [142.05, 39.6], [141.6, 38.3], [141.0, 38.2], [140.95, 37.0], [140.6, 36.3], [140.85, 35.7], [140.3, 35.1], [139.85, 34.9], [139.8, 35.6], [139.65, 35.2], [139.1, 35.2], [138.85, 34.6], [138.5, 35.05], [138.2, 34.6], [137.0, 34.6], [136.9, 35.0], [136.55, 34.6], [136.9, 34.3], [135.75, 33.45], [135.1, 34.2], [135.4, 34.65], [134.6, 34.7], [133.6, 34.4], [132.4, 34.3], [131.0, 33.95], [130.9, 34.3], [131.4, 34.45], [132.6, 35.4], [133.3, 35.55], [134.2, 35.55], [135.2, 35.7], [135.95, 35.65], [136.1, 36.2], [136.75, 37.3], [137.35, 37.5], [137.05, 36.85], [137.3, 36.75], [138.25, 37.2], [138.95, 37.85], [139.5, 38.4], [139.85, 39.2], [140.0, 39.95], [139.9, 40.6], [140.35, 41.2], [140.75, 40.85], [141.2, 41.2], [140.95, 41.5]],
    shikoku: [[132.0, 33.35], [132.75, 33.95], [133.55, 34.05], [134.3, 34.35], [134.75, 34.2], [134.75, 33.85], [134.2, 33.25], [133.55, 33.5], [133.0, 32.72], [132.5, 32.95], [132.4, 33.4]],
    kyushu: [[130.95, 33.95], [131.7, 33.6], [131.9, 33.0], [131.35, 31.4], [130.66, 31.0], [130.2, 31.25], [130.2, 32.1], [130.6, 32.6], [129.8, 32.6], [129.7, 33.2], [129.9, 33.5], [130.4, 33.6], [130.75, 33.9]],
    sado: [[138.25, 38.3], [138.5, 38.3], [138.55, 37.85], [138.25, 37.8]],
    awaji: [[134.75, 34.6], [135.02, 34.55], [134.9, 34.2], [134.7, 34.25]],
  };
  // 競馬場とトレセンの位置（経度・緯度）
  const PLACE = { sapporo: [141.33, 43.07], hakodate: [140.77, 41.78], fukushima: [140.47, 37.76], niigata: [139.18, 37.95], nakayama: [139.96, 35.73], tokyo: [139.48, 35.66], chukyo: [137.0, 35.06], kyoto: [135.72, 34.91], hanshin: [135.36, 34.78], kokura: [130.87, 33.84], miho: [140.3, 36.0], ritto: [136.0, 35.0] };
  const JROT = 0.62; // 列島が横長に収まるよう、地図を少し回す
  function ll(lon, lat) {
    const x = (lon - 137.6) * 0.8 * 3.1, z = -(lat - 37.6) * 3.1;
    const c = Math.cos(JROT), s2 = Math.sin(JROT);
    return [x * c - z * s2, x * s2 + z * c];
  }
  function buildJapan(month, cfg) {
    const S = season(month), sc = new T.Scene();
    sc.add(new T.HemisphereLight('#ffffff', '#9fd0f0', 0.95));
    const sun = new T.DirectionalLight('#fff6e6', 0.85); sun.position.set(-20, 36, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.left = -40; c.right = 40; c.top = 30; c.bottom = -30; c.near = 1; c.far = 110; sun.shadow.bias = -0.0015; sc.add(sun);
    // 海
    const sea = new T.Mesh(new T.CircleGeometry(60, 48), mat('#59bdf0', { roughness: 0.35 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; sea.receiveShadow = true; sc.add(sea);
    for (let i = 0; i < 26; i++) { const wv = new T.Mesh(new T.PlaneGeometry(rnd(1.2, 2.6), 0.12), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 })); wv.rotation.x = -Math.PI / 2; const x0 = rnd(-38, 38), z0 = rnd(-20, 20); wv.position.set(x0, -0.47, z0); sc.add(wv); H.anim.push((t) => { wv.position.x = x0 + Math.sin(t * 0.5 + i) * 0.8; wv.material.opacity = 0.3 + 0.3 * Math.sin(t * 0.8 + i * 2); }); }
    // 島
    const land = (pts, h, col) => {
      const sh = new T.Shape(); pts.forEach(([lo, la], i) => { const [x, z] = ll(lo, la); if (i) sh.lineTo(x, -z); else sh.moveTo(x, -z); }); sh.closePath();
      const m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelSize: 0.16, bevelThickness: 0.16, bevelSegments: 2 }), [mat(col), mat(S.k === 'winter' ? '#cfc4b0' : '#e6cf9a')]);
      m.rotation.x = -Math.PI / 2; m.position.y = -0.5; m.castShadow = true; m.receiveShadow = true; sc.add(m);
    };
    const north = S.k === 'winter' ? '#f4f8fb' : S.grass;
    land(COAST.hokkaido, 1.0, north); land(COAST.honshu, 1.0, S.k === 'winter' ? '#e3ecf0' : S.grass); land(COAST.shikoku, 1.0, S.k === 'winter' ? '#a9d08c' : S.grass2); land(COAST.kyushu, 1.0, S.k === 'winter' ? '#a9d08c' : S.grass2); land(COAST.sado, 0.9, S.grass2); land(COAST.awaji, 0.9, S.grass2);
    const at = (k, y = 0.66) => { const [x, z] = ll(PLACE[k][0], PLACE[k][1]); return new T.Vector3(x, y, z); };
    // 山（富士山と脊梁の山並み）
    const mt = (lo, la, r, h, snow) => { const [x, z] = ll(lo, la); const m = new T.Mesh(new T.ConeGeometry(r, h, 7), mat(S.k === 'winter' ? '#b9c6cf' : '#5f9f62', { flatShading: true })); m.position.set(x, 0.66 + h / 2, z); m.castShadow = true; sc.add(m); if (snow || S.k === 'winter') { const c2 = new T.Mesh(new T.ConeGeometry(r * 0.42, h * 0.42, 7), mat('#ffffff', { flatShading: true })); c2.position.set(x, 0.66 + h * 0.8, z); sc.add(c2); } };
    mt(138.73, 35.36, 0.95, 2.3, true);
    [[137.6, 36.3, 0.8, 1.5, true], [137.9, 35.8, 0.7, 1.3], [138.6, 36.6, 0.6, 1.0], [140.1, 37.6, 0.55, 0.9], [140.8, 39.3, 0.6, 1.0], [140.5, 40.6, 0.5, 0.8], [142.9, 43.6, 0.8, 1.4, true], [142.6, 43.0, 0.6, 1.0], [133.2, 34.9, 0.5, 0.7], [134.6, 35.2, 0.5, 0.7], [133.5, 33.75, 0.55, 0.9], [131.1, 32.9, 0.6, 1.0], [130.9, 32.0, 0.5, 0.8], [136.0, 34.2, 0.55, 0.9]].forEach(a => mt(...a));
    // 木
    [[141.2, 39.9], [140.3, 38.6], [139.3, 37.2], [139.6, 36.5], [136.6, 36.4], [136.4, 35.4], [135.3, 35.3], [134.0, 35.1], [132.6, 34.8], [131.6, 34.2], [143.6, 43.4], [141.9, 44.3], [144.3, 43.5], [141.5, 42.9], [133.9, 33.9], [132.9, 33.5], [130.6, 33.2], [131.3, 32.4], [130.6, 31.6], [140.4, 35.5]].forEach(([lo, la]) => { const [x, z] = ll(lo, la); const t2 = tree(S, x, z, 0.42); t2.position.y = 0.66; sc.add(t2); });
    // 日高の牧場（馬産地）
    { const [x, z] = ll(142.6, 42.45); const f = new T.Group(); f.add(box(0.7, 0.45, 0.5, '#d8573f', 0, 0, 0)); f.add(gable(0.8, 0.3, 0.55, '#7c4a34', 0, 0.45, 0)); const hz = horse('#8a5a36', null, false); hz.g.scale.setScalar(0.3); hz.g.position.set(0.8, 0, 0.3); f.add(hz.g); const h2 = horse('#d9d6d0', null, false); h2.g.scale.setScalar(0.22); h2.g.position.set(1.1, 0, -0.1); h2.g.rotation.y = 1; f.add(h2.g); f.position.set(x, 0.66, z); sc.add(f); H.spots.push({ tab: 'note:hidaka', pos: new T.Vector3(x, 1.6, z) }); }
    // 競馬場（小さなコースの印）
    const here = cfg.venue;
    Object.keys(PLACE).forEach(k => {
      if (k === 'miho' || k === 'ritto') return;
      const p = at(k), on = k === here;
      const g = new T.Group();
      const ov = new T.Mesh(new T.RingGeometry(0.3, 0.52, 20), mat(on ? '#ffffff' : '#f4f1e6')); ov.rotation.x = -Math.PI / 2; ov.scale.set(1.5, 1, 1); ov.position.y = 0.04; g.add(ov);
      const inn = new T.Mesh(new T.CircleGeometry(0.3, 20), mat('#3fae55')); inn.rotation.x = -Math.PI / 2; inn.scale.set(1.5, 1, 1); inn.position.y = 0.035; g.add(inn);
      if (on) { const pin = new T.Group(); pin.add(cyl(0.05, 1.5, '#ffffff', 0, 0, 0, 6)); const f = new T.Mesh(new T.PlaneGeometry(0.9, 0.55), new T.MeshBasicMaterial({ color: '#ff4d7e', side: T.DoubleSide })); f.position.set(0.47, 1.2, 0); pin.add(f); g.add(pin); const hz = horse('#8a5a36', '#ffd24a'); hz.g.scale.setScalar(0.3); g.add(hz.g); H.anim.push((t) => { const a = -t * 1.6; hz.g.position.set(Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.41); hz.g.rotation.y = -a + Math.PI / 2; pin.rotation.y = Math.sin(t * 2) * 0.3; }); }
      g.position.copy(p); sc.add(g);
      H.spots.push({ tab: on ? 'week' : 'v:' + k, pos: new T.Vector3(p.x, on ? 3.1 : 1.15, p.z), g: on ? g : null });
    });
    // トレセン（厩舎の屋根と旗）
    [['miho', '#ff5c7a'], ['ritto', '#5b7cfa']].forEach(([k, col]) => {
      const p = at(k), g = new T.Group();
      g.add(cyl(1.0, 0.12, '#fff3d6', 0, 0, 0, 20));
      g.add(box(1.0, 0.6, 0.7, '#fff7ea', -0.2, 0.12, 0)); g.add(gable(1.15, 0.42, 0.8, col, -0.2, 0.72, 0));
      g.add(flag(col, 0.6, 0.12, 0.1, 1.5));
      const hz = horse('#b5773f', col); hz.g.scale.setScalar(0.34); g.add(hz.g); H.anim.push((t) => { const a = -t * 0.9 + (k === 'miho' ? 0 : 2); hz.g.position.set(Math.cos(a) * 0.75, 0.13 + Math.abs(Math.sin(t * 9)) * 0.04, Math.sin(a) * 0.75); hz.g.rotation.y = -a + Math.PI / 2; });
      g.position.copy(p); sc.add(g);
      H.spots.push({ tab: 'tc:' + k, pos: new T.Vector3(p.x, 2.9, p.z), g });
    });
    // 船と飛行機
    for (let i = 0; i < 3; i++) { const b = new T.Group(); b.add(box(0.9, 0.22, 0.34, '#ffffff', 0, 0, 0)); b.add(box(0.35, 0.22, 0.26, '#ff8a5b', -0.1, 0.22, 0)); const cx = [-16, 12, 4][i], cz = [10, 14, -15][i], r = [5, 6, 4][i]; sc.add(b); H.anim.push((t) => { const a = t * 0.12 + i * 2; b.position.set(cx + Math.cos(a) * r, -0.42, cz + Math.sin(a) * r * 0.5); b.rotation.y = -a - Math.PI / 2; }); }
    const pl = new T.Group(); pl.add(box(1.3, 0.22, 0.22, '#ffffff', 0, 0, 0)); pl.add(box(0.3, 0.05, 1.5, '#dfe5f3', 0, 0.08, 0)); pl.add(box(0.2, 0.34, 0.05, '#ff4d7e', -0.58, 0.1, 0)); sc.add(pl);
    H.anim.push((t) => { const a = t * 0.16; pl.position.set(Math.cos(a) * 26, 8.5, Math.sin(a) * 12); pl.rotation.y = -a - Math.PI / 2; });
    for (let i = 0; i < 3; i++) { const g = new T.Group(); for (let j = 0; j < 4; j++) { const s2 = new T.Mesh(new T.SphereGeometry(rnd(0.5, 0.9), 10, 8), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.7 })); s2.position.set(j * 0.8 - 1.2, rnd(-0.2, 0.3), rnd(-0.4, 0.4)); s2.scale.y = 0.55; g.add(s2); } const x0 = rnd(-40, 40), z = rnd(-18, 16), v = rnd(0.4, 0.9); g.position.set(x0, rnd(9, 12), z); sc.add(g); H.anim.push((t) => { g.position.x = ((x0 + t * v + 48) % 96) - 48; }); }
    return { scene: sc, sky: ['#8fd3ff', '#d9f1ff'], cam: { fitW: 27.5, hhMin: 12.5, look: [0, 0.5, 1.2], el: 0.95, sway: 0.25 } };
  }


  function resize() {
    if (!H.el) return;
    const w = H.el.clientWidth, h = H.el.clientHeight;
    if (!w || !h || (w === H.w && h === H.h)) return;
    H.w = w; H.h = h;
    H.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    H.renderer.setSize(w, h, false);
    const cm = H.cam, asp = w / h, hh = Math.max(cm.hhMin, cm.fitW / asp);
    const c = H.camera; c.left = -hh * asp; c.right = hh * asp; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix();
  }
  const V = T ? new T.Vector3() : null;
  function frame(now) {
    H.raf = requestAnimationFrame(frame);
    if (!H.el || !H.el.isConnected) return stop();
    const dt = Math.min(0.05, (now - H.last) / 1000 || 0.016); H.last = now; H.t += dt;
    resize();
    // カメラ：ゆっくり左右に振れる。指でなぞると回せる
    H.az += (H.azT - H.az) * Math.min(1, dt * 6);
    const cm = H.cam, az = H.az + Math.sin(H.t * 0.25) * 0.05, el = cm.el, lk = cm.look;
    H.camera.position.set(lk[0] + Math.sin(az) * Math.cos(el) * 70, lk[1] + Math.sin(el) * 70, lk[2] + Math.cos(az) * Math.cos(el) * 70);
    H.camera.lookAt(lk[0], lk[1], lk[2]);
    // 馬
    for (const h of H.horses) {
      h.u = (h.u + h.v * dt) % 1;
      const p = trackPt(1 - h.u, h.lane);
      h.g.position.set(p.x, 0.03 + Math.abs(Math.sin(H.t * 11 + h.ph)) * 0.1, p.z);
      h.g.rotation.y = Math.atan2(p.tz, -p.tx);
      const s = Math.sin(H.t * 11 + h.ph);
      h.legs[0].rotation.z = s * 0.9; h.legs[1].rotation.z = s * 0.9 - 0.3; h.legs[2].rotation.z = -s * 0.9; h.legs[3].rotation.z = -s * 0.9 + 0.3;
    }
    for (const f of H.anim) f(H.t, dt);
    // 押した建物が弾む
    for (const s of H.spots) if (s.g) { const k = s.pop > 0 ? (s.pop -= dt * 3.2, 1 + Math.sin(Math.max(0, s.pop) * Math.PI) * 0.16) : 1; s.g.scale.setScalar(k); }
    H.renderer.render(H.scene, H.camera);
    // 札の位置。重なるときは、優先度の低い札を上へずらす（地名だけの札は隠す）
    const placed = [];
    const order = H.spots.filter(s => s.el).sort((a, b) => (b.pri || 0) - (a.pri || 0));
    for (const s of order) {
      if (!s.w) { s.w = s.el.offsetWidth || 80; s.h = s.el.offsetHeight || 34; }
      V.copy(s.pos).project(H.camera);
      let x = Math.max(s.w / 2 + 4, Math.min(H.w - s.w / 2 - 4, (V.x * 0.5 + 0.5) * H.w)), y = Math.max(s.h + 6, (-V.y * 0.5 + 0.5) * H.h);
      const hit = () => placed.find(q => Math.abs(q.x - x) < (q.w + s.w) / 2 + 2 && y > q.y - q.h - 4 && y - s.h < q.y + 4);
      let hide = false;
      if (s.note) hide = !!hit();
      else for (let k = 0, q; k < 4 && (q = hit()); k++) { const up = q.y - q.h - 9, dn = q.y + s.h + 9; y = (up - s.h > 4 && Math.abs(up - y) <= Math.abs(dn - y) + 12) ? up : dn; }
      if (!hide) placed.push({ x, y, w: s.w, h: s.h });
      s.el.style.opacity = hide ? '0' : '1';
      s.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      s.el.style.zIndex = String((s.pri || 0) * 100 + 100 + Math.round(V.z * -50));
    }
  }
  function stop() { cancelAnimationFrame(H.raf); H.raf = 0; }

  // el：置き場所。opt = { month, items: [{ tab, text, sub, badge, main }], onGo(tab) }
  function mount(el, opt) {
    if (!H.renderer) {
      H.canvas = document.createElement('canvas'); H.canvas.className = 'home3d-cv';
      H.renderer = new T.WebGLRenderer({ canvas: H.canvas, antialias: true, alpha: true });
      H.renderer.shadowMap.enabled = true; H.renderer.shadowMap.type = T.PCFSoftShadowMap;
      H.renderer.outputEncoding = T.sRGBEncoding;
      H.camera = new T.OrthographicCamera(-40, 40, 16, -16, 1, 220);
    }
    // 画面（日本地図・美浦・栗東）ごとに一度だけ組み立てて、使い回す
    const view = opt.view || 'japan', key = [view, opt.month, opt.home ? 1 : 0, view === 'japan' ? opt.venue : ''].join('|');
    if (H.key !== key) {
      let c = H.cache[key];
      if (!c) {
        H.spots = []; H.horses = []; H.anim = [];
        const b = view === 'japan' ? buildJapan(opt.month, { venue: opt.venue }) : buildTown(opt.month, { region: view, home: !!opt.home });
        c = { ...b, spots: H.spots, horses: H.horses, anim: H.anim };
        const ks = Object.keys(H.cache); if (ks.length >= 4) delete H.cache[ks[0]];
        H.cache[key] = c;
      }
      H.scene = c.scene; H.spots = c.spots; H.horses = c.horses; H.anim = c.anim; H.sky = c.sky; H.cam = c.cam; H.key = key; H.az = H.azT = 0;
    }
    H.el = el; H.onGo = opt.onGo; H.w = H.h = 0;
    el.style.background = `linear-gradient(${H.sky[0]}, ${H.sky[1]})`;
    el.appendChild(H.canvas);
    const lab = document.createElement('div'); lab.className = 'home3d-labels'; el.appendChild(lab);
    H.spots.forEach(s => {
      const it = (opt.items || []).find(i => i.tab === s.tab); s.el = null; s.pop = 0; s.w = 0; s.note = !!(it && it.note); s.pri = it ? (it.main ? 3 : it.note ? 0 : it.cls === 'tc' ? 2 : 1) : 0;
      if (!it) return;
      const b = document.createElement(it.note ? 'div' : 'button'); b.className = 'home3d-pin' + (it.main ? ' main' : '') + (it.note ? ' note' : '') + (it.cls ? ' ' + it.cls : ''); if (!it.note) b.type = 'button';
      b.innerHTML = `<b></b>${it.sub ? '<small></small>' : ''}${it.badge ? '<i></i>' : ''}`;
      b.querySelector('b').textContent = it.text; if (it.sub) b.querySelector('small').textContent = it.sub; if (it.badge) b.querySelector('i').textContent = it.badge === true ? '' : it.badge;
      b.onclick = () => { if (s.pop > 0) return; s.pop = 1; setTimeout(() => { if (H.onGo) H.onGo(s.tab); }, 230); };
      lab.appendChild(b); s.el = b;
    });
    if (!H.raf) { H.last = performance.now(); H.raf = requestAnimationFrame(frame); }
  }
  // 指でなぞって回す（dx は画面上の左右の動き px）
  function drag(dx) { const m = H.cam.sway; H.azT = Math.max(-m, Math.min(m, H.azT - dx * 0.004)); }

  window.Home3D = { mount, stop, drag };
})();
