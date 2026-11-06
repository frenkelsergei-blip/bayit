// Telegram delivery for a household's own bot: setup, per-person linking, webhook commands,
// AI chat with Apply/Undo, reminder buttons and the scheduled reminder tick.
// Every message is built from visibleState(state, recipient), the same access rules as the app.
import {json,fail,random,hash,sameDigest,bodyJSON,encryptKey,decryptKey,localDate,localTime,base64} from './util.mjs';
import {importStatement,applyImport,visibleFinance} from './finance.mjs';
import {refreshDueConnections} from './riseup.mjs';
import {CATEGORY,monthSummary,monthOf} from '../../shared/finance.mjs';
import {describeAction,taskStateNow,taskStateDate} from '../../shared/ai-actions.mjs';
import {dayReport,chatFormat} from './telegram-format.mjs';
import {HOME_CURRENCY_SYMBOL} from '../../shared/home-config.mjs';
import {SPEECH_PROVIDERS,MAX_VOICE_SECONDS,MAX_VOICE_BYTES,DAILY_VOICE_SECONDS,speechAvailability,transcribe} from './speech.mjs';
import {loadHousehold,roleOf,commitAsMember,runAssistant,aiStatusRecord,catalog} from './assistant.mjs';
import {visibleState} from './state.mjs';
import {applyAIPlan,undoAIPlan} from '../../shared/ai-contract.mjs';
import {completeTask,completionState,occursOn} from '../src/domain.js';
import {deliverPush} from './push.mjs';
import {dueReminders,digestDue,approvalRequests,childUpdates,ownerDoneUpdates,overdueAlerts,agenda,notificationPrefs,inQuietHours,minutes} from './reminders.mjs';

// The "/" menu. Registered when a bot connects, on Test connection, and re-registered automatically by the
// scheduler whenever this list changes (COMMANDS_VERSION), so older bots get new commands without reconnecting.
const COMMANDS_VERSION='2';
const COMMANDS={en:[['today','My day'],['tasks','My tasks · tap to complete'],['week','The next 7 days'],['shopping','Shopping list · tap to check off'],['lists','All my lists'],['note','Write a note: /note text'],['expenses','Spending this month'],['mine','Private request: /mine text'],['help','What I can do'],['stop','Unlink this chat']],
 he:[['today','היום שלי'],['tasks','המשימות שלי · הקשה מסמנת כבוצע'],['week','7 הימים הקרובים'],['shopping','רשימת הקניות · הקשה מסמנת כנקנה'],['lists','כל הרשימות שלי'],['note','כתיבת הערה: /note טקסט'],['expenses','ההוצאות החודש'],['mine','בקשה פרטית: /mine טקסט'],['help','מה אני יודע לעשות'],['stop','ניתוק הצ׳אט']]};
async function registerCommands(env,token){let ok=true;for(const lang of ['en','he']){try{await tg(env,token,'setMyCommands',{commands:COMMANDS[lang].map(([command,description])=>({command,description})),...(lang==='he'?{language_code:'he'}:{})})}catch{ok=false}}return ok}
async function ensureCommands(env,bot){const name='tg-commands:'+bot.household_id,row=await env.DB.prepare('SELECT detail FROM service_heartbeats WHERE name=?').bind(name).first();if(row?.detail===COMMANDS_VERSION)return;if(await registerCommands(env,bot.token))await env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind(name,Date.now(),COMMANDS_VERSION).run()}
const LINK_MINUTES=30,ACTION_DAYS=2,MAX_PER_MEMBER_TICK=10,SNOOZE_MINUTES=10,TURN_MINUTES=30;
const TOKEN_PATTERN=/^\d{5,16}:[A-Za-z0-9_-]{30,60}$/;
const L=(lang,en,he)=>lang==='he'?he:en;
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const title=(record,lang)=>lang==='he'?record.he||record.title||record.name:record.title||record.name||record.he;
const cut=(value,max)=>value.length>max?value.slice(0,max-1)+'…':value;

// ---- Telegram Bot API ----
// A loopback API origin is accepted only for local regression tests with a fake Telegram server.
const apiOrigin=env=>/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(env.TELEGRAM_API_ORIGIN||'')?env.TELEGRAM_API_ORIGIN:'https://api.telegram.org';
async function tg(env,token,method,body={}){
 let response;
 try{response=await fetch(apiOrigin(env)+'/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})}
 catch{throw Object.assign(fail('Telegram could not be reached. Nothing was confirmed.',502),{transient:true})}
 let result={};try{result=await response.json()}catch{}
 if(!response.ok||!result.ok){const code=result.error_code||response.status,error=fail('Telegram: '+cut(String(result.description||'request failed ('+code+')'),200),code===401||code===404?400:502);error.telegramStatus=code;error.transient=code===429||code>=500;throw error}
 return result.result;
}
const keyboard=rows=>rows?.length?{reply_markup:{inline_keyboard:rows}}:{};
const send=(env,bot,chatId,text,rows)=>tg(env,bot.token,'sendMessage',{chat_id:chatId,text:cut(text,4000),parse_mode:'HTML',link_preview_options:{is_disabled:true},...keyboard(rows)});

// ---- Storage ----
const aad=householdId=>'telegram:'+householdId;
async function botRow(env,householdId){return env.DB.prepare('SELECT * FROM telegram_bots WHERE household_id=?').bind(householdId).first()}
async function withToken(env,row){if(!row)return null;try{return {...row,token:await decryptKey(row.ciphertext,env,aad(row.household_id))}}catch{throw fail('The stored bot token can no longer be read. A parent can disconnect and connect the bot again.',409)}}
async function linksFor(env,householdId){return (await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=?').bind(householdId).all()).results}
async function accountMembers(env,householdId){return new Set((await env.DB.prepare('SELECT member_id FROM memberships WHERE household_id=?').bind(householdId).all()).results.map(r=>r.member_id))}
// Stores a button payload server-side; Telegram only carries the short random ID.
async function button(env,householdId,memberId,text,payload){const id=random(12);await env.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind(id,householdId,memberId,JSON.stringify(payload),Date.now()+ACTION_DAYS*86400000).run();return {text,callback_data:'a:'+id}}
const languageOf=(state,memberId,fallback)=>state.profiles?.[memberId]?.locale||fallback||'he';
async function mediaSettings(env,householdId){const row=await env.DB.prepare('SELECT photos,speech_provider FROM media_settings WHERE household_id=?').bind(householdId).first();return {photos:row?row.photos!==0:true,speechProvider:SPEECH_PROVIDERS.includes(row?.speech_provider)?row.speech_provider:'off'}}
const MAX_PHOTO_BYTES=3_700_000,IMAGE_TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
// Downloads a file the member sent to the bot (Bot API limit: 20 MB; Bayit uses much smaller limits).
async function downloadFile(env,bot,fileId,maxBytes,lang){
 const tooLarge=()=>fail(L(lang,'This file is too large for Bayit.','הקובץ גדול מדי עבור Bayit.'),413);
 const file=await tg(env,bot.token,'getFile',{file_id:fileId});if(!file?.file_path)throw fail(L(lang,'Telegram did not provide this file.','טלגרם לא סיפק את הקובץ.'),502);if(file.file_size>maxBytes)throw tooLarge();
 let response;try{response=await fetch(apiOrigin(env)+'/file/bot'+bot.token+'/'+file.file_path,{signal:AbortSignal.timeout(20000)})}catch{throw fail(L(lang,'The file could not be downloaded from Telegram.','לא ניתן היה להוריד את הקובץ מטלגרם.'),502)}
 if(!response.ok)throw fail(L(lang,'The file could not be downloaded from Telegram.','לא ניתן היה להוריד את הקובץ מטלגרם.'),502);
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>maxBytes)throw tooLarge();return {bytes,path:file.file_path};
}

// ---- Message text ----
function itemLine(item,lang){const r=item.record,when=item.time||r.time?esc(item.time||r.time)+' · ':'',done=item.state==='done'?' ✓':item.state==='pending'?L(lang,' (waiting for approval)',' (ממתין לאישור)'):'';return '• '+when+esc(title(r,lang))+done}
function reminderText(item,lang,now){const left=minutes(item.time)-minutes(now),lead=left>0?L(lang,'in '+left+' min','בעוד '+left+' דקות'):L(lang,'now','עכשיו'),kind=item.kind==='event'?L(lang,'Event','אירוע'):item.category==='routines'?L(lang,'Routine','שגרה'):L(lang,'Task','משימה');return '<b>'+L(lang,'Reminder','תזכורת')+'</b> · '+lead+'\n<b>'+esc(title(item.record,lang))+'</b>\n'+kind+' · '+esc(item.time)}
// Amounts are wrapped as a left-to-right unit, so Hebrew messages show −₪55, not 55-₪.
const money=v=>'\u2066'+(v<0?'−':'')+HOME_CURRENCY_SYMBOL+Math.abs(Math.round(v)).toLocaleString('en-US')+'\u2069';
function planText(plan,lang,lists){return plan.actions.map(a=>{const described=describeAction(a,lang,money);if(described)return '• '+esc(described);if(a.kind==='shopping.list.create')return '• '+L(lang,'New list: ','רשימה חדשה: ')+esc(a.title);if(a.kind==='shopping.add'){const list=lists.find(l=>l.id===a.listId);return '• '+esc(a.title)+' — '+esc(a.quantity+' '+a.unit)+(list?' ('+esc(title(list,lang))+')':'')}return '• '+esc(a.title)+' — '+esc(a.date)+(a.time?' '+esc(a.time):'')}).join('\n')}
const helpText=lang=>L(lang,
 '<b>Bayit on Telegram</b> · your home assistant\nJust write in your own words, send a photo or a voice message. For example:\n• “add milk and eggs to the shopping list”\n• “move the dentist to Thursday at 10”\n• “mark take out the trash as done”\n• “delete the swimming practice on Friday”\n• “remember that Noa’s teacher is Dana”\n• “how much did we spend on food this month?”\nThe AI prepares the change and you press <b>Apply</b> (and Undo if needed).\n\n/today – your day\n/tasks – your tasks, tap ✓ to complete\n/week – the next 7 days\n/shopping – tap items to check them off\n/lists – all your lists\n/note &lt;text&gt; – save a note\n/expenses – spending this month\n/mine &lt;request&gt; – use your private space\n/stop – unlink this chat\n\nYou only see what you can see in the app.',
 '<b>Bayit בטלגרם</b> · העוזר של הבית\nפשוט כתבו במילים שלכם, שלחו תמונה או הודעה קולית. למשל:\n• „להוסיף חלב וביצים לרשימת הקניות”\n• „להעביר את רופא השיניים ליום חמישי ב־10”\n• „לסמן שהוצאתי את הזבל”\n• „למחוק את אימון השחייה ביום שישי”\n• „לזכור שהמורה של נועה היא דנה”\n• „כמה הוצאנו על אוכל החודש?”\nה־AI מכין את השינוי ואתם לוחצים <b>החלה</b> (ואפשר לבטל).\n\n/today – היום שלכם\n/tasks – המשימות, ✓ לסימון\n/week – 7 הימים הקרובים\n/shopping – הקשה מסמנת כנקנה\n/lists – כל הרשימות\n/note &lt;טקסט&gt; – שמירת הערה\n/expenses – ההוצאות החודש\n/mine &lt;בקשה&gt; – המרחב הפרטי שלכם\n/stop – ניתוק הצ׳אט\n\nמוצג רק מה שמותר לכם לראות באפליקציה.');

// ---- Web API used by Settings → Notifications ----
export async function handleTelegramAPI(request,env,user,home,path,url){
 const actor=home.membership.member_id,parent=home.membership.role==='parent',action=path.slice('/api/telegram/'.length);
 const status=async()=>{const row=await botRow(env,home.id),links=row?await linksFor(env,home.id):[],accountsSet=await accountMembers(env,home.id),beat=await env.DB.prepare("SELECT at FROM service_heartbeats WHERE name='reminders'").first();
  const media=await mediaSettings(env,home.id),ai=await aiStatusRecord(env,home.id);
  return json({media:{...media,speechAvailable:speechAvailability(env),aiConnected:!!(ai?.ciphertext&&ai.verified&&ai.model)},available:!!env.APP_ENCRYPTION_KEY,connected:!!row,botUsername:row?.bot_username||'',connectedAt:row?.connected_at||'',canManage:parent,httpsOrigin:url.protocol==='https:',schedulerLastRun:beat?new Date(beat.at).toISOString():null,
   members:home.state.members.map(m=>{const link=links.find(l=>l.member_id===m.id);return {id:m.id,linked:!!link,blocked:!!link?.blocked,linkedAt:link?.linked_at||'',canLink:m.id===actor||parent&&m.role==='child'&&!accountsSet.has(m.id),telegramName:m.id===actor?link?.telegram_name||'':''}})})};
 if(action==='status'&&request.method==='GET')return status();
 if(action==='bot'&&request.method==='POST'){
  if(!parent)throw fail('A parent connects the household Telegram bot.',403);
  const body=await bodyJSON(request,4000),token=typeof body.token==='string'?body.token.trim():'';if(!TOKEN_PATTERN.test(token))throw fail('Enter the bot token from @BotFather.');
  const local=apiOrigin(env)!=='https://api.telegram.org';if(url.protocol!=='https:'&&!local)throw fail('Telegram needs this installation’s public HTTPS address.',409);
  const me=await tg(env,token,'getMe');if(!me?.is_bot||!me.username)throw fail('This token does not belong to a Telegram bot.');
  const previous=await botRow(env,home.id),hookId=random(18),secret=random(32);
  await tg(env,token,'setWebhook',{url:url.origin+'/api/telegram/hook/'+hookId,secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:true,max_connections:10});
  await registerCommands(env,token);await env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind('tg-commands:'+home.id,Date.now(),COMMANDS_VERSION).run();
  const statements=[env.DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(household_id) DO UPDATE SET ciphertext=excluded.ciphertext,bot_id=excluded.bot_id,bot_username=excluded.bot_username,hook_id=excluded.hook_id,secret_hash=excluded.secret_hash,connected_by=excluded.connected_by,connected_at=excluded.connected_at').bind(home.id,await encryptKey(token,env,aad(home.id)),String(me.id),me.username,hookId,await hash(secret),actor,new Date().toISOString())];
  // Chats belong to a specific bot. A different bot needs everyone to press Start again.
  if(previous&&previous.bot_id!==String(me.id))statements.push(env.DB.prepare('DELETE FROM telegram_links WHERE household_id=?').bind(home.id),env.DB.prepare('DELETE FROM telegram_link_tokens WHERE household_id=?').bind(home.id));
  await env.DB.batch(statements);return status();
 }
 if(action==='media'&&request.method==='POST'){
  if(!parent)throw fail('A parent manages photos and voice for the household.',403);
  const body=await bodyJSON(request,2000),current=await mediaSettings(env,home.id),photos=typeof body.photos==='boolean'?body.photos:current.photos,provider=body.speechProvider===undefined?current.speechProvider:body.speechProvider;
  if(!SPEECH_PROVIDERS.includes(provider))throw fail('Choose a supported voice provider.');if(provider!=='off'&&!speechAvailability(env)[provider])throw fail('This voice provider is not available on this installation.',409);
  await env.DB.prepare('INSERT INTO media_settings(household_id,photos,speech_provider,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(household_id) DO UPDATE SET photos=excluded.photos,speech_provider=excluded.speech_provider,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(home.id,photos?1:0,provider,actor,new Date().toISOString()).run();return status();
 }
 if(action==='bot'&&request.method==='DELETE'){
  if(!parent)throw fail('A parent manages the household Telegram bot.',403);
  try{const bot=await withToken(env,await botRow(env,home.id));if(bot)await tg(env,bot.token,'deleteWebhook',{drop_pending_updates:true})}catch{} // Removal still proceeds if Telegram or the stored token is unavailable.
  await env.DB.batch(['telegram_bots','telegram_links','telegram_link_tokens','telegram_actions','telegram_snoozes'].map(table=>env.DB.prepare('DELETE FROM '+table+' WHERE household_id=?').bind(home.id)));return status();
 }
 const bot=await withToken(env,await botRow(env,home.id));
 if(action==='check'&&request.method==='POST'){
  if(!bot)throw fail('Connect a Telegram bot first.',409);const [me,info]=[await tg(env,bot.token,'getMe'),await tg(env,bot.token,'getWebhookInfo')];await registerCommands(env,bot.token);
  const expected=url.origin+'/api/telegram/hook/'+bot.hook_id;
  return json({ok:info.url===expected&&!info.last_error_message,botUsername:me.username,webhookMatches:info.url===expected,pendingUpdates:info.pending_update_count||0,lastError:info.last_error_message||'',lastErrorAt:info.last_error_date?new Date(info.last_error_date*1000).toISOString():null,checkedAt:new Date().toISOString()});
 }
 const target=action==='link'&&request.method==='POST'?String((await bodyJSON(request,2000)).memberId||actor):action.startsWith('link/')?decodeURIComponent(action.slice(5)):null;
 if(target!==null){
  const member=home.state.members.find(m=>m.id===target),accountsSet=await accountMembers(env,home.id);
  if(!member||!(target===actor||parent&&member.role==='child'&&!accountsSet.has(target)))throw fail('Each person links their own Telegram. A parent can link a child profile without its own account.',403);
  if(request.method==='POST'){if(!bot)throw fail('A parent needs to connect the household Telegram bot first.',409);const token=random(24),expiresAt=Date.now()+LINK_MINUTES*60000;await env.DB.prepare('INSERT INTO telegram_link_tokens(token_hash,household_id,member_id,created_by,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token),home.id,target,actor,expiresAt).run();return json({url:'https://t.me/'+bot.bot_username+'?start='+token,expiresAt:new Date(expiresAt).toISOString()},201)}
  if(request.method==='DELETE'){const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,target).first();if(link&&bot)try{await send(env,bot,link.chat_id,L(languageOf(home.state,target),'This chat was unlinked from Bayit.','הצ׳אט נותק מ־Bayit.'))}catch{}await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,target).run();return status()}
 }
 if(action==='test'&&request.method==='POST'){
  if(!bot)throw fail('Connect a Telegram bot first.',409);const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,actor).first();if(!link)throw fail('Link your own Telegram chat first.',409);const lang=languageOf(home.state,actor);
  try{const sent=await send(env,bot,link.chat_id,'<b>'+L(lang,'Test from Bayit','בדיקה מ־Bayit')+'</b>\n'+L(lang,'Telegram delivery works for your account.','משלוח בטלגרם עובד בחשבון שלכם.'));if(link.blocked)await env.DB.prepare('UPDATE telegram_links SET blocked=0 WHERE household_id=? AND member_id=?').bind(home.id,actor).run();return json({sent:true,messageId:sent.message_id,at:new Date().toISOString()})}
  catch(error){if(error.telegramStatus===403)await env.DB.prepare('UPDATE telegram_links SET blocked=1 WHERE household_id=? AND member_id=?').bind(home.id,actor).run();throw error}
 }
 throw fail('Unknown Telegram endpoint.',404);
}

// ---- Webhook ----
export async function handleTelegramWebhook(request,env,hookId){
 if(!/^[A-Za-z0-9_-]{20,40}$/.test(hookId))return json({error:'Not found.'},404);
 const row=await env.DB.prepare('SELECT * FROM telegram_bots WHERE hook_id=?').bind(hookId).first();if(!row)return json({error:'Not found.'},404);
 if(!sameDigest(await hash(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||''),row.secret_hash))return json({error:'Unauthorized.'},401);
 const update=await bodyJSON(request,200000);if(!Number.isSafeInteger(update.update_id))return json({ok:true});
 const fresh=await env.DB.prepare('INSERT OR IGNORE INTO telegram_updates(household_id,update_id,received_at) VALUES(?,?,?)').bind(row.household_id,update.update_id,Date.now()).run();if(!fresh.meta.changes)return json({ok:true});
 let bot;try{bot=await withToken(env,row)}catch{return json({ok:true})}
 // Errors are answered in the chat when possible and acknowledged to Telegram, so a bad update is not retried forever.
 try{if(update.message)await onMessage(env,bot,update.message);else if(update.callback_query)await onCallback(env,bot,update.callback_query)}
 catch(error){console.error('Bayit Telegram update failed:',error.status||'',error.telegramStatus||'');}
 return json({ok:true});
}

async function onMessage(env,bot,message){
 const chat=message.chat,from=message.from;if(!chat||!from)return;
 const langHint=from.language_code?.startsWith('he')?'he':'en';
 if(chat.type!=='private'){try{await send(env,bot,chat.id,L(langHint,'Bayit works only in private chats, so private items stay private.','Bayit עובד רק בצ׳אט פרטי, כדי שפריטים פרטיים יישארו פרטיים.'));await tg(env,bot.token,'leaveChat',{chat_id:chat.id})}catch{}return}
 const text=String(message.text||'').trim(),[command,...rest]=text.split(/\s+/),cmd=command?.startsWith('/')?command.slice(1).split('@')[0].toLowerCase():'';
 if(cmd==='start'&&rest[0])return linkChat(env,bot,message,rest[0],langHint);
 const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND chat_id=?').bind(bot.household_id,String(chat.id)).first();
 if(!link||link.telegram_user_id!==String(from.id))return send(env,bot,chat.id,L(langHint,'This chat is not linked yet. In Bayit, open Settings → Accounts & connections → Telegram and choose Connect.','הצ׳אט עדיין לא מקושר. ב־Bayit פתחו הגדרות ← חשבונות וחיבורים ← טלגרם ובחרו חיבור.'));
 if(link.blocked)await env.DB.prepare('UPDATE telegram_links SET blocked=0 WHERE household_id=? AND member_id=?').bind(bot.household_id,link.member_id).run();
 const home=await loadHousehold(env,bot.household_id),memberId=link.member_id,role=roleOf(home.state,memberId);
 if(!role){await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(bot.household_id,memberId).run();return send(env,bot,chat.id,L(langHint,'This family profile is no longer available.','פרופיל המשפחה הזה כבר אינו זמין.'))}
 const lang=languageOf(home.state,memberId,langHint);
 if(cmd==='start'||cmd==='help')return send(env,bot,chat.id,helpText(lang));
 if(cmd==='stop'){await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(bot.household_id,memberId).run();return send(env,bot,chat.id,L(lang,'This chat was unlinked. You can connect again from Bayit settings.','הצ׳אט נותק. אפשר להתחבר שוב מהגדרות Bayit.'))}
 if(cmd==='today')return sendToday(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='shopping')return sendShopping(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='tasks')return sendTasks(env,bot,home,memberId,role,link.chat_id,lang);
 if(cmd==='week')return sendWeek(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='lists')return sendLists(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='expenses')return sendExpenses(env,bot,home,memberId,role,link.chat_id,lang);
 if(cmd==='note')return saveNote(env,bot,home,memberId,link.chat_id,lang,rest.join(' '));
 if(message.document&&(message.document.mime_type==='application/pdf'||/\.pdf$/i.test(message.document.file_name||''))){
  try{return await handleStatement(env,bot,home,link,role,lang,message.document)}
  catch(error){return send(env,bot,chat.id,esc(error.status?error.message:L(lang,'This statement could not be read. Nothing was changed.','לא ניתן היה לקרוא את הדף. דבר לא שונה.')))}
 }
 const photo=message.photo?.length?message.photo.at(-1):message.document?.mime_type?.startsWith('image/')?message.document:null,voice=message.voice||message.audio;
 if(photo||voice){
  const caption=String(message.caption||'').trim(),privateCaption=/^\/mine(\s|$)/i.test(caption),request=privateCaption?caption.replace(/^\/mine\s*/i,''):caption,scope=privateCaption?'private':'family';
  try{return photo?await handlePhoto(env,bot,home,link,role,lang,photo,request,scope):await handleVoice(env,bot,home,link,role,lang,voice,scope)}
  catch(error){return send(env,bot,chat.id,esc(error.status?error.message:L(lang,'Bayit could not read this message. Nothing was changed.','Bayit לא הצליח לקרוא את ההודעה. דבר לא שונה.')))}
 }
 if(!text)return send(env,bot,chat.id,L(lang,'I can read text, photos and voice messages.','אפשר לשלוח טקסט, תמונות והודעות קוליות.'));
 if(cmd&&cmd!=='mine')return send(env,bot,chat.id,helpText(lang));
 return askAI(env,bot,home,link,role,lang,cmd==='mine'?rest.join(' '):text,cmd==='mine'?'private':'family');
}

async function linkChat(env,bot,message,token,lang){
 const now=Date.now(),tokenHash=await hash(token),row=await env.DB.prepare('SELECT * FROM telegram_link_tokens WHERE token_hash=? AND household_id=?').bind(tokenHash,bot.household_id).first();
 if(!row||row.used_at||row.expires_at<now)return send(env,bot,message.chat.id,L(lang,'This link has expired or was already used. Create a new one in Bayit settings.','הקישור פג תוקף או שכבר נעשה בו שימוש. צרו קישור חדש בהגדרות Bayit.'));
 const claimed=await env.DB.prepare('UPDATE telegram_link_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL').bind(now,tokenHash).run();if(!claimed.meta.changes)return;
 const home=await loadHousehold(env,bot.household_id);if(!roleOf(home.state,row.member_id))return send(env,bot,message.chat.id,L(lang,'This family profile is no longer available.','פרופיל המשפחה הזה כבר אינו זמין.'));
 const name=[message.from.first_name,message.from.last_name].filter(Boolean).join(' ').slice(0,80)||message.from.username||'';
 await env.DB.batch([env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND (member_id=? OR chat_id=?)').bind(bot.household_id,row.member_id,String(message.chat.id)),env.DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) VALUES(?,?,?,?,?,?)').bind(bot.household_id,row.member_id,String(message.chat.id),String(message.from.id),name,new Date().toISOString())]);
 const member=home.state.members.find(m=>m.id===row.member_id),language=languageOf(home.state,row.member_id,lang);
 return send(env,bot,message.chat.id,'<b>'+L(language,'Connected, '+esc(member.name)+'!','מחובר, '+esc(member.he||member.name)+'!')+'</b>\n'+L(language,'You will get your reminders here.','מעכשיו התזכורות שלכם יגיעו לכאן.')+'\n\n'+helpText(language));
}

async function sendToday(env,bot,home,memberId,chatId,lang){
 const date=localDate(),visible=visibleState(home.state,memberId),report=dayReport(visible,{memberId,role:roleOf(home.state,memberId),date,lang,members:home.state.members});
 const todayRows=[];for(const t of report.openTasks.slice(0,6))todayRows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(t,lang),40),{type:'done',taskId:t.id,date,keep:true})]);
 return send(env,bot,chatId,report.text,todayRows);
}

async function sendShopping(env,bot,home,memberId,chatId,lang,listId){
 const visible=visibleState(home.state,memberId),lists=(visible.shoppingLists||[]).filter(l=>l.status==='active'),chosen=listId||visible.preferences.activeShoppingListByUser?.[memberId],list=lists.find(l=>l.id===chosen)||lists[0];
 if(!list)return send(env,bot,chatId,L(lang,'You have no active shopping list.','אין לכם רשימת קניות פעילה.'));
 const items=(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id&&!i.done),rows=[];
 for(const item of items.slice(0,24))rows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(item,lang)+(item.quantity&&!/^1 items?$/.test(item.quantity)?' · '+item.quantity:''),48),{type:'buy',itemId:item.id,keep:true})]);
 const others=lists.filter(l=>l.id!==list.id).slice(0,6);if(others.length){const switches=[];for(const other of others)switches.push(await button(env,bot.household_id,memberId,'🛒 '+cut(title(other,lang),24),{type:'shoplist',listId:other.id,keep:true}));for(let i=0;i<switches.length;i+=2)rows.push(switches.slice(i,i+2))}
 const extra=items.length>24?'\n'+L(lang,'…and '+(items.length-24)+' more in the app.','…ועוד '+(items.length-24)+' באפליקציה.'):'';
 return send(env,bot,chatId,'<b>'+esc(title(list,lang))+'</b> · '+L(lang,items.length+' left',items.length+' נותרו')+'\n'+(items.length?L(lang,'Tap an item to check it off.','הקישו על פריט כדי לסמן אותו כנקנה.'):L(lang,'Everything on this list has been collected.','כל הפריטים ברשימה נאספו.'))+extra,rows);
}

// /tasks: today's tasks plus "anytime" tasks for this person; parents also see approvals waiting.
async function sendTasks(env,bot,home,memberId,role,chatId,lang){
 const today=localDate(),visible=visibleState(home.state,memberId),mine=(visible.tasks||[]).filter(t=>t.memberId===memberId&&(!t.date||occursOn(t,today)));
 const line=t=>{const state=taskStateNow(t,today),sub=t.subtasks?.length?' ('+t.subtasks.filter(x=>x.done).length+'/'+t.subtasks.length+')':'';return (state==='done'?'✓ <s>':state==='pending'?'⏳ ':'• ')+(t.priority==='high'&&state!=='done'?'⭐ ':'')+(t.time?esc(t.time)+' · ':'')+esc(title(t,lang))+sub+(state==='done'?'</s>':'')};
 const dated=mine.filter(t=>t.date).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')),anytime=mine.filter(t=>!t.date&&taskStateNow(t,today)!=='done'),rows=[];
 for(const t of [...dated,...anytime].filter(t=>taskStateNow(t,today)==='open').slice(0,12))rows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(t,lang),44),{type:'done',taskId:t.id,date:taskStateDate(t,today),keep:true})]);
 let text='<b>'+L(lang,'Your tasks','המשימות שלכם')+'</b>\n'+(dated.length?dated.map(line).join('\n'):L(lang,'Nothing scheduled for today.','אין משימות מתוכננות להיום.'));
 if(anytime.length)text+='\n\n<b>'+L(lang,'Anytime','בכל זמן')+'</b>\n'+anytime.slice(0,15).map(line).join('\n');
 if(role==='parent'){const waiting=(visible.tasks||[]).filter(t=>t.memberId!==memberId&&(!t.date||occursOn(t,today))&&taskStateNow(t,today)==='pending');if(waiting.length){text+='\n\n<b>'+L(lang,'Waiting for your approval','ממתין לאישורכם')+'</b>';for(const t of waiting.slice(0,6)){const who=home.state.members.find(m=>m.id===t.memberId);text+='\n⏳ '+esc(lang==='he'?who?.he||who?.name:who?.name)+' · '+esc(title(t,lang));rows.push([await button(env,bot.household_id,memberId,L(lang,'Approve: ','אישור: ')+cut(title(t,lang),36),{type:'approve',taskId:t.id,date:taskStateDate(t,today),keep:true})])}}}
 return send(env,bot,chatId,text+'\n\n<i>'+L(lang,'To change or add tasks, just write, e.g. “move laundry to tomorrow”.','כדי לשנות או להוסיף, פשוט כתבו, למשל „להעביר את הכביסה למחר”.')+'</i>',rows);
}

// /week: everything on the calendar this person can see for the next 7 days.
async function sendWeek(env,bot,home,memberId,chatId,lang){
 const visible=visibleState(home.state,memberId),start=localDate(),days=[];
 for(let i=0;i<7;i++){const date=new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),events=(visible.events||[]).filter(e=>occursOn(e,date)).sort((a,b)=>(a.time||'').localeCompare(b.time||''));if(!events.length)continue;
  const label=new Date(date+'T12:00:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{weekday:'short',day:'numeric',month:'short'});
  days.push('<b>'+esc(label)+'</b>\n'+events.slice(0,8).map(e=>{const who=(e.memberIds||[]).map(id=>home.state.members.find(m=>m.id===id)).filter(Boolean).map(m=>lang==='he'?m.he||m.name:m.name);return '• '+(e.time?esc(e.time)+' · ':'')+esc(title(e,lang))+(who.length&&who.length<home.state.members.length?' · '+esc(who.join(', ')):'')+(e.visibility==='private'?' 🔒':'')}).join('\n'))}
 return send(env,bot,chatId,days.length?'<b>'+L(lang,'The next 7 days','7 הימים הקרובים')+'</b>\n\n'+days.join('\n\n'):L(lang,'Nothing on the calendar for the next 7 days.','אין אירועים ביומן ב־7 הימים הקרובים.'));
}

// /lists: shopping lists (tap to open) and task lists with what is left.
async function sendLists(env,bot,home,memberId,chatId,lang){
 const visible=visibleState(home.state,memberId),today=localDate(),shopping=(visible.shoppingLists||[]).filter(l=>l.status==='active'),taskLists=visible.taskLists||[],rows=[];
 let text='<b>'+L(lang,'Shopping lists','רשימות קניות')+'</b>\n'+(shopping.length?shopping.map(l=>'🛒 '+esc(title(l,lang))+' · '+(visible.shopping||[]).filter(i=>(i.listId||'week')===l.id&&!i.done).length).join('\n'):L(lang,'None','אין'));
 for(const l of shopping.slice(0,8))rows.push([await button(env,bot.household_id,memberId,L(lang,'Open ','פתיחת ')+cut(title(l,lang),30),{type:'shoplist',listId:l.id,keep:true})]);
 if(taskLists.length)text+='\n\n<b>'+L(lang,'Task lists','רשימות משימות')+'</b>\n'+taskLists.map(l=>'📋 '+esc(title(l,lang))+' · '+L(lang,(visible.tasks||[]).filter(t=>t.listId===l.id&&taskStateNow(t,today)!=='done').length+' open',(visible.tasks||[]).filter(t=>t.listId===l.id&&taskStateNow(t,today)!=='done').length+' פתוחות')+(l.visibility==='private'?' 🔒':'')).join('\n');
 return send(env,bot,chatId,text,rows);
}

// /expenses: this person's view of the latest month (adults only, same visibility as the Expenses page).
async function sendExpenses(env,bot,home,memberId,role,chatId,lang){
 if(role==='child')return send(env,bot,chatId,L(lang,'Expenses are available to adult accounts.','ההוצאות זמינות למבוגרים בלבד.'));
 let fin;try{fin=await visibleFinance(env,home,memberId)}catch{fin={transactions:[],groups:[]}}
 const rows=fin.transactions.filter(t=>t.visibility!=='private'),thisMonth=localDate().slice(0,7),month=[...new Set(rows.map(monthOf))].sort().at(-1)||thisMonth,sum=monthSummary(rows,fin.groups||[],month);
 const visible=visibleState(home.state,memberId),manual=(visible.expenses||[]).filter(e=>e.date?.slice(0,7)===thisMonth&&e.visibility!=='private'),manualTotal=manual.reduce((n,e)=>n+(Number(e.amount)||0),0);
 const label=new Date(month+'-15T12:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{month:'long',year:'numeric'});
 if(!sum.count&&!manual.length)return send(env,bot,chatId,L(lang,'No expenses yet. Import a Leumi/Max statement PDF here, connect RiseUp in the app, or write “add 120 for groceries”.','אין הוצאות עדיין. שלחו כאן PDF של לאומי/מקס, חברו RiseUp באפליקציה, או כתבו „להוסיף 120 על קניות”.'));
 let text='<b>'+L(lang,'Expenses · ','הוצאות · ')+esc(label)+'</b>';
 if(sum.count)text+='\n'+L(lang,'In ','נכנס ')+money(sum.income/100)+' · '+L(lang,'Spent ','יצא ')+money(sum.expenses/100)+(sum.savings?' · '+L(lang,'Saved ','נחסך ')+money(sum.savings/100):'')+'\n<b>'+L(lang,'Left ','נשאר ')+money(sum.net/100)+'</b>\n\n'+sum.byCategory.filter(c=>c.amount>0).slice(0,6).map(c=>'• '+esc(lang==='he'?CATEGORY[c.category]?.he||c.category:CATEGORY[c.category]?.en||c.category)+' — '+money(c.amount/100)).join('\n');
 if(manual.length)text+='\n\n'+L(lang,'Recorded by hand this month: ','נרשם ידנית החודש: ')+money(manualTotal)+' ('+manual.length+')';
 return send(env,bot,chatId,text+'\n\n<i>'+L(lang,'Ask anything, e.g. “what are our fixed bills?”. Only shared expenses are shown here; use /mine for your private ones.','אפשר לשאול כל דבר, למשל „מה החיובים הקבועים שלנו?”. מוצגות כאן רק הוצאות משותפות; /mine למרחב הפרטי.')+'</i>');
}

// /note <text>: saves a family note right away (the person typed it), with Undo.
async function saveNote(env,bot,home,memberId,chatId,lang,raw){
 const body=String(raw||'').trim().slice(0,2000);if(!body)return send(env,bot,chatId,L(lang,'Write the note after the command, for example: /note Noa’s teacher is Dana','כתבו את ההערה אחרי הפקודה, למשל: /note המורה של נועה היא דנה'));
 const firstLine=body.split('\n')[0],titleText=firstLine.length>60?firstLine.slice(0,57)+'…':firstLine,plan={id:crypto.randomUUID(),actorId:memberId,scope:'family',actions:[{kind:'note.create',title:titleText,text:body,date:localDate(),time:localTime(new Date()),memberIds:[],icon:'bayit-activities-notebook'}]};
 const {result:receipt}=await asMember(env,home.id,memberId,data=>applyAIPlan(data,plan,memberId,home.state.members,catalog));
 return send(env,bot,chatId,'<b>'+L(lang,'Saved to the home journal','נשמר ביומן הבית')+'</b> · '+esc(titleText),[[await button(env,home.id,memberId,L(lang,'Undo','ביטול השינוי'),{type:'undo',operationId:receipt.id})]]);
}

async function askAI(env,bot,home,link,role,lang,question,scope,{images=[],label}={}){
 const stored=await aiStatusRecord(env,home.id);
 if(!stored?.ciphertext||!stored.verified||!stored.model)return send(env,bot,link.chat_id,L(lang,'AI is not connected for this household yet. A parent can connect a provider in Settings → Accounts & connections.','ה־AI עדיין לא מחובר לבית הזה. הורה יכול לחבר ספק בהגדרות ← חשבונות וחיבורים.'));
 if(!question.trim())return send(env,bot,link.chat_id,helpText(lang));
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const turns=link.turns&&link.turns_at>Date.now()-TURN_MINUTES*60000?JSON.parse(link.turns):[];
 let result;try{result=await runAssistant(env,{home,actorId:link.member_id,role,question,turns,scope,language:lang,images,channel:'telegram'})}
 catch(error){return send(env,bot,link.chat_id,esc(error.status?error.message:L(lang,'The AI could not complete this request. Nothing was changed.','ה־AI לא הצליח להשלים את הבקשה. דבר לא שונה.')))}
 const nextTurns=[...turns,{role:'user',content:(label||question).slice(0,1500)},{role:'assistant',content:String(result.answer).slice(0,1500)}].slice(-6);
 await env.DB.prepare('UPDATE telegram_links SET turns=?,turns_at=? WHERE household_id=? AND member_id=?').bind(JSON.stringify(nextTurns),Date.now(),home.id,link.member_id).run();
 if(!result.plan)return send(env,bot,link.chat_id,chatFormat(result.answer,lang));
 const lists=visibleState(home.state,link.member_id).shoppingLists||[];
 const rows=[[await button(env,home.id,link.member_id,L(lang,'Apply','החלה'),{type:'apply',plan:result.plan}),await button(env,home.id,link.member_id,L(lang,'Discard','ביטול'),{type:'discard'})]];
 return send(env,bot,link.chat_id,chatFormat(result.answer,lang)+'\n\n<b>'+L(lang,'Prepared for review'+(scope==='private'?' · private':''),'מוכן לבדיקה'+(scope==='private'?' · פרטי':''))+'</b>\n'+planText(result.plan,lang,lists)+'\n<i>'+L(lang,'Nothing is saved until you press Apply.','שום דבר לא נשמר עד ללחיצה על החלה.')+'</i>',rows);
}

async function handlePhoto(env,bot,home,link,role,lang,photo,caption,scope){
 const settings=await mediaSettings(env,home.id);
 if(!settings.photos)return send(env,bot,link.chat_id,L(lang,'Photos are turned off for this household. A parent can turn them on in Settings → Accounts & connections → Telegram.','תמונות כבויות בבית הזה. הורה יכול להפעיל אותן בהגדרות ← חשבונות וחיבורים ← טלגרם.'));
 const stored=await aiStatusRecord(env,home.id);if(!stored?.ciphertext||!stored.verified||!stored.model)return send(env,bot,link.chat_id,L(lang,'AI is not connected for this household yet. A parent can connect a provider in Settings → Accounts & connections.','ה־AI עדיין לא מחובר לבית הזה. הורה יכול לחבר ספק בהגדרות ← חשבונות וחיבורים.'));
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes,path}=await downloadFile(env,bot,photo.file_id,MAX_PHOTO_BYTES,lang),mediaType=photo.mime_type||IMAGE_TYPES[path.split('.').pop()?.toLowerCase()];
 if(!Object.values(IMAGE_TYPES).includes(mediaType))return send(env,bot,link.chat_id,L(lang,'Send a JPG, PNG, WebP or GIF image.','שלחו תמונה מסוג JPG,‏ PNG,‏ WebP או GIF.'));
 const question=caption||L(lang,'Look at this photo. If it clearly shows dates, events, tasks or shopping items, prepare them for review. Otherwise describe briefly what you see and ask what I would like to do.','הסתכל על התמונה. אם רואים בה בבירור תאריכים, אירועים, משימות או פריטי קניות, הכן אותם לבדיקה. אחרת תאר בקצרה מה רואים ושאל מה לעשות.');
 return askAI(env,bot,home,link,role,lang,question,scope,{images:[{mediaType,data:base64(bytes)}],label:'[photo] '+caption});
}

const shekels=agorot=>'\u2066'+(agorot<0?'−':'')+'₪'+Math.abs(agorot/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})+'\u2069';
async function handleStatement(env,bot,home,link,role,lang,document){
 if(role==='child')return send(env,bot,link.chat_id,L(lang,'Expenses are available to adult accounts.','ההוצאות זמינות למבוגרים בלבד.'));
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes}=await downloadFile(env,bot,document.file_id,5_000_000,lang),preview=await importStatement(env,home,link.member_id,bytes,document.file_name);
 const name={max:'Max',leumi:L(lang,'Bank Leumi','בנק לאומי')}[preview.source]||preview.source;
 const checks=preview.ok?L(lang,'✓ Matches the totals printed on the statement','✓ תואם לסכומים המודפסים בדף'):L(lang,'⚠ Some totals do not match the statement; review it in Bayit before applying','⚠ חלק מהסכומים אינם תואמים לדף; בדקו ב־Bayit לפני ההחלה');
 const lines=['<b>'+esc(name)+'</b> · '+esc(preview.period.from)+' → '+esc(preview.period.to),L(lang,preview.newCount+' new transactions','‏'+preview.newCount+' תנועות חדשות')+(preview.duplicateCount?L(lang,' · '+preview.duplicateCount+' already imported',' · '+preview.duplicateCount+' כבר יובאו'):''),checks];
 if(preview.moneyIn)lines.push(L(lang,'Money in: ','הכנסות: ')+shekels(preview.moneyIn));
 if(preview.moneyOut)lines.push(L(lang,'Money out: ','הוצאות: ')+shekels(preview.moneyOut));
 if(preview.byCategory.length)lines.push(preview.byCategory.slice(0,5).map(c=>'• '+esc(lang==='he'?CATEGORY[c.category]?.he:CATEGORY[c.category]?.en)+' — '+shekels(c.amount)).join('\n'));
 if(!preview.newCount)return send(env,bot,link.chat_id,lines.join('\n')+'\n'+L(lang,'Nothing new to add.','אין מה להוסיף.'));
 const rows=[[await button(env,home.id,link.member_id,L(lang,'Add for both parents','הוספה לשני ההורים'),{type:'finance_apply',importId:preview.id,visibility:'shared'})],[await button(env,home.id,link.member_id,L(lang,'Add privately','הוספה פרטית'),{type:'finance_apply',importId:preview.id,visibility:'private'}),await button(env,home.id,link.member_id,L(lang,'Discard','ביטול'),{type:'discard'})]];
 return send(env,bot,link.chat_id,lines.join('\n')+'\n<i>'+L(lang,'Nothing is saved until you choose.','שום דבר לא נשמר עד שתבחרו.')+'</i>',rows);
}

async function handleVoice(env,bot,home,link,role,lang,voice,scope){
 const settings=await mediaSettings(env,home.id);
 if(settings.speechProvider==='off')return send(env,bot,link.chat_id,L(lang,'Voice messages are turned off for this household. A parent can turn them on in Settings → Accounts & connections → Telegram.','הודעות קוליות כבויות בבית הזה. הורה יכול להפעיל אותן בהגדרות ← חשבונות וחיבורים ← טלגרם.'));
 if(!speechAvailability(env)[settings.speechProvider])return send(env,bot,link.chat_id,L(lang,'The voice service is not available on this installation right now.','שירות ההודעות הקוליות אינו זמין כרגע בהתקנה הזו.'));
 const seconds=Math.max(1,Math.ceil(Number(voice.duration)||0));if(seconds>MAX_VOICE_SECONDS)return send(env,bot,link.chat_id,L(lang,'Please keep voice messages under '+MAX_VOICE_SECONDS/60+' minutes.','נא לשלוח הודעות קוליות של עד '+MAX_VOICE_SECONDS/60+' דקות.'));
 const day=localDate(),used=(await env.DB.prepare('SELECT seconds FROM speech_usage WHERE household_id=? AND day=?').bind(home.id,day).first())?.seconds||0;
 if(used+seconds>DAILY_VOICE_SECONDS)return send(env,bot,link.chat_id,L(lang,'Today’s voice limit for this household has been reached. Text still works.','מכסת ההודעות הקוליות להיום הסתיימה. אפשר עדיין לכתוב.'));
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes}=await downloadFile(env,bot,voice.file_id,MAX_VOICE_BYTES,lang);
 await env.DB.prepare('INSERT INTO speech_usage(household_id,day,seconds) VALUES(?,?,?) ON CONFLICT(household_id,day) DO UPDATE SET seconds=seconds+excluded.seconds').bind(home.id,day,seconds).run();
 const heard=await transcribe(env,settings.speechProvider,bytes);
 if(!heard)return send(env,bot,link.chat_id,L(lang,'I could not hear any words in that message.','לא הצלחתי לשמוע מילים בהודעה.'));
 await send(env,bot,link.chat_id,'🎙 <b>'+L(lang,'I heard:','שמעתי:')+'</b> <i>'+esc(heard)+'</i>');
 return askAI(env,bot,home,link,role,lang,heard,scope,{label:'[voice] '+heard});
}

// Runs a change as the member with one retry if another device saved at the same moment.
async function asMember(env,householdId,memberId,mutate){for(let attempt=0;;attempt++){const home=await loadHousehold(env,householdId);try{return {home,...await commitAsMember(env,home,memberId,mutate)}}catch(error){if(error.status!==409||attempt)throw error}}}

async function onCallback(env,bot,query){
 const answer=(text,alert=false)=>tg(env,bot.token,'answerCallbackQuery',{callback_query_id:query.id,text:cut(text,190),show_alert:alert}).catch(()=>{});
 const id=/^a:([A-Za-z0-9_-]{16})$/.exec(query.data||'')?.[1],chatId=query.message?.chat?.id;
 const link=chatId&&await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND chat_id=?').bind(bot.household_id,String(chatId)).first();
 const action=id&&await env.DB.prepare('SELECT * FROM telegram_actions WHERE id=? AND household_id=?').bind(id,bot.household_id).first();
 const langHint=query.from?.language_code?.startsWith('he')?'he':'en';
 if(!link||link.telegram_user_id!==String(query.from?.id)||!action||action.member_id!==link.member_id)return answer(L(langHint,'This button is not available in this chat.','הכפתור אינו זמין בצ׳אט הזה.'),true);
 if(action.used_at||action.expires_at<Date.now())return answer(L(langHint,'This button has already been used or has expired.','כבר נעשה שימוש בכפתור או שפג תוקפו.'),true);
 const claimed=await env.DB.prepare('UPDATE telegram_actions SET used_at=? WHERE id=? AND used_at IS NULL').bind(Date.now(),id).run();if(!claimed.meta.changes)return answer(L(langHint,'This button has already been used.','כבר נעשה שימוש בכפתור.'));
 const payload=JSON.parse(action.payload),memberId=link.member_id,release=()=>env.DB.prepare('UPDATE telegram_actions SET used_at=NULL WHERE id=?').bind(id).run();
 const home0=await loadHousehold(env,bot.household_id),lang=languageOf(home0.state,memberId,langHint);
 const clearButtons=()=>tg(env,bot.token,'editMessageReplyMarkup',{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
 // List messages (/tasks, /shopping, /today) keep their other buttons: only the pressed one is removed.
 const dropButton=()=>{const rows=(query.message.reply_markup?.inline_keyboard||[]).map(r=>r.filter(b=>b.callback_data!==query.data)).filter(r=>r.length);return tg(env,bot.token,'editMessageReplyMarkup',{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:rows}}).catch(()=>{})},settle=()=>payload.keep?dropButton():clearButtons();
 try{
  if(payload.type==='discard'){await clearButtons();return answer(L(lang,'Discarded. Nothing was changed.','בוטל. דבר לא שונה.'))}
  if(payload.type==='snooze'){await env.DB.prepare('INSERT INTO telegram_snoozes(id,household_id,member_id,payload,due_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),bot.household_id,memberId,JSON.stringify(payload.item),Date.now()+SNOOZE_MINUTES*60000).run();await clearButtons();return answer(L(lang,'I will remind you again in '+SNOOZE_MINUTES+' minutes.','אזכיר שוב בעוד '+SNOOZE_MINUTES+' דקות.'))}
  if(payload.type==='done'||payload.type==='approve'){
   const today=localDate();if(payload.date!==today)throw fail(L(lang,'Only today’s activities can be completed from Telegram.','מטלגרם אפשר להשלים רק פעילויות של היום.'),400);
   const {result}=await asMember(env,bot.household_id,memberId,(data,role)=>{const task=data.tasks.find(t=>t.id===payload.taskId);if(!task||!(task.date?occursOn(task,payload.date):payload.date===today))throw fail(L(lang,'This activity is no longer available.','הפעילות הזאת כבר אינה זמינה.'),404);const before=completionState(task,payload.date);if(before==='done')return 'already';if(payload.type==='approve'&&(role!=='parent'||before!=='pending'))throw fail(L(lang,'This approval is no longer waiting.','האישור הזה כבר אינו ממתין.'),409);if(payload.type==='done'&&before==='pending')return 'pending';const outcome=completeTask(task,{date:payload.date,actorId:memberId,actorRole:role==='parent'?'parent':'child',time:localTime(),instant:new Date().toISOString()});return outcome.state});
   await settle();return answer(result==='already'?L(lang,'Already done.','כבר הושלם.'):result==='pending'?L(lang,'Sent to a parent for approval.','נשלח לאישור הורה.'):payload.type==='approve'?L(lang,'Approved.','אושר.'):L(lang,'Marked as done.','סומן כהושלם.'));
  }
  if(payload.type==='buy'){
   const {result}=await asMember(env,bot.household_id,memberId,data=>{const item=(data.shopping||[]).find(i=>i.id===payload.itemId);if(!item)throw fail(L(lang,'This item is no longer on the list.','הפריט כבר אינו ברשימה.'),404);if(item.done)return {already:true,item};item.done=true;item.boughtAt=new Date().toISOString();item.boughtBy=memberId;return {item}});
   await dropButton();return answer(result.already?L(lang,'Already checked off.','כבר סומן.'):L(lang,'Checked off: ','סומן: ')+title(result.item,lang));
  }
  if(payload.type==='shoplist'){
   await commitAsMember(env,home0,memberId,data=>{data.preferences.activeShoppingListByUser={...data.preferences.activeShoppingListByUser,[memberId]:payload.listId}}).catch(()=>{});
   await release();await sendShopping(env,bot,home0,memberId,chatId,lang,payload.listId);return answer('');
  }
  if(payload.type==='apply'){
   const {home,result:receipt}=await asMember(env,bot.household_id,memberId,data=>applyAIPlan(data,payload.plan,memberId,home0.state.members,catalog));
   await clearButtons();const changed=receipt.changes?.length||0,undo=await button(env,home.id,memberId,L(lang,'Undo','ביטול השינוי'),{type:'undo',operationId:receipt.id});
   await send(env,bot,chatId,'<b>'+L(lang,'Applied','הוחל')+'</b> · '+L(lang,changed+' change'+(changed===1?'':'s'),changed+' שינויים')+(receipt.skipped?L(lang,' · '+receipt.skipped+' already on the list',' · '+receipt.skipped+' כבר ברשימה'):''),[[undo]]);return answer(L(lang,'Applied.','הוחל.'));
  }
  if(payload.type==='finance_apply'){
   const result=await applyImport(env,home0,memberId,payload.importId,{visibility:payload.visibility});
   await clearButtons();return answer(result.already?L(lang,'Already added.','כבר נוסף.'):L(lang,'Added '+result.applied+' transactions to Expenses.','נוספו '+result.applied+' תנועות להוצאות.'),true);
  }
  if(payload.type==='undo'){
   const {result:receipt}=await asMember(env,bot.household_id,memberId,data=>undoAIPlan(data,payload.operationId,memberId));
   await clearButtons();return answer(L(lang,'Undone: '+receipt.restored+(receipt.preserved?' · '+receipt.preserved+' later edits kept':''),'בוטל: '+receipt.restored+(receipt.preserved?' · '+receipt.preserved+' עריכות מאוחרות נשמרו':'')),true);
  }
  throw fail('Unsupported button.');
 }catch(error){await release();return answer(error.status?error.message:L(lang,'Bayit could not complete this. Nothing was changed.','Bayit לא הצליח להשלים את הפעולה. דבר לא שונה.'),true)}
}

// ---- Scheduled reminders ----
export async function runReminderTick(request,env){
 const supplied=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!env.REMINDER_CRON_SECRET||!supplied||!sameDigest(await hash(supplied),await hash(env.REMINDER_CRON_SECRET)))return json({error:'Unauthorized.'},401);
 const result=await deliverReminders(env,new Date());
 try{result.push=await deliverPush(env,new Date())}catch{result.push={failed:1}}
 // The same minute tick refreshes optional finance connections (RiseUp) about once a day.
 try{result.financeSynced=await refreshDueConnections(env,new Date())}catch{result.financeSynced=0}
 return json(result);
}

export async function deliverReminders(env,now){
 const date=localDate(now),time=localTime(now),summary={households:0,sent:0,failed:0,suppressed:0};
 const bots=(await env.DB.prepare('SELECT * FROM telegram_bots').all()).results;
 for(const row of bots){
  const links=(await linksFor(env,row.household_id)).filter(l=>!l.blocked);if(!links.length)continue;summary.households++;
  let bot,home;try{bot=await withToken(env,row);home=await loadHousehold(env,row.household_id)}catch{summary.failed++;continue}
  try{await ensureCommands(env,bot)}catch{}
  // Only the yes/no "Update parents" choice of each child is shared with parents' delivery.
  const childPrefs=Object.fromEntries(home.state.members.filter(m=>m.role==='child').map(m=>[m.id,notificationPrefs(home.state.profiles[m.id]).parentUpdates!==false]));
  const snoozes=(await env.DB.prepare('SELECT * FROM telegram_snoozes WHERE household_id=? AND sent_at IS NULL AND due_at<=?').bind(row.household_id,now.getTime()).all()).results;
  for(const link of links){
   const memberId=link.member_id,role=roleOf(home.state,memberId);if(!role)continue;
   const visible=visibleState(home.state,memberId),lang=languageOf(home.state,memberId),prefs=notificationPrefs(home.state.profiles[memberId]),quiet=inQuietHours(time,prefs.quietStart,prefs.quietEnd),outbox=[];
   for(const item of dueReminders(visible,memberId,{date,time}))outbox.push({key:item.key,build:async()=>[reminderText(item,lang,time),[[...(item.kind==='task'?[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:item.record.id,date})]:[]),await button(env,row.household_id,memberId,L(lang,'Snooze '+SNOOZE_MINUTES+' min','נודניק '+SNOOZE_MINUTES+' דק׳'),{type:'snooze',item:{kind:item.kind,id:item.record.id,date,category:item.category}})]]]});
   const digest=digestDue(visible,memberId,{date,time});if(digest)outbox.push({key:digest.key,build:async()=>{const report=dayReport(visible,{memberId,role,date,lang,members:home.state.members,greeting:true}),rows=[];for(const t of report.openTasks.slice(0,4))rows.push([await button(env,row.household_id,memberId,'✓ '+cut(title(t,lang),40),{type:'done',taskId:t.id,date,keep:true})]);return [report.text,rows]}});
   if(!quiet){
    for(const request of approvalRequests(visible,memberId,{date},role)){const who=home.state.members.find(m=>m.id===request.task.memberId);outbox.push({key:request.key,build:async()=>['<b>'+L(lang,'Approval needed','נדרש אישור')+'</b>\n'+esc(lang==='he'?who?.he||who?.name:who?.name)+' · '+esc(title(request.task,lang)),[[await button(env,row.household_id,memberId,L(lang,'Approve','אישור'),{type:'approve',taskId:request.task.id,date})]]]})}
    const nameOf=id=>{const m=home.state.members.find(x=>x.id===id);return lang==='he'?m?.he||m?.name:m?.name},reported=new Set(childUpdates(visible,memberId,{date,time},role,childPrefs).map(u=>u.entry.taskId+':'+u.entry.date));
    for(const u of ownerDoneUpdates(visible,memberId,{date}))if(!reported.has(u.task.id+':'+u.date))outbox.push({key:u.key,build:async()=>[esc(nameOf(u.actorId))+' '+L(lang,'completed','השלים/ה')+': <b>'+esc(title(u.task,lang))+'</b> ✓']});
    for(const alert of overdueAlerts(visible,memberId,{date,time}))outbox.push({key:alert.key,build:async()=>['<b>'+L(lang,'Not done yet','עדיין לא בוצע')+'</b>\n'+esc(title(alert.task,lang))+(alert.assignee?'':' · '+esc(nameOf(alert.task.memberId)))+' · '+esc(alert.date+(alert.task.time?' '+alert.task.time:'')),alert.assignee&&alert.date===date?[[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:alert.task.id,date})]]:[]]});
    for(const update of childUpdates(visible,memberId,{date,time},role,childPrefs)){const who=home.state.members.find(m=>m.id===update.entry.memberId);outbox.push({key:update.key,build:async()=>[esc(lang==='he'?who?.he||who?.name:who?.name)+' '+L(lang,'completed','השלים/ה')+': <b>'+esc(title(update.entry,lang))+'</b> ✓']})}
   }
   for(const snooze of snoozes.filter(s=>s.member_id===memberId)){
    const item=JSON.parse(snooze.payload),record=(item.kind==='event'?visible.events:visible.tasks).find(r=>r.id===item.id);
    await env.DB.prepare('UPDATE telegram_snoozes SET sent_at=? WHERE id=?').bind(now.getTime(),snooze.id).run();
    if(!record||item.date!==date||item.kind==='task'&&completionState(record,date)!=='open'){summary.suppressed++;continue}
    const reminder={...item,record,time:record.time||time};outbox.push({key:'snooze:'+snooze.id,build:async()=>[reminderText(reminder,lang,time),item.kind==='task'?[[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:record.id,date})]]:[]]});
   }
   for(const message of outbox.slice(0,MAX_PER_MEMBER_TICK)){
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,'telegram',?,'sending',?)").bind(row.household_id,memberId,message.key,now.getTime()).run();if(!claim.meta.changes)continue;
    const mark=(status,detail='')=>env.DB.prepare("UPDATE notification_deliveries SET status=?,detail=? WHERE household_id=? AND member_id=? AND channel='telegram' AND delivery_key=?").bind(status,detail,row.household_id,memberId,message.key).run();
    try{const [text,rows]=await message.build();await send(env,bot,link.chat_id,text,rows);await mark('sent');summary.sent++}
    catch(error){summary.failed++;
     if(error.transient)await env.DB.prepare("DELETE FROM notification_deliveries WHERE household_id=? AND member_id=? AND channel='telegram' AND delivery_key=?").bind(row.household_id,memberId,message.key).run();
     else{await mark('failed',cut(String(error.message||''),200));if(error.telegramStatus===403){await env.DB.prepare('UPDATE telegram_links SET blocked=1 WHERE household_id=? AND member_id=?').bind(row.household_id,memberId).run();break}}}
   }
  }
 }
 const at=now.getTime();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES('reminders',?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind(at,JSON.stringify(summary)),
  env.DB.prepare('DELETE FROM notification_deliveries WHERE created_at<?').bind(at-14*86400000),
  env.DB.prepare('DELETE FROM telegram_actions WHERE expires_at<?').bind(at-86400000),
  env.DB.prepare('DELETE FROM telegram_link_tokens WHERE expires_at<?').bind(at-86400000),
  env.DB.prepare('DELETE FROM telegram_updates WHERE received_at<?').bind(at-2*86400000),
  env.DB.prepare('DELETE FROM telegram_snoozes WHERE sent_at IS NOT NULL AND sent_at<?').bind(at-86400000)
 ]);
 return {ok:true,date,time,...summary};
}
