// Offline režimas: pirmiausia bandom tinklą (kad atnaujinimai atsirastų iškart), jei nėra interneto – imam iš atminties.
const CACHE = 'fitai-v10';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/db.js', 'js/data.js', 'js/ai.js', 'js/images.js', 'js/weather.js', 'js/profile.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isOwn = url.origin === self.location.origin;
  // Fono iškirpimo biblioteka ir modelis (jsdelivr, staticimgly) – NELIEČIAM: iPhone Safari
  // nepavyksta jų persiųsti per service worker'į ("Load failed"). Juos saugo naršyklės atmintis.
  const isLib = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!isOwn && !isLib) return; // OpenAI, orai, bibliotekos – visada tiesiai
  if (isLib) {
    // šriftai nekinta – imam iš atminties
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // no-cache: visada pasitikrinam serveryje, kad visi programėlės failai būtų tos pačios versijos
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
