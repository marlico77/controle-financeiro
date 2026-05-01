require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const express = require('express'); // Framework web para Node.js
const cors = require('cors'); // Middleware para permitir requisições de diferentes domínios
const multer = require('multer'); // Middleware para manipulação de upload de arquivos
const path = require('path'); // Módulo nativo para manipulação de caminhos de arquivos
const jwt = require('jsonwebtoken'); // Biblioteca para geração e validação de tokens JWT
const bcrypt = require('bcryptjs'); // Biblioteca para criptografia de senhas
const xlsx = require('xlsx'); // Biblioteca para leitura e escrita de arquivos Excel
const sharp = require('sharp'); // Biblioteca de alto desempenho para processamento de imagens
const db = require('./database'); // Importa a configuração do banco de dados (Pool do Postgres)
const UAParser = require('ua-parser-js'); // Analisador de User-Agent (detecta navegador/dispositivo)
const webPush = require('web-push'); // Biblioteca para envio de notificações push
const cron = require('node-cron'); // Agendador de tarefas (não usado explicitamente mas carregado)
const { createClient } = require('@supabase/supabase-js'); // Cliente para integração com Supabase Storage

// Inicializa o cliente do Supabase para armazenamento de arquivos em nuvem
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express(); // Instancia a aplicação Express
const PORT = process.env.PORT || 3000; // Define a porta do servidor
const SECRET = process.env.JWT_SECRET; // Segredo para assinatura dos tokens JWT

// --- Função Auxiliar: Compressão de Imagens ---
// Reduz o tamanho de comprovantes enviados para economizar espaço e banda
const compressReceipt = async (file) => {
    if (!file) return null;
    
    // Processa apenas arquivos que sejam imagens
    if (file.mimetype.startsWith('image/')) {
        try {
            console.log(`[COMPRESS] Otimizando imagem: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);
            // Redimensiona para max 1200px, converte para JPEG com 80% de qualidade
            const buffer = await sharp(file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();
            console.log(`[COMPRESS] Sucesso: ${(buffer.length / 1024).toFixed(1)} KB`);
            return {
                buffer,
                mimetype: 'image/jpeg' 
            };
        } catch (err) {
            console.error('[COMPRESS] Erro ao comprimir imagem, usando original:', err);
            return { buffer: file.buffer, mimetype: file.mimetype };
        }
    }
    
    // Se for PDF ou outro formato, retorna o arquivo original sem alteração
    return { buffer: file.buffer, mimetype: file.mimetype };
};

console.log(`[SERVER] Started on PORT ${PORT} - ENV: ${process.env.NODE_ENV || 'development'}`);

// Validação de segurança crítica em produção
if (!SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is missing!');
    process.exit(1);
}
const JWT_SECRET = SECRET || 'dev-secret-only';

// Configurações de Middleware do Express
app.use(cors()); // Habilita CORS
app.use(express.json()); // Habilita parsing de JSON no corpo das requisições
app.use(express.static('public')); // Serve os arquivos estáticos da pasta 'public' (frontend)

// --- Configuração de Web Push (Notificações Push) ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPdV8b0gIcNWcgEfsVoyNMXrfBa-MFC4rMeqhDKC2PbN5O1Erq6aCo-E_4ev6SCgsalWP5WqpeZVcK95WV_GIhQ';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'bfjF8hipfmuLyvm6CJJZMHTnHIzGvHPTkm_gENlNubo';

webPush.setVapidDetails(
    'mailto:contato@tribodedavi.net.br',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Rota raiz: serve o index.html principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
        const ua = req.headers['user-agent'];
        const parser = new UAParser(ua);
        const result = parser.getResult();
        
        // Obtém o IP do cliente (considerando proxies como Cloudflare/Render)
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
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

// --- Política de Limpeza de Logs (Retenção de 24h) ---
const cleanupLogs = async () => {
    try {
        // Remove logs com mais de 1 dia para evitar inchaço do banco de dados
        const result = await db.query("DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '1 day'");
        if (result.rowCount > 0) {
            console.log(`[CLEANUP] ${result.rowCount} logs antigos removidos.`);
        }
    } catch (err) {
        console.error('Error cleaning up logs:', err);
    }
};

// Agenda a limpeza de logs para rodar a cada hora
setInterval(cleanupLogs, 60 * 60 * 1000);

// Middleware de Autenticação: Valida o token JWT em cada requisição protegida
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Aceita token via Header ou via Query Param (útil para links de imagens/arquivos)
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) return res.status(401).json({ error: 'Token ausente' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            const reason = err.name === 'TokenExpiredError' ? 'Expirado' : 'Inválido';
            console.warn(`[AUTH] Falha (${reason}): ${err.message} | URL: ${req.originalUrl}`);
            return res.status(401).json({ error: 'Sessão inválida', reason: err.message });
        }
        // Se válido, anexa os dados do usuário (ID, Role) ao objeto req
        req.user = decoded;
        next();
    });
};

// --- Sincronização: Criar Usuários para Novos Membros ---
const syncMemberUsers = async () => {
    try {
        // Busca pessoas cadastradas que ainda não possuem uma conta de usuário vinculada
        const missingUsersResult = await db.query(`
            SELECT p.id, p.name 
            FROM people p 
            LEFT JOIN users u ON p.id = u.person_id 
            WHERE u.id IS NULL
        `);
        const people = missingUsersResult.rows;
        
        if (people.length === 0) return;

        console.log(`[SYNC] Sincronizando ${people.length} novos membros para usuários...`);
        const defaultHash = await bcrypt.hash('tribo@2026', 10); // Senha padrão para novos acessos

        for (const p of people) {
            // Gera um username automático baseado em "nome.sobrenome"
            const nameParts = p.name.trim().split(/\s+/);
            const first = nameParts[0].toLowerCase();
            const last = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
            
            let baseUsername = (last ? `${first}.${last}` : first);
            // Normaliza para remover acentos e caracteres especiais
            baseUsername = baseUsername.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            
            try {
                // Tenta inserir o usuário; se o username já existir, não faz nada (DO NOTHING)
                await db.query(
                    'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (username) DO NOTHING',
                    [baseUsername, defaultHash, 'member', p.id]
                );
            } catch (err) {
                // Fallback: Se colidir username, anexa o ID da pessoa para garantir unicidade
                await db.query(
                    'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT DO NOTHING',
                    [`${baseUsername}${p.id}`, defaultHash, 'member', p.id]
                );
            }
        }
    } catch (err) {
        console.error('Error syncing members:', err);
    }
};

// --- Inicialização do Banco de Dados ---
const initDB = async () => {
    try {
        // Cria tabelas necessárias se elas ainda não existirem (Garante resiliência em deploys)
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

        console.log('[DB] Tables and Performance Indices verified/created.');
    } catch (err) {
        console.error('[DB] Error initializing tables:', err);
    }
};

// Executa inicialização e sincronização ao subir o servidor
initDB();
syncMemberUsers();

// --- API de Autenticação ---

// Rota de Login: Valida credenciais e gera token JWT
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    // Busca usuário pelo username (ignora maiúsculas/minúsculas)
    const result = await db.query(`
        SELECT u.*, p.name 
        FROM users u 
        LEFT JOIN people p ON u.person_id = p.id 
        WHERE u.username ILIKE $1
    `, [username]);
    const user = result.rows[0];

    // Verifica se usuário existe e se a senha criptografada coincide
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const { role, username: dbUsername, person_id, must_change_password, id: userId } = user;
    const { force } = req.body || {};

    const finalRole = role || 'member';
    const personId = person_id || null;
    
    // Gera o token JWT com expiração de 24 horas
    const token = jwt.sign({ 
      id: userId, 
      username: dbUsername, 
      role: finalRole, 
      personId: personId
    }, JWT_SECRET, { expiresIn: '24h' });

    console.log(`Login Successful: ${dbUsername} as ${finalRole} ${force ? '[FORCED]' : ''}`);
    
    // Registra o sucesso do login no log de auditoria
    logAction(req, 'LOGIN_SUCCESS', { username: dbUsername, userId, force: !!force });

    // Retorna dados essenciais para o frontend
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

// Obtém o status atual do usuário (permissões e se precisa mudar senha)
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

// Redefinição de senha perdida (Exige Usuário + CPF cadastrado)
app.post('/api/auth/reset-lost-password', async (req, res) => {
    const { username, cpf, newPassword } = req.body || {};
    
    if (!username || !cpf || !newPassword) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    // Validação de complexidade: min 5 chars, 1 maiúscula, 1 número e 1 especial
    const complexityRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{5,}$/;
    if (!complexityRegex.test(newPassword)) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 5 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.' });
    }

    try {
        // Valida se os dados coincidem no banco
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
        
        // Atualiza a senha e remove a obrigatoriedade de troca
        await db.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, user.id]);
        
        res.json({ success: true, message: 'Senha redefinida com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// Troca de senha solicitada pelo sistema (no primeiro acesso)
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
        const result = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

// Marca todas as notificações de um usuário como lidas
app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar notificações' });
    }
});

// --- API de Membros (People) ---

// Lista todos os membros cadastrados
app.get('/api/people', authenticateToken, async (req, res) => {
  try {
    // Administradores e Secretários podem ver todos os membros e seus dados de usuário vinculados
    if (req.user.role === 'admin' || req.user.role === 'secretário') {
      const result = await db.query(`
        SELECT p.*, u.username, u.role, u.id as u_id
        FROM people p 
        LEFT JOIN users u ON p.id = u.person_id 
        ORDER BY p.name ASC
      `);
      return res.json(result.rows);
    }
    
    // Usuários comuns (membros) só podem ver seus próprios dados
    if (!req.user.personId) return res.json([]);
    const result = await db.query('SELECT * FROM people WHERE id = $1', [req.user.personId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// Cadastra um novo membro (Apenas Admin/Secretário)
app.post('/api/people', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
  
  let { name, responsible, birth_date, cpf, unit, username, password, role } = req.body || {};
  // Valida se o nome tem pelo menos duas partes (Nome e Sobrenome)
  if (!name || name.trim().split(/\s+/).length < 2) {
      return res.status(400).json({ error: 'O nome deve conter pelo menos Nome e Sobrenome.' });
  }
  if (!unit) {
      return res.status(400).json({ error: 'A unidade é obrigatória.' });
  }

  const client = await db.pool.connect(); // Obtém um cliente do pool para transação
  try {
      await client.query('BEGIN'); // Inicia transação SQL
      
      // Insere na tabela 'people'
      const result = await client.query(
        'INSERT INTO people (name, responsible, birth_date, cpf, unit) VALUES ($1, $2, $3, $4, $5) RETURNING id', 
        [name, responsible || null, birth_date || null, cpf || null, unit || null]
      );
      
      const personId = result.rows[0].id;

      let finalUsernameUsed = '';
      // Se for Admin cadastrando, cria automaticamente a conta de usuário
      if (req.user.role === 'admin') {
          const nameParts = name.trim().split(/\s+/);
          const first = nameParts[0].toLowerCase();
          const last = nameParts[nameParts.length - 1].toLowerCase();
          const baseUsername = `${first}.${last}`;

          // Normaliza o username (sem acentos, minúsculo)
          let finalUsername = username || baseUsername;
          finalUsername = finalUsername.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          finalUsernameUsed = finalUsername;

          // Apenas o Administrador master pode definir outros admins
          const finalRole = (req.user.username.toUpperCase() === 'ADMINISTRADOR' && role) ? role : 'member';
          const hash = await bcrypt.hash('tribo@2026', 10); // Senha inicial padrão

          // Cria a conta na tabela 'users'
          await client.query(
              'INSERT INTO users (username, password_hash, role, person_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE)',
              [finalUsername, hash, finalRole, personId]
          );
      }

      await client.query('COMMIT'); // Finaliza transação com sucesso
      logAction(req, 'CREATE_PERSON', { id: personId, name, unit }); // Log de auditoria
      res.json({ id: personId, name, username: finalUsernameUsed });
  } catch (err) {
      await client.query('ROLLBACK'); // Reverte alterações se houver erro
      console.error('Create Person Error:', err);
      res.status(500).json({ error: 'Erro ao cadastrar membro' });
  } finally {
      client.release(); // Libera o cliente de volta para o pool
  }
});

// Importação em massa de membros via planilha Excel
app.post('/api/people/import', authenticateToken, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  
  // Apenas o administrador master pode importar planilhas (por segurança e controle de usuários)
  if (req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
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
            
            const name = nameKey ? item[nameKey] : null;
            const unit = unitKey ? item[unitKey] : null;
            let birthDate = birthKey ? item[birthKey] : null;

            // Converte data do formato numérico do Excel para String se necessário
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
        
        // Sincroniza usuários em segundo plano para os novos membros importados
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

// --- API de Pagamentos de Mensalidades ---

// Busca histórico de pagamentos por ano
app.get('/api/payments', authenticateToken, async (req, res) => {
  const { year } = req.query;
  const targetYear = parseInt(year) || new Date().getFullYear();

  try {
    // Admin vê todos os pagamentos do ano selecionado
    if (req.user.role === 'admin') {
      const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, rejection_reason FROM payments WHERE year = $1', [targetYear]);
      return res.json(result.rows);
    }

    // Membro vê apenas os seus próprios pagamentos
    if (!req.user.personId) return res.json([]);
    const result = await db.query('SELECT id, person_id, month, year, amount, status, receipt_path, receipt_mime, created_at, rejection_reason FROM payments WHERE person_id = $1 AND year = $2', [req.user.personId, targetYear]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

// Busca detalhes de um pagamento específico
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

// Registra novo pagamento (com suporte a múltiplos meses em um único envio)
app.post('/api/payments', authenticateToken, upload.single('receipt'), async (req, res) => {
  const { person_id, month, year, amount, months } = req.body;
  
  if (!person_id || (!month && !months) || !year || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  // Se 'months' for enviado, trata como pagamento em lote. Senão, mês único.
  const monthList = months ? JSON.parse(months) : [month];
  const amountPerMonth = (parseFloat(amount) / monthList.length).toFixed(2);
  const status = req.user.role === 'admin' ? 'approved' : 'pending';

  try {
    // Processa e comprime o comprovante apenas uma vez para o lote todo
    const compressed = await compressReceipt(req.file);
    const receipt_content = compressed ? compressed.buffer : null;
    const receipt_mime = compressed ? compressed.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;

    let isUploadedToStorage = false;
    // Tenta fazer upload para o Supabase Storage (Nuvem)
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

    // Se subiu para nuvem, não guarda o binário no banco de dados para economizar espaço
    const finalDBContent = isUploadedToStorage ? null : receipt_content;
    const results = [];

    const personResult = await db.query("SELECT name FROM people WHERE id = $1", [person_id]);
    const personName = personResult.rows[0]?.name || 'Membro';
    const adminsResult = await db.query("SELECT id FROM users WHERE role = 'admin'");

    // Itera sobre cada mês do lote para salvar individualmente
    for (const m of monthList) {
        const existingResult = await db.query('SELECT id FROM payments WHERE person_id = $1 AND month = $2 AND year = $3', [person_id, m, year]);
        const existing = existingResult.rows[0];

        if (existing) {
            // Se já existe um registro para o mês, atualiza-o (correção de comprovante ou reenvio)
            await db.query(`
                UPDATE payments 
                SET amount = $1, receipt_path = $2, receipt_content = $3, receipt_mime = $4, status = $5, rejection_reason = NULL 
                WHERE id = $6
            `, [amountPerMonth, receipt_path, finalDBContent, receipt_mime, status, existing.id]);
            
            // Notifica administradores se for um novo envio de membro
            if (status === 'pending') {
                for (const admin of adminsResult.rows) {
                    await createNotification(admin.id, 'Novo Comprovante', `O membro ${personName} atualizou um comprovante para o mês de ${monthNames[m-1]}.`, 'info', existing.id, 'monthly');
                }
            }
            results.push({ id: existing.id, updated: true });
        } else {
            // Se não existe, cria um novo registro de pagamento
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

// Aprova um pagamento pendente (Admin)
app.post('/api/payments/:id/approve', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    try {
        const paymentResult = await db.query('SELECT person_id, month FROM payments WHERE id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE payments SET status = \'approved\', rejection_reason = NULL WHERE id = $1', [req.params.id]);
        
        // Notifica o membro que seu pagamento foi aprovado
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

// Rejeita um pagamento pendente com motivo (Admin/Secretário)
app.post('/api/payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};
    
    try {
        const paymentResult = await db.query('SELECT person_id, month FROM payments WHERE id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE payments SET status = \'rejected\', rejection_reason = $1 WHERE id = $2', [reason || 'Comprovante inválido', req.params.id]);
        
        // Notifica o membro sobre a rejeição e o motivo
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

// Exclui um registro de pagamento definitivamente (Admin)
app.delete('/api/payments/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  try {
    await db.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar pagamento' });
  }
});

// Atualiza dados cadastrais de um membro (Admin ou o próprio usuário)
app.put('/api/people/:id', authenticateToken, async (req, res) => {
  try {
    let { name, responsible, birth_date, cpf, unit, username, password, role } = req.body || {};
    // Normaliza username para evitar erros de digitação e acentuação
    if (username) username = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const { id } = req.params;
    
    // Verifica permissão: Admin pode tudo, usuário só pode editar a si mesmo
    if (req.user.role !== 'admin' && parseInt(id) !== req.user.personId) {
        return res.sendStatus(403);
    }

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    // Atualiza tabela people
    const updateResult = await db.query('UPDATE people SET name = $1, responsible = $2, birth_date = $3, cpf = $4, unit = $5 WHERE id = $6', 
      [name, responsible || null, birth_date || null, cpf || null, unit || null, id]);
    
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // Se for Admin alterando credenciais de acesso
    if (req.user.role === 'admin' && username) {
        const userCheck = await db.query('SELECT id, username FROM users WHERE person_id = $1', [id]);
        const existingUser = userCheck.rows[0];
        
        if (existingUser) {
            // Proteção especial: Sub-administradores não podem editar o Administrador Master
            if (existingUser.username.toUpperCase() === 'ADMINISTRADOR' && req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
                console.warn(`[AUTH] Tentativa de sub-admin (${req.user.username}) editar o admin master.`);
            } else {
                if (password) {
                    // Criptografa a nova senha se fornecida
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync(password, salt);
                    
                    // Apenas Admin Master pode alterar o nível de acesso (Role)
                    if (req.user.username.toUpperCase() === 'ADMINISTRADOR' && role) {
                        await db.query('UPDATE users SET username = $1, password_hash = $2, role = $3, must_change_password = TRUE WHERE id = $4', 
                          [username, hash, role, existingUser.id]);
                    } else {
                        await db.query('UPDATE users SET username = $1, password_hash = $2, must_change_password = TRUE WHERE id = $3', 
                          [username, hash, existingUser.id]);
                    }
                } else {
                    // Atualização apenas de username ou role sem alterar a senha
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

// Exclui um membro do sistema (Apenas Administrador Master)
app.delete('/api/people/:id', authenticateToken, async (req, res) => {
  if (req.user.username.toUpperCase() !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Apenas o administrador master pode excluir registros.' });
  }

  try {
    // Proteção: Impede a exclusão da conta do Administrador Master
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

// --- API de Eventos ---

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
                       COALESCE(us.unit_counts, '{}'::jsonb) as unit_counts
                FROM events e
                LEFT JOIN participant_counts pc ON e.id = pc.event_id
                LEFT JOIN unit_stats us ON e.id = us.event_id
                ORDER BY e.date ASC
            `;
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
                       (ep.person_id IS NOT NULL) as is_participant
                FROM events e
                LEFT JOIN participant_counts pc ON e.id = pc.event_id
                LEFT JOIN unit_stats us ON e.id = us.event_id
                LEFT JOIN event_participants ep ON e.id = ep.event_id AND ep.person_id = $1
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
    const { name, description, date, payment_type, participant_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    
    try {
        await db.query('BEGIN'); // Transação para garantir criação atômica
        const eventResult = await db.query('INSERT INTO events (name, description, date, payment_type) VALUES ($1, $2, $3, $4) RETURNING id', [name, description || null, date || null, payment_type || 'parcelado']);
        const eventId = eventResult.rows[0].id;

        // Se houver lista de IDs, insere na tabela de participantes
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

// Adiciona múltiplos participantes a um evento existente (Admin)
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
            // ON CONFLICT DO NOTHING evita duplicatas se o membro já estiver inscrito
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


// Busca detalhes completos de um evento (dados, participantes e pagamentos)
app.get('/api/events/:id/details', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const eventResult = await db.query('SELECT * FROM events WHERE id = $1', [id]);
        const event = eventResult.rows[0];
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

        // Membros só podem ver detalhes de eventos em que estão inscritos
        if (req.user.role !== 'admin' && req.user.role !== 'secretário') {
            const participantResult = await db.query('SELECT 1 FROM event_participants WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
            if (participantResult.rows.length === 0) return res.sendStatus(403);
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
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE event_id = $1', [id]);
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
            const payResult = await db.query('SELECT id, event_id, person_id, amount, month, year, status, receipt_path, receipt_mime, rejection_reason FROM event_payments WHERE event_id = $1 AND person_id = $2', [id, req.user.personId]);
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
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar evento' });
    }
});

// --- API de Pagamentos de Eventos ---

// Lista pagamentos de eventos com filtros opcionais
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
        
        // Membro vê apenas os seus próprios pagamentos de eventos
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

// Busca detalhes de um pagamento de evento específico
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

// Registra novo pagamento para um evento (Membro envia comprovante)
app.post('/api/event-payments', authenticateToken, upload.single('receipt'), async (req, res) => {
    const { person_id, event_id, amount, month, year } = req.body || {};
    
    // Processa e comprime a imagem do comprovante
    const compressed = await compressReceipt(req.file);
    const receipt_content = compressed ? compressed.buffer : null;
    const receipt_mime = compressed ? compressed.mimetype : null;
    const receipt_filename = req.file ? `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}` : null;
    const receipt_path = receipt_filename ? `uploads/${receipt_filename}` : null;
    
    // Define quem é o dono do pagamento (Admin pode escolher o membro)
    const effectivePersonId = req.user.role === 'admin' ? (person_id || req.user.personId) : req.user.personId;

    if (!effectivePersonId) return res.status(400).json({ error: 'Membro não identificado.' });
    if (!event_id) return res.status(400).json({ error: 'Evento não identificado.' });
    if (!amount) return res.status(400).json({ error: 'Valor não informado.' });

    try {
        const status = req.user.role === 'admin' ? 'approved' : 'pending';

        let isUploadedToStorage = false;
        // Upload para nuvem (Supabase) para persistência segura
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

        // Verifica se é pagamento parcelado (mês/ano) ou pagamento único (valores nulos)
        const existingSql = (month && year)
            ? 'SELECT id FROM event_payments WHERE person_id = $1 AND event_id = $2 AND month = $3 AND year = $4'
            : 'SELECT id FROM event_payments WHERE person_id = $1 AND event_id = $2 AND month IS NULL';
        
        const existingParams = (month && year)
            ? [effectivePersonId, event_id, month, year] 
            : [effectivePersonId, event_id];

        const existingResult = await db.query(existingSql, existingParams);
        const existing = existingResult.rows[0];

        if (existing) {
            // Atualiza pagamento existente (reenvio de comprovante)
            await db.query(`
                UPDATE event_payments 
                SET amount = $1, receipt_path = COALESCE($2, receipt_path), receipt_content = COALESCE($3, receipt_content), receipt_mime = COALESCE($4, receipt_mime), status = $5, rejection_reason = NULL 
                WHERE id = $6
            `, [amount, receipt_path, finalDBContent, receipt_mime, status, existing.id]);
            
            // Notifica administradores sobre a atualização
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
            // Cria um novo registro de pagamento de evento
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

// --- API de Vendas Extras (Cantina/Bazar) ---

// Busca histórico de vendas
app.get('/api/sales', authenticateToken, async (req, res) => {
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
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
});

// Registra uma nova venda
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
        `, [event_name, amount, date, description || null, receipt_path, finalDBContent, receipt_mime]);

        logAction(req, 'CREATE_SALE', { id: result.rows[0].id, event_name, amount });
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar venda' });
    }
});

// Exclui uma venda (Admin)
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

// --- Aprovação de Pagamentos de Eventos ---

// Aprova pagamento de evento (Admin)
app.post('/api/event-payments/:id/approve', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        // Busca dados do pagamento para notificação
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name FROM event_payments ep JOIN events e ON ep.event_id = e.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE event_payments SET status = \'approved\', rejection_reason = NULL WHERE id = $1', [req.params.id]);
        
        // Notifica o membro
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

// Rejeita pagamento de evento (Admin/Secretário)
app.post('/api/event-payments/:id/reject', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    const { reason } = req.body || {};
    try {
        const paymentResult = await db.query('SELECT ep.*, e.name as event_name FROM event_payments ep JOIN events e ON ep.event_id = e.id WHERE ep.id = $1', [req.params.id]);
        const payment = paymentResult.rows[0];
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        await db.query('UPDATE event_payments SET status = \'rejected\', rejection_reason = $1 WHERE id = $2', [reason || 'Inválido', req.params.id]);
        
        // Notifica o membro sobre a rejeição
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

// Exclui pagamento de evento (Admin)
app.delete('/api/event-payments/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await db.query('DELETE FROM event_payments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// --- API de Saídas (Despesas) ---

// Lista todas as despesas (Apenas Admin/Secretário)
app.get('/api/outflows', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'secretário') return res.sendStatus(403);
    try {
        const result = await db.query('SELECT id, amount, category, date, description, receipt_path, receipt_mime, created_at FROM outflows ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar saídas' });
    }
});

// Registra uma nova despesa
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
        `, [amount, category, date, description || null, receipt_path, finalDBContent, receipt_mime]);
        
        logAction(req, 'CREATE_OUTFLOW', { amount, category, date });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar saída' });
    }
});

// Exclui uma despesa (Admin/Secretário)
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

// Middleware global de tratamento de erros
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
});

// --- ACESSO SEGURO A ARQUIVOS ---
// Serve comprovantes validando permissões de acesso
app.get('/api/files/receipt/:filename', authenticateToken, async (req, res) => {
    const { filename } = req.params;
    // Normaliza caminho para busca no banco
    const fullRelativePath = path.join('uploads', filename).replace(/\\/g, '/');

    try {
        // 1. Tenta baixar do Supabase Storage (Nuvem) primeiro
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
        
        // 2. Busca o conteúdo binário no banco de dados se não estiver na nuvem
        
        // Tenta em mensalidades
        let result = await db.query('SELECT person_id, receipt_content, receipt_mime FROM payments WHERE receipt_path = $1', [fullRelativePath]);
        let payment = result.rows[0];
        
        // Tenta em pagamentos de eventos
        if (!payment) {
            result = await db.query('SELECT person_id, receipt_content, receipt_mime FROM event_payments WHERE receipt_path = $1', [fullRelativePath]);
            payment = result.rows[0];
        }

        // Tenta em saídas/despesas
        let isOutflow = false;
        if (!payment) {
            result = await db.query('SELECT receipt_content, receipt_mime FROM outflows WHERE receipt_path = $1', [fullRelativePath]);
            payment = result.rows[0];
            isOutflow = true;
        }

        if (!payment) {
            return res.status(404).json({ error: 'Arquivo não encontrado no registro' });
        }

        // Validação de segurança: Admin pode ver tudo, membro só o próprio comprovante
        if (req.user.role !== 'admin' && !isOutflow && req.user.personId !== payment.person_id) {
            console.warn(`[SECURITY] Acesso negado ao arquivo ${filename} para o usuário ${req.user.username}`);
            return res.sendStatus(403);
        }
        
        // Saídas são restritas a Admin e Secretário
        if (isOutflow && req.user.role !== 'admin' && req.user.role !== 'secretário') {
            return res.sendStatus(403);
        }

        if (!payment.receipt_content) {
            return res.status(404).json({ error: 'Conteúdo do arquivo não encontrado no banco de dados' });
        }
        
        // Envia o binário com o MIME-type correto (JPG, PDF, etc)
        res.set('Content-Type', payment.receipt_mime || 'application/octet-stream');
        res.send(payment.receipt_content);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar arquivo' });
    }
});

// --- API DE LOGS DE SISTEMA ---
app.get('/api/admin/logs', authenticateToken, async (req, res) => {
    // Apenas o Administrador Master tem acesso aos logs brutos de auditoria
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

// Marca notificação específica como lida
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.query('UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao marcar como lida' });
    }
});

// Envia notificação manual para usuários (Broadcast ou Individual)
app.post('/api/notifications/send', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403).json({ error: 'Acesso negado' });
    
    const { userId, userIds, title, content } = req.body;
    
    // Normaliza para um array de IDs
    let targetIds = [];
    if (userIds && Array.isArray(userIds)) {
        targetIds = userIds;
    } else if (userId) {
        targetIds = [userId];
    } else {
        // null significa transmissão para TODOS os membros
        targetIds = [null];
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

        res.json({ success: true, notificationId: result.rows[0].id });
    } catch (err) {
        console.error('[NOTIF] Erro ao enviar:', err);
        res.status(500).json({ error: 'Erro ao processar envio' });
    }
});

// --- Lógica de Lembretes Automáticos (CRON) ---

// Envia lembretes para quem ainda não pagou a mensalidade do mês atual
const sendPaymentReminders = async () => {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Busca usuários que NÃO possuem pagamento aprovado este mês
        const unpaidUsers = await db.query(`
            SELECT u.id, u.username, p.name 
            FROM users u
            JOIN people p ON u.person_id = p.id
            WHERE p.id NOT IN (
                SELECT person_id FROM payments 
                WHERE month = $1 AND year = $2 AND status = 'approved'
            )
        `, [currentMonth, currentYear]);

        console.log(`[CRON] Enviando lembretes para ${unpaidUsers.rows.length} usuários.`);

        for (const user of unpaidUsers.rows) {
            const title = 'Lembrete de Mensalidade';
            const content = `Olá ${user.name || user.username}, lembramos que a mensalidade deste mês ainda está pendente. Regularize para nos ajudar a manter o clube!`;
            
            // Salva no banco
            await db.query(`
                INSERT INTO notifications (user_id, title, message, type)
                VALUES ($1, $2, $3, 'automated_reminder')
            `, [user.id, title, content]);

            // Envia Push (Notificação para Celular)
            const pushResult = await db.query('SELECT subscription_data FROM push_subscriptions WHERE user_id = $1', [user.id]);
            const payload = JSON.stringify({ title, body: content });

            pushResult.rows.forEach(sub => {
                webPush.sendNotification(JSON.parse(sub.subscription_data), payload).catch(err => {
                    if (err.statusCode === 410) {
                        db.query('DELETE FROM push_subscriptions WHERE subscription_data = $1', [sub.subscription_data]);
                    }
                });
            });
        }
    } catch (err) {
        console.error('[CRON] Erro no processamento automático:', err);
    }
};

// Agendamento CRON: Roda todos os dias às 09:00 (Verifica dias 5 e 20)
cron.schedule('0 9 * * *', async () => {
    const today = new Date();
    const day = today.getDate();
    const dayOfWeek = today.getDay(); // 0: Dom, 6: Sáb
    
    // Lógica do Dia 20 (Vencimento secundário)
    if (day === 20) {
        if (dayOfWeek === 6) { // Se for Sábado, aguarda o pôr do sol (Sabbath)
            console.log('[CRON] Dia 20 é Sábado. Agendando para o pôr do sol (19:00).');
            setTimeout(() => sendPaymentReminders(), (19 - 9) * 60 * 60 * 1000);
        } else {
            sendPaymentReminders();
        }
    }

    // Lógica do 5º Dia Útil (Vencimento principal)
    if (day >= 5 && day <= 10) {
        const result = await db.query(`
            WITH RECURSIVE days AS (
                SELECT date_trunc('month', CURRENT_DATE)::date AS d
                UNION ALL
                SELECT (d + 1)::date FROM days WHERE d < date_trunc('month', CURRENT_DATE) + interval '10 days'
            ),
            work_days AS (
                SELECT d, row_number() OVER (ORDER BY d) as count
                FROM days
                WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
            )
            SELECT d FROM work_days WHERE count = 5
        `);
        
        const fifthWorkingDay = new Date(result.rows[0].d).getDate();
        if (day === fifthWorkingDay) {
            console.log('[CRON] Hoje é o 5º dia útil. Enviando lembretes.');
            sendPaymentReminders();
        }
    }
});

// Inicialização do Servidor HTTP
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    
    // Executa limpeza inicial de logs ao subir
    cleanupLogs();
    
    // Registra a inicialização do sistema no log de auditoria
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
