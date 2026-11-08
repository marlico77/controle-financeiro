#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sourceDir = path.resolve(process.env.MIGRATION_SOURCE_DIR || path.resolve(__dirname, '../../../gestao-financeira/scratch/migration'));
const schema = JSON.parse(fs.readFileSync(path.join(sourceDir, 'schema.json'), 'utf8'));
const upstreamValidationPath = path.join(sourceDir, 'validation-source.json');
const upstreamValidation = fs.existsSync(upstreamValidationPath) ? JSON.parse(fs.readFileSync(upstreamValidationPath, 'utf8')) : null;
const load = table => fs.readFileSync(path.join(sourceDir, `${table}.jsonl`), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const cache = new Map(schema.table_names.map(table => [table, load(table)]));
const present = new Map();
const refs = new Map(schema.table_names.map(table => [table, new Set()]));
const counts = {};
for (const [table, rows] of cache) {
  const pk = schema.constraints.find(c => c.table_name === table && c.type === 'p');
  if (!pk) continue;
  const cols = [...pk.definition.matchAll(/[A-Za-z_][A-Za-z_0-9]*/g)].map(m => m[0]).filter(n => !['PRIMARY','KEY'].includes(n));
  const values = new Set(rows.map(row => JSON.stringify(cols.map(col => row[col]))));
  present.set(table, { cols, values });
}
for (const fk of schema.constraints.filter(c => c.type === 'f')) {
  const m = fk.definition.match(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(([^)]+)\)/i);
  if (!m) { counts[fk.name] = { skipped: 'complex FK syntax' }; continue; }
  const localCols = m[1].split(',').map(s => s.trim().replaceAll('"',''));
  const refTable = m[2];
  const refCols = m[3].split(',').map(s => s.trim().replaceAll('"',''));
  const keySet = new Set(cache.get(refTable).map(row => JSON.stringify(refCols.map(col => row[col]))));
  let orphans = 0, nullExempt = 0;
  for (const row of cache.get(fk.table_name)) {
    const vals = localCols.map(col => row[col]);
    if (vals.some(v => v === null || v === undefined)) { nullExempt++; continue; }
    if (!keySet.has(JSON.stringify(vals))) orphans++;
  }
  counts[fk.name] = { child_table: fk.table_name, parent_table: refTable, rows: cache.get(fk.table_name).length, orphans, null_exempt: nullExempt };
  refs.get(fk.table_name).add(refTable);
}

const checkDiagnostics = {};
for (const c of schema.constraints.filter(item => item.type === 'c')) {
  const rows = cache.get(c.table_name);
  let invalid = 0;
  if (c.name === 'event_payments_positive') {
    invalid = rows.filter(row => Number(row.amount) <= 0 || (row.month !== null && (Number(row.month) < 1 || Number(row.month) > 12))).length;
  } else if (c.name === 'payments_positive') {
    invalid = rows.filter(row => Number(row.amount) <= 0 || Number(row.month) < 1 || Number(row.month) > 12 || Number(row.year) < 2000 || Number(row.year) > 2100).length;
  } else if (c.name === 'person_guardians_check') {
    invalid = rows.filter(row => row.child_person_id === row.guardian_person_id).length;
  } else if (c.name === 'users_account_status_check') {
    invalid = rows.filter(row => !['active', 'disabled'].includes(row.account_status)).length;
  } else {
    checkDiagnostics[c.name] = { rows: rows.length, invalid: 'manual review required for expression' };
    continue;
  }
  checkDiagnostics[c.name] = { rows: rows.length, invalid, not_valid_in_postgres: /NOT VALID/i.test(c.definition) };
}

const binaryChecks = {};
if (upstreamValidation) {
  for (const expected of upstreamValidation.binary_hashes || []) {
    const hashes = [], rows = cache.get(expected.table);
    let bytes = 0;
    for (const row of rows) {
      const blob = row.receipt_content;
      if (!blob || typeof blob !== 'object' || !blob.$bytea_base64) continue;
      const contents = Buffer.from(blob.$bytea_base64, 'base64');
      bytes += contents.length;
      hashes.push(require('node:crypto').createHash('sha256').update(contents).digest('hex'));
    }
    hashes.sort();
    const wanted = [...expected.object_sha256_sorted].sort();
    const hashesMatch = JSON.stringify(hashes) === JSON.stringify(wanted);
    const bytesMatch = bytes === expected.total_bytes;
    binaryChecks[expected.table] = { receipt_count: hashes.length, bytes, hashes_match: hashesMatch, bytes_match: bytesMatch };
    if (!hashesMatch || !bytesMatch) throw new Error(`Receipt hash/size mismatch in ${expected.table}.`);
  }
}

const indexedTextColumns = new Set();
for (const c of schema.constraints.filter(item => item.type === 'p' || item.type === 'u')) {
  const m = c.definition.match(/\(([^()]*)\)/);
  for (const field of (m?.[1] || '').split(',')) {
    const name = field.trim().replaceAll('"','');
    if (schema.columns.some(col => col.table_name === c.table_name && col.column_name === name && col.data_type === 'text')) indexedTextColumns.add(`${c.table_name}.${name}`);
  }
}
for (const idx of schema.indexes) {
  const m = idx.indexdef.match(/\(([^()]*)\)/);
  for (const field of (m?.[1] || '').split(',')) {
    const name = field.trim().replaceAll('"','');
    if (schema.columns.some(col => col.table_name === idx.tablename && col.column_name === name && col.data_type === 'text')) indexedTextColumns.add(`${idx.tablename}.${name}`);
  }
}
const indexedTextBounds = {};
for (const key of indexedTextColumns) {
  const [table, column] = key.split('.');
  let maxChars = 0, maxBytes = 0;
  for (const row of cache.get(table)) {
    if (row[column] === null || row[column] === undefined) continue;
    maxChars = Math.max(maxChars, [...String(row[column])].length);
    maxBytes = Math.max(maxBytes, Buffer.byteLength(String(row[column]), 'utf8'));
  }
  indexedTextBounds[key] = { max_chars: maxChars, max_utf8_bytes: maxBytes, fits_generator_varchar_512: maxChars <= 512 };
  if (maxChars > 512) throw new Error(`Indexed TEXT column exceeds 512-character migration cap: ${key}`);
}
let numericMaxIntegerDigits = 0, numericMaxScale = 0;
for (const col of schema.columns.filter(item => item.data_type === 'numeric')) {
  for (const row of cache.get(col.table_name)) {
    const value = row[col.column_name];
    if (value === null || value === undefined) continue;
    const [whole, fraction = ''] = String(value).replace(/^-/, '').split('.');
    numericMaxIntegerDigits = Math.max(numericMaxIntegerDigits, whole.replace(/^0+/, '').length || 1);
    numericMaxScale = Math.max(numericMaxScale, fraction.length);
  }
}
if (numericMaxIntegerDigits > 35 || numericMaxScale > 30) throw new Error('Observed PostgreSQL NUMERIC exceeds DECIMAL(65,30) migration bounds.');

const remaining = new Set(schema.table_names);
const order = [];
while (remaining.size) {
  const ready = [...remaining].filter(table => [...refs.get(table)].every(parent => !remaining.has(parent)));
  if (!ready.length) throw new Error(`Foreign-key cycle prevents a plain insert order: ${[...remaining].join(',')}`);
  ready.sort();
  for (const table of ready) { order.push(table); remaining.delete(table); }
}

process.stdout.write(JSON.stringify({ tables: schema.table_names.length, rows: [...cache.values()].reduce((sum, rows) => sum + rows.length, 0), foreign_keys: counts, checks: checkDiagnostics, binary_checks: binaryChecks, indexed_text_bounds: indexedTextBounds, numeric_bounds: { max_integer_digits: numericMaxIntegerDigits, max_scale: numericMaxScale, fits_decimal_65_30: true }, load_order: order }, null, 2) + '\n');
