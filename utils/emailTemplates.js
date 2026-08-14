/**
 * Gera o template HTML para notificação de novo comprovante de mensalidade
 * @param {string} personName Nome do membro
 * @param {string[]} months Nomes dos meses enviados
 * @param {string} adminName Nome do admin recebendo (ex: Marlon)
 * @returns {string} HTML do e-mail
 */
function getMonthlyReceiptEmailHtml(personName, months, adminName) {
    const monthsString = months.join(', ');
    const isMultiple = months.length > 1;
    
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novo Comprovante Recebido</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f7; color: #333333; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f7f7f7; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;" align="center">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Logo" width="120" style="display: block; width: 120px; height: auto; max-width: 100%; border: 0;" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 40px 40px;">
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px;">Olá, ${adminName}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                O membro <strong>${personName}</strong> acabou de enviar um comprovante de pagamento de mensalidade referente ${isMultiple ? 'aos meses:' : 'ao mês:'} <br/>
                                <strong style="color: #e50914;">${monthsString}</strong>.
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                O arquivo está anexado a este e-mail. Você também pode acessar o sistema para aprovar este pagamento.
                            </p>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="https://www.tribodedavi.net.br" style="background-color: #e50914; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
                            </div>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Sistema Financeiro</p>
                            </div>
                        </td>
                    </tr>
                </table>
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; margin-top: 20px;" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">
                            POWERED BY <br>
                            <strong style="color: #666666; font-size: 11px;">SISTEMA TRIBO DE DAVI</strong>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Gera o template HTML para notificação de novo comprovante de evento
 * @param {string} personName Nome do membro
 * @param {string} eventName Nome do evento
 * @param {string} adminName Nome do admin recebendo (ex: Marlon)
 * @returns {string} HTML do e-mail
 */
function getEventReceiptEmailHtml(personName, eventName, adminName) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novo Comprovante de Evento</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f7; color: #333333; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f7f7f7; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;" align="center">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Logo" width="120" style="display: block; width: 120px; height: auto; max-width: 100%; border: 0;" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 40px 40px;">
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px;">Olá, ${adminName}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                O membro <strong>${personName}</strong> acabou de enviar um comprovante de pagamento de evento referente ao evento: <br/>
                                <strong style="color: #e50914;">${eventName}</strong>.
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                O arquivo está anexado a este e-mail. Você também pode acessar o sistema para aprovar este pagamento.
                            </p>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="https://www.tribodedavi.net.br" style="background-color: #e50914; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
                            </div>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Sistema Financeiro</p>
                            </div>
                        </td>
                    </tr>
                </table>
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; margin-top: 20px;" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">
                            POWERED BY <br>
                            <strong style="color: #666666; font-size: 11px;">SISTEMA TRIBO DE DAVI</strong>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

function getPasswordResetEmailHtml(personName, resetUrl) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperação de Senha</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f6f6; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px; border-bottom: 1px solid #f0f0f0;">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Logo Tribo de Davi" width="100" style="display: block; width: 100px; max-width: 100px; height: auto;" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 40px 40px;">
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px;">Olá, ${personName}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                Recebemos uma solicitação para redefinir a senha da sua conta.
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                Para criar uma nova senha, clique no botão abaixo. Este link expira em 1 hora.
                            </p>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${resetUrl}" style="background-color: #e50914; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
                            </div>
                            <p style="font-size: 13px; line-height: 1.5; color: #777777; margin-top: 0; margin-bottom: 30px;">
                                Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.
                            </p>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Sistema Financeiro</p>
                            </div>
                        </td>
                    </tr>
                </table>
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; margin-top: 20px;" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">
                            POWERED BY <br>
                            <strong style="color: #666666; font-size: 11px;">SISTEMA TRIBO DE DAVI</strong>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

function getEmailVerificationHtml(personName, code) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Código de Verificação</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f6f6; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; max-width: 100%; margin: 0 auto;">
                    <tr>
                        <td style="background-color: #e50914; padding: 30px; text-align: center;">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Tribo de Davi" style="max-height: 80px; width: auto;">
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h1 style="margin: 0 0 20px 0; font-size: 24px; color: #333333; text-align: center;">Verificação de E-mail</h1>
                            
                            <p style="font-size: 16px; line-height: 1.6; color: #555555; margin-bottom: 20px;">
                                Olá, <strong>${personName}</strong>!
                            </p>
                            
                            <p style="font-size: 16px; line-height: 1.6; color: #555555; margin-bottom: 30px;">
                                Recebemos uma solicitação para cadastrar este e-mail em sua conta. Para confirmar que este e-mail pertence a você, digite o código abaixo no sistema:
                            </p>
                            
                            <div style="text-align: center; margin-bottom: 30px;">
                                <div style="display: inline-block; background-color: #f4f4f4; border: 2px dashed #cccccc; border-radius: 8px; padding: 15px 30px;">
                                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #e50914;">${code}</span>
                                </div>
                            </div>
                            
                            <p style="font-size: 14px; line-height: 1.6; color: #777777; margin-top: 30px; text-align: center;">
                                Se você não solicitou esta alteração, por favor, ignore este e-mail.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}


function getPaymentApprovedEmailHtml(personName, paymentType, paymentDescription, systemUrl) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprovante Aprovado</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f6f6; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px; border-bottom: 1px solid #f0f0f0;">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Logo Tribo de Davi" width="100" style="display: block; width: 100px; max-width: 100px; height: auto;" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 40px 40px;">
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px;">Olá, ${personName}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                Temos uma boa notícia! O seu comprovante de pagamento de <strong>${paymentType}</strong> (${paymentDescription}) foi avaliado e <strong style="color: #28a745;">aprovado</strong> pela tesouraria do clube.
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                O pagamento já consta como baixado no sistema financeiro.
                            </p>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${systemUrl}" style="background-color: #e50914; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
                            </div>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Sistema Financeiro</p>
                            </div>
                        </td>
                    </tr>
                </table>
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; margin-top: 20px;" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">
                            POWERED BY <br>
                            <strong style="color: #666666; font-size: 11px;">SISTEMA TRIBO DE DAVI</strong>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

function getPaymentRejectedEmailHtml(personName, paymentType, paymentDescription, rejectionReason, systemUrl) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprovante Rejeitado</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f6f6; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px; border-bottom: 1px solid #f0f0f0;">
                            <img src="https://www.tribodedavi.net.br/logo.png" alt="Logo Tribo de Davi" width="100" style="display: block; width: 100px; max-width: 100px; height: auto;" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 40px 40px;">
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px;">Olá, ${personName}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                O seu comprovante de pagamento de <strong>${paymentType}</strong> (${paymentDescription}) foi avaliado e <strong style="color: #dc3545;">rejeitado</strong> pela secretaria.
                            </p>
                            <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                                <p style="font-size: 14px; color: #721c24; margin: 0;"><strong>Motivo da Rejeição:</strong><br>${rejectionReason}</p>
                            </div>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                O pagamento voltou ao status de "Pendente". Por favor, acesse o sistema para verificar o erro e enviar um novo comprovante corrigido.
                            </p>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${systemUrl}" style="background-color: #e50914; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold; display: inline-block;">Corrigir Pagamento</a>
                            </div>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Sistema Financeiro</p>
                            </div>
                        </td>
                    </tr>
                </table>
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; margin-top: 20px;" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">
                            POWERED BY <br>
                            <strong style="color: #666666; font-size: 11px;">SISTEMA TRIBO DE DAVI</strong>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

module.exports = {
    getMonthlyReceiptEmailHtml,
    getEventReceiptEmailHtml,
    getPasswordResetEmailHtml,
    getEmailVerificationHtml,
    getPaymentApprovedEmailHtml,
    getPaymentRejectedEmailHtml
};
