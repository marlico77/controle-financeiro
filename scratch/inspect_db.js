const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const people = db.prepare('SELECT id, name FROM people LIMIT 5').all();
const users = db.prepare("SELECT username, role, person_id FROM users WHERE role = 'member' LIMIT 5").all();
console.log('PEOPLE:', JSON.stringify(people, null, 2));
console.log('USERS:', JSON.stringify(users, null, 2));
db.close();
