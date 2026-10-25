// Stale-while-revalidate: app opens instantly offline and updates itself on the next launch.
const CACHE = 'planovac-v4';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/store.js', 'js/util.js', 'js/calendar.js', 'js/overview.js', 'js/settings.js', 'js/payments.js', 'js/expenses.js', 'js/receipt.js', 'js/invoices.js', 'js/pdf.js',
  'vendor/pdf/jspdf.umd.min.js', 'vendor/pdf/DejaVuSans.ttf', 'vendor/pdf/DejaVuSans-Bold.ttf',
  // OCR (~11 MB) precached so receipts work offline right after install
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/eng.traineddata.gz',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request)
      .then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => hit);
    return hit || net;
  }));
});
