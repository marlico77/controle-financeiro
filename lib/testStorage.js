'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function testStorage(root = process.env.LOCAL_RECEIPTS_DIR) {
    const resolvedRoot = root ? path.resolve(root) : null;
    return {
        storage: {
            from() {
                return {
                    async upload() { return { error: new Error('Uploads externos desabilitados no ambiente de teste.') }; },
                    async download(filename) {
                        if (!resolvedRoot || typeof filename !== 'string' || path.basename(filename) !== filename || filename.includes('..')) return { data: null, error: new Error('Arquivo local de teste não disponível.') };
                        const target = path.resolve(resolvedRoot, filename);
                        if (!target.startsWith(resolvedRoot + path.sep)) return { data: null, error: new Error('Caminho fora do armazenamento de teste.') };
                        try {
                            const bytes = await fs.readFile(target);
                            const ext = path.extname(filename).toLowerCase();
                            const type = ext === '.pdf' ? 'application/pdf' : ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
                            return { data: new Blob([bytes], { type }), error: null };
                        } catch { return { data: null, error: new Error('Arquivo local de teste não encontrado.') }; }
                    }
                };
            }
        }
    };
}

module.exports = { testStorage };
