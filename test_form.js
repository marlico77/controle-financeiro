const http = require('http');
const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments',
    method: 'POST',
    headers: {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6ImFkbWluIiwicGVyc29uSWQiOjEsImlhdCI6MTc4NDgyNjg0M30.UYgjVkPBILzqLpCd8eUv_pVwmw-RVhjaeUiUBTVUjRY'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data));
});

const body = ------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n +
Content-Disposition: form-data; name="person_id"\r\n\r\n +
1\r\n +
------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n +
Content-Disposition: form-data; name="months"\r\n\r\n +
["1","2"]\r\n +
------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n +
Content-Disposition: form-data; name="year"\r\n\r\n +
2024\r\n +
------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n +
Content-Disposition: form-data; name="amount"\r\n\r\n +
200.00\r\n +
------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n;

req.write(body);
req.end();
