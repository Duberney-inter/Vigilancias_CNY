import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { ALLOWED_USER_ROLES, isValidGrupo, isValidRol } from '../lib/userValidation.js';

const isActiveValue = (value) => !(
    value === false
    || value === 0
    || value === '0'
    || value === 'f'
    || value === 'false'
    || value === 'FALSE'
);

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [ADMIN_ROLE])) return;

    const id = req.query.id || req.params?.id;
    if (!id) {
        return res.status(400).json({ error: 'ID requerido' });
    }

    try {
        if (req.method === 'DELETE') {
            if (String(decoded.documento || decoded.uid) === String(id)) {
                return res.status(400).json({
                    error: 'cannot-deactivate-self',
                    message: 'No puede desactivar su propia cuenta'
                });
            }

            const { rows } = await query(
                'SELECT documento, nombre, activo FROM usuarios WHERE documento = $1 LIMIT 1',
                [id]
            );
            const user = rows[0];
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            if (!isActiveValue(user.activo)) {
                return res.status(200).json({ message: 'El usuario ya estaba inactivo', id });
            }

            await query(
                `UPDATE usuarios
                 SET activo = FALSE, "updatedAt" = NOW()
                 WHERE documento = $1`,
                [id]
            );

            await insertLogFromToken(
                decoded,
                `Usuario desactivado: ${user.nombre || id} (${id})`
            );

            return res.status(200).json({
                message: 'Usuario desactivado. Su historial se conserva.',
                id,
                activo: false
            });
        }

        if (req.method === 'PUT') {
            const body = req.body || {};
            const isProfileUpdate = (
                Object.prototype.hasOwnProperty.call(body, 'rol')
                || Object.prototype.hasOwnProperty.call(body, 'grupo')
                || Object.prototype.hasOwnProperty.call(body, 'area')
                || Object.prototype.hasOwnProperty.call(body, 'grupoArea')
            );

            if (isProfileUpdate) {
                const { rows } = await query(
                    `SELECT documento, nombre, rol, grupo, "grupoArea", area
                     FROM usuarios WHERE documento = $1 LIMIT 1`,
                    [id]
                );
                const user = rows[0];
                if (!user) {
                    return res.status(404).json({ error: 'Usuario no encontrado' });
                }

                const cleanRol = String(body.rol != null ? body.rol : user.rol || 'DOCENTE').trim().toUpperCase();
                const cleanGrupo = String(
                    body.grupo != null
                        ? body.grupo
                        : (body.area != null
                            ? body.area
                            : (body.grupoArea != null ? body.grupoArea : (user.grupo || user.grupoArea || user.area || '')))
                ).trim();

                if (!isValidRol(cleanRol)) {
                    return res.status(400).json({
                        error: 'invalid-rol',
                        message: `Rol no válido. Use: ${ALLOWED_USER_ROLES.join(', ')}`
                    });
                }
                if (!isValidGrupo(cleanGrupo)) {
                    return res.status(400).json({
                        error: 'invalid-grupo',
                        message: 'El grupo/área tiene caracteres no permitidos'
                    });
                }

                if (
                    String(decoded.documento || decoded.uid) === String(id)
                    && cleanRol !== ADMIN_ROLE
                    && String(user.rol || '') === ADMIN_ROLE
                ) {
                    return res.status(400).json({
                        error: 'cannot-demote-self',
                        message: 'No puede quitarse el rol de administrador a sí mismo'
                    });
                }

                await query(
                    `UPDATE usuarios
                     SET rol = $1,
                         grupo = $2,
                         "grupoArea" = $2,
                         area = $2,
                         "updatedAt" = NOW()
                     WHERE documento = $3`,
                    [cleanRol, cleanGrupo, id]
                );

                await insertLogFromToken(
                    decoded,
                    `Usuario editado: ${user.nombre || id} (${id}) → rol: ${cleanRol}, área: ${cleanGrupo || '—'}`
                );

                return res.status(200).json({
                    message: 'Usuario actualizado correctamente',
                    id,
                    rol: cleanRol,
                    grupo: cleanGrupo,
                    area: cleanGrupo,
                    grupoArea: cleanGrupo
                });
            }

            const wantActive = body.activo !== false && body.activo !== 'false';

            if (!wantActive && String(decoded.documento || decoded.uid) === String(id)) {
                return res.status(400).json({
                    error: 'cannot-deactivate-self',
                    message: 'No puede desactivar su propia cuenta'
                });
            }

            const { rows } = await query(
                'SELECT documento, nombre FROM usuarios WHERE documento = $1 LIMIT 1',
                [id]
            );
            const user = rows[0];
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await query(
                `UPDATE usuarios
                 SET activo = $1, "updatedAt" = NOW()
                 WHERE documento = $2`,
                [wantActive, id]
            );

            await insertLogFromToken(
                decoded,
                wantActive
                    ? `Usuario reactivado: ${user.nombre || id} (${id})`
                    : `Usuario desactivado: ${user.nombre || id} (${id})`
            );

            return res.status(200).json({
                message: wantActive ? 'Usuario reactivado' : 'Usuario desactivado',
                id,
                activo: wantActive
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Error updating user status:', error);
        return res.status(500).json({ error: 'Error al actualizar el estado del usuario' });
    }
}
