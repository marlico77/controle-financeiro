// --- Registro de Service Worker (PWA) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado!', reg))
            .catch(err => console.err('Erro ao registrar Service Worker:', err));
    });
}

// --- Lógica de Instalação do Aplicativo (PWA) ---

// Detecta se o dispositivo é iOS (iPhone/iPad)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
// Verifica se o app já está rodando como "instalado" (standalone)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
let deferredPrompt = null;

// Captura o evento de instalação do Chrome/Android
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Evita o prompt automático feio do navegador
    deferredPrompt = e; // Salva o evento para disparar quando o usuário clicar no botão de instalação

    const isDismissed = sessionStorage.getItem('pwa-dismissed');

    // Mostra o banner de instalação personalizado se não for instalado e não tiver sido ignorado
    if (!isStandalone && !isDismissed) {
        showPWABanner();
    }
});

// Exibe o banner amigável de instalação
function showPWABanner() {
    const banner = document.getElementById('pwa-install-banner');
    const btn = document.getElementById('pwa-install-btn');
    if (banner) {
        banner.style.display = 'block';

        // Ajusta as instruções especificamente para usuários de iOS
        if (isIOS && btn) {
            btn.textContent = 'Como Instalar';
            const pwaTextSpan = banner.querySelector('.pwa-text span');
            if (pwaTextSpan) pwaTextSpan.textContent = 'Toque em compartilhar e "Adicionar à Tela de Início".';
        }
    }
}

const installBtn = document.getElementById('pwa-install-btn');
const closeBtn = document.getElementById('pwa-close-btn');
const mainInstallBtn = document.getElementById('pwa-fixed-install-btn');
const menuInstallBtn = document.getElementById('menu-install-btn');
const pwaInstallCard = document.getElementById('pwa-install-card');

// Lógica do botão de instalação no banner
if (installBtn) {
    installBtn.onclick = async () => {
        if (isIOS) {
            // No iOS a instalação é manual via menu de compartilhamento
            showAlert('Para instalar no iPhone:<br><br>1. Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta)<br>2. Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>', 'Instalação no iOS', '📱');
            return;
        }

        if (deferredPrompt) {
            // Dispara o prompt nativo do navegador (Android/Chrome)
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.style.display = 'none';
        } else {
            // Fallback: Se o prompt não estiver pronto, guia o usuário manualmente
            const manualGuide = document.getElementById('android-manual-guide');
            if (manualGuide) manualGuide.style.display = 'block';
            showAlert('O seu navegador ainda está preparando a instalação. Você pode clicar nos "3 pontinhos" ⋮ do Chrome e selecionar "Instalar Aplicativo" ou usar o guia que apareceu abaixo.', 'Quase pronto');
        }
    };
}

// Fecha o banner de instalação e salva a preferência na sessão
if (closeBtn) {
    closeBtn.onclick = () => {
        const pwaBanner = document.getElementById('pwa-install-banner');
        if (pwaBanner) pwaBanner.style.display = 'none';
        sessionStorage.setItem('pwa-dismissed', 'true');
    };
}

// Atualiza a interface (botões de menu, avisos) conforme o status da instalação
function updatePWAUI() {
    const androidSection = document.getElementById('android-guide-box');
    const iosSection = document.getElementById('ios-guide-box');
    const installedSection = document.getElementById('already-installed-section');
    const menuInstallBtn = document.getElementById('menu-install-btn');
    const pwaInstallCard = document.getElementById('pwa-install-card');
    const pwaBanner = document.getElementById('pwa-install-banner');

    const isMobile = window.innerWidth <= 768;
    const pwaInstallPage = document.getElementById('pwa-install-page');
    const isPageActive = state.activeTab === 'pwa-install' || (pwaInstallPage && pwaInstallPage.style.display === 'block');

    if (isStandalone) {
        // Se já estiver instalado, esconde todos os avisos de instalação
        if (pwaBanner) pwaBanner.style.display = 'none';
        if (menuInstallBtn) menuInstallBtn.style.display = 'none';
        if (pwaInstallCard) pwaInstallCard.style.display = 'none';

        if (isPageActive) {
            if (installedSection) installedSection.style.display = 'block';
            if (androidSection) androidSection.style.display = 'none';
            if (iosSection) iosSection.style.display = 'none';
        }
    } else {
        // Se for mobile e não estiver instalado, mostra opções de menu/dashboard
        if (isMobile) {
            if (menuInstallBtn) menuInstallBtn.style.setProperty('display', 'flex', 'important');
            if (pwaInstallCard) pwaInstallCard.style.setProperty('display', 'flex', 'important');
        } else {
            if (menuInstallBtn) menuInstallBtn.style.display = 'none';
            if (pwaInstallCard) pwaInstallCard.style.display = 'none';
        }

        // Mostra o conteúdo específico de ajuda para Android ou iOS
        if (isPageActive) {
            if (isIOS) {
                if (iosSection) iosSection.style.display = 'block';
                if (androidSection) androidSection.style.display = 'none';
            } else if (/Android/.test(navigator.userAgent)) {
                if (androidSection) androidSection.style.display = 'block';
                if (iosSection) iosSection.style.display = 'none';
            } else {
                if (androidSection) androidSection.style.display = 'none';
                if (iosSection) iosSection.style.display = 'none';
            }
            if (installedSection) installedSection.style.display = 'none';
        }
    }
};

// Executa atualização visual do PWA ao iniciar e ao redimensionar tela
updatePWAUI();
window.addEventListener('resize', updatePWAUI);

// Trata o clique no botão de instalação (Menu ou Card)
const handleInstallClick = async (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const target = (e && e.currentTarget) ? e.currentTarget.getAttribute('data-target') : null;

    // Direciona para a página de instruções de instalação
    if (target === 'pwa-install' || (e && e.currentTarget === pwaInstallCard)) {
        if (typeof switchTab === 'function') {
            switchTab('pwa-install');
        } else {
            state.activeTab = 'pwa-install';
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            const pwaInstallPage = document.getElementById('pwa-install-page');
            if (pwaInstallPage) pwaInstallPage.style.display = 'block';
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            if (menuInstallBtn) menuInstallBtn.classList.add('active');
            document.getElementById('page-title').textContent = 'Instalar Aplicativo';
            updatePWAUI();
        }
        return;
    }

    if (isStandalone) return;

    if (isIOS) {
        // No iOS apenas mostra a página de guia
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        document.getElementById('page-title').textContent = 'Instalar no iOS';
        return;
    }

    if (!deferredPrompt) {
        // Se o prompt não estiver carregado, mostra o guia manual
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('pwa-install-page').style.display = 'block';
        return;
    }

    // Dispara a instalação nativa do Android
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice: ${outcome}`);
    deferredPrompt = null;
    updatePWAUI();
};

// Vincula eventos de instalação aos botões da UI
if (menuInstallBtn) menuInstallBtn.onclick = handleInstallClick;
if (pwaInstallCard) pwaInstallCard.onclick = handleInstallClick;
if (mainInstallBtn) mainInstallBtn.onclick = handleInstallClick;

// Inicializa ouvintes para o switch de multi-meses
const initMultiMonthListeners = () => {
    document.addEventListener('change', (e) => {
        if (e.target.id === 'p-multi-month-toggle') {
            window.toggleMultiMonth(e.target.checked);
        }
    });
};

if (document.readyState === 'loading') {
    initMultiMonthListeners();
} else {
    initMultiMonthListeners();
}


