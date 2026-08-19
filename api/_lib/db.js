import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { rm } from 'fs/promises';
import { mockZonas } from '../../src/utils/mockData.js';

const isLocalDb = process.env.USE_LOCAL_DB === 'true';
const LOCAL_PGDATA = './local_pgdata';

let localDb = null;
// Driver HTTP de Neon (sobre fetch), no el Pool por WebSocket: el runtime de
// Vercel no trae el WebSocket global que ese Pool necesita, y fallaba con un
// ErrorEvent sin mensaje útil. El HTTP driver no depende de eso.
let sql = null;

async function loadSeedUsuarios() {
    try {
        // Datos reales del colegio, si el desarrollador los tiene localmente (gitignored).
        const mod = await import('../../src/utils/seedUsuarios.local.js');
        return mod.mockUsuarios;
    } catch {
        // Fallback versionado con datos de ejemplo (sin PII real).
        const mod = await import('../../src/utils/seedUsuarios.example.js');
        return mod.mockUsuarios;
    }
}

// Mismo esquema que bootstrapLocalSchema() (PGlite), para que un Neon nuevo
// también quede completo desde el primer arranque, sin depender de que cada
// endpoint cree su propia tabla por separado.
const CREATE_TABLE_QUERIES = [
    `CREATE TABLE IF NOT EXISTS usuarios (
        documento TEXT PRIMARY KEY,
        nombre TEXT,
        rol TEXT,
        grupo TEXT,
        "grupoArea" TEXT,
        area TEXT,
        email TEXT,
        password TEXT,
        "fotoURL" TEXT,
        activo BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS zonas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alias TEXT UNIQUE,
        nombre TEXT,
        latitud DOUBLE PRECISION,
        longitud DOUBLE PRECISION,
        horario TEXT,
        tipo TEXT,
        actividad TEXT,
        activo BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS registros (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "zonaId" TEXT,
        "zonaAlias" TEXT,
        "usuarioId" TEXT,
        "usuarioNombre" TEXT,
        timestamp TEXT,
        latitud DOUBLE PRECISION,
        longitud DOUBLE PRECISION,
        distancia DOUBLE PRECISION,
        "syncedAt" TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS novedades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        detalle TEXT,
        "mediaUrl" TEXT,
        "usuarioId" TEXT,
        "usuarioNombre" TEXT,
        area TEXT,
        tipo TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS comunicados (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mensaje TEXT,
        emisor TEXT,
        destinatario TEXT,
        emisor_documento TEXT,
        emisor_rol TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS comunicado_lecturas (
        comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
        usuario_documento TEXT NOT NULL,
        leido_en TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (comunicado_id, usuario_documento)
    );`,
    `CREATE TABLE IF NOT EXISTS logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario TEXT,
        documento TEXT,
        accion TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS horarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuarioId" TEXT,
        "zonaId" TEXT,
        "diaCiclo" INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE ("usuarioId", "diaCiclo")
    );`
];

const ALTER_QUERIES = [
    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS latitud_actual DOUBLE PRECISION;',
    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS longitud_actual DOUBLE PRECISION;',
    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS actualizado_gps TIMESTAMP;',
    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;',
    'ALTER TABLE zonas ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;',
    'ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_documento TEXT;',
    'ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_rol TEXT;',
    'UPDATE zonas SET activo = TRUE WHERE activo IS NULL;'
];

async function closeLocalDb() {
    if (!localDb) return;
    try {
        if (typeof localDb.close === 'function') {
            await localDb.close();
        }
    } catch {
        // ignore close errors on corrupted instances
    }
    localDb = null;
}

async function wipeLocalPgdata() {
    await closeLocalDb();
    await rm(LOCAL_PGDATA, { recursive: true, force: true });
}

async function bootstrapLocalSchema(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            documento TEXT PRIMARY KEY,
            nombre TEXT,
            rol TEXT,
            grupo TEXT,
            "grupoArea" TEXT,
            area TEXT,
            email TEXT,
            password TEXT,
            "fotoURL" TEXT,
            activo BOOLEAN DEFAULT TRUE,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS zonas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            alias TEXT UNIQUE,
            nombre TEXT,
            latitud DOUBLE PRECISION,
            longitud DOUBLE PRECISION,
            horario TEXT,
            tipo TEXT,
            actividad TEXT,
            activo BOOLEAN DEFAULT TRUE,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);
    await db.query(`ALTER TABLE zonas ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE`);
    await db.query(`UPDATE zonas SET activo = TRUE WHERE activo IS NULL`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS registros (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "zonaId" TEXT,
            "zonaAlias" TEXT,
            "usuarioId" TEXT,
            "usuarioNombre" TEXT,
            timestamp TEXT,
            latitud DOUBLE PRECISION,
            longitud DOUBLE PRECISION,
            distancia DOUBLE PRECISION,
            "syncedAt" TIMESTAMP DEFAULT NOW()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS novedades (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            detalle TEXT,
            "mediaUrl" TEXT,
            "usuarioId" TEXT,
            "usuarioNombre" TEXT,
            area TEXT,
            tipo TEXT,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS comunicados (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            mensaje TEXT,
            emisor TEXT,
            destinatario TEXT,
            emisor_documento TEXT,
            emisor_rol TEXT,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    `);
    await db.query(`ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_documento TEXT`);
    await db.query(`ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_rol TEXT`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS comunicado_lecturas (
            comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
            usuario_documento TEXT NOT NULL,
            leido_en TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (comunicado_id, usuario_documento)
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            usuario TEXT,
            documento TEXT,
            accion TEXT,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    `);

    console.log('[DB] Asegurando usuarios y zonas de prueba en PGlite...');
    const mockUsuarios = await loadSeedUsuarios();
    for (const u of mockUsuarios) {
        await db.query(`
            INSERT INTO usuarios (documento, nombre, rol, "grupoArea", area, email, password, "fotoURL", activo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            ON CONFLICT (documento) DO NOTHING
        `, [u.documento, u.nombre, u.rol, u.grupoArea, u.area, u.email, u.password, u.fotoURL]);
    }

    for (const z of mockZonas) {
        await db.query(`
            INSERT INTO zonas (alias, nombre, latitud, longitud, horario, tipo, actividad)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (alias) DO NOTHING
        `, [z.alias, z.nombre, z.latitud, z.longitud, z.horario, z.tipo, z.actividad]);
    }

    for (const q of ALTER_QUERIES) {
        await db.query(q);
    }

    // PGlite a veces ignora ADD COLUMN IF NOT EXISTS; forzar si falta.
    try {
        const { rows } = await db.query(`
            SELECT 1 AS ok
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'zonas'
              AND column_name = 'activo'
            LIMIT 1
        `);
        if (!rows.length) {
            await db.query('ALTER TABLE zonas ADD COLUMN activo BOOLEAN DEFAULT TRUE');
            await db.query('UPDATE zonas SET activo = TRUE WHERE activo IS NULL');
            console.log('[DB] Columna zonas.activo creada en bootstrap local.');
        }
    } catch (error) {
        console.warn('[DB] No se pudo verificar/crear zonas.activo:', error.message);
    }
}

async function openLocalDb() {
    const db = new PGlite(LOCAL_PGDATA);
    // Force a real open/query so corruption surfaces here, not later.
    await db.query('SELECT 1');
    return db;
}

async function initLocalDatabase() {
    console.log('[DB] Inicializando Base de Datos Local PGlite...');
    try {
        localDb = await openLocalDb();
        await bootstrapLocalSchema(localDb);
        console.log('[DB] Base de Datos Local PGlite lista y configurada!');
        return;
    } catch (firstError) {
        console.warn('[DB] PGlite no pudo abrir local_pgdata. Se regenerará automáticamente.');
        console.warn(`[DB] Motivo: ${firstError?.message || firstError}`);
    }

    try {
        await wipeLocalPgdata();
        localDb = await openLocalDb();
        await bootstrapLocalSchema(localDb);
        console.log('[DB] Base de Datos Local PGlite regenerada y lista!');
    } catch (secondError) {
        console.error('[DB] Error regenerando PGlite:', secondError);
        throw secondError;
    }
}

// Promesa de inicialización que `query()` espera antes de ejecutar cualquier consulta,
// evitando la antigua condición de carrera basada en un setTimeout adivinado.
let dbReady;

if (isLocalDb) {
    dbReady = initLocalDatabase();
} else {
    console.log('[DB] Usando Base de Datos en la Nube (Neon)...');
    sql = neon(process.env.DATABASE_URL, { fullResults: true });

    dbReady = (async () => {
        try {
            for (const q of CREATE_TABLE_QUERIES) {
                await sql(q);
            }
            for (const q of ALTER_QUERIES) {
                await sql(q);
            }
            console.log('[DB] Esquema y columnas de geolocalización en vivo validados en Neon.');
        } catch (err) {
            console.error('[DB] Error al validar el esquema en Neon:', err);
            throw err;
        }
    })();
}

// Evita "unhandled promise rejection" si dbReady falla antes de la primera query();
// el error real se sigue propagando a quien llame a query().
dbReady.catch(() => {});

export const query = async (text, params) => {
    await dbReady;
    if (isLocalDb) {
        return await localDb.query(text, params);
    }
    return await sql(text, params);
};
