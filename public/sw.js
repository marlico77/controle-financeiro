const CACHE_NAME = 'gestao-fin-v14'; // Nome da versão do cache (deve ser atualizado para forçar refresh de arquivos)
const STATIC_ASSETS = [ // Lista de arquivos estáticos que serão salvos no cache para funcionamento offline
  '/', // Página inicial
  '/index.html', // Estrutura HTML
  '/style.css', // Estilos CSS
  '/app.js', // Lógica da aplicação
  '/logo.png', // Logotipo do sistema
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap', // Fonte Google Fonts
  'https://cdn.jsdelivr.net/npm/chart.js' // Biblioteca de gráficos
];

// Evento de instalação: ocorre quando o Service Worker é registrado pela primeira vez
self.addEventListener('install', event => {
  event.waitUntil(
    // Abre o cache e adiciona todos os arquivos estáticos definidos acima
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Evento de ativação: ocorre quando o Service Worker começa a controlar a página
self.addEventListener('activate', event => {
  event.waitUntil(
    // Limpa versões antigas do cache para evitar conflitos de arquivos desatualizados
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
});

// Evento de busca (fetch): intercepta todas as requisições de rede feitas pela aplicação
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tratamento para chamadas de API: Prioriza a rede, mas usa o cache se estiver offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Tratamento para arquivos estáticos: Estratégia "Stale While Revalidate"
  // Mostra o que está no cache imediatamente, mas busca a versão mais nova na rede em segundo plano
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchedResponse = fetch(event.request).then(networkResponse => {
        // Atualiza o cache com a resposta mais recente da rede
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      });
      // Retorna o cache se existir, senão retorna a requisição da rede
      return cachedResponse || fetchedResponse;
    })
  );
});

// --- Suporte a Notificações Push ---

// Evento disparado quando o servidor envia uma notificação push
self.addEventListener('push', event => {
  // Define valores padrão para a notificação
  let data = { title: 'Nova Mensagem', body: 'Você tem uma nova notificação do Clube.' };
  
  if (event.data) {
    try {
      // Tenta extrair os dados da notificação enviada pelo servidor
      data = event.data.json();
    } catch (e) {
      // Se não for JSON, trata como texto simples
      data = { title: 'Nova Mensagem', body: event.data.text() };
    }
  }

  // Configurações visuais da notificação nativa do sistema operacional
  const options = {
    body: data.body, // Texto principal da mensagem
    icon: '/logo.png', // Ícone que aparece na notificação
    badge: '/logo.png', // Ícone que aparece na barra de status do celular
    vibrate: [100, 50, 100], // Padrão de vibração do dispositivo
    data: {
      url: '/' // URL que será aberta ao clicar na notificação
    }
  };

  // Exibe a notificação para o usuário
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Evento disparado quando o usuário clica na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close(); // Fecha o banner da notificação imediatamente
  event.waitUntil(
    // Abre a aplicação no navegador ou coloca o PWA em foco
    clients.openWindow('/')
  );
});
