'use strict';
require('dotenv').config();

if (process.env.APP_ENV === 'test') {
    module.exports = require('./lib/mariadbDatabase').createMariaDBPool(process.env);
} else {
    const { Pool, types } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    const parsedConnection = connectionString ? new URL(connectionString) : null;
    if (parsedConnection) for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsedConnection.searchParams.delete(key);
    types.setTypeParser(1082, value => value);
    const localDatabase = parsedConnection && ['localhost', '127.0.0.1', '[::1]'].includes(parsedConnection.hostname);
    const pool = new Pool({
        connectionString: parsedConnection?.href,
        ssl: process.env.DATABASE_SSL === 'false' || localDatabase ? false : {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA && { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n') })
        }
    });
    const query = async (text, params) => {
        try { return await pool.query(text, params); }
        catch (err) { console.error('[DB] Erro na query:', err); throw err; }
    };
    module.exports = { pool, query, kind: 'postgres', isMariaDB: false, isTestMode: false };
}
