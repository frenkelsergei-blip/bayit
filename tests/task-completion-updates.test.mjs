import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {taskDoneUpdates} from '../shared/task-completion-updates.mjs';
import {blankState,visibleState} from '../app/cloud/state.mjs';
import {pushMessages,deliverPush} from '../app/cloud/push.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey} from '../app/cloud/util.mjs';
import {bindTestSession} from './fixtures/security-session.mjs';
import {anchor} from '../app/src/data.js';

const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-completion-'));
await require('esbuild').build({entryPoints:{telegram:new URL('../app/cloud/telegram.mjs',import.meta.url).pathname,notifications:new URL('../app/src/notifications.jsx',import.meta.url).pathname},outdir:scratch,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node22',loader:{'.css':'empty'},banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {deliverReminders}=await import(pathToFileURL(join(scratch,'telegram.mjs'))),{notificationItems}=await import(pathToFileURL(join(scratch,'notifications.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const date='2026-11-07',next='2026-11-08',members=[{id:'creator',name:'Creator',role:'parent'},{id:'second',name:'Second',role:'parent'},{id:'third',name:'Third',role:'adult'},{id:'child',name:'Child',role:'child'}];
function home(day=date){
 const state=blankState('home','Fictional household',members[0]);state.members=structuredClone(members);
 for(const member of members)state.profiles[member.id]={name:member.name,locale:'en'};
 state.tasks=[{id:'shared',title:'Fictional shared task',ownerId:'creator',memberId:'creator',memberIds:['creator','second','third'],visibility:'family',allowedIds:[],date:day,repeat:'once',notifyOwnerOnDone:true,completions:{[day]:{state:'done',actorId:'creator',time:'22:44'}}}];
 return state;
}
const selected=(state,user,day=date)=>taskDoneUpdates(visibleState(state,user),user,{date:day});
function app(state,user){const data=visibleState(state,user);return {data,user,lang:'en',today:anchor,T:en=>en,visible:records=>records,name:id=>members.find(m=>m.id===id)?.name||id,member:id=>members.find(m=>m.id===id),text:r=>r.title||r.name||''}}

test('creator completion reaches each other assignee once, without notifying its actor or unrelated family members',()=>{
 const state=home();assert.equal(selected(state,'creator').length,0);
 for(const user of ['second','third']){const updates=selected(state,user);assert.equal(updates.length,1);assert.equal(updates[0].key,'done:shared:'+date);assert.equal(updates[0].actorId,'creator')}
 assert.equal(selected(state,'child').length,0);
 state.tasks[0].memberIds.push('second');assert.equal(selected(state,'second').length,1);
});

test('owner opt-in remains separate from ordinary assignee updates, including legacy single assignment',()=>{
 const state=home(),task=state.tasks[0];task.completions[date].actorId='third';task.notifyOwnerOnDone=false;
 assert.equal(selected(state,'creator').length,0);assert.equal(selected(state,'second').length,1);
 task.notifyOwnerOnDone=true;assert.equal(selected(state,'creator').length,1);
 delete task.memberIds;task.memberId='second';assert.equal(selected(state,'second').length,1);
 task.routine=true;assert.equal(selected(state,'second').length,0,'routines retain existing child/parent rules');assert.equal(selected(state,'creator').length,1);
});

test('completion selection honors recipient preferences, visibility, assignment removal and task-list access',()=>{
 const state=home(),task=state.tasks[0];state.profiles.second.notificationPrefs={categories:{tasks:{enabled:false}}};assert.equal(selected(state,'second').length,0);
 state.profiles.second.notificationPrefs={enabled:false};assert.equal(selected(state,'second').length,0);
 state.profiles.second.notificationPrefs={enabled:false,categories:{tasks:{enabled:true}}};assert.equal(selected(state,'second').length,1,'category override matches existing reminder preferences');
 task.visibility='private';assert.equal(selected(state,'second').length,1,'assignees always see: Only me plus an assignee is Selected people (model of 2026-11-08)');
 task.visibility='selected';task.allowedIds=['third'];assert.equal(selected(state,'second').length,1,'an assignee left out of Selected people is added');task.allowedIds.push('second');assert.equal(selected(state,'second').length,1);
 task.memberIds=['creator','third'];assert.equal(selected(state,'second').length,0);
 task.memberIds.push('second');task.listId='private-list';state.taskLists=[{id:'private-list',title:'Private list',ownerId:'creator',visibility:'private',allowedIds:[]}];assert.equal(selected(state,'second').length,1,'an older task assigned outside its list still reaches its assignee (new writes like this are refused)');
 task.memberIds=['creator','third'];assert.equal(selected(state,'second').length,0,'a private list never leaks to someone not assigned');
});

test('completed occurrences survive overnight, while pending, reopened and old occurrences are excluded',()=>{
 const state=home(),task=state.tasks[0];assert.equal(selected(state,'second',next).length,1);assert.equal(selected(state,'second','2026-11-09').length,0);
 for(const completion of [{state:'pending',actorId:'creator'},{state:'open',actorId:'creator'},{state:'done'}]){task.completions[date]=completion;assert.equal(selected(state,'second').length,0)}
 task.completions[date]={state:'done',actorId:'creator'};assert.equal(taskDoneUpdates(visibleState(state,'second'),'second',{date:'2026-11-13',days:7,limit:Infinity}).length,1);
});

test('inbox shows one completion with the real actor and preserves read and removed history notifications',()=>{
 const state=home(anchor);state.history=[{id:'history-one',taskId:'shared',title:'Fictional shared task',ownerId:'creator',memberId:'creator',actorId:'creator',visibility:'family',allowedIds:[],date:anchor,time:'22:44',done:true}];
 let items=notificationItems(app(state,'second')).filter(n=>n.kind==='update');assert.equal(items.length,1);assert.equal(items[0].id,'done:shared:'+anchor);assert.equal(items[0].who,'creator');assert.match(items[0].title,/Creator did it/);
 state.profiles.second.readNotifications=['update:history-one'];assert.equal(notificationItems(app(state,'second')).find(n=>n.id==='done:shared:'+anchor).read,true);
 for(const id of ['update:history-one','done:shared:'+anchor]){state.profiles.second.dismissedNotifications=[id];assert.equal(notificationItems(app(state,'second')).filter(n=>n.kind==='update').length,0)}
 state.profiles.second.dismissedNotifications=[];state.profiles.second.notificationPrefs={categories:{tasks:{enabled:false}}};assert.equal(notificationItems(app(state,'second')).filter(n=>n.kind==='update').length,0,'history cannot bypass category opt-out');
 assert.equal(notificationItems(app(state,'creator')).filter(n=>n.kind==='update').length,0);
});

test('Push defers the shared-task completion until morning and never leaks a private task',()=>{
 const state=home(),key='done:shared:'+date;
 assert.ok(!pushMessages(state,'second',{date,time:'22:44'},'parent').some(m=>m.key===key));
 const messages=pushMessages(state,'second',{date:next,time:'07:00'},'parent').filter(m=>m.key===key);assert.equal(messages.length,1);assert.match(messages[0].body,/Creator completed/);assert.match(messages[0].url,/date=2026-11-07/);
 state.profiles.second.notificationPrefs={categories:{tasks:{quietStart:'18:00',quietEnd:'09:00'}}};assert.ok(!pushMessages(state,'second',{date:next,time:'07:00'},'parent').some(m=>m.key===key));assert.ok(pushMessages(state,'second',{date:next,time:'09:00'},'parent').some(m=>m.key===key));
 state.profiles.second.notificationPrefs={categories:{tasks:{quietStart:'00:00',quietEnd:'00:00'}}};assert.ok(pushMessages(state,'second',{date,time:'22:44'},'parent').some(m=>m.key===key),'category quiet hours override the defaults');
 state.tasks[0].visibility='private';state.tasks[0].allowedIds=[];state.tasks[0].memberIds=['creator'];state.tasks[0].memberId='creator';assert.ok(!pushMessages(state,'second',{date:next,time:'07:00'},'parent').some(m=>m.key===key));
});

test('confirmed shared completion is delivered once to each linked assignee on Telegram and Push after quiet hours',async()=>{
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const state=home(),calls=[],env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OUTBOUND_FETCH:async(url,options)=>{calls.push({method:new URL(url).pathname.split('/').at(-1),body:JSON.parse(options.body)});return Response.json({ok:true,result:{message_id:calls.length}})}};
 try{
  for(const member of members.filter(m=>m.role!=='child')){
   await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(member.id,member.name).run();
   await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('home',member.id,member.id,member.role,new Date().toISOString()).run();
   await DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,linked_at) VALUES(?,?,?,?,?)').bind('home',member.id,member.id+'-chat',member.id+'-telegram',new Date().toISOString()).run();
   const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
   await DB.prepare('INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?,?)').bind(member.id,'home',member.id,'https://fcm.googleapis.com/fixture/'+member.id,Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),Buffer.alloc(16,1).toString('base64url'),0).run();
   await bindTestSession(DB,'home',member.id);
  }
  await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,1)').bind('home',JSON.stringify(state)).run();
  await DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind('home',await encryptKey('fictional-token',env,'telegram:home'),'1','fictional_bot','fixture-hook','fixture-hash','creator',new Date().toISOString()).run();
  const pushCalls=[],fetcher=async url=>{pushCalls.push(String(url));return new Response(null,{status:201})},options={fetcher,loadHome:async()=>({state}),subject:'https://home.example'};
  const night=new Date('2026-11-07T20:44:00Z'),morning=new Date('2026-11-08T05:00:00Z');
  assert.equal((await deliverReminders(env,night)).sent,0);assert.equal((await deliverPush(env,night,options)).sent,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').first()).n,0,'quiet hours do not claim and lose the message');
  assert.equal((await deliverReminders(env,morning)).sent,2);assert.equal((await deliverPush(env,morning,options)).sent,2);
  const sent=calls.filter(c=>c.method==='sendMessage');assert.deepEqual(sent.map(c=>c.body.chat_id).sort(),['second-chat','third-chat']);assert.ok(sent.every(c=>c.body.text.includes('Creator')&&c.body.text.includes('Fictional shared task')));
  assert.deepEqual(pushCalls.sort(),['https://fcm.googleapis.com/fixture/second','https://fcm.googleapis.com/fixture/third']);
  const deliveries=(await DB.prepare('SELECT member_id,channel,delivery_key,status FROM notification_deliveries ORDER BY member_id,channel').all()).results;
  // Telegram tidy-up (2026-11-12): Telegram also keeps one "group:<who>:<date>" row per reader for the one message that updates itself.
  const own=deliveries.filter(d=>!d.delivery_key.startsWith('group:'));assert.equal(own.length,4);assert.ok(own.every(d=>d.status==='sent'&&d.delivery_key==='done:shared:'+date));
  assert.deepEqual(deliveries.filter(d=>d.delivery_key.startsWith('group:')).map(d=>d.channel+':'+d.member_id).sort(),['telegram:second','telegram:third']);
  assert.equal((await deliverReminders(env,morning)).sent,0);assert.equal((await deliverPush(env,morning,options)).sent,0);assert.equal(calls.filter(c=>c.method==='sendMessage').length,2);assert.equal(pushCalls.length,2);
 }finally{DB.close()}
});
