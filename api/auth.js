import { query } from './_lib/db.js';
import { createToken, requireAuth, hashPassword, validatePassword, handleCors, ADMIN_ROLE } from './_lib/auth.js';
import { insertLog, insertLogFromToken } from './_lib/audit.js';

// Consolidado de api/auth/{login,me,password}.js en un solo archivo:
// el plan Hobby de Vercel limita a 12 funciones serverless por deployment.
// El enrutamiento por acción lo hace vercel.json (?action=login|me|password).

async function handleLogin(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { user, password } = req.body;

        if (!user || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }

        const cleanUser = user.trim();
        const cleanPass = password.trim();

        // Search by document ID or email
        const { rows } = await query(
            'SELECT * FROM usuarios WHERE documento = $1 OR email = $1 LIMIT 1',
            [cleanUser]
        );

        const userData = rows[0];

        // Mensaje genérico e igual en ambos casos para no revelar si el usuario existe.
        const invalidCredentials = async () => {
            await insertLog({
                usuario: userData?.nombre || 'Desconocido',
                documento: userData?.documento || cleanUser,
                accion: 'Intento de inicio de sesión fallido'
            });
            return res.status(401).json({
                error: 'invalid-credentials',
                message: 'Usuario o contraseña incorrectos'
            });
        };

        if (!userData) {
            return invalidCredentials();
        }

        // Validate password
        const storedPassword = String(userData.password || '');
        if (!validatePassword(cleanPass, storedPassword)) {
            return invalidCredentials();
        }

        const isActive = !(
            userData.activo === false
            || userData.activo === 0
            || userData.activo === '0'
            || userData.activo === 'f'
            || userData.activo === 'false'
            || userData.activo === 'FALSE'
        );
        if (!isActive) {
            await insertLog({
                usuario: userData.nombre,
                documento: userData.documento,
                accion: 'Intento de inicio de sesión con cuenta inactiva'
            });
            return res.status(403).json({
                error: 'account-inactive',
                message: 'Su cuenta está inactiva. Contacte al administrador.'
            });
        }

        // Create JWT token
        const token = createToken(userData);

        await insertLog({
            usuario: userData.nombre,
            documento: userData.documento,
            accion: 'Inicio de sesión exitoso'
        });

        // Return user data + token
        const authenticatedUser = {
            uid: userData.documento || userData.id,
            email: userData.email || '',
            nombre: userData.nombre,
            rol: userData.rol,
            documento: userData.documento,
            fotoURL: userData.fotoURL || '',
            grupoArea: userData.grupoArea || '',
            area: userData.area || ''
        };

        return res.status(200).json({
            token,
            user: authenticatedUser
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            error: 'server-error',
            message: 'Error interno del servidor. Intente nuevamente más tarde.'
        });
    }
}

async function handleMe(req, res) {
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

async function handlePassword(req, res) {
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

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { action } = req.query;

    if (action === 'login') return handleLogin(req, res);
    if (action === 'me') return handleMe(req, res);
    if (action === 'password') return handlePassword(req, res);

    return res.status(404).json({ error: 'Not found' });
}
