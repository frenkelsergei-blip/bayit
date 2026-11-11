// Channel conformance suite: what any messaging channel must do (docs/channel-contract.md).
// Not a test file on its own. tests/channels.test.mjs calls runChannelConformance(channel, fixture) for Telegram and
// for a test-only channel registered through the local registry file. Fictional households only; no real provider.
//
// fixture = {
//  name,
//  origins: ['https://…'],                        // the only addresses the channel may contact
//  provider(url, options): Response               // fake provider behind env.OUTBOUND_FETCH
//  connect(env, householdId, memberIds): {secrets, chatNames, …}   // a connected household with those people linked
//  sent(): [{householdId, memberId, text}]        // messages the provider accepted, in order (memberId null if unknown)
//  inbound(env, connection, {householdId, memberId, text}): {request, hookId}   // a verified update from that person
//                                                 // (memberId null: a stranger)
//  forged(env, connection): {request, hookId}     // the same, failing the provider's verification
//  block(householdId, memberId)                   // the provider now refuses that person as "blocked"
// }
import {describe,test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {blankState} from '../app/cloud/state.mjs';
import {localDate,localTime} from '../app/cloud/util.mjs';
import {featureDefaults} from '../shared/features.mjs';
import {deliverChannels} from '../app/cloud/channel-delivery.mjs';
import {channelProblem,CHANNEL_FIELDS} from '../app/cloud/channels.mjs';

const MIGRATIONS=new URL('../app/cloud/migrations',import.meta.url).pathname;
// 12:00 in the installation's time zone today: outside default quiet hours, 10 minutes before the 12:10 tasks.
export function noonToday(){const today=localDate();for(let h=6;h<=14;h++){const at=new Date(today+'T'+String(h).padStart(2,'0')+':00:00Z');if(localTime(at)==='12:00'&&localDate(at)===today)return at}throw Error('No local noon found')}
const fam={visibility:'family',allowedIds:[]};
const TITLES={family:'Water the plants (conformance)',secret:'Secret birthday gift (conformance)',kid:'Kid homework (conformance)',other:'Other household task (conformance)'};

async function household(env,id,members,tasks){
 const state=blankState(id,'Fictional '+id,{id:members[0].id,name:members[0].name,role:'parent'});
 state.members=members.map(m=>({...m}));for(const m of members)state.profiles[m.id]={name:m.name,he:m.name,locale:'en'};
 state.tasks=tasks;
 await env.DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind(id,JSON.stringify(state)).run();
 for(const m of members.filter(m=>m.role!=='child')){await env.DB.prepare('INSERT OR IGNORE INTO users(id,name) VALUES(?,?)').bind(m.id,m.name).run();await env.DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind(id,m.id,m.id,m.role,new Date().toISOString()).run()}
}
const task=(id,title,memberId,extra={})=>({id,title,memberId,ownerId:memberId,date:localDate(),time:'12:10',repeat:'once',...fam,...extra});

export function runChannelConformance(channel,fixture){describe('channel conformance: '+channel.id+' ('+fixture.name+')',()=>{
 const label=channel.id,logs=[],texts=[],origins=new Set(),secrets=[];let env,A,B;
 const original={};
 before(async()=>{
  for(const k of ['log','info','warn','error','debug']){original[k]=console[k];console[k]=(...a)=>logs.push(a.map(String).join(' '))}
  const DB=openD1(':memory:');migrate(DB,MIGRATIONS);
  env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OUTBOUND_FETCH:async(url,options)=>{origins.add(new URL(url).origin);return fixture.provider(url,options)}};
  // Household A: two linked parents and an unlinked child. Household B: one linked parent. Each person has a task due.
  await household(env,'house-a',[{id:'mom',name:'Dana',role:'parent'},{id:'dad',name:'Avi',role:'parent'},{id:'kid',name:'Noa',role:'child'}],
   [task('t-family',TITLES.family,'mom'),task('t-secret',TITLES.secret,'dad',{visibility:'private',allowedIds:[]}),task('t-kid',TITLES.kid,'kid')]);
  await household(env,'house-b',[{id:'bmom',name:'Rina',role:'parent'}],[task('t-other',TITLES.other,'bmom')]);
  A=await fixture.connect(env,'house-a',['mom','dad']);B=await fixture.connect(env,'house-b',['bmom']);
  secrets.push(...A.secrets,...B.secrets);
 });
 after(()=>{for(const k of Object.keys(original))console[k]=original[k]});
 const sentSince=from=>fixture.sent().slice(from);
 const tick=async()=>{const from=fixture.sent().length,result=await deliverChannels(env,noonToday(),[channel],{deadline:Date.now()+20000,origin:'https://home.example'});const out=sentSince(from);texts.push(...out.map(m=>m.text));return {result,out}};

 test(label+': meets the channel object contract',()=>{
  assert.equal(channelProblem(channel),'');
  assert.deepEqual(Object.keys(channel).sort(),[...CHANNEL_FIELDS].sort());
 });

 test(label+': delivers due messages only to linked people, only what each may see, within their own household, once',async()=>{
  const {result,out}=await tick();
  const to=id=>out.filter(m=>m.memberId===id).map(m=>m.text).join('\n');
  assert.ok(to('mom').includes(TITLES.family),'mom gets her reminder');
  assert.ok(to('dad').includes(TITLES.secret),'dad gets his private reminder');
  assert.ok(to('bmom').includes(TITLES.other),'the other household gets its own reminder');
  for(const [who,never] of [['mom',[TITLES.secret,TITLES.other,TITLES.kid]],['dad',[TITLES.other]],['bmom',[TITLES.family,TITLES.secret,TITLES.kid]]])for(const t of never)assert.ok(!to(who).includes(t),who+' must not see '+t);
  assert.ok(out.every(m=>m.memberId&&m.memberId!=='kid'),'nothing goes to an unlinked person or an unknown address');
  assert.ok(result.sent>=3&&result.failed===0);
  const again=await tick();assert.equal(again.out.length,0,'a second tick sends nothing again');
  const rows=(await env.DB.prepare('SELECT DISTINCT channel FROM notification_deliveries').all()).results.map(r=>r.channel);assert.deepEqual(rows,[channel.id]);
 });

 test(label+': a person with the channel’s feature off gets nothing',async()=>{
  const row=await env.DB.prepare("SELECT state FROM household_data WHERE household_id='house-b'").first(),state=JSON.parse(row.state);
  state.preferences.features={...featureDefaults(),[channel.feature]:false};state.tasks.push(task('t-off','Feature off task (conformance)','bmom',{time:'12:10'}));
  await env.DB.prepare("UPDATE household_data SET state=?,revision=revision+1 WHERE household_id='house-b'").bind(JSON.stringify(state)).run();
  const {out}=await tick();assert.equal(out.filter(m=>m.memberId==='bmom').length,0);
 });

 test(label+': a person who blocked the channel is marked once and skipped afterwards',async()=>{
  const row=await env.DB.prepare("SELECT state FROM household_data WHERE household_id='house-a'").first(),state=JSON.parse(row.state);
  state.tasks.push(task('t-blocked','Blocked person task (conformance)','dad'));
  await env.DB.prepare("UPDATE household_data SET state=?,revision=revision+1 WHERE household_id='house-a'").bind(JSON.stringify(state)).run();
  fixture.block('house-a','dad');
  const first=await tick();assert.equal(first.out.filter(m=>m.memberId==='dad').length,0);assert.ok(first.result.failed>=1);
  const failed=await env.DB.prepare("SELECT status FROM notification_deliveries WHERE member_id='dad' AND delivery_key LIKE 'task:t-blocked:%'").first();assert.equal(failed.status,'failed');
  state.tasks.push(task('t-blocked-2','Second blocked task (conformance)','dad'));
  await env.DB.prepare("UPDATE household_data SET state=?,revision=revision+1 WHERE household_id='house-a'").bind(JSON.stringify(state)).run();
  const second=await tick();assert.equal(second.result.failed,0,'no further attempt to a blocked person');
  assert.equal(await env.DB.prepare("SELECT 1 FROM notification_deliveries WHERE member_id='dad' AND delivery_key LIKE 'task:t-blocked-2:%'").first(),null);
 });

 test(label+': the webhook refuses unknown and unverified calls and sends nothing',async()=>{
  const from=fixture.sent().length;
  const unknown=await channel.webhook(new Request('https://home.example'+channel.hookPath+'unknown-hook-id-0000000000',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env,'unknown-hook-id-0000000000');
  assert.equal(unknown.status,404);
  const forged=fixture.forged(env,A);assert.equal((await channel.webhook(forged.request,env,forged.hookId)).status,401);
  assert.equal(sentSince(from).length,0);
 });

 test(label+': a stranger, or someone linked in another household, learns nothing about the household',async()=>{
  for(const who of [{householdId:'house-a',memberId:null},{householdId:'house-b',memberId:'bmom'}]){
   const from=fixture.sent().length,call=fixture.inbound(env,A,{...who,text:'/today'});
   assert.equal((await channel.webhook(call.request,env,call.hookId)).status,200);
   const replies=sentSince(from);texts.push(...replies.map(m=>m.text));
   for(const t of Object.values(TITLES))assert.ok(!replies.some(m=>m.text.includes(t)),'a reply to a stranger mentions '+t);
   for(const name of ['Dana','Avi','Noa'])assert.ok(!replies.some(m=>m.text.includes(name)));
  }
  const from=fixture.sent().length,linked=fixture.inbound(env,A,{householdId:'house-a',memberId:'mom',text:'/help'});
  assert.equal((await channel.webhook(linked.request,env,linked.hookId)).status,200);
  const replies=sentSince(from);assert.ok(replies.length>=1&&replies.every(m=>m.memberId==='mom'),'a linked person is answered in their own chat');texts.push(...replies.map(m=>m.text));
 });

 test(label+': status answers every member and never returns a secret or another person’s chat',async()=>{
  for(const [memberId,role] of [['mom','parent'],['dad','parent']]){
   const home={id:'house-a',revision:0,state:JSON.parse((await env.DB.prepare("SELECT state FROM household_data WHERE household_id='house-a'").first()).state),membership:{member_id:memberId,role}};
   const path=channel.apiPath+'status',url=new URL('https://home.example'+path),response=await channel.api(new Request(url),env,{id:memberId},home,path,url);
   assert.equal(response.status,200);const raw=await response.text(),body=JSON.parse(raw);
   assert.equal(body.connected,true);assert.equal(typeof body.canManage,'boolean');
   assert.deepEqual(body.members.map(m=>m.id),['mom','dad','kid']);for(const m of body.members){assert.equal(typeof m.linked,'boolean');assert.equal(typeof m.canLink,'boolean')}
   for(const s of secrets)assert.ok(!raw.includes(s),'status leaks a secret');
   for(const [other,name] of Object.entries(A.chatNames||{}))if(other!==memberId)assert.ok(!raw.includes(name),'status shows another person’s chat name');
  }
 });

 test(label+': contacts only its provider and logs no message content or secrets',()=>{
  assert.ok([...origins].every(o=>fixture.origins.includes(o)),'contacted '+[...origins].join(', '));
  const all=logs.join('\n');
  for(const s of [...secrets,...Object.values(TITLES),...texts.filter(t=>t.length>8)])assert.ok(!all.includes(s),'a log line contains message content or a secret');
 });
});}
