// Funcionamiento sin conexión: primero la red, y si no hay señal, la copia guardada.
const CACHE = 'registro-unidades-v2';
const ARCHIVOS = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './icono.svg',
  './js/app.js', './js/config.js', './js/textos.js', './js/plantillas.js', './js/validaciones.js', './js/store.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
