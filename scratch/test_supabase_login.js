const db = require('../database');
const bcrypt = require('bcryptjs');

async function test() {
    try {
        const res = await db.query("SELECT * FROM users WHERE username = 'admin'");
        console.log('Admin found:', res.rows.length > 0);
        if (res.rows[0]) {
            console.log('Role:', res.rows[0].role);
            // test password (admin@2026)
            const match = bcrypt.compareSync('admin@2026', res.rows[0].password_hash);
            console.log('Password Match (admin@2026):', match);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
