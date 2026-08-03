const CACHE_NAME = 'financeiro-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    'https://unpkg.com/dexie/dist/dexie.js'
];

// Instala o cache (salva os visuais do app)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(urlsToCache))
    );
});

// Intercepta a internet
self.addEventListener('fetch', event => {
    // Regra de Ouro: NUNCA colocar o SheetDB no cache, senão o backup falha
    if (event.request.url.includes('sheetdb.io')) {
        return; 
    }

    // Se estiver sem internet, puxa o visual do cache
    event.respondWith(
        caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
});
