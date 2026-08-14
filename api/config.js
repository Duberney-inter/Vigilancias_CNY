import { query } from './_lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from './_lib/auth.js';
import { insertLogFromToken } from './_lib/audit.js';

// Configuración general de la app (clave/valor único por ahora: horario de
// rastreo GPS). Se guarda en una tabla de una sola fila (id fijo = 1).
const DEFAULT_GPS_DESDE = '06:00';
const DEFAULT_GPS_HASTA = '18:00';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function ensureConfigTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS configuracion (
            id INTEGER PRIMARY KEY DEFAULT 1,
            gps_desde TEXT NOT NULL DEFAULT '${DEFAULT_GPS_DESDE}',
            gps_hasta TEXT NOT NULL DEFAULT '${DEFAULT_GPS_HASTA}',
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    try {
        await ensureConfigTable();
    } catch (error) {
        console.error('Error ensuring configuracion table:', error);
        return res.status(500).json({ error: 'No se pudo preparar la configuración' });
    }

    if (req.method === 'GET') {
        try {
            const { rows } = await query('SELECT gps_desde, gps_hasta FROM configuracion WHERE id = 1 LIMIT 1');
            const config = rows[0];
            return res.status(200).json({
                gpsDesde: config?.gps_desde || DEFAULT_GPS_DESDE,
                gpsHasta: config?.gps_hasta || DEFAULT_GPS_HASTA
            });
        } catch (error) {
            console.error('Error fetching config:', error);
            return res.status(500).json({ error: 'Error al obtener la configuración' });
        }
    }

    if (req.method === 'PUT') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const { gpsDesde, gpsHasta } = req.body || {};

            if (!TIME_RE.test(gpsDesde) || !TIME_RE.test(gpsHasta)) {
                return res.status(400).json({
                    error: 'invalid-fields',
                    message: 'Formato de hora inválido. Use HH:MM (ej. 06:00)'
                });
            }

            await query(`
                INSERT INTO configuracion (id, gps_desde, gps_hasta, "updatedAt")
                VALUES (1, $1, $2, NOW())
                ON CONFLICT (id) DO UPDATE SET gps_desde = $1, gps_hasta = $2, "updatedAt" = NOW()
            `, [gpsDesde, gpsHasta]);

            await insertLogFromToken(decoded, `Horario de rastreo GPS actualizado: ${gpsDesde} a ${gpsHasta}`);

            return res.status(200).json({
                message: 'Configuración actualizada correctamente',
                gpsDesde,
                gpsHasta
            });
        } catch (error) {
            console.error('Error updating config:', error);
            return res.status(500).json({ error: 'Error al actualizar la configuración' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
