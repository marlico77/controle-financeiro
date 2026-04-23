const fetch = require('node-fetch');

async function test() {
    console.log('Logging in...');
    const loginRes = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'caio.alves', password: 'tribo@2026' })
    });
    const { token } = await loginRes.json();
    console.log('Token received.');

    console.log('Fetching /api/people...');
    const res = await fetch('http://localhost:3000/api/people', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
}

test();
