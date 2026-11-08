'use strict';

const BOOL_COLUMNS = new Set(['is_read', 'is_participant', 'enabled', 'wants_to_join', 'is_adventist', 'active', 'must_change_password', 'lgpd_accepted', 'is_master', 'is_superadmin', 'email_verified', 'activation_ready']);
const JSON_COLUMNS = new Set(['requisitos', 'subscription_data', 'details', 'unit_counts']);
const DO_NOTHING_TARGETS = Object.freeze({
  'event_participants:': 'event_id', 'event_participants:event_id,person_id': 'event_id',
  'notification_reads:': 'notification_id', 'notification_reads:notification_id,user_id': 'notification_id',
  'whatsapp_message_senders:': 'message_id', 'whatsapp_message_senders:message_id': 'message_id',
  'whatsapp_queue:': 'reminder_id', 'whatsapp_queue:reminder_id': 'reminder_id',
  'reminder_runs:': 'run_key', 'reminder_runs:run_key': 'run_key'
});

function readReturning(sql) {
  const match = sql.match(/\s+RETURNING\s+([\w.*," ]+)\s*;?\s*$/i);
  if (!match) return { sql: sql.trim().replace(/;\s*$/, ''), columns: null };
  return { sql: sql.slice(0, match.index).trim().replace(/;\s*$/, ''), columns: match[1].split(',').map(s => s.trim().replaceAll('"', '').split('.').pop()) };
}

function rewriteExplicitPostgres(sql) {
  let text = sql;
  // Expressions used in the application; keep this list explicit and reject the
  // PostgreSQL-only constructs that are not accounted for below.
  text = text.replace(/NOW\(\)\s*([+-])\s*\$(\d+)\s*\*\s*INTERVAL\s*'(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)'/gi,
    (_, sign, n, multiple, unit) => `DATE_${sign === '+' ? 'ADD' : 'SUB'}(NOW(), INTERVAL ($${n} * ${multiple}) ${unit.toUpperCase().replace(/S$/, '')})`);
  text = text.replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)'/gi,
    (_, sign, amount, unit) => `DATE_${sign === '+' ? 'ADD' : 'SUB'}(NOW(), INTERVAL ${amount} ${unit.toUpperCase().replace(/S$/, '')})`);
  text = text.replace(/jsonb_object_agg\s*\(/gi, 'JSON_OBJECTAGG(');
  text = text.replace(/\bIS\s+NOT\s+DISTINCT\s+FROM\b/gi, '<=>');
  if (/\bON\s+CONFLICT(?:\s*\([^)]*\))?\s+DO\s+NOTHING\b/i.test(text)) {
    const table = text.match(/^\s*INSERT\s+INTO\s+[`"]?([A-Za-z_][A-Za-z_0-9]*)/i)?.[1];
    const target = text.match(/\bON\s+CONFLICT(?:\s*\(([^)]*)\))?\s+DO\s+NOTHING\b/i)?.[1]?.replaceAll('"', '').replaceAll('`', '').replace(/\s/g, '').toLowerCase() || '';
    const key = DO_NOTHING_TARGETS[`${table}:${target}`];
    if (!key) throw new Error(`MariaDB DO NOTHING is not allowlisted for ${table || 'this statement'}.`);
    text = text.replace(/\bON\s+CONFLICT(?:\s*\([^)]*\))?\s+DO\s+NOTHING\b/i, `ON DUPLICATE KEY UPDATE ${key}=VALUES(${key})`);
  }
  if (/\bON\s+CONFLICT(?:\s*\([^)]*\))?\s+DO\s+UPDATE\s+SET\b/i.test(text)) {
    const table = text.match(/^\s*INSERT\s+INTO\s+[`"]?([A-Za-z_][A-Za-z_0-9]*)/i)?.[1];
    const target = text.match(/\bON\s+CONFLICT(?:\s*\(([^)]*)\))?\s+DO\s+UPDATE\s+SET\b/i)?.[1]?.replaceAll('"', '').replaceAll('`', '').replace(/\s/g, '').toLowerCase();
    const allowed = (table === 'request_limits' && target === 'key') || (table === 'whatsapp_settings' && target === 'id');
    if (!allowed) throw new Error(`MariaDB upsert target is not allowlisted for ${table || 'this statement'}.`);
  }
  text = text.replace(/\bON\s+CONFLICT(?:\s*\([^)]*\))?\s+DO\s+UPDATE\s+SET\b/gi, 'ON DUPLICATE KEY UPDATE');
  text = text.replace(/\bEXCLUDED\.([a-z_][a-z_0-9]*)\b/gi, 'VALUES($1)');
  text = text.replace(/\bFOR\s+UPDATE\s+SKIP\s+LOCKED\s+LIMIT\s+(\d+)\b/gi, 'LIMIT $1 FOR UPDATE SKIP LOCKED');
  return text;
}

function removeKnownCasts(sql) {
  let out = '', i = 0, quote = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote && sql[i + 1] === quote) { out += sql[i + 1]; i += 2; continue; }
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      i++; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; i++; continue; }
    if (ch === ':' && sql[i + 1] === ':') {
      i += 2;
      while (/[A-Za-z0-9_\[\]]/.test(sql[i] || '')) i++;
      if (sql[i] === '(') { let depth = 1; i++; while (i < sql.length && depth) { if (sql[i] === '(') depth++; if (sql[i] === ')') depth--; i++; } }
      continue;
    }
    out += ch; i++;
  }
  return out;
}

function bindNumberedPlaceholders(sql, params) {
  let out = '', bindings = [], i = 0, quote = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote && sql[i + 1] === quote) { out += sql[i + 1]; i += 2; continue; }
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      i++; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; i++; continue; }
    if (ch === '-' && sql[i + 1] === '-') { const end = sql.indexOf('\n', i); const stop = end < 0 ? sql.length : end; out += sql.slice(i, stop); i = stop; continue; }
    const any = sql.slice(i).match(/^((?:[A-Za-z_][A-Za-z_0-9]*\.)?[A-Za-z_][A-Za-z_0-9]*)\s*=\s*ANY\s*\(\s*\$(\d+)(?:::[A-Za-z_][A-Za-z_0-9]*(?:\[\])?)?\s*\)/i);
    if (any) {
      const list = params[Number(any[2]) - 1];
      if (!Array.isArray(list)) throw new Error(`MariaDB compatibility expects an array parameter at $${any[2]}.`);
      if (!list.length) out += '1=0';
      else { out += `${any[1]} IN (${list.map(() => '?').join(', ')})`; bindings.push(...list); }
      i += any[0].length;
      continue;
    }
    if (ch === '$' && /\d/.test(sql[i + 1] || '')) {
      let end = i + 1; while (/\d/.test(sql[end] || '')) end++;
      const index = Number(sql.slice(i + 1, end)) - 1;
      if (index < 0 || index >= params.length) throw new Error(`No value supplied for SQL placeholder $${index + 1}.`);
      out += '?'; bindings.push(params[index]); i = end; continue;
    }
    out += ch; i++;
  }
  return { sql: out, params: bindings };
}

function compile(sql, params = []) {
  if (typeof sql !== 'string') throw new TypeError('MariaDB query must be a SQL string.');
  let text = rewriteExplicitPostgres(sql);
  if (/\b(?:unnest|AT\s+TIME\s+ZONE|DISTINCT\s+ON|ILIKE|FILTER\s*\(|ON\s+CONFLICT|pg_advisory)/i.test(text)) {
    throw new Error('Consulta contém SQL PostgreSQL sem adaptação MariaDB explícita; operação recusada.');
  }
  if (text.includes(';') && !/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\s*;?\s*$/i.test(text)) {
    throw new Error('Statements múltiplos ou terminador SQL inesperado recusados no modo MariaDB.');
  }
  const returning = readReturning(text);
  text = removeKnownCasts(returning.sql);
  const bound = bindNumberedPlaceholders(text, params);
  if (/\bANY\s*\(|::/i.test(bound.sql)) throw new Error('SQL PostgreSQL não tratado por regra explícita; consulta recusada.');
  return { sql: bound.sql, params: bound.params, returning: returning.columns, originalSql: sql };
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (BOOL_COLUMNS.has(key) && (value === 0 || value === 1 || value === '0' || value === '1')) row[key] = value === 1 || value === '1';
      else if (JSON_COLUMNS.has(key) && typeof value === 'string') {
        try { row[key] = JSON.parse(value); } catch { /* keep malformed historical text visible for diagnosis */ }
      }
      if (key.toUpperCase() === 'COUNT(*)') { row.count = value; delete row[key]; }
    }
  }
  return rows;
}

function queryInfo(sql) {
  const verb = /^\s*(INSERT|UPDATE|DELETE)\b/i.exec(sql)?.[1]?.toUpperCase();
  const table = sql.match(/^\s*(?:INSERT\s+IGNORE\s+INTO|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"]?([A-Za-z_][A-Za-z_0-9]*)/i)?.[1];
  const idParam = sql.match(/\bWHERE\s+(?:[A-Za-z_][A-Za-z_0-9]*\.)?id\s*=\s*\$(\d+)/i)?.[1];
  return { verb, table, idParam: idParam ? Number(idParam) - 1 : null };
}

module.exports = { compile, normalizeRows, queryInfo };
