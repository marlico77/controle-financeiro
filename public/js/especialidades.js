let especialidadesList = [];
let currentEspecialidade = null;

// Inicializa a página
document.addEventListener('DOMContentLoaded', async () => {
    // A navbar e tabs são gerenciados pelo core.js, garantindo que 'especialidades' seja a tab ativa na URL.
    
    // Adicionar botão de admin se for o caso
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const adminBtnHtml = `
            <div id="especialidades-actions" style="display: none; gap: 0.8rem; align-items: center;">
                <button id="add-especialidade-btn" class="btn-primary btn-small">Nova Especialidade</button>
            </div>
        `;
        headerActions.insertAdjacentHTML('beforeend', adminBtnHtml);
    }
    
    // Mostra o botão se for admin
    if (state.role === 'admin') {
        const ac = document.getElementById('especialidades-actions');
        if (ac) ac.style.display = 'flex';
    }
    
    // Bind eventos de busca e filtro
    document.getElementById('especialidades-search').addEventListener('input', filterEspecialidades);
    document.getElementById('especialidades-category-filter').addEventListener('change', filterEspecialidades);
    
    // Modais
    const adminModal = document.getElementById('especialidade-admin-modal');
    const detailModal = document.getElementById('especialidade-detail-modal');
    
    document.getElementById('close-especialidade-admin').onclick = () => adminModal.style.display = 'none';
    document.getElementById('close-especialidade-detail').onclick = () => detailModal.style.display = 'none';
    
    const addBtn = document.getElementById('add-especialidade-btn');
    if (addBtn) {
        addBtn.onclick = () => {
            currentEspecialidade = null;
            document.getElementById('especialidade-form').reset();
            document.getElementById('especialidade-id').value = '';
            document.getElementById('especialidade-admin-title').innerText = 'Nova Especialidade';
            renderRequisitosBuilder([{texto: '', sub: []}]);
            adminModal.style.display = 'flex';
        };
    }
    
    document.getElementById('especialidade-form').onsubmit = handleSaveEspecialidade;
    
    // Ajustar o titulo da pagina
    const pageTitle = document.getElementById('page-title');
    if(pageTitle) pageTitle.innerText = "Especialidades";

    // Mostra o conteúdo ativo (hack caso core.js nãof aça automático)
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    const especialidadesPage = document.getElementById('especialidades-page');
    if(especialidadesPage) especialidadesPage.style.display = 'block';

    await loadEspecialidades();
});

async function loadEspecialidades() {
    try {
        const data = await apiFetch('/api/especialidades');
        especialidadesList = data;
        renderEspecialidades(data);
    } catch (err) {
        console.error(err);
        showStatus('Erro ao carregar especialidades', 'error');
    }
}

function filterEspecialidades() {
    const term = document.getElementById('especialidades-search').value.toLowerCase();
    const category = document.getElementById('especialidades-category-filter').value;
    
    const filtered = especialidadesList.filter(esp => {
        const matchName = esp.nome.toLowerCase().includes(term);
        const matchCat = category === '' || esp.categoria === category;
        return matchName && matchCat;
    });
    
    renderEspecialidades(filtered);
}

function renderEspecialidades(list) {
    const grid = document.getElementById('especialidades-grid');
    grid.innerHTML = '';
    
    if (list.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-color); opacity: 0.7;">Nenhuma especialidade encontrada.</p>';
        return;
    }
    
    list.forEach(esp => {
        const card = document.createElement('div');
        // Mantemos a classe glass-card para o padrão do sistema, mas com padding menor e sem fundo vazio
        card.className = 'especialidade-card';
        card.style.cursor = 'pointer';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.padding = '0.8rem';
        card.style.position = 'relative';
        card.style.background = 'transparent'; // Fundo transparente conforme o screenshot
        // Efeito de hover suave
        card.onmouseover = () => card.style.transform = 'translateY(-3px)';
        card.onmouseout = () => card.style.transform = 'translateY(0)';
        card.style.transition = 'transform 0.2s';
        
        let adminBtns = '';
        if (state.role === 'admin') {
            adminBtns = `
                <div class="admin-actions" style="position: absolute; top: 0; right: 0; display: flex; gap: 2px; opacity: 0.7;">
                    <button class="btn-icon edit-btn" style="color: var(--text-color); background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Editar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 14px; height: 14px; fill: currentColor;"><path d="M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z"/></svg>
                    </button>
                    <button class="btn-icon del-btn" style="color: var(--text-dim); background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 14px; height: 14px; fill: currentColor;"><path d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/></svg>
                    </button>
                </div>
            `;
        }

        let imgUrl = esp.imagem_url;
        if (!imgUrl || imgUrl === 'null' || String(imgUrl).trim() === '') {
            imgUrl = 'ico_especialidade.svg';
        }
        
        card.innerHTML = `
            ${adminBtns}
            <div style="margin-bottom: 0.8rem; display: flex; align-items: center; justify-content: center; width: 100px; height: 100px;">
                <img src="${escapeHTML(safeURL(imgUrl))}" alt="${escapeHTML(esp.nome)}" onerror="this.onerror=null; this.src='ico_especialidade.svg';" style="width: 100%; height: 100%; object-fit: contain;">
            </div>
            <span style="color: var(--text-dim); font-size: 0.75rem; font-weight: 700; margin-bottom: 0.3rem;">${escapeHTML(esp.codigo || 'S/N')}</span>
            <span style="text-align: center; color: var(--text-color); font-size: 0.85rem; font-weight: 600; line-height: 1.2;">${escapeHTML(esp.nome)}</span>
        `;
        
        // Abre os detalhes
        card.addEventListener('click', (e) => {
            if (e.target.closest('.edit-btn') || e.target.closest('.del-btn')) return;
            openEspecialidadeDetails(esp);
        });
        
        if (state.role === 'admin') {
            card.querySelector('.edit-btn').onclick = () => openEditEspecialidade(esp);
            card.querySelector('.del-btn').onclick = () => deleteEspecialidade(esp.id);
        }
        
        grid.appendChild(card);
    });
}

function openEspecialidadeDetails(esp) {
    const detailContent = document.getElementById('especialidade-detail-content');
    
    // Parse requisitos
    let reqsHtml = '<ol style="padding-left: 1.5rem; color: var(--text-color);">';
    let reqs = [];
    try {
        reqs = typeof esp.requisitos === 'string' ? JSON.parse(esp.requisitos) : esp.requisitos;
        if (!Array.isArray(reqs)) reqs = [];
    } catch(e) { reqs = []; }
    
    reqs.forEach(req => {
        reqsHtml += `<li style="margin-bottom: 1rem;"><span class="texto" style="margin-bottom: 0.5rem; display: block;">${escapeHTML(req.texto || '')}</span>`;
        if (req.resposta) {
            reqsHtml += `<div style="background: rgba(0,0,0,0.1); padding: 0.5rem 1rem; margin-bottom: 0.8rem; border-radius: 4px; font-size: 0.9rem; color: var(--text-dim);"><strong>Resposta:</strong> ${escapeHTML(req.resposta)}</div>`;
        }
        if (req.sub && Array.isArray(req.sub)) {
            reqsHtml += `<ol style="list-style-type: lower-alpha; padding-left: 1.5rem; margin-bottom: 1rem;">`;
            req.sub.forEach(subReq => {
                const subTxt = typeof subReq === 'object' ? subReq.texto : subReq;
                const subResp = typeof subReq === 'object' ? subReq.resposta : null;
                reqsHtml += `<li style="margin-bottom: 0.8rem;"><span class="texto" style="margin-bottom: 0.3rem; display: block;">${escapeHTML(subTxt || '')}</span>`;
                if (subResp) {
                    reqsHtml += `<div style="background: rgba(0,0,0,0.1); padding: 0.4rem 0.8rem; margin-bottom: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: var(--text-dim);"><strong>Resposta:</strong> ${escapeHTML(subResp)}</div>`;
                }
                reqsHtml += `</li>`;
            });
            reqsHtml += `</ol>`;
        }
        reqsHtml += `</li>`;
    });
    reqsHtml += '</ol>';

    if (reqs.length === 0) {
        reqsHtml = '<p style="color: #888;">Nenhum requisito cadastrado.</p>';
    }

    let imgUrl = esp.imagem_url;
    if (!imgUrl || imgUrl === 'null' || String(imgUrl).trim() === '') {
        imgUrl = 'ico_especialidade.svg';
    }

    detailContent.innerHTML = `
        <div style="display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap;">
            <div style="flex: 0 0 auto; text-align: center;">
                <img src="${escapeHTML(safeURL(imgUrl))}" alt="${escapeHTML(esp.nome)}" onerror="this.onerror=null; this.src='ico_especialidade.svg';" style="width: 150px; height: 150px; object-fit: contain;">
            </div>
            <div style="flex: 1 1 300px;">
                <h3 style="color: var(--text-color); margin-bottom: 0.5rem;">${escapeHTML(esp.nome)}</h3>
                <p style="color: var(--text-dim); margin-bottom: 0.5rem;"><strong>Código:</strong> ${escapeHTML(esp.codigo || 'N/A')}</p>
            </div>
        </div>
        
        <div style="margin-bottom: 2rem; overflow-x: auto;">
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <thead style="background: rgba(0,0,0,0.02);">
                    <tr>
                        <th style="border-bottom: 1px solid var(--border-color); padding: 12px;">Área</th>
                        <th style="border-bottom: 1px solid var(--border-color); padding: 12px;">Código</th>
                        <th style="border-bottom: 1px solid var(--border-color); padding: 12px;">Nível</th>
                        <th style="border-bottom: 1px solid var(--border-color); padding: 12px;">Ano</th>
                        <th style="border-bottom: 1px solid var(--border-color); padding: 12px;">Instituição</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 12px;">${escapeHTML(esp.categoria)}</td>
                        <td style="padding: 12px;">${escapeHTML(esp.codigo || '-')}</td>
                        <td style="padding: 12px;">${escapeHTML(esp.nivel || '-')}</td>
                        <td style="padding: 12px;">${escapeHTML(esp.ano || '-')}</td>
                        <td style="padding: 12px;">${escapeHTML(esp.instituicao || '-')}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <h3 style="color: var(--text-color);">Requisitos</h3>
        <hr style="border-color: var(--border-color); margin-bottom: 1rem;">
        <div style="line-height: 1.6;">
            ${reqsHtml}
        </div>
    `;
    
    document.getElementById('especialidade-detail-modal').style.display = 'flex';
}

function openEditEspecialidade(esp) {
    currentEspecialidade = esp;
    document.getElementById('especialidade-id').value = esp.id;
    document.getElementById('especialidade-nome').value = esp.nome;
    document.getElementById('especialidade-categoria').value = esp.categoria;
    document.getElementById('especialidade-codigo').value = esp.codigo || '';
    document.getElementById('especialidade-nivel').value = esp.nivel || '';
    document.getElementById('especialidade-ano').value = esp.ano || '';
    document.getElementById('especialidade-instituicao').value = esp.instituicao || '';
    
    let reqData = [];
    try {
        reqData = typeof esp.requisitos === 'string' ? JSON.parse(esp.requisitos) : esp.requisitos;
        if (!Array.isArray(reqData)) reqData = [];
    } catch(e) { reqData = []; }
    renderRequisitosBuilder(reqData);
    
    document.getElementById('especialidade-admin-title').innerText = 'Editar Especialidade';
    document.getElementById('especialidade-admin-modal').style.display = 'flex';
}

async function handleSaveEspecialidade(e) {
    e.preventDefault();
    
    const id = document.getElementById('especialidade-id').value;
    const isEditing = !!id;
    const btn = document.getElementById('btn-save-especialidade');
    
    let requisitosData = extractRequisitosFromBuilder();
    
    const formData = new FormData();
    formData.append('nome', document.getElementById('especialidade-nome').value);
    formData.append('categoria', document.getElementById('especialidade-categoria').value);
    formData.append('codigo', document.getElementById('especialidade-codigo').value);
    formData.append('nivel', document.getElementById('especialidade-nivel').value);
    formData.append('ano', document.getElementById('especialidade-ano').value);
    formData.append('instituicao', document.getElementById('especialidade-instituicao').value);
    formData.append('requisitos', JSON.stringify(requisitosData));
    
    const imageFile = document.getElementById('especialidade-imagem').files[0];
    if (imageFile) {
        formData.append('imagem', imageFile);
    }
    
    if (isEditing && currentEspecialidade && currentEspecialidade.imagem_url) {
        formData.append('imagem_url_existente', currentEspecialidade.imagem_url);
    }
    
    btn.disabled = true;
    btn.innerText = 'Salvando...';
    document.getElementById('especialidade-admin-error').innerText = '';
    
    try {
        const url = isEditing ? `/api/especialidades/${id}` : '/api/especialidades';
        const method = isEditing ? 'PUT' : 'POST';
        
        await apiFetch(url, {
            method: method,
            body: formData
        });
        
        showStatus('Especialidade salva com sucesso!', 'success');
        document.getElementById('especialidade-admin-modal').style.display = 'none';
        await loadEspecialidades();
    } catch (err) {
        console.error(err);
        document.getElementById('especialidade-admin-error').innerText = err.message || 'Erro ao salvar.';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Salvar Especialidade';
    }
}

async function deleteEspecialidade(id) {
    if (!confirm('Tem certeza que deseja excluir esta especialidade? Esta ação não pode ser desfeita.')) return;
    
    try {
        await apiFetch(`/api/especialidades/${id}`, { method: 'DELETE' });
        showStatus('Especialidade excluída.', 'success');
        await loadEspecialidades();
    } catch (err) {
        console.error(err);
        showStatus('Erro ao excluir especialidade.', 'error');
    }
}


// --- DYNAMIC REQUISITOS BUILDER ---

function renderRequisitosBuilder(requisitos) {
    const builder = document.getElementById('requisitos-builder');
    builder.innerHTML = '';
    
    if (requisitos.length === 0) {
        requisitos.push({texto: '', sub: []});
    }

    requisitos.forEach((req, index) => {
        addRequisitoToDOM(req, index + 1);
    });
    
    updateRequisitosNumbers();
}

document.addEventListener('DOMContentLoaded', () => {
    // Escuta clique no botão global de adicionar requisito
    const btnAddReq = document.getElementById('btn-add-req');
    if (btnAddReq) {
        btnAddReq.addEventListener('click', () => {
            addRequisitoToDOM({texto: '', sub: []}, 999);
            updateRequisitosNumbers();
            
            // Rolar para o final
            const builder = document.getElementById('requisitos-builder');
            builder.scrollTop = builder.scrollHeight;
        });
    }
});

function addRequisitoToDOM(req, number) {
    const builder = document.getElementById('requisitos-builder');
    
    const reqDiv = document.createElement('div');
    reqDiv.className = 'req-item';
    reqDiv.style.border = '1px solid var(--border-color)';
    reqDiv.style.padding = '1rem';
    reqDiv.style.borderRadius = '8px';
    reqDiv.style.background = 'rgba(255, 255, 255, 0.03)';
    
    reqDiv.innerHTML = `
        <div style="display: flex; gap: 0.8rem; margin-bottom: 0.8rem; align-items: flex-start;">
            <span style="font-weight: 700; color: var(--accent-color); margin-top: 0.5rem;" class="req-number">${number}.</span>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                <textarea class="req-text" rows="2" style="padding: 0.6rem; border-radius: 6px; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); resize: vertical; width: 100%;" placeholder="Descreva a pergunta ou requisito principal..."></textarea>
                <textarea class="req-answer" rows="2" style="padding: 0.6rem; border-radius: 6px; background: rgba(0,0,0,0.1); border: 1px dashed var(--border-color); color: var(--text-color); resize: vertical; width: 100%;" placeholder="Resposta para a pergunta (opcional)..."></textarea>
            </div>
            <button type="button" class="btn-icon del-req-btn" style="color: var(--text-dim); cursor: pointer; padding: 0.5rem; border: none; background: transparent; display: flex; align-items: center; justify-content: center;" title="Remover requisito">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 16px; height: 16px; fill: currentColor;"><path d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/></svg>
            </button>
        </div>
        <div class="sub-req-list" style="padding-left: 2.2rem; display: flex; flex-direction: column; gap: 0.6rem;">
            <!-- Subrequisitos -->
        </div>
        <button type="button" class="btn-text add-sub-req-btn" style="margin-top: 0.8rem; font-size: 0.85rem; padding-left: 2.2rem; color: var(--accent-color); font-weight: 600;">+ Adicionar subpergunta (Letra)</button>
    `;
    
    // Set textarea value securely
    reqDiv.querySelector('.req-text').value = req.texto || '';
    if (req.resposta) reqDiv.querySelector('.req-answer').value = req.resposta;
    
    // Add subs
    const subList = reqDiv.querySelector('.sub-req-list');
    if (req.sub && Array.isArray(req.sub)) {
        req.sub.forEach(subText => {
            addSubRequisitoToDOM(subList, subText);
        });
    }
    
    // Events
    reqDiv.querySelector('.del-req-btn').addEventListener('click', () => {
        reqDiv.remove();
        updateRequisitosNumbers();
    });
    
    reqDiv.querySelector('.add-sub-req-btn').addEventListener('click', () => {
        addSubRequisitoToDOM(subList, '');
        updateRequisitosNumbers();
    });
    
    builder.appendChild(reqDiv);
}

function addSubRequisitoToDOM(container, text) {
    const subDiv = document.createElement('div');
    subDiv.className = 'sub-req-item';
    subDiv.style.display = 'flex';
    subDiv.style.gap = '0.5rem';
    subDiv.style.alignItems = 'center';
    
    subDiv.innerHTML = `
        <span style="font-weight: 600; color: #888; margin-top: 0.5rem;" class="sub-req-letter">a)</span>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
            <input type="text" class="sub-req-text" style="padding: 0.5rem; border-radius: 4px; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); width: 100%;" placeholder="Descreva a subpergunta...">
            <input type="text" class="sub-req-answer" style="padding: 0.5rem; border-radius: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--border-color); color: var(--text-color); width: 100%;" placeholder="Resposta para a subpergunta (opcional)...">
        </div>
        <button type="button" class="btn-icon del-sub-req-btn" style="color: var(--text-dim); cursor: pointer; border: none; background: transparent; display: flex; align-items: flex-start; justify-content: center; padding: 4px; margin-top: 0.2rem;" title="Remover subpergunta">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width: 14px; height: 14px; fill: currentColor;"><path d="M232.7 69.9C237.1 56.8 249.3 48 263.1 48L377 48C390.8 48 403 56.8 407.4 69.9L416 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128C96 110.3 110.3 96 128 96L224 96L232.7 69.9zM128 208L512 208L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 208zM216 272C202.7 272 192 282.7 192 296L192 488C192 501.3 202.7 512 216 512C229.3 512 240 501.3 240 488L240 296C240 282.7 229.3 272 216 272zM320 272C306.7 272 296 282.7 296 296L296 488C296 501.3 306.7 512 320 512C333.3 512 344 501.3 344 488L344 296C344 282.7 333.3 272 320 272zM424 272C410.7 272 400 282.7 400 296L400 488C400 501.3 410.7 512 424 512C437.3 512 448 501.3 448 488L448 296C448 282.7 437.3 272 424 272z"/></svg>
        </button>
    `;
    
    // Set value if text is an object with {texto, resposta}
    if (typeof text === 'object') {
        subDiv.querySelector('.sub-req-text').value = text.texto || '';
        if (text.resposta) subDiv.querySelector('.sub-req-answer').value = text.resposta;
    } else {
        subDiv.querySelector('.sub-req-text').value = text || '';
    }
    
    subDiv.querySelector('.del-sub-req-btn').addEventListener('click', () => {
        subDiv.remove();
        updateRequisitosNumbers();
    });
    
    container.appendChild(subDiv);
}

function updateRequisitosNumbers() {
    const builder = document.getElementById('requisitos-builder');
    if (!builder) return;
    const reqItems = builder.querySelectorAll('.req-item');
    
    reqItems.forEach((req, reqIndex) => {
        // Atualiza numero principal
        req.querySelector('.req-number').innerText = (reqIndex + 1) + '.';
        
        // Atualiza letras dos subrequisitos
        const subItems = req.querySelectorAll('.sub-req-item');
        subItems.forEach((sub, subIndex) => {
            // A = 97 em ASCII
            const letter = String.fromCharCode(97 + subIndex) + ')';
            sub.querySelector('.sub-req-letter').innerText = letter;
        });
    });
}

function extractRequisitosFromBuilder() {
    const builder = document.getElementById('requisitos-builder');
    if (!builder) return [];
    const reqItems = builder.querySelectorAll('.req-item');
    const result = [];
    
    reqItems.forEach(req => {
        const texto = req.querySelector('.req-text').value.trim();
        const resposta = req.querySelector('.req-answer').value.trim();
        
        const subItems = req.querySelectorAll('.sub-req-item');
        
        const subs = [];
        subItems.forEach(sub => {
            const subTxt = sub.querySelector('.sub-req-text').value.trim();
            const subResp = sub.querySelector('.sub-req-answer').value.trim();
            if (subTxt || subResp) {
                subs.push({
                    texto: subTxt,
                    resposta: subResp
                });
            }
        });
        
        if (texto || resposta || subs.length > 0) {
            result.push({
                texto: texto,
                resposta: resposta,
                sub: subs
            });
        }
    });
    
    return result;
}
