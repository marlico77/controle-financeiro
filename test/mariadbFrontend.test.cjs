const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

test('MariaDB test frontend labels and blocks indexing on every page', () => {
    const pages = fs.readdirSync(pub).filter(file => file.endsWith('.html'));
    assert.ok(pages.length > 0);
    for (const page of pages) {
        const html = fs.readFileSync(path.join(pub, page), 'utf8');
        assert.match(html, /<meta\s+name="robots"\s+content="noindex, nofollow, noarchive"/i, page);
        assert.match(html, /\/js\/test-environment\.js\?v=mariadb-test-1/, page);
    }
    assert.match(fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8'), /Disallow:\s*\//);
});

test('MariaDB deployment uses an origin-local PWA identity and cache', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.json'), 'utf8'));
    assert.match(manifest.name, /Teste MariaDB/);
    assert.equal(manifest.start_url, '/');
    const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
    assert.match(sw, /gestao-fin-mariadb-test-v1/);
    assert.match(sw, /url\.origin\s*!==\s*self\.location\.origin/);
    assert.match(sw, /\/js\/test-environment\.js/);
    assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});

test('MariaDB database scalar values normalize in the browser', () => {
    const context = { window: {}, document: { addEventListener() {} }, navigator: {} };
    const source = fs.readFileSync(path.join(pub, 'js/utils.js'), 'utf8') +
        '\nglobalThis.helpers = { databaseBoolean, sameDatabaseId, normalizedPaymentType, parseDatabaseDate };';
    vm.runInNewContext(source, context);
    assert.equal(context.helpers.databaseBoolean(1), true);
    assert.equal(context.helpers.databaseBoolean('0'), false);
    assert.equal(context.helpers.sameDatabaseId(17, '17'), true);
    assert.equal(context.helpers.normalizedPaymentType(' UNICO '), 'unico');
    assert.equal(context.helpers.parseDatabaseDate('2026-01-01').getFullYear(), 2026);
});

test('test frontend has no API or navigation URL hard-coded to production', () => {
    const files = fs.readdirSync(path.join(pub, 'js')).filter(file => file.endsWith('.js'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(pub, 'js', file), 'utf8');
        assert.doesNotMatch(source, /https?:\/\/(?:www\.)?tribodedavi\.net\.br\/(?:api\/|dashboard\.html)/i, file);
    }
    const login = fs.readFileSync(path.join(pub, 'login.html'), 'utf8');
    assert.doesNotMatch(login, /href="https:\/\/www\.tribodedavi\.net\.br"/i);
});
