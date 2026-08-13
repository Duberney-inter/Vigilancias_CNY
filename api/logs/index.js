import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        // Solo Administrador consulta la auditoría completa.
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const { rows } = await query(
                'SELECT id, usuario, documento, accion, timestamp FROM logs ORDER BY timestamp DESC LIMIT 2000'
            );
            return res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching logs:', error);
            return res.status(500).json({ error: 'Error al obtener logs' });
        }
    }

    if (req.method === 'POST') {
        try {
            const { accion } = req.body || {};
            if (!accion || !String(accion).trim()) {
                return res.status(400).json({ error: 'La acción es obligatoria' });
            }

            // Identidad siempre del token (no confiar en el body).
            await insertLogFromToken(decoded, String(accion).trim());

            return res.status(201).json({ message: 'Log registrado' });
        } catch (error) {
            console.error('Error creating log:', error);
            return res.status(500).json({ error: 'Error al registrar log' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
