import { query } from '../_lib/db.js';
import { handleCors, requireAuth, ADMIN_ROLE, DIRECTOR_ROLE, ASISTENTE_ROLE, requireRole } from '../_lib/auth.js';
import { insertLogFromToken } from '../_lib/audit.js';

const PRIVILEGED_ROLES = [ADMIN_ROLE, DIRECTOR_ROLE, ASISTENTE_ROLE];
const OPERATIVE_ROLES = ['DOCENTE', 'JEFE DE AREA'];

// Un solo registro por persona/zona/día: cada zona tiene un único horario
// diario, así que "una vez por día en esta zona" equivale a "una vez en el
// horario asignado a esa zona".
const dayPrefix = (isoTimestamp) => String(isoTimestamp || '').slice(0, 10);

async function findExistingRegistro(usuarioId, zonaId, isoTimestamp) {
    const prefix = dayPrefix(isoTimestamp);
    if (!zonaId || !prefix) return null;
    const { rows } = await query(
        `SELECT id FROM registros
         WHERE "usuarioId" = $1 AND "zonaId" = $2 AND timestamp LIKE $3
         LIMIT 1`,
        [usuarioId, zonaId, `${prefix}%`]
    );
    return rows[0] || null;
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    const ownDocumento = decoded.documento || decoded.uid;
    const canViewAll = PRIVILEGED_ROLES.includes(decoded.rol);

    if (req.method === 'GET') {
        try {
            const requestedId = req.query.usuarioId;
            const usuarioId = canViewAll ? requestedId : ownDocumento;

            const qStr = usuarioId
                ? 'SELECT * FROM registros WHERE "usuarioId" = $1 ORDER BY timestamp DESC'
                : 'SELECT * FROM registros ORDER BY timestamp DESC';
            const qParams = usuarioId ? [usuarioId] : [];
            const { rows } = await query(qStr, qParams);
            return res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching registros:', error);
            return res.status(500).json({ error: 'Error al obtener registros' });
        }
    }

    if (req.method === 'POST') {
        // Asistente / supervisión no registran vigilancias.
        if (!requireRole(decoded, res, OPERATIVE_ROLES)) return;
        try {
            const body = req.body;

            if (Array.isArray(body)) {
                if (body.length === 0) return res.status(200).json({ message: 'No records to sync', count: 0 });

                const values = [];
                const placeholders = [];
                let i = 1;
                let skipped = 0;
                // Evita duplicados dentro del mismo lote (ej. dos escaneos offline
                // de la misma zona el mismo día antes de sincronizar).
                const seenInBatch = new Set();

                for (const item of body) {
                    const isoTimestamp = item.timestamp || new Date().toISOString();
                    const batchKey = `${item.zonaId}|${dayPrefix(isoTimestamp)}`;

                    if (seenInBatch.has(batchKey) || await findExistingRegistro(ownDocumento, item.zonaId, isoTimestamp)) {
                        skipped++;
                        continue;
                    }
                    seenInBatch.add(batchKey);

                    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, NOW())`);
                    values.push(
                        item.zonaId,
                        item.zonaAlias,
                        ownDocumento,
                        decoded.nombre,
                        isoTimestamp,
                        item.coords?.lat || null,
                        item.coords?.lng || null,
                        item.distancia || 0
                    );
                }

                if (placeholders.length > 0) {
                    await query(
                        `INSERT INTO registros ("zonaId", "zonaAlias", "usuarioId", "usuarioNombre", timestamp, latitud, longitud, distancia, "syncedAt")
                         VALUES ${placeholders.join(', ')}`,
                        values
                    );
                    await insertLogFromToken(decoded, `Sincronización offline de ${placeholders.length} vigilancia(s)`);
                }

                return res.status(201).json({
                    message: skipped > 0
                        ? `${placeholders.length} registros sincronizados, ${skipped} omitido(s) por duplicado`
                        : `${placeholders.length} registros sincronizados`,
                    count: placeholders.length,
                    skipped
                });
            }

            const isoTimestamp = body.timestamp || new Date().toISOString();
            const existing = await findExistingRegistro(ownDocumento, body.zonaId, isoTimestamp);
            if (existing) {
                return res.status(409).json({
                    error: 'duplicate-registro',
                    message: 'Ya registró su vigilancia en esta zona durante este horario. No puede volver a registrar hasta el siguiente turno.'
                });
            }

            const { rows } = await query(`
                INSERT INTO registros ("zonaId", "zonaAlias", "usuarioId", "usuarioNombre", timestamp, latitud, longitud, distancia)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                body.zonaId,
                body.zonaAlias,
                ownDocumento,
                decoded.nombre,
                isoTimestamp,
                body.coords?.lat || null,
                body.coords?.lng || null,
                body.distancia || 0
            ]);

            await insertLogFromToken(
                decoded,
                `Registro de vigilancia exitoso en zona: ${body.zonaAlias || body.zonaId || 'N/A'}`
            );

            return res.status(201).json({
                message: 'Registro creado',
                id: rows[0].id
            });
        } catch (error) {
            console.error('Error creating registro:', error);
            return res.status(500).json({ error: 'Error al crear registro' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
