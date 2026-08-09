const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.typaxbrzsshehjyvrdlh:1oUgWQZqFEfIinqE@aws-1-us-west-2.pooler.supabase.com:6543/postgres' });
client.connect().then(() => {
    return client.query("SELECT username, email FROM users WHERE username = 'marlon.souza'");
}).then(res => {
    console.log(res.rows);
    process.exit(0);
});
