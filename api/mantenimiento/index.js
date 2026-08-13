import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { retentionCutoffIso, RETENTION_YEARS } from '../lib/retention.js';

function deletedCount(result) {
    return result.rowCount ?? result.rows?.length ?? 0;
}

/**
 * POST /api/mantenimiento — purga datos anteriores a la retención (≥ 1 año).
 * Nunca elimina registros dentro de la ventana de retención.
 */
export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [ADMIN_ROLE])) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const action = req.body?.action || 'purge';
    if (action !== 'purge') {
        return res.status(400).json({ error: 'Acción no soportada', message: 'Use action: "purge"' });
    }

    try {
        const cutoff = retentionCutoffIso();

        // consultas separadas: evita mezclar text vs timestamptz en el mismo $1 (PGlite)
        const delRegSynced = await query(
            `DELETE FROM registros
             WHERE "syncedAt" IS NOT NULL
               AND "syncedAt" < $1::timestamptz
             RETURNING id`,
            [cutoff]
        );

        const delRegText = await query(
            `DELETE FROM registros
             WHERE "syncedAt" IS NULL
               AND timestamp IS NOT NULL
               AND btrim(timestamp) <> ''
               AND timestamp < $1
             RETURNING id`,
            [cutoff]
        );

        const delLogs = await query(
            `DELETE FROM logs
             WHERE timestamp IS NOT NULL
               AND "timestamp" < $1::timestamptz
             RETURNING id`,
            [cutoff]
        );

        const delNovedades = await query(
            `DELETE FROM novedades
             WHERE timestamp IS NOT NULL
               AND "timestamp" < $1::timestamptz
             RETURNING id`,
            [cutoff]
        );

        const deleted = {
            registros: deletedCount(delRegSynced) + deletedCount(delRegText),
            logs: deletedCount(delLogs),
            novedades: deletedCount(delNovedades)
        };

        await insertLogFromToken(
            decoded,
            `Purga retención ${RETENTION_YEARS}a (corte ${cutoff}): `
            + `${deleted.registros} registros, ${deleted.logs} logs, ${deleted.novedades} novedades`
        );

        return res.status(200).json({
            message: `Purga aplicada. Se conservan los últimos ${RETENTION_YEARS} año(s). Corte: ${cutoff}`,
            cutoff,
            retentionYears: RETENTION_YEARS,
            deleted
        });
    } catch (error) {
        console.error('Error en purga de retención:', error);
        return res.status(500).json({
            error: 'Error al purgar datos antiguos',
            message: error.message
        });
    }
}
