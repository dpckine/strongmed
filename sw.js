/* StrongMed — service worker: la app abre sin internet.
   Los datos (Firestore) los guarda Firebase en el teléfono y los sincroniza solo. */
const V = 'sm-v55';
const SHELL = ['./', './index.html', 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js', 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js', 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './data/ejercicios.json?v=24', './js/sm-anim.js?v=24'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
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
  if (req.mode === 'navigate') {   // la app: si la red tarda más de 2,5 s se abre la copia guardada (y se actualiza por detrás)
    const red = fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); } return r; });
    e.respondWith(new Promise(res => { let listo = false;
      const t = setTimeout(async () => { const c = await caches.match('./index.html'); if (c && !listo) { listo = true; res(c); } }, 2500);
      red.then(r => { if (!listo) { listo = true; clearTimeout(t); res(r); } }).catch(async () => { clearTimeout(t); if (!listo) { listo = true; res((await caches.match('./index.html')) || Response.error()); } });
    }));
    return; }
  if (/gstatic\.com\/firebasejs\/|cdn\.jsdelivr\.net|unpkg\.com|fonts\.gstatic\.com/.test(u)) { e.respondWith(cacheFirst(req, V)); return; }  // librerías con versión fija: siempre desde el teléfono
  if (/tile\.openstreetmap\.(org|de|fr)/.test(u)) { e.respondWith(cacheFirst(req, 'sm-tiles')); return; }
  if (/\/(images|videos)\//.test(u) || /\.(gif|jpe?g|png|webp)(\?|$)/.test(u)) { e.respondWith(cacheFirst(req, 'sm-media')); return; }
  e.respondWith(swr(req, V));   // librerías (Firebase, Chart.js, mapas, fuentes) y datos
});

/* tocar una notificación: abre (o enfoca) la app y le avisa qué hacer */
self.addEventListener('notificationclick', e => { const n=e.notification, d=n.data||{}, accion=e.action||''; n.close();
  e.waitUntil((async () => { const cs=await self.clients.matchAll({type:'window', includeUncontrolled:true});
    let c=cs.find(x=>x.url.startsWith(self.registration.scope)); if(c){ await c.focus(); } else { c=await self.clients.openWindow(d.url||'./'); }
    if(c) setTimeout(()=>c.postMessage({tipo:'abrir', tab:d.tab||'hoy', accion: d.tipo==='llamada' ? (accion||'contestar') : accion}), 600); })()); });
