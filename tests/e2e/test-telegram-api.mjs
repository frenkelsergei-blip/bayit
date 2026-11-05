// Local regression for the Telegram integration against `wrangler dev` with a FAKE Telegram Bot API.
// It proves server behaviour only; it does not show that a real Telegram bot delivered anything.
// Start the backend with TELEGRAM_API_ORIGIN=http://127.0.0.1:8899 and REMINDER_CRON_SECRET=local-test-cron-secret,
// then run: BAYIT_TEST_ORIGIN=http://127.0.0.1:8791 WRANGLER_PERSIST=<dir> node tests/e2e/test-telegram-api.mjs (see docs/testing.md)
import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import os from 'node:os';
const base=process.env.BAYIT_TEST_ORIGIN||'http://127.0.0.1:8791',persist=process.env.WRANGLER_PERSIST,checks=[];
const CHAT=100000+Math.floor(Math.random()*800000),OTHER=CHAT+1;// Fresh chat IDs per run keep earlier runs' households apart.
const FAKE_TOKEN='123456789:TEST_fake_token_for_local_only_abcd',BLOCKED_CHAT=3003;
// ---- Fake Telegram Bot API ----
const calls=[],claudeCalls=[],speechCalls=[],responsesCalls=[],FILES={'photos/file_1.jpg':[0xff,0xd8,0xff,0xe0,1,2,3,4,5,6],'voice/file_2.oga':[0x4f,0x67,0x67,0x53,9,9,9]};let webhook=null,messageId=100;
const fake=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const [,token,method]=req.url.match(/^\/bot([^/]+)\/(\w+)$/)||[],body=raw?JSON.parse(raw):{};calls.push({method,body});
 const reply=(status,payload)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(payload))};
 if(req.url.startsWith('/v1/models'))return reply(200,{data:[{id:'claude-test',display_name:'Claude Test'},{id:'gpt-5-codex'},{id:'text-embedding-3-small'}]});
 if(req.url==='/v1/responses'){responsesCalls.push(body);return reply(200,{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Prepared with OpenAI.'}]},{type:'function_call',name:'prepare_shopping_items',arguments:JSON.stringify({items:[{name:'Bananas',quantity:6}]})}],usage:{input_tokens:9,output_tokens:9}})}
 if(req.url==='/v1/messages'){claudeCalls.push(body);const last=JSON.stringify(body.messages?.at(-1)||'');
  if(last.includes('TEST-CHANGE'))return reply(200,{stop_reason:'tool_use',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:'Prepared the changes.'},{type:'tool_use',id:'t2',name:'prepare_changes',input:{changes:[{id:'tg-trash',type:'task',action:'complete'},{id:'tg-event',type:'event',action:'update',time:'18:30'}]}}]});
  if(last.includes('TEST-DELETE-OTHERS'))return reply(200,{stop_reason:'tool_use',usage:{input_tokens:10,output_tokens:10},content:[{type:'tool_use',id:'t3',name:'prepare_changes',input:{changes:[{id:'tg-private-task',type:'task',action:'delete'}]}}]});
  return reply(200,{stop_reason:'tool_use',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:'Prepared from your message.'},{type:'tool_use',id:'t1',name:'prepare_shopping_items',input:{items:[{name:'Oat milk',quantity:1}]}}]})}
 if(req.url==='/transcribe'){speechCalls.push(body);return reply(200,{text:'add oat milk to the list'})}
 const file=req.url.match(/^\/file\/bot([^/]+)\/(.+)$/);if(file){if(file[1]!==FAKE_TOKEN)return reply(401,{});res.writeHead(200,{'Content-Type':'application/octet-stream'});return res.end(Buffer.from(FILES[file[2]]))}
 if(token!==FAKE_TOKEN)return reply(401,{ok:false,error_code:401,description:'Unauthorized'});
 if(method==='getFile')return reply(200,{ok:true,result:{file_id:body.file_id,file_path:body.file_id==='photo-1'?'photos/file_1.jpg':'voice/file_2.oga',file_size:FILES[body.file_id==='photo-1'?'photos/file_1.jpg':'voice/file_2.oga'].length}});
 if(method==='getMe')return reply(200,{ok:true,result:{id:777,is_bot:true,username:'bayit_test_bot'}});
 if(method==='setWebhook'){webhook={url:body.url,secret:body.secret_token};return reply(200,{ok:true,result:true})}
 if(method==='getWebhookInfo')return reply(200,{ok:true,result:{url:webhook?.url||'',pending_update_count:0}});
 if(method==='sendMessage'){if(body.chat_id===BLOCKED_CHAT||body.chat_id===String(BLOCKED_CHAT))return reply(403,{ok:false,error_code:403,description:'Forbidden: bot was blocked by the user'});return reply(200,{ok:true,result:{message_id:++messageId,chat:{id:body.chat_id}}})}
 return reply(200,{ok:true,result:true});
});
await new Promise(r=>fake.listen(8899,'127.0.0.1',r));
const sent=(chat,since=0)=>calls.slice(since).filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)===String(chat));
const answers=since=>calls.slice(since).filter(c=>c.method==='answerCallbackQuery');
// ---- Helpers ----
async function api(user,path,body,method){const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{Cookie:'authjs.session-token=fixture-session-'+user,Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(home?{'X-Bayit-Household':home}:{})},body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json().catch(()=>({}));return {status:response.status,...result}}
let home='',updateId=5000;
const hookPath=()=>new URL(webhook.url).pathname;
async function deliver(update,secret=webhook.secret){const response=await fetch(base+hookPath(),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:++updateId,...update})});return response.status}
const message=(chatId,text,userId=chatId,type='private')=>({message:{message_id:1,date:1,chat:{id:chatId,type},from:{id:userId,is_bot:false,first_name:'Fixture',language_code:'en'},text}});
const press=(chatId,data,userId=chatId)=>({callback_query:{id:'cb'+updateId,from:{id:userId,is_bot:false,first_name:'Fixture'},message:{message_id:messageId,chat:{id:chatId,type:'private'}},data}});
const tick=secret=>fetch(base+'/api/internal/reminders',{method:'POST',headers:{Authorization:'Bearer '+secret}}).then(async r=>({status:r.status,...await r.json()}));
const jerusalem=d=>({date:d.toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'}),time:d.toLocaleTimeString('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})});
function d1(sql){if(process.env.BAYIT_SQLITE)return import('node:sqlite').then(({DatabaseSync})=>{const db=new DatabaseSync(process.env.BAYIT_SQLITE);db.exec('PRAGMA busy_timeout=5000');db.exec(sql);db.close()});const file=(process.env.FIXTURE_DIR||os.tmpdir())+'/bayit-telegram-fixture.sql';return fs.writeFile(file,sql).then(()=>execFileSync('npx',['wrangler','d1','execute','bayit-home','--local','--config','wrangler.worker.jsonc','--persist-to',persist,'--file',file],{cwd:new URL('../../app/',import.meta.url),stdio:'pipe'}))}
try{
// Household with a parent (one) and a separate adult account (two).
const created=await api('one','/api/households',{name:'Telegram QA family'});assert.equal(created.status,201);home=created.id;
const invite=await api('one','/api/family/invitations',{householdId:home,role:'adult'});const token=new URLSearchParams(new URL(invite.url).hash.split('?')[1]).get('invite');assert.equal((await api('two','/api/family/join',{token})).status,200);
let status=await api('one','/api/telegram/status');assert.equal(status.connected,false);assert.equal(status.canManage,true);
assert.equal((await api('two','/api/telegram/bot',{token:FAKE_TOKEN})).status,403);checks.push('Only a parent can connect the household bot');
assert.equal((await api('one','/api/telegram/bot',{token:'not-a-token'})).status,400);
status=await api('one','/api/telegram/bot',{token:FAKE_TOKEN});assert.equal(status.connected,true);assert.equal(status.botUsername,'bayit_test_bot');assert.match(webhook.url,/\/api\/telegram\/hook\/[A-Za-z0-9_-]{24}$/);assert.ok(webhook.secret.length>=40);
assert.ok(!JSON.stringify(status).includes(FAKE_TOKEN));assert.ok(!JSON.stringify(await api('two','/api/telegram/status')).includes(FAKE_TOKEN));checks.push('Bot token is verified with getMe, the webhook is registered with a secret, and the token is never returned');
const checked=await api('one','/api/telegram/check',{});assert.equal(checked.ok,true);assert.equal(checked.webhookMatches,true);checks.push('Test connection reads Telegram’s webhook status instead of assuming success');
// Linking
assert.equal((await api('two','/api/telegram/link',{memberId:'fixture-user-one'})).status,403);checks.push('An adult cannot create a Start link for another adult');
const link=await api('one','/api/telegram/link',{memberId:'fixture-user-one'});assert.equal(link.status,201);const start=new URL(link.url).searchParams.get('start');assert.ok(link.url.startsWith('https://t.me/bayit_test_bot?start='));assert.ok(start.length<=64);
assert.equal(await deliver(message(CHAT,'/start '+start),'wrong-secret'),401);checks.push('Webhook calls without Telegram’s secret header are rejected');
let mark=calls.length;assert.equal(await deliver(message(CHAT,'/start '+start)),200);assert.match(sent(CHAT,mark)[0].body.text,/Connected/);
const replayed=updateId;mark=calls.length;await fetch(base+hookPath(),{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':webhook.secret},body:JSON.stringify({update_id:replayed,...message(CHAT,'/help')})});assert.equal(sent(CHAT,mark).length,0);checks.push('A retried webhook update is processed once');
mark=calls.length;await deliver(message(OTHER,'/start '+start));assert.match(sent(OTHER,mark)[0].body.text,/expired or was already used/);checks.push('A Start link links one chat once and cannot be reused');
status=await api('one','/api/telegram/status');assert.equal(status.members.find(m=>m.id==='fixture-user-one').linked,true);assert.equal(status.members.find(m=>m.id==='fixture-user-two').linked,false);
mark=calls.length;await deliver(message(OTHER,'hello'));assert.match(sent(OTHER,mark)[0].body.text,/not linked/);checks.push('Unlinked chats receive only linking instructions');
mark=calls.length;await deliver(message(-4004,'hello group',CHAT,'group'));assert.ok(calls.slice(mark).some(c=>c.method==='leaveChat'));checks.push('Group chats are refused, so private items cannot reach shared chats');
// Records: a family task for one, and a private task owned by two that is assigned to one.
const {date,time}=jerusalem(new Date()),soon=jerusalem(new Date(Date.now()+5*60000));if(soon.date!==date)throw Error('Run outside the five minutes before midnight in Asia/Jerusalem.');
let state=await api('one','/api/households/'+home+'/state');
let saved=await api('one','/api/households/'+home+'/changes',{baseRevision:state.revision,changes:[{collection:'tasks',id:'tg-family-task',value:{id:'tg-family-task',title:'Water the plants',he:'להשקות את העציצים',memberId:'fixture-user-one',ownerId:'fixture-user-one',visibility:'family',allowedIds:[],date,time:soon.time,xp:0,done:false}},{collection:'profiles',id:'fixture-user-one',value:{locale:'en',notificationPrefs:{quietStart:'00:00',quietEnd:'00:00',digest:time}}}]});assert.equal(saved.status,200);
state=await api('two','/api/households/'+home+'/state');saved=await api('two','/api/households/'+home+'/changes',{baseRevision:state.revision,changes:[{collection:'tasks',id:'tg-private-task',value:{id:'tg-private-task',title:'Secret birthday gift',he:'מתנה סודית',memberId:'fixture-user-one',ownerId:'fixture-user-two',visibility:'private',allowedIds:[],date,time:soon.time,xp:0,done:false}}]});assert.equal(saved.status,200);
// Reminder tick
assert.equal((await tick('wrong')).status,401);checks.push('The reminder endpoint requires the scheduler secret');
mark=calls.length;let result=await tick('local-test-cron-secret');assert.equal(result.ok,true);const delivered=sent(CHAT,mark),texts=delivered.map(c=>c.body.text).join('\n');
assert.match(texts,/Water the plants/);assert.match(texts,/Good morning/);assert.doesNotMatch(texts,/Secret birthday gift/);checks.push('Reminder and morning summary are delivered; another person’s private task assigned to the recipient is excluded');
const reminder=delivered.find(c=>/Reminder/.test(c.body.text));const [doneButton,snoozeButton]=reminder.body.reply_markup.inline_keyboard[0];assert.ok(doneButton.callback_data.length<=64);
mark=calls.length;result=await tick('local-test-cron-secret');assert.equal(sent(CHAT,mark).length,0);checks.push('A second tick does not send the same reminder again');
// Buttons
mark=calls.length;await deliver(press(CHAT,doneButton.callback_data,9999));assert.equal(answers(mark)[0].body.show_alert,true);state=await api('one','/api/households/'+home+'/state');assert.notEqual(state.data.tasks.find(t=>t.id==='tg-family-task').completions?.[date]?.state,'done');checks.push('A button pressed by a different Telegram user is refused');
mark=calls.length;await deliver(press(CHAT,doneButton.callback_data));assert.match(answers(mark)[0].body.text,/Marked as done/);state=await api('one','/api/households/'+home+'/state');assert.equal(state.data.tasks.find(t=>t.id==='tg-family-task').completions[date].state,'done');assert.ok(state.data.history.some(h=>h.taskId==='tg-family-task'&&h.done));checks.push('Done completes the task through the server authorization path and records history');
mark=calls.length;await deliver(press(CHAT,doneButton.callback_data));assert.match(answers(mark)[0].body.text,/already been used/);
mark=calls.length;await deliver(press(CHAT,snoozeButton.callback_data));assert.match(answers(mark)[0].body.text,/remind you again/);checks.push('Buttons are single-use; Snooze schedules a follow-up');
// Commands
mark=calls.length;await deliver(message(CHAT,'/today'));assert.match(sent(CHAT,mark)[0].body.text,/Water the plants ✓/);assert.doesNotMatch(sent(CHAT,mark)[0].body.text,/Secret/);
mark=calls.length;await deliver(message(CHAT,'add milk please'));assert.match(sent(CHAT,mark)[0].body.text,/AI is not connected/);checks.push('/today respects visibility; chat explains when Claude is not connected');
// Apply / Undo of a prepared plan (the plan is inserted directly; Claude itself is not called in this local test).
const APPLY_ID=('apply'+Math.random().toString(36).slice(2)+'00000000000').slice(0,16),plan={id:'tg-plan-'+APPLY_ID,actorId:'fixture-user-one',scope:'family',actions:[{kind:'shopping.add',title:'Oat milk',quantity:2,quantityMode:'ensure',unit:'bottles',group:'Dairy',icon:'bayit-activities-lunchbox',listId:'week'}]};
await d1(`INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES('${APPLY_ID}','${home}','fixture-user-one','${JSON.stringify({type:'apply',plan}).replaceAll("'","''")}',${Date.now()+3600000});`);
mark=calls.length;await deliver(press(CHAT,'a:'+APPLY_ID));assert.match(answers(mark)[0].body.text,/Applied/);const applied=sent(CHAT,mark)[0];assert.match(applied.body.text,/1 change/);
state=await api('two','/api/households/'+home+'/state');assert.ok(state.data.shopping.some(i=>i.title==='Oat milk'));checks.push('Apply saves a prepared plan as the member; the family list item syncs to the other adult');
mark=calls.length;await deliver(press(CHAT,applied.body.reply_markup.inline_keyboard[0][0].callback_data));assert.match(answers(mark)[0].body.text,/Undone: 1/);state=await api('one','/api/households/'+home+'/state');assert.ok(!state.data.shopping.some(i=>i.title==='Oat milk'));checks.push('Undo restores the shopping list');
// Photos and voice
const media=(extra,chat=CHAT)=>({message:{message_id:2,date:1,chat:{id:chat,type:'private'},from:{id:chat,is_bot:false,first_name:'Fixture',language_code:'en'},...extra}});
status=await api('one','/api/telegram/status');assert.equal(status.media.photos,true);assert.equal(status.media.speechProvider,'off');
mark=calls.length;await deliver(media({voice:{file_id:'voice-1',duration:3,mime_type:'audio/ogg'}}));assert.match(sent(CHAT,mark)[0].body.text,/Voice messages are turned off/);assert.equal(speechCalls.length,0);checks.push('Voice stays off until a parent chooses a provider; nothing is transcribed');
assert.equal((await api('two','/api/telegram/media',{speechProvider:'cloudflare'})).status,403);status=await api('one','/api/telegram/media',{speechProvider:'cloudflare'});assert.equal(status.media.speechProvider,'cloudflare');checks.push('Only a parent changes photo and voice settings');
mark=calls.length;await deliver(media({photo:[{file_id:'photo-small',width:90,height:90},{file_id:'photo-1',width:1280,height:960}],caption:'add these'}));assert.match(sent(CHAT,mark)[0].body.text,/AI is not connected/);assert.equal(claudeCalls.length,0);
assert.equal((await api('one','/api/ai/credentials',{apiKey:'fake-local-anthropic-key-0001'})).connected,true);await api('one','/api/ai/model',{model:'claude-test'});
mark=calls.length;await deliver(media({photo:[{file_id:'photo-small',width:90,height:90},{file_id:'photo-1',width:1280,height:960}],caption:'add these'}));
const imageCall=claudeCalls.at(-1),imageContent=imageCall.messages.at(-1).content;assert.equal(imageContent[0].type,'image');assert.equal(imageContent[0].source.media_type,'image/jpeg');assert.equal(imageContent[0].source.data,Buffer.from(FILES['photos/file_1.jpg']).toString('base64'));assert.equal(imageContent[1].text,'add these');assert.match(imageCall.system,/untrusted data/);
const prepared=sent(CHAT,mark).at(-1);assert.match(prepared.body.text,/Prepared for review/);assert.match(prepared.body.text,/Oat milk/);assert.equal(prepared.body.reply_markup.inline_keyboard[0].length,2);checks.push('A photo (largest size) and its caption reach Claude as an image; the result waits for Apply');
mark=calls.length;await deliver(media({voice:{file_id:'voice-1',duration:3,mime_type:'audio/ogg'}}));const voiceReplies=sent(CHAT,mark).map(c=>c.body.text);assert.equal(speechCalls.at(-1).audio,Buffer.from(FILES['voice/file_2.oga']).toString('base64'));assert.match(voiceReplies[0],/I heard:.*add oat milk to the list/);assert.match(voiceReplies.at(-1),/Prepared for review/);assert.equal(claudeCalls.at(-1).messages.at(-1).content,'add oat milk to the list');checks.push('A voice note is transcribed, shown back as “I heard”, then prepared by Claude');
mark=calls.length;const before=speechCalls.length;await deliver(media({voice:{file_id:'voice-1',duration:500,mime_type:'audio/ogg'}}));assert.match(sent(CHAT,mark)[0].body.text,/under 2 minutes/);assert.equal(speechCalls.length,before);checks.push('Long voice notes are refused before any transcription');
// Switch the household to OpenAI (Responses API) and use it from Telegram.
assert.equal((await api('two','/api/ai/credentials',{apiKey:'fake-openai-key-0001',provider:'openai'})).status,403);
let ai=await api('one','/api/ai/credentials',{apiKey:'fake-openai-key-0001',provider:'openai'});assert.equal(ai.provider,'openai');assert.deepEqual(ai.models.map(m=>m.id),['gpt-5-codex']);assert.ok(!JSON.stringify(ai).includes('fake-openai-key'));
ai=await api('one','/api/ai/model',{model:'gpt-5-codex'});assert.equal(ai.model,'gpt-5-codex');
mark=calls.length;await deliver(message(CHAT,'add bananas'));const viaOpenAI=sent(CHAT,mark).at(-1).body.text;assert.match(viaOpenAI,/Prepared with OpenAI/);assert.match(viaOpenAI,/Bananas/);
const rc=responsesCalls.at(-1);assert.equal(rc.model,'gpt-5-codex');assert.equal(rc.tools[0].type,'function');assert.match(rc.instructions,/household assistant/);
assert.equal((await api('one','/api/ai/credentials',{apiKey:'fake-key-0001',provider:'custom',baseUrl:'http://10.0.0.1/v1'})).status,400);checks.push('A parent can switch the household AI to OpenAI (Responses API); Telegram chat uses it; custom endpoints must be https');
// The bot as a full assistant: command menu, interactive lists, notes, expenses, and AI changes to existing items.
assert.ok(calls.some(c=>c.method==='setMyCommands'&&c.body.commands.some(x=>x.command==='tasks')&&c.body.commands.some(x=>x.command==='week')),'the full command menu is registered');assert.ok(calls.some(c=>c.method==='setMyCommands'&&c.body.language_code==='he'));checks.push('The "/" command menu (today, tasks, week, shopping, lists, note, expenses…) is registered in English and Hebrew');
const tomorrow=jerusalem(new Date(Date.now()+86400000)).date;state=await api('one','/api/households/'+home+'/state');
saved=await api('one','/api/households/'+home+'/changes',{baseRevision:state.revision,changes:[
 {collection:'tasks',id:'tg-trash',value:{id:'tg-trash',title:'Take out the trash',he:'להוציא את הזבל',memberId:'fixture-user-one',ownerId:'fixture-user-one',visibility:'family',allowedIds:[],date,time:'23:58',repeat:'once',done:false,xp:0,icon:'1F4CB'}},
 {collection:'tasks',id:'tg-anytime',value:{id:'tg-anytime',title:'Fix the shelf',he:'לתקן את המדף',memberId:'fixture-user-one',ownerId:'fixture-user-one',visibility:'family',allowedIds:[],date:'',repeat:'once',done:false,xp:0,icon:'1F4CB'}},
 {collection:'events',id:'tg-event',value:{id:'tg-event',title:'Dentist',he:'רופא שיניים',date:tomorrow,time:'17:00',memberIds:['fixture-user-one'],durationMinutes:60,ownerId:'fixture-user-one',visibility:'family',allowedIds:[],editPolicy:'owner',editorIds:[],color:'lilac',repeat:'once',icon:'1F4C5'}},
 {collection:'shopping',id:'tg-eggs',value:{id:'tg-eggs',title:'Eggs',he:'ביצים',listId:'week',quantity:'12 items',quantityValue:12,unit:'items',group:'Dairy',icon:'1F95A',done:false,memberId:'fixture-user-one',ownerId:'fixture-user-one',visibility:'family',allowedIds:[]}}]});
assert.ok(saved.revision,'fixture records saved');
const pressFrom=(msg,match)=>{const button=msg.body.reply_markup.inline_keyboard.flat().find(b=>match.test(b.text));assert.ok(button,'button '+match);return {callback_query:{id:'cb'+updateId,from:{id:CHAT,is_bot:false,first_name:'Fixture'},message:{message_id:msg.id||messageId,chat:{id:CHAT,type:'private'},reply_markup:msg.body.reply_markup},data:button.callback_data}}};
mark=calls.length;await deliver(message(CHAT,'/tasks'));let tasksMsg=sent(CHAT,mark)[0];assert.match(tasksMsg.body.text,/Take out the trash/);assert.match(tasksMsg.body.text,/Anytime[\s\S]*Fix the shelf/);
mark=calls.length;await deliver(pressFrom(tasksMsg,/Fix the shelf/));assert.match(answers(mark)[0].body.text,/Marked as done/);const kept=calls.slice(mark).find(c=>c.method==='editMessageReplyMarkup');assert.ok(kept.body.reply_markup.inline_keyboard.flat().some(b=>/Take out the trash/.test(b.text)),'other buttons stay');
state=await api('one','/api/households/'+home+'/state');assert.equal(state.data.tasks.find(t=>t.id==='tg-anytime').completions[date].state,'done');checks.push('/tasks lists today’s and anytime tasks; ✓ completes one (anytime too) and keeps the other buttons');
mark=calls.length;await deliver(message(CHAT,'/shopping'));const shopMsg=sent(CHAT,mark)[0];assert.match(shopMsg.body.text,/This week/);
mark=calls.length;await deliver(pressFrom(shopMsg,/Eggs/));assert.match(answers(mark)[0].body.text,/Checked off: Eggs/);state=await api('two','/api/households/'+home+'/state');assert.equal(state.data.shopping.find(i=>i.id==='tg-eggs').done,true);checks.push('/shopping: tapping an item checks it off, and the other adult sees it bought');
mark=calls.length;await deliver(message(CHAT,'/week'));assert.match(sent(CHAT,mark)[0].body.text,/17:00 · Dentist/);
mark=calls.length;await deliver(message(CHAT,'/lists'));assert.match(sent(CHAT,mark)[0].body.text,/Shopping lists[\s\S]*This week/);checks.push('/week shows the next 7 days and /lists shows every list');
mark=calls.length;await deliver(message(CHAT,'/expenses'));assert.match(sent(CHAT,mark)[0].body.text,/No expenses yet/);
mark=calls.length;await deliver(message(CHAT,'/note Noa’s teacher is Dana'));const noteMsg=sent(CHAT,mark)[0];assert.match(noteMsg.body.text,/Saved to the home journal/);
state=await api('two','/api/households/'+home+'/state');assert.ok(state.data.notes.some(n=>/teacher is Dana/.test(n.text)));
mark=calls.length;await deliver(pressFrom(noteMsg,/Undo/));assert.match(answers(mark)[0].body.text,/Undone: 1/);state=await api('one','/api/households/'+home+'/state');assert.ok(!state.data.notes.some(n=>/teacher is Dana/.test(n.text)));checks.push('/note saves to the home journal with Undo; /expenses answers honestly when there is no data');
// AI changes to existing records: the fake AI proposes completing a task and moving an event.
assert.equal((await api('one','/api/ai/credentials',{apiKey:'fake-local-anthropic-key-0001'})).connected,true);await api('one','/api/ai/model',{model:'claude-test'});
mark=calls.length;await deliver(message(CHAT,'TEST-CHANGE mark the trash as done and move the dentist to 18:30'));const proposal=sent(CHAT,mark).at(-1);assert.match(proposal.body.text,/Mark done: Take out the trash/);assert.match(proposal.body.text,/Change event: Dentist → 18:30/);
assert.ok(claudeCalls.at(-1).tools.some(t=>t.name==='prepare_changes'));assert.match(claudeCalls.at(-1).system,/tg-trash/);
state=await api('one','/api/households/'+home+'/state');assert.notEqual(state.data.tasks.find(t=>t.id==='tg-trash').completions?.[date]?.state,'done','nothing changes before Apply');
mark=calls.length;await deliver(pressFrom(proposal,/^Apply$/));assert.match(answers(mark)[0].body.text,/Applied/);const appliedChanges=sent(CHAT,mark)[0];assert.match(appliedChanges.body.text,/2 changes/);
state=await api('one','/api/households/'+home+'/state');assert.equal(state.data.tasks.find(t=>t.id==='tg-trash').completions[date].state,'done');assert.equal(state.data.events.find(e=>e.id==='tg-event').time,'18:30');
mark=calls.length;await deliver(pressFrom(appliedChanges,/Undo/));assert.match(answers(mark)[0].body.text,/Undone: 2/);state=await api('one','/api/households/'+home+'/state');assert.notEqual(state.data.tasks.find(t=>t.id==='tg-trash').completions[date].state,'done');assert.equal(state.data.events.find(e=>e.id==='tg-event').time,'17:00');
checks.push('The AI can complete and edit existing items (here a task and an event): nothing changes before Apply, and Undo restores both');
mark=calls.length;await deliver(message(CHAT,'TEST-DELETE-OTHERS delete the private task'));assert.match(sent(CHAT,mark).at(-1).body.text,/not available to you/);checks.push('The AI cannot touch records the person cannot see (another person’s private task)');
// Test message, unlink, disconnect
assert.equal((await api('one','/api/telegram/test',{})).sent,true);assert.equal((await api('two','/api/telegram/test',{})).status,409);checks.push('Send test reports success only after Telegram accepts the message');
status=await api('one','/api/telegram/link/fixture-user-one',undefined,'DELETE');assert.equal(status.members.find(m=>m.id==='fixture-user-one').linked,false);
mark=calls.length;await deliver(message(CHAT,'/today'));assert.match(sent(CHAT,mark)[0].body.text,/not linked/);checks.push('Unlink stops access from that chat immediately');
status=await api('one','/api/telegram/bot',undefined,'DELETE');assert.equal(status.connected,false);assert.ok(calls.some(c=>c.method==='deleteWebhook'));assert.equal(await deliver(message(CHAT,'/today')),404);checks.push('Disconnect removes the webhook and the stored bot');
console.log(checks.map(c=>'✔ '+c).join('\n'));console.log(checks.length+' checks passed');
}finally{fake.close()}
