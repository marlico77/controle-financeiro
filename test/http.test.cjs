const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
// Importing the app never starts migrations, timers, workers or external requests.
process.env.JWT_SECRET='isolated-http-test-secret-'.repeat(3);
process.env.APP_URL='http://localhost:3000';
process.env.SUPABASE_URL='https://test.invalid';
process.env.SUPABASE_KEY='isolated-test-key';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
process.env.WHATSAPP_WORKER_ENABLED='false';
process.env.VAPID_PUBLIC_KEY='';
process.env.VAPID_PRIVATE_KEY='';
const db = require('../database');
let role='member';
const queries=[];
const query=async (sql,params) => {
    queries.push({sql,params});
    if(sql.includes('session_version'))return {rows:[{id:1,username:'member',role,person_id:1,session_version:1,must_change_password:false,is_master:false}],rowCount:1};
    if(sql.includes('FROM payments p JOIN people'))return {rows:[{person_id:1,month:1,person_name:'Test'}],rowCount:1};
    return {rows:[],rowCount:0};
};
db.query=query;db.pool.query=query;
const {app}=require('../server');
test('HTTP access controls and static pages are wired correctly',async()=>{
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
    try {
        for(const url of ['/api/plannings','/api/people','/api/files/receipt/test.pdf']) {
            const res=await fetch(base+url);assert.equal(res.status,401,url);assert.ok((await res.json()).error);
        }
        const image=await fetch(base+'/api/public-images/private.pdf');assert.equal(image.status,404);
        const write=await fetch(base+'/api/plannings',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'Test',start_date:'2026-10-01',end_date:'2026-10-02'})});
        assert.equal(write.status,403);assert.ok((await write.json()).error);
        const outflows=await fetch(base+'/api/outflows',{headers:{Authorization:'Bearer '+token}});assert.equal(outflows.status,403);
        for(const url of ['/reports.html','/login.html','/js/state.js?v=mpa','/sw.js']) {
            const res=await fetch(base+url);assert.equal(res.status,200,url);assert.ok((await res.text()).length>0);
        }
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('HTTP payment approval returns conflict when another reviewer already processed it',async()=>{
    role='admin';
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/payments/1/approve',{method:'POST',headers:{Authorization:'Bearer '+token}});
        assert.equal(res.status,409);
        assert.ok(queries.find(q=>q.sql.startsWith('UPDATE payments')&&q.sql.includes("status = 'pending'")));
    } finally { await new Promise(resolve=>server.close(resolve));role='member'; }
});
test('HTTP family payment query uses immutable guardian IDs and includes single events in annual filter',async()=>{
    role='responsible';
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/event-payments?year=2026',{headers:{Authorization:'Bearer '+token}});
        assert.equal(res.status,200);
        const q=queries.find(q=>q.sql.startsWith('SELECT ep.id')&&q.sql.includes('COALESCE(ep.year'));
        assert.ok(q.sql.includes('person_guardians'));assert.deepEqual(q.params,[1,2026]);
    } finally { await new Promise(resolve=>server.close(resolve));role='member'; }
});
