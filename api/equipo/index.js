import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole } from '../lib/auth.js';

const JEFE_ROLE = 'JEFE DE AREA';

const normalizeArea = (value) => String(value || '').trim().toUpperCase();

const getUserArea = (user) => normalizeArea(user?.grupoArea || user?.grupo || user?.area);

const isActiveValue = (value) => !(
    value === false
    || value === 0
    || value === '0'
    || value === 'f'
    || value === 'false'
    || value === 'FALSE'
);

const toDateKey = (timestamp) => {
    const value = String(timestamp || '');
    if (value.includes('T')) return value.split('T')[0];
    if (value.includes(' ')) return value.split(' ')[0];
    return value.slice(0, 10);
};

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [JEFE_ROLE])) return;

    try {
        const jefeDocumento = String(decoded.documento || decoded.uid || '').trim();

        const { rows: jefeRows } = await query(
            `SELECT documento, nombre, rol, grupo, "grupoArea", area, email,
                    COALESCE(activo, TRUE) AS activo
             FROM usuarios
             WHERE documento = $1
             LIMIT 1`,
            [jefeDocumento]
        );

        const jefe = jefeRows[0];
        if (!jefe) {
            return res.status(404).json({ error: 'Jefe de área no encontrado' });
        }

        const area = getUserArea(jefe);
        if (!area) {
            return res.status(400).json({
                error: 'area-required',
                message: 'Su usuario no tiene grupo/área asignado. Contacte al administrador.'
            });
        }

        const { rows: allUsers } = await query(
            `SELECT documento, nombre, rol, grupo, "grupoArea", area, email,
                    COALESCE(activo, TRUE) AS activo
             FROM usuarios
             ORDER BY nombre ASC`
        );

        const miembrosBase = allUsers.filter((user) => {
            if (String(user.documento) === jefeDocumento) return false;
            if (normalizeArea(user.rol) !== 'DOCENTE') return false;
            return getUserArea(user) === area;
        });

        const memberIds = miembrosBase.map((user) => String(user.documento));
        const today = new Date().toISOString().split('T')[0];

        let registros = [];
        let novedades = [];

        if (memberIds.length > 0) {
            const placeholders = memberIds.map((_, index) => `$${index + 1}`).join(', ');
            const { rows: registroRows } = await query(
                `SELECT * FROM registros
                 WHERE "usuarioId" IN (${placeholders})
                 ORDER BY timestamp DESC`,
                memberIds
            );
            registros = registroRows;

            const { rows: novedadRows } = await query(
                `SELECT * FROM novedades
                 WHERE "usuarioId" IN (${placeholders})
                    OR UPPER(TRIM(COALESCE(area, ''))) = $${memberIds.length + 1}
                 ORDER BY timestamp DESC`,
                [...memberIds, area]
            );
            novedades = novedadRows;
        } else {
            const { rows: novedadRows } = await query(
                `SELECT * FROM novedades
                 WHERE UPPER(TRIM(COALESCE(area, ''))) = $1
                 ORDER BY timestamp DESC`,
                [area]
            );
            novedades = novedadRows;
        }

        const miembros = miembrosBase.map((user) => {
            const docs = String(user.documento);
            const propios = registros.filter((registro) => String(registro.usuarioId) === docs);
            const delDia = propios.filter((registro) => toDateKey(registro.timestamp) === today);
            const ultimo = propios[0] || null;

            return {
                documento: user.documento,
                nombre: user.nombre,
                rol: user.rol,
                email: user.email || '',
                activo: isActiveValue(user.activo),
                area: user.grupoArea || user.grupo || user.area || '',
                cumplioHoy: delDia.length > 0,
                registrosHoy: delDia.length,
                ultimoRegistro: ultimo
                    ? {
                        id: ultimo.id,
                        timestamp: ultimo.timestamp,
                        zonaAlias: ultimo.zonaAlias,
                        zonaId: ultimo.zonaId
                    }
                    : null
            };
        });

        const activos = miembros.filter((member) => member.activo);
        const cumplieron = activos.filter((member) => member.cumplioHoy).length;
        const pendientes = activos.filter((member) => !member.cumplioHoy).length;
        const novedadesHoy = novedades.filter((item) => toDateKey(item.timestamp) === today).length;

        return res.status(200).json({
            area: jefe.grupoArea || jefe.grupo || jefe.area || '',
            jefe: {
                documento: jefe.documento,
                nombre: jefe.nombre
            },
            fecha: today,
            resumen: {
                total: miembros.length,
                activos: activos.length,
                cumplieron,
                pendientes,
                novedadesHoy,
                totalRegistros: registros.length,
                totalNovedades: novedades.length
            },
            miembros,
            registros,
            novedades
        });
    } catch (error) {
        console.error('Error fetching equipo:', error);
        return res.status(500).json({
            error: 'server-error',
            message: 'No se pudo cargar la información del equipo'
        });
    }
}
