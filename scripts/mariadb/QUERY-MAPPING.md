# PostgreSQL → MariaDB query and schema mapping

## Scope and evidence

This is a compatibility inventory for a separate migration spike. It does not alter the running application or production database. The source review covered `server.js`, `database.js`, `lib/`, `routes/`, and `migrations/`. A metadata-only inventory of the live PostgreSQL schema is pending from the read-only audit; generated DDL must wait for that inventory so it includes runtime migrations, constraints, indexes, views, and policies rather than relying only on the bootstrap SQL.

The ValueHost MariaDB server version and SQL mode are not yet verified. Resolve those before deciding which syntax is available. In particular, `SKIP LOCKED` requires MariaDB 10.6+ with InnoDB; MariaDB 10.5 introduced `INSERT ... RETURNING`, but that does not imply PostgreSQL-compatible `UPDATE ... RETURNING` behavior. See the official [MariaDB 10.6 release notes](https://mariadb.com/docs/release-notes/community-server/10.6/what-is-mariadb-106) and [INSERT ... RETURNING reference](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/inserting-loading-data/insertreturning).

## Constructs found and required treatment

| PostgreSQL construct in application/schema | MariaDB approach | Compatibility risks / required verification |
|---|---|---|
| `$1`, `$2` numbered placeholders (throughout `server.js`, `routes/`, `lib/`) | Use the MariaDB driver's `?` placeholders. Build parameter arrays for each occurrence in SQL order. | Repeated `$1` references in PostgreSQL are one argument; `?` needs the repeated value supplied at each occurrence. Dynamic `IN` lists need one `?` per value; never interpolate IDs or values into SQL. |
| `SERIAL PRIMARY KEY` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` (or a narrower integer only after max-ID review). | Preserve current IDs during migration and set `AUTO_INCREMENT` above the imported maximum. Review signedness before defining foreign keys. |
| `JSONB` and casts such as `'{}'::jsonb` (`events` aggregate; schema) | MariaDB `JSON` (an alias for `LONGTEXT` with JSON validation), with `JSON_OBJECTAGG` / `JSON_OBJECT` functions. | JSON storage and equality/index semantics differ: MariaDB does not use PostgreSQL's binary JSONB representation. Validate duplicate-key behavior, aggregation shape and driver decoding. Official [MariaDB JSON type reference](https://mariadb.com/docs/server/reference/data-types/string-data-types/json). |
| `BYTEA` for `receipt_content` | `LONGBLOB` or a separately stored object/file, with explicit size limits. | Test max packet, memory pressure and response behavior. Receipt list endpoints should keep excluding blob columns; the receipt fetch path must retain authorization checks. |
| `TIMESTAMPTZ`, `TIMESTAMP`, `NOW()` | Usually `DATETIME(3)` stored under a documented UTC convention; use UTC connection/session configuration. | PostgreSQL distinguishes timestamp types and has timezone-aware conversion. Baseline must identify actual type and application assumptions. Do not silently reinterpret existing wall-clock values. |
| `RETURNING id` on INSERT and UPDATE (`server.js`, `routes/securePayments.js`) | For supported MariaDB INSERTs use `insertId` or version-supported `INSERT ... RETURNING`; for UPDATE inspect affected rows and select within the same transaction when the returned row is needed. | Do not assume `UPDATE ... RETURNING` parity. Ensure the read and write share the same connection and transaction to avoid races. |
| `ON CONFLICT DO NOTHING` / `ON CONFLICT (...) DO UPDATE ... RETURNING` | `INSERT IGNORE` for carefully reviewed do-nothing cases; `INSERT ... ON DUPLICATE KEY UPDATE` for upsert. | MariaDB's duplicate-key target is any matching unique key, not an explicitly named conflict target. Avoid `REPLACE` (delete+insert semantics). Preserve returned count/row semantics and test all uniqueness constraints. |
| `IS NOT DISTINCT FROM` | MariaDB null-safe equality operator `<=>`. | Test nullable month/year keys and collation effects. |
| PostgreSQL `::boolean`, `::integer`, `::text`, `::date`, `::jsonb`, `::numeric(p,s)` | Prefer typed parameters and explicit MariaDB `CAST(... AS SIGNED/CHAR/DATE/DECIMAL(p,s))`; booleans normally map to `TINYINT(1)`. | Do not mass-replace casts: MariaDB coercion rules differ, especially for booleans, invalid dates and strings. |
| `NOW() - n * INTERVAL '1 day'`, `NOW() + n * INTERVAL '1 second'`, fixed `INTERVAL '1 hour/day'` | `DATE_SUB(NOW(), INTERVAL n DAY)` / `DATE_ADD(...)`; fixed intervals can use native interval syntax. | Validate parameterized interval syntax in chosen driver/server. Clamp/validate numeric interval values in JS; do not concatenate arbitrary text. |
| `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` and date casts in `lib/financialSummary.js` | Prefer UTC `DATETIME` plus explicit application conversion, or `CONVERT_TZ` after confirming MariaDB timezone tables are loaded. | This affects cash-date grouping and financial totals near midnight. Build fixtures spanning UTC/local date boundaries and compare output exactly. |
| `EXTRACT(YEAR|MONTH FROM ...)`, numeric casts, `COALESCE`, `NULLIF`, `CASE`, `EXISTS`, aggregates | MariaDB equivalents generally exist; rewrite casts and ensure aliases/types. | Keep date predicates sargable where possible; verify null and decimal behavior. Include financial-summary parity checks. |
| `jsonb_object_agg(...)` | `JSON_OBJECTAGG(key, value)` or aggregate in application code. | Duplicate keys, NULL keys, ordering and JSON decoding differ; test empty result (`{}`) and duplicate unit keys. |
| `ANY($1::int[])` / PostgreSQL array parameters if present in remaining inventory | Expand to bound `IN (?,...)` values, or use a version-specific JSON table approach. | Empty arrays and large lists need explicit behavior and limits. Confirm every route; don’t assume broad `rg` matches such as IPv6 `::` indicate SQL casts. |
| `unnest($1::int[])` and `ANY(array)` in WhatsApp bulk-send paths (`server.js`) | Expand rows/filters in application code with parameterized multi-row `INSERT` and generated bound `IN` clauses, or use JSON_TABLE only after confirming supported MariaDB version. | Preserve input order where relevant, empty-list behavior, duplicate IDs, max batch size, and all-or-nothing transaction guarantees. |
| `pg_advisory_xact_lock($1, $2)` in `routes/securePayments.js` | Prefer an InnoDB coordination/unique-key row locked with `SELECT ... FOR UPDATE` inside the same transaction. | MariaDB `GET_LOCK` is connection-scoped rather than transaction-scoped, so it is not a drop-in equivalent. Concurrency/idempotency must be stress-tested with simultaneous duplicate submissions. |
| `pg_advisory_xact_lock(hashtext(...))` in startup/member synchronization and account lifecycle | Use explicit InnoDB lock rows keyed by a stable lock name, acquired in transaction, or redesign those operations as idempotent unique-key upserts. | PostgreSQL advisory key hashing is not portable and process-local mutexes fail across multiple workers. |
| `EXCLUDED.column` in PostgreSQL upsert | Use MariaDB `VALUES(column)` or the server-version-supported row alias syntax in `ON DUPLICATE KEY UPDATE`. | Confirm syntax for the deployed MariaDB version and preserve update predicates/timestamps. |
| `SELECT ... FOR UPDATE` | Supported with InnoDB transactions. | All reads/writes must use the same transaction connection. Verify indexes and isolation level to prevent broad/gap locks. |
| `FOR UPDATE SKIP LOCKED` (background queue code in `server.js`) | MariaDB syntax is available on InnoDB from 10.6; otherwise use another atomic claim strategy. | Confirm the exact ValueHost version before selecting this design. Test two workers for no double-claim and no starvation. |
| PostgreSQL catalogs, `::regclass`, `ADD COLUMN IF NOT EXISTS`, policy/function SQL in migrations | Replace with MariaDB information_schema checks and explicit migration bookkeeping; redesign row authorization in the application. | PostgreSQL RLS policies and functions do not translate automatically. MariaDB DDL transaction/locking behavior differs, so migrations must be restartable and tested on a disposable clone. |

## Concrete source hotspots

- `server.js`: PostgreSQL DDL (`SERIAL`, `JSONB`, `BYTEA`, `TIMESTAMPTZ`); numbered placeholders; `ON CONFLICT`; multiple `RETURNING`; event aggregate via `jsonb_object_agg`; queue locks; date/interval expressions.
- `routes/securePayments.js`: advisory transaction lock, nullable `IS NOT DISTINCT FROM`, `RETURNING`, and transaction-sensitive payment upsert behavior.
- `server.js`: array parameters (`unnest`, `ANY`) in WhatsApp bulk operations and PostgreSQL `EXCLUDED` upsert values.
- `lib/security.js`: rate-limit upsert with `ON CONFLICT`, interval arithmetic, and `RETURNING count`.
- `lib/financialSummary.js`: timezone conversion, PostgreSQL casts and financial date grouping.
- `lib/receipts.js`: `NULL::integer` in a `UNION ALL`; binary receipt retrieval.
- `routes/securePeople.js` and SQL migrations: boolean/integer casts, `::regclass`, `TIMESTAMPTZ`, conditional DDL and PostgreSQL-specific schema inspection.

## Migration gates

1. Obtain ValueHost MariaDB version, storage engine, SQL mode, charset/collation, timezone setup, `max_allowed_packet`, and driver/runtime details.
2. Compare the metadata baseline with all app migrations and the current production PostgreSQL schema. Generate DDL only from the verified result.
3. Build a distinct adapter and query layer; do not attempt regex-based SQL rewriting in `database.js`.
4. Run parity tests on synthetic records for authentication, role-scoped reads, payment approval transitions, notification transactions, receipts, reports, date boundaries, decimals, and queue concurrency.
5. Run load tests and compare query plans/index use on a disposable MariaDB database.
6. Keep production PostgreSQL unchanged until a separate approved cutover plan exists, with verified backup, rollback and reconciliation steps.
