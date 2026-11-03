// Cash is recognized when a payment is approved. Reference months and event dates
// are used by the detailed reports, but must not decide when money enters the cash box.
const ledgerQuery = `
    WITH ledger AS (
        SELECT 'dues' AS source, p.unit,
               (COALESCE(pay.updated_at, pay.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS cash_date,
               pay.amount
        FROM payments pay
        LEFT JOIN people p ON p.id = pay.person_id
        WHERE pay.status = 'approved'
        UNION ALL
        SELECT 'events', p.unit,
               (COALESCE(ep.updated_at, ep.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date,
               ep.amount
        FROM event_payments ep
        LEFT JOIN people p ON p.id = ep.person_id
        WHERE ep.status = 'approved'
        UNION ALL
        SELECT 'sales', NULL, s.date, s.amount FROM sales s
        UNION ALL
        SELECT 'outflows', NULL, o.date, -o.amount FROM outflows o
    )
    SELECT source, unit, EXTRACT(YEAR FROM cash_date)::integer AS year,
           EXTRACT(MONTH FROM cash_date)::integer AS month,
           SUM(amount)::numeric(14,2) AS amount
    FROM ledger
    GROUP BY source, unit, year, month
`;

const cents = value => Math.round(Number(value) * 100);

function summarizeLedgerRows(rows, year) {
    const summary = {
        year, balanceCents: 0, duesCents: 0, eventsCents: 0,
        salesCents: 0, outflowsCents: 0, directionCents: 0,
        desbravadoresCents: 0, monthlyCents: Array(12).fill(0)
    };
    for (const row of rows) {
        const amount = cents(row.amount);
        summary.balanceCents += amount;
        if (Number(row.year) !== year) continue;
        if (row.source === 'outflows') {
            summary.outflowsCents -= amount;
            continue;
        }
        if (row.source === 'dues') summary.duesCents += amount;
        if (row.source === 'events') summary.eventsCents += amount;
        if (row.source === 'sales') summary.salesCents += amount;
        const month = Number(row.month);
        if (month >= 1 && month <= 12) summary.monthlyCents[month - 1] += amount;
        if (row.source === 'dues' || row.source === 'events') {
            const unit = String(row.unit || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            if (unit.includes('DIRECAO')) summary.directionCents += amount;
            else if (unit.includes('DESBRAVADOR')) summary.desbravadoresCents += amount;
        }
    }
    return summary;
}

module.exports = { ledgerQuery, summarizeLedgerRows };
