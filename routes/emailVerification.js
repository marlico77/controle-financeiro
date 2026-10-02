const crypto = require('node:crypto');
const { getEmailVerificationHtml } = require('../utils/emailTemplates');
const { normalizeEmail, HttpError, tokenHash } = require('../lib/validation');
const { rateLimit } = require('../lib/security');
module.exports = function(app, db, sendResendEmail, logAction, authenticateToken) {
    app.post('/api/user/email/request-verification', authenticateToken, rateLimit(db,'email-request',3,900), async (req,res,next) => {
        try {
            const email=normalizeEmail(req.body?.email);
            if ((await db.query('SELECT id FROM users WHERE LOWER(TRIM(email))=$1 AND id<>$2',[email,req.user.id])).rowCount) throw new HttpError(409,'E-mail já cadastrado.');
            const code=Array.from({length:6},()=> '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[crypto.randomInt(36)]).join('');
            await db.query("UPDATE users SET pending_email=$1, email_verification_code=$2, email_verification_expires=NOW()+INTERVAL '15 minutes' WHERE id=$3",[email,tokenHash(code),req.user.id]);
            const result=await sendResendEmail({to:email,subject:'Código de verificação — Tribo de Davi',html:getEmailVerificationHtml(req.user.username,code)});
            if (!result.success) throw new HttpError(503,'Não foi possível enviar o código. Tente novamente mais tarde.');
            res.json({success:true});
        } catch(err) { next(err); }
    });
    app.post('/api/user/email/verify', authenticateToken, rateLimit(db,'email-verify',8,900), async (req,res,next) => {
        try {
            const code=String(req.body?.code || '').trim().toUpperCase();
            if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpError(400,'Código inválido.');
            const result=await db.query(`UPDATE users SET email=pending_email, email_verified=TRUE, pending_email=NULL,
                email_verification_code=NULL, email_verification_expires=NULL WHERE id=$1 AND pending_email IS NOT NULL
                AND email_verification_code=$2 AND email_verification_expires>NOW() RETURNING email`,[req.user.id,tokenHash(code)]);
            if (!result.rowCount) throw new HttpError(400,'Código inválido ou expirado.');
            await logAction(req,'EMAIL_VERIFIED_AND_UPDATED'); res.json({success:true});
        } catch(err) { next(err); }
    });
};
