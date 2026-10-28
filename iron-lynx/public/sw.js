// Service worker – offline režim.
//  • Pri inštalácii uloží základ (index, manifest, ikony, všetku grafiku).
//  • Navigácia (index.html): najprv sieť (aby prišla nová verzia), pri výpadku cache.
//  • Ostatné súbory: najprv cache, inak sieť + uložiť (JS/CSS z Vite majú hash v názve).
// Pri novej verzii hry zvýš VERSION.
const VERSION = 'ironlynx-v1';
const ASSETS = [
  'player_rys', 'player_orlica', 'player_sokol', 'player_vlk', 'infantry', 'sniper', 'drone', 'turret', 'turret_barrel',
  'bullets', 'laser', 'flame', 'boulder', 'powerups', 'explosion', 'spark', 'pixel', 'checkpoint', 'golem', 'spider',
  'gate', 'reactor', 'arm', 'armseg', 'tiles1', 'tiles2', 'tiles3', 'tiles4', 'water', 'water_body', 'waterfall',
  'bg1_sky', 'bg1_far', 'bg1_mid', 'bg1_near', 'fog', 'bg2_far', 'bg2_near', 'bg3_sky', 'bg3_far', 'bg3_near',
  'bg4_sky', 'bg4_far', 'bg4_near', 'font', 'ui', 'emblem',
].map((n) => `assets/${n}.png`);
const CORE = ['./', 'index.html', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'assets/font.json', ...ASSETS];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put('index.html', copy));
      return r;
    }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  })));
});
