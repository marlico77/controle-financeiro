# Sistema de Gestão Financeira e Auditoria - Tribo de Davi

Uma solução robusta, moderna e multiplataforma para controle financeiro, gestão de membros e monitoramento de atividades (auditoria) em tempo real. O sistema foi desenvolvido com foco em performance, segurança e usabilidade, oferecendo uma experiência premium tanto em desktop quanto em dispositivos móveis através da tecnologia PWA.

## 🚀 Funcionalidades Principais

### 📱 Experiência PWA (Progressive Web App)
- **Instalação Direta**: Pode ser instalado como um aplicativo nativo no Android, iOS e Desktop.
- **Offline Ready**: Cache inteligente via Service Workers para carregamento instantâneo.
- **Interface App-like**: Navegação fluida, sem barras de navegador e otimizada para gestos.
- **Banner de Instalação**: Convite inteligente integrado para adicionar à tela de início.

### 📅 Gestão Avançada de Eventos
- **Tipos de Pagamento**: Suporte a eventos com **Pagamento Único** ou **Parcelamento Mensal**.
- **Controle de Participantes**: Dashboard dedicado por evento com estatísticas de inscritos totais e por unidade.
- **Gestão de Comprovantes**: Sistema de upload e aprovação/rejeição de pagamentos com feedback em tempo real.
- **Inscrição Flexível**: Adição dinâmica de novos membros a eventos já criados.

### 📊 Painel de Controle (Dashboard)
- **Indicadores em Tempo Real**: Visualização de saldo de caixa, mensalidades pendentes e despesas.
- **Gráficos Interativos**: Análise visual via Chart.js para receitas, despesas e status de eventos.
- **Sticky Scrollbars**: Interface de tabelas longas otimizada para facilitar a visualização de grandes listas de membros.

### 🛡️ Segurança e Auditoria
- **Troca de Senha Obrigatória**: Segurança reforçada no primeiro acesso do usuário.
- **Sessão Única**: Detecção de conflitos de sessão para impedir múltiplos acessos simultâneos.
- **Logs de Auditoria**: Registro completo de ações, incluindo IP, dispositivo e navegador, com política de limpeza automática (24h).
- **Controle de Acesso (RBAC)**: Níveis diferenciados para Administradores, Secretários e Membros.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js com Express.
- **Banco de Dados**: PostgreSQL para persistência robusta e consultas complexas.
- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties), JavaScript (ES6+).
- **PWA**: Service Workers e Web App Manifest.
- **Gráficos**: Chart.js.
- **Segurança**: JWT (JSON Web Tokens) e BcryptJS para criptografia de senhas.

---

## ⚙️ Instalação e Configuração

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado (versão 14 ou superior).
- Instância do PostgreSQL configurada.

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
    Crie um arquivo `.env` na raiz do projeto:
    ```env
    PORT=3000
    DATABASE_URL=sua_url_de_conexao_aqui
    JWT_SECRET=sua_chave_secreta_aqui
    ```

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```
    O sistema estará disponível em `http://localhost:3000`.

---

## 📄 Licença

Este projeto é de uso restrito e privado. Todos os direitos reservados.
