import { query } from '../lib/db.js';
import { createToken, validatePassword, handleCors } from '../lib/auth.js';
import { insertLog } from '../lib/audit.js';

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

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
