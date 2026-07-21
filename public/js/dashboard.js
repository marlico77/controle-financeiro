// --- Processamento de Estatísticas do Dashboard ---
// Calcula e distribui todos os valores financeiros do sistema para exibição nos cards e gráficos
const updateDashboardStats = () => {
    let totalCash = 0; // Saldo total em caixa
    let direcaoTotal = 0; // Total arrecadado da unidade Direção
    let desbravadoresTotal = 0; // Total arrecadado da unidade Desbravadores
    let eventosTotal = 0; // Total vindo de eventos

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

    // Atualiza os elementos visuais do Dashboard (se for Admin)
    if (state.role === 'admin') {
        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const direcaoStat = document.getElementById('stat-direcao');
        const desbravaStat = document.getElementById('stat-desbravadores');
        const eventosStat = document.getElementById('stat-eventos');
        const outflowsStat = document.getElementById('stat-total-outflows');
        const outflowsCard = document.getElementById('stat-outflows-card');

        // Exibe os valores formatados nos respectivos cards
        if (direcaoStat) direcaoStat.textContent = `R$ ${direcaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (desbravaStat) desbravaStat.textContent = `R$ ${desbravadoresTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (eventosStat) eventosStat.textContent = `R$ ${eventosTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        if (outflowsStat) outflowsStat.textContent = `R$ ${totalOutflows.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
        // Estatísticas simplificadas para membros comuns, secretários e responsáveis (painel pessoal/familiar)
        const myPayments = (state.role === 'responsible')
            ? state.payments.filter(p => p.person_id != state.personId && p.status === 'approved')
            : state.payments.filter(p => p.person_id == state.personId && p.status === 'approved');
            
        const familyPeopleCount = (state.role === 'responsible') ? state.people.filter(p => p.id != state.personId).length : 1;
        const paidMonths = myPayments.length;
        const pendingMonths = (familyPeopleCount * 12) - paidMonths;
        const myTotalCash = myPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const totalCashElem = document.getElementById('stat-total-cash');
        if (totalCashElem) totalCashElem.textContent = `R$ ${myTotalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        // Processa pagamentos de eventos do membro/família para exibir no card correspondente
        let myEventsTotal = 0;
        if (state.eventPayments) {
            const myEventPayments = (state.role === 'responsible')
                ? state.eventPayments.filter(p => p.person_id != state.personId && p.status === 'approved')
                : state.eventPayments.filter(p => p.person_id == state.personId && p.status === 'approved');
            myEventsTotal = myEventPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        }
        const eventosStat = document.getElementById('stat-eventos');
        if (eventosStat) eventosStat.textContent = `R$ ${myEventsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

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

    // Processa pagamentos apenas deste evento e para o usuário logado/família se não for Admin
    const paymentsToProcess = state.role === 'admin'
        ? payments
        : (state.role === 'responsible'
            ? payments.filter(p => p.person_id != state.personId)
            : payments.filter(p => p.person_id == state.personId));
    paymentsToProcess.forEach(p => {
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

    if (totalStat) totalStat.textContent = `R$ ${evTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (direcaoStat) direcaoStat.textContent = `R$ ${evDirecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (desbravaStat) desbravaStat.textContent = `R$ ${evDesbrava.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    if (direcaoStat && desbravaStat) {
        const direcaoCard = direcaoStat.closest('.stat-card');
        const desbravaCard = desbravaStat.closest('.stat-card');
        const totalLabel = totalStat.previousElementSibling;
        const pieChartContainer = document.getElementById('evPieChart')?.closest('.chart-container');
        
        if (state.role === 'admin') {
            if (direcaoCard) direcaoCard.style.display = 'block';
            if (desbravaCard) desbravaCard.style.display = 'block';
            if (totalLabel) totalLabel.textContent = 'Arrecadação do Evento';
            if (pieChartContainer) pieChartContainer.style.display = 'block';
            
            // Gráfico de pizza do evento (Receita por Unidade)
            renderPieChart(
                ['Direção', 'Desbravadores', 'Outros'],
                [evDirecao, evDesbrava, evOutros],
                ['#e50914', '#111111', '#707070'],
                'evPieChart',
                'evPie'
            );
        } else {
            if (direcaoCard) direcaoCard.style.display = 'none';
            if (desbravaCard) desbravaCard.style.display = 'none';
            if (totalLabel) totalLabel.textContent = 'Total Pago';
            if (pieChartContainer) pieChartContainer.style.display = 'none';
        }
    }

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

    const paymentsToProcess = state.role === 'admin'
        ? state.payments
        : (state.role === 'responsible'
            ? state.payments.filter(p => p.person_id != state.personId)
            : state.payments.filter(p => p.person_id == state.personId));
    paymentsToProcess.forEach(p => {
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
    const el_mens_stat_total = document.getElementById('mens-stat-total');
    if (el_mens_stat_total) el_mens_stat_total.textContent = `R$ ${mTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const el_mens_stat_direcao = document.getElementById('mens-stat-direcao');
    if (el_mens_stat_direcao) el_mens_stat_direcao.textContent = `R$ ${mDirecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const el_mens_stat_desbrava = document.getElementById('mens-stat-desbrava');
    if (el_mens_stat_desbrava) el_mens_stat_desbrava.textContent = `R$ ${mDesbrava.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

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
        type: 'pie',
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
            cutout: '0%', // Pizza cheia
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#707070' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
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
                        label: function (context) {
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
                        callback: function (value) {
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
        } catch{
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
    if (paymentsBody) paymentsBody.innerHTML = '';
    const footer = document.getElementById('payments-footer');
    if (footer) footer.innerHTML = '';

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

    // Define quais pessoas renderizar: Admin vê todos (exceto responsáveis), responsável vê apenas os filhos, membro/secretário vê apenas a si mesmo
    const peopleToRender = state.role === 'admin'
        ? state.people.filter(p => p.unit !== 'Responsável')
        : (state.role === 'responsible'
            ? state.people.filter(p => p.id != state.personId)
            : state.people.filter(p => p.id == state.personId));

    // Pré-processa os dados dos membros com status de pagamento e totais
    const processedPeople = peopleToRender.map(person => {
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
        const totalStr = `R$ ${personTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
                    monthlyTotals[m - 1] += amount;
                    grandTotal += amount;
                }
            } else {
                // Se não há registro no banco, assume estado neutro de pendência
                label.classList.add('status-none');
                label.textContent = 'PENDENTE';
            }

            // Ao clicar na célula, abre o modal de pagamento se tiver permissão
            td.onclick = () => {
                const canEdit = state.role === 'admin' || state.role === 'responsible' || (state.personId && person.id == state.personId);
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
        totalTd.textContent = `R$ ${personTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        tr.appendChild(totalTd);

        fragment.appendChild(tr);
    });

    // Adiciona todas as linhas processadas de uma vez ao corpo da tabela
    if (paymentsBody) paymentsBody.appendChild(fragment);

    // Renderiza o rodapé da tabela com os totais mensais por coluna
    const footerTr = document.createElement('tr');
    footerTr.innerHTML = '<td><strong>TOTAL MENSAL</strong></td>';

    monthlyTotals.forEach(total => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        td.innerHTML = `<strong>R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>`;
        footerTr.appendChild(td);
    });

    // Célula do canto inferior direito com o total geral arrecadado (considerando os filtros)
    const grandTotalTd = document.createElement('td');
    grandTotalTd.className = 'total-column';
    grandTotalTd.innerHTML = `<strong>R$ ${grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>`;
    footerTr.appendChild(grandTotalTd);

    if (footer) footer.appendChild(footerTr);
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
window.setSort = setSort;

// Renderiza a tabela de gerenciamento de membros (aba Membros)
function renderPeople() {
    if (peopleBody) peopleBody.innerHTML = '';

    // Filtro de busca global (Nome, Usuário, Unidade, CPF, Responsável)
    const searchQuery = document.getElementById('global-search')?.value.toLowerCase() || '';

    let processedPeople = state.people.filter(p => {
        if (p.unit === 'Responsável') return false; // Oculta responsáveis da aba de membros
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
        if (peopleBody) peopleBody.appendChild(tr);
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
    } else if (e.target.id === 'site-calendar-search') {
        renderSiteCalendar();
    }
});

let serverTimeOffset = 0;

// Sincroniza o horário com o servidor para garantir que travas usem o Horário de Brasília
fetch('/api/time')
    .then(res => res.json())
    .then(data => {
        serverTimeOffset = data.timestamp - Date.now();
    })
    .catch(err => console.error('Erro ao sincronizar horário:', err));

const isSabbathBlocked = () => {
    if (state.role === 'admin') return false;
    const now = new Date(Date.now() + serverTimeOffset);
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        weekday: 'short',
        hour: 'numeric',
        hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    let weekday = '', hour = 0;
    
    for (const part of parts) {
        if (part.type === 'weekday') weekday = part.value;
        if (part.type === 'hour') hour = parseInt(part.value, 10);
    }
    
    // Sábado = Sexta (Fri) a partir das 18h até Sábado (Sat) antes das 18h
    return (weekday === 'Fri' && hour >= 18) || (weekday === 'Sat' && hour < 18);
};

const sabbathIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="60" height="60" fill="var(--accent-color)"><path d="M320 32C328.4 32 336.3 36.4 340.6 43.7L396.1 136.3L500.9 110C509.1 108 517.8 110.4 523.7 116.3C529.6 122.2 532 131 530 139.1L503.7 243.8L596.4 299.3C603.6 303.6 608.1 311.5 608.1 319.9C608.1 328.3 603.7 336.2 596.4 340.5L503.7 396.1L530 500.8C532 509 529.6 517.7 523.7 523.6C517.8 529.5 509 532 500.9 530L396.2 503.7L340.7 596.4C336.4 603.6 328.5 608.1 320.1 608.1C311.7 608.1 303.8 603.7 299.5 596.4L243.9 503.7L139.2 530C131 532 122.4 529.6 116.4 523.7C110.4 517.8 108 509 110 500.8L136.2 396.1L43.6 340.6C36.4 336.2 32 328.4 32 320C32 311.6 36.4 303.7 43.7 299.4L136.3 243.9L110 139.1C108 130.9 110.3 122.3 116.3 116.3C122.3 110.3 131 108 139.2 110L243.9 136.2L299.4 43.6L301.2 41C305.7 35.3 312.6 31.9 320 31.9zM320 176C240.5 176 176 240.5 176 320C176 399.5 240.5 464 320 464C399.5 464 464 399.5 464 320C464 240.5 399.5 176 320 176zM320 416C267 416 224 373 224 320C224 267 267 224 320 224C373 224 416 267 416 320C416 373 373 416 320 416z"/></svg>`;

