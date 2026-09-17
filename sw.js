// ============================================================
//  Service Worker — 一度読み込んだファイルをキャッシュし、
//  電波のない場所でも遊べるようにする
// ============================================================
const CACHE = 'skyline-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // 自分のファイルは「まず通信、だめならキャッシュ」
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (_) {
        const hit = await caches.match(req);
        if (hit) return hit;
        // ページ遷移ならトップページを返す
        if (req.mode === 'navigate') {
          const top = await caches.match('./') || await caches.match('./index.html');
          if (top) return top;
        }
        throw _;
      }
    })());
    return;
  }

  // 外部（Webフォント）は「まずキャッシュ、裏で更新」
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || net;
  })());
});
