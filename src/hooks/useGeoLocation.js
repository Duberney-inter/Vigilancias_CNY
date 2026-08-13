import { useState, useEffect, useRef } from 'react';

export const useGeoLocation = () => {
    const [location, setLocation] = useState({
        loaded: false,
        coordinates: { lat: "", lng: "" },
        accuracy: null,
        error: null,
        timestamp: null
    });

    const watchIdRef = useRef(null);

    const onSuccess = (pos) => {
        setLocation(prev => ({
            ...prev,
            loaded: true,
            coordinates: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
            },
            accuracy: pos.coords.accuracy,
            error: null,
            timestamp: pos.timestamp
        }));
    };

    const onError = (error) => {
        setLocation(prev => ({
            ...prev,
            loaded: true,
            error: {
                code: error.code,
                message: error.message,
            },
        }));
    };

    const getPosition = () => {
        if (!("geolocation" in navigator)) {
            onError({ code: 0, message: "Geolocalización no soportada" });
            return;
        }

        // Clean up previous watch if any
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        // iOS Optimization: Stage 1 - Aggressive acquisition
        // Calling it once with low accuracy often "wakes up" the hardware faster in Safari
        navigator.geolocation.getCurrentPosition(onSuccess, () => { }, {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: Infinity
        });

        // Stage 2 - High accuracy persistent watch
        const options = {
            enableHighAccuracy: true,
            timeout: 20000, // Increased for stability in indoor/weak signal areas
            maximumAge: 0
        };

        const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
        watchIdRef.current = watchId;
    };

    useEffect(() => {
        getPosition();
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    // Function to manually re-trigger acquisition if stuck
    const refreshGPS = () => {
        setLocation(prev => ({ ...prev, loaded: false, error: null }));
        getPosition();
    };

    return { ...location, refreshGPS };
};
