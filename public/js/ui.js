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
        phone: document.getElementById('p-phone').value.trim(),
        username: document.getElementById('u-username').value,
        password: document.getElementById('u-password').value,
        role: document.getElementById('u-role').value,
        responsiblePassword: document.getElementById('u-resp-password') ? document.getElementById('u-resp-password').value : ''
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
    } catch{
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

    // Se for Admin/Secretário/Responsável pagando por outro membro, injeta o ID correto da pessoa
    if ((state.role === 'admin' || state.role === 'secretário' || state.role === 'responsible') && state.tempPaymentPersonId) {
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
    } catch{ showStatus('Erro ao salvar pagamento', 'error'); }
};


// --- Inicialização e Máscaras de Input ---

// Máscara em tempo real para o campo de Telefone/WhatsApp
const formatPhone = (value) => {
    if (!value) return '';
    let cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
    
    if (cleaned.length > 10) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length > 6) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length > 2) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    } else if (cleaned.length > 0) {
        return `(${cleaned}`;
    }
    return '';
};

const pPhone = document.getElementById('p-phone');
if (pPhone) {
    pPhone.addEventListener('input', (e) => {
        e.target.value = formatPhone(e.target.value);
    });
}

// Máscara em tempo real para o campo de CPF
const pCpf = document.getElementById('p-cpf');
if (pCpf) {
    pCpf.addEventListener('input', (e) => {
        e.target.value = formatCPF(e.target.value);
    });
}

// Máscara em tempo real para o campo de CPF da recuperação de senha
const recoverCpf = document.getElementById('recover-cpf');
if (recoverCpf) {
    recoverCpf.addEventListener('input', (e) => {
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
if (typeof yearSelect !== 'undefined' && yearSelect) yearSelect.addEventListener('change', (e) => {
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
if (addPartBtn && typeof openAddParticipantsModal !== 'undefined') addPartBtn.onclick = openAddParticipantsModal;

const saveNewPartBtn = document.getElementById('save-new-participants-btn');
if (saveNewPartBtn && typeof saveNewParticipants !== 'undefined') saveNewPartBtn.onclick = saveNewParticipants;

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
initSearchListeners();

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
if (typeof renderDashboard !== 'undefined') {
    const originalRenderDashboard = renderDashboard;
    window.renderDashboard = (...args) => {
        originalRenderDashboard(...args);
        setTimeout(initStickyScrollbars, 100);
    };
}

if (typeof renderPeople !== 'undefined') {
    const originalRenderPeople = renderPeople;
    window.renderPeople = (...args) => {
        originalRenderPeople(...args);
        setTimeout(initStickyScrollbars, 100);
    };
}

if (typeof renderEventDetailGrid !== 'undefined') {
    const originalRenderEventDetailGrid = renderEventDetailGrid;
    window.renderEventDetailGrid = (...args) => {
        originalRenderEventDetailGrid(...args);
        setTimeout(initStickyScrollbars, 100);
    };
}

if (typeof renderOutflows !== 'undefined') {
    const originalRenderOutflows = renderOutflows;
    window.renderOutflows = (...args) => {
        originalRenderOutflows(...args);
        setTimeout(initStickyScrollbars, 100);
    };
}

// Inicialização principal do sistema (Executa imediatamente pois o DOM já foi carregado via loader)
if (getStorageItem('token')) {
    checkAuth(); // Tenta restaurar a sessão automaticamente
} else {
    // Se não houver token, esconde tela de carregamento e mostra Login
    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';
    const loginSection = document.getElementById('login-section');
    const mainSection = document.getElementById('main-section');
    if (loginSection) loginSection.style.display = 'flex';
    if (mainSection) mainSection.style.display = 'none';
}

