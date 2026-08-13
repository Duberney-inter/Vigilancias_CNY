import { query } from '../lib/db.js';
import { handleCors, requireAuth, isSupervisorRole, requireRole } from '../lib/auth.js';
import { put } from '@vercel/blob';
import { insertLogFromToken } from '../lib/audit.js';

const OPERATIVE_ROLES = ['DOCENTE', 'JEFE DE AREA'];

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        if (!isSupervisorRole(decoded.rol)) {
            return res.status(403).json({
                error: 'Acceso denegado',
                message: 'Su rol no tiene permisos para consultar novedades'
            });
        }
        try {
            const { rows } = await query('SELECT * FROM novedades ORDER BY timestamp DESC');
            return res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching novedades:', error);
            return res.status(500).json({ error: 'Error al obtener novedades' });
        }
    }

    if (req.method === 'POST') {
        if (!requireRole(decoded, res, OPERATIVE_ROLES)) return;
        try {
            const { detalle, mediaUrl, area, tipo } = req.body;
            const usuarioId = decoded.documento || decoded.uid;
            const usuarioNombre = decoded.nombre;

            if (!detalle) {
                return res.status(400).json({ error: 'Detalle requerido' });
            }

            let blobUrl = '';

            if (mediaUrl && mediaUrl.startsWith('data:image')) {
                const isLocalDb = process.env.USE_LOCAL_DB === 'true';
                const hasValidToken = process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN !== 'vercel_blob_rw_xxxxx';

                if (isLocalDb || !hasValidToken) {
                    console.log('[API] Guardando imagen localmente en formato Base64.');
                    blobUrl = mediaUrl;
                } else {
                    try {
                        const base64Data = mediaUrl.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        const filename = `novedad_${Date.now()}.jpg`;

                        const blob = await put(filename, buffer, {
                            access: 'public',
                            contentType: 'image/jpeg'
                        });

                        blobUrl = blob.url;
                    } catch (blobError) {
                        console.error('[API] Error subiendo a Vercel Blob, usando Base64 como fallback:', blobError);
                        blobUrl = mediaUrl;
                    }
                }
            } else if (mediaUrl) {
                blobUrl = mediaUrl;
            }

            const { rows } = await query(`
                INSERT INTO novedades (detalle, "mediaUrl", "usuarioId", "usuarioNombre", area, tipo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `, [
                detalle,
                blobUrl,
                usuarioId || '',
                usuarioNombre || '',
                area || 'General',
                tipo || 'INCIDENCIA'
            ]);

            await insertLogFromToken(decoded, `Registro de novedad: ${String(detalle).slice(0, 80)}`);

            return res.status(201).json({
                message: 'Novedad registrada',
                id: rows[0].id
            });
        } catch (error) {
            console.error('Error creating novedad:', error);
            return res.status(500).json({ error: 'Error al crear novedad' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
