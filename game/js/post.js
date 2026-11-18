// 画面の仕上げ（ポストエフェクト）
// シーンを明るさの幅が広いまま（HalfFloat）描き、次の順で仕上げる：
//  1. 明るい所だけを取り出して 1/2・1/4・1/8 の大きさでぼかす（太陽・白いラチ・勝負服の光のにじみ）
//  2. 元の絵に重ねて、ACES のトーンマップ（three.js と同じ式）で明るさを整える
//  3. 色の調整（少しだけ彩度とコントラストを上げ、明るい所を暖かく・暗い所を少し青く）、画面の端を暗く、細かい粒子
//  4. sRGB にして画面へ
// WebGL2 では描くときに4倍のアンチエイリアスをかける。重い端末では quality を下げると元の描き方に戻る
(function () {
  const T = THREE;
  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT = `uniform sampler2D tSrc; uniform float uTh; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = dot(c, vec3(0.2126,0.7152,0.0722));
      float k = smoothstep(uTh, uTh * 1.8, l); gl_FragColor = vec4(c * k, 1.0); }`;
  // 9タップのガウスぼかし（線形補間を使って実質17タップ）
  const BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
      vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
      s += (texture2D(tSrc, vUv + o1).rgb + texture2D(tSrc, vUv - o1).rgb) * 0.3162162162;
      s += (texture2D(tSrc, vUv + o2).rgb + texture2D(tSrc, vUv - o2).rgb) * 0.0702702703;
      gl_FragColor = vec4(s, 1.0); }`;
  const FINAL = `uniform sampler2D tScene, tB1, tB2, tB3; uniform float uExp, uBloom, uVig, uTime, uGrain, uSat, uCon; uniform vec3 uWarm, uCool; uniform vec2 uRes, uSun; uniform float uSunK; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color){
      const mat3 ACESInputMat = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color *= uExp / 0.6; color = ACESInputMat * color; color = RRTAndODTFit(color); color = ACESOutputMat * color; return clamp(color, 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      vec3 b = texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.8 + texture2D(tB3, vUv).rgb * 1.1;
      c += b * uBloom;
      // 太陽の光：にじみと、画面の中心をはさんだ反対側に並ぶ光の輪
      if (uSunK > 0.0) {
        vec2 asp = vec2(uRes.x / uRes.y, 1.0), d = (vUv - uSun) * asp;
        float r = length(d);
        c += vec3(1.0, 0.93, 0.8) * uSunK * (0.9 * exp(-r * 7.0) + 0.25 * exp(-r * 2.2));
        vec2 axis = (vec2(0.5) - uSun);
        for (int i = 0; i < 4; i++) {
          float f = float(i);
          vec2 gp = uSun + axis * (0.55 + f * 0.42);
          float rr = length((vUv - gp) * asp), sz = 0.025 + f * 0.018;
          float ring = smoothstep(sz, sz * 0.75, rr) * (0.35 + 0.65 * smoothstep(sz * 0.4, sz, rr));
          c += mix(vec3(0.5, 0.8, 1.0), vec3(1.0, 0.7, 0.4), f / 3.0) * ring * uSunK * 0.09;
        }
      }
      c = aces(c);
      // 色の調整
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      c *= mix(uCool, uWarm, smoothstep(0.15, 0.85, l));
      // 画面の端を暗く（横長の画面に合わせて楕円で）
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 0.9;
      c *= 1.0 - uVig * smoothstep(0.35, 1.05, dot(q, q) * 1.6);
      c = clamp(c, 0.0, 1.0);
      c = toSRGB(c);
      c += (hash(vUv * uRes + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`;
  class PostFX {
    constructor(renderer) {
      this.r = renderer; this.enabled = true;
      this.gl2 = renderer.capabilities.isWebGL2;
      const mk = (fs, u) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
      this.mBright = mk(BRIGHT, { tSrc: { value: null }, uTh: { value: 1.7 } });
      this.mBlur = mk(BLUR, { tSrc: { value: null }, uDir: { value: new T.Vector2() } });
      this.mFinal = mk(FINAL, {
        tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
        uExp: { value: 0.95 }, uBloom: { value: 0.2 }, uVig: { value: 0.32 }, uTime: { value: 0 }, uGrain: { value: 0.012 },
        uSat: { value: 1.08 }, uCon: { value: 1.05 }, uWarm: { value: new T.Vector3(1.03, 1.0, 0.95) }, uCool: { value: new T.Vector3(0.96, 0.99, 1.05) }, uRes: { value: new T.Vector2(1, 1) }, uSun: { value: new T.Vector2(0.5, 0.5) }, uSunK: { value: 0 },
      });
      this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), this.mFinal); this.quad.frustumCulled = false;
      this.qScene = new T.Scene(); this.qScene.add(this.quad); this.qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.w = 0; this.h = 0;
    }
    setSize(w, h) {
      if (w === this.w && h === this.h) return; this.w = w; this.h = h;
      [this.rt, this.b1, this.b1t, this.b2, this.b2t, this.b3, this.b3t].forEach(t => t && t.dispose());
      const o = { type: T.HalfFloatType, depthBuffer: false };
      this.rt = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: this.gl2 ? 4 : 0 });
      const lv = (d) => [new T.WebGLRenderTarget(Math.max(1, w >> d), Math.max(1, h >> d), o), new T.WebGLRenderTarget(Math.max(1, w >> d), Math.max(1, h >> d), o)];
      [this.b1, this.b1t] = lv(1); [this.b2, this.b2t] = lv(2); [this.b3, this.b3t] = lv(3);
      this.mFinal.uniforms.uRes.value.set(w, h);
    }
    pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qScene, this.qCam); }
    blur(src, tmp, dst) {
      const u = this.mBlur.uniforms; u.tSrc.value = src.texture; u.uDir.value.set(1.15 / src.width, 0); this.pass(this.mBlur, tmp);
      u.tSrc.value = tmp.texture; u.uDir.value.set(0, 1.15 / src.height); this.pass(this.mBlur, dst);
    }
    // scene を camera で描き、仕上げて画面へ
    render(scene, camera, exposure) {
      const r = this.r;
      if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
      const sz = r.getDrawingBufferSize(new T.Vector2()); this.setSize(sz.x | 0, sz.y | 0);
      const tm = r.toneMapping; r.toneMapping = T.NoToneMapping;
      r.setRenderTarget(this.rt); r.render(scene, camera);
      // 明るい所 → 1/2 → 1/4 → 1/8 とぼかす
      this.mBright.uniforms.tSrc.value = this.rt.texture; this.pass(this.mBright, this.b1t);
      this.blur(this.b1t, this.b1, this.b1t);
      this.blur(this.b1t, this.b2t, this.b2);
      this.blur(this.b2, this.b3t, this.b3);
      const u = this.mFinal.uniforms; u.tScene.value = this.rt.texture; u.tB1.value = this.b1t.texture; u.tB2.value = this.b2.texture; u.tB3.value = this.b3.texture;
      u.uExp.value = exposure ?? r.toneMappingExposure; u.uTime.value = (u.uTime.value + 1.37) % 100;
      this.pass(this.mFinal, null);
      r.toneMapping = tm;
    }
  }
  window.PostFX = PostFX;
})();
