import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

if (isProduction && !process.env.JWT_SECRET) {
    // Never allow the app to sign/verify tokens with a guessable secret in production.
    throw new Error('JWT_SECRET no está configurado. Defina esta variable de entorno antes de desplegar.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_insecure_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
// Mantenido igual al valor histórico para no invalidar los hashes ya almacenados.
// Puede sobreescribirse con PASSWORD_SALT en despliegues nuevos.
const SALT = process.env.PASSWORD_SALT || "CCG_SECRET_SALT_2026";

export const ADMIN_ROLE = 'ADMINISTRADOR GENERAL';
export const DIRECTOR_ROLE = 'DIRECTOR';
export const ASISTENTE_ROLE = 'ASISTENTE';

/** Roles con acceso de lectura institucional (listas completas, reportes). */
export const SUPERVISOR_ROLES = [ADMIN_ROLE, DIRECTOR_ROLE, ASISTENTE_ROLE];

export function isSupervisorRole(rol) {
    return SUPERVISOR_ROLES.includes(rol);
}

/**
 * Create a JWT token for an authenticated user
 */
export function createToken(user) {
    return jwt.sign(
        {
            uid: user._id || user.documento,
            nombre: user.nombre,
            rol: user.rol,
            documento: user.documento
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Verify JWT token from request headers
 * Returns the decoded payload or null
 */
export function verifyToken(req) {
    try {
        const authHeader = req.headers.authorization || req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        const token = authHeader.split(' ')[1];
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Requires a valid JWT. Sends 401 and returns null if missing/invalid.
 * Usage: const decoded = requireAuth(req, res); if (!decoded) return;
 */
export function requireAuth(req, res) {
    const decoded = verifyToken(req);
    if (!decoded) {
        res.status(401).json({ error: 'No autorizado', message: 'Debe iniciar sesión para acceder a este recurso' });
        return null;
    }
    return decoded;
}

/**
 * Requires the decoded token to carry one of the allowed roles.
 * Sends 403 and returns false if the role doesn't match.
 */
export function requireRole(decoded, res, allowedRoles) {
    if (!allowedRoles.includes(decoded.rol)) {
        res.status(403).json({ error: 'Acceso denegado', message: 'Su rol no tiene permisos para esta acción' });
        return false;
    }
    return true;
}

/**
 * Validate password against stored hash
 * Supports: Salted Hash, Simple Hash, and Plain Text (legacy)
 */
export function validatePassword(inputPassword, storedPassword) {
    const saltedHash = CryptoJS.SHA256(inputPassword + SALT).toString(CryptoJS.enc.Base64);
    const simpleHash = CryptoJS.SHA256(inputPassword).toString(CryptoJS.enc.Base64);

    return (
        storedPassword === saltedHash ||
        storedPassword === simpleHash ||
        storedPassword === inputPassword
    );
}

/**
 * Hash a new password with salt
 */
export function hashPassword(password) {
    return CryptoJS.SHA256(password + SALT).toString(CryptoJS.enc.Base64);
}

/**
 * CORS preflight handler
 */
export function handleCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}
