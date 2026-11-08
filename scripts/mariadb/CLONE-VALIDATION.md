# MariaDB test clone validation

## Imported target

The clone was imported into the isolated ValueHost test database `trib0156_tribo_migracao_teste` on MariaDB 10.11.19. The live application still uses PostgreSQL; this work did not point the app at MariaDB or change production data.

The read-only PostgreSQL snapshot contained 27 public tables, 234 columns, 55 constraints, 50 indexes, 18 sequences, and 48 RLS policies across those tables. It had no views, triggers, or functions. PostgreSQL extensions were not installed on MariaDB.

## Verified results

- All 27 tables and 1,597 rows were imported. An aggregate query reported 27 tables and 1,597 total rows. Each of the 25 per-table counts visible in phpMyAdmin matched the snapshot manifest; the compact summary covered all 27.
- All seven populated financial groups matched PostgreSQL and the JSONL snapshot by row count and integer cents: payments for 2026 (approved and pending), event payments for NULL/2026/2027 (approved) and 2027 (pending), and 2026 outflows. Sales was empty in both databases.
- Receipt blobs matched byte count and SHA-256 multiset: `payments` 28 receipts / 2,165,283 bytes; `event_payments` 27 / 1,633,925 bytes; `outflows` and `sales` had none. The clone multiset hashes matched the source snapshot for all four tables.
- All 19 foreign-key relationships had zero orphan rows in the source snapshot. Data was replayed in parent-before-child order.
- The source snapshot's serialized receipt BLOBs were independently checked against `validation-source.json`: per-object hashes and byte lengths matched before import.

## Preserved legacy CHECK behavior

The PostgreSQL `event_payments_positive` constraint is marked `NOT VALID`, and two of 107 existing `event_payments` rows violate it. `payments_positive` has zero violations; the other two CHECK constraints also have zero. MariaDB validates CHECK constraints on historical rows when inserting, so the import turned `check_constraint_checks` off for that import session only, then turned it back on immediately after commit. The constraints remain defined and future inserts/updates are checked. No rows were changed to make them pass.

## Conversion limits before any runtime adapter

- `NUMERIC` has no declared precision in PostgreSQL. The schema generator maps it to `DECIMAL(65,30)`; observed snapshot values fit (maximum five integer digits and scale two). New values outside that range need explicit validation.
- PostgreSQL `TEXT` participating in a MariaDB index is represented as `VARCHAR(512)`. Snapshot maxima were below 44 characters (`people.name` 43; other indexed text fields 33 or fewer), so no imported values were truncated. A future runtime adapter must validate this bound or redesign the index before accepting longer values.
- PostgreSQL `TIMESTAMPTZ` maps to UTC `DATETIME(6)`. The application adapter must set UTC consistently and preserve local cash-date conversions. `TIMESTAMP WITHOUT TIME ZONE` is kept as a wall-clock value.
- PostgreSQL `JSONB` maps to MariaDB `JSON` (validated text storage). Object representation, comparison and indexing do not have PostgreSQL JSONB semantics. The unique subscription key uses a generated SHA-256 column to avoid indexing a JSON document directly.
- Partial/expression indexes were represented with generated columns or MariaDB nullable unique-key semantics. The username/email normalization expressions must still be tested for Unicode and collation parity.
- PostgreSQL UUID defaults (`gen_random_uuid()`) were not translated into MariaDB defaults. The future adapter must generate UUIDs in application code or define and test a MariaDB-specific default.
- `BYTEA` values are `LONGBLOB` and their inline content was verified. Separately exported file-storage objects (172 files, 6,420,093 bytes) have not been copied to the ValueHost test filesystem.
- PostgreSQL RLS has 48 policies on 27 tables. MariaDB has no equivalent RLS in this migration. These policies must be replaced with tested application authorization before a MariaDB runtime cutover.
- No backend adapter or query rewrite is included. Placeholder conversion, locking/idempotency, JSON aggregation, date/time behavior, UUID creation, and access-control parity remain future work.

## Reproduction artifacts

The generator and read-only snapshot checker are in this directory. `schema.sql`, `data.sql`, `reset-data.sql`, `repair.sql`, `validate.sql`, `validate-summary.sql`, `validate-binary-summary.sql`, and JSONL exports live under ignored `scratch/` directories and were not committed. Only use reset/import scripts against the dedicated test database.
