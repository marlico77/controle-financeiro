const http = require('http');
const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.argv[2]
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data));
});
req.write(JSON.stringify({
    person_id: 1,
    months: '[\"1\", \"2\"]',
    year: 2024,
    amount: 100
}));
req.end();
