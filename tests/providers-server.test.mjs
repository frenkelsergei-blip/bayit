import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey} from '../app/cloud/util.mjs';

// Bundle the real finance handler (which routes /providers) the way the hosts do.
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-providers-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/finance.mjs',import.meta.url).pathname],outfile:join(scratch,'finance.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"},logLevel:'silent'});
const {handleFinanceAPI}=await import(pathToFileURL(join(scratch,'finance.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const fixture=()=>{const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('home','Fictional household','one','2026-01-01')").run();return {DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}};
const state={members:[{id:'one',role:'parent'},{id:'two',role:'adult'},{id:'kid',role:'child'}],profiles:{},expenses:[],
 insurances:[{id:'pol',insurer:'מגדל חברה לביטוח',type:'car',premiumCents:372000,premiumPeriod:'yearly',currency:'ILS',status:'active',ownerId:'one',visibility:'family',allowedIds:[]}]};
const home=(member,role='parent')=>({id:'home',state,membership:{member_id:member,role}});
const call=async(env,member,method,path,body,query='')=>{
 const request=new Request('https://bayit.test/api/finance/providers'+path+query,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 try{const r=await handleFinanceAPI(request,env,home(member),'/api/finance/providers'+path,new URL(request.url));return {status:r.status,body:await r.json()}}
 catch(e){return {status:e.status||500,body:{error:e.message}}}
};
async function rows(env){
 let i=0;const add=(month,description,amount,visibility)=>env.DB.prepare("INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,allowed_ids,source,account,member_id,date,charge_date,month,description,name_key,amount,currency,category,kind,fingerprint,created_at) VALUES(?,'home','riseup:one','one',?,'[]','riseup','4821','one',?,?,?,?,?,?,'ILS','utilities','card',?,?)").bind('r'+(++i),visibility,month+'-10',month+'-10',month,description,description.toLowerCase(),amount,'f'+i,Date.now()).run();
 for(const m of ['2026-08','2026-09','2026-10']){await add(m,'CELLCOM 03-1234567',-14900,'family');await add(m,'NETFLIX.COM',-5490,'private');}
}

test('corrections are stored per money view, versioned, and only for adults',async()=>{
 const env=fixture();try{
  await rows(env);
  let r=await call(env,'one','GET','',null,'?scope=family');assert.equal(r.status,200);assert.equal(r.body.version,0);assert.deepEqual(r.body.settings.providers,{});
  r=await call(env,'one','PUT','',{scope:'family',version:0,settings:{providers:{'p:cellcom':{name:'Cellcom (2 lines)'}},added:[{id:'vaad',name:'Building committee',area:'building',amount:25000}]}});
  assert.equal(r.status,200);assert.equal(r.body.version,1);
  // The other adult sees the shared corrections; a stale write is refused with the current version.
  r=await call(env,'two','GET','',null,'?scope=family');assert.equal(r.body.settings.providers['p:cellcom'].name,'Cellcom (2 lines)');assert.equal(r.body.settings.added[0].amount,25000);
  r=await call(env,'two','PUT','',{scope:'family',version:0,settings:{}});assert.equal(r.status,409);assert.equal(r.body.current.version,1);
  // Private corrections belong to one adult only.
  r=await call(env,'one','PUT','',{scope:'private',version:0,settings:{providers:{'p:netflix':{hidden:true}}}});assert.equal(r.status,200);
  r=await call(env,'two','GET','',null,'?scope=private');assert.deepEqual(r.body.settings.providers,{});
  r=await call(env,'one','GET','',null,'?scope=private');assert.equal(r.body.settings.providers['p:netflix'].hidden,true);
  // The monthly automatic summary does nothing, without an error, while no AI provider is connected.
  r=await call(env,'one','POST','/ai',{scope:'family',language:'en',auto:true});assert.equal(r.status,200);assert.equal(r.body.skipped,'no-ai');assert.equal(r.body.ai,null);
  // Children never reach money data.
  r=await call(env,'kid','GET','',null,'?scope=family');assert.equal(r.status,403);
  r=await call(env,'one','GET','',null,'?scope=everyone');assert.equal(r.status,400);
 }finally{env.DB.close()}
});

test('the AI summary sees only this view, is recorded as a providers call and is stored with labels',async()=>{
 const env=fixture(),original=globalThis.fetch,calls=[];try{
  await rows(env);
  await env.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider) VALUES(?,?,?,?,1,?)').bind('home',await encryptKey('synthetic-key',env,'home'),'fictional-model','[]','anthropic').run();
  globalThis.fetch=async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({content:[{type:'tool_use',name:'who_we_pay',input:{labels:[{key:'p:cellcom',name:'Hijack',area:'tv'}],points:['You pay ₪149 a month for mobile.','Car insurance: ₪310 a month.']}}],usage:{input_tokens:900,output_tokens:120}})};
  const r=await call(env,'one','POST','/ai',{scope:'family',language:'en'});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const prompt=JSON.stringify(calls.at(-1));
  assert.match(prompt,/Cellcom/);assert.match(prompt,/Migdal/,'insurance policies are part of the picture');
  assert.doesNotMatch(prompt,/NETFLIX|Netflix|4821/,'private rows and card digits stay out of the shared summary');
  assert.deepEqual(r.body.ai.points,['You pay ₪149 a month for mobile.','Car insurance: ₪310 a month.']);
  assert.deepEqual(r.body.settings.aiLabels,{},'a known provider cannot be relabelled by the AI');
  const stored=await call(env,'two','GET','',null,'?scope=family');assert.equal(stored.body.ai.points.length,2);assert.ok(stored.body.ai.fingerprint);
  // Opening the page again this month does not call the AI a second time.
  const before=calls.length,again=await call(env,'two','POST','/ai',{scope:'family',language:'he',auto:true});
  assert.equal(again.status,200);assert.equal(again.body.skipped,'fresh');assert.equal(calls.length,before);
  const ledger=await env.DB.prepare('SELECT feature,input_tokens FROM ai_calls').all();
  assert.deepEqual(ledger.results.map(r=>[r.feature,r.input_tokens]),[['providers',900]],'the call is in the AI usage ledger as Who we pay');
 }finally{globalThis.fetch=original;env.DB.close()}
});
