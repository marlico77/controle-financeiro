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
}
window.deleteSale = deleteSale;

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
        } catch{
            showStatus('Erro ao salvar venda', 'error');
        }
    };
}


