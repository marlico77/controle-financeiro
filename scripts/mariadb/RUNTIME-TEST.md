# MariaDB runtime test mode

This branch adds an isolated runtime experiment. It does not change the PostgreSQL runtime unless `APP_ENV=test` is set.

## Guarded startup

Configure `server-test.js` as the test app entry point and set:

```text
APP_ENV=test
APP_URL=https://teste.tribodedavi.net.br
JWT_SECRET=<new test-only value, at least 32 characters>
MARIADB_TEST_HOST=localhost
MARIADB_TEST_DATABASE=trib0156_tribo_migracao_teste
MARIADB_TEST_USER=<test database user>
MARIADB_TEST_PASSWORD=<test database password>
```

The MariaDB adapter refuses a remote host or any database name other than the isolated test database. Startup verifies `SELECT DATABASE()` before opening the HTTP listener. It skips PostgreSQL migrations, startup data repair, scheduled tasks, and queue workers. Email, Web Push, and WhatsApp calls are suppressed/blocked. The Supabase Storage client is replaced by an upload-disabled stub; existing receipt BLOBs in MariaDB remain readable. This mode must not be given production provider credentials.

## Compatibility implemented

- Parameterized `$n` bindings, including repeated parameters and the simple `column = ANY($n::type[])` shape.
- A narrow set of explicitly allowlisted `ON CONFLICT` operations; unsupported table/target combinations fail closed.
- `RETURNING` by generated integer `id` for inserts, updates and deletes; special `request_limits ... RETURNING count` and allowlisted string-key idempotency inserts.
- MariaDB transactions and connection locks that remain held until transaction commit/rollback.
- Login/rate-limit, financial payment/event routes, receipt content stored in database columns and admin financial summary are intended for staged smoke testing. Financial timestamps are grouped in Node using `America/Sao_Paulo`, avoiding dependence on MariaDB timezone tables.

## Not verified yet / intentionally unsupported

The adapter has unit tests but has not yet been exercised against the hosted MariaDB application runtime. Do not treat this as endpoint parity or production-ready migration until the deployed stage passes login, read-only dashboard, pending payment submission, admin approval, receipt preview, and rollback/concurrency smoke tests.

SQL the adapter does not explicitly understand is rejected. This includes broad PostgreSQL features such as `unnest`, timezone SQL expressions, arbitrary `ILIKE`, unrecognized `RETURNING`, and conflict targets outside the allowlist. Consequently, integrations such as push subscription upserts, WhatsApp UI/proxies, scheduled jobs, and other PostgreSQL-specific reports may return errors or are deliberately disabled in test mode. PostgreSQL row-level security policies are not present in MariaDB; endpoint authorization must be verified at the application layer. Receipt objects not stored as BLOBs in the database need a separate local test-storage installation before those legacy receipts can be previewed.

Tests run locally: `npm test`. A successful local suite validates compiler/normalization contracts and existing application tests, but it does not prove connectivity, SQL parity, or Passenger/LiteSpeed behavior on ValueHost.
