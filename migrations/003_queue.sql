CREATE TABLE IF NOT EXISTS scheduled_reminders (
 id SERIAL PRIMARY KEY, message TEXT NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, target_type VARCHAR(50) NOT NULL,
 target_value TEXT, status VARCHAR(20) DEFAULT 'pending', error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS whatsapp_queue (
 id SERIAL PRIMARY KEY, phone VARCHAR(50) NOT NULL, message TEXT NOT NULL, status VARCHAR(20) DEFAULT 'pending',
 error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), sent_at TIMESTAMPTZ
);
ALTER TABLE scheduled_reminders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_queue ADD COLUMN IF NOT EXISTS reminder_id INTEGER REFERENCES scheduled_reminders(id);
CREATE UNIQUE INDEX IF NOT EXISTS reminder_contact_unique ON whatsapp_queue(reminder_id, phone) WHERE reminder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_user_unique ON push_subscriptions(user_id, subscription_data);
