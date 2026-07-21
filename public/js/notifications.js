// --- Sistema de Notificações e Mensagens ---

// Exibe um modal detalhado ao clicar em uma notificação
function showNotificationModal(notif) {
    const modal = document.getElementById('notification-modal');
    const title = document.getElementById('notif-title');
    const content = document.getElementById('notif-content');
    const closeBtn = document.getElementById('close-notif-btn');

    if (!modal || !title || !content) return;

    title.textContent = notif.title;
    content.textContent = notif.message;
    modal.style.display = 'flex';

    // Ao fechar, marca a notificação como lida no servidor
    closeBtn.onclick = async () => {
        modal.style.display = 'none';
        try {
            await apiFetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
        } catch (err) {
            console.error('Erro ao marcar como lida:', err);
        }
    };
}

// Solicita permissão para notificações Push (Nativas do Navegador/Celular)
async function requestPushPermission() {
    if (!('Notification' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        subscribeToPush();
    }
}

// Inscreve o dispositivo no servidor de Push (VAPID)
async function subscribeToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const response = await apiFetch('/api/notifications/vapid-public-key');
        const vapidPublicKey = response.publicKey;

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Envia o objeto de inscrição para o backend (onde será salvo vinculado ao usuário)
        await apiFetch('/api/notifications/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription })
        });

        console.log('[PUSH] Inscrito com sucesso!');
    } catch (err) {
        console.error('[PUSH] Erro na inscrição:', err);
    }
}

// Auxiliar para converter chave pública base64 para Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


// --- Lógica de Mensagens do Administrador ---

// Renderiza a lista de membros com checkbox para envio de mensagens em massa
async function renderMessages() {
    const container = document.getElementById('members-checkbox-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; padding: 10px; color: var(--text-dim);">Carregando membros...</p>';

    try {
        const people = await apiFetch('/api/people');
        // Filtra apenas membros que possuem conta de usuário no sistema
        const targets = people.filter(p => p.u_id != null);
        targets.sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = '';
        targets.forEach(p => {
            const searchText = `${p.name} ${p.unit || ''}`.toLowerCase();
            const item = document.createElement('div');
            item.className = 'checkbox-item';
            item.setAttribute('data-search', searchText);
            item.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); cursor: pointer;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `msg-user-${p.u_id}`;
            checkbox.value = p.u_id;
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';

            const label = document.createElement('label');
            label.htmlFor = `msg-user-${p.u_id}`;
            label.innerHTML = `${escapeHTML(p.name)} <br> <small style="color: var(--text-dim)">${escapeHTML(p.unit || 'Sem Unidade')}</small>`;
            label.style.cssText = 'margin: 0; cursor: pointer; font-size: 0.9rem; flex-grow: 1; user-select: none;';

            // Permite clicar em qualquer lugar do card para marcar o checkbox
            item.onclick = (e) => {
                if (e.target !== checkbox && e.target !== label) {
                    checkbox.checked = !checkbox.checked;
                }
            };

            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        });

        console.log(`[MESSAGES] Lista de checkboxes populada com ${targets.length} membros.`);
    } catch (err) {
        console.error('Erro ao carregar membros para mensagens:', err);
        container.innerHTML = '<p style="color: var(--error-color); padding: 10px;">Erro ao carregar lista.</p>';
    }
}

