import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,localDate} from '../app/cloud/util.mjs';

// Bundle the real בית AI handler the way the hosts do.
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-ai-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/bayit-ai.mjs',import.meta.url).pathname],outfile:join(scratch,'bayit-ai.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"},logLevel:'silent'});
const {handleBayitAI,runHousehold,bayitAIDeliveryMessages}=await import(pathToFileURL(join(scratch,'bayit-ai.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const fixture=()=>{const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('home','Fictional household','one','2026-01-01')").run();return {DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}};
const shift=(m,d)=>{const [y,mo]=m.split('-').map(Number),x=new Date(Date.UTC(y,mo-1+d,1));return x.toISOString().slice(0,7)};
const thisMonth=localDate().slice(0,7),months=Array.from({length:9},(_,i)=>shift(thisMonth,i-8));
const newState=()=>({members:[{id:'one',role:'parent'},{id:'two',role:'adult'},{id:'kid',role:'child'}],profiles:{one:{locale:'he'},two:{locale:'en'},kid:{}},expenses:[],tasks:[],preferences:{features:{ai:true,expenses:true,tasks:true}}});
let state=newState();
const home=member=>({id:'home',state,membership:{member_id:member,role:state.members.find(m=>m.id===member).role}});
const call=async(env,member,method,path='',body)=>{
 const request=new Request('https://bayit.test/api/bayit-ai'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 try{const r=await handleBayitAI(request,env,home(member),'/api/bayit-ai'+path);return {status:r.status,body:await r.json()}}
 catch(e){return {status:e.status||500,body:{error:e.message}}}
};
async function rows(env){
 let i=0;const add=(month,day,description,shekels,{visibility='family',owner='one',category='utilities',account='4821'}={})=>env.DB.prepare("INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,allowed_ids,source,account,member_id,date,charge_date,month,description,name_key,amount,currency,category,kind,fingerprint,created_at) VALUES(?,'home','riseup:one',?,?,'[]','riseup',?,?,?,?,?,?,?,?,'ILS',?,'card',?,?)").bind('r'+String(++i).padStart(3,'0'),owner,visibility,account,owner,month+'-'+String(day).padStart(2,'0'),month+'-'+String(day).padStart(2,'0'),month,description,description.toLowerCase(),-Math.round(shekels*100),category,'f'+i,Date.now()).run();
 for(const [i,m]of months.entries()){await add(m,10,'CELLCOM 052-5550101',i===8?129:89);await add(m,15,'NETFLIX.COM',54.9,{category:'subscriptions'});await add(m,4,'חברת החשמל לישראל',[389,402,395,398,410,388,391,396,455][i],{account:'0457'})}
 for(const m of months.slice(-3))await add(m,3,'DISNEY PLUS',39.9,{category:'subscriptions'});
 const day=Math.max(1,Number(localDate().slice(8,10))-1);
 await add(thisMonth,day,'WOLT',142,{category:'dining'});await add(thisMonth,day,'WOLT',142,{category:'dining'});
 // "Just me" rows of the parent: a long-running private gym and a new private app subscription.
 for(const m of months)await add(m,5,'GYM PLUS',150,{visibility:'private',category:'leisure',account:'7310'});
 for(const m of months.slice(-2))await add(m,6,'CALM.COM',45,{visibility:'private',category:'subscriptions',account:'7310'});
}

test('off by default; a parent turns it on; the on-open check finds the money things for adults only',async()=>{
 const env=fixture();state=newState();try{
  await rows(env);
  let r=await call(env,'one','GET');assert.equal(r.status,200);assert.equal(r.body.settings.enabled,false);assert.deepEqual(r.body.findings,[]);
  r=await call(env,'two','PUT','/settings',{enabled:true});assert.equal(r.status,403,'only a parent turns it on');
  r=await call(env,'kid','GET');assert.equal(r.body.adult,false);assert.deepEqual(r.body.findings,[]);
  r=await call(env,'kid','PUT','/settings',{enabled:true});assert.equal(r.status,403);
  r=await call(env,'one','PUT','/settings',{enabled:true,frequency:'daily'});assert.equal(r.status,200);
  r=await call(env,'two','GET');assert.equal(r.status,200);
  const kinds=r.body.findings.map(f=>f.kind).sort();assert.deepEqual(kinds,['dup','jump','new'],JSON.stringify(r.body.findings.map(f=>[f.kind,f.providerKey])));
  const jump=r.body.findings.find(f=>f.kind==='jump');assert.equal(jump.finding.providerKey,'p:cellcom');assert.equal(jump.status,'open');assert.equal(jump.scopeKey,'family');
  // A RiseUp card nobody has assigned yet (payment sources, 2026-11-10) is for every adult to check.
  assert.deepEqual(jump.assignees,['one','two'],'an unassigned card: both adults check');
  // Once the family says whose card it is (Cards & accounts), the card holder checks — for new findings and open ones.
  await env.DB.prepare("INSERT INTO finance_sources(household_id,source_key,owner_id,updated_by,updated_at) VALUES('home','riseup:4821','one','one',?)").bind(Date.now()).run();
  await runHousehold(env,{id:'home',state},{now:Date.now()+500});
  r=await call(env,'two','GET');assert.deepEqual(r.body.findings.find(f=>f.kind==='jump').assignees,['one'],'the card holder checks');
  // The parent also sees their own private finding; the other adult never does.
  r=await call(env,'one','GET');const mine=r.body.findings.filter(f=>f.scopeKey==='private:one');assert.equal(mine.length,1);assert.equal(mine[0].kind,'new');
  r=await call(env,'two','GET');assert.ok(!r.body.findings.some(f=>f.scopeKey.startsWith('private:')));
  r=await call(env,'kid','GET');assert.deepEqual(r.body.findings,[]);
  // Running again creates nothing new: a finding is never opened twice.
  const again=await runHousehold(env,{id:'home',state},{now:Date.now()+1000});assert.equal(again.created,0);
 }finally{env.DB.close()}
});

test('answers: OK, Needs action with a task, Not relevant with learning, and undo',async()=>{
 const env=fixture();state=newState();try{
  await rows(env);await call(env,'one','PUT','/settings',{enabled:true});
  let r=await call(env,'two','GET');const by=k=>r.body.findings.find(f=>f.kind===k);const jump=by('jump'),dup=by('dup'),fresh=by('new');
  let a=await call(env,'two','POST','/answer',{id:jump.id,scopeKey:'family',outcome:'ok'});assert.equal(a.status,200);assert.equal(a.body.finding.status,'ok');assert.equal(a.body.finding.answeredBy,'two');
  a=await call(env,'one','POST','/answer',{id:jump.id,scopeKey:'family',outcome:'dismissed'});assert.equal(a.status,409,'already answered');
  a=await call(env,'kid','POST','/answer',{id:jump.id,scopeKey:'family',outcome:'ok'});assert.equal(a.status,403);
  a=await call(env,'two','POST','/answer',{id:jump.id,scopeKey:'private:one',outcome:'ok'});assert.equal(a.status,404,'another scope is not reachable');
  // Needs action links a task the person can see; an unknown task is refused.
  a=await call(env,'two','POST','/answer',{id:fresh.id,scopeKey:'family',outcome:'action',taskId:'nope'});assert.equal(a.status,409);
  state.tasks.push({id:'t1',title:'Cancel Disney+',ownerId:'two',visibility:'family',allowedIds:[],memberIds:['one']});
  a=await call(env,'two','POST','/answer',{id:fresh.id,scopeKey:'family',outcome:'action',taskId:'t1'});assert.equal(a.status,200);assert.equal(a.body.finding.taskId,'t1');
  // Not relevant + "don't suggest again": stored, listed for undo, and the next run skips it.
  a=await call(env,'one','POST','/answer',{id:dup.id,scopeKey:'family',outcome:'dismissed',suppress:true});assert.equal(a.status,200);
  r=await call(env,'two','GET');assert.equal(r.body.suppressions.length,1);assert.equal(r.body.suppressions[0].ruleKey,'dup:'+dup.providerKey);
  // Undo: only the person who answered, or a parent.
  a=await call(env,'two','POST','/undo',{id:dup.id,scopeKey:'family'});assert.equal(a.status,403);
  a=await call(env,'one','POST','/undo',{id:dup.id,scopeKey:'family'});assert.equal(a.body.finding.status,'open');
  r=await call(env,'two','GET');assert.equal(r.body.suppressions.length,0,'undoing "Not relevant" also forgets the rule');
  a=await call(env,'one','POST','/answer',{id:dup.id,scopeKey:'family',outcome:'dismissed',suppress:true});
  a=await call(env,'two','DELETE','/suppressions',{scopeKey:'family',ruleKey:'dup:'+dup.providerKey});assert.equal(a.status,200);
  a=await call(env,'two','DELETE','/suppressions',{scopeKey:'private:one',ruleKey:'x'});assert.equal(a.status,403);
  a=await call(env,'two','POST','/answer',{id:jump.id,scopeKey:'family',outcome:'later'});assert.equal(a.status,400);
 }finally{env.DB.close()}
});

test('feature switches: Ask AI or Expenses off hides the findings; nothing is deleted',async()=>{
 const env=fixture();state=newState();try{
  await rows(env);await call(env,'one','PUT','/settings',{enabled:true});
  let r=await call(env,'two','GET');assert.equal(r.body.findings.length,3);
  state.preferences.features={...state.preferences.features,ai:false};
  r=await call(env,'two','GET');assert.deepEqual(r.body.findings,[]);assert.equal(r.body.features.ai,false);
  state.preferences.features={...state.preferences.features,ai:true,expenses:false};
  r=await call(env,'two','GET');assert.deepEqual(r.body.findings,[]);
  state.preferences.features={...state.preferences.features,expenses:true};
  r=await call(env,'two','GET');assert.equal(r.body.findings.length,3,'turning it back on restores them');
 }finally{env.DB.close()}
});

test('digest: only for adults who chose a channel, at their time, never in quiet hours',async()=>{
 const env=fixture();state=newState();try{
  await rows(env);await call(env,'one','PUT','/settings',{enabled:true});await call(env,'two','GET');
  const date=localDate();
  assert.deepEqual(await bayitAIDeliveryMessages(env,{id:'home',state},'two',{date,time:'09:05',channel:'push'}),[],'nobody opted in yet');
  let r=await call(env,'two','PUT','/prefs',{digest:'daily',time:'09:00',push:true});assert.equal(r.body.prefs.push,true);
  const homeObj={id:'home',state};
  assert.deepEqual(await bayitAIDeliveryMessages(env,homeObj,'two',{date,time:'08:55',channel:'push'}),[]);
  const sent=await bayitAIDeliveryMessages(env,homeObj,'two',{date,time:'09:05',channel:'push'});
  assert.equal(sent.length,1);assert.equal(sent[0].key,'bai-digest:d:'+date);assert.match(sent[0].title,/Bayit AI suggests checking 3 things/);assert.match(sent[0].body,/Cellcom went up to ₪129/);
  assert.deepEqual(await bayitAIDeliveryMessages(env,homeObj,'two',{date,time:'09:05',channel:'telegram'}),[],'Telegram not chosen');
  assert.deepEqual(await bayitAIDeliveryMessages(env,homeObj,'two',{date,time:'21:00',channel:'push'}),[],'quiet hours (20:30–07:00 by default)');
  assert.deepEqual(await bayitAIDeliveryMessages(env,homeObj,'kid',{date,time:'09:05',channel:'push'}),[]);
  // The parent's private finding never reaches the other adult's digest.
  await call(env,'one','PUT','/prefs',{digest:'daily',time:'09:00',telegram:true});
  const parent=await bayitAIDeliveryMessages(env,homeObj,'one',{date,time:'09:05',channel:'telegram'});assert.match(parent[0].title,/4 דברים/);
 }finally{env.DB.close()}
});

test('the AI words new findings once per run, sees no cards, people or statement lines, and is recorded as recommendations',async()=>{
 const env=fixture(),original=globalThis.fetch,calls=[];state=newState();try{
  await rows(env);
  await env.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider) VALUES(?,?,?,?,1,?)').bind('home',await encryptKey('synthetic-key',env,'home'),'fictional-model','[]','anthropic').run();
  globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);const ids=JSON.parse(String(body.messages?.at(-1)?.content?.[0]?.text||body.messages?.at(-1)?.content||'').replace(/^Findings JSON: /,'')).map(f=>f.id);
   return Response.json({content:[{type:'tool_use',name:'bayit_ai_lines',input:{findings:ids.map(id=>({id,he:'שורה מה־AI',en:'A line from the AI'}))}}],usage:{input_tokens:500,output_tokens:80},stop_reason:'tool_use'})};
  await call(env,'one','PUT','/settings',{enabled:true});
  const r=await call(env,'two','GET');
  assert.equal(calls.length,1,'one AI call for the run');
  const prompt=JSON.stringify(calls[0]);assert.ok(!/4821|0457|7310|"one"|"two"|riseup|WOLT|CELLCOM 052/.test(prompt),prompt.slice(0,400));
  assert.ok(r.body.findings.every(f=>f.aiText?.en==='A line from the AI'));
  const usage=await env.DB.prepare("SELECT feature,COUNT(*) n FROM ai_calls WHERE household_id='home' GROUP BY feature").all();
  assert.deepEqual(usage.results.map(x=>[x.feature,x.n]),[['recommendations',1]]);
  await runHousehold(env,{id:'home',state},{now:Date.now()+2000});assert.equal(calls.length,1,'no new findings, no AI call');
 }finally{globalThis.fetch=original;env.DB.close()}
});

test('the server tolerates the tables being missing',async()=>{
 const DB=openD1(':memory:');try{
  const env={DB};state=newState();
  const r=await call(env,'one','GET');assert.equal(r.status,200);assert.equal(r.body.available,false);
  const p=await call(env,'one','PUT','/settings',{enabled:true});assert.equal(p.status,503);
 }finally{DB.close()}
});
