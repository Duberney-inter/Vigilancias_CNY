import { query } from '../lib/db.js';
import { handleCors, hashPassword, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { getUsuarioFieldError } from '../lib/userValidation.js';

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

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

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
