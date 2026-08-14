import dotenv from 'dotenv';
dotenv.config();

// Forzamos el uso de Neon en este script temporal ignorando la variable local USE_LOCAL_DB
process.env.USE_LOCAL_DB = 'false';

async function testLogin(user, password) {
    try {
        console.log(`🔑 Probando login para el usuario "${user}" contra Neon...`);
        const { query } = await import('../api/_lib/db.js');
        const { validatePassword, createToken } = await import('../api/_lib/auth.js');

        const cleanUser = user.trim();
        const cleanPass = password.trim();

        const { rows } = await query(
            'SELECT * FROM usuarios WHERE documento = $1 OR email = $1 LIMIT 1',
            [cleanUser]
        );

        const userData = rows[0];

        if (!userData) {
            console.log('❌ Error: Usuario no registrado');
            return;
        }

        console.log('👤 Usuario encontrado:', userData.nombre);
        console.log('🔒 Contraseña almacenada:', userData.password);

        const isValid = validatePassword(cleanPass, userData.password);
        if (!isValid) {
            console.log('❌ Error: Contraseña incorrecta');
            return;
        }

        console.log('✅ Contraseña validada con éxito!');
        const token = createToken(userData);
        console.log('🎟️ Token generado:', token ? 'OK' : 'FAIL');
        
    } catch (error) {
        console.error('💥 Error crítico durante el login:', error);
    }
}

async function run() {
    await testLogin('101', '101');
    process.exit(0);
}

run();
