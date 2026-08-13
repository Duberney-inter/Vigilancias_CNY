import { query } from '../lib/db.js';
import { handleCors, requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const decoded = requireAuth(req, res);
        if (!decoded) return;

        const documento = decoded.documento || decoded.uid;
        const { rows } = await query(
            `SELECT documento, nombre, rol, grupo, "grupoArea", area, email, "fotoURL"
             FROM usuarios WHERE documento = $1 LIMIT 1`,
            [documento]
        );

        const userData = rows[0];
        if (!userData) {
            return res.status(401).json({
                error: 'session-invalid',
                message: 'Usuario no encontrado o sesión inválida'
            });
        }

        return res.status(200).json({
            valid: true,
            user: {
                uid: userData.documento,
                documento: userData.documento,
                nombre: userData.nombre,
                rol: userData.rol,
                email: userData.email || '',
                fotoURL: userData.fotoURL || '',
                grupoArea: userData.grupoArea || '',
                area: userData.area || ''
            }
        });
    } catch (error) {
        console.error('Session validation error:', error);
        return res.status(500).json({ error: 'Error al validar sesión' });
    }
}
