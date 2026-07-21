// --- Lógica do Módulo Galeria ---
async function fetchGallery() {
    const tbody = document.getElementById('gallery-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem;">Carregando álbuns...</td></tr>';
    
    try {
        const albums = await apiFetch('/api/site-albums');
        renderGallery(albums);
    } catch{
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--error-color);">Erro ao carregar álbuns.</td></tr>';
        showStatus('Erro ao carregar galeria.', 'error');
    }
}

function renderGallery(albums) {
    const tbody = document.getElementById('gallery-body');
    if (!tbody) return;
    
    if (!albums || albums.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--text-dim);">Nenhum álbum cadastrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = albums.map(album => `
        <tr>
            <td>
                <div style="width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: #222;">
                    <img src="${escapeHTML(album.cover_url)}" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer" onerror="this.src='logo.png'">
                </div>
            </td>
            <td>
                <div style="font-weight: bold; margin-bottom: 4px;">${escapeHTML(album.title)}</div>
                <div style="font-size: 0.85rem; color: var(--text-dim); max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHTML(album.description || 'Sem descrição')}
                </div>
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-primary btn-sm" onclick='editAlbum(${JSON.stringify(album).replace(/'/g, "&apos;")})'>Editar</button>
                    <button class="btn-text btn-sm" style="color: var(--error-color);" onclick="deleteAlbum(${album.id})">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Formulário de Cadastro/Edição de Álbum
const galleryForm = document.getElementById('gallery-form');
if (galleryForm) {
    galleryForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('gallery-id').value;
        const payload = {
            title: document.getElementById('gallery-title').value,
            cover_url: document.getElementById('gallery-cover-url').value,
            album_url: document.getElementById('gallery-album-url').value,
            description: document.getElementById('gallery-desc').value
        };
        
        const submitBtn = document.getElementById('gallery-submit-btn');
        const isEditing = !!id;
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Salvando...';
            
            const method = isEditing ? 'PUT' : 'POST';
            const url = isEditing ? `/api/site-albums/${id}` : '/api/site-albums';
            
            await apiFetch(url, {
                method,
                body: JSON.stringify(payload)
            });
            
            showStatus(isEditing ? 'Álbum atualizado!' : 'Álbum cadastrado!', 'success');
            cancelAlbumEdit();
            fetchGallery();
            
        } catch (err) {
            showStatus('Erro: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salvar Álbum';
        }
    };
}

window.editAlbum = (album) => {
    document.getElementById('gallery-id').value = album.id;
    document.getElementById('gallery-title').value = album.title;
    document.getElementById('gallery-cover-url').value = album.cover_url;
    document.getElementById('gallery-cover-url').dispatchEvent(new Event('input'));
    document.getElementById('gallery-album-url').value = album.album_url || '';
    document.getElementById('gallery-desc').value = album.description || '';
    
    document.getElementById('gallery-submit-btn').textContent = 'Atualizar Álbum';
    document.getElementById('gallery-cancel-btn').style.display = 'flex';
    
    // Scrolla para o topo do formulário
    document.getElementById('gallery-page').scrollIntoView({ behavior: 'smooth' });
};

const cancelAlbumEdit = () => {
    window.cancelAlbumEdit = cancelAlbumEdit;
    const form = document.getElementById('gallery-form');
    if (form) form.reset();
    document.getElementById('gallery-id').value = '';
    document.getElementById('gallery-submit-btn').textContent = 'Salvar Álbum';
    document.getElementById('gallery-cancel-btn').style.display = 'none';
};

const cancelAlbumBtn = document.getElementById('gallery-cancel-btn');
if (cancelAlbumBtn) {
    cancelAlbumBtn.onclick = cancelAlbumEdit;
}

window.deleteAlbum = async (id) => {
    const confirm = await showConfirm('Tem certeza que deseja excluir este álbum? Ele será removido do site.', 'Excluir Álbum');
    if (!confirm) return;
    
    try {
        await apiFetch(`/api/site-albums/${id}`, { method: 'DELETE' });
        showStatus('Álbum excluído.', 'success');
        fetchGallery();
    } catch (err) {
        showStatus('Erro ao excluir: ' + err.message, 'error');
    }
};



// Listener para atualizar o preview da capa do album no formulario
document.addEventListener('DOMContentLoaded', () => {
    const coverInput = document.getElementById('gallery-cover-url');
    const previewContainer = document.getElementById('gallery-cover-preview-container');
    const previewImg = document.getElementById('gallery-cover-preview-img');

    if (coverInput && previewContainer && previewImg) {
        const updatePreview = () => {
            const url = coverInput.value.trim();
            if (url) {
                previewImg.src = url;
                previewContainer.style.display = 'block';
            } else {
                previewContainer.style.display = 'none';
            }
        };
        
        // Listeners for changes and keyups
        coverInput.addEventListener('input', updatePreview);
        coverInput.addEventListener('change', updatePreview);
        
        // Initial check if we are editing
        setTimeout(updatePreview, 500);
    }
});
