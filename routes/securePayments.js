const { HttpError, positiveId, paymentBatch, moneyCents, moneyString, monthNumber, yearNumber } = require('../lib/validation');
const { canAccessPerson, isStaff } = require('../lib/security');
const { storeReceipt } = require('../lib/receipts');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
module.exports = function registerPayments(app, deps) {
    const { db, sharp, supabase, authenticateToken, blockSabbathUploads, upload, logAction, createNotification, sendResendEmail } = deps;
    async function persist(req, table, event, batch, receipt) {
        const client = await db.pool.connect();
        const results = [];
        let personName;
        try {
            await client.query('BEGIN');
            // Serializes writes for this person's period, including the first insertion.
            await client.query('SELECT pg_advisory_xact_lock($1, $2)', [batch.personId, event?.id || 0]);
            personName = (await client.query('SELECT name FROM people WHERE id = $1', [batch.personId])).rows[0]?.name || req.user.username;
            for (let i = 0; i < batch.months.length; i++) {
                const month = batch.months[i];
                const parameters = event ? [batch.personId, event.id, month, batch.year] : [batch.personId, month, batch.year];
                const where = event ? 'person_id = $1 AND event_id = $2 AND month IS NOT DISTINCT FROM $3::integer AND year IS NOT DISTINCT FROM $4::integer' : 'person_id = $1 AND month = $2 AND year = $3';
                const current = (await client.query(`SELECT id, status FROM ${table} WHERE ${where} FOR UPDATE`, parameters)).rows[0];
                if (current?.status === 'approved' && req.user.role !== 'admin') throw new HttpError(409, 'Pagamento aprovado só pode ser ajustado pela administração.');
                if (current?.status === 'pending' && req.user.role === 'admin') throw new HttpError(409, 'Use a aprovação do pagamento pendente para registrar a decisão.');
                const status = req.user.role === 'admin' ? 'approved' : 'pending';
                let id;
                if (current) {
                    id = current.id;
                    // A new cloud receipt must clear any old database binary.
                    await client.query(`UPDATE ${table} SET amount = $1, status = $2,
                        receipt_path = COALESCE($3, receipt_path), receipt_content = CASE WHEN $3::text IS NULL THEN receipt_content ELSE $4 END,
                        receipt_mime = COALESCE($5, receipt_mime), submitted_by_user_id = $6,
                        rejection_reason = NULL, updated_at = NOW() WHERE id = $7`,
                    [batch.amounts[i], status, receipt.path, receipt.content, receipt.mime, req.user.id, id]);
                } else {
                    const sql = event ? `INSERT INTO event_payments (person_id, event_id, month, year, amount, status, receipt_path, receipt_content, receipt_mime, submitted_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id` :
                        `INSERT INTO payments (person_id, month, year, amount, status, receipt_path, receipt_content, receipt_mime, submitted_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`;
                    id = (await client.query(sql, [...parameters, batch.amounts[i], status, receipt.path, receipt.content, receipt.mime, req.user.id])).rows[0].id;
                }
                results.push({ id, updated: !!current });
            }
            await client.query('COMMIT');
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
        try { await logAction(req, 'SAVE_PAYMENT', { source: table, person_id: batch.personId, event_id: event?.id, months: batch.months, year: batch.year, amounts: batch.amounts, ids: results.map(r => r.id) }); }
        catch (err) { console.error('[AUDIT] Pagamento salvo; falha ao registrar auditoria:', err); }
        // Delivery is a secondary effect: a notification failure must not report a committed payment as failed.
        if (req.user.role !== 'admin') {
            try {
                const admins = await db.query("SELECT id, email FROM users WHERE role = 'admin'");
                const title = event ? 'Comprovante de Evento Pendente' : 'Comprovante de Mensalidade Pendente';
                const reference = event ? `evento ${event.name}` : `mensalidade de ${batch.months.join(', ')}/${batch.year}`;
                const amount = batch.amounts.reduce((sum, value) => sum + moneyCents(value), 0);
                const formattedAmount = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const submitterName = req.user.username || personName;
                const message = `${submitterName} anexou um comprovante de ${reference} para ${personName} no valor de ${formattedAmount}, aguardando aprovação.`;
                const subject = event ? '[Tribo de Davi] Comprovante de evento para aprovação' : '[Tribo de Davi] Comprovante de mensalidade para aprovação';
                const loginUrl = new URL('/login.html', process.env.APP_URL || 'https://tribodedavi.net.br').href;
                const html = `<p><strong>${escapeHtml(submitterName)}</strong> anexou um comprovante de ${escapeHtml(reference)} para <strong>${escapeHtml(personName)}</strong> no valor de <strong>${escapeHtml(formattedAmount)}</strong>.</p><p>O pagamento aguarda sua aprovação.</p><p><a href="${escapeHtml(loginUrl)}">Acessar o sistema</a></p>`;
                for (const admin of admins.rows) {
                    try {
                        await createNotification(admin.id, title, message, 'info', results[0].id, event ? 'event' : 'monthly');
                    } catch (err) { console.error(`[NOTIFICATION] Falha para o usuário ${admin.id}:`, err); }
                    if (admin.email && sendResendEmail) {
                        try {
                            const delivery = await sendResendEmail({ to: admin.email, subject, html });
                            if (!delivery?.success) console.error(`[EMAIL] Falha no aviso de pagamento para o usuário ${admin.id}:`, delivery?.error || 'Resposta sem confirmação de envio.');
                        } catch (err) { console.error(`[EMAIL] Falha no aviso de pagamento para o usuário ${admin.id}:`, err); }
                    }
                }
            } catch (err) { console.error('[NOTIFICATION] Pagamento salvo; aviso pendente:', err.message); }
        }
        return { results, status: req.user.role === 'admin' ? 'approved' : 'pending' };
    }
    app.post('/api/payments', authenticateToken, blockSabbathUploads, upload.single('receipt'), async (req, res, next) => {
        try {
            const batch = paymentBatch(req.body || {});
            if (!await canAccessPerson(db, req.user, batch.personId)) throw new HttpError(403, 'Pagamento não autorizado para este membro.');
            if (!isStaff(req.user) && !req.file) throw new HttpError(400, 'Envie um comprovante para conferência.');
            const receipt = await storeReceipt(req.file, sharp, supabase);
            res.json(await persist(req, 'payments', null, batch, receipt));
        } catch (err) { next(err); }
    });
    app.post('/api/event-payments', authenticateToken, blockSabbathUploads, upload.single('receipt'), async (req, res, next) => {
        try {
            const body = req.body || {};
            const personId = positiveId(body.person_id || req.user.personId);
            const eventId = positiveId(body.event_id);
            if (!await canAccessPerson(db, req.user, personId)) throw new HttpError(403, 'Pagamento não autorizado para este membro.');
            const result = await db.query('SELECT e.* FROM events e JOIN event_participants ep ON ep.event_id = e.id WHERE e.id = $1 AND ep.person_id = $2', [eventId, personId]);
            const event = result.rows[0];
            if (!event) throw new HttpError(400, 'Membro não inscrito neste evento.');
            const single = event.payment_type === 'unico';
            if (single && (body.month || body.year)) throw new HttpError(400, 'Pagamento único não deve informar mês ou ano.');
            const batch = { personId, year: single ? null : yearNumber(body.year), months: [single ? null : monthNumber(body.month)], amounts: [moneyString(moneyCents(body.amount))] };
            if (!isStaff(req.user) && !req.file) throw new HttpError(400, 'Envie um comprovante para conferência.');
            const receipt = await storeReceipt(req.file, sharp, supabase);
            const saved = await persist(req, 'event_payments', event, batch, receipt);
            res.json({ ...saved, id: saved.results[0].id });
        } catch (err) {
            if (err.code === '23503' && err.constraint === 'event_payments_participant_fk') {
                return next(new HttpError(409, 'A inscrição neste evento mudou. Atualize a página e confira os participantes.'));
            }
            next(err);
        }
    });
};
