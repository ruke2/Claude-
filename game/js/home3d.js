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

  const H = { el: null, canvas: null, labels: null, renderer: null, scene: null, camera: null, raf: 0, t: 0, az: 0, azV: 0, azT: 0, spots: [], horses: [], anim: [], month: null, onGo: null, w: 0, h: 0, last: 0 };

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

  function build(month) {
    const S = season(month);
    const sc = new T.Scene();
    H.spots = []; H.horses = []; H.anim = [];
    sc.add(new T.HemisphereLight('#ffffff', S.k === 'winter' ? '#c9d6e6' : '#b9d6a0', 0.95));
    const sun = new T.DirectionalLight(S.k === 'autumn' ? '#ffe7c4' : '#fff6e6', 0.9);
    sun.position.set(-22, 34, 18); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.left = -44; c.right = 44; c.top = 30; c.bottom = -30; c.near = 1; c.far = 110; sun.shadow.bias = -0.0015;
    sc.add(sun);

    // 島（角の丸い板）
    const rr = (w, d, r) => { const s = new T.Shape(); s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return s; };
    const isl = new T.Mesh(new T.ExtrudeGeometry(rr(66, 36, 7), { depth: 2.6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3 }), [mat(S.grass), mat(S.k === 'winter' ? '#b9a48c' : '#c59a6a')]);
    isl.rotation.x = -Math.PI / 2; isl.position.y = -3.1; isl.receiveShadow = true; sc.add(isl);
    const blob = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ color: '#27406b', transparent: true, opacity: 0.16 })); blob.rotation.x = -Math.PI / 2; blob.scale.set(36, 20, 1); blob.position.y = -7; sc.add(blob);
    // 道
    const road = (x, z, w, d) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), mat(S.k === 'winter' ? '#d9d2c4' : '#f1dfb8')); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; sc.add(m); };
    road(0, 4.6, 60, 1.7); road(-21, -2, 1.7, 13); road(21, -2, 1.7, 13); road(0, 2.4, 1.7, 3);

    const spot = (tab, x, y, z, g) => { H.spots.push({ tab, pos: new T.Vector3(x, y, z), g }); if (g) sc.add(g); };

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
    st.position.set(0, 0, -13.2); spot('week', 0, 6.2, -13.2, st);
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
    barn.position.set(-21, 0, -9.5); spot('people', -21, 5.2, -9.5, barn);
    // 放牧地
    const pad = new T.Group();
    for (let i = 0; i < 10; i++) { pad.add(cyl(0.06, 0.6, '#ffffff', -3 + i * 0.66, 0, 1.6, 5)); pad.add(cyl(0.06, 0.6, '#ffffff', -3 + i * 0.66, 0, -1.6, 5)); }
    pad.add(box(6, 0.07, 0.07, '#ffffff', 0, 0.5, 1.6)); pad.add(box(6, 0.07, 0.07, '#ffffff', 0, 0.5, -1.6)); pad.add(box(0.07, 0.07, 3.2, '#ffffff', -3, 0.5, 0)); pad.add(box(0.07, 0.07, 3.2, '#ffffff', 3, 0.5, 0));
    pad.position.set(-22, 0, -3.6); sc.add(pad);
    [['#b5773f', -23.2, -3.9, 0.6], ['#d9d6d0', -20.9, -3.2, 2.6]].forEach(([c2, x, z, ry], i) => { const h = horse(c2, null, false); h.g.position.set(x, 0, z); h.g.rotation.y = ry; h.g.scale.setScalar(0.8); sc.add(h.g); H.anim.push((t) => { const k = Math.max(0, Math.sin(t * 0.6 + i * 2.4)); h.neck.rotation.z = -0.55 - k * 0.9; h.head.position.y = 1.3 - k * 0.75; h.head.position.x = 0.98 + k * 0.12; }); });

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

    // 木・花壇・街灯
    [[-30, -13], [-28, 2], [-30, 10], [-16, -14], [-14, 4.4], [-6.5, 13], [3.5, 13.5], [12.3, 13], [21, 13], [29, 10], [30, -4], [29, -13], [13, -14], [-9, -14.5], [17.5, 3], [-16.5, 9], [28.5, 5.5], [-27, -6], [4, 2.2], [-4.5, 2.4]].forEach(([x, z]) => sc.add(tree(S, x, z, rnd(0.85, 1.25))));
    for (let i = 0; i < 7; i++) { const x = -26 + i * 8.6, lp = new T.Group(); lp.add(cyl(0.05, 1.7, '#5a6072', 0, 0, 0, 5)); const b = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), mat('#fff3b8', { emissive: '#ffe27a', emissiveIntensity: 0.7 })); b.position.y = 1.8; lp.add(b); lp.position.set(x, 0, 5.9); sc.add(lp); }
    if (S.k !== 'winter') for (let i = 0; i < 26; i++) { const f = new T.Mesh(new T.SphereGeometry(0.13, 6, 5), mat(['#ff7aa8', '#ffd24a', '#ffffff', '#b06cff'][i % 4])); f.position.set(rnd(-30, 30), 0.12, rnd(11.5, 15.5)); sc.add(f); }
    // 雲
    for (let i = 0; i < 5; i++) { const g = new T.Group(); for (let j = 0; j < 4; j++) { const s = new T.Mesh(new T.SphereGeometry(rnd(0.9, 1.6), 10, 8), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 })); s.position.set(j * 1.3 - 2, rnd(-0.2, 0.3), rnd(-0.4, 0.4)); s.scale.y = 0.6; g.add(s); } const x0 = rnd(-40, 40), y = rnd(11, 15), z = rnd(-16, 6), v = rnd(0.5, 1.1); g.position.set(x0, y, z); sc.add(g); H.anim.push((t) => { g.position.x = ((x0 + t * v + 48) % 96) - 48; }); }
    // 冬は雪
    if (S.k === 'winter') { const N = 260, p = new Float32Array(N * 3); for (let i = 0; i < N; i++) { p[i * 3] = rnd(-36, 36); p[i * 3 + 1] = rnd(0, 20); p[i * 3 + 2] = rnd(-18, 18); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); const pts = new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 0.28, transparent: true, opacity: 0.9 })); sc.add(pts); H.anim.push((t, dt) => { for (let i = 0; i < N; i++) { p[i * 3 + 1] -= dt * 2.2; p[i * 3] += Math.sin(t + i) * dt * 0.4; if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 20; } g.attributes.position.needsUpdate = true; }); }
    // 春は花びら
    if (S.k === 'spring' && month <= 4) { const N = 120, p = new Float32Array(N * 3); for (let i = 0; i < N; i++) { p[i * 3] = rnd(-34, 34); p[i * 3 + 1] = rnd(0, 12); p[i * 3 + 2] = rnd(-16, 16); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); sc.add(new T.Points(g, new T.PointsMaterial({ color: '#ffc2dc', size: 0.22, transparent: true, opacity: 0.95 }))); H.anim.push((t, dt) => { for (let i = 0; i < N; i++) { p[i * 3 + 1] -= dt * 1.1; p[i * 3] += dt * (0.8 + Math.sin(t * 2 + i) * 0.6); if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 12; p[i * 3] = rnd(-34, 34); } } g.attributes.position.needsUpdate = true; }); }
    H.sky = S.sky;
    return sc;
  }

  function resize() {
    if (!H.el) return;
    const w = H.el.clientWidth, h = H.el.clientHeight;
    if (!w || !h || (w === H.w && h === H.h)) return;
    H.w = w; H.h = h;
    H.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    H.renderer.setSize(w, h, false);
    const asp = w / h, hh = Math.max(16.6, 36 / asp);
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
    const az = H.az + Math.sin(H.t * 0.25) * 0.05, el = 0.62;
    H.camera.position.set(Math.sin(az) * Math.cos(el) * 70, Math.sin(el) * 70 + 3.4, Math.cos(az) * Math.cos(el) * 70);
    H.camera.lookAt(0, 3.4, -1.2);
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
    // 札の位置
    for (const s of H.spots) {
      if (!s.el) continue;
      V.copy(s.pos).project(H.camera);
      const x = (V.x * 0.5 + 0.5) * H.w, y = (-V.y * 0.5 + 0.5) * H.h;
      s.el.style.transform = `translate(${Math.round(Math.max(40, Math.min(H.w - 40, x)))}px, ${Math.round(Math.max(44, y))}px) translate(-50%, -100%)`;
      s.el.style.zIndex = String(100 + Math.round(V.z * -50));
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
    if (H.month !== opt.month || !H.scene) { H.scene = build(opt.month); H.month = opt.month; }
    H.el = el; H.onGo = opt.onGo; H.w = H.h = 0;
    el.style.background = `linear-gradient(${H.sky[0]}, ${H.sky[1]})`;
    el.appendChild(H.canvas);
    const lab = document.createElement('div'); lab.className = 'home3d-labels'; el.appendChild(lab);
    H.spots.forEach(s => {
      const it = (opt.items || []).find(i => i.tab === s.tab); s.el = null; s.pop = 0;
      if (!it) return;
      const b = document.createElement('button'); b.className = 'home3d-pin' + (it.main ? ' main' : ''); b.type = 'button';
      b.innerHTML = `<b></b>${it.sub ? '<small></small>' : ''}${it.badge ? '<i></i>' : ''}`;
      b.querySelector('b').textContent = it.text; if (it.sub) b.querySelector('small').textContent = it.sub; if (it.badge) b.querySelector('i').textContent = it.badge === true ? '' : it.badge;
      b.onclick = () => { if (s.pop > 0) return; s.pop = 1; setTimeout(() => { if (H.onGo) H.onGo(s.tab); }, 230); };
      lab.appendChild(b); s.el = b;
    });
    if (!H.raf) { H.last = performance.now(); H.raf = requestAnimationFrame(frame); }
  }
  // 指でなぞって回す（dx は画面上の左右の動き px）
  function drag(dx) { H.azT = Math.max(-0.6, Math.min(0.6, H.azT - dx * 0.004)); }

  window.Home3D = { mount, stop, drag };
})();
