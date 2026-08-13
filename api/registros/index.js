import { query } from '../lib/db.js';
import { handleCors, requireAuth, ADMIN_ROLE, DIRECTOR_ROLE, ASISTENTE_ROLE, requireRole } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';

const PRIVILEGED_ROLES = [ADMIN_ROLE, DIRECTOR_ROLE, ASISTENTE_ROLE];
const OPERATIVE_ROLES = ['DOCENTE', 'JEFE DE AREA'];

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

                for (const item of body) {
                    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, NOW())`);
                    values.push(
                        item.zonaId,
                        item.zonaAlias,
                        ownDocumento,
                        decoded.nombre,
                        item.timestamp || new Date().toISOString(),
                        item.coords?.lat || null,
                        item.coords?.lng || null,
                        item.distancia || 0
                    );
                }

                await query(
                    `INSERT INTO registros ("zonaId", "zonaAlias", "usuarioId", "usuarioNombre", timestamp, latitud, longitud, distancia, "syncedAt")
                     VALUES ${placeholders.join(', ')}`,
                    values
                );
                await insertLogFromToken(decoded, `Sincronización offline de ${body.length} vigilancia(s)`);

                return res.status(201).json({
                    message: `${body.length} registros sincronizados`,
                    count: body.length
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
                body.timestamp || new Date().toISOString(),
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
