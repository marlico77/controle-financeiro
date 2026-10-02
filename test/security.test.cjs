const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { paymentBatch, moneyCents, dateOnly } = require('../lib/validation');
const { authenticate, canAccessPerson, rateLimit } = require('../lib/security');
const { prepareReceipt, registerReceiptRoutes } = require('../lib/receipts');
const root = path.join(__dirname, '..');
function response() {
    return { code:200, headers:{}, status(n){this.code=n;return this;}, sendStatus(n){this.code=n;return this;},
        set(name,value){ if(typeof name==='object')Object.assign(this.headers,name);else this.headers[name]=value;return this; },
        send(value){this.body=value;return this;}, json(value){this.body=value;return this;} };
}
function harness(register, deps) {
    const routes=new Map();
    const app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1))]));
    register(app,deps);
    return async (method,url,req) => {
        const res=response(); let error;
        await routes.get(method+' '+url)(req,res,err=>{error=err;});
        return {res,error};
    };
}
const emptyStorage={storage:{from(){return {upload:async()=>({error:true}),download:async()=>({data:null})};}}};
test('all application JavaScript and inline scripts parse; DOM IDs and assets are unique',()=>{
    const directories=['lib','routes','utils','public/js','scripts'];
    const files=['server.js','database.js','public/sw.js',...directories.flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>/\.(?:js|cjs)$/.test(f)).map(f=>dir+'/'+f))];
    for(const file of files)new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
    for(const file of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
        const html=fs.readFileSync(path.join(root,'public',file),'utf8');
        const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
        assert.equal(new Set(ids).size,ids.length,file+' duplicates IDs');
        for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            const src=/\bsrc="([^"]+)"/.exec(match[1]);
            if(src&&!/^https?:/.test(src[1]))assert.ok(fs.existsSync(path.join(root,'public',src[1].split('?')[0])),file+' script missing');
            if(!src&&match[2].trim())new vm.Script(match[2],{filename:file+':inline'});
        }
    }
});
for(const value of ['-1','0','NaN','Infinity','1.001','abc',' 20','1e3'])test('invalid amount rejected: '+value,()=>assert.throws(()=>moneyCents(value),err=>err.status===400));
test('monthly allocations conserve every cent',()=>{
    const batch=paymentBatch({person_id:1,year:2026,months:'[1,2,3]',amount:'100.00'});
    assert.deepEqual(batch.amounts,['33.34','33.33','33.33']);
    assert.equal(batch.amounts.reduce((sum,value)=>sum+moneyCents(value),0),10000);
});
for(const months of ['[1,1]','[]','[0]','[13]','{}','invalid'])test('invalid months rejected: '+months,()=>assert.throws(()=>paymentBatch({person_id:1,year:2026,months,amount:'20.00'}),err=>err.status===400));
test('invalid civil dates rejected',()=>{assert.throws(()=>dateOnly('2026-02-30'));assert.equal(dateOnly('2026-10-01'),'2026-10-01');});
test('pg returns civil dates without timestamps',()=>{
    require('../database');
    assert.equal(require('pg').types.getTypeParser(1082)('2026-10-01'),'2026-10-01');
});
test('guardian access requires a persisted ID link, never a matching name',async()=>{
    let args;
    const db={query:async(sql,parameters)=>{assert.match(sql,/person_guardians/);assert.doesNotMatch(sql,/name|responsible =/);args=parameters;return {rowCount:0};}};
    assert.equal(await canAccessPerson(db,{role:'responsible',personId:8,username:'Another family'},10),false);
    assert.deepEqual(args,[10,8]);
    assert.equal(await canAccessPerson({query:async()=>({rowCount:1})},{role:'responsible',personId:8},10),true);
});
test('receipt ownership is checked before storage; third party is refused',async()=>{
    let downloaded=false;
    const db={query:async()=>({rows:[{person_id:2,receipt_mime:'application/pdf'}],rowCount:1})};
    const run=harness(registerReceiptRoutes,{db,supabase:{storage:{from(){downloaded=true;throw new Error('must not download');}}},authenticateToken(){}});
    const {error}=await run('get','/api/files/receipt/:filename',{params:{filename:'private.pdf'},user:{role:'member',personId:1}});
    assert.equal(error.status,403);assert.equal(downloaded,false);
});
test('public image route cannot download a receipt filename',async()=>{
    const run=harness(registerReceiptRoutes,{db:{query(){throw new Error('must not query');}},supabase:emptyStorage});
    const {error}=await run('get','/api/public-images/:filename',{params:{filename:'private.pdf'}});
    assert.equal(error.status,404);
});
test('unregistered specialty image is not public',async()=>{
    const run=harness(registerReceiptRoutes,{db:{query:async()=>({rowCount:0})},supabase:emptyStorage});
    const {error}=await run('get','/api/public-images/:filename',{params:{filename:'especialidade-test.webp'}});
    assert.equal(error.status,404);
});
test('database fallback serves sales to staff with attachment and no-store',async()=>{
    const db={query:async()=>({rows:[{person_id:null,source:'sale',receipt_content:Buffer.from('%PDF-1.7'),receipt_mime:'application/pdf'}],rowCount:1})};
    const run=harness(registerReceiptRoutes,{db,supabase:emptyStorage});
    const {res,error}=await run('get','/api/files/receipt/:filename',{params:{filename:'sale.pdf'},user:{role:'secretário'}});
    assert.equal(error,undefined);assert.equal(res.body.toString(),'%PDF-1.7');assert.match(res.headers['Content-Disposition'],/^attachment/);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('active HTML/SVG and invalid image content are rejected',async()=>{
    for(const data of ['<html><script>alert(1)</script></html>','<svg xmlns="http://www.w3.org/2000/svg"></svg>','invalid'])
        await assert.rejects(prepareReceipt({buffer:Buffer.from(data),mimetype:'image/png'},sharp),err=>err.status===400);
});
test('valid images are decoded and converted; client MIME is ignored',async()=>{
    const buffer=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer();
    const image=await prepareReceipt({buffer,mimetype:'text/html'},sharp);
    assert.equal(image.mimetype,'image/webp');assert.equal((await sharp(image.buffer).metadata()).format,'webp');
});
const secret='test-secret-'.repeat(4);
test('password reset revokes old JWT version',async()=>{
    const middleware=authenticate({query:async()=>({rows:[{id:1,session_version:2,role:'member'}]})},secret);
    const req={headers:{authorization:'Bearer '+jwt.sign({id:1,sessionVersion:1},secret)},query:{},method:'GET',path:'/api/people'};
    const res=response();let proceeded=false;await middleware(req,res,()=>proceeded=true);
    assert.equal(res.code,401);assert.equal(proceeded,false);
});
test('current database role overrides stale JWT role',async()=>{
    const middleware=authenticate({query:async()=>({rows:[{id:1,session_version:1,role:'member',person_id:5}]})},secret);
    const req={headers:{authorization:'Bearer '+jwt.sign({id:1,sessionVersion:1,role:'admin'},secret)},query:{},method:'GET',path:'/api/people'};
    let proceeded=false;await middleware(req,response(),()=>proceeded=true);
    assert.equal(proceeded,true);assert.equal(req.user.role,'member');
});
test('mandatory activation is enforced by backend',async()=>{
    const middleware=authenticate({query:async()=>({rows:[{id:1,session_version:1,must_change_password:true}]})},secret);
    const req={headers:{authorization:'Bearer '+jwt.sign({id:1,sessionVersion:1},secret)},query:{},method:'POST',path:'/api/payments'};
    const res=response();await middleware(req,res,()=>assert.fail('blocked activation'));
    assert.equal(res.code,403);assert.equal(res.body.mustChangePassword,true);
});
test('query token cannot authorize arbitrary API mutations',async()=>{
    const middleware=authenticate({query(){throw new Error('must not query');}},secret),res=response();
    await middleware({headers:{},query:{token:jwt.sign({id:1},secret)},method:'POST',path:'/api/people'},res,()=>assert.fail());
    assert.equal(res.code,401);
});
test('rate limiter rejects requests beyond threshold',async()=>{
    const res=response();let next=false;
    await rateLimit({query:async()=>({rows:[{count:11}]})},'login',10,900)({ip:'127.0.0.1',body:{}},res,()=>next=true);
    assert.equal(res.code,429);assert.equal(next,false);assert.equal(res.headers['Retry-After'],'900');
});
test('profile update preserves fields omitted and cannot grant a guardian link',async()=>{
    let params;
    const current={id:1,name:'Test Member',unit:'Direção',phone:'11999999999',responsible:'Current guardian',cpf:null,birth_date:null};
    const client={query:async(sql,args)=>{
        if(sql.startsWith('SELECT * FROM people'))return {rows:[current]};
        if(sql.startsWith('SELECT * FROM users'))return {rows:[]};
        if(sql.startsWith('UPDATE people'))params=args;
        if(sql.includes('person_guardians'))assert.fail('member cannot modify access links');
        return {rows:[],rowCount:1};
    },release(){}};
    const run=harness(require('../routes/securePeople'),{db:{pool:{connect:async()=>client}},logAction:async()=>{},authenticateToken(){}});
    const {error,res}=await run('put','/api/people/:id',{params:{id:'1'},body:{name:'Renamed Member',responsible:'Other family',responsible_id:10},user:{role:'member',personId:1}});
    assert.equal(error,undefined);assert.equal(res.body.success,true);assert.equal(params[1],current.responsible);assert.equal(params[4],current.unit);assert.equal(params[5],current.phone);
});
function paymentDeps(status='pending',failSecond=false) {
    const statements=[],writes=[];let updated=0;
    const client={query:async(sql,args)=>{
        statements.push(sql.trim());
        if(sql.includes('SELECT id, status FROM'))return {rows:[{id:1,status}]};
        if(sql.startsWith('UPDATE payments')){updated++;writes.push(args);if(failSecond&&updated===2)throw new Error('database unavailable');}
        return {rows:[],rowCount:1};
    },release(){statements.push('RELEASE');}};
    return {statements,writes,deps:{db:{pool:{connect:async()=>client},query:async()=>({rows:[]})},sharp,supabase:emptyStorage,upload:{single(){return ()=>{};}},logAction:async()=>{},createNotification:async()=>{}}};
}
test('member cannot overwrite an approved payment',async()=>{
    const {deps,writes,statements}=paymentDeps('approved');
    const run=harness(require('../routes/securePayments'),deps);
    const {error}=await run('post','/api/payments',{body:{person_id:1,year:2026,month:1,amount:'20.00'},file:{buffer:Buffer.from('%PDF-1.7')},user:{role:'member',personId:1}});
    assert.equal(error.status,409);assert.equal(writes.length,0);assert.ok(statements.includes('ROLLBACK'));assert.equal(statements.at(-1),'RELEASE');
});
test('batch failure rolls back and releases the reserved client',async()=>{
    const {deps,statements}=paymentDeps('pending',true);
    const run=harness(require('../routes/securePayments'),deps);
    const {error}=await run('post','/api/payments',{body:{person_id:1,year:2026,months:'[1,2]',amount:'40.00'},user:{role:'admin'}});
    assert.ok(error);assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('ROLLBACK'));assert.ok(!statements.includes('COMMIT'));assert.equal(statements.at(-1),'RELEASE');
});
test('unregistered event participant cannot create payment',async()=>{
    const {deps}=paymentDeps();deps.db.query=async()=>({rows:[]});
    const run=harness(require('../routes/securePayments'),deps);
    const {error}=await run('post','/api/event-payments',{body:{person_id:1,event_id:2,amount:'20.00'},user:{role:'admin'}});
    assert.equal(error.status,400);
});
test('single event does not accept installment dates',async()=>{
    const {deps}=paymentDeps();deps.db.query=async()=>({rows:[{id:2,payment_type:'unico'}]});
    const run=harness(require('../routes/securePayments'),deps);
    const {error}=await run('post','/api/event-payments',{body:{person_id:1,event_id:2,amount:'20.00',month:1,year:2026},user:{role:'admin'}});
    assert.equal(error.status,400);
});
test('report renders malicious member names as text',async()=>{
    const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:'1',style:{},remove(){}});return elements.get(id);}};
    const context={document,state:{currentYear:2026,people:[{id:1,name:'<img src=x onerror="alert(1)">',unit:'<b>Injected</b>'}],payments:[]},console,showStatus(){},window:{location:{origin:'http://localhost'}},localStorage:{getItem(){}},sessionStorage:{getItem(){}}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'public/js/state.js'),'utf8').split('// Gerenciamento de Estado Global')[0],context);
    const reports=fs.readFileSync(path.join(root,'public/js/reports.js'),'utf8');
    vm.runInNewContext(reports.slice(reports.indexOf('async function generateMemberReport()'),reports.indexOf('window.generateMemberReport')),context);
    await context.generateMemberReport();
    assert.ok(elements.get('report-printable').innerHTML.includes('&lt;img'));assert.ok(!elements.get('report-printable').innerHTML.includes('<img src=x'));
});
test('filtered select-all sends selected recipient IDs rather than broadcast',async()=>{
    let sent;const form={reset(){}};const document={getElementById(id){return id==='send-msg-form'?form:{value:'Test'};},querySelectorAll(selector){return selector.includes(':checked')?[{value:'7'},{value:'9'}]:[];}};
    const core=fs.readFileSync(path.join(root,'public/js/core.js'),'utf8');
    vm.runInNewContext(core.slice(core.indexOf('const initMessageForm ='),core.indexOf('// Lógica Global para Fechamento'))+'\ninitMessageForm();',{document,apiFetch:async(url,options)=>{sent=JSON.parse(options.body);},showAlert(){},console});
    await form.onsubmit({preventDefault(){},stopPropagation(){}});
    assert.deepEqual(sent.userIds,[7,9]);
});
test('email templates escape member names, reasons and attribute delimiters',()=>{
    const {getPaymentRejectedEmailHtml}=require('../utils/emailTemplates');
    const html=getPaymentRejectedEmailHtml('<img src=x onerror=alert(1)>','Evento','<b>Test</b>','<script>Test</script>','https://example.com/?a=1&b=2');
    assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('a=1&amp;b=2'));
});
test('scheduled civil time uses official timezone independently of process timezone',()=>{
    const {scheduledInstant,civilParts}=require('../lib/time');
    assert.equal(scheduledInstant('2026-10-01','09:30','America/Sao_Paulo').toISOString(),'2026-10-01T12:30:00.000Z');
    assert.equal(scheduledInstant('2026-10-01','09:30','Asia/Tokyo').toISOString(),'2026-10-01T00:30:00.000Z');
    assert.equal(civilParts(new Date('2026-01-01T01:00:00Z'),'America/Sao_Paulo').year,'2025');
    assert.throws(()=>scheduledInstant('2026-10-01','24:30','America/Sao_Paulo'));
    assert.throws(()=>scheduledInstant('2026-03-08','02:30','America/New_York'));
});
test('PostgreSQL URL sslmode cannot override configured certificate validation',()=>{
    let options;
    const source=fs.readFileSync(path.join(root,'database.js'),'utf8');
    vm.runInNewContext(source,{URL,process:{env:{DATABASE_URL:'postgresql://test:test@remote.invalid/test?sslmode=require'}},console,module:{exports:{}},require(name){
        if(name==='dotenv')return {config(){}};
        if(name==='pg')return {Pool:class{constructor(config){options=config;}},types:{setTypeParser(){}}};
        throw Error(name);
    }});
    assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));
});
