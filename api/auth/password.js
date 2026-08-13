import { query } from '../lib/db.js';
import { requireAuth, hashPassword, validatePassword, handleCors, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const decoded = requireAuth(req, res);
        if (!decoded) return;

        const { newPassword, documento, currentPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const ownDoc = String(decoded.documento || decoded.uid || '');
        const requestedDoc = documento != null && String(documento).trim() !== ''
            ? String(documento).trim()
            : ownDoc;
        const isAdmin = decoded.rol === ADMIN_ROLE;
        // Solo admin puede cambiar la de otra persona; el modal de perfil siempre cambia la propia.
        const changingOther = requestedDoc !== ownDoc;
        const targetDoc = changingOther && isAdmin ? requestedDoc : ownDoc;

        if (changingOther && !isAdmin) {
            return res.status(403).json({
                error: 'Acceso denegado',
                message: 'No puede cambiar la contraseña de otro usuario'
            });
        }

        const { rows } = await query(
            'SELECT password FROM usuarios WHERE documento = $1 LIMIT 1',
            [targetDoc]
        );
        const userData = rows[0];

        if (!userData) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Al cambiar la propia contraseña, exigir la actual.
        // Usamos 400 (no 401) para no forzar logout en el cliente.
        if (!changingOther) {
            if (!currentPassword) {
                return res.status(400).json({
                    error: 'current-password-required',
                    message: 'Debe ingresar su contraseña actual'
                });
            }
            if (!validatePassword(String(currentPassword).trim(), String(userData.password || ''))) {
                return res.status(400).json({
                    error: 'invalid-current-password',
                    message: 'La contraseña actual es incorrecta'
                });
            }
        }

        const newHash = hashPassword(newPassword);
        const { rowCount } = await query(
            'UPDATE usuarios SET password = $1, "updatedAt" = NOW() WHERE documento = $2',
            [newHash, targetDoc]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        await insertLogFromToken(
            decoded,
            changingOther
                ? `Cambio de contraseña (admin) para documento: ${targetDoc}`
                : 'Cambio de contraseña exitoso'
        );

        return res.status(200).json({ message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('Password change error:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
