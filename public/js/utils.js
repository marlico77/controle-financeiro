
// Função global para alternar entre pagamento de mês único ou múltiplos meses no modal
window.toggleMultiMonth = (isChecked) => {
    const selector = document.getElementById('p-multi-month-selector'); // Container de múltiplos meses
    const singleInfo = document.getElementById('p-single-month-info');   // Informação de mês único
    if (selector) {
        selector.style.display = isChecked ? 'block' : 'none'; // Mostra se marcado, oculta se desmarcado
        if (isChecked) selector.classList.add('animate-slide-down'); // Adiciona animação de descida
    }
    if (singleInfo) singleInfo.style.display = isChecked ? 'none' : 'block'; // Oculta info única se marcado
};

// Copia o PIX e altera o estilo do botão temporariamente
window.copyPix = (element, text) => {
    navigator.clipboard.writeText(text);
    if (typeof showStatus === 'function') {
        showStatus('Chave PIX copiada!', 'success');
    }
    
    // Identifica o botão (se clicou no texto, o botão é o próximo elemento)
    let btn = element.tagName === 'BUTTON' ? element : element.nextElementSibling;
    if (!btn || btn.tagName !== 'BUTTON') return;
    
    const originalText = btn.textContent;
    btn.textContent = 'Copiado!';
    btn.style.background = 'var(--success-color)';
    btn.style.color = 'white';
    btn.style.borderColor = 'var(--success-color)';
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
    }, 2000);
};



// Nomes completos dos meses em português
const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Abreviações dos meses para uso em tabelas e gráficos
const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- Utilitários de Formatação ---
// Aplica máscara de CPF (000.000.000-00) enquanto o usuário digita
const formatCPF = (v) => {
    v = v.replace(/\D/g, ""); // Remove tudo o que não é dígito numérico
    if (v.length > 11) v = v.substring(0, 11); // Limita a 11 caracteres
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); // Coloca o primeiro ponto
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); // Coloca o segundo ponto
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2"); // Coloca o hífen
    return v; // Retorna o valor formatado
};

// Valida se o CPF é matematicamente válido (algoritmo oficial)
const isValidCPF = (cpf) => {
    if (!cpf) return true; // Campo opcional (se estiver vazio, é considerado válido aqui)
    const cleanCPF = cpf.replace(/\D/g, ''); // Remove caracteres não numéricos
    if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false; // Verifica tamanho e números repetidos

    // --- Continuação da Validação de CPF ---
    let sum = 0, rev;
    for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i); // Cálculo do primeiro dígito verificador
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i); // Cálculo do segundo dígito verificador
    rev = 11 - (sum % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cleanCPF.charAt(10))) return false;

    return true; // Retorna true se passar em todos os testes
};

// Calcula a idade de uma pessoa baseada na data de nascimento
const calculateAge = (birthDate) => {
    if (!birthDate) return ''; // Retorna vazio se não houver data
    const birth = new Date(birthDate); // Converte string para objeto Date
    const today = new Date(); // Data atual
    let age = today.getFullYear() - birth.getFullYear(); // Diferença de anos
    const m = today.getMonth() - birth.getMonth(); // Diferença de meses
    // Ajusta a idade se o aniversário ainda não ocorreu este ano
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age; // Retorna a idade final
};

// Formata uma data ISO (AAAA-MM-DD) para o padrão brasileiro (DD/MM/AAAA)
const formatDate = (dateString) => {
    if (!dateString) return '-'; // Retorna traço se não houver data

    // Remove a parte de hora se houver (YYYY-MM-DDTHH:mm:ss...)
    const cleanDate = dateString.split('T')[0];
    const parts = cleanDate.split('-'); // Divide por hífens

    if (parts.length !== 3) return dateString; // Se não estiver no padrão esperado, retorna o original
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Remonta no formato dia/mês/ano
};

// Exibe uma notificação flutuante (toast) na tela
const showStatus = (msg, type = 'info') => {
    const container = document.getElementById('toast-container'); // Container fixo na tela
    const toast = document.createElement('div'); // Cria o elemento da notificação
    toast.className = `toast ${type}`; // Define a classe (info, success, error)
    toast.innerHTML = `
        <span class="toast-msg">${msg}</span>
    `; // Define o texto da mensagem
    container.appendChild(toast); // Adiciona ao container

    // Remove a notificação após 4 segundos com efeito de fade
    setTimeout(() => {
        toast.classList.add('hiding'); // Inicia a animação de saída
        setTimeout(() => toast.remove(), 300); // Remove do DOM após a animação
    }, 4000);
};

// Exibe um modal de confirmação (Sim/Não) e retorna uma promessa
const showConfirm = (message, title = 'Confirmar Ação') => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal'); // Elemento do modal
        const titleEl = document.getElementById('confirm-title'); // Título do modal
        const messageEl = document.getElementById('confirm-message'); // Mensagem do modal
        const yesBtn = document.getElementById('confirm-yes'); // Botão "Sim"
        const noBtn = document.getElementById('confirm-no'); // Botão "Não"

        titleEl.textContent = title; // Define o título
        messageEl.textContent = message; // Define a mensagem
        modal.style.display = 'flex'; // Exibe o modal centralizado

        // Função interna para limpar eventos e resolver a promessa
        const handleResponse = (result) => {
            modal.style.display = 'none'; // Esconde o modal
            yesBtn.onclick = null; // Limpa o evento de clique
            noBtn.onclick = null; // Limpa o evento de clique
            resolve(result); // Retorna true ou false
        };

        yesBtn.onclick = () => handleResponse(true); // Clicou Sim
        noBtn.onclick = () => handleResponse(false); // Clicou Não
    });
};

// Exibe um alerta informativo ou de erro com ícone personalizado
async function showAlert(message, title = 'Aviso', icon = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal'); // Elemento do modal de alerta
        const titleEl = document.getElementById('alert-title'); // Título
        const messageEl = document.getElementById('alert-message'); // Corpo da mensagem
        const iconEl = document.getElementById('alert-icon'); // Ícone
        const okBtn = document.getElementById('alert-ok'); // Botão de OK

        // SVG de sucesso (círculo com check)
        const successSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="60" height="60" fill="var(--accent-color)"><path d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/></svg>`;

        titleEl.textContent = title; // Define título
        messageEl.innerHTML = message; // Define mensagem (suporta HTML)

        // Ajusta cores e ícones conforme o tipo (Sucesso, Erro ou Geral)
        if (title === 'Sucesso') {
            iconEl.innerHTML = successSvg;
            titleEl.style.color = 'var(--accent-color)';
            okBtn.style.backgroundColor = 'var(--accent-color)';
        } else if (title === 'Erro') {
            iconEl.innerHTML = '❌';
            titleEl.style.color = 'var(--error-color)';
            okBtn.style.backgroundColor = 'var(--error-color)';
        } else {
            iconEl.innerHTML = icon;
            titleEl.style.color = 'var(--accent-color)';
            okBtn.style.backgroundColor = 'var(--accent-color)';
        }
        modal.style.display = 'flex'; // Mostra o modal

        okBtn.onclick = () => {
            modal.style.display = 'none'; // Esconde ao clicar OK
            resolve(); // Resolve a promessa
        };
    });
}

