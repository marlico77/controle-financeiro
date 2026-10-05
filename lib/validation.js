const crypto = require('node:crypto');
class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const positiveId = value => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Identificador inválido.');
    return id;
};
const yearNumber = value => {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, 'Ano inválido.');
    return year;
};
const monthNumber = value => {
    const month = Number(value);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Mês inválido.');
    return month;
};
const moneyCents = value => {
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(value))) throw new HttpError(400, 'Valor monetário inválido.');
    const [whole, fraction = ''] = String(value).split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (cents <= 0 || cents > 9999999999) throw new HttpError(400, 'O valor deve ser positivo e estar dentro do limite permitido.');
    return cents;
};
const moneyString = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const paymentBatch = body => {
    let months;
    try { months = body.months === undefined ? [body.month] : (typeof body.months === 'string' ? JSON.parse(body.months) : body.months); }
    catch { throw new HttpError(400, 'Lista de meses inválida.'); }
    if (!Array.isArray(months) || !months.length || months.length > 12) throw new HttpError(400, 'Selecione de 1 a 12 meses.');
    months = months.map(monthNumber);
    if (new Set(months).size !== months.length) throw new HttpError(400, 'Meses duplicados.');
    const cents = moneyCents(body.amount);
    if (cents < months.length) throw new HttpError(400, 'O valor não permite parcelas positivas.');
    return { personId: positiveId(body.person_id), year: yearNumber(body.year), months,
        amounts: months.map((_, i) => moneyString(Math.floor(cents / months.length) + (i < cents % months.length ? 1 : 0))) };
};
const dateOnly = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Data inválida.');
    return value;
};
const normalizeEmail = value => {
    if (typeof value !== 'string') throw new HttpError(400, 'E-mail inválido.');
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    return email;
};
const validPassword = value => typeof value === 'string' && value.length >= 10 && Buffer.byteLength(value) <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value);
const tokenHash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
module.exports = { HttpError, positiveId, yearNumber, monthNumber, moneyCents, moneyString, paymentBatch, dateOnly, normalizeEmail, validPassword, tokenHash };
