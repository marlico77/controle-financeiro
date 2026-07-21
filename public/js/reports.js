// --- Geradores de Relatórios e Autenticação (Escopo Global) ---
// Gera o relatório geral de arrecadação do ano
async function generateGeneralReport() {
    try {
        const calFilters = document.getElementById('calendar-export-filters');
        if (calFilters) calFilters.style.display = 'none';
        const styleEl = document.getElementById('print-orientation-style');
        if (styleEl) styleEl.remove();
        console.log('[REPORT] Gerando Relatório Geral...');
        const currentYear = parseInt(state.currentYear || new Date().getFullYear()); // Ano de referência
        const payments = state.payments || []; // Lista de pagamentos do estado
        const people = state.people || []; // Lista de pessoas

        // Filtra apenas pagamentos aprovados do ano selecionado
        const approvedPayments = payments.filter(p => p.status === 'approved' && p.year === currentYear);
        // Soma o total arrecadado
        const totalCash = approvedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        // Agrupa arrecadação por unidade
        const byUnit = {};
        people.forEach(p => {
            const unit = p.unit || 'Sem Unidade';
            if (!byUnit[unit]) byUnit[unit] = 0;
            const paid = approvedPayments
                .filter(pay => pay.person_id === p.id)
                .reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
            byUnit[unit] += paid;
        });

        // Monta o HTML do relatório
        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Relatório Geral de Mensalidades</h1>
                <p style="margin: 5px 0 0 0;">Referência: Ano de ${currentYear} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <div class="report-summary-box">
                <div>
                    <span class="label">Arrecadação Total no Ano</span>
                    <span class="value">R$ ${totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                    <span class="label">Total de Membros</span>
                    <span class="value">${people.length}</span>
                </div>
            </div>
            <h3>Resumo por Unidade</h3>
            <div class="report-table-wrapper">
                <table class="report-table">
                    <thead>
                        <tr><th>Unidade</th><th>Valor Arrecadado (Ano)</th></tr>
                    </thead>
                    <tbody>
                        ${Object.entries(byUnit).sort((a, b) => b[1] - a[1]).map(([unit, val]) => `
                            <tr>
                                <td><strong>${unit}</strong></td>
                                <td>R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        const printable = document.getElementById('report-printable'); // Área de impressão no HTML
        const modal = document.getElementById('report-modal'); // Modal do relatório
        if (printable && modal) {
            printable.innerHTML = html; // Insere o relatório
            modal.style.display = 'flex'; // Exibe o modal
            showStatus('Relatório gerado! Use o botão Imprimir para salvar como PDF.', 'success');
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório: ' + err.message, 'error');
    }
}
// Expõe a função globalmente para ser chamada via HTML
window.generateGeneralReport = generateGeneralReport;

// Gera o relatório individual de um membro específico
async function generateMemberReport() {
    try {
        const calFilters = document.getElementById('calendar-export-filters');
        if (calFilters) calFilters.style.display = 'none';
        const styleEl = document.getElementById('print-orientation-style');
        if (styleEl) styleEl.remove();
        console.log('[REPORT] Gerando Relatório de Membro...');
        const memberId = document.getElementById('report-member-select').value; // Obtém o ID do membro selecionado no menu suspenso
        if (!memberId) return showStatus('Selecione um membro primeiro.', 'info'); // Verifica se um membro foi escolhido

        const people = state.people || []; // Lista de pessoas no estado global
        const member = people.find(p => p.id == memberId); // Procura o objeto do membro pelo ID
        if (!member) return showStatus('Membro não encontrado.', 'error'); // Caso não encontre, exibe erro

        const currentYear = parseInt(state.currentYear || new Date().getFullYear()); // Ano atual de referência
        // Filtra os pagamentos do estado global pertencentes a este membro e a este ano
        const payments = (state.payments || []).filter(p => p.person_id == memberId && p.year === currentYear);
        // Calcula o total pago somando apenas os registros com status 'approved'
        const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        // Constrói o HTML estruturado para o relatório individual do membro
        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Extrato de Pagamentos - Membro</h1>
                <p style="margin: 5px 0 0 0;">Membro: <strong>${member.name}</strong> | Unidade: ${member.unit || 'N/A'}</p>
            </div>
            <div class="report-summary-box">
                <div>
                    <span class="label">Total Pago (${currentYear})</span>
                    <span class="value">R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                    <span class="label">CPF</span>
                    <span class="value">${member.cpf || 'Não informado'}</span>
                </div>
            </div>
            <h3>Histórico Mensal (${currentYear})</h3>
            <div class="report-table-wrapper">
                <table class="report-table">
                    <thead>
                        <tr><th>Mês</th><th>Status</th><th>Valor</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                        ${months.map((m, idx) => {
            // Para cada mês, verifica se existe um registro de pagamento
            const pay = payments.find(p => p.month === idx + 1);
            return `
                                <tr>
                                    <td>${m}</td>
                                    <td>${pay ? (pay.status === 'approved' ? 'PAGO' : pay.status === 'pending' ? 'PENDENTE' : 'RECUSADO') : 'NÃO REALIZADO'}</td>
                                    <td>${pay ? 'R$ ' + parseFloat(pay.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</td>
                                    <td>${pay && pay.updated_at ? new Date(pay.updated_at).toLocaleDateString('pt-BR') : '-'}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        const printable = document.getElementById('report-printable'); // Área onde o conteúdo será inserido
        const modal = document.getElementById('report-modal'); // Modal que será exibido
        if (printable && modal) {
            printable.innerHTML = html; // Insere o HTML gerado
            modal.style.display = 'flex'; // Exibe o modal
            showStatus('Extrato gerado!', 'success'); // Notifica sucesso
        }
    } catch (err) {
        console.error('[REPORT] Erro:', err);
        showStatus('Erro ao gerar relatório do membro.', 'error');
    }
}
window.generateMemberReport = generateMemberReport; // Torna a função acessível globalmente

// Gera relatório detalhado de arrecadação e participação de um evento específico
async function generateEventReport() {
    const calFilters = document.getElementById('calendar-export-filters');
    if (calFilters) calFilters.style.display = 'none';
    const styleEl = document.getElementById('print-orientation-style');
    if (styleEl) styleEl.remove();
    console.log('[REPORT] Gerando Relatório de Evento...');
    const eventId = document.getElementById('report-event-select').value; // ID do evento selecionado
    const filterType = document.getElementById('report-event-filter').value; // Tipo de filtro (por unidade ou lista completa)
    if (!eventId) return showStatus('Selecione um evento primeiro.', 'info');

    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        const { event, participants, payments } = data; // Desestrutura a resposta

        if (filterType === 'individual') {
            const participantId = document.getElementById('report-event-member-select').value;
            if (!participantId) return showStatus('Selecione um participante primeiro.', 'info');

            const participant = participants.find(p => p.id == participantId);
            if (!participant) return showStatus('Participante não encontrado no evento.', 'error');

            const personPayments = (payments || []).filter(pay => pay.person_id == participantId);
            const totalPaid = personPayments.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
            
            let contentHtml = '';
            if (event.payment_type === 'unico') {
                const displayPayment = personPayments[personPayments.length - 1];
                const statusLabel = displayPayment ? (displayPayment.status === 'approved' ? 'PAGO' : (displayPayment.status === 'rejected' ? 'RECUSADO' : 'PENDENTE')) : 'PENDENTE';
                const paymentDate = displayPayment && displayPayment.updated_at ? new Date(displayPayment.updated_at).toLocaleDateString('pt-BR') : '-';
                
                contentHtml = `
                    <h3>Detalhamento do Pagamento Único</h3>
                    <div class="report-table-wrapper">
                        <table class="report-table">
                            <thead>
                                <tr><th>Membro</th><th>Unidade</th><th>Status de Pagamento</th><th>Valor Pago</th><th>Data</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>${participant.name}</strong></td>
                                    <td>${participant.unit || 'Sem Unidade'}</td>
                                    <td><span class="grid-status-label status-${displayPayment ? displayPayment.status : 'none'}" style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">${statusLabel}</span></td>
                                    <td>R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td>${paymentDate}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                const monthMap = {};
                personPayments.forEach(pay => {
                    if (pay.month) monthMap[Number(pay.month)] = pay;
                });

                contentHtml = `
                    <h3>Histórico de Parcelas</h3>
                    <div class="report-table-wrapper">
                        <table class="report-table">
                            <thead>
                                <tr><th>Parcela/Mês</th><th>Status</th><th>Valor</th><th>Data</th></tr>
                            </thead>
                            <tbody>
                                ${months.map((m, idx) => {
                                    const pay = monthMap[idx + 1];
                                    return `
                                        <tr>
                                            <td>${m}</td>
                                            <td>${pay ? (pay.status === 'approved' ? 'PAGO' : pay.status === 'pending' ? 'PENDENTE' : 'RECUSADO') : 'NÃO REALIZADO'}</td>
                                            <td>${pay ? 'R$ ' + parseFloat(pay.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</td>
                                            <td>${pay && pay.updated_at ? new Date(pay.updated_at).toLocaleDateString('pt-BR') : '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            let html = `
                <div class="report-header">
                    <img src="logo.png">
                    <h1 style="margin: 0; font-size: 1.5rem;">Extrato do Evento - Participante</h1>
                    <p style="margin: 5px 0 0 0;">Evento: <strong>${event.name}</strong> | Data: ${event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
                    <p style="margin: 5px 0 0 0;">Participante: <strong>${participant.name}</strong> | Unidade: ${participant.unit || 'N/A'}</p>
                </div>
                <div class="report-summary-box">
                    <div><span class="label">Total Pago no Evento</span><span class="value">R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                    <div><span class="label">Tipo de Pagamento</span><span class="value">${event.payment_type === 'unico' ? 'Pagamento Único' : 'Parcelamento Mensal'}</span></div>
                </div>
                ${contentHtml}
            `;

            const printable = document.getElementById('report-printable');
            const modal = document.getElementById('report-modal');
            if (printable && modal) {
                printable.innerHTML = html;
                modal.style.display = 'flex';
                showStatus('Extrato do evento gerado!', 'success');
            }
            return;
        }

        // Calcula o total arrecadado no evento (apenas pagamentos aprovados)
        let totalArrecadado = (payments || []).filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        let contentHtml = '';

        // Se o filtro for por unidade, agrupa as estatísticas
        if (filterType === 'unit') {
            const byUnit = {};
            (participants || []).forEach(p => {
                const unit = p.unit || 'Sem Unidade';
                if (!byUnit[unit]) byUnit[unit] = { count: 0, paid: 0 };
                byUnit[unit].count++; // Conta participantes por unidade
                // Soma o que cada participante da unidade já pagou
                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                byUnit[unit].paid += amount;
            });
            // Gera tabela de resumo por unidade
            contentHtml = `
                <h3>Resumo por Unidade</h3>
                <div class="report-table-wrapper">
                    <table class="report-table">
                        <thead>
                            <tr><th>Unidade</th><th>Participantes</th><th>Arrecadação</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(byUnit).map(([unit, stats]) => `
                                <tr><td>${unit}</td><td>${stats.count}</td><td>R$ ${stats.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // Caso contrário, gera a lista detalhada de todos os participantes
            contentHtml = `
                <h3>Lista de Participantes</h3>
                <div class="report-table-wrapper">
                    <table class="report-table">
                        <thead>
                            <tr><th>Membro</th><th>Unidade</th><th>Status</th><th>Total Pago</th></tr>
                        </thead>
                        <tbody>
                            ${(participants || []).map(p => {
                // Calcula quanto este membro específico já pagou para o evento
                const amount = (payments || []).filter(pay => pay.person_id === p.id && pay.status === 'approved').reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
                return `<tr><td>${p.name}</td><td>${p.unit || '-'}</td><td>${amount > 0 ? 'PARTICIPANDO' : 'PENDENTE'}</td><td>R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // HTML final do relatório de evento
        let html = `
            <div class="report-header">
                <img src="logo.png">
                <h1 style="margin: 0; font-size: 1.5rem;">Relatório de Evento</h1>
                <p style="margin: 5px 0 0 0;">Evento: <strong>${event.name}</strong> | Data: ${event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
            </div>
            <div class="report-summary-box">
                <div><span class="label">Total Arrecadado</span><span class="value">R$ ${totalArrecadado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                <div><span class="label">Total Participantes</span><span class="value">${(participants || []).length}</span></div>
            </div>
            ${contentHtml}
        `;
        const printable = document.getElementById('report-printable');
        const modal = document.getElementById('report-modal');
        if (printable && modal) {
            printable.innerHTML = html;
            modal.style.display = 'flex';
        }
    } catch{
        showStatus('Erro ao carregar dados do evento.', 'error');
    }
}
window.generateEventReport = generateEventReport;

// Gera documento de autorização de saída para eventos (para pais/responsáveis assinarem)
async function generateAuthDocument(type) {
    try {
        console.log(`[AUTH] Gerando Autorização (${type})...`);
        // Obtém os dados preenchidos no formulário de autorização
        const eventName = (document.getElementById('auth-event-name') || {}).value || '';
        const eventDate = (document.getElementById('auth-event-date') || {}).value || '';
        const eventLocation = (document.getElementById('auth-event-location') || {}).value || '';
        const departureLocation = (document.getElementById('auth-departure-location') || {}).value || '';
        const departureTime = (document.getElementById('auth-departure-time') || {}).value || '';
        const returnTime = (document.getElementById('auth-return-time') || {}).value || '';

        // Valida se todos os campos foram preenchidos
        if (!eventName || !eventDate || !eventLocation || !departureLocation || !departureTime || !returnTime) {
            return showStatus('Por favor, preencha todos os campos do formulário.', 'error');
        }

        const formattedDate = formatDate(eventDate); // Formata a data para padrão brasileiro
        const currentYear = new Date().getFullYear();
        // Função para converter a logo do clube para Base64 (necessário para impressão confiável em PDF)
        const getLogoBase64 = async () => {
            try {
                const response = await fetch('logo.png');
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch{ return 'logo.png'; } // Fallback caso falhe
        };

        const logoSrc = await getLogoBase64();

        // Estrutura do documento de autorização com campos em branco para preenchimento manual do pai
        const htmlContent = `
            <div class="report-canvas" style="font-family: Arial; line-height: 1.8; max-width: 100%; margin: 0 auto; padding: 10px 20px 20px 20px; color: black;">
                <div style="position: relative; text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 30px; min-height: 60px;">
                    <img src="${logoSrc}" style="position: absolute; left: 0; top: 0; height: 65px; width: auto;">
                    <div style="padding-top: 5px;">
                        <h2 style="margin: 0; font-size: 1.2rem; text-transform: uppercase;">CLUBE DE DESBRAVADORES TRIBO DE DAVI-AP</h2>
                        <h3 style="margin: 5px 0 0 0; font-size: 1rem; text-decoration: underline;">Autorização de Saída</h3>
                    </div>
                </div>
                <div style="margin-top: 30px; text-align: justify; line-height: 2.4;">
                    Eu, <span style="border-bottom: 1px solid black; display: inline-block; min-width: 400px; margin: 0 5px;"></span>, 
                    responsável pelo(a) desbravador(a) <span style="border-bottom: 1px solid black; display: inline-block; min-width: 350px; margin: 0 5px;"></span>, 
                    autorizo-o(a) a participar do evento <strong>${eventName}</strong>, que será realizado no dia <strong>${formattedDate}</strong>, no local <strong>${eventLocation}</strong>. Os desbravadores deverão se apresentar às <strong>${departureTime}</strong>h em <strong>${departureLocation}</strong> para a partida.
                </div>
                <p style="text-align: justify; line-height: 2.2;">O evento tem término previsto para as <strong>${returnTime}</strong>h, momento em que o responsável deverá buscar a criança no mesmo local de partida indicado acima.</p>
                <p style="margin-top: 25px; text-align: center; font-weight: bold; border: 1px solid #ddd; padding: 15px; border-radius: 8px;">Estou ciente de que estará acompanhado(a) pela direção do Clube TRIBO DE DAVI, permanecendo sob sua responsabilidade durante todo esse período.</p>
                <div style="margin-top: 50px; text-align: right; font-weight: bold;">_____ / _____ / ${currentYear}</div>
                <div style="margin-top: 40px;">
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">Nome do responsável: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">CPF: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                    <p style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">Telefone: <span style="border-bottom: 1px solid black; flex: 1; min-width: 150px;"></span></p>
                </div>
                <div style="margin-top: 80px; text-align: center;">
                    <div style="border-top: 1px solid black; max-width: 400px; width: 100%; margin: 0 auto; padding-top: 5px;">Assinatura do responsável</div>
                </div>
            </div>
        `;

        // Se o tipo solicitado for PDF, apenas mostra no modal para impressão do navegador
        if (type === 'pdf') {
            const printable = document.getElementById('report-printable');
            const modal = document.getElementById('report-modal');
            if (printable && modal) {
                printable.innerHTML = htmlContent;
                modal.style.display = 'flex';
            }
        } else {
            // Se o tipo for DOC, gera um arquivo para download compatível com Microsoft Word
            const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>";
            const sourceHTML = header + htmlContent + "</body></html>";
            const blob = new Blob([sourceHTML], { type: 'application/vnd.ms-word' }); // Cria o arquivo binário (blob)
            const url = URL.createObjectURL(blob); // Cria uma URL temporária para o arquivo
            const link = document.createElement('a'); // Cria um link invisível para download
            link.href = url;
            link.download = 'Autorizacao_' + eventName.replace(/\s+/g, '_') + '.doc'; // Nome do arquivo
            document.body.appendChild(link);
            link.click(); // Simula o clique para baixar
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Limpa a memória
            showStatus('Documento Word (.doc) gerado com sucesso!', 'success');
        }
    } catch (err) {
        console.error('[AUTH] Erro:', err);
        showStatus('Erro ao gerar autorização.', 'error');
    }
}
window.generateAuthDocument = generateAuthDocument;

// Processa a escolha do tipo de relatório no modal seletor e chama a função correspondente
function confirmGenerateReport() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const selectorModal = document.getElementById('report-selector-modal');
    if (selectorModal) selectorModal.style.display = 'none'; // Fecha o seletor antes de gerar

    // Encaminha para a função correta baseado na escolha
    if (type === 'general') generateGeneralReport();
    else if (type === 'member') generateMemberReport();
    else if (type === 'event') generateEventReport();
}
window.confirmGenerateReport = confirmGenerateReport;

// Alterna a visibilidade dos campos adicionais no modal de relatório conforme o tipo selecionado
function toggleReportFields() {
    const typeSelect = document.getElementById('report-type-select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    const memberField = document.getElementById('report-field-member'); // Campo de seleção de membro
    const eventFields = document.getElementById('report-fields-event'); // Campo de seleção de evento
    const eventMemberField = document.getElementById('report-field-event-member'); // Campo de seleção de participante do evento
    
    if (memberField) memberField.style.display = type === 'member' ? 'block' : 'none';
    if (eventFields) eventFields.style.display = type === 'event' ? 'block' : 'none';
    
    if (eventFields && type === 'event') {
        const eventFilter = document.getElementById('report-event-filter').value;
        if (eventMemberField) {
            eventMemberField.style.display = eventFilter === 'individual' ? 'block' : 'none';
        }
    } else {
        if (eventMemberField) eventMemberField.style.display = 'none';
    }
}
window.toggleReportFields = toggleReportFields;

async function updateEventMembersSelect() {
    const eventId = document.getElementById('report-event-select').value;
    const eventFilter = document.getElementById('report-event-filter').value;
    const eventMemberSelect = document.getElementById('report-event-member-select');
    
    if (!eventMemberSelect) return;
    
    if (!eventId || eventFilter !== 'individual') {
        eventMemberSelect.innerHTML = '<option value="">Selecione um Participante</option>';
        return;
    }
    
    eventMemberSelect.innerHTML = '<option value="">Carregando participantes...</option>';
    
    try {
        const data = await apiFetch(`/api/events/${eventId}/details`);
        const { participants } = data;
        
        eventMemberSelect.innerHTML = '<option value="">Selecione um Participante</option>' +
            (participants || []).map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    } catch (err) {
        console.error('[REPORT] Erro ao carregar participantes do evento:', err);
        eventMemberSelect.innerHTML = '<option value="">Erro ao carregar participantes</option>';
    }
}
window.updateEventMembersSelect = updateEventMembersSelect;

// Inicializa os ouvintes de eventos (listeners) para botões de relatórios e autorizações
const initGeneratorListeners = () => {
    console.log('[INIT] Inicializando listeners de relatórios e autorizações');

    const typeSelect = document.getElementById('report-type-select');
    if (typeSelect) {
        typeSelect.onchange = () => {
            toggleReportFields();
            updateEventMembersSelect();
        };
    }

    const eventSelect = document.getElementById('report-event-select');
    if (eventSelect) {
        eventSelect.onchange = () => {
            toggleReportFields();
            updateEventMembersSelect();
        };
    }

    const eventFilter = document.getElementById('report-event-filter');
    if (eventFilter) {
        eventFilter.onchange = () => {
            toggleReportFields();
            updateEventMembersSelect();
        };
    }

    // Botão para abrir o seletor de relatórios
    const openSelectorBtn = document.getElementById('open-report-selector-btn');
    if (openSelectorBtn) {
        openSelectorBtn.onclick = () => {
            const modal = document.getElementById('report-selector-modal');
            if (modal) {
                modal.style.display = 'flex';
                toggleReportFields(); // Garante que os campos corretos apareçam ao abrir
            }
        };
    }

    // Botão de confirmação dentro do seletor
    const confirmGenBtn = document.getElementById('confirm-generate-report-btn');
    if (confirmGenBtn) confirmGenBtn.onclick = confirmGenerateReport;

    // Botões específicos da aba de autorização (PDF e Word)
    const authPdfBtn = document.getElementById('generate-auth-pdf');
    if (authPdfBtn) authPdfBtn.onclick = () => generateAuthDocument('pdf');

    const authDocBtn = document.getElementById('generate-auth-doc');
    if (authDocBtn) authDocBtn.onclick = () => generateAuthDocument('doc');
};

// Garante que os listeners sejam carregados no momento certo (após o DOM estar pronto)
if (document.readyState === 'loading') {
    initGeneratorListeners();
} else {
    initGeneratorListeners();
}
// Executa novamente após alguns segundos para garantir funcionamento em renderizações dinâmicas
setTimeout(initGeneratorListeners, 1000);
setTimeout(initGeneratorListeners, 3000);

// Configura o funcionamento dos botões de "olhinho" para mostrar/esconder senhas nos formulários
const initializePasswordToggles = () => {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            const targetId = button.getAttribute('data-target'); // Pega o ID do input alvo
            const input = document.getElementById(targetId);
            const openPath = button.querySelector('.eye-open'); // Ícone olho aberto
            const closedPath = button.querySelector('.eye-closed'); // Ícone olho fechado

            // Alterna o tipo do input entre 'password' (escondido) e 'text' (visível)
            if (input.type === 'password') {
                input.type = 'text';
                openPath.style.display = 'none';
                closedPath.style.display = 'block';
            } else {
                input.type = 'password';
                openPath.style.display = 'block';
                closedPath.style.display = 'none';
            }
        };
    });
};

// Chama a inicialização dos botões de senha
initializePasswordToggles();

