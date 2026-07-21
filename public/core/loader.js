/**
 * Gerenciador de Carregamento de Componentes (Módulos)
 * Carrega dinamicamente arquivos HTML e injeta no DOM para modularizar o sistema.
 */

window.loadComponent = async function(url, containerId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const html = await response.text();
        const container = document.getElementById(containerId);
        
        if (container) {
            container.innerHTML = html;
        } else {
            console.warn(`[Loader] Container com ID '${containerId}' não encontrado para carregar '${url}'.`);
        }
    } catch (error) {
        console.error(`[Loader] Erro ao carregar componente ${url}:`, error);
    }
};

/**
 * Função de inicialização global para carregar componentes assíncronos
 * que precisam estar presentes antes do `app.js` terminar de iniciar.
 */
window.initializeComponents = async function() {
    console.log('[Loader] Iniciando carregamento de componentes modulares...');
    
    // Array de promessas de componentes a carregar
    const components = [
        loadComponent('/modals/whatsapp-disabled.html', 'modal-whatsapp-disabled-container'),
        loadComponent('/modals/notification.html', 'modal-notification-container'),
        loadComponent('/modals/lgpd.html', 'modal-lgpd-container'),
        loadComponent('/modals/payment.html', 'modal-payment-container'),
        loadComponent('/modals/person.html', 'modal-person-container'),
        loadComponent('/modals/event-create.html', 'modal-event-create-container'),
        loadComponent('/modals/site-calendar-create.html', 'modal-site-calendar-create-container'),
        loadComponent('/modals/site-calendar-edit.html', 'modal-site-calendar-edit-container'),
        loadComponent('/modals/event-payment.html', 'modal-event-payment-container'),
        loadComponent('/modals/event-participants.html', 'modal-event-participants-container'),
        loadComponent('/modals/report-selector.html', 'modal-report-selector-container'),
        loadComponent('/modals/report.html', 'modal-report-container'),
        loadComponent('/modals/confirm.html', 'modal-confirm-container'),
        loadComponent('/modals/recover.html', 'modal-recover-container'),
        loadComponent('/modals/force-change.html', 'modal-force-change-container'),
        loadComponent('/modals/session.html', 'modal-session-container'),
        loadComponent('/modals/alert.html', 'modal-alert-container'),
        
        // Views Principais (Telas)
        // Views Principais (Telas)
        loadComponent('/views/login.html', 'view-login-container'),
        loadComponent('/views/dashboard.html', 'view-dashboard-container'),
        loadComponent('/views/mensalidade.html', 'view-mensalidade-container'),
        loadComponent('/views/events.html', 'view-events-container'),
        loadComponent('/views/people.html', 'view-people-container'),
        loadComponent('/views/reports.html', 'view-reports-container'),
        loadComponent('/views/authorizations.html', 'view-authorizations-container'),
        loadComponent('/views/sales.html', 'view-sales-container'),
        loadComponent('/views/logs.html', 'view-logs-container'),
        loadComponent('/views/messages.html', 'view-messages-container'),
        loadComponent('/views/gallery.html', 'view-gallery-container'),
        loadComponent('/views/profile.html', 'view-profile-container'),
        loadComponent('/views/pwa-install.html', 'view-pwa-install-container'),
        loadComponent('/views/outflows.html', 'view-outflows-container')
        // Adicionar outras telas aqui conforme extrairmos
    ];

    await Promise.all(components);
    console.log('[Loader] Todos os componentes iniciais foram carregados com sucesso.');
};
