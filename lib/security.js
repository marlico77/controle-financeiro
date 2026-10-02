const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { tokenHash } = require('./validation');
const isStaff = user => ['admin', 'secretário'].includes(user?.role);
const canAccessPerson = async (db, user, personId) => {
    if (isStaff(user) || Number(user.personId) === Number(personId)) return true;
    if (user.role !== 'responsible' || !user.personId) return false;
    const result = await db.query('SELECT 1 FROM person_guardians WHERE child_person_id = $1 AND guardian_person_id = $2', [personId, user.personId]);
    return result.rowCount > 0;
};
const authenticate = (db, secret) => async (req, res, next) => {
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
    // Query tokens are supported only for authenticated file/media/SSE elements.
    const queryAllowed = req.method === 'GET' && /^\/api\/(files\/receipt\/|whatsapp\/(media\/|chat-sse$))/.test(req.path);
    const token = bearer?.[1] || (queryAllowed && req.query.token);
    if (!token) return res.status(401).json({ error: 'Token ausente' });
    let decoded;
    try { decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }); }
    catch { return res.status(401).json({ error: 'Sessão inválida' }); }
    try {
        const result = await db.query('SELECT id, username, role, person_id, session_version, must_change_password, is_master FROM users WHERE id = $1', [decoded.id]);
        const user = result.rows[0];
        if (!user || decoded.sessionVersion !== user.session_version) return res.status(401).json({ error: 'Sessão revogada. Entre novamente.' });
        req.user = { id: user.id, username: user.username, role: user.role, personId: user.person_id, isMaster: user.is_master, sessionVersion: user.session_version };
        const activationAllowed = ['/api/auth/status', '/api/auth/change-password', '/api/auth/lgpd-accept', '/api/user/email/request-verification', '/api/user/email/verify'];
        if (user.must_change_password && !activationAllowed.includes(req.path)) return res.status(403).json({ error: 'Alteração de senha obrigatória', mustChangePassword: true });
        next();
    } catch (err) { next(err); }
};
const rateLimit = (db, scope, limit, seconds) => async (req, res, next) => {
    try {
        const identity = `${req.ip}|${scope}`;
        const key = tokenHash(`${scope}|${identity}`);
        const result = await db.query(`INSERT INTO request_limits (key, count, expires_at) VALUES ($1, 1, NOW() + $2 * INTERVAL '1 second')
            ON CONFLICT (key) DO UPDATE SET count = CASE WHEN request_limits.expires_at <= NOW() THEN 1 ELSE request_limits.count + 1 END,
            expires_at = CASE WHEN request_limits.expires_at <= NOW() THEN NOW() + $2 * INTERVAL '1 second' ELSE request_limits.expires_at END RETURNING count`, [key, seconds]);
        if (result.rows[0].count > limit) { res.set('Retry-After', String(seconds)); return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }); }
        next();
    } catch (err) { next(err); }
};
const newAccountHash = async bcrypt => bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
module.exports = { isStaff, canAccessPerson, authenticate, rateLimit, newAccountHash };
