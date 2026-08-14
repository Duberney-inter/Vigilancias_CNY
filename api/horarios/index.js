import { query } from '../_lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE, DIRECTOR_ROLE, isSupervisorRole } from '../_lib/auth.js';
import { insertLogFromToken } from '../_lib/audit.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    // Asegurar que exista la tabla de horarios
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS horarios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "usuarioId" TEXT,
                "zonaId" TEXT,
                "diaCiclo" INTEGER,
                "createdAt" TIMESTAMP DEFAULT NOW(),
                UNIQUE ("usuarioId", "diaCiclo")
            );
        `);
    } catch (e) {
        console.error("Error creating table 'horarios':", e);
    }

    if (req.method === 'GET') {
        try {
            const ownDocumento = String(decoded.documento || decoded.uid);
            const qStr = isSupervisorRole(decoded.rol)
                ? 'SELECT * FROM horarios'
                : 'SELECT * FROM horarios WHERE "usuarioId" = $1';
            const qParams = isSupervisorRole(decoded.rol) ? [] : [ownDocumento];
            const { rows } = await query(qStr, qParams);
            return res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching schedules:', error);
            return res.status(500).json({ error: 'Error al obtener horarios' });
        }
    }

    if (req.method === 'POST') {
        if (!requireRole(decoded, res, [ADMIN_ROLE, DIRECTOR_ROLE])) return;
        try {
            const { asignaciones } = req.body; // Array de { usuarioId, zonaId, diaCiclo }

            if (!Array.isArray(asignaciones)) {
                return res.status(400).json({ error: 'Se requiere un array de asignaciones' });
            }

            for (const asig of asignaciones) {
                const { usuarioId, zonaId, diaCiclo } = asig;
                if (!usuarioId || diaCiclo === undefined) continue;

                if (!zonaId) {
                    // Si no se asignó zona, eliminamos cualquier asignación previa
                    await query(
                        'DELETE FROM horarios WHERE "usuarioId" = $1 AND "diaCiclo" = $2',
                        [usuarioId, parseInt(diaCiclo)]
                    );
                } else {
                    // Insertar o actualizar asignación
                    await query(`
                        INSERT INTO horarios ("usuarioId", "zonaId", "diaCiclo")
                        VALUES ($1, $2, $3)
                        ON CONFLICT ("usuarioId", "diaCiclo") 
                        DO UPDATE SET "zonaId" = EXCLUDED."zonaId"
                    `, [usuarioId, zonaId, parseInt(diaCiclo)]);
                }
            }

            await insertLogFromToken(
                decoded,
                `Actualización de ${asignaciones.length} asignaciones de horarios`
            );

            return res.status(200).json({ message: 'Horarios guardados correctamente' });
        } catch (error) {
            console.error('Error saving schedules:', error);
            return res.status(500).json({ error: 'Error al guardar horarios' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
