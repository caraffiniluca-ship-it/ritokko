// Service worker: tiene in cache l'app e le librerie, così si apre subito e Luce/Migliora/Video funzionano anche senza rete.
const VERSIONE = 'glowy-v3';
const APP = ['./', 'index.html', 'style.css', 'app.js', 'gl.js', 'video.js', 'inpaint.js', 'seleziona.js', 'ai-online.js',
  'sfondo.js', 'sottotitoli.js', 'crea.js',
  'manifest.webmanifest', 'icone/icona-180.png', 'icone/icona-192.png', 'icone/icona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith('glowy-v') && k !== VERSIONE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // prima la rete (per avere gli aggiornamenti), poi la cache se offline
    e.respondWith(fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request)));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // librerie con versione fissa: prima la cache
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); }
      return r;
    })));
  }
  // Hugging Face (modello e servizio online) non passa di qui: il modello ha la sua cache in inpaint.js
});
