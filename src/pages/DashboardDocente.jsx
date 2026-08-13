import React, { useState, useEffect, Suspense, lazy } from 'react';
import Swal from 'sweetalert2';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { getDistance } from '../utils/geoUtils';
import { getZonas, getZona, getRegistros, createRegistro, createNovedad, createLog, getHorarios, updateUbicacionVivo, getComunicados, markComunicadoLeido, getEquipo } from '../lib/api';

import { useOfflineSync } from '../hooks/useOfflineSync';
import { PaginationBar, slicePage } from '../components/PaginationBar';

// html5-qrcode es una librería pesada; solo se descarga cuando el docente abre el escáner.
const QRScanner = lazy(() => import('../components/QRScanner'));

// Tolerancia GPS documentada en el README/backend: 50 metros del punto oficial de la zona.
const MAX_DISTANCE_METERS = 50;

const DashboardDocente = () => {
    const session = JSON.parse(localStorage.getItem('usuario_cny_2026'));
    const user = session?.datos;
    const isJefe = user?.rol === 'JEFE DE AREA';

    const [view, setView] = useState('main'); // 'main', 'history', 'scanner', 'comunicados', 'equipo'
    const [manualDoc, setManualDoc] = useState('');
    const [registros, setRegistros] = useState([]);
    const [zones, setZones] = useState([]);
    const [historySearch, setHistorySearch] = useState('');
    const [comunicados, setComunicados] = useState([]);
    const [loadingComunicados, setLoadingComunicados] = useState(false);
    const [equipoData, setEquipoData] = useState(null);
    const [loadingEquipo, setLoadingEquipo] = useState(false);
    const [equipoTab, setEquipoTab] = useState('estado'); // 'estado', 'historial', 'novedades'
    const [equipoSearch, setEquipoSearch] = useState('');
    const [equipoEstado, setEquipoEstado] = useState('ALL'); // ALL | si | no
    const [equipoDocente, setEquipoDocente] = useState('ALL');
    const [equipoFechaDesde, setEquipoFechaDesde] = useState('');
    const [equipoFechaHasta, setEquipoFechaHasta] = useState('');
    const [historyTipo, setHistoryTipo] = useState('ALL');
    const [historyFechaDesde, setHistoryFechaDesde] = useState('');
    const [historyFechaHasta, setHistoryFechaHasta] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const [equipoPage, setEquipoPage] = useState(1);
    const location = useGeoLocation();
    const { saveToQueue, queueLength } = useOfflineSync('registros');

    const lastUpdateRef = React.useRef(0);

    useEffect(() => {
        if (!user) return;
        if (!location.loaded || !location.coordinates.lat || !location.coordinates.lng) return;

        const now = Date.now();
        if (now - lastUpdateRef.current < 20000) { // 20s throttle
            return;
        }
        lastUpdateRef.current = now;

        const sendLocation = async () => {
            try {
                await updateUbicacionVivo(location.coordinates.lat, location.coordinates.lng);
            } catch (err) {
                console.error("Error updating live location in background:", err);
            }
        };

        sendLocation();
    }, [location.coordinates.lat, location.coordinates.lng, location.loaded, user]);

    const fetchData = async () => {
        if (!user) return;
        try {
            const regs = await getRegistros(user.uid || user.documento);
            setRegistros(regs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));

            const zonesData = await getZonas();
            setZones(zonesData);
        } catch (error) {
            console.error("Error fetching data:", error);
        }
    };

    const fetchComunicadosInbox = async () => {
        if (!user) return;
        setLoadingComunicados(true);
        try {
            const data = await getComunicados();
            setComunicados(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching comunicados:', error);
            Swal.fire('Error', 'No se pudieron cargar los comunicados.', 'error');
        } finally {
            setLoadingComunicados(false);
        }
    };

    const fetchEquipo = async () => {
        if (!user || !isJefe) return;
        setLoadingEquipo(true);
        try {
            const data = await getEquipo();
            setEquipoData(data);
            if (!zones.length) {
                const zonesData = await getZonas();
                setZones(zonesData);
            }
        } catch (error) {
            console.error('Error fetching equipo:', error);
            Swal.fire('Error', error.message || 'No se pudo cargar el equipo de área.', 'error');
        } finally {
            setLoadingEquipo(false);
        }
    };

    const isComunicadoLeido = (value) => (
        value === true
        || value === 1
        || value === '1'
        || value === 't'
        || value === 'true'
        || value === 'TRUE'
    );

    const openComunicado = async (comunicado) => {
        let readError = false;
        const alreadyRead = isComunicadoLeido(comunicado.leido);

        // Siempre intentar registrar lectura (idempotente). Evita el bug de 'f' truthy en JS.
        try {
            await markComunicadoLeido(comunicado.id);
            setComunicados((current) => current.map((item) => (
                item.id === comunicado.id
                    ? { ...item, leido: true, leido_en: new Date().toISOString() }
                    : item
            )));
        } catch (error) {
            readError = true;
            console.error('Error marking comunicado as read:', error);
            if (!alreadyRead) {
                // keep unread visual if it never was marked
            }
        }

        await Swal.fire({
            icon: 'info',
            title: comunicado.emisor || 'Comunicado institucional',
            text: comunicado.mensaje,
            confirmButtonText: 'Cerrar',
            footer: readError ? 'El mensaje se abrió, pero no se pudo guardar como leído.' : undefined
        });
    };

    const showMySchedules = async () => {
        Swal.fire({
            title: 'Cargando sus turnos...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            // Fetch schedules and zones
            const scheds = await getHorarios();
            // Filter schedules for this docent
            const docId = String(user?.documento || '');
            const myScheds = (scheds || []).filter(s => String(s.usuarioId) === docId);

            // Fetch zones
            const allZones = await getZonas();

            // Build a list of 6 days (Día 0 - Día 5)
            const days = [0, 1, 2, 3, 4, 5];
            
            let htmlContent = `
                <div style="text-align: left; font-size: 14px; margin-top: 10px;">
                    <p style="margin-bottom: 15px; color: #555; font-weight: 500;">Esta es la programación de sus vigilancias asignadas por día de ciclo:</p>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
            `;

            days.forEach(day => {
                const asig = myScheds.find(s => s.diaCiclo === day);
                const zone = asig ? allZones.find(z => String(z.id) === String(asig.zonaId)) : null;

                if (zone) {
                    htmlContent += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(106, 180, 76, 0.08); border-left: 4px solid #6ab04c; border-radius: 8px;">
                            <div>
                                <span style="font-weight: 700; color: #27ae60;">DÍA ${day}</span>
                                <span style="margin-left: 10px; font-weight: 600; color: var(--color-blue-dark);">${zone.alias} - ${zone.nombre}</span>
                            </div>
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">
                                <i class="far fa-clock"></i> ${zone.horario}
                            </div>
                        </div>
                    `;
                } else {
                    htmlContent += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #f8f9fa; border-left: 4px solid #cbd5e1; border-radius: 8px; color: #94a3b8;">
                            <div>
                                <span style="font-weight: 700;">DÍA ${day}</span>
                                <span style="margin-left: 10px; font-style: italic;">Sin asignación</span>
                            </div>
                            <div style="font-size: 12px;">
                                -
                            </div>
                        </div>
                    `;
                }
            });

            htmlContent += `
                    </div>
                </div>
            `;

            Swal.fire({
                title: 'Mis Turnos Asignados',
                html: htmlContent,
                icon: 'info',
                confirmButtonText: 'Entendido',
                confirmButtonColor: 'var(--color-blue-primary)'
            });

        } catch (error) {
            console.error("Error al obtener los turnos:", error);
            Swal.fire('Error', 'No se pudieron consultar sus turnos. Por favor intente más tarde.', 'error');
        }
    };

    useEffect(() => {
        if (view === 'history') fetchData();
        if (view === 'comunicados') fetchComunicadosInbox();
        if (view === 'equipo') fetchEquipo();
    }, [view]);

    useEffect(() => {
        if (user?.documento || user?.uid) fetchComunicadosInbox();
    }, [user?.documento, user?.uid]);

    const checkSchedule = (horarioStr) => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [start, end] = horarioStr.split('-');
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;
        return currentTime >= startTime && currentTime <= endTime;
    };

    const registerPresence = React.useCallback(async (input) => {
        if (!input) {
            Swal.fire('Atención', 'Por favor ingrese el código o alias de la zona', 'warning');
            return;
        }

        const now = new Date();
        const day = now.getDay();
        if (day === 0 || day === 6) {
            Swal.fire('Atención', 'No se permiten registros los fines de semana', 'warning');
            return;
        }

        if (!user) {
            Swal.fire('Error de Sesión', 'No se han encontrado datos del usuario. Por favor inicie sesión nuevamente.', 'error');
            return;
        }

        Swal.fire({ title: 'Validando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const searchTerm = input.trim().toUpperCase();
            let zona = null;
            let zoneId = '';

            // 1. Try precise ID or alias lookup via API
            try {
                const zoneData = await getZona(input.trim());
                zona = zoneData;
                zoneId = zoneData.id;
            } catch {
                // Not found by ID, continue to search
            }

            // 2. If not found, search through all zones
            if (!zona) {
                const allZones = await getZonas();

                // Exact alias match
                const exactMatch = allZones.find(z => z.alias?.toUpperCase() === searchTerm);
                if (exactMatch) {
                    zona = exactMatch;
                    zoneId = exactMatch.id;
                } else {
                    // Fuzzy/Partial Match
                    const matches = allZones.filter(z =>
                        z.alias?.toUpperCase().includes(searchTerm) ||
                        z.nombre?.toUpperCase().includes(searchTerm) ||
                        z.actividad?.toUpperCase().includes(searchTerm) ||
                        z.id?.toUpperCase().includes(searchTerm)
                    );

                    if (matches.length === 0) {
                        Swal.fire('Error', `No se encontró ninguna zona que coincida con "${input}"`, 'error');
                        return;
                    } else if (matches.length === 1) {
                        zona = matches[0];
                        zoneId = matches[0].id;
                    } else {
                        // Multiple matches - let user pick
                        Swal.close();
                        const { value: pickedId } = await Swal.fire({
                            title: 'Zonas encontradas',
                            input: 'select',
                            inputOptions: matches.reduce((acc, curr) => ({ ...acc, [curr.id]: `${curr.alias} - ${curr.nombre}` }), {}),
                            inputPlaceholder: 'Seleccione la zona correcta',
                            showCancelButton: true
                        });

                        if (pickedId) {
                            const picked = matches.find(m => m.id === pickedId);
                            zona = picked;
                            zoneId = pickedId;
                            Swal.fire({ title: 'Validando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                        } else {
                            return; // User cancelled
                        }
                    }
                }
            }

            // 3. Continue with validation and registration
            const zonaInactiva = (
                zona?.activo === false
                || zona?.activo === 0
                || zona?.activo === '0'
                || zona?.activo === 'f'
                || zona?.activo === 'false'
            );
            if (zonaInactiva) {
                Swal.fire('Zona inactiva', `La zona ${zona.nombre || zona.alias} está desactivada y no admite vigilancias.`, 'warning');
                return;
            }

            if (!checkSchedule(zona.horario)) {
                Swal.fire('Fuera de Horario', `Horario permitido para ${zona.nombre}: ${zona.horario}`, 'warning');
                return;
            }

            if (!location.loaded) {
                Swal.fire({
                    title: 'Buscando GPS...',
                    text: 'Estamos intentando obtener su ubicación exacta. Por favor, asegúrese de estar en un lugar abierto o cerca de una ventana.',
                    icon: 'info',
                    confirmButtonText: 'Reintentar'
                });
                return;
            }

            if (location.error) {
                let errorMsg = 'No pudimos obtener su ubicación.';
                let footer = '';

                if (location.error.code === 1) { // PERMISSION_DENIED
                    errorMsg = 'Permiso de GPS denegado.';
                    footer = '<b>Cómo solucionar:</b> Vaya a la configuración de su navegador/celular y habilite el permiso de ubicación para este sitio.';
                } else if (location.error.code === 3) { // TIMEOUT
                    errorMsg = 'Tiempo de espera agotado (Timeout).';
                    footer = '<b>Sugerencia:</b> Active el GPS de alta precisión en su celular y asegúrese de tener señal de datos.';
                }

                Swal.fire({
                    title: 'Error de Ubicación',
                    html: `${errorMsg}<br/><br/>${footer}`,
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
                return;
            }

            if (!location.coordinates || !location.coordinates.lat) {
                Swal.fire('Error GPS', 'Los datos de ubicación no son válidos. Por favor reinicie la aplicación.', 'error');
                return;
            }

            const distance = getDistance(
                location.coordinates.lat,
                location.coordinates.lng,
                zona.latitud,
                zona.longitud
            );

            if (distance > MAX_DISTANCE_METERS) {
                Swal.fire('Ubicación Incorrecta', `Estás a ${Math.round(distance)}m de "${zona.nombre}". (Máx ${MAX_DISTANCE_METERS}m).`, 'error');
                return;
            }

            const registrationData = {
                zonaId: zoneId,
                zonaAlias: zona.alias,
                usuarioId: user.uid || user.documento || 'Unknown',
                usuarioNombre: user.nombre || 'Personal CNY PREESCOLAR',
                timestamp: new Date().toISOString(),
                coords: { lat: location.coordinates.lat, lng: location.coordinates.lng },
                distancia: Math.round(distance)
            };

            if (!navigator.onLine) {
                saveToQueue(registrationData);
                setManualDoc('');
                return;
            }

            await createRegistro(registrationData);

            try {
                await createLog({
                    usuario: user.nombre,
                    documento: user.documento || user.uid,
                    accion: `Registro de vigilancia exitoso en zona: ${zona.nombre}`
                });
            } catch (e) {
                console.error("Error al registrar log de vigilancia:", e);
            }

            Swal.close();

            // Detailed Success Summary (User Request)
            Swal.fire({
                title: '¡Registro Exitoso!',
                html: `
                    <div style="text-align: left; padding: 10px; border-top: 3px solid var(--color-green-primary);">
                        <div style="margin-bottom: 12px;">
                            <small style="color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px;">Zona Escaneada</small>
                            <div style="font-size: 18px; font-weight: 700; color: var(--color-blue-dark);">${zona.nombre}</div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <div>
                                <small style="color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px;">Fecha</small>
                                <div style="font-weight: 600;">${now.toLocaleDateString()}</div>
                            </div>
                            <div>
                                <small style="color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px;">Hora</small>
                                <div style="font-weight: 600;">${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
                            <small style="color: #888; text-transform: uppercase; font-weight: bold; font-size: 10px;">Actividad Asignada</small>
                            <div style="font-size: 13px; color: #444; margin-top: 5px; line-height: 1.4;">
                                ${zona.actividad || 'Vigilancia y control de área escolar.'}
                            </div>
                        </div>
                    </div>
                `,
                icon: 'success',
                confirmButtonText: 'Entendido',
                confirmButtonColor: 'var(--color-green-primary)'
            });

            setManualDoc('');
        } catch (error) {
            console.error("Error in registration:", error);
            Swal.fire('Error', 'Problema al procesar el registro: ' + error.message, 'error');
        }
    }, [user, location, checkSchedule, saveToQueue]);

    const handleScanSuccess = React.useCallback(async (decodedText) => {
        await registerPresence(decodedText);
        setView('main'); // Auto-close scanner after success
    }, [registerPresence]);

    const reportarNov = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Registrar Novedad',
            html: `
                <div style="text-align: left;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Detalle de la novedad:</label>
                    <textarea id="swal-input-detalle" class="swal2-textarea" placeholder="Escriba aquí los detalles..." style="margin: 0; width: 100%; box-sizing: border-box;"></textarea>
                    
                    <label style="display: block; margin-top: 20px; margin-bottom: 5px; font-weight: 600;">Adjuntar Foto / Archivo:</label>
                    <input id="swal-input-file" type="file" class="swal2-file" style="margin: 0; width: 100%;">
                    <small style="color: #666; display: block; marginTop: 5px;">Formatos permitidos: JPG, PNG, PDF (Máx 5MB)</small>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Enviar Reporte 🚀',
            confirmButtonColor: 'var(--color-orange-primary)',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const detalle = document.getElementById('swal-input-detalle').value;
                const file = document.getElementById('swal-input-file').files[0];
                if (!detalle) {
                    Swal.showValidationMessage('Por favor ingrese el detalle de la novedad');
                    return false;
                }
                return { detalle, file };
            }
        });

        if (formValues) {
            const { detalle, file } = formValues;
            Swal.fire({ title: 'Subiendo información...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                let mediaUrl = '';
                if (file) {
                    // Compresión de imagen y conversión a Base64
                    mediaUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = (e) => {
                            const img = new Image();
                            img.src = e.target.result;
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_SIZE = 800;
                                let w = img.width;
                                let h = img.height;
                                if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } }
                                else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
                                canvas.width = w;
                                canvas.height = h;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, w, h);
                                resolve(canvas.toDataURL('image/jpeg', 0.6));
                            };
                        };
                    });
                }

                await createNovedad({
                    detalle,
                    mediaUrl,
                    usuarioId: user.uid,
                    usuarioNombre: user.nombre,
                    area: user.grupoArea || user.area || 'General',
                    tipo: 'INCIDENCIA'
                });

                try {
                    await createLog({
                        usuario: user.nombre,
                        documento: user.documento || user.uid,
                        accion: `Registro de novedad: ${detalle.substring(0, 50)}${detalle.length > 50 ? '...' : ''}`
                    });
                } catch (err) {
                    console.error("Error al registrar log de novedad:", err);
                }

                Swal.fire('¡Éxito!', 'La novedad ha sido registrada correctamente.', 'success');
            } catch (e) {
                console.error("Error reporting novelty:", e);
                Swal.fire('Error', 'No se pudo registrar la novedad. ' + e.message, 'error');
            }
        }
    };

    const unreadComunicados = comunicados.filter((comunicado) => !isComunicadoLeido(comunicado.leido)).length;

    return (
        <div className="card">
            {queueLength > 0 && (
                <div className="badge badge-orange" style={{ marginBottom: '10px', display: 'block' }}>
                    <i className="fas fa-wifi-slash"></i> {queueLength} registros pendientes de sincronizar
                </div>
            )}

            {view === 'main' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    <div className="main-actions-premium" style={{ textAlign: 'center' }}>
                        <button className="btn btn-institutional" onClick={() => setView('scanner')}>
                            <i className="fas fa-qrcode"></i> INICIAR ESCANEO DE ZONA
                        </button>

                        <div className="manual-entry-quick" style={{ background: '#fff', padding: '15px', borderRadius: '18px', border: '1px solid #eee', boxShadow: '0 5px 15px rgba(0,0,0,0.03)', margin: '0 auto', maxWidth: '300px' }}>
                            <small style={{ display: 'block', marginBottom: '10px', color: '#aaa', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', fontFamily: "'Montserrat', sans-serif" }}>Registro Manual</small>
                            <div className="manual-input-group">
                                <input
                                    type="text"
                                    placeholder="Código"
                                    value={manualDoc}
                                    onChange={(e) => setManualDoc(e.target.value)}
                                    style={{ background: '#f8f9fa', border: 'none', borderRadius: '12px 0 0 12px' }}
                                />
                                <button className="btn btn-dark" onClick={() => registerPresence(manualDoc)} style={{ borderRadius: '0 12px 12px 0' }}>
                                    <i className="fas fa-check"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="tools-grid" style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
                        <button className="btn btn-orange" onClick={reportarNov} style={{ margin: 0, padding: '18px 25px', fontSize: '18px' }}>
                            <i className="fas fa-exclamation-circle"></i> Novedad
                        </button>
                        <button className="btn btn-dark" onClick={() => setView('history')} style={{ margin: 0, padding: '18px 25px', fontSize: '18px' }}>
                            <i className="fas fa-history"></i> Historial
                        </button>
                        <button className="btn btn-purple" onClick={showMySchedules} style={{ margin: 0, padding: '18px 25px', fontSize: '18px' }}>
                            <i className="fas fa-calendar-alt"></i> Mis Turnos
                        </button>
                        <button
                            className="btn btn-institutional"
                            onClick={() => setView('comunicados')}
                            style={{ margin: 0, padding: '18px 25px', fontSize: '18px', position: 'relative' }}
                        >
                            <i className="fas fa-envelope"></i> Comunicados
                            {unreadComunicados > 0 && (
                                <span style={{
                                    marginLeft: '10px',
                                    padding: '3px 9px',
                                    borderRadius: '999px',
                                    background: '#e74c3c',
                                    color: 'white',
                                    fontSize: '12px',
                                    fontWeight: '800'
                                }}>
                                    {unreadComunicados}
                                </span>
                            )}
                        </button>

                        {isJefe && (
                            <button
                                className="btn btn-purple"
                                onClick={() => {
                                    setEquipoTab('estado');
                                    setView('equipo');
                                }}
                                style={{ margin: 0, padding: '18px 25px', fontSize: '18px' }}
                            >
                                <i className="fas fa-users"></i> Ver Mi Equipo de Área
                            </button>
                        )}
                    </div>
                </div>
            )}

            {view === 'comunicados' && (
                <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0, width: 'auto' }}>
                            <i className="fas fa-arrow-left"></i> Volver al Menú
                        </button>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0, color: 'var(--color-blue-dark)' }}>
                                <i className="fas fa-inbox"></i> Mis Comunicados
                            </h3>
                            <small style={{ color: '#64748b' }}>
                                {unreadComunicados} sin leer de {comunicados.length}
                            </small>
                        </div>
                        <button
                            type="button"
                            className="btn btn-dark"
                            onClick={fetchComunicadosInbox}
                            disabled={loadingComunicados}
                            style={{ margin: 0, width: 'auto' }}
                        >
                            <i className={`fas fa-sync-alt ${loadingComunicados ? 'fa-spin' : ''}`}></i> Actualizar
                        </button>
                    </div>

                    {loadingComunicados && comunicados.length === 0 ? (
                        <div style={{ padding: '35px', textAlign: 'center', color: '#64748b' }}>
                            <i className="fas fa-spinner fa-spin"></i> Cargando comunicados...
                        </div>
                    ) : comunicados.length === 0 ? (
                        <div style={{ padding: '35px', textAlign: 'center', background: '#f8fafc', borderRadius: '14px', color: '#64748b' }}>
                            <i className="fas fa-envelope-open" style={{ display: 'block', fontSize: '30px', marginBottom: '10px' }}></i>
                            No tiene comunicados.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {comunicados.map((comunicado) => {
                                const leido = isComunicadoLeido(comunicado.leido);
                                return (
                                <button
                                    type="button"
                                    key={comunicado.id}
                                    onClick={() => openComunicado(comunicado)}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        border: leido ? '1px solid #e2e8f0' : '2px solid #3498db',
                                        borderLeft: leido ? '5px solid #94a3b8' : '5px solid #3498db',
                                        borderRadius: '12px',
                                        background: leido ? 'white' : '#eff8ff',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex',
                                        gap: '14px',
                                        alignItems: 'flex-start'
                                    }}
                                >
                                    <i
                                        className={`fas ${leido ? 'fa-envelope-open' : 'fa-envelope'}`}
                                        style={{ color: leido ? '#94a3b8' : '#2980b9', fontSize: '20px', marginTop: '2px' }}
                                    ></i>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                            <strong style={{ color: 'var(--color-blue-dark)' }}>
                                                {comunicado.emisor || 'Sistema'}
                                            </strong>
                                            <small style={{ color: '#64748b' }}>
                                                {new Date(comunicado.timestamp).toLocaleString()}
                                            </small>
                                        </span>
                                        <span style={{
                                            display: 'block',
                                            marginTop: '6px',
                                            color: '#475569',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {comunicado.mensaje}
                                        </span>
                                        <small style={{ display: 'block', marginTop: '8px', color: leido ? '#64748b' : '#2980b9', fontWeight: '700' }}>
                                            {leido ? 'Leído' : 'Nuevo · Abrir para marcar como leído'}
                                        </small>
                                    </span>
                                </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {view === 'equipo' && isJefe && (() => {
                const term = equipoSearch.trim().toLowerCase();
                const dayKey = (ts) => {
                    const d = new Date(ts);
                    if (Number.isNaN(d.getTime())) return '';
                    return d.toISOString().slice(0, 10);
                };
                const miembros = (equipoData?.miembros || []).filter((member) => {
                    const matchesSearch = !term || [member.nombre, member.documento, member.email, member.rol]
                        .some((value) => String(value || '').toLowerCase().includes(term));
                    const matchesEstado = equipoEstado === 'ALL'
                        || (equipoEstado === 'si' && member.cumplioHoy)
                        || (equipoEstado === 'no' && !member.cumplioHoy);
                    const matchesDocente = equipoDocente === 'ALL'
                        || member.nombre === equipoDocente
                        || member.documento === equipoDocente;
                    return matchesSearch && matchesEstado && matchesDocente;
                });
                const registrosEquipo = (equipoData?.registros || []).filter((registro) => {
                    const zone = zones.find((z) => z.id === registro.zonaId || z.alias === registro.zonaAlias);
                    const matchesSearch = !term || [
                        registro.usuarioNombre,
                        registro.usuarioId,
                        registro.zonaAlias,
                        zone?.nombre,
                        zone?.alias
                    ].some((value) => String(value || '').toLowerCase().includes(term));
                    const matchesDocente = equipoDocente === 'ALL'
                        || registro.usuarioNombre === equipoDocente
                        || registro.usuarioId === equipoDocente;
                    const key = dayKey(registro.timestamp);
                    const matchesDesde = !equipoFechaDesde || (key && key >= equipoFechaDesde);
                    const matchesHasta = !equipoFechaHasta || (key && key <= equipoFechaHasta);
                    return matchesSearch && matchesDocente && matchesDesde && matchesHasta;
                });
                const novedadesEquipo = (equipoData?.novedades || []).filter((novedad) => {
                    const matchesSearch = !term || [
                        novedad.usuarioNombre,
                        novedad.usuarioId,
                        novedad.detalle,
                        novedad.area,
                        novedad.tipo
                    ].some((value) => String(value || '').toLowerCase().includes(term));
                    const matchesDocente = equipoDocente === 'ALL'
                        || novedad.usuarioNombre === equipoDocente
                        || novedad.usuarioId === equipoDocente;
                    const key = dayKey(novedad.timestamp);
                    const matchesDesde = !equipoFechaDesde || (key && key >= equipoFechaDesde);
                    const matchesHasta = !equipoFechaHasta || (key && key <= equipoFechaHasta);
                    return matchesSearch && matchesDocente && matchesDesde && matchesHasta;
                });
                const resumen = equipoData?.resumen || {};
                const docentesEquipo = (equipoData?.miembros || [])
                    .map((m) => ({ nombre: m.nombre, documento: m.documento }))
                    .filter((m) => m.nombre)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre));
                const hasEquipoFilters = Boolean(term)
                    || equipoEstado !== 'ALL'
                    || equipoDocente !== 'ALL'
                    || Boolean(equipoFechaDesde)
                    || Boolean(equipoFechaHasta);
                const equipoList = equipoTab === 'estado'
                    ? miembros
                    : equipoTab === 'historial'
                        ? registrosEquipo
                        : novedadesEquipo;
                const eqPageSize = equipoTab === 'novedades' ? 5 : 10;
                const eqPager = slicePage(equipoList, equipoPage, eqPageSize);
                const pageEquipoList = eqPager.pageItems;
                const filterStyle = {
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    width: '100%',
                    background: '#f8fafc',
                    fontSize: '13px',
                    margin: 0
                };

                return (
                    <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
                            <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0, width: 'auto' }}>
                                <i className="fas fa-arrow-left"></i> Volver al Menú
                            </button>
                            <div style={{ flex: 1, minWidth: '220px' }}>
                                <h3 style={{ margin: 0, color: 'var(--color-blue-dark)' }}>
                                    <i className="fas fa-users"></i> Mi Equipo de Área
                                </h3>
                                <small style={{ color: '#64748b' }}>
                                    Área: <strong>{equipoData?.area || user?.grupoArea || user?.area || 'Sin área'}</strong>
                                    {equipoData?.fecha ? ` · ${equipoData.fecha}` : ''}
                                </small>
                            </div>
                            <button
                                type="button"
                                className="btn btn-dark"
                                onClick={fetchEquipo}
                                disabled={loadingEquipo}
                                style={{ margin: 0, width: 'auto' }}
                            >
                                <i className={`fas fa-sync-alt ${loadingEquipo ? 'fa-spin' : ''}`}></i> Actualizar
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '22px', fontWeight: '800', color: '#1d4ed8' }}>{resumen.activos ?? 0}</div>
                                <small style={{ color: '#64748b', fontWeight: '700' }}>Docentes activos</small>
                            </div>
                            <div style={{ background: '#e8f8ee', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '22px', fontWeight: '800', color: '#27864a' }}>{resumen.cumplieron ?? 0}</div>
                                <small style={{ color: '#64748b', fontWeight: '700' }}>Sí cumplieron hoy</small>
                            </div>
                            <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '22px', fontWeight: '800', color: '#c2410c' }}>{resumen.pendientes ?? 0}</div>
                                <small style={{ color: '#64748b', fontWeight: '700' }}>Aún no</small>
                            </div>
                            <div style={{ background: '#f5f3ff', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '22px', fontWeight: '800', color: '#6d28d9' }}>{resumen.novedadesHoy ?? 0}</div>
                                <small style={{ color: '#64748b', fontWeight: '700' }}>Novedades hoy</small>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            {[
                                { id: 'estado', label: 'Estado diario', icon: 'fa-clipboard-check' },
                                { id: 'historial', label: 'Historial de marcas', icon: 'fa-history' },
                                { id: 'novedades', label: 'Novedades', icon: 'fa-exclamation-circle' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={equipoTab === tab.id ? 'btn btn-institutional' : 'btn btn-back'}
                                    onClick={() => { setEquipoTab(tab.id); setEquipoPage(1); }}
                                    style={{ margin: 0, width: 'auto', padding: '10px 14px' }}
                                >
                                    <i className={`fas ${tab.icon}`}></i> {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="card" style={{ margin: '0 0 14px 0', padding: '14px', textAlign: 'left' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
                                <div style={{ gridColumn: 'span 2', minWidth: '220px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Buscar</label>
                                    <input
                                        type="search"
                                        placeholder="Nombre, documento, zona o detalle..."
                                        value={equipoSearch}
                                        onChange={(event) => { setEquipoSearch(event.target.value); setEquipoPage(1); }}
                                        style={filterStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Docente</label>
                                    <select value={equipoDocente} onChange={(e) => { setEquipoDocente(e.target.value); setEquipoPage(1); }} style={filterStyle}>
                                        <option value="ALL">Todos</option>
                                        {docentesEquipo.map((d) => (
                                            <option key={d.documento || d.nombre} value={d.nombre}>{d.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                {equipoTab === 'estado' && (
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Cumplimiento</label>
                                        <select value={equipoEstado} onChange={(e) => { setEquipoEstado(e.target.value); setEquipoPage(1); }} style={filterStyle}>
                                            <option value="ALL">Todos</option>
                                            <option value="si">Sí cumplió</option>
                                            <option value="no">Aún no</option>
                                        </select>
                                    </div>
                                )}
                                {equipoTab !== 'estado' && (
                                    <>
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Desde</label>
                                            <input type="date" value={equipoFechaDesde} max={equipoFechaHasta || undefined} onChange={(e) => { setEquipoFechaDesde(e.target.value); setEquipoPage(1); }} style={filterStyle} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Hasta</label>
                                            <input type="date" value={equipoFechaHasta} min={equipoFechaDesde || undefined} onChange={(e) => { setEquipoFechaHasta(e.target.value); setEquipoPage(1); }} style={filterStyle} />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <button
                                        type="button"
                                        className="btn btn-back"
                                        disabled={!hasEquipoFilters}
                                        onClick={() => {
                                            setEquipoSearch('');
                                            setEquipoEstado('ALL');
                                            setEquipoDocente('ALL');
                                            setEquipoFechaDesde('');
                                            setEquipoFechaHasta('');
                                            setEquipoPage(1);
                                        }}
                                        style={{ margin: 0, width: '100%' }}
                                    >
                                        <i className="fas fa-filter-circle-xmark"></i> Limpiar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {loadingEquipo && !equipoData ? (
                            <div style={{ padding: '35px', textAlign: 'center', color: '#64748b' }}>
                                <i className="fas fa-spinner fa-spin"></i> Cargando equipo...
                            </div>
                        ) : equipoTab === 'estado' ? (
                            <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                <table className="mini-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Docente</th>
                                            <th>Documento</th>
                                            <th>Estado hoy</th>
                                            <th>Marcas hoy</th>
                                            <th>Última marca</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageEquipoList.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>
                                                    No hay docentes que coincidan con los filtros.
                                                </td>
                                            </tr>
                                        ) : pageEquipoList.map((member) => (
                                            <tr key={member.documento} style={{ opacity: member.activo ? 1 : 0.7 }}>
                                                <td style={{ fontWeight: '700', color: 'var(--color-blue-dark)' }}>
                                                    {member.nombre}
                                                    {!member.activo && (
                                                        <small style={{ display: 'block', color: '#c0392b' }}>Inactivo</small>
                                                    )}
                                                </td>
                                                <td>{member.documento}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '4px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '11px',
                                                        fontWeight: '700',
                                                        background: member.cumplioHoy ? '#e8f8ee' : '#fff7ed',
                                                        color: member.cumplioHoy ? '#27864a' : '#c2410c'
                                                    }}>
                                                        {member.cumplioHoy ? 'Sí cumplió' : 'Aún no'}
                                                    </span>
                                                </td>
                                                <td>{member.registrosHoy}</td>
                                                <td>
                                                    {member.ultimoRegistro
                                                        ? `${new Date(member.ultimoRegistro.timestamp).toLocaleString()} (${member.ultimoRegistro.zonaAlias || 'Zona'})`
                                                        : 'Sin marcas'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : equipoTab === 'historial' ? (
                            <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                <table className="mini-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Fecha/Hora</th>
                                            <th>Docente</th>
                                            <th>Zona</th>
                                            <th>Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageEquipoList.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>
                                                    No hay marcas con los filtros actuales.
                                                </td>
                                            </tr>
                                        ) : pageEquipoList.map((registro) => {
                                            const zone = zones.find((z) => z.id === registro.zonaId || z.alias === registro.zonaAlias);
                                            return (
                                                <tr key={registro.id}>
                                                    <td>{new Date(registro.timestamp).toLocaleString()}</td>
                                                    <td style={{ fontWeight: '700' }}>{registro.usuarioNombre || registro.usuarioId}</td>
                                                    <td>{zone?.nombre || registro.zonaAlias || '—'}</td>
                                                    <td style={{ color: '#64748b', fontSize: '12px' }}>
                                                        {registro.distancia ? `Escaneado a ${Math.round(registro.distancia)}m` : 'Escaneado en punto'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {pageEquipoList.length === 0 ? (
                                    <div style={{ padding: '28px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                                        No hay novedades con los filtros actuales.
                                    </div>
                                ) : pageEquipoList.map((novedad) => (
                                    <div
                                        key={novedad.id}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderLeft: '4px solid #f39c12',
                                            borderRadius: '12px',
                                            padding: '12px',
                                            background: 'white',
                                            display: 'grid',
                                            gridTemplateColumns: novedad.mediaUrl ? '72px 1fr' : '1fr',
                                            gap: '10px',
                                            alignItems: 'start'
                                        }}
                                    >
                                        {novedad.mediaUrl && (
                                            <button
                                                type="button"
                                                onClick={() => Swal.fire({ imageUrl: novedad.mediaUrl, imageAlt: 'Evidencia', confirmButtonText: 'Cerrar', confirmButtonColor: '#212121' })}
                                                style={{
                                                    width: '72px',
                                                    height: '72px',
                                                    padding: 0,
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    background: '#0f172a',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <img
                                                    src={novedad.mediaUrl}
                                                    alt="Evidencia"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                />
                                            </button>
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                                <strong style={{ color: 'var(--color-blue-dark)', fontSize: '13px' }}>
                                                    {novedad.usuarioNombre || novedad.usuarioId || 'Sin autor'}
                                                </strong>
                                                <small style={{ color: '#64748b' }}>
                                                    {new Date(novedad.timestamp).toLocaleString()}
                                                </small>
                                            </div>
                                            <p style={{
                                                margin: '6px 0',
                                                color: '#334155',
                                                fontSize: '13px',
                                                lineHeight: 1.4,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden'
                                            }}>
                                                {novedad.detalle}
                                            </p>
                                            <small style={{ color: '#64748b' }}>
                                                Área: {novedad.area || 'General'} · Tipo: {novedad.tipo || 'INCIDENCIA'}
                                            </small>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <PaginationBar
                            page={eqPager.page}
                            totalPages={eqPager.totalPages}
                            total={eqPager.total}
                            from={eqPager.from}
                            to={eqPager.to}
                            label={equipoTab === 'novedades' ? 'novedades' : 'registros'}
                            onPrev={() => setEquipoPage((p) => Math.max(1, p - 1))}
                            onNext={() => setEquipoPage((p) => Math.min(eqPager.totalPages, p + 1))}
                        />
                    </div>
                );
            })()}

            {view === 'scanner' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--color-blue-dark)' }}>Escáner de Ronda</h3>
                        <button className="btn btn-dark" onClick={() => setView('main')} style={{ margin: 0, padding: '5px 15px' }}>
                            <i className="fas fa-times"></i> Salir
                        </button>
                    </div>
                    <Suspense fallback={<p style={{ textAlign: 'center', color: '#888' }}>Cargando cámara...</p>}>
                        <QRScanner onScanSuccess={handleScanSuccess} />
                    </Suspense>
                    <div style={{ marginTop: '20px', padding: '15px', background: 'var(--color-gray-bg)', borderRadius: '10px', fontSize: '12px', color: '#666' }}>
                        <p style={{ margin: 0 }}><b>Tip de Escaneo:</b> Asegúrese de tener buena iluminación y mantenga el código en el centro del recuadro.</p>
                    </div>
                </div>
            )}

            {view === 'history' && (
                <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0, width: 'auto' }}>
                            <i className="fas fa-arrow-left"></i> Volver al Menú
                        </button>
                        <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', flex: 1, minWidth: '200px' }}>📜 Mi Historial Personal</h3>
                    </div>

                    {/* Stats Scorecards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '15px',
                        width: '100%'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #0077c2, #00a2ff)',
                            borderRadius: '16px',
                            padding: '20px',
                            color: 'white',
                            textAlign: 'center',
                            boxShadow: '0 8px 20px rgba(0, 119, 194, 0.15)'
                        }}>
                            <i className="fas fa-route" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.9 }}></i>
                            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Rondas Realizadas</div>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>{registros.length}</div>
                        </div>

                        <div style={{
                            background: 'linear-gradient(135deg, #6ab04c, #4cd137)',
                            borderRadius: '16px',
                            padding: '20px',
                            color: 'white',
                            textAlign: 'center',
                            boxShadow: '0 8px 20px rgba(106, 176, 76, 0.15)'
                        }}>
                            <i className="fas fa-cookie-bite" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.9 }}></i>
                            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Puntos SNACK Visitados</div>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>
                                {registros.filter(r => {
                                    const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
                                    return zone?.tipo === 'SNACK';
                                }).length}
                            </div>
                        </div>

                        <div style={{
                            background: 'linear-gradient(135deg, #2980b9, #3498db)',
                            borderRadius: '16px',
                            padding: '20px',
                            color: 'white',
                            textAlign: 'center',
                            boxShadow: '0 8px 20px rgba(41, 128, 185, 0.15)'
                        }}>
                            <i className="fas fa-utensils" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.9 }}></i>
                            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Puntos LUNCH Visitados</div>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>
                                {registros.filter(r => {
                                    const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
                                    return zone?.tipo === 'LUNCH';
                                }).length}
                            </div>
                        </div>
                    </div>

                    {/* Search filter card */}
                    <div className="card" style={{ padding: '20px', margin: 0, textAlign: 'left' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
                            <div style={{ gridColumn: 'span 2', minWidth: '220px', position: 'relative' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Buscar</label>
                                <input
                                    type="text"
                                    placeholder="Zona, alias, tipo o fecha..."
                                    value={historySearch}
                                    onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                                    style={{
                                        borderRadius: '12px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        fontSize: '14px',
                                        margin: 0,
                                        width: '100%',
                                        textAlign: 'left'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Tipo</label>
                                <select
                                    value={historyTipo}
                                    onChange={(e) => { setHistoryTipo(e.target.value); setHistoryPage(1); }}
                                    style={{ margin: 0, width: '100%', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 12px' }}
                                >
                                    <option value="ALL">Todos</option>
                                    <option value="SNACK">SNACK</option>
                                    <option value="LUNCH">LUNCH</option>
                                    <option value="OTRO">OTRO</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Desde</label>
                                <input type="date" value={historyFechaDesde} max={historyFechaHasta || undefined} onChange={(e) => { setHistoryFechaDesde(e.target.value); setHistoryPage(1); }} style={{ margin: 0, width: '100%', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 12px' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Hasta</label>
                                <input type="date" value={historyFechaHasta} min={historyFechaDesde || undefined} onChange={(e) => { setHistoryFechaHasta(e.target.value); setHistoryPage(1); }} style={{ margin: 0, width: '100%', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 12px' }} />
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-back"
                                    onClick={() => {
                                        setHistorySearch('');
                                        setHistoryTipo('ALL');
                                        setHistoryFechaDesde('');
                                        setHistoryFechaHasta('');
                                        setHistoryPage(1);
                                    }}
                                    style={{ margin: 0, width: '100%' }}
                                >
                                    <i className="fas fa-filter-circle-xmark"></i> Limpiar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table of History Records */}
                    {(() => {
                        const filteredRegs = registros.filter(r => {
                            const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
                            const zoneName = (zone?.nombre || '').toLowerCase();
                            const zoneAlias = (zone?.alias || r.zonaAlias || '').toLowerCase();
                            const dateStr = new Date(r.timestamp).toLocaleString().toLowerCase();
                            const tipo = zone?.tipo || 'OTRO';
                            const typeStr = tipo.toLowerCase();
                            const search = historySearch.toLowerCase();
                            const matchesSearch = !search
                                || zoneName.includes(search)
                                || zoneAlias.includes(search)
                                || dateStr.includes(search)
                                || typeStr.includes(search);
                            const matchesTipo = historyTipo === 'ALL'
                                || (historyTipo === 'OTRO' ? !['SNACK', 'LUNCH'].includes(tipo) : tipo === historyTipo);
                            const d = new Date(r.timestamp);
                            const key = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
                            const matchesDesde = !historyFechaDesde || (key && key >= historyFechaDesde);
                            const matchesHasta = !historyFechaHasta || (key && key <= historyFechaHasta);
                            return matchesSearch && matchesTipo && matchesDesde && matchesHasta;
                        });

                        const histPager = slicePage(filteredRegs, historyPage, 10);
                        const pageHistRegs = histPager.pageItems;

                        return (
                            <div className="card" style={{ padding: '20px', margin: 0 }}>
                                <p style={{ margin: '0 0 10px 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                                    {histPager.total ? `Mostrando ${histPager.from}–${histPager.to} de ${histPager.total}` : 'Sin registros'}
                                </p>
                                <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table className="mini-table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-primary))' }}>
                                                <th style={{ color: 'white', padding: '12px 15px' }}>Fecha/Hora</th>
                                                <th style={{ color: 'white', padding: '12px 15px' }}>Zona / Ubicación</th>
                                                <th style={{ color: 'white', padding: '12px 15px' }}>Tipo</th>
                                                <th style={{ color: 'white', padding: '12px 15px' }}>Detalles</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRegs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#888', fontWeight: '500' }}>
                                                        <i className="fas fa-folder-open" style={{ fontSize: '24px', display: 'block', marginBottom: '8px', color: '#cbd5e1' }}></i>
                                                        No se encontraron registros de rondas.
                                                    </td>
                                                </tr>
                                            ) : (
                                                pageHistRegs.map(r => {
                                                    const zone = zones.find(z => z.id === r.zonaId || z.alias === r.zonaAlias);
                                                    const dateStr = new Date(r.timestamp).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                    return (
                                                        <tr key={r.id} style={{ transition: 'background-color 0.2s' }}>
                                                            <td style={{ padding: '12px 15px', fontWeight: '500' }}>{dateStr}</td>
                                                            <td style={{ padding: '12px 15px', fontWeight: '700', color: 'var(--color-blue-dark)' }}>
                                                                {zone?.nombre || r.zonaAlias} <span style={{ fontWeight: 'normal', color: '#64748b', fontSize: '12px' }}>({zone?.alias || r.zonaAlias})</span>
                                                            </td>
                                                            <td style={{ padding: '12px 15px' }}>
                                                                <span style={{
                                                                    padding: '5px 10px',
                                                                    borderRadius: '8px',
                                                                    fontSize: '11px',
                                                                    color: 'white',
                                                                    fontWeight: 'bold',
                                                                    display: 'inline-block',
                                                                    background: zone?.tipo === 'SNACK' ? 'linear-gradient(135deg, #6AB04C, #589c3a)' : zone?.tipo === 'LUNCH' ? 'linear-gradient(135deg, #2980B9, #1f618d)' : 'linear-gradient(135deg, #7f8c8d, #626567)'
                                                                }}>
                                                                    {zone?.tipo || 'ORD.'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '12px 15px', fontSize: '12px', color: '#64748b' }}>
                                                                {r.distancia ? `Escaneado a ${Math.round(r.distancia)}m` : 'Escaneado en punto'}
                                                                {r.novedad && (
                                                                    <div style={{ color: 'var(--color-red-primary)', fontWeight: 'bold', marginTop: '2px' }}>
                                                                        <i className="fas fa-exclamation-circle"></i> Novedad registrada
                                                                    </div>
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
                                    page={histPager.page}
                                    totalPages={histPager.totalPages}
                                    total={histPager.total}
                                    from={histPager.from}
                                    to={histPager.to}
                                    onPrev={() => setHistoryPage((p) => Math.max(1, p - 1))}
                                    onNext={() => setHistoryPage((p) => Math.min(histPager.totalPages, p + 1))}
                                />
                            </div>
                        );
                    })()}
                </div>
            )}

            <div className={`gps-status ${location.error ? 'gps-error' : location.loaded ? 'gps-good' : 'gps-warning'}`}
                style={{
                    marginTop: '20px',
                    fontSize: '13px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: location.error ? '#ffebee' : location.loaded ? '#f1f8e9' : '#fff3e0',
                    color: location.error ? '#c62828' : location.loaded ? '#2e7d32' : '#ef6c00',
                    border: `1px solid ${location.error ? '#ffcdd2' : location.loaded ? '#c5e1a5' : '#ffe0b2'}`,
                    textAlign: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`fas ${location.error ? 'fa-exclamation-triangle' : location.loaded ? 'fa-satellite-dish' : 'fa-spinner fa-spin'}`}></i>
                    <span style={{ fontWeight: '800' }}>
                        {location.error
                            ? `Error GPS: ${location.error.code === 1 ? 'Permiso denegado' : location.error.code === 3 ? 'Tiempo agotado' : 'Falla de señal'}`
                            : location.loaded
                                ? `GPS Activo (±${Math.round(location.accuracy)}m)`
                                : 'Buscando Ubicación...'}
                    </span>
                </div>

                {location.error ? (
                    <button
                        onClick={() => location.refreshGPS()}
                        style={{
                            background: '#c62828', color: 'white', border: 'none', padding: '5px 15px',
                            borderRadius: '15px', fontSize: '11px', fontWeight: 'bold', marginTop: '5px'
                        }}
                    >
                        <i className="fas fa-sync"></i> ACTIVAR CÁMARA GPS
                    </button>
                ) : (
                    <button
                        onClick={() => location.refreshGPS()}
                        style={{
                            background: 'transparent', color: location.loaded ? '#2e7d32' : '#ef6c00',
                            border: `1px solid ${location.loaded ? '#2e7d32' : '#ef6c00'}`,
                            padding: '2px 10px', borderRadius: '10px', fontSize: '10px', marginTop: '3px'
                        }}
                    >
                        Re-sincronizar Ubicación
                    </button>
                )}
            </div>
        </div>
    );
};

export default DashboardDocente;
