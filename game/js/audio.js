// ===== 効果音（WebAudio で合成。音源ファイルは使わない） =====
(function () {
  let ctx = null, master = null, noiseBuf = null, loops = {}, muted = false;
  try { muted = localStorage.getItem('jl-muted') === '1'; } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    // 大きな歓声でも音が割れないよう、最後に圧縮をかける
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) { // ピンクノイズ寄り
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // 常時鳴る音：風、馬群、観客
    loops.wind = loop('highpass', 900, 0.7);
    loops.pack = loop('lowpass', 220, 1);
    loops.crowd = loop('bandpass', 1100, 0.6);
    loops.crowd2 = loop('bandpass', 2600, 0.9);
    loops.crowd3 = loop('bandpass', 620, 1.6);
    // ざわめきのゆらぎ
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(loops.crowd.g.gain); lfo.start();
    loops.rain = loop('highpass', 3200, 0.5);
    // 録音素材（人の声の歓声、ファンファーレ）
    const B = window.AUDIO_B64 || {};
    Object.keys(B).forEach((k) => {
      try {
        const bin = atob(B[k]), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        ctx.decodeAudioData(u8.buffer, (buf) => { samples[k] = buf; if (k === 'crowd') startCrowd(); }, () => {});
      } catch (e) {}
    });
  }
  const samples = {};
  let crowdG = null;
  function startCrowd() {
    // 同じ録音を速さと位置をずらして重ね、大人数に聞こえるようにする
    crowdG = ctx.createGain(); crowdG.gain.value = 0; crowdG.connect(master);
    [[1, 0, 0.9], [0.86, 7, 0.8], [1.12, 13, 0.6]].forEach(([rate, off, vol]) => {
      const src = ctx.createBufferSource(); src.buffer = samples.crowd; src.loop = true; src.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = vol; src.connect(g); g.connect(crowdG); src.start(0, off % samples.crowd.duration);
    });
  }
  function loop(type, freq, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { g, f };
  }
  function burst(type, freq, q, gain, dur, t0) {
    if (!ctx) return;
    const t = t0 || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  const A = {
    init,
    isMuted: () => muted,
    toggleMute() { muted = !muted; try { localStorage.setItem('jl-muted', muted ? '1' : '0'); } catch (e) {} if (master) master.gain.value = muted ? 0 : 0.9; return muted; },
    hoof(surf) { // 自分の馬の蹄音
      if (!ctx) return;
      burst('lowpass', surf === 'D' ? 520 : 330, 0.8, 0.55, 0.09);
      if (surf === 'D') burst('bandpass', 2400, 1, 0.08, 0.05);
    },
    // ムチ：空気を切る音と、馬体に当たる乾いた音の2層
    whip() {
      if (!ctx) return;
      const t = ctx.currentTime;
      burst('bandpass', 1800, 0.6, 0.9, 0.08, t);
      burst('highpass', 2200, 0.8, 3.2, 0.05, t + 0.06);
      burst('bandpass', 900, 1.0, 2.6, 0.12, t + 0.06);
      // 当たった瞬間の「パシッ」という芯の音
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(2400, t + 0.06); o.frequency.exponentialRampToValueAtTime(260, t + 0.13);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.055); g.gain.linearRampToValueAtTime(0.9, t + 0.062); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(master); o.start(t + 0.05); o.stop(t + 0.2);
    },
    // 歓声のうねり（ゴール前やゴールの瞬間）
    cheer(level = 1) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (samples.crowd) { // 人の声の歓声を一気に重ねる
        [1.18, 0.95].forEach((rate, i) => {
          const src = ctx.createBufferSource(); src.buffer = samples.crowd; src.playbackRate.value = rate;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.5 * level, t + 0.35); g.gain.setTargetAtTime(0, t + 2.8, 0.9);
          src.connect(g); g.connect(master); src.start(t, 2 + i * 6 + Math.random() * 3); src.stop(t + 7);
        });
      }
      [500, 900, 1400, 2200].forEach((fq, i) => {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq * (0.9 + Math.random() * 0.2); f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((samples.crowd ? 0.45 : 1.5) * level / (i + 1) ** 0.5, t + 0.45); g.gain.setTargetAtTime(0, t + 2.6, 0.9);
        src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + 6);
      });
    },
    // 出走前のファンファーレ（このゲーム用に作った旋律。実在の曲ではない）
    fanfare() {
      if (!ctx) return 0;
      if (samples.fanfare) { // 実在の曲「Call to the Post（First Call）」の録音
        const src = ctx.createBufferSource(); src.buffer = samples.fanfare;
        const g = ctx.createGain(); g.gain.value = 0.95; src.connect(g); g.connect(master); src.start();
        return samples.fanfare.duration;
      }
      const t0 = ctx.currentTime + 0.05, bt = 0.19;
      // [音の高さ(半音, 0=ド), 始まり(拍), 長さ(拍)]
      const mel = [[0, 0, 1], [0, 1, 0.5], [0, 1.5, 0.5], [4, 2, 1], [7, 3, 1], [12, 4, 2], [7, 6, 0.5], [9, 6.5, 0.5], [11, 7, 1], [12, 8, 1], [16, 9, 1], [14, 10, 1], [12, 11, 1], [14, 12, 1], [11, 13, 1], [12, 14, 4]];
      const note = (semi, st, len, vol, type) => {
        const f = 261.63 * Math.pow(2, semi / 12), a = t0 + st * bt, d = len * bt;
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, a); lp.frequency.linearRampToValueAtTime(2600, a + 0.05); lp.Q.value = 0.7;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(vol, a + 0.025); g.gain.setValueAtTime(vol * 0.8, a + d * 0.7); g.gain.linearRampToValueAtTime(0.0001, a + d + 0.06);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(a); o.stop(a + d + 0.1);
      };
      mel.forEach(([s, st, len]) => { note(s, st, len * 0.92, 0.16, 'sawtooth'); note(s - 12, st, len * 0.92, 0.1, 'sawtooth'); note(s - (s % 12 === 0 ? 5 : 3), st, len * 0.92, 0.07, 'square'); });
      // 小太鼓
      for (let b = 0; b < 14; b += 0.5) burst('highpass', 1800, 0.7, b % 1 ? 0.07 : 0.14, 0.06, t0 + b * bt);
      burst('lowpass', 140, 1, 0.9, 0.5, t0 + 14 * bt);
      return 18 * bt + 0.3;
    },
    push() { burst('lowpass', 600, 0.5, 0.06, 0.12); },
    gate() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [180, 410, 730, 1210].forEach((fq, i) => {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fq;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.08 / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.55);
      });
      burst('lowpass', 300, 0.7, 0.8, 0.4);
    },
    bump() { burst('lowpass', 160, 1, 0.8, 0.18); },
    // 毎フレーム：速度・周りの馬の数・スタンド前かどうか
    update(speed, nearby, crowdLevel, rain) {
      if (!ctx) return;
      const t = ctx.currentTime;
      loops.wind.g.gain.setTargetAtTime(Math.min(0.2, (speed / 17) ** 2 * 0.15), t, 0.1);
      loops.pack.g.gain.setTargetAtTime(Math.min(0.9, nearby * 0.09), t, 0.15);
      // 録音の歓声があればそれを主にし、合成の音は厚みを足す程度にする
      const k = crowdG ? 0.25 : 1;
      if (crowdG) crowdG.gain.setTargetAtTime(Math.min(1.6, crowdLevel * 1.7), t, 0.35);
      loops.crowd.g.gain.setTargetAtTime(crowdLevel * 2.4 * k, t, 0.4);
      loops.crowd2.g.gain.setTargetAtTime(crowdLevel * 1.0 * k, t, 0.4);
      loops.crowd3.g.gain.setTargetAtTime(crowdLevel * 1.8 * k, t, 0.4);
      loops.rain.g.gain.setTargetAtTime((rain || 0) * 0.5, t, 0.5);
    },
    stopAll() { if (!ctx) return; const t = ctx.currentTime; Object.values(loops).forEach(l => l.g.gain.setTargetAtTime(0, t, 0.2)); if (crowdG) crowdG.gain.setTargetAtTime(0, t, 0.4); },
  };
  window.Sound = A;
})();
