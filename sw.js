/* StrongMed — service worker: la app abre sin internet.
   Los datos (Firestore) los guarda Firebase en el teléfono y los sincroniza solo. */
const V = 'sm-v8';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './data/ejercicios.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'sm-media' && k !== 'sm-tiles').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const isData = u => /firestore\.googleapis\.com|googleapis\.com\/(google\.firestore|identitytoolkit)|firebaseinstallations|securetoken/.test(u);
const swr = async (req, cacheName) => { const c = await caches.open(cacheName); const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net; };
const cacheFirst = async (req, cacheName) => { const c = await caches.open(cacheName); const hit = await c.match(req); if (hit) return hit;
  try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; } catch (e) { return new Response('', {status: 504}); } };
self.addEventListener('fetch', e => {
  const req = e.request, u = req.url;
  if (req.method !== 'GET' || isData(u) || !/^https?:/.test(u)) return;
  if (req.mode === 'navigate') {   // la app: red primero, si no hay internet la copia guardada
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return; }
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.(org|fr)/.test(u)) { e.respondWith(cacheFirst(req, 'sm-tiles')); return; }
  if (/\/(images|videos)\//.test(u) || /\.(gif|jpe?g|png|webp)(\?|$)/.test(u)) { e.respondWith(cacheFirst(req, 'sm-media')); return; }
  e.respondWith(swr(req, V));   // librerías (Firebase, Chart.js, mapas, fuentes) y datos
});
