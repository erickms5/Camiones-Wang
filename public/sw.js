// Funcionamiento sin conexión: primero la red, y si no hay señal, la copia guardada.
const CACHE = 'mi-trailer-v23';
const ARCHIVOS = [
  './', './index.html', './camion3d.html', './css/app.css', './css/menu.css', './css/reporte.css', './css/accesible.css', './icono.svg',
  './js/camion3d.js', './js/evidencias.js', './js/sincronizacion.js', './dueno.html', './js/dueno.js', './admin.html', './js/admin.js', './js/panel.js', './js/reporte.js', './js/reportes-chofer.js', './js/vista.js', './js/consultas.js', './js/store.js', './js/plantillas.js', './js/catalogo.js',
  './js/catalogo-trabajos.js', './js/trabajos-visita.js', './js/viajes.js', './js/viajes-logica.js', './js/plantilla-mensaje.js', './js/mantenimiento-pasos.js',
  './js/validaciones.js', './js/textos.js', './js/config.js', './vendor/three.module.min.js',
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
