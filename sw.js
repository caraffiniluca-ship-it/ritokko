// Service worker: tiene in cache l'app e le librerie, così si apre subito e Look/Migliora/Video funzionano anche senza rete.
const VERSIONE = 'ritokko-v8';
const APP = ['./', 'index.html', 'style.css', 'app.js', 'gl.js', 'video.js', 'inpaint.js', 'seleziona.js', 'ai-online.js',
  'sfondo.js', 'sottotitoli.js', 'crea.js', 'crea-opzioni.js', 'memoria.js', 'scontorno.js',
  'manifest.webmanifest', 'logo/ritokko-simbolo.svg', 'icone/icona-180.png', 'icone/icona-192.png', 'icone/icona-512.png'];

self.addEventListener('install', e => {
  // "reload": scarico i file freschi, non quelli nella cache HTTP del browser
  e.waitUntil(caches.open(VERSIONE)
    .then(c => c.addAll(APP.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // cancello le cache delle versioni precedenti (comprese quelle del vecchio nome "glowy")
  const vecchia = k => (k.startsWith('ritokko-v') && k !== VERSIONE) || k.startsWith('glowy-');
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(vecchia).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // prima la rete (senza cache HTTP, per non mescolare file vecchi e nuovi), poi la cache se offline
    e.respondWith(fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request)));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // librerie con versione fissa: prima la cache
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); }
      return r;
    })));
  }
  // Hugging Face (modelli e servizi online) non passa di qui: i modelli hanno la loro cache
});
