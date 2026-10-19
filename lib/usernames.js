const normalizeUsername = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const usernameCandidatesFromName = fullName => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean).map(normalizeUsername);
    if (parts.length < 2 || parts.some(part => !part)) return [];

    const candidates = [];
    for (let middleCount = 0; middleCount <= parts.length - 2; middleCount++) {
        candidates.push([parts[0], ...parts.slice(1, 1 + middleCount), parts.at(-1)].join('.'));
    }
    return [...new Set(candidates)];
};

const findAvailableUsername = async (client, fullName) => {
    for (const username of usernameCandidatesFromName(fullName)) {
        const existing = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [username]);
        if (!existing.rows[0]) return username;
    }
    return null;
};

module.exports = { normalizeUsername, usernameCandidatesFromName, findAvailableUsername };
