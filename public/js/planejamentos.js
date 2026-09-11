document.addEventListener('DOMContentLoaded', () => {
    // Apenas executa se estiver na página de planejamentos
    if (!document.getElementById('planejamentos-page')) return;

    let plannings = [];
    let currentPlanningId = null;
    let currentPlanningData = null;

    const listContainer = document.getElementById('plannings-list');
    const modal = document.getElementById('planning-modal');
    const closeBtn = modal.querySelector('.close-modal');
    
    // Forms
    const planningForm = document.getElementById('planning-form');
    const activityForm = document.getElementById('activity-form');
    const menuForm = document.getElementById('menu-form');

    // Sections
    const detailsSection = document.getElementById('planning-details');
    const tabActivities = document.getElementById('tab-activities');
    const tabMenus = document.getElementById('tab-menus');
    const activitiesSection = document.getElementById('activities-section');
    const menusSection = document.getElementById('menus-section');

    const activitiesDaysContainer = document.getElementById('activities-days-container');
    const menusDaysContainer = document.getElementById('menus-days-container');

    // Load initial data
    loadPlannings();

    document.getElementById('add-planning-btn').onclick = () => {
        currentPlanningId = null;
        currentPlanningData = null;
        if (document.getElementById('btn-open-export')) document.getElementById('btn-open-export').style.display = 'none';
        planningForm.reset();
        detailsSection.style.display = 'none';
        modal.style.display = 'flex';
    };

    closeBtn.onclick = () => {
        modal.style.display = 'none';
        loadPlannings(); // Refresh list on close
    };

    // Tabs switching
    tabActivities.onclick = () => {
        activitiesSection.style.display = 'block';
        menusSection.style.display = 'none';
        tabActivities.className = 'btn-primary';
        tabMenus.className = 'btn-secondary';
    };

    tabMenus.onclick = () => {
        activitiesSection.style.display = 'none';
        menusSection.style.display = 'block';
        tabActivities.className = 'btn-secondary';
        tabMenus.className = 'btn-primary';
    };

    async function loadPlannings() {
        try {
            const data = await apiFetch('/api/plannings');
            plannings = data;
            renderPlannings();
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao carregar planejamentos', 'error');
        }
    }

    function renderPlannings() {
        if (!plannings || plannings.length === 0) {
            listContainer.innerHTML = '<p>Nenhum planejamento encontrado.</p>';
            return;
        }

        listContainer.innerHTML = plannings.map(p => `
            <div class="glass-card" style="padding: 1.5rem; margin-bottom: 1rem; display:flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                <div>
                    <h4 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: var(--text-color);">${escapeHTML(p.name)}</h4>
                    <p style="font-size: 0.85em; color: var(--text-dim); line-height: 1.4;">
                        <strong>Início:</strong> ${formatDateDisplay(p.start_date)}<br>
                        <strong>Término:</strong> ${formatDateDisplay(p.end_date)}
                    </p>
                </div>
                <button class="btn-primary" style="width: 100%; padding: 0.6rem; font-size: 0.95rem;" onclick="openPlanning('${p.id}')">Gerenciar</button>
            </div>
        `).join('');
    }

    window.openPlanning = async (id) => {
        try {
            const data = await apiFetch(`/api/plannings/${id}`);
            currentPlanningId = data.id;
            currentPlanningData = data;
            if (document.getElementById('btn-open-export')) document.getElementById('btn-open-export').style.display = 'block';
            
            document.getElementById('planning-name').value = data.name;
            document.getElementById('planning-start').value = data.start_date.split('T')[0];
            document.getElementById('planning-end').value = data.end_date.split('T')[0];
            
            detailsSection.style.display = 'block';
            modal.style.display = 'flex';
            
            renderDaysUI();
            
            // Focus on activities by default
            tabActivities.click();
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao abrir planejamento', 'error');
        }
    };

    planningForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('planning-name').value;
        const start_date = document.getElementById('planning-start').value;
        const end_date = document.getElementById('planning-end').value;

        // VALIDAÇÃO DE DATAS
        if (new Date(end_date) < new Date(start_date)) {
            if(typeof showStatus === 'function') showStatus('A data final é menor que a data inicial', 'error');
            else alert('A data final é menor que a data inicial');
            return;
        }

        if (currentPlanningId) {
            try {
                await apiFetch(`/api/plannings/${currentPlanningId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, start_date, end_date })
                });
                openPlanning(currentPlanningId);
                loadPlannings(); // Update the main list in the background
                if(typeof showStatus === 'function') showStatus('Planejamento atualizado com sucesso!', 'success');
            } catch (err) {
                console.error(err);
                if(typeof showStatus === 'function') showStatus('Erro ao atualizar planejamento', 'error');
            }
            return;
        }

        try {
            const data = await apiFetch('/api/plannings', {
                method: 'POST',
                body: JSON.stringify({ name, start_date, end_date })
            });
            currentPlanningId = data.id;
            // Carrega os dados recém criados
            openPlanning(data.id);
            loadPlannings(); // Update the main list in the background
            if(typeof showStatus === 'function') showStatus('Planejamento criado! Adicione o cronograma e cardápio.', 'success');
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus(err.message, 'error');
        }
    };

    function getDatesInRange(startStr, endStr) {
        let dates = [];
        let [sY, sM, sD] = startStr.split('-');
        let [eY, eM, eD] = endStr.split('-');
        
        let cur = new Date(sY, sM - 1, sD);
        let endD = new Date(eY, eM - 1, eD);
        
        while(cur <= endD) {
            // Formata YYYY-MM-DD
            const yyyy = cur.getFullYear();
            const mm = String(cur.getMonth() + 1).padStart(2, '0');
            const dd = String(cur.getDate()).padStart(2, '0');
            dates.push(`${yyyy}-${mm}-${dd}`);
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    function renderDaysUI() {
        if (!currentPlanningData) return;
        
        const startStr = currentPlanningData.start_date.split('T')[0];
        const endStr = currentPlanningData.end_date.split('T')[0];
        
        const dates = getDatesInRange(startStr, endStr);
        
        let actsHtml = '';
        let menusHtml = '';

        dates.forEach((dateStr, index) => {
            const dateDisplay = formatDateDisplay(dateStr);
            const dayActs = (currentPlanningData.activities || []).filter(a => a.date.startsWith(dateStr));
            const dayMenus = (currentPlanningData.menus || []).filter(m => m.date.startsWith(dateStr));
            
            // Construir HTML das Atividades do Dia
            actsHtml += `
            <div class="glass-card" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem; color: var(--accent-color);">
                    Dia ${index + 1} - ${dateDisplay}
                </h4>
                <div style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; margin-bottom: 1rem;">
                        <thead><tr><th>Hora</th><th>Atividade</th><th>Responsável</th><th>Ação</th></tr></thead>
                        <tbody>
                            ${dayActs.map(a => `
                                <tr id="act-row-${a.id}">
                                    <td>
                                        <span class="view-mode">${a.time.substring(0,5)}</span>
                                        <input type="time" class="edit-mode" value="${a.time.substring(0,5)}" style="display:none;" />
                                    </td>
                                    <td>
                                        <span class="view-mode">${escapeHTML(a.description)}</span>
                                        <input type="text" class="edit-mode" value="${escapeHTML(a.description)}" style="display:none;" />
                                    </td>
                                    <td>
                                        <span class="view-mode">${escapeHTML(a.responsible || '')}</span>
                                        <input type="text" class="edit-mode" value="${escapeHTML(a.responsible || '')}" style="display:none;" />
                                    </td>
                                    <td>
                                        <button type="button" class="btn-text view-mode" style="color:var(--accent-color); padding:0;" onclick="editActivityRow('${a.id}')">Editar</button>
                                        <button type="button" class="btn-text edit-mode" style="color:green; padding:0; display:none;" onclick="saveActivityRow('${a.id}')">Salvar</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${dayActs.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#888;">Nenhuma atividade cadastrada neste dia</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
                <form onsubmit="addInlineActivity(event, '${dateStr}')" style="display:flex; gap:1rem; align-items:flex-end; flex-wrap: wrap;">
                    <div class="input-group" style="flex:1; min-width:100px;"><label>Hora</label><input type="time" name="time" required></div>
                    <div class="input-group" style="flex:2; min-width:200px;"><label>O que será feito</label><input type="text" name="description" required></div>
                    <div class="input-group" style="flex:1; min-width:150px;"><label>Responsável</label><input type="text" name="responsible" required></div>
                    <div class="input-group" style="flex:0; margin-bottom: 1.5rem;"><button type="submit" class="btn-primary" style="width: max-content; padding: 0.8rem 1.5rem; height: 46px;">+ Adicionar</button></div>
                </form>
            </div>`;

            // Construir HTML dos Cardápios do Dia
            menusHtml += `
            <div class="glass-card" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem; color: var(--accent-color);">
                    Dia ${index + 1} - ${dateDisplay}
                </h4>
                <div style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; margin-bottom: 1rem;">
                        <thead><tr><th>Refeição</th><th>Cardápio</th><th>Ação</th></tr></thead>
                        <tbody>
                            ${dayMenus.map(m => `
                                <tr id="mnu-row-${m.id}">
                                    <td>
                                        <span class="view-mode">${escapeHTML(m.meal)}</span>
                                        <select class="edit-mode" style="display:none;">
                                            <option value="Café da Manhã" ${m.meal === 'Café da Manhã' ? 'selected' : ''}>Café da Manhã</option>
                                            <option value="Almoço" ${m.meal === 'Almoço' ? 'selected' : ''}>Almoço</option>
                                            <option value="Jantar" ${m.meal === 'Jantar' ? 'selected' : ''}>Jantar</option>
                                            <option value="Lanche" ${m.meal === 'Lanche' ? 'selected' : ''}>Lanche</option>
                                        </select>
                                    </td>
                                    <td>
                                        <span class="view-mode">${escapeHTML(m.description)}</span>
                                        <input type="text" class="edit-mode" value="${escapeHTML(m.description)}" style="display:none;" />
                                    </td>
                                    <td>
                                        <button type="button" class="btn-text view-mode" style="color:var(--accent-color); padding:0;" onclick="editMenuRow('${m.id}')">Editar</button>
                                        <button type="button" class="btn-text edit-mode" style="color:green; padding:0; display:none;" onclick="saveMenuRow('${m.id}')">Salvar</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${dayMenus.length === 0 ? '<tr><td colspan="3" style="text-align:center; color:#888;">Nenhum cardápio cadastrado neste dia</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
                <form onsubmit="addInlineMenu(event, '${dateStr}')" style="display:flex; gap:1rem; align-items:flex-end; flex-wrap: wrap;">
                    <div class="input-group" style="flex:1; min-width:150px;"><label>Refeição</label>
                        <select name="meal" required>
                            <option value="Café da Manhã">Café da Manhã</option>
                            <option value="Almoço">Almoço</option>
                            <option value="Jantar">Jantar</option>
                            <option value="Lanche">Lanche</option>
                        </select>
                    </div>
                    <div class="input-group" style="flex:2; min-width:200px;"><label>Cardápio</label><input type="text" name="description" required></div>
                    <div class="input-group" style="flex:0; margin-bottom: 1.5rem;"><button type="submit" class="btn-primary" style="width: max-content; padding: 0.8rem 1.5rem; height: 46px;">+ Adicionar</button></div>
                </form>
            </div>`;
        });

        activitiesDaysContainer.innerHTML = actsHtml;
        menusDaysContainer.innerHTML = menusHtml;
    }

    window.addInlineActivity = async (e, dateStr) => {
        e.preventDefault();
        if (!currentPlanningId) return;

        const form = e.target;
        const time = form.time.value;
        const description = form.description.value;
        const responsible = form.responsible.value;

        try {
            await apiFetch(`/api/plannings/${currentPlanningId}/activities`, {
                method: 'POST',
                body: JSON.stringify({ date: dateStr, time, description, responsible })
            });
            openPlanning(currentPlanningId); // Reload details
            if(typeof showStatus === 'function') showStatus('Atividade adicionada', 'success');
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao adicionar atividade', 'error');
        }
    };

    window.addInlineMenu = async (e, dateStr) => {
        e.preventDefault();
        if (!currentPlanningId) return;

        const form = e.target;
        const meal = form.meal.value;
        const description = form.description.value;

        try {
            await apiFetch(`/api/plannings/${currentPlanningId}/menus`, {
                method: 'POST',
                body: JSON.stringify({ date: dateStr, meal, description })
            });
            openPlanning(currentPlanningId); // Reload details
            if(typeof showStatus === 'function') showStatus('Cardápio adicionado', 'success');
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao adicionar cardápio', 'error');
        }
    };

    // Submissão avulsa
    activityForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentPlanningId) return;
        const date = document.getElementById('act-date').value;
        const time = document.getElementById('act-time').value;
        const description = document.getElementById('act-desc').value;
        const responsible = document.getElementById('act-resp').value;
        try {
            await apiFetch(`/api/plannings/${currentPlanningId}/activities`, {
                method: 'POST',
                body: JSON.stringify({ date, time, description, responsible })
            });
            activityForm.reset();
            openPlanning(currentPlanningId); 
            if(typeof showStatus === 'function') showStatus('Atividade adicionada', 'success');
        } catch (err) {
            console.error(err);
        }
    };

    menuForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentPlanningId) return;
        const date = document.getElementById('mnu-date').value;
        const meal = document.getElementById('mnu-meal').value;
        const description = document.getElementById('mnu-desc').value;
        try {
            await apiFetch(`/api/plannings/${currentPlanningId}/menus`, {
                method: 'POST',
                body: JSON.stringify({ date, meal, description })
            });
            menuForm.reset();
            openPlanning(currentPlanningId); 
            if(typeof showStatus === 'function') showStatus('Cardápio adicionado', 'success');
        } catch (err) {
            console.error(err);
        }
    };

    window.deleteActivity = async (id) => {
        if (!confirm('Deseja excluir esta atividade?')) return;
        try {
            await apiFetch(`/api/plannings/activities/${id}`, { method: 'DELETE' });
            openPlanning(currentPlanningId);
        } catch(err) {
            console.error(err);
        }
    };

    window.deleteMenu = async (id) => {
        if (!confirm('Deseja excluir este cardápio?')) return;
        try {
            await apiFetch(`/api/plannings/menus/${id}`, { method: 'DELETE' });
            openPlanning(currentPlanningId);
        } catch(err) {
            console.error(err);
        }
    };

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        // Converte YYYY-MM-DD para DD/MM/YYYY localmente, ignorando timezone do sistema para n dar bug de um dia antes
        const parts = dateStr.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }

window.editActivityRow = (id) => {
        const row = document.getElementById('act-row-' + id);
        if (!row) return;
        row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'none');
        row.querySelectorAll('.edit-mode').forEach(el => el.style.display = '');
    };

    window.saveActivityRow = async (id) => {
        const row = document.getElementById('act-row-' + id);
        if (!row) return;
        
        const inputs = row.querySelectorAll('.edit-mode');
        const time = inputs[0].value;
        const description = inputs[1].value;
        const responsible = inputs[2].value;

        try {
            await apiFetch('/api/plannings/activities/' + id, {
                method: 'PUT',
                body: JSON.stringify({ time, description, responsible })
            });
            openPlanning(currentPlanningId);
            if(typeof showStatus === 'function') showStatus('Atividade atualizada', 'success');
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao atualizar', 'error');
        }
    };

    window.editMenuRow = (id) => {
        const row = document.getElementById('mnu-row-' + id);
        if (!row) return;
        row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'none');
        row.querySelectorAll('.edit-mode').forEach(el => el.style.display = '');
    };

    window.saveMenuRow = async (id) => {
        const row = document.getElementById('mnu-row-' + id);
        if (!row) return;
        
        const meal = row.querySelector('select.edit-mode').value;
        const description = row.querySelector('input[type="text"].edit-mode').value;

        try {
            await apiFetch('/api/plannings/menus/' + id, {
                method: 'PUT',
                body: JSON.stringify({ meal, description })
            });
            openPlanning(currentPlanningId);
            if(typeof showStatus === 'function') showStatus('Cardápio atualizado', 'success');
        } catch (err) {
            console.error(err);
            if(typeof showStatus === 'function') showStatus('Erro ao atualizar', 'error');
        }
    };


const btnOpenExport = document.getElementById('btn-open-export');
    const exportModal = document.getElementById('export-modal');
    const btnConfirmExport = document.getElementById('btn-confirm-export');

    if (btnOpenExport) {
        btnOpenExport.onclick = () => {
            if (exportModal) exportModal.style.display = 'flex';
        };
    }

    if (btnConfirmExport) {
        btnConfirmExport.onclick = () => {
            
            const contentOpt = document.getElementById('export-content').value;
            generateExport(null, contentOpt);
            exportModal.style.display = 'none';
        };
    }

    
    const reportModal = document.getElementById('report-modal');
    const reportPrintable = document.getElementById('report-printable');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnDownloadDoc = document.getElementById('btn-download-doc');

    let lastPrintHtml = '';

    function generateHeader(title) {
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px;">
                <div style="flex: 1;">
                    <img src="${window.location.origin}/logo.png" style="width: 100px; height: auto;" onerror="this.style.display='none'">
                </div>
                <div style="flex: 2; text-align: center;">
                    <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: 700;">${title}</h1>
                </div>
                <div style="flex: 1; text-align: right; font-size: 12px;">
                    Planejamento: <strong>${escapeHTML(currentPlanningData.name)}</strong><br>
                    Período: ${formatDateDisplay(currentPlanningData.start_date)} a ${formatDateDisplay(currentPlanningData.end_date)}
                </div>
            </div>
        `;
    }

    
    function getDayOfWeek(dateStr) {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, d);
        const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return dias[dateObj.getDay()];
    }

    function generateExport(format, contentOpt) {
        if (!currentPlanningData) return;

        let printHtml = '<div style="font-family: Arial, sans-serif; color: #000; background: #fff; line-height: 1.5;">';

        const startStr = currentPlanningData.start_date.split('T')[0];
        const endStr = currentPlanningData.end_date.split('T')[0];
        const dates = getDatesInRange(startStr, endStr);

        // Section 1: Activities (Cronograma)
        if (contentOpt === 'all' || contentOpt === 'activities') {
            printHtml += generateHeader('Cronograma Acampamento');
            let actsHtml = '';
            dates.forEach((dateStr, index) => {
                const dateDisplay = formatDateDisplay(dateStr);
                const dayActs = (currentPlanningData.activities || []).filter(a => a.date.startsWith(dateStr));
                
                if (dayActs.length > 0) {
                    actsHtml += `
                        <div style="margin-bottom: 20px; page-break-inside: avoid;">
                            <h3 style="font-size: 16px; margin-bottom: 15px; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
                                <span style="background: #a00; color: white; padding: 4px 10px; border-radius: 4px; font-size: 13px; margin-right: 8px; text-transform: uppercase;">Dia ${index + 1}</span>
                                <span style="color: #333; font-weight: 600;">${getDayOfWeek(dateStr)}, ${dateDisplay}</span>
                            </h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px;">
                                <thead>
                                    <tr style="background: #f1f1f1;">
                                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 80px;">Hora</th>
                                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">O que será feito</th>
                                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 150px;">Responsável</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${dayActs.map(a => `
                                        <tr>
                                            <td style="border: 1px solid #ddd; padding: 10px;">${a.time.substring(0,5)}</td>
                                            <td style="border: 1px solid #ddd; padding: 10px;">${escapeHTML(a.description)}</td>
                                            <td style="border: 1px solid #ddd; padding: 10px; color: #a00; font-weight: 600;">${escapeHTML(a.responsible || '-')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            });
            if (actsHtml === '') actsHtml = '<p style="text-align:center; color:#666;">Nenhuma atividade cadastrada neste planejamento.</p>';
            printHtml += actsHtml;
        }

        // Section 2: Menus (Cardápio)
        if (contentOpt === 'all' || contentOpt === 'menus') {
            if (contentOpt === 'all') {
                // Add page break before menus if both are generated
                printHtml += '<div style="page-break-before: always; margin-top: 40px;"></div>';
            }
            printHtml += generateHeader('Cardápio Acampamento');
            
            let menusHtml = '';
            dates.forEach((dateStr, index) => {
                const dateDisplay = formatDateDisplay(dateStr);
                const dayMenus = (currentPlanningData.menus || []).filter(m => m.date.startsWith(dateStr));
                
                if (dayMenus.length > 0) {
                    menusHtml += `
                        <div style="margin-bottom: 20px; page-break-inside: avoid;">
                            <h3 style="font-size: 16px; margin-bottom: 15px; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
                                <span style="background: #a00; color: white; padding: 4px 10px; border-radius: 4px; font-size: 13px; margin-right: 8px; text-transform: uppercase;">Dia ${index + 1}</span>
                                <span style="color: #333; font-weight: 600;">${getDayOfWeek(dateStr)}, ${dateDisplay}</span>
                            </h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px;">
                                <thead>
                                    <tr style="background: #f1f1f1;">
                                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 150px;">Refeição</th>
                                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cardápio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${dayMenus.map(m => `
                                        <tr>
                                            <td style="border: 1px solid #ddd; padding: 10px; font-weight: 600;">${escapeHTML(m.meal)}</td>
                                            <td style="border: 1px solid #ddd; padding: 10px;">${escapeHTML(m.description)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            });
            if (menusHtml === '') menusHtml = '<p style="text-align:center; color:#666;">Nenhum cardápio cadastrado neste planejamento.</p>';
            printHtml += menusHtml;
        }

        printHtml += '</div>';
        
        const reportPrintable = document.getElementById('report-printable');
        const reportModal = document.getElementById('report-modal');

        if (reportPrintable && reportModal) {
            reportPrintable.innerHTML = printHtml;
            reportModal.style.display = 'flex';
        }
    }

});