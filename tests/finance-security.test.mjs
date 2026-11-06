import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,localDate} from '../app/cloud/util.mjs';
import {connectRiseup,syncConnection} from '../app/cloud/riseup.mjs';
import {blankState,applyChanges} from '../app/cloud/state.mjs';

// Bundle the actual finance handler, including its dynamic AI import, just as the hosts do.
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-finance-security-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/finance.mjs',import.meta.url).pathname],outfile:join(scratch,'finance.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {applyImport,visibleFinance,financeInsights}=await import(pathToFileURL(join(scratch,'finance.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));
const fixture=()=>{const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);return {DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}};
const home={id:'home',state:{members:[{id:'one',role:'parent'},{id:'two',role:'adult'}],profiles:{one:{},two:{}},expenses:[]}};
test('strict state validation preserves financial notes and receipt/bill references without accepting malformed links',()=>{
 const state=blankState('home','Fictional household',{id:'one',name:'One',role:'parent'});
 state.documents=[{id:'receipt',title:'Fictional receipt',filename:'receipt.txt',ownerId:'one',visibility:'family',allowedIds:[]}];
 state.bills=[{id:'bill',title:'Fictional bill',amount:50,date:localDate(),ownerId:'one',visibility:'family',allowedIds:[]}];
 const expense={id:'entry',title:'Fictional entry',date:localDate(),amount:50,flow:'expense',category:'Groceries',ownerId:'one',memberId:'one',visibility:'family',allowedIds:[],notes:'Source note',documentId:'receipt',receiptDocumentId:'receipt',billId:'bill'};
 const saved=applyChanges(state,[{collection:'expenses',id:expense.id,value:expense}],'one','parent').expenses[0];assert.equal(saved.notes,'Source note');assert.equal(saved.documentId,'receipt');assert.equal(saved.billId,'bill');
 assert.throws(()=>applyChanges(state,[{collection:'expenses',id:expense.id,value:{...expense,documentId:{unexpected:'object'}}}],'one','parent'));
});
async function pending(env,id,{visibility='family',count=1}={}){
 const date=localDate(),rows=Array.from({length:count},(_,i)=>({source:'max',account:'1234',date,description:id+' merchant '+i,amount:-1000,category:'groceries',kind:'card',fingerprint:id+':'+i}));
 const payload={rows,groups:[{issuer:'max',card:'1234',kind:'regular',chargeDate:date,total:count*1000}],accounts:[{account:'1234',holder:'Fictional',suggestedMember:'one'}]};
 await env.DB.prepare("INSERT INTO finance_imports(id,household_id,owner_id,source,kind,status,payload,checks,visibility,created_at) VALUES(?,'home','one','max','card','pending',?,'[]',?,?)").bind(id,JSON.stringify(payload),visibility,Date.now()).run();
}
test('a preferred private RiseUp source does not suppress the shared statement view, or vice versa',async()=>{
 const env=fixture();try{
  await pending(env,'shared');await applyImport(env,home,'one','shared');
  await env.DB.prepare("INSERT INTO finance_connections(household_id,member_id,provider,ciphertext,visibility,prefer_over_statements,created_at) VALUES('home','one','riseup','synthetic','private',1,?)").bind(Date.now()).run();
  await env.DB.prepare("INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,source,date,month,description,name_key,amount,category,kind,fingerprint,created_at) VALUES('rup','home','riseup:one','one','private','riseup',?,?,'Private source','private source',-2000,'groceries','bank','rup',?)").bind(localDate(),localDate().slice(0,7),Date.now()).run();
  let data=await visibleFinance(env,home,'one');assert.ok(data.transactions.some(t=>t.importId==='shared'));assert.ok(data.transactions.some(t=>t.id==='rup'));
  await pending(env,'private');await applyImport(env,home,'one','private',{visibility:'private'});
  await env.DB.batch([env.DB.prepare("UPDATE finance_connections SET visibility='family'"),env.DB.prepare("UPDATE finance_transactions SET visibility='family' WHERE id='rup'")]);
  data=await visibleFinance(env,home,'one');assert.ok(data.transactions.some(t=>t.importId==='private'));assert.ok(!data.transactions.some(t=>t.importId==='shared'));assert.ok(data.transactions.some(t=>t.id==='rup'));
 }finally{env.DB.close()}
});

test('a failure after more than 80 import rows rolls back every row, group, card and marker; retry and undo remain consistent',async()=>{
 const env=fixture();try{
  await pending(env,'large',{count:180});
  env.DB.raw.exec("CREATE TRIGGER refuse_import BEFORE INSERT ON finance_transactions WHEN NEW.description='large merchant 100' BEGIN SELECT RAISE(ABORT,'synthetic middle failure'); END");
  await assert.rejects(applyImport(env,home,'one','large'),/synthetic middle failure/);
  for(const table of ['finance_transactions','finance_groups','finance_cards'])assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n,0);
  assert.equal((await env.DB.prepare("SELECT status FROM finance_imports WHERE id='large'").first()).status,'pending');
  env.DB.raw.exec('DROP TRIGGER refuse_import');await applyImport(env,home,'one','large',{visibility:'private'});
  const own=await visibleFinance(env,home,'one'),other=await visibleFinance(env,home,'two');assert.equal(own.transactions.length,180);assert.equal(own.groups.length,1);assert.equal(other.transactions.length,0);assert.equal(other.cards.length,0);
  assert.equal((await applyImport(env,home,'one','large')).already,true);
  const {undoImport}=await import(pathToFileURL(join(scratch,'finance.mjs')));await undoImport(env,home,'one','large');assert.equal((await visibleFinance(env,home,'one')).transactions.length,0);assert.equal((await visibleFinance(env,home,'one')).groups.length,0);
 }finally{env.DB.close()}
});

test('AI receives only the selected shared/private scope, including manual records and imported merchant totals',async()=>{
 const env=fixture(),original=globalThis.fetch,calls=[];try{
  await pending(env,'shared');await pending(env,'private');await applyImport(env,home,'one','shared');await applyImport(env,home,'one','private',{visibility:'private'});
  await env.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider) VALUES(?,?,?,?,1,?)').bind('home',await encryptKey('synthetic-key',env,'home'),'fictional-model','[]','anthropic').run();
  const state=structuredClone(home);state.state.expenses=[{id:'manual-family',title:'MANUAL SHARED',amount:37,date:localDate(),category:'Insurance',ownerId:'one',visibility:'family'},{id:'manual-private',title:'MANUAL PRIVATE',amount:999,date:localDate(),category:'Insurance',ownerId:'one',visibility:'private'}];
  globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.anthropic.com/v1/messages');calls.push(JSON.parse(init.body));return Response.json({content:[{type:'tool_use',name:'money_insights',input:{headline:'Fictional result',observations:[],tips:[]}}]})};
  await financeInsights(env,state,'one',localDate().slice(0,7),'en','family');let prompt=JSON.stringify(calls.at(-1));assert.match(prompt,/shared merchant/);assert.doesNotMatch(prompt,/private merchant|MANUAL PRIVATE|999/);assert.equal(JSON.parse(calls.at(-1).messages.at(-1).content.slice('Summary JSON: '.length)).months.at(-1).expenses,47);
  await financeInsights(env,state,'one',localDate().slice(0,7),'en','private');prompt=JSON.stringify(calls.at(-1));assert.match(prompt,/private merchant/);assert.doesNotMatch(prompt,/shared merchant|MANUAL SHARED/);assert.equal(JSON.parse(calls.at(-1).messages.at(-1).content.slice('Summary JSON: '.length)).months.at(-1).expenses,1009);
  await assert.rejects(financeInsights(env,state,'one',localDate().slice(0,7),'en','all'),/scope/);
 }finally{globalThis.fetch=original;env.DB.close()}
});

for(const action of ['private','disconnect','reconnect'])test('an in-flight RiseUp sync respects a confirmed '+action+' change',async()=>{
 const env=fixture(),original=globalThis.fetch;try{
  const ciphertext=await encryptKey('riseup_pat_synthetic_race_token',env,'riseup:home:one');
  await env.DB.prepare("INSERT INTO finance_connections(household_id,member_id,provider,ciphertext,visibility,months_back,status,created_at) VALUES('home','one','riseup',?,'family',1,'ok',?)").bind(ciphertext,Date.now()).run();
  const stale=await env.DB.prepare('SELECT * FROM finance_connections').first();let entered,release;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
  globalThis.fetch=async(url)=>{if(String(url).includes('/transactions?')){entered();await barrier;return Response.json({transactions:[{transactionId:'race',transactionDate:localDate(),cashflowDate:localDate().slice(0,7),businessName:'RACE MERCHANT',amount:10,isIncome:false,sourceType:'creditCard'}]})}return Response.json({balances:[]})};
  const inFlight=syncConnection(env,stale,['one','two']);await started;
  if(action==='private')await env.DB.prepare("UPDATE finance_connections SET visibility='private' WHERE member_id='one'").run();
  if(action==='disconnect')await env.DB.prepare("DELETE FROM finance_connections WHERE member_id='one'").run();
  if(action==='reconnect')await env.DB.prepare("UPDATE finance_connections SET ciphertext='new-generation',visibility='private',last_count=77 WHERE member_id='one'").run();
  release();if(action==='private'){await inFlight;const rows=(await env.DB.prepare('SELECT visibility FROM finance_transactions').all()).results;assert.equal(rows.length,1);assert.equal(rows[0].visibility,'private');assert.equal((await visibleFinance(env,home,'two')).transactions.length,0)}else{await assert.rejects(inFlight,/connection changed/i);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM finance_transactions').first()).n,0);if(action==='reconnect')assert.equal((await env.DB.prepare('SELECT last_count FROM finance_connections').first()).last_count,77)}
 }finally{globalThis.fetch=original;env.DB.close()}
});

test('a reconnect being fetched cannot overwrite a later confirmed privacy choice',async()=>{
 const env=fixture(),original=globalThis.fetch;try{
  const ciphertext=await encryptKey('riseup_pat_synthetic_old_token',env,'riseup:home:one');await env.DB.prepare("INSERT INTO finance_connections(household_id,member_id,provider,ciphertext,visibility,months_back,status,created_at) VALUES('home','one','riseup',?,'family',1,'ok',?)").bind(ciphertext,Date.now()).run();
  let entered,release;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);globalThis.fetch=async(url)=>{if(String(url).includes('/transactions?')){entered();await barrier;return Response.json({transactions:[{transactionId:'new',transactionDate:localDate(),cashflowDate:localDate().slice(0,7),businessName:'NEW CONNECTION',amount:10,isIncome:false}]})}return Response.json({balances:[]})};
  const pending=connectRiseup(env,{home,memberId:'one',adults:['one','two'],token:'riseup_pat_synthetic_new_token',visibility:'shared',months:1});await started;await env.DB.prepare("UPDATE finance_connections SET visibility='private' WHERE member_id='one'").run();release();await assert.rejects(pending,/settings changed/);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM finance_transactions').first()).n,0);assert.equal((await env.DB.prepare('SELECT ciphertext,visibility FROM finance_connections').first()).ciphertext,ciphertext);
 }finally{globalThis.fetch=original;env.DB.close()}
});
