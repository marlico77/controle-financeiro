const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

// Helper to handle queries more easily in server.js
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log(`[DB] Query executada em ${duration}ms`);
        return res;
    } catch (err) {
        console.error('[DB] Erro na query:', err);
        throw err;
    }
};

module.exports = {
    pool,
    query
};
