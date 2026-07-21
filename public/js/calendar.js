// --- Lógica do Calendário do Site ---
async function fetchSiteCalendar() {
    try {
        const data = await apiFetch('/api/site-calendar');
        state.siteCalendar = data;
        renderSiteCalendar();
    } catch (err) {
        console.error('Error fetching site calendar:', err);
    }
}

function renderSiteCalendar() {
    const body = document.getElementById('site-calendar-body');
    if (!body) return;

    let eventsToRender = state.siteCalendar || [];

    const searchInput = document.getElementById('site-calendar-search');
    if (searchInput && searchInput.value) {
        const term = searchInput.value.toLowerCase();
        eventsToRender = eventsToRender.filter(item => {
            const dateStr = formatDate(item.date).toLowerCase();
            const nameStr = (item.name || '').toLowerCase();
            const descStr = (item.description || '').toLowerCase();
            const localStr = (item.local || '').toLowerCase();
            const respStr = (item.responsible || '').toLowerCase();
            return dateStr.includes(term) || nameStr.includes(term) || descStr.includes(term) || localStr.includes(term) || respStr.includes(term);
        });
    }

    if (!eventsToRender || eventsToRender.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Nenhuma data cadastrada ou encontrada para o site.</td></tr>';
        return;
    }

    body.innerHTML = eventsToRender.map(item => `
        <tr class="animate-fade-in">
            <td><strong>${formatDate(item.date)}</strong></td>
            <td><strong style="color: var(--accent-color);">${escapeHTML(item.name)}</strong></td>
            <td>${escapeHTML(item.description || '-')}</td>
            <td>${escapeHTML(item.local || '-')}</td>
            <td>${escapeHTML(item.responsible || '-')}</td>
            <td>
                ${(state.role === 'admin' || state.role === 'secretário') ? `<button class="btn-primary btn-small" onclick="editSiteCalendar(${item.id})">Editar</button>` : '-'}
            </td>
        </tr>
    `).join('');
}

async function deleteSiteCalendar(id) {
    if (!await showConfirm('Deseja realmente excluir esta data do calendário do site?', 'Excluir Data')) return false;
    try {
        await apiFetch(`/api/site-calendar/${id}`, { method: 'DELETE' });
        showStatus('Data excluída com sucesso!', 'success');
        fetchSiteCalendar();
        return true;
    } catch (err) {
        showStatus('Erro ao excluir: ' + err.message, 'error');
        return false;
    }
}
window.deleteSiteCalendar = deleteSiteCalendar;

function editSiteCalendar(id) {
    const item = state.siteCalendar.find(x => x.id === id);
    if (!item) return;

    document.getElementById('sc-edit-id').value = item.id;
    document.getElementById('sc-edit-name').value = item.name;
    document.getElementById('sc-edit-date').value = item.date.split('T')[0];
    document.getElementById('sc-edit-desc').value = item.description || '';
    document.getElementById('sc-edit-local').value = item.local || '';
    document.getElementById('sc-edit-responsible').value = item.responsible || '';

    const modal = document.getElementById('site-calendar-edit-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}
window.editSiteCalendar = editSiteCalendar;

// Event Listeners para as Abas e Modal do Calendário do Site
const initSiteCalendarListeners = () => {
    const tabInternal = document.getElementById('tab-internal-events');
    const tabSite = document.getElementById('tab-site-calendar');
    const internalContainer = document.getElementById('events-internal-container');
    const siteContainer = document.getElementById('events-site-calendar-container');
    const eventsActions = document.getElementById('events-actions');
    const siteActions = document.getElementById('site-calendar-actions');

    if (tabInternal && tabSite) {
        tabInternal.onclick = () => {
            state.activeEventsSubmenu = 'internal';
            tabInternal.className = 'btn-text active';
            tabInternal.style.color = 'var(--accent-color)';
            tabInternal.style.borderBottom = '2px solid var(--accent-color)';
            tabSite.className = 'btn-text';
            tabSite.style.color = 'var(--text-dim)';
            tabSite.style.borderBottom = 'none';

            if (internalContainer) internalContainer.style.display = 'block';
            if (siteContainer) siteContainer.style.display = 'none';
            if (eventsActions) eventsActions.style.display = state.role === 'admin' ? 'flex' : 'none';
            if (siteActions) siteActions.style.display = 'none';

            fetchEventsData();
        };

        tabSite.onclick = () => {
            state.activeEventsSubmenu = 'site';
            tabSite.className = 'btn-text active';
            tabSite.style.color = 'var(--accent-color)';
            tabSite.style.borderBottom = '2px solid var(--accent-color)';
            tabInternal.className = 'btn-text';
            tabInternal.style.color = 'var(--text-dim)';
            tabInternal.style.borderBottom = 'none';

            if (internalContainer) internalContainer.style.display = 'none';
            if (siteContainer) siteContainer.style.display = 'block';
            if (eventsActions) eventsActions.style.display = 'none';
            if (siteActions) siteActions.style.display = (state.role === 'admin' || state.role === 'secretário') ? 'flex' : 'none';

            fetchSiteCalendar();
        };
    }

    const addBtn = document.getElementById('add-site-calendar-btn');
    const modal = document.getElementById('site-calendar-create-modal');
    if (addBtn && modal) {
        addBtn.onclick = () => {
            document.getElementById('site-calendar-form').reset();
            modal.style.display = 'flex';
        };
    }

    const exportBtn = document.getElementById('export-site-calendar-btn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            openCalendarExportModal();
        };
    }

    const periodSelect = document.getElementById('calendar-export-period');
    const yearSelect = document.getElementById('calendar-export-year');
    if (periodSelect && yearSelect) {
        periodSelect.onchange = () => {
            renderCalendarExportPreview();
        };
        yearSelect.onchange = () => {
            renderCalendarExportPreview();
        };
    }

    const form = document.getElementById('site-calendar-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('sc-name').value;
            const date = document.getElementById('sc-date').value;
            const description = document.getElementById('sc-desc').value;
            const local = document.getElementById('sc-local').value;
            const responsible = document.getElementById('sc-responsible').value;

            try {
                await apiFetch('/api/site-calendar', {
                    method: 'POST',
                    body: JSON.stringify({ name, date, description, local, responsible })
                });
                showStatus('Data cadastrada no site com sucesso!', 'success');
                if (modal) modal.style.display = 'none';
                form.reset();
                fetchSiteCalendar();
            } catch (err) {
                showStatus('Erro ao cadastrar: ' + err.message, 'error');
            }
        };
    }

    const editForm = document.getElementById('site-calendar-edit-form');
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('sc-edit-id').value;
            const name = document.getElementById('sc-edit-name').value;
            const date = document.getElementById('sc-edit-date').value;
            const description = document.getElementById('sc-edit-desc').value;
            const local = document.getElementById('sc-edit-local').value;
            const responsible = document.getElementById('sc-edit-responsible').value;

            try {
                await apiFetch(`/api/site-calendar/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, date, description, local, responsible })
                });
                showStatus('Data atualizada com sucesso!', 'success');
                const modal = document.getElementById('site-calendar-edit-modal');
                if (modal) modal.style.display = 'none';
                editForm.reset();
                fetchSiteCalendar();
            } catch (err) {
                showStatus('Erro ao atualizar: ' + err.message, 'error');
            }
        };
    }

    const editDeleteBtn = document.getElementById('sc-edit-delete-btn');
    if (editDeleteBtn) {
        editDeleteBtn.onclick = async () => {
            const id = document.getElementById('sc-edit-id').value;
            if (id) {
                const success = await deleteSiteCalendar(id);
                if (success) {
                    const modal = document.getElementById('site-calendar-edit-modal');
                    if (modal) modal.style.display = 'none';
                }
            }
        };
    }
};

async function openCalendarExportModal() {
    try {
        console.log('[CALENDAR-EXPORT] Abrindo modal de exportação...');
        
        // Garante que o calendário do estado está atualizado
        if (!state.siteCalendar) {
            await fetchSiteCalendar();
        }
        
        const modal = document.getElementById('report-modal');
        const calFilters = document.getElementById('calendar-export-filters');
        const yearSelect = document.getElementById('calendar-export-year');
        const periodSelect = document.getElementById('calendar-export-period');
        
        if (!modal || !calFilters || !yearSelect || !periodSelect) return;
        
        // Popula os anos disponíveis dinamicamente
        const years = new Set();
        (state.siteCalendar || []).forEach(item => {
            if (item.date) {
                const dateStr = item.date.split('T')[0];
                const year = new Date(dateStr + 'T12:00:00').getFullYear();
                years.add(year);
            }
        });
        
        // Adiciona o ano atual e o próximo se a lista estiver vazia
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        years.add(currentYear + 1);
        
        // Ordena os anos
        const sortedYears = Array.from(years).sort((a, b) => a - b);
        
        // Popula o select de anos
        yearSelect.innerHTML = sortedYears.map(yr => `<option value="${yr}">${yr}</option>`).join('');
        
        // Seleciona o ano atual por padrão se disponível, ou o primeiro
        if (sortedYears.includes(currentYear)) {
            yearSelect.value = currentYear;
        } else {
            yearSelect.value = sortedYears[0];
        }
        
        // Reseta o período para 1º Semestre por padrão
        const currentMonth = new Date().getMonth();
        if (currentMonth > 5) {
            periodSelect.value = '2'; // 2º Semestre
        } else {
            periodSelect.value = '1'; // 1º Semestre
        }
        
        // Exibe o modal e os filtros
        calFilters.style.display = 'flex';
        modal.style.display = 'flex';
        
        // Adiciona a regra de CSS para orientação de impressão A4 portrait dinamicamente
        let styleEl = document.getElementById('print-orientation-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'print-orientation-style';
            styleEl.innerHTML = '@page { size: A4 portrait; margin: 8mm; }';
            document.head.appendChild(styleEl);
        }
        
        // Renderiza o preview inicial
        renderCalendarExportPreview();
        
    } catch (err) {
        console.error('[CALENDAR-EXPORT] Erro:', err);
        showStatus('Erro ao abrir exportação de calendário.', 'error');
    }
}
window.openCalendarExportModal = openCalendarExportModal;

function renderCalendarExportPreview() {
    try {
        const periodSelect = document.getElementById('calendar-export-period');
        const yearSelect = document.getElementById('calendar-export-year');
        const printable = document.getElementById('report-printable');
        
        if (!periodSelect || !yearSelect || !printable) return;
        
        const selectedPeriod = periodSelect.value;
        const selectedYear = parseInt(yearSelect.value);
        
        // Filtra os eventos de acordo com o ano e período
        const filteredEvents = (state.siteCalendar || []).filter(item => {
            if (!item.date) return false;
            const dateStr = item.date.split('T')[0];
            const date = new Date(dateStr + 'T12:00:00');
            if (date.getFullYear() !== selectedYear) return false;
            
            const month = date.getMonth(); // 0-11
            if (selectedPeriod === '1' && month > 5) return false;
            if (selectedPeriod === '2' && month < 6) return false;
            
            return true;
        });
        
        // Ordena por data
        filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Agrupa por mês
        const monthNames = [
            'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
            'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
        ];
        
        const eventsByMonth = {};
        filteredEvents.forEach(item => {
            const dateStr = item.date.split('T')[0];
            const date = new Date(dateStr + 'T12:00:00');
            const monthIndex = date.getMonth();
            if (!eventsByMonth[monthIndex]) {
                eventsByMonth[monthIndex] = [];
            }
            eventsByMonth[monthIndex].push(item);
        });
        
        // Título dinâmico do relatório
        let periodText = 'PLANEJAMENTO ANUAL';
        if (selectedPeriod === '1') {
            periodText = 'PLANEJAMENTO 1º SEMESTRE';
        } else if (selectedPeriod === '2') {
            periodText = 'PLANEJAMENTO 2º SEMESTRE';
        }
        
        let titleText = `${periodText} ${selectedYear}`;
        
        // Monta o HTML com o timbre da logo do clube à esquerda em cima, sem o triângulo SVG
        let html = `
            <div class="calendar-print-canvas">
                <div style="position: relative; text-align: center; margin-bottom: 1rem; min-height: 50px; display: flex; justify-content: center; align-items: center;">
                    <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center;">
                        <img src="logo.png" style="height: 45px; width: 45px; object-fit: contain;" onerror="this.style.display='none'" />
                    </div>
                    <h2 style="margin: 0; font-size: 1.3rem; font-weight: 800; font-family: Arial, sans-serif; color: #000; text-transform: uppercase;">
                        ${titleText}
                    </h2>
                </div>
        `;
        
        const monthsWithEvents = Object.keys(eventsByMonth).map(Number).sort((a, b) => a - b);
        
        if (monthsWithEvents.length === 0) {
            html += `<div style="text-align: center; padding: 3rem; color: #666; font-family: Arial, sans-serif; font-size: 1.1rem;">Nenhum evento cadastrado para o período selecionado.</div>`;
        } else {
            monthsWithEvents.forEach(monthIndex => {
                const monthName = monthNames[monthIndex];
                const monthEvents = eventsByMonth[monthIndex];
                
                html += `
                    <div class="calendar-month-section">
                        <h3 style="text-align: left; font-size: 1.1rem; margin: 0.5rem 0 0.3rem 0; font-family: Arial, sans-serif; text-transform: uppercase; color: #000; font-weight: bold;">
                            ${monthName}
                        </h3>
                        <table class="calendar-print-table">
                            <thead>
                                <tr>
                                    <th style="width: 18%; white-space: nowrap;">DIA</th>
                                    <th style="width: 47%;">ATIVIDADE</th>
                                    <th style="width: 17.5%;">LOCAL</th>
                                    <th style="width: 17.5%;">RESPONSÁVEL</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${monthEvents.map(item => `
                                    <tr>
                                        <td style="white-space: nowrap;"><strong>${formatCalendarDate(item.date)}</strong></td>
                                        <td>${escapeHTML(item.name)}</td>
                                        <td>${escapeHTML(item.local || '---')}</td>
                                        <td>${escapeHTML(item.responsible || '---')}</td>
                                    </tr>
                                 `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            });
        }
        
        const now = new Date();
        const formattedNow = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        html += `
            <div style="text-align: center; font-size: 0.75rem; color: #555; margin-top: 2.5rem; font-family: Arial, sans-serif; border-top: 1px solid #000; padding-top: 0.5rem; font-style: italic;">
                Gerado automaticamente pelo Sistema de Gestão Financeira em ${formattedNow}
            </div>
        `;
        
        html += `</div>`;
        
        printable.innerHTML = html;
        
    } catch (err) {
        console.error('[CALENDAR-EXPORT] Erro ao renderizar preview:', err);
    }
}
window.renderCalendarExportPreview = renderCalendarExportPreview;

function formatCalendarDate(dateStr) {
    if (!dateStr) return '';
    const cleanDateStr = dateStr.split('T')[0];
    const parts = cleanDateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekday = weekdays[date.getDay()];
    return `${day}/${month} - ${weekday}`;
}
window.formatCalendarDate = formatCalendarDate;

// Inicializa os ouvintes de calendário do site (o DOM já está carregado pelo loader)
initSiteCalendarListeners();
setTimeout(initSiteCalendarListeners, 1000);
