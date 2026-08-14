import { query } from './db.js';

/**
 * Inserta un registro de auditoría.
 * No lanza error al llamador: la auditoría no debe romper la operación principal.
 */
export async function insertLog({ usuario, documento, accion }) {
    try {
        if (!accion) return;
        await query(
            `INSERT INTO logs (usuario, documento, accion, timestamp)
             VALUES ($1, $2, $3, NOW())`,
            [
                usuario || 'Sistema',
                documento != null ? String(documento) : '',
                String(accion)
            ]
        );
    } catch (error) {
        console.error('[audit] Error al registrar log:', error);
    }
}

/**
 * Log desde un JWT decodificado (requireAuth).
 */
export async function insertLogFromToken(decoded, accion) {
    if (!decoded) {
        return insertLog({ usuario: 'Sistema', documento: '', accion });
    }
    return insertLog({
        usuario: decoded.nombre || 'Usuario',
        documento: decoded.documento || decoded.uid || '',
        accion
    });
}
