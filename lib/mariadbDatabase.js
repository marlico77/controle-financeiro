'use strict';
const mysql = require('mysql2/promise');
const { compile, normalizeRows, queryInfo } = require('./mariadbCompat');

const REQUIRED_DATABASE = 'trib0156_tribo_migracao_teste';
const RETURNING_KEY_COLUMNS = Object.freeze({ reminder_runs: 'run_key', request_limits: 'key' });

function mapError(error) {
    if (error.code === 'ER_DUP_ENTRY') error.code = '23505';
    else if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_ROW_IS_REFERENCED_2') error.code = '23503';
    else if (error.code === 'ER_BAD_NULL_ERROR') error.code = '23502';
    return error;
}

class MariaClient {
    constructor(connection) { this.connection = connection; this.heldLocks = new Set(); this.inTransaction = false; }
    async query(sql, params = []) {
        const compiled = compile(sql, params);
        const { verb, table, idParam } = queryInfo(sql);
        let beforeDelete;
        const ownTransaction = Boolean(compiled.returning && !this.inTransaction);
        if (ownTransaction) { await this.connection.beginTransaction(); this.inTransaction = true; }
        if (compiled.returning && verb === 'DELETE') {
            if (idParam === null) throw new Error('MariaDB DELETE RETURNING sem chave id não é suportado.');
            const cols = compiled.returning.includes('*') ? '*' : compiled.returning.map(col => `\`${col}\``).join(',');
            const [rows] = await this.connection.execute(`SELECT ${cols} FROM \`${table}\` WHERE id=?`, [params[idParam]]);
            beforeDelete = rows;
        }
        try {
            const [result] = await this.connection.execute(compiled.sql, compiled.params);
            let rows = Array.isArray(result) ? result : [];
            if (compiled.returning) {
                if (verb === 'DELETE') rows = beforeDelete || [];
                else if (verb === 'INSERT') {
                    if (result.insertId) {
                        const cols = compiled.returning.map(col => `\`${col}\``).join(',');
                        const key = compiled.returning.includes('*') ? '*' : cols;
                        [rows] = await this.connection.execute(`SELECT ${key} FROM \`${table}\` WHERE id=?`, [result.insertId]);
                    } else if (table === 'request_limits' && compiled.returning.join(',') === 'count') {
                        [rows] = await this.connection.execute('SELECT count FROM request_limits WHERE `key`=?', [params[0]]);
                    } else if (compiled.sql.includes('ON DUPLICATE KEY UPDATE')) {
                        const keyColumn = RETURNING_KEY_COLUMNS[table];
                        if (!keyColumn) throw new Error(`MariaDB INSERT RETURNING sem chave allowlist para ${table}.`);
                        // PostgreSQL DO NOTHING returns no row on conflict; MariaDB affectedRows=0 means same no-op duplicate.
                        if (Number(result.affectedRows) > 0) {
                            const cols = compiled.returning.includes('*') ? '*' : compiled.returning.map(col => `\`${col}\``).join(',');
                            [rows] = await this.connection.execute(`SELECT ${cols} FROM \`${table}\` WHERE \`${keyColumn}\`=?`, [params[0]]);
                        }
                    } else throw new Error(`MariaDB não conseguiu determinar o registro RETURNING de ${table}.`);
                } else if (verb === 'UPDATE') {
                    if (idParam === null) throw new Error('MariaDB UPDATE RETURNING sem chave id não é suportado.');
                    if (Number(result.affectedRows) > 0) {
                        const cols = compiled.returning.includes('*') ? '*' : compiled.returning.map(col => `\`${col}\``).join(',');
                        [rows] = await this.connection.execute(`SELECT ${cols} FROM \`${table}\` WHERE id=?`, [params[idParam]]);
                    }
                }
            }
            if (ownTransaction) { await this.connection.commit(); this.inTransaction = false; }
            return { rows: normalizeRows(rows), rowCount: compiled.returning ? rows.length : (Array.isArray(result) ? result.length : (result.affectedRows ?? 0)), command: verb || 'SELECT', insertId: result.insertId || undefined };
        } catch (error) {
            if (ownTransaction && this.inTransaction) { await this.connection.rollback(); this.inTransaction = false; }
            throw mapError(error);
        }
    }
    async release() {
        try {
            if (this.inTransaction) { await this.connection.rollback(); this.inTransaction = false; }
            await this.releaseLocks();
        } finally { this.connection.release(); }
    }
    async releaseLocks() {
        for (const name of this.heldLocks) {
            try { await this.connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
            finally { this.heldLocks.delete(name); }
        }
    }
}

function createMariaDBPool(env) {
    if (env.APP_ENV !== 'test') throw new Error('MariaDB adapter só pode iniciar com APP_ENV=test.');
    if (env.MARIADB_TEST_DATABASE !== REQUIRED_DATABASE) throw new Error(`Banco MariaDB de teste deve ser exatamente ${REQUIRED_DATABASE}.`);
    const host = env.MARIADB_TEST_HOST || 'localhost';
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('MariaDB test host deve ser local; conexão remota bloqueada.');
    if (!env.MARIADB_TEST_USER || !env.MARIADB_TEST_PASSWORD) throw new Error('Configure as credenciais MARIADB_TEST_USER/PASSWORD.');
    const rawPool = mysql.createPool({
        host, user: env.MARIADB_TEST_USER, password: env.MARIADB_TEST_PASSWORD, database: REQUIRED_DATABASE,
        waitForConnections: true, connectionLimit: 8, queueLimit: 32, timezone: 'Z', dateStrings: true,
        supportBigNumbers: true, decimalNumbers: false, charset: 'utf8mb4', namedPlaceholders: false,
        multipleStatements: false
    });
    const wrap = connection => {
        const client = new MariaClient(connection);
        return new Proxy(client, { get(target, prop) {
            if (prop === 'release') return target.release.bind(target);
            if (prop === 'query') return async (sql, params = []) => {
                const sqlText = String(sql);
                const namedLock = sqlText.match(/pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'([^']+)'\s*\)\s*\)/i);
                if (/pg_advisory_xact_lock\s*\(/i.test(sqlText)) {
                    if (!target.inTransaction) throw new Error('Advisory transaction lock fora de BEGIN é proibido.');
                    let name;
                    if (namedLock) name = `app:${namedLock[1]}`;
                    else {
                        name = `key:${require('node:crypto').createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 48)}`;
                    }
                    const [rows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [name]);
                    if (Number(rows[0]?.acquired) !== 1) throw new Error('Não foi possível obter lock transacional MariaDB.');
                    target.heldLocks.add(name);
                    return { rows: [], rowCount: 1, command: 'LOCK' };
                }
                const tx = /^\s*(BEGIN|START TRANSACTION|COMMIT|ROLLBACK)\s*;?\s*$/i.exec(sql);
                if (tx) {
                    const op = tx[1].toUpperCase();
                    if (op === 'BEGIN' || op === 'START TRANSACTION') { await connection.beginTransaction(); target.inTransaction = true; }
                    else if (op === 'COMMIT') { await connection.commit(); target.inTransaction = false; await target.releaseLocks(); }
                    else { await connection.rollback(); target.inTransaction = false; await target.releaseLocks(); }
                    return { rows: [], rowCount: 0, command: op };
                }
                return target.query(sql, params);
            };
            if (prop === 'connection') return undefined;
            return target[prop];
        }});
    };
    const pool = {
        kind: 'mariadb', isMariaDB: true, isTestMode: true,
        async assertTestDatabase() {
            const [rows] = await rawPool.query('SELECT DATABASE() AS database_name, VERSION() AS version');
            if (rows[0]?.database_name !== REQUIRED_DATABASE) throw new Error('MariaDB conectado a banco inesperado; abortando.');
            console.log(`[DB] MariaDB de teste validado (${rows[0].version}).`);
        },
        async query(sql, params = []) { const client = wrap(await rawPool.getConnection()); try { return await client.query(sql, params); } finally { await client.release(); } },
        async connect() { return wrap(await rawPool.getConnection()); },
        async end() { await rawPool.end(); }
    };
    return pool;
}

module.exports = { createMariaDBPool, REQUIRED_DATABASE };
