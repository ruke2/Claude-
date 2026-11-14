// ===== 実物の馬モデル（glb）を使う =====
// モデル: "Horse" by Henry S（Sketchfab, CC BY 4.0）
// https://sketchfab.com/3d-models/horse-a6f860e43e364619bccb174a1ac7d0c9
// FBX を glb に変換し、毛色を塗り替えられるように白斑を除いたテクスチャを用意している。
(function () {
  const T = THREE;
  const ASSET = (window.ASSET_BASE || 'assets/');
  const EAR_HEIGHT = 2.1; // 待機姿勢での全高（m）。き甲（鞍の位置）がおよそ1.6mになる
  let G = null, loading = null;

  function tex(name, srgb = true) {
    const t = new T.TextureLoader().load(ASSET + name);
    t.flipY = false; // glTF の UV に合わせる
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function load() {
    if (loading) return loading;
    loading = new Promise((resolve) => {
      if (!T.GLTFLoader || !T.SkeletonUtils) { resolve(null); return; }
      const onLoad = (g) => {
        const clips = {}; g.animations.forEach(a => clips[a.name] = a);
        G = { scene: g.scene, clips, tex: {
          coat: tex('horse_coat.jpg'), coatN: tex('horse_n.jpg', false),
          hair: tex('hair.png'), hairN: tex('hair_n.jpg', false), tack: tex('tack.jpg'),
        } };
        measure(G);
        resolve(G);
      };
      const fail = (e) => { console.warn('horse.glb load failed', e); resolve(null); };
      if (window.HORSE_GLB_B64) { // glb を配信できない環境向けに、JS に埋め込んだデータから読む
        const bin = atob(window.HORSE_GLB_B64); const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new T.GLTFLoader().parse(buf.buffer, '', onLoad, fail);
      } else new T.GLTFLoader().load(ASSET + 'horse.glb', onLoad, undefined, fail);
    });
    return loading;
  }

  // 待機姿勢で大きさ・向き・鞍の位置を測る
  function measure(G) {
    const o = T.SkeletonUtils.clone(G.scene);
    const mixer = new T.AnimationMixer(o);
    mixer.clipAction(G.clips['1 Ilde']).play(); mixer.update(0.01);
    o.updateMatrixWorld(true);
    const box = new T.Box3(), v = new T.Vector3();
    let body = null;
    o.traverse(n => { if (n.isSkinnedMesh) { if (/Stallion_Horse/.test(n.name)) body = n; const P = n.geometry.attributes.position; for (let i = 0; i < P.count; i += 5) { v.fromBufferAttribute(P, i); n.boneTransform(i, v); v.applyMatrix4(n.matrixWorld); box.expandByPoint(v); } } });
    const k = EAR_HEIGHT / (box.max.y - box.min.y);
    G.k = k; G.minY = box.min.y;
    // 前は +z。ゲームの向き（前 = +x）に合わせる回転と、中心
    G.cz = (box.min.z + box.max.z) / 2; G.cx = (box.min.x + box.max.x) / 2;
    // 背骨の骨のうち、鞍を置く位置（き甲の少し後ろ）を探す
    const bones = {}; o.traverse(n => { if (n.isBone) bones[n.name] = n; });
    G.boneNames = Object.keys(bones);
    const toGame = (p) => new T.Vector3((p.z - G.cz) * k, (p.y - G.minY) * k, -(p.x - G.cx) * k);
    const sp = ['BN_Spine_01_03', 'BN_Spine_02_04', 'BN_Spine_03_05', 'BN_Neck_00_06', 'BN_Pelvis_060'].filter(n => bones[n]);
    G.anchorBone = bones['BN_Spine_02_04'] ? 'BN_Spine_02_04' : sp[0];
    G.anchorBone2 = bones['BN_Spine_00_02'] ? 'BN_Spine_00_02' : (bones['BN_Pelvis_060'] ? 'BN_Pelvis_060' : sp[0]);
    G.headBone = bones['BN_Head_00_016'] ? 'BN_Head_00_016' : null;
    G.jawBone = bones['BN_Jaw_027'] ? 'BN_Jaw_027' : G.headBone;
    // 鞍の位置：背中の正中線上の一番高い点（き甲〜腰の間）
    const a1 = toGame(bones[G.anchorBone].getWorldPosition(new T.Vector3()));
    const a2 = toGame(bones[G.anchorBone2].getWorldPosition(new T.Vector3()));
    const head = G.headBone ? toGame(bones[G.headBone].getWorldPosition(new T.Vector3())) : null;
    let top = -1, saddleX = a1.x * 0.6 + a2.x * 0.4;
    const P = body.geometry.attributes.position;
    for (let i = 0; i < P.count; i += 2) {
      v.fromBufferAttribute(P, i); body.boneTransform(i, v); v.applyMatrix4(body.matrixWorld);
      const g = toGame(v);
      if (Math.abs(g.z) < 0.06 && Math.abs(g.x - saddleX) < 0.12) top = Math.max(top, g.y);
    }
    G.saddle = new T.Vector3(saddleX, top, 0);
    // 胴の半幅（ゼッケンの位置）と、脚先の黒くする度合い（頂点ごと）
    let hw = 0; const low = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); body.boneTransform(i, v); v.applyMatrix4(body.matrixWorld);
      const g = toGame(v);
      if (Math.abs(g.x - saddleX) < 0.1 && g.y > top - 0.45 && g.y < top - 0.25) hw = Math.max(hw, Math.abs(g.z));
      const t = Math.min(1, Math.max(0, (0.62 - g.y) / 0.24)); low[i] = t * t * (3 - 2 * t);
    }
    G.bodyHalfWidth = hw;
    body.geometry.setAttribute('aLow', new T.BufferAttribute(low, 1));
    // 骨のローカル座標で、鞍の点を覚えておく（毎フレーム骨から位置を出す）
    G.saddleOffset1 = bones[G.anchorBone].worldToLocal(fromGame(G, G.saddle.clone()));
    G.saddleOffset2 = bones[G.anchorBone2].worldToLocal(fromGame(G, new T.Vector3(G.saddle.x - 0.5, G.saddle.y - 0.02, 0)));
    G.info = { k, saddle: G.saddle.toArray(), a1: a1.toArray(), a2: a2.toArray(), head: head && head.toArray() };
  }
  function fromGame(G, g) { // ゲーム座標 → モデルのワールド座標（測定時）
    return new T.Vector3(-g.z / G.k + G.cx, g.y / G.k + G.minY, g.x / G.k + G.cz);
  }

  // 毛色・脚先の黒（鹿毛など）をシェーダーで
  function coatMaterial(coat) {
    const c = new T.Color(coat.body).multiplyScalar(1.25);
    const m = new T.MeshStandardMaterial({ map: G.tex.coat, normalMap: G.tex.coatN, color: c, roughness: 0.42, metalness: 0.0 });
    const pts = new T.Color(coat.points);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPoints = { value: pts };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLow;\nattribute float aLow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLow = aLow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLow;\nuniform vec3 uPoints;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPoints * (diffuseColor.rgb / max(diffuse, vec3(0.001))) * 1.2, vLow);');
    };
    m.customProgramCacheKey = () => 'coat' + coat.points;
    return m;
  }

  // 背中の断面（楕円）に沿って曲げた布。L=前後の長さ、rz=横半径、ry=縦半径、th=上(0)からの角度範囲
  // side: +1 / -1 で片側だけ（テクスチャがどちらから見ても正しい向きになる）、0 なら全周
  function drape(L, rz, ry, th0, th1, side, flare) {
    const nu = 14, nv = 22, pos = [], uv = [], idx = [];
    const a0 = side ? th0 : th0, a1 = side ? th1 : th1;
    for (let j = 0; j <= nv; j++) {
      const t = j / nv, th = a0 + (a1 - a0) * t;
      const k = side ? Math.max(0, th) / th1 : 0;
      const z = (side || 1) * (rz * Math.sin(th) + (flare || 0) * k * k) * (side ? 1 : 1);
      const y = -ry + ry * Math.cos(th);
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, x = (u - 0.5) * L;
        // 布の前後の縁はわずかに丸める
        pos.push(x, y - 0.012 * Math.pow(Math.abs(u - 0.5) * 2, 4) * k, side ? z : rz * Math.sin(th));
        uv.push(side > 0 ? u : 1 - u, 1 - t);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // ゼッケンの布：角の丸い白い布に番号とレース名
  function clothTexture(num, label) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
    x.clearRect(0, 0, 512, 512);
    // 上（背中側）は四角、下の角だけ丸い
    x.fillStyle = '#f6f5f0'; x.beginPath(); x.moveTo(0, 0); x.lineTo(512, 0); x.lineTo(512, 430); x.arcTo(512, 512, 430, 512, 80); x.lineTo(80, 512); x.arcTo(0, 512, 0, 430, 80); x.closePath(); x.fill();
    // 布の質感（細かいムラ）
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.012})`; x.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
    // 縁取り
    x.strokeStyle = '#c8c2b4'; x.lineWidth = 10; x.beginPath(); x.moveTo(14, 120); x.lineTo(14, 425); x.arcTo(14, 498, 85, 498, 66); x.lineTo(427, 498); x.arcTo(498, 498, 498, 425, 66); x.lineTo(498, 120); x.stroke();
    x.fillStyle = '#151515'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 190px Arial, Helvetica, sans-serif'; x.fillText(String(num), 256, 300);
    if (label) { x.font = 'bold 40px sans-serif'; x.fillText(label.slice(0, 9), 256, 445); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function create(opt) {
    const coat = opt.coat;
    const o = T.SkeletonUtils.clone(G.scene);
    const mats = {
      body: coatMaterial(coat),
      hair: new T.MeshStandardMaterial({ map: G.tex.hair, normalMap: G.tex.hairN, color: new T.Color(coat.mane).multiplyScalar(1.6), alphaTest: 0.35, side: T.DoubleSide, roughness: 0.6 }),
      tack: new T.MeshStandardMaterial({ map: G.tex.tack, color: '#3a3a3a', roughness: 0.5 }),
      eye: new T.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }),
      shoe: new T.MeshStandardMaterial({ color: '#8d8d8d', roughness: 0.35, metalness: 0.8 }),
    };
    const skinned = [], detail = [];
    o.traverse(n => {
      if (!n.isMesh) return;
      n.castShadow = true; n.receiveShadow = false; n.frustumCulled = false;
      if (/Stallion_Horse/.test(n.name)) n.material = mats.body;
      else if (/Hair/.test(n.name)) n.material = mats.hair;
      else if (/Bridle/.test(n.name)) n.material = mats.tack;
      else if (/Cornea/.test(n.name)) n.material = mats.eye;
      else if (/Horseshoe/.test(n.name)) n.material = mats.shoe;
      skinned.push(n);
      if (!/Stallion_Horse/.test(n.name)) detail.push(n);
    });
    const root = new T.Group();
    const inner = new T.Group(); // モデル → ゲーム座標（前 +x、地面 y=0、メートル）
    inner.rotation.y = Math.PI / 2;
    inner.scale.setScalar(G.k);
    inner.position.set(-G.cx * 0 , -G.minY * G.k, 0);
    inner.add(o);
    o.position.set(-G.cx, 0, -G.cz);
    root.add(inner);
    const mixer = new T.AnimationMixer(o);
    const gallop = mixer.clipAction(G.clips['Gallop']); gallop.play();
    const idle = mixer.clipAction(G.clips['1 Ilde']); idle.play();
    const walk = G.clips['Walk'] ? mixer.clipAction(G.clips['Walk']) : null; if (walk) walk.play();
    const bones = {}; o.traverse(n => { if (n.isBone) bones[n.name] = n; });
    const b1 = bones[G.anchorBone], b2 = bones[G.anchorBone2], jaw = bones[G.jawBone];

    // 鞍・ゼッケン・騎手（鞍の位置に毎フレーム合わせる）
    const g = Horse3D._geoms();
    const saddleG = new T.Group(); root.add(saddleG);
    const mTack = new T.MeshStandardMaterial({ color: '#141414', roughness: 0.5 });
    // ゼッケン：鞍の下に敷いた布が、背中から両脇へ体に沿って垂れる形
    const hw = G.bodyHalfWidth || 0.26;
    const clothT = clothTexture(opt.number || 1, opt.raceLabel);
    const mCloth = new T.MeshStandardMaterial({ map: clothT, roughness: 0.9, side: T.DoubleSide, alphaTest: 0.5 });
    for (const sd of [1, -1]) {
      const c = new T.Mesh(drape(0.72, hw * 1.05 + 0.02, 0.33, -0.08, 2.05, sd, 0.035), mCloth);
      c.position.set(-0.04, 0.005, 0); c.receiveShadow = true; c.castShadow = true; saddleG.add(c);
    }
    // 鞍：小さなレース用の鞍（背に沿った革）と、腹帯
    const sad = new T.Mesh(drape(0.38, hw * 1.05 + 0.03, 0.335, -0.95, 0.95, 0, 0), new T.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.35, side: T.DoubleSide }));
    sad.position.set(0.0, 0.02, 0); sad.castShadow = true; saddleG.add(sad);
    const girth = new T.Mesh(drape(0.07, hw * 1.05 + 0.025, 0.335, -Math.PI, Math.PI, 0, 0), new T.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.7, side: T.DoubleSide }));
    girth.position.set(0.12, 0.006, 0); saddleG.add(girth);
    const J = Horse3D._buildJockey({ ...opt, bodyHalfWidth: G.bodyHalfWidth || 0.26 }, g);
    J.root.position.set(0.02, 0, 0);
    const jockeyG = new T.Group(); root.add(jockeyG); jockeyG.add(J.root);
    const reins = [new T.Mesh(g.strap, mTack), new T.Mesh(g.strap, mTack)];
    reins.forEach(r => root.add(r));
    const bitL = new T.Object3D(), bitR = new T.Object3D(); root.add(bitL); root.add(bitR);

    const tv = new T.Vector3(), tv2 = new T.Vector3();
    let meanY = null;
    const model = {
      root, jockey: J, reins, bitL, bitR, glb: true,
      update(st, dt, time) {
        const run = Math.min(1, st.speed / 9);
        gallop.setEffectiveWeight(run); idle.setEffectiveWeight(1 - run); if (walk) walk.setEffectiveWeight(0);
        gallop.time = (st.phase % 1) * gallop.getClip().duration;
        idle.time = (time % idle.getClip().duration);
        mixer.update(0);
        root.updateMatrixWorld(true);
        // 鞍の点（2つの骨から）と前後の傾き
        tv.copy(G.saddleOffset1); b1.localToWorld(tv); root.worldToLocal(tv);
        tv2.copy(G.saddleOffset2); b2.localToWorld(tv2); root.worldToLocal(tv2);
        const pitch = Math.atan2(tv.y - tv2.y, tv.x - tv2.x) - G.restPitch;
        saddleG.position.copy(tv); saddleG.rotation.z = pitch;
        if (meanY == null) meanY = tv.y;
        meanY += (tv.y - meanY) * Math.min(1, dt * 3);
        jockeyG.position.set(tv.x, 0, tv.z);
        model.pov = this.pov;
        Horse3D._animateJockey(model, st, st.phase % 1, tv.y - meanY, pitch, meanY + 0.04);
        // ハミの位置
        if (jaw) {
          jaw.getWorldPosition(tv); root.worldToLocal(tv);
          bitL.position.set(tv.x, tv.y, 0.07); bitR.position.set(tv.x, tv.y, -0.07);
        }
      },
      lod(d) { const near = d < 55; if (near !== this._near) { this._near = near; detail.forEach(n => { n.visible = near || /Hair/.test(n.name) && d < 90; }); } },
      setPlayerView(on) { this.pov = on; J.whip.visible = !on; J.torso.visible = J.head.visible = !on; J.helmet.visible = !on; J.goggle.visible = !on; J.arms.forEach(a => { a.up.visible = !on; a.sh.visible = !on; a.fo.visible = !on; a.hand.scale.setScalar(on ? 0.75 : 1); }); J.hipBall.visible = !on; J.neckM.visible = !on; },
      dispose() { clothT.dispose(); Object.values(mats).forEach(m => m.dispose()); },
    };
    if (G.restPitch == null) {
      mixer.update(0); root.updateMatrixWorld(true);
      tv.copy(G.saddleOffset1); b1.localToWorld(tv); root.worldToLocal(tv);
      tv2.copy(G.saddleOffset2); b2.localToWorld(tv2); root.worldToLocal(tv2);
      G.restPitch = Math.atan2(tv.y - tv2.y, tv.x - tv2.x);
    }
    if (opt.isPlayer) model.setPlayerView(true);
    return model;
  }

  window.HorseGLB = { load, create, get ready() { return !!G; }, get info() { return G && G.info; } };
})();
