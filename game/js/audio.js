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
        ctx.decodeAudioData(u8.buffer, (buf) => { samples[k] = buf; if (k === 'crowd') startCrowd(); if (k === 'bgm' && bgmWant) playBgm(); }, () => {});
      } catch (e) {}
    });
  }
  // ---- ファンファーレの譜面（[半音, 始まりの拍, 長さの拍]）。どれもこのゲームのための創作 ----
  const FANFARES = {
    // 一般競走：ラッパ1本の短い呼び出し
    normal: { bpm: 152, base: 349.23, len: 8, vol: 0.9, parts: [
      { vol: 0.2, notes: [[0, 0, 0.5], [0, 0.5, 0.25], [0, 0.75, 0.25], [5, 1, 0.5], [9, 1.5, 0.5], [12, 2, 1], [9, 3, 0.5], [5, 3.5, 0.5], [9, 4, 0.5], [12, 4.5, 0.5], [14, 5, 0.5], [12, 5.5, 0.5], [17, 6, 2]] },
      { vol: 0.1, tr: -12, notes: [[12, 2, 1], [17, 6, 2]] }] },
    // 特別競走：ラッパ2本の三度の重なりと小太鼓
    special: { bpm: 138, base: 349.23, len: 12, parts: [
      { vol: 0.19, notes: [[7, 0, 0.5], [7, 0.5, 0.25], [7, 0.75, 0.25], [12, 1, 1], [11, 2, 0.5], [9, 2.5, 0.5], [7, 3, 1], [4, 4, 0.5], [7, 4.5, 0.5], [12, 5, 0.5], [16, 5.5, 0.5], [14, 6, 1.5], [12, 7.5, 0.5], [14, 8, 0.5], [16, 8.5, 0.5], [19, 9, 3]] },
      { vol: 0.13, notes: [[4, 0, 0.5], [4, 0.5, 0.25], [4, 0.75, 0.25], [7, 1, 1], [7, 2, 0.5], [5, 2.5, 0.5], [4, 3, 1], [0, 4, 0.5], [4, 4.5, 0.5], [7, 5, 0.5], [12, 5.5, 0.5], [11, 6, 1.5], [9, 7.5, 0.5], [11, 8, 0.5], [12, 8.5, 0.5], [16, 9, 3]] }],
      snare: [0, 0.5, 0.75, 1, 3, 5, 5.5, 6, 9], timp: [[0, 9, 0.7]] },
    // 重賞（GⅡ・GⅢ）：金管の和音、低音のホルン、ティンパニ
    jusho: { bpm: 120, base: 293.66, len: 17, parts: [
      { vol: 0.19, notes: [[7, 0, 0.75], [7, 0.75, 0.25], [12, 1, 1], [14, 2, 0.5], [16, 2.5, 0.5], [14, 3, 1], [12, 4, 0.75], [12, 4.75, 0.25], [17, 5, 1], [16, 6, 0.5], [14, 6.5, 0.5], [12, 7, 1], [9, 8, 0.75], [9, 8.75, 0.25], [14, 9, 1], [12, 10, 0.5], [11, 10.5, 0.5], [12, 11, 0.5], [14, 11.5, 0.5], [16, 12, 1], [19, 13, 4]] },
      { vol: 0.13, notes: [[4, 0, 0.75], [4, 0.75, 0.25], [7, 1, 1], [11, 2, 0.5], [12, 2.5, 0.5], [11, 3, 1], [9, 4, 0.75], [9, 4.75, 0.25], [14, 5, 1], [12, 6, 0.5], [11, 6.5, 0.5], [9, 7, 1], [5, 8, 0.75], [5, 8.75, 0.25], [11, 9, 1], [9, 10, 0.5], [7, 10.5, 0.5], [9, 11, 0.5], [11, 11.5, 0.5], [12, 12, 1], [16, 13, 4]] },
      { vol: 0.12, tr: -12, bright: 0.6, notes: [[0, 1, 3], [5, 5, 3], [2, 9, 3], [7, 12, 1], [0, 13, 4]] }],
      timp: [[0, 1, 0.8], [0, 5, 0.7], [7, 9, 0.7], [7, 12, 0.6], [0, 13, 1]], rolls: [[0, 1, 0.3], [12, 1, 0.35]], cym: [13] },
    // GⅠ（東）：ティンパニの連打から始まる長い曲。最後は全員で伸ばす
    g1e: { bpm: 112, base: 293.66, len: 25, vol: 1.05, claps: [2, 18], parts: [
      { vol: 0.21, off: 2, notes: [[0, 0, 0.5], [0, 0.5, 0.25], [0, 0.75, 0.25], [7, 1, 1.5], [5, 2.5, 0.5], [4, 3, 0.5], [5, 3.5, 0.5], [7, 4, 2], [9, 6, 0.5], [9, 6.5, 0.25], [9, 6.75, 0.25], [14, 7, 1.5], [12, 8.5, 0.5], [11, 9, 0.5], [12, 9.5, 0.5], [14, 10, 2], [16, 12, 0.75], [14, 12.75, 0.25], [12, 13, 0.75], [11, 13.75, 0.25], [12, 14, 1], [9, 15, 1], [14, 16, 0.5], [16, 16.5, 0.5], [17, 17, 1], [19, 18, 5]] },
      { vol: 0.14, off: 2, notes: [[-5, 0, 0.5], [-5, 0.5, 0.25], [-5, 0.75, 0.25], [4, 1, 1.5], [2, 2.5, 0.5], [0, 3, 0.5], [2, 3.5, 0.5], [4, 4, 2], [5, 6, 0.5], [5, 6.5, 0.25], [5, 6.75, 0.25], [11, 7, 1.5], [9, 8.5, 0.5], [7, 9, 0.5], [9, 9.5, 0.5], [11, 10, 2], [12, 12, 0.75], [11, 12.75, 0.25], [9, 13, 0.75], [7, 13.75, 0.25], [9, 14, 1], [5, 15, 1], [11, 16, 0.5], [12, 16.5, 0.5], [14, 17, 1], [16, 18, 5]] },
      { vol: 0.13, off: 2, tr: -12, bright: 0.6, notes: [[0, 1, 3], [0, 4, 2], [5, 7, 3], [7, 10, 2], [9, 12, 2], [5, 14, 2], [7, 16, 2], [0, 18, 5]] }],
      rolls: [[0, 2, 0.4], [19, 1, 0.45]], timp: [[0, 3, 0.9], [0, 6, 0.8], [5, 9, 0.8], [7, 12, 0.8], [9, 14, 0.7], [7, 18, 0.8], [0, 20, 1.1]], cym: [3, 20], snare: [8, 8.5, 8.75, 15, 15.5, 15.75] },
    // GⅠ（西）：東とは別の旋律。ゆったり始まって、後半で駆け上がる
    g1w: { bpm: 108, base: 311.13, len: 25, vol: 1.05, claps: [2, 18], parts: [
      { vol: 0.21, off: 2, notes: [[7, 0, 1], [12, 1, 1], [11, 2, 0.5], [12, 2.5, 0.5], [14, 3, 1], [16, 4, 2], [14, 6, 0.75], [12, 6.75, 0.25], [11, 7, 1], [9, 8, 1], [11, 9, 0.5], [12, 9.5, 0.5], [14, 10, 2], [12, 12, 0.25], [14, 12.25, 0.25], [16, 12.5, 0.25], [17, 12.75, 0.25], [19, 13, 1], [17, 14, 0.5], [16, 14.5, 0.5], [17, 15, 1], [21, 16, 1], [19, 17, 1], [24, 18, 5]] },
      { vol: 0.14, off: 2, notes: [[4, 0, 1], [7, 1, 1], [7, 2, 0.5], [9, 2.5, 0.5], [11, 3, 1], [12, 4, 2], [11, 6, 0.75], [9, 6.75, 0.25], [7, 7, 1], [5, 8, 1], [7, 9, 0.5], [9, 9.5, 0.5], [11, 10, 2], [9, 12, 0.25], [11, 12.25, 0.25], [12, 12.5, 0.25], [14, 12.75, 0.25], [16, 13, 1], [14, 14, 0.5], [12, 14.5, 0.5], [14, 15, 1], [17, 16, 1], [16, 17, 1], [19, 18, 5]] },
      { vol: 0.13, off: 2, tr: -12, bright: 0.6, notes: [[0, 0, 4], [5, 4, 2], [2, 6, 2], [5, 8, 2], [7, 10, 2], [9, 12, 2], [5, 14, 2], [7, 16, 2], [0, 18, 5]] }],
      rolls: [[0, 2, 0.35], [19, 1, 0.45]], timp: [[0, 2, 0.9], [5, 6, 0.8], [7, 10, 0.8], [9, 14, 0.7], [7, 18, 0.8], [0, 20, 1.1]], cym: [2, 20], snare: [14, 14.5, 14.75] },
  };
  // 場内に響く残響（ファンファーレ用）
  let rvNode = null;
  function reverb() {
    if (rvNode) return rvNode;
    const len = ctx.sampleRate * 2.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const cv = ctx.createConvolver(); cv.buffer = buf; const wet = ctx.createGain(); wet.gain.value = 0.32; cv.connect(wet); wet.connect(master);
    return (rvNode = { in: cv });
  }
  const samples = {};
  // ---- BGM（レース以外の画面） ----
  let bgmWant = false, bgmSrc = null, bgmG = null, bgmOff = false;
  try { bgmOff = localStorage.getItem('jl-bgm') === '0'; } catch (e) {}
  function playBgm() {
    if (!ctx || !samples.bgm || bgmSrc || bgmOff) return;
    bgmG = ctx.createGain(); bgmG.gain.value = 0; bgmG.connect(master);
    bgmSrc = ctx.createBufferSource(); bgmSrc.buffer = samples.bgm; bgmSrc.loop = true; bgmSrc.connect(bgmG); bgmSrc.start();
    bgmG.gain.setTargetAtTime(0.32, ctx.currentTime, 0.8);
  }
  function stopBgm() {
    if (!bgmSrc) return;
    const s0 = bgmSrc, g0 = bgmG; bgmSrc = null; bgmG = null;
    g0.gain.setTargetAtTime(0, ctx.currentTime, 0.35); setTimeout(() => { try { s0.stop(); } catch (e) {} }, 1600);
  }
  let crowdG = null;
  function startCrowd() {
    // 同じ録音を速さと位置をずらして重ね、大人数に聞こえるようにする
    crowdG = ctx.createGain(); crowdG.gain.value = 0; crowdG.connect(master);
    [[1, 0, 0.9], [0.9, 3.1, 0.8], [1.08, 6.3, 0.7]].forEach(([rate, off, vol]) => {
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
    // on=true でBGMを流す（音声の準備がまだなら、準備でき次第流す）
    bgm(on) { bgmWant = !!on; if (on) { if (ctx) playBgm(); } else stopBgm(); },
    bgmEnabled: () => !bgmOff,
    toggleBgm() { bgmOff = !bgmOff; try { localStorage.setItem('jl-bgm', bgmOff ? '0' : '1'); } catch (e) {} if (bgmOff) stopBgm(); else if (bgmWant && ctx) playBgm(); return !bgmOff; },
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
          const src = ctx.createBufferSource(); src.buffer = samples.crowd; src.loop = true; src.playbackRate.value = rate;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.3 * level, t + 0.35); g.gain.setTargetAtTime(0, t + 2.8, 0.9);
          src.connect(g); g.connect(master); src.start(t, (1 + i * 4 + Math.random() * 3) % samples.crowd.duration); src.stop(t + 7);
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
    // 出走前のファンファーレ。種類：'normal'（一般）| 'special'（特別）| 'jusho'（GⅡ・GⅢ）| 'g1e' / 'g1w'（GⅠ・東西）| 'intl'（海外）
    // 海外以外はこのゲームのために作った旋律で、JRAで実際に使われている曲ではない（実際の曲は著作物なので使えない）
    fanfare(kind = 'normal') {
      if (!ctx) return 0;
      if (kind === 'intl' && samples.fanfare) { // 実在の曲「Call to the Post（First Call）」の録音（パブリックドメイン）
        const src = ctx.createBufferSource(); src.buffer = samples.fanfare;
        const g = ctx.createGain(); g.gain.value = 0.95; src.connect(g); g.connect(master); src.start();
        return samples.fanfare.duration;
      }
      const F = FANFARES[kind] || FANFARES.normal;
      const t0 = ctx.currentTime + 0.08, bt = 60 / F.bpm, base = F.base;
      const out = ctx.createGain(); out.gain.value = F.vol || 1; out.connect(master);
      const rv = reverb(); out.connect(rv.in);
      const hz = (s) => base * Math.pow(2, s / 12);
      // 金管：ノコギリ波2つと矩形波を重ね、明るさを音の頭で開いてから少し閉じる。長い音には軽いビブラート
      const brass = (s, st, len, vol, bright = 1) => {
        const a = t0 + st * bt, d = Math.max(0.08, len * bt * 0.94), f = hz(s);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(vol, a + 0.035); g.gain.setTargetAtTime(vol * 0.78, a + 0.06, 0.12); g.gain.setValueAtTime(vol * 0.78, a + d); g.gain.exponentialRampToValueAtTime(0.0001, a + d + 0.09);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(f * 1.2, a); lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 7 * bright), a + 0.05); lp.frequency.setTargetAtTime(f * 4.2 * bright, a + 0.08, 0.15);
        lp.connect(g); g.connect(out);
        [[0, 'sawtooth', 1], [7, 'sawtooth', 0.8], [-5, 'square', 0.35]].forEach(([cent, type, amp]) => {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cent;
          if (d > 0.45) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, a); lg.gain.linearRampToValueAtTime(f * 0.006, a + d); lfo.connect(lg); lg.connect(o.frequency); lfo.start(a); lfo.stop(a + d + 0.15); }
          const og = ctx.createGain(); og.gain.value = amp; o.connect(og); og.connect(lp); o.start(a); o.stop(a + d + 0.15);
        });
      };
      const timp = (s, st, vol = 0.9) => { const a = t0 + st * bt, f = hz(s - 24); const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, a); o.frequency.exponentialRampToValueAtTime(f, a + 0.08); const g = ctx.createGain(); g.gain.setValueAtTime(vol, a); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.9); o.connect(g); g.connect(out); o.start(a); o.stop(a + 1); burst('lowpass', 260, 0.8, vol * 0.5, 0.25, a); };
      const roll = (st, len, vol = 0.35) => { for (let b = 0; b < len; b += 0.125) burst('lowpass', 300, 0.8, vol * (0.5 + 0.5 * b / len), 0.12, t0 + (st + b) * bt); };
      const snare = (st, vol = 0.2) => { burst('highpass', 1800, 0.7, vol, 0.07, t0 + st * bt); burst('bandpass', 220, 1, vol * 0.8, 0.06, t0 + st * bt); };
      const cymbal = (st, vol = 0.6) => { burst('highpass', 5200, 0.5, vol, 2.4, t0 + st * bt); };
      F.parts.forEach(p => p.notes.forEach(([s, st, len]) => brass(s + (p.tr || 0), st + (p.off || 0), len, p.vol, p.bright || 1)));
      (F.timp || []).forEach(([s, st, v]) => timp(s, st, v));
      (F.rolls || []).forEach(([st, len, v]) => roll(st, len, v));
      (F.snare || []).forEach(st => snare(st));
      (F.cym || []).forEach(st => cymbal(st));
      // GⅠでは場内の手拍子がファンファーレに合わせて起こる
      if (F.claps) for (let b = F.claps[0]; b < F.claps[1]; b += 1) burst('bandpass', 1500 + Math.random() * 400, 1.4, 0.5, 0.05, t0 + b * bt + Math.random() * 0.03);
      return F.len * bt + 1.2;
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
    // カメラのシャッター音
    shutter() { if (!ctx) return; const t = ctx.currentTime; burst('highpass', 3200, 0.7, 0.5, 0.03, t); burst('bandpass', 1400, 1.2, 0.35, 0.05, t + 0.06); },
    bump() { burst('lowpass', 160, 1, 0.8, 0.18); },
    // 毎フレーム：速度・周りの馬の数・スタンド前かどうか
    update(speed, nearby, crowdLevel, rain) {
      if (!ctx) return;
      const t = ctx.currentTime;
      loops.wind.g.gain.setTargetAtTime(Math.min(0.2, (speed / 17) ** 2 * 0.15), t, 0.1);
      loops.pack.g.gain.setTargetAtTime(Math.min(0.9, nearby * 0.09), t, 0.15);
      // 録音の歓声があればそれを主にし、合成の音は厚みを足す程度にする
      const k = crowdG ? 0.12 : 1;
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
