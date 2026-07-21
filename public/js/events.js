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

    // Define quais eventos renderizar: Admin vê todos, membro/secretário vê apenas os que participa
    const eventsToRender = state.role === 'admin' ? state.events : state.events.filter(e => e.is_participant);

    // Gera o HTML para cada cartão de evento
    // Gera o HTML para cada cartão de evento
    list.innerHTML = eventsToRender.map(event => {
        const canViewDetails = state.role === 'admin' || state.role === 'secretário';
        return `
            <div class="glass-card event-card animate-fade-in" style="padding: 1.5rem; margin-bottom: 1rem; cursor: pointer;" onclick="openEventDetail(${event.id})">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4 style="margin: 0; color: var(--accent-color);">${escapeHTML(event.name)}</h4>
                    ${state.role === 'admin' ? `<button class="btn-text" onclick="event.stopPropagation(); deleteEvent(${event.id})" style="padding: 0; min-height: auto; display: flex; align-items: center; justify-content: center; color: var(--text-dim); transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor">
                            <path d="M262.2 48C248.9 48 236.9 56.3 232.2 68.8L216 112L120 112C106.7 112 96 122.7 96 136C96 149.3 106.7 160 120 160L520 160C533.3 160 544 149.3 544 136C544 122.7 533.3 112 520 112L424 112L407.8 68.8C403.1 56.3 391.2 48 377.8 48L262.2 48zM128 208L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 208L464 208L464 512C464 520.8 456.8 528 448 528L192 528C183.2 528 176 520.8 176 512L176 208L128 208zM288 280C288 266.7 277.3 256 264 256C250.7 256 240 266.7 280L240 456C240 469.3 250.7 480 264 480C277.3 480 288 469.3 288 456L280zM400 280C400 266.7 389.3 256 376 256C362.7 256 352 266.7 352 280L352 456C352 469.3 362.7 480 376 480C389.3 480 400 469.3 400 456L400 280z"/>
                        </svg>
                    </button>` : ''}
                </div>
                <p class="event-date" style="font-size: 0.8rem; color: var(--text-dim); margin-top: 5px;">${event.date ? formatDate(event.date) : 'Sem data'}</p>
                
                ${canViewDetails ? `
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
                ` : ''}

                <p class="event-desc" style="font-size: 0.9rem; margin-top: 10px;">${escapeHTML(event.description || 'Sem descrição')}</p>
                
                <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--accent-color); font-weight: 500;">
                    Clique para ver detalhamento →
                </div>
            </div>
        `;
    }).join('');

    if (eventsToRender.length === 0) {
        list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 3rem;">Nenhum evento cadastrado ou disponível no momento.</p>';
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
            const addEventBtn = document.getElementById('add-event-btn');
            const addPartBtn = document.getElementById('add-participants-btn');
            if (addEventBtn) addEventBtn.style.display = 'none';
            if (addPartBtn) addPartBtn.style.display = state.role === 'admin' ? 'block' : 'none';

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
let renderEventDetailGrid = (participants, payments) => {
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

    // Define quais participantes renderizar: Admin vê todos, responsável vê apenas os filhos, membro/secretário vê apenas a si mesmo
    const participantsToRender = state.role === 'admin'
        ? participants
        : (state.role === 'responsible'
            ? participants.filter(p => p.id != state.personId)
            : participants.filter(p => p.id == state.personId));

    const rows = [];
    participantsToRender.forEach(p => {
        const pId = String(p.id);
        const personPayments = paymentsByPerson[pId] || [];

        let totalPaid = 0;
        // Soma apenas os pagamentos aprovados para o total da linha
        personPayments.forEach(pay => {
            if (pay.status === 'approved') totalPaid += parseFloat(pay.amount || 0);
        });

        const totalStr = `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
    // Segurança: Somente o próprio membro, responsável ou Admins/Secretários podem registrar pagamentos
    if (state.role !== 'admin' && state.role !== 'secretário' && state.role !== 'responsible' && parseInt(personId) !== parseInt(state.personId)) return;

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


// Renderiza a lista de membros (checklist) para adicionar a um evento
const renderEventParticipantsChecklist = () => {
    const list = document.getElementById('event-participants-list');
    const unitFilter = document.getElementById('ev-unit-filter');

    // Extrai as unidades únicas de todos os membros (filtrando responsáveis)
    const units = [...new Set(state.people.filter(p => p.unit !== 'Responsável').map(p => p.unit).filter(u => u))].sort();
    unitFilter.innerHTML = `
        <option value="">Selecionar</option>
        <option value="ALL">Todos os Membros</option>
        ${units.map(u => `<option value="${u}">Unidade: ${u}</option>`).join('')}
    `;

    // Gera o HTML da lista de seleção (filtrando responsáveis)
    list.innerHTML = state.people.filter(p => p.unit !== 'Responsável').map(p => {
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
    const available = state.people.filter(p => p.unit !== 'Responsável' && !existingIds.includes(p.id));

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
    // Bloqueia a abertura do modal se estiver pendente nas horas do Sábado
    if ((!payment || payment.status === 'pending') && isSabbathBlocked()) {
        showAlert('<div style="font-size: 1.1rem; line-height: 1.5; color: var(--accent-color);"><strong>"Lembra-te do dia de sábado, para o santificar."</strong><br><span style="font-size: 0.9rem;">(Êxodo 20:8)</span></div><br><p style="margin-top: 10px;">O sistema não aceitará anexos de comprovantes de pagamento durante as horas do Sábado.</p><p style="margin-top: 5px;">Por favor, aguarde e tente novamente após as 18h de sábado.</p>', 'Horas do Sábado', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="60" height="60" fill="var(--accent-color)"><path d="M320 32C328.4 32 336.3 36.4 340.6 43.7L396.1 136.3L500.9 110C509.1 108 517.8 110.4 523.7 116.3C529.6 122.2 532 131 530 139.1L503.7 243.8L596.4 299.3C603.6 303.6 608.1 311.5 608.1 319.9C608.1 328.3 603.7 336.2 596.4 340.5L503.7 396.1L530 500.8C532 509 529.6 517.7 523.7 523.6C517.8 529.5 509 532 500.9 530L396.2 503.7L340.7 596.4C336.4 603.6 328.5 608.1 320.1 608.1C311.7 608.1 303.8 603.7 299.5 596.4L243.9 503.7L139.2 530C131 532 122.4 529.6 116.4 523.7C110.4 517.8 108 509 110 500.8L136.2 396.1L43.6 340.6C36.4 336.2 32 328.4 32 320C32 311.6 36.4 303.7 43.7 299.4L136.3 243.9L110 139.1C108 130.9 110.3 122.3 116.3 116.3C122.3 110.3 131 108 139.2 110L243.9 136.2L299.4 43.6L301.2 41C305.7 35.3 312.6 31.9 320 31.9zM320 176C240.5 176 176 240.5 176 320C176 399.5 240.5 464 320 464C399.5 464 464 399.5 464 320C464 240.5 399.5 176 320 176zM320 416C267 416 224 373 224 320C224 267 267 224 320 224C373 224 416 267 416 320C416 373 373 416 320 416z"/></svg>');
        return;
    }

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

            // Ações extras exclusivas para Administrador em pagamentos pendentes
            if (state.role === 'admin') {
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
        } catch{
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
window.deleteEvent = deleteEvent;


