// --- SISTEMA DE CHAT INTEGRADO (WhatsApp Web Boilerplate) ---

window.waEventSource = null;
window.activeChatId = null;
window.allChats = [];

window.initWhatsAppChat = async function() {
    const myUsernameEl = document.getElementById('wa-my-username');
    if (myUsernameEl) {
        myUsernameEl.textContent = state.name || 'Administrador';
    }
    const myAvatarTextEl = document.getElementById('wa-my-avatar-text');
    if (myAvatarTextEl && state.name) {
        myAvatarTextEl.textContent = state.name.charAt(0).toUpperCase();
    }

    const welcomeScreen = document.getElementById('wa-chat-welcome');
    const activeScreen = document.getElementById('wa-chat-active');
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (activeScreen) activeScreen.style.display = 'none';
    window.activeChatId = null;

    const chatContainer = document.querySelector('.whatsapp-web-chat');
    if (chatContainer) {
        chatContainer.classList.remove('show-chat');
    }

    await window.loadWaChats();
    window.connectWaSSE();
    window.setupChatListeners();
};

window.loadWaChats = async function() {
    const listContainer = document.getElementById('wa-chat-list');
    if (!listContainer) return;

    try {
        const chats = await apiFetch('/api/whatsapp/chats');
        chats.sort((a, b) => {
            const timeA = a.lastMessage?.timestamp || 0;
            const timeB = b.lastMessage?.timestamp || 0;
            return timeB - timeA;
        });

        window.allChats = chats;
        window.renderWaChatsList(chats);
        window.updateWaConnStatus('connected', 'Conectado');
    } catch (err) {
        console.error('[WA-CHAT] Erro ao carregar chats:', err);
        listContainer.innerHTML = `<p style="text-align: center; padding: 2rem; color: var(--error-color); font-size: 0.9rem;">Erro ao conectar ao WhatsApp: ${escapeHTML(err.message)}</p>`;
        window.updateWaConnStatus('disconnected', 'Desconectado');
    }
};

window.renderWaChatsList = function(chats) {
    const listContainer = document.getElementById('wa-chat-list');
    if (!listContainer) return;

    if (chats.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.9rem;">Nenhuma conversa ativa encontrada.</p>';
        return;
    }

    listContainer.innerHTML = '';
    chats.forEach(chat => {
        const card = document.createElement('div');
        card.className = 'chat-list-card';
        card.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 12px 15px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.04); transition: background-color 0.2s; background: ${chat.id === window.activeChatId ? '#f0f2f5' : '#ffffff'};`;
        
        card.onmouseenter = () => { if (chat.id !== window.activeChatId) card.style.backgroundColor = '#f5f6f6'; };
        card.onmouseleave = () => { if (chat.id !== window.activeChatId) card.style.backgroundColor = '#ffffff'; };
        card.onclick = () => window.selectWaChat(chat);

        const token = getToken();
        const avatarImg = document.createElement('img');
        avatarImg.src = `/api/whatsapp/chats/${chat.id}/avatar?token=${encodeURIComponent(token)}`;
        avatarImg.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #eee; border: 1px solid rgba(0,0,0,0.05);';
        avatarImg.onerror = () => { avatarImg.src = 'https://via.placeholder.com/150?text=No+Avatar'; };

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;';

        const row1 = document.createElement('div');
        row1.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-weight: 600; font-size: 0.9rem; color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        nameSpan.textContent = chat.name || chat.id.split('@')[0];

        const dateSpan = document.createElement('span');
        dateSpan.style.cssText = 'font-size: 0.75rem; color: var(--text-dim);';
        
        let lastMsgTime = '';
        if (chat.lastMessage?.timestamp) {
            const date = new Date(chat.lastMessage.timestamp * 1000);
            const today = new Date();
            if (date.toDateString() === today.toDateString()) {
                lastMsgTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                lastMsgTime = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            }
        }
        dateSpan.textContent = lastMsgTime;

        row1.appendChild(nameSpan);
        row1.appendChild(dateSpan);

        const row2 = document.createElement('div');
        row2.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px;';

        const snippetSpan = document.createElement('span');
        snippetSpan.style.cssText = `font-size: 0.8rem; color: ${chat.unreadCount > 0 ? 'var(--text-color)' : 'var(--text-dim)'}; font-weight: ${chat.unreadCount > 0 ? '600' : '400'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1;`;
        
        let msgSnippet = '';
        if (chat.lastMessage) {
            msgSnippet = window.cleanWaMessageBody(chat.lastMessage.body) || (chat.lastMessage.type === 'image' ? '📷 Foto' : chat.lastMessage.type === 'video' ? '🎥 Vídeo' : chat.lastMessage.type === 'document' ? '📄 Documento' : 'Mensagem');
        }
        snippetSpan.textContent = msgSnippet;

        row2.appendChild(snippetSpan);

        if (chat.unreadCount > 0) {
            const badge = document.createElement('span');
            badge.style.cssText = 'background: #25d366; color: #ffffff; font-size: 0.75rem; font-weight: 700; min-width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0 4px;';
            badge.textContent = chat.unreadCount;
            row2.appendChild(badge);
        }

        infoDiv.appendChild(row1);
        infoDiv.appendChild(row2);

        card.appendChild(avatarImg);
        card.appendChild(infoDiv);
        listContainer.appendChild(card);
    });
};

window.selectWaChat = async function(chat) {
    window.activeChatId = chat.id;
    window.renderWaChatsList(window.allChats);

    const welcomeScreen = document.getElementById('wa-chat-welcome');
    const activeScreen = document.getElementById('wa-chat-active');
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (activeScreen) activeScreen.style.display = 'flex';

    const chatContainer = document.querySelector('.whatsapp-web-chat');
    if (chatContainer) {
        chatContainer.classList.add('show-chat');
    }

    const activeName = document.getElementById('wa-active-name');
    const activeAvatar = document.getElementById('wa-active-avatar');
    if (activeName) activeName.textContent = chat.name || chat.id.split('@')[0];
    if (activeAvatar) {
        const token = getToken();
        activeAvatar.src = `/api/whatsapp/chats/${chat.id}/avatar?token=${encodeURIComponent(token)}`;
        activeAvatar.onerror = () => { activeAvatar.src = 'https://via.placeholder.com/150?text=No+Avatar'; };
    }

    const messagesContainer = document.getElementById('wa-chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.9rem;">Carregando mensagens...</p>';
    }

    try {
        const messages = await apiFetch(`/api/whatsapp/chats/${chat.id}/messages?limit=50`);
        window.renderWaMessages(messages);
        
        await apiFetch(`/api/whatsapp/chats/${chat.id}/seen`, { method: 'POST' });
        
        const localChat = window.allChats.find(c => c.id === chat.id);
        if (localChat) {
            localChat.unreadCount = 0;
            window.renderWaChatsList(window.allChats);
        }
    } catch (err) {
        console.error('[WA-CHAT] Erro ao carregar mensagens:', err);
        if (messagesContainer) {
            messagesContainer.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--error-color); font-size: 0.9rem;">Erro ao carregar mensagens.</p>';
        }
    }
};

window.cleanWaMessageBody = function(body) {
    if (!body) return '';
    const prefixRegex = /^\*[^*]+\*:\n/;
    if (prefixRegex.test(body)) {
        return body.replace(prefixRegex, '');
    }
    const singleBoldRegex = /^\*[^*]+\*$/;
    if (singleBoldRegex.test(body)) {
        return '';
    }
    return body;
};

window.renderWaMessages = function(messages) {
    const container = document.getElementById('wa-chat-messages');
    if (!container) return;

    container.innerHTML = '';
    messages.sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach(msg => {
        const isOut = msg.fromMe;
        const bubble = document.createElement('div');
        bubble.style.cssText = `display: flex; flex-direction: column; width: 100%; align-items: ${isOut ? 'flex-end' : 'flex-start'}; margin-bottom: 6px;`;

        const content = document.createElement('div');
        content.style.cssText = `max-width: 65%; padding: 8px 12px; border-radius: 8px; position: relative; font-size: 0.9rem; box-shadow: 0 1px 1px rgba(0,0,0,0.06); 
            background: ${isOut ? '#d9fdd3' : '#ffffff'}; 
            color: var(--text-color);
            border-top-right-radius: ${isOut ? '0' : '8px'};
            border-top-left-radius: ${isOut ? '8px' : '0'};`;

        const activeChat = window.allChats.find(c => c.id === window.activeChatId);
        const isGroup = activeChat ? activeChat.isGroup : (window.activeChatId && (window.activeChatId.endsWith('@g.us') || window.activeChatId.includes('@g.us')));

        if (isOut && msg.senderSystemName) {
            const senderSpan = document.createElement('div');
            senderSpan.style.cssText = 'font-weight: 700; font-size: 0.75rem; color: var(--accent-color); margin-bottom: 4px; display: block;';
            senderSpan.textContent = msg.senderSystemName;
            content.appendChild(senderSpan);
        } else if (!isOut && isGroup && msg.senderName) {
            const senderSpan = document.createElement('div');
            senderSpan.style.cssText = 'font-weight: 700; font-size: 0.75rem; color: #128c7e; margin-bottom: 4px; display: block;';
            senderSpan.textContent = msg.senderName;
            content.appendChild(senderSpan);
        }

        if (msg.hasMedia) {
            const token = getToken();
            const mediaDiv = document.createElement('div');
            mediaDiv.style.marginBottom = '5px';
            
            if (msg.type === 'image') {
                const img = document.createElement('img');
                img.src = `/api/whatsapp/media/${msg.id}?chatId=${window.activeChatId}&token=${encodeURIComponent(token)}`;
                img.style.cssText = 'max-width: 100%; max-height: 250px; border-radius: 4px; cursor: pointer; display: block;';
                img.onclick = () => window.open(img.src, '_blank');
                mediaDiv.appendChild(img);
            } else if (msg.type === 'video') {
                const video = document.createElement('video');
                video.src = `/api/whatsapp/media/${msg.id}?chatId=${window.activeChatId}&token=${encodeURIComponent(token)}`;
                video.controls = true;
                video.style.cssText = 'max-width: 100%; max-height: 250px; border-radius: 4px; display: block;';
                mediaDiv.appendChild(video);
            } else {
                const link = document.createElement('a');
                link.href = `/api/whatsapp/media/${msg.id}?chatId=${window.activeChatId}&token=${encodeURIComponent(token)}`;
                link.target = '_blank';
                link.style.cssText = 'display: flex; align-items: center; gap: 8px; color: var(--accent-color); text-decoration: none; font-weight: 600; font-size: 0.85rem;';
                link.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                    </svg>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Download de Arquivo</span>
                `;
                mediaDiv.appendChild(link);
            }
            content.appendChild(mediaDiv);
        }

        if (msg.body) {
            const textSpan = document.createElement('span');
            textSpan.style.whiteSpace = 'pre-wrap';
            textSpan.style.wordBreak = 'break-word';
            textSpan.textContent = window.cleanWaMessageBody(msg.body);
            content.appendChild(textSpan);
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 4px; font-size: 0.65rem; color: var(--text-dim); text-align: right;';
        
        const time = new Date(msg.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const timeSpan = document.createElement('span');
        timeSpan.textContent = time;
        footer.appendChild(timeSpan);

        if (isOut) {
            const deleteIcon = document.createElement('span');
            deleteIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16" style="cursor: pointer; opacity: 0.5; transition: opacity 0.2s;" title="Apagar para todos">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                </svg>
            `;
            deleteIcon.style.display = 'inline-flex';
            deleteIcon.style.alignItems = 'center';
            deleteIcon.onmouseenter = () => { deleteIcon.querySelector('svg').style.opacity = '1'; };
            deleteIcon.onmouseleave = () => { deleteIcon.querySelector('svg').style.opacity = '0.5'; };
            deleteIcon.onclick = () => window.deleteWaMessage(msg.id);
            footer.appendChild(deleteIcon);
        }

        content.appendChild(footer);
        bubble.appendChild(content);
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
};

window.deleteWaMessage = async function(messageId) {
    const confirm = await showConfirm('Deseja realmente apagar esta mensagem para todos no WhatsApp?', 'Apagar Mensagem');
    if (!confirm) return;

    try {
        await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/messages/${messageId}`, {
            method: 'DELETE'
        });
        
        const messages = await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/messages?limit=50`);
        window.renderWaMessages(messages);
    } catch (err) {
        console.error('[WA-CHAT] Erro ao excluir mensagem:', err);
        showAlert('Erro ao excluir mensagem: ' + err.message, 'Erro');
    }
};

window.connectWaSSE = function() {
    if (window.waEventSource) {
        window.waEventSource.close();
    }

    const token = getStorageItem('token');
    if (!token) return;

    window.waEventSource = new EventSource(`/api/whatsapp/chat-sse?token=${encodeURIComponent(token)}`);

    window.waEventSource.onopen = () => {
        console.log('[WA-SSE] Conectado ao stream em tempo real.');
        window.updateWaConnStatus('connected', 'Conectado');
    };

    window.waEventSource.onerror = (err) => {
        console.warn('[WA-SSE] Erro ou reconexão pendente no stream SSE.', err);
        window.updateWaConnStatus('connecting', 'Reconectando...');
    };

    window.waEventSource.addEventListener('message', async (e) => {
        try {
            const eventData = JSON.parse(e.data);
            const msg = eventData.message || eventData.data || eventData;
            
            if (msg) {
                const chatId = msg.chatId || (msg.fromMe ? msg.to : msg.from);
                if (!chatId) return;

                const chat = window.allChats.find(c => c.id === chatId);
                if (chat) {
                    chat.lastMessage = {
                        body: msg.body,
                        timestamp: msg.timestamp,
                        type: msg.type || 'text'
                    };
                    if (chatId !== window.activeChatId && !msg.fromMe) {
                        chat.unreadCount = (chat.unreadCount || 0) + 1;
                    }
                } else {
                    await window.loadWaChats();
                }

                window.allChats.sort((a, b) => {
                    const timeA = a.lastMessage?.timestamp || 0;
                    const timeB = b.lastMessage?.timestamp || 0;
                    return timeB - timeA;
                });
                window.renderWaChatsList(window.allChats);

                if (chatId === window.activeChatId) {
                    const messages = await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/messages?limit=50`);
                    window.renderWaMessages(messages);
                    await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/seen`, { method: 'POST' });
                }
            }
        } catch (err) {
            console.error('[WA-SSE] Erro ao processar dados do SSE:', err);
        }
    });
};

window.updateWaConnStatus = function(status, text) {
    const statusDot = document.getElementById('wa-connection-status');
    const connText = document.getElementById('wa-conn-text');
    if (!statusDot || !connText) return;

    connText.textContent = text;
    if (status === 'connected') {
        statusDot.style.backgroundColor = '#25d366';
        statusDot.title = 'Conectado';
    } else if (status === 'connecting') {
        statusDot.style.backgroundColor = '#ffc107';
        statusDot.title = 'Conectando';
    } else {
        statusDot.style.backgroundColor = '#dc3545';
        statusDot.title = 'Desconectado';
    }
};

window.setupChatListeners = function() {
    const msgInput = document.getElementById('wa-message-input');
    const sendBtn = document.getElementById('wa-btn-send');
    const attachBtn = document.getElementById('wa-btn-attach');
    const fileInput = document.getElementById('wa-file-input');
    const searchInput = document.getElementById('wa-chat-search');

    if (msgInput) {
        msgInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.sendWaTextMessage();
            }
        };
    }

    if (sendBtn) {
        sendBtn.onclick = () => window.sendWaTextMessage();
    }

    const backBtn = document.getElementById('wa-chat-back');
    if (backBtn) {
        backBtn.onclick = () => {
            const chatContainer = document.querySelector('.whatsapp-web-chat');
            if (chatContainer) {
                chatContainer.classList.remove('show-chat');
            }
            window.activeChatId = null;
            window.renderWaChatsList(window.allChats);
            
            const welcomeScreen = document.getElementById('wa-chat-welcome');
            const activeScreen = document.getElementById('wa-chat-active');
            if (welcomeScreen) welcomeScreen.style.display = 'flex';
            if (activeScreen) activeScreen.style.display = 'none';
        };
    }

    if (attachBtn && fileInput) {
        attachBtn.onclick = () => fileInput.click();
        
        fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;
            await window.sendWaMediaMessage(file);
            fileInput.value = '';
        };
    }

    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = window.allChats.filter(chat => {
                const name = (chat.name || '').toLowerCase();
                const number = chat.id.split('@')[0];
                return name.includes(term) || number.includes(term);
            });
            window.renderWaChatsList(filtered);
        };
    }
};

window.sendWaTextMessage = async function() {
    const msgInput = document.getElementById('wa-message-input');
    if (!msgInput || !window.activeChatId) return;

    const message = msgInput.value.trim();
    if (!message) return;

    msgInput.value = '';

    try {
        await apiFetch('/api/whatsapp/send-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: window.activeChatId,
                message
            })
        });

        const messages = await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/messages?limit=50`);
        window.renderWaMessages(messages);
        
        const chat = window.allChats.find(c => c.id === window.activeChatId);
        if (chat) {
            chat.lastMessage = {
                body: message,
                timestamp: Math.floor(Date.now() / 1000),
                type: 'text'
            };
            window.allChats.sort((a, b) => {
                const timeA = a.lastMessage?.timestamp || 0;
                const timeB = b.lastMessage?.timestamp || 0;
                return timeB - timeA;
            });
            window.renderWaChatsList(window.allChats);
        }
    } catch (err) {
        console.error('[WA-CHAT] Erro ao enviar mensagem de texto:', err);
        showAlert('Erro ao enviar mensagem: ' + err.message, 'Erro');
    }
};

window.sendWaMediaMessage = async function(file) {
    if (!window.activeChatId) return;

    const msgInput = document.getElementById('wa-message-input');
    const originalPlaceholder = msgInput ? msgInput.placeholder : '';
    if (msgInput) {
        msgInput.disabled = true;
        msgInput.placeholder = 'Enviando arquivo...';
    }

    try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = (err) => reject(err);
        });
        reader.readAsDataURL(file);
        
        const base64DataUrl = await base64Promise;

        await apiFetch('/api/whatsapp/send-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: window.activeChatId,
                media: base64DataUrl,
                fileName: file.name
            })
        });

        const messages = await apiFetch(`/api/whatsapp/chats/${window.activeChatId}/messages?limit=50`);
        window.renderWaMessages(messages);

        const chat = window.allChats.find(c => c.id === window.activeChatId);
        if (chat) {
            chat.lastMessage = {
                body: `📄 ${file.name}`,
                timestamp: Math.floor(Date.now() / 1000),
                type: 'document'
            };
            window.allChats.sort((a, b) => {
                const timeA = a.lastMessage?.timestamp || 0;
                const timeB = b.lastMessage?.timestamp || 0;
                return timeB - timeA;
            });
            window.renderWaChatsList(window.allChats);
        }
    } catch (err) {
        console.error('[WA-CHAT] Erro ao enviar mídia:', err);
        showAlert('Erro ao enviar arquivo: ' + err.message, 'Erro');
    } finally {
        if (msgInput) {
            msgInput.disabled = false;
            msgInput.placeholder = originalPlaceholder;
            msgInput.focus();
        }
    }
};

// Fim do arquivo public/app.js - Sistema de Gestão Financeira v1.0

