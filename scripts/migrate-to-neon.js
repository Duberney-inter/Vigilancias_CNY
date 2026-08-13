/**
 * Script para migrar los datos de los Excel de Primaria y Preescolar a Neon PostgreSQL en producción.
 * Uso: node scripts/migrate-to-neon.js
 */

import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import { Pool } from '@neondatabase/serverless';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const SALT = "CCG_SECRET_SALT_2026";

if (!DATABASE_URL) {
    console.error('❌ Error: Por favor define la variable de entorno DATABASE_URL en el archivo .env');
    process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

function hashPassword(password) {
    return CryptoJS.SHA256(password + SALT).toString(CryptoJS.enc.Base64);
}

const formatExcelTime = (val) => {
    if (typeof val !== 'number') return val;
    const totalSeconds = Math.round(val * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getTipoVigilancia = (start, end) => {
    if (!start || !end) return 'OTRO';
    const hStart = formatExcelTime(start);
    const hEnd = formatExcelTime(end);

    if (hStart >= '09:15' && hEnd <= '11:45') return 'SNACK';
    if (hStart >= '11:40' && hEnd <= '13:45') return 'LUNCH';
    return 'OTRO';
};

async function ensureTablesExist() {
    console.log('🔌 Conectando a la base de datos Neon y asegurando que las tablas existan...');
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
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );

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
    `);
    console.log('✅ Estructura de tablas verificada.');
}

async function migrateFile(filePath, sectionName) {
    console.log(`\n📄 Procesando archivo de ${sectionName}: ${filePath}...`);
    
    const buf = await readFile(filePath);
    const workbook = XLSX.read(buf);

    // 1. Process Users
    const usersSheet = workbook.Sheets['Users'];
    if (usersSheet) {
        const usersData = XLSX.utils.sheet_to_json(usersSheet);
        console.log(`👥 Encontrados ${usersData.length} usuarios en la hoja. Subiendo a Neon...`);
        
        let userUploadCount = 0;
        for (const user of usersData) {
            if (!user['ID (Doc)']) continue;

            const docId = String(user['ID (Doc)']).trim();
            const nombre = user['Nombre Completo'] || 'Desconocido';
            const email = user['Email'] || '';
            const rolOriginal = user['Rol'] || 'DOCENTE';
            
            // Normalize role
            let rolNormalizado = rolOriginal;
            if (rolOriginal.toUpperCase().includes('DIRECTOR')) {
                rolNormalizado = `DIRECTOR DE ${sectionName.toUpperCase()}`;
            }

            // Password hashing logic
            const rawPassword = user['Password'] ? String(user['Password']).trim() : docId;
            const hashedPassword = hashPassword(rawPassword);

            const fotoURL = user['Foto URL'] || '';
            const grupoArea = user['Grupo/Area'] || 'General';
            const area = user['Grupo/Area'] || 'General';
            const grupo = user['Grupo/Area'] || 'General';

            await pool.query(`
                INSERT INTO usuarios (nombre, documento, password, rol, grupo, "grupoArea", area, email, "fotoURL")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (documento) DO UPDATE 
                SET nombre = EXCLUDED.nombre,
                    rol = EXCLUDED.rol,
                    grupo = EXCLUDED.grupo,
                    "grupoArea" = EXCLUDED."grupoArea",
                    area = EXCLUDED.area,
                    email = EXCLUDED.email,
                    "fotoURL" = EXCLUDED."fotoURL",
                    "updatedAt" = NOW()
            `, [nombre, docId, hashedPassword, rolNormalizado, grupo, grupoArea, area, email, fotoURL]);
            
            userUploadCount++;
        }
        console.log(`✅ Sincronizados ${userUploadCount} usuarios para ${sectionName}.`);
    } else {
        console.log(`⚠️ Advertencia: No se encontró la hoja "Users" en ${filePath}`);
    }

    // 2. Process Zones
    const zonesSheet = workbook.Sheets['Zones'];
    if (zonesSheet) {
        const zonesData = XLSX.utils.sheet_to_json(zonesSheet);
        console.log(`📍 Encontradas ${zonesData.length} zonas en la hoja. Subiendo a Neon...`);
        
        let zoneUploadCount = 0;
        for (const zone of zonesData) {
            if (!zone['Código QR']) continue;

            const alias = String(zone['Alias'] || zone['Código QR']).trim().toUpperCase();
            const nombre = zone['Nombre Zona'] || alias;
            const latitud = parseFloat(zone['Latitud']) || 0;
            const longitud = parseFloat(zone['Longitud']) || 0;
            
            const startTime = formatExcelTime(zone['Hora_Inicio']);
            const endTime = formatExcelTime(zone['Hora_Fin']);
            const horario = startTime && endTime ? `${startTime}-${endTime}` : '06:00-18:00';
            
            const tipo = getTipoVigilancia(zone['Hora_Inicio'], zone['Hora_Fin']);
            const actividad = zone['Actividad'] || '';

            await pool.query(`
                INSERT INTO zonas (alias, nombre, latitud, longitud, horario, tipo, actividad)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (alias) DO UPDATE 
                SET nombre = EXCLUDED.nombre,
                    latitud = EXCLUDED.latitud,
                    longitud = EXCLUDED.longitud,
                    horario = EXCLUDED.horario,
                    tipo = EXCLUDED.tipo,
                    actividad = EXCLUDED.actividad,
                    "updatedAt" = NOW()
            `, [alias, nombre, latitud, longitud, horario, tipo, actividad]);

            zoneUploadCount++;
        }
        console.log(`✅ Sincronizadas ${zoneUploadCount} zonas para ${sectionName}.`);
    } else {
        console.log(`⚠️ Advertencia: No se encontró la hoja "Zones" en ${filePath}`);
    }
}

async function startMigration() {
    console.log('--- 🚀 Iniciando Migración Completa a Neon en Producción ---');
    try {
        await ensureTablesExist();

        // Migrate Preescolar
        await migrateFile('PROYECTO_PREESCOLAR_VIGILANCIAS.xlsx', 'Preescolar');

        // Migrate Primaria
        await migrateFile('PROYECTO_PRIMARIA_VIGILANCIAS.xlsx', 'Primaria');

        console.log('\n🎉 --- ¡Migración Finalizada Exitosamente en Neon! ---');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error fatal durante la migración:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

startMigration();
