// Registro de Malla: funciona sin conexión. Cambia VERSION al subir cambios.
const VERSION = 'malla-14';
const TILES = 'malla-tiles';
const TILE_MAX = 4000;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const TILE_HOSTS = ['tile.opentopomap.org', 'tile.openstreetmap.org', 'server.arcgisonline.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Trozos de mapa: primero de la caché (sirven sin internet); si no están, se bajan y se guardan.
async function tile(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) {
      await c.put(req.url, r.clone());
      c.keys().then(ks => { if (ks.length > TILE_MAX) ks.slice(0, ks.length - TILE_MAX).forEach(k => c.delete(k)); });
    }
    return r;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const host = new URL(e.request.url).hostname;
  if (TILE_HOSTS.some(h => host.endsWith(h))) { e.respondWith(tile(e.request)); return; }
  // Resto: responde desde la caché al momento y actualiza en segundo plano si hay conexión.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    if (r) return r;
    if (e.request.mode === 'navigate') return c.match('./index.html');
    return new Response('', { status: 504 });
  }));
});
