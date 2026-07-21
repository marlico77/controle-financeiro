// --- Função Central de Requisições à API (Fetch Wrapper) ---
// Adiciona o token de autorização e trata erros de sessão automaticamente
async function apiFetch(url, options = {}) {
    const headers = {
        // Injeta o token JWT no cabeçalho Authorization
        'Authorization': `Bearer ${state.token || localStorage.getItem('token')}`,
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        ...options.headers
    };

    // Define o Content-Type como JSON por padrão se houver um corpo na requisição
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    console.log(`[API] Chamando: ${url} | Token: ${(state.token || localStorage.getItem('token')) ? 'Presente' : 'AUSENTE'}`);
    const res = await fetch(url, {
        ...options,
        headers
    });

    let data = {};
    try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {}; // Tenta converter a resposta para objeto JavaScript
    } catch{
        console.warn('[API] Resposta não é JSON:', url);
    }

    // Se a resposta não for OK (status diferente de 200-299)
    if (!res.ok) {
        // Se o servidor retornar 403 indicando troca de senha obrigatória
        if (res.status === 403 && data.mustChangePassword) {
            document.getElementById('force-change-modal').style.display = 'flex'; // Abre o modal de troca de senha
            mainSection.style.display = 'none'; // Esconde o dashboard
            throw new Error('Alteração de senha obrigatória');
        }

        // Se o token for inválido ou expirar (401 ou 403)
        if (res.status === 401 || res.status === 403) {
            console.warn(`[AUTH] Erro ${res.status} na URL: ${url}`);
            if (res.status === 401) {
                // Redireciona para o login apenas se estivermos na área logada
                if (document.getElementById('main-section').style.display === 'flex') {
                    console.warn('[AUTH] Sessão expirada ou inválida. Retornando ao login...');
                    handleUnauthorized(url);
                }
            }
        }
        throw new Error(data.error || 'Erro na requisição'); // Lança erro com a mensagem do servidor
    }
    return data; // Retorna os dados processados
}

// --- Configuração do Temporizador de Inatividade ---
const INACTIVITY_LIMIT = 20 * 60 * 1000; // Tempo total: 20 minutos
const WARNING_TIME = 18 * 60 * 1000;    // Aviso em: 18 minutos (2 minutos antes de cair)
let inactivityTimeout;
let warningTimeout;

// Reinicia o cronômetro sempre que houver atividade do usuário
function resetInactivityTimer() {
    if (inactivityTimeout) clearTimeout(inactivityTimeout); // Cancela o timer anterior
    if (warningTimeout) clearTimeout(warningTimeout); // Cancela o aviso anterior

    // Só inicia o timer se o usuário estiver logado
    if (state.token || getStorageItem('token')) {
        warningTimeout = setTimeout(() => {
            showStatus('⚠️ Sua sessão expirará em 2 minutos por inatividade.', 'info');
        }, WARNING_TIME);

        inactivityTimeout = setTimeout(() => {
            logout(); // Faz o logout automático após o limite de tempo
        }, INACTIVITY_LIMIT);
    }
}

// Monitora eventos de interação para detectar atividade do usuário
['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, resetInactivityTimer);
});

// --- Referências aos Elementos do DOM (HTML) ---
const loginSection = document.getElementById('login-section'); // Seção de Login
const mainSection = document.getElementById('main-section');   // Seção Principal (Dashboard)
const loginForm = document.getElementById('login-form');       // Formulário de Login
const loginError = document.getElementById('login-error');     // Div de erro no login
const logoutBtn = document.getElementById('logout-btn');       // Botão Sair
const navLinks = document.querySelectorAll('.nav-links li');   // Itens do menu lateral
const tabContents = document.querySelectorAll('.tab-content'); // Áreas de conteúdo das abas
const paymentsBody = document.getElementById('payments-body'); // Tabela de mensalidades
const peopleBody = document.getElementById('people-body');     // Tabela de membros
const yearSelect = document.getElementById('year-select');     // Filtro de ano

// Modais (Janelas flutuantes)
const paymentModal = document.getElementById('payment-modal');       // Modal de pagamento de mensalidade
const personModal = document.getElementById('person-modal');         // Modal de cadastro/edição de membro
const eventCreateModal = document.getElementById('event-create-modal'); // Modal de criação de evento
const eventPaymentModal = document.getElementById('event-payment-modal'); // Modal de pagamento de evento
const closeButtons = document.querySelectorAll('.close-modal');       // Botões 'X' para fechar modais

// --- Gerenciador do Formulário de Mensagens/Notificações (Admin) ---
const initMessageForm = () => {
    const form = document.getElementById('send-msg-form'); // Formulário de envio
    if (!form) return;

    // Lógica da barra de pesquisa de membros para envio de mensagem
    const searchInput = document.getElementById('msg-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            // Filtra os itens da lista escondendo quem não combina com o termo
            document.querySelectorAll('#members-checkbox-container .checkbox-item').forEach(item => {
                const search = item.getAttribute('data-search') || '';
                item.style.display = search.includes(term) ? 'flex' : 'none';
            });
        };
    }

    // Lógica do botão "Selecionar Todos"
    const selectAll = document.getElementById('msg-select-all');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const isChecked = e.target.checked;
            // Marca ou desmarca todos os checkboxes que estiverem visíveis no momento
            document.querySelectorAll('#members-checkbox-container input[type="checkbox"]').forEach(cb => {
                if (cb.parentElement.style.display !== 'none') {
                    cb.checked = isChecked;
                }
            });
        };
    }

    // Tratamento do envio do formulário de mensagem
    form.onsubmit = async (e) => {
        e.preventDefault(); // Impede o recarregamento da página
        e.stopPropagation();

        const selectAllChecked = document.getElementById('msg-select-all').checked;
        let selectedIds = [];

        if (selectAllChecked) {
            selectedIds = null; // Se marcado "Todos", o backend entende o valor null como destino global
        } else {
            // Coleta os IDs apenas dos membros que foram marcados manualmente
            const checkboxes = document.querySelectorAll('#members-checkbox-container input[type="checkbox"]:checked');
            selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

            if (selectedIds.length === 0) {
                showAlert('Por favor, selecione pelo menos um membro ou marque "Todos os Membros".', 'Aviso');
                return;
            }
        }

        const title = document.getElementById('msg-title').value; // Título da notificação
        const content = document.getElementById('msg-content').value; // Conteúdo da mensagem

        try {
            // Envia os dados para a API de notificações
            await apiFetch('/api/notifications/send', {
                method: 'POST',
                body: JSON.stringify({
                    userIds: selectedIds,
                    title,
                    content
                })
            });
            showAlert('Mensagem enviada com sucesso!', 'Sucesso');
            form.reset(); // Limpa o formulário
            // Desmarca todos os checkboxes
            document.querySelectorAll('#msg-target-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        } catch (err) {
            console.error('[MSG] Erro ao enviar:', err);
            showAlert('Erro ao enviar mensagem: ' + err.message, 'Erro');
        }
    };
};

// Lógica Global para Fechamento de Modais
closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Encontra todos os elementos com classe 'modal' e os esconde
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        const styleEl = document.getElementById('print-orientation-style');
        if (styleEl) styleEl.remove();
        const calFilters = document.getElementById('calendar-export-filters');
        if (calFilters) calFilters.style.display = 'none';
    });
});

// Nota: O fechamento ao clicar fora do modal foi removido para evitar fechamentos acidentais durante preenchimentos.

// --- Controle da Barra Lateral (Sidebar) ---
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

// Inicializa o estado da sidebar (recolhida ou expandida) baseado na preferência salva
const initializeSidebar = () => {
    // Aplica o estado recolhido apenas em telas maiores que 768px (Desktop)
    if (window.innerWidth > 768) {
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && sidebar) {
            sidebar.classList.add('collapsed');
        }
    }
};

// Listener para o botão de alternar sidebar
if (sidebarToggle) {
    sidebarToggle.onclick = () => {
        sidebar.classList.toggle('collapsed'); // Inverte a classe CSS
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed')); // Salva a escolha
    };
}

// --- Lógica de Notificações do Sistema ---
const initializeNotifications = () => {
    if (window._notificationsInitialized) return;
    window._notificationsInitialized = true;

    // Elementos de gatilho (Desktop e Mobile)
    const desktopBell = document.querySelector('#notification-trigger .notification-bell');
    const mobileTrigger = document.getElementById('mobile-notification-trigger');

    // Função centralizada para alternar a visibilidade do menu
    const toggleDropdown = (e) => {
        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        e.preventDefault();
        e.stopPropagation(); // Impede que o evento chegue no document (que fecharia o menu)

        const isActive = dropdown.classList.contains('active');

        dropdown.classList.toggle('active', !isActive);
        dropdown.style.display = !isActive ? 'block' : 'none';

        if (!isActive && typeof fetchNotifications === 'function') {
            fetchNotifications();
        }
    };

    // Vincula o evento diretamente aos ícones para evitar conflitos de delegação (Event Bubbling)
    if (desktopBell) desktopBell.addEventListener('click', toggleDropdown);
    if (mobileTrigger) mobileTrigger.addEventListener('click', toggleDropdown);

    // Delegação no document apenas para FECHAR o menu ao clicar fora
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        // Se clicou dentro do próprio dropdown, não faz nada
        if (e.target.closest('#notification-dropdown')) return;

        // Se clicou fora, fecha se estiver aberto
        if (dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
            dropdown.style.display = 'none';
        }
    });

    // Botão para marcar todas as notificações como lidas
    const markReadBtn = document.getElementById('mark-all-read');
    if (markReadBtn) {
        markReadBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                // Envia requisição PATCH para atualizar o status no banco
                await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
                fetchNotifications(); // Recarrega a lista
            } catch (err) {
                console.error('Error marking all as read:', err);
            }
        };
    }

    // Listener para cliques em itens individuais da lista de notificações
    const list = document.getElementById('notification-list');
    if (list) {
        list.onclick = (e) => {
            const item = e.target.closest('.notification-item.clickable');
            if (item) {
                e.stopPropagation();
                const id = item.dataset.relatedId; // ID do registro relacionado (pagamento, evento, etc)
                const type = item.dataset.relatedType; // Tipo da notificação
                if (id && type) handleNotificationClick(id, type); // Direciona o usuário
            }
        };
    }

    // Inicia a busca automática (polling) de notificações a cada 30 segundos
    fetchNotifications();
    setInterval(fetchNotifications, 30000);
}

// --- Funções de Autenticação e Controle de Sessão ---
// Verifica se o usuário está autenticado ao carregar o site
async function checkAuth() {
    const splash = document.getElementById('splash-screen'); // Tela de carregamento (splash)
    const token = getStorageItem('token'); // Busca o token salvo

    // Otimização de UI: Se houver token, oculta o login e mostra o splash imediatamente
    if (token) {
        if (loginSection) loginSection.style.display = 'none';
        if (mainSection) mainSection.style.display = 'none';
        if (splash) {
            splash.style.display = 'flex';
            splash.style.opacity = '1';
            splash.classList.remove('fade-out');
        }
        
        // Em MPA, se tem token e a página atual for login, redireciona para o dashboard
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
        if (currentPage === 'login' || currentPage === '') {
            window.location.href = '/dashboard.html';
            return;
        }

        state.token = token;
        state.role = state.role || getStorageItem('role');
        state.personId = state.personId || getStorageItem('personId');

        try {
            // Verifica a validade do token com o servidor para garantir segurança real
            const status = await apiFetch('/api/auth/status');

            // Atualiza o estado global com os dados confirmados pelo servidor
            state.role = status.role;
            state.username = status.username;
            state.name = status.name;

            // Salva novamente nos storages para garantir persistência correta (Local vs Sessão)
            const isPersistent = !!localStorage.getItem('token');
            setStorageItem('role', status.role, isPersistent);
            setStorageItem('username', status.username, isPersistent);
            setStorageItem('name', status.name, isPersistent);

            // Exibe o nome do usuário no cabeçalho
            const userNameDisplayCheck = document.getElementById('user-name-display');
            if (userNameDisplayCheck) userNameDisplayCheck.textContent = status.name || 'Usuário';

            // Se for necessário trocar a senha (primeiro acesso), bloqueia o dashboard e abre o modal
            if (status.mustChangePassword) {
                if (loginSection) loginSection.style.display = 'none';
                if (mainSection) mainSection.style.display = 'none';
                if (splash) splash.classList.add('fade-out');
                document.getElementById('force-change-modal').style.display = 'flex';
                return;
            }

            // Verifica Aceite da LGPD
            if (!status.lgpdAccepted) {
                const lgpdModal = document.getElementById('lgpd-modal');
                if (lgpdModal) {
                    lgpdModal.style.display = 'flex';
                }
            }

            // Tudo OK: Esconde login/splash e libera o Dashboard principal
            if (loginSection) loginSection.style.display = 'none';
            if (mainSection) mainSection.style.display = 'flex';


            // --- Lógica de Visibilidade de Abas baseada em Nível de Acesso (Roles) ---
            const isAdmin = state.role === 'admin';
            const isSecretary = state.role === 'secretário';
            const isSocialMedia = state.role === 'social_midia';
            const isMaster = isAdmin && (state.username || '').toUpperCase() === 'ADMINISTRADOR';

            // Mapeamento dos elementos de navegação
            const navItems = {
                dashboard: document.querySelector('[data-target="dashboard"]'),
                people: document.querySelector('[data-target="people"]'),
                events: document.querySelector('[data-target="events"]'),
                reports: document.querySelector('[data-target="reports"]'),
                authorizations: document.getElementById('nav-authorizations'),
                outflows: document.getElementById('nav-outflows'),
                sales: document.getElementById('nav-sales'),
                messages: document.getElementById('nav-messages'),
                logs: document.getElementById('nav-logs'),
                gallery: document.getElementById('nav-gallery')
            };

            // Restrição de Abas e Ajustes Visuais por Perfil
            if (!isAdmin) {
                // Usuários Comuns e Secretários não veem abas de gestão administrativa geral
                if (navItems.people) navItems.people.style.display = 'none';
                if (navItems.outflows) navItems.outflows.style.display = 'none';
                if (navItems.sales) navItems.sales.style.display = 'none';
                if (navItems.messages) navItems.messages.style.display = isSecretary ? 'flex' : 'none';
                if (navItems.logs) navItems.logs.style.display = 'none';

                // Secretário tem acesso aos relatórios e autorizações; membro comum e social media não
                if (navItems.reports) navItems.reports.style.display = isSecretary ? 'flex' : 'none';
                if (navItems.authorizations) navItems.authorizations.style.display = isSecretary ? 'flex' : 'none';
                
                // Secretário e Social Media têm acesso à Galeria; membro comum não
                if (navItems.gallery) navItems.gallery.style.display = (isSecretary || isSocialMedia) ? 'flex' : 'none';

                // Ajusta os cartões de estatísticas no Dashboard para refletir o painel pessoal (membro/secretário)
                const cards = document.querySelectorAll('.stat-card');
                if (cards[1]) cards[1].style.display = 'none'; // Esconde caixa atual
                if (cards[2]) cards[2].style.display = 'none'; // Esconde inadimplência

                const statLabels = document.querySelectorAll('.stat-label');
                if (statLabels[0]) statLabels[0].textContent = 'Total Pago (Ano)';

                document.getElementById('page-title').textContent = 'Meu Status de Mensalidade';
            } else {
                // Acesso total para Administradores
                if (navItems.people) navItems.people.style.display = 'flex';
                if (navItems.reports) navItems.reports.style.display = 'flex';
                if (navItems.authorizations) navItems.authorizations.style.display = 'flex';
                if (navItems.outflows) navItems.outflows.style.display = 'flex';
                if (navItems.sales) navItems.sales.style.display = 'flex';
                if (navItems.messages) navItems.messages.style.display = 'flex';
                if (navItems.gallery) navItems.gallery.style.display = 'flex';

                // Logs visíveis apenas para o usuário mestre (ADMINISTRADOR)
                if (navItems.logs) navItems.logs.style.display = isMaster ? 'flex' : 'none';

                document.getElementById('page-title').textContent = 'Dashboard de Mensalidades';
            }

            // Oculta aba Calendário dentro de Eventos para usuários comuns e social media
            const tabSite = document.getElementById('tab-site-calendar');
            if (tabSite) {
                if (isAdmin || isSecretary) {
                    tabSite.style.display = 'inline-block'; // Mostra para admin e secretário
                } else {
                    tabSite.style.display = 'none'; // Esconde para membro comum e social midia
                    // Reseta para a aba interna se não tiver acesso
                    if (state.activeEventsSubmenu === 'site') {
                        state.activeEventsSubmenu = 'internal';
                    }
                }
            }

            // Garante que a sidebar reflita o estado salvo
            initializeSidebar();

            // Em MPA, a aba ativa é ditada pela URL atual, não pelo LocalStorage
            let currentPage = window.location.pathname.split('/').pop().replace('.html', '');
            if (!currentPage || currentPage === '/') currentPage = 'dashboard';
            
            state.activeTab = currentPage;

            // Verificações de segurança para garantir que usuários não acessem abas proibidas via manipulação de estado
            if (state.activeTab === 'logs' && !isMaster) {
                window.location.href = '/dashboard.html';
            }

            // Bloqueia abas administrativas gerais para não-admins
            if (!isAdmin && (state.activeTab === 'people' || state.activeTab === 'outflows' || state.activeTab === 'sales' || (state.activeTab === 'messages' && !isSecretary))) {
                window.location.href = '/dashboard.html';
            }

            // Bloqueia relatórios e autorizações para quem não é admin nem secretário (ou seja, membro comum e social_midia)
            if (state.role !== 'admin' && state.role !== 'secretário' && (state.activeTab === 'reports' || state.activeTab === 'authorizations')) {
                window.location.href = '/dashboard.html';
            }

            // Bloqueia galeria apenas para membros comuns (permitido para admin, secretário, e social_midia)
            if (state.role === 'member' && state.activeTab === 'gallery') {
                window.location.href = '/dashboard.html';
            }

            // Inicia o cronômetro de inatividade após confirmar a autenticação
            resetInactivityTimer();
            // Carrega os dados iniciais do banco
            await loadInitialData();
            // Renderiza apenas a aba atual (em vez de switchTab que poderia bugar)
            switchTab(state.activeTab, true);

            // Oculta o splash screen apenas APÓS carregar os dados
            const splashScreen = document.getElementById('splash-screen');
            if (splashScreen) {
                splashScreen.classList.add('fade-out');
                setTimeout(() => splashScreen.style.display = 'none', 300);
            }

            // Carregamento de notificações em segundo plano para não atrasar a visualização inicial
            setTimeout(() => {
                fetchNotifications();
                // Solicita permissão para notificações push se ainda não houver
                if ('serviceWorker' in navigator && Notification.permission === 'default') {
                    requestPushPermission();
                }
            }, 2000);
        } catch (err) {
            console.error('Auth verification failed:', err);
            handleUnauthorized('checkAuth'); // Se a verificação falhar, desloga por segurança
        }
    } else {
        // Se não houver token, mostra a tela de login
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.style.display = 'none', 300);
        }
        if (loginSection) loginSection.style.display = 'flex';
        if (mainSection) mainSection.style.display = 'none';
        
        // Em MPA, se não tem token e NÃO está na tela de login, redireciona pro login
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
        if (currentPage !== 'login' && currentPage !== '') {
            window.location.href = '/login.html';
        }
    }
}

// --- Carregamento de Dados Iniciais ---
async function loadInitialData() {
    try {
        // Carregamento em paralelo (Promise.all) para máxima performance na inicialização
        const promises = [
            apiFetch('/api/people'), // Lista de membros
            apiFetch(`/api/payments?year=${state.currentYear}`), // Mensalidades do ano atual
            apiFetch('/api/events') // Lista de eventos
        ];

        // Adiciona requisições extras apenas se for admin
        if (state.role === 'admin') {
            promises.push(apiFetch('/api/event-payments')); // Pagamentos de eventos
            promises.push(apiFetch('/api/outflows')); // Saídas de caixa
            promises.push(apiFetch('/api/sales')); // Vendas (Cantina/Uniformes)
        } else {
            // Membro comum e secretário veem apenas seus próprios pagamentos de eventos
            promises.push(apiFetch(`/api/event-payments?person_id=${state.personId}`));
        }

        // Aguarda todas as requisições terminarem. Se uma falhar, retorna lista vazia (catch interno)
        const results = await Promise.all(promises.map(p => p.catch(err => {
            console.error('[API ERROR] Falha ao carregar recurso:', err);
            return []; // Retorna lista vazia para não travar o carregamento do restante
        })));

        // Distribui os resultados nos estados globais
        state.people = results[0];
        state.payments = results[1];
        state.events = results[2];
        state.eventPayments = results[3] || [];

        if (state.role === 'admin') {
            state.outflows = results[4] || [];
            state.sales = results[5] || [];
        } else {
            state.outflows = [];
            state.sales = [];
        }

        // Atualiza o nome exibido no topo para contas de membros comuns e secretários
        if (state.role !== 'admin' && state.people.length > 0) {
            const person = state.people.find(p => p.id == state.personId) || state.people[0];
            if (person) {
                const userNameDisplayUpdate = document.getElementById('user-name-display');
                if (userNameDisplayUpdate) userNameDisplayUpdate.textContent = person.name;
            }
        }

        // Renderiza os componentes visuais principais
        renderEvents();
        renderDashboard();

        if (state.role === 'admin') {
            renderPeople();

            // Alerta visual imediato para o Admin se houver pagamentos aguardando aprovação
            const pendingPayments = state.payments.filter(p => p.status === 'pending');
            if (pendingPayments.length > 0) {
                setTimeout(() => {
                    if (state.role === 'admin') {
                        const modal = document.getElementById('notification-modal');
                        const msgEl = document.getElementById('notif-content');
                        if (modal && msgEl) {
                            msgEl.innerHTML = `Existem <strong>${pendingPayments.length}</strong> comprovante(s) aguardando sua aprovação no sistema.`;
                            modal.style.display = 'flex';

                            // Adiciona o comportamento de fechar para o botão Entendido neste contexto
                            const closeBtn = document.getElementById('close-notif-btn');
                            if (closeBtn) {
                                closeBtn.onclick = () => {
                                    modal.style.display = 'none';
                                };
                            }
                        }
                    }
                }, 1500);
            }
        }

        // Atualiza os números (cards) do dashboard
        updateDashboardStats();

        // Se estiver na aba de logs, carrega os logs do sistema
        if (state.activeTab === 'logs') fetchLogs();
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

// --- Tratamento do Formulário de Login ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    try {
        // Mostra estado de carregamento no botão
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Acessando...';
        }

        // Limpa estados residuais de sessões anteriores por segurança
        state.people = [];
        state.payments = [];
        state.role = null;
        state.personId = null;

        // Requisição para o endpoint de login
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, force: e.detail && e.detail.force, rememberMe })
        });
        const data = await res.json();

        // Se houver outra sessão ativa, o servidor retorna 409 e o sistema pergunta se deseja derrubar a outra
        if (res.status === 409) {
            document.getElementById('session-modal').style.display = 'flex';
            return;
        }

        if (res.ok) {
            // Sucesso no login
            const isForced = data.mustChangePassword;

            // Salva o token e dados básicos nos storages (Local ou Sessão conforme escolha do usuário)
            setStorageItem('token', data.token, rememberMe);
            setStorageItem('role', data.role, rememberMe);
            setStorageItem('username', data.username, rememberMe);
            setStorageItem('name', data.name || data.username, rememberMe);
            setStorageItem('personId', data.personId || '', rememberMe);

            // Atualiza o estado global da aplicação
            state.token = data.token;
            state.role = data.role;
            state.username = data.username;
            state.name = data.name || data.username;
            state.personId = data.personId;

            const userNameDisplay = document.getElementById('user-name-display');
            if (userNameDisplay) userNameDisplay.textContent = state.name;

            // Se for o primeiro acesso, obriga a troca de senha. Caso contrário, entra no dashboard.
            if (isForced) {
                document.getElementById('force-change-modal').style.display = 'flex';
            } else {
                checkAuth(); // Verifica a autorização completa e carrega o sistema
            }
        } else {
            // Exibe mensagem de erro (Ex: Usuário ou senha inválidos)
            loginError.textContent = data.error;
        }
    } catch (err) {
        console.error('[AUTH ERROR]', err);
        loginError.textContent = 'Erro ao conectar ao servidor';
    } finally {
        // Restaura o botão de login
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Acessar Conta';
        }
    }
    });
}

// Trata casos onde o servidor retorna erro de autorização (401/403)
function handleUnauthorized(originUrl = '') {
    console.log(`[AUTH] Tratando acesso não autorizado: ${originUrl}`);

    // Remove o token para forçar re-autenticação
    removeStorageItem('token');
    removeStorageItem('role');
    removeStorageItem('username');
    removeStorageItem('name');
    removeStorageItem('personId');
    state.token = null;
    state.role = null;

    // Redireciona visualmente para a tela de login
    const loginSection = document.getElementById('login-section');
    const mainSection = document.getElementById('main-section');
    const loginError = document.getElementById('login-error');

    if (loginSection && mainSection) {
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
        if (loginError) {
            loginError.textContent = 'Sessão expirada. Por favor, faça login novamente.';
            loginError.style.color = 'var(--accent-color)';
        }
    }
}

// Executa o logout completo limpando todos os dados da sessão
function logout() {
    const hadToken = !!getStorageItem('token');
    // Remove todos os itens salvos nos storages
    removeStorageItem('token');
    removeStorageItem('role');
    removeStorageItem('username');
    removeStorageItem('name');
    removeStorageItem('personId');
    state.token = null;
    state.role = null;

    // Se havia uma sessão ativa, recarrega a página para limpar estados residuais do JS
    if (hadToken) {
        window.location.reload();
    } else {
        // Caso contrário, apenas altera a visibilidade
        document.getElementById('main-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'flex';
        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'none';
    }
}

// Atribui o clique do botão Sair
if (logoutBtn) logoutBtn.onclick = logout;
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
if (mobileLogoutBtn) mobileLogoutBtn.onclick = logout;

// Aceite LGPD
const acceptLgpdBtn = document.getElementById('accept-lgpd-btn');
if (acceptLgpdBtn) {
    acceptLgpdBtn.onclick = async () => {
        try {
            acceptLgpdBtn.disabled = true;
            acceptLgpdBtn.textContent = 'Aguarde...';
            const res = await apiFetch('/api/auth/lgpd-accept', { method: 'POST' });
            if (res.success) {
                document.getElementById('lgpd-modal').style.display = 'none';
                showStatus('Termos aceitos com sucesso!', 'success');
            }
        } catch (err) {
            console.error('Erro LGPD:', err);
            showStatus('Erro ao aceitar termos. Tente novamente.', 'error');
            acceptLgpdBtn.disabled = false;
            acceptLgpdBtn.textContent = 'Li, Compreendi e Aceito os Termos';
        }
    };
}

// Botão para forçar login (derrubar outras sessões ativas do mesmo usuário)
const confirmForceLoginBtn = document.getElementById('confirm-force-login');
if (confirmForceLoginBtn) {
    confirmForceLoginBtn.onclick = () => {
        // Re-dispara o evento de submit do formulário com o parâmetro 'force' ativado
        loginForm.dispatchEvent(new CustomEvent('submit', {
            detail: { force: true },
            cancelable: true
        }));
        document.getElementById('session-modal').style.display = 'none';
    };
}

// --- Sistema de Navegação por Abas ---
function switchTab(tabName, force = false) {
    // Evita recarregar a mesma aba se já estiver nela
    if (!force && state.activeTab === tabName) return;
    
    // Lógica MPA: Se estamos tentando ir para outra página, redireciona o navegador
    let currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    if (!currentPage || currentPage === '/') currentPage = 'login';
    
    if (!force && currentPage !== tabName) {
        window.location.href = `/${tabName}.html`;
        return;
    }

    state.activeTab = tabName;
    setStorageItem('activeTab', tabName, !!localStorage.getItem('token')); // Salva aba atual

    // Fechar SSE do WhatsApp se mudar para qualquer aba que não seja 'messages'
    if (tabName !== 'messages' && window.waEventSource) {
        console.log('[WA-SSE] Fechando SSE por mudança de aba principal.');
        window.waEventSource.close();
        window.waEventSource = null;
    }

    // Atualiza classes CSS nos links do menu
    navLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.target === tabName);
    });

    // Alterna a visibilidade dos containers de cada aba
    tabContents.forEach(tab => {
        tab.style.display = tab.id === `${tabName}-page` ? 'block' : 'none';
    });

    // Mostra/esconde botões de ação específicos (Ex: Adicionar Membro)
    const peopleActions = document.getElementById('people-actions');
    if (peopleActions) {
        peopleActions.style.display = tabName === 'people' ? 'flex' : 'none';
    }

    const eventsActions = document.getElementById('events-actions');
    const siteCalendarActions = document.getElementById('site-calendar-actions');
    if (tabName === 'events') {
        const isSite = state.activeEventsSubmenu === 'site';
        if (eventsActions) eventsActions.style.display = (!isSite && state.role === 'admin') ? 'flex' : 'none';
        if (siteCalendarActions) siteCalendarActions.style.display = (isSite && (state.role === 'admin' || state.role === 'secretário')) ? 'flex' : 'none';
    } else {
        if (eventsActions) eventsActions.style.display = 'none';
        if (siteCalendarActions) siteCalendarActions.style.display = 'none';
    }

    // Atualiza o título dinâmico da página no topo
    const title = document.getElementById('page-title');
    if (title) {
        if (tabName === 'dashboard') title.textContent = state.role === 'admin' ? 'Dashboard de Mensalidades' : 'Meu Status de Mensalidade';
        else if (tabName === 'people') title.textContent = 'Gerenciamento de Membros';
        else if (tabName === 'events') title.textContent = 'Gestão de Eventos';
        else if (tabName === 'reports') title.textContent = 'Relatórios do Sistema';
        else if (tabName === 'mensalidade') title.textContent = 'Controle de Mensalidades';
        else if (tabName === 'authorizations') title.textContent = 'Autorizações de Saída';
        else if (tabName === 'outflows') title.textContent = 'Gestão de Despesas';
        else if (tabName === 'sales') title.textContent = 'Gestão de Vendas';
        else if (tabName === 'logs') title.textContent = 'Logs de Auditoria';
        else if (tabName === 'profile') title.textContent = 'Meu Perfil';
        else if (tabName === 'gallery') title.textContent = 'Galeria de Fotos';
    }

    // Dispara o carregamento/renderização específico da aba que foi aberta
    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'people') renderPeople();
    if (tabName === 'events') {
        if (state.activeEventsSubmenu === 'site') fetchSiteCalendar();
        else fetchEventsData();
    }
    if (tabName === 'outflows') renderOutflows();
    if (tabName === 'sales') fetchSales();
    if (tabName === 'logs') fetchLogs();
    if (tabName === 'profile') renderProfile();
    if (tabName === 'reports') {
        populateReportSelects();
    }

    // Inicializações de funcionalidades específicas
    if (tabName === 'messages') renderMessages();
    if (tabName === 'gallery') fetchGallery();
    if (tabName === 'pwa-install' && typeof updatePWAUI === 'function') {
        updatePWAUI();
    }

    // Auxiliar para barras de rolagem fixas (melhora UX em tabelas longas)
    if (typeof initStickyScrollbars === 'function') {
        setTimeout(initStickyScrollbars, 200);
    }

    // No mobile, fecha a barra lateral automaticamente ao clicar em uma aba
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

// Atribui evento de clique a todos os itens do menu lateral
navLinks.forEach(link => {
    link.onclick = () => {
        const target = link.dataset.target;
        if (target) {
            console.log('[NAV] Mudando para aba:', target);
            switchTab(target);
        }
    };
});

// Preenche os menus suspensos (selects) dos relatórios com dados atualizados
function populateReportSelects() {
    const memberSelect = document.getElementById('report-member-select');
    const eventSelect = document.getElementById('report-event-select');

    // Preenche lista de membros (filtrando responsáveis)
    if (memberSelect) {
        memberSelect.innerHTML = '<option value="">Selecione um Membro</option>' +
            state.people.filter(p => p.unit !== 'Responsável').map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    }

    // Preenche lista de eventos
    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">Selecione um Evento</option>' +
            state.events.map(e => `<option value="${e.id}">${escapeHTML(e.name)}</option>`).join('');
    }
};

// Botão "Voltar" dentro da visualização de detalhes de um evento
const backToEventsBtn = document.getElementById('back-to-events');
if (backToEventsBtn) {
    backToEventsBtn.onclick = () => {
    const masterView = document.getElementById('events-master-view'); // Lista de eventos
    const detailView = document.getElementById('events-detail-view'); // Detalhes de um evento
    if (masterView) masterView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';

    // Ajusta visibilidade de botões administrativos
    const isAdmin = state.role === 'admin';
    if (isAdmin) {
        const addEventBtn = document.getElementById('add-event-btn');
        const addPartBtn = document.getElementById('add-participants-btn');
        if (addEventBtn) addEventBtn.style.display = 'block';
        if (addPartBtn) addPartBtn.style.display = 'none';
    }
};

// Rastreador global para evitar que o Admin seja bombardeado com as mesmas notificações em uma mesma sessão
const sessionShownModals = new Set();

// Busca notificações pendentes no servidor
async function fetchNotifications() {
    try {
        if (!state.token) return; // Não busca se não estiver logado

        // Busca as últimas 20 notificações para a lista de UI
        state.notifications = await apiFetch('/api/notifications');
        updateNotificationUI(); // Atualiza a interface visual do sino

        // Verifica se há notificações manuais (alertas prioritários enviados por admin) não lidas
        const unreadManual = state.notifications.filter(n => !n.is_read && n.type === 'manual');
        if (unreadManual.length > 0) {
            // Pega a mais recente
            const latest = unreadManual[0];
            // Só mostra o modal se ela ainda não tiver sido exibida nesta sessão do navegador
            if (!sessionShownModals.has(latest.id)) {
                sessionShownModals.add(latest.id);
                showNotificationModal(latest); // Abre um modal de destaque para o alerta
            }
        }
    } catch (err) {
        console.error('Error fetching notifications:', err);
    }
};

// Atualiza o contador (badge) e a lista visual do menu de notificações
const updateNotificationUI = () => {
    const list = document.getElementById('notification-list'); // Container da lista
    const badge = document.getElementById('notification-badge'); // Contador vermelho
    const unreadCount = state.notifications.filter(n => !n.is_read).length; // Conta não lidas

    // Atualiza o numerozinho vermelho sobre o sino
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    if (!list) return;

    // Caso a lista esteja vazia
    if (state.notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">Não há novas notificações</div>';
        return;
    }

    // Gera o HTML para cada item da lista de notificações
    list.innerHTML = state.notifications.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'} ${n.related_id ? 'clickable' : ''}" 
             ${n.related_id ? `data-related-id="${n.related_id}" data-related-type="${n.related_type}"` : ''}>
            <div class="notif-content-wrapper">
                <span class="notif-title">${escapeHTML(n.title)}</span>
                <span class="notif-msg">${escapeHTML(n.message)}</span>
                <span class="notif-time">${new Date(n.created_at).toLocaleString('pt-BR')}</span>
            </div>
        </div>
    `).join('');
};

// Trata o clique em uma notificação para levar o Admin direto ao registro relevante
const handleNotificationClick = async (id, type) => {
    if (state.role !== 'admin') return; // Apenas admins podem navegar via notificação

    // Fecha o menu de notificações automaticamente ao clicar
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
        dropdown.style.display = 'none';
    }

    try {
        // Se for notificação de mensalidade, abre o modal de mensalidade correspondente
        if (type === 'monthly') {
            const payment = await apiFetch(`/api/payments/detail/${id}`);
            if (!payment) return;
            const person = state.people.find(p => parseInt(p.id) === parseInt(payment.person_id));
            openPaymentModal(person, payment.month, payment);
        } else if (type === 'event') {
            // Se for de evento, abre o modal de pagamento de evento
            const payment = await apiFetch(`/api/event-payments/detail/${id}`);
            if (payment) openEventPaymentModalAdmin(payment);
        }
    } catch (err) {
        showStatus('Erro ao carregar detalhes: ' + err.message, 'error');
    }
};



}
