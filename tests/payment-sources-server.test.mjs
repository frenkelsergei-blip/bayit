import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {localDate} from '../app/cloud/util.mjs';
import {syncRiseup} from '../app/cloud/riseup.mjs';
import {paymentSources} from '../shared/payment-sources.mjs';

// Bundle the actual finance handler (with its dynamic imports), as the hosts do. Fictional data only.
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-payment-sources-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/finance.mjs',import.meta.url).pathname],outfile:join(scratch,'finance.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {applyImport,visibleFinance,handleFinanceAPI}=await import(pathToFileURL(join(scratch,'finance.mjs')));
const {updateSource}=await import('../app/cloud/payment-sources.mjs');
// The same migrations without 0018, for an installation that has not updated its database yet.
const older=join(scratch,'migrations-0017');await cp(new URL('../app/cloud/migrations',import.meta.url).pathname,older,{recursive:true,filter:f=>!f.endsWith('0018_payment_sources.sql')});
after(()=>rm(scratch,{recursive:true,force:true}));
const fixture=(dir=new URL('../app/cloud/migrations',import.meta.url).pathname)=>{const DB=openD1(':memory:');migrate(DB,dir);return {DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}};
const home={id:'home',state:{members:[{id:'dan',role:'parent'},{id:'hila',role:'parent'},{id:'kid',role:'child'}],profiles:{dan:{},hila:{},kid:{}},expenses:[]}};
async function pending(env,id,{kind='card',source='max',account='',owner='dan'}={}){
 const date=localDate(),rows=[0,1].map(i=>({source,account,date,description:id+' merchant '+i,amount:-1000,category:'groceries',kind,fingerprint:id+':'+i}));
 const payload={rows,groups:[],accounts:[{account,holder:'',suggestedMember:owner}]};
 await env.DB.prepare("INSERT INTO finance_imports(id,household_id,owner_id,source,kind,status,payload,checks,visibility,created_at) VALUES(?,'home',?,?,?,'pending',?,'[]','family',?)").bind(id,owner,source,kind,JSON.stringify(payload),Date.now()).run();
}
const riseupRow=(env,{id,member='dan',visibility='family',account='a1b2c3',issuer='max',label=null,kind='card'})=>env.DB.prepare("INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,source,account,member_id,date,month,description,name_key,amount,category,kind,card_issuer,account_label,fingerprint,created_at) VALUES(?,'home',?,?,?,'riseup',?,?,?,?,'Fictional shop','fictional shop',-2500,'groceries',?,?,?,?,?)").bind(id,'riseup:'+member,member,visibility,account,member,localDate(),localDate().slice(0,7),kind,issuer,label,id,Date.now()).run();

test('"Which card is this?" fills a missing statement ending and saves the owner as the card’s choice',async()=>{
 const env=fixture();
 await pending(env,'noend');await applyImport(env,home,'dan','noend',{cardMembers:{'':'hila'},sources:{'':{last4:'4821'}}});
 const rows=(await env.DB.prepare("SELECT account,member_id FROM finance_transactions WHERE import_id='noend'").all()).results;
 assert.deepEqual(rows.map(r=>[r.account,r.member_id]),[['4821','hila'],['4821','hila']]);
 const saved=(await env.DB.prepare('SELECT * FROM finance_sources').all()).results;assert.deepEqual(saved.map(s=>[s.source_key,s.owner_id]),[['max:4821','hila']]);
 const data=await visibleFinance(env,home,'dan');assert.deepEqual(data.sources,[{key:'max:4821',last4:null,ownerId:'hila',shared:null,label:null}]);
 // Without a typed ending the rows keep '' and nothing is saved for them.
 await pending(env,'blank');await applyImport(env,home,'dan','blank',{sources:{'':{last4:'12'}}});
 assert.ok((await env.DB.prepare("SELECT account FROM finance_transactions WHERE import_id='blank'").all()).results.every(r=>r.account===''));
 // A bank statement is shared unless someone is chosen.
 await pending(env,'bank',{kind:'bank',source:'leumi',account:'0457'});await applyImport(env,home,'dan','bank',{sources:{'0457':{ownerId:'kid'}}});
 assert.equal((await env.DB.prepare("SELECT * FROM finance_sources WHERE source_key='leumi:0457'").first()),null,'a child cannot own an account; no choice is saved');
 await pending(env,'bank2',{kind:'bank',source:'leumi',account:'0458'});await applyImport(env,home,'dan','bank2',{sources:{'0458':{shared:true}}});
 assert.equal((await env.DB.prepare("SELECT shared FROM finance_sources WHERE source_key='leumi:0458'").first()).shared,1);
});

test('choices are returned only for sources the viewer has rows from, and only adults in the home can own them',async()=>{
 const env=fixture();
 await riseupRow(env,{id:'shared1',account:'s1'});await riseupRow(env,{id:'private1',member:'hila',visibility:'private',account:'p1',label:'הכרטיס של הילה'});
 const dan=await visibleFinance(env,home,'dan'),hila=await visibleFinance(env,home,'hila');
 assert.deepEqual(dan.transactions.map(t=>t.id),['shared1']);
 assert.equal(hila.transactions.find(t=>t.id==='private1').accountLabel,'הכרטיס של הילה');
 await updateSource(env,home,'hila',{key:'riseup:p1',ownerId:'hila',last4:'7310'},(await visibleFinance(env,home,'hila')).transactions);
 await assert.rejects(()=>updateSource(env,home,'dan',{key:'riseup:p1',ownerId:'dan'},dan.transactions),/unavailable/,'Dan cannot see or set Hila’s private card');
 assert.deepEqual((await visibleFinance(env,home,'dan')).sources,[],'Hila’s private card choices stay private');
 assert.deepEqual((await visibleFinance(env,home,'hila')).sources.map(s=>[s.key,s.ownerId,s.last4]),[['riseup:p1','hila','7310']]);
 await assert.rejects(()=>updateSource(env,home,'dan',{key:'riseup:s1',ownerId:'kid'},dan.transactions),/adult/);
 await assert.rejects(()=>updateSource(env,home,'dan',{key:'riseup:s1',last4:'12a4'},dan.transactions),/four digits/);
 await assert.rejects(()=>updateSource(env,home,'dan',{key:'manual:dan'},dan.transactions),/not a card/);
 await updateSource(env,home,'dan',{key:'riseup:s1',shared:true,ownerId:'dan'},dan.transactions);
 const s=(await visibleFinance(env,home,'dan')).sources[0];assert.equal(s.shared,true);assert.equal(s.ownerId,null,'a shared source has no single owner');
 // The merged view: the RiseUp card with a typed ending joins its statement card.
 await pending(env,'stmt',{account:'7310',owner:'hila'});await applyImport(env,home,'hila','stmt');
 const view=await visibleFinance(env,home,'hila'),idx=paymentSources(view.transactions,view.sources);
 assert.deepEqual(idx.byKey.get('max:7310').keys.sort(),['max:7310','riseup:p1']);
});

test('the sources endpoint is a PUT for adults, through the real handler',async()=>{
 const env=fixture();await riseupRow(env,{id:'r1',account:'s1'});
 const call=(member,body)=>handleFinanceAPI(new Request('https://bayit.invalid/api/finance/sources',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env,{...home,membership:{member_id:member}},'/api/finance/sources',new URL('https://bayit.invalid/api/finance/sources'));
 const ok=await call('hila',{key:'riseup:s1',ownerId:'hila'});assert.equal(ok.status,200);
 await assert.rejects(()=>call('kid',{key:'riseup:s1',ownerId:'hila'}),/adult/i);
});

test('before migration 0018 everything still works: no labels, no saved choices, a clear message when editing',async()=>{
 const env=fixture(older);
 await pending(env,'old');await applyImport(env,home,'dan','old',{sources:{'':{last4:'4821'}}});
 assert.ok((await env.DB.prepare("SELECT account FROM finance_transactions WHERE import_id='old'").all()).results.every(r=>r.account==='4821'));
 const realFetch=globalThis.fetch;
 globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.includes('transactions'))return Response.json({transactions:[{transactionId:'t1',transactionDate:'2026-11-02T00:00:00.000Z',cashflowDate:'2026-11',businessName:'Fictional',isIncome:false,amount:10,accountNickname:'הכרטיס של הילה',accountNumberHash:'hh',sourceType:'creditCard',source:'max'}]});return Response.json({balances:[]})};
 try{await syncRiseup(env,{householdId:'home',memberId:'dan',token:'riseup_pat_fictional_token_123',visibility:'family',allowedIds:[],months:1,adults:['dan','hila']},new Date('2026-11-20T10:00:00Z'))}finally{globalThis.fetch=realFetch}
 const row=(await env.DB.prepare("SELECT card_issuer FROM finance_transactions WHERE source='riseup'").first());assert.equal(row.card_issuer,'הכרטיס של הילה','the old behaviour: the nickname is kept');
 const data=await visibleFinance(env,home,'dan');assert.deepEqual(data.sources,[]);assert.ok(data.transactions.length>=3);
 await assert.rejects(()=>updateSource(env,home,'dan',{key:'riseup:hh',ownerId:'hila'},data.transactions),/database update/);
});

test('round 2: when RiseUp sets the statement aside, the server still matches the RiseUp card to it (ending + owner)',async()=>{
 const env=fixture(),home2={id:'home',state:{members:[{id:'sergei',name:'Sergei',he:'סרגיי',role:'parent'},{id:'shani',name:'Shani',he:'שני',role:'parent'}],profiles:{sergei:{},shani:{}},expenses:[]}};
 const date=localDate(),month=date.slice(0,7);
 // Shani's Max statement (she answered "Whose card?") with two purchases …
 const payload={rows:[0,1].map(i=>({source:'max',account:'4821',date,description:'Fictional shop '+i,amount:-(1000+i),category:'groceries',kind:'card',fingerprint:'st:'+i})),groups:[],accounts:[{account:'4821',holder:'',suggestedMember:'shani'}]};
 await env.DB.prepare("INSERT INTO finance_imports(id,household_id,owner_id,source,kind,status,payload,checks,visibility,created_at) VALUES('st','home','sergei','max','card','pending',?,'[]','family',?)").bind(JSON.stringify(payload),Date.now()).run();
 await applyImport(env,home2,'sergei','st',{cardMembers:{'4821':'shani'}});
 // … and the same purchases synced by Sergei's RiseUp connection, which prefers itself over statements.
 await env.DB.prepare("INSERT INTO finance_connections(household_id,member_id,provider,ciphertext,visibility,prefer_over_statements,created_at) VALUES('home','sergei','riseup','synthetic','family',1,?)").bind(Date.now()).run();
 for(const i of [0,1])await env.DB.prepare("INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,source,account,member_id,date,month,description,name_key,amount,category,kind,card_issuer,fingerprint,created_at) VALUES(?,'home','riseup:sergei','sergei','family','riseup','h1','sergei',?,?,?,?,?,'groceries','card','max',?,?)").bind('r'+i,date,month,'FICTIONAL SHOP '+i,'fictional shop',-(1000+i),'r'+i,Date.now()).run();
 const data=await visibleFinance(env,home2,'sergei');
 assert.ok(!data.transactions.some(t=>t.source==='max'),'the statement rows are set aside for the RiseUp month');
 assert.deepEqual(data.inferred,[{key:'riseup:h1',last4:'4821',ownerId:'shani',reason:'statement',matches:2}]);
 const idx=paymentSources(data.transactions,data.sources,{inferred:data.inferred});
 assert.equal(idx.byKey.get('max:4821').ownerId,'shani');assert.equal(idx.byKey.get('max:4821').inferred.last4,'statement');
});
