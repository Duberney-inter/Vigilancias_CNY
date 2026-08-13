import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';

const BACKUP_TABLES = [
    'usuarios',
    'zonas',
    'registros',
    'novedades',
    'comunicados',
    'comunicado_lecturas',
    'logs',
    'horarios'
];

async function ensureHorariosTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS horarios (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "usuarioId" TEXT,
            "zonaId" TEXT,
            "diaCiclo" INTEGER,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            UNIQUE ("usuarioId", "diaCiclo")
        );
    `);
}

async function dumpTable(name) {
    try {
        const { rows } = await query(`SELECT * FROM ${name}`);
        return rows;
    } catch (error) {
        console.warn(`[backup] No se pudo leer ${name}:`, error.message);
        return [];
    }
}

async function clearTable(name) {
    try {
        await query(`DELETE FROM ${name}`);
    } catch (error) {
        console.warn(`[backup] No se pudo vaciar ${name}:`, error.message);
    }
}

function quoteIdent(col) {
    return `"${String(col).replace(/"/g, '""')}"`;
}

async function insertRows(table, rows, { upsertKey } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    let inserted = 0;

    for (const row of rows) {
        const cols = Object.keys(row).filter((k) => row[k] !== undefined);
        if (cols.length === 0) continue;

        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const colSql = cols.map(quoteIdent).join(', ');
        const values = cols.map((c) => row[c]);

        let sql = `INSERT INTO ${table} (${colSql}) VALUES (${placeholders})`;
        if (upsertKey && cols.includes(upsertKey)) {
            const updates = cols
                .filter((c) => c !== upsertKey)
                .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                .join(', ');
            if (updates) {
                sql += ` ON CONFLICT (${quoteIdent(upsertKey)}) DO UPDATE SET ${updates}`;
            } else {
                sql += ` ON CONFLICT (${quoteIdent(upsertKey)}) DO NOTHING`;
            }
        } else {
            sql += ' ON CONFLICT DO NOTHING';
        }

        try {
            await query(sql, values);
            inserted += 1;
        } catch (error) {
            console.warn(`[backup] Fila omitida en ${table}:`, error.message);
        }
    }

    return inserted;
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;
    if (!requireRole(decoded, res, [ADMIN_ROLE])) return;

    await ensureHorariosTable();

    if (req.method === 'GET') {
        try {
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                tables: {}
            };

            for (const table of BACKUP_TABLES) {
                payload.tables[table] = await dumpTable(table);
            }

            // Compatibilidad con backups antiguos (raíz plana)
            payload.usuarios = payload.tables.usuarios;
            payload.zonas = payload.tables.zonas;
            payload.registros = payload.tables.registros;

            await insertLogFromToken(decoded, 'Backup completo generado');
            return res.status(200).json(payload);
        } catch (error) {
            console.error('Error creating backup:', error);
            return res.status(500).json({ error: 'Error al generar backup', message: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const mode = body.mode === 'merge' ? 'merge' : 'replace';
            const source = body.data || body;
            const tables = source.tables && typeof source.tables === 'object'
                ? source.tables
                : {
                    usuarios: source.usuarios || [],
                    zonas: source.zonas || [],
                    registros: source.registros || [],
                    novedades: source.novedades || [],
                    comunicados: source.comunicados || [],
                    comunicado_lecturas: source.comunicado_lecturas || [],
                    logs: source.logs || [],
                    horarios: source.horarios || []
                };

            if (mode === 'replace') {
                // Orden por FKs: lecturas antes que comunicados
                for (const table of [
                    'comunicado_lecturas',
                    'comunicados',
                    'horarios',
                    'registros',
                    'novedades',
                    'logs',
                    'zonas',
                    'usuarios'
                ]) {
                    await clearTable(table);
                }
            }

            const counts = {};
            counts.usuarios = await insertRows('usuarios', tables.usuarios, { upsertKey: 'documento' });
            counts.zonas = await insertRows('zonas', tables.zonas, { upsertKey: 'alias' });
            counts.horarios = await insertRows('horarios', tables.horarios);
            counts.registros = await insertRows('registros', tables.registros);
            counts.novedades = await insertRows('novedades', tables.novedades);
            counts.comunicados = await insertRows('comunicados', tables.comunicados);
            counts.comunicado_lecturas = await insertRows('comunicado_lecturas', tables.comunicado_lecturas);
            counts.logs = await insertRows('logs', tables.logs);

            await insertLogFromToken(decoded, `Backup restaurado (modo ${mode})`);

            return res.status(200).json({
                message: `Restauración ${mode === 'replace' ? 'por reemplazo' : 'por fusión'} completada`,
                mode,
                counts
            });
        } catch (error) {
            console.error('Error restoring backup:', error);
            return res.status(500).json({ error: 'Error al restaurar backup', message: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
