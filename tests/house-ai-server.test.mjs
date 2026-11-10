import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';

// Bundle the real handlers (בית AI history and voice) the way the hosts do.
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'house-ai-'));
for(const f of ['ai-history','voice'])await require('esbuild').build({entryPoints:[new URL('../app/cloud/'+f+'.mjs',import.meta.url).pathname],outfile:join(scratch,f+'.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"},logLevel:'silent'});
const {handleAIHistory,saveTurn}=await import(pathToFileURL(join(scratch,'ai-history.mjs'))),{handleVoice}=await import(pathToFileURL(join(scratch,'voice.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const fixture=(extra={})=>{const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('home','Fictional household','one','2026-01-01')").run();return {DB,...extra}};
let state;const fresh=()=>{state={members:[{id:'one',role:'parent'},{id:'two',role:'adult'},{id:'kid',role:'child'}],profiles:{one:{locale:'he'}},preferences:{features:{ai:true,tasks:true}}}};
const home=m=>({id:'home',state,membership:{member_id:m,role:state.members.find(x=>x.id===m).role}});
const call=async(fn,env,m,method,path,{body,headers={}}={})=>{const r=new Request('https://bayit.test'+path,{method,headers,body});try{const res=await fn(r,env,home(m),new URL(r.url).pathname);return {status:res.status,body:await res.json()}}catch(e){return {status:e.status||500,body:{error:e.message}}}};
const result=(answer,extra={})=>({answer,sources:[{id:'t1',type:'task',title:'Cellcom',date:'2026-11-10'}],...extra});

test('history: each question is kept for the asker only, paged newest first, searchable, reopened and deleted',async()=>{
 fresh();const env=fixture();try{
  const a='aaaaaaaa-0000-4000-8000-000000000001',b='bbbbbbbb-0000-4000-8000-000000000002';
  assert.equal(await saveTurn(env,home('one'),'one',{conversationId:a,question:'מה קורה היום?',result:result('**היום**\n- 18:00 · **להגיש פיזיותרפיה** · הילה'),scope:'family'}),1);
  assert.equal(await saveTurn(env,home('one'),'one',{conversationId:a,question:'ומה מחר?',result:result('Tomorrow: dentist at 16:00',{plan:{id:'p1',actions:[{kind:'task.create',title:'Call Cellcom'}]}}),scope:'family',voice:7}),2);
  assert.equal(await saveTurn(env,home('one'),'one',{conversationId:b,question:'Private: my gym',result:result('Gym on Sunday'),scope:'private'}),1);
  // Someone else cannot append to my conversation, and never sees it.
  assert.equal(await saveTurn(env,home('two'),'two',{conversationId:a,question:'hijack',result:result('x')}),null);
  assert.equal(await saveTurn(env,home('one'),'one',{conversationId:'bad id',question:'x',result:result('x')}),null);
  let r=await call(handleAIHistory,env,'one','GET','/api/ai-history');assert.equal(r.status,200);assert.deepEqual(r.body.conversations.map(c=>c.id),[b,a]);assert.equal(r.body.conversations[1].turns,2);assert.equal(r.body.conversations[1].title,'מה קורה היום?');
  r=await call(handleAIHistory,env,'two','GET','/api/ai-history');assert.deepEqual(r.body.conversations,[]);
  r=await call(handleAIHistory,env,'two','GET','/api/ai-history/'+a);assert.equal(r.status,404);
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history?q=dentist');assert.deepEqual(r.body.conversations.map(c=>c.id),[a]);assert.match(r.body.conversations[0].snippet,/dentist/);
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history?q=פיזיותרפיה');assert.deepEqual(r.body.conversations.map(c=>c.id),[a]);assert.doesNotMatch(r.body.conversations[0].snippet,/\*\*/);
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history?q=100%');assert.deepEqual(r.body.conversations,[],'% is literal');
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history/'+a);assert.equal(r.body.turns.length,2);assert.equal(r.body.turns[1].voice,7);assert.equal(r.body.turns[1].plan.id,'p1');assert.equal(r.body.turns[0].sources[0].id,'t1');
  // Pages: 5 at a time.
  for(let i=0;i<7;i++)await saveTurn(env,home('one'),'one',{conversationId:'cccccccc-0000-4000-8000-00000000000'+i,question:'Q'+i,result:result('A'+i)});
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history?limit=5');assert.equal(r.body.conversations.length,5);assert.ok(r.body.next);
  const second=await call(handleAIHistory,env,'one','GET','/api/ai-history?limit=5&before='+encodeURIComponent(r.body.next));assert.equal(second.body.conversations.length,4);assert.equal(second.body.next,null);
  assert.equal(new Set([...r.body.conversations,...second.body.conversations].map(c=>c.id)).size,9);
  r=await call(handleAIHistory,env,'two','DELETE','/api/ai-history/'+a);assert.equal(r.status,404,'only the owner deletes');
  r=await call(handleAIHistory,env,'one','DELETE','/api/ai-history/'+a);assert.equal(r.status,200);
  r=await call(handleAIHistory,env,'one','GET','/api/ai-history/'+a);assert.equal(r.status,404);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM ai_turns WHERE conversation_id=?").bind(a).first()).n,0);
  state.preferences.features.ai=false;r=await call(handleAIHistory,env,'one','GET','/api/ai-history');assert.equal(r.status,403);
 }finally{env.DB.close()}
});

test('history tolerates the tables being missing',async()=>{
 fresh();const DB=openD1(':memory:');try{const env={DB};
  assert.equal(await saveTurn(env,home('one'),'one',{conversationId:'aaaaaaaa-0000-4000-8000-000000000001',question:'x',result:result('y')}),null);
  const r=await call(handleAIHistory,env,'one','GET','/api/ai-history');assert.equal(r.status,200);assert.equal(r.body.available,false);
 }finally{DB.close()}
});

test('voice: off until the household turns it on; then transcribed, counted and never stored',async()=>{
 fresh();const calls=[],original=globalThis.fetch;
 const env=fixture({SPEECH_TEST_ORIGIN:'http://127.0.0.1:8799'});try{
  let r=await call(handleVoice,env,'one','GET','/api/voice');assert.equal(r.body.available,false);
  await env.DB.prepare("INSERT INTO media_settings(household_id,photos,speech_provider,updated_by,updated_at) VALUES('home',0,'cloudflare','one','2026-11-10')").run();
  r=await call(handleVoice,env,'kid','GET','/api/voice');assert.equal(r.body.available,true,'children may ask by voice while Bayit AI is on for them');
  globalThis.fetch=async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({text:'תוסיף חלב לקניות'})};
  r=await call(handleVoice,env,'one','POST','/api/voice/transcribe',{body:new Uint8Array(9000),headers:{'Content-Type':'text/plain'}});assert.equal(r.status,415);
  r=await call(handleVoice,env,'one','POST','/api/voice/transcribe',{body:new Uint8Array(9000),headers:{'Content-Type':'audio/webm','X-Voice-Seconds':'6'}});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.text,'תוסיף חלב לקניות');assert.equal(calls[0].language,'he');
  assert.equal((await env.DB.prepare("SELECT seconds FROM speech_usage WHERE household_id='home'").first()).seconds,6);
  r=await call(handleVoice,env,'one','POST','/api/voice/transcribe',{body:new Uint8Array(1_600_000),headers:{'Content-Type':'audio/mp4'}});assert.equal(r.status,413);
  await env.DB.prepare("UPDATE speech_usage SET seconds=3599 WHERE household_id='home'").run();
  r=await call(handleVoice,env,'one','POST','/api/voice/transcribe',{body:new Uint8Array(9000),headers:{'Content-Type':'audio/webm','X-Voice-Seconds':'6'}});assert.equal(r.status,429);
  state.preferences.features.ai=false;r=await call(handleVoice,env,'one','GET','/api/voice');assert.equal(r.status,403);
 }finally{globalThis.fetch=original;env.DB.close()}
});
