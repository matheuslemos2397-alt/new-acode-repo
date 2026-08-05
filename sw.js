const CACHE_NAME = 'financeiro-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Nunca cacheia SheetDB
    if (e.request.url.includes('sheetdb.io')) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            // Cache first para assets, network first para dados
            if (e.request.destination === 'document' || e.request.destination === 'script' || e.request.destination === 'style') {
                return cached || fetch(e.request).then(response => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, response.clone());
                        return response;
                    });
                });
            }
            return fetch(e.request).catch(() => cached);
        })
    );
});