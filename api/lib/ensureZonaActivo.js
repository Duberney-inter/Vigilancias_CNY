/**
 * Asegura la columna zonas.activo en PGlite/Neon.
 * Siempre intenta ADD COLUMN; si ya existe, ignora el error.
 */
export async function ensureZonaActivoColumn(queryFn) {
    try {
        await queryFn('ALTER TABLE zonas ADD COLUMN activo BOOLEAN DEFAULT TRUE');
    } catch (error) {
        const msg = String(error?.message || '').toLowerCase();
        const ok = error?.code === '42701'
            || msg.includes('already exists')
            || msg.includes('duplicate column');
        if (!ok) {
            // Si IF NOT EXISTS no aplica, reintentar vía detección
            try {
                await queryFn('SELECT activo FROM zonas LIMIT 1');
            } catch {
                throw error;
            }
        }
    }

    try {
        await queryFn('UPDATE zonas SET activo = TRUE WHERE activo IS NULL');
    } catch {
        // ignore if column still unavailable; caller will surface real error
    }
}
