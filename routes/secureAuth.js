const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { HttpError, normalizeEmail, validPassword, tokenHash } = require('../lib/validation');
const { rateLimit } = require('../lib/security');
module.exports = function registerAuth(app, { db, bcrypt, secret, authenticateToken, sendResendEmail, logAction }) {
    const sign = (user, rememberMe = false) => jwt.sign({ id: user.id, sessionVersion: user.session_version }, secret, { algorithm: 'HS256', expiresIn: rememberMe ? '7d' : '24h' });
    app.post('/api/login', rateLimit(db, 'login', 10, 900), async (req, res, next) => {
        try {
            const { username, password, rememberMe } = req.body || {};
            if (typeof username !== 'string' || typeof password !== 'string' || username.length > 255 || Buffer.byteLength(password) > 72) throw new HttpError(400, 'Credenciais inválidas.');
            const user = (await db.query('SELECT u.*, p.name FROM users u LEFT JOIN people p ON p.id = u.person_id WHERE LOWER(u.username) = LOWER($1)', [username.trim()])).rows[0];
            if (user?.must_change_password && !user.activation_ready) throw new HttpError(401, 'Solicite à administração um convite ou uma senha temporária individual.');
            if (!user || !await bcrypt.compare(password, user.password_hash)) {
                await logAction(req, 'LOGIN_FAILED', { username }); throw new HttpError(401, 'Credenciais inválidas.');
            }
            await logAction(req, 'LOGIN_SUCCESS', { username: user.username, userId: user.id });
            res.json({ token: sign(user, !!rememberMe), role: user.role, username: user.username, name: user.name || user.username,
                personId: user.person_id, mustChangePassword: user.must_change_password, lgpdAccepted: user.lgpd_accepted, hasEmail: !!user.email, isMaster: user.is_master });
        } catch (err) { next(err); }
    });
    app.post('/api/auth/reset-lost-password', rateLimit(db, 'reset-cpf', 5, 900), (req, res) => {
        res.status(410).json({ error: 'Use a recuperação por e-mail verificado ou solicite à administração uma senha temporária individual.' });
    });
    app.post('/api/auth/forgot-password-email', rateLimit(db, 'forgot', 5, 900), async (req, res, next) => {
        try {
            const email = normalizeEmail(req.body?.email);
            const user = (await db.query('SELECT id, username FROM users WHERE LOWER(email) = $1 AND email_verified = TRUE', [email])).rows[0];
            if (user) {
                const token = crypto.randomBytes(32).toString('hex');
                await db.query("UPDATE users SET reset_password_token=$1, reset_password_expires=NOW() + INTERVAL '1 hour' WHERE id=$2", [tokenHash(token), user.id]);
                const link = `${process.env.APP_URL}/reset-password.html?token=${token}`;
                await sendResendEmail({ to: email, subject: 'Recuperação de senha — Tribo de Davi', html: `<p><a href="${link}">Redefina sua senha</a>. O link expira em uma hora.</p>` });
                await logAction(req, 'PASSWORD_RESET_REQUEST', { userId: user.id });
            }
            res.json({ success: true, message: 'Se houver uma conta com este e-mail verificado, enviaremos as instruções.' });
        } catch (err) { next(err); }
    });
    app.post('/api/auth/reset-password-email', rateLimit(db, 'reset-token', 10, 900), async (req, res, next) => {
        let client;
        try {
            const { token, newPassword } = req.body || {};
            if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !validPassword(newPassword)) throw new HttpError(400, 'Use uma senha com pelo menos 10 caracteres, letras e números (máximo de 72 bytes).');
            client = await db.pool.connect(); await client.query('BEGIN');
            const user = (await client.query('SELECT id, password_hash FROM users WHERE reset_password_token=$1 AND reset_password_expires>NOW() FOR UPDATE', [tokenHash(token)])).rows[0];
            if (!user) throw new HttpError(400, 'Token inválido ou expirado.');
            if (await bcrypt.compare(newPassword, user.password_hash)) throw new HttpError(400, 'Escolha uma senha diferente da anterior.');
            await client.query('UPDATE users SET password_hash=$1, reset_password_token=NULL, reset_password_expires=NULL, must_change_password=FALSE, activation_ready=TRUE, email_verified=(email IS NOT NULL), session_version=session_version+1 WHERE id=$2', [await bcrypt.hash(newPassword,12), user.id]);
            await client.query('COMMIT'); await logAction(req, 'PASSWORD_RESET', { userId:user.id }); res.json({ success:true });
        } catch (err) { if (client) await client.query('ROLLBACK'); next(err); }
        finally { client?.release(); }
    });
    app.post('/api/auth/change-password', authenticateToken, rateLimit(db, 'change-password', 10, 900), async (req, res, next) => {
        try {
            const { newPassword, currentPassword } = req.body || {};
            if (!validPassword(newPassword)) throw new HttpError(400, 'Use uma senha com pelo menos 10 caracteres, letras e números (máximo de 72 bytes).');
            const user = (await db.query('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
            if (!user.must_change_password && (typeof currentPassword !== 'string' || !await bcrypt.compare(currentPassword,user.password_hash))) throw new HttpError(400, 'Informe a senha atual.');
            const updated = (await db.query('UPDATE users SET password_hash=$1, must_change_password=FALSE, session_version=session_version+1, reset_password_token=NULL, reset_password_expires=NULL WHERE id=$2 RETURNING *', [await bcrypt.hash(newPassword,12), user.id])).rows[0];
            await logAction(req, 'PASSWORD_CHANGED'); res.json({ success:true, token:sign(updated) });
        } catch (err) { next(err); }
    });
};
