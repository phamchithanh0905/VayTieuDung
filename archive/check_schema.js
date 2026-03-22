
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'systemsettings'
        `);
        console.log('Columns in systemsettings:');
        console.log(JSON.stringify(res.rows, null, 2));
        
        const res2 = await pool.query(`SELECT * FROM information_schema.tables WHERE table_name = 'systemsettings'`);
        console.log('Table exists:', res2.rows.length > 0);
        
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSchema();
