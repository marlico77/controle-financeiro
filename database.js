const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
require('dotenv').config();
const requestContext = new AsyncLocalStorage();

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
    const waitingStarted = performance.now();
    let acquiredAt;
    let client;
    try {
        client = await pool.connect();
        acquiredAt = performance.now();
        return await client.query(text, params);
    } catch (err) {
        console.error('[DB] Erro na query:', err);
        throw err;
    } finally {
        const finishedAt = performance.now();
        if (client) client.release();
        const poolWaitMs = Math.round((acquiredAt ?? finishedAt) - waitingStarted);
        const queryMs = acquiredAt == null ? 0 : Math.round(finishedAt - acquiredAt);
        const context = requestContext.getStore();
        if (context) {
            context.poolWaitMs += poolWaitMs;
            context.queryMs += queryMs;
        }
        if (poolWaitMs >= 250 || queryMs >= 500) console.warn('[DB] Slow database operation', {
            poolWaitMs, queryMs, poolTotal: pool.totalCount, poolIdle: pool.idleCount,
            poolWaiting: pool.waitingCount, operation: /^\s*([a-z]+)/i.exec(text)?.[1]?.toUpperCase(),
            route: requestContext.getStore()?.route || 'background'
        });
    }
};

module.exports = {
    pool,
    query,
    withRequestContext: (route, callback) => requestContext.run({ route, poolWaitMs: 0, queryMs: 0 }, callback),
    getRequestContext: () => requestContext.getStore()
};
