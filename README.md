# Sistema de Gestão Financeira e Auditoria

Uma solução robusta e moderna para controle financeiro, gestão de membros e monitoramento de atividades (auditoria) em tempo real. O sistema foi desenvolvido com foco em performance, segurança e usabilidade, oferecendo uma interface responsiva adaptada para desktop e dispositivos móveis.

## 🚀 Funcionalidades Principais

### 📊 Painel de Controle (Dashboard)
- Visualização de indicadores financeiros em tempo real.
- Gráficos comparativos de receitas e despesas.
- Resumo de status de pagamentos e inadimplência.

### 📋 Gestão Financeira
- Controle completo de fluxos de caixa.
- Histórico detalhado de transações.
- Filtros avançados por ano, mês e categoria.

### 👥 Gestão de Membros
- Cadastro e administração de usuários com diferentes níveis de acesso (Admin, Secretário, etc.).
- Monitoramento de status de membros.

### 🛡️ Auditoria e Logs do Sistema
- Registro automático de ações críticas (logins, alterações de dados, eventos de sistema).
- Captura de metadados de segurança: IP, Navegador, Sistema Operacional e Geolocalização básica.
- **Retenção de Dados**: Política automática de limpeza que mantém apenas os logs das últimas 24 horas, otimizando o banco de dados.

### 📱 Experiência do Usuário (UX/UI)
- Interface com suporte a **Modo Escuro** e design baseado em **Glassmorphism**.
- Navegação otimizada para mobile com barra inferior dinâmica.
- Gerenciamento de sessão ativa com logout automático por inatividade (20 min).

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js com Express.
- **Banco de Dados**: PostgreSQL (via Supabase) para persistência escalável.
- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties), JavaScript (ES6+).
- **Segurança**: JWT (JSON Web Tokens) para autenticação e middlewares de proteção de rota.
- **Parsing**: `ua-parser-js` para análise detalhada de dispositivos nos logs.

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
    Crie um arquivo `.env` na raiz do projeto e adicione as variáveis necessárias (exemplo abaixo):
    ```env
    PORT=3000
    DATABASE_URL=sua_url_de_conexao_aqui
    JWT_SECRET=sua_chave_secreta_aqui
    ```
    > **Aviso**: Nunca compartilhe o arquivo `.env` publicamente.

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```
    O sistema estará disponível em `http://localhost:3000`.

---

## 🔒 Segurança

- Todas as senhas são criptografadas antes de serem armazenadas.
- Middleware de auditoria registra todas as tentativas de acesso e modificações sensíveis.
- Política de sessão única: impede que o mesmo usuário mantenha múltiplas sessões ativas simultaneamente em dispositivos diferentes.

---

## 📄 Licença

Este projeto é de uso restrito e privado. Todos os direitos reservados.
