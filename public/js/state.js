// --- Auxiliares de Armazenamento (LocalStorage/SessionStorage) ---
// Obtém um item do armazenamento, verificando primeiro o LocalStorage e depois o SessionStorage
const getStorageItem = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

// Define um item no armazenamento. Se 'persistent' for true, usa LocalStorage, senão usa SessionStorage
const setStorageItem = (key, value, persistent = true) => {
    if (persistent) {
        localStorage.setItem(key, value); // Armazenamento permanente (mesmo fechando o navegador)
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.setItem(key, value); // Armazenamento temporário (apenas nesta sessão/aba)
        localStorage.removeItem(key);
    }
};

// Remove um item de ambos os tipos de armazenamento (limpeza completa)
const removeStorageItem = (key) => {
    localStorage.removeItem(key); // Remove do LocalStorage
    sessionStorage.removeItem(key); // Remove do SessionStorage
};

// Função auxiliar para obter o token de autenticação atual de forma segura
const getToken = () => state.token || getStorageItem('token');

// --- Auxiliares de Segurança ---
// Escapa caracteres HTML para prevenir ataques de XSS (Cross-Site Scripting)
const escapeHTML = (str) => {
    if (!str) return ''; // Se a string for nula ou vazia, retorna vazio
    return String(str)
        .replace(/&/g, '&amp;')   // Substitui & por &amp;
        .replace(/</g, '&lt;')    // Substitui < por &lt;
        .replace(/>/g, '&gt;')    // Substitui > por &gt;
        .replace(/"/g, '&quot;')  // Substitui " por &quot;
        .replace(/'/g, '&#039;'); // Substitui ' por &#039;
};

// Gerenciamento de Estado Global da Aplicação
const state = {
    token: getStorageItem('token') || null, // Token de acesso do usuário logado
    people: [],                             // Lista de membros cadastrados
    payments: [],                           // Lista de pagamentos de mensalidades
    currentYear: new Date().getFullYear(),  // Ano atual para filtragem de dados
    activeTab: getStorageItem('activeTab') || 'dashboard', // Aba ativa na interface
    role: getStorageItem('role') || null,   // Nível de acesso (admin, secretário, membro)
    username: getStorageItem('username') || null, // Nome de usuário (login)
    name: getStorageItem('name') || null,     // Nome real do usuário para exibição
    personId: getStorageItem('personId') || null, // ID do membro vinculado ao usuário
    notifications: [],                      // Lista de notificações recentes
    events: [],                             // Lista de eventos cadastrados
    eventPayments: [],                      // Lista de pagamentos vinculados a eventos
    outflows: [],                           // Lista de despesas (saídas)
    sales: [],                              // Lista de vendas (entradas)
    currentEvent: null,                     // Evento que está sendo visualizado no momento
    eventDetailYear: new Date().getFullYear(), // Ano de filtro nos detalhes do evento
    charts: {                               // Objetos das instâncias dos gráficos (Chart.js)
        pie: null,
        bar: null,
        evPie: null,
        evBar: null,
        mensPie: null,
        mensBar: null
    },
    peopleSort: {                           // Configuração de ordenação da lista de pessoas
        column: 'name',
        direction: 'asc'
    },
    logFilter: 'all'                        // Filtro ativo na tela de logs do sistema
};
