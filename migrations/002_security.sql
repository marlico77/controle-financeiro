ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
UPDATE users SET activation_ready=TRUE WHERE must_change_password=FALSE;
ALTER TABLE users ALTER COLUMN email_verification_code TYPE VARCHAR(64);
UPDATE users SET is_master = TRUE WHERE UPPER(username) = 'ADMINISTRADOR';
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS person_guardians (
 child_person_id INTEGER NOT NULL REFERENCES people(id), guardian_person_id INTEGER NOT NULL REFERENCES people(id),
 PRIMARY KEY (child_person_id, guardian_person_id), CHECK (child_person_id <> guardian_person_id)
);
-- Existing name-based links must be explicitly reviewed and assigned by an administrator.
CREATE TABLE IF NOT EXISTS notification_reads (
 notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id), read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (notification_id, user_id)
);
CREATE TABLE IF NOT EXISTS request_limits (key VARCHAR(64) PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS reminder_runs (run_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS users_person_unique ON users(person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users(LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS payments_period_unique ON payments(person_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS event_participant_unique ON event_participants(event_id, person_id);
CREATE UNIQUE INDEX IF NOT EXISTS event_payments_period_unique ON event_payments(event_id, person_id, year, month) WHERE month IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_payments_single_unique ON event_payments(event_id, person_id) WHERE month IS NULL;
-- NOT VALID preserves legacy rows for review, while enforcing checks on new writes.
ALTER TABLE payments ADD CONSTRAINT payments_positive CHECK (amount > 0 AND month BETWEEN 1 AND 12 AND year BETWEEN 2000 AND 2100) NOT VALID;
ALTER TABLE event_payments ADD CONSTRAINT event_payments_positive CHECK (amount > 0 AND (month IS NULL OR month BETWEEN 1 AND 12)) NOT VALID;
