// --- Auxiliares de Armazenamento (LocalStorage/SessionStorage) ---
// Obtém um item do armazenamento, verificando primeiro o LocalStorage e depois o SessionStorage
const getStorageItem = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

// Define um item no armazenamento. Se 'persistent' for true, usa LocalStorage, senão usa SessionStorage
const setStorageItem = (key, value, persistent = true) => {
    if (persistent) localStorage.setItem(key, value); // Armazenamento permanente (mesmo fechando o navegador)
    else sessionStorage.setItem(key, value); // Armazenamento temporário (apenas nesta sessão/aba)
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

// Função global para alternar entre pagamento de mês único ou múltiplos meses no modal
window.toggleMultiMonth = (isChecked) => {
    const selector = document.getElementById('p-multi-month-selector'); // Container de múltiplos meses
    const singleInfo = document.getElementById('p-single-month-info');   // Informação de mês único
    if (selector) {
        selector.style.display = isChecked ? 'block' : 'none'; // Mostra se marcado, oculta se desmarcado
        if (isChecked) selector.classList.add('animate-slide-down'); // Adiciona animação de descida
    }
    if (singleInfo) singleInfo.style.display = isChecked ? 'none' : 'block'; // Oculta info única se marcado
};

// Nomes completos dos meses em português
const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Abreviações dos meses para uso em tabelas e gráficos
const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- Utilitários de Formatação ---
// Aplica máscara de CPF (000.000.000-00) enquanto o usuário digita
const formatCPF = (v) => {
    v = v.replace(/\D/g, ""); // Remove tudo o que não é dígito numérico
    if (v.length > 11) v = v.substring(0, 11); // Limita a 11 caracteres
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); // Coloca o primeiro ponto
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); // Coloca o segundo ponto
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2"); // Coloca o hífen
    return v; // Retorna o valor formatado
};

// Valida se o CPF é matematicamente válido (algoritmo oficial)
const isValidCPF = (cpf) => {
    if (!cpf) return true; // Campo opcional (se estiver vazio, é considerado válido aqui)
    const cleanCPF = cpf.replace(/\D/g, ''); // Remove caracteres não numéricos
    if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false; // Verifica tamanho e números repetidos

    // --- Continuação da Validação de CPF ---
    let sum = 0, rev;
    for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i); // Cálculo do primeiro dígito verificador
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i); // Cálculo do segundo dígito verificador
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(10))) return false;

    return true; // Retorna true se passar em todos os testes
};

// Calcula a idade de uma pessoa baseada na data de nascimento
const calculateAge = (birthDate) => {
    if (!birthDate) return ''; // Retorna vazio se não houver data
    const birth = new Date(birthDate); // Converte string para objeto Date
    const today = new Date(); // Data atual
    let age = today.getFullYear() - birth.getFullYear(); // Diferença de anos
    const m = today.getMonth() - birth.getMonth(); // Diferença de meses
    // Ajusta a idade se o aniversário ainda não ocorreu este ano
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age; // Retorna a idade final
};

// Formata uma data ISO (AAAA-MM-DD) para o padrão brasileiro (DD/MM/AAAA)
const formatDate = (dateString) => {
    if (!dateString) return '-'; // Retorna traço se não houver data
    
    // Remove a parte de hora se houver (YYYY-MM-DDTHH:mm:ss...)
    const cleanDate = dateString.split('T')[0];
    const parts = cleanDate.split('-'); // Divide por hífens
    
    if (parts.length !== 3) return dateString; // Se não estiver no padrão esperado, retorna o original
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Remonta no formato dia/mês/ano
};

// Exibe uma notificação flutuante (toast) na tela
const showStatus = (msg, type = 'info') => {
    const container = document.getElementById('toast-container'); // Container fixo na tela
    const toast = document.createElement('div'); // Cria o elemento da notificação
    toast.className = `toast ${type}`; // Define a classe (info, success, error)
    toast.innerHTML = `
        <span class="toast-msg">${msg}</span>
    `; // Define o texto da mensagem
    container.appendChild(toast); // Adiciona ao container

    // Remove a notificação após 4 segundos com efeito de fade
    setTimeout(() => {
        toast.classList.add('hiding'); // Inicia a animação de saída
        setTimeout(() => toast.remove(), 300); // Remove do DOM após a animação
    }, 4000);
};

// Exibe um modal de confirmação (Sim/Não) e retorna uma promessa
const showConfirm = (message, title = 'Confirmar Ação') => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal'); // Elemento do modal
        const titleEl = document.getElementById('confirm-title'); // Título do modal
        const messageEl = document.getElementById('confirm-message'); // Mensagem do modal
        const yesBtn = document.getElementById('confirm-yes'); // Botão "Sim"
        const noBtn = document.getElementById('confirm-no'); // Botão "Não"

        titleEl.textContent = title; // Define o título
        messageEl.textContent = message; // Define a mensagem
        modal.style.display = 'flex'; // Exibe o modal centralizado

        // Função interna para limpar eventos e resolver a promessa
        const handleResponse = (result) => {
            modal.style.display = 'none'; // Esconde o modal
            yesBtn.onclick = null; // Limpa o evento de clique
            noBtn.onclick = null; // Limpa o evento de clique
            resolve(result); // Retorna true ou false
        };

        yesBtn.onclick = () => handleResponse(true); // Clicou Sim
        noBtn.onclick = () => handleResponse(false); // Clicou Não
    });
};

// Exibe um alerta informativo ou de erro com ícone personalizado
async function showAlert(message, title = 'Aviso', icon = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal'); // Elemento do modal de alerta
        const titleEl = document.getElementById('alert-title'); // Título
        const messageEl = document.getElementById('alert-message'); // Corpo da mensagem
        const iconEl = document.getElementById('alert-icon'); // Ícone
        const okBtn = document.getElementById('alert-ok'); // Botão de OK

        // SVG de sucesso (círculo com check)
        const successSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="60" height="60" fill="var(--accent-color)"><path d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/></svg>`;
        
        titleEl.textContent = title; // Define título
        messageEl.innerHTML = message; // Define mensagem (suporta HTML)
        
        // Ajusta cores e ícones conforme o tipo (Sucesso, Erro ou Geral)
        if (title === 'Sucesso') {
            iconEl.innerHTML = successSvg;
            titleEl.style.color = 'var(--accent-color)';
            okBtn.style.backgroundColor = 'var(--accent-color)';
        } else if (title === 'Erro') {
            iconEl.innerHTML = '❌';
            titleEl.style.color = 'var(--error-color)';
            okBtn.style.backgroundColor = 'var(--error-color)';
        } else {
            iconEl.innerHTML = icon;
            titleEl.style.color = 'var(--accent-color)';
            okBtn.style.backgroundColor = 'var(--accent-color)';
        }
        modal.style.display = 'flex'; // Mostra o modal

        okBtn.onclick = () => {
            modal.style.display = 'none'; // Esconde ao clicar OK
            resolve(); // Resolve a promessa
        };
    });
}

// --- Geradores de Relatórios e Autenticação (Escopo Global) ---
// Gera o relatório geral de arrecadação do ano
async function generateGeneralReport() {
    try {
        console.log('[REPORT] Gerando Relatório Geral...');
        const currentYear = parseInt(state.currentYear || new Date().getFullYear()); // Ano de referência
        const payments = state.payments || []; // Lista de pagamentos do estado
        const people = state.people || []; // Lista de pessoas
        
        // Filtra apenas pagamentos aprovados do ano selecionado
        const approvedPayments = payments.filter(p => p.status === 'approved' && p.year === currentYear);
        // Soma o total arrecadado
        const totalCash = approvedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        
        // Agrupa arrecadação por unidade
        const byUnit = {};
        people.forEach(p => {
            const unit = p.unit || 'Sem Unidade';
            if (!byUnit[unit]) byUnit[unit] = 0;
            const paid = approvedPayments
                .filter(pay => pay.person_id === p.id)
                .reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
            byUnit[unit] += paid;
        });

        // Monta o HTML do relatório
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
        const printable = document.getElementById('report-printable'); // Área de impressão no HTML
        const modal = document.getElementById('report-modal'); // Modal do relatório
        if (printable && modal) {
            printable.innerHTML = html; // Insere o relatório
            modal.style.display = 'flex'; // Exibe o modal
            showStatus('Relatório gerado! Use o botão Imprimir para salvar como PDF.', 'success');
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório: ' + err.message, 'error');
    }
}
// Expõe a função globalmente para ser chamada via HTML
window.generateGeneralReport = generateGeneralReport;

// Gera o relatório individual de um membro específico
async function generateMemberReport() {
    try {
        console.log('[REPORT] Gerando Relatório de Membro...');
        const memberId = document.getElementById('report-member-select').value; // Obtém o ID do membro selecionado no menu suspenso
        if (!memberId) return showStatus('Selecione um membro primeiro.', 'info'); // Verifica se um membro foi escolhido
        
        const people = state.people || []; // Lista de pessoas no estado global
        const member = people.find(p => p.id == memberId); // Procura o objeto do membro pelo ID
        if (!member) return showStatus('Membro não encontrado.', 'error'); // Caso não encontre, exibe erro

        const currentYear = parseInt(state.currentYear || new Date().getFullYear()); // Ano atual de referência
        // Filtra os pagamentos do estado global pertencentes a este membro e a este ano
        const payments = (state.payments || []).filter(p => p.person_id == memberId && p.year === currentYear);
        // Calcula o total pago somando apenas os registros com status 'approved'
        const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        // Constrói o HTML estruturado para o relatório individual do membro
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
                            // Para cada mês, verifica se existe um registro de pagamento
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
        const printable = document.getElementById('report-printable'); // Área onde o conteúdo será inserido
        const modal = document.getElementById('report-modal'); // Modal que será exibido
        if (printable && modal) {
            printable.innerHTML = html; // Insere o HTML gerado
            modal.style.display = 'flex'; // Exibe o modal
            showStatus('Extrato gerado!', 'success'); // Notifica sucesso
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório do membro.', 'error');
    }
}
window.generateMemberReport = generateMemberReport; // Torna a função acessível globalmente

// Gera relatório detalhado de arrecadação e participação de um evento específico
async function generateEventReport() {
    console.log('[REPORT] Gerando Relatório de Evento...');
    const eventId = document.getElementById('report-event-select').value; // ID do evento selecionado
    const filterType = document.getElementById('report-event-filter').value; // Tipo de filtro (por unidade ou lista completa)
    if (!eventId) return showStatus('Selecione um evento primeiro.', 'info');
    
    try {
        // Busca os detalhes completos do evento via API
        const data = await apiFetch(`/api/events/${eventId}/details`);
        const { event, participants, payments } = data; // Desestrutura a resposta
        
        // Calcula o total arrecadado no evento (apenas pagamentos aprovados)
        let totalArrecadado = (payments || []).filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        let contentHtml = '';
        
        // Se o filtro for por unidade, agrupa as estatísticas
        if (filterType === 'unit') {
            const byUnit = {};
            (participants || []).forEach(p => {
                const unit = p.unit || 'Sem Unidade';
                if (!byUnit[unit]) byUnit[unit] = { count: 0, paid: 0 };
                byUnit[unit].count++; // Conta participantes por unidade
                // Soma o que cada participante da unidade já pagou
                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                byUnit[unit].paid += amount;
            });
            // Gera tabela de resumo por unidade
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
            // Caso contrário, gera a lista detalhada de todos os participantes
            contentHtml = `
                <h3>Lista de Participantes</h3>
                <div class="report-table-wrapper">
                    <table class="report-table">
                        <thead>
                            <tr><th>Membro</th><th>Unidade</th><th>Status</th><th>Total Pago</th></tr>
                        </thead>
                        <tbody>
                            ${(participants || []).map(p => {
                                // Calcula quanto este membro específico já pagou para o evento
                                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                                return `<tr><td>${p.name}</td><td>${p.unit || '-'}</td><td>${amount > 0 ? 'PARTICIPANDO' : 'PENDENTE'}</td><td>R$ ${amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // HTML final do relatório de evento
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

// Gera documento de autorização de saída para eventos (para pais/responsáveis assinarem)
async function generateAuthDocument(type) {
    try {
        console.log(`[AUTH] Gerando Autorização (${type})...`);
        // Obtém os dados preenchidos no formulário de autorização
        const eventName = (document.getElementById('auth-event-name') || {}).value || '';
        const eventDate = (document.getElementById('auth-event-date') || {}).value || '';
        const eventLocation = (document.getElementById('auth-event-location') || {}).value || '';
        const departureLocation = (document.getElementById('auth-departure-location') || {}).value || '';
        const departureTime = (document.getElementById('auth-departure-time') || {}).value || '';
        const returnTime = (document.getElementById('auth-return-time') || {}).value || '';

        // Valida se todos os campos foram preenchidos
        if (!eventName || !eventDate || !eventLocation || !departureLocation || !departureTime || !returnTime) {
            return showStatus('Por favor, preencha todos os campos do formulário.', 'error');
        }

        const formattedDate = formatDate(eventDate); // Formata a data para padrão brasileiro
        const currentYear = new Date().getFullYear();
        // Função para converter a logo do clube para Base64 (necessário para impressão confiável em PDF)
        const getLogoBase64 = async () => {
            try {
                const response = await fetch('logo.png');
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { return 'logo.png'; } // Fallback caso falhe
        };

        const logoSrc = await getLogoBase64();

        // Estrutura do documento de autorização com campos em branco para preenchimento manual do pai
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

        // Se o tipo solicitado for PDF, apenas mostra no modal para impressão do navegador
        if (type === 'pdf') {
            const printable = document.getElementById('report-printable');
            const modal = document.getElementById('report-modal');
            if (printable && modal) {
                printable.innerHTML = htmlContent;
                modal.style.display = 'flex';
            }
        } else {
            // Se o tipo for DOC, gera um arquivo para download compatível com Microsoft Word
            const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>";
            const sourceHTML = header + htmlContent + "</body></html>";
            const blob = new Blob([sourceHTML], { type: 'application/vnd.ms-word' }); // Cria o arquivo binário (blob)
            const url = URL.createObjectURL(blob); // Cria uma URL temporária para o arquivo
            const link = document.createElement('a'); // Cria um link invisível para download
            link.href = url;
            link.download = 'Autorizacao_' + eventName.replace(/\s+/g, '_') + '.doc'; // Nome do arquivo
            document.body.appendChild(link);
            link.click(); // Simula o clique para baixar
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Limpa a memória
            showStatus('Documento Word (.doc) gerado com sucesso!', 'success');
        }
    } catch (err) {
        console.error('[AUTH] Erro:', err);
        showStatus('Erro ao gerar autorização.', 'error');
    }
}
window.generateAuthDocument = generateAuthDocument;

// Processa a escolha do tipo de relatório no modal seletor e chama a função correspondente
function confirmGenerateReport() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const selectorModal = document.getElementById('report-selector-modal');
    if (selectorModal) selectorModal.style.display = 'none'; // Fecha o seletor antes de gerar
    
    // Encaminha para a função correta baseado na escolha
    if (type === 'general') generateGeneralReport();
    else if (type === 'member') generateMemberReport();
    else if (type === 'event') generateEventReport();
}
window.confirmGenerateReport = confirmGenerateReport;

// Alterna a visibilidade dos campos adicionais no modal de relatório conforme o tipo selecionado
function toggleReportFields() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const memberField = document.getElementById('report-field-member'); // Campo de seleção de membro
    const eventFields = document.getElementById('report-fields-event'); // Campo de seleção de evento
    if (memberField) memberField.style.display = type === 'member' ? 'block' : 'none';
    if (eventFields) eventFields.style.display = type === 'event' ? 'block' : 'none';
}
window.toggleReportFields = toggleReportFields;

// Inicializa os ouvintes de eventos (listeners) para botões de relatórios e autorizações
const initGeneratorListeners = () => {
    console.log('[INIT] Inicializando listeners de relatórios e autorizações');
    
    const typeSelect = document.getElementById('report-type-select');
    if (typeSelect) typeSelect.onchange = toggleReportFields; // Monitora mudança no tipo de relatório

    // Botão para abrir o seletor de relatórios
    const openSelectorBtn = document.getElementById('open-report-selector-btn');
    if (openSelectorBtn) {
        openSelectorBtn.onclick = () => {
            const modal = document.getElementById('report-selector-modal');
            if (modal) {
                modal.style.display = 'flex';
                toggleReportFields(); // Garante que os campos corretos apareçam ao abrir
            }
        };
    }

    // Botão de confirmação dentro do seletor
    const confirmGenBtn = document.getElementById('confirm-generate-report-btn');
    if (confirmGenBtn) confirmGenBtn.onclick = confirmGenerateReport;

    // Botões específicos da aba de autorização (PDF e Word)
    const authPdfBtn = document.getElementById('generate-auth-pdf');
    if (authPdfBtn) authPdfBtn.onclick = () => generateAuthDocument('pdf');

    const authDocBtn = document.getElementById('generate-auth-doc');
    if (authDocBtn) authDocBtn.onclick = () => generateAuthDocument('doc');
};

// Garante que os listeners sejam carregados no momento certo (após o DOM estar pronto)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGeneratorListeners);
} else {
    initGeneratorListeners();
}
// Executa novamente após alguns segundos para garantir funcionamento em renderizações dinâmicas
setTimeout(initGeneratorListeners, 1000);
setTimeout(initGeneratorListeners, 3000);

// Configura o funcionamento dos botões de "olhinho" para mostrar/esconder senhas nos formulários
const initializePasswordToggles = () => {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            const targetId = button.getAttribute('data-target'); // Pega o ID do input alvo
            const input = document.getElementById(targetId);
            const openPath = button.querySelector('.eye-open'); // Ícone olho aberto
            const closedPath = button.querySelector('.eye-closed'); // Ícone olho fechado

            // Alterna o tipo do input entre 'password' (escondido) e 'text' (visível)
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

// Chama a inicialização dos botões de senha
initializePasswordToggles();

// --- Função Central de Requisições à API (Fetch Wrapper) ---
// Adiciona o token de autorização e trata erros de sessão automaticamente
async function apiFetch(url, options = {}) {
    const headers = {
        // Injeta o token JWT no cabeçalho Authorization
        'Authorization': `Bearer ${state.token || localStorage.getItem('token')}`,
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
    } catch (e) {
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
const reportSelectorModal = document.getElementById('report-selector-modal'); // Seletor de relatórios
const reportModal = document.getElementById('report-modal');           // Visualização do relatório pronto
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
    // Uso de delegação de eventos global no window para maior robustez (Abordagem Senior corrigida)
    window.addEventListener('click', (e) => {
        const trigger = e.target.closest('#notification-trigger'); // Botão do sino
        const dropdown = document.getElementById('notification-dropdown'); // Menu de notificações
        
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown) {
                const isActive = dropdown.classList.contains('active');
                
                // Alterna a visibilidade do dropdown
                dropdown.classList.toggle('active', !isActive);
                dropdown.style.display = !isActive ? 'block' : 'none'; // Fallback visual
                
                // Se estiver abrindo, busca as notificações mais recentes no servidor
                if (!isActive) fetchNotifications();
            }
            return;
        }

        // Fecha o menu de notificações se clicar em qualquer lugar fora dele
        if (dropdown && dropdown.classList.contains('active') && !e.target.closest('#notification-dropdown')) {
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
        loginSection.style.display = 'none';
        mainSection.style.display = 'none'; 
        if (splash) splash.style.display = 'flex';
        
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
            document.getElementById('user-name-display').textContent = status.name || 'Usuário';
            
            // Se for necessário trocar a senha (primeiro acesso), bloqueia o dashboard e abre o modal
            if (status.mustChangePassword) {
                loginSection.style.display = 'none';
                mainSection.style.display = 'none';
                if (splash) splash.classList.add('fade-out');
                document.getElementById('force-change-modal').style.display = 'flex';
                return;
            }

            // Tudo OK: Esconde login/splash e libera o Dashboard principal
            loginSection.style.display = 'none';
            mainSection.style.display = 'flex';
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(() => splash.style.display = 'none', 500);
            }
            
            // --- Lógica de Visibilidade de Abas baseada em Nível de Acesso (Roles) ---
            const isAdmin = state.role === 'admin';
            const isSecretary = state.role === 'secretário';
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
                logs: document.getElementById('nav-logs')
            };

            // Restrição para Usuários Comuns: Esconde abas administrativas
            if (!isAdmin && !isSecretary) {
                if (navItems.people) navItems.people.style.display = 'none';
                if (navItems.reports) navItems.reports.style.display = 'none';
                if (navItems.authorizations) navItems.authorizations.style.display = 'none';
                if (navItems.outflows) navItems.outflows.style.display = 'none';
                if (navItems.sales) navItems.sales.style.display = 'none';
                if (navItems.messages) navItems.messages.style.display = 'none';
                if (navItems.logs) navItems.logs.style.display = 'none';
                
                // Ajusta os cartões de estatísticas no Dashboard para membros comuns
                const cards = document.querySelectorAll('.stat-card');
                if (cards[1]) cards[1].style.display = 'none'; // Esconde caixa atual
                if (cards[2]) cards[2].style.display = 'none'; // Esconde inadimplência
                
                const statLabels = document.querySelectorAll('.stat-label');
                if (statLabels[0]) statLabels[0].textContent = 'Total Pago (Ano)';
                
                document.getElementById('page-title').textContent = 'Meu Status de Mensalidade';
            } else {
                // Acesso para Administradores e Secretários
                if (navItems.people) navItems.people.style.display = isAdmin ? 'flex' : 'none';
                if (navItems.reports) navItems.reports.style.display = 'flex';
                if (navItems.authorizations) navItems.authorizations.style.display = 'flex';
                if (navItems.outflows) navItems.outflows.style.display = 'flex';
                if (navItems.sales) navItems.sales.style.display = isAdmin ? 'flex' : 'none';
                if (navItems.messages) navItems.messages.style.display = 'flex';
                
                // Logs visíveis apenas para o usuário mestre (ADMINISTRADOR)
                if (navItems.logs) navItems.logs.style.display = isMaster ? 'flex' : 'none';

                document.getElementById('page-title').textContent = isAdmin ? 'Dashboard de Mensalidades' : 'Painel Administrativo';
            }

            // Garante que a sidebar reflita o estado salvo
            initializeSidebar();

            // Verificações de segurança para garantir que usuários não acessem abas proibidas via manipulação de estado
            if (state.activeTab === 'logs' && !isMaster) {
                state.activeTab = 'dashboard';
                setStorageItem('activeTab', 'dashboard', !!localStorage.getItem('token'));
            }
            
            // Bloqueia abas administrativas para membros comuns
            if (state.role === 'member' && (state.activeTab === 'people' || state.activeTab === 'reports' || state.activeTab === 'outflows' || state.activeTab === 'sales')) {
                state.activeTab = 'dashboard';
                setStorageItem('activeTab', 'dashboard', !!localStorage.getItem('token'));
            }

            // Inicia o cronômetro de inatividade após confirmar a autenticação
            resetInactivityTimer(); 
            // Carrega os dados iniciais do banco
            await loadInitialData();
            // Muda para a aba ativa (salva na sessão anterior)
            switchTab(state.activeTab, true);

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
        if (splash) splash.style.display = 'none';
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
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

        // Adiciona requisições extras apenas se for admin/secretário
        if (state.role === 'admin' || state.role === 'secretário') {
            promises.push(apiFetch('/api/event-payments')); // Pagamentos de eventos
            promises.push(apiFetch('/api/outflows')); // Saídas de caixa
            promises.push(apiFetch('/api/sales')); // Vendas (Cantina/Uniformes)
        } else {
            // Membro comum vê apenas seus próprios pagamentos de eventos
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
        
        if (state.role === 'admin' || state.role === 'secretário') {
            state.outflows = results[4] || [];
            state.sales = results[5] || [];
        } else {
            state.outflows = [];
            state.sales = [];
        }

        // Atualiza o nome exibido no topo para contas de membros comuns
        if (state.role !== 'admin' && state.people.length > 0) {
            const person = state.people[0];
            if (person) {
                document.getElementById('user-name-display').textContent = person.name;
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
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
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
            body: JSON.stringify({ username, password, force: e.detail && e.detail.force })
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
            const rememberMe = document.getElementById('remember-me').checked;

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
            
            document.getElementById('user-name-display').textContent = state.name;

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
        loginError.textContent = 'Erro ao conectar ao servidor';
    } finally {
        // Restaura o botão de login
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Acessar Conta';
        }
    }
});

// Trata casos onde o servidor retorna erro de autorização (401/403)
function handleUnauthorized(originUrl = '') {
    console.log(`[AUTH] Tratando acesso não autorizado: ${originUrl}`);
    
    // Remove o token para forçar re-autenticação
    removeStorageItem('token');
    state.token = null;
    
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
    state.activeTab = tabName;
    setStorageItem('activeTab', tabName, !!localStorage.getItem('token')); // Salva aba atual
    
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
    if (eventsActions && state.role === 'admin') {
        eventsActions.style.display = tabName === 'events' ? 'flex' : 'none';
    }

    // Atualiza o título dinâmico da página no topo
    const title = document.getElementById('page-title');
    if (tabName === 'dashboard') title.textContent = state.role === 'admin' ? 'Dashboard de Mensalidades' : 'Meu Status de Mensalidade';
    else if (tabName === 'people') title.textContent = 'Gerenciamento de Membros';
    else if (tabName === 'events') title.textContent = 'Gestão de Eventos';
    else if (tabName === 'reports') title.textContent = 'Relatórios do Sistema';
    else if (tabName === 'mensalidade') title.textContent = 'Controle de Mensalidades';
    else if (tabName === 'authorizations') title.textContent = 'Autorizações de Saída';
    else if (tabName === 'outflows') title.textContent = 'Gestão de Despesas';
    else if (tabName === 'sales') title.textContent = 'Gestão de Vendas';
    else if (tabName === 'logs') title.textContent = 'Logs de Auditoria';

    // Dispara o carregamento/renderização específico da aba que foi aberta
    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'people') renderPeople();
    if (tabName === 'events') fetchEventsData();
    if (tabName === 'outflows') renderOutflows();
    if (tabName === 'sales') fetchSales();
    if (tabName === 'logs') fetchLogs();
    if (tabName === 'reports') {
        populateReportSelects();
    }
    
    // Inicializações de funcionalidades específicas
    if (tabName === 'messages') renderMessages();
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
    link.onclick = (e) => {
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
    
    // Preenche lista de membros
    if (memberSelect) {
        memberSelect.innerHTML = '<option value="">Selecione um Membro</option>' + 
            state.people.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    }
        
    // Preenche lista de eventos
    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">Selecione um Evento</option>' + 
            state.events.map(e => `<option value="${e.id}">${escapeHTML(e.name)}</option>`).join('');
    }
};

// Botão "Voltar" dentro da visualização de detalhes de um evento
document.getElementById('back-to-events').onclick = () => {
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
    if (dropdown) dropdown.style.display = 'none';
    
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


// --- Lógica de Logs do Sistema (Auditoria) ---
// Busca os logs de atividades do servidor
async function fetchLogs() {
    try {
        const logs = await apiFetch('/api/admin/logs');
        state.allLogs = logs; // Armazena todos no estado para filtragem local rápida
        renderLogs(); // Desenha a tabela de logs
    } catch (err) {
        console.error('Error fetching logs:', err);
    }
};

// Renderiza a tabela de auditoria com filtros aplicados
const renderLogs = () => {
    const body = document.getElementById('logs-body');
    if (!body || !state.allLogs) return;

    let filteredLogs = state.allLogs;
    // Filtra localmente conforme a categoria selecionada na UI
    if (state.logFilter === 'login') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('LOGIN'));
    } else if (state.logFilter === 'info') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('PAYMENT') || l.action.includes('PERSON'));
    } else if (state.logFilter === 'network') {
        filteredLogs = state.allLogs.filter(l => l.action.includes('NETWORK') || l.action.includes('PROTOCOL') || l.action.includes('SYSTEM'));
    }

    // Se não houver nada após filtrar
    if (filteredLogs.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhum log encontrado para esta categoria.</td></tr>';
        return;
    }

    // Mapeia os logs para linhas da tabela HTML
    body.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.created_at).toLocaleString('pt-BR');
        const details = JSON.stringify(log.details, null, 2); // Converte detalhes em JSON formatado
        
        // Define a cor do badge conforme o tipo de ação (sucesso, erro, perigo)
        let actionClass = 'log-action-info';
        if (log.action.includes('FAILED') || log.action.includes('DELETE')) actionClass = 'log-action-danger';
        if (log.action.includes('SUCCESS') || log.action.includes('CREATE') || log.action.includes('APPROVE')) actionClass = 'log-action-success';

        return `
            <tr class="animate-fade-in">
                <td><small>${date}</small></td>
                <td><strong>${escapeHTML(log.username)}</strong></td>
                <td><span class="log-badge ${actionClass}">${escapeHTML(log.action)}</span></td>
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

// Exibe um modal com o JSON completo dos detalhes de um log
window.showLogDetails = (details) => {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 40px; height: 40px; fill: var(--accent-color);"><path d="M80 480L80 224L560 224L560 480C560 488.8 552.8 496 544 496L352 496C352 451.8 316.2 416 272 416L208 416C163.8 416 128 451.8 128 496L96 496C87.2 496 80 488.8 80 480zM96 96C60.7 96 32 124.7 32 160L32 480C32 515.3 60.7 544 96 544L544 544C579.3 544 608 515.3 608 480L608 160C608 124.7 579.3 96 544 96L96 96zM240 376C270.9 376 296 350.9 296 320C296 289.1 270.9 264 240 264C209.1 264 184 289.1 184 320C184 350.9 209.1 376 240 376zM408 272C394.7 272 384 282.7 384 296C384 309.3 394.7 320 408 320L488 320C501.3 320 512 309.3 512 296C512 282.7 501.3 272 488 272L408 272zM408 368C394.7 368 384 378.7 384 392C384 405.3 394.7 416 408 416L488 416C501.3 416 512 405.3 512 392C512 378.7 501.3 368 488 368L408 368z"/></svg>`;
    showAlert(`<pre style="text-align: left; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 4px; font-family: monospace; font-size: 0.8rem; overflow-x: auto;">${details}</pre>`, 'Detalhes da Ação', svgIcon);
};

// Botão para atualizar manualmente a lista de logs
const refreshLogsBtn = document.getElementById('refresh-logs-btn');
if (refreshLogsBtn) refreshLogsBtn.onclick = fetchLogs;

// Inicializa os filtros de categorias de logs
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); // Destaca o botão selecionado
        state.logFilter = btn.dataset.filter; // Altera o filtro no estado
        renderLogs(); // Re-renderiza a tabela
    };
});

// --- Lógica de Eventos ---
// Busca a lista de eventos cadastrados no sistema
async function fetchEventsData() {
    try {
        state.events = await apiFetch('/api/events');
        renderEvents(); // Atualiza a visualização em cards
    } catch (err) {
        console.error('Error fetching events:', err);
    }
};


// Desenha a lista de eventos em formato de cartões (cards)
const renderEvents = () => {
    const list = document.getElementById('events-list');
    if (!list) return;
    
    // Gera o HTML para cada cartão de evento
    list.innerHTML = state.events.map(event => {
        return `
            <div class="glass-card event-card animate-fade-in" style="padding: 1.5rem; margin-bottom: 1rem; cursor: pointer;" onclick="openEventDetail(${event.id})">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4 style="margin: 0; color: var(--accent-color);">${escapeHTML(event.name)}</h4>
                    ${state.role === 'admin' ? `<button class="btn-text" onclick="event.stopPropagation(); deleteEvent(${event.id})" style="padding: 0; min-height: auto; display: flex; align-items: center; justify-content: center; color: var(--text-dim); transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor">
                            <path d="M262.2 48C248.9 48 236.9 56.3 232.2 68.8L216 112L120 112C106.7 112 96 122.7 96 136C96 149.3 106.7 160 120 160L520 160C533.3 160 544 149.3 544 136C544 122.7 533.3 112 520 112L424 112L407.8 68.8C403.1 56.3 391.2 48 377.8 48L262.2 48zM128 208L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 208L464 208L464 512C464 520.8 456.8 528 448 528L192 528C183.2 528 176 520.8 176 512L176 208L128 208zM288 280C288 266.7 277.3 256 264 256C250.7 256 240 266.7 240 280L240 456C240 469.3 250.7 480 264 480C277.3 480 288 469.3 288 456L280zM400 280C400 266.7 389.3 256 376 256C362.7 256 352 266.7 352 280L352 456C352 469.3 362.7 480 376 480C389.3 480 400 469.3 400 456L400 280z"/>
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
                            ${escapeHTML(unit)}: ${count}
                        </span>
                    `).join('')}
                </div>
                <p class="event-desc" style="font-size: 0.9rem; margin-top: 10px;">${escapeHTML(event.description || 'Sem descrição')}</p>
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

// Abre a visualização detalhada de um evento específico
const openEventDetail = async (eventId, preserveUI = false) => {
    try {
        // Busca os detalhes via API
        const data = await apiFetch(`/api/events/${eventId}/details`);
        if (!data.event) throw new Error('Evento não encontrado.');

        // Salva os dados no estado global para acesso por outras funções
        state.currentEvent = data.event;
        state.currentEventParticipants = data.participants || [];
        state.currentEventPayments = data.payments || [];
        
        // Sincroniza o ano de exibição com o ano da data do evento
        if (data.event.date) {
            state.eventDetailYear = new Date(data.event.date).getFullYear();
        }
        
        // Se preserveUI for false, faz a transição de telas no Dashboard
        if (!preserveUI) {
            const masterView = document.getElementById('events-master-view'); // Lista
            const detailView = document.getElementById('events-detail-view'); // Detalhe
            if (masterView) masterView.style.display = 'none';
            if (detailView) detailView.style.display = 'block';
            
            // Alterna botões de ação do topo
            if (state.role === 'admin' || state.role === 'secretário') {
                const addEventBtn = document.getElementById('add-event-btn');
                const addPartBtn = document.getElementById('add-participants-btn');
                if (addEventBtn) addEventBtn.style.display = 'none';
                if (addPartBtn) addPartBtn.style.display = 'block';
            }

            // Garante que a tabela detalhada membro a membro comece escondida
            const detailContainer = document.getElementById('event-details-table-container');
            if (detailContainer) detailContainer.style.display = 'none';
            
            const toggleBtn = document.getElementById('toggle-event-details');
            if (toggleBtn) toggleBtn.textContent = 'Ver Detalhamento Membro a Membro ↓';
            
            // Limpa o campo de busca
            const evSearch = document.getElementById('ev-detail-search');
            if (evSearch) evSearch.value = '';
        }

        // Define o título do evento no cabeçalho dos detalhes
        const titleElem = document.getElementById('detail-event-title');
        if (titleElem) titleElem.textContent = data.event.name;
        
        // Ajusta os cabeçalhos da tabela conforme o tipo de pagamento (único ou parcelado/por meses)
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

        // Renderiza o resumo financeiro (Dashboard) e a grade detalhada do evento
        renderEventDashboard(data.participants, data.payments);
        renderEventDetailGrid(data.participants, data.payments);
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

// Renderiza a grade membro a membro de pagamentos de um evento
const renderEventDetailGrid = (participants, payments) => {
    window._tempEventPayments = payments; // Cache temporário para facilitar busca por index
    const body = document.getElementById('event-detail-body');
    if (!body) return;

    // Filtro de busca local
    const searchTerm = document.getElementById('ev-detail-search')?.value.toLowerCase() || '';
    const event = state.currentEvent;
    if (!event) return;

    const isUnico = event.payment_type === 'unico';

    // Agrupa os pagamentos por ID de pessoa para facilitar a renderização por linha
    const paymentsByPerson = {};
    payments.forEach(pay => {
        const pid = String(pay.person_id);
        if (!paymentsByPerson[pid]) paymentsByPerson[pid] = [];
        paymentsByPerson[pid].push(pay);
    });

    const rows = [];
    participants.forEach(p => {
        const pId = String(p.id);
        const personPayments = paymentsByPerson[pId] || [];
        
        let totalPaid = 0;
        // Soma apenas os pagamentos aprovados para o total da linha
        personPayments.forEach(pay => {
            if (pay.status === 'approved') totalPaid += parseFloat(pay.amount || 0);
        });
        
        const totalStr = `R$ ${totalPaid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        const searchText = `${p.name} ${p.unit || ''} ${totalStr}`.toLowerCase();

        // Aplica o filtro de busca se houver um termo
        if (searchTerm && !searchText.includes(searchTerm)) return;

        // Inicia a construção do HTML da linha (Nome e Unidade)
        let rowHtml = `<td><strong>${escapeHTML(p.name)}</strong> <br> <small>${escapeHTML(p.unit || '-')}</small></td>`;

        if (isUnico) {
            // Se o pagamento for do tipo 'único', mostra apenas uma célula de status
            const displayPayment = personPayments[personPayments.length - 1]; // Pega o registro mais recente
            if (displayPayment) {
                const statusLabel = displayPayment.status === 'approved' ? 'PAGO' : (displayPayment.status === 'rejected' ? 'RECUSADO' : 'PENDENTE');
                rowHtml += `
                    <td class="clickable-cell" style="text-align: center;" onclick="openEventPaymentModalFromGridIndex(${p.id}, null, ${payments.indexOf(displayPayment)})">
                        <span class="grid-status-label status-${displayPayment.status}">${statusLabel}</span>
                    </td>
                `;
            } else {
                // Caso não haja registro de pagamento, assume pendente
                rowHtml += `
                    <td class="clickable-cell" style="text-align: center;" onclick="openEventPaymentModalFromGridIndex(${p.id}, null)">
                        <span class="grid-status-label status-none">PENDENTE</span>
                    </td>
                `;
            }
        } else {
            // Se for parcelado/mensal, cria 12 colunas (uma para cada mês)
            const monthMap = {};
            personPayments.forEach(pay => {
                if (pay.month) monthMap[Number(pay.month)] = pay;
            });

            for (let m = 1; m <= 12; m++) {
                const pay = monthMap[m];
                if (pay) {
                    const statusLabel = pay.status === 'approved' ? 'PAGO' : (pay.status === 'rejected' ? 'RECUSADO' : 'PENDENTE');
                    rowHtml += `
                        <td class="clickable-cell" onclick="openEventPaymentModalFromGridIndex(${p.id}, ${m}, ${payments.indexOf(pay)})">
                            <span class="grid-status-label status-${pay.status}">${statusLabel}</span>
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

        // Coluna final com o valor total pago por este membro no evento
        rowHtml += `<td class="total-column">${totalStr}</td>`;
        rows.push(`<tr>${rowHtml}</tr>`);
    });

    // Insere as linhas no corpo da tabela ou mostra mensagem de "não encontrado"
    body.innerHTML = rows.join('') || `<tr><td colspan="${isUnico ? 3 : 14}" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum participante encontrado.</td></tr>`;
};

// Abre o modal de pagamento de evento a partir da grade detalhada
window.openEventPaymentModalFromGridIndex = (personId, month, paymentIndex = -1) => {
    // Segurança: Somente o próprio membro ou Admins/Secretários podem registrar pagamentos
    if (state.role !== 'admin' && state.role !== 'secretário' && parseInt(personId) !== parseInt(state.personId)) return;

    // Recupera o pagamento do cache pelo index se ele existir
    const payment = paymentIndex >= 0 ? window._tempEventPayments[paymentIndex] : null;
    
    if (!state.currentEvent) return;

    // Preenche os campos do modal com as informações do evento e da célula clicada
    const epEventId = document.getElementById('ep-event-id');
    if (epEventId) epEventId.value = state.currentEvent.id;
    const epEventName = document.getElementById('ep-event-name');
    if (epEventName) epEventName.textContent = state.currentEvent.name;
    const epMonth = document.getElementById('ep-month');
    if (epMonth) epMonth.value = month || "";
    const epYear = document.getElementById('ep-year');
    if (epYear) epYear.value = month ? state.eventDetailYear : "";
    
    // Armazena temporariamente o ID da pessoa para quem o pagamento será registrado (útil para Admin)
    state.tempPaymentPersonId = personId;

    // Abre o modal de pagamento (upload de comprovante)
    openEventPaymentModal(state.currentEvent.id, state.currentEvent.name, payment);
};

// Outra variante da função de abertura de modal (para uso direto na grade)
const openEventPaymentModalFromGrid = (personId, month, payment = null) => {
    // Restrição de acesso: somente o próprio ou admin
    if (state.role !== 'admin' && state.role !== 'secretário' && parseInt(personId) !== parseInt(state.personId)) return;

    if (!state.currentEvent) return;

    const epEventId = document.getElementById('ep-event-id');
    if (epEventId) epEventId.value = state.currentEvent.id;
    const epEventName = document.getElementById('ep-event-name');
    if (epEventName) epEventName.textContent = state.currentEvent.name;
    const epMonth = document.getElementById('ep-month');
    if (epMonth) epMonth.value = month || "";
    const epYear = document.getElementById('ep-year');
    if (epYear) epYear.value = month ? state.eventDetailYear : "";
    
    state.tempPaymentPersonId = personId;

    openEventPaymentModal(state.currentEvent.id, state.currentEvent.name, payment);
};

// Renderiza a lista de membros (checklist) para adicionar a um evento
const renderEventParticipantsChecklist = () => {
    const list = document.getElementById('event-participants-list');
    const unitFilter = document.getElementById('ev-unit-filter');
    
    // Extrai as unidades únicas de todos os membros
    const units = [...new Set(state.people.map(p => p.unit).filter(u => u))].sort();
    unitFilter.innerHTML = `
        <option value="">Selecionar</option>
        <option value="ALL">Todos os Membros</option>
        ${units.map(u => `<option value="${u}">Unidade: ${u}</option>`).join('')}
    `;

    // Gera o HTML da lista de seleção
    list.innerHTML = state.people.map(p => {
        const searchText = `${p.name} ${p.unit || ''}`.toLowerCase();
        return `
            <div class="checklist-item" data-search="${searchText}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.9rem;">
                <input type="checkbox" class="participant-check" data-id="${p.id}" data-unit="${p.unit || ''}">
                <label>${p.name} <small style="color: var(--text-dim)">(${p.unit || 'Sem Unidade'})</small></label>
            </div>
        `;
    }).join('');
};

// Abre o modal para adicionar novos participantes ao evento atual
const openAddParticipantsModal = () => {
    const list = document.getElementById('add-participants-list');
    const existingIds = state.currentEventParticipants.map(p => p.id); // Quem já está no evento
    // Filtra membros que ainda não estão participando
    const available = state.people.filter(p => !existingIds.includes(p.id));
    
    if (list) {
        list.innerHTML = available.map(p => {
            const searchText = `${p.name} ${p.unit || ''}`.toLowerCase();
            return `
                <div class="checklist-item" data-search="${searchText}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border-color);">
                    <input type="checkbox" class="new-participant-check" data-id="${p.id}" id="check-${p.id}" style="width: 18px; height: 18px;">
                    <label for="check-${p.id}" style="cursor: pointer; flex: 1;">
                        ${p.name} <br>
                        <small style="color: var(--text-dim); font-size: 0.8rem;">${p.unit || 'Sem Unidade'}</small>
                    </label>
                </div>
            `;
        }).join('');
        
        // Se não houver ninguém disponível para adicionar
        if (available.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-dim); padding: 2rem;">Todos os membros já estão participando deste evento.</p>';
        }
    }
    
    const modal = document.getElementById('event-participants-modal');
    if (modal) modal.style.display = 'flex';
};

// Salva os membros selecionados como participantes do evento
const saveNewParticipants = async () => {
    const checks = document.querySelectorAll('.new-participant-check:checked');
    const ids = Array.from(checks).map(c => parseInt(c.dataset.id));
    
    if (ids.length === 0) {
        showStatus('Selecione pelo menos um membro.', 'info');
        return;
    }
    
    try {
        // Envia a lista de IDs para o backend
        await apiFetch(`/api/events/${state.currentEvent.id}/participants`, {
            method: 'POST',
            body: JSON.stringify({ participant_ids: ids })
        });
        
        showStatus('Membros adicionados com sucesso!', 'success');
        const modal = document.getElementById('event-participants-modal');
        if (modal) modal.style.display = 'none';
        // Recarrega os detalhes do evento para atualizar a lista na tela
        openEventDetail(state.currentEvent.id, true);
    } catch (err) {
        showStatus('Erro ao adicionar membros: ' + err.message, 'error');
    }
};

// Botão para desmarcar todos os itens na checklist de participantes
const evClearAll = document.getElementById('ev-clear-all');
if (evClearAll) {
    evClearAll.onclick = () => {
        document.querySelectorAll('.participant-check').forEach(c => c.checked = false);
    };
}

// Campo de busca em tempo real para a lista de membros do evento
const evMemberSearch = document.getElementById('ev-member-search');
if (evMemberSearch) {
    evMemberSearch.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.checklist-item');
        items.forEach(item => {
            const search = item.getAttribute('data-search') || '';
            item.style.display = search.includes(term) ? 'flex' : 'none';
        });
    };
}

// Filtro por unidade: marca todos os membros de uma unidade específica de uma vez
const evUnitFilter = document.getElementById('ev-unit-filter');
if (evUnitFilter) {
    evUnitFilter.onchange = (e) => {
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
        e.target.value = ""; // Reseta o seletor após o uso
    };
}

// Configuração principal do modal de pagamento de eventos
const openEventPaymentModal = (eventId, eventName, payment = null) => {
    const epEventId = document.getElementById('ep-event-id');
    if (epEventId) epEventId.value = eventId;
    const epEventName = document.getElementById('ep-event-name');
    if (epEventName) epEventName.textContent = eventName;
    const epModalTitle = document.getElementById('ep-modal-title');
    if (epModalTitle) epModalTitle.textContent = payment ? 'Visualizar Pagamento' : 'Enviar Comprovante';
    
    // Mapeamento dos elementos de interface do modal
    const saveBtn = document.getElementById('ep-save-btn');
    const deleteBtn = document.getElementById('ep-delete-btn');
    const adminActions = document.getElementById('ep-admin-actions');
    const rejectionContainer = document.getElementById('ep-rejection-container');
    const receiptContainer = document.getElementById('ep-view-receipt-container');
    const rejectionForm = document.getElementById('ep-rejection-form');

    // Ajusta visibilidade da seleção de data baseado no tipo do evento (Único ou Parcelado)
    const dateSelection = document.getElementById('ep-date-selection');
    if (state.currentEvent && state.currentEvent.payment_type === 'unico') {
        dateSelection.style.display = 'none';
    } else {
        dateSelection.style.display = 'flex';
    }

    // Configuração inicial (estado de "novo pagamento")
    saveBtn.style.display = 'block';
    saveBtn.textContent = 'Enviar Pagamento';
    deleteBtn.style.display = 'none';
    adminActions.style.display = 'none';
    rejectionContainer.style.display = 'none';
    receiptContainer.style.display = 'none';
    rejectionForm.style.display = 'none';
    document.getElementById('ep-amount').value = payment ? payment.amount : '0.00';
    document.getElementById('ep-receipt').value = '';

    // Se houver um pagamento existente sendo visualizado
    if (payment) {
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => deleteEventPayment(payment.id);

        // Se o pagamento tiver um arquivo de comprovante vinculado
        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            const filename = payment.receipt_path.split(/[\\/]/).pop();
            // Gera o link seguro para visualização do arquivo injetando o token na URL
            document.getElementById('ep-view-receipt-btn').href = `/api/files/receipt/${filename}?token=${getToken()}`;
        }

        // Lógica visual baseada no status atual do pagamento
        if (payment.status === 'approved') {
            // Se já aprovado, permite apenas atualizar o valor (por um Admin)
            saveBtn.textContent = 'Atualizar Valor';
            document.getElementById('ep-modal-title').textContent = 'Editar Pagamento';
        } else if (payment.status === 'rejected') {
            // Se foi recusado, mostra o motivo e permite novo envio
            rejectionContainer.style.display = 'block';
            document.getElementById('ep-rejection-text').textContent = payment.rejection_reason || 'Sem motivo detalhado.';
            saveBtn.textContent = 'Enviar Novamente';
        } else if (payment.status === 'pending') {
            // Se estiver pendente, permite atualizar o comprovante
            saveBtn.textContent = 'Atualizar Comprovante';
            
            // Ações extras exclusivas para Administrador/Secretário em pagamentos pendentes
            if (state.role === 'admin' || state.role === 'secretário') {
                saveBtn.style.display = 'none'; // Esconde botão padrão de salvar do usuário
                adminActions.style.display = 'flex'; // Mostra Aprovar/Reprovar
                
                document.getElementById('ep-approve-btn').onclick = () => approveEventPayment(payment.id);
                document.getElementById('ep-reject-trigger-btn').onclick = () => {
                    adminActions.style.display = 'none';
                    rejectionForm.style.display = 'block'; // Abre campo para digitar motivo da recusa
                };
                document.getElementById('ep-confirm-reject-btn').onclick = () => {
                    const reason = document.getElementById('ep-reject-reason').value;
                    rejectEventPayment(payment.id, reason);
                };
            }
        }
    }

    // Exibe o modal
    eventPaymentModal.style.display = 'flex';
};

// Remove um registro de pagamento de evento
const deleteEventPayment = async (id) => {
    if (await showConfirm('Tem certeza que deseja remover este registro de pagamento?')) {
        try {
            await apiFetch(`/api/event-payments/${id}`, { method: 'DELETE' });
            eventPaymentModal.style.display = 'none';
            showStatus('Pagamento removido com sucesso!');
            
            // Recarrega os dados do evento para atualizar a grade na tela
            const activeEventId = document.getElementById('ep-event-id').value;
            if (activeEventId) openEventDetail(parseInt(activeEventId), true);
        } catch (err) {
            showStatus('Erro ao remover pagamento', 'error');
        }
    }
};

// Abre o modal de pagamento de evento em modo administrativo
const openEventPaymentModalAdmin = (payment) => {
    const event = state.events.find(e => e.id === payment.event_id);
    openEventPaymentModal(payment.event_id, event ? event.name : 'Desconhecido', payment);
};

// Aprova um pagamento de evento
const approveEventPayment = async (id) => {
    try {
        await apiFetch(`/api/event-payments/${id}/approve`, { method: 'POST' });
        eventPaymentModal.style.display = 'none';
        // Atualiza a visualização atual
        if (state.currentEvent) openEventDetail(state.currentEvent.id, true);
        else fetchEventsData();
    } catch (err) { showStatus(err.message, 'error'); }
};

// Recusa um pagamento de evento informando um motivo
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

// Exclui um evento e todos os dados vinculados (Cuidado: ação destrutiva)
const deleteEvent = async (id) => {
    if (await showConfirm('Tem certeza que deseja excluir este evento? Todos os pagamentos vinculados serão perdidos.')) {
        try {
            await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
            fetchEventsData(); // Recarrega a lista de eventos
        } catch (err) { showStatus(err.message, 'error'); }
    }
};


// --- Processamento de Estatísticas do Dashboard ---
// Calcula e distribui todos os valores financeiros do sistema para exibição nos cards e gráficos
const updateDashboardStats = () => {
    let totalCash = 0; // Saldo total em caixa
    let direcaoTotal = 0; // Total arrecadado da unidade Direção
    let desbravadoresTotal = 0; // Total arrecadado da unidade Desbravadores
    let eventosTotal = 0; // Total vindo de eventos
    let outrosTotal = 0; // Outras arrecadações
    
    const monthlyData = new Array(12).fill(0); // Dados para o gráfico de barras mensal
    
    // Processa todas as Mensalidades aprovadas
    state.payments.forEach(p => {
        if (p.status !== 'approved') return;
        
        const amount = parseFloat(p.amount);
        totalCash += amount;
        monthlyData[p.month - 1] += amount;
        
        // Atribui o valor à unidade correta do membro
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

    // Processa os Pagamentos de Eventos aprovados
    if (state.eventPayments) {
        state.eventPayments.forEach(p => {
            if (p.status !== 'approved') return;
            const amount = parseFloat(p.amount);
            totalCash += amount;
            eventosTotal += amount;
            
            // Distribui o valor do evento conforme a unidade do membro que pagou
            const person = state.people.find(pers => parseInt(pers.id) === parseInt(p.person_id));
            const unit = (person?.unit || '').toUpperCase();

            if (unit.includes('DIREÇÃO') || unit.includes('DIRECAO')) {
                direcaoTotal += amount;
            } else if (unit.includes('DESBRAVADOR')) {
                desbravadoresTotal += amount;
            } else {
                outrosTotal += amount;
            }

            // Soma ao mês correspondente no gráfico mensal (se houver data vinculada)
            if (p.month) {
                monthlyData[p.month - 1] += amount;
            }
        });
    }

    // Processa Vendas e Arrecadações extras (Cantina, Bazar, etc)
    let totalSales = 0;
    if (state.sales) {
        state.sales.forEach(s => {
            const amount = parseFloat(s.amount);
            totalSales += amount;
            totalCash += amount; // Soma ao saldo geral
            
            // Filtra e soma ao gráfico se a venda for do ano atual
            const saleDate = new Date(s.date + 'T12:00:00');
            if (saleDate.getFullYear() === parseInt(state.currentYear)) {
                monthlyData[saleDate.getMonth()] += amount;
            }
        });
    }

    // Processa as Saídas de Caixa (Despesas/Pagamentos feitos pelo clube)
    let totalOutflows = 0;
    if (state.outflows) {
        state.outflows.forEach(o => {
            const amount = parseFloat(o.amount);
            totalOutflows += amount;
            totalCash -= amount; // O saldo em caixa diminui
        });
    }

    // Atualiza os elementos visuais do Dashboard (se for Admin/Secretário)
    if (state.role === 'admin' || state.role === 'secretário') {
        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        const direcaoStat = document.getElementById('stat-direcao');
        const desbravaStat = document.getElementById('stat-desbravadores');
        const eventosStat = document.getElementById('stat-eventos');
        const outflowsStat = document.getElementById('stat-total-outflows');
        const outflowsCard = document.getElementById('stat-outflows-card');
        
        // Exibe os valores formatados nos respectivos cards
        if (direcaoStat) direcaoStat.textContent = `R$ ${direcaoTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (desbravaStat) desbravaStat.textContent = `R$ ${desbravadoresTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (eventosStat) eventosStat.textContent = `R$ ${eventosTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        if (outflowsStat) outflowsStat.textContent = `R$ ${totalOutflows.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (outflowsCard) outflowsCard.style.display = 'block';
        
        // Preparação para gráficos: Categorização de fontes de renda
        let mensalidadesPuro = 0;
        state.payments.forEach(p => {
            if (p.status === 'approved') mensalidadesPuro += parseFloat(p.amount);
        });

        // Renderiza o gráfico de pizza principal comparando fontes de renda e despesas
        renderPieChart(
            ['Mensalidades', 'Eventos', 'Despesas', 'Vendas'], 
            [mensalidadesPuro, eventosTotal, totalOutflows, totalSales],
            ['#e50914', '#111111', '#8b0000', '#228b22'] 
        );
    } else {
        // Estatísticas simplificadas para membros comuns (não Admin)
        const paidMonths = state.payments.length;
        const pendingMonths = 12 - paidMonths;
        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${totalCash.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        // Gráfico de pizza mostrando progresso pessoal de pagamentos do ano
        renderPieChart(['Meses Pagos', 'Pendentes'], [paidMonths, pendingMonths], ['#e50914', '#111111']);
    }
    
    // Gráfico de barras mensal (Receita por mês)
    renderBarChart(monthlyData);
};

// Renderiza os painéis estatísticos específicos de um evento detalhado
const renderEventDashboard = (participants, payments) => {
    let evTotal = 0;
    let evDirecao = 0;
    let evDesbrava = 0;
    let evOutros = 0;
    const evMonthlyData = new Array(12).fill(0);

    // Otimização: Cria um mapa para busca rápida de participantes
    const participantsMap = new Map();
    participants.forEach(p => participantsMap.set(p.id, p));

    // Processa pagamentos apenas deste evento
    payments.forEach(p => {
        if (p.status !== 'approved') return;
        const amount = parseFloat(p.amount);
        evTotal += amount;
        if (p.month) evMonthlyData[p.month - 1] += amount;

        // Recupera a unidade do membro para categorizar a receita do evento
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

    // Atualiza os cartões de status do evento
    const totalStat = document.getElementById('ev-stat-total');
    const direcaoStat = document.getElementById('ev-stat-direcao');
    const desbravaStat = document.getElementById('ev-stat-desbrava');

    if (totalStat) totalStat.textContent = `R$ ${evTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (direcaoStat) direcaoStat.textContent = `R$ ${evDirecao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (desbravaStat) desbravaStat.textContent = `R$ ${evDesbrava.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    // Gráfico de pizza do evento (Receita por Unidade)
    renderPieChart(
        ['Direção', 'Desbravadores', 'Outros'],
        [evDirecao, evDesbrava, evOutros],
        ['#e50914', '#111111', '#707070'],
        'evPieChart',
        'evPie'
    );

    // Gráfico de barras do evento (Receita por Mês)
    renderBarChart(evMonthlyData, 'evBarChart', 'evBar');
};

// Renderiza o painel de estatísticas da aba de Mensalidades
const renderMensalidadeDashboard = () => {
    let mTotal = 0;
    let mDirecao = 0;
    let mDesbrava = 0;
    let mOutros = 0;
    const mMonthlyData = new Array(12).fill(0);

    // Otimização: Mapa para busca rápida de membros
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

    // Atualiza cards da aba mensalidades
    document.getElementById('mens-stat-total').textContent = `R$ ${mTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('mens-stat-direcao').textContent = `R$ ${mDirecao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('mens-stat-desbrava').textContent = `R$ ${mDesbrava.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    // Gráfico de Pizza de Mensalidades
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

// Função genérica para criar gráficos de Rosca (Pie/Doughnut) usando Chart.js
const renderPieChart = (labels, data, colors = ['#e50914', '#1a1a1a', '#e8e6df'], canvasId = 'pieChart', stateKey = 'pie') => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Se o gráfico já existir, destrói a instância antiga antes de criar a nova
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
            cutout: '80%', // Efeito de rosca fina (estilo Apple/Netflix)
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: '#707070' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw || 0;
                            // Formatação de moeda brasileira nos tooltips
                            return context.label + ': ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                        }
                    }
                }
            }
        }
    });
};

// Função genérica para criar gráficos de Barras usando Chart.js
const renderBarChart = (monthlyData, canvasId = 'barChart', stateKey = 'bar') => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Destrói instância anterior se houver
    if (state.charts[stateKey]) state.charts[stateKey].destroy();
    
    state.charts[stateKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthsShort, // ['Jan', 'Fev'...]
            datasets: [{
                label: 'Receita (R$)',
                data: monthlyData,
                backgroundColor: '#e50914', // Vermelho temático
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

// Renderiza a tabela de despesas (Saídas de Caixa)
function renderOutflows() {
    const body = document.getElementById('outflows-body');
    if (!body) return;

    // Se não houver despesas, mostra mensagem de tabela vazia
    if (state.outflows.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    // Mapeia cada despesa para uma linha da tabela HTML
    body.innerHTML = state.outflows.map(out => {
        const date = formatDate(out.date);
        const amount = parseFloat(out.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        let receiptHtml = '-';
        // Cria botão para ver o recibo se o caminho do arquivo existir
        if (out.receipt_path) {
            const filename = out.receipt_path.split(/[\\/]/).pop();
            receiptHtml = `<a href="/api/files/receipt/${filename}?token=${getToken()}" target="_blank" class="btn-text btn-small">Ver Recibo</a>`;
        }

        return `
            <tr>
                <td>${date}</td>
                <td><span class="unit-tag" style="background: rgba(229, 9, 20, 0.1); color: var(--outflow-color);">${escapeHTML(out.category)}</span></td>
                <td style="color: var(--error-color); font-weight: 600;">- ${amount}</td>
                <td>${receiptHtml}</td>
                <td>
                    <button class="btn-text btn-small" onclick="deleteOutflow(${out.id})">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
};

// Exclui um registro de despesa
window.deleteOutflow = async (id) => {
    if (await showConfirm('Tem certeza que deseja excluir esta despesa?')) {
        try {
            await apiFetch(`/api/outflows/${id}`, { method: 'DELETE' });
            await loadInitialData(); // Recarrega dados globais
            if (state.activeTab === 'outflows') renderOutflows(); // Atualiza a tabela se estiver na aba correta
        } catch (err) {
            showStatus(err.message, 'error');
        }
    }
};

// Tratamento do envio do formulário de nova despesa
const outflowForm = document.getElementById('outflow-form');
if (outflowForm) {
    outflowForm.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(); // Usa FormData para suportar envio de arquivo (recibo)
        formData.append('amount', document.getElementById('out-amount').value);
        formData.append('category', document.getElementById('out-category').value);
        formData.append('date', document.getElementById('out-date').value);
        formData.append('description', document.getElementById('out-desc').value);
        
        const file = document.getElementById('out-receipt').files[0];
        if (file) formData.append('receipt', file);

        try {
            // Chamada direta ao fetch para lidar com o FormData adequadamente
            const res = await fetch('/api/outflows', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            if (res.ok) {
                showStatus('Despesa registrada com sucesso!', 'success');
                e.target.reset(); // Limpa o formulário
                // Recarrega todos os dados financeiros impactados
                await Promise.all([
                    loadInitialData(),
                    fetchLogs(),
                    fetchOutflows(),
                    fetchSales()
                ]);
            } else {
                const data = await res.json();
                showStatus(data.error, 'error');
            }
        } catch (err) {
            showStatus('Erro ao salvar despesa', 'error');
        }
    };
}

// Busca a lista de despesas do backend
async function fetchOutflows() {
    try {
        state.outflows = await apiFetch('/api/outflows');
        renderOutflows();
    } catch (err) {
        console.error('Error fetching outflows:', err);
    }
}


// --- Renderização do Dashboard Principal ---

// Renderiza a grade de mensalidades (quem pagou o quê em cada mês)
function renderDashboard() {
    paymentsBody.innerHTML = '';
    const footer = document.getElementById('payments-footer');
    footer.innerHTML = '';
    
    // Atualiza estatísticas e gráficos das abas
    renderMensalidadeDashboard();
    updateDashboardStats();
    
    // Termo de busca para filtrar a tabela
    const searchTerm = document.getElementById('mens-search')?.value.toLowerCase() || '';
    
    // Otimização: Cria um mapa de pagamentos por pessoa e mês para acesso instantâneo O(1)
    const paymentsMap = new Map();
    state.payments.forEach(p => {
        const key = `${p.person_id}-${p.month}`;
        paymentsMap.set(key, p);
    });

    // Pré-processa os dados dos membros com status de pagamento e totais
    const processedPeople = state.people.map(person => {
        let personTotal = 0;
        let hasPaid = false;
        let hasPending = false;

        for (let m = 1; m <= 12; m++) {
            const payment = paymentsMap.get(`${person.id}-${m}`);
            if (payment) {
                if (payment.status === 'approved') {
                    personTotal += parseFloat(payment.amount || 0);
                    hasPaid = true;
                } else if (payment.status === 'pending') {
                    hasPending = true;
                }
            } else {
                hasPending = true; // Se não há registro, considera pendente (não pago)
            }
        }

        const statusText = (hasPaid ? 'PAGO ' : '') + (hasPending ? 'PENDENTE' : '');
        const totalStr = `R$ ${personTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        // String única usada para busca rápida
        const searchText = `${person.name} ${person.unit || ''} ${statusText} ${totalStr}`.toLowerCase();

        return { ...person, personTotal, searchText };
    });

    // Aplica o filtro de busca
    const filteredPeople = processedPeople.filter(p => p.searchText.includes(searchTerm));
    
    const monthlyTotals = new Array(12).fill(0); // Totais acumulados por coluna (mês)
    let grandTotal = 0; // Total geral acumulado de todas as mensalidades filtradas

    // Fragmento de documento para melhorar a performance de inserção no DOM
    const fragment = document.createDocumentFragment();

    filteredPeople.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${escapeHTML(person.name)}</strong></td>`;
        
        let personTotal = 0;

        // Cria as 12 células de meses para cada membro na grade
        for (let m = 1; m <= 12; m++) {
            const payment = paymentsMap.get(`${person.id}-${m}`);
            const td = document.createElement('td');
            td.className = 'clickable-cell';
            
            const label = document.createElement('span');
            label.className = 'grid-status-label';
            
            if (payment) {
                // Adiciona a classe CSS correspondente ao status (pago, pendente, recusado)
                label.classList.add(`status-${payment.status}`);
                label.textContent = payment.status === 'approved' ? 'PAGO' : 
                                   payment.status === 'pending' ? 'PENDENTE' : 'RECUSADO';
                
                // Se estiver aprovado, soma aos totais (linha, coluna e geral)
                if (payment.status === 'approved') {
                    const amount = parseFloat(payment.amount || 0);
                    personTotal += amount;
                    monthlyTotals[m-1] += amount;
                    grandTotal += amount;
                }
            } else {
                // Se não há registro no banco, assume estado neutro de pendência
                label.classList.add('status-none');
                label.textContent = 'PENDENTE';
            }
            
            // Ao clicar na célula, abre o modal de pagamento se tiver permissão
            td.onclick = () => {
                const canEdit = state.role === 'admin' || (state.personId && person.id == state.personId);
                if (canEdit) {
                    openPaymentModal(person, m, payment);
                }
            };
            
            td.appendChild(label);
            tr.appendChild(td);
        }

        // Coluna final da linha com o total acumulado do membro no ano
        const totalTd = document.createElement('td');
        totalTd.className = 'total-column';
        totalTd.textContent = `R$ ${personTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        tr.appendChild(totalTd);

        fragment.appendChild(tr);
    });

    // Adiciona todas as linhas processadas de uma vez ao corpo da tabela
    paymentsBody.appendChild(fragment);

    // Renderiza o rodapé da tabela com os totais mensais por coluna
    const footerTr = document.createElement('tr');
    footerTr.innerHTML = '<td><strong>TOTAL MENSAL</strong></td>';
    
    monthlyTotals.forEach(total => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        td.innerHTML = `<strong>R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>`;
        footerTr.appendChild(td);
    });

    // Célula do canto inferior direito com o total geral arrecadado (considerando os filtros)
    const grandTotalTd = document.createElement('td');
    grandTotalTd.className = 'total-column';
    grandTotalTd.innerHTML = `<strong>R$ ${grandTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>`;
    footerTr.appendChild(grandTotalTd);
    
    footer.appendChild(footerTr);
};

// Define a coluna e direção de ordenação da lista de membros
const setSort = (column) => {
    if (state.peopleSort.column === column) {
        // Se clicar na mesma coluna, inverte a ordem
        state.peopleSort.direction = state.peopleSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // Se for nova coluna, começa com ascendente
        state.peopleSort.column = column;
        state.peopleSort.direction = 'asc';
    }
    renderPeople(); // Re-renderiza a tabela
};

// Renderiza a tabela de gerenciamento de membros (aba Membros)
function renderPeople() {
    peopleBody.innerHTML = '';
    
    // Filtro de busca global (Nome, Usuário, Unidade, CPF, Responsável)
    const searchQuery = document.getElementById('global-search')?.value.toLowerCase() || '';

    let processedPeople = state.people.filter(p => {
        const text = `${p.name} ${p.username || ''} ${p.unit || ''} ${p.responsible || ''} ${p.cpf || ''}`.toLowerCase();
        return text.includes(searchQuery);
    });

    // Lógica de ordenação com suporte a acentuação brasileira (localeCompare)
    processedPeople.sort((a, b) => {
        const col = state.peopleSort.column;
        const dir = state.peopleSort.direction === 'asc' ? 1 : -1;
        
        let valA = (a[col] || '').toString();
        let valB = (b[col] || '').toString();
        
        return valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' }) * dir;
    });

    // Atualiza visualmente os ícones de setinha (↑ ↓) no cabeçalho da tabela
    document.querySelectorAll('.sortable').forEach(th => {
        const onclickAttr = th.getAttribute('onclick');
        if (!onclickAttr) return;
        const match = onclickAttr.match(/'([^']+)'/);
        if (!match) return;
        const colName = match[1];
        const icon = th.querySelector('.sort-icon');
        if (colName === state.peopleSort.column) {
            icon.textContent = state.peopleSort.direction === 'asc' ? ' ↑' : ' ↓';
            th.classList.add('active-sort');
        } else {
            icon.textContent = '';
            th.classList.remove('active-sort');
        }
    });

    // Cria as linhas para cada membro filtrado
    processedPeople.forEach(person => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHTML(person.name.toUpperCase())}</strong></td>
            <td><span class="badge-user">${escapeHTML(person.username) || '-'}</span></td>
            <td><span class="unit-tag">${escapeHTML(person.unit) || 'S/U'}</span></td>
            <td>${escapeHTML(person.responsible) || '-'}</td>
            <td></td> <!-- Coluna de CPF limpa por questões de privacidade -->
            <td>
                <button class="btn-text" onclick="editPerson(${person.id})">
                    Editar
                </button>
            </td>
        `;
        peopleBody.appendChild(tr);
    });
};

// Listeners globais para campos de busca em tempo real
document.addEventListener('input', (e) => {
    if (e.target.id === 'global-search') {
        renderPeople();
    } else if (e.target.id === 'mens-search') {
        renderDashboard();
    } else if (e.target.id === 'ev-detail-search') {
        // Filtro específico para a grade detalhada de eventos
        if (state.currentEventParticipants && state.currentEventPayments) {
            renderEventDetailGrid(state.currentEventParticipants, state.currentEventPayments);
        }
    }
});


// --- Lógica de Modais de Pagamento ---

// Abre o modal para registro de mensalidades individuais
const openPaymentModal = (person, month, payment = null) => {
    // Define valores iniciais nos campos ocultos
    document.getElementById('p-person-id').value = person.id;
    document.getElementById('p-month').value = month;
    document.getElementById('p-member-name').textContent = person.name;
    document.getElementById('p-month-name').textContent = months[month - 1];
    document.getElementById('payment-error').textContent = '';
    
    // Mapeia elementos do modal
    const amountInput = document.getElementById('amount');
    const deleteBtn = document.getElementById('delete-payment-btn');
    const receiptContainer = document.getElementById('view-receipt-container');
    const title = document.getElementById('payment-modal-title');
    const saveBtn = document.getElementById('save-payment-btn');
    const adminActions = document.getElementById('admin-payment-actions');
    const rejectionReasonContainer = document.getElementById('rejection-reason-container');
    const rejectionForm = document.getElementById('rejection-form');

    // Reseta o estado visual do modal para o padrão "novo pagamento"
    receiptContainer.style.display = 'none';
    saveBtn.style.display = 'block';
    deleteBtn.style.display = 'none';
    adminActions.style.display = 'none';
    rejectionReasonContainer.style.display = 'none';
    rejectionForm.style.display = 'none';
    document.getElementById('receipt').parentElement.style.display = 'block';

    // Configuração do seletor de "Multi-meses" (pagar vários meses com um só comprovante)
    const multiToggle = document.getElementById('p-multi-month-toggle');
    const multiSelector = document.getElementById('p-multi-month-selector');
    const singleInfo = document.getElementById('p-single-month-info');
    const multiWrapper = multiToggle.parentElement.parentElement;
    
    multiToggle.checked = false;
    multiSelector.style.display = 'none';
    singleInfo.style.display = 'block';
    multiWrapper.style.display = 'block'; // Sempre mostra o switch para novos pagamentos

    // Desmarca todos os meses na grade de multi-seleção
    document.querySelectorAll('#p-months-grid input').forEach(i => i.checked = false);
    document.querySelectorAll('.month-grid-item').forEach(item => item.classList.remove('selected'));

    // Se estiver editando um pagamento já existente
    // Se estiver editando um pagamento já existente
    if (payment) {
        title.textContent = 'Gerenciar Pagamento';
        amountInput.value = payment.amount;

        // Pré-seleciona o mês atual na grade de multi-meses para facilitar conversão
        const gridInputs = document.querySelectorAll('#p-months-grid input');
        gridInputs.forEach(inp => {
            if (parseInt(inp.value) === parseInt(month)) {
                inp.checked = true;
                inp.parentElement.classList.add('selected');
            }
        });
        
        // Exibe o botão de visualizar comprovante se o arquivo existir
        if (payment.receipt_path) {
            receiptContainer.style.display = 'block';
            // Trata separadores de caminho de diferentes sistemas operacionais (\ ou /)
            const filename = payment.receipt_path.split(/[\\/]/).pop();
            const securePath = `/api/files/receipt/${filename}?token=${getToken()}`;
            document.getElementById('view-receipt-btn').href = securePath;
        }

        // Lógica de ações permitidas baseada na Role do usuário
        if (state.role === 'admin' || state.role === 'secretário') {
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = () => deletePayment(payment.id);
            // Se o pagamento está pendente, Admin vê botões de Aprovar/Recusar em vez de Salvar
            if (payment.status === 'pending') {
                saveBtn.style.display = 'none';
                adminActions.style.display = 'flex';
            }
        } else {
            // Lógica para visualização do Membro Comum
            if (payment.status === 'approved') {
                saveBtn.style.display = 'none'; // Não pode editar se já foi aprovado
                title.textContent = 'Pagamento Confirmado';
            } else if (payment.status === 'rejected') {
                // Se foi recusado, mostra o motivo e permite reenviar
                rejectionReasonContainer.style.display = 'block';
                rejectionReasonText.textContent = payment.rejection_reason || 'Nenhuma justificativa fornecida.';
                saveBtn.textContent = 'Tentar Novamente (Corrigir)';
            } else if (payment.status === 'pending') {
                saveBtn.textContent = 'Atualizar Comprovante';
                title.textContent = 'Aguardando Aprovação';
            }
        }
    } else {
        // Configurações para Novo Pagamento
        title.textContent = 'Registrar Pagamento';
        amountInput.value = '20.00'; // Valor padrão da mensalidade
        saveBtn.textContent = 'Salvar Pagamento';
        document.getElementById('receipt').value = '';
        
        // Exibe o switch de multi-meses apenas para novos registros
        multiToggle.parentElement.parentElement.style.display = 'block';
    }

    // Atribui os eventos de clique para as ações de Admin no modal
    document.getElementById('approve-payment-btn').onclick = () => approvePayment(payment.id);
    document.getElementById('reject-trigger-btn').onclick = () => {
        // Ao clicar em recusar, esconde botões principais e mostra formulário de motivo
        adminActions.style.display = 'none';
        rejectionForm.style.display = 'block';
    };
    document.getElementById('confirm-reject-btn').onclick = () => {
        const reason = document.getElementById('reject-reason').value;
        rejectPayment(payment.id, reason);
    };
    document.getElementById('cancel-reject-btn').onclick = () => {
        // Cancela a recusa e volta aos botões de Admin
        rejectionForm.style.display = 'none';
        adminActions.style.display = 'flex';
    };

    // Abre o modal com efeito de overlay flex
    paymentModal.style.display = 'flex';
};

// Envia requisição para aprovar um pagamento
const approvePayment = async (id) => {
    try {
        await apiFetch(`/api/payments/${id}/approve`, { method: 'POST' });
        paymentModal.style.display = 'none';
        await loadInitialData(); // Atualiza a grade e dashboard
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

// Envia requisição para recusar um pagamento com justificativa
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

// Exclui um registro de pagamento (disponível apenas para Admin/Secretário)
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

// Configura o modal de membros para a criação de um novo registro
document.getElementById('add-person-btn').onclick = () => {
    document.getElementById('person-modal-title').textContent = 'Novo Membro';
    document.getElementById('p-id').value = '';
    document.getElementById('person-form').reset();
    document.getElementById('delete-member-btn').style.display = 'none';
    
    // Controle de exibição da seção de credenciais (apenas Admin pode ver/gerenciar senhas)
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (credentialsSection) {
        credentialsSection.style.display = state.role === 'admin' ? 'block' : 'none';
        document.getElementById('u-username').value = '';
        document.getElementById('u-password').value = '';
    }
    
    personModal.style.display = 'flex';
};

// Preenche e abre o modal de membros para edição de um registro existente
const editPerson = (id) => {
    const person = state.people.find(p => p.id === id);
    if (!person) return;

    document.getElementById('person-modal-title').textContent = 'Editar Membro';
    document.getElementById('p-id').value = person.id;
    document.getElementById('p-name').value = person.name;
    document.getElementById('p-responsible').value = person.responsible || '';
    document.getElementById('p-unit').value = person.unit || '';
    document.getElementById('p-birth').value = person.birth_date || '';
    document.getElementById('p-cpf').value = formatCPF(person.cpf || '');
    
    // Configura seção de credenciais de login para Admin
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (credentialsSection) {
        credentialsSection.style.display = state.role === 'admin' ? 'block' : 'none';
        document.getElementById('u-username').value = person.username || '';
        document.getElementById('u-password').value = ''; // Nunca exibe a senha atual por segurança
        
        const roleSelect = document.getElementById('u-role');
        if (roleSelect) {
            roleSelect.value = person.role || 'member';
            // Apenas o Admin Master (super usuário) pode mudar o nível de permissão (role)
            const isMaster = state.username && state.username.toUpperCase() === 'ADMINISTRADOR';
            roleSelect.disabled = !isMaster;
        }
    }
    
    // Calcula automaticamente a idade com base na data de nascimento
    const age = calculateAge(person.birth_date);
    document.getElementById('p-age').value = age;
    
    // Apenas o administrador master tem o poder de excluir membros definitivamente
    const deleteBtn = document.getElementById('delete-member-btn');
    if (deleteBtn) {
        deleteBtn.style.display = (state.username && state.username.toUpperCase() === 'ADMINISTRADOR') ? 'block' : 'none';
    }
    
    personModal.style.display = 'flex';
};
window.editPerson = editPerson;

// --- Lógica do botão "Voltar ao Topo" ---
const backToTopBtn = document.getElementById('back-to-top');
const scrollContainer = document.querySelector('.content');

// Monitora o scroll para exibir ou esconder o botão flutuante
if (scrollContainer) {
    scrollContainer.onscroll = () => {
        if (scrollContainer.scrollTop > 300) {
            backToTopBtn.style.display = "block";
        } else {
            backToTopBtn.style.display = "none";
        }
    };
}

// Retorna suavemente ao topo do container de conteúdo
backToTopBtn.onclick = () => {
    if (scrollContainer) {
        scrollContainer.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
};

// --- Password Security Logic ---


// --- Lógica de Segurança de Senhas ---

// Regex para validar complexidade da senha: min 5 chars, 1 número, 1 símbolo especial
const complexityRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{5,}$/;

// Modal de Recuperação de Senha (Esqueci minha senha)
const recoverModal = document.getElementById('recover-modal');
const recoverForm = document.getElementById('recover-form');
const forgotLink = document.getElementById('forgot-password-link');

// Abre o modal de recuperação ao clicar no link da tela de login
if (forgotLink) {
    forgotLink.onclick = (e) => {
        e.preventDefault();
        const recoverModal = document.getElementById('recover-modal');
        if (recoverModal) recoverModal.style.display = 'flex';
    };
}

// Botão de fechar o modal de recuperação
const closeRecover = document.getElementById('close-recover-modal');
if (closeRecover) {
    closeRecover.onclick = () => recoverModal.style.display = 'none';
}

// Processa o formulário de redefinição de senha (via Usuário + CPF)
if (recoverForm) {
    recoverForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('recover-username').value;
        const cpf = document.getElementById('recover-cpf').value;
        const newPassword = document.getElementById('recover-new-password').value;
        const errorDiv = document.getElementById('recover-error');

        // Valida se a nova senha atende aos requisitos mínimos
        if (!complexityRegex.test(newPassword)) {
            errorDiv.textContent = 'A senha deve ter no mínimo 5 caracteres, 1 número e 1 caractere especial.';
            return;
        }

        try {
            // Chamada de API para redefinir sem necessidade de login prévio
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

// Formulário para Mudança Forçada de Senha (no primeiro acesso)
const forceChangeForm = document.getElementById('force-change-form');
if (forceChangeForm) {
    forceChangeForm.onsubmit = async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('force-new-password').value;
        const confirmPassword = document.getElementById('force-confirm-password').value;
        const errorDiv = document.getElementById('force-change-error');

        // Validações básicas e de complexidade
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'As senhas não coincidem';
            return;
        }

        if (!complexityRegex.test(newPassword)) {
            errorDiv.textContent = 'A senha deve ter no mínimo 5 caracteres, incluindo pelo menos 1 número e 1 caractere especial.';
            return;
        }

        try {
            // Atualiza a senha e desbloqueia o acesso total ao sistema
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });
            
            document.getElementById('force-change-modal').style.display = 'none';
            checkAuth(); // Verifica novamente o status para carregar o dashboard
        } catch (err) {
            errorDiv.textContent = err.message || 'Erro ao atualizar senha';
        }
    };
}

// Botão de excluir membro (disponível no modal de edição para Administrador Master)
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

// Configura fechamento de todos os modais pelos botões "X"
closeButtons.forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
});


// --- Manipuladores de Formulários ---

// Processa salvamento de Membros (Novo ou Edição)
document.getElementById('person-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    // Coleta dados dos inputs do formulário
    const formData = {
        name: document.getElementById('p-name').value.trim(),
        responsible: document.getElementById('p-responsible').value,
        unit: document.getElementById('p-unit').value,
        birth_date: document.getElementById('p-birth').value,
        cpf: document.getElementById('p-cpf').value,
        username: document.getElementById('u-username').value,
        password: document.getElementById('u-password').value,
        role: document.getElementById('u-role').value
    };
    
    // Validação: Exige pelo menos nome e um sobrenome
    if (!formData.name || formData.name.split(/\s+/).length < 2) {
        showStatus('O nome deve conter pelo menos Nome e Sobrenome.', 'error');
        return;
    }

    // Unidade é campo obrigatório para a gestão financeira
    if (!formData.unit) {
        showStatus('A unidade é obrigatória.', 'error');
        return;
    }

    // Validação algorítmica de CPF
    if (formData.cpf && !isValidCPF(formData.cpf)) {
        showStatus('CPF inválido. Por favor, verifique os dados.', 'error');
        return;
    }

    try {
        // Decide entre criar (POST) ou atualizar (PUT)
        const url = id ? `/api/people/${id}` : '/api/people';
        const method = id ? 'PUT' : 'POST';

        await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        personModal.style.display = 'none';
        e.target.reset();
        await loadInitialData(); // Recarrega para refletir mudanças na tabela
    } catch (err) {
        showStatus(err.message, 'error');
    }
};

// Processa salvamento de Pagamentos de Mensalidades
document.getElementById('payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const isMulti = document.getElementById('p-multi-month-toggle').checked;
    // Pega todos os meses marcados na grade se for "multi-meses"
    const selectedMonths = Array.from(document.querySelectorAll('#p-months-grid input:checked')).map(cb => cb.value);

    if (isMulti && selectedMonths.length === 0) {
        document.getElementById('payment-error').textContent = 'Selecione pelo menos um mês.';
        return;
    }

    const formData = new FormData(); // FormData para envio de comprovante (arquivo)
    formData.append('person_id', document.getElementById('p-person-id').value);
    
    // Formata conforme o tipo de envio (único mês ou múltiplos)
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
        // Envio manual via fetch para controlar o corpo Multipart
        const res = await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });


        if (res.ok) {
            // Se o salvamento for bem-sucedido, fecha o modal e limpa os campos
            paymentModal.style.display = 'none';
            e.target.reset();
            await loadInitialData(); // Atualiza a grade com o novo pagamento (geralmente pendente)
        } else {
            // Em caso de erro do servidor, exibe no campo de erro do modal
            const data = await res.json();
            document.getElementById('payment-error').textContent = data.error;
        }
    } catch (err) {
        showStatus('Erro ao salvar pagamento', 'error');
    }
};


// --- Lógica de Importação de Planilha ---

const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

// Aciona o seletor de arquivos invisível ao clicar no botão de importação
if (importBtn) {
    importBtn.onclick = () => importInput.click();
}

// Detecta quando um arquivo Excel/CSV é selecionado
if (importInput) {
    importInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Feedback visual de carregamento
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
                await loadInitialData(); // Recarrega a lista de membros importados
            } else {
                showStatus(data.error, 'error');
            }
        } catch (err) {
            console.error('Import Error:', err);
            showStatus('Erro ao carregar arquivo: ' + err.message, 'error');
        } finally {
            // Restaura o estado original do botão
            importBtn.disabled = false;
            importBtn.textContent = 'Importar Planilha';
            importInput.value = '';
        }
    };
}


// --- Formulários de Eventos ---

// Abre o modal de criação de novos eventos
const addEventBtn = document.getElementById('add-event-btn');
if (addEventBtn) addEventBtn.onclick = () => {
    document.getElementById('event-form').reset();
    document.getElementById('ev-member-search').value = '';
    renderEventParticipantsChecklist(); // Renderiza a lista de membros para seleção
    eventCreateModal.style.display = 'flex';
};

// Processa a criação de um novo evento
document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    // Coleta IDs de todos os membros selecionados na checklist
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
        fetchEventsData(); // Atualiza a lista de eventos no dashboard
    } catch (err) { showStatus(err.message, 'error'); }
};

// Processa salvamento de pagamentos para Eventos Específicos
document.getElementById('event-payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('event_id', document.getElementById('ep-event-id').value);
    formData.append('month', document.getElementById('ep-month').value);
    formData.append('year', document.getElementById('ep-year').value);
    formData.append('amount', document.getElementById('ep-amount').value);
    
    // Se for Admin pagando por outro membro, injeta o ID correto da pessoa
    if (state.role === 'admin' && state.tempPaymentPersonId) {
        formData.append('person_id', state.tempPaymentPersonId);
    }

    // Anexa o comprovante do evento
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
            // Se estiver na visão detalhada do evento, atualiza ela especificamente
            if (state.currentEvent) openEventDetail(state.currentEvent.id, true);
            else fetchEventsData();
        } else {
            const data = await res.json();
            showStatus(data.error, 'error');
        }
    } catch (err) { showStatus('Erro ao salvar pagamento', 'error'); }
};


// --- Inicialização e Máscaras de Input ---

// Máscara em tempo real para o campo de CPF
const pCpf = document.getElementById('p-cpf');
if (pCpf) {
    pCpf.addEventListener('input', (e) => {
        e.target.value = formatCPF(e.target.value);
    });
}

// Lógica de cálculo automático de idade e sugestão de unidade ao preencher data de nascimento
const pBirth = document.getElementById('p-birth');
if (pBirth) {
    pBirth.addEventListener('change', (e) => {
        const birthDate = e.target.value;
        const age = calculateAge(birthDate);
        const ageField = document.getElementById('p-age');
        const unitField = document.getElementById('p-unit');

        if (ageField) ageField.value = age;
        
        // Sugere Unidade baseada na idade (Padrão: <16 anos = Desbravador)
        if (unitField && age !== '') {
            if (age < 16) {
                unitField.value = 'DESBRAVADOR';
            } else {
                unitField.value = 'DIREÇÃO';
            }
        }
    });
}

// Troca de ano global para todo o sistema
yearSelect.addEventListener('change', (e) => {
    state.currentYear = e.target.value;
    loadInitialData(); // Recarrega todas as mensalidades e estatísticas do novo ano
});


    // Toggle de visibilidade da tabela detalhada de Eventos
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
            initStickyScrollbars(); // Reinicializa barras de rolagem fixas se necessário
        };
    }

    // Toggle de visibilidade da tabela detalhada de Mensalidades (Dashboard Principal)
    // Toggle de visibilidade da tabela detalhada de Mensalidades (Dashboard Principal)
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
            initStickyScrollbars(); // Reinicializa barras de rolagem fixas se necessário
        };
    }
    const addPartBtn = document.getElementById('add-participants-btn');
    if (addPartBtn) addPartBtn.onclick = openAddParticipantsModal;
    
    const saveNewPartBtn = document.getElementById('save-new-participants-btn');
    if (saveNewPartBtn) saveNewPartBtn.onclick = saveNewParticipants;

    // Listeners de busca - Garantem funcionamento imediato ao digitar
    const initSearchListeners = () => {
        const mensSearch = document.getElementById('mens-search');
        if (mensSearch) {
            mensSearch.addEventListener('input', () => {
                const container = document.getElementById('mens-details-table-container');
                // Auto-exibe a tabela ao começar a buscar
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
                // Auto-exibe a tabela de eventos ao buscar
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

    // Garante que os listeners de busca sejam ativados em múltiplos estágios de carregamento
    initSearchListeners();
    document.addEventListener('DOMContentLoaded', initSearchListeners);
    
    // Busca em tempo real no modal de adicionar participantes a eventos
    const searchNewPartInput = document.getElementById('add-member-search');
    if (searchNewPartInput) {
        searchNewPartInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#add-participants-list .checklist-item');
            items.forEach(item => {
                const search = item.dataset.search || '';
                // Filtra visualmente os itens da lista
                item.style.display = search.includes(query) ? 'flex' : 'none';
            });
        };
    }


// --- Lógica de Barra de Rolagem Horizontal Fixa (Sticky) ---

// Essa função cria uma barra de rolagem flutuante que fica fixa na parte inferior da tela
// permitindo rolar tabelas largas mesmo sem chegar ao fim delas.
const initStickyScrollbars = () => {
    // Aplica a lógica em containers de tabela e listas
    const containers = document.querySelectorAll('.table-container, .list-container');
    
    containers.forEach(container => {
        // Evita duplicar a barra flutuante se já foi inicializada
        if (container.dataset.hasStickyScroll) return;
        container.dataset.hasStickyScroll = "true";

        const floatingScroll = document.createElement('div');
        floatingScroll.className = 'floating-scrollbar-container';
        const style = document.createElement('style');
        // Define o estilo do polegar da barra para ser visível mas discreto
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

        // Atualiza a largura da barra flutuante baseada na largura real da tabela
        const updateSize = () => {
            const table = container.querySelector('table');
            if (table) {
                content.style.width = table.offsetWidth + 'px';
                floatingScroll.style.width = container.offsetWidth + 'px';
                floatingScroll.style.left = container.getBoundingClientRect().left + 'px';
            }
        };

        // Sincroniza o scroll da barra flutuante para a tabela
        const syncScroll = () => {
            if (container.scrollLeft !== floatingScroll.scrollLeft) {
                container.scrollLeft = floatingScroll.scrollLeft;
            }
        };

        // Sincroniza o scroll da tabela de volta para a barra flutuante
        const syncContainerScroll = () => {
            if (floatingScroll.scrollLeft !== container.scrollLeft) {
                floatingScroll.scrollLeft = container.scrollLeft;
            }
        };

        floatingScroll.onscroll = syncScroll;
        container.onscroll = syncContainerScroll;

        // Intersection Observer para mostrar/esconder a barra flutuante conforme a tabela entra/sai da tela
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    checkVisibility();
                } else {
                    floatingScroll.style.display = 'none';
                }
            });
        }, { threshold: 0.1 });

        // Lógica principal: exibe a barra apenas se a tabela estiver transbordando e o fundo dela estiver fora da tela
        const checkVisibility = () => {
            const rect = container.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const mobileOffset = window.innerWidth <= 768 ? 75 : 10; 
            
            const isOverflowing = container.scrollWidth > container.clientWidth;
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
        
        // Verificação inicial após um pequeno delay para garantir renderização total
        setTimeout(checkVisibility, 500);
    });
};

// Sobrescreve funções de renderização para garantir que a barra de rolagem seja atualizada
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

// Inicialização principal do sistema ao carregar a janela
window.addEventListener('DOMContentLoaded', () => {
    // Verifica se já existe um token de sessão salvo
    if (getStorageItem('token')) {
        checkAuth(); // Tenta restaurar a sessão automaticamente
    } else {
        // Se não houver token, esconde tela de carregamento e mostra Login
        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'none';
        loginSection.style.display = 'flex';
        mainSection.style.display = 'none';
    }
});

// --- Registro de Service Worker (PWA) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado!', reg))
            .catch(err => console.err('Erro ao registrar Service Worker:', err));
    });
}

// --- Lógica de Instalação do Aplicativo (PWA) ---

// Detecta se o dispositivo é iOS (iPhone/iPad)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
// Verifica se o app já está rodando como "instalado" (standalone)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
let deferredPrompt = null;

// Captura o evento de instalação do Chrome/Android
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Evita o prompt automático feio do navegador
    deferredPrompt = e; // Salva o evento para disparar quando o usuário clicar no botão de instalação
    
    const isDismissed = sessionStorage.getItem('pwa-dismissed');
    
    // Mostra o banner de instalação personalizado se não for instalado e não tiver sido ignorado
    if (!isStandalone && !isDismissed) {
        showPWABanner();
    }
});

// Exibe o banner amigável de instalação
function showPWABanner() {
    const banner = document.getElementById('pwa-install-banner');
    const btn = document.getElementById('pwa-install-btn');
    if (banner) {
        banner.style.display = 'block';
        
        // Ajusta as instruções especificamente para usuários de iOS
        if (isIOS && btn) {
            btn.textContent = 'Como Instalar';
            const pwaTextSpan = banner.querySelector('.pwa-text span');
            if (pwaTextSpan) pwaTextSpan.textContent = 'Toque em compartilhar e "Adicionar à Tela de Início".';
        }
    }
}

// Lógica do botão de instalação no banner
if (installBtn) {
    installBtn.onclick = async () => {
        if (isIOS) {
            // No iOS a instalação é manual via menu de compartilhamento
            showAlert('Para instalar no iPhone:<br><br>1. Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta)<br>2. Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>', 'Instalação no iOS', '📱');
            return;
        }

        if (deferredPrompt) {
            // Dispara o prompt nativo do navegador (Android/Chrome)
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            if (pwaBanner) pwaBanner.style.display = 'none';
        } else {
            // Fallback: Se o prompt não estiver pronto, guia o usuário manualmente
            const manualGuide = document.getElementById('android-manual-guide');
            if (manualGuide) manualGuide.style.display = 'block';
            showAlert('O seu navegador ainda está preparando a instalação. Você pode clicar nos "3 pontinhos" ⋮ do Chrome e selecionar "Instalar Aplicativo" ou usar o guia que apareceu abaixo.', 'Quase pronto');
        }
    };
}

// Fecha o banner de instalação e salva a preferência na sessão
if (closeBtn) {
    closeBtn.onclick = () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        sessionStorage.setItem('pwa-dismissed', 'true');
    };
}

// Atualiza a interface (botões de menu, avisos) conforme o status da instalação
function updatePWAUI() {
    const androidSection = document.getElementById('android-guide-box');
    const iosSection = document.getElementById('ios-guide-box');
    const installedSection = document.getElementById('already-installed-section');
    const menuInstallBtn = document.getElementById('menu-install-btn');
    const pwaInstallCard = document.getElementById('pwa-install-card');
    const pwaBanner = document.getElementById('pwa-install-banner');

    const isMobile = window.innerWidth <= 768;
    const pwaInstallPage = document.getElementById('pwa-install-page');
    const isPageActive = state.activeTab === 'pwa-install' || (pwaInstallPage && pwaInstallPage.style.display === 'block');

    if (isStandalone) {
        // Se já estiver instalado, esconde todos os avisos de instalação
        if (pwaBanner) pwaBanner.style.display = 'none';
        if (menuInstallBtn) menuInstallBtn.style.display = 'none';
        if (pwaInstallCard) pwaInstallCard.style.display = 'none';
        
        if (isPageActive) {
            if (installedSection) installedSection.style.display = 'block';
            if (androidSection) androidSection.style.display = 'none';
            if (iosSection) iosSection.style.display = 'none';
        }
    } else {
        // Se for mobile e não estiver instalado, mostra opções de menu/dashboard
        if (isMobile) {
            if (menuInstallBtn) menuInstallBtn.style.setProperty('display', 'flex', 'important');
            if (pwaInstallCard) pwaInstallCard.style.setProperty('display', 'flex', 'important');
        } else {
            if (menuInstallBtn) menuInstallBtn.style.display = 'none';
            if (pwaInstallCard) pwaInstallCard.style.display = 'none';
        }

        // Mostra o conteúdo específico de ajuda para Android ou iOS
        if (isPageActive) {
            if (isIOS) {
                if (iosSection) iosSection.style.display = 'block';
                if (androidSection) androidSection.style.display = 'none';
            } else if (/Android/.test(navigator.userAgent)) {
                if (androidSection) androidSection.style.display = 'block';
                if (iosSection) iosSection.style.display = 'none';
            } else {
                if (androidSection) androidSection.style.display = 'none';
                if (iosSection) iosSection.style.display = 'none';
            }
            if (installedSection) installedSection.style.display = 'none';
        }
    }
};

// Executa atualização visual do PWA ao iniciar e ao redimensionar tela
updatePWAUI();
window.addEventListener('resize', updatePWAUI);

// Trata o clique no botão de instalação (Menu ou Card)
const handleInstallClick = async (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const target = (e && e.currentTarget) ? e.currentTarget.getAttribute('data-target') : null;
    
    // Direciona para a página de instruções de instalação
    if (target === 'pwa-install' || (e && e.currentTarget === pwaInstallCard)) {
        if (typeof switchTab === 'function') {
            switchTab('pwa-install');
        } else {
            state.activeTab = 'pwa-install';
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            if (pwaInstallPage) pwaInstallPage.style.display = 'block';
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            if (menuInstallBtn) menuInstallBtn.classList.add('active');
            document.getElementById('page-title').textContent = 'Instalar Aplicativo';
            updatePWAUI();
        }
        return;
    }

    if (isStandalone) return;

    if (isIOS) {
        // No iOS apenas mostra a página de guia
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        document.getElementById('page-title').textContent = 'Instalar no iOS';
        return;
    }

    if (!deferredPrompt) {
        // Se o prompt não estiver carregado, mostra o guia manual
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        return;
    }

    // Dispara a instalação nativa do Android
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice: ${outcome}`);
    deferredPrompt = null;
    updatePWAUI();
};

// Vincula eventos de instalação aos botões da UI
if (menuInstallBtn) menuInstallBtn.onclick = handleInstallClick;
if (pwaInstallCard) pwaInstallCard.onclick = handleInstallClick;
if (mainInstallBtn) mainInstallBtn.onclick = handleInstallClick;

// Inicializa ouvintes para o switch de multi-meses
const initMultiMonthListeners = () => {
    document.addEventListener('change', (e) => {
        if (e.target.id === 'p-multi-month-toggle') {
            window.toggleMultiMonth(e.target.checked);
        }
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiMonthListeners);
} else {
    initMultiMonthListeners();
}


// --- Módulo de Vendas Extras (Cantina/Bazar) ---

// Busca lista de vendas no servidor
async function fetchSales() {
    try {
        state.sales = await apiFetch('/api/sales');
        renderSales();
    } catch (err) {
        console.error('Error fetching sales:', err);
    }
}

// Renderiza a tabela de vendas na UI
function renderSales() {
    const body = document.getElementById('sales-body');
    if (!body) return;

    if (state.sales.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhuma venda registrada.</td></tr>';
        return;
    }

    body.innerHTML = state.sales.map(sale => {
        const date = formatDate(sale.date);
        const amount = parseFloat(sale.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        let receiptHtml = '-';
        if (sale.receipt_path) {
            const filename = sale.receipt_path.split(/[\\/]/).pop();
            receiptHtml = `<a href="/api/files/receipt/${filename}?token=${getToken()}" target="_blank" class="btn-text btn-small">Ver Comprovante</a>`;
        }

        return `
            <tr>
                <td><strong>${escapeHTML(sale.event_name)}</strong></td>
                <td>${date}</td>
                <td style="color: var(--outflow-color); font-weight: 600;">+ ${amount}</td>
                <td>${receiptHtml}</td>
                <td>
                    <button class="btn-text btn-small" onclick="deleteSale(${sale.id})">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
};

// Exclui um registro de venda
async function deleteSale(id) {
    if (await showConfirm('Tem certeza que deseja excluir esta venda?')) {
        try {
            await apiFetch(`/api/sales/${id}`, { method: 'DELETE' });
            await loadInitialData();
            if (state.activeTab === 'sales') renderSales();
        } catch (err) {
            showStatus(err.message, 'error');
        }
    }
};

// Processa o formulário de nova venda (incluindo upload de comprovante de depósito se houver)
const salesForm = document.getElementById('sales-form');
if (salesForm) {
    salesForm.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('event_name', document.getElementById('sale-event-name').value);
        formData.append('amount', document.getElementById('sale-amount').value);
        formData.append('date', document.getElementById('sale-date').value);
        formData.append('description', document.getElementById('sale-desc').value);
        
        const file = document.getElementById('sale-receipt').files[0];
        if (file) formData.append('receipt', file);

        try {
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            if (res.ok) {
                showStatus('Venda registrada com sucesso!', 'success');
                e.target.reset();
                await loadInitialData();
                if (state.activeTab === 'sales') renderSales();
            } else {
                const data = await res.json();
                showStatus(data.error, 'error');
            }
        } catch (err) {
            showStatus('Erro ao salvar venda', 'error');
        }
    };
}


// --- Sistema de Notificações e Mensagens ---

// Exibe um modal detalhado ao clicar em uma notificação
function showNotificationModal(notif) {
    const modal = document.getElementById('notification-modal');
    const title = document.getElementById('notif-title');
    const content = document.getElementById('notif-content');
    const closeBtn = document.getElementById('close-notif-btn');

    if (!modal || !title || !content) return;

    title.textContent = notif.title;
    content.textContent = notif.message;
    modal.style.display = 'flex';

    // Ao fechar, marca a notificação como lida no servidor
    closeBtn.onclick = async () => {
        modal.style.display = 'none';
        try {
            await apiFetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
        } catch (err) {
            console.error('Erro ao marcar como lida:', err);
        }
    };
}

// Solicita permissão para notificações Push (Nativas do Navegador/Celular)
async function requestPushPermission() {
    if (!('Notification' in window)) return;
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        subscribeToPush();
    }
}

// Inscreve o dispositivo no servidor de Push (VAPID)
async function subscribeToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const response = await apiFetch('/api/notifications/vapid-public-key');
        const vapidPublicKey = response.publicKey;

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Envia o objeto de inscrição para o backend (onde será salvo vinculado ao usuário)
        await apiFetch('/api/notifications/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription })
        });
        
        console.log('[PUSH] Inscrito com sucesso!');
    } catch (err) {
        console.error('[PUSH] Erro na inscrição:', err);
    }
}

// Auxiliar para converter chave pública base64 para Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


// --- Lógica de Mensagens do Administrador ---

// Renderiza a lista de membros com checkbox para envio de mensagens em massa
async function renderMessages() {
    const container = document.getElementById('members-checkbox-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; padding: 10px; color: var(--text-dim);">Carregando membros...</p>';

    try {
        const people = await apiFetch('/api/people');
        // Filtra apenas membros que possuem conta de usuário no sistema
        const targets = people.filter(p => p.u_id != null);
        targets.sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = '';
        targets.forEach(p => {
            const searchText = `${p.name} ${p.unit || ''}`.toLowerCase();
            const item = document.createElement('div');
            item.className = 'checkbox-item';
            item.setAttribute('data-search', searchText);
            item.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); cursor: pointer;';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `msg-user-${p.u_id}`;
            checkbox.value = p.u_id;
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            
            const label = document.createElement('label');
            label.htmlFor = `msg-user-${p.u_id}`;
            label.innerHTML = `${escapeHTML(p.name)} <br> <small style="color: var(--text-dim)">${escapeHTML(p.unit || 'Sem Unidade')}</small>`;
            label.style.cssText = 'margin: 0; cursor: pointer; font-size: 0.9rem; flex-grow: 1; user-select: none;';
            
            // Permite clicar em qualquer lugar do card para marcar o checkbox
            item.onclick = (e) => {
                if (e.target !== checkbox && e.target !== label) {
                    checkbox.checked = !checkbox.checked;
                }
            };

            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        });
            
        console.log(`[MESSAGES] Lista de checkboxes populada com ${targets.length} membros.`);
    } catch (err) {
        console.error('Erro ao carregar membros para mensagens:', err);
        container.innerHTML = '<p style="color: var(--error-color); padding: 10px;">Erro ao carregar lista.</p>';
    }
}

// Inicializações finais de módulos persistentes
initializeNotifications();
initMessageForm();

// Fim do arquivo public/app.js - Sistema de Gestão Financeira v1.0

