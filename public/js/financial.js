// --- Lógica de Modais de Pagamento ---
function populateGuardianOptions() {
    const field = document.getElementById('p-responsible');
    if (!field || !['admin', 'secretário'].includes(state.role)) return;
    let select = document.getElementById('p-responsible-id');
    if (!select) {
        const wrapper = document.createElement('div');
        wrapper.className = 'input-group';
        const label = document.createElement('label');
        label.textContent = 'Conta do responsável autorizado';
        label.htmlFor = 'p-responsible-id';
        select = document.createElement('select');
        select.id = 'p-responsible-id';
        wrapper.append(label, select);
        field.parentElement.after(wrapper);
    }
    const previous = select.value;
    select.replaceChildren(new Option('Sem vínculo de acesso', ''));
    state.people.filter(p => p.role === 'responsible').forEach(p => select.add(new Option(`${p.name} (${p.username})`, p.id)));
    select.value = previous;
}

// Abre o modal para registro de mensalidades individuais
const openPaymentModal = (person, month, payment = null) => {
    // Bloqueia a abertura do modal se estiver pendente/sem pagamento nas horas do Sábado
    if ((!payment || payment.status === 'pending') && isSabbathBlocked()) {
        showAlert('<div style="font-size: 1.1rem; line-height: 1.5; color: var(--accent-color);"><strong>"Lembra-te do dia de sábado, para o santificar."</strong><br><span style="font-size: 0.9rem;">(Êxodo 20:8)</span></div><br><p style="margin-top: 10px;">O sistema não aceitará anexos de comprovantes de pagamento durante as horas do Sábado.</p><p style="margin-top: 5px;">Por favor, aguarde e tente novamente após as 18h de sábado.</p>', 'Horas do Sábado', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="60" height="60" fill="var(--accent-color)"><path d="M320 32C328.4 32 336.3 36.4 340.6 43.7L396.1 136.3L500.9 110C509.1 108 517.8 110.4 523.7 116.3C529.6 122.2 532 131 530 139.1L503.7 243.8L596.4 299.3C603.6 303.6 608.1 311.5 608.1 319.9C608.1 328.3 603.7 336.2 596.4 340.5L503.7 396.1L530 500.8C532 509 529.6 517.7 523.7 523.6C517.8 529.5 509 532 500.9 530L396.2 503.7L340.7 596.4C336.4 603.6 328.5 608.1 320.1 608.1C311.7 608.1 303.8 603.7 299.5 596.4L243.9 503.7L139.2 530C131 532 122.4 529.6 116.4 523.7C110.4 517.8 108 509 110 500.8L136.2 396.1L43.6 340.6C36.4 336.2 32 328.4 32 320C32 311.6 36.4 303.7 43.7 299.4L136.3 243.9L110 139.1C108 130.9 110.3 122.3 116.3 116.3C122.3 110.3 131 108 139.2 110L243.9 136.2L299.4 43.6L301.2 41C305.7 35.3 312.6 31.9 320 31.9zM320 176C240.5 176 176 240.5 176 320C176 399.5 240.5 464 320 464C399.5 464 464 399.5 464 320C464 240.5 399.5 176 320 176zM320 416C267 416 224 373 224 320C224 267 267 224 320 224C373 224 416 267 416 320C416 373 373 416 320 416z"/></svg>');
        return;
    }

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
    const rejectionReasonText = document.getElementById('rejection-reason-text');
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

    // Pré-seleciona o mês atual na grade de multi-meses (tanto para novos quanto para edições)
    const gridInputs = document.querySelectorAll('#p-months-grid input');
    gridInputs.forEach(inp => {
        if (parseInt(inp.value) === parseInt(month)) {
            inp.checked = true;
            inp.parentElement.classList.add('selected');
        }
    });

    // Se estiver editando um pagamento já existente
    if (payment) {
        title.textContent = 'Gerenciar Pagamento';
        amountInput.value = payment.amount;

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
        } catch{
            showStatus('Erro ao excluir pagamento', 'error');
        }
    }
};

// --- Ciclo de Vida de Contas (Desativar / Reativar - Admin Only) ---
const hasValidUserAccount = (person) => {
    const uid = Number(person?.u_id);
    return Number.isInteger(uid) && uid > 0;
};

const normalizeAccountStatus = (person) => {
    if (!hasValidUserAccount(person)) return 'none';
    return person.account_status === 'disabled' ? 'disabled' : 'active';
};

const getAccountStatusBadgeHTML = (person) => {
    const status = normalizeAccountStatus(person);
    if (status === 'none') {
        return '<span class="grid-status-label status-none" title="Membro sem conta vinculada (u_id ausente)">SEM CONTA</span>';
    }
    if (status === 'disabled') {
        return '<span class="grid-status-label status-rejected" title="Conta desativada">DESATIVADA</span>';
    }
    return '<span class="grid-status-label status-approved" title="Conta ativa">ATIVA</span>';
};
window.getAccountStatusBadgeHTML = getAccountStatusBadgeHTML;

// Altera o status da conta (active | disabled) usando obrigatoriamente users.id (u_id)
const toggleAccountStatus = async (userId, targetStatus, personId = null) => {
    if (state.role !== 'admin') {
        showStatus('Apenas administradores podem gerenciar o status de contas.', 'error');
        return;
    }

    // Localiza o membro garantindo distinção estrita entre person.id e users.id (u_id)
    const person = state.people.find(p =>
        (personId !== null && personId !== undefined && Number(p.id) === Number(personId)) ||
        (hasValidUserAccount(p) && Number(p.u_id) === Number(userId))
    );

    const resolvedUserId = Number(person ? person.u_id : userId);
    if (!person || !Number.isInteger(resolvedUserId) || resolvedUserId <= 0) {
        showStatus('Não é permitido alterar o status: conta de usuário (u_id) ausente.', 'error');
        return;
    }

    const currentStatus = normalizeAccountStatus(person);
    const nextStatus = (targetStatus === 'active' || targetStatus === 'disabled')
        ? targetStatus
        : (currentStatus === 'disabled' ? 'active' : 'disabled');

    const isDeactivating = nextStatus === 'disabled';
    const actionTitle = isDeactivating ? 'Desativar Conta' : 'Reativar Conta';
    const confirmMessage = isDeactivating
        ? `Tem certeza que deseja desativar a conta de acesso de ${person.name} (${person.username || 'ID #' + resolvedUserId})? O histórico financeiro será preservado, mas o login ficará bloqueado.`
        : `Deseja reativar a conta de acesso de ${person.name} (${person.username || 'ID #' + resolvedUserId})?`;

    const confirmed = await showConfirm(confirmMessage, actionTitle);
    if (!confirmed) return;

    try {
        await apiFetch(`/api/admin/accounts/${resolvedUserId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
        });

        showStatus(
            isDeactivating ? 'Conta desativada com sucesso!' : 'Conta reativada com sucesso!',
            'success'
        );

        await loadInitialData();
        if (typeof renderPeople === 'function') renderPeople();

        // Se o modal de edição deste membro estiver aberto, sincroniza seu estado visual
        const openPersonId = document.getElementById('p-id')?.value;
        if (personModal && personModal.style.display === 'flex' && Number(openPersonId) === Number(person.id)) {
            const updatedPerson = state.people.find(p => Number(p.id) === Number(person.id));
            if (updatedPerson) syncModalAccountLifecycleUI(updatedPerson);
        }
    } catch (err) {
        showStatus(err.message || 'Erro ao atualizar status da conta.', 'error');
    }
};
window.toggleAccountStatus = toggleAccountStatus;

const syncModalAccountLifecycleUI = (person) => {
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (!credentialsSection) return;

    let lifecycleBox = document.getElementById('account-lifecycle-section');
    if (!lifecycleBox) {
        lifecycleBox = document.createElement('div');
        lifecycleBox.id = 'account-lifecycle-section';
        lifecycleBox.style.cssText = 'margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border-color); display: none; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;';
        lifecycleBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span style="font-size: 0.9rem; color: var(--text-dim); font-weight: 600;">Status da Conta:</span>
                <span id="u-account-status-badge"></span>
            </div>
            <button type="button" id="u-account-toggle-btn" class="btn-secondary btn-small" style="margin: 0;"></button>
        `;
        credentialsSection.appendChild(lifecycleBox);
    }

    if (state.role !== 'admin' || !person) {
        lifecycleBox.style.display = 'none';
        return;
    }

    lifecycleBox.style.display = 'flex';
    const badgeContainer = document.getElementById('u-account-status-badge');
    const toggleBtn = document.getElementById('u-account-toggle-btn');

    if (badgeContainer) {
        badgeContainer.innerHTML = getAccountStatusBadgeHTML(person);
    }

    if (toggleBtn) {
        if (!hasValidUserAccount(person)) {
            toggleBtn.disabled = true;
            toggleBtn.textContent = 'Conta sem u_id';
            toggleBtn.style.opacity = '0.5';
            toggleBtn.style.cursor = 'not-allowed';
            toggleBtn.onclick = null;
        } else {
            const isDisabled = normalizeAccountStatus(person) === 'disabled';
            const nextStatus = isDisabled ? 'active' : 'disabled';
            const userId = Number(person.u_id);
            toggleBtn.disabled = false;
            toggleBtn.style.opacity = '1';
            toggleBtn.style.cursor = 'pointer';
            toggleBtn.textContent = isDisabled ? 'Reativar Conta' : 'Desativar Conta';
            toggleBtn.style.background = isDisabled ? 'rgba(76, 175, 80, 0.15)' : 'rgba(229, 9, 20, 0.15)';
            toggleBtn.style.color = isDisabled ? '#4caf50' : 'var(--error-color, #e50914)';
            toggleBtn.style.border = isDisabled ? '1px solid rgba(76, 175, 80, 0.4)' : '1px solid rgba(229, 9, 20, 0.4)';
            toggleBtn.onclick = () => toggleAccountStatus(userId, nextStatus, Number(person.id));
        }
    }
};

// Configura o modal de membros para a criação de um novo registro
document.getElementById('add-person-btn').onclick = () => {
    document.getElementById('person-modal-title').textContent = 'Novo Membro';
    document.getElementById('p-id').value = '';
    document.getElementById('person-form').reset();
    if (document.getElementById('p-email')) document.getElementById('p-email').value = '';

    // Controle de exibição da seção de credenciais (apenas Admin pode ver/gerenciar senhas)
    const credentialsSection = document.getElementById('admin-only-credentials');
    if (credentialsSection) {
        credentialsSection.style.display = state.role === 'admin' ? 'block' : 'none';
        document.getElementById('u-username').value = '';
        document.getElementById('u-password').value = '';
    }
    syncModalAccountLifecycleUI(null);

    const respCredentialsSection = document.getElementById('responsible-credentials-section');
    if (respCredentialsSection) {
        respCredentialsSection.style.display = 'none';
        document.getElementById('u-resp-username').value = '';
        document.getElementById('u-resp-password').value = '';
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
    if (document.getElementById('p-responsible-id')) document.getElementById('p-responsible-id').value = person.responsible_id || '';
    document.getElementById('p-unit').value = person.unit || '';
    document.getElementById('p-birth').value = person.birth_date || '';
    document.getElementById('p-cpf').value = formatCPF(person.cpf || '');
    document.getElementById('p-phone').value = person.phone || '';
    if (document.getElementById('p-email')) document.getElementById('p-email').value = person.email || '';

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
            const isMaster = state.isMaster;
            roleSelect.disabled = !isMaster;
        }
    }
    syncModalAccountLifecycleUI(person);

    // Configura seção de credenciais do responsável
    const respCredentialsSection = document.getElementById('responsible-credentials-section');
    if (respCredentialsSection) {
        const respPerson = (state.role === 'admin' && person.responsible)
            ? state.people.find(p => p.name.trim().toLowerCase() === person.responsible.trim().toLowerCase())
            : null;

        if (respPerson && respPerson.username) {
            respCredentialsSection.style.display = 'none';
            document.getElementById('u-resp-username').value = respPerson.username;
            document.getElementById('u-resp-password').value = '';
        } else {
            respCredentialsSection.style.display = 'none';
            document.getElementById('u-resp-username').value = '';
            document.getElementById('u-resp-password').value = '';
        }
    }

    // Calcula automaticamente a idade com base na data de nascimento
    const age = calculateAge(person.birth_date);
    document.getElementById('p-age').value = age;



    personModal.style.display = 'flex';
};
window.editPerson = editPerson;
