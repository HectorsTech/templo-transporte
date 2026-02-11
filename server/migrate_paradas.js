import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
import mysql from 'mysql2/promise';

async function migrate() {
    console.log('Migrando tabla reservas para soporte de paradas...');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });

        console.log(`Conectado a ${process.env.DB_NAME}`);

        // Agregar columna parada_abordaje
        try {
            await connection.query("ALTER TABLE reservas ADD COLUMN parada_abordaje VARCHAR(100)");
            console.log('✅ Columna parada_abordaje agregada');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ Columna parada_abordaje ya existe');
            } else {
                console.log('❌ Error agregando parada_abordaje:', e.message);
            }
        }

        // Agregar columna hora_abordaje
        try {
            await connection.query("ALTER TABLE reservas ADD COLUMN hora_abordaje TIME");
            console.log('✅ Columna hora_abordaje agregada');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ Columna hora_abordaje ya existe');
            } else {
                console.log('❌ Error agregando hora_abordaje:', e.message);
            }
        }

        // Inicializar datos existentes (asumiendo origen de la ruta)
        console.log('Actualizando datos históricos...');
        await connection.query(`
            UPDATE reservas r
            JOIN viajes v ON r.viaje_id = v.id
            JOIN rutas rt ON v.ruta_id = rt.id
            SET r.parada_abordaje = rt.origen,
                r.hora_abordaje = v.hora_salida
            WHERE r.parada_abordaje IS NULL
        `);
        console.log('✅ Datos históricos actualizados');

        await connection.end();
        console.log('✅ Migración completada');
        process.exit(0);

    } catch (err) {
        console.error('Fatal Migration Error:', err);
        process.exit(1);
    }
}

migrate();
