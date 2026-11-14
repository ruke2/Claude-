// ===== 効果音（WebAudio で合成。音源ファイルは使わない） =====
(function () {
  let ctx = null, master = null, noiseBuf = null, loops = {}, muted = false;
  try { muted = localStorage.getItem('jl-muted') === '1'; } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
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
    whip() { burst('highpass', 3000, 0.7, 0.5, 0.06); },
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
    update(speed, nearby, crowdLevel) {
      if (!ctx) return;
      const t = ctx.currentTime;
      loops.wind.g.gain.setTargetAtTime(Math.min(0.35, (speed / 17) ** 2 * 0.28), t, 0.1);
      loops.pack.g.gain.setTargetAtTime(Math.min(0.9, nearby * 0.09), t, 0.15);
      loops.crowd.g.gain.setTargetAtTime(crowdLevel * 0.45, t, 0.4);
    },
    stopAll() { if (!ctx) return; const t = ctx.currentTime; Object.values(loops).forEach(l => l.g.gain.setTargetAtTime(0, t, 0.2)); },
  };
  window.Sound = A;
})();
