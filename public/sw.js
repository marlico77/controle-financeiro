const CACHE_NAME = 'gestao-fin-v26-history-carousel';
const STATIC_ASSETS = [
  "/",
  "/style.css",
  "/history.css",
  "/logo.png",
  "/ico_especialidade.svg",
  "/js/calendar.js",
  "/js/chat.js",
  "/js/core.js",
  "/js/dashboard.js",
  "/js/especialidades.js",
  "/js/events.js",
  "/js/financial.js",
  "/js/gallery.js",
  "/js/logs.js",
  "/js/notifications.js",
  "/js/planejamentos.js",
  "/js/profile.js",
  "/js/pwa.js",
  "/js/reports.js",
  "/js/sales.js",
  "/js/state.js",
  "/js/ui.js",
  "/js/uniformes.js",
  "/js/utils.js",
  "/js/whatsapp.js",
  "/authorizations.html",
  "/clube.html",
  "/dashboard.html",
  "/especialidades.html",
  "/events.html",
  "/gallery.html",
  "/login.html",
  "/logs.html",
  "/mensalidade.html",
  "/messages.html",
  "/outflows.html",
  "/people.html",
  "/planejamentos.html",
  "/profile.html",
  "/pwa-install.html",
  "/reports.html",
  "/sales.html",
  "/uniformes.html"
];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
        // An optional page must not abort installation of every other asset.
        const results = await Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
        results.forEach((result,i) => { if(result.status==='rejected') console.warn('Precache indisponível:',STATIC_ASSETS[i]); });
        await self.skipWaiting();
    }));
});
self.addEventListener('activate',event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key.startsWith('gestao-fin-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event => {
    const url=new URL(event.request.url);
    if(url.origin!==self.location.origin) return;
    if(url.pathname.startsWith('/api/')) {
        // Private data and mutations never use a shared cache.
        event.respondWith(fetch(event.request).catch(()=>new Response(JSON.stringify({error:'Sem conexão. Reconecte para consultar ou salvar dados.'}),{status:503,headers:{'Content-Type':'application/json'}})));
        return;
    }
    if(event.request.method!=='GET'||!STATIC_ASSETS.includes(url.pathname)) return;
    const cacheKey=url.pathname;
    const refresh=fetch(event.request).then(async response=>{
        if(response.ok) { const cache=await caches.open(CACHE_NAME); await cache.put(cacheKey,response.clone()); }
        return response;
    });
    event.waitUntil(refresh.catch(()=>{}));
    event.respondWith(caches.match(cacheKey).then(cached=>cached||refresh).catch(()=>new Response('Página indisponível offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
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
    } catch{
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
