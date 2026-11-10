// Speech-to-text seam (Modular Bayit work package 2.2). Every provider, core or extra, passes the conformance checks,
// and the household-AI provider transcribes through the household's own key. fetch is always a stub: no audio leaves
// the machine, and nothing here needs a real key.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey} from '../app/cloud/util.mjs';
import {SPEECH_REGISTRY,SPEECH_PROVIDERS,speechProblem,speechState,speechOptions,speechHousehold,speechChoice,transcribe,MAX_VOICE_BYTES} from '../app/cloud/speech.mjs';
import {OPENAI_TRANSCRIBE_MODEL} from '../app/cloud/speech-household-ai.mjs';

const KEY=Buffer.alloc(32,23).toString('base64'),SECRET='sk-test-not-a-real-key';
const fixture=(extra={})=>{const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('home','Fictional household','one','2026-01-01')").run();return {DB,APP_ENCRYPTION_KEY:KEY,...extra}};
async function connectAI(env,provider,model,baseUrl=null){await env.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider,base_url) VALUES(?,?,?,?,1,?,?)').bind('home',await encryptKey(SECRET,env,'home'),model,'[]',provider,baseUrl).run()}
// A recording stub for the outbound fetch: answers by URL, keeps every request.
function stub(answer){const calls=[];const run=async(url,options)=>{calls.push({url:String(url),options});return answer(String(url),options)};run.calls=calls;return run}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const AUDIO=new Uint8Array([79,103,103,83,0,2,0,0,0,0,0,0,0,0,7,7]); // "OggS…": synthetic bytes, not a real recording
const quiet=()=>{const seen=[],saved={};for(const k of ['log','info','warn','error','debug']){saved[k]=console[k];console[k]=(...a)=>seen.push(a.join(' '))}return {seen,restore:()=>Object.assign(console,saved)}};
const formOf=options=>new Response(options.body,{headers:{'Content-Type':options.headers['Content-Type']}}).formData();
const ledger=env=>env.DB.prepare('SELECT * FROM ai_calls ORDER BY id').all().then(r=>r.results);

// ---- Conformance: what every provider must satisfy ----
const contexts=[null,...['anthropic','openai','gemini','xai','custom'].map(provider=>({id:'home',memberId:'one',feature:'assistant',ai:{provider,model:'some-model',baseUrl:provider==='custom'?'https://api.groq.com/openai/v1':''},key:async()=>SECRET}))];
const environments=[{},{AI:{run:async()=>({text:'x'})}},{APP_ENCRYPTION_KEY:KEY}];
const bilingual=v=>typeof v?.en==='string'&&v.en.trim()&&typeof v?.he==='string'&&v.he.trim()&&/[֐-׿]/.test(v.he);
function conforms(p){
 assert.equal(speechProblem(p),'',p.id+' passes the registry check');
 assert.ok(bilingual(p.name),p.id+' has a Hebrew and English name');
 assert.ok(bilingual(p.cost),p.id+' has an honest cost note in Hebrew and English');
 for(const env of environments)for(const household of contexts){
  const raw=p.available(env,household),s=speechState(env,p.id,household);
  assert.ok(typeof raw==='boolean'||raw&&typeof raw==='object'&&'ok' in raw,p.id+' available() returns a boolean or {ok}');
  if(!s.ok&&s.reason)assert.ok(bilingual(s.reason),p.id+' explains unavailability in both languages');
 }
}
test('every registered speech provider, core or extra, conforms to the contract',async()=>{
 assert.deepEqual(SPEECH_PROVIDERS.slice(0,3),['off','cloudflare','household-ai']);
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('available() must never call the network')};
 try{for(const p of SPEECH_REGISTRY)conforms(p)}finally{globalThis.fetch=original}
 // A sample extra written to the contract conforms; one without a cost note or with the reserved id does not.
 const extra={id:'sample-speech',name:{en:'Sample',he:'דוגמה'},cost:{en:'Free.',he:'חינם.'},available:env=>env.SAMPLE?{ok:true}:{ok:false,reason:{en:'Not set up.',he:'לא הוגדר.'}},transcribe:async()=>'hi'};
 conforms(extra);
 assert.match(speechProblem({...extra,cost:undefined}),/cost/);
 assert.match(speechProblem({...extra,id:'off'}),/reserved/);
});

test('transcribe refuses an unknown or turned-off provider, an unavailable one and oversized audio, before any network call',async()=>{
 const run=stub(()=>reply({text:'x'})),env={OUTBOUND_FETCH:run};
 await assert.rejects(transcribe(env,'off',AUDIO),e=>e.status===409);
 await assert.rejects(transcribe(env,'nope',AUDIO),e=>e.status===409);
 await assert.rejects(transcribe(env,'cloudflare',AUDIO),e=>e.status===409,'no Workers AI on this installation (Docker)');
 await assert.rejects(transcribe(env,'household-ai',AUDIO,{household:null}),e=>e.status===409);
 const openai={...contexts[2],memberId:'one'};
 await assert.rejects(transcribe(env,'household-ai',new Uint8Array(MAX_VOICE_BYTES+1),{household:openai}),e=>e.status===413);
 await assert.rejects(transcribe(env,'household-ai',new Uint8Array(0),{household:openai}),e=>e.status===413);
 assert.equal(run.calls.length,0);
});

// ---- Availability for each household AI provider ----
test('household AI: available with OpenAI, Gemini or a custom service; honestly unavailable with Claude, Grok or no AI',async()=>{
 const env=fixture();try{
  let h=await speechHousehold(env,'home');assert.equal(h.ai,null);
  let o=speechOptions(env,h),ai=o.find(x=>x.id==='household-ai'),cf=o.find(x=>x.id==='cloudflare');
  assert.equal(ai.available,false);assert.match(ai.reason.en,/Connect the AI helper/);assert.match(ai.reason.he,/עוזר ה־AI/);
  assert.equal(cf.available,false);assert.match(cf.reason.en,/Cloudflare/);assert.ok(cf.cost.he);
  await connectAI(env,'anthropic','claude-sonnet-5-5');h=await speechHousehold(env,'home');
  ai=speechOptions(env,h).find(x=>x.id==='household-ai');assert.equal(ai.available,false);assert.match(ai.reason.en,/Claude cannot/);assert.equal(ai.label,'Claude');
  assert.equal((await speechChoice(env,'household-ai',h)).ok,false);
  for(const [provider,ok] of [['openai',true],['gemini',true],['xai',false]]){
   await env.DB.prepare('UPDATE household_secrets SET provider=? WHERE household_id=?').bind(provider,'home').run();
   assert.equal(speechState(env,'household-ai',await speechHousehold(env,'home')).ok,ok,provider);
  }
  assert.equal((await speechChoice(env,'off',h)).ok,true);
 }finally{env.DB.close()}
});

// ---- OpenAI ----
test('household AI with OpenAI: one multipart call to /audio/transcriptions, tokens in the AI usage ledger, nothing logged',async()=>{
 const run=stub(()=>reply({text:'  להוסיף חלב לרשימה  ',usage:{type:'tokens',input_tokens:120,output_tokens:14,total_tokens:134,input_token_details:{audio_tokens:120,text_tokens:0}}}));
 const env=fixture({OUTBOUND_FETCH:run}),log=quiet();try{
  await connectAI(env,'openai','gpt-6.1-terra');
  const household=await speechHousehold(env,'home',{memberId:'one',feature:'telegram'});
  assert.equal(await transcribe(env,'household-ai',AUDIO,{language:'he',mimeType:'audio/ogg',household}),'להוסיף חלב לרשימה');
  assert.equal(run.calls.length,1);const [{url,options}]=run.calls;
  assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual','goes through outbound.mjs');
  assert.equal(options.headers.Authorization,'Bearer '+SECRET);
  assert.ok(options.body instanceof Uint8Array,'a byte body, which the Docker outbound fetch accepts');
  const form=await formOf(options);
  assert.equal(form.get('model'),OPENAI_TRANSCRIBE_MODEL);assert.equal(form.get('language'),'he');
  const file=form.get('file');assert.equal(file.name,'voice.ogg');assert.equal(file.type,'audio/ogg');assert.equal(file.size,AUDIO.length);
  const rows=await ledger(env);assert.equal(rows.length,1);
  assert.deepEqual([rows[0].provider,rows[0].model,rows[0].feature,rows[0].member_id,rows[0].input_tokens,rows[0].output_tokens],['openai','gpt-4o-mini-transcribe','telegram','one',120,14]);
  assert.equal(rows[0].cost_micros,Math.round(120*1.25+14*5),'priced at the verified gpt-4o-mini-transcribe rate');
  assert.ok(!JSON.stringify(rows).includes('חלב'),'the ledger never holds the text');
  assert.deepEqual(log.seen,[],'neither audio nor text is logged');
 }finally{log.restore();env.DB.close()}
});

test('household AI with OpenAI: provider errors reach the family only in plain words; redirects are refused',async()=>{
 const env=fixture();try{
  await connectAI(env,'openai','gpt-6.1-terra');const household=await speechHousehold(env,'home',{memberId:'one'});
  const attempt=answer=>transcribe({...env,OUTBOUND_FETCH:stub(answer)},'household-ai',AUDIO,{household});
  await assert.rejects(attempt(()=>reply({error:{message:'internal detail sk-abc'}},500)),e=>e.status===502&&/could not be transcribed/.test(e.message)&&!/detail|sk-/.test(e.message));
  await assert.rejects(attempt(()=>reply({},401)),e=>e.status===400&&/OpenAI rejected the API key/.test(e.message));
  await assert.rejects(attempt(()=>reply({},429)),e=>e.status===502&&/rate limit/.test(e.message));
  await assert.rejects(attempt(()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}})),e=>e.status===502&&/redirects/.test(e.message));
  await assert.rejects(attempt(()=>{throw Error('socket detail')}),e=>e.status===502&&!/socket/.test(e.message));
  assert.equal((await ledger(env)).length,0,'nothing billed, nothing recorded');
 }finally{env.DB.close()}
});

// ---- Gemini ----
test('household AI with Gemini: the household’s own model through the Interactions API, usage recorded',async()=>{
 const run=stub(()=>reply({id:'i1',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'Move the dentist to Thursday'}]}],usage:{total_input_tokens:400,total_cached_tokens:0,total_output_tokens:8,total_thought_tokens:12,total_tokens:420}}));
 const env=fixture({OUTBOUND_FETCH:run});try{
  await connectAI(env,'gemini','gemini-3.8-flash');
  const household=await speechHousehold(env,'home',{memberId:'one'});
  assert.equal(await transcribe(env,'household-ai',AUDIO,{language:'en',mimeType:'audio/webm;codecs=opus',household}),'Move the dentist to Thursday');
  const [{url,options}]=run.calls;
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(options.headers['x-goog-api-key'],SECRET);assert.equal(options.headers['Api-Revision'],'2026-05-20');
  const body=JSON.parse(options.body);assert.equal(body.model,'gemini-3.8-flash');assert.equal(body.store,false);
  assert.equal(body.input[1].type,'audio');assert.equal(body.input[1].mime_type,'audio/webm');assert.equal(Buffer.from(body.input[1].data,'base64').length,AUDIO.length);
  const [row]=await ledger(env);assert.deepEqual([row.provider,row.model,row.feature,row.input_tokens,row.output_tokens],['gemini','gemini-3.8-flash','assistant',400,20]);
 }finally{env.DB.close()}
});

// ---- Custom OpenAI-compatible ----
test('household AI with a custom service: uses the transcription model the service lists, or is refused when it lists none',async()=>{
 let models=[{id:'llama-4'},{id:'whisper-large-v3-turbo'}];
 const run=stub(url=>url.endsWith('/models')?reply({data:models}):reply({text:'hello'}));
 const env=fixture({OUTBOUND_FETCH:run});try{
  await connectAI(env,'custom','llama-4','https://api.groq.com/openai/v1');
  const household=await speechHousehold(env,'home',{memberId:'one'});
  assert.equal((await speechChoice(env,'household-ai',household)).ok,true);
  assert.equal(await transcribe(env,'household-ai',AUDIO,{mimeType:'audio/mp4',household}),'hello');
  const post=run.calls.at(-1),form=await formOf(post.options);assert.equal(post.url,'https://api.groq.com/openai/v1/audio/transcriptions');assert.equal(form.get('model'),'whisper-large-v3-turbo');assert.equal(form.get('file').name,'voice.m4a');
  assert.equal((await ledger(env)).length,0,'no token usage reported, so nothing to record');
  models=[{id:'llama-4'}];
  const refused=await speechChoice(env,'household-ai',household);assert.equal(refused.ok,false);assert.match(refused.reason.en,/transcription model/);assert.ok(refused.reason.he);
  await assert.rejects(transcribe(env,'household-ai',AUDIO,{household}),e=>e.status===409);
  // A custom address the installation does not allow is unavailable without any call.
  await env.DB.prepare('UPDATE household_secrets SET base_url=? WHERE household_id=?').bind('https://unknown-ai.example/v1','home').run();
  const before=run.calls.length,blocked=speechState(env,'household-ai',await speechHousehold(env,'home'));
  assert.equal(blocked.ok,false);assert.match(blocked.reason.en,/does not allow/);assert.equal(run.calls.length,before);
 }finally{env.DB.close()}
});

// ---- Through the real voice handler (as on Docker: no Workers AI) ----
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'speech-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/voice.mjs',import.meta.url).pathname],outfile:join(scratch,'voice.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"},logLevel:'silent'});
const {handleVoice}=await import(pathToFileURL(join(scratch,'voice.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));
const state={members:[{id:'one',role:'parent'}],profiles:{one:{locale:'he'}},preferences:{features:{ai:true}}};
const home={id:'home',state,membership:{member_id:'one',role:'parent'}};
const voice=async(env,{bytes=AUDIO,seconds='6'}={})=>{const r=new Request('https://bayit.test/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'audio/ogg','X-Voice-Seconds':seconds},body:bytes});try{const res=await handleVoice(r,env,home,'/api/voice/transcribe');return {status:res.status,body:await res.json()}}catch(e){return {status:e.status||500,body:{error:e.message}}}};

test('voice on Docker: household AI transcribes, counts the daily seconds, refuses when unavailable and at the daily cap',async()=>{
 const run=stub(()=>reply({text:'שלום',usage:{type:'tokens',input_tokens:50,output_tokens:2}})),env=fixture({OUTBOUND_FETCH:run});try{
  await env.DB.prepare("INSERT INTO media_settings(household_id,photos,speech_provider,updated_by,updated_at) VALUES('home',1,'household-ai','one','2026-11-10')").run();
  // Claude cannot transcribe: refused, nothing sent, nothing counted.
  await connectAI(env,'anthropic','claude-sonnet-5-5');
  let r=await handleVoice(new Request('https://bayit.test/api/voice'),env,home,'/api/voice').then(x=>x.json());assert.equal(r.available,false);
  r=await voice(env);assert.equal(r.status,409);assert.equal(run.calls.length,0);
  assert.equal(await env.DB.prepare("SELECT seconds FROM speech_usage WHERE household_id='home'").first(),null);
  // OpenAI: works.
  await env.DB.prepare("UPDATE household_secrets SET provider='openai',model='gpt-6.1-terra'").run();
  r=await voice(env);assert.equal(r.status,200);assert.equal(r.body.text,'שלום');assert.equal(run.calls.length,1);
  assert.equal((await formOf(run.calls[0].options)).get('language'),'he');
  assert.equal((await env.DB.prepare("SELECT seconds FROM speech_usage WHERE household_id='home'").first()).seconds,6);
  assert.equal((await ledger(env))[0].feature,'assistant');
  // Over the per-message size: refused before any call.
  r=await voice(env,{bytes:new Uint8Array(MAX_VOICE_BYTES+1)});assert.equal(r.status,413);assert.equal(run.calls.length,1);
  // The daily cap: refused before any call.
  await env.DB.prepare("UPDATE speech_usage SET seconds=3598 WHERE household_id='home'").run();
  r=await voice(env);assert.equal(r.status,429);assert.equal(run.calls.length,1);
 }finally{env.DB.close()}
});

// ---- The Docker host's own outbound fetch (DNS pinned, string or byte bodies only) carries the request ----
test('on Docker the request goes through the host’s pinned outbound fetch',async()=>{
 const {createOutboundFetch}=await import('../app/host/outbound-fetch.mjs');
 const {Readable,Writable}=await import('node:stream');
 const sent=[];
 const httpsRequest=(url,options,respond)=>{const chunks=[];const req=new Writable({write(c,_e,cb){chunks.push(Buffer.from(c));cb()}});
  req.end=function(){sent.push({url:String(url),method:options.method,headers:options.headers,body:Buffer.concat(chunks)});const res=Readable.from([Buffer.from(JSON.stringify({text:'בדיקה',usage:{type:'tokens',input_tokens:10,output_tokens:1}}))]);res.statusCode=200;res.rawHeaders=['Content-Type','application/json'];respond(res);return this};return req};
 const env=fixture();try{
  env.OUTBOUND_FETCH=createOutboundFetch(env,{resolve:async()=>[{address:'162.159.140.245',family:4}],httpsRequest});
  await connectAI(env,'openai','gpt-6.1-terra');
  const household=await speechHousehold(env,'home',{memberId:'one',feature:'telegram'});
  assert.equal(await transcribe(env,'household-ai',AUDIO,{mimeType:'audio/ogg',household}),'בדיקה');
  assert.equal(sent.length,1);assert.equal(sent[0].url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(sent[0].method,'POST');
  const form=await new Response(sent[0].body,{headers:{'Content-Type':sent[0].headers['content-type']}}).formData();
  assert.equal(form.get('model'),OPENAI_TRANSCRIBE_MODEL);assert.equal(form.get('file').size,AUDIO.length);
 }finally{env.DB.close()}
});
