import { query } from './_lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from './_lib/auth.js';
import { insertLogFromToken } from './_lib/audit.js';

// Configuración general de la app (clave/valor único por ahora: horario y
// días de rastreo GPS). Se guarda en una tabla de una sola fila (id fijo = 1).
const DEFAULT_GPS_DESDE = '06:00';
const DEFAULT_GPS_HASTA = '18:00';
// 1=Lunes ... 5=Viernes (mismo criterio que src/utils/cycleDay.js).
const DEFAULT_GPS_DIAS = '1,2,3,4,5';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIAS_RE = /^[1-7](,[1-7]){0,6}$/;

async function ensureConfigTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS configuracion (
            id INTEGER PRIMARY KEY DEFAULT 1,
            gps_desde TEXT NOT NULL DEFAULT '${DEFAULT_GPS_DESDE}',
            gps_hasta TEXT NOT NULL DEFAULT '${DEFAULT_GPS_HASTA}',
            gps_dias TEXT NOT NULL DEFAULT '${DEFAULT_GPS_DIAS}',
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);
    // La tabla puede ya existir de antes de agregar gps_dias.
    await query(`ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS gps_dias TEXT NOT NULL DEFAULT '${DEFAULT_GPS_DIAS}';`);
}

function parseDias(value) {
    return String(value || DEFAULT_GPS_DIAS).split(',').map(Number).filter((n) => n >= 1 && n <= 7);
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
            const { rows } = await query('SELECT gps_desde, gps_hasta, gps_dias FROM configuracion WHERE id = 1 LIMIT 1');
            const config = rows[0];
            return res.status(200).json({
                gpsDesde: config?.gps_desde || DEFAULT_GPS_DESDE,
                gpsHasta: config?.gps_hasta || DEFAULT_GPS_HASTA,
                gpsDias: parseDias(config?.gps_dias)
            });
        } catch (error) {
            console.error('Error fetching config:', error);
            return res.status(500).json({ error: 'Error al obtener la configuración' });
        }
    }

    if (req.method === 'PUT') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const { gpsDesde, gpsHasta, gpsDias } = req.body || {};

            if (!TIME_RE.test(gpsDesde) || !TIME_RE.test(gpsHasta)) {
                return res.status(400).json({
                    error: 'invalid-fields',
                    message: 'Formato de hora inválido. Use HH:MM (ej. 06:00)'
                });
            }

            const diasStr = Array.isArray(gpsDias)
                ? [...new Set(gpsDias.map(Number))].filter((n) => n >= 1 && n <= 7).sort().join(',')
                : '';

            if (!DIAS_RE.test(diasStr)) {
                return res.status(400).json({
                    error: 'invalid-fields',
                    message: 'Debe seleccionar al menos un día de la semana'
                });
            }

            await query(`
                INSERT INTO configuracion (id, gps_desde, gps_hasta, gps_dias, "updatedAt")
                VALUES (1, $1, $2, $3, NOW())
                ON CONFLICT (id) DO UPDATE SET gps_desde = $1, gps_hasta = $2, gps_dias = $3, "updatedAt" = NOW()
            `, [gpsDesde, gpsHasta, diasStr]);

            await insertLogFromToken(decoded, `Horario de rastreo GPS actualizado: ${gpsDesde} a ${gpsHasta}, días ${diasStr}`);

            return res.status(200).json({
                message: 'Configuración actualizada correctamente',
                gpsDesde,
                gpsHasta,
                gpsDias: parseDias(diasStr)
            });
        } catch (error) {
            console.error('Error updating config:', error);
            return res.status(500).json({ error: 'Error al actualizar la configuración' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
