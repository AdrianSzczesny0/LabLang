/* LangLab 3.0 service worker — cache bump preserves localStorage progress. */
const CACHE = 'langlab-offline-v3.3';
const RESOURCES = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/registry.js',
  './js/storage.js',
  './js/speech.js',
  './js/content.js',
  './js/flashcards.js',
  './js/assessments.js',
  './js/i18n.js',
  './js/fairytales.js',
  './js/starter-pack.js',
  './content/fairytales/de.json',
  './content/packs/en-starter.json',
  './content/stories/de.json',
  './content/stories/es.json',
  './content/stories/en.json',
  './content/stories/fr.json',
  './content/stories/it.json',
  './content/vocabulary/de.json',
  './content/vocabulary/es.json',
  './content/vocabulary/en.json',
  './content/vocabulary/fr.json',
  './content/vocabulary/it.json',
  './stories.json',
  './legacy-words.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(RESOURCES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
