const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 1, role: 'admin', personId: 1 }, 'dev-secret-only');
console.log(token);
