require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { migrate } = require('../lib/migrations');
const { validPassword, normalizeEmail } = require('../lib/validation');
async function main() {
    const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!validPassword(password)) throw new Error('Configure BOOTSTRAP_ADMIN_PASSWORD com senha individual de 10 a 72 bytes, letras e números.');
    await migrate(db);
    const client=await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('bootstrap-admin'))");
        const masters = await client.query('SELECT id FROM users WHERE is_master=TRUE FOR UPDATE');
        if (process.argv.includes('--reset-primary')) {
            if (masters.rowCount !== 1) throw new Error('Recuperação local exige exatamente um administrador principal. Revise as contas no banco.');
            await client.query('UPDATE users SET password_hash=$1, session_version=session_version+1, must_change_password=TRUE, activation_ready=TRUE, reset_password_token=NULL, reset_password_expires=NULL WHERE id=$2', [await bcrypt.hash(password,12),masters.rows[0].id]);
            await client.query('COMMIT');
            console.log('Senha temporária do administrador principal redefinida e sessões revogadas. Remova BOOTSTRAP_ADMIN_PASSWORD do ambiente.');
            return;
        }
        if (masters.rowCount) throw new Error('Já existe administrador principal. Use recuperação verificada ou o procedimento local --reset-primary.');
        const email=process.env.BOOTSTRAP_ADMIN_EMAIL ? normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL) : null;
        await client.query("INSERT INTO users (username,password_hash,role,is_master,must_change_password,activation_ready,email) VALUES ($1,$2,'admin',TRUE,TRUE,TRUE,$3)",
            [process.env.BOOTSTRAP_ADMIN_USERNAME || 'administrador',await bcrypt.hash(password,12),email]);
        await client.query('COMMIT'); console.log('Administrador principal criado. Remova BOOTSTRAP_ADMIN_PASSWORD do ambiente após o uso.');
    } catch(err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
}
main().catch(err=>{console.error(err.message);process.exitCode=1;}).finally(()=>db.pool.end());
