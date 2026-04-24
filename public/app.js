// State Management
const state = {
    token: localStorage.getItem('token') || null,
    people: [],
    payments: [],
    currentYear: new Date().getFullYear(),
    activeTab: localStorage.getItem('activeTab') || 'dashboard',
    role: localStorage.getItem('role') || null,
    username: localStorage.getItem('username') || null,
    name: localStorage.getItem('name') || null,
    personId: localStorage.getItem('personId') || null,
    notifications: [],
    events: [],
    eventPayments: [],
    currentEvent: null,
    eventDetailYear: new Date().getFullYear(),
    charts: {
        pie: null,
        bar: null
    },
    peopleSort: {
        column: 'name',
        direction: 'asc'
    }
};

// --- Utils ---
const formatCPF = (v) => {
    v = v.replace(/\D/g, ""); // Remove tudo o que não é dígito
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); 
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); 
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2"); 
    return v;
};

const isValidCPF = (cpf) => {
    if (!cpf) return true; // Optional field
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false;

    let sum = 0, rev;
    for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(10))) return false;

    return true;
};

const calculateAge = (birthDate) => {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    // dateString format is YYYY-MM-DD
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const showStatus = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-msg">${msg}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

const showConfirm = (message, title = 'Confirmar Ação') => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');

        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.style.display = 'flex';

        const handleResponse = (result) => {
            modal.style.display = 'none';
            yesBtn.onclick = null;
            noBtn.onclick = null;
            resolve(result);
        };

        yesBtn.onclick = () => handleResponse(true);
        noBtn.onclick = () => handleResponse(false);
    });
};

const showAlert = (message, title = 'Aviso', icon = '⚠️') => {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal');
        const titleEl = document.getElementById('alert-title');
        const messageEl = document.getElementById('alert-message');
        const iconEl = document.getElementById('alert-icon');
        const okBtn = document.getElementById('alert-ok');

        titleEl.textContent = title;
        messageEl.textContent = message;
        iconEl.textContent = icon;
        modal.style.display = 'flex';

        okBtn.onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
};

const initializePasswordToggles = () => {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            const targetId = button.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const openPath = button.querySelector('.eye-open');
            const closedPath = button.querySelector('.eye-closed');

            if (input.type === 'password') {
                input.type = 'text';
                openPath.style.display = 'none';
                closedPath.style.display = 'block';
            } else {
                input.type = 'password';
                openPath.style.display = 'block';
                closedPath.style.display = 'none';
            }
        };
    });
};

// Initialize toggles
initializePasswordToggles();

// --- DOM Elements ---
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const navLinks = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');
const paymentsBody = document.getElementById('payments-body');
const peopleBody = document.getElementById('people-body');
const yearSelect = document.getElementById('year-select');

// Modals
const paymentModal = document.getElementById('payment-modal');
const personModal = document.getElementById('person-modal');
const eventCreateModal = document.getElementById('event-create-modal');
const eventPaymentModal = document.getElementById('event-payment-modal');
const closeButtons = document.querySelectorAll('.close-modal');

// --- Auth Functions ---
const checkAuth = async () => {
    const token = state.token || localStorage.getItem('token');
    if (token) {
        state.token = token;
        state.role = state.role || localStorage.getItem('role');
        state.personId = state.personId || localStorage.getItem('personId');

        try {
            // Verify status with server to ensure security
            const status = await apiFetch('/api/auth/status');
            
            state.role = status.role;
            state.username = status.username;
            state.name = status.name;
            localStorage.setItem('role', status.role);
            localStorage.setItem('username', status.username);
            localStorage.setItem('name', status.name);
            
            document.getElementById('user-name-display').textContent = status.name || 'Usuário';
            
            if (status.mustChangePassword) {
                loginSection.style.display = 'none';
                mainSection.style.display = 'none';
                document.getElementById('force-change-modal').style.display = 'flex';
                return;
            }

            loginSection.style.display = 'none';
            mainSection.style.display = 'flex';
            
            const membersNav = document.querySelector('[data-target="people"]');
            const dashboardStats = document.querySelector('.stats-grid');
            const chartsGrid = document.querySelector('.charts-grid');
            const isAdmin = state.role === 'admin';

            if (!isAdmin) {
                if (membersNav) membersNav.style.display = 'none';
                if (dashboardStats) dashboardStats.style.display = 'grid';
                if (chartsGrid) chartsGrid.style.display = 'grid';
                
                const cards = document.querySelectorAll('.stat-card');
                if (cards[1]) cards[1].style.display = 'none';
                if (cards[2]) cards[2].style.display = 'none';
                
                const statLabels = document.querySelectorAll('.stat-label');
                if (statLabels[0]) statLabels[0].textContent = 'Total Pago (Ano)';
                
                const chartTitles = document.querySelectorAll('.chart-container h4');
                if (chartTitles[0]) chartTitles[0].textContent = 'Status de Pagamento';

                document.getElementById('page-title').textContent = 'Meu Status de Mensalidade';
                document.getElementById('user-role-badge').textContent = 'Membro';
            } else {
                if (membersNav) membersNav.style.display = 'block';
                if (dashboardStats) dashboardStats.style.display = 'grid';
                if (chartsGrid) chartsGrid.style.display = 'grid';
                
                const cards = document.querySelectorAll('.stat-card');
                if (cards[1]) cards[1].style.display = 'block';
                if (cards[2]) cards[2].style.display = 'block';
                
                const chartTitles = document.querySelectorAll('.chart-container h4');
                if (chartTitles[0]) chartTitles[0].textContent = 'Distribuição por Unidade';

                document.getElementById('user-role-badge').textContent = 'Administrador';
            }

            initializeSidebar();
            initializeNotifications();

            // Restore active tab
            if (state.role !== 'admin' && (state.activeTab === 'people' || state.activeTab === 'reports')) {
                state.activeTab = 'dashboard';
            }
            switchTab(state.activeTab);

            setTimeout(() => loadInitialData(), 50); 
        } catch (err) {
            console.error('Auth verification failed:', err);
        }
    } else {
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
    }
};

// Start initialization
if (localStorage.getItem('token')) {
    checkAuth();
} else {
    loginSection.style.display = 'flex';
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        // Reset state before login to avoid data leakage
        state.people = [];
        state.payments = [];
        state.role = null;
        state.personId = null;

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, force: e.detail && e.detail.force })
        });
        const data = await res.json();

        if (res.status === 409) {
            document.getElementById('session-modal').style.display = 'flex';
            return;
        }

        if (res.ok) {
            const isForced = data.mustChangePassword;
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', data.username);
            localStorage.setItem('name', data.name || data.username);
            localStorage.setItem('personId', data.personId || '');
            state.token = data.token;
            state.role = data.role;
            state.username = data.username;
            state.name = data.name || data.username;
            state.personId = data.personId;
            
            document.getElementById('user-name-display').textContent = state.name;

            if (isForced) {
                document.getElementById('force-change-modal').style.display = 'flex';
            } else {
                checkAuth();
            }
        } else {
            loginError.textContent = data.error;
        }
    } catch (err) {
        loginError.textContent = 'Erro ao conectar ao servidor';
    }
});

const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('name');
    localStorage.removeItem('personId');
    window.location.reload();
};

if (logoutBtn) logoutBtn.onclick = logout;
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
if (mobileLogoutBtn) mobileLogoutBtn.onclick = logout;

const confirmForceLoginBtn = document.getElementById('confirm-force-login');
if (confirmForceLoginBtn) {
    confirmForceLoginBtn.onclick = () => {
        // Trigger the submit event again but with a custom detail
        loginForm.dispatchEvent(new CustomEvent('submit', { 
            detail: { force: true },
            cancelable: true 
        }));
        document.getElementById('session-modal').style.display = 'none';
    };
}

// --- Navigation ---
const switchTab = (target) => {
    state.activeTab = target;
    localStorage.setItem('activeTab', target);
    
    navLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.target === target);
    });

    tabContents.forEach(tab => {
        tab.style.display = tab.id === `${target}-page` ? 'block' : 'none';
    });

    const peopleActions = document.getElementById('people-actions');
    if (peopleActions) {
        peopleActions.style.display = target === 'people' ? 'flex' : 'none';
    }

    const eventsActions = document.getElementById('events-actions');
    if (eventsActions && state.role === 'admin') {
        eventsActions.style.display = target === 'events' ? 'flex' : 'none';
    }

    const title = document.getElementById('page-title');
    if (target === 'dashboard') title.textContent = state.role === 'admin' ? 'Dashboard de Mensalidades' : 'Meu Status de Mensalidade';
    else if (target === 'people') title.textContent = 'Gerenciamento de Membros';
    else if (target === 'events') title.textContent = 'Gestão de Eventos';
    else if (target === 'reports') title.textContent = 'Relatórios do Sistema';
    else if (target === 'mensalidade') title.textContent = 'Controle de Mensalidades';

    // Refresh specific data if needed
    if (target === 'dashboard') renderDashboard();
    if (target === 'people') renderPeople();
    if (target === 'events') fetchEventsData();
    if (target === 'reports') {
        populateReportSelects();
    }
    
    // Close mobile sidebar if open
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
};

navLinks.forEach(link => {
    link.addEventListener('click', () => switchTab(link.dataset.target));
});

const populateReportSelects = () => {
    const memberSelect = document.getElementById('report-member-select');
    const eventSelect = document.getElementById('report-event-select');
    
    if (memberSelect) {
        memberSelect.innerHTML = '<option value="">Selecione um Membro</option>' + 
            state.people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
        
    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">Selecione um Evento</option>' + 
            state.events.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }
};

document.getElementById('back-to-events').onclick = () => {
    document.getElementById('events-master-view').style.display = 'block';
    document.getElementById('events-detail-view').style.display = 'none';
    
    // Toggle button visibility
    const isAdmin = state.role === 'admin';
    if (isAdmin) {
        document.getElementById('add-event-btn').style.display = 'block';
        document.getElementById('add-participants-btn').style.display = 'none';
    }
};

// --- Data Fetching ---
const apiFetch = async (url, options = {}) => {
    const headers = {
        'Authorization': `Bearer ${state.token}`,
        ...options.headers
    };

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        ...options,
        headers
    });
    
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            await showAlert('Sessão Encerrada: Sua conta foi acessada em outro dispositivo ou a sessão expirou.', 'Sessão Encerrada', '🚫');
            logout();
            throw new Error('Sessão expirada');
        }
        if (res.status === 403 && data.mustChangePassword) {
            // Trigger forced modal if API blocks us
            document.getElementById('force-change-modal').style.display = 'flex';
            mainSection.style.display = 'none';
            throw new Error('Alteração de senha obrigatória');
        }
        throw new Error(data.error || 'Erro na requisição');
    }
    return data;
};

// --- Notifications Logic ---
const initializeNotifications = () => {
    const trigger = document.getElementById('notification-trigger');
    const dropdown = document.getElementById('notification-dropdown');
    const markReadBtn = document.getElementById('mark-all-read');

    if (trigger) {
        trigger.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        };
    }

    if (markReadBtn) {
        markReadBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
                fetchNotifications();
            } catch (err) {
                console.error('Error marking all as read:', err);
            }
        };
    }

    document.addEventListener('click', () => {
        if (dropdown) dropdown.style.display = 'none';
    });

    const list = document.getElementById('notification-list');
    if (list) {
        list.onclick = (e) => {
            const item = e.target.closest('.notification-item.clickable');
            if (item) {
                e.stopPropagation();
                const id = item.dataset.relatedId;
                const type = item.dataset.relatedType;
                if (id && type) handleNotificationClick(id, type);
            }
        };
    }

    // Start polling
    fetchNotifications();
    setInterval(fetchNotifications, 30000); // 30s
}

const fetchNotifications = async () => {
    try {
        if (!state.token) return;
        state.notifications = await apiFetch('/api/notifications');
        updateNotificationUI();
    } catch (err) {
        console.error('Error fetching notifications:', err);
    }
};

const updateNotificationUI = () => {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    const unreadCount = state.notifications.filter(n => !n.is_read).length;

    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    if (!list) return;

    if (state.notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">Não há novas notificações</div>';
        return;
    }

    list.innerHTML = state.notifications.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'} ${n.related_id ? 'clickable' : ''}" 
             ${n.related_id ? `data-related-id="${n.related_id}" data-related-type="${n.related_type}"` : ''}>
            <h5>${n.title}</h5>
            <p>${n.message}</p>
            <span class="time">${new Date(n.created_at).toLocaleString('pt-BR')}</span>
        </div>
    `).join('');
};

const handleNotificationClick = async (id, type) => {
    if (state.role !== 'admin') return;
    
    // Auto-close dropdown
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    try {
        if (type === 'monthly') {
            const payment = await apiFetch(`/api/payments/detail/${id}`);
            if (!payment) return;
            const person = state.people.find(p => parseInt(p.id) === parseInt(payment.person_id));
            openPaymentModal(person, payment.month, payment);
        } else if (type === 'event') {
            const payment = await apiFetch(`/api/event-payments/detail/${id}`);
            if (payment) openEventPaymentModalAdmin(payment);
        }
    } catch (err) {
        showStatus('Erro ao carregar detalhes: ' + err.message, 'error');
    }
};

const loadInitialData = async () => {
    try {
        state.people = await apiFetch('/api/people');
        
        // Priority: Update user name for non-admin accounts immediately
        if (state.role !== 'admin' && state.people.length > 0) {
            const person = state.people[0];
            if (person) {
                document.getElementById('user-name-display').textContent = person.name;
            }
        }

        state.payments = await apiFetch(`/api/payments?year=${state.currentYear}`);
        renderDashboard();
        
        if (state.role === 'admin') {
            renderPeople();
            
            // Check for pending approvals
            const pendingPayments = state.payments.filter(p => p.status === 'pending');
            console.log('Pending payments found:', pendingPayments.length);
            
            if (pendingPayments.length > 0) {
                // Use a slightly longer delay to ensure the dashboard is rendered and seen
                setTimeout(() => {
                    if (state.role === 'admin') { // Double check
                        showStatus(`⚠️ ATENÇÃO: Existem ${pendingPayments.length} comprovante(s) aguardando aprovação.`, 'info');
                    }
                }, 1500);
            }
        }
        
        updateDashboardStats();
        if (state.activeTab === 'events') fetchEventsData();
    } catch (err) {
        console.error('Error loading data:', err);
    }
};

// --- Events Logic ---
const fetchEventsData = async () => {
    try {
        state.events = await apiFetch('/api/events');
        renderEvents();
    } catch (err) {
        console.error('Error fetching events:', err);
    }
};

const renderEvents = () => {
    const list = document.getElementById('events-list');
    list.innerHTML = state.events.map(event => {
        return `
            <div class="glass-card event-card animate-fade-in" style="padding: 1.5rem; margin-bottom: 1rem; cursor: pointer;" onclick="openEventDetail(${event.id})">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4 style="margin: 0; color: var(--accent-color);">${event.name}</h4>
                    ${state.role === 'admin' ? `<button class="btn-text" onclick="event.stopPropagation(); deleteEvent(${event.id})" style="padding: 0; min-height: auto; display: flex; align-items: center; justify-content: center; color: var(--text-dim); transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor">
                            <path d="M262.2 48C248.9 48 236.9 56.3 232.2 68.8L216 112L120 112C106.7 112 96 122.7 96 136C96 149.3 106.7 160 120 160L520 160C533.3 160 544 149.3 544 136C544 122.7 533.3 112 520 112L424 112L407.8 68.8C403.1 56.3 391.2 48 377.8 48L262.2 48zM128 208L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 208L464 208L464 512C464 520.8 456.8 528 448 528L192 528C183.2 528 176 520.8 176 512L176 208L128 208zM288 280C288 266.7 277.3 256 264 256C250.7 256 240 266.7 240 280L240 456C240 469.3 250.7 480 264 480C277.3 480 288 469.3 288 456L288 280zM400 280C400 266.7 389.3 256 376 256C362.7 256 352 266.7 352 280L352 456C352 469.3 362.7 480 376 480C389.3 480 400 469.3 400 456L400 280z"/>
                        </svg>
                    </button>` : ''}
                </div>
                <p class="event-date" style="font-size: 0.8rem; color: var(--text-dim); margin-top: 5px;">${event.date ? formatDate(event.date) : 'Sem data'}</p>
                <p class="event-desc" style="font-size: 0.9rem; margin-top: 10px;">${event.description || 'Sem descrição'}</p>
                <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--accent-color); font-weight: 500;">
                    Clique para ver detalhamento →
                </div>
            </div>
        `;
    }).join('');

    if (state.events.length === 0) {
        list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 3rem;">Nenhum evento cadastrado no momento.</p>';
    }
};

const openEventDetail = async (eventId) => {
    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        state.currentEvent = data.event;
        state.currentEventParticipants = data.participants;
        
        document.getElementById('events-master-view').style.display = 'none';
        document.getElementById('events-detail-view').style.display = 'block';
        document.getElementById('detail-event-title').textContent = data.event.name;
        
        // Toggle button visibility
        if (state.role === 'admin') {
            document.getElementById('add-event-btn').style.display = 'none';
            document.getElementById('add-participants-btn').style.display = 'block';
        }
        
        renderEventDetailGrid(data.participants, data.payments);
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

const renderEventDetailGrid = (participants, payments) => {
    const body = document.getElementById('event-detail-body');
    body.innerHTML = participants.map(p => {
        let rows = `<td><strong>${p.name}</strong> <br> <small>${p.unit || '-'}</small></td>`;
        let yearlyTotal = 0;

        for (let m = 1; m <= 12; m++) {
            const payment = payments.find(pay => pay.person_id === p.id && pay.month === m && pay.year === state.eventDetailYear);
            
            if (payment) {
                const statusClass = `status-${payment.status}`;
                const isApproved = payment.status === 'approved';
                const statusLabel = payment.status === 'approved' ? 'PAGO' : payment.status === 'pending' ? 'PENDENTE' : 'RECUSADO';
                if (isApproved) yearlyTotal += parseFloat(payment.amount);
                
                rows += `
                    <td class="clickable-cell" onclick="openEventPaymentModalFromGrid(${p.id}, ${m}, ${JSON.stringify(payment).replace(/"/g, '&quot;')})">
                        <span class="grid-status-label status-${payment.status}">${statusLabel}</span>
                    </td>
                `;
            } else {
                rows += `
                    <td class="clickable-cell" onclick="openEventPaymentModalFromGrid(${p.id}, ${m})">
                        <span class="grid-status-label status-none">PENDENTE</span>
                    </td>
                `;
            }
        }
        
        rows += `<td class="total-column">R$ ${yearlyTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
        return `<tr>${rows}</tr>`;
    }).join('');

    if (participants.length === 0) {
        body.innerHTML = '<tr><td colspan="14" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum participante vinculado a este evento.</td></tr>';
    }
};

const openEventPaymentModalFromGrid = (personId, month, payment = null) => {
    // Only allow members to pay for themselves, or admins to pay for anyone
    if (state.role !== 'admin' && parseInt(personId) !== parseInt(state.personId)) return;

    document.getElementById('ep-event-id').value = state.currentEvent.id;
    document.getElementById('ep-event-name').textContent = state.currentEvent.name;
    document.getElementById('ep-month').value = month;
    document.getElementById('ep-year').value = state.eventDetailYear;
    
    // Hidden fields or state to track person_id for admin
    state.tempPaymentPersonId = personId;

    openEventPaymentModal(state.currentEvent.id, state.currentEvent.name, payment);
};

const renderEventParticipantsChecklist = () => {
    const list = document.getElementById('event-participants-list');
    const unitFilter = document.getElementById('ev-unit-filter');
    
    const units = [...new Set(state.people.map(p => p.unit).filter(u => u))].sort();
    unitFilter.innerHTML = `
        <option value="">Selecionar</option>
        <option value="ALL">Todos os Membros</option>
        ${units.map(u => `<option value="${u}">Unidade: ${u}</option>`).join('')}
    `;

    list.innerHTML = state.people.map(p => `
        <div class="checklist-item" data-name="${p.name.toLowerCase()}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.9rem;">
            <input type="checkbox" class="participant-check" data-id="${p.id}" data-unit="${p.unit || ''}">
            <label>${p.name} <small style="color: var(--text-dim)">(${p.unit || 'Sem Unidade'})</small></label>
        </div>
    `).join('');
};

const openAddParticipantsModal = () => {
    const list = document.getElementById('add-participants-list');
    const existingIds = state.currentEventParticipants.map(p => p.id);
    const available = state.people.filter(p => !existingIds.includes(p.id));
    
    list.innerHTML = available.map(p => `
        <div class="checklist-item" data-name="${p.name.toLowerCase()}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border-color);">
            <input type="checkbox" class="new-participant-check" data-id="${p.id}" id="check-${p.id}" style="width: 18px; height: 18px;">
            <label for="check-${p.id}" style="cursor: pointer; flex: 1;">
                ${p.name} <br>
                <small style="color: var(--text-dim); font-size: 0.8rem;">${p.unit || 'Sem Unidade'}</small>
            </label>
        </div>
    `).join('');
    
    if (available.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-dim); padding: 2rem;">Todos os membros já estão participando deste evento.</p>';
    }
    
    document.getElementById('event-participants-modal').style.display = 'flex';
};

const saveNewParticipants = async () => {
    const checks = document.querySelectorAll('.new-participant-check:checked');
    const ids = Array.from(checks).map(c => parseInt(c.dataset.id));
    
    if (ids.length === 0) {
        showStatus('Selecione pelo menos um membro.', 'info');
        return;
    }
    
    try {
        await apiFetch(`/api/events/${state.currentEvent.id}/participants`, {
            method: 'POST',
            body: JSON.stringify({ participant_ids: ids })
        });
        
        showStatus('Membros adicionados com sucesso!', 'success');
        document.getElementById('event-participants-modal').style.display = 'none';
        openEventDetail(state.currentEvent.id);
    } catch (err) {
        showStatus('Erro ao adicionar membros: ' + err.message, 'error');
    }
};

document.getElementById('ev-clear-all').onclick = () => {
    document.querySelectorAll('.participant-check').forEach(c => c.checked = false);
};

document.getElementById('ev-member-search').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.checklist-item');
    items.forEach(item => {
        const name = item.getAttribute('data-name');
        item.style.display = name.includes(term) ? 'flex' : 'none';
    });
};

document.getElementById('ev-unit-filter').onchange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const checks = document.querySelectorAll('.participant-check');
    
    if (val === "ALL") {
        checks.forEach(c => c.checked = true);
    } else {
        checks.forEach(c => {
            if (c.getAttribute('data-unit') === val) c.checked = true;
        });
    }
    e.target.value = ""; // Reset filter
};

const openEventPaymentModal = (eventId, eventName, payment = null) => {
    document.getElementById('ep-event-id').value = eventId;
    document.getElementById('ep-event-name').textContent = eventName;
    document.getElementById('ep-modal-title').textContent = payment ? 'Visualizar Pagamento' : 'Enviar Comprovante';
    
    const saveBtn = document.getElementById('ep-save-btn');
    const deleteBtn = document.getElementById('ep-delete-btn');
    const adminActions = document.getElementById('ep-admin-actions');
    const rejectionContainer = document.getElementById('ep-rejection-container');
    const receiptContainer = document.getElementById('ep-view-receipt-container');
    const rejectionForm = document.getElementById('ep-rejection-form');

    // Reset
    saveBtn.style.display = 'block';
    saveBtn.textContent = 'Enviar Pagamento';
    deleteBtn.style.display = 'none';
    adminActions.style.display = 'none';
    rejectionContainer.style.display = 'none';
    receiptContainer.style.display = 'none';
    rejectionForm.style.display = 'none';
    document.getElementById('ep-amount').value = payment ? payment.amount : '0.00';
    document.getElementById('ep-receipt').value = '';

    if (payment) {
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => deleteEventPayment(payment.id);

        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            const filename = payment.receipt_path.split(/[\\/]/).pop();
            document.getElementById('ep-view-receipt-btn').href = `/api/files/receipt/${filename}?token=${localStorage.getItem('token')}`;
        }

        if (payment.status === 'approved') {
            saveBtn.textContent = 'Atualizar Valor';
            document.getElementById('ep-modal-title').textContent = 'Editar Pagamento';
        } else if (payment.status === 'rejected') {
            rejectionContainer.style.display = 'block';
            document.getElementById('ep-rejection-text').textContent = payment.rejection_reason || 'Sem motivo detalhado.';
            saveBtn.textContent = 'Enviar Novamente';
        } else if (payment.status === 'pending') {
            saveBtn.textContent = 'Atualizar Comprovante';
            
            // Administrador actions for pending payments
            if (state.role === 'admin') {
                saveBtn.style.display = 'none';
                adminActions.style.display = 'flex';
                
                document.getElementById('ep-approve-btn').onclick = () => approveEventPayment(payment.id);
                document.getElementById('ep-reject-trigger-btn').onclick = () => {
                    adminActions.style.display = 'none';
                    rejectionForm.style.display = 'block';
                };
                document.getElementById('ep-confirm-reject-btn').onclick = () => {
                    const reason = document.getElementById('ep-reject-reason').value;
                    rejectEventPayment(payment.id, reason);
                };
            }
        }
    }

    eventPaymentModal.style.display = 'flex';
};

const deleteEventPayment = async (id) => {
    if (await showConfirm('Tem certeza que deseja remover este registro de pagamento?')) {
        try {
            await apiFetch(`/api/event-payments/${id}`, { method: 'DELETE' });
            eventPaymentModal.style.display = 'none';
            showStatus('Pagamento removido com sucesso!');
            
            // Refresh current grid view
            const activeEventId = document.getElementById('ep-event-id').value;
            if (activeEventId) openEventDetail(parseInt(activeEventId));
        } catch (err) {
            showStatus('Erro ao remover pagamento', 'error');
        }
    }
};

const openEventPaymentModalAdmin = (payment) => {
    const event = state.events.find(e => e.id === payment.event_id);
    openEventPaymentModal(payment.event_id, event ? event.name : 'Desconhecido', payment);
};

const approveEventPayment = async (id) => {
    try {
        await apiFetch(`/api/event-payments/${id}/approve`, { method: 'POST' });
        eventPaymentModal.style.display = 'none';
        fetchEventsData();
    } catch (err) { showStatus(err.message, 'error'); }
};

const rejectEventPayment = async (id, reason) => {
    try {
        await apiFetch(`/api/event-payments/${id}/reject`, { 
            method: 'POST',
            body: JSON.stringify({ reason })
        });
        eventPaymentModal.style.display = 'none';
        fetchEventsData();
    } catch (err) { showStatus(err.message, 'error'); }
};

const deleteEvent = async (id) => {
    if (await showConfirm('Tem certeza que deseja excluir este evento? Todos os pagamentos vinculados serão perdidos.')) {
        try {
            await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
            fetchEventsData();
        } catch (err) { showStatus(err.message, 'error'); }
    }
};


const updateDashboardStats = () => {
    let totalCash = 0;
    let direcaoTotal = 0;
    let desbravadoresTotal = 0;
    let outrosTotal = 0;
    
    const monthlyData = new Array(12).fill(0);
    
    state.payments.forEach(p => {
        if (p.status !== 'approved') return; // Only count approved payments
        
        const amount = parseFloat(p.amount);
        totalCash += amount;
        monthlyData[p.month - 1] += amount;
        
        const person = state.people.find(pers => pers.id === p.person_id);
        const unit = (person?.unit || '').toUpperCase();
        
        if (unit.includes('DIREÇÃO') || unit.includes('DIRECAO')) {
            direcaoTotal += amount;
        } else if (unit.includes('DESBRAVADOR')) {
            desbravadoresTotal += amount;
        } else {
            outrosTotal += amount;
        }
    });

    if (state.role === 'admin') {
        document.getElementById('stat-total-cash').textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        const direcaoStat = document.getElementById('stat-direcao');
        const desbravaStat = document.getElementById('stat-desbravadores');
        if (direcaoStat) direcaoStat.textContent = `R$ ${direcaoTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (desbravaStat) desbravaStat.textContent = `R$ ${desbravadoresTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        renderPieChart(['Direção', 'Desbravadores', 'Outros'], [direcaoTotal, desbravadoresTotal, outrosTotal]);
    } else {
        // Member view: Personal Stats
        const paidMonths = state.payments.length;
        const pendingMonths = 12 - paidMonths;
        
        console.log('Member Statistics:', { paidMonths, pendingMonths });

        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        renderPieChart(['Meses Pagos', 'Pendentes'], [paidMonths, pendingMonths], ['#e50914', '#e8e6df']);
    }
    
    renderBarChart(monthlyData);
};

const renderPieChart = (labels, data, colors = ['#e50914', '#1a1a1a', '#e8e6df']) => {
    const ctx = document.getElementById('pieChart').getContext('2d');
    
    if (state.charts.pie) state.charts.pie.destroy();
    
    state.charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%', 
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: '#707070' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw || 0;
                            return context.label + ': ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                        }
                    }
                }
            }
        }
    });
};

const renderBarChart = (monthlyData) => {
    const ctx = document.getElementById('barChart').getContext('2d');
    
    if (state.charts.bar) state.charts.bar.destroy();
    
    state.charts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Receita (R$)',
                data: monthlyData,
                backgroundColor: '#e50914',
                borderRadius: 5,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw || 0;
                            return 'Receita: ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#707070' },
                    grid: { display: false }
                },
                y: { 
                    beginAtZero: true,
                    suggestedMax: 100,
                    ticks: {
                        color: '#707070',
                        callback: function(value) {
                            return 'R$ ' + value;
                        }
                    },
                    grid: { color: '#e8e6df' }
                }
            },
            categoryPercentage: 0.8,
            barPercentage: 0.9
        }
    });
};

// --- Rendering ---
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const renderDashboard = () => {
    paymentsBody.innerHTML = '';
    const footer = document.getElementById('payments-footer');
    footer.innerHTML = '';
    
    const monthlyTotals = new Array(12).fill(0);
    let grandTotal = 0;

    state.people.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${person.name}</strong></td>`;
        
        let personTotal = 0;

        for (let m = 1; m <= 12; m++) {
            const payment = state.payments.find(p => p.person_id === person.id && p.month === m);
            const td = document.createElement('td');
            td.className = 'clickable-cell';
            
            const label = document.createElement('span');
            label.className = 'grid-status-label';
            
            if (payment) {
                label.classList.add(`status-${payment.status}`);
                label.textContent = payment.status === 'approved' ? 'PAGO' : 
                                   payment.status === 'pending' ? 'PENDENTE' : 'RECUSADO';
                
                if (payment.status === 'approved') {
                    const amount = parseFloat(payment.amount || 0);
                    personTotal += amount;
                    monthlyTotals[m-1] += amount;
                    grandTotal += amount;
                }
            } else {
                label.classList.add('status-none');
                label.textContent = 'PENDENTE';
            }
            
            td.onclick = () => {
                const canEdit = state.role === 'admin' || (state.personId && person.id == state.personId);
                if (canEdit) {
                    openPaymentModal(person, m, payment);
                }
            };
            
            td.appendChild(label);
            tr.appendChild(td);
        }

        // Add Row Total
        const totalTd = document.createElement('td');
        totalTd.className = 'total-column';
        totalTd.textContent = `R$ ${personTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        tr.appendChild(totalTd);

        paymentsBody.appendChild(tr);
    });

    // Populate Footer
    const footerTr = document.createElement('tr');
    footerTr.innerHTML = '<td><strong>TOTAL MENSAL</strong></td>';
    
    monthlyTotals.forEach(total => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        td.innerHTML = `<strong>R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>`;
        footerTr.appendChild(td);
    });

    const grandTotalTd = document.createElement('td');
    grandTotalTd.className = 'total-column';
    grandTotalTd.innerHTML = `<strong>R$ ${grandTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>`;
    footerTr.appendChild(grandTotalTd);
    
    footer.appendChild(footerTr);
};

const setSort = (column) => {
    if (state.peopleSort.column === column) {
        state.peopleSort.direction = state.peopleSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.peopleSort.column = column;
        state.peopleSort.direction = 'asc';
    }
    renderPeople();
};

const renderPeople = () => {
    peopleBody.innerHTML = '';
    
    // Global filter logic
    const searchQuery = document.getElementById('global-search')?.value.toLowerCase() || '';

    let processedPeople = state.people.filter(p => {
        const text = `${p.name} ${p.username || ''} ${p.unit || ''} ${p.responsible || ''} ${p.cpf || ''}`.toLowerCase();
        return text.includes(searchQuery);
    });

    // Sort logic with accent support (localeCompare)
    processedPeople.sort((a, b) => {
        const col = state.peopleSort.column;
        const dir = state.peopleSort.direction === 'asc' ? 1 : -1;
        
        let valA = (a[col] || '').toString();
        let valB = (b[col] || '').toString();
        
        return valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' }) * dir;
    });

    // Update sort icons in UI
    document.querySelectorAll('.sortable').forEach(th => {
        const colName = th.getAttribute('onclick').match(/'([^']+)'/)[1];
        const icon = th.querySelector('.sort-icon');
        if (colName === state.peopleSort.column) {
            icon.textContent = state.peopleSort.direction === 'asc' ? ' ↑' : ' ↓';
            th.classList.add('active-sort');
        } else {
            icon.textContent = '';
            th.classList.remove('active-sort');
        }
    });

    processedPeople.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${person.name.toUpperCase()}</strong></td>
            <td><span class="badge-user">${person.username || '-'}</span></td>
            <td><span class="unit-tag">${person.unit || 'S/U'}</span></td>
            <td>${person.responsible || '-'}</td>
            <td></td> <!-- CPF column cleared as requested -->
            <td>
                <button class="btn-text" onclick="editPerson(${person.id})">
                    Editar
                </button>
            </td>
        `;
        peopleBody.appendChild(tr);
    });
};

// Add listener to global search
document.addEventListener('input', (e) => {
    if (e.target.id === 'global-search') {
        renderPeople();
    }
});

// --- Modals Logic ---
const openPaymentModal = (person, month, payment = null) => {
    document.getElementById('p-person-id').value = person.id;
    document.getElementById('p-month').value = month;
    document.getElementById('p-member-name').textContent = person.name;
    document.getElementById('p-month-name').textContent = months[month - 1];
    document.getElementById('payment-error').textContent = '';
    
    const amountInput = document.getElementById('amount');
    const deleteBtn = document.getElementById('delete-payment-btn');
    const receiptContainer = document.getElementById('view-receipt-container');
    const title = document.getElementById('payment-modal-title');
    const saveBtn = document.getElementById('save-payment-btn');
    const adminActions = document.getElementById('admin-payment-actions');
    const rejectionReasonContainer = document.getElementById('rejection-reason-container');
    const rejectionReasonText = document.getElementById('rejection-reason-text');
    const rejectionForm = document.getElementById('rejection-form');

    // Reset UI
    receiptContainer.style.display = 'none';
    saveBtn.style.display = 'block';
    deleteBtn.style.display = 'none';
    adminActions.style.display = 'none';
    rejectionReasonContainer.style.display = 'none';
    rejectionForm.style.display = 'none';
    document.getElementById('receipt').parentElement.style.display = 'block';

    if (payment) {
        title.textContent = 'Gerenciar Pagamento';
        amountInput.value = payment.amount;
        
        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            // Handle both Windows (\) and Linux (/) separators
            const filename = payment.receipt_path.split(/[\\/]/).pop();
            const securePath = `/api/files/receipt/${filename}?token=${localStorage.getItem('token')}`;
            document.getElementById('view-receipt-btn').href = securePath;
        }

        if (state.role === 'admin') {
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = () => deletePayment(payment.id);
            if (payment.status === 'pending') {
                saveBtn.style.display = 'none';
                adminActions.style.display = 'flex';
            }
        } else {
            // Member view logic
            if (payment.status === 'approved') {
                saveBtn.style.display = 'none';
                title.textContent = 'Pagamento Confirmado';
            } else if (payment.status === 'rejected') {
                rejectionReasonContainer.style.display = 'block';
                rejectionReasonText.textContent = payment.rejection_reason || 'Nenhuma justificativa fornecida.';
                saveBtn.textContent = 'Tentar Novamente (Corrigir)';
            } else if (payment.status === 'pending') {
                saveBtn.textContent = 'Atualizar Comprovante';
                title.textContent = 'Aguardando Aprovação';
            }
        }
    } else {
        title.textContent = 'Registrar Pagamento';
        amountInput.value = '20.00';
        saveBtn.textContent = 'Salvar Pagamento';
        document.getElementById('receipt').value = '';
    }

    // Handlers for Admin
    document.getElementById('approve-payment-btn').onclick = () => approvePayment(payment.id);
    document.getElementById('reject-trigger-btn').onclick = () => {
        adminActions.style.display = 'none';
        rejectionForm.style.display = 'block';
    };
    document.getElementById('confirm-reject-btn').onclick = () => {
        const reason = document.getElementById('reject-reason').value;
        rejectPayment(payment.id, reason);
    };
    document.getElementById('cancel-reject-btn').onclick = () => {
        rejectionForm.style.display = 'none';
        adminActions.style.display = 'flex';
    };

    paymentModal.style.display = 'flex';
};

const approvePayment = async (id) => {
    try {
        await apiFetch(`/api/payments/${id}/approve`, { method: 'POST' });
        paymentModal.style.display = 'none';
        await loadInitialData();
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

const rejectPayment = async (id, reason) => {
    try {
        await apiFetch(`/api/payments/${id}/reject`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        paymentModal.style.display = 'none';
        await loadInitialData();
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

const deletePayment = async (id) => {
    if (await showConfirm('Tem certeza que deseja excluir este registro de pagamento?')) {
        try {
            await apiFetch(`/api/payments/${id}`, { method: 'DELETE' });
            paymentModal.style.display = 'none';
            await loadInitialData();
        } catch (err) {
            showStatus('Erro ao excluir pagamento', 'error');
        }
    }
};

document.getElementById('add-person-btn').onclick = () => {
    document.getElementById('person-modal-title').textContent = 'Novo Membro';
    document.getElementById('p-id').value = '';
    document.getElementById('person-form').reset();
    document.getElementById('delete-member-btn').style.display = 'none';
    
    // Credentials handling
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (credentialsSection) {
        credentialsSection.style.display = state.role === 'admin' ? 'block' : 'none';
        document.getElementById('u-username').value = '';
        document.getElementById('u-password').value = '';
    }
    
    personModal.style.display = 'flex';
};

const editPerson = (id) => {
    const person = state.people.find(p => p.id === id);
    if (!person) return;

    document.getElementById('person-modal-title').textContent = 'Editar Membro';
    document.getElementById('p-id').value = person.id;
    document.getElementById('p-name').value = person.name;
    document.getElementById('p-responsible').value = person.responsible || '';
    document.getElementById('p-unit').value = person.unit || '';
    document.getElementById('p-birth').value = person.birth_date || '';
    document.getElementById('p-unit').value = person.unit || '';
    document.getElementById('p-cpf').value = formatCPF(person.cpf || '');
    
    // Credentials handling
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (credentialsSection) {
        credentialsSection.style.display = state.role === 'admin' ? 'block' : 'none';
        document.getElementById('u-username').value = person.username || '';
        document.getElementById('u-password').value = ''; // Don't show hashed password
    }
    
    // Auto-fill age
    const age = calculateAge(person.birth_date);
    document.getElementById('p-age').value = age;
    
    // Only master admin can delete members
    const deleteBtn = document.getElementById('delete-member-btn');
    if (deleteBtn) {
        // Only the master 'admin' can see the delete button
        deleteBtn.style.display = state.username === 'admin' ? 'block' : 'none';
    }
    
    personModal.style.display = 'flex';
};
window.editPerson = editPerson;

// --- Back to Top Logic ---
const backToTopBtn = document.getElementById('back-to-top');
const scrollContainer = document.querySelector('.content');

if (scrollContainer) {
    scrollContainer.onscroll = () => {
        if (scrollContainer.scrollTop > 300) {
            backToTopBtn.style.display = "block";
        } else {
            backToTopBtn.style.display = "none";
        }
    };
}

backToTopBtn.onclick = () => {
    if (scrollContainer) {
        scrollContainer.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
};

// --- Password Security Logic ---

const complexityRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{5,}$/;

// Recovery Modal
const recoverModal = document.getElementById('recover-modal');
const recoverForm = document.getElementById('recover-form');
const forgotLink = document.getElementById('forgot-password-link');

if (forgotLink) {
    forgotLink.onclick = (e) => {
        e.preventDefault();
        const recoverModal = document.getElementById('recover-modal');
        if (recoverModal) recoverModal.style.display = 'flex';
    };
}

const closeRecover = document.getElementById('close-recover-modal');
if (closeRecover) {
    closeRecover.onclick = () => recoverModal.style.display = 'none';
}

if (recoverForm) {
    recoverForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('recover-username').value;
        const cpf = document.getElementById('recover-cpf').value;
        const newPassword = document.getElementById('recover-new-password').value;
        const errorDiv = document.getElementById('recover-error');

        if (!complexityRegex.test(newPassword)) {
            errorDiv.textContent = 'A senha deve ter no mínimo 5 caracteres, 1 número e 1 caractere especial.';
            return;
        }

        try {
            await apiFetch('/api/auth/reset-lost-password', {
                method: 'POST',
                body: JSON.stringify({ username, cpf, newPassword })
            });
            showStatus('Senha redefinida com sucesso! Agora você pode fazer login.', 'success');
            recoverModal.style.display = 'none';
            recoverForm.reset();
        } catch (err) {
            errorDiv.textContent = err.message || 'Erro ao redefinir senha';
        }
    };
}

// Forced Change Modal
const forceChangeForm = document.getElementById('force-change-form');
if (forceChangeForm) {
    forceChangeForm.onsubmit = async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('force-new-password').value;
        const confirmPassword = document.getElementById('force-confirm-password').value;
        const errorDiv = document.getElementById('force-change-error');

        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'As senhas não coincidem';
            return;
        }

        if (!complexityRegex.test(newPassword)) {
            errorDiv.textContent = 'A senha deve ter no mínimo 5 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.';
            return;
        }

        try {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });
            
            document.getElementById('force-change-modal').style.display = 'none';
            checkAuth();
        } catch (err) {
            errorDiv.textContent = err.message || 'Erro ao atualizar senha';
        }
    };
}

document.getElementById('delete-member-btn').onclick = async () => {
    const id = document.getElementById('p-id').value;
    if (id && await showConfirm('Tem certeza? Isso excluirá todos os pagamentos vinculados a este membro.')) {
        try {
            await apiFetch(`/api/people/${id}`, { method: 'DELETE' });
            personModal.style.display = 'none';
            await loadInitialData();
        } catch(err) { showStatus('Erro ao excluir membro', 'error'); }
    }
};

closeButtons.forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
});

// Removed window.onclick background closing as requested.

// --- Form Handlers ---
document.getElementById('person-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const formData = {
        name: document.getElementById('p-name').value.trim(),
        responsible: document.getElementById('p-responsible').value,
        unit: document.getElementById('p-unit').value,
        birth_date: document.getElementById('p-birth').value,
        cpf: document.getElementById('p-cpf').value,
        username: document.getElementById('u-username').value,
        password: document.getElementById('u-password').value
    };
    
    if (!formData.name || formData.name.split(/\s+/).length < 2) {
        showStatus('O nome deve conter pelo menos Nome e Sobrenome.', 'error');
        return;
    }

    if (!formData.unit) {
        showStatus('A unidade é obrigatória.', 'error');
        return;
    }

    if (formData.cpf && !isValidCPF(formData.cpf)) {
        showStatus('CPF inválido. Por favor, verifique os dados.', 'error');
        return;
    }

    try {
        const url = id ? `/api/people/${id}` : '/api/people';
        const method = id ? 'PUT' : 'POST';

        await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        personModal.style.display = 'none';
        e.target.reset();
        await loadInitialData();
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

document.getElementById('payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('person_id', document.getElementById('p-person-id').value);
    formData.append('month', document.getElementById('p-month').value);
    formData.append('year', state.currentYear);
    formData.append('amount', document.getElementById('amount').value);
    
    const receiptFile = document.getElementById('receipt').files[0];
    if (receiptFile) {
        formData.append('receipt', receiptFile);
    }

    try {
        const res = await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });

        if (res.ok) {
            paymentModal.style.display = 'none';
            e.target.reset();
            await loadInitialData();
        } else {
            const data = await res.json();
            document.getElementById('payment-error').textContent = data.error;
        }
    } catch (err) {
        showStatus('Erro ao salvar pagamento', 'error');
    }
};


// --- Import Logic ---
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

if (importBtn) {
    importBtn.onclick = () => importInput.click();
}

if (importInput) {
    importInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            importBtn.disabled = true;
            importBtn.textContent = 'Importando...';
            
            const res = await fetch('/api/people/import', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                showStatus(`Sucesso! ${data.count} membros importados.`, 'success');
                await loadInitialData();
            } else {
                showStatus(data.error, 'error');
            }
        } catch (err) {
            console.error('Import Error:', err);
            showStatus('Erro ao carregar arquivo: ' + err.message, 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = 'Importar Planilha';
            importInput.value = '';
        }
    };
}

// --- Event Forms ---
const addEventBtn = document.getElementById('add-event-btn');
if (addEventBtn) addEventBtn.onclick = () => {
    document.getElementById('event-form').reset();
    document.getElementById('ev-member-search').value = '';
    renderEventParticipantsChecklist();
    eventCreateModal.style.display = 'flex';
};

document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    const participantIds = Array.from(document.querySelectorAll('.participant-check:checked')).map(c => c.getAttribute('data-id'));
    
    const formData = {
        name: document.getElementById('event-name').value,
        date: document.getElementById('event-date').value,
        description: document.getElementById('event-desc').value,
        participant_ids: participantIds
    };
    try {
        await apiFetch('/api/events', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        eventCreateModal.style.display = 'none';
        fetchEventsData();
    } catch (err) { showStatus(err.message, 'error'); }
};

document.getElementById('event-payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('event_id', document.getElementById('ep-event-id').value);
    formData.append('month', document.getElementById('ep-month').value);
    formData.append('year', document.getElementById('ep-year').value);
    formData.append('amount', document.getElementById('ep-amount').value);
    
    if (state.role === 'admin' && state.tempPaymentPersonId) {
        formData.append('person_id', state.tempPaymentPersonId);
    }

    const file = document.getElementById('ep-receipt').files[0];
    if (file) formData.append('receipt', file);

    try {
        const res = await fetch('/api/event-payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        if (res.ok) {
            eventPaymentModal.style.display = 'none';
            if (state.currentEvent) openEventDetail(state.currentEvent.id);
            else fetchEventsData();
        } else {
            const data = await res.json();
            showStatus(data.error, 'error');
        }
    } catch (err) { showStatus('Erro ao salvar pagamento', 'error'); }
};

// --- Initialization ---
document.getElementById('p-cpf').addEventListener('input', (e) => {
    e.target.value = formatCPF(e.target.value);
});

document.getElementById('p-birth').addEventListener('change', (e) => {
    const birthDate = e.target.value;
    const age = calculateAge(birthDate);
    const ageField = document.getElementById('p-age');
    const unitField = document.getElementById('p-unit');

    ageField.value = age;
    
    if (age !== '') {
        if (age < 16) {
            unitField.value = 'DESBRAVADOR';
        } else {
            unitField.value = 'DIREÇÃO';
        }
    }
});

yearSelect.addEventListener('change', (e) => {
    state.currentYear = e.target.value;
    loadInitialData();
});

// --- Sidebar Toggle ---
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

const initializeSidebar = () => {
    // Only apply collapsed state if on desktop
    if (window.innerWidth > 768) {
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }
    }
};

if (sidebarToggle) {
    sidebarToggle.onclick = () => {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    };
}

    // Event Detail: Add Participants
    const addPartBtn = document.getElementById('add-participants-btn');
    if (addPartBtn) addPartBtn.onclick = openAddParticipantsModal;
    
    const saveNewPartBtn = document.getElementById('save-new-participants-btn');
    if (saveNewPartBtn) saveNewPartBtn.onclick = saveNewParticipants;
    
    const searchNewPartInput = document.getElementById('add-member-search');
    if (searchNewPartInput) {
        searchNewPartInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#add-participants-list .checklist-item');
            items.forEach(item => {
                item.style.display = item.dataset.name.includes(query) ? 'flex' : 'none';
            });
        };
    }

window.generateGeneralReport = () => {
    const currentYear = parseInt(state.currentYear);
    const approvedPayments = state.payments.filter(p => p.status === 'approved' && p.year === currentYear);
    const totalCash = approvedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    const byUnit = {};
    state.people.forEach(p => {
        const unit = p.unit || 'Sem Unidade';
        if (!byUnit[unit]) byUnit[unit] = 0;
        const paid = approvedPayments
            .filter(pay => pay.person_id === p.id)
            .reduce((sum, pay) => sum + parseFloat(pay.amount), 0);
        byUnit[unit] += paid;
    });

    let html = `
        <div class="report-header">
            <div>
                <h1 style="margin: 0;">Relatório Geral de Mensalidades</h1>
                <p>Referência: Ano de ${currentYear} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <img src="logo.png" style="height: 60px;">
        </div>

        <div class="report-summary-box">
            <div>
                <span class="label">Arrecadação Total no Ano</span>
                <span class="value">R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div>
                <span class="label">Total de Membros</span>
                <span class="value">${state.people.length}</span>
            </div>
        </div>

        <h3>Resumo por Unidade</h3>
        <table class="report-table">
            <thead>
                <tr><th>Unidade</th><th>Valor Arrecadado (Ano)</th></tr>
            </thead>
            <tbody>
                ${Object.entries(byUnit).sort((a,b) => b[1] - a[1]).map(([unit, val]) => `
                    <tr>
                        <td><strong>${unit}</strong></td>
                        <td>R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div style="margin-top: 3rem; border-top: 1px solid #eee; padding-top: 1rem; font-size: 0.8rem; color: #999; text-align: center;">
            Documento gerado eletronicamente pelo Sistema de Gestão Financeira.
        </div>
    `;

    document.getElementById('report-printable').innerHTML = html;
    document.getElementById('report-modal').style.display = 'flex';
};

window.generateMemberReport = async () => {
    const memberId = document.getElementById('report-member-select').value;
    if (!memberId) return showStatus('Selecione um membro primeiro.', 'info');
    
    const member = state.people.find(p => p.id == memberId);
    const currentYear = parseInt(state.currentYear);
    const payments = state.payments.filter(p => p.person_id == memberId && p.year === currentYear);
    const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    let html = `
        <div class="report-header">
            <div>
                <h1 style="margin: 0;">Extrato de Pagamentos - Membro</h1>
                <p>Membro: <strong>${member.name}</strong> | Unidade: ${member.unit || 'N/A'}</p>
            </div>
            <img src="logo.png" style="height: 60px;">
        </div>

        <div class="report-summary-box">
            <div>
                <span class="label">Total Pago (${currentYear})</span>
                <span class="value">R$ ${totalPaid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div>
                <span class="label">CPF</span>
                <span class="value">${member.cpf || 'Não informado'}</span>
            </div>
        </div>

        <h3>Histórico Mensal (${currentYear})</h3>
        <table class="report-table">
            <thead>
                <tr><th>Mês</th><th>Status</th><th>Valor</th><th>Data do Pagamento</th></tr>
            </thead>
            <tbody>
                ${months.map((m, idx) => {
                    const pay = payments.find(p => p.month === idx + 1);
                    return `
                        <tr>
                            <td>${m}</td>
                            <td>${pay ? (pay.status === 'approved' ? 'PAGO' : pay.status === 'pending' ? 'PENDENTE' : 'RECUSADO') : 'NÃO REALIZADO'}</td>
                            <td>${pay ? 'R$ ' + parseFloat(pay.amount).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                            <td>${pay && pay.updated_at ? new Date(pay.updated_at).toLocaleDateString('pt-BR') : '-'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('report-printable').innerHTML = html;
    document.getElementById('report-modal').style.display = 'flex';
};

window.generateEventReport = async () => {
    const eventId = document.getElementById('report-event-select').value;
    const filterType = document.getElementById('report-event-filter').value;
    
    if (!eventId) return showStatus('Selecione um evento primeiro.', 'info');
    
    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        const { event, participants, payments } = data;
        
        let totalArrecadado = payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount), 0);
        
        let contentHtml = '';
        
        if (filterType === 'unit') {
            const byUnit = {};
            participants.forEach(p => {
                const unit = p.unit || 'Sem Unidade';
                if (!byUnit[unit]) byUnit[unit] = { count: 0, paid: 0 };
                byUnit[unit].count++;
                const amount = payments.filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount), 0);
                byUnit[unit].paid += amount;
            });
            
            contentHtml = `
                <h3>Resumo por Unidade</h3>
                <table class="report-table">
                    <thead>
                        <tr><th>Unidade</th><th>Participantes</th><th>Arrecadação</th></tr>
                    </thead>
                    <tbody>
                        ${Object.entries(byUnit).map(([unit, stats]) => `
                            <tr>
                                <td>${unit}</td>
                                <td>${stats.count}</td>
                                <td>R$ ${stats.paid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            contentHtml = `
                <h3>Lista de Participantes</h3>
                <table class="report-table">
                    <thead>
                        <tr><th>Membro</th><th>Unidade</th><th>Status</th><th>Total Pago</th></tr>
                    </thead>
                    <tbody>
                        ${participants.map(p => {
                            const amount = payments.filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount), 0);
                            return `
                                <tr>
                                    <td>${p.name}</td>
                                    <td>${p.unit || '-'}</td>
                                    <td>${amount > 0 ? 'PARTICIPANDO' : 'PENDENTE'}</td>
                                    <td>R$ ${amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        let html = `
            <div class="report-header">
                <div>
                    <h1 style="margin: 0;">Relatório de Evento</h1>
                    <p>Evento: <strong>${event.name}</strong> | Data: ${event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
                </div>
                <img src="logo.png" style="height: 60px;">
            </div>

            <div class="report-summary-box">
                <div>
                    <span class="label">Total Arrecadado</span>
                    <span class="value">R$ ${totalArrecadado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div>
                    <span class="label">Total Participantes</span>
                    <span class="value">${participants.length}</span>
                </div>
            </div>

            ${contentHtml}
        `;

        document.getElementById('report-printable').innerHTML = html;
        document.getElementById('report-modal').style.display = 'flex';
    } catch (err) {
        showStatus('Erro ao carregar dados do evento: ' + err.message, 'error');
    }
};

const toggleReportFields = () => {
    const type = document.getElementById('report-type-select').value;
    document.getElementById('report-field-member').style.display = type === 'member' ? 'block' : 'none';
    document.getElementById('report-fields-event').style.display = type === 'event' ? 'block' : 'none';
};

const confirmGenerateReport = () => {
    const type = document.getElementById('report-type-select').value;
    document.getElementById('report-selector-modal').style.display = 'none';
    
    if (type === 'general') generateGeneralReport();
    else if (type === 'member') generateMemberReport();
    else if (type === 'event') generateEventReport();
};

document.getElementById('report-type-select').onchange = toggleReportFields;
const openSelectorBtn = document.getElementById('open-report-selector-btn');
if (openSelectorBtn) {
    openSelectorBtn.onclick = () => {
        document.getElementById('report-selector-modal').style.display = 'flex';
        toggleReportFields();
    };
}
const confirmGenBtn = document.getElementById('confirm-generate-report-btn');
if (confirmGenBtn) confirmGenBtn.onclick = confirmGenerateReport;


// --- Heartbeat Check (Instant Kick) ---
let heartbeatInterval = null;
const startHeartbeat = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
        if (!state.token) return clearInterval(heartbeatInterval);
        try {
            await apiFetch('/api/auth/status');
        } catch (e) {
            // apiFetch handles 401/logout
        }
    }, 15000); // Check every 15 seconds
};

if (state.token) startHeartbeat();
checkAuth();
