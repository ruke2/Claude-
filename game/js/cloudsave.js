// ===== クラウドセーブ（claude.ai の Artifact として開いたときだけ動く） =====
// セーブを圧縮して、遊んでいる人だけが読み書きできる場所（data/users/<id>/）に保存する。
// 端末のブラウザの保存領域が消えても、ここから戻せる。GitHub Pages など claude.ai 以外では何もしない。
(function () {
  const CHUNK = 180000; // 1文書 256KiB の上限に余裕を持たせる
  let db = null, col = null, ready = null, timer = 0, pending = null, busy = false, last = null;
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f(state()); } catch (e) {} });
  const state = () => ({ available: !!col, last, pending: !!pending || busy });

  async function gz(str) {
    if (typeof CompressionStream === 'undefined') return { enc: 'raw', data: str };
    const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { enc: 'gzip64', data: btoa(bin) };
  }
  async function gunzip(enc, data) {
    if (enc === 'raw') return data;
    const bin = atob(data), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);

  function init() {
    if (ready) return ready;
    ready = (async () => {
      try {
        if (!window.claude || !window.claude.use) return false;
        const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!d || !u) return false;
        const id = await u.id();
        if (!id) return false;
        db = d; col = db.collection('data/users/' + id);
        const m = await withTimeout(col.doc('save').get(), 10000);
        last = m && m.exists ? m.data() : null;
        emit();
        return true;
      } catch (e) { col = null; return false; }
    })();
    return ready;
  }

  // 書き込みはまとめて行う（レースのたびに保存されても、クラウドへは間を空けて送る）
  function queue(str, info) {
    pending = { str, info };
    clearTimeout(timer);
    timer = setTimeout(flush, 2000);
  }
  async function flush() {
    clearTimeout(timer);
    if (!pending || busy) return;
    if (!(await init())) return;
    const { str, info } = pending; pending = null; busy = true;
    try {
      const { enc, data } = await gz(str);
      const gen = Date.now().toString(36);
      const n = Math.ceil(data.length / CHUNK);
      // 新しい世代の断片を書いてから、目録を差し替える。途中で止まっても古いセーブは壊れない
      for (let i = 0; i < n; i++) await col.doc(`c-${gen}-${i}`).set({ d: data.slice(i * CHUNK, (i + 1) * CHUNK) });
      const prev = last;
      const man = { gen, n, enc, savedAt: info && info.savedAt || Date.now(), name: info && info.name || '', date: info && info.date || '', wins: info && info.wins || 0, bytes: str.length };
      await col.doc('save').set(man);
      last = man; emit();
      if (prev && prev.gen && prev.gen !== gen) for (let i = 0; i < prev.n; i++) { try { await col.doc(`c-${prev.gen}-${i}`).delete(); } catch (e) {} }
    } catch (e) {
      console.warn('cloud save failed', e);
      if (!pending) pending = { str, info };
      if (e && (e.code === 'unavailable' || e.code === 'timeout')) { clearTimeout(timer); timer = setTimeout(flush, 30000); }
    } finally { busy = false; if (pending) { clearTimeout(timer); timer = setTimeout(flush, 8000); } }
  }
  async function fetchSave() {
    if (!(await init()) || !last) return null;
    const m = (await col.doc('save').get());
    if (!m.exists) return null;
    const man = m.data(); let data = '';
    for (let i = 0; i < man.n; i++) { const c = await col.doc(`c-${man.gen}-${i}`).get(); if (!c.exists) return null; data += c.data().d; }
    return await gunzip(man.enc, data);
  }
  // 画面を閉じる前に送り残しを送る
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pending) flush(); });
  window.addEventListener('pagehide', () => { if (pending) flush(); });

  window.CloudSave = { init, queue, flush, fetchSave, state, onChange(f) { listeners.push(f); } };
})();
