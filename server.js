require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const sharp = require('sharp');
const db = require('./database');
const UAParser = require('ua-parser-js');
const webPush = require('web-push');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

// --- Image Compression Helper ---
const compressReceipt = async (file) => {
    if (!file) return null;
    
    // Only compress images
    if (file.mimetype.startsWith('image/')) {
        try {
            console.log(`[COMPRESS] Otimizando imagem: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);
            const buffer = await sharp(file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();
            console.log(`[COMPRESS] Sucesso: ${(buffer.length / 1024).toFixed(1)} KB`);
            return {
                buffer,
                mimetype: 'image/jpeg' // We convert all to JPEG for better compression
            };
        } catch (err) {
            console.error('[COMPRESS] Erro ao comprimir imagem, usando original:', err);
            return { buffer: file.buffer, mimetype: file.mimetype };
        }
    }
    
    // Return original for PDFs and other files
    return { buffer: file.buffer, mimetype: file.mimetype };
};

console.log(`[SERVER] Started on PORT ${PORT} - ENV: ${process.env.NODE_ENV || 'development'}`);


if (!SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is missing!');
    process.exit(1);
}
const JWT_SECRET = SECRET || 'dev-secret-only';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Web Push Configuration ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPdV8b0gIcNWcgEfsVoyNMXrfBa-MFC4rMeqhDKC2PbN5O1Erq6aCo-E_4ev6SCgsalWP5WqpeZVcK95WV_GIhQ';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'bfjF8hipfmuLyvm6CJJZMHTnHIzGvHPTkm_gENlNubo';

webPush.setVapidDetails(
    'mailto:contato@tribodedavi.net.br',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Explicit root route for robustness
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Multer Config: Using MemoryStorage to store files in the database instead of disk
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- System Logs Helper ---
const logAction = async (req, action, details = {}) => {
    try {
        const ua = req.headers['user-agent'];
        const parser = new UAParser(ua);
        const result = parser.getResult();
        
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (ip === '::1') ip = '127.0.0.1';
        if (ip.startsWith('::ffff:')) ip = ip.split(':').pop();
        
        const userId = req.user ? req.user.id : (details.userId || null);
        const username = req.user ? req.user.username : (details.username || 'guest');

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

// --- Log Cleanup Policy (24h) ---
const cleanupLogs = async () => {
    try {
        const result = await db.query("DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '1 day'");
        if (result.rowCount > 0) {
            console.log(`[CLEANUP] ${result.rowCount} logs antigos removidos.`);
        }
    } catch (err) {
        console.error('Error cleaning up logs:', err);
    }
};

// Executa limpeza a cada hora
setInterval(cleanupLogs, 60 * 60 * 1000);

// Middleware: Auth
const authenticateToken = (req, res, next) => {
    // Check if token is in header or in query string
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
        console.error(`[AUTH] Verificação falhou: ${err.message}`);
        return res.status(401).json({ error: 'Sessão inválida', details: err.message });
    }
    
    try {
        // Check mandatory password change in DB
        const result = await db.query('SELECT must_change_password, username, role, person_id FROM users WHERE id = $1', [decoded.id]);
        const dbUser = result.rows[0];
        
        if (!dbUser) {
            console.warn(`[AUTH] Usuário ID ${decoded.id} não encontrado no banco.`);
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        // Block access if password change is required (except for auth status and change-password)
        const allowedPaths = ['/api/auth/change-password', '/api/auth/status'];
        if (dbUser.must_change_password && !allowedPaths.includes(req.path)) {
            return res.status(403).json({ error: 'Alteração de senha obrigatória', mustChangePassword: true });
        }

        req.user = {
            id: decoded.id,
            username: dbUser.username,
            role: dbUser.role || 'member',
            personId: dbUser.person_id ? parseInt(dbUser.person_id) : null
        };

        console.log(`[AUTH] Usuário: ${req.user.username} | Role: ${req.user.role} | ID: ${req.user.personId}`);
        
        // Log network protocol info for every authenticated request
        logAction(req, 'NETWORK_HTTP_REQUEST', { 
            method: req.method, 
            path: req.path, 
            protocol: req.protocol,
            httpVersion: req.httpVersion
        });
        
        next();
    } catch (err) {
        console.error('Auth DB error:', err);
        res.status(500).json({ error: 'Erro ao verificar autenticação' });
    }
  });
};

// --- Sync Members to Users ---
const syncMemberUsers = async () => {
    try {
        const peopleResult = await db.query('SELECT id, name FROM people');
        const people = peopleResult.rows;
        
        // Generate default hash once
        const defaultHash = await bcrypt.hash('tribo@2026', 10);

        for (const p of people) {
            // Generate username: first.last (no accents, lowercase)
            const nameParts = p.name.trim().split(' ');
            const first = nameParts[0].toLowerCase();
            const last = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
            
            let baseUsername = last ? `${first}.${last}` : first;
            // Remove accents/diacritics
            baseUsername = baseUsername.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            const username = baseUsername;
            // Check if person already has a user
            const existing = await db.query('SELECT id FROM users WHERE person_id = $1', [p.id]);
            if (existing.rows.length === 0) {
                try {
                    await db.query(
                        'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (username) DO NOTHING',
                        [username, defaultHash, 'member', p.id]
                    );
                } catch (err) {
                    const fallbackName = `${username}${p.id}`;
                    await db.query(
                        'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT DO NOTHING',
                        [fallbackName, defaultHash, 'member', p.id]
                    );
                }
            }
        }
    } catch (err) {
        console.error('Error syncing members:', err);
    }
};
// --- Init Database Tables ---
const initDB = async () => {
    try {
        await db.query(`
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
        console.log('[DB] Tables verified/created.');
    } catch (err) {
        console.error('[DB] Error initializing tables:', err);
    }
};
initDB();
syncMemberUsers();

// --- AUTH API ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const result = await db.query(`
        SELECT u.*, p.name 
        FROM users u 
        LEFT JOIN people p ON u.person_id = p.id 
        WHERE u.username ILIKE $1
    `, [username]);
    const user = result.rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const { role, username: dbUsername, person_id, must_change_password, id: userId } = user;
    const { force } = req.body || {};

    const finalRole = role || 'member';
    const personId = person_id || null;
    
    const token = jwt.sign({ 
      id: userId, 
      username: dbUsername, 
      role: finalRole, 
      personId: personId
    }, JWT_SECRET, { expiresIn: '12h' });

    console.log(`Login Successful: ${dbUsername} as ${finalRole} ${force ? '[FORCED]' : ''}`);
    
    // Log success
    logAction(req, 'LOGIN_SUCCESS', { username: dbUsername, userId, force: !!force });

    res.json({ 
      token, 
      role: finalRole, 
      username: dbUsername,
      name: user.name || dbUsername,
      personId: personId,
      mustChangePassword: !!must_change_password
    });
  } catch (err) {
    console.error('Login error:', err);
    logAction(req, 'LOGIN_FAILED', { username, error: err.message });
    res.status(500).json({ error: 'Erro no servidor durante login' });
  }
});

app.get('/api/auth/status', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.must_change_password, u.role, u.person_id, u.username, p.name 
            FROM users u 
            LEFT JOIN people p ON u.person_id = p.id 
            WHERE u.id = $1
        `, [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        
        res.json({
            mustChangePassword: !!user.must_change_password,
            role: user.role,
            username: user.username,
            name: user.name || user.username,
            personId: user.person_id
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
});

app.post('/api/auth/reset-lost-password', async (req, res) => {
    const { username, cpf, newPassword } = req.body || {};
    
    if (!username || !cpf || !newPassword) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    // Complexity check
    const complexityRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{5,}$/;
    if (!complexityRegex.test(newPassword)) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 5 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.' });
    }

    try {
        const result = await db.query(`
            SELECT u.id 
            FROM users u
            JOIN people p ON u.person_id = p.id
            WHERE u.username ILIKE $1 AND p.cpf = $2
        `, [username, cpf]);

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Usuário ou CPF incorretos' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword, salt);
        
        await db.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, user.id]);
        
        res.json({ success: true, message: 'Senha redefinida com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body || {};
    
    if (!newPassword) {
        return res.status(400).json({ error: 'Nova senha é obrigatória' });
    }

    const complexityRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{5,}$/;
    if (!complexityRegex.test(newPassword)) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 5 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.' });
    }

    try {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword, salt);
        
        await db.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, req.user.id]);
        
        res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// --- NOTIFICATIONS API ---
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

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar notificações' });
    }
});

// --- PEOPLE API ---
app.get('/api/people', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'secretário') {
      const result = await db.query(`
        SELECT p.*, u.username, u.role 
        FROM people p 
        LEFT JOIN users u ON p.id = u.person_id 
        ORDER BY p.name ASC
      `);
      return res.json(result.rows);
    }
    
    // Member access: Only their own data
    if (!req.user.personId) return res.json([]);
    const result = await db.query('SELECT * FROM people WHERE id = $1', [req.user.personId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

app.post('/api/people', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
  
  let { name, responsible, birth_date, cpf, unit, username, password, role } = req.body || {};
  if (!name || name.trim().split(/\s+/).length < 2) {
      return res.status(400).json({ error: 'O nome deve conter pelo menos Nome e Sobrenome.' });
  }
  if (!unit) {
      return res.status(400).json({ error: 'A unidade é obrigatória.' });
  }

  const client = await db.pool.connect();
  try {
      await client.query('BEGIN');
      
      const result = await client.query(
        'INSERT INTO people (name, responsible, birth_date, cpf, unit) VALUES ($1, $2, $3, $4, $5) RETURNING id', 
        [name, responsible || null, birth_date || null, cpf || null, unit || null]
      );
      
      const personId = result.rows[0].id;

      let finalUsernameUsed = '';
      // Handle user creation
      if (req.user.role === 'admin') {
          // Generate default username if not provided
          const nameParts = name.trim().split(/\s+/);
          const first = nameParts[0].toLowerCase();
          const last = nameParts[nameParts.length - 1].toLowerCase();
          const baseUsername = `${first}.${last}`;

          // If a username is provided manually, use it. Otherwise generate automatically.
          let finalUsername = username || baseUsername;
          // Ensure no accents and lowercase
          finalUsername = finalUsername.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          finalUsernameUsed = finalUsername;

          const finalRole = (req.user.username.toUpperCase() === 'ADMINISTRADOR' && role) ? role : 'member';

          await client.query(
              'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE)',
              [finalUsername, hash, finalRole, personId]
          );
      }

      await client.query('COMMIT');
      logAction(req, 'CREATE_PERSON', { id: personId, name, unit });
      res.json({ id: personId, name, username: finalUsernameUsed });
  } catch (err) {
      await client.query('ROLLBACK');
      console.error('Create Person Error:', err);
      res.status(500).json({ error: 'Erro ao cadastrar membro' });
  } finally {
      client.release();
  }
});

app.post('/api/people/import', authenticateToken, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  
  // Restriction: Only master admin can import (because it creates users)
  if (req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Apenas o administrador master pode importar planilhas.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const client = await db.pool.connect();
  try {
    const workbook = xlsx.read(req.file.buffer);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    let count = 0;
    
    await client.query('BEGIN');
    try {
        for (const item of data) {
            const keys = Object.keys(item);
            const nameKey = keys.find(k => k.trim().toUpperCase() === 'NOME');
            const unitKey = keys.find(k => k.trim().toUpperCase() === 'UNIDADE');
            const birthKey = keys.find(k => k.trim().toUpperCase().includes('NASCIMENTO'));
            
            const name = nameKey ? item[nameKey] : null;
            const unit = unitKey ? item[unitKey] : null;
            let birthDate = birthKey ? item[birthKey] : null;

            // Simple date conversion if Excel number
            if (typeof birthDate === 'number') {
                const date = xlsx.utils.format_cell({ v: birthDate, t: 'd' });
                birthDate = date;
            }
            
            if (name) {
                await client.query(
                    'INSERT INTO people (name, unit, birth_date) VALUES ($1, $2, $3)', 
                    [name.toString().trim(), unit ? unit.toString().trim() : null, birthDate || null]
                );
                count++;
            }
        }
        await client.query('COMMIT');
        
        // Trigger user sync to create accounts for new people
        console.log(`[IMPORT] Success. Synching ${count} new members to users...`);
        syncMemberUsers(); 

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

app.get('/api/payments', authenticateToken, async (req, res) => {
  const { year } = req.query;
  const targetYear = parseInt(year) || new Date().getFullYear();

  try {
    if (req.user.role === 'admin') {
      const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, rejection_reason FROM payments WHERE year = $1', [targetYear]);
      return res.json(result.rows);
    }

    if (!req.user.personId) return res.json([]);
    const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, rejection_reason FROM payments WHERE person_id = $1 AND year = $2', [req.user.personId, targetYear]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

app.get('/api/payments/detail/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, rejection_reason FROM payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

app.post('/api/payments', authenticateToken, upload.single('receipt'), async (req, res) => {
  const { person_id, month, year, amount, months } = req.body;
  
  if (!person_id || (!month && !months) || !year || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const monthList = months ? JSON.parse(months) : [month];
  const amountPerMonth = (parseFloat(amount) / monthList.length).toFixed(2);
  const status = req.user.role === 'admin' ? 'approved' : 'pending';

  try {
    // Process Receipt (only once for all months)
    const compressed = await compressReceipt(req.file);
    const receipt_content = compressed ? compressed.buffer : null;
    const receipt_mime = compressed ? compressed.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

    let isUploadedToStorage = false;
    if (req.file && compressed) {
        console.log(`[STORAGE] Multi-month upload to Supabase: ${receipt_filename}`);
        const { error } = await supabase.storage
            .from('receipts')
            .upload(receipt_filename, compressed.buffer, {
                contentType: compressed.mimetype,
                upsert: true
            });
        
        if (!error) isUploadedToStorage = true;
        else console.error('[STORAGE] Error in multi-month upload:', error);
    }

    const finalDBContent = isUploadedToStorage ? null : receipt_content;
    const results = [];

    // Common data for logs and notifications
    const personResult = await db.query("SELECT name FROM people WHERE id = $1", [person_id]);
    const personName = personResult.rows[0]?.name || 'Membro';
    const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");

    for (const m of monthList) {
        const existingResult = await db.query('SELECT id FROM payments WHERE person_id = $1 AND month = $2 AND year = $3', [person_id, m, year]);
        const existing = existingResult.rows[0];

        if (existing) {
            await db.query(`
                UPDATE payments 
                SET amount = $1, receipt_path = $2, receipt_content = $3, receipt_mime = $4, status = $5, rejection_reason = NULL 
                WHERE id = $6
            `, [amountPerMonth, receipt_path, finalDBContent, receipt_mime, status, existing.id]);
            
            if (status === 'pending') {
                for (const admin of adminsResult.rows) {
                    await createNotification(admin.id, 'Novo Comprovante', `O membro ${personName} atualizou um comprovante para o mês de ${monthNames[m-1]}.`, 'info', existing.id, 'monthly');
                }
            }
            results.push({ id: existing.id, updated: true });
        } else {
            const insertResult = await db.query(`
                INSERT INTO payments (person_id, month, year, amount, receipt_path, receipt_content, receipt_mime, status) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING id
            `, [person_id, m, year, amountPerMonth, receipt_path, finalDBContent, receipt_mime, status]);
            const newId = insertResult.rows[0].id;

            if (status === 'pending') {
                for (const admin of adminsResult.rows) {
                    await createNotification(admin.id, 'Novo Comprovante', `O membro ${personName} enviou um novo comprovante para o mês de ${monthNames[m-1]}.`, 'info', newId, 'monthly');
                }
            }
            results.push({ id: newId, updated: false });
        }
    }

    logAction(req, 'CREATE_PAYMENT_BATCH', { person_id, months: monthList, year, total_amount: amount, status });
    res.json({ results, status });

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao salvar pagamentos' });
  }
});

// Approval Endpoints
app.post('/api/payments/:id/approve', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    try {
        const paymentResult = await db.query('SELECT person_id, month FROM payments WHERE id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE payments SET status = \'approved\', rejection_reason = NULL WHERE id = $1', [req.params.id]);
        
        // Notify Member
        const userResult = await db.query('SELECT id FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento Aprovado', `Seu pagamento do mês de ${monthNames[payment.month-1]} foi aprovado com sucesso!`, 'success');
        }

        res.json({ success: true });
        logAction(req, 'APPROVE_PAYMENT', { id: req.params.id, person_id: payment.person_id, month: payment.month });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao aprovar pagamento' });
    }
});

app.post('/api/payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};
    
    try {
        const paymentResult = await db.query('SELECT person_id, month FROM payments WHERE id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE payments SET status = \'rejected\', rejection_reason = $1 WHERE id = $2', [reason || 'Comprovante inválido', req.params.id]);
        
        // Notify Member
        const userResult = await db.query('SELECT id FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento Rejeitado', `Seu pagamento do mês de ${monthNames[payment.month-1]} foi rejeitado. Motivo: ${reason || 'Comprovante inválido'}. Por favor, corrija-o.`, 'error');
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao rejeitar pagamento' });
    }
});

// Delete payment
app.delete('/api/payments/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  try {
    await db.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar pagamento' });
  }
});

// Update person
app.put('/api/people/:id', authenticateToken, async (req, res) => {
  try {
    let { name, responsible, birth_date, cpf, unit, username, password, role } = req.body || {};
    if (username) username = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const { id } = req.params;
    
    if (req.user.role !== 'admin' && parseInt(id) !== req.user.personId) {
        return res.sendStatus(403);
    }

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    // Update people table
    const updateResult = await db.query('UPDATE people SET name = $1, responsible = $2, birth_date = $3, cpf = $4, unit = $5 WHERE id = $6', 
      [name, responsible || null, birth_date || null, cpf || null, unit || null, id]);
    
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // Update user credentials - ALLOW all admins except for targeting master admin
    if (req.user.role === 'admin' && username) {
        const userCheck = await db.query('SELECT id, username FROM users WHERE person_id = $1', [id]);
        const existingUser = userCheck.rows[0];
        
        if (existingUser) {
            // Protection: Sub-admins cannot edit the master admin
            if (existingUser.username.toUpperCase() === 'ADMINISTRADOR' && req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
                console.warn(`[AUTH] Tentativa de sub-admin (${req.user.username}) editar o admin master.`);
                // We just skip the user update part for safety
            } else {
                if (password) {
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync(password, salt);
                    
                    // Master can change role
                    if (req.user.username.toUpperCase() === 'ADMINISTRADOR' && role) {
                        await db.query('UPDATE users SET username = $1, password_hash = $2, role = $3, must_change_password = TRUE WHERE id = $4', 
                          [username, hash, role, existingUser.id]);
                    } else {
                        await db.query('UPDATE users SET username = $1, password_hash = $2, must_change_password = TRUE WHERE id = $3', 
                          [username, hash, existingUser.id]);
                    }
                } else {
                    // Master can change role even without password change
                    if (req.user.username.toUpperCase() === 'ADMINISTRADOR' && role) {
                        await db.query('UPDATE users SET username = $1, role = $2 WHERE id = $3', [username, role, existingUser.id]);
                    } else {
                        await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, existingUser.id]);
                    }
                }
            }
        }
    }

    res.json({ success: true });
    logAction(req, 'UPDATE_PERSON', { id, name, unit });
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Delete person
app.delete('/api/people/:id', authenticateToken, async (req, res) => {
  // ONLY master admin can delete accounts/people
  if (req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Apenas o administrador master pode excluir registros.' });
  }

  try {
    // Extra protection: ensure we don't delete the person linked to the admin user
    const targetUser = await db.query('SELECT username FROM users WHERE person_id = $1', [req.params.id]);
    if (targetUser.rows[0] && targetUser.rows[0].username.toUpperCase() === 'ADMINISTRADOR') {
        return res.status(403).json({ error: 'O usuário administrador master não pode ser excluído.' });
    }

    await db.query('DELETE FROM people WHERE id = $1', [req.params.id]);
    res.json({ success: true });
    logAction(req, 'DELETE_PERSON', { id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar membro' });
  }
});

// --- EVENTS API ---
app.get('/api/events', authenticateToken, async (req, res) => {
    try {
        let queryText = '';
        let params = [];

        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            queryText = `
                SELECT e.*, 
                       (SELECT COUNT(*) FROM event_participants WHERE event_id = e.id) as total_participants,
                       (SELECT jsonb_object_agg(COALESCE(unit, 'S/U'), count) 
                        FROM (
                            SELECT p.unit, COUNT(*) as count 
                            FROM event_participants ep 
                            JOIN people p ON ep.person_id = p.id 
                            WHERE ep.event_id = e.id 
                            GROUP BY p.unit
                        ) unit_counts) as unit_counts
                FROM events e
                ORDER BY e.date ASC
            `;
        } else {
            queryText = `
                SELECT e.*,
                       (SELECT COUNT(*) FROM event_participants WHERE event_id = e.id) as total_participants,
                       (SELECT jsonb_object_agg(COALESCE(unit, 'S/U'), count) 
                        FROM (
                            SELECT p.unit, COUNT(*) as count 
                            FROM event_participants ep 
                            JOIN people p ON ep.person_id = p.id 
                            WHERE ep.event_id = e.id 
                            GROUP BY p.unit
                        ) unit_counts) as unit_counts
                FROM events e
                JOIN event_participants ep ON e.id = ep.event_id
                WHERE ep.person_id = $1
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

app.post('/api/events', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { name, description, date, payment_type, participant_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    
    try {
        await db.query('BEGIN');
        const eventResult = await db.query('INSERT INTO events (name, description, date, payment_type) VALUES ($1, $2, $3, $4) RETURNING id', [name, description || null, date || null, payment_type || 'parcelado']);
        const eventId = eventResult.rows[0].id;

        if (participant_ids && Array.isArray(participant_ids)) {
            for (const pid of participant_ids) {
                await db.query('INSERT INTO event_participants (event_id, person_id) VALUES ($1, $2)', [eventId, pid]);
            }
        }
        await db.query('COMMIT');
        res.json({ id: eventId, name });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: 'Erro ao criar evento' });
    }
});

app.post('/api/events/:id/participants', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { participant_ids } = req.body || {};
    const eventId = req.params.id;

    if (!participant_ids || !Array.isArray(participant_ids)) {
        return res.status(400).json({ error: 'Lista de participantes inválida' });
    }

    try {
        await db.query('BEGIN');
        for (const pid of participant_ids) {
            await db.query('INSERT INTO event_participants (event_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, pid]);
        }
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Erro ao adicionar participantes' });
    }
});


app.get('/api/events/:id/details', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const eventResult = await db.query('SELECT * FROM events WHERE id = $1', [id]);
        const event = eventResult.rows[0];
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

        if (req.user.role !== 'admin' && req.user.role !== 'secretário') {
            const participantResult = await db.query('SELECT 1 FROM event_participants WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
            if (participantResult.rows.length === 0) return res.sendStatus(403);
        }

        let participants, payments;
        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit 
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1
                ORDER BY p.name ASC
            `, [id]);
            participants = pResult.rows;
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE event_id = $1', [id]);
            payments = payResult.rows;
        } else {
            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit 
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1 AND p.id = $2
            `, [id, req.user.personId]);
            participants = pResult.rows;
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
            payments = payResult.rows;
        }

        res.json({ event, participants, payments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar detalhes do evento' });
    }
});

app.delete('/api/events/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar evento' });
    }
});

// --- EVENT PAYMENTS API ---
app.get('/api/event-payments', authenticateToken, async (req, res) => {
    const { event_id, month, year } = req.query;
    try {
        if (req.user.role === 'admin') {
            let sql = 'SELECT ep.id, ep.event_id, ep.person_id, ep.amount, ep.month, ep.year, ep.status, ep.receipt_path, ep.receipt_mime, ep.rejection_reason, p.name as member_name FROM event_payments ep JOIN people p ON ep.person_id = p.id';
            let params = [];
            let conditions = [];
            if (event_id) { conditions.push('ep.event_id = $' + (params.length + 1)); params.push(event_id); }
            if (month) { conditions.push('ep.month = $' + (params.length + 1)); params.push(month); }
            if (year) { conditions.push('ep.year = $' + (params.length + 1)); params.push(year); }
            
            if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
            
            const result = await db.query(sql, params);
            return res.json(result.rows);
        }
        
        if (!req.user.personId) return res.json([]);
        let sql = 'SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE person_id = $1';
        let params = [req.user.personId];
        if (event_id) { sql += ' AND event_id = $' + (params.length + 1); params.push(event_id); }
        if (month) { sql += ' AND month = $' + (params.length + 1); params.push(month); }
        if (year) { sql += ' AND year = $' + (params.length + 1); params.push(year); }

        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar pagamentos de eventos' });
    }
});

app.get('/api/event-payments/detail/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento de evento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

app.post('/api/event-payments', authenticateToken, upload.single('receipt'), async (req, res) => {
    const { person_id, event_id, amount, month, year } = req.body || {};
    
    const compressed = await compressReceipt(req.file);
    const receipt_content = compressed ? compressed.buffer : null;
    const receipt_mime = compressed ? compressed.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;
    
    // Authorization
    const effectivePersonId = req.user.role === 'admin' ? (person_id || req.user.personId) : req.user.personId;

    if (!effectivePersonId) return res.status(400).json({ error: 'Membro não identificado.' });
    if (!event_id) return res.status(400).json({ error: 'Evento não identificado.' });
    if (!amount) return res.status(400).json({ error: 'Valor não informado.' });

    try {
        const status = req.user.role === 'admin' ? 'approved' : 'pending';

        let isUploadedToStorage = false;
        // Upload to Supabase Storage if file exists
        if (req.file && compressed) {
            console.log(`[STORAGE] Upload Event Receipt: ${receipt_filename}`);
            const { error } = await supabase.storage
                .from('receipts')
                .upload(receipt_filename, compressed.buffer, {
                    contentType: compressed.mimetype,
                    upsert: true
                });
            if (!error) isUploadedToStorage = true;
        }

        const finalDBContent = isUploadedToStorage ? null : receipt_content;

        const existingSql = (month && year)
            ? 'SELECT id FROM event_payments WHERE person_id = $1 AND event_id = $2 AND month = $3 AND year = $4'
            : 'SELECT id FROM event_payments WHERE person_id = $1 AND event_id = $2 AND month IS NULL';
        
        const existingParams = (month && year)
            ? [effectivePersonId, event_id, month, year] 
            : [effectivePersonId, event_id];

        const existingResult = await db.query(existingSql, existingParams);
        const existing = existingResult.rows[0];

        if (existing) {
            await db.query(`
                UPDATE event_payments 
                SET amount = $1, receipt_path = COALESCE($2, receipt_path), receipt_content = COALESCE($3, receipt_content), receipt_mime = COALESCE($4, receipt_mime), status = $5, rejection_reason = NULL 
                WHERE id = $6
            `, [amount, receipt_path, finalDBContent, receipt_mime, status, existing.id]);
            
            if (status === 'pending') {
                const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");
                const personResult = await db.query("SELECT name FROM people WHERE id = $1", [effectivePersonId]);
                const eventResult = await db.query("SELECT name FROM events WHERE id = $1", [event_id]);
                const person = personResult.rows[0];
                const event = eventResult.rows[0];
                for (const admin of adminsResult.rows) {
                    await createNotification(admin.id, 'Novo Comprovante', `O membro ${person.name} atualizou um comprovante para o evento ${event.name}.`, 'info', existing.id, 'event');
                }
            }
            res.json({ id: existing.id, updated: true, status });
        } else {
            const insertSql = `
                INSERT INTO event_payments (person_id, event_id, amount, month, year, receipt_path, receipt_content, receipt_mime, status) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                RETURNING id
            `;
            const insertParams = [effectivePersonId, event_id, amount, month || null, year || null, receipt_path, finalDBContent, receipt_mime, status];
            const insertResult = await db.query(insertSql, insertParams);
            const newId = insertResult.rows[0].id;

            if (status === 'pending') {
                const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");
                const personResult = await db.query("SELECT name FROM people WHERE id = $1", [effectivePersonId]);
                const eventResult = await db.query("SELECT name FROM events WHERE id = $1", [event_id]);
                const person = personResult.rows[0];
                const event = eventResult.rows[0];
                for (const admin of adminsResult.rows) {
                    await createNotification(admin.id, 'Novo Comprovante', `O membro ${person.name} enviou um novo comprovante para o evento ${event.name}.`, 'info', newId, 'event');
                }
            }
            res.json({ id: newId, updated: false, status });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar pagamento do evento' });
    }
});

// --- SALES API ---
app.get('/api/sales', authenticateToken, async (req, res) => {
    const { year } = req.query;
    try {
        let sql = 'SELECT * FROM sales';
        let params = [];
        if (year) {
            sql += ' WHERE EXTRACT(YEAR FROM date) = $1';
            params.push(year);
        }
        sql += ' ORDER BY date DESC';
        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
});

app.post('/api/sales', authenticateToken, upload.single('receipt'), async (req, res) => {
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
        `, [event_name, amount, date, description || null, receipt_path, finalDBContent, receipt_mime]);

        logAction(req, 'CREATE_SALE', { id: result.rows[0].id, event_name, amount });
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar venda' });
    }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
        res.json({ success: true });
        logAction(req, 'DELETE_SALE', { id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar venda' });
    }
});

// Approval Endpoints
app.post('/api/event-payments/:id/approve', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name FROM event_payments ep JOIN events e ON ep.event_id = e.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE event_payments SET status = \'approved\', rejection_reason = NULL WHERE id = $1', [req.params.id]);
        
        const userResult = await db.query('SELECT id FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento de Evento Aprovado', `Seu pagamento para o evento ${payment.event_name} foi aprovado!`, 'success');
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao aprovar' });
    }
});

app.post('/api/event-payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};
    try {
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name FROM event_payments ep JOIN events e ON ep.event_id = e.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE event_payments SET status = \'rejected\', rejection_reason = $1 WHERE id = $2', [reason || 'Inválido', req.params.id]);
        
        const userResult = await db.query('SELECT id FROM users WHERE person_id = $1', [payment.person_id]);
        const userForMember = userResult.rows[0];
        if (userForMember) {
            await createNotification(userForMember.id, 'Pagamento de Evento Rejeitado', `Seu pagamento para o evento ${payment.event_name} foi rejeitado. Motivo: ${reason}`, 'error');
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao rejeitar' });
    }
});

app.delete('/api/event-payments/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM event_payments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// --- OUTFLOWS (SAÍDAS) API ---
app.get('/api/outflows', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, amount, category, date, description, receipt_path, receipt_mime, created_at FROM outflows ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar saídas' });
    }
});

app.post('/api/outflows', authenticateToken, upload.single('receipt'), async (req, res) => {
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
        // Upload to Supabase Storage if file exists
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
        `, [amount, category, date, description || null, receipt_path, finalDBContent, receipt_mime]);
        
        logAction(req, 'CREATE_OUTFLOW', { amount, category, date });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar saída' });
    }
});

app.delete('/api/outflows/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM outflows WHERE id = $1', [req.params.id]);
        logAction(req, 'DELETE_OUTFLOW', { id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar saída' });
    }
});

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
});

// --- SECURE FILE ACCESS ---
app.get('/api/files/receipt/:filename', authenticateToken, async (req, res) => {
    const { filename } = req.params;
    const fullRelativePath = path.join('uploads', filename).replace(/\\/g, '/');

    try {
        // Try to fetch from Supabase Storage first
        const { data, error } = await supabase.storage
            .from('receipts')
            .download(filename);

        if (data) {
            console.log(`[STORAGE] Arquivo servido via Supabase: ${filename}`);
            const arrayBuffer = await data.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            res.set('Content-Type', data.type || 'application/octet-stream');
            return res.send(buffer);
        }

        console.log(`[STORAGE] Arquivo não no Supabase, tentando banco de dados: ${filename}`);
        
        // Try monthly payments
        let result = await db.query('SELECT person_id, receipt_content, receipt_mime FROM payments WHERE receipt_path = $1', [fullRelativePath]);
        let payment = result.rows[0];
        
        // Try event payments
        if (!payment) {
            result = await db.query('SELECT person_id, receipt_content, receipt_mime FROM event_payments WHERE receipt_path = $1', [fullRelativePath]);
            payment = result.rows[0];
        }

        // Try outflows (Admin only access implied by general rule below)
        let isOutflow = false;
        if (!payment) {
            result = await db.query('SELECT receipt_content, receipt_mime FROM outflows WHERE receipt_path = $1', [fullRelativePath]);
            payment = result.rows[0];
            isOutflow = true;
        }

        if (!payment) {
            return res.status(404).json({ error: 'Arquivo não encontrado no registro' });
        }

        // Authorization: Admin or Owner (Outflows are admin only)
        if (req.user.role !== 'admin' && !isOutflow && req.user.personId !== payment.person_id) {
            console.warn(`[SECURITY] Acesso negado ao arquivo ${filename} para o usuário ${req.user.username}`);
            return res.sendStatus(403);
        }
        
        if (isOutflow && req.user.role !== 'admin' && req.user.role !== 'secretário') {
            return res.sendStatus(403);
        }

        if (!payment.receipt_content) {
            return res.status(404).json({ error: 'Conteúdo do arquivo não encontrado no banco de dados' });
        }
        
        res.set('Content-Type', payment.receipt_mime || 'application/octet-stream');
        res.send(payment.receipt_content);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar arquivo' });
    }
});

// --- SYSTEM LOGS API ---
app.get('/api/admin/logs', authenticateToken, async (req, res) => {
    // Only master admin can see logs
    if (req.user.role !== 'admin' || req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
        console.warn(`[SECURITY] Tentativa de acesso não autorizado aos logs por ${req.user.username}`);
        return res.sendStatus(403);
    }
    try {
        const result = await db.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 200');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar logs' });
    }
});

// --- Notification Routes ---

app.get('/api/notifications/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

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

app.get('/api/notifications/unread', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM notifications 
            WHERE (user_id = $1 OR user_id IS NULL) 
            AND is_read = false 
            ORDER BY created_at DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.query('UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao marcar como lida' });
    }
});

app.post('/api/notifications/send', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403).json({ error: 'Acesso negado' });
    
    const { userId, title, content } = req.body;
    
    try {
        // 1. Save to DB for internal modal
        const result = await db.query(`
            INSERT INTO notifications (user_id, title, content, type)
            VALUES ($1, $2, $3, 'manual') RETURNING id
        `, [userId || null, title, content]);

        // 2. Try to send push notification
        const pushResult = await db.query(`
            SELECT subscription_data FROM push_subscriptions 
            WHERE ($1::int IS NULL OR user_id = $1)
        `, [userId || null]);

        const payload = JSON.stringify({ title, body: content });

        pushResult.rows.forEach(sub => {
            const subscription = JSON.parse(sub.subscription_data);
            webPush.sendNotification(subscription, payload).catch(err => {
                console.error('[PUSH] Erro no envio individual:', err.statusCode);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription expired, remove it
                    db.query('DELETE FROM push_subscriptions WHERE subscription_data = $1', [sub.subscription_data]);
                }
            });
        });

        res.json({ success: true, notificationId: result.rows[0].id });
    } catch (err) {
        console.error('[NOTIF] Erro ao enviar:', err);
        res.status(500).json({ error: 'Erro ao processar envio' });
    }
});

// --- Automated Reminders Logic (CRON) ---

const sendPaymentReminders = async (message) => {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // 1. Find users with UNPAID fees for current month
        const unpaidUsers = await db.query(`
            SELECT u.id, u.username, p.name 
            FROM users u
            JOIN people p ON u.person_id = p.id
            WHERE u.id NOT IN (
                SELECT user_id FROM fees 
                WHERE month = $1 AND year = $2 AND status = 'paid'
            )
        `, [currentMonth, currentYear]);

        console.log(`[CRON] Enviando lembretes para ${unpaidUsers.rows.length} usuários.`);

        for (const user of unpaidUsers.rows) {
            const title = 'Lembrete de Mensalidade';
            const content = `Olá ${user.name || user.username}, lembramos que a mensalidade deste mês ainda está pendente. Regularize para nos ajudar a manter o clube!`;
            
            // Save to DB
            await db.query(`
                INSERT INTO notifications (user_id, title, content, type)
                VALUES ($1, $2, $3, 'automated_reminder')
            `, [user.id, title, content]);

            // Send Push
            const pushResult = await db.query('SELECT subscription_data FROM push_subscriptions WHERE user_id = $1', [user.id]);
            const payload = JSON.stringify({ title, body: content });

            pushResult.rows.forEach(sub => {
                webPush.sendNotification(JSON.parse(sub.subscription_data), payload).catch(err => {
                    if (err.statusCode === 410) db.query('DELETE FROM push_subscriptions WHERE subscription_data = $1', [sub.subscription_data]);
                });
            });
        }
    } catch (err) {
        console.error('[CRON] Erro no processamento automático:', err);
    }
};

// CRON JOB: Every day at 09:00 (Check for day 5 and 20)
cron.schedule('0 9 * * *', async () => {
    const today = new Date();
    const day = today.getDate();
    const dayOfWeek = today.getDay(); // 0: Sun, 6: Sat
    
    // Day 20 Logic
    if (day === 20) {
        if (dayOfWeek === 6) { // Saturday
            console.log('[CRON] Dia 20 é Sábado. Agendando para o pôr do sol (19:00).');
            // We schedule a one-time execution for today at 19:00
            setTimeout(() => sendPaymentReminders(), (19 - 9) * 60 * 60 * 1000);
        } else {
            sendPaymentReminders();
        }
    }

    // 5th Working Day Logic
    if (day >= 5 && day <= 10) {
        const result = await db.query(`
            WITH RECURSIVE work_days AS (
                SELECT date_trunc('month', CURRENT_DATE)::date AS d, 1 AS count
                WHERE EXTRACT(DOW FROM date_trunc('month', CURRENT_DATE)) BETWEEN 1 AND 5
                UNION ALL
                SELECT (d + 1)::date, CASE WHEN EXTRACT(DOW FROM (d + 1)) BETWEEN 1 AND 5 THEN count + 1 ELSE count END
                FROM work_days
                WHERE count < 5 AND d < date_trunc('month', CURRENT_DATE) + interval '15 days'
            )
            SELECT d FROM work_days WHERE count = 5 ORDER BY d DESC LIMIT 1
        `);
        
        const fifthWorkingDay = new Date(result.rows[0].d).getDate();
        if (day === fifthWorkingDay) {
            console.log('[CRON] Hoje é o 5º dia útil. Enviando lembretes.');
            sendPaymentReminders();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    
    // Initial cleanup on startup
    cleanupLogs();
    
    // Log system startup
    const mockReq = { 
        headers: { 'user-agent': 'Server System Process' },
        socket: { remoteAddress: '127.0.0.1' }
    };
    logAction(mockReq, 'SYSTEM_STARTUP', { 
        event: 'Server initialized', 
        port: PORT,
        protocols: ['TCP', 'HTTP', 'JWT']
    });
});
