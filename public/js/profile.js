// --- Lógica de Perfil de Usuário ---
// Renderiza a aba de perfil com os dados do usuário logado
const renderProfile = async () => {
    if (!state.personId) {
        showStatus('Perfil não vinculado a um membro.', 'info');
        return;
    }

    try {
        // Busca os dados atualizados do membro
        const members = await apiFetch('/api/people');
        const userProfile = members.find(p => parseInt(p.id) === parseInt(state.personId));

        if (!userProfile) {
            showStatus('Não foi possível carregar os dados do perfil.', 'error');
            return;
        }

        // Preenche o formulário
        document.getElementById('profile-name').value = userProfile.name || '';
        document.getElementById('profile-responsible').value = userProfile.responsible || '';
        document.getElementById('profile-cpf').value = userProfile.cpf || '';
        document.getElementById('profile-unit').value = userProfile.unit || 'Sem Unidade';
        
        if (userProfile.birth_date) {
            const date = new Date(userProfile.birth_date);
            const formattedDate = date.toISOString().split('T')[0];
            document.getElementById('profile-birth-date').value = formattedDate;
            document.getElementById('profile-age').value = calculateProfileAge(userProfile.birth_date);
        } else {
            document.getElementById('profile-birth-date').value = '';
            document.getElementById('profile-age').value = 'Não informada';
        }

        // Máscara de CPF em tempo real
        const cpfInput = document.getElementById('profile-cpf');
        if (cpfInput) {
            cpfInput.oninput = (e) => e.target.value = formatCPF(e.target.value);
        }

        // Atualização de idade em tempo real ao mudar a data de nascimento
        const birthInput = document.getElementById('profile-birth-date');
        if (birthInput) {
            birthInput.onchange = (e) => {
                document.getElementById('profile-age').value = calculateProfileAge(e.target.value);
            };
        }

        // Lógica de salvamento
        const form = document.getElementById('profile-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                const payload = {
                    name: document.getElementById('profile-name').value,
                    responsible: document.getElementById('profile-responsible').value,
                    cpf: document.getElementById('profile-cpf').value,
                    birth_date: document.getElementById('profile-birth-date').value
                    // Unidade e idade não são enviados para evitar alteração
                };

                try {
                    const res = await apiFetch(`/api/people/${state.personId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });

                    if (res.success) {
                        showStatus('Perfil atualizado com sucesso!', 'success');
                        // Atualiza o nome no estado e na UI (sidebar)
                        state.name = payload.name;
                        setStorageItem('name', payload.name);
                        const userNameDisplay = document.querySelector('.user-info p');
                        if (userNameDisplay) userNameDisplay.textContent = payload.name.toUpperCase();
                    }
                } catch (err) {
                    showStatus('Erro ao atualizar perfil: ' + err.message, 'error');
                }
            };
        }

    } catch (err) {
        console.error('Error rendering profile:', err);
        showStatus('Erro ao carregar perfil.', 'error');
    }
};

// Calcula a idade formatada para o perfil
function calculateProfileAge(birthDate) {
    if (!birthDate) return 'Não informada';
    const today = new Date();
    const birth = new Date(birthDate);
    if (isNaN(birth)) return 'Data inválida';
    
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age + (age === 1 ? ' ano' : ' anos');
}

