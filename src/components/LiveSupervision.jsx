import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRegistros, getUsuarios, getZonas } from '../lib/api';
import { getDistance } from '../utils/geoUtils';
import { PaginationBar, usePagination } from './PaginationBar';

const getTeacherColor = (name) => {
    if (!name) return '#7F8C8D';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 75%, 45%)`;
};

const OPERATIVE_ROLES = ['DOCENTE', 'JEFE DE AREA'];
const ZONE_RADIUS_M = 50;
const CAMPUS = { lat: 4.8990, lng: -74.0360 };
const CAMPUS_ZOOM = 17;
const CAMPUS_MIN_ZOOM = 15;
const CAMPUS_MAX_ZOOM = 21;
const TILE_NATIVE_ZOOM = 19;

const addCampusTiles = (L, map) => {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        minZoom: CAMPUS_MIN_ZOOM,
        maxZoom: CAMPUS_MAX_ZOOM,
        maxNativeZoom: TILE_NATIVE_ZOOM
    }).addTo(map);
};

const parseCoord = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = parseFloat(String(value).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

const zoneLatLng = (zone) => {
    const lat = parseCoord(zone?.latitud);
    const lng = parseCoord(zone?.longitud);
    if (lat == null || lng == null) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
};

const zonesWithCoords = (zones) => (zones || [])
    .map((zone) => {
        const point = zoneLatLng(zone);
        return point ? { zone, lat: point.lat, lng: point.lng } : null;
    })
    .filter(Boolean);

const lockCampusView = (map, _placed = [], selected = null) => {
    if (!map) return;
    map.invalidateSize();
    const currentZoom = map.getZoom();
    const zoom = Number.isFinite(currentZoom)
        ? Math.min(CAMPUS_MAX_ZOOM, Math.max(currentZoom, CAMPUS_ZOOM))
        : CAMPUS_ZOOM;
    if (selected) {
        map.setView([selected.lat, selected.lng], zoom, { animate: false });
        return;
    }
    map.setView([CAMPUS.lat, CAMPUS.lng], zoom, { animate: false });
};

const drawZoneCircles = (map, L, zoneGroup, zones, selectedMapZone, resetView = true) => {
    if (!map || !L || !zoneGroup) return [];
    zoneGroup.clearLayers();

    const selectedZone = selectedMapZone === 'ALL'
        ? null
        : (zones || []).find((z) => String(z.id) === String(selectedMapZone)) || null;
    const placed = zonesWithCoords(selectedZone ? [selectedZone] : zones);
    const selectedPoint = selectedZone ? zoneLatLng(selectedZone) : null;

    placed.forEach(({ zone, lat, lng }) => {
        const circle = L.circle([lat, lng], {
            color: '#0D0D0D',
            fillColor: '#424242',
            fillOpacity: selectedZone ? 0.25 : 0.15,
            weight: selectedZone ? 3 : 2,
            dashArray: '5, 5',
            radius: ZONE_RADIUS_M
        });
        circle.bindPopup(`
            <div style="font-family:'Montserrat', sans-serif; font-size:12px;">
                <b style="color:#0D0D0D; font-size:13px;">Zona: ${zone.nombre || zone.alias}</b><br/>
                <b>Alias:</b> ${zone.alias || '—'}<br/>
                <b>Tipo:</b> ${zone.tipo || '—'}<br/>
                <b>Horario:</b> ${zone.horario || '—'}
            </div>
        `);
        zoneGroup.addLayer(circle);
    });

    if (resetView) lockCampusView(map, placed, selectedPoint);
    return placed;
};

/**
 * Supervisión en vivo o historial de vigilancias.
 * mode: 'live' | 'history'
 */
const LiveSupervision = ({
    onBack,
    mapId = 'map-live-supervision',
    refreshMs = 60000,
    mode = 'live'
}) => {
    const isLiveMode = mode !== 'history';
    const [registros, setRegistros] = useState([]);
    const [users, setUsers] = useState([]);
    const [zones, setZones] = useState([]);
    const [selectedMapTeacher, setSelectedMapTeacher] = useState('ALL');
    const [selectedMapRole, setSelectedMapRole] = useState('ALL');
    const [selectedMapZone, setSelectedMapZone] = useState('ALL');
    const [mapTimeframe, setMapTimeframe] = useState(isLiveMode ? 'today' : 'all');
    const [registrosSearch, setRegistrosSearch] = useState('');
    const [tipoFilter, setTipoFilter] = useState('ALL');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [loading, setLoading] = useState(true);

    const resolveSelectedZone = () => {
        if (selectedMapZone === 'ALL') return null;
        return zones.find((z) => String(z.id) === String(selectedMapZone)) || null;
    };

    const registroMatchesZone = (r, zone) => {
        if (!zone) return true;
        return String(r.zonaId) === String(zone.id) || r.zonaAlias === zone.alias;
    };

    const getUserRol = (user) => String(user?.rol || '').trim();

    const getRegistroRol = (registro) => {
        const byId = (users || []).find((u) => String(u.documento) === String(registro?.usuarioId));
        if (byId) return getUserRol(byId);
        const byName = (users || []).find((u) => u.nombre === registro?.usuarioNombre);
        return getUserRol(byName);
    };

    const matchesSelectedRole = (rol) => selectedMapRole === 'ALL' || rol === selectedMapRole;

    const staffUsers = (users || []).filter((u) => {
        const rol = getUserRol(u);
        if (!OPERATIVE_ROLES.includes(rol)) return false;
        return matchesSelectedRole(rol);
    });

    const isInsideZone = (lat, lng, zone) => {
        const point = zoneLatLng(zone);
        if (!point) return false;
        return getDistance(lat, lng, point.lat, point.lng) <= ZONE_RADIUS_M;
    };

    const mapRef = useRef(null);
    const mapElRef = useRef(null);
    const markerRefs = useRef({});
    const zoneLayerRef = useRef(null);
    const markerLayerRef = useRef(null);
    const zonesRef = useRef([]);
    const selectedZoneRef = useRef('ALL');
    const lastFiltersRef = useRef('');
    const [mapReady, setMapReady] = useState(0);
    zonesRef.current = zones;
    selectedZoneRef.current = selectedMapZone;

    const fetchData = async () => {
        try {
            const [regsData, zonesData, usersData] = await Promise.all([
                getRegistros(),
                getZonas(),
                getUsuarios()
            ]);
            setRegistros(Array.isArray(regsData) ? [...regsData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : []);
            setZones(Array.isArray(zonesData) ? zonesData : []);
            setUsers(Array.isArray(usersData) ? usersData : []);
        } catch (error) {
            console.error('Error cargando supervisión:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        if (!isLiveMode) return undefined;
        const interval = setInterval(fetchData, refreshMs);
        return () => clearInterval(interval);
    }, [refreshMs, isLiveMode]);

    useEffect(() => {
        setMapTimeframe(isLiveMode ? 'today' : 'all');
    }, [isLiveMode]);

    useEffect(() => {
        if (selectedMapTeacher === 'ALL') return undefined;
        const stillVisible = staffUsers.some((u) => u.nombre === selectedMapTeacher);
        if (!stillVisible) setSelectedMapTeacher('ALL');
        return undefined;
    }, [selectedMapRole, users, selectedMapTeacher]);

    const focusOnMarker = (regId, lat, lng) => {
        const map = mapRef.current;
        const marker = markerRefs.current[regId];
        if (map && marker) {
            map.setView([parseFloat(lat), parseFloat(lng)], Math.max(map.getZoom() || CAMPUS_ZOOM, 19));
            marker.openPopup();
        } else if (map && lat && lng) {
            map.setView([parseFloat(lat), parseFloat(lng)], Math.max(map.getZoom() || CAMPUS_ZOOM, 19));
        }
    };

    useEffect(() => {
        if (!isLiveMode) {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                zoneLayerRef.current = null;
                markerLayerRef.current = null;
            }
            return undefined;
        }

        let cancelled = false;
        let attempts = 0;
        const sizeTimers = [];

        const paintZones = () => {
            const map = mapRef.current;
            const L = window.L;
            if (!map || !L || !zoneLayerRef.current) return;
            try {
                drawZoneCircles(map, L, zoneLayerRef.current, zonesRef.current, selectedZoneRef.current, true);
            } catch (error) {
                console.error('Error dibujando zonas en el mapa:', error);
            }
        };

        const initMap = () => {
            if (cancelled) return;
            const mapDiv = mapElRef.current || document.getElementById(mapId);
            if (!mapDiv || !window.L) {
                if (attempts < 40) {
                    attempts += 1;
                    window.setTimeout(initMap, 80);
                }
                return;
            }

            const L = window.L;
            if (mapRef.current && mapRef.current.getContainer() !== mapDiv) {
                mapRef.current.remove();
                mapRef.current = null;
                zoneLayerRef.current = null;
                markerLayerRef.current = null;
            }

            if (!mapRef.current) {
                const map = L.map(mapDiv, {
                    zoomControl: true,
                    fadeAnimation: false,
                    scrollWheelZoom: true,
                    doubleClickZoom: true,
                    touchZoom: true,
                    minZoom: CAMPUS_MIN_ZOOM,
                    maxZoom: CAMPUS_MAX_ZOOM
                });
                mapRef.current = map;
                addCampusTiles(L, map);
                zoneLayerRef.current = L.layerGroup().addTo(map);
                markerLayerRef.current = L.layerGroup().addTo(map);
                map.setView([CAMPUS.lat, CAMPUS.lng], CAMPUS_ZOOM, { animate: false });
            }

            paintZones();
            setMapReady((value) => value + 1);
            [80, 250, 600, 1200].forEach((ms) => {
                sizeTimers.push(window.setTimeout(() => {
                    if (cancelled || !mapRef.current) return;
                    mapRef.current.invalidateSize();
                }, ms));
            });
        };

        const timer = window.setTimeout(initMap, 40);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            sizeTimers.forEach((id) => window.clearTimeout(id));
        };
    }, [isLiveMode, mapId]);

    useEffect(() => {
        if (!isLiveMode) return undefined;
        const map = mapRef.current;
        const L = window.L;
        const zoneGroup = zoneLayerRef.current;
        if (!map || !L || !zoneGroup) return undefined;

        const viewKey = `zones-${selectedMapZone}-${(zones || []).map((z) => z.id).join(',')}`;
        const resetView = lastFiltersRef.current !== viewKey;
        lastFiltersRef.current = viewKey;
        drawZoneCircles(map, L, zoneGroup, zones, selectedMapZone, resetView);
        return undefined;
    }, [isLiveMode, mapReady, zones, selectedMapZone]);

    useEffect(() => {
        if (!isLiveMode) return undefined;
        const map = mapRef.current;
        const L = window.L;
        const markerGroup = markerLayerRef.current;
        if (!map || !L || !markerGroup) return undefined;

        markerGroup.clearLayers();
        markerRefs.current = {};

        const selectedZone = selectedMapZone === 'ALL'
            ? null
            : zones.find((z) => String(z.id) === String(selectedMapZone)) || null;

        const todayStr = new Date().toISOString().split('T')[0];
        let mapRegs = registros.filter((r) => r.latitud && r.longitud && parseFloat(r.latitud) !== 0);

        if (selectedMapTeacher !== 'ALL') {
            mapRegs = mapRegs.filter((r) => r.usuarioNombre === selectedMapTeacher);
        }
        if (selectedMapRole !== 'ALL') {
            mapRegs = mapRegs.filter((r) => matchesSelectedRole(getRegistroRol(r)));
        }
        if (selectedZone) {
            mapRegs = mapRegs.filter((r) =>
                String(r.zonaId) === String(selectedZone.id) || r.zonaAlias === selectedZone.alias
            );
        }
        if (mapTimeframe === 'today') {
            mapRegs = mapRegs.filter((r) => r.timestamp && String(r.timestamp).startsWith(todayStr));
        } else if (mapTimeframe === 'last10') {
            mapRegs = mapRegs.slice(0, 10);
        }

        mapRegs.forEach((r) => {
            const lat = parseFloat(r.latitud);
            const lng = parseFloat(r.longitud);
            const color = getTeacherColor(r.usuarioNombre);
            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: color,
                color: '#ffffff',
                weight: 2.5,
                opacity: 1,
                fillOpacity: 0.9
            });
            marker.bindPopup(`
                <div style="font-family:'Montserrat', sans-serif; font-size:12px; min-width:180px;">
                    <b style="color:${color}; font-size:14px; display:block; margin-bottom:5px;">${r.usuarioNombre}</b>
                    <b>Zona:</b> ${r.zonaAlias || 'N/A'}<br/>
                    <b>Fecha/Hora:</b> ${new Date(r.timestamp).toLocaleString()}<br/>
                    <b>Distancia:</b> ${r.distancia || 0} m
                </div>
            `);
            markerRefs.current[r.id] = marker;
            markerGroup.addLayer(marker);
        });

        const liveTeachers = users.filter((u) =>
            OPERATIVE_ROLES.includes(getUserRol(u)) &&
            matchesSelectedRole(getUserRol(u)) &&
            u.latitud_actual && u.longitud_actual &&
            parseFloat(u.latitud_actual) !== 0 &&
            parseFloat(u.longitud_actual) !== 0
        );

        let filteredLiveTeachers = liveTeachers;
        if (selectedMapTeacher !== 'ALL') {
            filteredLiveTeachers = liveTeachers.filter((u) => u.nombre === selectedMapTeacher);
        }
        if (selectedZone) {
            filteredLiveTeachers = filteredLiveTeachers.filter((u) => {
                const lat = parseFloat(u.latitud_actual);
                const lng = parseFloat(u.longitud_actual);
                if (isInsideZone(lat, lng, selectedZone)) return true;
                const latestScan = registros.find((r) => r.usuarioNombre === u.nombre);
                return latestScan && (
                    String(latestScan.zonaId) === String(selectedZone.id) ||
                    latestScan.zonaAlias === selectedZone.alias
                );
            });
        }

        filteredLiveTeachers.forEach((u) => {
            const lat = parseFloat(u.latitud_actual);
            const lng = parseFloat(u.longitud_actual);
            const color = getTeacherColor(u.nombre);
            const initials = u.nombre
                ? u.nombre.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
                : '??';
            const isFresh = u.actualizado_gps && (Date.now() - new Date(u.actualizado_gps).getTime() < 15 * 60 * 1000);
            const statusColor = isFresh ? '#2ecc71' : '#95a5a6';
            const statusLabel = isFresh ? 'EN VIVO' : 'ÚLTIMA UBICACIÓN';
            const timeStr = u.actualizado_gps
                ? new Date(u.actualizado_gps).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'N/A';

            const liveIcon = L.divIcon({
                className: 'live-marker-div-icon',
                html: `
                    <div class="live-marker-container">
                        ${isFresh ? `<div class="live-pulse-ring" style="--pulse-color: ${color};"></div>` : ''}
                        <div class="live-marker-badge" style="background-color: ${color}; border-color: ${isFresh ? '#2ecc71' : '#ffffff'};">
                            ${initials}
                        </div>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -15]
            });

            const marker = L.marker([lat, lng], { icon: liveIcon });
            marker.bindPopup(`
                <div style="font-family:'Montserrat', sans-serif; font-size:12px; min-width:180px;">
                    <span style="background:${statusColor}; color:white; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:9px; float:right;">
                        ${statusLabel}
                    </span>
                    <b style="color:${color}; font-size:14px; display:block; margin-bottom:5px;">${u.nombre}</b>
                    <b>Rol:</b> ${u.rol}<br/>
                    <b>Email:</b> ${u.email || 'N/A'}<br/>
                    <b>Último reporte GPS:</b> ${timeStr}
                </div>
            `);
            markerRefs.current['live-' + u.documento] = marker;
            markerGroup.addLayer(marker);
        });

        if (selectedMapTeacher !== 'ALL' && mapRegs.length > 1) {
            const chronologicalRegs = [...mapRegs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const pathPoints = chronologicalRegs.map((r) => [parseFloat(r.latitud), parseFloat(r.longitud)]);
            const routePolyline = L.polyline(pathPoints, {
                color: getTeacherColor(selectedMapTeacher),
                weight: 3,
                opacity: 0.6,
                dashArray: '5, 8',
                smoothFactor: 1
            });
            markerGroup.addLayer(routePolyline);
        }

        return undefined;
    }, [isLiveMode, mapReady, registros, users, zones, selectedMapTeacher, selectedMapRole, selectedMapZone, mapTimeframe]);

    useEffect(() => {
        if (!isLiveMode) return undefined;
        const mapDiv = document.getElementById(mapId);
        if (!mapDiv || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            const map = mapRef.current;
            if (!map) return;
            map.invalidateSize();
        });
        observer.observe(mapDiv);
        return () => observer.disconnect();
    }, [mapId, isLiveMode]);

    useEffect(() => () => {
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
        zoneLayerRef.current = null;
        markerLayerRef.current = null;
    }, []);

    const selectedZoneFilter = resolveSelectedZone();
    const teachersList = staffUsers;
    const teacherUbicaciones = [];
    teachersList.forEach((t) => {
        const hasLiveGPS = t.latitud_actual && t.longitud_actual && parseFloat(t.latitud_actual) !== 0 && parseFloat(t.longitud_actual) !== 0;
        const latestScan = registros.find((r) => r.usuarioNombre === t.nombre);

        if (selectedZoneFilter) {
            const insideLive = hasLiveGPS && isInsideZone(
                parseFloat(t.latitud_actual),
                parseFloat(t.longitud_actual),
                selectedZoneFilter
            );
            const scanInZone = latestScan && registroMatchesZone(latestScan, selectedZoneFilter);
            if (!insideLive && !scanInZone) return;
        }

        if (hasLiveGPS) {
            const isFresh = t.actualizado_gps && (Date.now() - new Date(t.actualizado_gps).getTime() < 15 * 60 * 1000);
            teacherUbicaciones.push({
                id: 'live-' + t.documento,
                nombre: t.nombre,
                latitud: parseFloat(t.latitud_actual),
                longitud: parseFloat(t.longitud_actual),
                timestamp: t.actualizado_gps,
                isLive: true,
                isFresh,
                labelText: isFresh ? 'Ubicación GPS (Activo)' : 'Ubicación GPS (Inactivo)',
                timeAgoStr: t.actualizado_gps
                    ? new Date(t.actualizado_gps).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'N/A'
            });
        } else if (latestScan) {
            const zone = zones.find((z) => z.id === latestScan.zonaId || z.alias === latestScan.zonaAlias);
            const zoneName = zone?.nombre || latestScan.zonaAlias || 'Zona';
            const hasCoords = latestScan.latitud && latestScan.longitud && parseFloat(latestScan.latitud) !== 0;
            teacherUbicaciones.push({
                id: latestScan.id,
                nombre: t.nombre,
                latitud: hasCoords ? parseFloat(latestScan.latitud) : null,
                longitud: hasCoords ? parseFloat(latestScan.longitud) : null,
                timestamp: latestScan.timestamp,
                isLive: false,
                isFresh: false,
                labelText: `Escaneo en ${zoneName}`,
                timeAgoStr: new Date(latestScan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } else if (!selectedZoneFilter) {
            teacherUbicaciones.push({
                id: 'none-' + t.documento,
                nombre: t.nombre,
                latitud: null,
                longitud: null,
                timestamp: null,
                isLive: false,
                isFresh: false,
                labelText: 'Sin reportes ni GPS',
                timeAgoStr: 'N/A'
            });
        }
    });

    teacherUbicaciones.sort((a, b) => {
        if (a.isFresh && !b.isFresh) return -1;
        if (!a.isFresh && b.isFresh) return 1;
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.timestamp && b.timestamp) return new Date(b.timestamp) - new Date(a.timestamp);
        return a.nombre.localeCompare(b.nombre);
    });

    const filteredTableRegs = useMemo(() => {
        let list = [...registros];
        if (mapTimeframe === 'today') {
            const todayKey = new Date().toDateString();
            list = list.filter((r) => new Date(r.timestamp).toDateString() === todayKey);
        } else if (mapTimeframe === 'last10') {
            list = list.slice(0, 10);
        }
        if (selectedMapTeacher !== 'ALL') {
            list = list.filter((r) => r.usuarioNombre === selectedMapTeacher);
        }
        if (selectedMapRole !== 'ALL') {
            list = list.filter((r) => matchesSelectedRole(getRegistroRol(r)));
        }
        if (selectedZoneFilter) {
            list = list.filter((r) => registroMatchesZone(r, selectedZoneFilter));
        }
        if (tipoFilter !== 'ALL') {
            list = list.filter((r) => {
                const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                const tipo = zone?.tipo || 'OTRO';
                if (tipoFilter === 'OTRO') return !['SNACK', 'LUNCH'].includes(tipo);
                return tipo === tipoFilter;
            });
        }
        if (fechaDesde || fechaHasta) {
            list = list.filter((r) => {
                const d = new Date(r.timestamp);
                if (Number.isNaN(d.getTime())) return false;
                const key = d.toISOString().slice(0, 10);
                if (fechaDesde && key < fechaDesde) return false;
                if (fechaHasta && key > fechaHasta) return false;
                return true;
            });
        }
        const term = registrosSearch.toLowerCase();
        if (!term) return list;
        return list.filter((r) => {
            const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
            const zoneName = zone?.nombre || r.zonaAlias || '';
            const dateStr = new Date(r.timestamp).toLocaleDateString();
            const timeStr = new Date(r.timestamp).toLocaleTimeString();
            return r.usuarioNombre?.toLowerCase().includes(term) ||
                zoneName.toLowerCase().includes(term) ||
                (zone?.tipo || '').toLowerCase().includes(term) ||
                dateStr.includes(term) ||
                timeStr.includes(term);
        });
    }, [registros, mapTimeframe, selectedMapTeacher, selectedMapRole, selectedZoneFilter, tipoFilter, fechaDesde, fechaHasta, registrosSearch, zones, users]);

    const tablePager = usePagination(
        filteredTableRegs,
        10,
        `${selectedMapTeacher}|${selectedMapRole}|${selectedMapZone}|${mapTimeframe}|${tipoFilter}|${fechaDesde}|${fechaHasta}|${registrosSearch}|${mode}`
    );

    return (
        <div className="page-content">
            <div className="page-toolbar">
                <div className="page-toolbar-start">
                    <button className="btn btn-back" onClick={onBack} style={{ margin: 0 }}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <div>
                        <h2>
                            {isLiveMode ? 'Supervisión Satelital en Vivo' : 'Historial de Vigilancias'}
                        </h2>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                            {isLiveMode
                                ? 'Mapa y ubicación GPS en tiempo real'
                                : 'Bitácora histórica de rondas registradas'}
                        </p>
                    </div>
                </div>
                {isLiveMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="badge" style={{ background: '#2ecc71', fontWeight: 'bold' }}>Transmisión activa</span>
                    </div>
                )}
            </div>

            {isLiveMode && (
            <div className="map-supervision-grid">
                <div className="card map-panel" style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '16px', fontWeight: 'bold' }}>Mapa del campus y rondas</h3>
                        <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
                            Círculos de 50 m por zona, visibles aunque no haya escaneos.
                        </small>
                    </div>
                    <small style={{ color: '#888' }}><i className="fas fa-satellite"></i> Actualización cada {Math.round(refreshMs / 1000)}s</small>
                    </div>
                    <div className="map-panel-canvas-wrap">
                        <div
                            ref={mapElRef}
                            id={mapId}
                            className="map-panel-canvas"
                        ></div>
                        {loading && (
                            <div className="map-panel-loading">
                                <span className="loading-spinner" style={{ borderTopColor: 'var(--color-green-primary)', borderColor: 'rgba(0,0,0,0.1)' }}></span>
                                <span>Cargando zonas del campus...</span>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left', width: '100%', maxWidth: 'none' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: 'var(--color-blue-dark)', fontSize: '14px', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px', fontWeight: 'bold' }}>
                            <i className="fas fa-sliders-h"></i> Filtros de Mapa
                        </h4>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>Filtro por Rol:</label>
                            <select
                                value={selectedMapRole}
                                onChange={(e) => setSelectedMapRole(e.target.value)}
                                style={{ padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', textAlign: 'left' }}
                            >
                                <option value="ALL">-- Todos los roles --</option>
                                <option value="DOCENTE">DOCENTE</option>
                                <option value="JEFE DE AREA">JEFE DE AREA</option>
                            </select>
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>Seguimiento por persona:</label>
                            <select
                                value={selectedMapTeacher}
                                onChange={(e) => setSelectedMapTeacher(e.target.value)}
                                style={{ padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', textAlign: 'left' }}
                            >
                                <option value="ALL">-- Todas las personas --</option>
                                {staffUsers.map((u) => u.nombre).filter(Boolean).sort().map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>Filtro por Zona:</label>
                            <select
                                value={selectedMapZone}
                                onChange={(e) => setSelectedMapZone(e.target.value)}
                                style={{ padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', textAlign: 'left' }}
                            >
                                <option value="ALL">-- Todas las Zonas --</option>
                                {[...zones].sort((a, b) => (a.nombre || a.alias || '').localeCompare(b.nombre || b.alias || '')).map((z) => (
                                    <option key={z.id} value={String(z.id)}>
                                        {z.nombre || z.alias}{z.alias && z.nombre ? ` (${z.alias})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>Rango de Tiempo:</label>
                            <select
                                value={mapTimeframe}
                                onChange={(e) => setMapTimeframe(e.target.value)}
                                style={{ padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', textAlign: 'left' }}
                            >
                                <option value="today">Vigilancias de Hoy</option>
                                <option value="last10">Últimos 10 Escaneos</option>
                            </select>
                        </div>
                    </div>

                    <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 'none' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: 'var(--color-blue-dark)', fontSize: '14px', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px', fontWeight: 'bold' }}>
                            <i className="fas fa-satellite-dish"></i> Estado y Ubicación Docente
                        </h4>
                        <div style={{ overflowY: 'auto', flex: 1, maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
                            {teacherUbicaciones.length === 0 ? (
                                <p style={{ color: '#888', fontSize: '13px', textAlign: 'center' }}>
                                    {selectedMapRole === 'ALL'
                                        ? 'No hay docentes ni jefes registrados.'
                                        : `No hay personas con el rol ${selectedMapRole}.`}
                                </p>
                            ) : (
                                teacherUbicaciones.map((item) => {
                                    const color = getTeacherColor(item.nombre);
                                    const hasCoords = item.latitud && item.longitud;
                                    return (
                                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px', borderRadius: '10px', borderLeft: `4px solid ${color}`, fontSize: '12px' }}>
                                            <div style={{ flex: 1, marginRight: '5px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <b style={{ color: '#2d3748' }}>{item.nombre}</b>
                                                    {item.isLive && item.isFresh && (
                                                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#2ecc71', boxShadow: '0 0 8px #2ecc71' }} title="GPS Activo (En Vivo)"></span>
                                                    )}
                                                </div>
                                                <span style={{ color: '#718096', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                                                    {item.labelText} {item.timeAgoStr !== 'N/A' && `(${item.timeAgoStr})`}
                                                </span>
                                            </div>
                                            {hasCoords ? (
                                                <button
                                                    className="btn btn-green"
                                                    onClick={() => focusOnMarker(item.id, item.latitud, item.longitud)}
                                                    style={{ padding: '6px 10px', fontSize: '10px', width: 'auto', margin: 0, borderRadius: '6px' }}
                                                    title="Ubicar en mapa"
                                                >
                                                    <i className="fas fa-crosshairs"></i> Ver
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: '10px', color: '#a0aec0', padding: '6px' }}>Sin GPS</span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}

            {!isLiveMode && (
            <div className="card" style={{ margin: 0, padding: '16px', textAlign: 'left' }}>
                <div className="filters-grid">
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Buscar</label>
                        <input
                            type="text"
                            placeholder="Docente, zona, tipo o fecha..."
                            value={registrosSearch}
                            onChange={(e) => setRegistrosSearch(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', margin: 0 }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Rol</label>
                        <select
                            value={selectedMapRole}
                            onChange={(e) => setSelectedMapRole(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                        >
                            <option value="ALL">Todos los roles</option>
                            <option value="DOCENTE">DOCENTE</option>
                            <option value="JEFE DE AREA">JEFE DE AREA</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Persona</label>
                        <select
                            value={selectedMapTeacher}
                            onChange={(e) => setSelectedMapTeacher(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                        >
                            <option value="ALL">Todas las personas</option>
                            {staffUsers.map((u) => u.nombre).filter(Boolean).sort().map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Zona</label>
                        <select
                            value={selectedMapZone}
                            onChange={(e) => setSelectedMapZone(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                        >
                            <option value="ALL">Todas las zonas</option>
                            {[...zones].sort((a, b) => (a.nombre || a.alias || '').localeCompare(b.nombre || b.alias || '')).map((z) => (
                                <option key={z.id} value={String(z.id)}>{z.nombre || z.alias}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Tipo</label>
                        <select
                            value={tipoFilter}
                            onChange={(e) => setTipoFilter(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                        >
                            <option value="ALL">Todos</option>
                            <option value="SNACK">SNACK</option>
                            <option value="LUNCH">LUNCH</option>
                            <option value="OTRO">OTRO</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Periodo</label>
                        <select
                            value={mapTimeframe}
                            onChange={(e) => setMapTimeframe(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                        >
                            <option value="today">Hoy</option>
                            <option value="last10">Últimos 10</option>
                            <option value="all">Historial completo</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Desde</label>
                        <input
                            type="date"
                            value={fechaDesde}
                            max={fechaHasta || undefined}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', margin: 0 }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Hasta</label>
                        <input
                            type="date"
                            value={fechaHasta}
                            min={fechaDesde || undefined}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', margin: 0 }}
                        />
                    </div>
                    <div>
                        <button
                            type="button"
                            className="btn btn-back"
                            onClick={() => {
                                setRegistrosSearch('');
                                setSelectedMapTeacher('ALL');
                                setSelectedMapRole('ALL');
                                setSelectedMapZone('ALL');
                                setTipoFilter('ALL');
                                setMapTimeframe('all');
                                setFechaDesde('');
                                setFechaHasta('');
                            }}
                            style={{ margin: 0, width: 'auto', whiteSpace: 'nowrap' }}
                        >
                            <i className="fas fa-filter-circle-xmark"></i> Limpiar
                        </button>
                    </div>
                </div>
            </div>
            )}

            <div className="card" style={{ margin: 0, padding: '25px', width: '100%', display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '18px', fontWeight: '800' }}>
                            {isLiveMode ? '📜 Últimas Vigilancias del Día' : '📜 Historial de Vigilancias'}
                        </h3>
                        <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: '13px' }}>
                            {tablePager.total
                                ? `Mostrando ${tablePager.from}–${tablePager.to} de ${tablePager.total} registro(s)`
                                : 'Sin registros'}
                        </p>
                    </div>
                    {isLiveMode && (
                    <input
                        type="text"
                        placeholder="🔍 Buscar docente, zona, tipo o fecha..."
                        value={registrosSearch}
                        onChange={(e) => setRegistrosSearch(e.target.value)}
                        style={{ padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', maxWidth: '360px', fontSize: '13px', margin: 0, background: '#f8fafc', textAlign: 'left', minWidth: 0, boxSizing: 'border-box' }}
                    />
                    )}
                </div>

                <div className="table-container" style={{ maxHeight: '450px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table className="mini-table" style={{ margin: 0 }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Fecha</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Hora</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Docente</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Zona (Área)</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Jornada/Momento</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Ubicación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tablePager.total === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '14px' }}>
                                        No se encontraron registros que coincidan con la búsqueda.
                                    </td>
                                </tr>
                            ) : (
                                tablePager.pageItems.map((r) => {
                                    const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                                    const hasCoords = r.latitud && r.longitud && parseFloat(r.latitud) !== 0;
                                    return (
                                        <tr key={r.id}>
                                            <td style={{ padding: '12px 15px', color: '#4a5568' }}>{new Date(r.timestamp).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 15px', color: '#4a5568', fontWeight: '600' }}>{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td style={{ padding: '12px 15px', fontWeight: '700', color: '#2d3748' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getTeacherColor(r.usuarioNombre) }}></span>
                                                    {r.usuarioNombre}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 15px', fontWeight: '600', color: 'var(--color-blue-dark)' }}>{zone?.nombre || r.zonaAlias || 'ZONA'}</td>
                                            <td style={{ padding: '12px 15px' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    background: zone?.tipo === 'SNACK' ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : zone?.tipo === 'LUNCH' ? 'linear-gradient(135deg, #3498db, #2980b9)' : '#7f8c8d',
                                                    color: 'white'
                                                }}>
                                                    {zone?.tipo || 'ORDINARIA'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 15px' }}>
                                                {hasCoords ? (
                                                    <span style={{ color: '#27ae60', fontWeight: '600', fontSize: '11px' }}>
                                                        <i className="fas fa-check-circle"></i> Capturada ({r.distancia || 0}m)
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '11px' }}>
                                                        <i className="fas fa-times-circle"></i> Sin Coordenadas
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <PaginationBar
                    page={tablePager.page}
                    totalPages={tablePager.totalPages}
                    total={tablePager.total}
                    from={tablePager.from}
                    to={tablePager.to}
                    onPrev={tablePager.goPrev}
                    onNext={tablePager.goNext}
                />
            </div>
        </div>
    );
};

export default LiveSupervision;
