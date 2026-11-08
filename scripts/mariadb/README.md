# MariaDB migration spike — isolated test branch

This directory is a migration workbench, not production configuration. The current application remains PostgreSQL-only; this phase does not switch the runtime database. The current clone is a user-authorized test copy of the production snapshot, loaded only into the dedicated ValueHost database `trib0156_tribo_migracao_teste`.

## Safety boundaries

- Work only in branch `migration/mariadb-test` and its dedicated Git worktree.
- The production database is Supabase PostgreSQL. Do not run MariaDB DDL or import jobs against it.
- Production records and receipts may be used only in the specifically authorized isolated clone. All generated SQL/snapshot files remain under ignored `scratch/` and must never be committed or imported into the live ValueHost database.
- Keep ValueHost test DB credentials in local ignored environment variables. Never add `.env`, dumps, or credentials here.
- Do not edit the main `server.js`/`database.js` paths in this phase. Record incompatibilities here and in the mapping report.

## Phases

1. Capture a read-only schema baseline from PostgreSQL (`schema-baseline.sql`).
2. Produce MariaDB DDL from the verified schema, including explicit type, index, FK and uniqueness mapping.
3. Add a separate adapter prototype and synthetic contract tests; no production switch.
4. Compare query results and authorization behavior across both engines.
5. Only after acceptance, plan a separate runtime cutover with backup and rollback steps.

## SQL inventory

See [QUERY-MAPPING.md](QUERY-MAPPING.md). It records PostgreSQL-specific syntax found in the backend and the required MariaDB treatment. Any query rewrite needs focused parity tests; automatic string substitution is not an acceptable migration strategy.

## Clone scripts and evidence

- `build-clone-sql.js` converts the read-only Supabase JSONL export into `schema.sql`, `data.sql`, and validation SQL under ignored `scratch/mariadb-test/`. Override the source with `MIGRATION_SOURCE_DIR` if needed.
- `check-snapshot-integrity.js` checks the export manifest counts, all foreign-key orphans, check-constraint violations, bytea hashes/sizes, indexed text widths, and observed numeric precision without printing row contents.
- `CLONE-VALIDATION.md` records the imported test snapshot, parity checks and known conversion limits. Generated SQL and snapshot files are intentionally ignored by Git.

The schema/data import has completed in the isolated database and matched all table counts, financial aggregates and receipt-byte hashes. It is a data/schema clone only; no MariaDB application adapter, endpoint parity test or production cutover is included.
