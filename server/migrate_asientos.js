import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
import mysql from 'mysql2/promise';

async function migrate() {
    console.log('Migrando columna asientos_disponibles...');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });

        console.log(`Conectado a ${process.env.DB_NAME}`);

        // Agregar asientos_disponibles si no existe
        try {
            await connection.query("ALTER TABLE viajes ADD COLUMN asientos_disponibles INT DEFAULT 14");
            console.log('✅ Columna asientos_disponibles agregada');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ Columna asientos_disponibles ya existe');
            } else {
                console.log('❌ Error:', e.message);
            }
        }

        // Inicializar asientos_disponibles donde sea NULL
        try {
            const [result] = await connection.query(`
                UPDATE viajes 
                SET asientos_disponibles = asientos_totales 
                WHERE asientos_disponibles IS NULL
            `);
            console.log(`✅ Inicializados asientos_disponibles en ${result.affectedRows} viajes`);
        } catch (e) {
            console.log('❌ Error inicializando:', e.message);
        }

        await connection.end();
        console.log('✅ Migración completada');
        process.exit(0);

    } catch (err) {
        console.error('Fatal Migration Error:', err);
        process.exit(1);
    }
}

migrate();
