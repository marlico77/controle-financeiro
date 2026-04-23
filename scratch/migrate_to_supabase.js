const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('ERRO: DATABASE_URL não encontrada no .env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('Atualizando esquema do Supabase...');
    try {
        await pool.query(`
            -- PEOPLE
            CREATE TABLE IF NOT EXISTS people (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cpf TEXT UNIQUE,
                unit TEXT,
                category TEXT,
                phone TEXT,
                address TEXT,
                birth_date TEXT,
                photo TEXT,
                responsible TEXT,
                status TEXT DEFAULT 'active'
            );

            -- USERS
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
                must_change_password BOOLEAN DEFAULT TRUE
            );

            -- PAYMENTS
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                payment_date DATE DEFAULT CURRENT_DATE,
                month INTEGER,
                year INTEGER,
                receipt_path TEXT,
                status TEXT DEFAULT 'pending',
                notes TEXT,
                payment_method TEXT,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- EVENTS
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                date DATE,
                location TEXT,
                price DECIMAL(10,2),
                status TEXT DEFAULT 'active'
            );

            -- EVENT PARTICIPANTS
            CREATE TABLE IF NOT EXISTS event_participants (
                id SERIAL PRIMARY KEY,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(event_id, person_id)
            );

            -- EVENT PAYMENTS
            CREATE TABLE IF NOT EXISTS event_payments (
                id SERIAL PRIMARY KEY,
                person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                month INTEGER,
                year INTEGER,
                receipt_path TEXT,
                status TEXT DEFAULT 'pending',
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- NOTIFICATIONS
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                is_read BOOLEAN DEFAULT FALSE,
                related_id INTEGER,
                related_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Tabelas atualizadas com sucesso!');
    } catch (err) {
        console.error('Erro na migração:', err);
    } finally {
        await pool.end();
    }
}

migrate();
