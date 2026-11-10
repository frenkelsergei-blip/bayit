import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {applyChanges,blankState,visibleState} from '../app/cloud/state.mjs';
import {loadHousehold,commitAsMember} from '../app/cloud/assistant.mjs';
import {handleGoogleCalendar,googleCalendarCallback,suggestedAvailableMember} from '../app/cloud/google-calendar.mjs';
import {handleMessagePlan} from '../app/cloud/message-plan.mjs';
import {handleHomeSuggestions} from '../app/cloud/home-suggestions.mjs';
import {handleVouchers} from '../app/cloud/vouchers.mjs';
import {searchVouchers,voucherDeliveryMessages} from '../app/cloud/voucher-delivery.mjs';
import {exportGoogleEvent,localEventTime} from '../shared/google-calendar.mjs';
import {voucherSecret} from '../shared/vouchers.mjs';
import {encryptKey} from '../app/cloud/util.mjs';
import {dueReminders} from '../app/cloud/reminders.mjs';

async function fixture(t) {
 const DB=openD1(':memory:');
 t.after(()=>DB.close());
 migrate(DB,fileURLToPath(new URL('../app/cloud/migrations/',import.meta.url)));
 const alice={id:'a',role:'parent',name:'Alice',he:'Alice'}, bob={id:'b',role:'adult',name:'Bob',he:'Bob'};
 const state=blankState('home','Household',alice);
 state.members.push(bob);
 state.profiles.b={name:'Bob',notificationPrefs:{},locale:'en'};
 await DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Household','a','2026-11-09').run();
 await DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state)).run();
 for (const member of [alice,bob]) {
  await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(member.id,member.name).run();
  await DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home',member.id,member.id,member.role,'2026-11-09').run();
 }
 const env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64'),GOOGLE_CALENDAR_CLIENT_ID:'test-calendar',GOOGLE_CALENDAR_CLIENT_SECRET:'test-secret'};
 const home=async (id='a')=>({...await loadHousehold(env,'home'),membership:{user_id:id,member_id:id,role:id==='a'?'parent':'adult'}});
 return {env,home};
}
const request=(path,body,method=body?'POST':'GET')=>new Request('https://bayit.example.test'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const json = value => Response.json(value);

test('selected Google events import and follow, and a Bayit event exports once', async t => {
 const {env,home}=await fixture(t);
 let scope='',title='Pickup',cancelled=false,copies=0,updates=0,firstTimeMin;
 const event=()=>({id:'remote',summary:title,status:cancelled?'cancelled':'confirmed',start:{dateTime:'2026-11-09T16:30:00+02:00'},end:{dateTime:'2026-11-09T17:00:00+02:00'}});
 env.OUTBOUND_FETCH=async (url,options)=>{
  const {pathname,searchParams}=new URL(url);
  if (pathname==='/token') {assert.equal(typeof options.body,'string');return json({scope,refresh_token:'secret-refresh',access_token:'test-access'});}
  if (pathname.endsWith('/freeBusy')) return json({calendars:{'fixture-primary@example.test':{busy:[]}}});
  if (pathname==='/revoke') return new Response(null,{status:200});
  if (pathname.endsWith('/calendarList')) return json({items:[{id:'primary',summary:'Personal',primary:true}]});
  if (pathname.endsWith('/primary/events/remote')) {
   assert.equal(searchParams.get('fields'),'id,summary,start,end,status');
   return json(event());
  }
  if (pathname.endsWith('/primary/events')) {
   if (searchParams.get('pageToken')) {
    assert.equal(searchParams.get('pageToken'),'next-page');
    assert.equal(searchParams.get('timeMin'),firstTimeMin);
    return json({items:[]});
   }
   firstTimeMin=searchParams.get('timeMin');
   return json({nextPageToken:'next-page',items:[event(),{...event(),id:'multi',start:{date:'2026-11-09'},end:{date:'2026-11-12'}}]});
  }
  if (pathname==='/calendar/v3/calendars'&&options.method==='POST') return json({id:'bayit-calendar'});
  if (pathname.endsWith('/bayit-calendar/events')&&options.method==='POST') {copies++;return json({id:JSON.parse(options.body).id});}
  if (pathname.includes('/bayit-calendar/events/')&&options.method==='PATCH') {updates++;return json({id:'updated'});}
  throw Error(pathname);
 };
 const run=async(action,body,query='',actor='a')=>handleGoogleCalendar(request('/api/google-calendar/'+action+query,body),env,await home(actor),action);
 const oauth=new URL((await (await run('connect',{read:true,write:true})).json()).url);
 scope=oauth.searchParams.get('scope');
 assert.deepEqual(scope.split(' ').map(item=>item.replace('https://www.googleapis.com/auth/calendar.','')),
  ['freebusy','calendarlist.readonly','events.readonly','app.created']);
 const path='/api/google-calendar/callback?state='+oauth.searchParams.get('state')+'&code=example';
 await assert.rejects(googleCalendarCallback(request(path),env,{id:'b'}),{status:400});
 assert.match((await googleCalendarCallback(request(path),env,{id:'a'})).headers.get('location'),/calendar=connected/);
 await assert.rejects(googleCalendarCallback(request(path),env,{id:'a'}),{status:400});
 assert.equal((await (await run('status',undefined,'','b')).json()).connected,false);
 assert.equal(await suggestedAvailableMember(env,await home(),'2026-11-09','16:30',['a']),null);
 await run('sharing',{enabled:true});
 assert.equal(await suggestedAvailableMember(env,await home(),'2026-11-09','16:30',['a']),'a');
 const preview=await (await run('events',undefined,'?calendar=primary')).json();
 assert.deepEqual(preview.events.map(i=>i.id),['remote']);
 assert.deepEqual((await (await run('events',undefined,'?'+new URLSearchParams({calendar:'primary',page:preview.next}))).json()).events,[]);
 assert.equal((await home()).state.events.length,0);
 const {id}=await (await run('import',{calendar:'primary',remote:'remote',follow:true})).json();
 assert.equal((await home()).state.events[0].visibility,'private');
 assert.equal((await home()).state.events[0].time,'16:30');
 title='New pickup';
 assert.equal((await (await run('sync',{id})).json()).status,'synced');
 assert.equal((await home()).state.events[0].title,title);
 cancelled=true;
 assert.equal((await (await run('sync',{id})).json()).status,'unavailable');
 assert.equal((await home()).state.events[0].title,title);
 await run('unlink',{id});
 assert.equal((await (await run('export',{id})).json()).status,'synced');
 await run('export',{id});
 assert.equal(copies,1);
 await commitAsMember(env,await home(),'a',data=>{data.events[0].time='18:00';});
 await run('sync',{id});
 assert.equal(updates,1);
 await run('disconnect',{});
 assert.equal((await (await run('status')).json()).connected,false);
 assert.equal((await home()).state.events.length,1);

 const availabilityOAuth=new URL((await (await run('connect',{},'','b')).json()).url);
 scope=availabilityOAuth.searchParams.get('scope');
 assert.equal(scope,'https://www.googleapis.com/auth/calendar.freebusy');
 const availabilityCallback='/api/google-calendar/callback?'+new URLSearchParams({state:availabilityOAuth.searchParams.get('state'),code:'example'});
 assert.match((await googleCalendarCallback(request(availabilityCallback),env,{id:'b'})).headers.get('location'),/calendar=connected/);
 await assert.rejects(run('calendars',undefined,'','b'),{status:403});
 await assert.rejects(run('export',{id},'','b'),{status:403});
});

test('manual plan and proactive changes require review and preserve ownership', async t => {
 const {env,home}=await fixture(t);
 const id=crypto.randomUUID();
 const apply=async (items,title='Trip preparation',actor='a')=>handleMessagePlan(request('/api/message-plan/apply',{id,title,items}),env,await home(actor),'apply');
 await assert.rejects(apply([{kind:'event',title:'Trip',date:'2026-11-09'}]),{status:400});
 await assert.rejects(apply([{kind:'task',title:'Undated chore',reminders:[0]}]),{status:400});
 await assert.rejects(apply([{kind:'task',title:'Timed chore',date:'2026-11-09',time:'17:00',reminders:[-540]}]),{status:400});
 assert.equal((await home()).state.tasks.length,0);
 const items=[{kind:'event',title:'Trip',date:'2026-11-09',allDay:true,reminders:[-540]},{kind:'task',title:'Old chore',date:'2025-01-02',assignees:['b']}];
 const saved=await (await apply(items)).json();
 assert.equal(saved.id,'intake-'+id);
 assert.deepEqual(await (await apply(items,'Different title')).json(),saved);
 await assert.rejects(apply(items,'Other person','b'),{status:409});
 let state=(await home()).state;
 const receipt=state.aiOperations[saved.id];
 assert.equal(receipt.title,'Trip preparation');
 assert.deepEqual(receipt.items,saved.items);
 assert.deepEqual(receipt.items.map(item=>item.collection),['events','tasks']);
 assert.deepEqual(state.events[0].reminders,[-540]);
 assert.equal(state.tasks[0].reminders,undefined);
 const ownerView=visibleState(state,'a'),otherView=visibleState(state,'b');
 assert.equal(otherView.aiOperations[saved.id],undefined);
 assert.equal(otherView.tasks[0].id,state.tasks[0].id);
 assert.equal(dueReminders(ownerView,'a',{date:'2026-11-09',time:'09:00'}).length,1);
 assert.equal(dueReminders(otherView,'b',{date:'2026-11-09',time:'09:00'}).length,0);
 assert.throws(()=>applyChanges(state,[{collection:'aiOperations',id:saved.id,value:{...receipt,ownerId:'b'}}],'b','adult'),/belongs to someone else/);
 assert.equal(state.events.length,1);
 assert.equal(state.tasks.length,1);
 assert.equal(state.tasks[0].visibility,'selected');
 assert.deepEqual(state.tasks[0].memberIds,['b']);
 const suggestion=async (action,body,actor='a')=>handleHomeSuggestions(request('/api/home-suggestions/'+action,body),env,await home(actor),action);
 assert.deepEqual((await (await suggestion('list')).json()).items,[]);
 await suggestion('preferences',{enabled:true});
 await suggestion('preferences',{enabled:true},'b');
 assert.deepEqual((await (await suggestion('list',undefined,'b')).json()).items,[]);
 const [old]= (await (await suggestion('list')).json()).items;
 assert.equal(old.kind,'stale');
 await suggestion('apply',{key:old.key,change:'done'});
 state=(await home()).state;
 assert.equal(state.tasks[0].completions['2025-01-02'].state,'done');
 assert.deepEqual((await (await suggestion('list')).json()).items,[]);
});

test('a saved plan reminds per item at the chosen time, retries do not duplicate, and a child never sees it', async t => {
 const {env,home}=await fixture(t);
 const kid={id:'k',role:'child',name:'Kid',he:'Kid'};
 const {state:start}=await loadHousehold(env,'home');
 start.members.push(kid);start.profiles.k={name:'Kid',notificationPrefs:{},locale:'en'};
 await env.DB.prepare('UPDATE household_data SET state=? WHERE household_id=?').bind(JSON.stringify(start),'home').run();
 await env.DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind('k','Kid').run();
 await env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home','k','k','child','2026-11-09').run();
 const id=crypto.randomUUID();
 const items=[
  {kind:'task',title:'Pack the bag',date:'2026-11-12',time:'19:00',reminders:[0]},
  {kind:'task',title:'Buy snacks',date:'2026-11-12',time:'18:00',reminders:[15],visibility:'family',assignees:['a']},
  {kind:'event',title:'Meet at the park',date:'2026-11-13',time:'10:00',reminders:[60],assignees:['b']},
  {kind:'task',title:'Charge the camera',date:'2026-11-12'}
 ];
 const apply=async ()=>handleMessagePlan(request('/api/message-plan/apply',{id,title:'Trip',items}),env,await home('a'),'apply');
 const first=await (await apply()).json();
 // A retry after a lost response (same plan id) returns the same receipt and adds nothing.
 assert.deepEqual(await (await apply()).json(),first);
 const state=(await home()).state;
 assert.equal(state.tasks.length,3);assert.equal(state.events.length,1);
 assert.equal(Object.values(state.aiOperations).filter(r=>r.status==='intake').length,1);
 const owner=visibleState(state,'a');
 const at=(view,member,date,time)=>dueReminders(view,member,{date,time}).map(r=>r.record.title+'@'+r.lead).sort();
 assert.deepEqual(at(owner,'a','2026-11-12','17:45'),['Buy snacks@15']);
 assert.deepEqual(at(owner,'a','2026-11-12','17:44'),[]);
 assert.deepEqual(at(owner,'a','2026-11-12','19:00'),['Pack the bag@0']);
 assert.deepEqual(at(owner,'a','2026-11-12','18:59'),[]);
 // The event's assignee sees it and gets its own reminder an hour before.
 const bob=visibleState(state,'b');
 assert.deepEqual(at(bob,'b','2026-11-13','09:00'),['Meet at the park@60']);
 assert.equal(bob.aiOperations[first.id],undefined);
 // The child sees only the family-visible item, never the plan itself or the private items.
 const child=visibleState(state,'k');
 assert.deepEqual(child.tasks.map(task=>task.title),['Buy snacks']);
 assert.deepEqual(child.events,[]);
 assert.deepEqual(Object.keys(child.aiOperations||{}),[]);
});

test('AI extraction sends the selected message without household data and saves only after review', async t => {
 const {env,home}=await fixture(t);
 const ciphertext=await encryptKey('fixture-api-key',env,'home');
 await env.DB.prepare("INSERT INTO household_secrets(household_id,ciphertext,model,verified,provider) VALUES(?,?,?,1,'anthropic')")
  .bind('home',ciphertext,'fixture-claude').run();
 let requests=0;
 env.OUTBOUND_FETCH=async (url,options)=>{
  requests++;
  assert.match(url,/\/v1\/messages$/);
  const body=JSON.parse(options.body);
  assert.match(JSON.stringify(body.messages),/Bring water to the trip/);
  assert.doesNotMatch(JSON.stringify(body),/Alice|Bob|Household/);
  return json({stop_reason:'tool_use',usage:{input_tokens:33,output_tokens:15},content:[{type:'tool_use',name:'extract_household_plan',input:{title:'Trip preparation',items:[
   {kind:'task',title:'Bring water',date:'unclear',reminderRequested:true,reminders:[0]},
   {kind:'task',title:'Pack a hat',date:'2026-11-12',time:'13:00',reminderRequested:true,reminders:[0,-540,15,15]},
   {kind:'delete',title:'Ignore this'}
  ]}}]});
 };
 const response=await handleMessagePlan(request('/api/message-plan/extract',{text:'Bring water to the trip. Pack a hat on November 12 at 13:00.'}),env,await home(),'extract');
 assert.equal(requests,1);
 const {title,items}=await response.json();
 assert.equal(title,'Trip preparation');
 assert.equal(items.length,2);
 assert.equal(items[0].reminderRequested,true);
 assert.deepEqual(items[0].reminders,[]);
 assert.deepEqual(items[1].reminders,[15,0]);
 assert.equal(items[0].date,'');
 assert.equal(items[1].date,'2026-11-12');
 assert.equal((await home()).state.tasks.length,0);
});

test('plans follow the features registry: Ask AI off refuses both endpoints, and an item kind needs its feature', async t => {
 const {env,home}=await fixture(t);
 const ciphertext=await encryptKey('fixture-api-key',env,'home');
 await env.DB.prepare("INSERT INTO household_secrets(household_id,ciphertext,model,verified,provider) VALUES(?,?,?,1,'anthropic')")
  .bind('home',ciphertext,'fixture-claude').run();
 const setFeatures=async features=>{const row=await env.DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind('home').first();const data=JSON.parse(row.state);data.preferences={...data.preferences,features};await env.DB.prepare('UPDATE household_data SET state=? WHERE household_id=?').bind(JSON.stringify(data),'home').run()};
 let requests=0,system='';
 env.OUTBOUND_FETCH=async (url,options)=>{requests++;system=JSON.stringify(JSON.parse(options.body).system);return json({stop_reason:'tool_use',usage:{input_tokens:9,output_tokens:9},content:[{type:'tool_use',name:'extract_household_plan',input:{title:'Trip',items:[
  {kind:'event',title:'Drive to the lake',date:'2026-11-13',time:'09:30'},{kind:'task',title:'Pack the cooler',date:'2026-11-12'}]}}]})};
 const extract=async ()=>handleMessagePlan(request('/api/message-plan/extract',{text:'Lake trip on Friday, pack the cooler Thursday.'}),env,await home(),'extract');
 const apply=async (items,id=crypto.randomUUID())=>handleMessagePlan(request('/api/message-plan/apply',{id,title:'Trip',items}),env,await home(),'apply');
 const event={kind:'event',title:'Drive to the lake',date:'2026-11-13',time:'09:30'},task={kind:'task',title:'Pack the cooler',date:'2026-11-12'};

 await setFeatures({ai:false,tasks:true,calendar:true});
 await assert.rejects(extract(),{status:403,message:/Ask AI is turned off/});
 await assert.rejects(apply([task]),{status:403,message:/Ask AI is turned off/});
 assert.equal(requests,0);

 await setFeatures({ai:true,tasks:false,calendar:true});
 const draft=await (await extract()).json();
 assert.match(system,/events only/);
 assert.deepEqual(draft.items.map(item=>item.kind),['event']);
 await assert.rejects(apply([event,task]),{status:403,message:/Tasks is turned off/});
 assert.equal((await home()).state.events.length,0);
 assert.equal((await (await apply([event])).json()).items.length,1);

 await setFeatures({ai:true,tasks:false,calendar:false});
 await assert.rejects(extract(),{status:403,message:/Tasks and Calendar are turned off/});
 assert.equal(requests,1);
 const state=(await home()).state;
 assert.equal(state.events.length,1);
 assert.equal(state.tasks.length,0);
});

test('voucher reminders and search resolve only the linked account and never expose a pass secret', async t => {
 const {env,home}=await fixture(t);
 const id=crypto.randomUUID(),path='/api/vouchers/'+id;
 const payload={version:0,merchant:'Store',balanceCents:1500,expiresOn:'2026-11-16',reminderDays:7,reminderTelegram:true,secret:{
  code:'000123',format:'CODE_128',apple:'https://issuer.test/voucher.pkpass',google:'https://pay.google.com/gp/v/save/test-token'
 }};
 await handleVouchers(request(path,payload,'PUT'),env,await home(),path);
 const options={date:'2026-11-09',time:'12:00',channel:'telegram'};
 const results=await voucherDeliveryMessages(env,await home(),'a',options);
 assert.equal(results.length,1);
 assert.doesNotMatch(JSON.stringify(results),/000123|pkpass|test-token/);
 assert.deepEqual(await voucherDeliveryMessages(env,await home(),'b',options),[]);
 assert.deepEqual(await voucherDeliveryMessages(env,await home(),'a',{...options,time:'23:00'}),[]);
 assert.deepEqual(await voucherDeliveryMessages(env,await home(),'a',{...options,channel:'push'}),[]);
 assert.equal((await searchVouchers(env,await home(),'a','store','2026-11-09')).length,1);
 assert.deepEqual(await searchVouchers(env,await home(),'b','store','2026-11-09'),[]);
 assert.throws(()=>voucherSecret({google:'https://pay.google.com.example.test/gp/v/save/token'}),/VOUCHER_INVALID_WALLET/);
});

test('Google timing uses the home zone and exports one non-recurring event', () => {
 assert.equal(localEventTime('2026-11-09','16:30'),'2026-11-09T14:30:00.000Z');
 assert.equal(localEventTime('2026-07-09','16:30'),'2026-07-09T13:30:00.000Z');
 assert.deepEqual(exportGoogleEvent({title:'All day',date:'2026-11-09',time:''}),{summary:'All day',start:{date:'2026-11-09'},end:{date:'2026-11-10'}});
 assert.equal(exportGoogleEvent({title:'Weekly',date:'2026-11-09',time:'16:30',repeat:'weekly'}),null);
});
