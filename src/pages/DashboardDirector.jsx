import React, { useState, useEffect, useRef } from 'react';
import { getRegistros, getZonas, getNovedades, getUsuarios, createComunicado, getComunicadosEnviados } from '../lib/api';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, DoughnutController } from 'chart.js';
import { Pie, Bar, Doughnut, Line } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import LiveSupervision from '../components/LiveSupervision';
import CumplimientoVigilancias from '../components/CumplimientoVigilancias';
import ComunicadosHistorial from '../components/ComunicadosHistorial';
import ComunicadoDestinatarioSelect, { resolveComunicadoDestinatario } from '../components/ComunicadoDestinatarioSelect';
import { downloadExcelCsv, formatDateTimeForExcel } from '../utils/exportCsv';
import { downloadPdfTable } from '../utils/exportPdf';
import { getDistance } from '../utils/geoUtils';
import { PaginationBar, slicePage } from '../components/PaginationBar';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, DoughnutController);

const ZONE_RADIUS_M = 10;
// Si un docente no envía su GPS en este lapso, deja de considerarse "en vivo"
// y desaparece del mini-mapa en vez de quedar pegado con su última posición.
const GPS_FRESH_WINDOW_MS = 2 * 60 * 1000;

const isGpsFresh = (actualizadoGps) =>
    Boolean(actualizadoGps) && (Date.now() - new Date(actualizadoGps).getTime() < GPS_FRESH_WINDOW_MS);

const DashboardDirector = ({ readOnly = false }) => {
    const [view, setView] = useState('main'); // 'main', 'kpis', 'registros', 'notif', 'reports', 'novedades_list', 'cumplimiento'
    const [kpis, setKpis] = useState({ totalRegistros: 0, zonasActivas: 0, totalNovedades: 0 });
    const [registros, setRegistros] = useState([]);
    const [users, setUsers] = useState([]);
    const [zones, setZones] = useState([]); // Map zone names and types
    const [novedades, setNovedades] = useState([]);
    const [reportFilter, setReportFilter] = useState('');
    const [selectedTeacherId, setSelectedTeacherId] = useState('ALL');
    const [reportZoneId, setReportZoneId] = useState('ALL');
    const [reportTipo, setReportTipo] = useState('ALL');
    const [reportFechaDesde, setReportFechaDesde] = useState('');
    const [reportFechaHasta, setReportFechaHasta] = useState('');
    const [novSearch, setNovSearch] = useState('');
    const [novDocente, setNovDocente] = useState('ALL');
    const [novArea, setNovArea] = useState('ALL');
    const [novFechaDesde, setNovFechaDesde] = useState('');
    const [novFechaHasta, setNovFechaHasta] = useState('');
    const [novEvidencia, setNovEvidencia] = useState('ALL'); // ALL | yes | no
    const [novPage, setNovPage] = useState(1);
    const [reportPage, setReportPage] = useState(1);
    
    // Map & Live Tracking States
    const [selectedMapTeacher, setSelectedMapTeacher] = useState('ALL');
    const [selectedMapZone, setSelectedMapZone] = useState('ALL');
    const [mapTimeframe, setMapTimeframe] = useState('today'); // 'today', 'all', 'last10'
    const [registrosSearch, setRegistrosSearch] = useState('');
    
    const mapRef = useRef(null);
    const markerRefs = useRef({});
    const activeLayersRef = useRef([]);
    const lastFiltersRef = useRef('');
    const shouldFitRef = useRef(true);

    // Notif State
    const [notifTarget, setNotifTarget] = useState('ALL'); // 'ALL', 'DOCENTE', 'DIRECTOR', 'INDIVIDUAL'
    const [selectedUser, setSelectedUser] = useState('');
    const [notifMsg, setNotifMsg] = useState('');
    const [comunicadosEnviados, setComunicadosEnviados] = useState([]);
    const [loadingComunicadosEnviados, setLoadingComunicadosEnviados] = useState(false);
    const [comunicadosPage, setComunicadosPage] = useState(1);

    const fetchData = async () => {
        try {
            const regsData = await getRegistros();
            const zonesData = await getZonas();
            const novsData = await getNovedades();

            setNovedades(novsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
            setZones(zonesData);
            setRegistros(regsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
            setKpis({
                totalRegistros: regsData.length,
                zonasActivas: zonesData.length,
                totalNovedades: novsData.length
            });

            if (view === 'notif' || view === 'reports' || view === 'registros' || view === 'kpis' || view === 'novedades_list') {
                const usersData = await getUsuarios();
                setUsers(usersData);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    useEffect(() => {
        fetchData();
        if (view === 'notif' && !readOnly) {
            fetchComunicadosEnviados();
        }
        if (view === 'registros') {
            const interval = setInterval(() => {
                fetchData();
            }, 12000);
            return () => clearInterval(interval);
        }
    }, [view, readOnly]);

    const fetchComunicadosEnviados = async () => {
        setLoadingComunicadosEnviados(true);
        try {
            const data = await getComunicadosEnviados();
            setComunicadosEnviados(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching comunicados enviados:', error);
            Swal.fire('Error', 'No se pudo cargar el historial de comunicados.', 'error');
        } finally {
            setLoadingComunicadosEnviados(false);
        }
    };

    const getTeacherColor = (name) => {
        if (!name) return '#7F8C8D';
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 75%, 45%)`;
    };

    const focusOnMarker = (regId, lat, lng) => {
        const map = mapRef.current;
        const marker = markerRefs.current[regId];
        if (map && marker) {
            map.setView([parseFloat(lat), parseFloat(lng)], 17);
            marker.openPopup();
        } else if (map && lat && lng) {
            map.setView([parseFloat(lat), parseFloat(lng)], 17);
        }
    };

    useEffect(() => {
        if (view !== 'registros') {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
            return;
        }

        // Wait a small moment for container rendering
        const timer = setTimeout(() => {
            const mapDiv = document.getElementById('map-director');
            if (!mapDiv) return;

            if (!window.L) {
                console.error('Leaflet is not loaded on the window object');
                return;
            }

            const L = window.L;

            // Init map only ONCE
            let map = mapRef.current;
            if (!map) {
                map = L.map('map-director', {
                    zoomControl: true,
                    fadeAnimation: true
                });
                mapRef.current = map;

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(map);
            }

            // Remove existing layers that we added in previous updates
            if (activeLayersRef.current) {
                activeLayersRef.current.forEach(layer => map.removeLayer(layer));
            }
            activeLayersRef.current = [];
            markerRefs.current = {};

            // Draw Zones (solo la seleccionada si hay filtro)
            const selectedZone = selectedMapZone === 'ALL'
                ? null
                : zones.find((z) => String(z.id) === String(selectedMapZone)) || null;
            const zonesToDraw = selectedZone ? [selectedZone] : zones;

            zonesToDraw.forEach(z => {
                if (z.latitud && z.longitud && parseFloat(z.latitud) !== 0) {
                    const zoneCircle = L.circle([parseFloat(z.latitud), parseFloat(z.longitud)], {
                        color: '#0D0D0D',
                        fillColor: '#424242',
                        fillOpacity: selectedZone ? 0.25 : 0.15,
                        weight: selectedZone ? 3 : 2,
                        dashArray: '5, 5',
                        radius: ZONE_RADIUS_M
                    }).addTo(map);
                    
                    zoneCircle.bindPopup(`
                        <div style="font-family:'Montserrat', sans-serif; font-size:12px;">
                            <b style="color:var(--color-blue-dark); font-size:13px;">Zona: ${z.nombre || z.alias}</b><br/>
                            <b>Alias:</b> ${z.alias}<br/>
                            <b>Tipo:</b> ${z.tipo}<br/>
                            <b>Horario:</b> ${z.horario}
                        </div>
                    `);
                    
                    activeLayersRef.current.push(zoneCircle);
                }
            });

            // Filter records for map based on controls
            const todayStr = new Date().toISOString().split('T')[0];
            let mapRegs = registros.filter(r => r.latitud && r.longitud && parseFloat(r.latitud) !== 0);

            if (selectedMapTeacher !== 'ALL') {
                mapRegs = mapRegs.filter(r => r.usuarioNombre === selectedMapTeacher);
            }
            if (selectedZone) {
                mapRegs = mapRegs.filter(r =>
                    String(r.zonaId) === String(selectedZone.id) || r.zonaAlias === selectedZone.alias
                );
            }

            if (mapTimeframe === 'today') {
                mapRegs = mapRegs.filter(r => r.timestamp && r.timestamp.startsWith(todayStr));
            } else if (mapTimeframe === 'last10') {
                mapRegs = mapRegs.slice(0, 10);
            }

            const markerList = [];

            // Draw scanning records
            mapRegs.forEach(r => {
                const lat = parseFloat(r.latitud);
                const lng = parseFloat(r.longitud);
                const color = getTeacherColor(r.usuarioNombre);

                const marker = L.circleMarker([lat, lng], {
                    radius: 8,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 2.5,
                    opacity: 1,
                    fillOpacity: 0.9,
                    className: 'map-pulse-marker'
                }).addTo(map);

                const dateStr = new Date(r.timestamp).toLocaleString();
                marker.bindPopup(`
                    <div style="font-family:'Montserrat', sans-serif; font-size:12px; min-width:180px;">
                        <b style="color:${color}; font-size:14px; display:block; margin-bottom:5px;">${r.usuarioNombre}</b>
                        <b>Zona:</b> ${r.zonaAlias || 'N/A'}<br/>
                        <b>Fecha/Hora:</b> ${dateStr}<br/>
                        <b>Distancia:</b> ${r.distancia || 0} m
                    </div>
                `);

                markerRefs.current[r.id] = marker;
                markerList.push(marker);
                activeLayersRef.current.push(marker);
            });

            // Draw live teacher locations from GPS updates
            const liveTeachers = users.filter(u =>
                (u.rol === 'DOCENTE' || u.rol === 'JEFE DE AREA') &&
                u.latitud_actual && u.longitud_actual &&
                parseFloat(u.latitud_actual) !== 0 &&
                parseFloat(u.longitud_actual) !== 0 &&
                isGpsFresh(u.actualizado_gps)
            );

            let filteredLiveTeachers = liveTeachers;
            if (selectedMapTeacher !== 'ALL') {
                filteredLiveTeachers = liveTeachers.filter(u => u.nombre === selectedMapTeacher);
            }
            if (selectedZone) {
                filteredLiveTeachers = filteredLiveTeachers.filter((u) => {
                    const lat = parseFloat(u.latitud_actual);
                    const lng = parseFloat(u.longitud_actual);
                    const inside = getDistance(
                        lat, lng,
                        parseFloat(selectedZone.latitud),
                        parseFloat(selectedZone.longitud)
                    ) <= ZONE_RADIUS_M;
                    if (inside) return true;
                    const latestScan = registros.find((r) => r.usuarioNombre === u.nombre);
                    return latestScan && (
                        String(latestScan.zonaId) === String(selectedZone.id) ||
                        latestScan.zonaAlias === selectedZone.alias
                    );
                });
            }

            filteredLiveTeachers.forEach(u => {
                const lat = parseFloat(u.latitud_actual);
                const lng = parseFloat(u.longitud_actual);
                const color = getTeacherColor(u.nombre);
                const initials = u.nombre ? u.nombre.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() : '??';
                
                const isFresh = isGpsFresh(u.actualizado_gps);
                const statusColor = isFresh ? '#2ecc71' : '#95a5a6';
                const statusLabel = isFresh ? 'EN VIVO' : 'ÚLTIMA UBICACIÓN';
                const timeStr = u.actualizado_gps ? new Date(u.actualizado_gps).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

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

                const marker = L.marker([lat, lng], { icon: liveIcon }).addTo(map);

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

                // Store in markerRefs with a prefix
                markerRefs.current['live-' + u.documento] = marker;
                markerList.push(marker);
                activeLayersRef.current.push(marker);
            });

            // Draw route line if a specific teacher is selected
            if (selectedMapTeacher !== 'ALL' && mapRegs.length > 1) {
                // Sort chronologically (oldest to newest) to draw path
                const chronologicalRegs = [...mapRegs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const pathPoints = chronologicalRegs.map(r => [parseFloat(r.latitud), parseFloat(r.longitud)]);
                
                const routePolyline = L.polyline(pathPoints, {
                    color: getTeacherColor(selectedMapTeacher),
                    weight: 3,
                    opacity: 0.6,
                    dashArray: '5, 8',
                    smoothFactor: 1
                }).addTo(map);

                activeLayersRef.current.push(routePolyline);
            }

            // Check if selected filters actually changed to trigger fitBounds
            const currentFilters = `${selectedMapTeacher}-${selectedMapZone}-${mapTimeframe}-${view}`;
            const filtersChanged = lastFiltersRef.current !== currentFilters;
            if (filtersChanged) {
                lastFiltersRef.current = currentFilters;
                shouldFitRef.current = true;
            }

            // Adjust view bounds (only if filter changed or on initial load)
            if (shouldFitRef.current) {
                if (markerList.length > 0) {
                    const group = new L.featureGroup(markerList);
                    map.fitBounds(group.getBounds().pad(0.15));
                } else if (selectedZone?.latitud && selectedZone?.longitud && parseFloat(selectedZone.latitud) !== 0) {
                    map.setView([parseFloat(selectedZone.latitud), parseFloat(selectedZone.longitud)], 18);
                } else {
                    const zoneCoords = zones
                        .filter(z => z.latitud && z.longitud && parseFloat(z.latitud) !== 0)
                        .map(z => [parseFloat(z.latitud), parseFloat(z.longitud)]);
                    
                    if (zoneCoords.length > 0) {
                        map.fitBounds(L.latLngBounds(zoneCoords).pad(0.15));
                    } else {
                        map.setView([4.8029538364668145, -74.04472357063082], 17); // Colegio Nueva York, Calle 227 #49-64, Bogotá
                    }
                }
                shouldFitRef.current = false;
            }

            setTimeout(() => map.invalidateSize(), 50);
            setTimeout(() => map.invalidateSize(), 200);
            setTimeout(() => map.invalidateSize(), 500);
        }, 100);

        return () => {
            clearTimeout(timer);
            // Notice: we do NOT destroy the map on HMR or every hook update, 
            // but we do clean up when view is changing away from 'registros'
        };
    }, [view, registros, zones, users, selectedMapTeacher, selectedMapZone, mapTimeframe]);

    const downloadCSV = (data, title) => {
        if (!data?.length) {
            Swal.fire('Sin datos', 'No hay registros para exportar con el filtro actual.', 'info');
            return;
        }
        const rows = data.map((item) => {
            const zone = zones.find((z) => z.id === item.zonaId || z.alias === item.zonaAlias);
            const dt = formatDateTimeForExcel(item.timestamp);
            return {
                Fecha: dt.split(' ')[0] || '',
                Hora: dt.split(' ')[1] || '',
                Docente: item.usuarioNombre || '',
                Documento: item.usuarioId || '',
                Zona: zone?.nombre || item.zonaAlias || '',
                Alias_Zona: item.zonaAlias || '',
                Tipo_Jornada: zone?.tipo || '',
                Distancia_m: item.distancia ?? '',
                Latitud: item.latitud ?? '',
                Longitud: item.longitud ?? ''
            };
        });
        downloadExcelCsv(rows, `${title}_${new Date().toISOString().slice(0, 10)}`);
    };

    const downloadPDF = (data, title) => {
        if (!data?.length) {
            Swal.fire('Sin datos', 'No hay registros para exportar con el filtro actual.', 'info');
            return;
        }
        const rows = data.map((item) => {
            const zone = zones.find((z) => z.id === item.zonaId || z.alias === item.zonaAlias);
            const dt = formatDateTimeForExcel(item.timestamp);
            return {
                Fecha: dt.split(' ')[0] || '',
                Hora: dt.split(' ')[1] || '',
                Docente: item.usuarioNombre || '',
                Zona: zone?.nombre || item.zonaAlias || '',
                Tipo: zone?.tipo || '',
                Distancia_m: item.distancia ?? ''
            };
        });
        downloadPdfTable(rows, `${title}_${new Date().toISOString().slice(0, 10)}`, {
            title: 'Reporte de Vigilancias',
            subtitle: `Generado ${formatDateTimeForExcel(new Date())}`
        });
    };

    const sendNotif = async () => {
        if (!notifMsg) return Swal.fire('Error', 'Escribe un mensaje', 'warning');
        if (readOnly) return Swal.fire('Acceso restringido', 'El Asistente solo puede consultar información.', 'info');
        const destinatario = resolveComunicadoDestinatario(notifTarget, selectedUser);
        if (notifTarget === 'INDIVIDUAL' && !destinatario) {
            return Swal.fire('Atención', 'Seleccione el usuario destinatario.', 'warning');
        }

        Swal.fire({ title: 'Enviando...', didOpen: () => Swal.showLoading() });
        try {
            const session = JSON.parse(localStorage.getItem('usuario_cny_2026'));
            const adminUser = session?.datos;

            await createComunicado({
                mensaje: notifMsg,
                emisor: adminUser?.nombre || 'Director',
                destinatario
            });

            setNotifMsg('');
            setNotifTarget('ALL');
            setSelectedUser('');
            setComunicadosPage(1);
            await fetchComunicadosEnviados();
            Swal.fire('Enviado', 'Notificación comunicada con éxito', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudo enviar', 'error');
        }
    };

    const renderMain = () => (
        <div className="page-content">
            <div className="admin-kpi-grid kpi-2">
                <div className="admin-kpi-card registros">
                    <h2 className="admin-kpi-value">{kpis.totalRegistros}</h2>
                    <span className="admin-kpi-label">Vigilancias Totales</span>
                </div>
                <div className="admin-kpi-card zonas">
                    <h2 className="admin-kpi-value">{kpis.totalNovedades}</h2>
                    <span className="admin-kpi-label">Novedades Reportadas</span>
                </div>
            </div>

            <div className="card page-panel">
                <h3 style={{ 
                    color: 'var(--color-blue-dark)', 
                    marginBottom: '20px', 
                    textAlign: 'center', 
                    fontWeight: '800', 
                    fontSize: 'clamp(16px, 2.4vw, 22px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    letterSpacing: '0.5px',
                    flexWrap: 'wrap'
                }}>
                    <i className="fas fa-shield-alt" style={{ color: 'var(--color-green-primary)', fontSize: '24px' }}></i>
                    {readOnly ? 'Panel de Asistente — Supervisión' : 'Gestión Institucional CNY PREESCOLAR'}
                </h3>

                <div className="director-card-grid">
                    <div className="admin-action-card kpis" onClick={() => setView('reports')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-chart-bar"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Reportes Detallados</h4>
                            <p className="card-desc">Estadísticas de control, rondas y reportes consolidados.</p>
                        </div>
                    </div>

                    <div className="admin-action-card logs" onClick={() => setView('cumplimiento')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-user-check"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Cumplimiento de Vigilancias</h4>
                            <p className="card-desc">Informe de docentes que sí o no realizaron su ronda.</p>
                        </div>
                    </div>

                    <div className="admin-action-card comunicado" onClick={() => setView('live')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-eye"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Supervisión en Vivo</h4>
                            <p className="card-desc">Mapa y GPS en tiempo real del personal en ronda.</p>
                        </div>
                    </div>

                    <div className="admin-action-card backup" onClick={() => setView('novedades_list')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-camera"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Ver Novedades/Fotos</h4>
                            <p className="card-desc">Consultar reportes y fotos tomadas en los turnos.</p>
                        </div>
                    </div>

                    <div className="admin-action-card zonas" onClick={() => setView('historial')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-history"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Historial General</h4>
                            <p className="card-desc">Bitácora histórica de todas las rondas realizadas.</p>
                        </div>
                    </div>

                    {!readOnly && (
                    <div className="admin-action-card horarios" onClick={() => setView('notif')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-paper-plane"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Notificaciones</h4>
                            <p className="card-desc">Enviar comunicados y consultar el historial de enviados.</p>
                        </div>
                    </div>
                    )}

                    <div className="admin-action-card config" onClick={() => setView('kpis')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-tachometer-alt"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Resumen KPIs</h4>
                            <p className="card-desc">Métricas consolidadas de rendimiento escolar.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderReportsUI = () => {
        const dayKey = (ts) => {
            const d = new Date(ts);
            if (Number.isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
        };

        const filteredRegs = registros.filter((r) => {
            const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
            const zoneName = zone?.nombre || r.zonaAlias || '';
            const zoneTipo = zone?.tipo || 'OTRO';
            const term = reportFilter.trim().toLowerCase();
            const matchesSearch = !term
                || r.usuarioNombre?.toLowerCase().includes(term)
                || zoneName.toLowerCase().includes(term)
                || r.zonaAlias?.toLowerCase().includes(term)
                || String(r.usuarioId || '').toLowerCase().includes(term);
            const matchesTeacher = selectedTeacherId === 'ALL'
                || r.usuarioId === selectedTeacherId
                || r.usuarioNombre === selectedTeacherId;
            const matchesZone = reportZoneId === 'ALL'
                || String(r.zonaId) === String(reportZoneId)
                || r.zonaAlias === zones.find((z) => String(z.id) === String(reportZoneId))?.alias;
            const matchesTipo = reportTipo === 'ALL' || zoneTipo === reportTipo
                || (reportTipo === 'OTRO' && !['SNACK', 'LUNCH'].includes(zoneTipo));
            const key = dayKey(r.timestamp);
            const matchesDesde = !reportFechaDesde || (key && key >= reportFechaDesde);
            const matchesHasta = !reportFechaHasta || (key && key <= reportFechaHasta);
            return matchesSearch && matchesTeacher && matchesZone && matchesTipo && matchesDesde && matchesHasta;
        });

        const teacherNovelties = novedades.filter((n) => {
            const matchesTeacher = selectedTeacherId === 'ALL'
                || n.usuarioId === selectedTeacherId
                || n.usuarioNombre === selectedTeacherId;
            if (!matchesTeacher) return false;
            const key = dayKey(n.timestamp);
            if (reportFechaDesde && key && key < reportFechaDesde) return false;
            if (reportFechaHasta && key && key > reportFechaHasta) return false;
            return true;
        });

        const hasReportFilters = Boolean(reportFilter.trim())
            || selectedTeacherId !== 'ALL'
            || reportZoneId !== 'ALL'
            || reportTipo !== 'ALL'
            || Boolean(reportFechaDesde)
            || Boolean(reportFechaHasta);

        const reportPager = slicePage(filteredRegs, reportPage, 10);
        const pageReportRegs = reportPager.pageItems;

        // Data processing
        const countsByTeacher = {};
        const countsByZone = {};
        const hourlyDist = new Array(24).fill(0);

        filteredRegs.forEach(r => {
            countsByTeacher[r.usuarioNombre] = (countsByTeacher[r.usuarioNombre] || 0) + 1;
            const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
            const zoneName = zone?.nombre || r.zonaAlias || 'Desc';
            countsByZone[zoneName] = (countsByZone[zoneName] || 0) + 1;
            const hour = new Date(r.timestamp).getHours();
            hourlyDist[hour]++;
        });

        // Sort teacher entries descending
        const sortedTeacherEntries = Object.entries(countsByTeacher).sort((a, b) => b[1] - a[1]);
        const sortedTeachers = sortedTeacherEntries.map(e => e[0]);
        const sortedTeacherCounts = sortedTeacherEntries.map(e => e[1]);

        const teacherChartData = {
            labels: sortedTeachers,
            datasets: [{
                label: 'Vigilancias',
                data: sortedTeacherCounts,
                backgroundColor: 'rgba(0, 162, 255, 0.2)',
                borderColor: '#00a2ff',
                borderWidth: 2,
                borderRadius: 6
            }]
        };

        const zoneChartData = {
            labels: Object.keys(countsByZone),
            datasets: [{
                data: Object.values(countsByZone),
                backgroundColor: ['#0077c2', '#00a2ff', '#3A5F95', '#4A6FA5', '#F39C12', '#9B59B6', '#E74C3C'],
                borderWidth: 0
            }]
        };

        const timeData = {
            labels: Array.from({ length: 13 }, (_, i) => `${i + 6}:00`),
            datasets: [{
                label: 'Distribución por Hora',
                data: hourlyDist.slice(6, 19),
                fill: true,
                backgroundColor: 'rgba(0, 162, 255, 0.08)',
                borderColor: '#00a2ff',
                borderWidth: 3,
                tension: 0.4,
                pointBackgroundColor: '#0077c2',
                pointHoverRadius: 6
            }]
        };

        const reportsChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: { size: 13, family: 'Montserrat', weight: '700' },
                    bodyFont: { size: 12, family: 'Montserrat' },
                    borderRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Montserrat', size: 11, weight: '600' }, color: '#64748b' }
                },
                y: {
                    grid: { color: '#e2e8f0' },
                    ticks: { font: { family: 'Montserrat', size: 11, weight: '600' }, color: '#64748b' }
                }
            }
        };

        const reportsDoughnutOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        font: { family: 'Montserrat', size: 10, weight: '600' },
                        color: '#475569',
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: { size: 13, family: 'Montserrat', weight: '700' },
                    bodyFont: { size: 12, family: 'Montserrat' },
                    borderRadius: 8
                }
            }
        };

        const filterInputStyle = {
            padding: '12px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            width: '100%',
            background: '#f8fafc',
            fontSize: '14px',
            fontWeight: '600',
            color: '#475569',
            outline: 'none',
            textAlign: 'left',
            margin: 0
        };

        return (
            <div className="page-content">
                <div className="page-toolbar">
                    <div className="page-toolbar-start">
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                            <i className="fas fa-arrow-left"></i> Volver al Inicio
                        </button>
                        <div>
                            <h2>Dashboard de Reportes</h2>
                            <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                                {filteredRegs.length} vigilancia(s) · Análisis de cobertura e incidencias
                            </p>
                        </div>
                    </div>
                    <div className="page-toolbar-actions">
                        <button className="btn btn-green" onClick={() => downloadCSV(filteredRegs, 'Reporte_Vigilancias')} style={{ margin: 0, width: 'auto', padding: '10px 16px', borderRadius: '12px' }}>
                            <i className="fas fa-file-csv"></i> CSV
                        </button>
                        <button className="btn btn-dark" onClick={() => downloadPDF(filteredRegs, 'Reporte_Vigilancias')} style={{ margin: 0, width: 'auto', padding: '10px 16px', borderRadius: '12px' }}>
                            <i className="fas fa-file-pdf"></i> PDF
                        </button>
                    </div>
                </div>

                <div className="card" style={{ margin: 0, padding: '16px', textAlign: 'left' }}>
                    <div className="filters-grid">
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                <i className="fas fa-search"></i> Buscar
                            </label>
                            <input
                                type="text"
                                placeholder="Docente, documento o zona..."
                                value={reportFilter}
                                onChange={(e) => { setReportFilter(e.target.value); setReportPage(1); }}
                                style={filterInputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                Docente
                            </label>
                            <select
                                value={selectedTeacherId}
                                onChange={(e) => { setSelectedTeacherId(e.target.value); setReportPage(1); }}
                                style={filterInputStyle}
                            >
                                <option value="ALL">Todo el personal</option>
                                {users.filter(u => u.rol === 'DOCENTE' || u.rol === 'JEFE DE AREA').sort((a, b) => a.nombre.localeCompare(b.nombre)).map(u => (
                                    <option key={u.documento || u.id} value={u.nombre}>{u.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                Zona
                            </label>
                            <select value={reportZoneId} onChange={(e) => { setReportZoneId(e.target.value); setReportPage(1); }} style={filterInputStyle}>
                                <option value="ALL">Todas las zonas</option>
                                {[...zones].sort((a, b) => (a.nombre || a.alias || '').localeCompare(b.nombre || b.alias || '')).map((z) => (
                                    <option key={z.id} value={String(z.id)}>{z.nombre || z.alias}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                Tipo jornada
                            </label>
                            <select value={reportTipo} onChange={(e) => { setReportTipo(e.target.value); setReportPage(1); }} style={filterInputStyle}>
                                <option value="ALL">Todos</option>
                                <option value="SNACK">SNACK</option>
                                <option value="LUNCH">LUNCH</option>
                                <option value="OTRO">OTRO</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                Desde
                            </label>
                            <input type="date" value={reportFechaDesde} max={reportFechaHasta || undefined} onChange={(e) => { setReportFechaDesde(e.target.value); setReportPage(1); }} style={filterInputStyle} />
                        </div>
                        <div>
                            <label style={{ fontWeight: '700', fontSize: '12px', color: 'var(--color-blue-dark)', marginBottom: '6px', display: 'block' }}>
                                Hasta
                            </label>
                            <input type="date" value={reportFechaHasta} min={reportFechaDesde || undefined} onChange={(e) => { setReportFechaHasta(e.target.value); setReportPage(1); }} style={filterInputStyle} />
                        </div>
                        <div>
                            <button
                                type="button"
                                className="btn btn-back"
                                disabled={!hasReportFilters}
                                onClick={() => {
                                    setReportFilter('');
                                    setSelectedTeacherId('ALL');
                                    setReportZoneId('ALL');
                                    setReportTipo('ALL');
                                    setReportFechaDesde('');
                                    setReportFechaHasta('');
                                    setReportPage(1);
                                }}
                                style={{ margin: 0, width: '100%', padding: '12px 15px' }}
                            >
                                <i className="fas fa-filter-circle-xmark"></i> Limpiar
                            </button>
                        </div>
                    </div>
                </div>

                <div className="charts-grid">
                    <div className="card chart-card" style={{ margin: 0, padding: '16px' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '12px', fontSize: '15px', fontWeight: '800' }}>
                            <i className="fas fa-chart-pie"></i> {selectedTeacherId === 'ALL' ? 'Cumplimiento por Docente' : `Actividad de ${selectedTeacherId} por Zona`}
                        </h3>
                        <div className="chart-canvas">
                            {selectedTeacherId === 'ALL' ? (
                                <Bar data={teacherChartData} options={{ ...reportsChartOptions, indexAxis: 'y' }} />
                            ) : (
                                <Doughnut data={zoneChartData} options={reportsDoughnutOptions} />
                            )}
                        </div>
                    </div>

                    <div className="card chart-card" style={{ margin: 0, padding: '16px' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '12px', fontSize: '15px', fontWeight: '800' }}>
                            <i className="fas fa-chart-line"></i> Distribución de Horas Laborales
                        </h3>
                        <div className="chart-canvas">
                            <Line data={timeData} options={reportsChartOptions} />
                        </div>
                    </div>
                </div>

                <div className="charts-grid">
                    {selectedTeacherId !== 'ALL' && (
                        <div className="card" style={{ margin: 0, padding: '25px', background: 'white', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', textAlign: 'left' }}>
                            <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '15px', fontSize: '16px', fontWeight: '800' }}>
                                <i className="fas fa-history"></i> Historial de Novedades del Docente
                            </h3>
                            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {teacherNovelties.length === 0 ? (
                                    <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
                                        No hay novedades reportadas por este docente.
                                    </p>
                                ) : (
                                    teacherNovelties.map(n => (
                                        <div key={n.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                                <span style={{ fontWeight: '700', color: 'var(--color-blue-dark)' }}>{n.area}</span>
                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>{new Date(n.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{n.detalle}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ margin: 0, padding: '25px', background: 'white', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', textAlign: 'left' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '15px', fontSize: '16px', fontWeight: '800' }}>
                            <i className="fas fa-calculator"></i> KPIs de Rendimiento {selectedTeacherId !== 'ALL' ? `(${selectedTeacherId})` : ''}
                        </h3>
                        <div className="split-2">
                            <div style={{ 
                                background: 'linear-gradient(135deg, #0077c2, #00a2ff)', 
                                padding: '25px 20px', 
                                borderRadius: '15px', 
                                textAlign: 'center',
                                color: 'white',
                                boxShadow: '0 4px 15px rgba(0, 119, 194, 0.15)'
                            }}>
                                <div style={{ fontSize: '32px', fontWeight: '900' }}>{filteredRegs.length}</div>
                                <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '5px' }}>Vigilancias</div>
                            </div>
                            <div style={{ 
                                background: 'linear-gradient(135deg, #e74c3c, #ec7063)', 
                                padding: '25px 20px', 
                                borderRadius: '15px', 
                                textAlign: 'center',
                                color: 'white',
                                boxShadow: '0 4px 15px rgba(231, 76, 60, 0.15)'
                            }}>
                                <div style={{ fontSize: '32px', fontWeight: '900' }}>{teacherNovelties.length}</div>
                                <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '5px' }}>Incidencias</div>
                            </div>
                        </div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '16px', textAlign: 'center', fontWeight: '600' }}>
                            Sistema de vigilancias CNY · 2026
                        </p>
                    </div>
                </div>

                <div className="card" style={{ margin: 0, padding: '25px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '16px', fontWeight: '800' }}>
                                <i className="fas fa-table"></i> Detalle del reporte
                            </h3>
                            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                                {reportPager.total
                                    ? `${reportPager.from}–${reportPager.to} de ${reportPager.total} vigilancia(s) según filtros`
                                    : '0 vigilancias según filtros'}
                            </p>
                        </div>
                    </div>
                    <div className="table-container" style={{ maxHeight: '420px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <table className="mini-table" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Fecha</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Hora</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Docente</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Zona</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Jornada</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Distancia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRegs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontWeight: '600' }}>
                                            No hay vigilancias con los filtros actuales.
                                        </td>
                                    </tr>
                                ) : (
                                    pageReportRegs.map((r) => {
                                        const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                                        const dt = formatDateTimeForExcel(r.timestamp);
                                        return (
                                            <tr key={r.id}>
                                                <td style={{ padding: '10px 15px' }}>{dt.split(' ')[0]}</td>
                                                <td style={{ padding: '10px 15px', fontWeight: '600' }}>{dt.split(' ')[1]}</td>
                                                <td style={{ padding: '10px 15px', fontWeight: '700' }}>{r.usuarioNombre}</td>
                                                <td style={{ padding: '10px 15px', color: 'var(--color-blue-dark)', fontWeight: '600' }}>
                                                    {zone?.nombre || r.zonaAlias || '—'}
                                                </td>
                                                <td style={{ padding: '10px 15px' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '10px',
                                                        fontWeight: 'bold',
                                                        background: zone?.tipo === 'SNACK' ? '#2ecc71' : zone?.tipo === 'LUNCH' ? '#3498db' : '#7f8c8d',
                                                        color: 'white'
                                                    }}>
                                                        {zone?.tipo || 'ORDINARIA'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 15px' }}>{r.distancia != null ? `${r.distancia} m` : '—'}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationBar
                        page={reportPager.page}
                        totalPages={reportPager.totalPages}
                        total={reportPager.total}
                        from={reportPager.from}
                        to={reportPager.to}
                        onPrev={() => setReportPage((p) => Math.max(1, p - 1))}
                        onNext={() => setReportPage((p) => Math.min(reportPager.totalPages, p + 1))}
                    />
                </div>
            </div>
        );
    };

    const renderNovedadesList = () => {
        const dayKey = (ts) => {
            const d = new Date(ts);
            if (Number.isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
        };
        const areas = [...new Set(novedades.map((n) => n.area).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const docentes = [...new Set(novedades.map((n) => n.usuarioNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const term = novSearch.trim().toLowerCase();
        const filteredNovs = novedades.filter((nov) => {
            const matchesSearch = !term
                || (nov.usuarioNombre || '').toLowerCase().includes(term)
                || (nov.detalle || '').toLowerCase().includes(term)
                || (nov.area || '').toLowerCase().includes(term)
                || (nov.tipo || '').toLowerCase().includes(term)
                || String(nov.usuarioId || '').toLowerCase().includes(term);
            const matchesDocente = novDocente === 'ALL' || nov.usuarioNombre === novDocente;
            const matchesArea = novArea === 'ALL' || nov.area === novArea;
            const key = dayKey(nov.timestamp);
            const matchesDesde = !novFechaDesde || (key && key >= novFechaDesde);
            const matchesHasta = !novFechaHasta || (key && key <= novFechaHasta);
            const hasMedia = Boolean(nov.mediaUrl);
            const matchesEvidencia = novEvidencia === 'ALL'
                || (novEvidencia === 'yes' && hasMedia)
                || (novEvidencia === 'no' && !hasMedia);
            return matchesSearch && matchesDocente && matchesArea && matchesDesde && matchesHasta && matchesEvidencia;
        });
        const hasNovFilters = Boolean(term)
            || novDocente !== 'ALL'
            || novArea !== 'ALL'
            || Boolean(novFechaDesde)
            || Boolean(novFechaHasta)
            || novEvidencia !== 'ALL';
        const pageSize = 5;
        const novPager = slicePage(filteredNovs, novPage, pageSize);
        const pageItems = novPager.pageItems;
        const safePage = novPager.page;
        const totalPages = novPager.totalPages;
        const filterStyle = {
            padding: '8px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            width: '100%',
            background: '#f8fafc',
            fontSize: '12px',
            margin: 0
        };
        const openEvidence = (url) => {
            if (!url) return;
            Swal.fire({
                imageUrl: url,
                imageAlt: 'Evidencia',
                width: Math.min(720, window.innerWidth - 40),
                showConfirmButton: true,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#212121'
            });
        };
        const clearFilters = () => {
            setNovSearch('');
            setNovDocente('ALL');
            setNovArea('ALL');
            setNovFechaDesde('');
            setNovFechaHasta('');
            setNovEvidencia('ALL');
            setNovPage(1);
        };

        return (
        <div className="page-content">
            <div className="page-toolbar">
                <div className="page-toolbar-start">
                <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                    <i className="fas fa-arrow-left"></i> Volver
                </button>
                <div>
                    <h2>Novedades y Evidencias</h2>
                    <small style={{ color: '#64748b', fontWeight: '600' }}>
                        {filteredNovs.length} de {novedades.length}
                        {filteredNovs.length > 0 ? ` · Mostrando ${pageItems.length} (pág. ${safePage}/${totalPages})` : ''}
                    </small>
                </div>
                </div>
            </div>

            <div className="card" style={{ width: '100%', textAlign: 'left', padding: '16px', margin: 0 }}>
                <div className="filters-grid">
                    <div style={{ gridColumn: '1 / -1' }}>
                        <input
                            type="text"
                            placeholder="Buscar autor, detalle, área o tipo..."
                            value={novSearch}
                            onChange={(e) => { setNovSearch(e.target.value); setNovPage(1); }}
                            style={filterStyle}
                            aria-label="Buscar novedades"
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '3px' }}>Docente</label>
                        <select value={novDocente} onChange={(e) => { setNovDocente(e.target.value); setNovPage(1); }} style={filterStyle}>
                            <option value="ALL">Todos</option>
                            {docentes.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '3px' }}>Área</label>
                        <select value={novArea} onChange={(e) => { setNovArea(e.target.value); setNovPage(1); }} style={filterStyle}>
                            <option value="ALL">Todas</option>
                            {areas.map((area) => <option key={area} value={area}>{area}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '3px' }}>Evidencia</label>
                        <select value={novEvidencia} onChange={(e) => { setNovEvidencia(e.target.value); setNovPage(1); }} style={filterStyle}>
                            <option value="ALL">Todas</option>
                            <option value="yes">Con foto</option>
                            <option value="no">Sin foto</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '3px' }}>Desde</label>
                        <input type="date" value={novFechaDesde} max={novFechaHasta || undefined} onChange={(e) => { setNovFechaDesde(e.target.value); setNovPage(1); }} style={filterStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '3px' }}>Hasta</label>
                        <input type="date" value={novFechaHasta} min={novFechaDesde || undefined} onChange={(e) => { setNovFechaHasta(e.target.value); setNovPage(1); }} style={filterStyle} />
                    </div>
                    <div>
                        <button type="button" className="btn btn-back" disabled={!hasNovFilters} onClick={clearFilters} style={{ margin: 0, width: '100%', padding: '8px 10px', fontSize: '12px' }}>
                            <i className="fas fa-filter-circle-xmark"></i> Limpiar
                        </button>
                    </div>
                </div>
            </div>

            <div className="card" style={{ width: '100%', textAlign: 'left', padding: '14px 16px', margin: 0, minHeight: '160px' }}>
                {filteredNovs.length === 0 ? (
                    <p style={{ margin: '24px 0', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>
                        No hay novedades con los filtros actuales.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {pageItems.map((nov) => (
                    <div
                        key={nov.id}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: nov.mediaUrl ? '80px 1fr' : '1fr',
                            gap: '12px',
                            alignItems: 'start',
                            padding: '10px',
                            border: '1px solid #eef2f7',
                            borderRadius: '12px',
                            background: '#fafbfc'
                        }}
                    >
                        {nov.mediaUrl && (
                            <button
                                type="button"
                                onClick={() => openEvidence(nov.mediaUrl)}
                                title="Ver evidencia ampliada"
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    padding: 0,
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    background: '#0f172a',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                }}
                            >
                                <img
                                    src={nov.mediaUrl}
                                    alt="Evidencia"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                            </button>
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                <strong style={{ color: 'var(--color-blue-dark)', fontSize: '13px' }}>{nov.usuarioNombre || 'Sin autor'}</strong>
                                <small style={{ color: '#94a3b8', fontWeight: '600' }}>{new Date(nov.timestamp).toLocaleString()}</small>
                            </div>
                            <p style={{
                                margin: '0 0 8px 0',
                                fontSize: '13px',
                                color: '#334155',
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {nov.detalle}
                            </p>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span className="badge badge-orange" style={{ fontSize: '10px' }}>Área: {nov.area || 'General'}</span>
                                {nov.tipo && (
                                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '999px' }}>
                                        {nov.tipo}
                                    </span>
                                )}
                                {nov.mediaUrl && (
                                    <button
                                        type="button"
                                        className="btn btn-dark"
                                        onClick={() => openEvidence(nov.mediaUrl)}
                                        style={{ margin: 0, width: 'auto', padding: '3px 8px', fontSize: '10px' }}
                                    >
                                        <i className="fas fa-expand"></i> Ver foto
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                        ))}
                    </div>
                )}

                {novPager.total > pageSize && (
                    <PaginationBar
                        page={novPager.page}
                        totalPages={novPager.totalPages}
                        total={novPager.total}
                        from={novPager.from}
                        to={novPager.to}
                        label="novedades"
                        onPrev={() => setNovPage((p) => Math.max(1, p - 1))}
                        onNext={() => setNovPage((p) => Math.min(novPager.totalPages, p + 1))}
                    />
                )}
            </div>
        </div>
        );
    };

    const renderNotifUI = () => {
        if (readOnly) {
            return (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <button className="btn btn-back" onClick={() => setView('main')}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <div className="card">
                        <p>Modo solo lectura: el Asistente no puede enviar notificaciones.</p>
                    </div>
                </div>
            );
        }
        return (
        <div className="page-content">
            <div className="page-toolbar">
                <div className="page-toolbar-start">
                    <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <h2>Enviar notificación</h2>
                </div>
            </div>

            <div className="card">
                <h3>Enviar Notificación</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
                    <ComunicadoDestinatarioSelect
                        target={notifTarget}
                        onTargetChange={(value) => {
                            setNotifTarget(value);
                            if (value !== 'INDIVIDUAL') setSelectedUser('');
                        }}
                        selectedUser={selectedUser}
                        onSelectedUserChange={setSelectedUser}
                        users={users}
                    />

                    <textarea
                        placeholder="Escriba el comunicado aquí..."
                        value={notifMsg}
                        onChange={(e) => setNotifMsg(e.target.value)}
                        style={{ height: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />

                    <button className="btn btn-purple" onClick={sendNotif}>
                        <i className="fas fa-paper-plane"></i> Enviar Ahora
                    </button>
                </div>
            </div>

            <div className="card">
                <ComunicadosHistorial
                    items={comunicadosEnviados}
                    loading={loadingComunicadosEnviados}
                    page={comunicadosPage}
                    onPageChange={setComunicadosPage}
                    onRefresh={fetchComunicadosEnviados}
                    emptyText="Aún no ha enviado comunicados."
                />
            </div>
        </div>
        );
    };

    const renderKPIs = () => {
        const today = new Date().toISOString().split('T')[0];
        const getRegistroDate = (timestamp) => {
            const value = String(timestamp || '');
            if (value.includes('T')) return value.split('T')[0];
            if (value.includes(' ')) return value.split(' ')[0];
            return value.slice(0, 10);
        };
        const findZoneForRegistro = (registro) => zones.find((zone) =>
            (registro.zonaId && String(zone.id) === String(registro.zonaId))
            || (registro.zonaAlias && (zone.alias === registro.zonaAlias || zone.nombre === registro.zonaAlias))
        );

        const todayRegs = registros.filter((r) => getRegistroDate(r.timestamp) === today);
        const uniqueZonesToday = new Set(
            todayRegs.map((r) => {
                const zone = findZoneForRegistro(r);
                return zone ? String(zone.id) : (r.zonaId || r.zonaAlias);
            }).filter(Boolean)
        ).size;
        const coverageRate = zones.length > 0 ? Math.round((uniqueZonesToday / zones.length) * 100) : 0;

        // Weekly Trend (last 7 days)
        const weeklyTrend = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            weeklyTrend[dateStr] = registros.filter((r) => getRegistroDate(r.timestamp) === dateStr).length;
        }

        const trendData = {
            labels: Object.keys(weeklyTrend).map(d => {
                const parts = d.split('-');
                return `${parts[2]}/${parts[1]}`; // DD/MM format
            }),
            datasets: [{
                label: 'Vigilancias Diarias',
                data: Object.values(weeklyTrend),
                borderColor: '#00a2ff',
                backgroundColor: 'rgba(0, 162, 255, 0.12)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointBackgroundColor: '#0077c2',
                pointHoverRadius: 7
            }]
        };

        // Zone Ranking
        const zoneCountsById = {};
        const zoneCountsByName = {};
        registros.forEach((r) => {
            const zone = findZoneForRegistro(r);
            const zoneId = zone ? String(zone.id) : String(r.zonaId || r.zonaAlias || 'unknown');
            const name = zone?.nombre || r.zonaAlias || 'Zona Desconocida';
            zoneCountsById[zoneId] = (zoneCountsById[zoneId] || 0) + 1;
            zoneCountsByName[name] = (zoneCountsByName[name] || 0) + 1;
        });

        const sortedZoneNames = Object.keys(zoneCountsByName).sort((a, b) => zoneCountsByName[b] - zoneCountsByName[a]).slice(0, 5);
        const rankingData = {
            labels: sortedZoneNames,
            datasets: [{
                label: 'Visitas',
                data: sortedZoneNames.map(n => zoneCountsByName[n]),
                backgroundColor: ['#0077c2', '#4a6fa5', '#00a2ff', '#badc58', '#f39c12'],
                borderRadius: 8,
                borderWidth: 0
            }]
        };

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 10,
                    titleFont: { size: 13, family: 'Montserrat' },
                    bodyFont: { size: 12, family: 'Montserrat' }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Montserrat', size: 11 } }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: { font: { family: 'Montserrat', size: 11 } }
                }
            }
        };

        return (
            <div className="page-content">
                <div className="page-toolbar">
                    <div className="page-toolbar-start">
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                            <i className="fas fa-arrow-left"></i> Volver
                        </button>
                        <h2>Panel Ejecutivo de Gestión</h2>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '8px 15px', borderRadius: '20px', fontWeight: '600', maxWidth: '100%', overflowWrap: 'anywhere' }}>
                        <i className="far fa-clock"></i> Último corte: {new Date().toLocaleString()}
                    </div>
                </div>

                {/* KPI scorecards with premium cards */}
                <div className="charts-grid">
                    
                    {/* Coverage Rate Card */}
                    <div className="card" style={{ 
                        margin: 0, 
                        background: 'linear-gradient(135deg, #0077c2, #00a2ff)', 
                        color: 'white', 
                        padding: '25px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: '-15px', bottom: '-15px', fontSize: '100px', opacity: 0.1, pointerEvents: 'none' }}>
                            <i className="fas fa-satellite-dish"></i>
                        </div>
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Tasa de Cobertura Diaria</span>
                        <div style={{ fontSize: '48px', fontWeight: '900', margin: '10px 0' }}>{coverageRate}%</div>
                        <div style={{ width: '80%', height: '6px', background: 'rgba(255,255,255,0.25)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${coverageRate}%`, height: '100%', background: '#ffffff' }}></div>
                        </div>
                        <small style={{ marginTop: '12px', fontWeight: '600' }}>{uniqueZonesToday} de {zones.length} áreas supervisadas hoy</small>
                    </div>

                    {/* Weekly Activity Card */}
                    <div className="card" style={{ 
                        margin: 0, 
                        background: 'linear-gradient(135deg, #f39c12, #f5b041)', 
                        color: 'white', 
                        padding: '25px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '90px', opacity: 0.12, pointerEvents: 'none' }}>
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Vigilancias Semanales</span>
                        <div style={{ fontSize: '48px', fontWeight: '900', margin: '10px 0' }}>{Object.values(weeklyTrend).reduce((a, b) => a + b, 0)}</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '25px', marginTop: '5px' }}>
                            {Object.values(weeklyTrend).map((v, i) => (
                                <div key={i} style={{ width: '12px', height: `${Math.max(4, Math.min(v * 2, 25))}px`, background: '#ffffff', opacity: 0.4 + (i * 0.1), borderRadius: '2px' }} title={`Día ${i + 1}: ${v} rondas`}></div>
                            ))}
                        </div>
                        <small style={{ marginTop: '8px', fontWeight: '600' }}>Rondas registradas en los últimos 7 días</small>
                    </div>

                    {/* Novelties Alert Card */}
                    <div className="card" style={{ 
                        margin: 0, 
                        background: 'linear-gradient(135deg, #9b59b6, #af7ac5)', 
                        color: 'white', 
                        padding: '25px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: '-15px', bottom: '-15px', fontSize: '90px', opacity: 0.12, pointerEvents: 'none' }}>
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Incidencias Activas</span>
                        <div style={{ fontSize: '48px', fontWeight: '900', margin: '10px 0' }}>{novedades.length}</div>
                        <small style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '20px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                            Pendientes de revisión
                        </small>
                    </div>
                </div>

                {/* Main Charts Grid */}
                <div className="charts-grid">
                    <div className="card chart-card" style={{ margin: 0, padding: '16px' }}>
                        <h3 style={{ fontSize: '15px', color: 'var(--color-blue-dark)', marginBottom: '12px', fontWeight: 'bold' }}>Tendencia histórica (rondas por día)</h3>
                        <div className="chart-canvas">
                            <Line data={trendData} options={chartOptions} />
                        </div>
                    </div>
                    <div className="card chart-card" style={{ margin: 0, padding: '16px' }}>
                        <h3 style={{ fontSize: '15px', color: 'var(--color-blue-dark)', marginBottom: '12px', fontWeight: 'bold' }}>Top 5 zonas con mayor supervisión</h3>
                        <div className="chart-canvas">
                            <Bar data={rankingData} options={{ ...chartOptions, indexAxis: 'y' }} />
                        </div>
                    </div>
                </div>

                {/* Frequency control heatmap / Table */}
                <div className="card" style={{ margin: 0, padding: '25px', textAlign: 'left' }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--color-blue-dark)', marginBottom: '15px', fontWeight: 'bold' }}>📊 Mapa de Frecuencia Institucional por Área</h3>
                    
                    <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <table className="mini-table" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Zona / Área</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Tipo</th>
                                    <th style={{ color: 'white', padding: '12px 15px', textAlign: 'center' }}>Frecuencia (Visitas Totales)</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Estado de Control</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...zones]
                                    .map((z) => ({
                                        zone: z,
                                        count: zoneCountsById[String(z.id)] || 0
                                    }))
                                    .sort((a, b) => b.count - a.count || (a.zone.nombre || '').localeCompare(b.zone.nombre || ''))
                                    .map(({ zone: z, count }) => {
                                    const pct = Math.min(count * 5, 100);
                                    let statusColor = '#e74c3c';
                                    let statusLabel = 'BAJO';
                                    
                                    if (count > 10) {
                                        statusColor = '#2ecc71';
                                        statusLabel = 'ÓPTIMO';
                                    } else if (count > 3) {
                                        statusColor = '#f39c12';
                                        statusLabel = 'MODERADO';
                                    }

                                    return (
                                        <tr key={z.id}>
                                            <td style={{ padding: '12px 15px', fontWeight: '700', color: '#2d3748' }}>{z.nombre}</td>
                                            <td style={{ padding: '12px 15px' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    background: z.tipo === 'SNACK' ? '#e2f8e9' : z.tipo === 'LUNCH' ? '#e1f5fe' : '#f1f5f9',
                                                    color: z.tipo === 'SNACK' ? '#2e7d32' : z.tipo === 'LUNCH' ? '#0288d1' : '#64748b'
                                                }}>
                                                    {z.tipo || 'OTRO'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 15px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#4a5568' }}>{count}</td>
                                            <td style={{ padding: '12px 15px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '100px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${pct}%`, height: '100%', background: statusColor }}></div>
                                                    </div>
                                                    <small style={{ color: statusColor, fontWeight: '700' }}>
                                                        {statusLabel}
                                                    </small>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderRegistros = () => {
        const selectedZoneFilter = selectedMapZone === 'ALL'
            ? null
            : zones.find((z) => String(z.id) === String(selectedMapZone)) || null;

        // Find all users who are teachers (DOCENTE or JEFE DE AREA)
        const teachersList = users.filter(u => u.rol === 'DOCENTE' || u.rol === 'JEFE DE AREA');
        
        const teacherUbicaciones = [];
        teachersList.forEach(t => {
            const hasLiveGPS = t.latitud_actual && t.longitud_actual
                && parseFloat(t.latitud_actual) !== 0 && parseFloat(t.longitud_actual) !== 0
                && isGpsFresh(t.actualizado_gps);

            // Find their latest scan record (registros is sorted newest first)
            const latestScan = registros.find(r => r.usuarioNombre === t.nombre);

            if (selectedZoneFilter) {
                const insideLive = hasLiveGPS && getDistance(
                    parseFloat(t.latitud_actual),
                    parseFloat(t.longitud_actual),
                    parseFloat(selectedZoneFilter.latitud),
                    parseFloat(selectedZoneFilter.longitud)
                ) <= ZONE_RADIUS_M;
                const scanInZone = latestScan && (
                    String(latestScan.zonaId) === String(selectedZoneFilter.id) ||
                    latestScan.zonaAlias === selectedZoneFilter.alias
                );
                if (!insideLive && !scanInZone) return;
            }
            
            if (hasLiveGPS) {
                teacherUbicaciones.push({
                    id: 'live-' + t.documento,
                    nombre: t.nombre,
                    latitud: parseFloat(t.latitud_actual),
                    longitud: parseFloat(t.longitud_actual),
                    timestamp: t.actualizado_gps,
                    isLive: true,
                    isFresh: true,
                    labelText: 'Ubicación GPS (Activo)',
                    timeAgoStr: t.actualizado_gps ? new Date(t.actualizado_gps).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'
                });
            } else if (latestScan) {
                const zone = zones.find(z => z.id === latestScan.zonaId || z.alias === latestScan.zonaAlias);
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

        // Sort: active GPS first, then scanned last seen, then inactive
        teacherUbicaciones.sort((a, b) => {
            if (a.isFresh && !b.isFresh) return -1;
            if (!a.isFresh && b.isFresh) return 1;
            if (a.isLive && !b.isLive) return -1;
            if (!a.isLive && b.isLive) return 1;
            if (a.timestamp && !b.timestamp) return -1;
            if (!a.timestamp && b.timestamp) return 1;
            if (a.timestamp && b.timestamp) {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            return a.nombre.localeCompare(b.nombre);
        });

        // Filter table records based on zone + search input
        const filteredTableRegs = registros.filter(r => {
            if (selectedZoneFilter) {
                const inZone = String(r.zonaId) === String(selectedZoneFilter.id) || r.zonaAlias === selectedZoneFilter.alias;
                if (!inZone) return false;
            }
            const term = registrosSearch.toLowerCase();
            if (!term) return true;
            const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
            const zoneName = zone?.nombre || r.zonaAlias || '';
            const dateStr = new Date(r.timestamp).toLocaleDateString();
            const timeStr = new Date(r.timestamp).toLocaleTimeString();
            return r.usuarioNombre?.toLowerCase().includes(term) ||
                   zoneName.toLowerCase().includes(term) ||
                   (zone?.tipo || '').toLowerCase().includes(term) ||
                   dateStr.includes(term) ||
                   timeStr.includes(term);
        });

        return (
            <div className="page-content">
                <div className="page-toolbar">
                    <div className="page-toolbar-start">
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                            <i className="fas fa-arrow-left"></i> Volver al Inicio
                        </button>
                        <h2>Supervisión Satelital en Vivo</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="badge" style={{ background: '#2ecc71', fontWeight: 'bold' }}>Transmisión activa</span>
                    </div>
                </div>

                {/* Grid Layout for Map + Sidebar */}
                <div className="map-supervision-grid">
                    
                    {/* Left Column: Map */}
                    <div className="card map-panel" style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '16px', fontWeight: 'bold' }}>🌎 Mapa del Campus y Rondas</h3>
                            <small style={{ color: '#888' }}><i className="fas fa-satellite"></i> Actualizado automáticamente</small>
                        </div>
                        <div id="map-director" className="map-panel-canvas"></div>
                    </div>

                    {/* Right Column: Controls & Last Seen */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* Map Controls */}
                        <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left', width: '100%', maxWidth: 'none' }}>
                            <h4 style={{ margin: '0 0 15px 0', color: 'var(--color-blue-dark)', fontSize: '14px', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px', fontWeight: 'bold' }}>
                                <i className="fas fa-sliders-h"></i> Filtros de Mapa
                            </h4>
                            
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>Seguimiento por Docente:</label>
                                <select 
                                    value={selectedMapTeacher} 
                                    onChange={(e) => setSelectedMapTeacher(e.target.value)}
                                    style={{ padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', textAlign: 'left' }}
                                >
                                    <option value="ALL">-- Todos los Docentes --</option>
                                    {users.filter(u => u.rol === 'DOCENTE' || u.rol === 'JEFE DE AREA').map(u => u.nombre).filter(Boolean).sort().map(name => (
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
                                    <option value="all">Historial Completo</option>
                                </select>
                            </div>
                        </div>

                        {/* Last Seen Teacher Locations */}
                        <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 'none' }}>
                            <h4 style={{ margin: '0 0 15px 0', color: 'var(--color-blue-dark)', fontSize: '14px', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px', fontWeight: 'bold' }}>
                                <i className="fas fa-satellite-dish"></i> Estado y Ubicación Docente
                            </h4>
                            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
                                {teacherUbicaciones.length === 0 ? (
                                    <p style={{ color: '#888', fontSize: '13px', textAlign: 'center' }}>No hay docentes registrados.</p>
                                ) : (
                                    teacherUbicaciones.map(item => {
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

                {/* Bottom Row: Redesigned general logs history table */}
                <div className="card" style={{ margin: 0, padding: '25px', width: '100%', display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '18px', fontWeight: '800' }}>📜 Historial Completo de Vigilancias</h3>
                            <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: '13px' }}>Mostrando {filteredTableRegs.length} registros totales</p>
                        </div>
                        <input
                            type="text"
                            placeholder="🔍 Buscar docente, zona, tipo o fecha..."
                            value={registrosSearch}
                            onChange={(e) => setRegistrosSearch(e.target.value)}
                            style={{ padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', maxWidth: '360px', fontSize: '13px', margin: 0, background: '#f8fafc', textAlign: 'left', minWidth: 0, boxSizing: 'border-box' }}
                        />
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
                                {filteredTableRegs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '14px' }}>
                                            No se encontraron registros que coincidan con la búsqueda.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTableRegs.map(r => {
                                        const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
                                        const hasCoords = r.latitud && r.longitud && parseFloat(r.latitud) !== 0;
                                        return (
                                            <tr key={r.id} style={{ transition: 'all 0.2s' }}>
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
                                                        <span style={{ color: '#27ae60', fontWeight: '600', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <i className="fas fa-check-circle"></i> Capturada ({r.distancia || 0}m)
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
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
                </div>
            </div>
        );
    };

    return (
        <div className="page-content">
            {view === 'main' ? renderMain() :
                view === 'kpis' ? renderKPIs() :
                    view === 'notif' ? (readOnly ? renderMain() : renderNotifUI()) :
                        view === 'reports' ? renderReportsUI() :
                            view === 'novedades_list' ? renderNovedadesList() :
                                view === 'cumplimiento' ? <CumplimientoVigilancias onBack={() => setView('main')} /> :
                                    view === 'live' ? <LiveSupervision onBack={() => setView('main')} mapId="map-director-live" mode="live" /> :
                                        view === 'historial' ? <LiveSupervision onBack={() => setView('main')} mapId="map-director-history" mode="history" refreshMs={120000} /> :
                                            renderMain()}
        </div>
    );
};

export default DashboardDirector;
