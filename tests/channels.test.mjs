// Channel seam (Modular Bayit work package 2.3, docs/channel-contract.md): Telegram and a channel registered through
// the local registry file both pass tests/channel-conformance.mjs; the registry refuses bad entries; the worker and
// the scheduler reach every registered channel. Fictional data; fake providers only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,hash} from '../app/cloud/util.mjs';
import {CHANNELS,RESERVED_API,channelForAPI,channelForHook} from '../app/cloud/channels.mjs';
import {TELEGRAM_CHANNEL} from '../app/cloud/telegram.mjs';
import {runChannelConformance,noonToday} from './channel-conformance.mjs';
import {SAMPLE_ORIGIN,connectSample} from './fixtures/sample-channel.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),real=p=>pathToFileURL(join(root,p)).href,src=p=>readFileSync(join(root,p),'utf8');
const scratch=mkdtempSync(join(tmpdir(),'bayit-channels-'));process.on('exit',()=>rmSync(scratch,{recursive:true,force:true}));
let copies=0;
// A copy of the channel registry with its own local file; every other module is the real one.
async function registryWith(extra){
 const dir=join(scratch,'copy-'+(++copies)),put=(p,code)=>{mkdirSync(dirname(join(dir,p)),{recursive:true});writeFileSync(join(dir,p),code)};
 put('app/cloud/channels.mjs',src('app/cloud/channels.mjs'));
 for(const f of ['app/cloud/telegram.mjs','app/cloud/channel-delivery.mjs','shared/extension-registry.mjs','shared/features.mjs'])put(f,`export * from '${real(f)}';\n`);
 put('app/cloud/extensions/channels.mjs',`import {SAMPLE_CHANNEL} from '${real('tests/fixtures/sample-channel.mjs')}';\n${extra}\n`);
 return import(pathToFileURL(join(dir,'app/cloud/channels.mjs')).href);
}

// ---- Telegram, with a fake Bot API ----
function telegramFixture(){
 const sends=[],blocked=new Set(),address=new Map(),people=new Map();let seq=4000,update=0;
 const telegramUpdate=(chat,user,text)=>({update_id:++update,message:{message_id:update,date:1,chat:{id:Number(chat),type:'private'},from:{id:Number(user),language_code:'en'},text}});
 const post=(connection,body,secret)=>({hookId:connection.hookId,request:new Request('https://home.example/api/telegram/hook/'+connection.hookId,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(body)})});
 return {
  name:'fake Bot API',origins:['https://api.telegram.org'],
  async provider(url,options){
   const method=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options?.body||'{}');
   if(method==='sendMessage'){const to=String(body.chat_id);if(blocked.has(to))return Response.json({ok:false,error_code:403,description:'Forbidden: bot was blocked by the user'},{status:403});sends.push({...address.get(to)||{householdId:null,memberId:null},text:body.text});return Response.json({ok:true,result:{message_id:sends.length}})}
   return Response.json({ok:true,result:true});
  },
  async connect(env,householdId,memberIds){
   const token=(++seq)+':conformance-token-'+householdId.replace(/\W/g,'')+'-abcdefghijklmnop',secret='conformance-secret-'+householdId+'-'+seq,hookId=('hook'+householdId+seq).replace(/\W/g,'').padEnd(24,'x'),chatNames={};
   await env.DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind(householdId,await encryptKey(token,env,'telegram:'+householdId),String(seq),'conformance_bot',hookId,await hash(secret),memberIds[0],new Date().toISOString()).run();
   for(const memberId of memberIds){const chat=String(++seq),user=String(seq+50000);chatNames[memberId]='Chat name of '+memberId;address.set(chat,{householdId,memberId});people.set(householdId+':'+memberId,{chat,user});
    await env.DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) VALUES(?,?,?,?,?,?)').bind(householdId,memberId,chat,user,chatNames[memberId],new Date().toISOString()).run()}
   return {hookId,secret,secrets:[token,secret],chatNames};
  },
  sent:()=>sends,
  inbound(env,connection,{householdId,memberId,text}){const p=memberId?people.get(householdId+':'+memberId):{chat:String(++seq),user:String(++seq)};if(!memberId)address.set(p.chat,{householdId:null,memberId:'stranger'});return post(connection,telegramUpdate(p.chat,p.user,text),connection.secret)},
  forged(env,connection){return post(connection,telegramUpdate(1,1,'/help'),'not-the-secret')},
  block(householdId,memberId){blocked.add(people.get(householdId+':'+memberId).chat)}
 };
}

// ---- The test-only sample channel ----
function sampleFixture(){
 const sends=[],blocked=new Set(),people=new Map();let seq=0,update=0;
 const post=(connection,body,secret)=>({hookId:connection.hookId,request:new Request('https://home.example/api/sample/hook/'+connection.hookId,{method:'POST',headers:{'Content-Type':'application/json','X-Sample-Signature':secret},body:JSON.stringify({id:++update,...body})})});
 return {
  name:'in-memory provider',origins:[SAMPLE_ORIGIN],
  async provider(url,options){const body=JSON.parse(options.body);if(blocked.has(body.to))return new Response('',{status:403});sends.push({...people.get(body.to)||{householdId:null,memberId:null},text:body.text});return Response.json({id:sends.length})},
  async connect(env,householdId,memberIds){
   const links=memberIds.map(memberId=>{const address='addr-'+(++seq),userId='user-'+seq;people.set(address,{householdId,memberId});return {memberId,address,userId}});
   const c=await connectSample(env,householdId,links);return {...c,links,secrets:[c.secret],chatNames:{}};
  },
  sent:()=>sends,
  inbound(env,connection,{householdId,memberId,text}){
   const link=memberId&&[...people.entries()].find(([,p])=>p.householdId===householdId&&p.memberId===memberId),address=link?link[0]:'stranger-'+(++seq);
   if(!link)people.set(address,{householdId:null,memberId:'stranger'});
   return post(connection,{from:address,user:link?'user-'+address.slice(5):'nobody',text},connection.secret);
  },
  forged(env,connection){return post(connection,{from:'x',user:'x',text:'hi'},'wrong-signature')},
  block(householdId,memberId){for(const [a,p] of people)if(p.householdId===householdId&&p.memberId===memberId)blocked.add(a)}
 };
}

test('upstream registers Telegram only, and the local file is shipped empty',()=>{
 assert.equal(src('app/cloud/extensions/channels.mjs').replace(/^\s*\/\/.*\n/gm,'').trim(),'export const EXTRA_CHANNELS=[];');
 assert.deepEqual(CHANNELS.map(c=>c.id),['telegram']);assert.equal(CHANNELS[0],TELEGRAM_CHANNEL);
 assert.equal(channelForHook('/api/telegram/hook/abc'),TELEGRAM_CHANNEL);assert.equal(channelForAPI('/api/telegram/status'),TELEGRAM_CHANNEL);
 assert.equal(channelForAPI('/api/finance/status'),null);assert.equal(channelForHook('/api/telegram/status'),null);
});

test('the worker and the scheduler reach channels only through the registry',()=>{
 const worker=src('app/cloud/worker.mjs');
 assert.match(worker,/const channel=channelForHook\(path\);if\(channel&&request\.method==='POST'\)return channel\.webhook\(/);
 assert.match(worker,/const channel=channelForAPI\(path\);if\(channel\)\{const home=await chosenHousehold\(request,env,user\);return \['GET','HEAD'\]\.includes\(request\.method\)\?channel\.api\(.*:audited\(env,\{home:home\.id,actor:user\.id,action:channel\.id\+'\.'\+path\.split\('\/'\)\[3\]\}/);
 assert.doesNotMatch(worker,/handleTelegram|from '\.\/telegram\.mjs'/);
 assert.match(src('app/cloud/scheduler.mjs'),/deliverChannelReminders\(env,new Date\(\)/);
 // Every /api/ area of core is reserved, so no channel's webhook (reached before sign-in) can sit inside one.
 const areas=new Set([...worker.matchAll(/\/api\/([a-z][a-z0-9-]*)/g),...worker.matchAll(/\\\/api\\\/([a-z][a-z0-9-]*)/g)].map(m=>m[1]));
 for(const a of areas)if(!CHANNELS.some(c=>c.id===a))assert.ok(RESERVED_API.includes(a),'core area /api/'+a+'/ is not reserved in channels.mjs');
});

runChannelConformance(TELEGRAM_CHANNEL,telegramFixture());

const withSample=await registryWith('export const EXTRA_CHANNELS=[SAMPLE_CHANNEL];');
const sample=withSample.CHANNELS.find(c=>c.id==='sample');

test('a channel in the local registry file is registered after Telegram and routed by path',()=>{
 assert.deepEqual(withSample.CHANNELS.map(c=>c.id),['telegram','sample']);
 assert.equal(withSample.channelForHook('/api/sample/hook/x'),sample);assert.equal(withSample.channelForAPI('/api/sample/status'),sample);
 assert.equal(withSample.channelForAPI('/api/telegram/status').id,'telegram');
});

runChannelConformance(sample,sampleFixture());

test('one scheduler tick delivers every registered channel and keeps one heartbeat',async()=>{
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const tg=telegramFixture(),sm=sampleFixture(),env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),OUTBOUND_FETCH:(url,o)=>(url.startsWith(SAMPLE_ORIGIN)?sm:tg).provider(url,o)};
 const {blankState}=await import('../app/cloud/state.mjs'),{localDate}=await import('../app/cloud/util.mjs'),state=blankState('h','Fictional',{id:'mom',name:'Dana',role:'parent'});
 state.profiles.mom={name:'Dana',he:'Dana',locale:'en'};state.tasks=[{id:'t1',title:'Both channels (conformance)',memberId:'mom',ownerId:'mom',date:localDate(),time:'12:10',repeat:'once',visibility:'family',allowedIds:[]}];
 await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind('h',JSON.stringify(state)).run();
 await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind('mom','Dana').run();await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('h','mom','mom','parent',new Date().toISOString()).run();
 await tg.connect(env,'h',['mom']);await sm.connect(env,'h',['mom']);
 const result=await withSample.deliverChannelReminders(env,noonToday(),{origin:'https://home.example'});
 assert.equal(result.sent,2,JSON.stringify(result));assert.equal(result.households,2);
 assert.ok(tg.sent().some(m=>m.text.includes('Both channels')));assert.ok(sm.sent().some(m=>m.text.includes('Both channels')));
 assert.deepEqual((await DB.prepare('SELECT channel FROM notification_deliveries ORDER BY channel').all()).results.map(r=>r.channel),['sample','telegram']);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM service_heartbeats WHERE name='reminders'").first()).n,1);
});

test('bad channel entries stop the start with a message naming them',async()=>{
 const base="{...SAMPLE_CHANNEL";
 const cases=[
  [`${base},id:'telegram',apiPath:'/api/telegram/',hookPath:'/api/telegram/hook/'}`,/channel "telegram": this id is already registered/],
  [`${base},id:'finance',apiPath:'/api/finance/',hookPath:'/api/finance/hook/'}`,/channel "finance": this id is one of core’s own/],
  [`${base},apiPath:'/api/other/'}`,/apiPath must be '\/api\/sample\/'/],
  [`${base},log:()=>{}}`,/may not carry log/],
  [`${base},feature:'weather'}`,/feature must be a registered feature id/],
  [`${base},name:{en:'Sample'}}`,/needs name \{en, he\}/],
  [`${base},delivery:{...SAMPLE_CHANNEL.delivery,render:undefined}}`,/delivery needs render/],
  [`${base},delivery:{...SAMPLE_CHANNEL.delivery,dueSnoozes:async()=>[]}}`,/both dueSnoozes and snoozeSent/],
  [`${base},delivery:{...SAMPLE_CHANNEL.delivery,deliveries:()=>{}}}`,/delivery may not carry deliveries/],
 ];
 for(const [entry,message] of cases)await assert.rejects(registryWith(`export const EXTRA_CHANNELS=[${entry}];`),message);
 await assert.rejects(registryWith('export const EXTRA_CHANNELS={};'),/local channel registry must export an array/);
});
