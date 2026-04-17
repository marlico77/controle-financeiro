require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

if (!SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is missing!');
    process.exit(1);
}
const JWT_SECRET = SECRET || 'dev-secret-only';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
// REMOVED: app.use('/uploads', express.static('uploads')); (Secured via /api/files/receipt)

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware: Auth
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
        console.error(`[AUTH] Verificação falhou: ${err.message}`);
        return res.status(403).json({ error: 'Sessão inválida', details: err.message });
    }
    
    req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role || 'member',
        personId: decoded.personId ? parseInt(decoded.personId) : null
    };

    console.log(`[AUTH] Usuário: ${req.user.username} | Role: ${req.user.role} | ID: ${req.user.personId}`);
    next();
  });
};

// --- Sync Members to Users ---
const syncMemberUsers = () => {
    const people = db.prepare('SELECT id, name FROM people').all();
    const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role, person_id) VALUES (?, ?, ?, ?)');
    const salt = bcrypt.genSaltSync(10);
    const defaultHash = bcrypt.hashSync('tribo@2026', salt);

    people.forEach(p => {
        // Generate username: first.last
        const parts = p.name.trim().toLowerCase().split(/\s+/);
        let username;
        if (parts.length >= 2) {
            username = `${parts[0]}.${parts[parts.length - 1]}`;
        } else {
            username = parts[0];
        }

        // Check if person already has a user
        const existing = db.prepare('SELECT id FROM users WHERE person_id = ?').get(p.id);
        if (!existing) {
            try {
                insertUser.run(username, defaultHash, 'member', p.id);
            } catch (err) {
                // If username exists, try adding ID
                if (err.message.includes('UNIQUE')) {
                    insertUser.run(`${username}${p.id}`, defaultHash, 'member', p.id);
                }
            }
        }
    });
};
syncMemberUsers();

// --- AUTH API ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const role = user.role || 'member'; // Fallback to member
  const personId = user.person_id || null;

  const token = jwt.sign({ 
    id: user.id, 
    username: user.username, 
    role: role, 
    personId: personId 
  }, JWT_SECRET, { expiresIn: '12h' });

  console.log(`Login Successful: ${user.username} as ${role}`);

  res.json({ 
    token, 
    role: role, 
    username: user.username,
    personId: personId 
  });
});

// --- PEOPLE API ---
app.get('/api/people', authenticateToken, (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const people = db.prepare(`
        SELECT p.*, u.username 
        FROM people p 
        LEFT JOIN users u ON p.id = u.person_id 
        ORDER BY p.name ASC
      `).all();
      
      console.log(`[DEBUG] Sending ${people.length} people. First entry username: ${people[0]?.username}`);
      return res.json(people);
    }
    
    // STRICT MEMBER ACCESS
    if (!req.user.personId) {
        console.warn(`[SECURITY] Member ${req.user.username} tried to fetch people without personId`);
        return res.json([]);
    }
    
    const person = db.prepare(`
        SELECT p.*, u.username 
        FROM people p 
        LEFT JOIN users u ON p.id = u.person_id 
        WHERE p.id = ?
    `).all(); // Using all to maintain array format for frontend
    
    console.log(`[DEBUG] Sending personal data for personId ${req.user.personId}. Username: ${person[0]?.username}`);
    res.json(person);
  } catch (err) {
    console.error('API Error /api/people:', err);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

app.post('/api/people', authenticateToken, (req, res) => {
  const { name, responsible, birth_date, cpf } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  const info = db.prepare('INSERT INTO people (name, responsible, birth_date, cpf) VALUES (?, ?, ?, ?)')
    .run(name, responsible || null, birth_date || null, cpf || null);
  
  res.json({ id: info.lastInsertRowid, name });
});

app.post('/api/people/import', authenticateToken, upload.single('file'), (req, res) => {
  console.log('Import request received');
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    const insert = db.prepare('INSERT INTO people (name, unit) VALUES (?, ?)');
    let count = 0;
    
    const transaction = db.transaction((items) => {
      for (const item of items) {
        const keys = Object.keys(item);
        const nameKey = keys.find(k => k.trim().toUpperCase() === 'NOME');
        const unitKey = keys.find(k => k.trim().toUpperCase() === 'UNIDADE');
        
        const name = nameKey ? item[nameKey] : null;
        const unit = unitKey ? item[unitKey] : null;
        
        if (name) {
          insert.run(name.toString().trim(), unit ? unit.toString().trim() : null);
          count++;
        }
      }
    });

    transaction(data);
    res.json({ success: true, count });
  } catch (err) {
    console.error('Import Error:', err);
    res.status(500).json({ error: 'Erro ao processar planilha. Verifique se as colunas NOME e UNIDADE existem.' });
  }
});

// --- PAYMENTS API ---
app.get('/api/payments', authenticateToken, (req, res) => {
  const { year } = req.query;
  const targetYear = parseInt(year) || new Date().getFullYear();

  try {
    if (req.user.role === 'admin') {
      const payments = db.prepare('SELECT * FROM payments WHERE year = ?').all(targetYear);
      return res.json(payments);
    }

    // Members: strictly filter by personId
    if (!req.user.personId) return res.json([]);
    const payments = db.prepare('SELECT * FROM payments WHERE person_id = ? AND year = ?')
      .all(req.user.personId, targetYear);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

app.post('/api/payments', authenticateToken, upload.single('receipt'), (req, res) => {
  const { person_id, month, year, amount } = req.body;
  const receipt_path = req.file ? req.file.path : null;

  if (!person_id || !month || !year || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  // Upsert logic: check if exists
  const existing = db.prepare('SELECT id, receipt_path FROM payments WHERE person_id = ? AND month = ? AND year = ?')
    .get(person_id, month, year);

  if (existing) {
    // Update
    const finalReceipt = receipt_path || existing.receipt_path;
    db.prepare('UPDATE payments SET amount = ?, receipt_path = ? WHERE id = ?')
      .run(amount, finalReceipt, existing.id);
    res.json({ id: existing.id, updated: true });
  } else {
    // Insert new
    const info = db.prepare('INSERT INTO payments (person_id, month, year, amount, receipt_path) VALUES (?, ?, ?, ?, ?)')
      .run(person_id, month, year, amount, receipt_path);
    res.json({ id: info.lastInsertRowid });
  }
});

// Delete payment
app.delete('/api/payments/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Update person
app.put('/api/people/:id', authenticateToken, (req, res) => {
  try {
    const { name, responsible, birth_date, cpf, unit, username, password } = req.body;
    const { id } = req.params;
    
    if (req.user.role !== 'admin' && parseInt(id) !== req.user.personId) {
        return res.sendStatus(403);
    }

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    // Update people table
    const result = db.prepare('UPDATE people SET name = ?, responsible = ?, birth_date = ?, cpf = ?, unit = ? WHERE id = ?')
      .run(name, responsible || null, birth_date || null, cpf || null, unit || null, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // Update user credentials if admin
    if (req.user.role === 'admin' && username) {
        const existingUser = db.prepare('SELECT id FROM users WHERE person_id = ?').get(id);
        if (existingUser) {
            if (password) {
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(password, salt);
                db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
                  .run(username, hash, existingUser.id);
            } else {
                db.prepare('UPDATE users SET username = ? WHERE id = ?')
                  .run(username, existingUser.id);
            }
        }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Delete person
app.delete('/api/people/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
});

// --- SECURE FILE ACCESS ---
app.get('/api/files/receipt/:filename', authenticateToken, (req, res) => {
    const { filename } = req.params;
    const fullRelativePath = path.join('uploads', filename).replace(/\\/g, '/');

    try {
        // Find which payment this file belongs to
        const payment = db.prepare('SELECT person_id FROM payments WHERE receipt_path = ?').get(fullRelativePath);
        
        if (!payment) {
            return res.status(404).json({ error: 'Arquivo não encontrado no registro' });
        }

        // Authorization: Admin or Owner
        if (req.user.role !== 'admin' && req.user.personId !== payment.person_id) {
            console.warn(`[SECURITY] Acesso negado ao arquivo ${filename} para o usuário ${req.user.username}`);
            return res.sendStatus(403);
        }

        const absolutePath = path.join(__dirname, 'uploads', filename);
        res.sendFile(absolutePath);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar arquivo' });
    }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
