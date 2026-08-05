const CACHE_NAME = 'financeiro-v3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js'
    // Removi o Dexie CDN do cache — ele dá erro de CORS em alguns servidores locais
];

// INSTALAÇÃO
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Cacheia arquivo por arquivo para não falhar tudo se um der erro
                return Promise.all(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Não consegui cachear: ${url}`, err);
                        })
                    )
                );
            })
            .catch((err) => {
                console.error('[SW] Erro na instalação:', err);
            })
    );
});

// ATIVAÇÃO
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        }).catch((err) => {
            console.error('[SW] Erro ao limpar caches antigos:', err);
        })
    );
    self.clients.claim();
});

// INTERCEPTAR REQUISIÇÕES
self.addEventListener('fetch', (e) => {
    // Nunca intercepta POST/PUT/DELETE nem SheetDB
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('sheetdb.io')) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            // Se achou no cache, retorna
            if (cached) return cached;

            // Senão, vai na internet
            return fetch(e.request)
                .then((response) => {
                    // Só cacheia respostas válidas do mesmo domínio
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, clone);
                    });
                    
                    return response;
                })
                .catch(() => {
                    // Se falhar e tiver no cache, usa o cache
                    return cached;
                });
        })
    );
});