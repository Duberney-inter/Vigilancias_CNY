import { query } from '../lib/db.js';
import { handleCors, hashPassword, requireAuth, requireRole, ADMIN_ROLE, isSupervisorRole } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { getUsuarioFieldError } from '../lib/userValidation.js';

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeDocumento(documento) {
    return String(documento || '').trim();
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

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
