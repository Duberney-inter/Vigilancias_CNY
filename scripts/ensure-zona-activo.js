import dotenv from 'dotenv';
dotenv.config();

// Forzar PGlite local (igual que api:local) antes de cargar db.js
if (!process.env.USE_LOCAL_DB) {
    process.env.USE_LOCAL_DB = 'true';
}

const { query } = await import('../api/_lib/db.js');
const { ensureZonaActivoColumn } = await import('../api/_lib/ensureZonaActivo.js');

await ensureZonaActivoColumn(query);

const cols = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'zonas'
    ORDER BY ordinal_position
`);
console.log('columns:', cols.rows.map((r) => r.column_name));

const sample = await query('SELECT alias, activo FROM zonas LIMIT 5');
console.log('sample:', sample.rows);
