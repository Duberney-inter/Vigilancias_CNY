import { useState, useEffect, useCallback, useRef } from 'react';
import { syncRegistros } from '../lib/api';
import { queueAdd, queueGetAll, queueRemoveIds, queueCount } from '../lib/offlineDb';
import Swal from 'sweetalert2';

const SYNC_TAG_PREFIX = 'sync-';

async function registerBackgroundSync(collectionName) {
    try {
        if (!('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        if (!registration.sync) return; // Background Sync no soportado (ej. Safari/iOS)
        await registration.sync.register(`${SYNC_TAG_PREFIX}${collectionName}`);
    } catch (err) {
        console.error('No se pudo registrar Background Sync:', err);
    }
}

export const useOfflineSync = (collectionName) => {
    const [queueLength, setQueueLength] = useState(0);
    const syncingRef = useRef(false);

    const updateQueueLength = useCallback(async () => {
        try {
            const count = await queueCount(collectionName);
            setQueueLength(count);
        } catch {
            setQueueLength(0);
        }
    }, [collectionName]);

    const saveToQueue = useCallback(async (data) => {
        try {
            await queueAdd(collectionName, data);
        } catch (err) {
            console.error('Error guardando en cola offline (IndexedDB):', err);
        }
        await updateQueueLength();
        await registerBackgroundSync(collectionName);

        Swal.fire({
            icon: 'warning',
            title: 'Modo Offline',
            text: 'Registro guardado localmente. Se sincronizará automáticamente cuando haya conexión.',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    }, [collectionName, updateQueueLength]);

    const syncQueue = useCallback(async () => {
        if (!navigator.onLine || syncingRef.current) return;

        let queue = [];
        try {
            queue = await queueGetAll(collectionName);
        } catch {
            return;
        }
        if (queue.length === 0) return;

        syncingRef.current = true;
        try {
            const itemsToSync = queue.map(({ _localId, collection, queuedAt, ...rest }) => ({
                ...rest,
                syncedAt: new Date().toISOString()
            }));

            await syncRegistros(itemsToSync);
            await queueRemoveIds(queue.map((item) => item._localId));
            await updateQueueLength();

            Swal.fire({
                icon: 'success',
                title: 'Sincronización Exitosa',
                text: `${itemsToSync.length} registro(s) pendientes subidos.`,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        } catch (error) {
            console.error('Sync error:', error);
            // Conservar cola para reintento
        } finally {
            syncingRef.current = false;
        }
    }, [collectionName, updateQueueLength]);

    useEffect(() => {
        updateQueueLength();
        syncQueue();

        const handleOnline = () => syncQueue();
        window.addEventListener('online', handleOnline);
        const interval = setInterval(syncQueue, 30000);

        // Si el Service Worker sincronizó en segundo plano (Background Sync,
        // incluso con la pestaña cerrada), avisa para refrescar el contador.
        const handleSwMessage = (event) => {
            if (event.data?.type === 'offline-sync-complete' && event.data?.collection === collectionName) {
                updateQueueLength();
            }
        };
        navigator.serviceWorker?.addEventListener?.('message', handleSwMessage);

        return () => {
            window.removeEventListener('online', handleOnline);
            clearInterval(interval);
            navigator.serviceWorker?.removeEventListener?.('message', handleSwMessage);
        };
    }, [syncQueue, updateQueueLength, collectionName]);

    return { saveToQueue, queueLength, syncQueue };
};
