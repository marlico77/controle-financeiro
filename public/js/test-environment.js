(() => {
    const mountTestBanner = () => {
        if (!document.body || document.getElementById('mariadb-test-environment')) return;
        const banner = document.createElement('aside');
        banner.id = 'mariadb-test-environment';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-label', 'Ambiente de teste MariaDB');
        banner.textContent = 'AMBIENTE DE TESTE · MariaDB · Dados isolados';
        banner.style.cssText = [
            'position:sticky', 'top:0', 'z-index:2147483647', 'display:block', 'width:100%',
            'padding:7px 12px', 'background:#8f2100', 'color:#fff', 'text-align:center',
            'font:700 13px/1.35 system-ui,sans-serif', 'letter-spacing:.04em',
            'box-shadow:0 2px 8px #0004'
        ].join(';');
        document.body.prepend(banner);
        document.documentElement.dataset.environment = 'mariadb-test';
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountTestBanner, { once: true });
    } else {
        mountTestBanner();
    }
})();
