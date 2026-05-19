const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

// Configuração do pool do PostgreSQL com suporte a SSL para conexões em nuvem
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

// Helper para executar consultas SQL de forma simplificada e centralizada
const query = async (text, params) => {
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.error('[DB] Erro na query:', err);
        throw err;
    }
};

module.exports = {
    pool,
    query
};
