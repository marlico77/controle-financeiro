const crypto = require('node:crypto');
const { isStaff, canAccessPerson, newAccountHash } = require('../lib/security');
const { HttpError, positiveId, normalizeEmail, validPassword, dateOnly, tokenHash } = require('../lib/validation');
module.exports = function registerPeople(app, { db, bcrypt, authenticateToken, logAction, sendResendEmail, syncMemberUsers }) {
    const allowedRoles = ['admin', 'secretário', 'member', 'responsible', 'social_midia'];
    async function guardian(client, childId, guardianId) {
        await client.query('DELETE FROM person_guardians WHERE child_person_id = $1', [childId]);
        if (!guardianId) return;
        guardianId = positiveId(guardianId);
        if (guardianId === childId) throw new HttpError(400, 'O membro não pode ser seu próprio responsável.');
        const user = (await client.query("SELECT id FROM users WHERE person_id = $1 AND role = 'responsible'", [guardianId])).rows[0];
        if (!user) throw new HttpError(400, 'Selecione uma conta de responsável cadastrada.');
        await client.query('INSERT INTO person_guardians (child_person_id, guardian_person_id) VALUES ($1, $2)', [childId, guardianId]);
    }
    async function invite(userId, email) {
        if (!email) return;
        const token = crypto.randomBytes(32).toString('hex');
        await db.query("UPDATE users SET reset_password_token = $1, reset_password_expires = NOW() + INTERVAL '1 day' WHERE id = $2", [tokenHash(token), userId]);
        const link = `${process.env.APP_URL}/reset-password.html?token=${token}`;
        const result = await sendResendEmail({ to: email, subject: 'Ative seu acesso — Tribo de Davi', html: `<p>Seu acesso foi cadastrado. <a href="${link}">Defina sua senha</a>. O link expira em 24 horas.</p>` });
        return result.success;
    }
    app.get('/api/people', authenticateToken, async (req, res, next) => {
        try {
            const result = await db.query(`SELECT p.*, u.username, u.role, u.id AS u_id, u.email,
                (SELECT guardian_person_id FROM person_guardians WHERE child_person_id = p.id ORDER BY guardian_person_id LIMIT 1) AS responsible_id
                FROM people p LEFT JOIN users u ON u.person_id = p.id
                WHERE $1::boolean OR p.id = $2 OR ($3::boolean AND p.id IN (SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $2)) ORDER BY p.name`,
            [isStaff(req.user), req.user.personId, req.user.role === 'responsible']);
            res.json(result.rows);
        } catch (err) { next(err); }
    });
    app.post('/api/people', authenticateToken, async (req, res, next) => {
        let client;
        try {
            if (!isStaff(req.user)) throw new HttpError(403, 'Acesso negado.');
            const b = req.body || {};
            if (typeof b.name !== 'string' || b.name.trim().split(/\s+/).length < 2 || !b.unit) throw new HttpError(400, 'Informe nome, sobrenome e unidade.');
            const email = b.email ? normalizeEmail(b.email) : null;
            if (b.password && !validPassword(b.password)) throw new HttpError(400, 'Use pelo menos 10 caracteres com letras e números, até 72 bytes.');
            const parts = b.name.trim().split(/\s+/);
            const username = String(b.username || `${parts[0]}.${parts.at(-1)}.${crypto.randomBytes(3).toString('hex')}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const role = req.user.isMaster ? (b.role || 'member') : 'member';
            if (!allowedRoles.includes(role)) throw new HttpError(400, 'Papel inválido.');
            client = await db.pool.connect();
            await client.query('BEGIN');
            const personId = (await client.query('INSERT INTO people (name, responsible, birth_date, cpf, unit, phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
                [b.name.trim(), b.responsible || null, b.birth_date ? dateOnly(b.birth_date) : null, b.cpf || null, b.unit, b.phone || null])).rows[0].id;
            const userId = (await client.query('INSERT INTO users (username, password_hash, role, person_id, must_change_password, email, activation_ready) VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING id',
                [username, b.password ? await bcrypt.hash(b.password,12) : await newAccountHash(bcrypt), role, personId, email, !!b.password])).rows[0].id;
            await guardian(client, personId, b.responsible_id);
            await client.query('COMMIT');
            await logAction(req, 'CREATE_PERSON', { id: personId, username, role });
            let invitationSent = false;
            try { invitationSent = !!await invite(userId, email); } catch { /* Account remains available for an administrator to issue activation. */ }
            res.json({ id: personId, username, invitationSent, message: invitationSent ? 'Cadastro criado e convite enviado.' : 'Cadastro criado. Defina uma senha temporária individual ou envie convite por e-mail.' });
        } catch (err) { if (client) await client.query('ROLLBACK'); next(err); }
        finally { client?.release(); }
    });
    app.put('/api/people/:id', authenticateToken, async (req, res, next) => {
        let client;
        try {
            const id = positiveId(req.params.id), b = req.body || {};
            if (!await canAccessPerson(db, req.user, id)) throw new HttpError(403, 'Acesso negado.');
            if (typeof b.name !== 'string' || !b.name.trim()) throw new HttpError(400, 'Nome obrigatório.');
            client = await db.pool.connect();
            await client.query('BEGIN');
            const current = (await client.query('SELECT * FROM people WHERE id = $1 FOR UPDATE', [id])).rows[0];
            const account = (await client.query('SELECT * FROM users WHERE person_id = $1 FOR UPDATE', [id])).rows[0];
            if (!current) throw new HttpError(404, 'Membro não encontrado.');
            if (account?.is_master && !req.user.isMaster) throw new HttpError(403, 'Apenas o administrador principal pode editar esta conta.');
            const editable = ['name', 'birth_date', 'cpf', 'phone', ...(isStaff(req.user) ? ['unit', 'responsible'] : [])];
            const merged = { ...current };
            for (const field of editable) if (Object.hasOwn(b, field)) merged[field] = b[field] || null;
            if (merged.birth_date) dateOnly(merged.birth_date);
            await client.query('UPDATE people SET name=$1, responsible=$2, birth_date=$3, cpf=$4, unit=$5, phone=$6 WHERE id=$7',
                [merged.name, merged.responsible, merged.birth_date, merged.cpf, merged.unit, merged.phone, id]);
            if (isStaff(req.user) && Object.hasOwn(b, 'responsible_id')) await guardian(client, id, b.responsible_id);
            if (req.user.role === 'admin' && account && b.username) {
                const role = req.user.isMaster && b.role ? b.role : account.role;
                if (!allowedRoles.includes(role)) throw new HttpError(400, 'Papel inválido.');
                if (b.password && !validPassword(b.password)) throw new HttpError(400, 'Use de 10 a 72 bytes, com letras e números.');
                const username = String(b.username).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const email = Object.hasOwn(b, 'email') ? (b.email ? normalizeEmail(b.email) : null) : account.email;
                await client.query(`UPDATE users SET username=$1, role=$2, email=$3,
                    password_hash=$4, session_version=session_version + CASE WHEN role IS DISTINCT FROM $2 OR username IS DISTINCT FROM $1 OR password_hash IS DISTINCT FROM $4 THEN 1 ELSE 0 END,
                    must_change_password=CASE WHEN $5 THEN TRUE ELSE must_change_password END,
                    activation_ready=CASE WHEN $5 THEN TRUE ELSE activation_ready END,
                    email_verified=CASE WHEN email IS DISTINCT FROM $3 THEN FALSE ELSE email_verified END WHERE id=$6`,
                    [username, role, email, b.password ? await bcrypt.hash(b.password, 12) : account.password_hash, !!b.password, account.id]);
            }
            if (b.responsiblePassword) throw new HttpError(400, 'Altere a senha na conta do responsável cadastrado, selecionando seu registro.');
            await client.query('COMMIT');
            await logAction(req, 'UPDATE_PERSON', { id, fields: editable.filter(f => Object.hasOwn(b, f)) });
            res.json({ success: true });
        } catch (err) { if (client) await client.query('ROLLBACK'); next(err); }
        finally { client?.release(); }
    });
};
