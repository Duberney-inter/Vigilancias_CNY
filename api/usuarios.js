import { query } from './_lib/db.js';
import { handleCors, hashPassword, requireAuth, requireRole, verifyToken, ADMIN_ROLE, isSupervisorRole } from './_lib/auth.js';
import { insertLogFromToken } from './_lib/audit.js';
import { getUsuarioFieldError, ALLOWED_USER_ROLES, isValidGrupo, isValidRol } from './_lib/userValidation.js';

// Consolidado de api/usuarios/{index,[id],bulk,ubicacion}.js en un solo archivo:
// el plan Hobby de Vercel limita a 12 funciones serverless por deployment.
// El enrutamiento lo hace vercel.json (?id=<documento|bulk|ubicacion>).

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeDocumento(documento) {
    return String(documento || '').trim();
}

const isActiveValue = (value) => !(
    value === false
    || value === 0
    || value === '0'
    || value === 'f'
    || value === 'false'
    || value === 'FALSE'
);

const ALLOWED_ROLES = new Set([
    'DOCENTE',
    'JEFE DE AREA',
    'DIRECTOR',
    'ASISTENTE',
    'ADMINISTRADOR GENERAL'
]);

const normalizeRole = (value) => {
    const role = String(value || 'DOCENTE').trim().toUpperCase();
    if (role === 'ADMIN') return 'ADMINISTRADOR GENERAL';
    if (role === 'JEFE AREA') return 'JEFE DE AREA';
    return role;
};

async function handleCollection(req, res) {
    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        if (!isSupervisorRole(decoded.rol)) {
            return res.status(403).json({
                error: 'Acceso denegado',
                message: 'Su rol no tiene permisos para consultar el listado de usuarios'
            });
        }
        try {
            const { rows } = await query(
                `SELECT documento, nombre, rol, grupo, "grupoArea", area, email, "fotoURL",
                        COALESCE(activo, TRUE) AS activo,
                        latitud_actual, longitud_actual, actualizado_gps,
                        "createdAt", "updatedAt"
                 FROM usuarios ORDER BY nombre ASC`
            );
            return res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching users:', error);
            return res.status(500).json({ error: 'Error al obtener usuarios' });
        }
    }

    if (req.method === 'POST') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const { nombre, documento, rol, grupo, grupoArea, area, email } = req.body;

            const cleanNombre = String(nombre || '').trim().replace(/\s+/g, ' ');
            const cleanDocumento = normalizeDocumento(documento);
            const cleanEmail = normalizeEmail(email);
            const cleanRol = String(rol || 'DOCENTE').trim() || 'DOCENTE';
            const cleanGrupo = String(grupo || grupoArea || area || '').trim();

            const fieldError = getUsuarioFieldError({
                nombre: cleanNombre,
                documento: cleanDocumento,
                email: cleanEmail,
                grupo: cleanGrupo
            });
            if (fieldError) {
                return res.status(400).json({
                    error: 'invalid-fields',
                    message: fieldError
                });
            }

            const existingByDoc = await query(
                'SELECT documento, email FROM usuarios WHERE documento = $1 LIMIT 1',
                [cleanDocumento]
            );
            const docExists = existingByDoc.rows.length > 0;

            if (docExists) {
                return res.status(409).json({
                    error: 'duplicate-documento',
                    message: `Ya existe un usuario con el documento ${cleanDocumento}`
                });
            }

            // El correo debe ser único en todo el sistema.
            const existingByEmail = await query(
                `SELECT documento, email FROM usuarios
                 WHERE LOWER(TRIM(email)) = $1
                 LIMIT 1`,
                [cleanEmail]
            );
            if (existingByEmail.rows.length > 0) {
                return res.status(409).json({
                    error: 'duplicate-email',
                    message: `El correo ${cleanEmail} ya está registrado en otro usuario`
                });
            }

            const defaultPassword = hashPassword(cleanDocumento);
            await query(
                `INSERT INTO usuarios (nombre, documento, rol, grupo, "grupoArea", area, email, password, activo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
                [cleanNombre, cleanDocumento, cleanRol, cleanGrupo, cleanGrupo, cleanGrupo, cleanEmail, defaultPassword]
            );

            await insertLogFromToken(
                decoded,
                `Usuario creado: ${cleanNombre} (${cleanDocumento})`
            );

            return res.status(201).json({
                message: 'Usuario creado correctamente',
                id: cleanDocumento
            });
        } catch (error) {
            console.error('Error creating user:', error);
            return res.status(500).json({
                error: 'server-error',
                message: 'Error al crear el usuario'
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleById(req, res, id) {
    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [ADMIN_ROLE])) return;

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

async function handleBulk(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [ADMIN_ROLE])) return;

    try {
        const { usuarios } = req.body;

        if (!usuarios || !Array.isArray(usuarios)) {
            return res.status(400).json({
                error: 'invalid-users-list',
                message: 'Se requiere una lista de usuarios válida'
            });
        }

        console.log(`[API BULK] Iniciando importación de ${usuarios.length} usuarios...`);
        let importedCount = 0;
        const errors = [];

        const { rows: existingUsers } = await query(
            `SELECT documento, LOWER(TRIM(COALESCE(email, ''))) AS email
             FROM usuarios`
        );
        const usedDocuments = new Set(existingUsers.map((u) => String(u.documento).trim()));
        const usedEmails = new Set(existingUsers.map((u) => u.email).filter(Boolean));

        for (let index = 0; index < usuarios.length; index++) {
            const user = usuarios[index];
            const fila = Number(user._fila) || index + 2;
            const nombre = String(user.nombre || '').trim().replace(/\s+/g, ' ');
            const documento = String(user.documento || '').trim();
            const rol = normalizeRole(user.rol);
            const grupo = String(user.grupo || '').trim();
            const email = String(user.email || '').trim().toLowerCase();

            const addError = (motivo) => {
                errors.push({ fila, documento, email, motivo });
            };

            const fieldError = getUsuarioFieldError({ nombre, documento, email, grupo });
            if (fieldError) {
                addError(fieldError);
                continue;
            }
            if (!ALLOWED_ROLES.has(rol)) {
                addError(`Rol no válido: ${rol}`);
                continue;
            }
            if (usedDocuments.has(documento)) {
                addError('El documento ya está registrado o está repetido en el archivo');
                continue;
            }
            if (usedEmails.has(email)) {
                addError('El correo ya está registrado o está repetido en el archivo');
                continue;
            }

            const hashedPassword = hashPassword(documento);

            try {
                await query(`
                    INSERT INTO usuarios (nombre, documento, password, rol, grupo, "grupoArea", area, email, activo)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
                `, [
                    nombre,
                    documento,
                    hashedPassword,
                    rol,
                    grupo,
                    grupo,
                    grupo,
                    email
                ]);

                usedDocuments.add(documento);
                usedEmails.add(email);
                importedCount++;
            } catch (rowError) {
                console.error(`[API BULK] Error en fila ${fila}:`, rowError);
                addError('No se pudo guardar la fila');
            }
        }

        console.log(`[API BULK] Importación finalizada. Importados: ${importedCount}; errores: ${errors.length}`);
        await insertLogFromToken(
            decoded,
            `Importación masiva de usuarios: ${importedCount} importado(s), ${errors.length} error(es)`
        );

        return res.status(200).json({
            message: 'Importación masiva procesada',
            totalCount: usuarios.length,
            importedCount,
            errorCount: errors.length,
            errors
        });

    } catch (error) {
        console.error('Error in bulk import:', error);
        return res.status(500).json({
            error: 'server-error',
            message: 'Error interno al procesar la importación masiva: ' + error.message
        });
    }
}

async function handleUbicacion(req, res) {
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

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { id } = req.query;

    if (id === 'bulk') return handleBulk(req, res);
    if (id === 'ubicacion') return handleUbicacion(req, res);
    if (id) return handleById(req, res, id);
    return handleCollection(req, res);
}
