// Service Worker: app shell offline (Cache API) + Background Sync de la cola
// guardada en IndexedDB por src/lib/offlineDb.js. Debe usar los MISMOS
// nombres de base de datos/almacenes que ese archivo para poder leer la cola.

const CACHE_VERSION = 'cny-vigilancias-v1';
const DB_NAME = 'vigilancias_cny_offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'offline_queue';
const KV_STORE = 'kv_store';

// Recursos críticos para que la interfaz cargue y se vea bien sin red.
// Los archivos de /assets/*.js|css (con hash) se cachean en tiempo real,
// no aquí, porque su nombre cambia en cada build.
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        await Promise.all(
            PRECACHE_URLS.map(async (url) => {
                try {
                    const res = await fetch(url, { mode: 'cors' });
                    if (res.ok || res.type === 'opaque') await cache.put(url, res);
                } catch (err) {
                    console.warn('[SW] No se pudo precachear', url, err);
                }
            })
        );
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

const RUNTIME_CACHEABLE_HOSTS = [
    self.location.hostname,
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // La API nunca se cachea: si no hay red, que falle y lo maneje la cola offline.
    if (url.pathname.startsWith('/api/')) return;

    // Navegación (SPA): red primero, con el shell cacheado como respaldo offline.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(request);
                const cache = await caches.open(CACHE_VERSION);
                cache.put('/index.html', fresh.clone());
                return fresh;
            } catch {
                const cache = await caches.open(CACHE_VERSION);
                return (await cache.match('/index.html')) || Response.error();
            }
        })());
        return;
    }

    if (!RUNTIME_CACHEABLE_HOSTS.includes(url.hostname)) return;

    // Assets propios (con hash) y librerías CDN: cache-first, se rellenan solas.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
            const fresh = await fetch(request);
            if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
            return fresh;
        } catch (err) {
            if (cached) return cached;
            throw err;
        }
    })());
});

// ---------- Background Sync: enviar la cola aunque no haya pestaña abierta ----------

function idbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openOfflineDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                const store = db.createObjectStore(QUEUE_STORE, { keyPath: '_localId', autoIncrement: true });
                store.createIndex('collection', 'collection', { unique: false });
            }
            if (!db.objectStoreNames.contains(KV_STORE)) {
                db.createObjectStore(KV_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function syncCollection(collection) {
    const db = await openOfflineDb();

    const kvStore = db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE);
    const tokenRow = await idbRequest(kvStore.get('authToken'));
    const token = tokenRow?.value;
    if (!token) return;

    const queueIndex = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).index('collection');
    const items = (await idbRequest(queueIndex.getAll(IDBKeyRange.only(collection)))) || [];
    if (items.length === 0) return;

    const payload = items.map(({ _localId, collection: _c, queuedAt, ...rest }) => ({
        ...rest,
        syncedAt: new Date().toISOString()
    }));

    const res = await fetch(`/api/${collection}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Fallo al sincronizar ${collection}: ${res.status}`);

    const deleteStore = db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE);
    await Promise.all(items.map((item) => idbRequest(deleteStore.delete(item._localId))));

    const clients = await self.clients.matchAll();
    clients.forEach((client) => client.postMessage({ type: 'offline-sync-complete', collection }));
}

self.addEventListener('sync', (event) => {
    if (!event.tag.startsWith('sync-')) return;
    const collection = event.tag.slice('sync-'.length);
    event.waitUntil(syncCollection(collection));
});
