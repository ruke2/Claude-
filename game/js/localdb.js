// ===== 端末の2つ目の保存先（IndexedDB） =====
// localStorage は容量が小さく（数MB）、セーブが大きくなると書けなくなる。IndexedDB は容量が大きいので、同じセーブをこちらにも残す。
// 読むときは、localStorage・IndexedDB・クラウドのうち一番新しいものを使う。
(function () {
  const DB = 'jockey-life', ST = 'saves';
  let dbp = null, lastError = '';
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        if (!window.indexedDB) return res(null);
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { try { rq.result.createObjectStore(ST); } catch (e) {} };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => { lastError = String(rq.error && rq.error.name || 'open'); res(null); };
        rq.onblocked = () => res(null);
        setTimeout(() => res(null), 4000);
      } catch (e) { lastError = String(e && e.name || e); res(null); }
    }).then(d => { if (!d) dbp = null; return d; }); // 開けなければ次回また試す
    return dbp;
  }
  async function put(str, info) {
    const d = await open(); if (!d) return false;
    return await new Promise((res) => {
      try {
        const tx = d.transaction(ST, 'readwrite');
        tx.objectStore(ST).put({ str, savedAt: (info && info.savedAt) || Date.now() }, 'main');
        tx.oncomplete = () => { lastError = ''; res(true); };
        tx.onerror = tx.onabort = () => { lastError = String(tx.error && tx.error.name || 'write'); res(false); };
      } catch (e) { lastError = String(e && e.name || e); res(false); }
    });
  }
  async function get() {
    const d = await open(); if (!d) return null;
    return await new Promise((res) => {
      try {
        const rq = d.transaction(ST, 'readonly').objectStore(ST).get('main');
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  window.LocalDB = { put, get, error: () => lastError };
})();
