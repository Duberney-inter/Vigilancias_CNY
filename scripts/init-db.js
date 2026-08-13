/**
 * Script para inicializar las tablas en Neon (PostgreSQL)
 * Uso: DATABASE_URL=... node scripts/init-db.js
 */

import { Pool } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ Por favor define la variable DATABASE_URL');
    process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function initDB() {
    console.log('🔌 Conectando a Neon (PostgreSQL)...');
    
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                documento VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255),
                rol VARCHAR(50),
                grupo VARCHAR(100),
                "grupoArea" VARCHAR(100),
                area VARCHAR(100),
                email VARCHAR(255),
                "fotoURL" TEXT,
                activo BOOLEAN DEFAULT TRUE,
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW()
            );

            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

            CREATE TABLE IF NOT EXISTS zonas (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                alias VARCHAR(100) UNIQUE NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                latitud NUMERIC,
                longitud NUMERIC,
                horario VARCHAR(100),
                tipo VARCHAR(50),
                actividad TEXT,
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS registros (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                "zonaId" VARCHAR(255),
                "zonaAlias" VARCHAR(100),
                "usuarioId" VARCHAR(255),
                "usuarioNombre" VARCHAR(255),
                timestamp TIMESTAMP DEFAULT NOW(),
                latitud NUMERIC,
                longitud NUMERIC,
                distancia INTEGER,
                "syncedAt" TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS novedades (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                detalle TEXT NOT NULL,
                "mediaUrl" TEXT,
                "usuarioId" VARCHAR(255),
                "usuarioNombre" VARCHAR(255),
                area VARCHAR(100),
                tipo VARCHAR(50),
                timestamp TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS comunicados (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                mensaje TEXT NOT NULL,
                emisor VARCHAR(255),
                destinatario VARCHAR(100),
                timestamp TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS comunicado_lecturas (
                comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
                usuario_documento VARCHAR(255) NOT NULL,
                leido_en TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (comunicado_id, usuario_documento)
            );

            CREATE TABLE IF NOT EXISTS logs (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                usuario VARCHAR(255),
                documento VARCHAR(255),
                accion TEXT,
                timestamp TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tablas creadas correctamente en Neon.');
    } catch (err) {
        console.error('❌ Error creando las tablas:', err);
    } finally {
        await pool.end();
    }
}

initDB();
