import { useState, useEffect, useCallback, useRef } from 'react';
import { syncRegistros } from '../lib/api';
import Swal from 'sweetalert2';

export const useOfflineSync = (collectionName) => {
    const [queueLength, setQueueLength] = useState(0);
    const STORAGE_KEY = `offline_queue_${collectionName}`;
    const syncingRef = useRef(false);

    const updateQueueLength = useCallback(() => {
        try {
            const queue = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            setQueueLength(Array.isArray(queue) ? queue.length : 0);
        } catch {
            setQueueLength(0);
        }
    }, [STORAGE_KEY]);

    const saveToQueue = (data) => {
        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            if (!Array.isArray(queue)) queue = [];
        } catch {
            queue = [];
        }
        queue.push({ ...data, queuedAt: new Date().toISOString() });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        updateQueueLength();

        Swal.fire({
            icon: 'warning',
            title: 'Modo Offline',
            text: 'Registro guardado localmente. Se sincronizará automáticamente cuando haya conexión.',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    };

    const syncQueue = useCallback(async () => {
        if (!navigator.onLine || syncingRef.current) return;

        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            if (!Array.isArray(queue)) queue = [];
        } catch {
            return;
        }
        if (queue.length === 0) return;

        syncingRef.current = true;
        try {
            const itemsToSync = queue.map((item) => {
                const { queuedAt, ...rest } = item;
                return {
                    ...rest,
                    syncedAt: new Date().toISOString()
                };
            });

            await syncRegistros(itemsToSync);

            localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
            updateQueueLength();

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
    }, [STORAGE_KEY, updateQueueLength]);

    useEffect(() => {
        updateQueueLength();
        syncQueue();

        const handleOnline = () => syncQueue();
        window.addEventListener('online', handleOnline);
        const interval = setInterval(syncQueue, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            clearInterval(interval);
        };
    }, [syncQueue, updateQueueLength]);

    return { saveToQueue, queueLength, syncQueue };
};
