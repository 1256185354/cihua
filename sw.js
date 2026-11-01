/* 词话 · Service Worker
   网络优先、失败回落到缓存：保证能离线打开，同时不会被旧缓存卡住。
   网络请求设 4 秒超时：隧道/弱网卡住时立刻用缓存，不把页面吊死。 */
const CACHE = 'cihua-v5';
const TIMEOUT = 4000;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fallback(req) {
  return caches.match(req).then((hit) => {
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('./index.html');
    return new Response('离线状态', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管本站资源，第三方接口（查词 / 翻译）直连
  if (url.origin !== location.origin) return;

  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const done = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fn());
      };

      const timer = setTimeout(() => done(() => fallback(req)), TIMEOUT);

      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          done(() => res);
        })
        .catch(() => done(() => fallback(req)));
    })
  );
});


// 点提醒直接回到 App
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const opened = list.find((c) => c.url.includes(location.origin));
      if (opened) return opened.focus();
      return self.clients.openWindow('./');
    })
  );
});
