document.addEventListener('DOMContentLoaded', () => {
    // Apenas rodar esse script na página de uniformes
    if (!window.location.pathname.includes('uniformes.html')) return;

    const addForm = document.getElementById('uniform-add-form');
    if (!addForm) return;

    let cart = [];

    const itemType = document.getElementById('u-item-type');
    const itemSize = document.getElementById('u-item-size');
    const itemQty = document.getElementById('u-item-qty');
    const singleSizeContainer = document.getElementById('u-single-size-container');
    const multiSizeContainer = document.getElementById('u-multi-size-container');
    const sizeShirt = document.getElementById('u-multi-size-shirt');
    const sizePants = document.getElementById('u-multi-size-pants');
    const sizeSweater = document.getElementById('u-multi-size-sweater');

    const cartList = document.getElementById('uniform-cart-list');
    const priceDisplay = document.getElementById('uniform-price-display');
    const saveBtn = document.getElementById('uniformes-save-btn');

    itemType.addEventListener('change', () => {
        if (itemType.value === 'Uniforme Completo') {
            singleSizeContainer.style.display = 'none';
            multiSizeContainer.style.display = 'flex';
        } else {
            singleSizeContainer.style.display = 'block';
            multiSizeContainer.style.display = 'none';
        }
    });

    const renderCart = () => {
        if (cart.length === 0) {
            cartList.innerHTML = '<p style="text-align: center; color: var(--text-dim); font-style: italic; margin-top: 1rem;">Nenhuma peça adicionada ainda.</p>';
            priceDisplay.textContent = 'Total do Pedido: R$ 0,00';
            return;
        }

        let html = '';
        let total = 0;

        cart.forEach((item, index) => {
            const itemTotal = item.qty * 30;
            total += itemTotal;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-radius: 6px; margin-bottom: 0.5rem; border: 1px solid var(--border-color);">
                    <div>
                        <strong>${item.qty}x ${item.type}</strong> (Tam: ${item.size})
                        <div style="font-size: 0.85rem; color: var(--text-dim);">Subtotal: R$ ${itemTotal},00</div>
                    </div>
                    <button type="button" class="btn-text btn-remove-item" data-index="${index}" style="color: var(--error-color); padding: 0.5rem; cursor: pointer;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
        });

        cartList.innerHTML = html;
        priceDisplay.textContent = `Total do Pedido: R$ ${total},00`;

        // Add event listeners to remove buttons
        document.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.currentTarget.getAttribute('data-index');
                cart.splice(idx, 1);
                renderCart();
            });
        });
    };

    addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = itemType.value;
        const qty = parseInt(itemQty.value, 10);

        if (!type || isNaN(qty) || qty < 1) {
            showStatus('Preencha os campos corretamente antes de adicionar.', 'error');
            return;
        }

        if (type === 'Uniforme Completo') {
            const sShirt = sizeShirt.value;
            const sPants = sizePants.value;
            const sSweater = sizeSweater.value;

            if (!sShirt || !sPants || !sSweater) {
                showStatus('Selecione os tamanhos para as 3 peças do uniforme completo.', 'error');
                return;
            }

            const itemsToAdd = [
                { type: 'Camisa', size: sShirt, qty },
                { type: 'Calça', size: sPants, qty },
                { type: 'Blusão', size: sSweater, qty }
            ];

            itemsToAdd.forEach(newItem => {
                const existingIdx = cart.findIndex(i => i.type === newItem.type && i.size === newItem.size);
                if (existingIdx >= 0) {
                    cart[existingIdx].qty += newItem.qty;
                } else {
                    cart.push(newItem);
                }
            });
        } else {
            const size = itemSize.value;
            if (!size) {
                showStatus('Selecione o tamanho.', 'error');
                return;
            }

            const existingIdx = cart.findIndex(i => i.type === type && i.size === size);
            if (existingIdx >= 0) {
                cart[existingIdx].qty += qty;
            } else {
                cart.push({ type, size, qty });
            }
        }

        // Reset form
        itemType.value = '';
        itemSize.value = '';
        sizeShirt.value = '';
        sizePants.value = '';
        sizeSweater.value = '';
        itemQty.value = 1;

        // Reset visibility
        singleSizeContainer.style.display = 'flex';
        multiSizeContainer.style.display = 'none';

        renderCart();
    });

    saveBtn.addEventListener('click', async () => {
        try {
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Salvando...';
            saveBtn.disabled = true;

            const result = await apiFetch('/api/uniforms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders: cart })
            });

            if (result && result.success) {
                showStatus(result.message || 'Pedido salvo com sucesso!', 'success');
            } else {
                showStatus(result?.error || 'Erro ao salvar o pedido.', 'error');
            }

            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        } catch (err) {
            console.error('Erro ao salvar pedido de uniformes:', err);
            showStatus('Falha ao comunicar com o servidor.', 'error');
            
            saveBtn.textContent = 'Finalizar Pedido';
            saveBtn.disabled = false;
        }
    });

    // Buscar tamanhos salvos ao carregar
    const loadUniformOrders = async () => {
        try {
            const data = await apiFetch('/api/uniforms');
            if (data && data.orders && Array.isArray(data.orders)) {
                cart = data.orders;
                renderCart();
            }
        } catch (err) {
            console.error('Erro ao carregar pedidos:', err);
        }
    };

    loadUniformOrders();

    // ==========================================
    // ADMIN LOGIC
    // ==========================================
    const sectionFazerPedido = document.getElementById('section-fazer-pedido');
    const adminPanel = document.getElementById('uniformes-admin-panel');
    const adminList = document.getElementById('admin-uniform-list');
    const tabUniformesPedido = document.getElementById('tab-uniformes-pedido');
    const tabUniformesAdmin = document.getElementById('tab-uniformes-admin');

    // Mostrar o item do submenu de gerenciar apenas se for admin
    const checkRoleAndShowAdmin = () => {
        let role = null;
        if (typeof state !== 'undefined' && state.role) {
            role = state.role;
        } else {
            role = localStorage.getItem('role') || sessionStorage.getItem('role');
        }

        if (role) {
            if (role === 'admin' || role === 'secretário') {
                if (tabUniformesAdmin) tabUniformesAdmin.style.display = 'block';
            }
        } else {
            setTimeout(checkRoleAndShowAdmin, 200);
        }
    };
    checkRoleAndShowAdmin();

    let adminData = [];

    const fetchAdminData = async () => {
        try {
            const data = await apiFetch('/api/uniforms/all');
            if (data && !data.error) {
                adminData = data;
            } else {
                console.error('Erro ao carregar dados:', data?.error || 'Desconhecido');
            }
        } catch (e) {
            console.error('Fetch Admin Data Error:', e);
        }
    };

    if (tabUniformesPedido) {
        tabUniformesPedido.addEventListener('click', () => {
            sectionFazerPedido.style.display = 'block';
            adminPanel.style.display = 'none';
            
            tabUniformesPedido.classList.add('active');
            tabUniformesPedido.style.color = 'var(--accent-color)';
            tabUniformesPedido.style.borderBottom = '2px solid var(--accent-color)';
            
            tabUniformesAdmin.classList.remove('active');
            tabUniformesAdmin.style.color = 'var(--text-dim)';
            tabUniformesAdmin.style.borderBottom = 'none';
        });
    }

    if (tabUniformesAdmin) {
        tabUniformesAdmin.addEventListener('click', () => {
            adminPanel.style.display = 'block';
            sectionFazerPedido.style.display = 'none';
            fetchAdminData();
            
            tabUniformesAdmin.classList.add('active');
            tabUniformesAdmin.style.color = 'var(--accent-color)';
            tabUniformesAdmin.style.borderBottom = '2px solid var(--accent-color)';
            
            tabUniformesPedido.classList.remove('active');
            tabUniformesPedido.style.color = 'var(--text-dim)';
            tabUniformesPedido.style.borderBottom = 'none';
        });
    }

    // CSV Download Helper
    const downloadCSV = (content, filename) => {
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // PDF Download Helper
    const downloadPDF = (htmlContent, filename) => {
        if (typeof html2pdf === 'undefined') {
            showStatus('Biblioteca de PDF ainda está carregando, tente novamente em alguns segundos.', 'error');
            return;
        }

        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        element.style.padding = '20px';
        element.style.fontFamily = 'sans-serif';
        element.style.color = 'black';
        element.style.background = 'white';
        
        html2pdf().set({
            margin: 15,
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
    };

    const btnGenerateReport = document.getElementById('generate-uniform-report-btn');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', () => {
            const reportType = document.getElementById('uniform-report-type').value;
            const modalSelector = document.getElementById('uniform-report-selector-modal');
            
            if (adminData.length === 0) return showStatus('Nenhum dado para exportar.', 'error');
            
            if (modalSelector) modalSelector.style.display = 'none'; // Close selector modal

            if (reportType === 'member_csv') {
                let csv = 'Membro;Peca;Tamanho;Quantidade\n';
                adminData.forEach(person => {
                    person.orders.forEach(order => {
                        csv += `${person.name};${order.type};${order.size};${order.qty}\n`;
                    });
                });
                downloadCSV(csv, 'relatorio_uniformes_membros.csv');
                
            } else if (reportType === 'consolidated_csv') {
                const totals = {};
                adminData.forEach(person => {
                    person.orders.forEach(order => {
                        const key = `${order.type} - Tam: ${order.size}`;
                        if (!totals[key]) totals[key] = 0;
                        totals[key] += order.qty;
                    });
                });

                let csv = 'Peca e Tamanho;Quantidade Total\n';
                for (const [key, qty] of Object.entries(totals)) {
                    csv += `${key};${qty}\n`;
                }
                downloadCSV(csv, 'relatorio_uniformes_consolidado.csv');
                
            } else if (reportType === 'member_pdf') {
                let totalPieces = 0;
                adminData.forEach(person => {
                    person.orders.forEach(order => totalPieces += order.qty);
                });

                let html = `
                    <div class="report-header">
                        <img src="logo.png">
                        <div>
                            <h1 style="margin: 0; font-size: 1.5rem;">Relatório de Uniformes por Membro</h1>
                            <p style="margin: 5px 0 0 0;">Referência: Ano de ${new Date().getFullYear()} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <div class="report-summary-box">
                        <div>
                            <span class="label">Total de Peças Solicitadas</span>
                            <span class="value">${totalPieces}</span>
                        </div>
                        <div>
                            <span class="label">Membros com Pedido</span>
                            <span class="value">${adminData.length}</span>
                        </div>
                    </div>
                    <h3>Detalhamento por Membro</h3>
                    <div class="report-table-wrapper">
                        <table class="report-table">
                            <thead>
                                <tr><th>Membro</th><th>Peça</th><th>Tamanho</th><th>Qtd</th></tr>
                            </thead>
                            <tbody>
                `;
                
                adminData.forEach(person => {
                    person.orders.forEach(order => {
                        html += `<tr><td><strong>${person.name}</strong></td><td>${order.type}</td><td>${order.size}</td><td>${order.qty}</td></tr>`;
                    });
                });
                html += '</tbody></table></div>';
                
                const printable = document.getElementById('report-printable');
                const modal = document.getElementById('report-modal');
                if (printable && modal) {
                    printable.innerHTML = html;
                    modal.style.display = 'flex';
                    showStatus('Pré-visualização gerada com sucesso!', 'success');
                }
                
            } else if (reportType === 'consolidated_pdf') {
                const totals = {};
                let totalPieces = 0;
                adminData.forEach(person => {
                    person.orders.forEach(order => {
                        const key = `${order.type} - Tam: ${order.size}`;
                        if (!totals[key]) totals[key] = 0;
                        totals[key] += order.qty;
                        totalPieces += order.qty;
                    });
                });

                let html = `
                    <div class="report-header">
                        <img src="logo.png">
                        <div>
                            <h1 style="margin: 0; font-size: 1.5rem;">Relatório Consolidado de Uniformes (Fábrica)</h1>
                            <p style="margin: 5px 0 0 0;">Referência: Ano de ${new Date().getFullYear()} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <div class="report-summary-box">
                        <div>
                            <span class="label">Total Geral de Peças</span>
                            <span class="value">${totalPieces}</span>
                        </div>
                        <div>
                            <span class="label">Variações de Peças/Tamanhos</span>
                            <span class="value">${Object.keys(totals).length}</span>
                        </div>
                    </div>
                    <h3>Resumo para a Fábrica</h3>
                    <div class="report-table-wrapper">
                        <table class="report-table">
                            <thead>
                                <tr><th>Peça e Tamanho</th><th>Quantidade Total</th></tr>
                            </thead>
                            <tbody>
                `;
                
                for (const [key, qty] of Object.entries(totals)) {
                    html += `<tr><td><strong>${key}</strong></td><td>${qty}</td></tr>`;
                }
                html += '</tbody></table></div>';
                
                const printable = document.getElementById('report-printable');
                const modal = document.getElementById('report-modal');
                if (printable && modal) {
                    printable.innerHTML = html;
                    modal.style.display = 'flex';
                    showStatus('Pré-visualização gerada com sucesso!', 'success');
                }
            }
        });
    }

});
