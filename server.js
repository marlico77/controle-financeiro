require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const db = require('./database');
const UAParser = require('ua-parser-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

console.log(`[SERVER] Started on PORT ${PORT} - ENV: ${process.env.NODE_ENV || 'development'}`);


if (!SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is missing!');
    process.exit(1);
}
const JWT_SECRET = SECRET || 'dev-secret-only';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
        return res.status(403).json({ error: 'Sessão inválida', details: err.message });
    }
    
    try {
        // Check session and mandatory password change in DB
        const result = await db.query('SELECT current_session_id, must_change_password, username, role, person_id FROM users WHERE id = $1', [decoded.id]);
        const dbUser = result.rows[0];
        
        if (!dbUser) return res.status(401).json({ error: 'Usuário não encontrado' });

        // Single Session Rule: Check if session ID matches
        if (dbUser.current_session_id && decoded.sid !== dbUser.current_session_id) {
            console.warn(`[AUTH] Sessão duplicada para ${dbUser.username}. Token SID: ${decoded.sid}, DB SID: ${dbUser.current_session_id}`);
            return res.status(401).json({ error: 'Sessão expirada. Logado em outro local.' });
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
            personId: dbUser.person_id ? parseInt(dbUser.person_id) : null,
            sid: decoded.sid
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
        console.log('[DB] Table outflows verified/created.');
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

    const { role, username: dbUsername, person_id, current_session_id, must_change_password, id: userId } = user;
    const { force } = req.body || {};

    // Check for active session conflict
    if (current_session_id && !force) {
        return res.status(409).json({ error: 'session_active', message: 'Já existe um dispositivo conectado.' });
    }

    const finalRole = role || 'member';
    const personId = person_id || null;
    
    // Single Session Logic: Generate unique Session ID
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 10);
    await db.query('UPDATE users SET current_session_id = $1 WHERE id = $2', [sessionId, userId]);

    const token = jwt.sign({ 
      id: userId, 
      username: dbUsername, 
      role: finalRole, 
      personId: personId,
      sid: sessionId
    }, JWT_SECRET, { expiresIn: '12h' });

    console.log(`Login Successful: ${dbUsername} as ${finalRole} (SID: ${sessionId}) ${force ? '[FORCED]' : ''}`);
    
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
        SELECT p.*, u.username 
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
  
  let { name, responsible, birth_date, cpf, unit, username, password } = req.body || {};
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

          const finalPassword = password || 'tribo@2026';
          const hash = await bcrypt.hash(finalPassword, 10);

          await client.query(
              'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE)',
              [finalUsername, hash, 'member', personId]
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
      const result = await db.query('SELECT * FROM payments WHERE year = $1', [targetYear]);
      return res.json(result.rows);
    }

    if (!req.user.personId) return res.json([]);
    const result = await db.query('SELECT * FROM payments WHERE person_id = $1 AND year = $2', [req.user.personId, targetYear]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

app.get('/api/payments/detail/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

app.post('/api/payments', authenticateToken, upload.single('receipt'), async (req, res) => {
  const { person_id, month, year, amount } = req.body;
  
  // Use memory buffer and mime type from multer
  const receipt_content = req.file ? req.file.buffer : null;
  const receipt_mime = req.file ? req.file.mimetype : null;
  const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
  const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

  if (!person_id || !month || !year || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  try {
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    const existingResult = await db.query('SELECT id, receipt_path, status FROM payments WHERE person_id = $1 AND month = $2 AND year = $3', [person_id, month, year]);
    const existing = existingResult.rows[0];

    if (existing) {
        const finalContent = receipt_content || existing.receipt_content;
        const finalMime = receipt_mime || existing.receipt_mime;
        const finalPath = receipt_path || existing.receipt_path;

        await db.query(`
            UPDATE payments 
            SET amount = $1, receipt_path = $2, receipt_content = $3, receipt_mime = $4, status = $5, rejection_reason = NULL 
            WHERE id = $6
        `, [amount, finalPath, finalContent, finalMime, status, existing.id]);
        
        if (status === 'pending') {
            const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");
            const personResult = await db.query("SELECT name FROM people WHERE id = $1", [person_id]);
            const person = personResult.rows[0];
            for (const admin of adminsResult.rows) {
                await createNotification(admin.id, 'Novo Comprovante', `O membro ${person.name} atualizou um comprovante para o mês de ${monthNames[month-1]}.`, 'info', existing.id, 'monthly');
            }
        }
        res.json({ id: existing.id, updated: true, status });
    } else {
        const insertResult = await db.query(`
            INSERT INTO payments (person_id, month, year, amount, receipt_path, receipt_content, receipt_mime, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id
        `, [person_id, month, year, amount, receipt_path, receipt_content, receipt_mime, status]);
        const newId = insertResult.rows[0].id;
        
        if (status === 'pending') {
            const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");
            const personResult = await db.query("SELECT name FROM people WHERE id = $1", [person_id]);
            const person = personResult.rows[0];
            for (const admin of adminsResult.rows) {
                await createNotification(admin.id, 'Novo Comprovante', `O membro ${person.name} enviou um novo comprovante para o mês de ${monthNames[month-1]}.`, 'info', newId, 'monthly');
            }
        }
        res.json({ id: newId, updated: false, status });
        logAction(req, 'CREATE_PAYMENT', { person_id, month, year, amount, status });
    }
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao salvar pagamento' });
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
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { reason } = req.body;
    
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
    let { name, responsible, birth_date, cpf, unit, username, password } = req.body || {};
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
                    await db.query('UPDATE users SET username = $1, password_hash = $2, must_change_password = TRUE WHERE id = $3', 
                      [username, hash, existingUser.id]);
                } else {
                    await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, existingUser.id]);
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
        if (req.user.role === 'admin' || req.user.role === 'secretário') {
            const result = await db.query('SELECT * FROM events ORDER BY date ASC');
            return res.json(result.rows);
        }

        const result = await db.query(`
            SELECT e.* FROM events e
            JOIN event_participants ep ON e.id = ep.event_id
            WHERE ep.person_id = $1
            ORDER BY e.date ASC
        `, [req.user.personId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
});

app.post('/api/events', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { name, description, date, participant_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    
    try {
        await db.query('BEGIN');
        const eventResult = await db.query('INSERT INTO events (name, description, date) VALUES ($1, $2, $3) RETURNING id', [name, description || null, date || null]);
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
            const payResult = await db.query('SELECT * FROM event_payments WHERE event_id = $1', [id]);
            payments = payResult.rows;
        } else {
            const pResult = await db.query(`
                SELECT p.id, p.name, p.unit 
                FROM people p
                JOIN event_participants ep ON p.id = ep.person_id
                WHERE ep.event_id = $1 AND p.id = $2
            `, [id, req.user.personId]);
            participants = pResult.rows;
            const payResult = await db.query('SELECT * FROM event_payments WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
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
            let sql = 'SELECT ep.*, p.name as member_name FROM event_payments ep JOIN people p ON ep.person_id = p.id';
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
        let sql = 'SELECT * FROM event_payments WHERE person_id = $1';
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
        const result = await db.query('SELECT * FROM event_payments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Pagamento de evento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

app.post('/api/event-payments', authenticateToken, upload.single('receipt'), async (req, res) => {
    const { person_id, event_id, amount, month, year } = req.body || {};
    
    const receipt_content = req.file ? req.file.buffer : null;
    const receipt_mime = req.file ? req.file.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;
    
    // Authorization
    const effectivePersonId = req.user.role === 'admin' ? (person_id || req.user.personId) : req.user.personId;

    if (!effectivePersonId) return res.status(400).json({ error: 'Membro não identificado.' });
    if (!event_id) return res.status(400).json({ error: 'Evento não identificado.' });
    if (!amount) return res.status(400).json({ error: 'Valor não informado.' });

    try {
        const status = req.user.role === 'admin' ? 'approved' : 'pending';

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
            `, [amount, receipt_path, receipt_content, receipt_mime, status, existing.id]);
            
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
            const insertParams = [effectivePersonId, event_id, amount, month || null, year || null, receipt_path, receipt_content, receipt_mime, status];
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
    if (req.user.role !== 'admin') return res.sendStatus(403);
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
        const result = await db.query('SELECT * FROM outflows ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar saídas' });
    }
});

app.post('/api/outflows', authenticateToken, upload.single('receipt'), async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { amount, category, date, description } = req.body;
    
    if (!amount || !category || !date) {
        return res.status(400).json({ error: 'Valor, categoria e data são obrigatórios.' });
    }

    const receipt_content = req.file ? req.file.buffer : null;
    const receipt_mime = req.file ? req.file.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-outflow-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

    try {
        await db.query(`
            INSERT INTO outflows (amount, category, date, description, receipt_path, receipt_content, receipt_mime) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [amount, category, date, description || null, receipt_path, receipt_content, receipt_mime]);
        
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
