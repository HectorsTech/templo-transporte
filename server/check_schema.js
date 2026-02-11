import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
import mysql from 'mysql2/promise';

async function checkSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });

        console.log('=== ESQUEMA DE TABLA RESERVAS ===\n');

        const [columns] = await connection.query("DESCRIBE reservas");
        console.table(columns);

        console.log('\n=== ÚLTIMA RESERVA CREADA ===\n');
        const [lastReserva] = await connection.query(`
            SELECT id, codigo_visual, cliente_nombre, viaje_id, created_at
            FROM reservas 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        if (lastReserva.length > 0) {
            console.log(lastReserva[0]);
        } else {
            console.log('No hay reservas en la base de datos');
        }

        await connection.end();
        process.exit(0);

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkSchema();
