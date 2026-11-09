// Several reminders on one event or task (Google-style: up to 5, up to 4 weeks before, all-day "N days before at HH:MM").
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {blankState,visibleState} from '../app/cloud/state.mjs';
import {dueReminders} from '../app/cloud/reminders.mjs';
import {pushMessages,deliverPush} from '../app/cloud/push.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey} from '../app/cloud/util.mjs';
import {bindTestSession} from './fixtures/security-session.mjs';
import {anchor} from '../app/src/data.js';
import {validateRecord,validateNotificationPrefs} from '../shared/state-validation.mjs';
import {ownReminders,defaultReminders,effectiveReminders,normalizeReminders,leadLabel,whenLabel,splitLead,allDayLead,shiftDate} from '../shared/item-reminders.mjs';

const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-multi-reminders-'));
await require('esbuild').build({entryPoints:{telegram:new URL('../app/cloud/telegram.mjs',import.meta.url).pathname,notifications:new URL('../app/src/notifications.jsx',import.meta.url).pathname},outdir:scratch,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node22',loader:{'.css':'empty'},banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {deliverReminders}=await import(pathToFileURL(join(scratch,'telegram.mjs'))),{notificationItems}=await import(pathToFileURL(join(scratch,'notifications.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const members=[{id:'mom',name:'Mom',role:'parent'},{id:'dad',name:'Dad',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const day='2026-11-12';
function home(){
 const d=blankState('home','Fictional household',members[0]);d.members=structuredClone(members);
 for(const m of members)d.profiles[m.id]={name:m.name,locale:'en'};
 const r=(id,extra)=>({id,title:id,he:id,ownerId:'mom',visibility:'family',allowedIds:[],date:day,repeat:'once',...extra});
 d.events=[r('dentist',{time:'16:30',memberIds:['mom','dad'],reminders:[4320,1440,10]}),r('dad-private',{time:'16:30',memberIds:['dad'],ownerId:'dad',visibility:'private',reminders:[1440]}),r('birthday',{memberIds:['mom'],reminders:[900]}),r('all-day-plain',{memberIds:['mom']})];
 d.tasks=[r('forms',{time:'09:00',memberId:'mom',reminders:[2880]})];
 return d;
}
const due=(state,who,date,time)=>dueReminders(visibleState(state,who),who,{date,time});
const ids=list=>list.map(x=>x.record.id+'@'+x.lead);

test('model: a list wins, the older single reminder is still read, and defaults can be lists',()=>{
 assert.deepEqual(ownReminders({time:'10:00',reminders:[10,4320,10,1440]}),[4320,1440,10]);
 assert.deepEqual(ownReminders({time:'10:00',reminders:[]}),[]);
 assert.deepEqual(ownReminders({time:'10:00',reminder:30}),[30]);
 assert.deepEqual(ownReminders({time:'10:00',reminder:'none'}),[]);
 assert.equal(ownReminders({time:'10:00'}),null);
 assert.equal(ownReminders({time:'10:00',reminder:''}),null);
 assert.deepEqual(ownReminders({reminder:30}),[],'untimed items ignore the older single reminder, as before');
 assert.deepEqual(ownReminders({reminders:[900,-540]}),[900,-540],'all-day leads may fall on the same day');
 assert.deepEqual(ownReminders({time:'10:00',reminders:[-540,10]}),[10],'timed items never remind after the start');
 assert.deepEqual(defaultReminders({}),[10]);
 assert.deepEqual(defaultReminders({reminder:30}),[30]);
 assert.deepEqual(defaultReminders({reminder:30,categories:{events:{reminder:5}}},'events'),[5]);
 assert.deepEqual(defaultReminders({reminder:30,categories:{events:{reminders:[1440,10]}}},'events'),[1440,10]);
 assert.deepEqual(defaultReminders({reminders:[60],categories:{tasks:{reminders:[]}}},'tasks'),[]);
 assert.deepEqual(normalizeReminders([1,2,3,4,5,6,7]),[7,6,5,4,3],'at most five');
 assert.equal(effectiveReminders({time:'10:00',reminder:30},{}).legacy,true);
 assert.equal(effectiveReminders({time:'10:00',reminders:[30]},{}).legacy,false);
});

test('labels: units, all-day times and how far away the item is, in English and Hebrew',()=>{
 assert.equal(leadLabel(4320,'en'),'3 days before');assert.equal(leadLabel(1440,'he'),'יום לפני');assert.equal(leadLabel(10080,'en'),'1 week before');assert.equal(leadLabel(120,'he'),'שעתיים לפני');assert.equal(leadLabel(0,'en'),'At the start time');
 assert.equal(leadLabel(900,'en',{allDay:true}),'1 day before at 09:00');assert.equal(leadLabel(-540,'he',{allDay:true}),'ביום עצמו ב־09:00');
 assert.deepEqual(splitLead(2340,{allDay:true}),{days:2,time:'09:00'});assert.equal(allDayLead(1,'17:00'),420);
 const now={date:'2026-11-11',time:'16:30'};
 assert.equal(whenLabel({date:day,time:'16:30'},now,'en'),'Tomorrow at 16:30');
 assert.equal(whenLabel({date:day,time:'16:30'},now,'he'),'מחר ב־16:30');
 assert.match(whenLabel({date:day,time:'16:30'},{date:'2026-11-09',time:'16:30'},'en'),/^In 3 days · .*Nov.* at 16:30$/);
 assert.match(whenLabel({date:day,time:'16:30'},{date:'2026-11-09',time:'16:30'},'he'),/^בעוד 3 ימים · .* ב־16:30$/);
 assert.equal(whenLabel({date:day,time:'16:30'},{date:day,time:'16:20'},'en'),'in 10 min');
 assert.equal(whenLabel({date:day,time:''},{date:'2026-11-11',time:'09:00'},'en'),'Tomorrow');
});

test('validation: up to five different reminders, up to four weeks; defaults cannot be negative',()=>{
 const event={id:'e',title:'E',date:day,time:'10:00',reminders:[4320,1440,10]};
 validateRecord('events',event);validateRecord('tasks',{...event,reminders:[]});validateRecord('events',{...event,time:undefined,reminders:[900,-540]});
 for(const reminders of [[1,2,3,4,5,6],[10,10],[40321],[-1440],[1.5],['10'],10])assert.throws(()=>validateRecord('events',{...event,reminders}),undefined,JSON.stringify(reminders));
 validateNotificationPrefs({categories:{events:{reminders:[1440,10]}},reminders:[10]});
 assert.throws(()=>validateNotificationPrefs({categories:{events:{reminders:[-540]}}}));
 assert.throws(()=>validateNotificationPrefs({reminders:[1,2,3,4,5,6]}));
});

test('each reminder fires at its own time across days, with its own key, until the next one is due',()=>{
 const state=home();state.events=state.events.filter(e=>e.id==='dentist');state.tasks=[];
 assert.deepEqual(ids(due(state,'mom','2026-11-09','16:29')),[]);
 const first=due(state,'mom','2026-11-09','16:30');assert.deepEqual(ids(first),['dentist@4320']);
 assert.equal(first[0].key,'event:dentist:'+day+':16:30:4320');assert.equal(first[0].date,day);
 assert.deepEqual(ids(due(state,'mom','2026-11-10','12:00')),['dentist@4320'],'a missed tick may still send it, only until the next reminder');
 assert.deepEqual(ids(due(state,'mom','2026-11-11','09:00')),['dentist@4320']);
 assert.deepEqual(ids(due(state,'mom','2026-11-11','16:30')),['dentist@1440']);
 assert.deepEqual(ids(due(state,'mom','2026-11-12','16:20')),['dentist@10']);
 assert.deepEqual(ids(due(state,'mom','2026-11-12','16:35')),['dentist@10']);
 assert.deepEqual(ids(due(state,'mom','2026-11-12','16:36')),[]);
 assert.deepEqual(new Set(['2026-11-09 16:30','2026-11-11 16:30','2026-11-12 16:20'].map(t=>due(state,'mom',...t.split(' ')).find(x=>x.record.id==='dentist').key)).size,3);
});

test('the older single reminder and single default keep their exact former timing',()=>{
 const state=home();state.tasks=[];state.events=[{id:'early',title:'early',ownerId:'mom',visibility:'family',allowedIds:[],memberIds:['mom'],date:day,time:'00:30',reminder:60}];state.profiles.mom.notificationPrefs={quietStart:'00:00',quietEnd:'00:00'};
 assert.deepEqual(ids(due(state,'mom','2026-11-11','23:30')),[],'never on the previous day');
 assert.deepEqual(ids(due(state,'mom',day,'00:00')),['early@60']);
 delete state.events[0].reminder;state.profiles.mom.notificationPrefs.reminder=15;
 assert.deepEqual(ids(due(state,'mom',day,'00:15')),['early@15']);assert.equal(due(state,'mom',day,'00:15')[0].key,'event:early:'+day+':00:30:15');
 state.profiles.mom.notificationPrefs={quietStart:'00:00',quietEnd:'00:00',categories:{events:{reminders:[1440,10]}}};
 assert.deepEqual(ids(due(state,'mom','2026-11-11','00:30')),['early@1440'],'a default list adds the day-before reminder');
 assert.deepEqual(ids(due(state,'mom',day,'00:20')),['early@10']);
});

test('quiet hours hold a reminder until they end; only the newest due reminder is sent',()=>{
 const state=home();state.events=[{id:'late',title:'late',ownerId:'mom',visibility:'family',allowedIds:[],memberIds:['mom'],date:day,time:'22:00',reminders:[4320,1440,10]}];state.tasks=[];
 assert.deepEqual(ids(due(state,'mom','2026-11-09','22:00')),[],'default quiet hours 20:30–07:00');
 assert.deepEqual(ids(due(state,'mom','2026-11-10','07:00')),['late@4320']);
 assert.deepEqual(ids(due(state,'mom','2026-11-12','07:00')),['late@1440'],'the three-day reminder is not sent after the day-before one is due');
 assert.deepEqual(ids(due(state,'mom','2026-11-12','21:50')),[],'a reminder inside quiet hours is not sent late at night');
 state.profiles.mom.notificationPrefs={categories:{events:{enabled:false}}};assert.deepEqual(ids(due(state,'mom','2026-11-10','07:00')),[]);
});

test('access, completion and all-day rules apply to every reminder',()=>{
 const state=home();
 assert.ok(!due(state,'mom','2026-11-11','16:30').some(x=>x.record.id==='dad-private'),'someone else’s private event never reaches a reminder');
 assert.ok(due(state,'dad','2026-11-11','16:30').some(x=>x.record.id==='dad-private'));
 assert.deepEqual(ids(due(state,'kid','2026-11-11','16:30')),[],'not assigned');
 const bday=due(state,'mom','2026-11-11','09:00').find(x=>x.record.id==='birthday');assert.equal(bday.key,'event:birthday:'+day+'::900');
 assert.ok(!due(state,'mom','2026-11-11','08:59').some(x=>x.record.id==='birthday'));
 for(const t of ['00:00','09:00','12:00'])assert.ok(!due(state,'mom',day,t).some(x=>x.record.id==='all-day-plain'),'untimed items without their own reminders stay silent');
 state.tasks[0].completions={[day]:{state:'done'}};assert.ok(!due(state,'mom','2026-11-10','09:00').some(x=>x.record.id==='forms'),'a done occurrence is not reminded');
});

test('Push and Telegram text say how far away the item is',()=>{
 const state=home(),push=pushMessages(state,'mom',{date:'2026-11-11',time:'16:30'},'parent').find(m=>m.key.startsWith('event:dentist'));
 assert.equal(push.body,'Event · Tomorrow at 16:30');assert.match(push.url,/date=2026-11-12/);
 state.profiles.mom.locale='he';assert.equal(pushMessages(state,'mom',{date:'2026-11-11',time:'16:30'},'parent').find(m=>m.key.startsWith('event:dentist')).body,'אירוע · מחר ב־16:30');
 assert.equal(pushMessages(state,'mom',{date:day,time:'16:20'},'parent').find(m=>m.key.startsWith('event:dentist')).body,'אירוע · 16:30 · בעוד 10 דק׳');
});

test('in-app inbox shows a later occurrence once its reminder is due, with the distance',()=>{
 const tomorrow=shiftDate(anchor,1),later=shiftDate(anchor,2),state=blankState('home','Fictional household',members[0]);state.members=structuredClone(members);for(const m of members)state.profiles[m.id]={name:m.name,locale:'en'};
 const r=(id,extra)=>({id,title:id,ownerId:'mom',visibility:'family',allowedIds:[],memberIds:['mom'],repeat:'once',...extra});
 state.events=[r('soon',{date:tomorrow,time:'23:59',reminders:[2880]}),r('not-yet',{date:later,time:'00:00',reminders:[1440]}),r('plain',{date:tomorrow,time:'23:59'})];
 const app={data:state,user:'mom',lang:'en',today:anchor,T:en=>en,visible:x=>x,name:id=>id,member:id=>members.find(m=>m.id===id),text:x=>x.title};
 const ahead=notificationItems(app).filter(n=>n.id.startsWith('ahead:'));
 assert.deepEqual(ahead.map(n=>n.id),['ahead:event:soon:'+tomorrow+':23:59:2880']);assert.equal(ahead[0].detail,'Tomorrow at 23:59');assert.equal(ahead[0].kind,'reminder');
 state.profiles.mom.notificationPrefs={categories:{events:{enabled:false}}};assert.equal(notificationItems(app).filter(n=>n.id.startsWith('ahead:')).length,0);
});

test('each reminder is delivered once per person on Telegram and Push',async()=>{
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const state=home(),calls=[],env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OUTBOUND_FETCH:async(url,options)=>{calls.push({method:new URL(url).pathname.split('/').at(-1),body:JSON.parse(options.body)});return Response.json({ok:true,result:{message_id:calls.length}})}};
 state.events=state.events.filter(e=>e.id==='dentist');state.tasks=[];state.events[0].memberIds=['mom'];
 try{
  await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind('mom','Mom').run();
  await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('home','mom','mom','parent',new Date().toISOString()).run();
  await DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,linked_at) VALUES(?,?,?,?,?)').bind('home','mom','mom-chat','mom-telegram',new Date().toISOString()).run();
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  await DB.prepare('INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?,?)').bind('mom','home','mom','https://fcm.googleapis.com/fixture/mom',Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),Buffer.alloc(16,1).toString('base64url'),0).run();
  await bindTestSession(DB,'home','mom');
  await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,1)').bind('home',JSON.stringify(state)).run();
  await DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind('home',await encryptKey('fictional-token',env,'telegram:home'),'1','fictional_bot','fixture-hook','fixture-hash','mom',new Date().toISOString()).run();
  const pushCalls=[],options={fetcher:async url=>{pushCalls.push(String(url));return new Response(null,{status:201})},loadHome:async()=>({state}),subject:'https://home.example'};
  // Jerusalem is UTC+2 in November.
  const at=(local)=>new Date(local.replace(' ','T')+':00+02:00');
  for(const [tick,text] of [['2026-11-09 16:30','In 3 days'],['2026-11-11 16:30','Tomorrow at 16:30'],['2026-11-12 16:20','in 10 min']]){
   const before=calls.length;
   assert.equal((await deliverReminders(env,at(tick))).sent,1,tick);assert.equal((await deliverPush(env,at(tick),options)).sent,1,tick);
   assert.ok(calls.at(-1).body.text.includes(text),calls.at(-1).body.text);
   assert.equal((await deliverReminders(env,at(tick))).sent,0,'claimed once');assert.equal((await deliverPush(env,at(tick),options)).sent,0);
   assert.equal(calls.filter(c=>c.method==='sendMessage').length-calls.slice(0,before).filter(c=>c.method==='sendMessage').length,1);
  }
  const keys=(await DB.prepare("SELECT channel,delivery_key FROM notification_deliveries ORDER BY channel,delivery_key").all()).results;
  assert.deepEqual(keys.map(k=>k.channel+' '+k.delivery_key.split(':').at(-1)),['push 10','push 1440','push 4320','telegram 10','telegram 1440','telegram 4320']);
  const done=calls.filter(c=>c.method==='sendMessage').map(c=>JSON.stringify(c.body.reply_markup||{}));assert.ok(!done[0].includes('✓ Done'),'events have no Done button');
 }finally{DB.close()}
});
