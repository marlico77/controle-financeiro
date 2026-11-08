const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, normalizeRows } = require('../lib/mariadbCompat');
const { mariaLedgerQuery, normalizeMariaLedgerRows, summarizeLedgerRows } = require('../lib/financialSummary');
const { createMariaDBPool } = require('../lib/mariadbDatabase');

test('MariaDB compiler preserves placeholder order across array predicates and repeated parameters', () => {
    const result = compile('SELECT id FROM people WHERE unit=$1 AND id = ANY($2::int[]) AND id <> $1', ['direcao', [4, 8]]);
    assert.equal(result.sql, 'SELECT id FROM people WHERE unit=? AND id IN (?, ?) AND id <> ?');
    assert.deepEqual(result.params, ['direcao', 4, 8, 'direcao']);
});

test('MariaDB compiler translates only allowlisted constructs and fails closed elsewhere', () => {
    assert.match(compile('INSERT INTO event_participants (event_id,person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [1, 2]).sql, /ON DUPLICATE KEY UPDATE/);
    assert.throws(() => compile('INSERT INTO outflows (id) VALUES ($1) ON CONFLICT DO NOTHING', [1]), /not allowlisted|allowlist/i);
    assert.throws(() => compile('SELECT unnest($1::int[])', [[1]]), /sem adaptação|não tratado/i);
});

test('MariaDB test adapter requires exact isolated database and local host', () => {
    assert.throws(() => createMariaDBPool({ APP_ENV: 'test', MARIADB_TEST_DATABASE: 'production', MARIADB_TEST_USER: 'u', MARIADB_TEST_PASSWORD: 'p' }), /exatamente/);
    assert.throws(() => createMariaDBPool({ APP_ENV: 'test', MARIADB_TEST_DATABASE: 'trib0156_tribo_migracao_teste', MARIADB_TEST_HOST: 'remote.example', MARIADB_TEST_USER: 'u', MARIADB_TEST_PASSWORD: 'p' }), /local/);
});

test('MariaDB result booleans and JSON normalize and financial ledger groups Sao Paulo dates', () => {
    assert.deepEqual(normalizeRows([{ active: 1, unit_counts: '{"Direcao":2}' }]), [{ active: true, unit_counts: { Direcao: 2 } }]);
    assert.match(mariaLedgerQuery, /COALESCE\(pay\.updated_at, pay\.created_at\)/);
    const rows = normalizeMariaLedgerRows([{ source: 'dues', unit: 'Direção', amount: '10.00', cash_timestamp: '2026-01-01 02:00:00' }]);
    assert.equal(rows[0].year, 2025);
    assert.equal(summarizeLedgerRows(rows, 2025).duesCents, 1000);
});
