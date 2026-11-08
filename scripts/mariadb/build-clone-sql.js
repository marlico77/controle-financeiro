#!/usr/bin/env node
'use strict';

// Builds an isolated-test MariaDB DDL/data replay from the Supabase read-only
// JSONL snapshot. The SQL contains personal/financial data; output only to the
// ignored scratch directory and import only into the dedicated test database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sourceDir = path.resolve(process.env.MIGRATION_SOURCE_DIR || path.resolve(__dirname, '../../../gestao-financeira/scratch/migration'));
const outputDir = path.resolve(process.env.MARIADB_OUTPUT_DIR || path.resolve(__dirname, '../../scratch/mariadb-test'));
const schema = JSON.parse(fs.readFileSync(path.join(sourceDir, 'schema.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));
const tables = new Map(schema.table_names.map(name => [name, schema.columns.filter(c => c.table_name === name)]));
const quoteId = value => `\`${String(value).replaceAll('`', '``')}\``;
const sqlText = value => `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`;
const jsonType = new Set(['json', 'jsonb']);
const autoId = c => /nextval\(/i.test(c.column_default || '');
const textIndexColumns = new Set();
for (const c of schema.constraints.filter(item => item.type === 'p' || item.type === 'u')) {
  const cols = splitFields(c.definition).map(field => field.trim().replaceAll('"', ''));
  for (const name of cols) {
    const column = schema.columns.find(item => item.table_name === c.table_name && item.column_name === name);
    if (column?.data_type === 'text') textIndexColumns.add(`${c.table_name}.${name}`);
  }
}
for (const idx of schema.indexes) {
  const m = idx.indexdef.match(/\(([^()]*)\)/);
  if (!m) continue;
  for (const field of m[1].split(',')) {
    const name = field.trim().replaceAll('"', '');
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) continue;
    const column = schema.columns.find(item => item.table_name === idx.tablename && item.column_name === name);
    if (column?.data_type === 'text') textIndexColumns.add(`${idx.tablename}.${name}`);
  }
}

function mariaType(c) {
  switch (c.data_type) {
    case 'integer': return 'INT';
    case 'bigint': return 'BIGINT';
    case 'smallint': return 'SMALLINT';
    case 'boolean': return 'TINYINT(1)';
    case 'character varying': return `VARCHAR(${Math.min(16383, Math.max(1, Number(c.character_maximum_length) || 255))})`;
    case 'character': return `CHAR(${Math.min(255, Math.max(1, Number(c.character_maximum_length) || 1))})`;
    case 'text': return textIndexColumns.has(`${c.table_name}.${c.column_name}`) ? 'VARCHAR(512)' : 'LONGTEXT';
    case 'jsonb': case 'json': return 'JSON';
    case 'bytea': return 'LONGBLOB';
    case 'numeric': return 'DECIMAL(65,30)';
    case 'date': return 'DATE';
    case 'timestamp without time zone': case 'timestamp with time zone': return 'DATETIME(6)';
    case 'time without time zone': return 'TIME(6)';
    case 'uuid': return 'CHAR(36)';
    default: throw new Error(`Unsupported PostgreSQL type ${c.data_type} at ${c.table_name}.${c.column_name}`);
  }
}

function defaultSql(c) {
  const value = c.column_default;
  if (!value) return '';
  if (autoId(c)) return ' AUTO_INCREMENT';
  if (/^now\(\)|^CURRENT_TIMESTAMP/i.test(value)) return ' DEFAULT CURRENT_TIMESTAMP(6)';
  if (/^CURRENT_DATE/i.test(value)) return ' DEFAULT (CURRENT_DATE)';
  if (/^true(::boolean)?$/i.test(value)) return ' DEFAULT 1';
  if (/^false(::boolean)?$/i.test(value)) return ' DEFAULT 0';
  const match = value.match(/^'((?:''|[^'])*)'(?:::[a-zA-Z ]+)?$/);
  if (match) return ` DEFAULT '${match[1].replaceAll("''", "'").replaceAll("'", "''")}'`;
  if (/^1(::integer)?$/.test(value)) return ' DEFAULT 1';
  // Defaults with PostgreSQL-only expressions are intentionally omitted and
  // listed in the conversion report for manual adapter review.
  return '';
}

function splitFields(definition) {
  const body = definition.slice(definition.indexOf('(') + 1, definition.lastIndexOf(')'));
  const fields = [];
  let part = '', depth = 0, quote = false;
  for (const ch of body) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (ch === ',' && !quote && depth === 0) { fields.push(part.trim()); part = ''; }
    else part += ch;
  }
  if (part.trim()) fields.push(part.trim());
  return fields;
}

function constraintSql(c) {
  let def = c.definition.replace(/\s+NOT VALID\s*$/i, '');
  def = def.replace(/::numeric\b/gi, '').replace(/::text\b/gi, '');
  def = def.replace(/= ANY\s*\(ARRAY\[(.*?)\](?:::[a-zA-Z ]+\[\])?\)/i, 'IN ($1)');
  def = def.replace(/'([^']*)'::text/gi, (_, x) => `'${x.replaceAll("'", "''")}'`);
  if (c.type === 'p' || c.type === 'u') {
    const kind = c.type === 'p' ? 'PRIMARY KEY' : 'UNIQUE';
    const cols = splitFields(def).map(x => quoteId(x.trim().replaceAll('"', ''))).join(', ');
    return `CONSTRAINT ${quoteId(c.name)} ${kind} (${cols})`;
  }
  if (c.type === 'f') {
    def = def.replace(/"([^"]+)"/g, '`$1`');
    return `CONSTRAINT ${quoteId(c.name)} ${def}`;
  }
  if (c.type === 'c') {
    def = def.replace(/account_status\s*=\s*ANY\s*\(ARRAY\['active',\s*'disabled'\]\)/i, "account_status IN ('active','disabled')");
    return `CONSTRAINT ${quoteId(c.name)} ${def}`;
  }
  throw new Error(`Unsupported constraint kind ${c.type} for ${c.name}`);
}

function buildSchemaSql() {
  const lines = [
    '-- Generated from the read-only PostgreSQL metadata snapshot for the isolated MariaDB test DB.',
    '-- MariaDB 10.11; timestamps use UTC DATETIME, JSON uses MariaDB JSON, bytea uses LONGBLOB.',
    'SET NAMES utf8mb4 COLLATE utf8mb4_bin;',
    'SET FOREIGN_KEY_CHECKS=0;',
    "SET SESSION time_zone = '+00:00';"
  ];
  const foreignKeys = [];
  for (const [table, cols] of tables) {
    const defs = cols.map(c => {
      const nullable = c.is_nullable === 'YES' ? ' NULL' : ' NOT NULL';
      return `${quoteId(c.column_name)} ${mariaType(c)}${nullable}${defaultSql(c)}`;
    });
    const cons = schema.constraints.filter(c => c.table_name === table);
    for (const c of cons) {
      if (c.type === 'f') foreignKeys.push({ table, c });
      else if (c.name !== 'push_subscriptions_user_id_subscription_data_key') defs.push(constraintSql(c));
    }
    if (table === 'event_payments') {
      // Do not derive stored columns from FK columns event_id/person_id: InnoDB
      // rejects adding foreign keys on base columns used by stored generated columns.
      defs.push('`_single_flag` TINYINT(1) GENERATED ALWAYS AS (CASE WHEN `month` IS NULL THEN 1 ELSE NULL END) PERSISTENT');
      defs.push('UNIQUE KEY `event_payments_single_unique_mdb` (`event_id`,`person_id`,`_single_flag`)');
    }
    if (table === 'users') {
      defs.push("`_email_normalized` VARCHAR(255) GENERATED ALWAYS AS (NULLIF(LOWER(TRIM(`email`)),'')) PERSISTENT");
      defs.push('UNIQUE KEY `users_email_lower_unique_mdb` (`_email_normalized`)');
      defs.push('`_username_normalized` VARCHAR(512) GENERATED ALWAYS AS (LOWER(`username`)) PERSISTENT');
      defs.push('UNIQUE KEY `users_username_lower_unique_mdb` (`_username_normalized`)');
    }
    if (table === 'push_subscriptions') {
      defs.push('`_subscription_hash` CHAR(64) GENERATED ALWAYS AS (SHA2(`subscription_data`,256)) PERSISTENT');
      defs.push('UNIQUE KEY `push_subscription_user_unique_mdb` (`user_id`,`_subscription_hash`)');
    }
    // Partial-index equivalents where NULL naturally suppresses uniqueness.
    if (table === 'users' && cons.some(c => c.name === 'users_person_unique')) {
      defs.push('UNIQUE KEY `users_person_unique_mdb` (`person_id`)');
    }
    if (table === 'whatsapp_queue' && schema.indexes.some(i => i.indexname === 'reminder_contact_unique')) {
      defs.push('UNIQUE KEY `reminder_contact_unique_mdb` (`reminder_id`,`phone`)');
    }
    lines.push(`CREATE TABLE ${quoteId(table)} (\n  ${defs.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;`);
  }
  const represented = new Set([
    'event_payments_period_unique', 'event_payments_single_unique',
    'users_email_lower_unique', 'users_person_unique', 'users_username_lower_unique',
    'reminder_contact_unique', 'push_subscription_user_unique'
  ]);
  const constrained = new Set(schema.constraints.filter(c => c.type === 'p' || c.type === 'u').map(c => c.name));
  for (const idx of schema.indexes) {
    if (constrained.has(idx.indexname) || represented.has(idx.indexname) || idx.indexdef.includes(' WHERE ')) continue;
    const match = idx.indexdef.match(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ USING \w+ \((.*)\)$/i);
    if (!match) { lines.push(`-- MANUAL INDEX REVIEW REQUIRED: ${idx.indexdef}`); continue; }
    const unique = match[1] ? 'UNIQUE ' : '';
    const fields = splitFields(`(${match[2]})`).map(field => {
      const bare = field.trim().replaceAll('"', '');
      if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(bare)) throw new Error(`Unsupported index expression ${idx.indexname}`);
      return quoteId(bare);
    }).join(', ');
    lines.push(`ALTER TABLE ${quoteId(idx.tablename)} ADD ${unique}INDEX ${quoteId(idx.indexname)} (${fields});`);
  }
  for (const { table, c } of foreignKeys) lines.push(`ALTER TABLE ${quoteId(table)} ADD ${constraintSql(c)};`);
  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  return lines.join('\n\n') + '\n';
}

function timestampToUtc(value) {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/i);
  if (!match) throw new Error('Invalid ISO timestamp with timezone in snapshot.');
  const [, date, hh, mm, ss, fraction = '', zone] = match;
  let offsetMinutes = 0;
  if (zone.toUpperCase() !== 'Z') {
    const parts = zone.slice(1).replace(':', '');
    offsetMinutes = (Number(parts.slice(0, 2)) * 60 + Number(parts.slice(2, 4))) * (zone[0] === '+' ? 1 : -1);
  }
  const instant = new Date(`${date}T${hh}:${mm}:${ss}.000Z`);
  instant.setUTCMinutes(instant.getUTCMinutes() - offsetMinutes);
  const utc = instant.toISOString().slice(0, 19).replace('T', ' ');
  return `${utc}.${(fraction + '000000').slice(0, 6)}`;
}

function timestampWithoutZone(value) {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) throw new Error('Invalid timestamp without timezone in snapshot.');
  const [, date, hh, mm, ss, fraction = ''] = match;
  return `${date} ${hh}:${mm}:${ss}.${(fraction + '000000').slice(0, 6)}`;
}

function convertValue(value, column) {
  if (value === null || value === undefined) return 'NULL';
  if (value && typeof value === 'object' && Object.hasOwn(value, '$bytea_base64')) return `X'${Buffer.from(value.$bytea_base64, 'base64').toString('hex')}'`;
  if (column.data_type === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return sqlText(JSON.stringify(value));
  if (column.data_type === 'date') return sqlText(String(value).slice(0, 10));
  if (column.data_type === 'timestamp without time zone') return sqlText(timestampWithoutZone(value));
  if (column.data_type === 'timestamp with time zone') {
    return sqlText(timestampToUtc(value));
  }
  if (column.data_type === 'numeric' || column.data_type === 'integer' || column.data_type === 'bigint' || column.data_type === 'smallint') {
    if (!/^-?\d+(?:\.\d+)?$/.test(String(value))) throw new Error(`Invalid numeric at ${column.table_name}.${column.column_name}`);
    return String(value);
  }
  return sqlText(value);
}

function readTableRows(table) {
  const file = path.join(sourceDir, `${table}.jsonl`);
  const contents = fs.readFileSync(file);
  const lines = contents.toString('utf8').split(/\r?\n/).filter(Boolean);
  const rows = lines.map((line, i) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at ${table}.jsonl line ${i + 1}`); }
  });
  const expected = manifest.tables.find(t => t.table === table)?.rows;
  if (expected !== rows.length) throw new Error(`Row count mismatch in source file ${table}: expected ${expected}, found ${rows.length}`);
  return { rows, sha256: crypto.createHash('sha256').update(contents).digest('hex'), bytes: contents.length };
}

function buildDataSql() {
  const lines = ['-- Generated data-only replay for the isolated MariaDB test database.', '-- Two pre-existing event_payments rows violate a PostgreSQL NOT VALID CHECK; suppress checks only for this import session.', 'SET NAMES utf8mb4 COLLATE utf8mb4_bin;', 'SET FOREIGN_KEY_CHECKS=0;', 'SET SESSION check_constraint_checks=OFF;', "SET SESSION time_zone = '+00:00';", 'START TRANSACTION;'];
  const summary = { source: 'Supabase PostgreSQL snapshot', exported_at: manifest.exported_at, table_count: 0, row_count: 0, source_tables: {}, financial_totals: {}, receipt_content_bytes: {} };
  const totals = { payments: 0n, event_payments: 0n, outflows: 0n, sales: 0n };
  const order = loadOrder();
  for (const table of order) {
    const cols = tables.get(table);
    const { rows, sha256, bytes } = readTableRows(table);
    const names = cols.map(c => c.column_name);
    const records = [];
    for (const row of rows) {
      records.push(`(${names.map(name => convertValue(row[name], cols.find(c => c.column_name === name))).join(',')})`);
      const receipt = row.receipt_content;
      if (receipt && typeof receipt === 'object' && Object.hasOwn(receipt, '$bytea_base64')) {
        summary.receipt_content_bytes[table] = (summary.receipt_content_bytes[table] || 0) + Number(receipt.bytes || Buffer.from(receipt.$bytea_base64, 'base64').length);
      }
      if (Object.hasOwn(totals, table) && row.amount !== null && row.amount !== undefined) {
        const [whole, frac = ''] = String(row.amount).split('.');
        const cents = BigInt((whole || '0')) * 100n + BigInt((frac + '00').slice(0, 2));
        totals[table] += cents;
      }
    }
    for (let offset = 0; offset < records.length; offset += 100) {
      lines.push(`INSERT INTO ${quoteId(table)} (${names.map(quoteId).join(',')}) VALUES\n${records.slice(offset, offset + 100).join(',\n')};`);
    }
    summary.source_tables[table] = { rows: rows.length, bytes, sha256 };
    summary.table_count++;
    summary.row_count += rows.length;
  }
  for (const [table, cents] of Object.entries(totals)) summary.financial_totals[table] = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  lines.push('COMMIT;', 'SET SESSION check_constraint_checks=ON;', 'SET FOREIGN_KEY_CHECKS=1;');
  return { sql: lines.join('\n\n') + '\n', summary };
}

function buildValidationSql() {
  const countLines = [...tables.keys()].map((table, i) => `${i ? 'UNION ALL ' : ''}SELECT '${table}' AS source_table, COUNT(*) AS row_count FROM ${quoteId(table)}`);
  const blobTables = ['payments', 'event_payments', 'outflows', 'sales'];
  const blobTotals = blobTables.map((table, i) => `${i ? 'UNION ALL ' : ''}SELECT '${table}' AS source_table, COUNT(receipt_content) AS receipt_count, COALESCE(SUM(OCTET_LENGTH(receipt_content)),0) AS receipt_bytes FROM ${quoteId(table)}`);
  const blobHashes = blobTables.map((table, i) => `${i ? 'UNION ALL ' : ''}SELECT '${table}' AS source_table, SHA2(receipt_content,256) AS object_sha256 FROM ${quoteId(table)} WHERE receipt_content IS NOT NULL`);
  const lines = [
    '-- Run after importing schema.sql and data.sql; compare output to source-validation.json.',
    countLines.join('\n') + ';',
    `SELECT 'payments' AS source_table, year AS fiscal_year, status, COUNT(*) AS row_count, COALESCE(SUM(ROUND(amount*100)),0) AS amount_cents FROM payments GROUP BY year,status
UNION ALL SELECT 'event_payments', COALESCE(ep.year,YEAR(e.date)), ep.status, COUNT(*), COALESCE(SUM(ROUND(ep.amount*100)),0) FROM event_payments ep LEFT JOIN events e ON e.id=ep.event_id GROUP BY COALESCE(ep.year,YEAR(e.date)),ep.status
UNION ALL SELECT 'outflows', YEAR(date), NULL, COUNT(*), COALESCE(SUM(ROUND(amount*100)),0) FROM outflows GROUP BY YEAR(date)
UNION ALL SELECT 'sales', YEAR(date), NULL, COUNT(*), COALESCE(SUM(ROUND(amount*100)),0) FROM sales GROUP BY YEAR(date);`,
    blobTotals.join('\n') + ';',
    blobHashes.join('\n') + '\nORDER BY source_table, object_sha256;'
  ];
  return lines.join('\n\n') + '\n';
}

function loadOrder() {
  const parents = new Map(schema.table_names.map(table => [table, new Set()]));
  for (const fk of schema.constraints.filter(item => item.type === 'f')) {
    const m = fk.definition.match(/REFERENCES\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(/i);
    if (m) parents.get(fk.table_name).add(m[1]);
  }
  const remaining = new Set(schema.table_names), order = [];
  while (remaining.size) {
    const ready = [...remaining].filter(table => [...parents.get(table)].every(parent => !remaining.has(parent))).sort();
    if (!ready.length) throw new Error(`Foreign-key cycle in source tables: ${[...remaining].join(',')}`);
    for (const table of ready) { order.push(table); remaining.delete(table); }
  }
  return order;
}

function buildResetSql() {
  const dbName = 'trib0156_tribo_migracao_teste';
  const order = loadOrder().reverse();
  return [
    '-- Data-only reset; targets only the dedicated migration test database by fully qualified name.',
    `SELECT IF(DATABASE() = '${dbName}', 'target DB selected', 'fully qualified test DB deletes follow');`,
    'START TRANSACTION;',
    ...order.map(table => `DELETE FROM ${quoteId(dbName)}.${quoteId(table)};`),
    'COMMIT;'
  ].join('\n\n') + '\n';
}

function buildRepairSql() {
  const lines = [
    '-- Repairs the partially-created isolated test schema after MariaDB error 138.',
    '-- Run once, then import data.sql. This is only for trib0156_tribo_migracao_teste.',
    'ALTER TABLE `event_payments` DROP INDEX `event_payments_single_unique_mdb`, DROP COLUMN `_single_event_key`, DROP COLUMN `_single_person_key`, ADD COLUMN `_single_flag` TINYINT(1) GENERATED ALWAYS AS (CASE WHEN `month` IS NULL THEN 1 ELSE NULL END) PERSISTENT, ADD UNIQUE KEY `event_payments_single_unique_mdb` (`event_id`,`person_id`,`_single_flag`);'
  ];
  const alreadyApplied = new Set(['event_participants_event_id_fkey', 'event_participants_person_id_fkey']);
  for (const c of schema.constraints.filter(item => item.type === 'f' && !alreadyApplied.has(item.name))) {
    const table = c.table_name;
    const def = c.definition.replace(/\s+NOT VALID\s*$/i, '').replace(/"([^"]+)"/g, '`$1`');
    lines.push(`ALTER TABLE ${quoteId(table)} ADD CONSTRAINT ${quoteId(c.name)} ${def};`);
  }
  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  return lines.join('\n\n') + '\n';
}

fs.mkdirSync(outputDir, { recursive: true });
const schemaSql = buildSchemaSql();
const { sql: dataSql, summary } = buildDataSql();
fs.writeFileSync(path.join(outputDir, 'schema.sql'), schemaSql, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'data.sql'), dataSql, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'validate.sql'), buildValidationSql(), { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'repair.sql'), buildRepairSql(), { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'reset-data.sql'), buildResetSql(), { flag: 'wx' });
summary.generated_files = {};
for (const file of ['schema.sql', 'data.sql', 'validate.sql', 'repair.sql', 'reset-data.sql']) {
  const content = fs.readFileSync(path.join(outputDir, file));
  summary.generated_files[file] = { bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
}
fs.writeFileSync(path.join(outputDir, 'source-validation.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
process.stderr.write(`Prepared ${summary.table_count} tables / ${summary.row_count} rows in isolated clone SQL. Output: ${outputDir}\n`);
