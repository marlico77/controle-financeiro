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

## Hosted verification (2026-11-08)

- `https://teste.tribodedavi.net.br/login.html` returns HTTP 200 and has `noindex`.
- `/api/time`, `/api/auth/status`, `/api/payments`, `/api/event-payments`, `/api/events`, `/api/financial-summary` returned HTTP 200 for test JWTs signed from cloned active users. The 2026 summary matched the PostgreSQL source exactly, including all 12 monthly amounts.
- Non-admin financial summary and unpaid lists returned 403; member payments returned no foreign rows. Both inline BLOB and copied file-storage receipt downloads returned 200. Invalid login returned 401.
- The isolated MariaDB target has 27 tables and 1,595 rows in the refreshed read-only source snapshot. This count is a point-in-time value and can change while production is active.
- The local suite passed 72 tests.

## Not verified yet / intentionally unsupported

This is not full endpoint parity or production-ready migration. Actual credential login, pending payment submission, admin approval, rollback/concurrency and interactive browser flows still need end-to-end tests on the staging origin. Synthetic JWT smoke tests establish only the listed read and authorization behavior.

SQL the adapter does not explicitly understand is rejected. This includes broad PostgreSQL features such as `unnest`, timezone SQL expressions, arbitrary `ILIKE`, unrecognized `RETURNING`, and conflict targets outside the allowlist. Consequently, integrations such as push subscription upserts, WhatsApp UI/proxies, scheduled jobs, and other PostgreSQL-specific reports may return errors or are deliberately disabled in test mode. PostgreSQL row-level security policies are not present in MariaDB; endpoint authorization must be verified at the application layer. The 172 exported file-storage objects were installed in a private staging directory; two receipt download paths were verified.

Tests run locally: `npm test`. The hosted smoke checks above establish basic connectivity and selected SQL parity, but not full route coverage or all Passenger/LiteSpeed behavior.
