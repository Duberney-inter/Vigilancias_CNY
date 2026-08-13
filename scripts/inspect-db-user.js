import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ Error: Por favor define la variable de entorno DATABASE_URL en el archivo .env');
    process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function inspectUser() {
    try {
        console.log('🔌 Conectando a Neon para inspeccionar usuario...');
        const res = await pool.query("SELECT * FROM usuarios WHERE documento = '101'");
        if (res.rows.length === 0) {
            console.log('❌ No se encontró ningún usuario con documento "101"');
        } else {
            console.log('✅ Usuario encontrado en Neon:');
            console.log(JSON.stringify(res.rows[0], null, 2));
        }
    } catch (error) {
        console.error('❌ Error al consultar la BD:', error);
    } finally {
        await pool.end();
    }
}

inspectUser();
