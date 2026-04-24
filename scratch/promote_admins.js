const db = require('../database');
async function run() {
    try {
        await db.query("UPDATE users SET role = 'admin' WHERE username IN ('marlon.souza', 'arthur.nascimento')");
        console.log('Marlon and Arthur promoted to Admin');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
