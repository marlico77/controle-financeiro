// State Management
const state = {
    token: localStorage.getItem('token') || null,
    people: [],
    payments: [],
    currentYear: new Date().getFullYear(),
    activeTab: 'dashboard',
    role: localStorage.getItem('role') || null,
    personId: localStorage.getItem('personId') || null,
    charts: {
        pie: null,
        bar: null
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
const closeButtons = document.querySelectorAll('.close-modal');

// --- Auth Functions ---
const checkAuth = () => {
    if (state.token) {
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
            
            // Hide specific cards for members
            const cards = document.querySelectorAll('.stat-card');
            if (cards[1]) cards[1].style.display = 'none';
            if (cards[2]) cards[2].style.display = 'none';
            
            // Update labels
            const statLabels = document.querySelectorAll('.stat-label');
            if (statLabels[0]) statLabels[0].textContent = 'Total Pago (Ano)';
            
            // Change Chart Title for members
            const chartTitles = document.querySelectorAll('.chart-container h4');
            if (chartTitles[0]) chartTitles[0].textContent = 'Status de Pagamento';

            document.getElementById('page-title').textContent = 'Meu Status de Mensalidade';
            document.getElementById('user-role-badge').textContent = 'Membro';
            document.getElementById('user-name-display').textContent = 'Carregando...';
        } else {
            if (membersNav) membersNav.style.display = 'block';
            if (dashboardStats) dashboardStats.style.display = 'grid';
            if (chartsGrid) chartsGrid.style.display = 'grid';
            
            const cards = document.querySelectorAll('.stat-card');
            if (cards[1]) cards[1].style.display = 'block';
            if (cards[2]) cards[2].style.display = 'block';
            
            const chartTitles = document.querySelectorAll('.chart-container h4');
            if (chartTitles[0]) chartTitles[0].textContent = 'Distribuição por Unidade';

            document.getElementById('page-title').textContent = 'Dashboard de Mensalidades';
            // Role hidden via CSS
            document.getElementById('user-name-display').textContent = 'Administrador';
            document.getElementById('user-avatar-initials').textContent = 'AD';
            const mobileAvatar = document.getElementById('mobile-avatar-initials');
            if (mobileAvatar) mobileAvatar.textContent = 'AD';
        }

        setTimeout(() => loadInitialData(), 50); 
    } else {
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
    }
};


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
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            state.token = data.token;
            state.role = data.role;
            state.personId = data.personId;
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('personId', data.personId);
            checkAuth();
        } else {
            loginError.textContent = data.error;
        }
    } catch (err) {
        loginError.textContent = 'Erro ao conectar ao servidor';
    }
});

logoutBtn.addEventListener('click', () => {
    state.token = null;
    state.role = null;
    state.personId = null;
    state.people = [];
    state.payments = [];
    
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('personId');
    
    // Reset UI text immediately
    document.getElementById('user-name-display').textContent = 'Autenticando...';
    document.getElementById('user-avatar-initials').textContent = '?';
    
    checkAuth();
});

// --- Navigation ---
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        const target = link.dataset.target;
        state.activeTab = target;
        
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        tabContents.forEach(tab => {
            tab.style.display = tab.id === `${target}-page` ? 'block' : 'none';
        });

        document.getElementById('page-title').textContent = target === 'dashboard' ? 'Dashboard de Mensalidades' : 'Gerenciamento de Membros';
    });
});

// --- Data Fetching ---
const apiFetch = async (url, options = {}) => {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${state.token}`
        }
    });
    
    if (res.status === 401 || res.status === 403) {
        logoutBtn.click();
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Erro na requisição');
    }
    return data;
};

const loadInitialData = async () => {
    try {
        state.people = await apiFetch('/api/people');
        state.payments = await apiFetch(`/api/payments?year=${state.currentYear}`);
        renderDashboard();
        renderPeople();
        // Always update stats (it handles both roles)
        updateDashboardStats();

        if (state.role !== 'admin' && state.people.length > 0) {
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('user-avatar-initials').textContent = initials;
            const mobileAvatar = document.getElementById('mobile-avatar-initials');
            if (mobileAvatar) mobileAvatar.textContent = initials;
        }
    } catch (err) {
        console.error('Error loading data:', err);
    }
};

const updateDashboardStats = () => {
    let totalCash = 0;
    let direcaoTotal = 0;
    let desbravadoresTotal = 0;
    let outrosTotal = 0;
    
    const monthlyData = new Array(12).fill(0);
    
    state.payments.forEach(p => {
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
                legend: { position: 'bottom' }
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
                legend: { display: false }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    suggestedMax: 100, // Starts at 100 but grows if values are higher
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value;
                        }
                    }
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
    state.people.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${person.name}</strong></td>`;
        
        for (let m = 1; m <= 12; m++) {
            const payment = state.payments.find(p => p.person_id === person.id && p.month === m);
            const td = document.createElement('td');
            td.className = 'cell-pending';
            
            const dot = document.createElement('span');
            dot.className = `status-dot ${payment ? 'paid' : ''}`;
            dot.title = payment ? `Pago em ${new Date(payment.payment_date).toLocaleDateString()}` : 'Pendente';
            
            dot.onclick = () => {
                if (state.role === 'admin') {
                    openPaymentModal(person, m, payment);
                } else if (payment && payment.receipt_path) {
                    // Members can only view receipts of paid months
                    window.open(`/${payment.receipt_path}`, '_blank');
                }
            };
            
            td.appendChild(dot);
            tr.appendChild(td);
        }
        paymentsBody.appendChild(tr);
    });
};

const renderPeople = () => {
    peopleBody.innerHTML = '';
    
    // Update table header if needed
    const headerRow = document.querySelector('#people-table thead tr');
    if (headerRow && !headerRow.querySelector('.user-col-head')) {
        const th = document.createElement('th');
        th.className = 'user-col-head';
        th.textContent = 'Usuário';
        headerRow.insertBefore(th, headerRow.children[1]);
    }

    state.people.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${person.name.toUpperCase()}</strong></td>
            <td><span class="badge" style="background: var(--bg-color); color: var(--text-dim); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${person.username || '-'}</span></td>
            <td><span class="unit-tag">${person.unit || 'S/U'}</span></td>
            <td>${person.responsible || '-'}</td>
            <td>${formatDate(person.birth_date)}</td>
            <td>
                <button class="btn-text" onclick="editPerson(${person.id})">
                    <span class="icon">✏️</span>
                </button>
            </td>
        `;
        peopleBody.appendChild(tr);
    });
};

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

    if (payment) {
        title.textContent = 'Gerenciar Pagamento';
        amountInput.value = payment.amount;
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => deletePayment(payment.id);
        saveBtn.style.display = 'block'; // Allowed to save/edit
        
        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            // Secure path: uploads/filename.ext -> /api/files/receipt/filename.ext
            const securePath = payment.receipt_path.replace('uploads/', '/api/files/receipt/');
            document.getElementById('view-receipt-btn').href = securePath;
        } else {
            receiptContainer.style.display = 'none';
        }
        document.getElementById('receipt').parentElement.style.display = 'block';
    } else {
        title.textContent = 'Registrar Pagamento';
        amountInput.value = '20.00';
        deleteBtn.style.display = 'none';
        saveBtn.style.display = 'block';
        receiptContainer.style.display = 'none';
        document.getElementById('receipt').parentElement.style.display = 'block';
        document.getElementById('receipt').value = '';
    }

    paymentModal.style.display = 'block';
};

const deletePayment = async (id) => {
    if (confirm('Tem certeza que deseja excluir este registro de pagamento?')) {
        try {
            await apiFetch(`/api/payments/${id}`, { method: 'DELETE' });
            paymentModal.style.display = 'none';
            await loadInitialData();
        } catch (err) {
            alert('Erro ao excluir pagamento');
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
    
    personModal.style.display = 'block';
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
    
    document.getElementById('delete-member-btn').style.display = 'block';
    personModal.style.display = 'block';
};
window.editPerson = editPerson;

document.getElementById('delete-member-btn').onclick = async () => {
    const id = document.getElementById('p-id').value;
    if (id && confirm('Tem certeza? Isso excluirá todos os pagamentos vinculados a este membro.')) {
        try {
            await apiFetch(`/api/people/${id}`, { method: 'DELETE' });
            personModal.style.display = 'none';
            await loadInitialData();
        } catch(err) { alert('Erro ao excluir membro'); }
    }
};

closeButtons.forEach(btn => {
    btn.onclick = () => {
        paymentModal.style.display = 'none';
        personModal.style.display = 'none';
    };
});

window.onclick = (event) => {
    if (event.target == paymentModal || event.target == personModal) {
        paymentModal.style.display = 'none';
        personModal.style.display = 'none';
    }
};

// --- Form Handlers ---
document.getElementById('person-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const formData = {
        name: document.getElementById('p-name').value,
        responsible: document.getElementById('p-responsible').value,
        unit: document.getElementById('p-unit').value,
        birth_date: document.getElementById('p-birth').value,
        cpf: document.getElementById('p-cpf').value,
        username: document.getElementById('u-username').value,
        password: document.getElementById('u-password').value
    };

    if (formData.cpf && !isValidCPF(formData.cpf)) {
        alert('CPF inválido. Por favor, verifique os dados.');
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
        alert(err.message);
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
        alert('Erro ao salvar pagamento');
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
            importBtn.textContent = '⏱ Importando...';
            
            const res = await fetch('/api/people/import', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                alert(`Sucesso! ${data.count} membros importados.`);
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error('Import Error:', err);
            alert('Erro ao carregar arquivo: ' + err.message);
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = '📊 Importar Planilha';
            importInput.value = '';
        }
    };
}

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

checkAuth();
