import { query } from '../lib/db.js';
import { handleCors, verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST' && req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const decoded = verifyToken(req);
        if (!decoded) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const { latitud, longitud } = req.body;
        const docId = decoded.documento;

        if (latitud === undefined || longitud === undefined) {
            return res.status(400).json({ error: 'Latitud y longitud son requeridas' });
        }

        await query(
            `UPDATE usuarios 
             SET latitud_actual = $1, 
                 longitud_actual = $2, 
                 actualizado_gps = NOW() 
             WHERE documento = $3`,
            [parseFloat(latitud), parseFloat(longitud), docId]
        );

        return res.status(200).json({ message: 'Ubicación actualizada con éxito' });
    } catch (error) {
        console.error('Error updating location:', error);
        return res.status(500).json({ error: 'Error al actualizar ubicación en vivo' });
    }
}
