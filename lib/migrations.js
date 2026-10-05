const fs = require('node:fs/promises');
const path = require('node:path');
async function migrate(db) {
    const client = await db.pool.connect();
    try {
        await client.query("SELECT pg_advisory_lock(hashtext('gestao-financeira-migrations'))");
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())');
        const directory = path.join(__dirname, '..', 'migrations');
        for (const name of (await fs.readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
            if ((await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount) continue;
            await client.query('BEGIN');
            try {
                await client.query(await fs.readFile(path.join(directory, name), 'utf8'));
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
                await client.query('COMMIT');
            } catch (err) { await client.query('ROLLBACK'); throw err; }
        }
    } finally {
        try { await client.query("SELECT pg_advisory_unlock(hashtext('gestao-financeira-migrations'))"); }
        finally { client.release(); }
    }
}
module.exports = { migrate };
