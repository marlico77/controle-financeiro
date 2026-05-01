const { Pool } = require('pg'); // Importa a classe Pool do pacote 'pg' para gerenciar conexões com PostgreSQL
require('dotenv').config();      // Carrega as variáveis de ambiente do arquivo .env para o process.env

// Recupera a URL de conexão do banco de dados das variáveis de ambiente
const connectionString = process.env.DATABASE_URL;

// Configura o pool de conexões com o banco de dados
const pool = new Pool({
    connectionString: connectionString, // Define a string de conexão (host, user, pass, db)
    ssl: { rejectUnauthorized: false } // Permite conexões SSL (necessário para bancos em nuvem como Render/Heroku)
});

// Função auxiliar para executar queries de forma mais simples e centralizada
const query = async (text, params) => {
    const start = Date.now(); // Marca o início da execução para fins de log
    try {
        const res = await pool.query(text, params); // Executa a consulta no banco de dados
        const duration = Date.now() - start; // Calcula quanto tempo a query levou
        // console.log(`[DB] Query executada em ${duration}ms`); // Log opcional de performance
        return res; // Retorna o resultado da consulta
    } catch (err) {
        console.error('[DB] Erro na query:', err); // Exibe erro no console do servidor se a query falhar
        throw err; // Re-lança o erro para ser tratado no servidor (server.js)
    }
};

// Exporta o pool e a função de query para serem usados em outras partes do sistema
module.exports = {
    pool,
    query
};
