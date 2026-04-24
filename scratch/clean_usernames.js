const db = require('../database');

async function cleanUsernames() {
    try {
        const res = await db.query('SELECT id, username FROM users');
        console.log(`Verificando ${res.rows.length} usuários...`);
        
        for (const user of res.rows) {
            const normalized = user.username.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            if (normalized !== user.username) {
                console.log(`Atualizando: ${user.username} -> ${normalized}`);
                await db.query('UPDATE users SET username = $1 WHERE id = $2', [normalized, user.id]);
            }
        }
        console.log('Limpeza de usuários concluída!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

cleanUsernames();
