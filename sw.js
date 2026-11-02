/* 词话 · Service Worker
   策略：
   - 页面导航：网络优先，只有网络真的失败才用缓存（不再因超时返回旧页面）
   - 静态资源：网络优先，8 秒超时后回落缓存
   - 缓存版本变更时自动清掉旧缓存 */
const CACHE = 'cihua-v7';
const ASSET_TIMEOUT = 8000;
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

function fromCache(req) {
  return caches.match(req).then((hit) => {
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('./index.html');
    return new Response('离线状态', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  });
}

function networkFirst(req, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (p) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(p);
    };
    const timer = timeoutMs ? setTimeout(() => done(fromCache(req)), timeoutMs) : null;

    // cache: 'reload' 跳过浏览器 HTTP 缓存，否则更新后仍会拿到旧文件
    fetch(req, { cache: 'reload' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        done(res);
      })
      .catch(() => done(fromCache(req)));
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管本站资源，第三方接口（查词 / 翻译）直连
  if (url.origin !== location.origin) return;

  // 页面导航不设超时：宁可等网络，也不要拿旧页面糊弄用户
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 0));
    return;
  }

  event.respondWith(networkFirst(req, ASSET_TIMEOUT));
});

// 点通知回到 App
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
