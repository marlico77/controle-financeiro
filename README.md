# Sistema de Gestão Financeira e Auditoria - Tribo de Davi

Uma solução robusta, moderna e multiplataforma para controle financeiro, gestão de membros e monitoramento de atividades (auditoria) em tempo real. O sistema foi desenvolvido com foco em performance, segurança e usabilidade, oferecendo uma experiência premium tanto em desktop quanto em dispositivos móveis através da tecnologia PWA, além de um portal institucional dinâmico.

## 🚀 Funcionalidades Principais

### 📱 Experiência PWA (Progressive Web App)
- **Instalação Direta**: Pode ser instalado como um aplicativo nativo no Android, iOS e Desktop.
- **Offline Ready**: Cache inteligente via Service Workers para carregamento instantâneo.
- **Interface App-like**: Navegação fluida, sem barras de navegador e otimizada para gestos.
- **Banner de Instalação**: Convite inteligente integrado para adicionar à tela de início.

### 👥 Gestão de Pessoas e Membros
- **Controle Completo (CRUD)**: Cadastro detalhado de cada participante do clube com informações completas.
- **Importação em Massa**: Sistema robusto para importar múltiplos membros de uma só vez através de planilhas/arquivos.
- **Níveis de Acesso Dinâmicos**: Gerenciamento de permissões (Administradores, Secretários e Membros) pelo Admin Master.

### 💰 Gestão Financeira Abrangente
- **Controle de Mensalidades**: Gestão do pagamento recorrente dos membros da equipe.
- **Módulo de Vendas Extras**: Cadastro e acompanhamento de vendas auxiliares (como cantina, uniformes e materiais).
- **Controle de Despesas (Saídas)**: Registro completo das saídas financeiras do clube, permitindo upload e arquivamento de recibos/comprovantes.
- **Aprovação de Comprovantes**: Sistema de auditoria visual onde a secretaria pode aprovar ou rejeitar comprovantes de pagamento enviados pelos membros, emitindo feedback na hora.

### 📅 Gestão Avançada de Eventos
- **Tipos de Pagamento**: Suporte a eventos com **Pagamento Único** ou **Parcelamento Mensal**.
- **Controle de Participantes**: Dashboard dedicado por evento com estatísticas de inscritos totais e por unidade.
- **Inscrição Flexível**: Adição dinâmica de novos membros a eventos já criados.
- **Calendário Interativo**: Visualização de eventos anuais com tooltips adaptativos e inteligentes que evitam cortes na interface.

### 🌐 Portal Institucional e Mídia
- **Site Integrado**: Página de apresentação pública para visitantes conhecerem o Clube.
- **Galeria de Fotos Dinâmica**: Sistema administrativo para gerenciar álbuns e imagens expostas no portal.
- **Calendário Público**: Eventos adicionados e editados pelo painel admin refletem imediatamente no calendário institucional do site.
- **Contato Integrado**: Formulário de contato público que se comunica diretamente com a API do sistema.

### 📊 Painel de Controle (Dashboard)
- **Indicadores em Tempo Real**: Visualização imediata de saldo de caixa, mensalidades pendentes e despesas totais.
- **Gráficos Interativos**: Análises visuais via Chart.js para receitas, saídas e status de eventos.
- **Sticky Scrollbars**: Interface de tabelas longas otimizada para facilitar a visualização de grandes listas de registros e membros.

### 🛡️ Segurança e Auditoria
- **Conformidade com a LGPD**: Sistema de aceite de termos e política de privacidade no primeiro acesso para proteção de dados.
- **Recuperação de Senha**: Fluxo completo e seguro para redefinição de credenciais perdidas.
- **Troca de Senha Obrigatória**: Segurança reforçada forçando alteração de credenciais pré-geradas.
- **Sessão Persistente**: Lógica JWT otimizada para uso fluido em múltiplos dispositivos simultaneamente.
- **Logs de Auditoria**: Registro imutável de ações sensíveis, coletando IP, dispositivo e navegador, com política de limpeza automática periódica.

### 🔔 Sistema de Mensagens e Notificações (Novo v2.0)
- **Notificações Push PWA**: Alertas diretos na barra de notificações do celular do membro (Android e iOS 16.4+).
- **Mensagens Diretas**: Painel administrativo para envio de avisos globais ou comunicações individuais.
- **Modais de Aviso**: Janelas flutuantes que alertam o usuário no seu primeiro acesso após o disparo de uma mensagem.
- **Automação Inteligente de Cobrança**: Lembretes automáticos enviados nos dias 5 e 20 exclusivamente para membros inadimplentes.
- **Respeito ao Sábado**: Algoritmo que detecta se o dia 20 cai em um Sábado e adia as notificações financeiras automaticamente para após o pôr do sol.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js com Express.
- **Banco de Dados**: PostgreSQL para persistência robusta e consultas complexas.
- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties), JavaScript (ES6+).
- **PWA**: Service Workers, Web-Push e Web App Manifest.
- **Gráficos**: Chart.js.
- **Segurança**: JWT (JSON Web Tokens), BcryptJS (criptografia) e Middleware CORS.
- **Agendamento**: Node-cron para tarefas e limpezas automatizadas em segundo plano.

---

## ⚙️ Instalação e Configuração

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado (versão 14 ou superior).
- Instância do PostgreSQL configurada e rodando.

### Passo a Passo

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/marlico77/controle-financeiro.git
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configuração de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto contendo as seguintes variáveis mínimas:
    ```env
    PORT=3000
    DATABASE_URL=sua_url_de_conexao_com_postgresql
    JWT_SECRET=sua_chave_secreta_super_segura
    VAPID_PUBLIC_KEY=sua_chave_publica_push
    VAPID_PRIVATE_KEY=sua_chave_privada_push
    ```

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```
    O sistema estará disponível em `http://localhost:3000`.

---

## 📄 Licença

Este projeto é de uso restrito e privado. Todos os direitos reservados.
