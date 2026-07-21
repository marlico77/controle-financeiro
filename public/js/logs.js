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

