/**
 * Política de retención: conservar historial al menos 1 año.
 * Usada por la purga de mantenimiento; no borra datos más recientes.
 */
export const RETENTION_YEARS = 1;

export function retentionCutoffDate(now = new Date()) {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - RETENTION_YEARS);
    return d;
}

export function retentionCutoffIso(now = new Date()) {
    return retentionCutoffDate(now).toISOString();
}
