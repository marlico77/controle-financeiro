const crypto = require('crypto');
const { getEmailVerificationHtml } = require('../utils/emailTemplates');

module.exports = function(app, db, sendResendEmail, logAction, authenticateToken) {
    // Solicita verificação de e-mail (envia código)
    app.post('/api/user/email/request-verification', authenticateToken, async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });
        
        try {
            // Verifica se outro usuário já usa esse e-mail (verificado)
            const existing = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
            if (existing.rows.length > 0) return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta' });
            
            // Gera código: alternando número e letra, ex: 1B4C9Z
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const numbers = '0123456789';
            let codeArr = [];
            for(let i=0; i<3; i++) {
                codeArr.push(numbers.charAt(Math.floor(Math.random() * numbers.length)));
                codeArr.push(letters.charAt(Math.floor(Math.random() * letters.length)));
            }
            const code = codeArr.join('');
            
            await db.query('UPDATE users SET pending_email = $1, email_verification_code = $2, email_verification_expires = NOW() + INTERVAL \'15 minutes\' WHERE id = $3', [email, code, req.user.id]);
            
            const result = await db.query('SELECT u.username, p.name FROM users u LEFT JOIN people p ON u.person_id = p.id WHERE u.id = $1', [req.user.id]);
            const user = result.rows[0];

            sendResendEmail({
                to: email,
                subject: '[Tribo de Davi] Código de Verificação',
                html: getEmailVerificationHtml(user.name || user.username, code)
            }).catch(e => console.error('[EMAIL] Erro ao enviar verificação:', e));
            
            res.json({ success: true, message: 'Código enviado' });
        } catch (err) {
            console.error('Erro na solicitação de verificação:', err);
            res.status(500).json({ error: 'Erro ao solicitar verificação' });
        }
    });

    // Valida código e salva e-mail
    app.post('/api/user/email/verify', authenticateToken, async (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Código é obrigatório' });
        
        try {
            const cleanCode = code.trim().toUpperCase();
            const result = await db.query('SELECT pending_email FROM users WHERE id = $1 AND email_verification_code = $2 AND email_verification_expires > NOW()', [req.user.id, cleanCode]);
            
            if (result.rows.length === 0) {
                return res.status(400).json({ error: 'Código inválido ou expirado' });
            }
            
            const pendingEmail = result.rows[0].pending_email;
            
            // Atualiza e limpa pendências
            await db.query('UPDATE users SET email = $1, pending_email = NULL, email_verification_code = NULL, email_verification_expires = NULL WHERE id = $2', [pendingEmail, req.user.id]);
            
            logAction(req, 'EMAIL_VERIFIED_AND_UPDATED', { email: pendingEmail });
            res.json({ success: true });
        } catch (err) {
            console.error('Erro na verificação de e-mail:', err);
            res.status(500).json({ error: 'Erro ao verificar código' });
        }
    });
};
