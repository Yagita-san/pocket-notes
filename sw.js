// オフラインでも開けるようにするための仕組み
// 方針: まずネットから最新を取りに行き、3秒で返事がなければ保存済みのコピーを使う
const CACHE = 'pocket-notes-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const fromNet = fetch(req, {cache: 'no-cache'}).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  const cached = () => cache.match(req, {ignoreSearch: true})
    .then(r => r || (req.mode === 'navigate' ? cache.match('./') : undefined));

  try {
    const res = await Promise.race([
      fromNet,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    return res;
  } catch (err) {
    const hit = await cached();
    if (hit) return hit;
    return fromNet; // 保存がなければネットの結果を待つ
  }
}
