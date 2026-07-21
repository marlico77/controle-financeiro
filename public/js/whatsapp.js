// --- Gerenciador do Painel do WhatsApp (W-API) ---
const initWhatsAppForm = () => {
    const tabSystem = document.getElementById('tab-system-messages');
    const tabWhatsapp = document.getElementById('tab-whatsapp-messages');
    const containerSystem = document.getElementById('system-messages-container');
    const containerWhatsapp = document.getElementById('whatsapp-messages-container');
    const configForm = document.getElementById('whatsapp-config-form');

    if (!tabSystem || !tabWhatsapp) return;

    // --- Lógica do Painel de Cobranças ---
    const billingForm = document.getElementById('whatsapp-billing-form');
    const billMonthSelect = document.getElementById('wa-bill-month');
    const billValueInput = document.getElementById('wa-bill-value');
    const billPixInput = document.getElementById('wa-bill-pix');
    const billTemplateTextarea = document.getElementById('wa-bill-template');
    const billPreviewDiv = document.getElementById('wa-bill-preview');
    const billSearchInput = document.getElementById('wa-bill-search');
    const billSelectAllCheckbox = document.getElementById('wa-bill-select-all');
    const billMembersBody = document.getElementById('wa-bill-members-body');
    const billCountText = document.getElementById('wa-bill-count-text');

    const defaultBillingTemplate = 'Olá {nome}, tudo bem? Lembramos que a sua mensalidade de {mes} no valor de R$ {valor} está pendente. Você pode efetuar o pagamento via PIX para a chave: {pix}. Após realizar o pagamento, por favor, envie o comprovante acessando o sistema. Agradecemos o seu apoio!\n\n_Este é um lembrete automático enviado pelo sistema financeiro do Clube._';

    if (billTemplateTextarea) {
        billTemplateTextarea.value = defaultBillingTemplate;
    }

    let unpaidMembersList = [];

    const getMonthNamePT = (monthNumber) => {
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return months[monthNumber - 1] || '';
    };

    if (billMonthSelect) {
        const currentMonth = new Date().getMonth() + 1;
        billMonthSelect.value = currentMonth.toString();
    }

    const updateBillingPreview = () => {
        try {
            if (!billPreviewDiv || !billTemplateTextarea) return;
            
            let template = billTemplateTextarea.value || '';
            const selectedMonthVal = billMonthSelect ? parseInt(billMonthSelect.value || (new Date().getMonth() + 1)) : (new Date().getMonth() + 1);
            const monthName = getMonthNamePT(selectedMonthVal);
            
            let rawValue = 20.00;
            if (billValueInput && billValueInput.value !== '') {
                rawValue = parseFloat(billValueInput.value);
                if (isNaN(rawValue)) rawValue = 0;
            }
            const valueVal = rawValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const pixVal = (billPixInput && billPixInput.value) ? billPixInput.value.trim() : 'jdboavista.ap@adventistas.org';

            let targetName = 'João Silva';
            const checkedBox = document.querySelector('.wa-bill-member-cb:checked');
            if (checkedBox) {
                const firstId = checkedBox.value;
                const member = unpaidMembersList.find(m => m.id.toString() === firstId.toString());
                if (member) targetName = member.name;
            } else if (unpaidMembersList && unpaidMembersList.length > 0) {
                targetName = unpaidMembersList[0].name;
            }

            const previewText = template
                .replace(/{nome}/g, targetName)
                .replace(/{mes}/g, monthName)
                .replace(/{valor}/g, valueVal)
                .replace(/{pix}/g, pixVal);

            billPreviewDiv.textContent = previewText;
        } catch (err) {
            console.error('[Billing] Erro ao gerar preview:', err);
            if (billPreviewDiv) {
                billPreviewDiv.textContent = 'Erro ao gerar pré-visualização. Verifique os campos.';
            }
        }
    };

    // Gera o preview inicial
    updateBillingPreview();

    const loadBillingDebtors = async () => {
        if (!billMembersBody) return;
        
        billMembersBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-dim);">Carregando devedores...</td></tr>';
        if (billCountText) billCountText.textContent = 'Carregando...';

        try {
            const selectedMonthVal = billMonthSelect ? billMonthSelect.value : (new Date().getMonth() + 1);
            const currentYear = new Date().getFullYear();

            const debtors = await apiFetch(`/api/payments/unpaid?month=${selectedMonthVal}&year=${currentYear}`);
            unpaidMembersList = debtors || [];
            
            renderBillingDebtors();
        } catch (err) {
            console.error('[Billing] Erro ao carregar inadimplentes:', err);
            billMembersBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--error-color);">Erro ao carregar inadimplentes.</td></tr>';
            if (billCountText) billCountText.textContent = 'Erro ao carregar lista.';
        }
    };

    const renderBillingDebtors = () => {
        if (!billMembersBody) return;
        
        const searchTerm = billSearchInput ? billSearchInput.value.toLowerCase() : '';
        const filtered = unpaidMembersList.filter(m => {
            return m.name.toLowerCase().includes(searchTerm) || (m.unit && m.unit.toLowerCase().includes(searchTerm));
        });

        if (filtered.length === 0) {
            billMembersBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum membro inadimplente encontrado.</td></tr>';
            if (billCountText) billCountText.textContent = '0 membros encontrados';
            if (billSelectAllCheckbox) billSelectAllCheckbox.checked = false;
            updateBillingPreview();
            return;
        }

        billMembersBody.innerHTML = filtered.map(m => {
            const hasPhone = !!m.phone;
            const disabledAttr = hasPhone ? '' : 'disabled';
            const opacityStyle = hasPhone ? '' : 'style="opacity: 0.6;"';
            const phoneBadge = hasPhone 
                ? `<span style="color: #25D366; font-weight: 600;">${escapeHTML(m.phone)}</span>`
                : `<span style="color: var(--error-color); font-weight: 500;">Sem Telefone</span>`;

            return `
                <tr ${opacityStyle} class="billing-member-row" data-search="${escapeHTML(m.name.toLowerCase())} ${escapeHTML((m.unit || '').toLowerCase())}">
                    <td style="padding: 12px 15px; text-align: center;">
                        <input type="checkbox" value="${m.id}" ${disabledAttr} class="wa-bill-member-cb" style="width: 18px; height: 18px; cursor: ${hasPhone ? 'pointer' : 'not-allowed'};" ${hasPhone ? 'checked' : ''}>
                    </td>
                    <td style="padding: 12px 15px;"><strong>${escapeHTML(m.name)}</strong></td>
                    <td style="padding: 12px 15px;">${escapeHTML(m.unit || '-')}</td>
                    <td style="padding: 12px 15px;">${phoneBadge}</td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('#wa-bill-members-body tr').forEach(row => {
            row.onclick = (e) => {
                const cb = row.querySelector('.wa-bill-member-cb');
                if (cb && !cb.disabled && e.target !== cb) {
                    cb.checked = !cb.checked;
                    updateBillingPreview();
                    updateSelectAllState();
                }
            };
        });

        document.querySelectorAll('.wa-bill-member-cb').forEach(cb => {
            cb.onchange = () => {
                updateBillingPreview();
                updateSelectAllState();
            };
        });

        updateSelectAllState();
    };

    const updateSelectAllState = () => {
        const checkboxes = document.querySelectorAll('.wa-bill-member-cb:not(:disabled)');
        const checked = document.querySelectorAll('.wa-bill-member-cb:checked');
        if (billSelectAllCheckbox) {
            billSelectAllCheckbox.checked = checkboxes.length > 0 && checkboxes.length === checked.length;
        }
        if (billCountText) {
            billCountText.textContent = `${unpaidMembersList.length} inadimplentes (${checked.length} selecionados para envio)`;
        }
        updateBillingPreview();
    };

    if (billMonthSelect) {
        billMonthSelect.onchange = () => {
            loadBillingDebtors();
        };
    }
    if (billValueInput) billValueInput.oninput = updateBillingPreview;
    if (billPixInput) billPixInput.oninput = updateBillingPreview;
    if (billTemplateTextarea) billTemplateTextarea.oninput = updateBillingPreview;

    if (billSearchInput) {
        billSearchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#wa-bill-members-body tr.billing-member-row').forEach(row => {
                const search = row.getAttribute('data-search') || '';
                row.style.display = search.includes(term) ? '' : 'none';
            });
            updateSelectAllState();
        };
    }

    if (billSelectAllCheckbox) {
        billSelectAllCheckbox.onchange = (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.wa-bill-member-cb:not(:disabled)').forEach(cb => {
                if (cb.closest('tr').style.display !== 'none') {
                    cb.checked = isChecked;
                }
            });
            updateBillingPreview();
            updateSelectAllState();
        };
    }

    if (billingForm) {
        billingForm.onsubmit = async (e) => {
            e.preventDefault();

            const checkedBoxes = document.querySelectorAll('.wa-bill-member-cb:checked');
            const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

            if (selectedIds.length === 0) {
                showAlert('Por favor, selecione pelo menos um membro com telefone válido para envio.', 'Aviso');
                return;
            }

            const template = billTemplateTextarea.value;
            const selectedMonthVal = billMonthSelect ? parseInt(billMonthSelect.value) : (new Date().getMonth() + 1);
            const monthName = getMonthNamePT(selectedMonthVal);
            const valueVal = billValueInput ? parseFloat(billValueInput.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '20,00';
            const pixVal = billPixInput ? billPixInput.value.trim() : 'jdboavista.ap@adventistas.org';

            const message = template
                .replace(/{mes}/g, monthName)
                .replace(/{valor}/g, valueVal)
                .replace(/{pix}/g, pixVal);

            const schDate = document.getElementById('wa-bill-date').value;
            const schTime = document.getElementById('wa-bill-time').value;
            const isScheduled = schDate && schTime;

            try {
                const submitBtn = billingForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;

                if (isScheduled) {
                    await apiFetch('/api/whatsapp/scheduled', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message,
                            date: schDate,
                            time: schTime,
                            target_type: 'selected',
                            target_value: selectedIds
                        })
                    });
                    showAlert('Cobranças agendadas com sucesso!', 'Sucesso');
                    document.getElementById('wa-bill-date').value = '';
                    document.getElementById('wa-bill-time').value = '';
                } else {
                    const res = await apiFetch('/api/whatsapp/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            personIds: selectedIds,
                            message
                        })
                    });
                    showAlert(res.message || 'Envio de cobranças iniciado com sucesso!', 'Sucesso');
                }

                loadBillingDebtors();
            } catch (err) {
                console.error('[Billing] Erro ao disparar cobranças:', err);
                showAlert('Erro ao disparar cobranças: ' + err.message, 'Erro');
            } finally {
                const submitBtn = billingForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = false;
            }
        };
    }

    // Função auxiliar para carregar configurações do WhatsApp do backend
    const loadWhatsAppSettings = async () => {
        try {
            const settings = await apiFetch('/api/whatsapp/settings');
            if (settings) {
                document.getElementById('wa-base-url').value = settings.base_url || '';
                document.getElementById('wa-instance-id').value = settings.instance_id || '';
                document.getElementById('wa-api-key').value = settings.api_key || '';
                document.getElementById('wa-enabled').checked = !!settings.enabled;
                document.getElementById('wa-template').value = settings.reminder_template || '';
            }
        } catch (err) {
            console.error('[WA] Erro ao carregar configurações:', err);
        }
    };

    // Alternar para aba Avisos do Sistema
    tabSystem.onclick = () => {
        tabSystem.classList.add('active');
        tabSystem.style.color = 'var(--accent-color)';
        tabSystem.style.borderBottom = '2px solid var(--accent-color)';
        
        tabWhatsapp.classList.remove('active');
        tabWhatsapp.style.color = 'var(--text-dim)';
        tabWhatsapp.style.borderBottom = 'none';

        containerSystem.style.display = 'block';
        containerWhatsapp.style.display = 'none';
    };

    // Alternar para aba WhatsApp (W-API) - DESATIVADO TEMPORARIAMENTE
    tabWhatsapp.onclick = () => {
        const modal = document.getElementById('whatsapp-disabled-modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            alert('A funcionalidade do WhatsApp está temporariamente indisponível.');
        }
    };

    // --- Sub-menu WhatsApp navigation logic ---
    const waTabSchedule = document.getElementById('wa-tab-schedule');
    const waTabSend = document.getElementById('wa-tab-send');
    const waTabPanel = document.getElementById('wa-tab-panel');
    
    const waContentSchedule = document.getElementById('wa-content-schedule');
    const waContentSend = document.getElementById('wa-content-send');
    const waContentPanel = document.getElementById('wa-content-panel');

    const switchWaSubTab = (activeTabId) => {
        const subTabs = [
            { id: 'wa-tab-schedule', btn: waTabSchedule, content: waContentSchedule },
            { id: 'wa-tab-send', btn: waTabSend, content: waContentSend },
            { id: 'wa-tab-panel', btn: waTabPanel, content: waContentPanel }
        ];

        if (activeTabId !== 'wa-tab-panel' && window.waEventSource) {
            console.log('[WA-SSE] Fechando SSE por mudança de aba.');
            window.waEventSource.close();
            window.waEventSource = null;
        }

        subTabs.forEach(t => {
            if (t.btn && t.content) {
                if (t.id === activeTabId) {
                    t.btn.classList.add('active');
                    t.btn.style.color = 'var(--accent-color)';
                    t.btn.style.borderBottom = '2px solid var(--accent-color)';
                    t.btn.style.borderTop = 'none';
                    t.btn.style.borderLeft = 'none';
                    t.btn.style.borderRight = 'none';
                    t.content.style.display = 'block';

                    if (activeTabId === 'wa-tab-panel') {
                        if (typeof window.initWhatsAppChat === 'function') {
                            window.initWhatsAppChat();
                        }
                    }
                    if (activeTabId === 'wa-tab-send') {
                        loadBillingDebtors();
                    }
                } else {
                    t.btn.classList.remove('active');
                    t.btn.style.color = 'var(--text-dim)';
                    t.btn.style.borderBottom = 'none';
                    t.content.style.display = 'none';
                }
            }
        });
    };

    if (waTabSchedule) waTabSchedule.onclick = () => switchWaSubTab('wa-tab-schedule');
    if (waTabSend) waTabSend.onclick = () => switchWaSubTab('wa-tab-send');
    if (waTabPanel) waTabPanel.onclick = () => switchWaSubTab('wa-tab-panel');

    // Salvar configurações do W-API
    if (configForm) {
        configForm.onsubmit = async (e) => {
            e.preventDefault();
            const configData = {
                base_url: document.getElementById('wa-base-url').value.trim(),
                instance_id: document.getElementById('wa-instance-id').value.trim(),
                api_key: document.getElementById('wa-api-key').value.trim(),
                enabled: document.getElementById('wa-enabled').checked,
                reminder_template: document.getElementById('wa-template').value
            };

            try {
                await apiFetch('/api/whatsapp/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(configData)
                });
                showAlert('Configurações do WhatsApp salvas com sucesso!', 'Sucesso');
            } catch (err) {
                console.error('[WA] Erro ao salvar configurações:', err);
                showAlert('Erro ao salvar configurações: ' + err.message, 'Erro');
            }
        };
    }

    // Listar Lembretes Agendados
    const fetchScheduledReminders = async () => {
        const tbody = document.getElementById('wa-schedule-list-body');
        if (!tbody) return;

        try {
            const reminders = await apiFetch('/api/whatsapp/scheduled');
            if (!reminders || reminders.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum agendamento encontrado.</td>
                    </tr>
                `;
                return;
            }

            if (!state.people || state.people.length === 0) {
                state.people = await apiFetch('/api/people');
            }

            tbody.innerHTML = '';
            reminders.forEach(r => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(0,0,0,0.05)';

                // 1. Data/Hora
                const dateCell = document.createElement('td');
                dateCell.style.padding = '12px 15px';
                const formattedDate = new Date(r.scheduled_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                dateCell.textContent = formattedDate;

                // 2. Destino
                const targetCell = document.createElement('td');
                targetCell.style.padding = '12px 15px';
                if (r.target_type === 'all') {
                    targetCell.textContent = 'Todos os Membros';
                } else if (r.target_type === 'unit') {
                    targetCell.innerHTML = `Unidade: <strong>${escapeHTML(r.target_value)}</strong>`;
                } else if (r.target_type === 'selected') {
                    try {
                        const ids = JSON.parse(r.target_value);
                        if (Array.isArray(ids)) {
                            const names = ids.map(id => {
                                const person = state.people.find(p => parseInt(p.id) === parseInt(id));
                                return person ? person.name : `Membro #${id}`;
                            });
                            const listStr = names.join(', ');
                            const shortStr = names.length > 2 
                                ? `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`
                                : listStr;
                            targetCell.innerHTML = `<span title="${escapeHTML(listStr)}" style="cursor: help;">${escapeHTML(shortStr)} (${ids.length})</span>`;
                        } else {
                            targetCell.textContent = 'Selecionados';
                        }
                    } catch {
                        targetCell.textContent = 'Selecionados';
                    }
                } else {
                    targetCell.textContent = r.target_type;
                }

                // 3. Mensagem
                const msgCell = document.createElement('td');
                msgCell.style.padding = '12px 15px';
                const shortMsg = r.message.length > 50 ? r.message.substring(0, 50) + '...' : r.message;
                msgCell.innerHTML = `<span title="${escapeHTML(r.message)}" style="cursor: help;">${escapeHTML(shortMsg)}</span>`;

                // 4. Status
                const statusCell = document.createElement('td');
                statusCell.style.padding = '12px 15px';
                let badgeStyle = '';
                let statusText = '';
                let titleAttr = '';

                if (r.status === 'pending') {
                    badgeStyle = 'background: #fff3cd; color: #856404;';
                    statusText = 'Pendente';
                } else if (r.status === 'sent') {
                    badgeStyle = 'background: #d4edda; color: #155724;';
                    statusText = 'Enviado';
                } else if (r.status === 'processing') {
                    badgeStyle = 'background: #cce5ff; color: #004085;';
                    statusText = 'Processando';
                } else {
                    badgeStyle = 'background: #f8d7da; color: #721c24;';
                    statusText = 'Erro';
                    if (r.error_message) {
                        titleAttr = `title="${escapeHTML(r.error_message)}" style="cursor: help;"`;
                    }
                }
                statusCell.innerHTML = `<span ${titleAttr} style="${badgeStyle} padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; display: inline-block;">${statusText}</span>`;

                // 5. Ações
                const actionCell = document.createElement('td');
                actionCell.style.cssText = 'padding: 12px 15px; text-align: center;';
                if (r.status === 'pending') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn-danger btn-small';
                    cancelBtn.textContent = 'Cancelar';
                    cancelBtn.style.cssText = 'padding: 4px 8px; font-size: 0.75rem; min-height: auto; margin: 0;';
                    cancelBtn.onclick = () => deleteScheduledReminder(r.id);
                    actionCell.appendChild(cancelBtn);
                } else {
                    actionCell.textContent = '-';
                }

                tr.appendChild(dateCell);
                tr.appendChild(targetCell);
                tr.appendChild(msgCell);
                tr.appendChild(statusCell);
                tr.appendChild(actionCell);
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('[WA] Erro ao carregar agendamentos:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: var(--error-color);">Erro ao carregar lembretes agendados.</td>
                </tr>
            `;
        }
    };

    // Cancelar Lembrete Agendado
    const deleteScheduledReminder = async (id) => {
        if (!confirm('Deseja realmente cancelar este agendamento?')) return;

        try {
            await apiFetch(`/api/whatsapp/scheduled/${id}`, {
                method: 'DELETE'
            });
            showAlert('Agendamento cancelado com sucesso!', 'Sucesso');
            fetchScheduledReminders();
        } catch (err) {
            console.error('[WA] Erro ao cancelar:', err);
            showAlert('Erro ao cancelar agendamento: ' + err.message, 'Erro');
        }
    };

    // Formulário de Agendamento
    const scheduleForm = document.getElementById('whatsapp-schedule-form');
    const schTargetType = document.getElementById('wa-sch-target-type');
    const schUnitContainer = document.getElementById('wa-sch-unit-container');
    const schMembersContainer = document.getElementById('wa-sch-members-container');

    if (schTargetType) {
        schTargetType.onchange = (e) => {
            const val = e.target.value;
            if (val === 'unit') {
                schUnitContainer.style.display = 'block';
                schMembersContainer.style.display = 'none';
            } else if (val === 'selected') {
                schUnitContainer.style.display = 'none';
                schMembersContainer.style.display = 'block';
            } else {
                schUnitContainer.style.display = 'none';
                schMembersContainer.style.display = 'none';
            }
        };
    }

    // Busca/Filtro no painel de agendamento
    const schSearchInput = document.getElementById('wa-sch-search');
    if (schSearchInput) {
        schSearchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#wa-sch-checkbox-container .checkbox-item').forEach(item => {
                const search = item.getAttribute('data-search') || '';
                item.style.display = search.includes(term) ? 'flex' : 'none';
            });
        };
    }

    if (scheduleForm) {
        scheduleForm.onsubmit = async (e) => {
            e.preventDefault();

            const targetType = schTargetType.value;
            const message = document.getElementById('wa-sch-message').value.trim();
            const date = document.getElementById('wa-sch-date').value;
            const time = document.getElementById('wa-sch-time').value;

            let targetValue = null;
            if (targetType === 'unit') {
                targetValue = document.getElementById('wa-sch-unit-name').value.trim();
                if (!targetValue) {
                    showAlert('Por favor, informe o nome da unidade.', 'Aviso');
                    return;
                }
            } else if (targetType === 'selected') {
                const checkboxes = document.querySelectorAll('#wa-sch-checkbox-container input[type="checkbox"]:checked');
                const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
                if (selectedIds.length === 0) {
                    showAlert('Por favor, selecione pelo menos um membro.', 'Aviso');
                    return;
                }
                targetValue = selectedIds;
            }

            try {
                await apiFetch('/api/whatsapp/scheduled', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        date,
                        time,
                        target_type: targetType,
                        target_value: targetValue
                    })
                });

                showAlert('Lembrete agendado com sucesso!', 'Sucesso');
                scheduleForm.reset();
                if (schTargetType) schTargetType.value = 'all';
                if (schUnitContainer) schUnitContainer.style.display = 'none';
                if (schMembersContainer) schMembersContainer.style.display = 'none';
                document.querySelectorAll('#wa-sch-checkbox-container input[type="checkbox"]').forEach(cb => cb.checked = false);
                
                fetchScheduledReminders();
            } catch (err) {
                console.error('[WA] Erro ao agendar lembrete:', err);
                showAlert('Erro ao agendar lembrete: ' + err.message, 'Erro');
            }
        };
    }
};

// Renderiza a lista de membros no painel do WhatsApp
async function renderWhatsAppMembers() {
    const container = document.getElementById('wa-members-checkbox-container');
    const schContainer = document.getElementById('wa-sch-checkbox-container');
    if (!container && !schContainer) return;

    if (container) container.innerHTML = '<p style="text-align: center; padding: 10px; color: var(--text-dim);">Carregando membros...</p>';
    if (schContainer) {
        schContainer.innerHTML = '<p style="text-align: center; padding: 10px; color: var(--text-dim);">Carregando membros...</p>';
    }

    try {
        const people = await apiFetch('/api/people');
        people.sort((a, b) => a.name.localeCompare(b.name));

        if (container) container.innerHTML = '';
        if (schContainer) schContainer.innerHTML = '';

        people.forEach(p => {
            const searchText = `${p.name} ${p.unit || ''}`.toLowerCase();
            
            // 1. Manual Checklist Item
            if (container) {
                const item = document.createElement('div');
                item.className = 'checkbox-item';
                item.setAttribute('data-search', searchText);
                item.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); cursor: pointer;';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `wa-user-${p.id}`;
                checkbox.value = p.id;
                checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                
                if (!p.phone) {
                    checkbox.disabled = true;
                    item.style.opacity = '0.6';
                }

                const label = document.createElement('label');
                label.htmlFor = `wa-user-${p.id}`;
                
                let phoneLabel = p.phone ? `<span style="color: #25D366; font-weight: 600;">${escapeHTML(p.phone)}</span>` : '<span style="color: var(--error-color); font-weight: 500;">Sem Telefone</span>';
                label.innerHTML = `${escapeHTML(p.name)} <br> <small style="color: var(--text-dim)">${escapeHTML(p.unit || 'Sem Unidade')} | ${phoneLabel}</small>`;
                label.style.cssText = 'margin: 0; cursor: pointer; font-size: 0.9rem; flex-grow: 1; user-select: none;';

                item.onclick = (e) => {
                    if (e.target !== checkbox && e.target !== label && !checkbox.disabled) {
                        checkbox.checked = !checkbox.checked;
                    }
                };

                item.appendChild(checkbox);
                item.appendChild(label);
                container.appendChild(item);
            }

            // 2. Schedule Checklist Item
            if (schContainer) {
                const schItem = document.createElement('div');
                schItem.className = 'checkbox-item';
                schItem.setAttribute('data-search', searchText);
                schItem.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); cursor: pointer;';

                const schCheckbox = document.createElement('input');
                schCheckbox.type = 'checkbox';
                schCheckbox.id = `wa-sch-user-${p.id}`;
                schCheckbox.value = p.id;
                schCheckbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';

                if (!p.phone) {
                    schCheckbox.disabled = true;
                    schItem.style.opacity = '0.6';
                }

                const schLabel = document.createElement('label');
                schLabel.htmlFor = `wa-sch-user-${p.id}`;
                let phoneLabel = p.phone ? `<span style="color: #25D366; font-weight: 600;">${escapeHTML(p.phone)}</span>` : '<span style="color: var(--error-color); font-weight: 500;">Sem Telefone</span>';
                schLabel.innerHTML = `${escapeHTML(p.name)} <br> <small style="color: var(--text-dim)">${escapeHTML(p.unit || 'Sem Unidade')} | ${phoneLabel}</small>`;
                schLabel.style.cssText = 'margin: 0; cursor: pointer; font-size: 0.9rem; flex-grow: 1; user-select: none;';

                schItem.onclick = (e) => {
                    if (e.target !== schCheckbox && e.target !== schLabel && !schCheckbox.disabled) {
                        schCheckbox.checked = !schCheckbox.checked;
                    }
                };

                schItem.appendChild(schCheckbox);
                schItem.appendChild(schLabel);
                schContainer.appendChild(schItem);
            }
        });
    } catch (err) {
        console.error('Erro ao carregar membros para WhatsApp:', err);
        if (container) container.innerHTML = '<p style="color: var(--error-color); padding: 10px;">Erro ao carregar lista de membros.</p>';
        if (schContainer) {
            schContainer.innerHTML = '<p style="color: var(--error-color); padding: 10px;">Erro ao carregar lista de membros.</p>';
        }
    }
}

// Inicializações finais de módulos persistentes
initializeNotifications();
initMessageForm();
initWhatsAppForm();

