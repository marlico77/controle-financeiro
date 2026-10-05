CREATE TABLE IF NOT EXISTS people (
 id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, responsible VARCHAR(255), birth_date DATE,
 cpf VARCHAR(20), unit VARCHAR(100), phone VARCHAR(50), uniform_orders TEXT
);
CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 role VARCHAR(30) NOT NULL DEFAULT 'member', person_id INTEGER REFERENCES people(id),
 must_change_password BOOLEAN NOT NULL DEFAULT TRUE, lgpd_accepted BOOLEAN DEFAULT FALSE,
 lgpd_accepted_at TIMESTAMP, email VARCHAR(255), pending_email VARCHAR(255),
 email_verification_code VARCHAR(64), email_verification_expires TIMESTAMP,
 reset_password_token VARCHAR(255), reset_password_expires TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
 id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, date DATE, end_date DATE,
 payment_type VARCHAR(20) NOT NULL DEFAULT 'parcelado'
);
CREATE TABLE IF NOT EXISTS event_participants (
 event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 person_id INTEGER NOT NULL REFERENCES people(id), PRIMARY KEY (event_id, person_id)
);
CREATE TABLE IF NOT EXISTS payments (
 id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), month INTEGER NOT NULL,
 year INTEGER NOT NULL, amount NUMERIC(10,2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
 receipt_path VARCHAR(255), receipt_content BYTEA, receipt_mime VARCHAR(100), rejection_reason TEXT,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS event_payments (
 id SERIAL PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 person_id INTEGER NOT NULL REFERENCES people(id), month INTEGER, year INTEGER,
 amount NUMERIC(10,2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
 receipt_path VARCHAR(255), receipt_content BYTEA, receipt_mime VARCHAR(100), rejection_reason TEXT,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
 id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL,
 type VARCHAR(50) DEFAULT 'info', related_id INTEGER, related_type VARCHAR(30),
 is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), subscription_data TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS system_logs (
 id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT, action TEXT NOT NULL, details TEXT,
 ip_address TEXT, user_agent TEXT, device_type TEXT, os TEXT, browser TEXT,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS plannings (
 id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS planning_activities (
 id SERIAL PRIMARY KEY, planning_id INTEGER NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
 date DATE NOT NULL, time TIME NOT NULL, description TEXT NOT NULL, responsible TEXT
);
CREATE TABLE IF NOT EXISTS planning_menus (
 id SERIAL PRIMARY KEY, planning_id INTEGER NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
 date DATE NOT NULL, meal TEXT NOT NULL, description TEXT NOT NULL
);
