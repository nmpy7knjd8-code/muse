// Muse service worker: offline app shell + runtime cache.
// Navigation & theory data: network-first (fresh when online, cached when offline).
// Hashed static assets: cache-first.
// All paths are relative to the service worker's own location, so the app works under any sub-path
// (e.g. GitHub Pages: https://<user>.github.io/<repo>/).
const CACHE = 'muse-v7';
const BASE = new URL('./', self.location.href).href;
const at = (p) => new URL(p, BASE).href;
const INDEX = at('index.html');
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'theory_kb.json', 'theory_kb.seed.json', 'lore.json', 'artists.json', 'mood_lexicon.json', 'icons/icon-192.png', 'icons/apple-touch-icon.png'].map(at);

/** The hashed entry bundle/CSS load before this worker controls the page on a first visit, so they'd never
 *  hit the runtime cache — read them out of index.html and precache them too (offline works after one visit). */
async function precacheEntryAssets(c) {
  try {
    const html = await (await fetch(INDEX, { cache: 'reload' })).text();
    const urls = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], INDEX).href);
    await c.addAll(urls);
  } catch { /* offline during install: runtime cache fills in later */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {});
    await precacheEntryAssets(c);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('.json');
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? INDEX : req, copy)); }
          return res;
        })
        .catch(() => caches.match(req.mode === 'navigate' ? INDEX : req).then((r) => r || caches.match(INDEX))),
    );
    return;
  }
  event.respondWith(
    // ignoreVary: hashed assets never change; a dev/preview server may add "Vary: Origin".
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
