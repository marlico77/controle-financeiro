const { Pool, types } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const parsedConnection = connectionString ? new URL(connectionString) : null;
// pg otherwise lets sslmode/ssl parameters in the URL override the TLS object.
if (parsedConnection) for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsedConnection.searchParams.delete(key);

// Civil dates must stay YYYY-MM-DD; timestamps retain their timezone semantics.
types.setTypeParser(1082, value => value);
const localDatabase = parsedConnection && ['localhost', '127.0.0.1', '[::1]'].includes(parsedConnection.hostname);
const pool = new Pool({
    connectionString: parsedConnection?.href,
    ssl: process.env.DATABASE_SSL === 'false' || localDatabase ? false : {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_CA && { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n') })
    }
});

// Helper para executar consultas SQL de forma simplificada e centralizada
const query = async (text, params) => {
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.error('[DB] Erro na query:', err);
        throw err;
    }
};

module.exports = {
    pool,
    query
};
