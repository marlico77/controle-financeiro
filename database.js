const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE_URL || 
               (process.env.NODE_ENV === 'production' 
                ? '/data/database.sqlite' 
                : path.join(__dirname, 'database.sqlite'));

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- 'admin' or 'member'
    person_id INTEGER, -- Links to people table if role is 'member'
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    responsible TEXT,
    birth_date TEXT,
    cpf TEXT,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    month INTEGER NOT NULL, -- 1 to 12
    year INTEGER NOT NULL,
    amount REAL NOT NULL,
    receipt_path TEXT,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
  );
`);

// Migration: Add unit if not exists
const tableInfo = db.prepare("PRAGMA table_info(people)").all();
const unitExists = tableInfo.some(col => col.name === 'unit');
if (!unitExists) {
  db.exec("ALTER TABLE people ADD COLUMN unit TEXT");
}

// Migration: Add role and person_id to users if not exists
const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
if (!userTableInfo.some(col => col.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'");
}
if (!userTableInfo.some(col => col.name === 'person_id')) {
  db.exec("ALTER TABLE users ADD COLUMN person_id INTEGER");
}


// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('admin123', salt);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('Default admin created: admin / admin123');
} else {
  // Ensure existing admin has the admin role
  db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'").run();
}

module.exports = db;
