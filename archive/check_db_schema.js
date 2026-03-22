require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'systemsettings'
        `);
        console.log('Columns in systemsettings:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
