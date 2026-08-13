import React, { useState, useEffect } from 'react';
import { getZonas, getUsuarios, getRegistros, getLogs, createZona, createUsuario, deleteUsuario, setUsuarioActivo, setZonaActiva, updateZona, createLog, createComunicado, importUsuariosBulk, getHorarios, saveHorarios, updateUsuario, getComunicadosEnviados, downloadBackup, restoreBackup, purgeOldData } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import Swal from 'sweetalert2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, DoughnutController } from 'chart.js';
import { Pie, Bar, Doughnut } from 'react-chartjs-2';
import LiveSupervision from '../components/LiveSupervision';
import CumplimientoVigilancias from '../components/CumplimientoVigilancias';
import { downloadExcelCsv, downloadExcelCsvTemplate, formatDateTimeForExcel } from '../utils/exportCsv';
import { downloadPdfTable } from '../utils/exportPdf';
import { PaginationBar, slicePage } from '../components/PaginationBar';
import ComunicadosHistorial from '../components/ComunicadosHistorial';
import {
    getUsuarioFieldError,
    isValidGrupo,
    sanitizeDocumentoInput,
    sanitizeNombreInput
} from '../utils/userFieldValidation';
import { showSecurityPolicies } from '../utils/securityPolicies';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, DoughnutController);

const DashboardAdmin = () => {
    const [view, setView] = useState('main'); // 'main', 'zones', 'users', 'logs', 'kpis', 'schedules', 'live', 'cumplimiento'
    const [zones, setZones] = useState([]);
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [registros, setRegistros] = useState([]);
    const [kpis, setKpis] = useState({ totalRegistros: 0, zonasActivas: 0, usuariosRegistrados: 0 });
    const [alias, setAlias] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [horario, setHorario] = useState('06:00-18:00');
    const [selectedQR, setSelectedQR] = useState(null);
    const [selectedZoneId, setSelectedZoneId] = useState('');
    const [zoneSearch, setZoneSearch] = useState('');
    const [logsSearch, setLogsSearch] = useState('');
    const [logsUsuario, setLogsUsuario] = useState('ALL');
    const [logsTipo, setLogsTipo] = useState('ALL');
    const [logsFechaDesde, setLogsFechaDesde] = useState('');
    const [logsFechaHasta, setLogsFechaHasta] = useState('');

    // Schedules State
    const [schedules, setSchedules] = useState([]);
    const [schedulesSearch, setSchedulesSearch] = useState('');
    const [schedulesEdit, setSchedulesEdit] = useState({});
    const [refDate, setRefDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleData, setScheduleData] = useState([]);

    // User Creation State
    const [uNombre, setUNombre] = useState('');
    const [uDocumento, setUDocumento] = useState('');
    const [uEmail, setUEmail] = useState('');
    const [uRol, setURol] = useState('DOCENTE');
    const [uGrupo, setUGrupo] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('ALL');
    const [userGroupFilter, setUserGroupFilter] = useState('ALL');
    const [userEstadoFilter, setUserEstadoFilter] = useState('ALL'); // ALL | activo | inactivo
    const [zoneTipoFilter, setZoneTipoFilter] = useState('ALL');
    const [zoneEstadoFilter, setZoneEstadoFilter] = useState('ALL'); // ALL | activo | inactivo
    const [kpiSearch, setKpiSearch] = useState('');
    const [kpiTipoFilter, setKpiTipoFilter] = useState('ALL');
    const [kpiDocenteFilter, setKpiDocenteFilter] = useState('ALL');
    const [logsPage, setLogsPage] = useState(1);
    const [usersPage, setUsersPage] = useState(1);
    const [kpiPage, setKpiPage] = useState(1);
    const [schedulesPage, setSchedulesPage] = useState(1);
    const [assignUserId, setAssignUserId] = useState('');
    const [assignZoneId, setAssignZoneId] = useState('');
    const [assignDays, setAssignDays] = useState([]);
    const [showScheduleOverview, setShowScheduleOverview] = useState(false);
    const [overviewDayFilter, setOverviewDayFilter] = useState('ALL');
    const [bulkPreview, setBulkPreview] = useState([]);
    const [bulkPreviewErrors, setBulkPreviewErrors] = useState([]);
    const [bulkFileName, setBulkFileName] = useState('');
    const [bulkImporting, setBulkImporting] = useState(false);
    const [comunicadosEnviados, setComunicadosEnviados] = useState([]);
    const [loadingComunicadosEnviados, setLoadingComunicadosEnviados] = useState(false);
    const [comunicadosPage, setComunicadosPage] = useState(1);
    const [comunicadoMsg, setComunicadoMsg] = useState('');
    const [comunicadoDest, setComunicadoDest] = useState('ALL');

    const session = JSON.parse(localStorage.getItem('usuario_cny_2026'));
    const adminUser = session?.datos;

    // API-based data fetching (no Firebase refs needed)

    const logAction = async (accion) => {
        try {
            await createLog({
                usuario: adminUser?.nombre || 'Admin',
                documento: adminUser?.documento || 'N/A',
                accion
            });
        } catch (e) { console.error("Error logging action:", e); }
    };

    const fetchData = async () => {
        try {
            if (view === 'zones') {
                const data = await getZonas();
                setZones(data);
            } else if (view === 'users') {
                const data = await getUsuarios();
                setUsers(data);
            } else if (view === 'logs') {
                const data = await getLogs();
                setLogs(data);
            } else if (view === 'schedules') {
                const zonesData = await getZonas();
                const usersList = await getUsuarios();
                const scheds = await getHorarios();
                setZones(zonesData);
                setUsers(usersList);
                setSchedules(scheds);
                
                // Initialize edits state with existing database entries
                const initialEdits = {};
                scheds.forEach(s => {
                    initialEdits[`${s.usuarioId}-${s.diaCiclo}`] = s.zonaId;
                });
                setSchedulesEdit(initialEdits);
            } else if (view === 'kpis' || view === 'main') {
                const regsList = await getRegistros();
                const zonesData = await getZonas();
                const usersList = await getUsuarios();

                setRegistros(regsList);
                setUsers(usersList);
                setZones(zonesData);

                setKpis({
                    totalRegistros: regsList.length,
                    zonasActivas: zonesData.filter((z) => !(
                        z?.activo === false
                        || z?.activo === 0
                        || z?.activo === '0'
                        || z?.activo === 'f'
                        || z?.activo === 'false'
                    )).length,
                    usuariosRegistrados: usersList.length
                });
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    useEffect(() => {
        fetchData();
        if (view === 'comunicados') {
            fetchComunicadosEnviados();
        }
    }, [view]);

    const handleCreateZone = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Agregar Nueva Zona',
            html: `
                <div style="text-align: left;">
                    <label style="font-weight:bold; font-size:13px; color:#555;">Nombre de la Zona:</label>
                    <input id="swal-name" class="swal2-input" placeholder="Ej. Cancha de Fútbol">
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Alias de la Zona (Ej. C3A):</label>
                    <input id="swal-alias" class="swal2-input" placeholder="Ej. C3A">
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Horario de Vigilancia:</label>
                    <input id="swal-horario" class="swal2-input" placeholder="Ej. 06:00-18:00" value="06:00-18:00">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div>
                            <label style="font-weight:bold; font-size:13px; color:#555;">Latitud:</label>
                            <input id="swal-lat" type="number" step="any" class="swal2-input" placeholder="Ej. 4.71098">
                        </div>
                        <div>
                            <label style="font-weight:bold; font-size:13px; color:#555;">Longitud:</label>
                            <input id="swal-lng" type="number" step="any" class="swal2-input" placeholder="Ej. -74.072092">
                        </div>
                    </div>
                    
                    <button type="button" id="swal-btn-gps" class="btn btn-dark" style="margin: 0 0 15px 0; padding: 10px; font-size: 13px; width: 100%;">
                        <i class="fas fa-location-arrow"></i> Obtener Ubicación Actual
                    </button>
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Tipo de Zona:</label>
                    <select id="swal-tipo" class="swal2-input">
                        <option value="SNACK">SNACK</option>
                        <option value="LUNCH">LUNCH</option>
                        <option value="OTRO">OTRO</option>
                    </select>
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Actividad:</label>
                    <textarea id="swal-actividad" class="swal2-textarea" placeholder="Instrucciones para el vigilante..."></textarea>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Crear Zona',
            cancelButtonText: 'Cancelar',
            didOpen: () => {
                const gpsBtn = document.getElementById('swal-btn-gps');
                if (gpsBtn) {
                    gpsBtn.onclick = () => {
                        if (navigator.geolocation) {
                            gpsBtn.disabled = true;
                            gpsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Obteniendo ubicación...';
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    document.getElementById('swal-lat').value = position.coords.latitude.toFixed(7);
                                    document.getElementById('swal-lng').value = position.coords.longitude.toFixed(7);
                                    gpsBtn.disabled = false;
                                    gpsBtn.innerHTML = '<i class="fas fa-check"></i> ¡Ubicación obtenida!';
                                    gpsBtn.style.background = 'var(--color-green-primary)';
                                },
                                (error) => {
                                    console.error(error);
                                    gpsBtn.disabled = false;
                                    gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Obtener Ubicación Actual';
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Error de GPS',
                                        text: 'No se pudo obtener la ubicación. Asegúrese de dar permisos y tener activo el GPS.',
                                        toast: true,
                                        position: 'top-end',
                                        showConfirmButton: false,
                                        timer: 3000
                                    });
                                },
                                { enableHighAccuracy: true, timeout: 10000 }
                            );
                        } else {
                            Swal.fire('Error', 'Geolocalización no soportada por su navegador.', 'error');
                        }
                    };
                }
            },
            preConfirm: () => {
                const nombre = document.getElementById('swal-name').value.trim();
                const alias = document.getElementById('swal-alias').value.trim();
                const horario = document.getElementById('swal-horario').value.trim();
                const latVal = document.getElementById('swal-lat').value.trim();
                const lngVal = document.getElementById('swal-lng').value.trim();
                const tipo = document.getElementById('swal-tipo').value;
                const actividad = document.getElementById('swal-actividad').value.trim();

                if (!nombre || !alias || !latVal || !lngVal || !horario) {
                    Swal.showValidationMessage('Por favor rellene todos los campos requeridos');
                    return false;
                }

                return {
                    nombre,
                    alias,
                    horario,
                    latitud: parseFloat(latVal),
                    longitud: parseFloat(lngVal),
                    tipo,
                    actividad
                };
            }
        });

        if (formValues) {
            try {
                const result = await createZona(formValues);
                await logAction(`Zona creada: ${formValues.alias}`);
                Swal.fire(
                    result?.reactivated ? 'Zona reactivada' : '¡Creada!',
                    result?.message || 'La nueva zona ha sido agregada con éxito.',
                    'success'
                );
                fetchData();
            } catch (e) {
                console.error(e);
                Swal.fire('Error', e.message || 'No se pudo crear la zona.', 'error');
            }
        }
    };

    const addUsuario = async () => {
        const nombre = String(uNombre || '').trim().replace(/\s+/g, ' ');
        const documento = String(uDocumento || '').trim();
        const email = String(uEmail || '').trim().toLowerCase();
        const grupo = String(uGrupo || '').trim();

        const fieldError = getUsuarioFieldError({ nombre, documento, email, grupo });
        if (fieldError) {
            Swal.fire('Atención', fieldError, 'warning');
            return;
        }

        // Duplicados en cliente (rápido); la API vuelve a validar
        const docNorm = documento;
        const emailNorm = email;
        const dupDoc = users.find((u) => String(u.documento).trim() === docNorm);
        const dupEmail = users.find(
            (u) => String(u.email || '').trim().toLowerCase() === emailNorm && String(u.documento).trim() !== docNorm
        );

        if (dupDoc) {
            Swal.fire('Documento duplicado', `Ya existe un usuario con el documento ${docNorm}`, 'warning');
            return;
        }
        if (dupEmail) {
            Swal.fire('Correo duplicado', `El correo ${emailNorm} ya está registrado en otro usuario`, 'warning');
            return;
        }

        try {
            await createUsuario({
                nombre,
                documento: docNorm,
                email: emailNorm,
                rol: uRol === 'ADMIN' ? 'ADMINISTRADOR GENERAL' : uRol,
                grupo
            });
            Swal.fire('Éxito', 'Usuario creado correctamente', 'success');
            setUNombre('');
            setUDocumento('');
            setUEmail('');
            setURol('DOCENTE');
            setUGrupo('');
            fetchData();
        } catch (error) {
            Swal.fire('Error', error.message || 'No se pudo crear el usuario', 'error');
        }
    };

    const downloadUsersTemplate = () => {
        downloadExcelCsvTemplate(
            ['nombre', 'documento', 'email', 'rol', 'grupo'],
            'plantilla_oficial_usuarios_cny'
        );
    };

    const parseCsvLine = (line, separator) => {
        const values = [];
        let value = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (insideQuotes && line[i + 1] === '"') {
                    value += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === separator && !insideQuotes) {
                values.push(value.trim());
                value = '';
            } else {
                value += char;
            }
        }
        values.push(value.trim());
        return values;
    };

    const handleCSVImport = async (e) => {
        const input = e.target;
        const file = input.files[0];
        if (!file) return;

        clearBulkPreview();
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const text = String(evt.target.result || '').replace(/^\uFEFF/, '');
                const lines = text.split(/\r?\n/);
                const dataLines = lines.slice(1).filter((line) => line.trim());
                if (!lines[0]?.trim() || dataLines.length === 0) {
                    Swal.fire('Error', 'El archivo CSV está vacío o no tiene datos.', 'error');
                    return;
                }

                const headerLine = lines[0];
                const separator = headerLine.includes(';') ? ';' : ',';
                const normalizeHeader = (value) => String(value || '')
                    .trim()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/"/g, '');
                const headers = parseCsvLine(headerLine, separator).map(normalizeHeader);

                const requiredHeaders = ['nombre', 'documento', 'email', 'rol'];
                const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
                if (missingHeaders.length > 0) {
                    Swal.fire(
                        'Plantilla no válida',
                        `Faltan las columnas obligatorias: ${missingHeaders.join(', ')}. Descargue y use la plantilla oficial.`,
                        'error'
                    );
                    return;
                }

                const usuariosImportados = [];
                const localErrors = [];
                const usedDocuments = new Set(
                    users.map((user) => String(user.documento || '').trim()).filter(Boolean)
                );
                const usedEmails = new Set(
                    users.map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean)
                );
                const allowedRoles = new Set([
                    'DOCENTE',
                    'JEFE DE AREA',
                    'DIRECTOR',
                    'ASISTENTE',
                    'ADMINISTRADOR GENERAL'
                ]);

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const values = parseCsvLine(line, separator);
                    const isEmptyRow = values.every((v) => String(v || '').trim() === '');
                    if (isEmptyRow) continue;

                    const userObj = { _fila: i + 1 };
                    headers.forEach((header, index) => {
                        const val = String(values[index] || '').trim();
                        if (val === undefined || val === null) return;

                        if (header === 'nombre' || header === 'nombre completo') userObj.nombre = val;
                        else if (header === 'documento' || header === 'id' || header === 'cedula' || header === 'identificacion') userObj.documento = val;
                        else if (header === 'rol' || header === 'role') userObj.rol = val;
                        else if (header === 'grupo' || header === 'area' || header === 'grupoarea') userObj.grupo = val;
                        else if (header === 'email' || header === 'correo' || header === 'mail') userObj.email = val;
                    });

                    userObj.email = String(userObj.email || '').toLowerCase();
                    userObj.nombre = String(userObj.nombre || '').trim().replace(/\s+/g, ' ');
                    userObj.documento = String(userObj.documento || '').trim();
                    userObj.grupo = String(userObj.grupo || '').trim();
                    userObj.rol = String(userObj.rol || '').toUpperCase();
                    if (userObj.rol === 'ADMIN') userObj.rol = 'ADMINISTRADOR GENERAL';
                    if (userObj.rol === 'JEFE AREA') userObj.rol = 'JEFE DE AREA';

                    let motivo = getUsuarioFieldError({
                        nombre: userObj.nombre,
                        documento: userObj.documento,
                        email: userObj.email,
                        grupo: userObj.grupo
                    });
                    if (!motivo && !userObj.rol) motivo = 'El rol es obligatorio';
                    else if (!motivo && !allowedRoles.has(userObj.rol)) motivo = `Rol no válido: ${userObj.rol}`;
                    else if (!motivo && usedDocuments.has(userObj.documento)) motivo = 'El documento ya está registrado o repetido en el archivo';
                    else if (!motivo && usedEmails.has(userObj.email)) motivo = 'El correo ya está registrado o repetido en el archivo';

                    if (motivo) {
                        localErrors.push({
                            fila: i + 1,
                            documento: userObj.documento || '',
                            email: userObj.email || '',
                            motivo
                        });
                    } else {
                        usuariosImportados.push(userObj);
                        usedDocuments.add(userObj.documento);
                        usedEmails.add(userObj.email);
                    }
                }

                setBulkPreview(usuariosImportados);
                setBulkPreviewErrors(localErrors);
                setBulkFileName(file.name);

                Swal.fire({
                    icon: localErrors.length ? 'warning' : 'success',
                    title: 'Vista previa preparada',
                    text: `${usuariosImportados.length} fila(s) lista(s) para crear y ${localErrors.length} fila(s) con error. Revise la vista previa antes de confirmar.`,
                    confirmButtonText: 'Revisar'
                });
            } catch (error) {
                console.error('Error al importar CSV:', error);
                Swal.fire('Error', 'Hubo un error al procesar el archivo CSV: ' + error.message, 'error');
            } finally {
                input.value = '';
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const clearBulkPreview = () => {
        setBulkPreview([]);
        setBulkPreviewErrors([]);
        setBulkFileName('');
    };

    const confirmBulkImport = async () => {
        if (!bulkPreview.length || bulkImporting) return;

        const confirmation = await Swal.fire({
            icon: 'question',
            title: '¿Crear los usuarios?',
            text: `Se intentarán crear ${bulkPreview.length} usuario(s).`,
            showCancelButton: true,
            confirmButtonText: 'Sí, crear usuarios',
            cancelButtonText: 'Cancelar'
        });
        if (!confirmation.isConfirmed) return;

        setBulkImporting(true);
        try {
            Swal.fire({
                title: 'Importando...',
                text: `Procesando ${bulkPreview.length} usuario(s)...`,
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const result = await importUsuariosBulk(bulkPreview);
            const allErrors = [...bulkPreviewErrors, ...(result.errors || [])];
            const escapeHtml = (value) => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            const shownErrors = allErrors.slice(0, 20);
            const errorsHtml = shownErrors.length
                ? `
                    <div style="max-height:260px; overflow:auto; margin-top:12px;">
                        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                            <thead>
                                <tr>
                                    <th style="padding:6px; border-bottom:1px solid #ddd;">Fila</th>
                                    <th style="padding:6px; border-bottom:1px solid #ddd;">Documento</th>
                                    <th style="padding:6px; border-bottom:1px solid #ddd;">Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${shownErrors.map((error) => `
                                    <tr>
                                        <td style="padding:6px; border-bottom:1px solid #eee;">${escapeHtml(error.fila)}</td>
                                        <td style="padding:6px; border-bottom:1px solid #eee;">${escapeHtml(error.documento || '—')}</td>
                                        <td style="padding:6px; border-bottom:1px solid #eee;">${escapeHtml(error.motivo)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${allErrors.length > 20 ? `<p>Y ${allErrors.length - 20} error(es) más. Descargue el reporte completo.</p>` : ''}
                    </div>`
                : '';

            const decision = await Swal.fire({
                icon: allErrors.length ? (result.importedCount ? 'warning' : 'error') : 'success',
                title: allErrors.length ? 'Importación procesada con observaciones' : 'Importación completada',
                html: `
                    <div style="display:flex; gap:12px; justify-content:center; margin-bottom:10px;">
                        <div style="padding:12px 18px; background:#e8f8ee; border-radius:10px;">
                            <strong style="font-size:22px; color:#27864a;">${result.importedCount || 0}</strong><br/>
                            <span>creados</span>
                        </div>
                        <div style="padding:12px 18px; background:#fdecec; border-radius:10px;">
                            <strong style="font-size:22px; color:#c0392b;">${allErrors.length}</strong><br/>
                            <span>con error</span>
                        </div>
                    </div>
                    ${errorsHtml}
                `,
                confirmButtonText: 'Cerrar',
                showDenyButton: allErrors.length > 0,
                denyButtonText: 'Descargar errores CSV'
            });

            if (decision.isDenied) {
                downloadExcelCsv(
                    allErrors.map((error) => ({
                        Fila: error.fila,
                        Documento: error.documento || '',
                        Correo: error.email || '',
                        Motivo: error.motivo
                    })),
                    `errores_importacion_usuarios_${new Date().toISOString().slice(0, 10)}`
                );
            }

            clearBulkPreview();
            fetchData();
        } catch (error) {
            console.error('Error en importación masiva:', error);
            Swal.fire('Error', error.message || 'No se pudo completar la importación', 'error');
        } finally {
            setBulkImporting(false);
        }
    };

    const deleteItem = async (col, id) => {
        if (col === 'zonas') return;
        const result = await Swal.fire({
            title: '¿Confirmar eliminación?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#E74C3C',
            confirmButtonText: 'Eliminar'
        });
        if (result.isConfirmed) {
            try {
                if (col === 'usuarios') await deleteUsuario(id);
                await logAction(`Eliminado item en ${col}: ${id}`);
                fetchData();
                Swal.fire('Eliminado', 'Registro borrado con éxito', 'success');
            } catch (error) {
                Swal.fire('Error', 'No se pudo eliminar', 'error');
            }
        }
    };

    const isUsuarioActivo = (user) => !(
        user?.activo === false
        || user?.activo === 0
        || user?.activo === '0'
        || user?.activo === 'f'
        || user?.activo === 'false'
    );

    const isZonaActiva = (zone) => !(
        zone?.activo === false
        || zone?.activo === 0
        || zone?.activo === '0'
        || zone?.activo === 'f'
        || zone?.activo === 'false'
    );

    const toggleZonaActiva = async (zone) => {
        const currentlyActive = isZonaActiva(zone);
        const result = await Swal.fire({
            title: currentlyActive ? '¿Desactivar zona?' : '¿Reactivar zona?',
            html: currentlyActive
                ? `Se desactivará <strong>${zone.alias || zone.nombre}</strong>. Conservará su historial y no estará disponible para nuevas vigilancias.`
                : `Se reactivará <strong>${zone.alias || zone.nombre}</strong> y podrá usarse de nuevo.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: currentlyActive ? '#E74C3C' : '#27ae60',
            confirmButtonText: currentlyActive ? 'Sí, desactivar' : 'Sí, reactivar',
            cancelButtonText: 'Cancelar'
        });
        if (!result.isConfirmed) return;

        try {
            await setZonaActiva(zone.id, !currentlyActive);
            setZones((prev) => prev.map((z) => (
                String(z.id) === String(zone.id)
                    ? { ...z, activo: !currentlyActive }
                    : z
            )));
            setZoneEstadoFilter('ALL');
            await fetchData();
            Swal.fire(
                currentlyActive ? 'Zona desactivada' : 'Zona reactivada',
                currentlyActive
                    ? 'La zona quedó inactiva. Puede verla filtrando por “Inactivas”.'
                    : 'La zona ya está disponible nuevamente.',
                'success'
            );
        } catch (error) {
            Swal.fire('Error', error.message || 'No se pudo actualizar el estado de la zona', 'error');
        }
    };

    const toggleUsuarioActivo = async (user) => {
        const currentlyActive = isUsuarioActivo(user);
        const result = await Swal.fire({
            title: currentlyActive ? '¿Desactivar usuario?' : '¿Reactivar usuario?',
            html: currentlyActive
                ? `Se desactivará a <strong>${user.nombre}</strong>. Conservará su historial, pero no podrá iniciar sesión.`
                : `Se reactivará a <strong>${user.nombre}</strong> y podrá volver a iniciar sesión.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: currentlyActive ? '#E74C3C' : '#27ae60',
            confirmButtonText: currentlyActive ? 'Sí, desactivar' : 'Sí, reactivar',
            cancelButtonText: 'Cancelar'
        });
        if (!result.isConfirmed) return;

        try {
            if (currentlyActive) {
                await deleteUsuario(user.documento);
            } else {
                await setUsuarioActivo(user.documento, true);
            }
            fetchData();
            Swal.fire(
                currentlyActive ? 'Usuario desactivado' : 'Usuario reactivado',
                currentlyActive
                    ? 'El acceso fue bloqueado y el historial se conserva.'
                    : 'El usuario ya puede iniciar sesión nuevamente.',
                'success'
            );
        } catch (error) {
            Swal.fire('Error', error.message || 'No se pudo actualizar el estado del usuario', 'error');
        }
    };

    const escapeHtmlUser = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const viewUsuarioDetalles = (user) => {
        const area = user.grupo || user.grupoArea || user.area || '—';
        const activo = isUsuarioActivo(user);
        Swal.fire({
            title: 'Detalles del usuario',
            width: 520,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: 'var(--color-blue-dark)',
            html: `
                <div style="text-align:left; font-size:13px; color:#334155; line-height:1.5;">
                    <div style="display:grid; grid-template-columns:120px 1fr; gap:8px 12px;">
                        <div style="font-weight:700; color:#64748b;">Nombre</div>
                        <div>${escapeHtmlUser(user.nombre || '—')}</div>
                        <div style="font-weight:700; color:#64748b;">Documento</div>
                        <div>${escapeHtmlUser(user.documento || '—')}</div>
                        <div style="font-weight:700; color:#64748b;">Correo</div>
                        <div>${escapeHtmlUser(user.email || 'Sin correo')}</div>
                        <div style="font-weight:700; color:#64748b;">Rol</div>
                        <div>${escapeHtmlUser(user.rol || '—')}</div>
                        <div style="font-weight:700; color:#64748b;">Área / Grupo</div>
                        <div>${escapeHtmlUser(area)}</div>
                        <div style="font-weight:700; color:#64748b;">Estado</div>
                        <div style="font-weight:700; color:${activo ? '#27864a' : '#c0392b'};">
                            ${activo ? 'Activo' : 'Inactivo'}
                        </div>
                    </div>
                    <p style="margin:14px 0 0; font-size:11px; color:#94a3b8;">
                        Nombre, documento y correo no se editan aquí por integridad del historial.
                    </p>
                </div>
            `
        });
    };

    const editUsuario = async (user) => {
        const currentArea = user.grupo || user.grupoArea || user.area || '';
        const roles = [
            'DOCENTE',
            'JEFE DE AREA',
            'DIRECTOR',
            'ASISTENTE',
            'ADMINISTRADOR GENERAL'
        ];
        const roleOptions = roles.map((rol) => (
            `<option value="${rol}" ${String(user.rol || '') === rol ? 'selected' : ''}>${rol}</option>`
        )).join('');

        const { value: formValues } = await Swal.fire({
            title: 'Editar usuario',
            width: 480,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: 'var(--color-green-primary)',
            html: `
                <div style="text-align:left;">
                    <p style="margin:0 0 12px; font-size:12px; color:#64748b;">
                        Editando a <strong>${escapeHtmlUser(user.nombre || '')}</strong>
                        (Doc. ${escapeHtmlUser(user.documento || '')}). Solo se pueden cambiar área y rol.
                    </p>
                    <label style="font-weight:bold; font-size:13px; color:#555;">Rol</label>
                    <select id="swal-user-rol" class="swal2-input" style="width:100%;">
                        ${roleOptions}
                    </select>
                    <label style="font-weight:bold; font-size:13px; color:#555;">Área / Grupo</label>
                    <input id="swal-user-area" class="swal2-input" value="${escapeHtmlUser(currentArea)}" placeholder="Ej. Primaria, Bachillerato...">
                </div>
            `,
            preConfirm: () => {
                const rol = document.getElementById('swal-user-rol')?.value || '';
                const grupo = String(document.getElementById('swal-user-area')?.value || '').trim();
                if (!roles.includes(rol)) {
                    Swal.showValidationMessage('Seleccione un rol válido');
                    return false;
                }
                if (!isValidGrupo(grupo)) {
                    Swal.showValidationMessage('El grupo/área tiene caracteres no permitidos');
                    return false;
                }
                return { rol, grupo };
            }
        });

        if (!formValues) return;

        const prevRol = String(user.rol || '');
        const prevArea = String(currentArea || '');
        if (formValues.rol === prevRol && formValues.grupo === prevArea) {
            Swal.fire('Sin cambios', 'No se detectaron cambios en área o rol.', 'info');
            return;
        }

        try {
            await updateUsuario(user.documento, {
                rol: formValues.rol,
                grupo: formValues.grupo
            });
            await fetchData();
            Swal.fire('Guardado', 'Área y rol actualizados correctamente.', 'success');
        } catch (error) {
            Swal.fire('Error', error.message || 'No se pudo actualizar el usuario', 'error');
        }
    };

    const editZone = async (zone) => {
        const { value: formValues } = await Swal.fire({
            title: 'Editar Zona',
            html: `
                <div style="text-align: left;">
                    <label style="font-weight:bold; font-size:13px; color:#555;">Nombre de la Zona:</label>
                    <input id="swal-name" class="swal2-input" value="${zone.nombre || ''}">
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Alias de la Zona (Ej. C3A):</label>
                    <input id="swal-alias" class="swal2-input" value="${zone.alias || ''}">
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Horario de Vigilancia:</label>
                    <input id="swal-horario" class="swal2-input" value="${zone.horario || ''}">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div>
                            <label style="font-weight:bold; font-size:13px; color:#555;">Latitud:</label>
                            <input id="swal-lat" type="number" step="any" class="swal2-input" value="${zone.latitud || ''}">
                        </div>
                        <div>
                            <label style="font-weight:bold; font-size:13px; color:#555;">Longitud:</label>
                            <input id="swal-lng" type="number" step="any" class="swal2-input" value="${zone.longitud || ''}">
                        </div>
                    </div>
                    
                    <button type="button" id="swal-btn-gps" class="btn btn-dark" style="margin: 0 0 15px 0; padding: 10px; font-size: 13px; width: 100%;">
                        <i class="fas fa-location-arrow"></i> Obtener Ubicación Actual
                    </button>
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Tipo de Zona:</label>
                    <select id="swal-tipo" class="swal2-input">
                        <option value="SNACK" ${zone.tipo === 'SNACK' ? 'selected' : ''}>SNACK</option>
                        <option value="LUNCH" ${zone.tipo === 'LUNCH' ? 'selected' : ''}>LUNCH</option>
                        <option value="OTRO" ${zone.tipo === 'OTRO' ? 'selected' : ''}>OTRO</option>
                    </select>
                    
                    <label style="font-weight:bold; font-size:13px; color:#555;">Actividad:</label>
                    <textarea id="swal-actividad" class="swal2-textarea">${zone.actividad || ''}</textarea>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            cancelButtonText: 'Cancelar',
            didOpen: () => {
                const gpsBtn = document.getElementById('swal-btn-gps');
                if (gpsBtn) {
                    gpsBtn.onclick = () => {
                        if (navigator.geolocation) {
                            gpsBtn.disabled = true;
                            gpsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Obteniendo ubicación...';
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    document.getElementById('swal-lat').value = position.coords.latitude.toFixed(7);
                                    document.getElementById('swal-lng').value = position.coords.longitude.toFixed(7);
                                    gpsBtn.disabled = false;
                                    gpsBtn.innerHTML = '<i class="fas fa-check"></i> ¡Ubicación obtenida!';
                                    gpsBtn.style.background = 'var(--color-green-primary)';
                                },
                                (error) => {
                                    console.error(error);
                                    gpsBtn.disabled = false;
                                    gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Obtener Ubicación Actual';
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Error de GPS',
                                        text: 'No se pudo obtener la ubicación. Asegúrese de dar permisos y tener activo el GPS.',
                                        toast: true,
                                        position: 'top-end',
                                        showConfirmButton: false,
                                        timer: 3000
                                    });
                                },
                                { enableHighAccuracy: true, timeout: 10000 }
                            );
                        } else {
                            Swal.fire('Error', 'Geolocalización no soportada por su navegador.', 'error');
                        }
                    };
                }
            },
            preConfirm: () => {
                const nombre = document.getElementById('swal-name').value.trim();
                const alias = document.getElementById('swal-alias').value.trim();
                const horario = document.getElementById('swal-horario').value.trim();
                const latVal = document.getElementById('swal-lat').value.trim();
                const lngVal = document.getElementById('swal-lng').value.trim();
                const tipo = document.getElementById('swal-tipo').value;
                const actividad = document.getElementById('swal-actividad').value.trim();

                if (!nombre || !alias || !latVal || !lngVal || !horario) {
                    Swal.showValidationMessage('Por favor rellene todos los campos requeridos');
                    return false;
                }

                return {
                    nombre,
                    alias,
                    horario,
                    latitud: parseFloat(latVal),
                    longitud: parseFloat(lngVal),
                    tipo,
                    actividad
                }
            }
        });

        if (formValues) {
            try {
                await updateZona(zone.id, formValues);
                await logAction(`Zona editada: ${zone.alias}`);
                Swal.fire('¡Actualizado!', 'La zona ha sido modificada.', 'success');
                fetchData();
            } catch (e) {
                Swal.fire('Error', 'No se pudo actualizar la zona.', 'error');
            }
        }
    };

    const downloadQRImage = async () => {
        const node = document.getElementById('print-section');
        if (!node) return;

        Swal.fire({ title: 'Generando Imagen HD...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        try {
            const dataUrl = await toPng(node, {
                pixelRatio: 3, // High quality
                backgroundColor: '#ffffff',
                cacheBust: true
            });
            const link = document.createElement('a');
            link.download = `QR_${selectedQR.alias}_${selectedQR.nombre.replace(/\s+/g, '_')}.png`;
            link.href = dataUrl;
            link.click();
            Swal.close();
            Swal.fire('¡Éxito!', 'Imagen descargada en alta resolución.', 'success');
        } catch (error) {
            console.error('Error generating image:', error);
            if (Swal.isVisible()) Swal.close();
            Swal.fire('Error', 'No se pudo generar la imagen. Inténtelo de nuevo.', 'error');
        }
    };

    const runBackup = async () => {
        try {
            Swal.fire({ title: 'Generando backup…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const backup = await downloadBackup();
            const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup))}`;
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute('href', dataStr);
            downloadAnchorNode.setAttribute('download', `backup_vigilancia_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            await logAction('Backup completo descargado');
            Swal.fire('Backup listo', 'Se descargó el JSON con todas las tablas del sistema.', 'success');
        } catch (e) {
            Swal.fire('Error', e.message || 'No se pudo generar el backup', 'error');
        }
    };

    const runRestoreBackup = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const modeResult = await Swal.fire({
                    title: 'Restaurar backup',
                    html: 'Elija el modo de restauración:<br><br>'
                        + '<b>Reemplazar</b>: borra los datos actuales e importa el archivo.<br>'
                        + '<b>Fusionar</b>: inserta/actualiza sin vaciar tablas.',
                    icon: 'warning',
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: 'Reemplazar',
                    denyButtonText: 'Fusionar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#E74C3C'
                });
                if (modeResult.isDismissed) return;
                const mode = modeResult.isConfirmed ? 'replace' : 'merge';
                Swal.fire({ title: 'Restaurando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const result = await restoreBackup(data, mode);
                await logAction(`Backup restaurado (${mode})`);
                await fetchData();
                Swal.fire(
                    'Restauración lista',
                    result?.message || `Backup aplicado en modo ${mode}.`,
                    'success'
                );
            } catch (e) {
                Swal.fire('Error', e.message || 'No se pudo restaurar el backup', 'error');
            }
        };
        input.click();
    };

    const runPurgeRetencion = async () => {
        const confirm = await Swal.fire({
            title: '¿Liberar datos antiguos?',
            html: 'Se limpiaran registros, logs y novedades con más de <b>1 año</b>. '
                + 'Los datos más recientes se conservan (política de retención).',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#E74C3C',
            confirmButtonText: 'Sí, limpiar',
            cancelButtonText: 'Cancelar'
        });
        if (!confirm.isConfirmed) return;
        try {
            const result = await purgeOldData();
            await logAction('Limpiar por retención (≥1 año)');
            await fetchData();
            Swal.fire(
                'Purga completada',
                result?.message
                    || `Eliminados: ${result?.deleted?.registros || 0} registros, `
                    + `${result?.deleted?.logs || 0} logs, ${result?.deleted?.novedades || 0} novedades.`,
                'success'
            );
        } catch (e) {
            Swal.fire('Error', e.message || 'No se pudo ejecutar la purga', 'error');
        }
    };

    const clearAppCache = async () => {
        try {
            const keys = Object.keys(localStorage).filter((k) => k.startsWith('offline_queue_'));
            keys.forEach((k) => localStorage.removeItem(k));
            if (typeof caches !== 'undefined') {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map((k) => caches.delete(k)));
            }
            Swal.fire(
                'Caché limpia',
                `Se eliminaron ${keys.length} cola(s) offline y la caché del navegador. La sesión se mantiene.`,
                'success'
            );
        } catch (e) {
            Swal.fire('Error', e.message || 'No se pudo limpiar la caché', 'error');
        }
    };

    const showSystemInfo = () => {
        Swal.fire({
            icon: 'info',
            title: 'Info del Sistema',
            html: '<p><b>App:</b> Vigilancia QR CNY v1.0.0</p>'
        });
    };

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

    const enviarComunicadoForm = async () => {
        const text = String(comunicadoMsg || '').trim();
        if (!text) {
            Swal.fire('Atención', 'Escriba el mensaje del comunicado.', 'warning');
            return;
        }
        try {
            Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await createComunicado({
                mensaje: text,
                emisor: adminUser?.nombre,
                destinatario: comunicadoDest || 'ALL'
            });
            await logAction(`Comunicado enviado (destinatario: ${comunicadoDest || 'ALL'})`);
            setComunicadoMsg('');
            setComunicadosPage(1);
            await fetchComunicadosEnviados();
            Swal.fire('Enviado', 'El comunicado se ha registrado correctamente', 'success');
        } catch (e) {
            Swal.fire('Error', e.message || 'No se pudo enviar', 'error');
        }
    };

    const renderComunicadosUI = () => (
        <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button className="btn btn-back" onClick={() => setView('main')}>
                    <i className="fas fa-arrow-left"></i> Volver al Inicio
                </button>
            </div>

            <div className="card">
                <h3 style={{ color: 'var(--color-blue-dark)', marginTop: 0 }}>Enviar Comunicado</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Destinatario</label>
                    <select
                        value={comunicadoDest}
                        onChange={(e) => setComunicadoDest(e.target.value)}
                        style={{ margin: 0 }}
                    >
                        <option value="ALL">Todo el personal</option>
                        <option value="DOCENTE">Todos los docentes</option>
                        <option value="JEFE DE AREA">Todos los jefes de área</option>
                    </select>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Mensaje</label>
                    <textarea
                        placeholder="Escriba el comunicado aquí..."
                        value={comunicadoMsg}
                        onChange={(e) => setComunicadoMsg(e.target.value)}
                        style={{ height: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', resize: 'vertical' }}
                    />
                    <button className="btn btn-purple" onClick={enviarComunicadoForm} style={{ width: 'auto', alignSelf: 'flex-start' }}>
                        <i className="fas fa-paper-plane"></i> Enviar ahora
                    </button>
                </div>
            </div>

            <div className="card">
                <ComunicadosHistorial
                    items={comunicadosEnviados}
                    loading={loadingComunicadosEnviados}
                    page={comunicadosPage}
                    onPageChange={setComunicadosPage}
                    showEmisor
                    onRefresh={fetchComunicadosEnviados}
                    emptyText="Aún no hay comunicados enviados en el sistema."
                />
            </div>
        </div>
    );

    const renderMainButtons = () => (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div className="admin-kpi-grid">
                <div className="admin-kpi-card registros">
                    <h2 className="admin-kpi-value">{kpis.totalRegistros}</h2>
                    <span className="admin-kpi-label">Registros</span>
                </div>
                <div className="admin-kpi-card zonas">
                    <h2 className="admin-kpi-value">{kpis.zonasActivas}</h2>
                    <span className="admin-kpi-label">Zonas</span>
                </div>
                <div className="admin-kpi-card usuarios">
                    <h2 className="admin-kpi-value">{kpis.usuariosRegistrados}</h2>
                    <span className="admin-kpi-label">Usuarios</span>
                </div>
            </div>

            <div className="card" style={{ 
                padding: '30px 25px', 
                textAlign: 'left', 
                background: 'rgba(255, 255, 255, 0.92)', 
                backdropFilter: 'blur(10px)', 
                border: '1px solid rgba(255, 255, 255, 0.4)', 
                borderRadius: '20px',
                boxShadow: '0 15px 35px rgba(0, 0, 0, 0.15)',
                margin: '0 auto',
                width: '100%'
            }}>
                <h3 style={{ 
                    color: 'var(--color-blue-dark)', 
                    marginBottom: '30px', 
                    textAlign: 'center', 
                    fontWeight: '800', 
                    fontSize: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    letterSpacing: '0.5px'
                }}>
                    <i className="fas fa-shield-alt" style={{ color: 'var(--color-green-primary)', fontSize: '24px' }}></i>
                    Panel Administrativo CNY
                </h3>
                
                <div className="admin-card-grid">
                    <div className="admin-action-card kpis" onClick={() => setView('kpis')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Dashboard KPIs</h4>
                            <p className="card-desc">Visualizar estadísticas generales, coberturas e informes.</p>
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

                    <div className="admin-action-card comunicado" onClick={() => setView('comunicados')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-bullhorn"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Comunicados</h4>
                            <p className="card-desc">Enviar avisos y ver el historial de comunicados enviados.</p>
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

                    <div className="admin-action-card zonas" onClick={() => setView('historial')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-history"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Historial de Vigilancias</h4>
                            <p className="card-desc">Bitácora histórica de rondas registradas.</p>
                        </div>
                    </div>

                    <div className="admin-action-card zonas" onClick={() => setView('zones')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-map-marker-alt"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Gestión de Zonas</h4>
                            <p className="card-desc">Administrar puntos físicos y códigos QR de control.</p>
                        </div>
                    </div>

                    <div className="admin-action-card config" onClick={() => setView('config')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-cogs"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Configuración</h4>
                            <p className="card-desc">Ajustes generales y parámetros clave del sistema.</p>
                        </div>
                    </div>

                    <div className="admin-action-card users" onClick={() => setView('users')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-users"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Gestión Usuarios</h4>
                            <p className="card-desc">Control de guardias, docentes y coordinadores.</p>
                        </div>
                    </div>

                    <div className="admin-action-card logs" onClick={() => setView('logs')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-list"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Auditoría Logs</h4>
                            <p className="card-desc">Historial completo de auditoría y eventos de seguridad.</p>
                        </div>
                    </div>

                    <div className="admin-action-card horarios" onClick={() => setView('schedules')}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-calendar-alt"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Horarios (Días 0-5)</h4>
                            <p className="card-desc">Configurar turnos y días de rotación escolar.</p>
                        </div>
                    </div>

                    <div className="admin-action-card backup" onClick={runBackup}>
                        <div className="card-icon-wrapper">
                            <i className="fas fa-database"></i>
                        </div>
                        <div className="card-info">
                            <h4 className="card-title">Backup</h4>
                            <p className="card-desc">Exportar la base de datos local en formato JSON.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderLogsUI = () => {
        const getLogBadge = (action) => {
            const lower = (action || '').toLowerCase();
            if (lower.includes('cre') || lower.includes('import') || lower.includes('guard')) {
                return { bg: '#e2f8e9', color: '#2e7d32', label: action };
            } else if (lower.includes('elimin') || lower.includes('borr') || lower.includes('remov') || lower.includes('fallid')) {
                return { bg: '#fde8e8', color: '#c81e1e', label: action };
            } else if (lower.includes('modific') || lower.includes('actualiz') || lower.includes('edit') || lower.includes('cambi')) {
                return { bg: '#fff3cd', color: '#856404', label: action };
            } else if (lower.includes('login') || lower.includes('sesi') || lower.includes('autentic') || lower.includes('inicio')) {
                return { bg: '#e1f5fe', color: '#0288d1', label: action };
            }
            return { bg: '#f1f5f9', color: '#64748b', label: action };
        };

        const matchesTipo = (accion, tipo) => {
            const lower = (accion || '').toLowerCase();
            if (tipo === 'ALL') return true;
            if (tipo === 'sesion') return lower.includes('sesi') || lower.includes('inicio') || lower.includes('login') || lower.includes('autentic');
            if (tipo === 'crear') return lower.includes('cre') || lower.includes('import') || lower.includes('registro de vigilancia') || lower.includes('novedad') || lower.includes('comunicado') || lower.includes('sincronizaci');
            if (tipo === 'eliminar') return lower.includes('elimin') || lower.includes('borr') || lower.includes('remov') || lower.includes('desactiv');
            if (tipo === 'editar') return lower.includes('edit') || lower.includes('actualiz') || lower.includes('cambi') || lower.includes('modific') || lower.includes('reactiv');
            if (tipo === 'fallo') return lower.includes('fallid') || lower.includes('incorrect');
            return true;
        };

        const usuariosEnLogs = [...new Set(logs.map((l) => l.usuario).filter(Boolean))].sort((a, b) => a.localeCompare(b));

        const filteredLogs = logs.filter((log) => {
            const term = logsSearch.toLowerCase().trim();
            const dateObj = new Date(log.timestamp);
            const dateStr = dateObj.toLocaleString().toLowerCase();
            const dayKey = !Number.isNaN(dateObj.getTime()) ? dateObj.toISOString().slice(0, 10) : '';

            if (logsUsuario !== 'ALL' && log.usuario !== logsUsuario) return false;
            if (!matchesTipo(log.accion, logsTipo)) return false;
            if (logsFechaDesde && dayKey && dayKey < logsFechaDesde) return false;
            if (logsFechaHasta && dayKey && dayKey > logsFechaHasta) return false;

            if (!term) return true;
            return (log.usuario || '').toLowerCase().includes(term) ||
                (log.documento || '').toLowerCase().includes(term) ||
                (log.accion || '').toLowerCase().includes(term) ||
                dateStr.includes(term);
        });

        const logsPager = slicePage(filteredLogs, logsPage, 10);
        const pageLogs = logsPager.pageItems;

        return (
            <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '20px 30px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', borderLeft: '5px solid var(--color-blue-dark)', width: '100%', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                            <i className="fas fa-arrow-left"></i> Volver al Inicio
                        </button>
                        <div>
                            <h2 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '22px', fontWeight: '800' }}>Logs de Auditoría y Seguridad</h2>
                            <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                                Mostrando {logsPager.total ? `${logsPager.from}–${logsPager.to} de ` : ''}{logsPager.total} de {logs.length} registros
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-orange"
                            onClick={() => {
                                const source = filteredLogs.length ? filteredLogs : logs;
                                if (!source.length) {
                                    return Swal.fire('Sin datos', 'No hay logs para exportar.', 'info');
                                }
                                const rows = source.map((l) => ({
                                    Fecha_Hora: formatDateTimeForExcel(l.timestamp),
                                    Usuario: l.usuario || '',
                                    Documento: l.documento || '',
                                    Accion: l.accion || ''
                                }));
                                downloadExcelCsv(rows, `admin_reporte_logs_${new Date().toISOString().slice(0, 10)}`);
                            }}
                            style={{ margin: 0, width: 'auto', padding: '10px 16px' }}
                        >
                            <i className="fas fa-file-csv"></i> Logs CSV
                        </button>
                        <button
                            className="btn btn-dark"
                            onClick={() => {
                                const source = filteredLogs.length ? filteredLogs : logs;
                                if (!source.length) {
                                    return Swal.fire('Sin datos', 'No hay logs para exportar.', 'info');
                                }
                                const rows = source.map((l) => ({
                                    Fecha_Hora: formatDateTimeForExcel(l.timestamp),
                                    Usuario: l.usuario || '',
                                    Documento: l.documento || '',
                                    Accion: l.accion || ''
                                }));
                                downloadPdfTable(rows, `admin_reporte_logs_${new Date().toISOString().slice(0, 10)}`, {
                                    title: 'Logs de Auditoría',
                                    subtitle: `Filtro actual · ${source.length} registros · Generado ${formatDateTimeForExcel(new Date())}`
                                });
                            }}
                            style={{ margin: 0, width: 'auto', padding: '10px 16px' }}
                        >
                            <i className="fas fa-file-pdf"></i> Logs PDF
                        </button>
                    </div>
                </div>

                <div className="card" style={{ margin: 0, padding: '20px', width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Buscar</label>
                            <input type="text" placeholder="Usuario, documento o acción..." value={logsSearch} onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', background: '#f8fafc', fontSize: '13px', margin: 0 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Usuario</label>
                            <select value={logsUsuario} onChange={(e) => { setLogsUsuario(e.target.value); setLogsPage(1); }} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', background: '#f8fafc', fontSize: '13px', margin: 0 }}>
                                <option value="ALL">Todos</option>
                                {usuariosEnLogs.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Tipo de acción</label>
                            <select value={logsTipo} onChange={(e) => { setLogsTipo(e.target.value); setLogsPage(1); }} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', background: '#f8fafc', fontSize: '13px', margin: 0 }}>
                                <option value="ALL">Todas</option>
                                <option value="sesion">Sesión / acceso</option>
                                <option value="crear">Crear / registrar</option>
                                <option value="editar">Editar / actualizar</option>
                                <option value="eliminar">Eliminar</option>
                                <option value="fallo">Fallos</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Desde</label>
                            <input type="date" value={logsFechaDesde} onChange={(e) => { setLogsFechaDesde(e.target.value); setLogsPage(1); }} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', background: '#f8fafc', fontSize: '13px', margin: 0 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Hasta</label>
                            <input type="date" value={logsFechaHasta} onChange={(e) => { setLogsFechaHasta(e.target.value); setLogsPage(1); }} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%', background: '#f8fafc', fontSize: '13px', margin: 0 }} />
                        </div>
                        <div>
                            <button className="btn btn-back" onClick={() => { setLogsSearch(''); setLogsUsuario('ALL'); setLogsTipo('ALL'); setLogsFechaDesde(''); setLogsFechaHasta(''); setLogsPage(1); }} style={{ margin: 0, width: '100%', padding: '10px 12px' }}>
                                Limpiar filtros
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ margin: 0, padding: '25px', width: '100%' }}>
                    <div className="table-container" style={{ maxHeight: '500px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <table className="mini-table" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                    <th style={{ color: 'white', padding: '12px 15px', width: '180px' }}>Fecha y Hora</th>
                                    <th style={{ color: 'white', padding: '12px 15px', width: '200px' }}>Usuario</th>
                                    <th style={{ color: 'white', padding: '12px 15px', width: '140px' }}>Documento</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Acción Ejecutada</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
                                            No se encontraron logs que coincidan con los filtros.
                                        </td>
                                    </tr>
                                ) : (
                                    pageLogs.map(log => {
                                        const badge = getLogBadge(log.accion);
                                        return (
                                            <tr key={log.id}>
                                                <td style={{ padding: '12px 15px', color: '#475569', fontWeight: '600' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                                <td style={{ padding: '12px 15px', color: '#1e293b', fontWeight: '700' }}>{log.usuario}</td>
                                                <td style={{ padding: '12px 15px', color: '#64748b', fontWeight: '600' }}>{log.documento || '—'}</td>
                                                <td style={{ padding: '12px 15px' }}>
                                                    <span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', background: badge.bg, color: badge.color, display: 'inline-block' }}>{badge.label}</span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationBar
                        page={logsPager.page}
                        totalPages={logsPager.totalPages}
                        total={logsPager.total}
                        from={logsPager.from}
                        to={logsPager.to}
                        label="logs"
                        onPrev={() => setLogsPage((p) => Math.max(1, p - 1))}
                        onNext={() => setLogsPage((p) => Math.min(logsPager.totalPages, p + 1))}
                    />
                </div>
            </div>
        );
    };


    const downloadAdminReport = (type, format = 'csv') => {
        const stamp = new Date().toISOString().slice(0, 10);
        const asPdf = format === 'pdf';
        const save = (rows, fileBase, title) => {
            if (asPdf) {
                downloadPdfTable(rows, fileBase, {
                    title,
                    subtitle: `Generado ${formatDateTimeForExcel(new Date())}`
                });
            } else {
                downloadExcelCsv(rows, fileBase);
            }
        };

        if (type === 'vigilancias') {
            if (!registros.length) {
                return Swal.fire('Sin datos', 'No hay vigilancias para exportar.', 'info');
            }
            const rows = registros.map((r) => {
                const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                const dt = formatDateTimeForExcel(r.timestamp);
                return asPdf
                    ? {
                        Fecha: dt.split(' ')[0] || '',
                        Hora: dt.split(' ')[1] || '',
                        Docente: r.usuarioNombre || '',
                        Documento: r.usuarioId || '',
                        Zona: zone?.nombre || r.zonaAlias || '',
                        Tipo: zone?.tipo || '',
                        Distancia_m: r.distancia ?? ''
                    }
                    : {
                        Fecha: dt.split(' ')[0] || '',
                        Hora: dt.split(' ')[1] || '',
                        Docente: r.usuarioNombre || '',
                        Documento: r.usuarioId || '',
                        Zona: zone?.nombre || r.zonaAlias || '',
                        Alias_Zona: r.zonaAlias || '',
                        Tipo: zone?.tipo || '',
                        Distancia_m: r.distancia ?? '',
                        Latitud: r.latitud ?? '',
                        Longitud: r.longitud ?? ''
                    };
            });
            save(rows, `admin_reporte_vigilancias_${stamp}`, 'Reporte de Vigilancias');
            return;
        }
        if (type === 'usuarios') {
            if (!users.length) {
                return Swal.fire('Sin datos', 'No hay usuarios para exportar.', 'info');
            }
            const rows = users.map((u) => ({
                Documento: u.documento || '',
                Nombre: u.nombre || '',
                Rol: u.rol || '',
                Area: u.grupoArea || u.area || '',
                Email: u.email || '',
                Grupo: u.grupo || '',
                Estado: u.activo === false ? 'Inactivo' : 'Activo'
            }));
            save(rows, `admin_reporte_usuarios_${stamp}`, 'Listado de Usuarios');
            return;
        }
        if (type === 'logs') {
            if (!logs.length) {
                return Swal.fire('Sin datos', 'No hay logs para exportar. Abra Auditoría Logs primero o exporte desde allí.', 'info');
            }
            const rows = logs.map((l) => ({
                Fecha_Hora: formatDateTimeForExcel(l.timestamp),
                Usuario: l.usuario || '',
                Documento: l.documento || '',
                Accion: l.accion || ''
            }));
            save(rows, `admin_reporte_logs_${stamp}`, 'Logs de Auditoría');
        }
    };

    const renderKPIsUI = () => {
        // Data processing for charts
        const countsByZone = {};
        registros.forEach(r => {
            const label = r.zonaAlias || r.zonaId || 'Unknown';
            countsByZone[label] = (countsByZone[label] || 0) + 1;
        });

        const zoneChartData = {
            labels: Object.keys(countsByZone),
            datasets: [{
                data: Object.values(countsByZone),
                backgroundColor: ['#0077c2', '#00a2ff', '#3A5F95', '#4A6FA5', '#F39C12', '#9B59B6', '#E74C3C', '#575fcf'],
                borderWidth: 0
            }]
        };

        const activityByArea = {};
        registros.forEach(r => {
            const user = users.find(u => u.uid === r.usuarioId || u.documento === r.usuarioId);
            const area = user?.grupoArea || user?.area || 'General';
            activityByArea[area] = (activityByArea[area] || 0) + 1;
        });

        const areaChartData = {
            labels: Object.keys(activityByArea),
            datasets: [{
                data: Object.values(activityByArea),
                backgroundColor: ['#0077c2', '#00a2ff', '#F39C12', '#9B59B6', '#E74C3C', '#7F8C8D'],
                borderWidth: 0
            }]
        };

        // Cumplimiento GPS: misma tolerancia que el escaneo del docente (50 m)
        let successful = 0;
        let gpsAlerts = 0;
        registros.forEach(r => {
            if (r.distancia > 50) gpsAlerts++;
            else successful++;
        });

        const complianceData = {
            labels: ['Exitosos', 'Alertas GPS'],
            datasets: [{
                label: 'Registros',
                data: [successful, gpsAlerts],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderRadius: 6
            }]
        };

        const kpiChartOptions = {
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

        const kpiPieOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: { family: 'Montserrat', size: 11, weight: '600' },
                        color: '#475569',
                        boxWidth: 12,
                        padding: 10
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

        return (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '25px', padding: '0 20px' }}>
                {/* Dashboard Banner Header */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: 'white', 
                    padding: '20px 30px', 
                    borderRadius: '20px', 
                    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                    borderLeft: '5px solid var(--color-blue-dark)',
                    width: '100%'
                }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                            <i className="fas fa-arrow-left"></i> Volver al Inicio
                        </button>
                        <div>
                            <h2 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '22px', fontWeight: '800' }}>Panel de Control e Indicadores (KPIs)</h2>
                            <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>Métricas y auditoría general del sistema</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn btn-green" onClick={() => downloadAdminReport('vigilancias', 'csv')} style={{ margin: 0, width: 'auto', padding: '10px 16px' }}>
                            <i className="fas fa-file-csv"></i> Vigilancias CSV
                        </button>
                        <button className="btn btn-dark" onClick={() => downloadAdminReport('vigilancias', 'pdf')} style={{ margin: 0, width: 'auto', padding: '10px 16px' }}>
                            <i className="fas fa-file-pdf"></i> Vigilancias PDF
                        </button>
                    </div>
                </div>

                {/* KPI scorecards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', width: '100%' }}>
                    
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
                        overflow: 'hidden',
                        borderRadius: '15px',
                        boxShadow: '0 10px 25px rgba(0, 119, 194, 0.15)'
                    }}>
                        <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '80px', opacity: 0.1, pointerEvents: 'none' }}>
                            <i className="fas fa-history"></i>
                        </div>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Registros Totales</span>
                        <div style={{ fontSize: '42px', fontWeight: '900', margin: '5px 0' }}>{kpis.totalRegistros}</div>
                        <small style={{ fontWeight: '600' }}>Escaneos en base de datos</small>
                    </div>

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
                        overflow: 'hidden',
                        borderRadius: '15px',
                        boxShadow: '0 10px 25px rgba(243, 156, 18, 0.15)'
                    }}>
                        <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '80px', opacity: 0.1, pointerEvents: 'none' }}>
                            <i className="fas fa-map-marker-alt"></i>
                        </div>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Zonas de Ronda</span>
                        <div style={{ fontSize: '42px', fontWeight: '900', margin: '5px 0' }}>{kpis.zonasActivas}</div>
                        <small style={{ fontWeight: '600' }}>Puntos QR activos</small>
                    </div>

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
                        overflow: 'hidden',
                        borderRadius: '15px',
                        boxShadow: '0 10px 25px rgba(155, 89, 182, 0.15)'
                    }}>
                        <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '80px', opacity: 0.1, pointerEvents: 'none' }}>
                            <i className="fas fa-users"></i>
                        </div>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px', opacity: 0.9 }}>Personal Registrado</span>
                        <div style={{ fontSize: '42px', fontWeight: '900', margin: '5px 0' }}>{kpis.usuariosRegistrados}</div>
                        <small style={{ fontWeight: '600' }}>Docentes y administradores</small>
                    </div>
                </div>

                {/* Charts Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', width: '100%' }}>
                    <div className="card" style={{ margin: 0, padding: '25px', height: '400px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', textAlign: 'left' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '15px', fontSize: '15px', fontWeight: '800' }}>
                            <i className="fas fa-chart-pie"></i> Distribución de Vigilancias por Zona
                        </h3>
                        <div style={{ flex: 1, position: 'relative', height: '280px' }}>
                            <Pie data={zoneChartData} options={kpiPieOptions} />
                        </div>
                    </div>

                    <div className="card" style={{ margin: 0, padding: '25px', height: '400px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', textAlign: 'left' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '15px', fontSize: '15px', fontWeight: '800' }}>
                            <i className="fas fa-check-circle"></i> Nivel de Cumplimiento GPS
                        </h3>
                        <div style={{ flex: 1, position: 'relative', height: '280px' }}>
                            <Bar data={complianceData} options={kpiChartOptions} />
                        </div>
                    </div>

                    <div className="card" style={{ margin: 0, padding: '25px', height: '400px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', textAlign: 'left' }}>
                        <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '15px', fontSize: '15px', fontWeight: '800' }}>
                            <i className="fas fa-chart-bar"></i> Vigilancias por Área/Grupo
                        </h3>
                        <div style={{ flex: 1, position: 'relative', height: '280px' }}>
                            <Doughnut data={areaChartData} options={kpiPieOptions} />
                        </div>
                    </div>
                </div>

                <div className="card" style={{ margin: 0, padding: '25px', textAlign: 'left', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                        <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '16px', fontWeight: '800' }}>
                            <i className="fas fa-table"></i> Últimas vigilancias registradas
                        </h3>
                    </div>
                    {(() => {
                        const docentesKpi = [...new Set(registros.map((r) => r.usuarioNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
                        const term = kpiSearch.trim().toLowerCase();
                        const filteredKpiRegs = [...registros]
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                            .filter((r) => {
                                const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                                const tipo = zone?.tipo || 'OTRO';
                                const matchesSearch = !term
                                    || (r.usuarioNombre || '').toLowerCase().includes(term)
                                    || (zone?.nombre || '').toLowerCase().includes(term)
                                    || (r.zonaAlias || '').toLowerCase().includes(term)
                                    || String(r.usuarioId || '').toLowerCase().includes(term);
                                const matchesDocente = kpiDocenteFilter === 'ALL' || r.usuarioNombre === kpiDocenteFilter;
                                const matchesTipo = kpiTipoFilter === 'ALL'
                                    || (kpiTipoFilter === 'OTRO' ? !['SNACK', 'LUNCH'].includes(tipo) : tipo === kpiTipoFilter);
                                return matchesSearch && matchesDocente && matchesTipo;
                            })
                            .slice(0, 100);
                        const kpiPager = slicePage(filteredKpiRegs, kpiPage, 10);
                        const pageKpiRegs = kpiPager.pageItems;
                        const filterStyle = { padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', margin: 0, width: '100%' };
                        return (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px', alignItems: 'end' }}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Buscar</label>
                                        <input type="text" placeholder="Docente, documento o zona..." value={kpiSearch} onChange={(e) => { setKpiSearch(e.target.value); setKpiPage(1); }} style={filterStyle} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Docente</label>
                                        <select value={kpiDocenteFilter} onChange={(e) => { setKpiDocenteFilter(e.target.value); setKpiPage(1); }} style={filterStyle}>
                                            <option value="ALL">Todos</option>
                                            {docentesKpi.map((name) => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '5px' }}>Tipo</label>
                                        <select value={kpiTipoFilter} onChange={(e) => { setKpiTipoFilter(e.target.value); setKpiPage(1); }} style={filterStyle}>
                                            <option value="ALL">Todos</option>
                                            <option value="SNACK">SNACK</option>
                                            <option value="LUNCH">LUNCH</option>
                                            <option value="OTRO">OTRO</option>
                                        </select>
                                    </div>
                                    <div>
                                        <button type="button" className="btn btn-back" onClick={() => { setKpiSearch(''); setKpiDocenteFilter('ALL'); setKpiTipoFilter('ALL'); setKpiPage(1); }} style={{ margin: 0, width: '100%' }}>
                                            <i className="fas fa-filter-circle-xmark"></i> Limpiar
                                        </button>
                                    </div>
                                </div>
                                <p style={{ margin: '0 0 10px 0', color: '#64748b', fontSize: '13px' }}>
                                    {kpiPager.total ? `Mostrando ${kpiPager.from}–${kpiPager.to} de ${kpiPager.total}` : 'Sin registros'}
                                </p>
                    <div className="table-container" style={{ maxHeight: '420px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <table className="mini-table" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Fecha</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Hora</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Docente</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Zona</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Tipo</th>
                                    <th style={{ color: 'white', padding: '12px 15px' }}>Distancia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageKpiRegs.map((r) => {
                                        const zone = zones.find((z) => z.id === r.zonaId || z.alias === r.zonaAlias);
                                        const dt = formatDateTimeForExcel(r.timestamp);
                                        return (
                                            <tr key={r.id}>
                                                <td style={{ padding: '10px 15px' }}>{dt.split(' ')[0]}</td>
                                                <td style={{ padding: '10px 15px', fontWeight: '600' }}>{dt.split(' ')[1]}</td>
                                                <td style={{ padding: '10px 15px', fontWeight: '700' }}>{r.usuarioNombre}</td>
                                                <td style={{ padding: '10px 15px', color: 'var(--color-blue-dark)', fontWeight: '600' }}>{zone?.nombre || r.zonaAlias || '—'}</td>
                                                <td style={{ padding: '10px 15px' }}>{zone?.tipo || '—'}</td>
                                                <td style={{ padding: '10px 15px' }}>{r.distancia != null ? `${r.distancia} m` : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                {filteredKpiRegs.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                            No hay vigilancias con los filtros actuales.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationBar
                        page={kpiPager.page}
                        totalPages={kpiPager.totalPages}
                        total={kpiPager.total}
                        from={kpiPager.from}
                        to={kpiPager.to}
                        onPrev={() => setKpiPage((p) => Math.max(1, p - 1))}
                        onNext={() => setKpiPage((p) => Math.min(kpiPager.totalPages, p + 1))}
                    />
                            </>
                        );
                    })()}
                </div>
            </div>
        );
    };

    const renderZonesUI = () => {
        const sortedZones = [...zones].sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
        const term = zoneSearch.trim().toLowerCase();
        const filteredZones = sortedZones.filter((z) => {
            const matchesSearch = !term
                || (z.nombre || '').toLowerCase().includes(term)
                || (z.alias || '').toLowerCase().includes(term)
                || (z.actividad || '').toLowerCase().includes(term)
                || (z.horario || '').toLowerCase().includes(term);
            const tipo = z.tipo || 'OTRO';
            const matchesTipo = zoneTipoFilter === 'ALL'
                || (zoneTipoFilter === 'OTRO' ? !['SNACK', 'LUNCH'].includes(tipo) : tipo === zoneTipoFilter);
            const activa = isZonaActiva(z);
            const matchesEstado = zoneEstadoFilter === 'ALL'
                || (zoneEstadoFilter === 'activo' && activa)
                || (zoneEstadoFilter === 'inactivo' && !activa);
            return matchesSearch && matchesTipo && matchesEstado;
        });

        return (
            <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 10px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <h3 style={{ margin: 0, color: 'var(--color-blue-dark)', flex: 1, minWidth: '200px' }}>Gestión de Zonas</h3>
                </div>

                {/* Buscador de Zonas */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', width: '100%' }}>
                    <div style={{ position: 'relative', flex: '2 1 280px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}></i>
                        <input
                            type="text"
                            placeholder="Buscar zona por nombre, alias, horario o actividad..."
                            value={zoneSearch}
                            onChange={(e) => setZoneSearch(e.target.value)}
                            style={{
                                padding: '12px 12px 12px 40px',
                                width: '100%',
                                borderRadius: '12px',
                                border: '2px solid #eee',
                                fontSize: '15px',
                                outline: 'none',
                                background: 'white',
                                margin: 0,
                                textAlign: 'left'
                            }}
                        />
                        {zoneSearch && (
                            <i className="fas fa-times"
                               onClick={() => setZoneSearch('')}
                               style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#888', cursor: 'pointer' }}
                            ></i>
                        )}
                    </div>
                    <select
                        value={zoneTipoFilter}
                        onChange={(e) => setZoneTipoFilter(e.target.value)}
                        style={{ margin: 0, flex: '1 1 160px', padding: '12px', borderRadius: '12px', border: '2px solid #eee', background: 'white' }}
                    >
                        <option value="ALL">Todos los tipos</option>
                        <option value="SNACK">SNACK</option>
                        <option value="LUNCH">LUNCH</option>
                        <option value="OTRO">OTRO</option>
                    </select>
                    <select
                        value={zoneEstadoFilter}
                        onChange={(e) => setZoneEstadoFilter(e.target.value)}
                        style={{ margin: 0, flex: '1 1 160px', padding: '12px', borderRadius: '12px', border: '2px solid #eee', background: 'white' }}
                    >
                        <option value="ALL">Todos los estados</option>
                        <option value="activo">Activas</option>
                        <option value="inactivo">Inactivas</option>
                    </select>
                    <button
                        type="button"
                        className="btn btn-back"
                        onClick={() => { setZoneSearch(''); setZoneTipoFilter('ALL'); setZoneEstadoFilter('ALL'); }}
                        disabled={!term && zoneTipoFilter === 'ALL' && zoneEstadoFilter === 'ALL'}
                        style={{ margin: 0, width: 'auto' }}
                    >
                        <i className="fas fa-filter-circle-xmark"></i> Limpiar
                    </button>
                </div>
                <small style={{ color: '#64748b', marginTop: '-8px' }}>
                    Mostrando {filteredZones.length} de {zones.length} zona(s)
                </small>

                {/* Grilla de Zonas */}
                <div className="zones-grid">
                    {/* Tarjeta de Agregar Zona */}
                    <div className="zone-card-add" onClick={handleCreateZone}>
                        <i className="fas fa-plus-circle"></i>
                        <span>Agregar Nueva Zona</span>
                    </div>

                    {/* Tarjetas de Zonas */}
                    {filteredZones.map(z => {
                        const tipoLower = (z.tipo || 'OTRO').toLowerCase();
                        const isSnack = tipoLower === 'snack';
                        const isLunch = tipoLower === 'lunch';
                        const activa = isZonaActiva(z);
                        const cardClass = `zone-card ${isSnack ? 'type-snack' : isLunch ? 'type-lunch' : 'type-otro'}`;
                        const badgeClass = `zone-badge ${isSnack ? 'bg-snack' : isLunch ? 'bg-lunch' : 'bg-otro'}`;

                        return (
                            <div key={z.id} className={cardClass} style={{ opacity: activa ? 1 : 0.72 }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-blue-dark)' }}>{z.alias}</span>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span className={badgeClass}>{z.tipo || 'OTRO'}</span>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 8px',
                                                borderRadius: '999px',
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                background: activa ? '#e8f8ee' : '#fdecec',
                                                color: activa ? '#27864a' : '#c0392b'
                                            }}>
                                                {activa ? 'Activa' : 'Inactiva'}
                                            </span>
                                        </div>
                                    </div>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#1e293b', fontWeight: '700' }}>{z.nombre}</h4>
                                    
                                    <div className="zone-info-row">
                                        <i className="far fa-clock"></i>
                                        <span>{z.horario || 'Sin horario'}</span>
                                    </div>
                                    
                                    <div className="zone-info-row">
                                        <i className="fas fa-map-marker-alt"></i>
                                        <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                                            {typeof z.latitud === 'number' ? z.latitud.toFixed(6) : z.latitud}, {typeof z.longitud === 'number' ? z.longitud.toFixed(6) : z.longitud}
                                        </span>
                                    </div>

                                    {z.actividad && (
                                        <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                                                {z.actividad}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="zone-actions">
                                    <button className="zone-btn zone-btn-qr" onClick={() => setSelectedQR(z)} title="Generar Código QR" disabled={!activa} style={{ opacity: activa ? 1 : 0.5 }}>
                                        <i className="fas fa-qrcode"></i> QR
                                    </button>
                                    <button className="zone-btn zone-btn-edit" onClick={() => editZone(z)} title="Editar Zona">
                                        <i className="fas fa-edit"></i> Editar
                                    </button>
                                    <button
                                        className={`zone-btn ${activa ? 'zone-btn-delete' : 'zone-btn-edit'}`}
                                        onClick={() => toggleZonaActiva(z)}
                                        title={activa ? 'Desactivar zona' : 'Reactivar zona'}
                                        style={activa ? undefined : { background: '#27ae60', color: 'white' }}
                                    >
                                        <i className={activa ? 'fas fa-ban' : 'fas fa-check'}></i>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const handleScheduleChange = (usuarioId, diaCiclo, zonaId) => {
        setSchedulesEdit(prev => ({
            ...prev,
            [`${usuarioId}-${diaCiclo}`]: zonaId
        }));
    };

    const toggleAssignDay = (day) => {
        setAssignDays((prev) => (
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
        ));
    };

    const applyAssignWizard = () => {
        if (!assignUserId) {
            Swal.fire('Falta docente', 'Seleccione un docente para asignar.', 'warning');
            return;
        }
        if (!assignZoneId) {
            Swal.fire('Falta zona', 'Seleccione una zona de vigilancia.', 'warning');
            return;
        }
        if (assignDays.length === 0) {
            Swal.fire('Faltan días', 'Marque al menos un día del ciclo (0 a 5).', 'warning');
            return;
        }
        setSchedulesEdit((prev) => {
            const next = { ...prev };
            assignDays.forEach((day) => {
                next[`${assignUserId}-${day}`] = assignZoneId;
            });
            return next;
        });
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Asignado a ${assignDays.length} día(s)`,
            showConfirmButton: false,
            timer: 1800
        });
    };

    const copyDayZeroToAll = () => {
        if (!assignUserId) {
            Swal.fire('Falta docente', 'Seleccione un docente para copiar su Día 0.', 'warning');
            return;
        }
        const zonaDia0 = schedulesEdit[`${assignUserId}-0`] || '';
        if (!zonaDia0) {
            Swal.fire('Sin Día 0', 'Ese docente aún no tiene zona en el Día 0.', 'info');
            return;
        }
        setSchedulesEdit((prev) => {
            const next = { ...prev };
            for (let day = 1; day <= 5; day++) {
                next[`${assignUserId}-${day}`] = zonaDia0;
            }
            return next;
        });
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Día 0 copiado a los demás días',
            showConfirmButton: false,
            timer: 1800
        });
    };

    const handleSaveSchedules = async () => {
        Swal.fire({
            title: 'Guardando asignaciones...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const asignaciones = [];
            const targetUsers = users.filter(u => u.rol !== 'ADMINISTRADOR GENERAL');

            targetUsers.forEach(u => {
                for (let day = 0; day <= 5; day++) {
                    const key = `${u.documento}-${day}`;
                    const uiVal = schedulesEdit[key] || '';

                    // Compare with loaded DB values to only send changes (delta updates)
                    const dbMatch = (schedules || []).find(s => String(s.usuarioId) === String(u.documento) && s.diaCiclo === day);
                    const dbVal = dbMatch ? dbMatch.zonaId : '';

                    if (uiVal !== dbVal) {
                        asignaciones.push({
                            usuarioId: String(u.documento),
                            zonaId: uiVal || null,
                            diaCiclo: day
                        });
                    }
                }
            });

            if (asignaciones.length === 0) {
                Swal.fire('Sin Cambios', 'No se detectaron cambios en las asignaciones de horarios.', 'info');
                return;
            }

            await saveHorarios(asignaciones);
            await logAction(`Actualización de ${asignaciones.length} asignaciones de horarios`);

            Swal.fire({
                title: '¡Guardado!',
                text: `Se guardaron correctamente ${asignaciones.length} asignación(es).`,
                icon: 'success',
                confirmButtonColor: 'var(--color-green-primary)'
            });

            // Refresh data
            const newScheds = await getHorarios();
            setSchedules(newScheds);
            const updatedEdits = {};
            newScheds.forEach(s => {
                updatedEdits[`${s.usuarioId}-${s.diaCiclo}`] = s.zonaId;
            });
            setSchedulesEdit(updatedEdits);

        } catch (error) {
            console.error('Error saving schedules:', error);
            Swal.fire('Error', error.message || 'No se pudieron guardar las asignaciones.', 'error');
        }
    };

    const renderSchedulesUI = () => {
        const generateCycle = () => {
            const start = new Date(refDate);
            // Ensure it starts on a Tuesday
            while (start.getDay() !== 2) {
                start.setDate(start.getDate() + 1);
            }

            const newSchedule = [];
            let current = new Date(start);
            let dayCount = 0;

            for (let i = 0; i < 14; i++) {
                const d = current.getDay();
                if (d !== 0 && d !== 6) { // Skip weekends
                    newSchedule.push({
                        fecha: current.toISOString().split('T')[0],
                        diaCiclo: dayCount % 6,
                        nombreDia: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d]
                    });
                    dayCount++;
                }
                current.setDate(current.getDate() + 1);
            }
            setScheduleData(newSchedule);
        };

        const targetUsers = users.filter(u => u.rol !== 'ADMINISTRADOR GENERAL');
        const sortedTargetUsers = [...targetUsers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        const filteredTargetUsers = sortedTargetUsers.filter(u => 
            (u.nombre || '').toLowerCase().includes(schedulesSearch.toLowerCase()) || 
            (u.documento || '').toString().includes(schedulesSearch)
        );
        const schedulesPager = slicePage(filteredTargetUsers, schedulesPage, 10);
        const pageScheduleUsers = schedulesPager.pageItems;

        const sortedZones = [...zones]
            .filter((z) => isZonaActiva(z))
            .sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));

        return (
            <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <button className="btn btn-back" onClick={() => setView('main')}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                </div>

                <div className="card">
                    <h3 style={{ color: 'var(--color-blue-dark)' }}>Gestión de Ciclos (Día 0 - Día 5)</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                        Configure el inicio del ciclo (Martes = Día 0). La rotación es de 6 días lectivos.
                    </p>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Fecha Referencia (Martes):</label>
                            <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
                        </div>
                        <button className="btn btn-purple" onClick={generateCycle} style={{ width: 'auto', marginBottom: '8px' }}>
                            Generar Calendario
                        </button>
                    </div>

                    {scheduleData.length > 0 && (
                        <div className="table-container" style={{ marginTop: '20px' }}>
                            <table className="mini-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Día</th>
                                        <th>Día del Ciclo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scheduleData.map((row, idx) => (
                                        <tr key={idx} style={{
                                            background: row.diaCiclo === 0 ? 'rgba(106, 180, 76, 0.1)' : 'transparent',
                                            fontWeight: row.diaCiclo === 0 ? 'bold' : 'normal'
                                        }}>
                                            <td>{row.fecha}</td>
                                            <td>{row.nombreDia}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    background: row.diaCiclo === 0 ? '#6AB04C' : '#4A6FA5',
                                                    color: 'white',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold'
                                                }}>
                                                    DÍA {row.diaCiclo}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-light)', lineHeight: 1.45 }}>
                        La fecha de referencia solo calcula el calendario en pantalla. Las asignaciones se guardan con el botón
                        {' '}<strong>Guardar Asignaciones</strong> más abajo.
                    </p>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <div>
                            <h3 style={{ color: 'var(--color-blue-dark)', marginBottom: '6px' }}>Asignación de Vigiladores</h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-light)', margin: 0 }}>
                                Asigne zonas por docente y día del ciclo (Día 0 a Día 5).
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-purple"
                            onClick={() => setShowScheduleOverview(true)}
                            style={{ width: 'auto', margin: 0, padding: '10px 14px', fontSize: '12px' }}
                        >
                            <i className="fas fa-calendar-alt"></i> Ver horario actual
                        </button>
                    </div>

                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        marginBottom: '18px'
                    }}>
                        <div style={{ fontWeight: 800, color: 'var(--color-blue-dark)', fontSize: '14px', marginBottom: '10px' }}>
                            Asignación rápida (3 pasos)
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '12px',
                            marginBottom: '12px'
                        }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                    1. Docente
                                </label>
                                <select
                                    value={assignUserId}
                                    onChange={(e) => setAssignUserId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {sortedTargetUsers.map((u) => (
                                        <option key={u.documento} value={u.documento}>
                                            {u.nombre} ({u.documento})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                    2. Zona
                                </label>
                                <select
                                    value={assignZoneId}
                                    onChange={(e) => setAssignZoneId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {sortedZones.map((z) => (
                                        <option key={z.id} value={z.id}>
                                            {z.alias} ({z.horario || 'sin horario'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                                    3. Días del ciclo
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                    {[0, 1, 2, 3, 4, 5].map((day) => {
                                        const active = assignDays.includes(day);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleAssignDay(day)}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: '8px',
                                                    border: active ? '1px solid #6ab04c' : '1px solid #cbd5e1',
                                                    background: active ? 'rgba(106, 180, 76, 0.15)' : '#fff',
                                                    color: active ? '#166534' : '#334155',
                                                    fontWeight: 700,
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Día {day}
                                            </button>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        onClick={() => setAssignDays([0, 1, 2, 3, 4, 5])}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #94a3b8',
                                            background: '#fff',
                                            color: '#475569',
                                            fontWeight: 600,
                                            fontSize: '11px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Todos
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-green"
                                onClick={applyAssignWizard}
                                style={{ width: 'auto', margin: 0, padding: '10px 14px', fontSize: '12px' }}
                            >
                                <i className="fas fa-check"></i> Aplicar a días seleccionados
                            </button>
                            <button
                                type="button"
                                className="btn btn-purple"
                                onClick={copyDayZeroToAll}
                                style={{ width: 'auto', margin: 0, padding: '10px 14px', fontSize: '12px' }}
                            >
                                <i className="fas fa-copy"></i> Copiar Día 0 a todos
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAssignUserId(''); setAssignZoneId(''); setAssignDays([]); }}
                                style={{
                                    width: 'auto',
                                    margin: 0,
                                    padding: '10px 14px',
                                    fontSize: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#fff',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Limpiar
                            </button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                            Los cambios quedan en la tabla inferior; recuerde pulsar Guardar Asignaciones.
                        </p>
                    </div>

                    <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ width: '100%', maxWidth: '400px', display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '10px', padding: '5px 15px' }}>
                            <i className="fas fa-search" style={{ color: '#94a3b8', marginRight: '10px' }}></i>
                            <input
                                type="text"
                                placeholder="Buscar docente por nombre o documento..."
                                value={schedulesSearch}
                                onChange={(e) => { setSchedulesSearch(e.target.value); setSchedulesPage(1); }}
                                style={{ background: 'transparent', border: 'none', padding: '8px 0', width: '100%', outline: 'none', margin: 0, fontSize: '13px' }}
                            />
                        </div>
                    </div>
                    <p style={{ margin: '0 0 10px 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                        {schedulesPager.total
                            ? `Mostrando ${schedulesPager.from}–${schedulesPager.to} de ${schedulesPager.total} docente(s)`
                            : 'Sin docentes'}
                    </p>

                    <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                        <table className="mini-table" style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa' }}>
                                    <th style={{ textAlign: 'left', padding: '12px' }}>Docente</th>
                                    <th>Día 0</th>
                                    <th>Día 1</th>
                                    <th>Día 2</th>
                                    <th>Día 3</th>
                                    <th>Día 4</th>
                                    <th>Día 5</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedulesPager.total === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                                            No se encontraron docentes.
                                        </td>
                                    </tr>
                                ) : (
                                    pageScheduleUsers.map((u) => (
                                        <tr key={u.documento} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ textAlign: 'left', padding: '12px' }}>
                                                <div style={{ fontWeight: 'bold', color: 'var(--color-blue-dark)' }}>{u.nombre}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                    {u.rol} | Doc: {u.documento}
                                                </div>
                                            </td>
                                            {[0, 1, 2, 3, 4, 5].map((day) => (
                                                <td key={day} style={{ textAlign: 'center', padding: '8px' }}>
                                                    <select
                                                        value={schedulesEdit[`${u.documento}-${day}`] || ''}
                                                        onChange={(e) => handleScheduleChange(u.documento, day, e.target.value)}
                                                        style={{
                                                            padding: '6px 10px',
                                                            fontSize: '12px',
                                                            minWidth: '120px',
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '8px',
                                                            background: schedulesEdit[`${u.documento}-${day}`] ? 'rgba(106, 180, 76, 0.08)' : '#fff',
                                                            borderColor: schedulesEdit[`${u.documento}-${day}`] ? '#6ab04c' : '#cbd5e1',
                                                            fontWeight: schedulesEdit[`${u.documento}-${day}`] ? '600' : 'normal',
                                                            color: schedulesEdit[`${u.documento}-${day}`] ? '#27ae60' : '#334155',
                                                            outline: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <option value="">-- Sin asignar --</option>
                                                        {sortedZones.map((z) => (
                                                            <option key={z.id} value={z.id}>
                                                                {z.alias} ({z.horario})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationBar
                        page={schedulesPager.page}
                        totalPages={schedulesPager.totalPages}
                        total={schedulesPager.total}
                        from={schedulesPager.from}
                        to={schedulesPager.to}
                        label="docentes"
                        onPrev={() => setSchedulesPage((p) => Math.max(1, p - 1))}
                        onNext={() => setSchedulesPage((p) => Math.min(schedulesPager.totalPages, p + 1))}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button className="btn btn-green" onClick={handleSaveSchedules} style={{ width: 'auto' }}>
                            <i className="fas fa-save"></i> Guardar Asignaciones
                        </button>
                    </div>
                </div>

                {showScheduleOverview && (() => {
                    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    const buildCycleRows = () => {
                        if (scheduleData.length > 0) return scheduleData;
                        const start = new Date(`${refDate}T12:00:00`);
                        while (start.getDay() !== 2) {
                            start.setDate(start.getDate() + 1);
                        }
                        const rows = [];
                        const current = new Date(start);
                        let dayCount = 0;
                        for (let i = 0; i < 14; i++) {
                            const d = current.getDay();
                            if (d !== 0 && d !== 6) {
                                rows.push({
                                    fecha: current.toISOString().split('T')[0],
                                    diaCiclo: dayCount % 6,
                                    nombreDia: dayNames[d]
                                });
                                dayCount++;
                            }
                            current.setDate(current.getDate() + 1);
                        }
                        return rows;
                    };
                    const cycleByDay = {};
                    buildCycleRows().forEach((row) => {
                        if (cycleByDay[row.diaCiclo] == null) cycleByDay[row.diaCiclo] = row;
                    });
                    const formatFecha = (iso) => {
                        if (!iso) return 'Sin fecha';
                        const [y, m, d] = iso.split('-');
                        return `${d}/${m}/${y}`;
                    };
                    const formatHoraRango = (horarioStr) => {
                        if (!horarioStr) return 'Sin hora';
                        const parts = String(horarioStr).split('-').map((p) => p.trim()).filter(Boolean);
                        if (parts.length >= 2) return `${parts[0]} a ${parts[1]}`;
                        return String(horarioStr);
                    };
                    const ahora = new Date();
                    const consultadoFecha = ahora.toLocaleDateString('es-CO', {
                        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
                    });
                    const consultadoHora = ahora.toLocaleTimeString('es-CO', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });

                    const userByDoc = Object.fromEntries(
                        (users || []).map((u) => [String(u.documento), u])
                    );
                    const zoneById = Object.fromEntries(
                        (zones || []).map((z) => [String(z.id), z])
                    );
                    const daysToShow = overviewDayFilter === 'ALL'
                        ? [0, 1, 2, 3, 4, 5]
                        : [Number(overviewDayFilter)];
                    const rowsByDay = daysToShow.map((day) => {
                        const cycle = cycleByDay[day];
                        const rows = [];
                        Object.entries(schedulesEdit || {}).forEach(([key, zonaId]) => {
                            if (!zonaId) return;
                            const [usuarioId, diaStr] = key.split('-');
                            if (Number(diaStr) !== day) return;
                            const user = userByDoc[String(usuarioId)];
                            const zone = zoneById[String(zonaId)];
                            rows.push({
                                usuarioId,
                                nombre: user?.nombre || `Usuario ${usuarioId}`,
                                rol: user?.rol || '—',
                                zonaAlias: zone?.alias || zone?.nombre || `Zona ${zonaId}`,
                                zonaHorario: zone?.horario || '',
                                fecha: cycle?.fecha || '',
                                nombreDia: cycle?.nombreDia || ''
                            });
                        });
                        rows.sort((a, b) => a.zonaAlias.localeCompare(b.zonaAlias) || a.nombre.localeCompare(b.nombre));
                        return { day, rows, cycle };
                    });
                    const totalAsignaciones = rowsByDay.reduce((acc, d) => acc + d.rows.length, 0);

                    return (
                        <div
                            onClick={() => setShowScheduleOverview(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(15, 23, 42, 0.55)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                zIndex: 3000
                            }}
                        >
                            <div
                                onClick={(ev) => ev.stopPropagation()}
                                style={{
                                    width: '100%',
                                    maxWidth: '920px',
                                    maxHeight: '90vh',
                                    overflowY: 'auto',
                                    background: 'white',
                                    borderRadius: '14px',
                                    border: '1px solid #dbe4ee',
                                    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
                                    padding: '18px 20px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, color: 'var(--color-blue-dark)' }}>Horario actual</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                            Quién está asignado por día del ciclo · {totalAsignaciones} asignación(es)
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                                            Consultado: {consultadoFecha} · {consultadoHora}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowScheduleOverview(false)}
                                        style={{
                                            border: 'none',
                                            background: '#f1f5f9',
                                            width: '34px',
                                            height: '34px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: '#475569',
                                            fontSize: '16px'
                                        }}
                                        aria-label="Cerrar"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Filtrar día:</label>
                                    <select
                                        value={overviewDayFilter}
                                        onChange={(e) => setOverviewDayFilter(e.target.value)}
                                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                    >
                                        <option value="ALL">Todos los días</option>
                                        {[0, 1, 2, 3, 4, 5].map((d) => {
                                            const c = cycleByDay[d];
                                            const label = c
                                                ? `Día ${d} · ${c.nombreDia} ${formatFecha(c.fecha)}`
                                                : `Día ${d}`;
                                            return (
                                                <option key={d} value={String(d)}>{label}</option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {rowsByDay.map(({ day, rows, cycle }) => (
                                    <div key={day} style={{ marginBottom: '14px' }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            marginBottom: '8px',
                                            flexWrap: 'wrap'
                                        }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                background: day === 0 ? '#6AB04C' : '#4A6FA5',
                                                color: 'white',
                                                fontSize: '11px',
                                                fontWeight: 'bold'
                                            }}>
                                                DÍA {day}
                                            </span>
                                            <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                                                {cycle
                                                    ? `${cycle.nombreDia} ${formatFecha(cycle.fecha)}`
                                                    : 'Fecha no definida'}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                · {rows.length} persona(s)
                                            </span>
                                        </div>
                                        {rows.length === 0 ? (
                                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', paddingLeft: '4px' }}>
                                                Sin asignaciones en este día.
                                            </p>
                                        ) : (
                                            <div className="table-container">
                                                <table className="mini-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8f9fa' }}>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Fecha</th>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Hora</th>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Zona</th>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Asignado</th>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Rol</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((r) => (
                                                            <tr key={`${day}-${r.usuarioId}-${r.zonaAlias}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '8px', fontSize: '12px', color: '#334155', whiteSpace: 'nowrap' }}>
                                                                    <div style={{ fontWeight: 700 }}>{formatFecha(r.fecha)}</div>
                                                                    <div style={{ color: '#64748b', fontSize: '11px' }}>{r.nombreDia || '—'}</div>
                                                                </td>
                                                                <td style={{ padding: '8px', fontSize: '12px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                    {formatHoraRango(r.zonaHorario)}
                                                                </td>
                                                                <td style={{ padding: '8px', fontWeight: 600, color: 'var(--color-blue-dark)' }}>{r.zonaAlias}</td>
                                                                <td style={{ padding: '8px' }}>{r.nombre}</td>
                                                                <td style={{ padding: '8px', fontSize: '12px', color: '#64748b' }}>{r.rol}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    };

    const renderUsersUI = () => {
        const sortedUsers = [...users].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        const normalizedUserSearch = userSearch.trim().toLowerCase();
        const userRoles = [...new Set(users.map((user) => user.rol).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        const userGroups = [...new Set(
            users.map((user) => user.grupo || user.grupoArea || user.area).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));
        const filteredUsers = sortedUsers.filter((user) => {
            const userGroup = user.grupo || user.grupoArea || user.area || '';
            const matchesSearch = !normalizedUserSearch || [
                user.nombre,
                user.documento,
                user.email,
                user.rol,
                userGroup
            ].some((value) => String(value || '').toLowerCase().includes(normalizedUserSearch));
            const matchesRole = userRoleFilter === 'ALL' || user.rol === userRoleFilter;
            const matchesGroup = userGroupFilter === 'ALL' || userGroup === userGroupFilter;
            const activo = isUsuarioActivo(user);
            const matchesEstado = userEstadoFilter === 'ALL'
                || (userEstadoFilter === 'activo' && activo)
                || (userEstadoFilter === 'inactivo' && !activo);
            return matchesSearch && matchesRole && matchesGroup && matchesEstado;
        });
        const hasUserFilters = Boolean(normalizedUserSearch)
            || userRoleFilter !== 'ALL'
            || userGroupFilter !== 'ALL'
            || userEstadoFilter !== 'ALL';
        const usersPager = slicePage(filteredUsers, usersPage, 10);
        const pageUsers = usersPager.pageItems;
        return (
            <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <button className="btn btn-back" onClick={() => setView('main')} style={{ margin: 0 }}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-green"
                            onClick={() => downloadAdminReport('usuarios', 'csv')}
                            style={{ margin: 0, width: 'auto', padding: '10px 16px' }}
                        >
                            <i className="fas fa-file-csv"></i> Usuarios CSV
                        </button>
                        <button
                            className="btn btn-dark"
                            onClick={() => downloadAdminReport('usuarios', 'pdf')}
                            style={{ margin: 0, width: 'auto', padding: '10px 16px' }}
                        >
                            <i className="fas fa-file-pdf"></i> Usuarios PDF
                        </button>
                    </div>
                </div>
                <div className="card">
                    <h3 style={{ color: 'var(--color-blue-dark)' }}>Gestión de Usuarios</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                        <input
                            type="text"
                            placeholder="Nombre completo *"
                            value={uNombre}
                            onChange={(e) => setUNombre(sanitizeNombreInput(e.target.value))}
                            inputMode="text"
                            autoComplete="name"
                        />
                        <input
                            type="text"
                            placeholder="Documento (solo números) *"
                            value={uDocumento}
                            onChange={(e) => setUDocumento(sanitizeDocumentoInput(e.target.value))}
                            inputMode="numeric"
                            autoComplete="off"
                        />
                        <input
                            type="email"
                            placeholder="Correo electrónico *"
                            value={uEmail}
                            onChange={(e) => setUEmail(e.target.value)}
                            autoComplete="email"
                        />
                        <select value={uRol} onChange={(e) => setURol(e.target.value)}>
                            <option value="DOCENTE">DOCENTE</option>
                            <option value="JEFE DE AREA">JEFE DE AREA</option>
                            <option value="DIRECTOR">DIRECTOR</option>
                            <option value="ASISTENTE">ASISTENTE</option>
                            <option value="ADMINISTRADOR GENERAL">ADMINISTRADOR GENERAL</option>
                        </select>
                        <input type="text" placeholder="Grupo/Área" value={uGrupo} onChange={(e) => setUGrupo(e.target.value)} />
                        <button className="btn btn-green" onClick={addUsuario} style={{ margin: 0 }}>
                            <i className="fas fa-user-plus"></i> Crear Usuario
                        </button>
                    </div>
                    <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b', textAlign: 'left' }}>
                        * Obligatorios: nombre (solo letras), documento (solo números, 5–15 dígitos) y correo válido.
                        No se permiten documento ni correo duplicados.
                    </p>

                    <div style={{
                        background: '#f8f9fa',
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '2px dashed #3a5f95',
                        textAlign: 'center',
                        marginBottom: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <div style={{ fontSize: '22px', color: 'var(--color-blue-dark)', lineHeight: 1 }}>
                            <i className="fas fa-file-csv"></i>
                        </div>
                        <h4 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '15px' }}>
                            Importación Masiva desde CSV
                        </h4>
                        <p style={{ margin: 0, fontSize: '12px', color: '#666', maxWidth: '460px', lineHeight: 1.35 }}>
                            Descargue la plantilla oficial y complete las columnas obligatorias:
                            <code> nombre</code>, <code>documento</code>, <code>email</code> y <code>rol</code>.
                            La columna <code>grupo</code> es opcional.
                        </p>
                        <small style={{ color: '#64748b', fontSize: '11px' }}>
                            Roles permitidos: DOCENTE, JEFE DE AREA, DIRECTOR, ASISTENTE y ADMINISTRADOR GENERAL.
                        </small>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                            <button
                                type="button"
                                className="btn btn-green"
                                onClick={downloadUsersTemplate}
                                style={{ margin: 0, width: 'auto', padding: '10px 14px', fontSize: '12px' }}
                            >
                                <i className="fas fa-download"></i> Descargar Plantilla Oficial
                            </button>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleCSVImport}
                                style={{ display: 'none' }}
                                id="csv-file-input"
                            />
                            <label
                                htmlFor="csv-file-input"
                                className="btn btn-purple"
                                style={{ margin: 0, cursor: 'pointer', width: 'auto', padding: '10px 14px', fontSize: '12px' }}
                            >
                                <i className="fas fa-upload"></i> Seleccionar Archivo CSV
                            </label>
                        </div>
                    </div>

                    {(bulkPreview.length > 0 || bulkPreviewErrors.length > 0) && (
                        <div
                            onClick={() => { if (!bulkImporting) clearBulkPreview(); }}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(15, 23, 42, 0.55)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                zIndex: 3000
                            }}
                        >
                        <div
                            onClick={(ev) => ev.stopPropagation()}
                            style={{
                            width: '100%',
                            maxWidth: '860px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            background: 'white',
                            border: '1px solid #dbe4ee',
                            borderRadius: '12px',
                            padding: '18px',
                            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.35)',
                            textAlign: 'left'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                <div>
                                    <h4 style={{ margin: 0, color: 'var(--color-blue-dark)' }}>
                                        <i className="fas fa-eye"></i> Vista previa de la carga
                                    </h4>
                                    <small style={{ color: '#64748b' }}>Archivo: {bulkFileName}</small>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <span className="badge" style={{ background: '#27ae60', color: 'white' }}>
                                        {bulkPreview.length} listo(s) para crear
                                    </span>
                                    <span className="badge" style={{ background: bulkPreviewErrors.length ? '#e74c3c' : '#95a5a6', color: 'white' }}>
                                        {bulkPreviewErrors.length} con error
                                    </span>
                                </div>
                            </div>

                            <div className="table-container" style={{ maxHeight: '320px', marginBottom: '15px' }}>
                                <table className="mini-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Fila</th>
                                            <th>Nombre</th>
                                            <th>Documento</th>
                                            <th>Correo</th>
                                            <th>Rol</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bulkPreview.map((user) => (
                                            <tr key={`ok-${user._fila}-${user.documento}`}>
                                                <td>{user._fila}</td>
                                                <td>{user.nombre}</td>
                                                <td>{user.documento}</td>
                                                <td>{user.email}</td>
                                                <td>{user.rol}</td>
                                                <td>
                                                    <span style={{ color: '#27864a', fontWeight: '700' }}>
                                                        <i className="fas fa-check-circle"></i> Lista
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {bulkPreviewErrors.map((error) => (
                                            <tr key={`error-${error.fila}-${error.documento}`}>
                                                <td>{error.fila}</td>
                                                <td>—</td>
                                                <td>{error.documento || '—'}</td>
                                                <td>{error.email || '—'}</td>
                                                <td>—</td>
                                                <td>
                                                    <span style={{ color: '#c0392b', fontWeight: '700' }} title={error.motivo}>
                                                        <i className="fas fa-times-circle"></i> {error.motivo}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-back"
                                    onClick={clearBulkPreview}
                                    disabled={bulkImporting}
                                    style={{ margin: 0, width: 'auto' }}
                                >
                                    Cancelar carga
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-green"
                                    onClick={confirmBulkImport}
                                    disabled={bulkPreview.length === 0 || bulkImporting}
                                    style={{ margin: 0, width: 'auto' }}
                                >
                                    <i className={bulkImporting ? 'fas fa-spinner fa-spin' : 'fas fa-users'}></i>
                                    {bulkImporting ? ' Importando...' : ` Crear ${bulkPreview.length} usuario(s)`}
                                </button>
                            </div>
                        </div>
                        </div>
                    )}

                    <div style={{ marginBottom: '15px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '2 1 320px' }}>
                            <i
                                className="fas fa-search"
                                style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                            ></i>
                            <input
                                type="search"
                                placeholder="Buscar por nombre, documento, correo, rol o grupo..."
                                value={userSearch}
                                onChange={(event) => { setUserSearch(event.target.value); setUsersPage(1); }}
                                style={{ width: '100%', paddingLeft: '42px', margin: 0 }}
                            />
                        </div>
                        <select
                            value={userRoleFilter}
                            onChange={(event) => { setUserRoleFilter(event.target.value); setUsersPage(1); }}
                            aria-label="Filtrar usuarios por rol"
                            style={{ margin: 0, flex: '1 1 190px' }}
                        >
                            <option value="ALL">Todos los roles</option>
                            {userRoles.map((role) => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                        <select
                            value={userGroupFilter}
                            onChange={(event) => { setUserGroupFilter(event.target.value); setUsersPage(1); }}
                            aria-label="Filtrar usuarios por grupo o área"
                            style={{ margin: 0, flex: '1 1 200px' }}
                        >
                            <option value="ALL">Todos los grupos/áreas</option>
                            {userGroups.map((group) => (
                                <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
                        <select
                            value={userEstadoFilter}
                            onChange={(event) => { setUserEstadoFilter(event.target.value); setUsersPage(1); }}
                            aria-label="Filtrar usuarios por estado"
                            style={{ margin: 0, flex: '1 1 160px' }}
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="activo">Activos</option>
                            <option value="inactivo">Inactivos</option>
                        </select>
                        <button
                            type="button"
                            className="btn btn-back"
                            onClick={() => {
                                setUserSearch('');
                                setUserRoleFilter('ALL');
                                setUserGroupFilter('ALL');
                                setUserEstadoFilter('ALL');
                                setUsersPage(1);
                            }}
                            disabled={!hasUserFilters}
                            style={{ margin: 0, width: 'auto', whiteSpace: 'nowrap' }}
                        >
                            <i className="fas fa-filter-circle-xmark"></i> Limpiar
                        </button>
                        </div>
                        <small style={{ display: 'block', marginTop: '6px', color: '#64748b' }}>
                            Mostrando {usersPager.total ? `${usersPager.from}–${usersPager.to} de ` : ''}{usersPager.total} de {users.length} usuario(s)
                        </small>
                    </div>

                    <div className="table-container">
                        <table className="mini-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Documento</th>
                                    <th>Correo</th>
                                    <th>Rol</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '24px', color: '#64748b' }}>
                                            No se encontraron usuarios que coincidan con la búsqueda.
                                        </td>
                                    </tr>
                                ) : pageUsers.map(u => {
                                    const activo = isUsuarioActivo(u);
                                    return (
                                    <tr key={u.documento} style={{ opacity: activo ? 1 : 0.72 }}>
                                        <td>{u.nombre}</td>
                                        <td>{u.documento}</td>
                                        <td>{u.email || <span style={{ color: '#94a3b8' }}>Sin correo</span>}</td>
                                        <td>{u.rol}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 10px',
                                                borderRadius: '999px',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                background: activo ? '#e8f8ee' : '#fdecec',
                                                color: activo ? '#27864a' : '#c0392b'
                                            }}>
                                                {activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="btn btn-purple"
                                                onClick={() => viewUsuarioDetalles(u)}
                                                style={{ padding: '5px 10px', fontSize: '12px', margin: 0, width: 'auto' }}
                                                title="Ver detalles"
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-dark"
                                                onClick={() => editUsuario(u)}
                                                style={{ padding: '5px 10px', fontSize: '12px', margin: 0, width: 'auto' }}
                                                title="Editar área y rol"
                                            >
                                                <i className="fas fa-pen"></i>
                                            </button>
                                            <button
                                                type="button"
                                                className={activo ? 'btn btn-red' : 'btn btn-green'}
                                                onClick={() => toggleUsuarioActivo(u)}
                                                style={{ padding: '5px 10px', fontSize: '12px', margin: 0, width: 'auto' }}
                                                title={activo ? 'Desactivar usuario' : 'Reactivar usuario'}
                                            >
                                                <i className={activo ? 'fas fa-user-slash' : 'fas fa-user-check'}></i>
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <PaginationBar
                        page={usersPager.page}
                        totalPages={usersPager.totalPages}
                        total={usersPager.total}
                        from={usersPager.from}
                        to={usersPager.to}
                        label="usuarios"
                        onPrev={() => setUsersPage((p) => Math.max(1, p - 1))}
                        onNext={() => setUsersPage((p) => Math.min(usersPager.totalPages, p + 1))}
                    />
                </div>
            </div>
        );
    };

    const renderConfigUI = () => (
        <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button className="btn btn-back" onClick={() => setView('main')}>
                    <i className="fas fa-arrow-left"></i> Volver al Inicio
                </button>
            </div>
            <div className="card">
                <h3 style={{ color: 'var(--color-blue-dark)', textAlign: 'center' }}>Configuración del Sistema</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '20px' }}>
                    <button className="btn btn-dark" onClick={showSystemInfo}>
                        <i className="fas fa-info-circle"></i> Info del Sistema
                    </button>
                    <button className="btn btn-purple" onClick={clearAppCache}>
                        <i className="fas fa-broom"></i> Limpiar Caché
                    </button>
                    <button className="btn btn-orange" onClick={showSecurityPolicies}>
                        <i className="fas fa-shield-alt"></i> Políticas de Seguridad
                    </button>
                    <button className="btn btn-green" onClick={runBackup}>
                        <i className="fas fa-download"></i> Backup completo
                    </button>
                    <button className="btn btn-dark" onClick={runRestoreBackup}>
                        <i className="fas fa-upload"></i> Restaurar backup
                    </button>
                    <button className="btn btn-red" onClick={runPurgeRetencion}>
                        <i className="fas fa-trash-alt"></i> Limpiar &gt; 1 año
                    </button>
                </div>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (view) {
            case 'users': return renderUsersUI();
            case 'logs': return renderLogsUI();
            case 'kpis': return renderKPIsUI();
            case 'config': return renderConfigUI();
            case 'schedules': return renderSchedulesUI();
            case 'zones': return renderZonesUI();
            case 'live': return <LiveSupervision onBack={() => setView('main')} mapId="map-admin-live" mode="live" />;
            case 'historial': return <LiveSupervision onBack={() => setView('main')} mapId="map-admin-history" mode="history" refreshMs={120000} />;
            case 'cumplimiento': return <CumplimientoVigilancias onBack={() => setView('main')} />;
            case 'comunicados': return renderComunicadosUI();
            default: return renderMainButtons();
        }
    };

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <style>
                {`
                @media print {
                    body * { visibility: hidden; }
                    #print-section, #print-section * { visibility: visible; }
                    #print-section { position: absolute; left: 0; top: 0; width: 100%; }
                    #no-print { display: none !important; }
                }

                /* Custom Zone Grid & Cards */
                .zones-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 20px;
                    width: 100%;
                    margin-top: 10px;
                }

                .zone-card {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
                    border-top: 6px solid #ccc;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    min-height: 280px;
                    text-align: left;
                }

                .zone-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.12);
                }

                .zone-card.type-snack {
                    border-top-color: #6AB04C;
                }

                .zone-card.type-lunch {
                    border-top-color: #2980B9;
                }

                .zone-card.type-otro {
                    border-top-color: #7F8C8D;
                }

                .zone-card-add {
                    border: 3px dashed #cbd5e1;
                    background: rgba(255, 255, 255, 0.5);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    min-height: 280px;
                    border-radius: 16px;
                    transition: all 0.3s ease;
                    gap: 12px;
                    color: #64748b;
                }

                .zone-card-add:hover {
                    background: rgba(255, 255, 255, 0.85);
                    border-color: var(--color-blue-primary);
                    color: var(--color-blue-dark);
                    transform: translateY(-5px);
                    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.08);
                }

                .zone-card-add i {
                    font-size: 36px;
                }

                .zone-card-add span {
                    font-weight: 700;
                    font-size: 16px;
                }

                .zone-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: white;
                }

                .zone-badge.bg-snack {
                    background-color: #6AB04C;
                }

                .zone-badge.bg-lunch {
                    background-color: #2980B9;
                }

                .zone-badge.bg-otro {
                    background-color: #7F8C8D;
                }

                .zone-info-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 13px;
                    color: #475569;
                    margin: 8px 0;
                }

                .zone-info-row i {
                    color: var(--color-blue-primary);
                    width: 16px;
                }

                .zone-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 15px;
                    border-top: 1px solid #f1f5f9;
                    padding-top: 12px;
                }

                .zone-btn {
                    flex: 1;
                    padding: 8px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    color: white;
                    transition: all 0.2s ease;
                }

                .zone-btn-qr {
                    background-color: var(--color-purple-primary);
                }
                .zone-btn-qr:hover {
                    background-color: var(--color-purple-dark);
                }

                .zone-btn-edit {
                    background-color: var(--color-orange-primary);
                }
                .zone-btn-edit:hover {
                    background-color: var(--color-orange-dark);
                }

                .zone-btn-delete {
                    background-color: var(--color-red-primary);
                    max-width: 42px;
                }
                .zone-btn-delete:hover {
                    background-color: var(--color-red-dark);
                }
                `}
            </style>

            {renderContent()}

            {selectedQR && (
                <div id="qr-modal" style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000,
                    padding: '10px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '450px',
                        maxHeight: '95vh',
                        background: 'white',
                        padding: '0',
                        borderRadius: '10px',
                        overflowY: 'auto',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* QR Print Template V3 (PNG COMPLIANT) */}
                        <div id="print-section" style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'white',
                            position: 'relative',
                            minHeight: '700px'
                        }}>
                            {/* Dynamic Color Header */}
                            <div style={{
                                backgroundColor: selectedQR.tipo === 'SNACK' ? '#2e7d32' : selectedQR.tipo === 'LUNCH' ? '#007abe' : '#333',
                                height: '40px',
                                width: '100%'
                            }}></div>

                            <div style={{ padding: '30px 20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                {/* Category Header */}
                                <h1 style={{
                                    margin: '0',
                                    fontSize: '50px',
                                    color: '#333',
                                    fontWeight: '800',
                                    textTransform: 'uppercase'
                                }}>
                                    {selectedQR.tipo || 'LUNCH'}
                                </h1>

                                {/* Zone Name */}
                                <div style={{
                                    fontSize: '28px',
                                    margin: '5px 0 20px 0',
                                    fontWeight: '700',
                                    color: '#000',
                                    lineHeight: '1.2'
                                }}>
                                    {selectedQR.nombre}
                                </div>

                                {/* Separator */}
                                <div style={{ width: '90%', height: '1px', background: '#e0e0e0', marginBottom: '20px' }}></div>

                                {/* QR Code Container */}
                                <div style={{
                                    border: '1px solid #eee',
                                    padding: '15px',
                                    background: 'white',
                                    marginBottom: '30px'
                                }}>
                                    <QRCodeSVG
                                        value={selectedQR.id}
                                        size={220}
                                        level="H"
                                        fgColor="#000000"
                                        includeMargin={false}
                                    />
                                </div>

                                {/* Alias identification */}
                                <div>
                                    <div style={{ fontSize: '14px', color: '#666', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        IDENTIFICADOR VISUAL (ALIAS):
                                    </div>
                                    <div style={{ fontSize: '55px', fontWeight: '900', color: '#000', marginTop: '-5px' }}>
                                        {selectedQR.alias}
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Color Footer (Activity) */}
                            <div style={{
                                backgroundColor: selectedQR.tipo === 'SNACK' ? '#2e7d32' : selectedQR.tipo === 'LUNCH' ? '#007abe' : '#333',
                                padding: '25px 20px',
                                width: '100%',
                                marginTop: 'auto'
                            }}>
                                <p style={{
                                    color: 'white',
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    textAlign: 'center',
                                    margin: 0,
                                    lineHeight: '1.3'
                                }}>
                                    {selectedQR.actividad || 'Vigilancia y control institucional.'}
                                </p>
                            </div>
                        </div>

                        {/* Modal Action UI */}
                        <div id="no-print" style={{
                            display: 'flex',
                            gap: '10px',
                            padding: '15px',
                            background: '#f5f5f5',
                            borderTop: '1px solid #ddd',
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 10
                        }}>
                            <button className="btn btn-green" onClick={() => window.print()} style={{ flex: 1, height: '45px', margin: 0 }}>
                                <i className="fas fa-print"></i> IMPRIMIR
                            </button>
                            <button className="btn btn-purple" onClick={downloadQRImage} style={{ flex: 1.5, height: '45px', margin: 0 }}>
                                <i className="fas fa-download"></i> DESCARGAR IMAGEN
                            </button>
                            <button className="btn btn-dark" onClick={() => setSelectedQR(null)} style={{ flex: 1, height: '45px', margin: 0 }}>
                                <i className="fas fa-times"></i> CERRAR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardAdmin;
