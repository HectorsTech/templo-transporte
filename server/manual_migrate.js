import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Fix path to point to server/.env relative to CWD
dotenv.config({ path: 'server/.env' });

async function migrate() {
    console.log('Connecting to database...');
    console.log('Host:', process.env.DB_HOST);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });

        console.log(`Connected to ${process.env.DB_NAME}. Running migrations...`);

        // Capacidad
        try {
            await connection.query("ALTER TABLE rutas ADD COLUMN capacidad INT DEFAULT 14");
            console.log('✅ Added column: capacidad');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ Column capability already exists');
            else console.log('❌ Error adding capacidad:', e.message);
        }

        // Hora Salida
        try {
            await connection.query("ALTER TABLE rutas ADD COLUMN hora_salida TIME");
            console.log('✅ Added column: hora_salida');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ Column hora_salida already exists');
            else console.log('❌ Error adding hora_salida:', e.message);
        }

        // Hora Llegada
        try {
            await connection.query("ALTER TABLE rutas ADD COLUMN hora_llegada TIME");
            console.log('✅ Added column: hora_llegada');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ Column hora_llegada already exists');
            else console.log('❌ Error adding hora_llegada:', e.message);
        }

        await connection.end();
        console.log('Migration finished.');
        process.exit(0);

    } catch (err) {
        console.error('Fatal Migration Error:', err);
        process.exit(1);
    }
}

migrate();
