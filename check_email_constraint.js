const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.typaxbrzsshehjyvrdlh:1oUgWQZqFEfIinqE@aws-1-us-west-2.pooler.supabase.com:6543/postgres' });
client.connect().then(() => {
    return client.query(`
        SELECT
            tc.constraint_type
        FROM information_schema.key_column_usage AS kcu
        JOIN information_schema.table_constraints AS tc
          ON kcu.constraint_name = tc.constraint_name
        WHERE kcu.table_name = 'users' AND kcu.column_name = 'email';
    `);
}).then(res => {
    console.log("Constraints na coluna email:", res.rows);
    process.exit(0);
}).catch(console.error);
