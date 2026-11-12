// Telegram full audit (2026-11-08). Drives the real webhook and reminder tick with a fake Telegram Bot API and an
// in-memory database; nothing reaches Telegram. Starts from the user's report: an event days away was described as
// "in 2 hours" with "Snooze 10 min".
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,hash,localDate} from '../app/cloud/util.mjs';
import {blankState} from '../app/cloud/state.mjs';
// Telegram tidy-up (2026-11-12): every line starts with a direction mark (English too), Hebrew in English text is isolated.
const plain=s=>String(s).replace(/\u200e/g,'').replace(/\u2068([^\u2069]*)\u2069/g,'$1');
import {FEATURE_IDS} from '../shared/features.mjs';
import {whenLabel} from '../shared/item-reminders.mjs';
import {snoozable,snoozeStillDue} from '../app/cloud/reminders.mjs';
import {alertCard,dayReport} from '../app/cloud/telegram-format.mjs';
import {goalMessages} from '../shared/finance-goals.mjs';

const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-telegram-audit-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/telegram.mjs',import.meta.url).pathname],outdir:scratch,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {handleTelegramWebhook,deliverReminders}=await import(pathToFileURL(join(scratch,'telegram.mjs')));
after(()=>rm(scratch,{recursive:true,force:true}));

const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const record=(id,extra)=>({id,ownerId:'mom',visibility:'family',allowedIds:[],repeat:'once',...extra});
// Fictional household: Maya (parent, Hebrew), Dan (parent, English), Noa (child, Hebrew). Each has a linked chat.
async function fixture(build){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const sent=[],env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64')};
 const members=[{id:'mom',name:'Maya',he:'מאיה',role:'parent'},{id:'dad',name:'Dan',he:'דן',role:'parent'},{id:'kid',name:'Noa',he:'נועה',role:'child'}];
 const state=blankState('home','Fictional household',members[0]);state.members=structuredClone(members);state.preferences.features=Object.fromEntries(FEATURE_IDS.map(id=>[id,true])); /* every feature on (features registry, 2026-11-09) */
 const prefs={quietStart:'23:00',quietEnd:'06:00'};
 state.profiles={mom:{name:'Maya',he:'מאיה',locale:'he',notificationPrefs:{...prefs}},dad:{name:'Dan',he:'דן',locale:'en',notificationPrefs:{...prefs}},kid:{name:'Noa',he:'נועה',locale:'he',notificationPrefs:{...prefs}}};
 build?.(state);
 for(const id of ['mom','dad']){await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,id).run();await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('home',id,id,'parent',new Date().toISOString()).run()}
 await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind('home',JSON.stringify(state)).run();
 const hook='audit-hook-123456789012345',secret='audit-webhook-secret',chats={mom:100,dad:200,kid:300};
 await DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind('home',await encryptKey('fictional-bot-token',env,'telegram:home'),'1','audit_bot',hook,await hash(secret),'mom',new Date().toISOString()).run();
 for(const [m,c] of Object.entries(chats))await DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,linked_at) VALUES(?,?,?,?,?)').bind('home',m,String(c),String(c+9000),new Date().toISOString()).run();
 env.OUTBOUND_FETCH=async(url,options)=>{const method=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body||'{}');sent.push({method,...body});return Response.json({ok:true,result:method==='sendMessage'?{message_id:sent.length}:true})};
 let update=0;
 const post=async content=>{const r=await handleTelegramWebhook(new Request('https://example.test/api/telegram/hook/'+hook,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:++update,...content})}),env,hook);assert.equal(r.status,200)};
 // Telegram apps report their own UI language; it is deliberately English here so the profile language must win.
 const say=(who,text)=>post({message:{message_id:update,from:{id:chats[who]+9000,language_code:'en'},chat:{id:chats[who],type:'private'},text}});
 const press=(who,data)=>post({callback_query:{id:'q'+update,from:{id:chats[who]+9000,language_code:'en'},message:{message_id:1,chat:{id:chats[who],type:'private'}},data}});
 const tick=(day,time)=>deliverReminders(env,new Date(day+'T'+time+':00+02:00')); // Jerusalem is UTC+2 in November.
 const load=async()=>JSON.parse((await DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind('home').first()).state);
 const save=s=>DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=?').bind(JSON.stringify(s),'home').run();
 const messages=(who,since=0)=>sent.slice(since).filter(x=>x.method==='sendMessage'&&String(x.chat_id)===String(chats[who]));
 const toasts=(since=0)=>sent.slice(since).filter(x=>x.method==='answerCallbackQuery').map(x=>x.text);
 const buttons=m=>(m?.reply_markup?.inline_keyboard||[]).flat();
 const upload=(who,document)=>post({message:{message_id:update,from:{id:chats[who]+9000,language_code:'en'},chat:{id:chats[who],type:'private'},document}});
 return {DB,env,sent,say,press,upload,tick,load,save,messages,toasts,buttons};
}

test('user report: a snoozed reminder for an event that was then moved 4 days later is not re-sent as "in 2 hours"',async()=>{
 const today=localDate(),f=await fixture(s=>{s.events=[record('cut',{title:'Family haircut',he:'תספורת משפחתית',date:today,time:'18:00',memberIds:['dad'],reminders:[120]})]});
 try{
  let mark=f.sent.length;await f.tick(today,'16:00');const first=f.messages('dad',mark)[0];
  assert.match(first.text,/<code>18:00<\/code>  <i>📅 Event reminder · in 2 h<\/i>/);const snooze=f.buttons(first).find(b=>/Snooze 10 min/.test(b.text));assert.ok(snooze,'a same-day event two hours away may be snoozed');
  await f.press('dad',snooze.callback_data);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM telegram_snoozes').first()).n,1);
  const moved=await f.load();moved.events[0].date=shift(today,4);await f.save(moved);
  await f.DB.prepare('UPDATE telegram_snoozes SET due_at=0').run();
  mark=f.sent.length;const result=await f.tick(today,'16:11');
  assert.deepEqual(f.messages('dad',mark).map(m=>m.text),[],'before the fix: "18:00 · in 1 h 49 min" for an event now 4 days away');
  assert.equal(result.suppressed,1);
  // The moved event keeps its own correct reminders on its new date.
  mark=f.sent.length;await f.tick(shift(today,4),'16:00');assert.match(f.messages('dad',mark)[0].text,/<code>18:00<\/code>  <i>📅 Event reminder · in 2 h<\/i>/);
 }finally{f.DB.close()}
});

test('a reminder days ahead states the real distance and offers no 10-minute snooze; on the day it does',async()=>{
 const day='2026-11-10',f=await fixture(s=>{s.events=[record('cut',{title:'Family haircut',he:'תספורת משפחתית',date:day,time:'16:00',memberIds:['mom','dad','kid'],reminders:[5760,120]})]});
 try{
  let mark=f.sent.length;await f.tick('2026-11-06','16:00');
  const en=f.messages('dad',mark)[0],he=f.messages('mom',mark)[0];
  assert.equal(plain(en.text),'🔔 <b>Family haircut</b>\n<blockquote><b>In 4 days · Tue 10 Nov at 16:00</b>  <i>📅 Event reminder</i></blockquote>');
  assert.equal(he.text,'‏🔔 <b>תספורת משפחתית</b>\n<blockquote>‏<b>בעוד 4 ימים · יום ג׳, 10 בנוב׳ ב־16:00</b>  <i>📅 תזכורת לאירוע</i></blockquote>');
  for(const m of [en,he,f.messages('kid',mark)[0]]){assert.deepEqual(f.buttons(m),[],'no snooze for a later day');assert.doesNotMatch(m.text,/in \d+ h|בעוד שעתיים|בעוד \d+ שעות/)}
  mark=f.sent.length;await f.tick(day,'14:00');
  assert.equal(plain(f.messages('dad',mark)[0].text),'🔔 <b>Family haircut</b>\n<blockquote><code>16:00</code>  <i>📅 Event reminder · in 2 h</i></blockquote>');
  assert.equal(f.messages('mom',mark)[0].text,'‏🔔 <b>תספורת משפחתית</b>\n<blockquote>‏<code>16:00</code>  <i>📅 תזכורת לאירוע · בעוד שעתיים</i></blockquote>');
  assert.deepEqual(f.buttons(f.messages('mom',mark)[0]).map(b=>b.text),['נודניק 10 דק׳']);
 }finally{f.DB.close()}
});

test('an older Snooze button on a later-day reminder does not create a snooze',async()=>{
 const today=localDate(),f=await fixture(s=>{s.events=[record('far',{title:'Far',date:shift(today,3),time:'10:00',memberIds:['mom']})]});
 try{
  await f.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind('oldsnoozebutton1','home','mom',JSON.stringify({type:'snooze',item:{kind:'event',id:'far',date:shift(today,3),category:'events'}}),Date.now()+86400000).run();
  const mark=f.sent.length;await f.press('mom','a:oldsnoozebutton1');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM telegram_snoozes').first()).n,0);
  assert.deepEqual(f.toasts(mark),['זה ליום אחר. התזכורת הבאה שלו תגיע בזמן.']);
 }finally{f.DB.close()}
});

test('snooze rules: events only while the start is at least a snooze away; to-dos all day; re-checked when due',()=>{
 const now={date:'2026-11-10',time:'17:25'};
 assert.equal(snoozable({kind:'event',date:'2026-11-10',time:'17:30'},now),false,'starts in 5 minutes');
 assert.equal(snoozable({kind:'event',date:'2026-11-10',time:'17:35'},now),true,'starts in exactly one snooze');
 assert.equal(snoozable({kind:'event',date:'2026-11-11',time:'17:35'},now),false,'tomorrow');
 assert.equal(snoozable({kind:'task',date:'2026-11-10',time:'17:00'},now),true,'an overdue to-do can still be snoozed today');
 assert.equal(snoozable({kind:'event',date:'2026-11-10',time:''},now),true,'all-day event on the day');
 const event={id:'e',date:'2026-11-10',time:'18:00',repeat:'once',memberIds:['mom']},item={kind:'event',id:'e',date:'2026-11-10'};
 assert.equal(snoozeStillDue(item,event,'mom',{date:'2026-11-10',time:'17:00'}),true);
 assert.equal(snoozeStillDue(item,{...event,date:'2026-11-14'},'mom',{date:'2026-11-10',time:'17:00'}),false,'moved to another day');
 assert.equal(snoozeStillDue(item,event,'mom',{date:'2026-11-10',time:'18:06'}),false,'already started');
 assert.equal(snoozeStillDue(item,{...event,memberIds:['dad']},'mom',{date:'2026-11-10',time:'17:00'}),false,'no longer assigned');
 assert.equal(snoozeStillDue(item,undefined,'mom',{date:'2026-11-10',time:'17:00'}),false,'deleted or no longer visible');
 const task={id:'t',date:'2026-11-10',time:'09:00',repeat:'once',memberId:'mom',memberIds:['mom']};
 assert.equal(snoozeStillDue({kind:'task',id:'t',date:'2026-11-10'},task,'mom',{date:'2026-11-10',time:'12:00'}),true,'an overdue to-do is still reminded');
 assert.equal(snoozeStillDue({kind:'task',id:'t',date:'2026-11-10'},{...task,completions:{'2026-11-10':{state:'done'}}},'mom',{date:'2026-11-10',time:'12:00'}),false,'done');
});

test('time wording always follows the occurrence: never "in …" for a past time or an earlier day',()=>{
 const at={date:'2026-11-10',time:'16:25'};
 assert.equal(whenLabel({date:'2026-11-10',time:'16:00'},at,'en'),'25 min ago');
 assert.equal(whenLabel({date:'2026-11-10',time:'16:00'},at,'he'),'לפני 25 דק׳');
 assert.equal(whenLabel({date:'2026-11-10',time:'16:22'},at,'en'),'now');
 assert.equal(whenLabel({date:'2026-11-10',time:'16:26'},at,'he'),'בעוד דקה');
 assert.equal(whenLabel({date:'2026-11-10',time:'18:26'},at,'he'),'בעוד שעתיים ו־דקה');
 assert.equal(whenLabel({date:'2026-11-10',time:'19:30'},at,'en'),'in 3 h 5 min');
 assert.equal(whenLabel({date:'2026-11-09',time:'16:00'},at,'en'),'Mon 9 Nov at 16:00');
 assert.equal(whenLabel({date:'2026-11-17',time:'16:00'},at,'en'),'In 7 days · Tue 17 Nov at 16:00');
});

test('a snoozed event that has already started is not re-sent; a snoozed task arrives with its Done button',async()=>{
 const today=localDate(),f=await fixture(s=>{s.events=[record('meet',{title:'Meeting',date:today,time:'10:00',memberIds:['dad']})];s.tasks=[record('bins',{title:'Bins',date:today,time:'09:00',memberId:'dad',memberIds:['dad']})]});
 try{
  for(const [kind,id] of [['event','meet'],['task','bins']])await f.DB.prepare('INSERT INTO telegram_snoozes(id,household_id,member_id,payload,due_at) VALUES(?,?,?,?,0)').bind(id+'-snooze','home','dad',JSON.stringify({kind,id,date:today,category:kind+'s'})).run();
  const mark=f.sent.length,result=await f.tick(today,'10:20'),got=f.messages('dad',mark);
  assert.equal(result.suppressed,1);assert.equal(got.length,1);
  assert.equal(plain(got[0].text),'🔔 <b>Bins</b>\n<blockquote><code>09:00</code>  <i>✅ Task reminder · 1 h 20 min ago</i></blockquote>');
  assert.deepEqual(f.buttons(got[0]).map(b=>b.text),['✓ Done']);
 }finally{f.DB.close()}
});

test('button errors use the profile language, and Hebrew chats never get an English server error',async()=>{
 const f=await fixture();
 try{
  let mark=f.sent.length;await f.press('mom','a:zzzzzzzzzzzzzzzz');assert.deepEqual(f.toasts(mark),['הכפתור אינו זמין בצ׳אט הזה.']);
  await f.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind('usedbutton123456','home','mom','{"type":"discard"}',Date.now()+86400000).run();
  await f.press('mom','a:usedbutton123456');mark=f.sent.length;await f.press('mom','a:usedbutton123456');assert.deepEqual(f.toasts(mark),['כבר נעשה שימוש בכפתור או שפג תוקפו.']);
  // A server refusal written only in English (insurance preview lookup) is replaced by the Hebrew sentence.
  await f.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind('badinsurance1234','home','mom',JSON.stringify({type:'insurance_subject',previewId:'missing',subjectId:'mom'}),Date.now()+86400000).run();
  mark=f.sent.length;await f.press('mom','a:badinsurance1234');const [toast]=f.toasts(mark);
  assert.equal(toast,'Bayit לא הצליח להשלים את הפעולה. דבר לא שונה.');
  await f.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind('badinsurance5678','home','dad',JSON.stringify({type:'insurance_subject',previewId:'missing',subjectId:'dad'}),Date.now()+86400000).run();
  mark=f.sent.length;await f.press('dad','a:badinsurance5678');assert.doesNotMatch(f.toasts(mark)[0],/[֐-׿]/,'English chats keep the specific English reason');
 }finally{f.DB.close()}
});

test('access: private items, money and insurance never reach someone who cannot see them',async()=>{
 const today=localDate(),f=await fixture(s=>{s.events=[record('secret',{title:'Dan private',ownerId:'dad',visibility:'private',date:today,time:'12:00',memberIds:['dad'],reminders:[10]})];});
 try{
  let mark=f.sent.length;await f.tick(today,'11:50');
  assert.equal(f.messages('dad',mark).length,1);assert.equal(f.messages('mom',mark).length,0,'Dan’s private event never reaches Maya');
  for(const c of ['/today','/week']){mark=f.sent.length;await f.say('mom',c);assert.doesNotMatch(f.messages('mom',mark)[0].text,/Dan private/)}
  for(const c of ['/expenses','/insurance']){mark=f.sent.length;await f.say('kid',c);const text=f.messages('kid',mark)[0]?.text||'';if(c==='/expenses')assert.match(text,/למבוגרים בלבד/)}
 }finally{f.DB.close()}
});

test('money alerts keep merchant names whole, start parts with a capital and say when a limit is exceeded',()=>{
 const report={month:'2026-11',alerts:[{type:'category',category:'groceries',value:120050,target:100000,level:100},{type:'remaining',value:90000,target:150000,level:'warn'},{type:'price',merchant:'Netflix Israel Ltd.',value:5490,changePercent:12}]};
 const [category,remaining,price]=goalMessages(report,'family','en').map(m=>alertCard('en',{icon:'💰',title:m.title,detail:m.detail}));
 // One fact per line in a box; money keeps its own isolate (LRI…PDI), which the English direction pass must not strip.
 assert.match(plain(category),/\nOver by \u2066₪200\.50\u2069<\/blockquote>$/);
 assert.match(plain(remaining),/Goal \u2066₪1,500\.00\u2069\nProjected remainder \u2066₪900\.00\u2069\nGap \u2066₪600\.00\u2069<\/blockquote>$/);
 assert.match(plain(price),/<blockquote>Netflix Israel Ltd\n\u2066₪54\.90\u2069\n\+12% vs its previous recorded month<\/blockquote>$/);assert.doesNotMatch(price,/• ·/);
 assert.match(alertCard('he',{icon:'💰',title:'x',detail:goalMessages(report,'family','he')[0].detail}),/חריגה של/);
});

test('the day report and /tasks mark a high-priority task the same way (star with the title, after the time)',()=>{
 const date='2026-11-10',visible={events:[],tasks:[record('t',{title:'Trash',date,time:'19:00',memberId:'dad',memberIds:['dad'],priority:'high'})],shopping:[],shoppingLists:[],preferences:{}};
 assert.match(plain(dayReport(visible,{memberId:'dad',role:'parent',date,lang:'en',members:[{id:'dad',name:'Dan'}]}).text),/<blockquote>⭐ <code>19:00<\/code>  <b>Trash<\/b><\/blockquote>/);
});

test('linking replies and insurance choices are in the person’s own language and names',async()=>{
 const XLSX=await import('../app/node_modules/xlsx/xlsx.mjs'),f=await fixture();
 try{
  await f.DB.prepare('DELETE FROM telegram_links WHERE member_id=?').bind('mom').run();
  const token='audit-link-token-0123456789';await f.DB.prepare('INSERT INTO telegram_link_tokens(token_hash,household_id,member_id,created_by,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token),'home','mom','mom',Date.now()+600000).run();
  let mark=f.sent.length;await f.say('mom','/start '+token);assert.match(f.messages('mom',mark)[0].text,/^‏✅ <b>מחובר, מאיה!<\/b>/);
  mark=f.sent.length;await f.say('mom','/start '+token);assert.equal(f.messages('mom',mark)[0].text,'‏⏱ הקישור פג תוקף או שכבר נעשה בו שימוש.\n\n‏<i>צרו קישור חדש בהגדרות Bayit.</i>','a used link is answered in Maya’s language, not her Telegram app’s');
  const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['חברת ביטוח','שם המוצר','מספר פוליסה','דמי ביטוח חודשיים'],['חברת בדיקה','כיסוי לבדיקה','00123456789',100],['חברת בדיקה','כיסוי נוסף','00123456789',50]]),'Test');const bytes=XLSX.write(w,{type:'buffer',bookType:'xlsx'});
  const plain=f.env.OUTBOUND_FETCH,objects=new Map();f.env.OUTBOUND_FETCH=async(url,o)=>String(url).includes('/file/bot')?new Response(bytes):String(url).endsWith('/getFile')?Response.json({ok:true,result:{file_path:'files/r.xlsx',file_size:bytes.length}}):plain(url,o);
  f.env.FILES={async put(k,b){objects.set(k,new Uint8Array(b))},async get(k){const b=objects.get(k);return b?{body:new Response(b).body}:null},async delete(k){objects.delete(k)}};
  mark=f.sent.length;await f.upload('mom',{file_id:'f1',file_name:'report.xlsx'});const preview=f.messages('mom',mark)[0];
  assert.match(preview.text,/<blockquote>‏2 שורות כיסוי\n‏מספר פוליסה אחד\n/);
  assert.deepEqual(f.buttons(preview).map(b=>b.text).sort(),['הדוח עבור: מאיה','הדוח עבור: דן','הדוח עבור: נועה','ביטול הדוח'].sort());
  assert.equal((await f.load()).insurances.length,0,'nothing is saved before the insured person is chosen and confirmed');
 }finally{f.DB.close()}
});

// The user's event, as stored in production on 2026-11-08 (read-only lookup; title and people replaced):
// date 2026-11-12, time 16:40, repeat once, the older single reminder 120, weekdays [0..6], created 2026-11-08 09:49.
// Its Telegram delivery key was event:<id>:2026-11-08:16:40:120, sent 14:40 on 2026-11-08: the reminder was built
// for an occurrence on 2026-11-08. A once-only event yields that key only while its stored date is 2026-11-08,
// so the event was dated "today" when the reminder fired and was moved to 12 Nov afterwards.
test('production case: a 2-hour reminder belongs to the stored occurrence only; dated 12 Nov it never fires on 8 Nov',async()=>{
 const stored={title:'Haircut',he:'תספורת',time:'16:40',repeat:'once',reminder:120,weekdays:[0,1,2,3,4,5,6],durationMinutes:60,memberIds:['mom','dad']};
 const f=await fixture(s=>{s.events=[record('cut',{...stored,date:'2026-11-12'})]});
 try{
  let mark=f.sent.length;await f.tick('2026-11-08','14:40');assert.deepEqual(f.sent.slice(mark).filter(x=>x.method==='sendMessage'),[]);
  mark=f.sent.length;await f.tick('2026-11-12','14:40');
  assert.equal(plain(f.messages('dad',mark)[0].text),'🔔 <b>Haircut</b>\n<blockquote><code>16:40</code>  <i>📅 Event reminder · in 2 h</i></blockquote>','English for a profile whose language is English');
  assert.equal(f.messages('mom',mark)[0].text,'‏🔔 <b>תספורת</b>\n<blockquote>‏<code>16:40</code>  <i>📅 תזכורת לאירוע · בעוד שעתיים</i></blockquote>');
  // Dated "today" (the New event form's default date), the same reminder is due at 14:40 and its text is right for that record.
  const today=await f.load();today.events[0].date='2026-11-08';await f.save(today);await f.DB.prepare('DELETE FROM notification_deliveries').run();
  mark=f.sent.length;await f.tick('2026-11-08','14:40');assert.match(f.messages('dad',mark)[0].text,/<code>16:40<\/code>  <i>📅 Event reminder · in 2 h<\/i>/);
 }finally{f.DB.close()}
});

test('send-time guard: a reminder is sent only for an occurrence on its day and no further away than its lead',async()=>{
 const {reminderMatchesOccurrence}=await import('../app/cloud/reminders.mjs');
 const record={id:'e',date:'2026-11-12',time:'16:40',repeat:'once'};
 assert.equal(reminderMatchesOccurrence({kind:'event',record,date:'2026-11-12',lead:120},{date:'2026-11-12',time:'14:40'}),true);
 assert.equal(reminderMatchesOccurrence({kind:'event',record,date:'2026-11-08',lead:120},{date:'2026-11-08',time:'14:40'}),false,'not on that day');
 assert.equal(reminderMatchesOccurrence({kind:'event',record,date:'2026-11-12',lead:120},{date:'2026-11-08',time:'14:40'}),false,'4 days away is further than a 2-hour lead');
 assert.equal(reminderMatchesOccurrence({kind:'event',record,date:'2026-11-12',lead:5760},{date:'2026-11-08',time:'16:40'}),true,'a 4-day reminder');
 assert.equal(reminderMatchesOccurrence({kind:'event',record:{...record,time:'',reminders:[900]},date:'2026-11-12',lead:900},{date:'2026-11-11',time:'09:00'}),true,'all-day, day before at 09:00');
});

// ---- Changes to things assigned to me (user request 2026-11-08) ----
test('changes by someone else reach the assignee on Telegram and correct the reminders already sent',async()=>{
 const {applyChanges}=await import('../app/cloud/state.mjs'),{changeWhen}=await import('../shared/change-notices.mjs');
 const today=localDate(),later=shift(today,4),f=await fixture(s=>{/* no quiet hours: same result at any time of day */for(const p of Object.values(s.profiles||{}))p.notificationPrefs={...p.notificationPrefs,quietStart:'12:00',quietEnd:'12:00'};s.events=[record('cut',{title:'Haircut',he:'תספורת',date:today,time:'16:40',reminder:120,memberIds:['mom','dad']})]});
 const commit=async(actor,ops)=>{const s=await f.load();await f.save(applyChanges(s,ops(s),actor,'parent'))},after=ms=>{const at=new Date(Date.now()+ms);return f.env&&deliverReminders(f.env,at)};
 try{
  await f.tick(today,'14:40');const firstDad=f.messages('dad')[0],firstMom=f.messages('mom')[0];assert.match(firstDad.text,/in 2 h/);
  const saved=await f.DB.prepare("SELECT member_id,detail FROM notification_deliveries WHERE delivery_key LIKE 'event:cut:%' ORDER BY member_id").all();
  assert.ok(saved.results.every(r=>/^m:\d+$/.test(r.detail)),'the Telegram message id is kept with each reminder');
  // Maya moves the event 4 days later, twice within a minute (one message), and is not told about her own change.
  await commit('mom',s=>[{collection:'events',id:'cut',value:{...s.events[0],date:later,time:'17:00'}}]);
  await commit('mom',s=>[{collection:'events',id:'cut',value:{...s.events[0],time:'16:40'}}]);
  let mark=f.sent.length;await after(30000);assert.equal(f.sent.slice(mark).filter(x=>x.method==='sendMessage').length,0,'held while Maya may still be editing');
  mark=f.sent.length;const result=await after(3*60000);
  const moved=f.messages('dad',mark);assert.equal(moved.length,1);
  assert.equal(plain(moved[0].text),'✏️ <b>Haircut</b>\n<i>Moved by Maya · '+changeWhen({date:later,time:'16:40'},'en')+' (was '+changeWhen({date:today,time:'16:40'},'en')+')</i>');
  assert.deepEqual(f.messages('mom',mark),[],'the person who made the change gets no message');
  const edits=f.sent.slice(mark).filter(x=>x.method==='editMessageText');assert.equal(edits.length,2,'both sent reminders are corrected');assert.equal(result.corrected,2);
  const dadEdit=edits.find(e=>e.chat_id===String(200));assert.equal(dadEdit.message_id,firstDad.message_id||dadEdit.message_id);
  assert.match(plain(dadEdit.text),/^🔔 <b><s>Haircut<\/s><\/b>\n<i>📅 Event reminder · <b>Moved to .*16:40<\/b><\/i>$/);assert.deepEqual(dadEdit.reply_markup,{inline_keyboard:[]},'no Snooze on a corrected reminder');
  assert.match(edits.find(e=>e.chat_id===String(100)).text,/<s>תספורת<\/s>.*הועבר ל־/s);
  mark=f.sent.length;await after(4*60000);assert.equal(f.sent.slice(mark).filter(x=>/sendMessage|editMessageText/.test(x.method)).length,0,'each change is told and corrected once');
  // Dan deletes nothing he does not own; Maya deletes: Dan is told in English, nothing for Maya.
  {const s=await f.load();for(const n of s.changeNotices)n.at=new Date(Date.now()-10*60000).toISOString();await f.save(s)} // Time passes.
  await commit('mom',()=>[{collection:'events',id:'cut',delete:true}]);
  mark=f.sent.length;await after(6*60000);
  assert.equal(plain(f.messages('dad',mark)[0].text),'🗑️ <b>Haircut</b>\n<i>Deleted by Maya · Was '+changeWhen({date:later,time:'16:40'},'en')+'</i>');
 }finally{f.DB.close()}
});

test('Hebrew change message, "removed from", and the switch in Settings',async()=>{
 const {applyChanges}=await import('../app/cloud/state.mjs');
 const today=localDate(),f=await fixture(s=>{/* no quiet hours: same result at any time of day */for(const p of Object.values(s.profiles||{}))p.notificationPrefs={...p.notificationPrefs,quietStart:'12:00',quietEnd:'12:00'};s.events=[record('trip',{title:'Trip',he:'טיול',ownerId:'dad',date:shift(today,2),time:'08:00',memberIds:['mom','dad','kid']})]});
 const commit=async(actor,ops)=>{const s=await f.load();await f.save(applyChanges(s,ops(s),actor,'parent'))},after=ms=>deliverReminders(f.env,new Date(Date.now()+ms));
 try{
  await commit('dad',s=>[{collection:'events',id:'trip',value:{...s.events[0],time:'09:30',memberIds:['mom','dad']}}]);
  let mark=f.sent.length;await after(3*60000);
  assert.match(f.messages('mom',mark)[0].text,/^‏✏️ <b>טיול<\/b>\n‏<i>הועבר על ידי דן · .* ב־09:30 \(היה .* ב־08:00\)<\/i>$/);
  assert.match(f.messages('kid',mark)[0].text,/^‏👤 <b>טיול<\/b>\n‏<i>הוסרתם · על ידי דן · /);
  const s=await f.load();s.profiles.mom.notificationPrefs={...s.profiles.mom.notificationPrefs,itemChanges:false};await f.save(s);
  await commit('dad',s=>[{collection:'events',id:'trip',value:{...s.events[0],time:'10:00'}}]);
  mark=f.sent.length;await after(10*60000);assert.deepEqual(f.messages('mom',mark),[],'“Changes to things assigned to me” switched off');
 }finally{f.DB.close()}
});

// Telegram tidy-up (2026-11-12, owner chose "D · Boxes, nicer"): what a child finishes and what waits for a parent's OK
// is ONE message per child and day that updates itself, instead of a new "🎉 … Completed by Noa" for each.
test('a child’s day is one message that updates itself; a message that can no longer be edited is sent again',async()=>{
 const today=localDate(),done=(id,taskId,title,he,time)=>({id,taskId,memberId:'kid',actorId:'kid',ownerId:'mom',visibility:'family',allowedIds:[],title,he,date:today,time,done:true});
 const f=await fixture(s=>{s.history=[done('h1','bed','Make the bed','לסדר את המיטה','07:40')];
  s.tasks=[...['bed','cat','room','read'].map(id=>record(id,{title:id,date:today,memberId:'kid',memberIds:['kid'],routine:true,repeat:'daily'})),record('teeth',{title:'Brush teeth',he:'לצחצח שיניים',date:today,memberId:'kid',memberIds:['kid'],routine:true,repeat:'daily',parentConfirm:true,completions:{[today]:{state:'pending',actorId:'kid',time:'07:55'}}})]});
 try{
  // What dad's chat shows now: the last text sent or edited into that message.
  const shown=(chat,since)=>{const xs=f.sent.slice(since).filter(x=>/sendMessage|editMessageText/.test(x.method)&&x.chat_id===chat);return xs.at(-1)};
  let mark=f.sent.length;await f.tick(today,'08:00');
  const first=f.messages('dad',mark);assert.equal(first.length,1,'one message, not one per item (the second item edits it)');
  assert.equal(plain(shown('200',mark).text),'🎉 <b>Noa today</b>  <i>1 done · 1 needs your OK</i>\n<blockquote><code>07:40</code>  <b>Make the bed</b>\n<code>07:55</code>  <b>Brush teeth</b>  <i>⏳ needs your OK</i></blockquote>\n<i>This message updates itself during the day.</i>');
  assert.deepEqual(f.buttons(shown('200',mark)).map(b=>b.text),['Approve: Brush teeth']);
  assert.match(f.messages('mom',mark)[0].text,/^‏🎉 <b>נועה היום<\/b>/,'Hebrew for Maya');
  // Later: one more done → the same message is edited, nothing new is sent.
  {const s=await f.load();s.history.push(done('h2','cat','Feed the cat','להאכיל את החתול','08:10'));await f.save(s)}
  mark=f.sent.length;await f.tick(today,'08:15');
  assert.deepEqual(f.messages('dad',mark),[]);const edit=f.sent.slice(mark).find(x=>x.method==='editMessageText'&&x.chat_id==='200');
  assert.equal(edit.message_id,first[0].message_id||edit.message_id);assert.match(plain(edit.text),/2 done · 1 needs your OK[\s\S]*Make the bed[\s\S]*Brush teeth[\s\S]*Feed the cat/);
  assert.deepEqual(edit.reply_markup.inline_keyboard.flat().map(b=>b.text),['Approve: Brush teeth'],'the Approve button stays');
  // Deleted in the chat (or too old): Telegram refuses the edit → a new message with everything, remembered for next time.
  const real=f.env.OUTBOUND_FETCH;f.env.OUTBOUND_FETCH=async(url,o)=>/editMessageText$/.test(new URL(url).pathname)?Response.json({ok:false,error_code:400,description:'Bad Request: message to edit not found'},{status:400}):real(url,o);
  {const s=await f.load();s.history.push(done('h3','room','Tidy the room','לסדר את החדר','16:45'));await f.save(s)}
  mark=f.sent.length;await f.tick(today,'16:50');
  const again=f.messages('dad',mark);assert.equal(again.length,1);assert.match(plain(again[0].text),/3 done · 1 needs your OK[\s\S]*Tidy the room/);
  f.env.OUTBOUND_FETCH=real;
  {const s=await f.load();s.history.push(done('h4','read','Read a book','לקרוא ספר','17:00'));await f.save(s)}
  mark=f.sent.length;await f.tick(today,'17:05');assert.deepEqual(f.messages('dad',mark),[]);
  assert.equal(f.sent.slice(mark).find(x=>x.method==='editMessageText'&&x.chat_id==='200').message_id,again[0].message_id||f.sent.indexOf(again[0])+1,'the new message is the one edited next');
  assert.deepEqual(f.messages('kid',0).filter(m=>/today|היום/.test(m.text)&&/🎉/.test(m.text)),[],'the child gets no report about themselves');
 }finally{f.DB.close()}
});

// Bot picture (owner, 2026-11-12; Bot API 9.4 setMyProfilePhoto): the Bayit logo once, only when the bot has none.
test('the bot gets the Bayit logo once when it has no picture, never over a picture the family chose',async()=>{
 for(const [count,expected] of [[0,'set'],[1,'kept']]){
  const f=await fixture(),calls=[];
  f.env.OUTBOUND_FETCH=async(url,o)=>{const method=new URL(url).pathname.split('/').at(-1);calls.push({method,body:o.body});
   if(method==='getUserProfilePhotos')return Response.json({ok:true,result:{total_count:count,photos:[]}});
   if(method==='setMyProfilePhoto')return Response.json({ok:true,result:true});
   return Response.json({ok:true,result:method==='sendMessage'?{message_id:calls.length}:true})};
  try{
   await f.tick(localDate(),'12:00');await f.tick(localDate(),'12:01');
   const sets=calls.filter(c=>c.method==='setMyProfilePhoto');assert.equal(calls.filter(c=>c.method==='getUserProfilePhotos').length,1,'checked once, not every minute');
   assert.equal(sets.length,expected==='set'?1:0);
   if(sets[0]){const form=sets[0].body;assert.ok(form instanceof FormData);assert.deepEqual(JSON.parse(form.get('photo')),{type:'static',photo:'attach://bayit'});const jpg=new Uint8Array(await form.get('bayit').arrayBuffer());assert.deepEqual([...jpg.slice(0,3)],[0xff,0xd8,0xff],'a JPEG');assert.equal(form.get('bayit').type,'image/jpeg')}
   assert.equal((await f.DB.prepare("SELECT detail FROM service_heartbeats WHERE name='tg-photo:home'").first()).detail,expected);
  }finally{f.DB.close()}
 }
});
