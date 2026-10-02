const crypto = require('node:crypto');
const { HttpError } = require('./validation');
const { canAccessPerson, isStaff } = require('./security');
async function prepareReceipt(file, sharp) {
    if (!file) return null;
    // Trust decoded content, never the client supplied MIME or file extension.
    const signature = file.buffer.subarray(0, 5).toString('ascii');
    if (signature === '%PDF-') return { buffer: file.buffer, mimetype: 'application/pdf' };
    try {
        const image = sharp(file.buffer, { limitInputPixels: 40000000 });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('unsupported');
        return { buffer: await image.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(), mimetype: 'image/webp' };
    } catch { throw new HttpError(400, 'Envie uma imagem JPG, PNG, WebP ou um arquivo PDF válido.'); }
}
async function storeReceipt(file, sharp, supabase) {
    const compressed = await prepareReceipt(file, sharp);
    if (!compressed) return { path: null, content: null, mime: null };
    const name = `${crypto.randomUUID()}.${compressed.mimetype === 'application/pdf' ? 'pdf' : 'webp'}`;
    let uploaded = false;
    try { uploaded = !(await supabase.storage.from('receipts').upload(name, compressed.buffer, { contentType: compressed.mimetype, upsert: false })).error; }
    catch { /* Database fallback retains the receipt when storage is unavailable. */ }
    return { path: `uploads/${name}`, content: uploaded ? null : compressed.buffer, mime: compressed.mimetype };
}
function registerReceiptRoutes(app, { db, supabase, authenticateToken }) {
    app.get('/api/files/receipt/:filename', authenticateToken, async (req, res, next) => {
        try {
            const filename = req.params.filename;
            if (!/^[\w.-]+$/.test(filename) || filename.includes('..')) throw new HttpError(404, 'Arquivo não encontrado.');
            const pathname = `uploads/${filename}`;
            // Resolve ownership first, regardless of the storage used.
            const result = await db.query(`SELECT person_id, receipt_content, receipt_mime, 'payment' AS source FROM payments WHERE receipt_path = $1
                UNION ALL SELECT person_id, receipt_content, receipt_mime, 'event' FROM event_payments WHERE receipt_path = $1
                UNION ALL SELECT NULL::integer, receipt_content, receipt_mime, 'outflow' FROM outflows WHERE receipt_path = $1
                UNION ALL SELECT NULL::integer, receipt_content, receipt_mime, 'sale' FROM sales WHERE receipt_path = $1`, [pathname]);
            const permitted = [];
            for (const row of result.rows) if (row.person_id ? await canAccessPerson(db, req.user, row.person_id) : isStaff(req.user)) permitted.push(row);
            if (!permitted.length) throw new HttpError(result.rowCount ? 403 : 404, 'Arquivo indisponível.');
            let content = permitted.find(row => row.receipt_content)?.receipt_content;
            if (!content) {
                const { data } = await supabase.storage.from('receipts').download(filename);
                if (data) content = Buffer.from(await data.arrayBuffer());
            }
            if (!content) throw new HttpError(404, 'Conteúdo do arquivo indisponível.');
            const mime = permitted[0].receipt_mime;
            res.set({ 'Content-Type': ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'].includes(mime) ? mime : 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
            res.send(content);
        } catch (err) { next(err); }
    });
    app.get('/api/public-images/:filename', async (req, res, next) => {
        try {
            const filename = req.params.filename;
            if (!/^especialidade-[\w.-]+$/.test(filename) || filename.includes('..')) throw new HttpError(404, 'Imagem não encontrada.');
            const result = await db.query('SELECT id FROM especialidades WHERE imagem_url = $1', [`/api/public-images/${filename}`]);
            if (!result.rowCount) throw new HttpError(404, 'Imagem não encontrada.');
            // Only an explicitly published image is accessible; receipts never match this registry.
            const { data } = await supabase.storage.from('receipts').download(filename);
            if (!data || !['image/jpeg', 'image/png', 'image/webp'].includes(data.type)) throw new HttpError(404, 'Imagem não encontrada.');
            res.set({ 'Content-Type': data.type, 'X-Content-Type-Options': 'nosniff' });
            res.send(Buffer.from(await data.arrayBuffer()));
        } catch (err) { next(err); }
    });
}
module.exports = { prepareReceipt, storeReceipt, registerReceiptRoutes };
