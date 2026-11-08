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
        for (const url of ['/api/outflows', '/api/financial-summary?year=2026']) {
            const res=await fetch(base+url,{headers:{Authorization:'Bearer '+token}});assert.equal(res.status,403,url);
        }
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
test('secretary cannot approve or delete payments',async()=>{
    role='secretário';
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const headers={Authorization:'Bearer '+token};
        for(const url of ['/api/payments/1/approve','/api/event-payments/1/approve']){
            const res=await fetch('http://127.0.0.1:'+server.address().port+url,{method:'POST',headers});
            assert.equal(res.status,403,url);
        }
        for(const url of ['/api/payments/1','/api/event-payments/1']){
            const res=await fetch('http://127.0.0.1:'+server.address().port+url,{method:'DELETE',headers});
            assert.equal(res.status,403,url);
        }
    } finally { await new Promise(resolve=>server.close(resolve));role='member'; }
});
test('approval and rejection email the account that submitted the receipt',async()=>{
    role='admin';
    const originalQuery=db.query, originalFetch=global.fetch;
    const emails=[],recipients=[];
    db.query=async(sql,params)=>{
        if(sql.includes('FROM payments p JOIN people'))return {rows:[{person_id:33,submitted_by_user_id:42,month:10,person_name:'Julia'}],rowCount:1};
        if(sql.includes('FROM event_payments ep JOIN events'))return {rows:[{id:113,person_id:33,submitted_by_user_id:42,event_name:'Acampamento',person_name:'Julia'}],rowCount:1};
        if(sql.startsWith('UPDATE payments SET status') || sql.startsWith('UPDATE event_payments SET status'))return {rows:[{id:1}],rowCount:1};
        if(sql==='SELECT id, email FROM users WHERE id = $1'){recipients.push(params[0]);return {rows:[{id:42,email:'uploader@example.com'}],rowCount:1};}
        if(sql.startsWith('INSERT INTO notifications'))return {rows:[],rowCount:1};
        return originalQuery(sql,params);
    };
    process.env.RESEND_API_KEY='test-key';
    global.fetch=async(url,options)=>{
        if(String(url)==='https://api.resend.com/emails'){
            emails.push(JSON.parse(options.body));
            return {ok:true,json:async()=>({id:'test-email'})};
        }
        return originalFetch(url,options);
    };
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const base='http://127.0.0.1:'+server.address().port;
        const approved=await fetch(base+'/api/payments/1/approve',{method:'POST',headers:{Authorization:'Bearer '+token}});
        const rejected=await fetch(base+'/api/event-payments/113/reject',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({reason:'Inválido'})});
        assert.equal(approved.status,200);assert.equal(rejected.status,200);
        await new Promise(resolve=>setImmediate(resolve));
        assert.deepEqual(recipients,[42,42]);
        assert.deepEqual(emails.map(email=>email.to),[['uploader@example.com'],['uploader@example.com']]);
    } finally {
        await new Promise(resolve=>server.close(resolve));
        db.query=originalQuery;global.fetch=originalFetch;role='member';delete process.env.RESEND_API_KEY;
    }
});
test('HTTP event approval requires the payer to remain registered',async()=>{
    role='admin';
    const originalQuery=db.query;
    let approvalSql;
    db.query=async(sql,params)=>{
        if(sql.includes('FROM event_payments ep JOIN events'))return {rows:[{id:108,person_id:1,event_name:'Camp',person_name:'Member'}],rowCount:1};
        if(sql.startsWith('UPDATE event_payments ep')){approvalSql=sql;return {rows:[],rowCount:0};}
        return originalQuery(sql,params);
    };
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/event-payments/108/approve',{method:'POST',headers:{Authorization:'Bearer '+token}});
        assert.equal(res.status,409);
        assert.match((await res.json()).error,/não inscrito/);
        assert.match(approvalSql,/EXISTS \(SELECT 1 FROM event_participants/);
    } finally { await new Promise(resolve=>server.close(resolve));db.query=originalQuery;role='member'; }
});
test('HTTP responsible event payments are restricted to own person ID and annual filter',async()=>{
    role='responsible';
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/event-payments?year=2026',{headers:{Authorization:'Bearer '+token}});
        assert.equal(res.status,200);
        const q=queries.find(q=>q.sql.startsWith('SELECT ep.id')&&q.sql.includes('COALESCE(ep.year'));
        assert.doesNotMatch(q.sql,/person_guardians/);assert.match(q.sql,/ep\.person_id = \$1/);assert.deepEqual(q.params,[1,2026]);
    } finally { await new Promise(resolve=>server.close(resolve));role='member'; }
});
test('HTTP secretary sees only own financial records and cannot read the general summary',async()=>{
    role='secretário';
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const base='http://127.0.0.1:'+server.address().port;
        const headers={Authorization:'Bearer '+token};
        const summary=await fetch(base+'/api/financial-summary?year=2026',{headers});
        assert.equal(summary.status,403);
        const monthly=await fetch(base+'/api/payments?year=2026',{headers});
        assert.equal(monthly.status,200);
        const monthlyQuery=queries.findLast(q=>q.sql.includes('FROM payments WHERE person_id = $1 AND year = $2'));
        assert.deepEqual(monthlyQuery.params,[1,2026]);
        const events=await fetch(base+'/api/event-payments?year=2026',{headers});
        assert.equal(events.status,200);
        const eventQuery=queries.findLast(q=>q.sql.startsWith('SELECT ep.id')&&q.sql.includes('COALESCE(ep.year'));
        assert.doesNotMatch(eventQuery.sql,/person_guardians/);assert.match(eventQuery.sql,/ep\.person_id = \$1/);assert.deepEqual(eventQuery.params,[1,2026]);
    } finally { await new Promise(resolve=>server.close(resolve));role='member'; }
});
test('staff financial summary includes approved receipts regardless of reference year',async()=>{
    role='admin';
    const originalQuery=db.query;
    db.query=async(sql,params)=>sql.includes('WITH ledger AS')
        ? {rows:[
            {source:'dues',unit:'DIREÇÃO',year:2026,month:4,amount:'100.00'},
            {source:'events',unit:'DESBRAVADOR',year:2026,month:5,amount:'250.00'},
            {source:'outflows',unit:null,year:2026,month:4,amount:'-300.00'}
        ],rowCount:3}
        : originalQuery(sql,params);
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
        const token=jwt.sign({id:1,sessionVersion:1},process.env.JWT_SECRET);
        const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/financial-summary?year=2026',{headers:{Authorization:'Bearer '+token}});
        assert.equal(res.status,200);
        const summary=await res.json();
        assert.equal(summary.balanceCents,5000);
        assert.equal(summary.eventsCents,25000);
        assert.equal(summary.outflowsCents,30000);
    } finally { await new Promise(resolve=>server.close(resolve));db.query=originalQuery;role='member'; }
});
