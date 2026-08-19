/**
 * IndexedDB local para modo offline-first: cola de registros pendientes de
 * sincronizar (GPS/formularios) + almacén clave/valor para estado de la
 * interfaz (zonas cacheadas, token de sesión para Background Sync, etc.).
 *
 * El Service Worker (public/sw.js) usa el MISMO nombre de base de datos y
 * almacenes para poder leer/enviar la cola en segundo plano sin depender de
 * que haya una pestaña abierta.
 */
export const DB_NAME = 'vigilancias_cny_offline';
export const DB_VERSION = 1;
export const QUEUE_STORE = 'offline_queue';
export const KV_STORE = 'kv_store';

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB no soportado en este navegador'));
            return;
        }
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
    return dbPromise;
}

async function withStore(storeName, mode) {
    const db = await openDb();
    return db.transaction(storeName, mode).objectStore(storeName);
}

function wrap(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ---------- Cola offline (registros/formularios pendientes) ----------

export async function queueAdd(collection, item) {
    const store = await withStore(QUEUE_STORE, 'readwrite');
    return wrap(store.add({ ...item, collection, queuedAt: new Date().toISOString() }));
}

export async function queueGetAll(collection) {
    const store = await withStore(QUEUE_STORE, 'readonly');
    const index = store.index('collection');
    const all = await wrap(index.getAll(IDBKeyRange.only(collection)));
    return all || [];
}

export async function queueCount(collection) {
    const items = await queueGetAll(collection);
    return items.length;
}

export async function queueRemoveIds(ids) {
    const store = await withStore(QUEUE_STORE, 'readwrite');
    await Promise.all(ids.map((id) => wrap(store.delete(id))));
}

// ---------- Estado de interfaz (clave/valor) ----------

export async function kvSet(key, value) {
    const store = await withStore(KV_STORE, 'readwrite');
    return wrap(store.put({ key, value }));
}

export async function kvGet(key) {
    const store = await withStore(KV_STORE, 'readonly');
    const row = await wrap(store.get(key));
    return row ? row.value : null;
}

export async function kvDelete(key) {
    const store = await withStore(KV_STORE, 'readwrite');
    return wrap(store.delete(key));
}
