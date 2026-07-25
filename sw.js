/* IA4-NEURO — Service Worker (hors-ligne)
   - Navigation (HTML) : réseau d'abord (toujours à jour), repli sur le cache.
   - Assets statiques   : cache d'abord, mise à jour en arrière-plan.
   La version du cache est estampillée automatiquement au déploiement
   (le jeton __BUILD__ est remplacé par le hash du commit via GitHub Actions),
   ce qui purge les anciens caches et met à jour les utilisateurs installés. */
const CACHE = 'ia4neuro-__BUILD__';

// Coquille minimale préchargée à l'installation (le reste se met en cache à l'usage).
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/opendyslexic.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Réseau d'abord pour avoir la dernière version, repli hors-ligne.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Assets : cache d'abord, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
