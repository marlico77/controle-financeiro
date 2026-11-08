'use strict';
require('dotenv').config();
if (process.env.APP_ENV !== 'test') throw new Error('server-test.js exige APP_ENV=test; inicialização recusada.');
require('./server');
