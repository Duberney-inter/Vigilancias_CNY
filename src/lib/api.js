/**
 * API Client for Vigilancias QR CNY
 * Cliente REST hacia /api/* (PostgreSQL vía Neon o PGlite local)
 */

const API_BASE = '/api';

// ---------- Token Management ----------

function getToken() {
    const session = JSON.parse(localStorage.getItem('usuario_cny_2026') || 'null');
    return session?.token || '';
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

function isOnLoginScreen() {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/login');
}

async function handleResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Solo cerrar sesión por JWT inválido/expirado, no por errores de negocio
        // (p. ej. contraseña actual incorrecta).
        const isSessionError = res.status === 401 && !['invalid-current-password', 'invalid-credentials'].includes(data.error);
        if (isSessionError && !isOnLoginScreen()) {
            localStorage.removeItem('usuario_cny_2026');
            window.location.href = '/login';
        }

        const error = new Error(data.message || data.error || 'Error del servidor');
        error.code = data.error;
        error.status = res.status;
        throw error;
    }
    return data;
}

// ---------- Auth ----------

export async function login(user, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password })
    });
    return handleResponse(res);
}

export async function validateSession() {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    const data = await handleResponse(res);
    const session = JSON.parse(localStorage.getItem('usuario_cny_2026') || 'null');
    if (session?.token && data.user) {
        session.datos = data.user;
        localStorage.setItem('usuario_cny_2026', JSON.stringify(session));
    }
    return data;
}

export async function changePassword(newPassword, documento, currentPassword) {
    const body = { newPassword, currentPassword };
    if (documento != null && String(documento).trim() !== '') {
        body.documento = String(documento).trim();
    }
    const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body)
    });
    return handleResponse(res);
}

export async function forgotPassword(documento, email, newPassword) {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documento, email, newPassword })
    });
    return handleResponse(res);
}

// ---------- Configuración ----------

export async function getConfig() {
    const res = await fetch(`${API_BASE}/config`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function updateConfig(gpsDesde, gpsHasta) {
    const res = await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ gpsDesde, gpsHasta })
    });
    return handleResponse(res);
}

// ---------- Usuarios ----------

export async function getUsuarios() {
    const res = await fetch(`${API_BASE}/usuarios`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createUsuario(data) {
    const res = await fetch(`${API_BASE}/usuarios`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

export async function deleteUsuario(id) {
    const res = await fetch(`${API_BASE}/usuarios/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    return handleResponse(res);
}

export async function setUsuarioActivo(id, activo) {
    const res = await fetch(`${API_BASE}/usuarios/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ activo })
    });
    return handleResponse(res);
}

export async function updateUsuario(id, data) {
    const res = await fetch(`${API_BASE}/usuarios/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

export async function importUsuariosBulk(usuarios) {
    const res = await fetch(`${API_BASE}/usuarios/bulk`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ usuarios })
    });
    return handleResponse(res);
}

export async function updateUbicacionVivo(latitud, longitud) {
    const res = await fetch(`${API_BASE}/usuarios/ubicacion`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ latitud, longitud })
    });
    return handleResponse(res);
}

export async function getEquipo() {
    const res = await fetch(`${API_BASE}/equipo`, { headers: authHeaders() });
    return handleResponse(res);
}

// ---------- Zonas ----------

export async function getZonas() {
    const res = await fetch(`${API_BASE}/zonas`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function getZona(id) {
    const res = await fetch(`${API_BASE}/zonas/${id}`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createZona(data) {
    const res = await fetch(`${API_BASE}/zonas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

export async function updateZona(id, data) {
    const res = await fetch(`${API_BASE}/zonas/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

export async function deleteZona(id) {
    const res = await fetch(`${API_BASE}/zonas/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    return handleResponse(res);
}

export async function setZonaActiva(id, activo) {
    const res = await fetch(`${API_BASE}/zonas/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ activo })
    });
    return handleResponse(res);
}

// ---------- Registros ----------

export async function getRegistros(usuarioId) {
    const params = usuarioId ? `?usuarioId=${encodeURIComponent(usuarioId)}` : '';
    const res = await fetch(`${API_BASE}/registros${params}`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createRegistro(data) {
    const res = await fetch(`${API_BASE}/registros`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

export async function syncRegistros(dataArray) {
    const res = await fetch(`${API_BASE}/registros`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(dataArray)
    });
    return handleResponse(res);
}

// ---------- Novedades ----------

export async function getNovedades() {
    const res = await fetch(`${API_BASE}/novedades`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createNovedad(data) {
    const res = await fetch(`${API_BASE}/novedades`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

// ---------- Comunicados ----------

export async function getComunicados() {
    const res = await fetch(`${API_BASE}/comunicados`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function getComunicadosEnviados() {
    const res = await fetch(`${API_BASE}/comunicados?scope=enviados`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function markComunicadoLeido(id) {
    const res = await fetch(`${API_BASE}/comunicados`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id })
    });
    return handleResponse(res);
}

export async function createComunicado(data) {
    const res = await fetch(`${API_BASE}/comunicados`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

// ---------- Logs ----------

export async function getLogs() {
    const res = await fetch(`${API_BASE}/logs`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function createLog(data) {
    const res = await fetch(`${API_BASE}/logs`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(res);
}

// ---------- Horarios ----------

export async function getHorarios() {
    const res = await fetch(`${API_BASE}/horarios`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function saveHorarios(asignaciones) {
    const res = await fetch(`${API_BASE}/horarios`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ asignaciones })
    });
    return handleResponse(res);
}

// ---------- Backup / mantenimiento ----------

export async function downloadBackup() {
    const res = await fetch(`${API_BASE}/backup`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function restoreBackup(data, mode = 'replace') {
    const res = await fetch(`${API_BASE}/backup`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ mode, data })
    });
    return handleResponse(res);
}

export async function purgeOldData() {
    const res = await fetch(`${API_BASE}/mantenimiento`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'purge' })
    });
    return handleResponse(res);
}
