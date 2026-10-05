require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const express = require('express'); // Framework web para Node.js
const cors = require('cors'); // Middleware para permitir requisições de diferentes domínios
const multer = require('multer'); // Middleware para manipulação de upload de arquivos
const path = require('path'); // Módulo nativo para manipulação de caminhos de arquivos
const jwt = require('jsonwebtoken'); // Biblioteca para geração e validação de tokens JWT
const bcrypt = require('bcryptjs'); // Biblioteca para criptografia de senhas
const crypto = require('crypto'); // Biblioteca para geração de tokens aleatórios
const xlsx = require('xlsx'); // Biblioteca para leitura e escrita de arquivos Excel
const sharp = require('sharp'); // Biblioteca de alto desempenho para processamento de imagens
const db = require('./database'); // Importa a configuração do banco de dados (Pool do Postgres)
const UAParser = require('ua-parser-js'); // Analisador de User-Agent (detecta navegador/dispositivo)
const webPush = require('web-push'); // Biblioteca para envio de notificações push
const cron = require('node-cron'); // Agendador de tarefas (não usado explicitamente mas carregado)
const { createClient } = require('@supabase/supabase-js'); // Cliente para integração com Supabase Storage
const { getMonthlyReceiptEmailHtml, getEventReceiptEmailHtml, getPaymentApprovedEmailHtml, getPaymentRejectedEmailHtml } = require('./utils/emailTemplates');

// Inicializa o cliente do Supabase para armazenamento de arquivos em nuvem
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { HttpError, moneyCents, moneyString, dateOnly, yearNumber, monthNumber, positiveId } = require('./lib/validation');
const { authenticate, rateLimit, canAccessPerson, isStaff, newAccountHash } = require('./lib/security');
const { prepareReceipt, registerReceiptRoutes } = require('./lib/receipts');
const { migrate } = require('./lib/migrations');
const { civilParts, scheduledInstant } = require('./lib/time');
const app = express(); // Instancia a aplicação Express
const scheduledTasks = [];
const schedule = (...args) => scheduledTasks.push(cron.createTask(...args));
const PORT = process.env.PORT || 3000; // Define a porta do servidor
const SECRET = process.env.JWT_SECRET; // Segredo para assinatura dos tokens JWT

// --- Função Auxiliar: Compressão de Imagens ---
// Reduz o tamanho de comprovantes enviados para economizar espaço e banda
const compressReceipt = file => prepareReceipt(file, sharp);

console.log(`[SERVER] Started on PORT ${PORT} - ENV: ${process.env.NODE_ENV || 'development'}`);

// Validação de segurança crítica em produção
if (!SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is missing!');
    process.exit(1);
}
if (!SECRET || SECRET.length < 32) throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres.');
if (!process.env.APP_URL || !/^https?:\/\//.test(process.env.APP_URL)) throw new Error('Configure APP_URL com a URL oficial do sistema.');
const JWT_SECRET = SECRET;
const authenticateToken = authenticate(db, JWT_SECRET);
app.set('trust proxy', process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(s => s.trim()) : false);
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });


// Configurações de Middleware do Express
const allowedOrigins = [
    new URL(process.env.APP_URL).origin,
    'https://www.tribodedavi.net.br',
    'https://tribodedavi.net.br',
    'https://wwwtribodedavi.com.br',
    'https://tribodedavi.com.br',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem origin (como mobile apps, curl, ou o próprio server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('Acesso não autorizado por política de CORS (Origem inválida).'), false);
        }
        return callback(null, true);
    }
})); // Habilita CORS com restrições de domínio
// Media uses a scoped parser; ordinary API JSON stays limited to 100 KB.
app.use('/api/whatsapp/send-media', express.json({ limit: '14mb' }));
app.use(express.json({ limit: '100kb' }));

const planningsRouter = require('./routes/plannings');
app.use('/api/plannings', authenticateToken, planningsRouter); // Habilita parsing de JSON no corpo das requisições
app.use(express.static('public', { index: 'clube.html' })); // Serve os arquivos estáticos da pasta 'public' (frontend), tendo clube.html como página inicial padrão

// --- Configuração de Web Push (Notificações Push) ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webPush.setVapidDetails('mailto:contato@tribodedavi.net.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
else console.warn('[PUSH] Configure as chaves VAPID para habilitar push.');

// Rota raiz: serve o clube.html principal (Página Institucional do Clube)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'clube.html'));
});

// --- Configuração de E-mail (Resend) ---
const sendResendEmail = async ({ to, subject, html, attachments }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'contato@tribodedavi.net.br';
    const fromName = process.env.RESEND_FROM_NAME || 'Tribo de Davi';
    const fromAddress = `${fromName} <${fromEmail}>`;

    if (!apiKey) {
        console.log(`[RESEND SIMULATION] To: ${to} | Subject: ${subject}`);
        // Never print reset/verification tokens or message contents.
        return { success: false, error: 'Serviço de e-mail não configurado.' };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromAddress,
                to: Array.isArray(to) ? to : [to],
                subject: subject,
                html: html,
                ...(attachments && { attachments })
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
        console.log(`[RESEND] E-mail enviado com sucesso: ${data.id}`);
        return { success: true, id: data.id };
    } catch (err) {
        console.error('[RESEND] Erro ao enviar e-mail:', err);
        return { success: false, error: err.message };
    }
};

// Rota pública de envio de contato
app.post('/api/contact', rateLimit(db, 'contact', 5, 900), async (req, res) => {
    const { name, email, address, wantsToJoin, isAdventist, phone, message } = req.body || {};

    if (!name || !email || !address || wantsToJoin === undefined || isAdventist === undefined || !phone || !message) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    try {
        // 1. Salva a mensagem no banco de dados
        await db.query(`
            INSERT INTO contact_messages (name, email, address, wants_to_join, is_adventist, phone, message)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [name, email, address, wantsToJoin, isAdventist, phone, message]);

        console.log(`[CONTACT] Nova mensagem de ${name} salva no banco.`);

        // 2. Envia E-mail 1: Confirmação para o Visitante
        const email1Result = await sendResendEmail({
            to: email,
            subject: 'Recebemos sua mensagem! - Tribo de Davi',
            html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contato Recebido</title>
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
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Estimado (a) ${name}</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 20px;">
                                Recebemos sua mensagem enviada através do site oficial do <strong>Clube de Desbravadores Tribo de Davi</strong>.
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-top: 0; margin-bottom: 30px;">
                                Agradecemos o seu contato! Em breve, um membro da nossa liderança entrará em contato com você pelo telefone informado (${phone}) ou através deste e-mail.
                            </p>
                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Igreja Adventista do Sétimo Dia</p>
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
`
        });

        // 3. Envia E-mail 2: Notificação para a Liderança
        const email2Result = await sendResendEmail({
            to: ['marlonssoficial@gmail.com', 'gomeaj606@gmail.com', 'rafaellasouvasilva@gmail.com', 'ARTHUR.ROC.NASCIMENTO@GMAIL.COM', 'goncalveslucasgustavo@gmail.com'],
            subject: `[Tribo de Davi] Novo Contato: ${name}`,
            html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novo Contato Recebido</title>
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
                            <h2 style="font-size: 16px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Novo Contato Recebido</h2>
                            <p style="font-size: 14px; color: #666666; margin-top: 0; margin-bottom: 25px;">
                                As informações preenchidas pelo visitante no formulário do site foram registradas com sucesso.
                            </p>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>Nome Completo</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #666666; border-bottom: 1px solid #f0f0f0;">${name}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>E-mail</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #0066cc; border-bottom: 1px solid #f0f0f0;"><a href="mailto:${email}" style="color: #0066cc; text-decoration: none;">${email}</a></td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>Telefone</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #666666; border-bottom: 1px solid #f0f0f0;">${phone}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>Endereço</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #666666; border-bottom: 1px solid #f0f0f0;">${address}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>Deseja fazer parte?</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #666666; border-bottom: 1px solid #f0f0f0;">${wantsToJoin ? 'Sim' : 'Não'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-size: 14px; color: #333333; border-bottom: 1px solid #f0f0f0;"><strong>É Adventista?</strong></td>
                                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #666666; border-bottom: 1px solid #f0f0f0;">${isAdventist ? 'Sim' : 'Não'}</td>
                                </tr>
                            </table>

                            <div style="margin-bottom: 30px;">
                                <h3 style="font-size: 14px; font-weight: bold; color: #111111; margin-top: 0; margin-bottom: 10px;">Mensagem</h3>
                                <div style="background-color: #fafafa; border: 1px solid #eeeeee; border-radius: 4px; padding: 15px; font-size: 14px; line-height: 1.5; color: #444444; white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${message}</div>
                            </div>

                            <div style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p style="font-size: 14px; font-weight: bold; color: #222222; margin: 0 0 5px 0;">Clube de Desbravadores Tribo de Davi</p>
                                <p style="font-size: 13px; color: #666666; margin: 0;">Igreja Adventista do Sétimo Dia</p>
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
`
        });

        // 4. Registra os resultados do envio dos e-mails no log do sistema
        await logAction(req, 'CONTACT_FORM_SUBMITTED', {
            name,
            email,
            email1: email1Result,
            email2: email2Result
        });

        res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } catch (err) {
        console.error('[CONTACT] Erro ao processar contato:', err);
        res.status(500).json({ error: 'Erro no servidor ao enviar contato.' });
    }
});

// Configuração do Multer: Usa MemoryStorage para processar arquivos em memória antes de salvar
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limite de 10MB por arquivo
});

// --- Auxiliar: Logs de Auditoria do Sistema ---
// Registra ações críticas (login, exclusão, etc) com detalhes do dispositivo e IP
const logAction = async (req, action, details = {}) => {
    try {
        const headers = req && req.headers ? req.headers : {};
        const ua = headers['user-agent'] || '';
        const parser = new UAParser(ua);
        const result = parser.getResult();

        // Obtém o IP do cliente (considerando proxies como Cloudflare/Render)
        let ip = req.ip || req.socket?.remoteAddress || '';
        if (ip === '::1') ip = '127.0.0.1';
        if (ip.startsWith('::ffff:')) ip = ip.split(':').pop();

        const userId = req.user ? req.user.id : (details.userId || null);
        const username = req.user ? req.user.username : (details.username || 'guest');

        // Insere o log na tabela system_logs
        await db.query(`
            INSERT INTO system_logs
            (user_id, username, action, details, ip_address, user_agent, device_type, os, browser)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            userId,
            username,
            action,
            JSON.stringify(details),
            ip,
            ua,
            result.device.type || 'desktop',
            `${result.os.name || ''} ${result.os.version || ''}`.trim(),
            `${result.browser.name || ''} ${result.browser.version || ''}`.trim()
        ]);
    } catch (err) {
        console.error('[LOG] Error saving action log:', err);
    }
};

app.use((req, res, next) => {
    res.on('finish', () => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400 && req.user && !req.path.startsWith('/api/auth/')) {
            logAction(req, 'API_MUTATION', { method:req.method, path:req.path, status:res.statusCode });
        }
    });
    next();
});

// --- Política de Limpeza de Logs (Retenção de 24h) ---
const cleanupLogs = async () => {
    try {
        // Remove logs com mais de 1 dia para evitar inchaço do banco de dados
        const result = await db.query("DELETE FROM system_logs WHERE created_at < NOW() - $1 * INTERVAL '1 day'", [Math.max(90, Number(process.env.AUDIT_RETENTION_DAYS) || 365)]);
        if (result.rowCount > 0) {
            console.log(`[CLEANUP] ${result.rowCount} logs antigos removidos.`);
        }
    } catch (err) {
        console.error('Error cleaning up logs:', err);
    }
};

// Agenda a limpeza de logs para rodar a cada hora
// Cleanup starts after migrations.

// Middleware de Autenticação: Valida o token JWT em cada requisição protegida


// --- Middleware para bloqueio de uploads no Sábado ---
const blockSabbathUploads = (req, res, next) => {
    // Administradores contornam o bloqueio
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    const now = new Date();

    // Tenta usar o fuso horário enviado pelo navegador do usuário, caso contrário usa o de Brasília
    const userTimezone = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

    // Obtém o dia e hora no fuso horário do usuário
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        weekday: 'short',
        hour: 'numeric',
        hour12: false
    });

    const parts = formatter.formatToParts(now);
    let weekday = '';
    let hour = 0;

    for (const part of parts) {
        if (part.type === 'weekday') weekday = part.value;
        if (part.type === 'hour') hour = parseInt(part.value, 10);
    }

    // Sexta >= 18h ou Sábado < 18h no fuso do usuário
    if ((weekday === 'Fri' && hour >= 18) || (weekday === 'Sat' && hour < 18)) {
        return res.status(403).json({ error: 'O sistema não aceita envios de comprovantes de pagamento durante as horas do Sábado no seu fuso horário local.' });
    }

    next();
};

// Endpoint para obter o horário do servidor (usado no frontend para travas)
app.get('/api/time', (req, res) => {
    res.json({ timestamp: Date.now(), timezone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
});

// --- Sincronização: Criar Usuários para Novos Membros e seus Responsáveis ---
const syncMemberUsers = async () => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('sync-member-users'))");
        const people = await client.query('SELECT p.id, p.name FROM people p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.person_id=p.id)');
        for (const person of people.rows) {
            const parts = person.name.trim().split(/\s+/);
            const username = (parts[0] + '.' + parts.at(-1) + '.' + person.id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            await client.query("INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1,$2,'member',$3,TRUE) ON CONFLICT DO NOTHING", [username, await newAccountHash(bcrypt), person.id]);
        }
        await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
};

// --- Inicialização do Banco de Dados ---
const initDB = async () => {
    try {
        // Cria tabelas necessárias se elas ainda não existirem (Garante resiliência em deploys)
        await db.query(`
            CREATE TABLE IF NOT EXISTS especialidades (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                categoria VARCHAR(100) NOT NULL,
                codigo VARCHAR(50),
                nivel INT,
                ano INT,
                instituicao VARCHAR(255),
                imagem_url TEXT,
                requisitos JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS outflows (
                id SERIAL PRIMARY KEY,
                amount DECIMAL(10,2) NOT NULL,
                category VARCHAR(100) NOT NULL,
                date DATE NOT NULL,
                description TEXT,
                receipt_path VARCHAR(255),
                receipt_content BYTEA,
                receipt_mime VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                event_name VARCHAR(255) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                date DATE NOT NULL,
                description TEXT,
                receipt_path VARCHAR(255),
                receipt_content BYTEA,
                receipt_mime VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS site_calendar_events (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`ALTER TABLE site_calendar_events ADD COLUMN IF NOT EXISTS local VARCHAR(255)`);
        await db.query(`ALTER TABLE site_calendar_events ADD COLUMN IF NOT EXISTS responsible VARCHAR(255)`);
        // Legacy columns are preserved; migrations never silently discard data.
        await db.query(`
            CREATE TABLE IF NOT EXISTS site_albums (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                cover_url VARCHAR(1024) NOT NULL,
                album_url VARCHAR(1024),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                wants_to_join BOOLEAN NOT NULL,
                is_adventist BOOLEAN NOT NULL,
                phone VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await db.query(`
            ALTER TABLE contact_messages
            ADD COLUMN IF NOT EXISTS email VARCHAR(255)
        `);

        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lgpd_accepted BOOLEAN DEFAULT FALSE');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lgpd_accepted_at TIMESTAMP');

        // E-mail e Recuperação de Senha
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(10)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP');

        // --- WhatsApp W-API Integration Database Schema ---
        await db.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
        await db.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS uniform_orders TEXT');

        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_settings (
                id SERIAL PRIMARY KEY,
                api_key VARCHAR(255) NOT NULL,
                base_url VARCHAR(255) NOT NULL,
                instance_id VARCHAR(255) NOT NULL,
                enabled BOOLEAN DEFAULT FALSE,
                reminder_template TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS scheduled_reminders (
                id SERIAL PRIMARY KEY,
                message TEXT NOT NULL,
                scheduled_at TIMESTAMPTZ NOT NULL,
                target_type VARCHAR(50) NOT NULL,
                target_value TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_message_senders (
                id SERIAL PRIMARY KEY,
                message_id VARCHAR(255) NOT NULL UNIQUE,
                sender_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_queue (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                sent_at TIMESTAMPTZ
            )
        `);

        await db.query('CREATE INDEX IF NOT EXISTS idx_wa_queue_status_created ON whatsapp_queue(status, created_at)');

        // --- Criação de Índices de Performance ---
        // Essencial para manter o sistema rápido com o crescimento dos dados
        await db.query('CREATE INDEX IF NOT EXISTS idx_payments_year ON payments(year)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_payments_person_id ON payments(person_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_event_payments_event_id ON event_payments(event_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_event_payments_person_id ON event_payments(person_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_users_person_id ON users(person_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)');

        // Seeding de álbuns iniciais se a tabela estiver vazia
        const albumCount = await db.query('SELECT COUNT(*) FROM site_albums');
        if (parseInt(albumCount.rows[0].count, 10) === 0) {
            await db.query(`
                INSERT INTO site_albums (title, description, cover_url, album_url) VALUES
                (
                    'XX Campori AP - Foi tudo por Jesus',
                    'Registros oficiais do nosso clube no 20º Campori da Associação Paulistana.',
                    'https://lh3.googleusercontent.com/pw/AP1GczOjQqGi948qkNBlYVV2-HqCHHul4JL5a22t1DMXY1wNmMQqZzD_Pd9cx92s7moTJDjgo569tm0A475ZRlGp0gyq0rmvq_4QygUWLJWwNhqfwOULiOH0krGGODqWEfWiaglOmXO3t8Amx-aifPUXhVP1=w844-h633-s-no-gm?authuser=0',
                    'https://photos.google.com/share/AF1QipOviZd2QVCOHxzOzhhBeyAwOWUpxuPpyErb0nRQ2xqH7waou1KApxAdKq__FTv80g?key=aVk2T0lLLXJURVZYYklnbU0tMjN2d2JSaFVDT2hR'
                ),
                (
                    'Acampamento Silvestre 2025',
                    'Destaques e registros marcantes das nossas aventuras, pioneirias e especialidades de campo.',
                    'https://lh3.googleusercontent.com/pw/AP1GczOo5jypqFB1jUmZ__HdV9ShJOIgABWW98yUhdFddDANt6-OFHFe55mMuwcppvivlp9EddiuxbZx62oC6gZ_ai0Kh1qyXb1WZ-CD0HVtKZkTP_l4XdaliYZYDEkomeLwXG-fcfJxnM9vS5Su3yN5Vds2IA=w844-h633-s-no-gm?authuser=0',
                    'https://photos.google.com/share/AF1QipNGHv_y0NW9JFvRgCANmuDbeQbjjDVVVaVYxnB0zF91oDDIir-5TDeO9tgd6MjEuA?key=TUc5MkJ0T0lGZ3lwdE9LWGppbkU4ZjJXNm9kUjBR'
                ),
                (
                    'Dia Mundial do Desbravador 2025',
                    'Celebração, investiduras, desfile e comemoração especial do Dia Mundial dos Desbravadores.',
                    'https://lh3.googleusercontent.com/pw/AP1GczN-55UNsqO8cfSRdVxt18kEfWrI5d2Qr42m7MYhRXCwzGAc9-3I-KD7aTTVy8mLMkOLkKjkM0RUtqT8_aqGuXv7Ahhvmc9JI_KzABUNt7ifzTOCwHFVA1-QiVpxWe3lFq5aSfcdc_PPphV3mEBL8fqw=w836-h627-s-no-gm?authuser=0',
                    'https://photos.google.com/share/AF1QipOkZry5iOa1I7zSoMi9ZW9RHCkqyzUM5EQxrumkWT4ax-CoRYO9NXYZsSq5-fHO5A?key=SktFaW1wNWpXMUdlWEhabG5yZzBfMHhubldsNDRR'
                ),
                (
                    'Campori UCB 2023 - Fé invencível',
                    'Relembre os momentos inesquecíveis, os desafios e as vitórias no Campori da União Central Brasileira.',
                    'https://lh3.googleusercontent.com/pw/AP1GczPNry6E5lRQKbmSVSr1LhC7gZZFy9d2aSWUeerjFl7_UbFGHXDcae0ByXYK89UR4YBudMyWemTAeV3tRkRBKNwpawydtfRd2a72d42LZUVreBkLm7GPhX5YT6R1IttjXdduFKEKZuqfUyVJBQNUpeF4=w844-h633-s-no-gm?authuser=0',
                    'https://photos.google.com/share/AF1QipMKZ31sECjhuOUi07cPZRL1f2fCz68iEzM69Uu4YEwNhyRmoeG7-26587gAxSg1TA?key=V0cwVW9aNzZoYnRJcXAwUGl5WllWaGxqdHRHMmJn'
                )
            `);
            console.log('[DB] Seeding default site albums.');
        }

        console.log('[DB] Tables and Performance Indices verified/created.');
        // Inicia processamento da fila de WhatsApp caso haja pendências após inicialização
        // Workers start only after all schema upgrades finish.
    } catch (err) {
        console.error('[DB] Error initializing tables:', err);
        throw err;
    }
};

// Executa inicialização e sincronização ao subir o servidor
// Initialization is awaited before accepting HTTP traffic.

// --- API de Autenticação ---

// Rota de Login: Valida credenciais e gera token JWT

// Obtém o status atual do usuário (permissões e se precisa mudar senha)
app.get('/api/auth/status', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.is_master, u.must_change_password, u.role, u.person_id, u.username, u.lgpd_accepted, u.email, p.name
            FROM users u
            LEFT JOIN people p ON u.person_id = p.id
            WHERE u.id = $1
        `, [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        res.json({
            isMaster: !!user.is_master,
            mustChangePassword: !!user.must_change_password,
            role: user.role,
            username: user.username,
            name: user.name || user.username,
            personId: user.person_id,
            lgpdAccepted: !!user.lgpd_accepted,
            hasEmail: !!user.email,
            email: user.email
        });
    } catch {
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
});

// Salva o e-mail do usuário no banco
const emailVerificationRoutes = require('./routes/emailVerification');
emailVerificationRoutes(app, db, sendResendEmail, logAction, authenticateToken);

// Solicita recuperação de senha via E-mail

// Redefine a senha com o token do e-mail

// Redefinição de senha perdida (Exige Usuário + CPF cadastrado)

// Troca de senha solicitada pelo sistema (no primeiro acesso)

// Aceite dos Termos de Uso e LGPD
app.post('/api/auth/lgpd-accept', authenticateToken, async (req, res) => {
    try {
        await db.query('UPDATE users SET lgpd_accepted = TRUE, lgpd_accepted_at = NOW() WHERE id = $1', [req.user.id]);
        res.json({ success: true, message: 'Termos aceitos com sucesso' });
    } catch (err) {
        console.error('[LGPD] Erro ao registrar aceite:', err);
        res.status(500).json({ error: 'Erro ao registrar aceite da política de privacidade' });
    }
});

// --- API de Notificações Internas ---

// Cria uma notificação no banco para um usuário específico
const createNotification = async (userId, title, message, type = 'info', relatedId = null, relatedType = null) => {
    try {
        await db.query('INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, title, message, type, relatedId, relatedType]);
    } catch (err) {
        console.error('Error creating notification:', err);
    }
};

const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Busca as 20 notificações mais recentes do usuário logado
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT n.*, (n.is_read OR r.user_id IS NOT NULL) AS is_read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$1 WHERE n.user_id=$1 OR n.user_id IS NULL ORDER BY n.created_at DESC LIMIT 50', [req.user.id]);
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

// Marca todas as notificações de um usuário como lidas
app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await db.query('INSERT INTO notification_reads (notification_id, user_id) SELECT id, $1 FROM notifications WHERE user_id=$1 OR user_id IS NULL ON CONFLICT DO NOTHING', [req.user.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao atualizar notificações' });
    }
});

const secureDeps = { db, bcrypt, sharp, supabase, authenticateToken, upload, blockSabbathUploads, logAction, sendResendEmail, createNotification, syncMemberUsers };
require('./routes/secureAuth')(app, { ...secureDeps, secret: JWT_SECRET });
require('./routes/securePeople')(app, secureDeps);
require('./routes/securePayments')(app, secureDeps);
registerReceiptRoutes(app, secureDeps);

// --- API de Membros (People) ---

// --- API de Uniformes ---
app.get('/api/uniforms', authenticateToken, async (req, res) => {
    try {
        if (!req.user.personId) return res.json({ orders: [] });

        const result = await db.query(
            'SELECT uniform_orders FROM people WHERE id = $1',
            [req.user.personId]
        );

        if (result.rows.length === 0 || !result.rows[0].uniform_orders) {
            return res.json({ orders: [] });
        }
        res.json({ orders: JSON.parse(result.rows[0].uniform_orders) });
    } catch (err) {
        console.error('[UNIFORMS] Error fetching uniform orders:', err);
        res.status(500).json({ error: 'Erro ao buscar pedidos de uniformes' });
    }
});

app.post('/api/uniforms', authenticateToken, async (req, res) => {
    try {
        if (!req.user.personId) return res.status(400).json({ error: 'Usuário não vinculado a um membro.' });

        const { orders } = req.body;
        const ordersJson = JSON.stringify(orders || []);

        await db.query(
            'UPDATE people SET uniform_orders = $1 WHERE id = $2',
            [ordersJson, req.user.personId]
        );

        res.json({ success: true, message: 'Pedido atualizado com sucesso!' });
    } catch (err) {
        console.error('[UNIFORMS] Error updating uniform orders:', err);
        res.status(500).json({ error: 'Erro ao atualizar pedidos de uniformes' });
    }
});

app.get('/api/uniforms/all', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'secretário') {
            return res.status(403).json({ error: 'Acesso negado.' });
        }
        const result = await db.query(
            "SELECT name, uniform_orders FROM people WHERE uniform_orders IS NOT NULL AND uniform_orders != '' AND uniform_orders != '[]'"
        );

        const data = result.rows.map(row => ({
            name: row.name,
            orders: JSON.parse(row.uniform_orders)
        }));

        res.json(data);
    } catch (err) {
        console.error('[UNIFORMS] Error fetching all uniform orders:', err);
        res.status(500).json({ error: 'Erro ao buscar todos os pedidos.' });
    }
});

// Lista todos os membros cadastrados

// Cadastra um novo membro (Apenas Admin/Secretário)

// Importação em massa de membros via planilha Excel
app.post('/api/people/import', authenticateToken, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    // Apenas o administrador master pode importar planilhas (por segurança e controle de usuários)
    if (!req.user.isMaster) {
        return res.status(403).json({ error: 'Apenas o administrador master pode importar planilhas.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const client = await db.pool.connect();
    try {
        const workbook = xlsx.read(req.file.buffer); // Lê a planilha da memória
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); // Converte primeira aba em JSON
        let count = 0;

        await client.query('BEGIN');
        try {
            for (const item of data) {
                // Busca colunas de forma flexível (case-insensitive)
                const keys = Object.keys(item);
                const nameKey = keys.find(k => k.trim().toUpperCase() === 'NOME');
                const unitKey = keys.find(k => k.trim().toUpperCase() === 'UNIDADE');
                const birthKey = keys.find(k => k.trim().toUpperCase().includes('NASCIMENTO'));
                const phoneKey = keys.find(k => {
                    const upper = k.trim().toUpperCase();
                    return upper === 'TELEFONE' || upper === 'CELULAR' || upper === 'WHATSAPP' || upper === 'PHONE';
                });

                const name = nameKey ? item[nameKey] : null;
                const unit = unitKey ? item[unitKey] : null;
                let birthDate = birthKey ? item[birthKey] : null;
                const phone = phoneKey ? item[phoneKey] : null;

                // Converte data do formato numérico do Excel para String se necessário
                if (typeof birthDate === 'number') {
                    const date = xlsx.utils.format_cell({ v: birthDate, t: 'd' });
                    birthDate = date;
                }

                if (name) {
                    await client.query(
                        'INSERT INTO people (name, unit, birth_date, phone) VALUES ($1, $2, $3, $4)',
                        [name.toString().trim(), unit ? unit.toString().trim() : null, birthDate || null, phone ? phone.toString().trim() : null]
                    );
                    count++;
                }
            }
            await client.query('COMMIT');

            // Sincroniza usuários em segundo plano para os novos membros importados
            console.log(`[IMPORT] Success. Synching ${count} new members to users...`);
            await syncMemberUsers();

            res.json({ success: true, count });
        } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
        }
    } catch (err) {
        console.error('Import Error:', err);
        res.status(500).json({ error: 'Erro ao processar planilha: ' + err.message });
    } finally {
        client.release();
    }
});

// Busca lista de membros inadimplentes de mensalidade por mês e ano
app.get('/api/payments/unpaid', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);

    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const year = parseInt(req.query.year) || new Date().getFullYear();

    try {
        const result = await db.query(`
            SELECT p.id, p.name, p.phone, p.unit
            FROM people p
            WHERE p.id NOT IN (
                SELECT person_id FROM payments
                WHERE month = $1 AND year = $2 AND status = 'approved'
            )
            ORDER BY p.name ASC
        `, [month, year]);
        res.json(result.rows);
    } catch (err) {
        console.error('[API] Erro ao buscar inadimplentes:', err);
        res.status(500).json({ error: 'Erro ao buscar inadimplentes.' });
    }
});

// --- API de Pagamentos de Mensalidades ---

// Busca histórico de pagamentos por ano
app.get('/api/payments', authenticateToken, async (req, res) => {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    try {
        // Admin e Secretário veem todos os pagamentos do ano selecionado
        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, updated_at, rejection_reason FROM payments WHERE year = $1', [targetYear]);
            return res.json(result.rows);
        }

        // Responsável vê seus próprios pagamentos e os de seus filhos
        if (req.user.role === 'responsible') {
            if (!req.user.personId) return res.json([]);
            const parentResult = await db.query('SELECT name FROM people WHERE id = $1', [req.user.personId]);
            if (parentResult.rows.length === 0) return res.json([]);
            const parentName = req.user.personId;

            const result = await db.query(`
        SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, updated_at, rejection_reason
        FROM payments
        WHERE (person_id = $1 OR person_id IN (
            SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $2
        )) AND year = $3
      `, [req.user.personId, parentName, targetYear]);
            return res.json(result.rows);
        }

        // Membro vê apenas os seus próprios pagamentos
        if (!req.user.personId) return res.json([]);
        const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, updated_at, rejection_reason FROM payments WHERE person_id = $1 AND year = $2', [req.user.personId, targetYear]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ error: 'Erro ao buscar pagamentos' });
    }
});

// Busca detalhes de um pagamento específico
app.get('/api/payments/detail/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, updated_at, rejection_reason FROM payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado' });
        res.json(result.rows[0]);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

// Registra novo pagamento (com suporte a múltiplos meses em um único envio)

// Aprova um pagamento pendente (Admin)
app.post('/api/payments/:id/approve', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);

    try {
        const paymentResult = await db.query('SELECT p.person_id, p.month, pe.name as person_name FROM payments p JOIN people pe ON p.person_id = pe.id WHERE p.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        const transition = await db.query('UPDATE payments SET status = \'approved\', updated_at = NOW(), rejection_reason = NULL WHERE id = $1 AND status = \'pending\' RETURNING id', [req.params.id]);
        if (!transition.rowCount) return res.status(409).json({ error: 'Pagamento já foi conferido. Atualize a tela.' });

        // Notifica o membro que seu pagamento foi aprovado
        const userResult = await db.query('SELECT id, email FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento Aprovado', `Seu pagamento do mês de ${monthNames[payment.month - 1]} foi aprovado com sucesso!`, 'success').catch(err => console.error("[NOTIFICATION] Pagamento conferido; aviso pendente:", err.message));

            if (userForMember.email) {
                const systemUrl = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
                const loginUrl = `${systemUrl}/login.html`;
                const html = getPaymentApprovedEmailHtml(payment.person_name, 'Mensalidade', `Mês de ${monthNames[payment.month - 1]}`, loginUrl);
                sendResendEmail({
                    to: userForMember.email,
                    subject: '[Tribo de Davi] Comprovante Aprovado',
                    html: html
                }).catch(e => console.error('[EMAIL] Erro ao enviar email de aprovação:', e));
            }
        }

        res.json({ success: true });
        logAction(req, 'APPROVE_PAYMENT', { id: req.params.id, person_id: payment.person_id, month: payment.month });
    } catch {
        res.status(500).json({ error: 'Erro ao aprovar pagamento' });
    }
});

// Rejeita um pagamento pendente com motivo (Admin/Secretário)
app.post('/api/payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};

    try {
        const paymentResult = await db.query('SELECT p.person_id, p.month, pe.name as person_name FROM payments p JOIN people pe ON p.person_id = pe.id WHERE p.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        const transition = await db.query('UPDATE payments SET status = \'rejected\', updated_at = NOW(), rejection_reason = $1 WHERE id = $2 AND status = \'pending\' RETURNING id', [reason || 'Comprovante inválido', req.params.id]);
        if (!transition.rowCount) return res.status(409).json({ error: 'Pagamento já foi conferido. Atualize a tela.' });

        // Notifica o membro sobre a rejeição e o motivo
        const userResult = await db.query('SELECT id, email FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento Rejeitado', `Seu pagamento do mês de ${monthNames[payment.month - 1]} foi rejeitado. Motivo: ${reason || 'Comprovante inválido'}. Por favor, corrija-o.`, 'error').catch(err => console.error("[NOTIFICATION] Pagamento conferido; aviso pendente:", err.message));

            if (userForMember.email) {
                const systemUrl = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
                const loginUrl = `${systemUrl}/login.html`;
                const html = getPaymentRejectedEmailHtml(payment.person_name, 'Mensalidade', `Mês de ${monthNames[payment.month - 1]}`, reason || 'Comprovante inválido', loginUrl);
                sendResendEmail({
                    to: userForMember.email,
                    subject: '[Tribo de Davi] Comprovante Rejeitado',
                    html: html
                }).catch(e => console.error('[EMAIL] Erro ao enviar email de rejeição:', e));
            }
        }

        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao rejeitar pagamento' });
    }
});

// Exclui um registro de pagamento definitivamente (Admin)
app.delete('/api/payments/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        await db.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar pagamento' });
    }
});

// Atualiza dados cadastrais de um membro (Admin ou o próprio usuário)



// --- API de Eventos ---

// Rota pública para listar eventos no calendário da página institucional (clube.html)
app.get('/api/public/events', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, description, date, local, responsible FROM site_calendar_events ORDER BY date ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching public events:', err);
        res.status(500).json({ error: 'Erro ao buscar eventos públicos' });
    }
});

// --- API do Calendário do Site (Submenu de Eventos) ---

app.get('/api/site-calendar', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, description, date, local, responsible FROM site_calendar_events ORDER BY date ASC');
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar datas do calendário' });
    }
});

app.post('/api/site-calendar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { name, date, description, local, responsible } = req.body || {};
    if (!name || !date) return res.status(400).json({ error: 'Nome e data são obrigatórios' });
    try {
        const result = await db.query('INSERT INTO site_calendar_events (name, date, description, local, responsible) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name, date, description || null, local || null, responsible || null]);
        logAction(req, 'CREATE_SITE_CALENDAR', { id: result.rows[0].id, name, date, local, responsible });
        res.json({ success: true, id: result.rows[0].id, name, date, local, responsible });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao cadastrar no calendário do site' });
    }
});

app.delete('/api/site-calendar/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM site_calendar_events WHERE id = $1', [req.params.id]);
        logAction(req, 'DELETE_SITE_CALENDAR', { id: req.params.id });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar do calendário do site' });
    }
});

app.put('/api/site-calendar/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { name, date, description, local, responsible } = req.body || {};
    if (!name || !date) return res.status(400).json({ error: 'Nome e data são obrigatórios' });
    try {
        const id = req.params.id;
        const result = await db.query(
            'UPDATE site_calendar_events SET name = $1, date = $2, description = $3, local = $4, responsible = $5 WHERE id = $6 RETURNING id',
            [name, date, description || null, local || null, responsible || null, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }
        logAction(req, 'UPDATE_SITE_CALENDAR', { id, name, date, local, responsible });
        res.json({ success: true, id, name, date, local, responsible });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar no calendário do site' });
    }
});


// Lista todos os eventos e estatísticas de participação
app.get('/api/events', authenticateToken, async (req, res) => {
    try {
        let queryText = '';
        let params = [];

        // Admin e Secretário veem estatísticas detalhadas por unidade
        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            queryText = `
                WITH participant_counts AS (
                    SELECT event_id, COUNT(*) as count
                    FROM event_participants
                    GROUP BY event_id
                ),
                unit_stats AS (
                    SELECT uc.event_id, jsonb_object_agg(COALESCE(uc.unit, 'S/U'), uc.count) as unit_counts
                    FROM (
                        SELECT ep.event_id, p.unit, COUNT(*) as count
                        FROM event_participants ep
                        JOIN people p ON ep.person_id = p.id
                        GROUP BY ep.event_id, p.unit
                    ) uc
                    GROUP BY uc.event_id
                )
                SELECT e.*,
                       COALESCE(pc.count, 0) as total_participants,
                       COALESCE(us.unit_counts, '{}'::jsonb) as unit_counts,
                       EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.person_id = $1) as is_participant
                FROM events e
                LEFT JOIN participant_counts pc ON e.id = pc.event_id
                LEFT JOIN unit_stats us ON e.id = us.event_id
                ORDER BY e.date ASC
            `;
            params = [req.user.personId || 0];
        } else if (req.user.role === 'responsible') {
            // Responsável vê eventos em que ele ou seus filhos participam
            queryText = `
                WITH participant_counts AS (
                    SELECT event_id, COUNT(*) as count
                    FROM event_participants
                    GROUP BY event_id
                ),
                unit_stats AS (
                    SELECT uc.event_id, jsonb_object_agg(COALESCE(uc.unit, 'S/U'), uc.count) as unit_counts
                    FROM (
                        SELECT ep.event_id, p.unit, COUNT(*) as count
                        FROM event_participants ep
                        JOIN people p ON ep.person_id = p.id
                        GROUP BY ep.event_id, p.unit
                    ) uc
                    GROUP BY uc.event_id
                )
                SELECT DISTINCT e.*,
                       COALESCE(pc.count, 0) as total_participants,
                       COALESCE(us.unit_counts, '{}'::jsonb) as unit_counts,
                       TRUE as is_participant
                FROM events e
                LEFT JOIN participant_counts pc ON e.id = pc.event_id
                LEFT JOIN unit_stats us ON e.id = us.event_id
                JOIN event_participants ep ON e.id = ep.event_id
                WHERE ep.person_id = $1 OR ep.person_id IN (
                    SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $1
                )
                ORDER BY e.date ASC
            `;
            params = [req.user.personId];
        } else {
            // Membro vê apenas se está inscrito ou não no evento
            queryText = `
                WITH participant_counts AS (
                    SELECT event_id, COUNT(*) as count
                    FROM event_participants
                    GROUP BY event_id
                ),
                unit_stats AS (
                    SELECT uc.event_id, jsonb_object_agg(COALESCE(uc.unit, 'S/U'), uc.count) as unit_counts
                    FROM (
                        SELECT ep.event_id, p.unit, COUNT(*) as count
                        FROM event_participants ep
                        JOIN people p ON ep.person_id = p.id
                        GROUP BY ep.event_id, p.unit
                    ) uc
                    GROUP BY uc.event_id
                )
                SELECT e.*,
                       COALESCE(pc.count, 0) as total_participants,
                       COALESCE(us.unit_counts, '{}'::jsonb) as unit_counts,
                       TRUE as is_participant
                FROM events e
                LEFT JOIN participant_counts pc ON e.id = pc.event_id
                LEFT JOIN unit_stats us ON e.id = us.event_id
                JOIN event_participants ep ON e.id = ep.event_id AND ep.person_id = $1
                ORDER BY e.date ASC
            `;
            params = [req.user.personId];
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
});

// Cria um novo evento e associa participantes iniciais
app.post('/api/events', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { name, description, date, end_date, payment_type, participant_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    try { if (date) dateOnly(date); if (end_date && (!date || dateOnly(end_date) < dateOnly(date))) throw new HttpError(400,'Data final inválida.');
        if (!['unico','parcelado'].includes(payment_type || 'parcelado')) throw new HttpError(400,'Modalidade inválida.'); }
    catch(err) { return res.status(400).json({error:err.message}); }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN'); // Transação para garantir criação atômica
        const eventResult = await client.query('INSERT INTO events (name, description, date, end_date, payment_type) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name, description || null, date || null, end_date || null, payment_type || 'parcelado']);
        const eventId = eventResult.rows[0].id;

        // Se houver lista de IDs, insere na tabela de participantes
        if (participant_ids && Array.isArray(participant_ids)) {
            for (const pid of participant_ids) {
                await client.query('INSERT INTO event_participants (event_id, person_id) VALUES ($1, $2)', [eventId, pid]);
            }
        }
        await client.query('COMMIT');
        res.json({ id: eventId, name });
    } catch {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erro ao criar evento' });
    } finally { client.release(); }
});

// Adiciona múltiplos participantes a um evento existente (Admin)
app.post('/api/events/:id/participants', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    const { participant_ids } = req.body || {};
    const eventId = req.params.id;

    if (!participant_ids || !Array.isArray(participant_ids)) {
        return res.status(400).json({ error: 'Lista de participantes inválida' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        for (const pid of participant_ids) {
            // ON CONFLICT DO NOTHING evita duplicatas se o membro já estiver inscrito
            await client.query('INSERT INTO event_participants (event_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, pid]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Erro ao adicionar participantes' });
    } finally { client.release(); }
});


// Busca detalhes completos de um evento (dados, participantes e pagamentos)
app.get('/api/events/:id/details', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const eventResult = await db.query('SELECT * FROM events WHERE id = $1', [id]);
        const event = eventResult.rows[0];
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

        // Membros e responsáveis só podem ver detalhes de eventos em que eles ou seus filhos estão inscritos
        if (req.user.role !== 'admin' && req.user.role !== 'secretário') {
            let isAllowed = false;
            if (req.user.role === 'responsible') {
                const parentResult = await db.query('SELECT name FROM people WHERE id = $1', [req.user.personId]);
                if (parentResult.rows.length > 0) {
                    const parentName = req.user.personId;
                    const checkResult = await db.query(`
                        SELECT 1 FROM event_participants ep
                        WHERE ep.event_id = $1 AND (ep.person_id = $2 OR ep.person_id IN (
                            SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $3
                        ))
                    `, [id, req.user.personId, parentName]);
                    if (checkResult.rows.length > 0) isAllowed = true;
                }
            } else {
                const participantResult = await db.query('SELECT 1 FROM event_participants WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
                if (participantResult.rows.length > 0) isAllowed = true;
            }
            if (!isAllowed) return res.sendStatus(403);
        }

        let participants, payments;
        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            // Admin vê todos os inscritos e todos os pagamentos realizados para este evento
            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1
                ORDER BY p.name ASC
            `, [id]);
            participants = pResult.rows;
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, updated_at, rejection_reason FROM event_payments WHERE event_id = $1', [id]);
            payments = payResult.rows;
        } else if (req.user.role === 'responsible') {
            // Responsável vê a si e a seus filhos inscritos, com seus respectivos pagamentos
            const parentResult = await db.query('SELECT name FROM people WHERE id = $1', [req.user.personId]);
            const parentName = req.user.personId;

            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1 AND (p.id = $2 OR p.id IN (SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $3))
                ORDER BY p.name ASC
            `, [id, req.user.personId, parentName]);
            participants = pResult.rows;

            const payResult = await db.query(`
                SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, updated_at, rejection_reason
                FROM event_payments
                WHERE event_id = $1 AND (person_id = $2 OR person_id IN (
                    SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $3
                ))
            `, [id, req.user.personId, parentName]);
            payments = payResult.rows;
        } else {
            // Membro vê apenas seus próprios dados e pagamentos vinculados ao evento
            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1 AND p.id = $2
            `, [id, req.user.personId]);
            participants = pResult.rows;
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, updated_at, rejection_reason FROM event_payments WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
            payments = payResult.rows;
        }

        res.json({ event, participants, payments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar detalhes do evento' });
    }
});

// Exclui um evento definitivamente (Admin)
app.delete('/api/events/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar evento' });
    }
});

// --- API de Pagamentos de Eventos ---

// Lista pagamentos de eventos com filtros opcionais
app.get('/api/event-payments', authenticateToken, async (req, res, next) => {
    try {
        const params = [], conditions = [];
        const filter = (sql, value) => { params.push(value); conditions.push(sql + '$' + params.length); };
        if (!isStaff(req.user)) {
            if (!req.user.personId) return res.json([]);
            params.push(req.user.personId);
            conditions.push(req.user.role === 'responsible'
                ? '(ep.person_id = $1 OR ep.person_id IN (SELECT child_person_id FROM person_guardians WHERE guardian_person_id = $1))'
                : 'ep.person_id = $1');
        }
        if (req.query.event_id) filter('ep.event_id = ', positiveId(req.query.event_id));
        if (req.query.month) filter('ep.month = ', monthNumber(req.query.month));
        if (req.query.year) filter('COALESCE(ep.year, EXTRACT(YEAR FROM e.date)) = ', yearNumber(req.query.year));
        const result = await db.query('SELECT ep.id, ep.event_id, ep.person_id, ep.amount, ep.month, ep.year, ep.status, ep.receipt_path, ep.receipt_mime, ep.updated_at, ep.rejection_reason, p.name AS member_name FROM event_payments ep JOIN people p ON p.id=ep.person_id JOIN events e ON e.id=ep.event_id'
            + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''), params);
        res.json(result.rows);
    } catch (err) { next(err); }
});

// Busca detalhes de um pagamento de evento específico
app.get('/api/event-payments/detail/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, updated_at, rejection_reason FROM event_payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento de evento não encontrado' });
        res.json(result.rows[0]);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

// Registra pagamento de evento

// --- API de Vendas Extras (Cantina/Bazar) ---

// Busca histórico de vendas
app.get('/api/sales', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    const { year } = req.query;
    try {
        let sql = 'SELECT id, event_name, amount, date, description, receipt_path, receipt_mime, created_at FROM sales';
        let params = [];
        if (year) {
            sql += ' WHERE EXTRACT(YEAR FROM date) = $1';
            params.push(year);
        }
        sql += ' ORDER BY date DESC';
        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
});

// Registra nova venda
app.post('/api/sales', authenticateToken, blockSabbathUploads, upload.single('receipt'), async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { event_name, amount, date, description } = req.body || {};

    if (!event_name || !amount || !date) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    try {
        const compressed = await compressReceipt(req.file);
        const receipt_content = compressed ? compressed.buffer : null;
        const receipt_mime = compressed ? compressed.mimetype : null;
        const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
        const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

        let isUploadedToStorage = false;
        // Upload para o Supabase Storage se houver arquivo
        if (req.file && compressed) {
            const { error } = await supabase.storage
                .from('receipts')
                .upload(receipt_filename, compressed.buffer, {
                    contentType: compressed.mimetype,
                    upsert: true
                });
            if (!error) isUploadedToStorage = true;
        }

        const finalDBContent = isUploadedToStorage ? null : receipt_content;

        const result = await db.query(`
            INSERT INTO sales (event_name, amount, date, description, receipt_path, receipt_content, receipt_mime)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [event_name, moneyString(moneyCents(amount)), dateOnly(date), description || null, receipt_path, finalDBContent, receipt_mime]);

        logAction(req, 'CREATE_SALE', { id: result.rows[0].id, event_name, amount });
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao salvar venda' });
    }
});

// Exclui uma venda (Admin)
app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        await db.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
        res.json({ success: true });
        logAction(req, 'DELETE_SALE', { id: req.params.id });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar venda' });
    }
});

// --- Aprovação de Pagamentos de Eventos ---

// Aprova pagamento de evento (Admin)
app.post('/api/event-payments/:id/approve', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        // Busca dados do pagamento para notificação
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name, pe.name as person_name FROM event_payments ep JOIN events e ON ep.event_id = e.id JOIN people pe ON ep.person_id = pe.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        const transition = await db.query('UPDATE event_payments SET status = \'approved\', updated_at = NOW(), rejection_reason = NULL WHERE id = $1 AND status = \'pending\' RETURNING id', [req.params.id]);
        if (!transition.rowCount) return res.status(409).json({ error: 'Pagamento já foi conferido. Atualize a tela.' });

        // Notifica o membro
        const userResult = await db.query('SELECT id, email FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento de Evento Aprovado', `Seu pagamento para o evento ${payment.event_name} foi aprovado!`, 'success').catch(err => console.error("[NOTIFICATION] Pagamento conferido; aviso pendente:", err.message));

            if (userForMember.email) {
                const systemUrl = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
                const loginUrl = `${systemUrl}/login.html`;
                const html = getPaymentApprovedEmailHtml(payment.person_name, 'Evento', payment.event_name, loginUrl);
                sendResendEmail({
                    to: userForMember.email,
                    subject: '[Tribo de Davi] Comprovante de Evento Aprovado',
                    html: html
                }).catch(e => console.error('[EMAIL] Erro ao enviar email de aprovação (evento):', e));
            }
        }
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao aprovar' });
    }
});

// Rejeita pagamento de evento (Admin/Secretário)
app.post('/api/event-payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};
    try {
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name, pe.name as person_name FROM event_payments ep JOIN events e ON ep.event_id = e.id JOIN people pe ON ep.person_id = pe.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        const transition = await db.query('UPDATE event_payments SET status = \'rejected\', updated_at = NOW(), rejection_reason = $1 WHERE id = $2 AND status = \'pending\' RETURNING id', [reason || 'Inválido', req.params.id]);
        if (!transition.rowCount) return res.status(409).json({ error: 'Pagamento já foi conferido. Atualize a tela.' });

        // Notifica o membro sobre a rejeição
        const userResult = await db.query('SELECT id, email FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento de Evento Rejeitado', `Seu pagamento para o evento ${payment.event_name} foi rejeitado. Motivo: ${reason}`, 'error').catch(err => console.error("[NOTIFICATION] Pagamento conferido; aviso pendente:", err.message));

            if (userForMember.email) {
                const systemUrl = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
                const loginUrl = `${systemUrl}/login.html`;
                const html = getPaymentRejectedEmailHtml(payment.person_name, 'Evento', payment.event_name, reason || 'Inválido', loginUrl);
                sendResendEmail({
                    to: userForMember.email,
                    subject: '[Tribo de Davi] Comprovante de Evento Rejeitado',
                    html: html
                }).catch(e => console.error('[EMAIL] Erro ao enviar email de rejeição (evento):', e));
            }
        }
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao rejeitar' });
    }
});

// Exclui pagamento de evento (Admin)
app.delete('/api/event-payments/:id', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.sendStatus(403);
    try {
        await db.query('DELETE FROM event_payments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// --- API de Saídas (Despesas) ---

// Lista todas as despesas (Apenas Admin/Secretário)
app.get('/api/outflows', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        const year = req.query.year ? yearNumber(req.query.year) : null;
        const result = await db.query('SELECT id, amount, category, date, description, receipt_path, receipt_mime, created_at FROM outflows WHERE ($1::integer IS NULL OR EXTRACT(YEAR FROM date) = $1) ORDER BY date DESC', [year]);
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar saídas' });
    }
});

// Registra nova despesa
app.post('/api/outflows', authenticateToken, blockSabbathUploads, upload.single('receipt'), async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
        const { amount, category, date, description } = req.body;

        if (!amount || !category || !date) {
            return res.status(400).json({ error: 'Valor, categoria e data são obrigatórios.' });
        }

        const compressed = await compressReceipt(req.file);
        const receipt_content = compressed ? compressed.buffer : null;
        const receipt_mime = compressed ? compressed.mimetype : null;
        const receipt_filename = req.file ? `${Date.now()}-outflow-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
        const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

        let isUploadedToStorage = false;
        // Upload para nuvem se houver comprovante de despesa
        if (req.file && compressed) {
            console.log(`[STORAGE] Upload Outflow Receipt: ${receipt_filename}`);
            const { error } = await supabase.storage
                .from('receipts')
                .upload(receipt_filename, compressed.buffer, {
                    contentType: compressed.mimetype,
                    upsert: true
                });
            if (!error) isUploadedToStorage = true;
        }

        const finalDBContent = isUploadedToStorage ? null : receipt_content;

        await db.query(`
            INSERT INTO outflows (amount, category, date, description, receipt_path, receipt_content, receipt_mime)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [moneyString(moneyCents(amount)), category, dateOnly(date), description || null, receipt_path, finalDBContent, receipt_mime]);

        logAction(req, 'CREATE_OUTFLOW', { amount, category, date });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao salvar saída' });
    }
});

// Exclui uma despesa (Admin/Secretário)
app.delete('/api/outflows/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM outflows WHERE id = $1', [req.params.id]);
        logAction(req, 'DELETE_OUTFLOW', { id: req.params.id });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao deletar saída' });
    }
});

// Error handling is registered once, after every route.

// --- ACESSO SEGURO A ARQUIVOS ---
// Serve comprovantes validando permissões de acesso

// --- API DE LOGS DE SISTEMA ---
app.get('/api/admin/logs', authenticateToken, async (req, res) => {
    // Apenas o Administrador Master tem acesso aos logs brutos de auditoria
    if (req.user.role !== 'admin' || !req.user.isMaster) {
        console.warn(`[SECURITY] Tentativa de acesso não autorizado aos logs por ${req.user.username}`);
        return res.sendStatus(403);
    }
    try {
        const result = await db.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 200');
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar logs' });
    }
});

// --- Rotas de Notificação Push (Web Push) ---

// Fornece a chave pública VAPID para o frontend se inscrever
app.get('/api/notifications/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Salva a inscrição do navegador para receber notificações push
app.post('/api/notifications/subscribe', authenticateToken, async (req, res) => {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Inscrição ausente' });

    try {
        await db.query(`
            INSERT INTO push_subscriptions (user_id, subscription_data)
            VALUES ($1, $2)
            ON CONFLICT (user_id, subscription_data) DO NOTHING
        `, [req.user.id, JSON.stringify(subscription)]);
        res.status(201).json({ message: 'Inscrito com sucesso' });
    } catch (err) {
        console.error('[PUSH] Erro ao inscrever:', err);
        res.status(500).json({ error: 'Falha na inscrição' });
    }
});

// Busca notificações não lidas (Badge do sino)
app.get('/api/notifications/unread', authenticateToken, async (req,res,next) => {
    try { const result=await db.query('SELECT n.* FROM notifications n WHERE (n.user_id=$1 OR n.user_id IS NULL) AND n.is_read=FALSE AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.user_id=$1) ORDER BY n.created_at DESC',[req.user.id]); res.json(result.rows); }
    catch(err) { next(err); }
});

// Marca notificação específica como lida
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.query('INSERT INTO notification_reads (notification_id, user_id) SELECT id, $2 FROM notifications WHERE id=$1 AND (user_id=$2 OR user_id IS NULL) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao marcar como lida' });
    }
});

// Envia notificação manual para usuários (Broadcast ou Individual)
app.post('/api/notifications/send', authenticateToken, async (req, res) => {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Acesso negado' });

    const { userId, userIds, title, content } = req.body;

    // Normaliza para um array de IDs
    let targetIds = [];
    if (userIds && Array.isArray(userIds)) {
        targetIds = userIds;
    } else if (userId) {
        targetIds = [userId];
    } else {
        // null significa transmissão para TODOS os membros
        targetIds = (await db.query('SELECT id FROM users')).rows.map(user => user.id);
    }

    try {
        // 1. Salva no banco para o modal interno do sistema
        const result = await db.query(`
            INSERT INTO notifications (user_id, title, message, type)
            SELECT unnest($1::int[]), $2, $3, 'manual' RETURNING id
        `, [targetIds, title, content]);

        // 2. Busca inscrições de push para enviar notificação nativa ao celular/desktop
        const pushResult = await db.query(`
            SELECT subscription_data FROM push_subscriptions
            WHERE ($1::int[] IS NULL OR user_id = ANY($1::int[]))
            OR (NULL = ANY($1::int[]))
        `, [targetIds.includes(null) ? null : targetIds]);

        const payload = JSON.stringify({ title, body: content });

        // Envia via Web Push Protocol
        pushResult.rows.forEach(sub => {
            const subscription = JSON.parse(sub.subscription_data);
            webPush.sendNotification(subscription, payload).catch(err => {
                console.error('[PUSH] Erro no envio individual:', err.statusCode);
                // Se a inscrição expirou (410/404), remove do banco para não tentar mais
                if (err.statusCode === 410 || err.statusCode === 404) {
                    db.query('DELETE FROM push_subscriptions WHERE subscription_data = $1', [sub.subscription_data]);
                }
            });
        });

        res.json({ success: true, notificationId: result.rows[0]?.id || null });
    } catch (err) {
        console.error('[NOTIF] Erro ao enviar:', err);
        res.status(500).json({ error: 'Erro ao processar envio' });
    }
});

// --- WhatsApp W-API Helpers & Endpoints ---

const parseSpintax = (text) => {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choicesStr) => {
        if (choicesStr.includes('|')) {
            const choices = choicesStr.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        }
        return match;
    });
};

let isProcessingWhatsAppQueue = false;
let successCounter = 0;

async function processWhatsAppQueue() {
    if (process.env.WHATSAPP_WORKER_ENABLED !== 'true') return;
    if (isProcessingWhatsAppQueue) return;
    isProcessingWhatsAppQueue = true;

    console.log('[WA-WORKER] Iniciando processamento da fila do WhatsApp...');

    try {
        while (true) {
            // Busca a próxima mensagem pendente
            const nextMsgResult = await db.query(`
                UPDATE whatsapp_queue SET status='sending', claimed_at=NOW() WHERE id=(
                    SELECT id FROM whatsapp_queue WHERE status='pending' ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
                ) RETURNING *
            `);

            if (nextMsgResult.rows.length === 0) {
                console.log('[WA-WORKER] Fila vazia. Finalizando processamento.');
                break;
            }

            const msg = nextMsgResult.rows[0];

            // Marca como em envio
            // Claimed atomically by the UPDATE above.

            // Busca configurações
            const settingsResult = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
            const settings = settingsResult.rows[0];

            if (!settings || !settings.enabled) {
                const errMsg = 'Configurações de WhatsApp não encontradas.';
                console.error(`[WA-WORKER] ${errMsg}`);
                await db.query('UPDATE whatsapp_queue SET status = $1, error_message = $2, sent_at = NOW() WHERE id = $3', ['error', errMsg, msg.id]);
                if (msg.reminder_id) await db.query("UPDATE scheduled_reminders SET status='error', error_message=$1 WHERE id=$2", [errMsg,msg.reminder_id]);
                break;
            }

            console.log(`[WA-WORKER] Enviando mensagem ID ${msg.id} para ${msg.phone}...`);
            const sendResult = await sendWhatsAppMessage(
                settings.base_url,
                settings.instance_id,
                settings.api_key,
                msg.phone,
                msg.message
            );

            let delay;
            if (sendResult.success) {
                await db.query('UPDATE whatsapp_queue SET status = $1, sent_at = NOW() WHERE id = $2', ['sent', msg.id]);
                successCounter++;
                console.log(`[WA-WORKER] Mensagem ID ${msg.id} enviada com sucesso. (Sucessos nesta sessão: ${successCounter})`);

                if (successCounter >= 15) {
                    delay = Math.floor(Math.random() * (5 - 3 + 1) + 3) * 60 * 1000; // 3 a 5 minutos
                    successCounter = 0; // Reseta o contador
                    console.log(`[WA-WORKER] Pausa de descanso ativa: aguardando ${delay / 60000} minutos...`);
                } else {
                    delay = Math.floor(Math.random() * (60 - 35 + 1) + 35) * 1000; // 35 a 60 segundos
                    console.log(`[WA-WORKER] Cooldown ativo: aguardando ${delay / 1000} segundos...`);
                }
            } else {
                const errMsg = sendResult.error || 'Erro desconhecido.';
                await db.query('UPDATE whatsapp_queue SET status = $1, error_message = $2, sent_at = NOW() WHERE id = $3', ['error', errMsg, msg.id]);
                console.error(`[WA-WORKER] Erro ao enviar mensagem ID ${msg.id}: ${errMsg}`);

                // Em caso de erro, ainda aplica o cooldown de 35 a 60 segundos
                delay = Math.floor(Math.random() * (60 - 35 + 1) + 35) * 1000;
                console.log(`[WA-WORKER] Cooldown pós-erro ativo: aguardando ${delay / 1000} segundos...`);
            }

            if (msg.reminder_id) {
                await db.query(`UPDATE scheduled_reminders SET status=CASE
                    WHEN EXISTS (SELECT 1 FROM whatsapp_queue WHERE reminder_id=$1 AND status IN ('pending','sending')) THEN 'queued'
                    WHEN EXISTS (SELECT 1 FROM whatsapp_queue WHERE reminder_id=$1 AND status='error') THEN 'error' ELSE 'sent' END WHERE id=$1`,[msg.reminder_id]);
            }
            // Aguarda o cooldown/pausa antes da próxima mensagem
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } catch (err) {
        console.error('[WA-WORKER] Erro crítico no worker da fila:', err);
    } finally {
        isProcessingWhatsAppQueue = false;
    }
}

const normalizePhoneNumber = (phone) => {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return null;
    if (cleaned.length === 10 || cleaned.length === 11) {
        cleaned = '55' + cleaned;
    }
    return cleaned;
};

const buildWhatsAppUrl = (baseUrl, instanceId) => {
    if (baseUrl.includes('/api/v1/instances/')) {
        const match = baseUrl.match(/^(https?:\/\/[^\/]+)/);
        if (match) {
            baseUrl = match[1];
        }
    }
    return `${baseUrl.replace(/\/$/, '')}/api/v1/instances/${instanceId}/send-text`;
};

const sendWhatsAppMessage = async (baseUrl, instanceId, apiKey, number, message) => {
    try {
        const url = buildWhatsAppUrl(baseUrl, instanceId);
        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ number, message })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (err) {
        console.error(`[WA] Erro ao enviar mensagem para ${number}:`, err.message);
        return { success: false, error: err.message };
    }
};

app.get('/api/whatsapp/settings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' || !req.user.isMaster) return res.sendStatus(403);
    try {
        const result = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error('[WA] Erro ao buscar configurações:', err);
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

app.post('/api/whatsapp/settings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' || !req.user.isMaster) return res.sendStatus(403);
    const { api_key, base_url, instance_id, enabled, reminder_template } = req.body || {};
    if (!api_key || !base_url || !instance_id || reminder_template === undefined) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    try {
        await db.query(`
            INSERT INTO whatsapp_settings (id, api_key, base_url, instance_id, enabled, reminder_template) VALUES (1,$1,$2,$3,$4,$5)
            ON CONFLICT (id) DO UPDATE SET api_key=EXCLUDED.api_key, base_url=EXCLUDED.base_url, instance_id=EXCLUDED.instance_id, enabled=EXCLUDED.enabled, reminder_template=EXCLUDED.reminder_template, updated_at=NOW()
        `, [api_key, base_url, instance_id, enabled || false, reminder_template]);

        logAction(req, 'UPDATE_WHATSAPP_SETTINGS', { base_url, instance_id, enabled });
        res.json({ success: true });
    } catch (err) {
        console.error('[WA] Erro ao salvar configurações:', err);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// --- API de Lembretes Agendados via WhatsApp ---

app.get('/api/whatsapp/scheduled', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT * FROM scheduled_reminders ORDER BY scheduled_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('[WA] Erro ao buscar agendamentos:', err);
        res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
});

app.post('/api/whatsapp/scheduled', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { message, date, time, target_type, target_value } = req.body || {};

    if (!message || !date || !time || !target_type) {
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    }

    try {
        const scheduledAt = scheduledInstant(date, time, process.env.APP_TIMEZONE || 'America/Sao_Paulo');
        if (!['all', 'unit', 'selected'].includes(target_type)) throw new HttpError(400, 'Destinatários inválidos.');
        if (target_type === 'selected' && (!Array.isArray(target_value) || !target_value.length || target_value.some(id => !Number.isSafeInteger(Number(id)) || Number(id) < 1))) throw new HttpError(400, 'Selecione membros válidos.');
        if (isNaN(scheduledAt.getTime())) {
            return res.status(400).json({ error: 'Data ou hora inválida.' });
        }

        if (scheduledAt <= new Date()) {
            return res.status(400).json({ error: 'O agendamento precisa ser para uma data e hora no futuro.' });
        }

        const finalTargetValue = typeof target_value === 'object' ? JSON.stringify(target_value) : (target_value || null);

        await db.query(`
            INSERT INTO scheduled_reminders (message, scheduled_at, target_type, target_value)
            VALUES ($1, $2, $3, $4)
        `, [message, scheduledAt, target_type, finalTargetValue]);

        logAction(req, 'CREATE_SCHEDULED_REMINDER', { scheduled_at: scheduledAt, target_type });
        res.json({ success: true });
    } catch (err) {
        console.error('[WA] Erro ao agendar lembrete:', err);
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao agendar lembrete' });
    }
});

app.delete('/api/whatsapp/scheduled/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { id } = req.params;

    try {
        const result = await db.query(`
            DELETE FROM scheduled_reminders
            WHERE id = $1 AND status = 'pending'
            RETURNING id
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado ou já enviado.' });
        }

        logAction(req, 'DELETE_SCHEDULED_REMINDER', { id });
        res.json({ success: true });
    } catch (err) {
        console.error('[WA] Erro ao cancelar agendamento:', err);
        res.status(500).json({ error: 'Erro ao cancelar agendamento' });
    }
});

app.post('/api/whatsapp/send', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { personIds, message } = req.body || {};

    if (!personIds || !Array.isArray(personIds) || personIds.length === 0 || !message) {
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    }

    try {
        const settingsResult = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
        const settings = settingsResult.rows[0];

        if (!settings || !settings.enabled || process.env.WHATSAPP_WORKER_ENABLED !== 'true') {
            return res.status(503).json({ error: 'Envios em lote desativados. Habilite a integração e o worker antes de enviar.' });
        }

        const peopleResult = await db.query('SELECT id, name, phone FROM people WHERE id = ANY($1::int[])', [personIds]);
        const targets = peopleResult.rows.filter(p => p.phone);

        if (targets.length === 0) {
            return res.status(400).json({ error: 'Nenhum dos membros selecionados possui telefone cadastrado.' });
        }

        // Insere as mensagens na fila do banco de dados
        for (const target of targets) {
            const normalizedPhone = normalizePhoneNumber(target.phone);
            if (normalizedPhone) {
                const customMessage = message.replace(/{nome}/g, target.name);
                const finalMessage = parseSpintax(customMessage);
                await db.query(
                    'INSERT INTO whatsapp_queue (phone, message, status) VALUES ($1, $2, $3)',
                    [normalizedPhone, finalMessage, 'pending']
                );
            }
        }

        // Acorda o worker da fila
        processWhatsAppQueue().catch(err => console.error('[WA-WORKER] Erro ao acordar worker após envio manual:', err));

        res.json({ success: true, message: `Mensagens para ${targets.length} membros foram adicionadas à fila de envio do WhatsApp.` });
    } catch (err) {
        console.error('[WA] Erro na rota de envio:', err);
        res.status(500).json({ error: 'Erro ao processar envio' });
    }
});

// --- API de Chat Integrado via WhatsApp Proxy ---

const getWhatsAppSettings = async () => {
    const result = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
    return result.rows[0];
};

const getBaseDomain = (url) => {
    if (!url) return '';
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : '';
};

const getSenderFirstName = async (user) => {
    if (user.personId) {
        const res = await db.query('SELECT name FROM people WHERE id = $1', [user.personId]);
        if (res.rows.length > 0 && res.rows[0].name) {
            return res.rows[0].name.trim().split(' ')[0];
        }
    }
    return (user.username || 'Sistema').trim().split(' ')[0];
};

app.get('/api/whatsapp/chats', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/chats`;

        const response = await fetch(url, {
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('[WA-PROXY] Erro ao buscar chats:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/whatsapp/chats/:chatId/messages', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId } = req.params;
    const limit = req.query.limit || 50;
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/chats/${chatId}/messages?limit=${limit}`;

        const response = await fetch(url, {
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const messages = await response.json();

        if (Array.isArray(messages) && messages.length > 0) {
            const messageIds = messages.map(m => m.id).filter(Boolean);
            if (messageIds.length > 0) {
                try {
                    const sendersResult = await db.query(
                        'SELECT message_id, sender_name FROM whatsapp_message_senders WHERE message_id = ANY($1)',
                        [messageIds]
                    );
                    const sendersMap = {};
                    sendersResult.rows.forEach(row => {
                        sendersMap[row.message_id] = row.sender_name;
                    });
                    messages.forEach(m => {
                        if (sendersMap[m.id]) {
                            m.senderSystemName = sendersMap[m.id];
                        }
                    });
                } catch (dbErr) {
                    console.error('[WA-PROXY] Erro ao buscar nomes dos remetentes no banco:', dbErr.message);
                }
            }
        }

        res.json(messages);
    } catch (err) {
        console.error('[WA-PROXY] Erro ao buscar mensagens:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/whatsapp/chats/:chatId/avatar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId } = req.params;
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.sendStatus(404);
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/chats/${chatId}/avatar`;

        const response = await fetch(url, {
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            return res.redirect('https://via.placeholder.com/150?text=No+Avatar');
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('[WA-PROXY] Erro ao buscar avatar:', err.message);
        res.redirect('https://via.placeholder.com/150?text=No+Avatar');
    }
});

app.get('/api/whatsapp/media/:messageId', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { messageId } = req.params;
    const { chatId } = req.query;
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/messages/${messageId}/media?chatId=${chatId}`;

        const response = await fetch(url, {
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);

        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
            res.setHeader('Content-Disposition', contentDisposition);
        }

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('[WA-PROXY] Erro ao buscar mídia:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/send-text', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
        return res.status(400).json({ error: 'Parâmetros chatId e message são obrigatórios.' });
    }

    const targetNumber = (chatId.includes('@g.us') || chatId.includes('@lid')) ? chatId : chatId.split('@')[0];

    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/send-text`;

        const senderName = await getSenderFirstName(req.user);
        const formattedMessage = `*${senderName}*:\n${message}`;

        console.log(`[WA-PROXY] Enviando texto para chatId: ${chatId}, targetNumber: ${targetNumber}`);

        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            },
            body: JSON.stringify({ number: targetNumber, message: formattedMessage })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const data = await response.json();

        // Salva mapeamento do remetente no banco de dados
        const msgId = data.messageId || data.id || (data.message && data.message.id) || (data.key && data.key.id) || (data.data && data.data.id);
        if (msgId) {
            try {
                await db.query(
                    'INSERT INTO whatsapp_message_senders (message_id, sender_name) VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING',
                    [msgId, senderName]
                );
            } catch (dbErr) {
                console.error('[WA-PROXY] Erro ao salvar remetente no banco:', dbErr.message);
            }
        }

        res.json(data);
    } catch (err) {
        console.error(`[WA-PROXY] Erro ao enviar mensagem de texto para chatId: ${chatId}, targetNumber: ${targetNumber}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/send-media', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId, media, fileName, caption } = req.body || {};
    if (typeof media !== 'string' || !/^data:[\w+./-]+;base64,[A-Za-z0-9+/=]+$/.test(media) || Buffer.byteLength(media.split(',')[1] || '', 'base64') > 10 * 1024 * 1024) return res.status(400).json({ error:'Envie um arquivo de até 10 MB.' });
    if (!chatId || !media) {
        return res.status(400).json({ error: 'Parâmetros chatId e media são obrigatórios.' });
    }

    const targetNumber = (chatId.includes('@g.us') || chatId.includes('@lid')) ? chatId : chatId.split('@')[0];

    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/send-media`;

        const senderName = await getSenderFirstName(req.user);
        const formattedCaption = caption ? `*${senderName}*:\n${caption}` : `*${senderName}*`;

        console.log(`[WA-PROXY] Enviando mídia para chatId: ${chatId}, targetNumber: ${targetNumber}`);

        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            },
            body: JSON.stringify({ number: targetNumber, media, fileName, caption: formattedCaption })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        const data = await response.json();

        // Salva mapeamento do remetente no banco de dados
        const msgId = data.messageId || data.id || (data.message && data.message.id) || (data.key && data.key.id) || (data.data && data.data.id);
        if (msgId) {
            try {
                await db.query(
                    'INSERT INTO whatsapp_message_senders (message_id, sender_name) VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING',
                    [msgId, senderName]
                );
            } catch (dbErr) {
                console.error('[WA-PROXY] Erro ao salvar remetente no banco:', dbErr.message);
            }
        }

        res.json(data);
    } catch (err) {
        console.error(`[WA-PROXY] Erro ao enviar mídia para chatId: ${chatId}, targetNumber: ${targetNumber}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/chats/:chatId/seen', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId } = req.params;
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/chats/${chatId}/seen`;

        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[WA-PROXY] Erro ao marcar como lido:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/whatsapp/chats/:chatId/messages/:messageId', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { chatId, messageId } = req.params;
    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const url = `${domain}/api/v1/instances/${settings.instance_id}/chats/${chatId}/messages/${messageId}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'x-api-key': settings.api_key,
                'Authorization': `Bearer ${settings.api_key}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro na API externa: Status ${response.status} - ${errText}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[WA-PROXY] Erro ao revogar mensagem:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/whatsapp/chat-sse', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);

    try {
        const settings = await getWhatsAppSettings();
        if (!settings || !settings.api_key) {
            return res.status(400).json({ error: 'Configurações de WhatsApp não encontradas.' });
        }
        const domain = getBaseDomain(settings.base_url);
        const sseUrl = `${domain}/api/v1/instances/${settings.instance_id}/chat-sse?api_key=${settings.api_key}`;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const https = require('https');
        const http = require('http');
        const client = sseUrl.startsWith('https') ? https : http;

        const sseReq = client.get(sseUrl, (sseRes) => {
            sseRes.pipe(res);
        });

        sseReq.on('error', (err) => {
            console.error('[WA-PROXY] Erro no request SSE:', err.message);
            res.end();
        });

        req.on('close', () => {
            sseReq.destroy();
        });
    } catch (err) {
        console.error('[WA-PROXY] Erro no canal SSE:', err.message);
        res.end();
    }
});

// --- API de Galeria de Fotos (Site Institucional) ---

app.get('/api/site-albums', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM site_albums ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar álbuns:', err);
        res.status(500).json({ error: 'Erro ao buscar álbuns' });
    }
});

app.post('/api/site-albums', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário' && req.user.role !== 'social_midia') return res.sendStatus(403);
    const { title, description, cover_url, album_url } = req.body || {};

    if (!title || !cover_url) {
        return res.status(400).json({ error: 'Título e link da foto de capa são obrigatórios.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO site_albums (title, description, cover_url, album_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description || null, cover_url, album_url || null]
        );
        logAction(req, 'CREATE_ALBUM', { id: result.rows[0].id, title });
        res.json({ success: true, album: result.rows[0] });
    } catch (err) {
        console.error('Erro ao cadastrar álbum:', err);
        res.status(500).json({ error: 'Erro ao cadastrar álbum' });
    }
});

app.put('/api/site-albums/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário' && req.user.role !== 'social_midia') return res.sendStatus(403);
    const { id } = req.params;
    const { title, description, cover_url, album_url } = req.body || {};

    if (!title || !cover_url) {
        return res.status(400).json({ error: 'Título e link da foto de capa são obrigatórios.' });
    }

    try {
        const result = await db.query(
            'UPDATE site_albums SET title = $1, description = $2, cover_url = $3, album_url = $4 WHERE id = $5 RETURNING *',
            [title, description || null, cover_url, album_url || null, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Álbum não encontrado.' });
        logAction(req, 'UPDATE_ALBUM', { id, title });
        res.json({ success: true, album: result.rows[0] });
    } catch (err) {
        console.error('Erro ao atualizar álbum:', err);
        res.status(500).json({ error: 'Erro ao atualizar álbum' });
    }
});

app.delete('/api/site-albums/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário' && req.user.role !== 'social_midia') return res.sendStatus(403);
    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM site_albums WHERE id = $1 RETURNING title', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Álbum não encontrado.' });

        logAction(req, 'DELETE_ALBUM', { id, title: result.rows[0].title });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir álbum:', err);
        res.status(500).json({ error: 'Erro ao excluir álbum' });
    }
});

// --- Lógica de Lembretes Automáticos (CRON) ---


// Envia lembretes para quem ainda não pagou a mensalidade do mês atual
const sendPaymentReminders = async () => {
    try {
        const officialDate = civilParts(new Date(), process.env.APP_TIMEZONE || 'America/Sao_Paulo');
        const currentMonth = Number(officialDate.month);
        const currentYear = Number(officialDate.year);

        // Busca membros que NÃO possuem pagamento aprovado este mês
        const unpaidMembers = await db.query(`
            SELECT p.id as person_id, p.name, p.phone, u.id as user_id, u.username
            FROM people p
            LEFT JOIN users u ON p.id = u.person_id
            WHERE p.id NOT IN (
                SELECT person_id FROM payments
                WHERE month = $1 AND year = $2 AND status = 'approved'
            )
        `, [currentMonth, currentYear]);

        console.log(`[CRON] Enviando lembretes para ${unpaidMembers.rows.length} membros.`);

        // Busca configurações do WhatsApp
        const waResult = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
        const waSettings = waResult.rows[0];
        const waEnabled = waSettings && waSettings.enabled;

        const getMonthNamePT = (monthNumber) => {
            const months = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            return months[monthNumber - 1] || '';
        };
        const currentMonthName = getMonthNamePT(currentMonth);

        for (let i = 0; i < unpaidMembers.rows.length; i++) {
            const member = unpaidMembers.rows[i];

            // 1. Envia notificações internas do sistema e push se o membro tiver um usuário vinculado
            if (member.user_id) {
                const title = 'Lembrete de Mensalidade';
                const content = `Olá ${member.name || member.username}, lembramos que a mensalidade deste mês ainda está pendente. Regularize para nos ajudar a manter o clube!`;

                // Salva no banco de notificações do sistema
                await db.query(`
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES ($1, $2, $3, 'automated_reminder')
                `, [member.user_id, title, content]);

                // Envia Push (Notificação para Celular)
                const pushResult = await db.query('SELECT subscription_data FROM push_subscriptions WHERE user_id = $1', [member.user_id]);
                const payload = JSON.stringify({ title, body: content });

                pushResult.rows.forEach(sub => {
                    webPush.sendNotification(JSON.parse(sub.subscription_data), payload).catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            db.query('DELETE FROM push_subscriptions WHERE subscription_data = $1', [sub.subscription_data]);
                        }
                    });
                });
            }

            // 2. Envia WhatsApp se habilitado e o membro tiver telefone cadastrado
            if (waEnabled && process.env.WHATSAPP_WORKER_ENABLED === 'true' && member.phone) {
                const normalizedPhone = normalizePhoneNumber(member.phone);
                if (normalizedPhone) {
                    // Substitui variáveis do template e processa spintax
                    const waMessage = (waSettings.reminder_template || 'Olá {nome}, sua mensalidade de {mes} está pendente.')
                        .replace(/{nome}/g, member.name)
                        .replace(/{mensalidade}/g, currentMonthName)
                        .replace(/{mes}/g, currentMonthName)
                        .replace(/{valor}/g, '20,00')
                        .replace(/{pix}/g, 'jdboavista.ap@adventistas.org');
                    const finalMessage = parseSpintax(waMessage);

                    console.log(`[CRON-WA] Enfileirando lembrete de WhatsApp para ${member.name} (${normalizedPhone}).`);
                    await db.query(
                        'INSERT INTO whatsapp_queue (phone, message, status) VALUES ($1, $2, $3)',
                        [normalizedPhone, finalMessage, 'pending']
                    );
                }
            }
        }

        // Acorda o worker da fila
        processWhatsAppQueue().catch(err => console.error('[WA-WORKER] Erro ao acordar worker após lembretes automáticos:', err));
    } catch (err) {
        console.error('[CRON] Erro no processamento automático:', err);
    }
};

// Agendamento CRON: Roda todos os dias às 09:00 (Verifica dias 5 e 20)
schedule('0 9,19 * * *', async () => {
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{ timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
        const day=Number(parts.day), hour=Number(parts.hour), date=parts.year+'-'+parts.month+'-'+parts.day;
        const weekday=new Date(date+'T12:00:00Z').getUTCDay();
        const workingDays=Array.from({length:day},(_,i)=>new Date(parts.year+'-'+parts.month+'-'+String(i+1).padStart(2,'0')+'T12:00:00Z').getUTCDay()).filter(d=>d>0&&d<6).length;
        const due=(day===20 && hour===(weekday===6?19:9)) || (hour===9 && weekday>0 && weekday<6 && workingDays===5);
        if (!due) return;
        const claim=await db.query('INSERT INTO reminder_runs (run_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING run_key',['monthly:'+date]);
        if (claim.rowCount) await sendPaymentReminders();
    } catch(err) { console.error('[CRON]',err.message); }
}, { timezone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });

// Agendamento CRON: Roda a cada minuto para verificar e disparar lembretes agendados
schedule('* * * * *', async () => {
    // Garante que a fila do WhatsApp esteja ativa se houver envios pendentes
    processWhatsAppQueue().catch(err => console.error('[CRON] Erro ao acordar worker da fila:', err));

    try {
        // Busca lembretes pendentes agendados para a data/hora atual ou passados que ainda não foram enviados
        if (process.env.WHATSAPP_WORKER_ENABLED !== 'true') return;
        const waCheck = (await db.query('SELECT enabled FROM whatsapp_settings LIMIT 1')).rows[0];
        if (!waCheck?.enabled) return;
        const pendingReminders = await db.query(`UPDATE scheduled_reminders SET status='processing', claimed_at=NOW() WHERE id IN (
            SELECT id FROM scheduled_reminders WHERE status='pending' AND scheduled_at<=NOW() FOR UPDATE SKIP LOCKED LIMIT 10
        ) RETURNING *`);

        if (pendingReminders.rows.length === 0) return;

        console.log(`[CRON-SCH] Encontrados ${pendingReminders.rows.length} lembretes pendentes para processar.`);

        // Busca configurações do WhatsApp
        const waResult = await db.query('SELECT * FROM whatsapp_settings LIMIT 1');
        const waSettings = waResult.rows[0];

        if (!waSettings) {
            console.error('[CRON-SCH] Configurações de WhatsApp não encontradas. Abortando.');
            return;
        }

        for (const reminder of pendingReminders.rows) {
            try {
                // Atualiza status para processing para evitar duplicidade de disparos
                await db.query('UPDATE scheduled_reminders SET status = $1 WHERE id = $2', ['processing', reminder.id]);

                let targets = [];

                if (reminder.target_type === 'all') {
                    const result = await db.query('SELECT id, name, phone FROM people WHERE phone IS NOT NULL');
                    targets = result.rows;
                } else if (reminder.target_type === 'unit') {
                    const result = await db.query('SELECT id, name, phone FROM people WHERE phone IS NOT NULL AND LOWER(unit) = LOWER($1)', [reminder.target_value]);
                    targets = result.rows;
                } else if (reminder.target_type === 'selected') {
                    const personIds = JSON.parse(reminder.target_value);
                    const result = await db.query('SELECT id, name, phone FROM people WHERE phone IS NOT NULL AND id = ANY($1::int[])', [personIds]);
                    targets = result.rows;
                }

                if (targets.length === 0) {
                    await db.query('UPDATE scheduled_reminders SET status = $1, error_message = $2 WHERE id = $3', ['skipped', 'Nenhum contato encontrado com telefone cadastrado.', reminder.id]);
                    continue;
                }

                console.log(`[CRON-SCH] Processando lembrete ID ${reminder.id} para ${targets.length} contatos.`);

                const client=await db.pool.connect();
                let count=0;
                try {
                    await client.query('BEGIN');
                    for (const target of targets) {
                        const phone=normalizePhoneNumber(target.phone);
                        if (!phone) continue;
                        await client.query('INSERT INTO whatsapp_queue (phone,message,status,reminder_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[phone,parseSpintax(reminder.message.replace(/{nome}/g,target.name)),'pending',reminder.id]);
                        count++;
                    }
                    await client.query('UPDATE scheduled_reminders SET status=$1 WHERE id=$2',[count?'queued':'skipped',reminder.id]);
                    await client.query('COMMIT');
                } catch(err) { await client.query('ROLLBACK'); throw err; }
                finally { client.release(); }
                console.log(`[CRON-SCH] Lembrete ID ${reminder.id} enfileirado com sucesso.`);

                // Acorda o worker da fila
                processWhatsAppQueue().catch(err => console.error('[WA-WORKER] Erro ao acordar worker após agendamento:', err));

            } catch (innerErr) {
                console.error(`[CRON-SCH] Erro no processamento individual do lembrete ID ${reminder.id}:`, innerErr);
                await db.query('UPDATE scheduled_reminders SET status = $1, error_message = $2 WHERE id = $3', ['error', innerErr.message, reminder.id]);
            }
        }

    } catch (err) {
        console.error('[CRON-SCH] Erro geral no agendador:', err);
    }
});

// Busca todas as especialidades
app.get('/api/especialidades', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM especialidades ORDER BY categoria, nome');
        res.json(result.rows);
    } catch (err) {
        console.error('[API] Erro ao buscar especialidades:', err);
        res.status(500).json({ error: 'Erro interno ao buscar especialidades.' });
    }
});

app.post('/api/especialidades', authenticateToken, upload.single('imagem'), async (req, res) => {
    try {
        if (!isStaff(req.user)) return res.sendStatus(403);

        const { nome, categoria, codigo, nivel, ano, instituicao, requisitos } = req.body;

        let imagem_url = null;
        if (req.file) {
            const compressed = await compressReceipt(req.file);
            const filename = `especialidade-${Date.now()}${path.extname(req.file.originalname)}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filename, compressed.buffer, {
                    contentType: compressed.mimetype,
                    upsert: true
                });

            if (uploadError) {
                console.error('[STORAGE] Erro upload imagem especialidade:', uploadError);
                return res.status(500).json({ error: 'Erro ao fazer upload da imagem.' });
            }
            imagem_url = `/api/public-images/${filename}`;
        }

        const result = await db.query(
            `INSERT INTO especialidades (nome, categoria, codigo, nivel, ano, instituicao, imagem_url, requisitos)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [nome, categoria, codigo, nivel, ano, instituicao, imagem_url, requisitos]
        );

        logAction(req, 'CREATE_ESPECIALIDADE', { especialidade_id: result.rows[0].id, nome });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[API] Erro ao criar especialidade:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.put('/api/especialidades/:id', authenticateToken, upload.single('imagem'), async (req, res) => {
    try {
        if (!isStaff(req.user)) return res.sendStatus(403);

        const { id } = req.params;
        const { nome, categoria, codigo, nivel, ano, instituicao, requisitos } = req.body;
        let imagem_url = req.body.imagem_url_existente;

        if (req.file) {
            const compressed = await compressReceipt(req.file);
            const filename = `especialidade-${Date.now()}${path.extname(req.file.originalname)}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filename, compressed.buffer, {
                    contentType: compressed.mimetype,
                    upsert: true
                });

            if (uploadError) {
                console.error('[STORAGE] Erro upload imagem:', uploadError);
                return res.status(500).json({ error: 'Erro ao upload' });
            }
            imagem_url = `/api/public-images/${filename}`;
        }

        const result = await db.query(
            `UPDATE especialidades
             SET nome = $1, categoria = $2, codigo = $3, nivel = $4, ano = $5, instituicao = $6, imagem_url = $7, requisitos = $8
             WHERE id = $9 RETURNING *`,
            [nome, categoria, codigo, nivel, ano, instituicao, imagem_url, requisitos, id]
        );

        logAction(req, 'UPDATE_ESPECIALIDADE', { especialidade_id: id, nome });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[API] Erro ao atualizar especialidade:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.delete('/api/especialidades/:id', authenticateToken, async (req, res) => {
    try {
        if (!isStaff(req.user)) return res.sendStatus(403);
        const { id } = req.params;

        await db.query('DELETE FROM especialidades WHERE id = $1', [id]);
        logAction(req, 'DELETE_ESPECIALIDADE', { especialidade_id: id });
        res.sendStatus(204);
    } catch (err) {
        console.error('[API] Erro ao deletar especialidade:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status=err.status || (err.code==='23505' ? 409 : err.code==='LIMIT_FILE_SIZE' ? 413 : 500);
    console.error('[API]', req.method, req.path, err.message);
    res.status(status).json({ error: status===500 ? 'Erro interno. Tente novamente mais tarde.' : status===409 ? 'Registro duplicado ou conflito de atualização.' : err.message });
});
async function start() {
    await migrate(db);
    await initDB();
    await syncMemberUsers();
    await db.query('ALTER TABLE whatsapp_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ');
    await db.query('ALTER TABLE scheduled_reminders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ');
    await db.query("UPDATE whatsapp_queue SET status='error', error_message='Envio interrompido. Confira no provedor antes de tentar novamente.' WHERE status='sending' AND COALESCE(claimed_at,created_at) < NOW() - INTERVAL '15 minutes'");
    await db.query("UPDATE scheduled_reminders SET status='error', error_message='Processamento interrompido; confira a fila antes de reagendar.' WHERE status='processing' AND COALESCE(claimed_at,created_at) < NOW() - INTERVAL '15 minutes'");
    processWhatsAppQueue().catch(console.error);
    scheduledTasks.forEach(task => task.start());
    setInterval(() => { cleanupLogs(); db.query('DELETE FROM request_limits WHERE expires_at<NOW()').catch(console.error); }, 3600000).unref();
    return app.listen(PORT, () => console.log('Servidor pronto na porta '+PORT));
}
if (require.main === module) start().catch(err => { console.error('[STARTUP]',err.message); process.exitCode=1; db.pool.end(); });
module.exports = { app, start };
