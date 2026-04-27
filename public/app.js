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
    outflows: [],
    currentEvent: null,
    eventDetailYear: new Date().getFullYear(),
    charts: {
        pie: null,
        bar: null,
        evPie: null,
        evBar: null,
        mensPie: null,
        mensBar: null
    },
    peopleSort: {
        column: 'name',
        direction: 'asc'
    },
    logFilter: 'all'
};

// Global Fail-safe for Multi-month Toggle
window.toggleMultiMonth = (isChecked) => {
    const selector = document.getElementById('p-multi-month-selector');
    const singleInfo = document.getElementById('p-single-month-info');
    if (selector) {
        selector.style.display = isChecked ? 'block' : 'none';
        if (isChecked) selector.classList.add('animate-slide-down');
    }
    if (singleInfo) singleInfo.style.display = isChecked ? 'none' : 'block';
};

const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
    
    // Handle ISO strings (YYYY-MM-DDTHH:mm:ss...)
    const cleanDate = dateString.split('T')[0];
    const parts = cleanDate.split('-');
    
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

async function showAlert(message, title = 'Aviso', icon = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal');
        const titleEl = document.getElementById('alert-title');
        const messageEl = document.getElementById('alert-message');
        const iconEl = document.getElementById('alert-icon');
        const okBtn = document.getElementById('alert-ok');

        titleEl.textContent = title;
        messageEl.innerHTML = message;
        iconEl.innerHTML = icon;
        modal.style.display = 'flex';

        okBtn.onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
}

// --- Report and Auth Generators (Global Scope) ---
async function generateGeneralReport() {
    try {
        console.log('[REPORT] Gerando Relatório Geral...');
        const currentYear = parseInt(state.currentYear || new Date().getFullYear());
        const payments = state.payments || [];
        const people = state.people || [];
        
        const approvedPayments = payments.filter(p => p.status === 'approved' && p.year === currentYear);
        const totalCash = approvedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        
        const byUnit = {};
        people.forEach(p => {
            const unit = p.unit || 'Sem Unidade';
            if (!byUnit[unit]) byUnit[unit] = 0;
            const paid = approvedPayments
                .filter(pay => pay.person_id === p.id)
                .reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
            byUnit[unit] += paid;
        });

        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Relatório Geral de Mensalidades</h1>
                <p style="margin: 5px 0 0 0;">Referência: Ano de ${currentYear} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <div class="report-summary-box">
                <div>
                    <span class="label">Arrecadação Total no Ano</span>
                    <span class="value">R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div>
                    <span class="label">Total de Membros</span>
                    <span class="value">${people.length}</span>
                </div>
            </div>
            <h3>Resumo por Unidade</h3>
            <div class="report-table-wrapper">
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
            </div>
        `;
        const printable = document.getElementById('report-printable');
        const modal = document.getElementById('report-modal');
        if (printable && modal) {
            printable.innerHTML = html;
            modal.style.display = 'flex';
            showStatus('Relatório gerado! Use o botão Imprimir para salvar como PDF.', 'success');
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório: ' + err.message, 'error');
    }
}
window.generateGeneralReport = generateGeneralReport;

async function generateMemberReport() {
    try {
        console.log('[REPORT] Gerando Relatório de Membro...');
        const memberId = document.getElementById('report-member-select').value;
        if (!memberId) return showStatus('Selecione um membro primeiro.', 'info');
        
        const people = state.people || [];
        const member = people.find(p => p.id == memberId);
        if (!member) return showStatus('Membro não encontrado.', 'error');

        const currentYear = parseInt(state.currentYear || new Date().getFullYear());
        const payments = (state.payments || []).filter(p => p.person_id == memberId && p.year === currentYear);
        const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Extrato de Pagamentos - Membro</h1>
                <p style="margin: 5px 0 0 0;">Membro: <strong>${member.name}</strong> | Unidade: ${member.unit || 'N/A'}</p>
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
            <div class="report-table-wrapper">
                <table class="report-table">
                    <thead>
                        <tr><th>Mês</th><th>Status</th><th>Valor</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                        ${months.map((m, idx) => {
                            const pay = payments.find(p => p.month === idx + 1);
                            return `
                                <tr>
                                    <td>${m}</td>
                                    <td>${pay ? (pay.status === 'approved' ? 'PAGO' : pay.status === 'pending' ? 'PENDENTE' : 'RECUSADO') : 'NÃO REALIZADO'}</td>
                                    <td>${pay ? 'R$ ' + parseFloat(pay.amount || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                                    <td>${pay && pay.updated_at ? new Date(pay.updated_at).toLocaleDateString('pt-BR') : '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        const printable = document.getElementById('report-printable');
        const modal = document.getElementById('report-modal');
        if (printable && modal) {
            printable.innerHTML = html;
            modal.style.display = 'flex';
            showStatus('Extrato gerado!', 'success');
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório do membro.', 'error');
    }
}
window.generateMemberReport = generateMemberReport;

async function generateEventReport() {
    console.log('[REPORT] Gerando Relatório de Evento...');
    const eventId = document.getElementById('report-event-select').value;
    const filterType = document.getElementById('report-event-filter').value;
    if (!eventId) return showStatus('Selecione um evento primeiro.', 'info');
    
    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        const { event, participants, payments } = data;
        
        let totalArrecadado = (payments || []).filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        let contentHtml = '';
        
        if (filterType === 'unit') {
            const byUnit = {};
            (participants || []).forEach(p => {
                const unit = p.unit || 'Sem Unidade';
                if (!byUnit[unit]) byUnit[unit] = { count: 0, paid: 0 };
                byUnit[unit].count++;
                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                byUnit[unit].paid += amount;
            });
            contentHtml = `
                <h3>Resumo por Unidade</h3>
                <div class="report-table-wrapper">
                    <table class="report-table">
                        <thead>
                            <tr><th>Unidade</th><th>Participantes</th><th>Arrecadação</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(byUnit).map(([unit, stats]) => `
                                <tr><td>${unit}</td><td>${stats.count}</td><td>R$ ${stats.paid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            contentHtml = `
                <h3>Lista de Participantes</h3>
                <div class="report-table-wrapper">
                    <table class="report-table">
                        <thead>
                            <tr><th>Membro</th><th>Unidade</th><th>Status</th><th>Total Pago</th></tr>
                        </thead>
                        <tbody>
                            ${(participants || []).map(p => {
                                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                                return `<tr><td>${p.name}</td><td>${p.unit || '-'}</td><td>${amount > 0 ? 'PARTICIPANDO' : 'PENDENTE'}</td><td>R$ ${amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Relatório de Evento</h1>
                <p style="margin: 5px 0 0 0;">Evento: <strong>${event.name}</strong> | Data: ${event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
            </div>
            <div class="report-summary-box">
                <div><span class="label">Total Arrecadado</span><span class="value">R$ ${totalArrecadado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                <div><span class="label">Total Participantes</span><span class="value">${(participants || []).length}</span></div>
            </div>
            ${contentHtml}
        `;
        const printable = document.getElementById('report-printable');
        const modal = document.getElementById('report-modal');
        if (printable && modal) {
            printable.innerHTML = html;
            modal.style.display = 'flex';
        }
    } catch (err) {
        showStatus('Erro ao carregar dados do evento.', 'error');
    }
}
window.generateEventReport = generateEventReport;

async function generateAuthDocument(type) {
    try {
        console.log(`[AUTH] Gerando Autorização (${type})...`);
        const eventName = (document.getElementById('auth-event-name') || {}).value || '';
        const eventDate = (document.getElementById('auth-event-date') || {}).value || '';
        const eventLocation = (document.getElementById('auth-event-location') || {}).value || '';
        const departureLocation = (document.getElementById('auth-departure-location') || {}).value || '';
        const departureTime = (document.getElementById('auth-departure-time') || {}).value || '';
        const returnTime = (document.getElementById('auth-return-time') || {}).value || '';

        if (!eventName || !eventDate || !eventLocation || !departureLocation || !departureTime || !returnTime) {
            return showStatus('Por favor, preencha todos os campos do formulário.', 'error');
        }

        const formattedDate = formatDate(eventDate);
        const currentYear = new Date().getFullYear();
        const getLogoBase64 = async () => {
            try {
                const response = await fetch('logo.png');
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { return 'logo.png'; }
        };

        const logoSrc = await getLogoBase64();

        const htmlContent = `
            <div class="report-canvas" style="font-family: Arial; line-height: 1.8; max-width: 100%; margin: 0 auto; padding: 20px; color: black;">
                <div class="report-header">
                    <img src="${logoSrc}">
                    <div>
                        <h2 style="margin: 0; font-size: 1.2rem; text-transform: uppercase;">CLUBE DE DESBRAVADORES TRIBO DE DAVI-AP</h2>
                        <h3 style="margin: 5px 0 0 0; font-size: 1rem; text-decoration: underline;">Autorização de Saída</h3>
                    </div>
                </div>
                <div style="margin-top: 40px; text-align: justify; line-height: 2.2;">
                    Eu, <span style="border-bottom: 1px solid black; display: inline-block; min-width: 200px; margin: 0 5px;"></span>, 
                    responsável pelo(a) desbravador(a) <span style="border-bottom: 1px solid black; display: inline-block; min-width: 200px; margin: 0 5px;"></span>, 
                    autorizo-o(a) a participar do evento <strong>${eventName}</strong>, que será realizado no dia <strong>${formattedDate}</strong>, no local <strong>${eventLocation}</strong>. Os desbravadores deverão se apresentar às <strong>${departureTime}</strong>h em <strong>${departureLocation}</strong> para a partida.
                </div>
                <p style="text-align: justify; line-height: 2.2;">O evento tem término previsto para as <strong>${returnTime}</strong>h, momento em que o responsável deverá buscar a criança no mesmo local de partida indicado acima.</p>
                <p style="margin-top: 25px; text-align: center; font-weight: bold; border: 1px solid #ddd; padding: 15px; border-radius: 8px;">Estou ciente de que estará acompanhado(a) pela direção do Clube TRIBO DE DAVI, permanecendo sob sua responsabilidade durante todo esse período.</p>
                <div style="margin-top: 50px; text-align: right; font-weight: bold;">_____ / _____ / ${currentYear}</div>
                <div style="margin-top: 40px;">
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">Nome do responsável: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">CPF: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">Telefone: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                </div>
                <div style="margin-top: 80px; text-align: center;">
                    <div style="border-top: 1px solid black; max-width: 400px; width: 100%; margin: 0 auto; padding-top: 5px;">Assinatura do responsável</div>
                </div>
            </div>
        `;

        if (type === 'pdf') {
            const printable = document.getElementById('report-printable');
            const modal = document.getElementById('report-modal');
            if (printable && modal) {
                printable.innerHTML = htmlContent;
                modal.style.display = 'flex';
            }
        } else {
            const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>";
            const sourceHTML = header + htmlContent + "</body></html>";
            const blob = new Blob([sourceHTML], { type: 'application/vnd.ms-word' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Autorizacao_' + eventName.replace(/\s+/g, '_') + '.doc';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showStatus('Documento Word (.doc) gerado com sucesso!', 'success');
        }
    } catch (err) {
        console.error('[AUTH] Erro:', err);
        showStatus('Erro ao gerar autorização.', 'error');
    }
}
window.generateAuthDocument = generateAuthDocument;

function confirmGenerateReport() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const selectorModal = document.getElementById('report-selector-modal');
    if (selectorModal) selectorModal.style.display = 'none';
    
    if (type === 'general') generateGeneralReport();
    else if (type === 'member') generateMemberReport();
    else if (type === 'event') generateEventReport();
}
window.confirmGenerateReport = confirmGenerateReport;

function toggleReportFields() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const memberField = document.getElementById('report-field-member');
    const eventFields = document.getElementById('report-fields-event');
    if (memberField) memberField.style.display = type === 'member' ? 'block' : 'none';
    if (eventFields) eventFields.style.display = type === 'event' ? 'block' : 'none';
}
window.toggleReportFields = toggleReportFields;

const initGeneratorListeners = () => {
    console.log('[INIT] Inicializando listeners de relatórios e autorizações');
    
    const typeSelect = document.getElementById('report-type-select');
    if (typeSelect) typeSelect.onchange = toggleReportFields;

    const openSelectorBtn = document.getElementById('open-report-selector-btn');
    if (openSelectorBtn) {
        openSelectorBtn.onclick = () => {
            const modal = document.getElementById('report-selector-modal');
            if (modal) {
                modal.style.display = 'flex';
                toggleReportFields();
            }
        };
    }

    const confirmGenBtn = document.getElementById('confirm-generate-report-btn');
    if (confirmGenBtn) confirmGenBtn.onclick = confirmGenerateReport;

    const authPdfBtn = document.getElementById('generate-auth-pdf');
    if (authPdfBtn) authPdfBtn.onclick = () => generateAuthDocument('pdf');

    const authDocBtn = document.getElementById('generate-auth-doc');
    if (authDocBtn) authDocBtn.onclick = () => generateAuthDocument('doc');
};

// Start listening immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGeneratorListeners);
} else {
    initGeneratorListeners();
}
// Also run a few times later to catch dynamic renders
setTimeout(initGeneratorListeners, 1000);
setTimeout(initGeneratorListeners, 3000);

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

// --- Data Fetching ---
async function apiFetch(url, options = {}) {
    const headers = {
        'Authorization': `Bearer ${state.token || localStorage.getItem('token')}`,
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
        if (res.status === 401 || res.status === 403) {
            const prohibitedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 60px; height: 60px; fill: var(--accent-color);"><path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>`;
            const errorMsg = res.status === 401 ? 'Sessão Encerrada: Sua conta foi acessada em outro dispositivo ou a sessão expirou.' : 'Sessão Inválida: Por favor, faça login novamente.';
            await showAlert(errorMsg, 'Sessão Encerrada', prohibitedSvg);
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
}

// --- Inactivity Timer Configuration ---
const INACTIVITY_LIMIT = 20 * 60 * 1000; // 20 minutes
const WARNING_TIME = 18 * 60 * 1000;    // 18 minutes (2 min warning)
let inactivityTimeout;
let warningTimeout;

function resetInactivityTimer() {
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    if (warningTimeout) clearTimeout(warningTimeout);

    if (state.token || localStorage.getItem('token')) {
        warningTimeout = setTimeout(() => {
            showStatus('⚠️ Sua sessão expirará em 2 minutos por inatividade.', 'info');
        }, WARNING_TIME);

        inactivityTimeout = setTimeout(() => {
            logout();
        }, INACTIVITY_LIMIT);
    }
}

// Listen for user activity to reset the timer
['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, resetInactivityTimer);
});

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
const reportSelectorModal = document.getElementById('report-selector-modal');
const reportModal = document.getElementById('report-modal');
const closeButtons = document.querySelectorAll('.close-modal');

// Global Modal Closing Logic
closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    });
});

// Fecha modal apenas no X (removido fechamento ao clicar fora conforme solicitado)

// --- Sidebar Toggle ---
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

const initializeSidebar = () => {
    // Only apply collapsed state if on desktop
    if (window.innerWidth > 768) {
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && sidebar) {
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

// --- Auth Functions ---
async function checkAuth() {
    const splash = document.getElementById('splash-screen');
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
                if (splash) splash.classList.add('fade-out');
                document.getElementById('force-change-modal').style.display = 'flex';
                return;
            }

            loginSection.style.display = 'none';
            mainSection.style.display = 'flex';
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(() => splash.style.display = 'none', 500);
            }
            
            // --- Tab Visibility Logic Based on Role ---
            const isAdmin = state.role === 'admin';
            const isSecretary = state.role === 'secretário';
            const isMaster = isAdmin && (state.username || '').toUpperCase() === 'ADMINISTRADOR';

            // Sidebar Elements
            const navItems = {
                dashboard: document.querySelector('[data-target="dashboard"]'),
                people: document.querySelector('[data-target="people"]'),
                events: document.querySelector('[data-target="events"]'),
                reports: document.querySelector('[data-target="reports"]'),
                authorizations: document.getElementById('nav-authorizations'),
                outflows: document.getElementById('nav-outflows'),
                logs: document.getElementById('nav-logs')
            };

            // Common User Access: Only Dashboard and Events
            if (!isAdmin && !isSecretary) {
                if (navItems.people) navItems.people.style.display = 'none';
                if (navItems.reports) navItems.reports.style.display = 'none';
                if (navItems.authorizations) navItems.authorizations.style.display = 'none';
                if (navItems.outflows) navItems.outflows.style.display = 'none';
                if (navItems.logs) navItems.logs.style.display = 'none';
                
                // Adjust Dashboard for common user
                const cards = document.querySelectorAll('.stat-card');
                if (cards[1]) cards[1].style.display = 'none';
                if (cards[2]) cards[2].style.display = 'none';
                
                const statLabels = document.querySelectorAll('.stat-label');
                if (statLabels[0]) statLabels[0].textContent = 'Total Pago (Ano)';
                
                document.getElementById('page-title').textContent = 'Meu Status de Mensalidade';
            } else {
                // Admin/Secretary Access
                if (navItems.people) navItems.people.style.display = isAdmin ? 'flex' : 'none';
                if (navItems.reports) navItems.reports.style.display = 'flex';
                if (navItems.authorizations) navItems.authorizations.style.display = 'flex';
                if (navItems.outflows) navItems.outflows.style.display = 'flex';
                
                // Logs ONLY for master
                if (navItems.logs) navItems.logs.style.display = isMaster ? 'flex' : 'none';

                document.getElementById('page-title').textContent = isAdmin ? 'Dashboard de Mensalidades' : 'Painel Administrativo';
            }

            initializeSidebar();
            initializeNotifications();

            // Restore active tab
            if (state.role === 'member' && (state.activeTab === 'people' || state.activeTab === 'reports')) {
                state.activeTab = 'dashboard';
            }
            if (state.role === 'secretário' && (state.activeTab === 'people' || state.activeTab === 'reports')) {
                state.activeTab = 'dashboard';
            }
            switchTab(state.activeTab);
            resetInactivityTimer(); // Start timer after auth verification
            loadInitialData();
        } catch (err) {
            console.error('Auth verification failed:', err);
            // Don't auto-logout on network errors or simple failures
            // Only logout if explicit 401/403 is received in apiFetch
        }
    }
}

// --- Data Fetching ---
async function loadInitialData() {
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
        
        // Buscar pagamentos de eventos e saídas também para compor o total do caixa
        if (state.role === 'admin' || state.role === 'secretário') {
            state.eventPayments = await apiFetch('/api/event-payments');
            state.outflows = await apiFetch('/api/outflows');
        } else {
            state.eventPayments = await apiFetch(`/api/event-payments?person_id=${state.personId}`);
            state.outflows = [];
        }

        renderDashboard();
        
        if (state.role === 'admin') {
            renderPeople();
            
            // Check for pending approvals - Transform into Central Modal
            const pendingPayments = state.payments.filter(p => p.status === 'pending');
            if (pendingPayments.length > 0) {
                setTimeout(() => {
                    if (state.role === 'admin') { 
                        const modal = document.getElementById('notification-modal');
                        const msgEl = document.getElementById('notif-modal-message');
                        if (modal && msgEl) {
                            msgEl.innerHTML = `Existem <strong>${pendingPayments.length}</strong> comprovante(s) aguardando sua aprovação no sistema.`;
                            modal.style.display = 'flex';
                        }
                    }
                }, 1500);
            }
        }
        
        updateDashboardStats();
        if (state.activeTab === 'events') fetchEventsData();
        if (state.activeTab === 'logs') fetchLogs();
    } catch (err) {
        console.error('Error loading data:', err);
    }
}


loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Acessando...';
        }
        
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
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Acessar Conta';
        }
    }
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('name');
    localStorage.removeItem('personId');
    window.location.reload();
}

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
function switchTab(target) {
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
    else if (target === 'authorizations') title.textContent = 'Autorizações de Saída';
    else if (target === 'outflows') title.textContent = 'Gestão de Despesas';
    else if (target === 'logs') title.textContent = 'Logs de Auditoria';

    // Refresh specific data if needed
    if (target === 'dashboard') renderDashboard();
    if (target === 'people') renderPeople();
    if (target === 'events') fetchEventsData();
    if (target === 'outflows') renderOutflows();
    if (target === 'logs') fetchLogs();
    if (target === 'reports') {
        populateReportSelects();
    }
    
    // Close mobile sidebar if open
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

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


// --- Logs Logic ---
const fetchLogs = async () => {
    try {
        const logs = await apiFetch('/api/admin/logs');
        state.allLogs = logs; // Store all logs for local filtering
        renderLogs();
    } catch (err) {
        console.error('Error fetching logs:', err);
    }
};

const renderLogs = () => {
    const body = document.getElementById('logs-body');
    if (!body || !state.allLogs) return;

    let filteredLogs = state.allLogs;
    if (state.logFilter === 'login') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('LOGIN'));
    } else if (state.logFilter === 'info') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('PAYMENT') || l.action.includes('PERSON'));
    } else if (state.logFilter === 'network') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('NETWORK') || l.action.includes('PROTOCOL') || l.action.includes('SYSTEM'));
    }

    if (filteredLogs.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhum log encontrado para esta categoria.</td></tr>';
        return;
    }

    body.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.created_at).toLocaleString('pt-BR');
        const details = JSON.stringify(log.details, null, 2);
        
        let actionClass = 'log-action-info';
        if (log.action.includes('FAILED') || log.action.includes('DELETE')) actionClass = 'log-action-danger';
        if (log.action.includes('SUCCESS') || log.action.includes('CREATE') || log.action.includes('APPROVE')) actionClass = 'log-action-success';

        return `
            <tr class="animate-fade-in">
                <td><small>${date}</small></td>
                <td><strong>${log.username}</strong></td>
                <td><span class="log-badge ${actionClass}">${log.action}</span></td>
                <td>
                    <div style="font-size: 0.85rem;">IP: ${log.ip_address}</div>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">${log.os} | ${log.browser}</div>
                </td>
                <td>
                    <button class="btn-text btn-small" onclick="showLogDetails(\`${details.replace(/"/g, '&quot;')}\`)">Ver Detalhes</button>
                </td>
            </tr>
        `;
    }).join('');
};

window.showLogDetails = (details) => {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 40px; height: 40px; fill: var(--accent-color);"><path d="M80 480L80 224L560 224L560 480C560 488.8 552.8 496 544 496L352 496C352 451.8 316.2 416 272 416L208 416C163.8 416 128 451.8 128 496L96 496C87.2 496 80 488.8 80 480zM96 96C60.7 96 32 124.7 32 160L32 480C32 515.3 60.7 544 96 544L544 544C579.3 544 608 515.3 608 480L608 160C608 124.7 579.3 96 544 96L96 96zM240 376C270.9 376 296 350.9 296 320C296 289.1 270.9 264 240 264C209.1 264 184 289.1 184 320C184 350.9 209.1 376 240 376zM408 272C394.7 272 384 282.7 384 296C384 309.3 394.7 320 408 320L488 320C501.3 320 512 309.3 512 296C512 282.7 501.3 272 488 272L408 272zM408 368C394.7 368 384 378.7 384 392C384 405.3 394.7 416 408 416L488 416C501.3 416 512 405.3 512 392C512 378.7 501.3 368 488 368L408 368z"/></svg>`;
    showAlert(`<pre style="text-align: left; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 4px; font-family: monospace; font-size: 0.8rem; overflow-x: auto;">${details}</pre>`, 'Detalhes da Ação', svgIcon);
};

const refreshLogsBtn = document.getElementById('refresh-logs-btn');
if (refreshLogsBtn) refreshLogsBtn.onclick = fetchLogs;

// Initialize Log Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.logFilter = btn.dataset.filter;
        renderLogs();
    };
});

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
                
                <div class="event-stats-mini" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    <span style="background: rgba(229, 9, 20, 0.1); color: var(--accent-color); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                        ${event.total_participants || 0} Inscritos
                    </span>
                    ${Object.entries(event.unit_counts || {}).map(([unit, count]) => `
                        <span style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-dim); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">
                            ${unit}: ${count}
                        </span>
                    `).join('')}
                </div>

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

const openEventDetail = async (eventId, preserveUI = false) => {
    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        state.currentEvent = data.event;
        state.currentEventParticipants = data.participants;
        state.currentEventPayments = data.payments;
        
        if (!preserveUI) {
            document.getElementById('events-master-view').style.display = 'none';
            document.getElementById('events-detail-view').style.display = 'block';
            
            // Toggle button visibility
            if (state.role === 'admin' || state.role === 'secretário') {
                document.getElementById('add-event-btn').style.display = 'none';
                document.getElementById('add-participants-btn').style.display = 'block';
            }

            // Reset details toggle (apenas na abertura inicial)
            document.getElementById('event-details-table-container').style.display = 'none';
            document.getElementById('toggle-event-details').textContent = 'Ver Detalhamento Membro a Membro ↓';
            
            // Limpar busca anterior ao abrir novo evento
            const evSearch = document.getElementById('ev-detail-search');
            if (evSearch) evSearch.value = '';
        }

        document.getElementById('detail-event-title').textContent = data.event.name;
        
        // Ajustar cabeçalho da tabela conforme o tipo de pagamento
        const tableHead = document.querySelector('#event-detail-table thead');
        if (data.event.payment_type === 'unico') {
            tableHead.innerHTML = `
                <tr>
                    <th>Membro</th>
                    <th style="text-align: center;">Status de Pagamento</th>
                    <th>Total Pago</th>
                </tr>
            `;
        } else {
            tableHead.innerHTML = `
                <tr>
                    <th>Membro</th>
                    <th>Jan</th><th>Fev</th><th>Mar</th><th>Abr</th><th>Mai</th><th>Jun</th>
                    <th>Jul</th><th>Ago</th><th>Set</th><th>Out</th><th>Nov</th><th>Dez</th>
                    <th>Total</th>
                </tr>
            `;
        }

        renderEventDashboard(data.participants, data.payments);
        renderEventDetailGrid(data.participants, data.payments);
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

let renderEventDetailGrid = (participants, payments) => {
    const body = document.getElementById('event-detail-body');
    const searchTerm = document.getElementById('ev-detail-search')?.value.toLowerCase() || '';
    
    const filteredParticipants = participants.filter(p => p.name.toLowerCase().includes(searchTerm));
    const isUnico = state.currentEvent.payment_type === 'unico';

    // O(n) optimization: Group payments by person_id
    const paymentsMap = new Map();
    payments.forEach(pay => {
        const key = pay.person_id;
        if (!paymentsMap.has(key)) paymentsMap.set(key, []);
        paymentsMap.get(key).push(pay);
    });

    // To avoid JSON.stringify in loops, we'll store payments in a temporary window object
    window._tempEventPayments = payments;

    let html = '';
    filteredParticipants.forEach(p => {
        const personPayments = paymentsMap.get(p.id) || [];
        let rowHtml = `<td><strong>${p.name}</strong> <br> <small>${p.unit || '-'}</small></td>`;
        let totalPaid = 0;

        if (isUnico) {
            const approvedPayments = personPayments.filter(pay => pay.status === 'approved');
            totalPaid = approvedPayments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
            
            const displayPayment = personPayments.find(pay => pay.receipt_content || pay.receipt_path) || personPayments[personPayments.length - 1];

            if (displayPayment) {
                const statusLabel = displayPayment.status === 'approved' ? 'PAGO' : displayPayment.status === 'pending' ? 'PENDENTE' : 'RECUSADO';
                const payIndex = payments.indexOf(displayPayment);
                rowHtml += `
                    <td class="clickable-cell" style="text-align: center;" onclick="openEventPaymentModalFromGridIndex(${p.id}, null, ${payIndex})">
                        <span class="grid-status-label status-${displayPayment.status}">${statusLabel}</span>
                    </td>
                `;
            } else {
                rowHtml += `
                    <td class="clickable-cell" style="text-align: center;" onclick="openEventPaymentModalFromGridIndex(${p.id}, null)">
                        <span class="grid-status-label status-none">PENDENTE</span>
                    </td>
                `;
            }
        } else {
            // Pre-index by month for O(1) month lookup
            const monthMap = new Map();
            personPayments.forEach(pay => {
                if (pay.year === state.eventDetailYear) monthMap.set(pay.month, pay);
            });

            for (let m = 1; m <= 12; m++) {
                const payment = monthMap.get(m);
                if (payment) {
                    const statusLabel = payment.status === 'approved' ? 'PAGO' : payment.status === 'pending' ? 'PENDENTE' : 'RECUSADO';
                    if (payment.status === 'approved') totalPaid += parseFloat(payment.amount);
                    const payIndex = payments.indexOf(payment);
                    rowHtml += `
                        <td class="clickable-cell" onclick="openEventPaymentModalFromGridIndex(${p.id}, ${m}, ${payIndex})">
                            <span class="grid-status-label status-${payment.status}">${statusLabel}</span>
                        </td>
                    `;
                } else {
                    rowHtml += `
                        <td class="clickable-cell" onclick="openEventPaymentModalFromGridIndex(${p.id}, ${m})">
                            <span class="grid-status-label status-none">PENDENTE</span>
                        </td>
                    `;
                }
            }
        }
        
        rowHtml += `<td class="total-column">R$ ${totalPaid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
        html += `<tr>${rowHtml}</tr>`;
    });

    body.innerHTML = html || `<tr><td colspan="${isUnico ? 3 : 14}" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum participante encontrado.</td></tr>`;
};

// New helper to avoid JSON.stringify in HTML attributes
window.openEventPaymentModalFromGridIndex = (personId, month, paymentIndex = -1) => {
    const payment = paymentIndex >= 0 ? window._tempEventPayments[paymentIndex] : null;
    openEventPaymentModalFromGrid(personId, month, payment);
};

const openEventPaymentModalFromGrid = (personId, month, payment = null) => {
    // Only allow members to pay for themselves, or admins/secretaries to pay for anyone
    if (state.role !== 'admin' && state.role !== 'secretário' && parseInt(personId) !== parseInt(state.personId)) return;

    document.getElementById('ep-event-id').value = state.currentEvent.id;
    document.getElementById('ep-event-name').textContent = state.currentEvent.name;
    document.getElementById('ep-month').value = month || "";
    document.getElementById('ep-year').value = month ? state.eventDetailYear : "";
    
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
        openEventDetail(state.currentEvent.id, true);
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

    // Reset e Ajuste por tipo de evento
    const dateSelection = document.getElementById('ep-date-selection');
    if (state.currentEvent && state.currentEvent.payment_type === 'unico') {
        dateSelection.style.display = 'none';
    } else {
        dateSelection.style.display = 'flex';
    }

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
            
            // Administrador/Secretário actions for pending payments
            if (state.role === 'admin' || state.role === 'secretário') {
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
            if (activeEventId) openEventDetail(parseInt(activeEventId), true);
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
        if (state.currentEvent) openEventDetail(state.currentEvent.id, true);
        else fetchEventsData();
    } catch (err) { showStatus(err.message, 'error'); }
};

const rejectEventPayment = async (id, reason) => {
    try {
        await apiFetch(`/api/event-payments/${id}/reject`, { 
            method: 'POST',
            body: JSON.stringify({ reason })
        });
        eventPaymentModal.style.display = 'none';
        if (state.currentEvent) openEventDetail(state.currentEvent.id, true);
        else fetchEventsData();
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
    let eventosTotal = 0;
    let outrosTotal = 0;
    
    const monthlyData = new Array(12).fill(0);
    
    // Somar Mensalidades
    state.payments.forEach(p => {
        if (p.status !== 'approved') return;
        
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

    // Somar Eventos ao Caixa e distribuir por Unidade
    if (state.eventPayments) {
        state.eventPayments.forEach(p => {
            if (p.status !== 'approved') return;
            const amount = parseFloat(p.amount);
            totalCash += amount;
            eventosTotal += amount;
            
            // Distribuir o valor do evento para a unidade correspondente do membro
            const person = state.people.find(pers => pers.id === p.person_id);
            const unit = (person?.unit || '').toUpperCase();

            if (unit.includes('DIREÇÃO') || unit.includes('DIRECAO')) {
                direcaoTotal += amount;
            } else if (unit.includes('DESBRAVADOR')) {
                desbravadoresTotal += amount;
            } else {
                outrosTotal += amount;
            }

            // Se tiver mês definido no pagamento do evento, soma ao gráfico mensal
            if (p.month) {
                monthlyData[p.month - 1] += amount;
            }
        });
    }

    // Subtrair Saídas (Outflows) do Caixa Geral
    let totalOutflows = 0;
    if (state.outflows) {
        state.outflows.forEach(out => {
            const amount = parseFloat(out.amount);
            totalOutflows += amount;
            totalCash -= amount; // Subtrai do total em caixa
        });
    }

    if (state.role === 'admin' || state.role === 'secretário') {
        document.getElementById('stat-total-cash').textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        const direcaoStat = document.getElementById('stat-direcao');
        const desbravaStat = document.getElementById('stat-desbravadores');
        const eventosStat = document.getElementById('stat-eventos');
        const outflowsCard = document.getElementById('stat-outflows-card');
        const outflowsTotalElem = document.getElementById('stat-total-outflows');
        
        if (direcaoStat) direcaoStat.textContent = `R$ ${direcaoTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (desbravaStat) desbravaStat.textContent = `R$ ${desbravadoresTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (eventosStat) eventosStat.textContent = `R$ ${eventosTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        if (outflowsCard && outflowsTotalElem) {
            outflowsCard.style.display = 'block';
            outflowsTotalElem.textContent = `R$ ${totalOutflows.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        }
        
        // Para o gráfico de pizza, queremos o total puro de mensalidades (sem eventos)
        let mensalidadesPuro = 0;
        state.payments.forEach(p => {
            if (p.status === 'approved') mensalidadesPuro += parseFloat(p.amount);
        });

        // Gráfico simplificado: Mensalidades vs Eventos vs Despesas
        renderPieChart(
            ['Mensalidades', 'Eventos', 'Despesas'], 
            [mensalidadesPuro, eventosTotal, totalOutflows],
            ['#e50914', '#111111', '#8b0000'] 
        );
    } else {
        const paidMonths = state.payments.length;
        const pendingMonths = 12 - paidMonths;
        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        renderPieChart(['Meses Pagos', 'Pendentes'], [paidMonths, pendingMonths], ['#e50914', '#111111']);
    }
    
    renderBarChart(monthlyData);
};

const renderEventDashboard = (participants, payments) => {
    let evTotal = 0;
    let evDirecao = 0;
    let evDesbrava = 0;
    let evOutros = 0;
    const evMonthlyData = new Array(12).fill(0);

    // O(n) optimization: Map participants by ID
    const participantsMap = new Map();
    participants.forEach(p => participantsMap.set(p.id, p));

    payments.forEach(p => {
        if (p.status !== 'approved') return;
        const amount = parseFloat(p.amount);
        evTotal += amount;
        if (p.month) evMonthlyData[p.month - 1] += amount;

        const person = participantsMap.get(p.person_id);
        const unit = (person?.unit || '').toUpperCase();

        if (unit.includes('DIREÇÃO') || unit.includes('DIRECAO')) {
            evDirecao += amount;
        } else if (unit.includes('DESBRAVADOR')) {
            evDesbrava += amount;
        } else {
            evOutros += amount;
        }
    });

    document.getElementById('ev-stat-total').textContent = `R$ ${evTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('ev-stat-direcao').textContent = `R$ ${evDirecao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('ev-stat-desbrava').textContent = `R$ ${evDesbrava.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    renderPieChart(
        ['Direção', 'Desbravadores', 'Outros'],
        [evDirecao, evDesbrava, evOutros],
        ['#e50914', '#111111', '#707070'],
        'evPieChart',
        'evPie'
    );

    renderBarChart(evMonthlyData, 'evBarChart', 'evBar');
};

const renderMensalidadeDashboard = () => {
    let mTotal = 0;
    let mDirecao = 0;
    let mDesbrava = 0;
    let mOutros = 0;
    const mMonthlyData = new Array(12).fill(0);

    // O(n) optimization: Map people by ID
    const peopleMap = new Map();
    state.people.forEach(p => peopleMap.set(p.id, p));

    state.payments.forEach(p => {
        if (p.status !== 'approved') return;
        const amount = parseFloat(p.amount);
        mTotal += amount;
        mMonthlyData[p.month - 1] += amount;

        const person = peopleMap.get(p.person_id);
        const unit = (person?.unit || '').toUpperCase();

        if (unit.includes('DIREÇÃO') || unit.includes('DIRECAO')) {
            mDirecao += amount;
        } else if (unit.includes('DESBRAVADOR')) {
            mDesbrava += amount;
        } else {
            mOutros += amount;
        }
    });

    document.getElementById('mens-stat-total').textContent = `R$ ${mTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('mens-stat-direcao').textContent = `R$ ${mDirecao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('mens-stat-desbrava').textContent = `R$ ${mDesbrava.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    // Gráfico de Pizza de Mensalidades (Direção vs Desbravadores vs Outros)
    renderPieChart(
        ['Direção', 'Desbravadores', 'Outros'],
        [mDirecao, mDesbrava, mOutros],
        ['#e50914', '#111111', '#707070'],
        'mensPieChart',
        'mensPie'
    );

    // Gráfico de Barras de Mensalidades
    renderBarChart(mMonthlyData, 'mensBarChart', 'mensBar');
};

const renderPieChart = (labels, data, colors = ['#e50914', '#1a1a1a', '#e8e6df'], canvasId = 'pieChart', stateKey = 'pie') => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (state.charts[stateKey]) state.charts[stateKey].destroy();
    
    state.charts[stateKey] = new Chart(ctx, {
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

const renderBarChart = (monthlyData, canvasId = 'barChart', stateKey = 'bar') => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (state.charts[stateKey]) state.charts[stateKey].destroy();
    
    state.charts[stateKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthsShort,
            datasets: [{
                label: 'Receita (R$)',
                data: monthlyData,
                backgroundColor: '#e50914', // Vermelho para as barras
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

const renderOutflows = () => {
    const body = document.getElementById('outflows-body');
    if (!body) return;

    if (state.outflows.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    body.innerHTML = state.outflows.map(out => {
        const date = formatDate(out.date);
        const amount = parseFloat(out.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        let receiptHtml = '-';
        if (out.receipt_path) {
            const filename = out.receipt_path.split(/[\\/]/).pop();
            receiptHtml = `<a href="/api/files/receipt/${filename}?token=${state.token}" target="_blank" class="btn-text btn-small">Ver Recibo</a>`;
        }

        return `
            <tr>
                <td>${date}</td>
                <td><span class="unit-tag" style="background: rgba(229, 9, 20, 0.1); color: var(--outflow-color);">${out.category}</span></td>
                <td style="color: var(--error-color); font-weight: 600;">- ${amount}</td>
                <td>${receiptHtml}</td>
                <td>
                    <button class="btn-text btn-small" onclick="deleteOutflow(${out.id})">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
};

window.deleteOutflow = async (id) => {
    if (await showConfirm('Tem certeza que deseja excluir esta despesa?')) {
        try {
            await apiFetch(`/api/outflows/${id}`, { method: 'DELETE' });
            await loadInitialData();
            if (state.activeTab === 'outflows') renderOutflows();
        } catch (err) {
            showStatus(err.message, 'error');
        }
    }
};

const outflowForm = document.getElementById('outflow-form');
if (outflowForm) {
    outflowForm.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('amount', document.getElementById('out-amount').value);
        formData.append('category', document.getElementById('out-category').value);
        formData.append('date', document.getElementById('out-date').value);
        formData.append('description', document.getElementById('out-desc').value);
        
        const file = document.getElementById('out-receipt').files[0];
        if (file) formData.append('receipt', file);

        try {
            const res = await fetch('/api/outflows', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            if (res.ok) {
                showStatus('Despesa registrada com sucesso!', 'success');
                e.target.reset();
                await loadInitialData();
                renderOutflows();
            } else {
                const data = await res.json();
                showStatus(data.error, 'error');
            }
        } catch (err) {
            showStatus('Erro ao salvar despesa', 'error');
        }
    };
}

// --- Rendering ---

let renderDashboard = () => {
    paymentsBody.innerHTML = '';
    const footer = document.getElementById('payments-footer');
    footer.innerHTML = '';
    
    // Atualizar Dashboard de Mensalidades
    renderMensalidadeDashboard();
    
    const searchTerm = document.getElementById('mens-search')?.value.toLowerCase() || '';
    const filteredPeople = state.people.filter(p => p.name.toLowerCase().includes(searchTerm));
    
    const monthlyTotals = new Array(12).fill(0);
    let grandTotal = 0;

    // O(n) optimization: Group payments by person_id and month
    const paymentsMap = new Map();
    state.payments.forEach(p => {
        const key = `${p.person_id}-${p.month}`;
        paymentsMap.set(key, p);
    });

    // Document fragment for better DOM performance
    const fragment = document.createDocumentFragment();

    filteredPeople.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${person.name}</strong></td>`;
        
        let personTotal = 0;

        for (let m = 1; m <= 12; m++) {
            const payment = paymentsMap.get(`${person.id}-${m}`);
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

        const totalTd = document.createElement('td');
        totalTd.className = 'total-column';
        totalTd.textContent = `R$ ${personTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        tr.appendChild(totalTd);

        fragment.appendChild(tr);
    });

    paymentsBody.appendChild(fragment);

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

let renderPeople = () => {
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

// Add listeners to search inputs
document.addEventListener('input', (e) => {
    if (e.target.id === 'global-search') {
        renderPeople();
    } else if (e.target.id === 'mens-search') {
        renderDashboard();
    } else if (e.target.id === 'ev-detail-search') {
        if (state.currentEventParticipants && state.currentEventPayments) {
            renderEventDetailGrid(state.currentEventParticipants, state.currentEventPayments);
        }
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

    // Multi-month Reset & Setup
    const multiToggle = document.getElementById('p-multi-month-toggle');
    const multiSelector = document.getElementById('p-multi-month-selector');
    const singleInfo = document.getElementById('p-single-month-info');
    const multiWrapper = multiToggle.parentElement.parentElement;
    
    multiToggle.checked = false;
    multiSelector.style.display = 'none';
    singleInfo.style.display = 'block';
    multiWrapper.style.display = 'block'; // Always show toggle

    document.querySelectorAll('#p-months-grid input').forEach(i => i.checked = false);
    document.querySelectorAll('.month-grid-item').forEach(item => item.classList.remove('selected'));

    if (payment) {
        title.textContent = 'Gerenciar Pagamento';
        amountInput.value = payment.amount;

        // Pre-select current month in the grid for easier multi-month conversion
        const gridInputs = document.querySelectorAll('#p-months-grid input');
        gridInputs.forEach(inp => {
            if (parseInt(inp.value) === parseInt(month)) {
                inp.checked = true;
                inp.parentElement.classList.add('selected');
            }
        });
        
        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            // Handle both Windows (\) and Linux (/) separators
            const filename = payment.receipt_path.split(/[\\/]/).pop();
            const securePath = `/api/files/receipt/${filename}?token=${localStorage.getItem('token')}`;
            document.getElementById('view-receipt-btn').href = securePath;
        }

        if (state.role === 'admin' || state.role === 'secretário') {
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
        
        // Show multi-month toggle for new payments
        multiToggle.parentElement.parentElement.style.display = 'block';
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
        // Only the master 'ADMINISTRADOR' can see the delete button
        deleteBtn.style.display = (state.username && state.username.toUpperCase() === 'ADMINISTRADOR') ? 'block' : 'none';
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
    const isMulti = document.getElementById('p-multi-month-toggle').checked;
    const selectedMonths = Array.from(document.querySelectorAll('#p-months-grid input:checked')).map(cb => cb.value);

    if (isMulti && selectedMonths.length === 0) {
        document.getElementById('payment-error').textContent = 'Selecione pelo menos um mês.';
        return;
    }

    const formData = new FormData();
    formData.append('person_id', document.getElementById('p-person-id').value);
    
    if (isMulti) {
        formData.append('months', JSON.stringify(selectedMonths));
    } else {
        formData.append('month', document.getElementById('p-month').value);
    }

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
        payment_type: document.getElementById('event-payment-type').value,
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
            if (state.currentEvent) openEventDetail(state.currentEvent.id, true);
            else fetchEventsData();
        } else {
            const data = await res.json();
            showStatus(data.error, 'error');
        }
    } catch (err) { showStatus('Erro ao salvar pagamento', 'error'); }
};

// --- Initialization ---
const pCpf = document.getElementById('p-cpf');
if (pCpf) {
    pCpf.addEventListener('input', (e) => {
        e.target.value = formatCPF(e.target.value);
    });
}

const pBirth = document.getElementById('p-birth');
if (pBirth) {
    pBirth.addEventListener('change', (e) => {
        const birthDate = e.target.value;
        const age = calculateAge(birthDate);
        const ageField = document.getElementById('p-age');
        const unitField = document.getElementById('p-unit');

        if (ageField) ageField.value = age;
        
        if (unitField && age !== '') {
            if (age < 16) {
                unitField.value = 'DESBRAVADOR';
            } else {
                unitField.value = 'DIREÇÃO';
            }
        }
    });
}


yearSelect.addEventListener('change', (e) => {
    state.currentYear = e.target.value;
    loadInitialData();
});


    // Event Details Toggle
    const toggleBtn = document.getElementById('toggle-event-details');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const container = document.getElementById('event-details-table-container');
            if (container.style.display === 'none') {
                container.style.display = 'block';
                toggleBtn.textContent = 'Ocultar Detalhamento ↑';
            } else {
                container.style.display = 'none';
                toggleBtn.textContent = 'Ver Detalhamento Membro a Membro ↓';
            }
            initStickyScrollbars(); // Refresh scrollbars when table appears
        };
    }

    // Mensalidade Details Toggle
    const toggleMensBtn = document.getElementById('toggle-mens-details');
    if (toggleMensBtn) {
        toggleMensBtn.onclick = () => {
            const container = document.getElementById('mens-details-table-container');
            if (container.style.display === 'none') {
                container.style.display = 'block';
                toggleMensBtn.textContent = 'Ocultar Detalhamento ↑';
            } else {
                container.style.display = 'none';
                toggleMensBtn.textContent = 'Ver Detalhamento Membro a Membro ↓';
            }
            initStickyScrollbars(); // Refresh scrollbars when table appears
        };
    }
    const addPartBtn = document.getElementById('add-participants-btn');
    if (addPartBtn) addPartBtn.onclick = openAddParticipantsModal;
    
    const saveNewPartBtn = document.getElementById('save-new-participants-btn');
    if (saveNewPartBtn) saveNewPartBtn.onclick = saveNewParticipants;

    // Search listeners - Garantindo funcionamento imediato e robusto
    const initSearchListeners = () => {
        const mensSearch = document.getElementById('mens-search');
        if (mensSearch) {
            mensSearch.addEventListener('input', () => {
                const container = document.getElementById('mens-details-table-container');
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    document.getElementById('toggle-mens-details').textContent = 'Ocultar Detalhamento ↑';
                }
                renderDashboard();
            });
        }

        const evDetailSearch = document.getElementById('ev-detail-search');
        if (evDetailSearch) {
            evDetailSearch.addEventListener('input', () => {
                const container = document.getElementById('event-details-table-container');
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    document.getElementById('toggle-event-details').textContent = 'Ocultar Detalhamento ↑';
                }
                if (state.currentEventParticipants && state.currentEventPayments) {
                    renderEventDetailGrid(state.currentEventParticipants, state.currentEventPayments);
                }
            });
        }
    };

    // Inicialização imediata e via evento para segurança total
    initSearchListeners();
    document.addEventListener('DOMContentLoaded', initSearchListeners);
    
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



// --- Report Generation Functions ---




// --- Sticky Horizontal Scrollbar Logic ---
const initStickyScrollbars = () => {
    // Incluindo .list-container para a aba de Membros
    const containers = document.querySelectorAll('.table-container, .list-container');
    
    containers.forEach(container => {
        // Avoid double initialization
        if (container.dataset.hasStickyScroll) return;
        container.dataset.hasStickyScroll = "true";

        const floatingScroll = document.createElement('div');
        floatingScroll.className = 'floating-scrollbar-container';
        const style = document.createElement('style');
        style.textContent = `
            .floating-scrollbar-container::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 10px;
            }
        `;
        document.head.appendChild(style);

        const content = document.createElement('div');
        content.className = 'floating-scrollbar-content';
        floatingScroll.appendChild(content);
        document.body.appendChild(floatingScroll);

        const updateSize = () => {
            const table = container.querySelector('table');
            if (table) {
                content.style.width = table.offsetWidth + 'px';
                floatingScroll.style.width = container.offsetWidth + 'px';
                floatingScroll.style.left = container.getBoundingClientRect().left + 'px';
            }
        };

        const syncScroll = () => {
            if (container.scrollLeft !== floatingScroll.scrollLeft) {
                container.scrollLeft = floatingScroll.scrollLeft;
            }
        };

        const syncContainerScroll = () => {
            if (floatingScroll.scrollLeft !== container.scrollLeft) {
                floatingScroll.scrollLeft = container.scrollLeft;
            }
        };

        floatingScroll.onscroll = syncScroll;
        container.onscroll = syncContainerScroll;

        // Intersection Observer to show/hide the floating scrollbar
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    checkVisibility();
                } else {
                    floatingScroll.style.display = 'none';
                }
            });
        }, { threshold: 0.1 });

        const checkVisibility = () => {
            const rect = container.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const mobileOffset = window.innerWidth <= 768 ? 75 : 10; // Margem de segurança
            
            // Show only if the container is overflowing and the bottom of the container is below the screen
            const isOverflowing = container.scrollWidth > container.clientWidth;
            
            // Se o fundo da tabela subir acima da linha de visão do rodapé, escondemos a barra flutuante
            const isBottomVisible = rect.bottom <= (windowHeight - mobileOffset);
            const isTopVisible = rect.top < windowHeight;

            if (isOverflowing && isTopVisible && !isBottomVisible) {
                floatingScroll.style.display = 'block';
                updateSize();
            } else {
                floatingScroll.style.display = 'none';
            }
        };

        observer.observe(container);
        window.addEventListener('scroll', checkVisibility);
        window.addEventListener('resize', updateSize);
        
        // Initial check
        setTimeout(checkVisibility, 500);
    });
};

// Call this whenever tables are rendered
const originalRenderDashboard = renderDashboard;
renderDashboard = (...args) => {
    originalRenderDashboard(...args);
    setTimeout(initStickyScrollbars, 100);
};

const originalRenderPeople = renderPeople;
renderPeople = (...args) => {
    originalRenderPeople(...args);
    setTimeout(initStickyScrollbars, 100);
};

const originalRenderEventDetailGrid = renderEventDetailGrid;
renderEventDetailGrid = (...args) => {
    originalRenderEventDetailGrid(...args);
    setTimeout(initStickyScrollbars, 100);
};

const originalRenderOutflows = renderOutflows;
renderOutflows = (...args) => {
    originalRenderOutflows(...args);
    setTimeout(initStickyScrollbars, 100);
};

// Also init on tab switch
const originalSwitchTab = switchTab;
switchTab = (target) => {
    originalSwitchTab(target);
    setTimeout(initStickyScrollbars, 200);
    if (target === 'pwa-install' && typeof updatePWAUI === 'function') {
        updatePWAUI();
    }
};

// Start initialization on window load for total stability
window.addEventListener('load', () => {
    if (localStorage.getItem('token')) {
        checkAuth();
    } else {
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
    }
});

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado!', reg))
            .catch(err => console.err('Erro ao registrar Service Worker:', err));
    });
}

// --- PWA Installation Logic ---
// PWA State Management
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
let deferredPrompt = null;
const pwaBanner = document.getElementById('pwa-install-banner');
const installBtn = document.getElementById('pwa-install-btn');
const closeBtn = document.getElementById('pwa-close-btn');

// Show immediately for iOS if not standalone
if (isIOS && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone && !sessionStorage.getItem('pwa-dismissed')) {
    setTimeout(showPWABanner, 2000); // Small delay for better UX
}

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevents Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    // Check if user has already dismissed it in this session
    const isDismissed = sessionStorage.getItem('pwa-dismissed');
    
    // Only show if not standalone AND not dismissed
    if (!isStandalone && !isDismissed) {
        showPWABanner();
    }
});

function showPWABanner() {
    if (pwaBanner) {
        pwaBanner.style.display = 'block';
        
        // If it's iOS, change button text and behavior
        if (isIOS) {
            installBtn.textContent = 'Como Instalar';
            const pwaTextSpan = pwaBanner.querySelector('.pwa-text span');
            if (pwaTextSpan) pwaTextSpan.textContent = 'Toque em compartilhar e "Adicionar à Tela de Início".';
        }
    }
}

if (installBtn) {
    installBtn.onclick = async () => {
        if (isIOS) {
            showAlert('Para instalar no iPhone:<br><br>1. Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta)<br>2. Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>', 'Instalação no iOS', '📱');
            return;
        }

        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            pwaBanner.style.display = 'none';
        } else {
            // Fallback for when button is clicked but prompt isn't ready
            showAlert('O navegador ainda está preparando a instalação. Por favor, aguarde alguns segundos e tente novamente, ou use o menu do navegador e selecione "Instalar Aplicativo".', 'Quase pronto');
        }
    };
}

if (closeBtn) {
    closeBtn.onclick = () => {
        pwaBanner.style.display = 'none';
        sessionStorage.setItem('pwa-dismissed', 'true');
    };
}

// Initial check for standalone mode
const menuInstallBtn = document.getElementById('menu-install-btn');
const pwaInstallCard = document.getElementById('pwa-install-card');
const androidSection = document.getElementById('android-install-section');
const iosSection = document.getElementById('ios-install-section');
const installedSection = document.getElementById('already-installed-section');
const mainInstallBtn = document.getElementById('pwa-main-install-btn');

console.log('PWA Status:', { isStandalone, isIOS });

const updatePWAUI = () => {
    const isMobile = window.innerWidth <= 768;
    // isStandalone is now global
    const pwaInstallPage = document.getElementById('pwa-install-page');
    const isPageActive = pwaInstallPage && pwaInstallPage.style.display === 'block';

    if (isStandalone) {
        if (pwaBanner) pwaBanner.style.display = 'none';
        if (menuInstallBtn) menuInstallBtn.style.display = 'none';
        if (pwaInstallCard) pwaInstallCard.style.display = 'none';
        
        if (isPageActive) {
            if (installedSection) installedSection.style.display = 'block';
            if (androidSection) androidSection.style.display = 'none';
            if (iosSection) iosSection.style.display = 'none';
        }
    } else {
        // Handle Banner/Menu Visibility
        if (isMobile) {
            if (menuInstallBtn) menuInstallBtn.style.setProperty('display', 'flex', 'important');
            if (pwaInstallCard) pwaInstallCard.style.setProperty('display', 'flex', 'important');
        } else {
            if (menuInstallBtn) menuInstallBtn.style.display = 'none';
            if (pwaInstallCard) pwaInstallCard.style.display = 'none';
        }

        // Handle Page Content Visibility
        if (isPageActive) {
            if (isIOS) {
                if (iosSection) iosSection.style.display = 'block';
                if (androidSection) androidSection.style.display = 'none';
            } else {
                // No Android/Chrome, mostramos a seção sempre que não estiver instalado
                if (androidSection) androidSection.style.display = 'block';
                if (iosSection) iosSection.style.display = 'none';
            }
            if (installedSection) installedSection.style.display = 'none';
        }
    }
};

updatePWAUI();
window.addEventListener('resize', updatePWAUI);

const handleInstallClick = async (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const target = (e && e.currentTarget) ? e.currentTarget.getAttribute('data-target') : null;
    
    // Switch to PWA install page if clicked from menu or dashboard card
    if (target === 'pwa-install' || (e && e.currentTarget === pwaInstallCard)) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        if (menuInstallBtn) menuInstallBtn.classList.add('active');
        document.getElementById('page-title').textContent = 'Instalar Aplicativo';
        if (typeof updatePWAUI === 'function') updatePWAUI();
        return;
    }

    if (isStandalone) return;

    if (isIOS) {
        // Show instructions page
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        document.getElementById('page-title').textContent = 'Instalar no iOS';
        return;
    }

    if (!deferredPrompt) {
        // Show install page if prompt not ready
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice: ${outcome}`);
    deferredPrompt = null;
    updatePWAUI();
};

if (menuInstallBtn) menuInstallBtn.onclick = handleInstallClick;
if (pwaInstallCard) pwaInstallCard.onclick = handleInstallClick;
if (mainInstallBtn) mainInstallBtn.onclick = handleInstallClick;

// Multi-month logic and interactions (Robust Event Delegation)
const initMultiMonthListeners = () => {
    // Only handling toggle here as fallback, months are handled via window.selectMonth
    document.addEventListener('change', (e) => {
        if (e.target.id === 'p-multi-month-toggle') {
            window.toggleMultiMonth(e.target.checked);
        }
    });
};








// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiMonthListeners);
} else {
    initMultiMonthListeners();
}
