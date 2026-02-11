import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
import pool from './config/database.js';

async function migrate() {
    console.log('Starting migration...');

    const queries = [
        "ALTER TABLE rutas ADD COLUMN capacidad INT DEFAULT 14",
        "ALTER TABLE rutas ADD COLUMN hora_salida VARCHAR(8) DEFAULT '00:00'",
        "ALTER TABLE rutas ADD COLUMN hora_llegada VARCHAR(8) DEFAULT '00:00'"
    ];

    for (const q of queries) {
        try {
            await pool.query(q);
            console.log(`Success: ${q}`);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log(`Skipped (exists): ${q}`);
            } else {
                console.log(`Error running "${q}": ${e.message}`);
            }
        }
    }

    console.log('Migration complete.');
    process.exit(0);
}

migrate();
