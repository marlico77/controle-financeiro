const test = require('node:test');
const assert = require('node:assert/strict');
const { ledgerQuery, summarizeLedgerRows } = require('../lib/financialSummary');

test('cash uses approval year even for a future or undated event', () => {
    const rows = [
        { source: 'dues', unit: 'DIREÇÃO', year: 2026, month: 4, amount: '100.01' },
        { source: 'events', unit: 'DESBRAVADOR', year: 2026, month: 5, amount: '250.02' },
        { source: 'events', unit: 'DIREÇÃO', year: 2027, month: 1, amount: '50.00' },
        { source: 'outflows', unit: null, year: 2026, month: 4, amount: '-300.00' }
    ];
    const summary = summarizeLedgerRows(rows, 2026);
    assert.equal(summary.balanceCents, 10003);
    assert.equal(summary.eventsCents, 25002);
    assert.equal(summary.outflowsCents, 30000);
    assert.equal(summary.directionCents, 10001);
    assert.equal(summary.desbravadoresCents, 25002);
    assert.equal(summary.monthlyCents[4], 25002);
    assert.match(ledgerQuery, /FROM event_payments ep[\s\S]*WHERE ep.status = 'approved'/);
    assert.doesNotMatch(ledgerQuery, /JOIN events\b/);
    assert.doesNotMatch(ledgerQuery, /ep\.year\b/);
});
