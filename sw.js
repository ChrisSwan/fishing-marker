// Cache-first offline support. Bump VERSION together with js/version.js on every release.
const VERSION = '0.1.1';
const CACHE = `fishing-marker-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/geometry.js',
  './js/viewport.js',
  './js/storage.js',
  './js/swim.js',
  './js/overlay.js',
  './js/input.js',
  './js/camera.js',
  './js/transfer.js',
  './js/gyro.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' bypasses the HTTP cache (GitHub Pages sends max-age=600) so a new version never caches old files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
