import {isMine} from '../../shared/record-audience.mjs';
import {deliveryView,stateFeatureContext,telegramFeature,telegramCallbackFeature,featureLabel} from '../../shared/features.mjs';
// Telegram delivery for a household's own bot: setup, per-person linking, webhook commands,
// AI chat with Apply/Undo, reminder buttons and the scheduled reminder tick.
// Every message is built from visibleState(state, recipient), the same access rules as the app.
import {json,fail,random,hash,sameDigest,bodyJSON,encryptKey,decryptKey,localDate,localTime,base64} from './util.mjs';
import {importStatement,applyImport,visibleFinance} from './finance.mjs';
import {refreshDueConnections} from './riseup.mjs';
import {CATEGORY,monthSummary,monthOf} from '../../shared/finance.mjs';
import {describeAction,taskStateNow,taskStateDate} from '../../shared/ai-actions.mjs';
import {whenLabel} from '../../shared/item-reminders.mjs';
import {dayReport,chatFormat,rtl,card,block,bullet,notice,plural,alertCard,localizeDates,shortDay,dateRange,quantityText,dayLabel} from './telegram-format.mjs';
import {HOME_CURRENCY_SYMBOL} from '../../shared/home-config.mjs';
import {SPEECH_PROVIDERS,MAX_VOICE_SECONDS,MAX_VOICE_BYTES,DAILY_VOICE_SECONDS,speechAvailability,speechNames,speechOptions,speechHousehold,speechState,speechChoice,transcribe} from './speech.mjs';
import {loadHousehold,roleOf,commitAsMember,runAssistant,aiStatusRecord,catalog} from './assistant.mjs';
import {visibleState} from './state.mjs';
import {lease,maintenance} from './security.mjs';
import {withPDFSlot} from './pdf-budget.mjs';
import {telegramLinkIdentity,authorizeTelegramClaim,claimTelegramLink,ownAccountInvitation} from './child-identity.mjs';
import {externalFetch,boundedBytes,boundedJSON} from './outbound.mjs';
import {applyAIPlan,undoAIPlan} from '../../shared/ai-contract.mjs';
import {completeTask,completionState,occursOn} from '../src/domain.js';
import {deliverPush} from './push.mjs';
import {financeDeliveryMessages} from './finance-goals.mjs';
import {insuranceAlerts} from '../../shared/insurance-lifecycle.mjs';
import {searchVouchers,voucherDeliveryMessages,voucherLink} from './voucher-delivery.mjs';
import {syncDueGoogleCalendar} from './google-calendar.mjs';
import {generateDueSuggestions} from './home-suggestions.mjs';
import {runDueBayitAI,bayitAIDeliveryMessages} from './bayit-ai.mjs';
import {stageInsuranceReport,readInsurancePreview,insurancePreviewSummary,applyInsurancePreview,discardInsurancePreview} from './insurance-import.mjs';
import {dueReminders,digestDue,approvalRequests,childUpdates,taskDoneUpdates,overdueAlerts,agenda,notificationPrefs,inQuietHours,minutes,snoozable,snoozeStillDue,reminderMatchesOccurrence,changeUpdates} from './reminders.mjs';
import {describeChange,changeWhen} from '../../shared/change-notices.mjs';

// The "/" menu. Registered when a bot connects, on Test connection, and re-registered automatically by the
// scheduler whenever this list changes (COMMANDS_VERSION), so older bots get new commands without reconnecting.
const COMMANDS_VERSION='4';
const COMMANDS={en:[['today','My day'],['tasks','My tasks · tap to complete'],['week','The next 7 days'],['shopping','Shopping list · tap to check off'],['lists','All my lists'],['note','Write a note: /note text'],['expenses','Spending this month'],['insurance','Import an insurance Excel report'],['mine','Private request: /mine text'],['help','What I can do'],['stop','Unlink this chat']],
 he:[['today','היום שלי'],['tasks','המשימות שלי · הקשה מסמנת כבוצע'],['week','7 הימים הקרובים'],['shopping','רשימת הקניות · הקשה מסמנת כנקנה'],['lists','כל הרשימות שלי'],['note','כתיבת הערה: /note טקסט'],['expenses','ההוצאות החודש'],['insurance','ייבוא דוח Excel מהר הביטוח'],['mine','בקשה פרטית: /mine טקסט'],['help','מה אני יודע לעשות'],['stop','ניתוק הצ׳אט']]};
async function registerCommands(env,token){let ok=true;for(const lang of ['en','he']){try{await tg(env,token,'setMyCommands',{commands:[...COMMANDS[lang],['vouchers',L(lang,'Find my vouchers','חיפוש שוברים שלי')]].map(([command,description])=>({command,description})),...(lang==='he'?{language_code:'he'}:{})})}catch{ok=false}}return ok}
async function ensureCommands(env,bot){const name='tg-commands:'+bot.household_id,row=await env.DB.prepare('SELECT detail FROM service_heartbeats WHERE name=?').bind(name).first();if(row?.detail===COMMANDS_VERSION)return;if(await registerCommands(env,bot.token))await env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind(name,Date.now(),COMMANDS_VERSION).run()}
const LINK_MINUTES=30,ACTION_DAYS=2,MAX_PER_MEMBER_TICK=10,SNOOZE_MINUTES=10,TURN_MINUTES=30;
const TOKEN_PATTERN=/^\d{5,16}:[A-Za-z0-9_-]{30,60}$/;
const L=(lang,en,he)=>lang==='he'?he:en;
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const title=(record,lang)=>lang==='he'?record.he||record.title||record.name:record.title||record.name||record.he;
const cut=(value,max)=>value.length>max?value.slice(0,max-1)+'…':value;
// Server errors are shown as written only when they are in the person's language (many are English-only); otherwise
// the generic sentence in that language. Hebrew chats never get an English error (Telegram audit 2026-11-08).
const errorText=(lang,error,en,he)=>{const message=String(error?.message||''),hebrew=/[\u0590-\u05FF]/.test(message);return error?.status&&message&&(lang==='he'?hebrew:!hebrew)?message:L(lang,en,he)};

// ---- Telegram Bot API ----
// A loopback API origin is accepted only for local regression tests with a fake Telegram server.
const apiOrigin=env=>/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(env.TELEGRAM_API_ORIGIN||'')?env.TELEGRAM_API_ORIGIN:'https://api.telegram.org';
async function tg(env,token,method,body={}){
 let response;
 try{response=await externalFetch(env,apiOrigin(env)+'/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})}
 catch{throw Object.assign(fail('Telegram could not be reached. Nothing was confirmed.',502),{transient:true})}
 let result={};try{result=await boundedJSON(response,200000)}catch{}
 if(!response.ok||!result.ok){const code=result.error_code||response.status,error=fail('Telegram: '+cut(String(result.description||'request failed ('+code+')'),200),code===401||code===404?400:502);error.telegramStatus=code;error.transient=code===429||code>=500;throw error}
 return result.result;
}
const keyboard=rows=>rows?.length?{reply_markup:{inline_keyboard:rows}}:{};
// lang: the recipient's language; Hebrew lines are made right-to-left (telegram-format.mjs rtl).
const send=(env,bot,chatId,text,rows,lang)=>tg(env,bot.token,'sendMessage',{chat_id:chatId,text:cut(rtl(lang,text),4000),parse_mode:'HTML',link_preview_options:{is_disabled:true},...keyboard(rows)});

// ---- Storage ----
const aad=householdId=>'telegram:'+householdId;
async function botRow(env,householdId){return env.DB.prepare('SELECT * FROM telegram_bots WHERE household_id=?').bind(householdId).first()}
async function withToken(env,row){if(!row)return null;try{return {...row,token:await decryptKey(row.ciphertext,env,aad(row.household_id))}}catch{throw fail('The stored bot token can no longer be read. A parent can disconnect and connect the bot again.',409)}}
async function linksFor(env,householdId){return (await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=?').bind(householdId).all()).results}
async function accountMembers(env,householdId){return new Set((await env.DB.prepare('SELECT member_id FROM memberships WHERE household_id=?').bind(householdId).all()).results.map(r=>r.member_id))}
// Stores a button payload server-side; Telegram only carries the short random ID.
async function button(env,householdId,memberId,text,payload){const id=random(12);await env.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind(id,householdId,memberId,JSON.stringify(payload),Date.now()+ACTION_DAYS*86400000).run();return {text,callback_data:'a:'+id}}
const languageOf=(state,memberId,fallback)=>state.profiles?.[memberId]?.locale||fallback||'he';
// A person's name in the reader's language (Hebrew chats showed English profile names on insurance buttons).
const personName=(state,id,lang)=>{const m=state.members.find(x=>x.id===id)||{},p=state.profiles?.[id]||{};return lang==='he'?p.he||m.he||p.name||m.name:p.name||m.name||m.he||p.he}
async function mediaSettings(env,householdId){const row=await env.DB.prepare('SELECT photos,speech_provider FROM media_settings WHERE household_id=?').bind(householdId).first();return {photos:row?row.photos!==0:true,speechProvider:SPEECH_PROVIDERS.includes(row?.speech_provider)?row.speech_provider:'off'}}
const MAX_PHOTO_BYTES=3_700_000,IMAGE_TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
// Downloads a file the member sent to the bot (Bot API limit: 20 MB; Bayit uses much smaller limits).
async function downloadFile(env,bot,fileId,maxBytes,lang){
 const tooLarge=()=>fail(L(lang,'This file is too large for Bayit.','הקובץ גדול מדי עבור Bayit.'),413);
 const file=await tg(env,bot.token,'getFile',{file_id:fileId});if(!file?.file_path)throw fail(L(lang,'Telegram did not provide this file.','טלגרם לא סיפק את הקובץ.'),502);if(file.file_size>maxBytes)throw tooLarge();
 let response;try{response=await externalFetch(env,apiOrigin(env)+'/file/bot'+bot.token+'/'+file.file_path,{signal:AbortSignal.timeout(20000)})}catch{throw fail(L(lang,'The file could not be downloaded from Telegram.','לא ניתן היה להוריד את הקובץ מטלגרם.'),502)}
 if(!response.ok)throw fail(L(lang,'The file could not be downloaded from Telegram.','לא ניתן היה להוריד את הקובץ מטלגרם.'),502);
 const bytes=await boundedBytes(response,maxBytes);if(bytes.length>maxBytes)throw tooLarge();return {bytes,path:file.file_path};
}

// ---- Message text ----
// ---- Message text: one anatomy for every message (telegram-format.mjs card/notice) ----
const REMINDER_KIND={event:['📅','Event reminder','תזכורת לאירוע'],routine:['🔁','Routine reminder','תזכורת לשגרה'],task:['✅','Task reminder','תזכורת למשימה']};
// "in 10 min" on the day; "Tomorrow at 16:30" / "In 3 days · Wed 11 Nov at 16:30" for day-before reminders.
function reminderText(item,lang,now,today=item.date){
 const name=esc(title(item.record,lang));
 if(item.kind==='maintenance')return card(lang,{icon:'🛠',title:name,context:L(lang,'Home care reminder · due ','תזכורת תחזוקה · לביצוע עד ')+esc(dayLabel(item.dueDate||item.date,lang))});
 const when=whenLabel({date:item.date,time:item.time},{date:today,time:now},lang),[icon,en,he]=REMINDER_KIND[item.kind==='event'?'event':item.category==='routines'?'routine':'task'];
 return card(lang,{icon:'🔔',title:name,context:icon+' '+L(lang,en,he)+' · '+(item.date===today&&item.time?'<b>'+esc(item.time)+'</b> · '+esc(when):'<b>'+esc(when)+'</b>')});
}
// "Changes to things assigned to me": 🗑️/✏️/👤 + the item's title, then who changed what (shared/change-notices.mjs).
function changeText(burst,lang,nameOf){
 const d=describeChange(burst,lang,nameOf);
 return card(lang,{icon:d.icon,title:esc(d.title),context:esc(d.headline)+(d.lines.length===1?' · '+esc(d.lines[0]):''),blocks:d.lines.length>1?[d.lines.map(l=>bullet(esc(l))).join('\n')]:[]});
}
// Corrects reminders already sent to this person for an item that was deleted, moved, or that they were removed from:
// the message is edited in place (title struck through, "Cancelled" / "Moved to …") and its buttons removed. Needs the
// Telegram message id saved with the delivery ("m:<id>"); older deliveries without it are left as they are.
async function correctSentReminders(env,bot,householdId,link,memberId,burst,visible,lang,nameOf,today){
 const kind=burst.collection==='events'?'event':'task';let rows=[];
 try{rows=(await env.DB.prepare("SELECT delivery_key,detail FROM notification_deliveries WHERE household_id=? AND member_id=? AND channel='telegram' AND status='sent' AND delivery_key LIKE ?").bind(householdId,memberId,kind+':'+burst.itemId+':%').all()).results||[]}catch{return 0}
 const record=(visible[burst.collection]||[]).find(r=>r.id===burst.itemId),from=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),by=burst.actorIds.map(nameOf).filter(Boolean).join(', ');let fixed=0;
 const [icon,en,he]=REMINDER_KIND[burst.before.kind==='event'?'event':burst.before.kind==='routine'?'routine':'task'],name=esc((lang==='he'?burst.before.he||burst.before.title:burst.before.title||burst.before.he)||'');
 for(const row of rows){
  const key=/^(?:event|task):.+:(\d{4}-\d{2}-\d{2}):((?:\d{2}:\d{2})?):-?\d+$/.exec(row.delivery_key),messageId=/^m:(\d+)$/.exec(row.detail||'')?.[1];if(!key||!messageId||key[1]<from)continue;
  if(burst.type==='changed'&&record&&occursOn(record,key[1])&&(record.time||'')===key[2])continue; // That reminder is still right.
  const status=burst.type==='deleted'?L(lang,'Cancelled · deleted by ','בוטל · נמחק על ידי ')+by:burst.type==='removed'?L(lang,'You were removed · by ','הוסרתם · על ידי ')+by:L(lang,'Moved to ','הועבר ל־')+changeWhen(burst.after,lang);
  try{await tg(env,bot.token,'editMessageText',{chat_id:link.chat_id,message_id:Number(messageId),text:cut(rtl(lang,card(lang,{icon:'🔔',title:'<s>'+name+'</s>',context:icon+' '+L(lang,en,he)+' · <b>'+esc(status)+'</b>'})),4000),parse_mode:'HTML',link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[]}});fixed++}catch{}
  try{await env.DB.prepare("UPDATE notification_deliveries SET detail=? WHERE household_id=? AND member_id=? AND channel='telegram' AND delivery_key=?").bind(row.detail+':corrected',householdId,memberId,row.delivery_key).run()}catch{}
 }
 return fixed;
}
// Amounts are wrapped as a left-to-right unit, so Hebrew messages show −₪55, not 55-₪.
const money=v=>'\u2066'+(v<0?'−':'')+HOME_CURRENCY_SYMBOL+Math.abs(Math.round(v)).toLocaleString('en-US')+'\u2069';
// The AI's prepared changes, one line each. Hebrew arrows point the reading way; dates read as words.
function planText(plan,lang,lists){return plan.actions.map(a=>{
 const described=describeAction(a,lang,money);if(described)return bullet(esc(localizeDates(lang==='he'?described.replace(/→/g,'←'):described,lang)));
 if(a.kind==='shopping.list.create')return bullet(L(lang,'New list: ','רשימה חדשה: ')+esc(a.title));
 if(a.kind==='shopping.add'){const list=lists.find(l=>l.id===a.listId);return bullet([L(lang,'Add: ','הוספה: ')+esc(a.title),esc(quantityText(a.quantity,a.unit,lang)),list&&esc(title(list,lang))])}
 const what=a.kind==='event.create'?L(lang,'New event: ','אירוע חדש: '):a.kind==='task.create'?L(lang,'New task: ','משימה חדשה: '):'';
 return bullet([what+esc(a.title),a.date&&esc(shortDay(a.date,lang)),a.time&&esc(a.time)]);
}).join('\n')}
const insuranceGuideText=lang=>card(lang,{icon:'🛡',title:L(lang,'Import insurance','ייבוא ביטוחים'),context:L(lang,'From the Har HaBituach website, in four steps:','מאתר הר הביטוח, בארבעה צעדים:'),
 blocks:[L(lang,['Open https://harb.cma.gov.il/ and choose insured-person login.','Complete the government identification yourself.','Open your insurance portfolio (all insurance) and download the detailed Excel report.','Send the original Excel file here, choose who is insured, review the summary and confirm.'],
  ['פתחו את https://harb.cma.gov.il/ ובחרו כניסה למבוטחים.','השלימו בעצמכם את ההזדהות הממשלתית.','פתחו את התיק הביטוחי (כל הביטוחים) והורידו את הדוח המפורט ב־Excel.','שלחו כאן את קובץ האקסל המקורי, בחרו מי המבוטח, בדקו את הסיכום ואשרו.']).map((t,i)=>(i+1)+'. '+t).join('\n')],
 hint:L(lang,'Full policy documents (PDF) are separate. Never send government passwords or verification codes.','מסמכי הפוליסה המלאים (PDF) נפרדים. אין לשלוח סיסמאות ממשלתיות או קודי אימות.')});
const insurancePreviewText=(p,lang)=>card(lang,{icon:'🛡',title:L(lang,'Insurance report','דוח ביטוחים'),context:p.reportDate?L(lang,'Report date: ','תאריך הדוח: ')+esc(localizeDates(p.reportDate,lang)):'',
 blocks:[[bullet(plural(lang,p.rows,'coverage row','coverage rows','שורת כיסוי אחת','שורות כיסוי')),bullet(plural(lang,p.policyNumbers,'policy number','policy numbers','מספר פוליסה אחד','מספרי פוליסה')),p.estimatedMonthly!=null&&bullet(L(lang,'Monthly equivalent in the report: ','שווי חודשי לפי הדוח: ')+shekels(p.estimatedMonthly))].filter(Boolean).join('\n')],
 hint:L(lang,'Report premiums are not verified payment records.','פרמיות בדוח אינן אישור לתשלומים שבוצעו.')+(p.numericIdentifiers?'\n'+L(lang,'Excel numeric policy numbers may have lost leading zeros. Check them against the site and correct them in Bayit if needed.','מספרי פוליסה מספריים באקסל עלולים לאבד אפסים מובילים. בדקו מול האתר ותקנו ב־Bayit לפי הצורך.'):'')});
const COMMAND_HELP={en:[['today','your day'],['tasks','your tasks, tap ✓ to complete'],['week','the next 7 days'],['shopping','tap items to check them off'],['lists','all your lists'],['note &lt;text&gt;','save a note'],['expenses','spending this month'],['insurance','import an insurance Excel report'],['mine &lt;request&gt;','use your private space'],['stop','unlink this chat']],
 he:[['today','היום שלכם'],['tasks','המשימות, ✓ לסימון'],['week','7 הימים הקרובים'],['shopping','הקשה מסמנת כנקנה'],['lists','כל הרשימות'],['note &lt;טקסט&gt;','שמירת הערה'],['expenses','ההוצאות החודש'],['insurance','ייבוא דוח Excel מהר הביטוח'],['mine &lt;בקשה&gt;','המרחב הפרטי שלכם'],['stop','ניתוק הצ׳אט']]};
const helpText=lang=>card(lang,{icon:'🏠',title:L(lang,'Bayit on Telegram','Bayit בטלגרם'),context:L(lang,'Your home assistant. Write in your own words, or send a photo or a voice message.','העוזר של הבית. כתבו במילים שלכם, או שלחו תמונה או הודעה קולית.'),
 blocks:[block('💬',L(lang,'For example','למשל'),L(lang,['“add milk and eggs to the shopping list”','“move the dentist to Thursday at 10”','“mark take out the trash as done”','“remember that Noa’s teacher is Dana”','“how much did we spend on food this month?”'],['„להוסיף חלב וביצים לרשימת הקניות”','„להעביר את רופא השיניים ליום חמישי ב־10”','„לסמן שהוצאתי את הזבל”','„לזכור שהמורה של נועה היא דנה”','„כמה הוצאנו על אוכל החודש?”']).map(bullet),L(lang,'The AI prepares the change and you press <b>Apply</b>. You can always undo.','ה־AI מכין את השינוי ואתם לוחצים <b>החלה</b>. תמיד אפשר לבטל.')),
  block('📋',L(lang,'Commands','פקודות'),COMMAND_HELP[lang==='he'?'he':'en'].map(([c,d])=>'/'+c+' – '+(lang==='he'?'\u200F':'')+d))],
 hint:L(lang,'You only see what you can see in the app.','מוצג רק מה שמותר לכם לראות באפליקציה.')});

// ---- Web API used by Settings → Notifications ----
export async function handleTelegramAPI(request,env,user,home,path,url){
 const actor=home.membership.member_id,parent=home.membership.role==='parent',action=path.slice('/api/telegram/'.length);
 const status=async()=>{const row=await botRow(env,home.id),links=row?await linksFor(env,home.id):[],accountsSet=await accountMembers(env,home.id),beat=await env.DB.prepare("SELECT at FROM service_heartbeats WHERE name='reminders'").first();
  const media=await mediaSettings(env,home.id),ai=await aiStatusRecord(env,home.id);
  return json({media:{...media,speechAvailable:speechAvailability(env),speechNames:speechNames(),speechOptions:speechOptions(env,await speechHousehold(env,home.id)),aiConnected:!!(ai?.ciphertext&&ai.verified&&ai.model)},available:!!env.APP_ENCRYPTION_KEY,connected:!!row,botUsername:row?.bot_username||'',connectedAt:row?.connected_at||'',canManage:parent,httpsOrigin:url.protocol==='https:',schedulerLastRun:beat?new Date(beat.at).toISOString():null,
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
  if(!SPEECH_PROVIDERS.includes(provider))throw fail('Choose a supported voice provider.');if(provider!==current.speechProvider&&!(await speechChoice(env,provider,await speechHousehold(env,home.id))).ok)throw fail('This voice provider is not available for this household.',409);
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
  if(request.method==='POST'){if(!bot)throw fail('A parent needs to connect the household Telegram bot first.',409);const expectedTelegramId=await telegramLinkIdentity(env,home,target,user.id),token=random(24),expiresAt=Date.now()+LINK_MINUTES*60000;await env.DB.prepare('INSERT INTO telegram_link_tokens(token_hash,household_id,member_id,created_by,expires_at,expected_telegram_user_id) VALUES(?,?,?,?,?,?)').bind(await hash(token),home.id,target,user.id,expiresAt,expectedTelegramId).run();return json({url:'https://t.me/'+bot.bot_username+'?start='+token,expiresAt:new Date(expiresAt).toISOString()},201)}
  if(request.method==='DELETE'){const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,target).first();if(link&&bot)try{await send(env,bot,link.chat_id,notice(languageOf(home.state,target),'🔌',L(languageOf(home.state,target),'This chat was unlinked from Bayit.','הצ׳אט נותק מ־Bayit.')),undefined,languageOf(home.state,target))}catch{}await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,target).run();return status()}
 }
 if(action==='test'&&request.method==='POST'){
  if(!bot)throw fail('Connect a Telegram bot first.',409);const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND member_id=?').bind(home.id,actor).first();if(!link)throw fail('Link your own Telegram chat first.',409);const lang=languageOf(home.state,actor);
  try{const sent=await send(env,bot,link.chat_id,card(lang,{icon:'✅',title:L(lang,'Test from Bayit','בדיקה מ־Bayit'),context:L(lang,'Telegram delivery works for your account.','משלוח בטלגרם עובד בחשבון שלכם.')}),undefined,lang);if(link.blocked)await env.DB.prepare('UPDATE telegram_links SET blocked=0 WHERE household_id=? AND member_id=?').bind(home.id,actor).run();return json({sent:true,messageId:sent.message_id,at:new Date().toISOString()})}
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
 try{if(update.message)await onMessage(env,bot,update.message,new URL(request.url).origin);else if(update.callback_query)await onCallback(env,bot,update.callback_query)}
 catch(error){console.error('Bayit Telegram update failed:',error.status||'',error.telegramStatus||'');}
 return json({ok:true});
}

async function onMessage(env,bot,message,origin){
 const chat=message.chat,from=message.from;if(!chat||!from)return;
 const langHint=from.language_code?.startsWith('he')?'he':'en';
 if(chat.type!=='private'){try{await send(env,bot,chat.id,notice(langHint,'🔒',L(langHint,'Bayit works only in private chats, so private items stay private.','Bayit עובד רק בצ׳אט פרטי, כדי שפריטים פרטיים יישארו פרטיים.')),undefined,langHint);await tg(env,bot.token,'leaveChat',{chat_id:chat.id})}catch{}return}
 const text=String(message.text||'').trim(),[command,...rest]=text.split(/\s+/),cmd=command?.startsWith('/')?command.slice(1).split('@')[0].toLowerCase():'';
 if(cmd==='start'&&rest[0])return linkChat(env,bot,message,rest[0],langHint);
 const link=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND chat_id=?').bind(bot.household_id,String(chat.id)).first();
 if(!link||link.telegram_user_id!==String(from.id))return send(env,bot,chat.id,notice(langHint,'🔗',L(langHint,'This chat is not linked yet.','הצ׳אט עדיין לא מקושר.'),L(langHint,'In Bayit, open Settings → Accounts & connections → Telegram and choose Connect.','ב־Bayit פתחו הגדרות ← חשבונות וחיבורים ← טלגרם ובחרו חיבור.')),undefined,langHint);
 if(link.blocked)await env.DB.prepare('UPDATE telegram_links SET blocked=0 WHERE household_id=? AND member_id=?').bind(bot.household_id,link.member_id).run();
 const home=await loadHousehold(env,bot.household_id),memberId=link.member_id,role=roleOf(home.state,memberId);
 if(!role){await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(bot.household_id,memberId).run();return send(env,bot,chat.id,notice(langHint,'⚠️',L(langHint,'This family profile is no longer available.','פרופיל המשפחה הזה כבר אינו זמין.')),undefined,langHint)}
 const lang=languageOf(home.state,memberId,langHint);
 // Features registry (2026-11-09): a feature that is off for this person is refused here too; nothing is changed.
 const features=stateFeatureContext(home.state,memberId),offNotice=id=>send(env,bot,chat.id,notice(lang,'🔕',L(lang,featureLabel(id,'en')+' is turned off in Bayit.',featureLabel(id,'he')+' כבוי ב־Bayit.'),L(lang,'Nothing was changed. It can be turned on in Settings › Features.','דבר לא שונה. אפשר להפעיל בהגדרות › תכונות.')),undefined,lang);
 if(cmd!=='stop'&&!features.on('telegram'))return offNotice('telegram');
 {const voucherAsk=/^(?:יש לי (?:שובר|שוברים)|do i have (?:a )?vouchers?)/i.test(text),file=message.document?.file_name||'',need=cmd==='vouchers'||voucherAsk?'vouchers':/\.(xlsx|xls|csv|tsv)$/i.test(file)?'insurance':message.document&&(message.document.mime_type==='application/pdf'||/\.pdf$/i.test(file))?'expenses':telegramFeature(cmd)||(cmd&&cmd!=='mine'?null:'ai');
  if(need&&need!=='telegram'&&!features.used(need))return offNotice(need);}
 if(cmd==='start'||cmd==='help')return send(env,bot,chat.id,helpText(lang),undefined,lang);
 if(cmd==='account'){try{const accountOrigin=origin||env.BAYIT_ORIGIN;if(!accountOrigin)throw fail('The installation owner must configure BAYIT_ORIGIN.',503);const url=await ownAccountInvitation(env,home,memberId,String(from.id),accountOrigin);return send(env,bot,chat.id,card(lang,{icon:'🔑',title:L(lang,'Your own Google account link','קישור לחשבון Google האישי שלכם'),context:esc(url),hint:L(lang,'The link works for 15 minutes.','הקישור תקף ל־15 דקות.')}),undefined,lang)}catch(e){return send(env,bot,chat.id,notice(lang,'⚠️',esc(errorText(lang,e,'Your account link could not be created.','לא ניתן היה ליצור את קישור החשבון.'))),undefined,lang)}}
 if(cmd==='stop'){await env.DB.prepare('DELETE FROM telegram_links WHERE household_id=? AND member_id=?').bind(bot.household_id,memberId).run();return send(env,bot,chat.id,notice(lang,'🔌',L(lang,'This chat was unlinked.','הצ׳אט נותק.'),L(lang,'You can connect again from Bayit settings.','אפשר להתחבר שוב מהגדרות Bayit.')),undefined,lang)}
 if(cmd==='today')return sendToday(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='shopping')return sendShopping(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='tasks')return sendTasks(env,bot,home,memberId,role,link.chat_id,lang);
 if(cmd==='week')return sendWeek(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='lists')return sendLists(env,bot,home,memberId,link.chat_id,lang);
 if(cmd==='insurance')return send(env,bot,chat.id,insuranceGuideText(lang),undefined,lang);
 const voucherQuestion=text.match(/^(?:יש לי (?:שובר|שוברים)(?: ל)?|do i have (?:a )?vouchers?(?: for)?)\s*(.*)$/i);
 if(cmd==='vouchers'||voucherQuestion){
  const records=await searchVouchers(env,home,memberId,cmd==='vouchers'?rest.join(' '):voucherQuestion[1],localDate());
  if(!records.length)return send(env,bot,chat.id,notice(lang,'🎟',L(lang,'No matching active vouchers.','לא נמצאו שוברים פעילים מתאימים.')),undefined,lang);
  const lines=records.map(record=>esc(record.title)+' · '+(record.balanceCents===null?L(lang,'Balance unknown','יתרה לא ידועה'):HOME_CURRENCY_SYMBOL+(record.balanceCents/100))+ (record.expiresOn?' · '+record.expiresOn:''));
  const rows=records.map(record=>[{text:cut(L(lang,'Open ','פתיחה ') + record.title,56),url:origin+'/'+voucherLink(home.id,record.id)}]);
  return send(env,bot,chat.id,card(lang,{icon:'🎟',title:L(lang,'My vouchers','השוברים שלי'),context:lines.join('\n')}),rows,lang);
 }
 if(cmd==='expenses')return sendExpenses(env,bot,home,memberId,role,link.chat_id,lang);
 if(cmd==='note')return saveNote(env,bot,home,memberId,link.chat_id,lang,rest.join(' '));
 if(message.document&&/\.(xlsx|xls|csv|tsv)$/i.test(message.document.file_name||'')){
  if(role==='child')return send(env,bot,chat.id,notice(lang,'🔒',L(lang,'Insurance is available to adult accounts.','ביטוחים זמינים לחשבונות מבוגרים בלבד.')),undefined,lang);
  try{const {bytes}=await downloadFile(env,bot,message.document.file_id,5*1024*1024,lang),preview=await stageInsuranceReport(env,home,memberId,bytes,message.document.file_name),rows=[];
   for(const person of home.state.members.slice(0,20))rows.push([await button(env,home.id,memberId,L(lang,'Report for: ','הדוח עבור: ')+cut(personName(home.state,person.id,lang),60),{type:'insurance_subject',previewId:preview.id,subjectId:person.id})]);
   rows.push([await button(env,home.id,memberId,L(lang,'Discard report','ביטול הדוח'),{type:'insurance_discard',previewId:preview.id})]);
   return send(env,bot,chat.id,insurancePreviewText(preview,lang)+'\n\n<b>👤 '+L(lang,'Who is insured?','מי המבוטח?')+'</b>\n'+L(lang,'The sender is not assumed to be the insured person. No policies have been saved yet.','שולח הקובץ אינו נחשב אוטומטית למבוטח. עדיין לא נשמרו ביטוחים.'),rows,lang);
  }catch(error){return send(env,bot,chat.id,notice(lang,'⚠️',L(lang,'The report could not be prepared. No policies were changed.','לא ניתן היה להכין את הדוח. לא שונו ביטוחים.'),L(lang,'Check the Excel file and try again, or import it in Bayit.','בדקו את קובץ האקסל ונסו שוב, או ייבאו אותו ב־Bayit.')),undefined,lang);}
 }
 if(message.document&&(message.document.mime_type==='application/pdf'||/\.pdf$/i.test(message.document.file_name||''))){
  try{return await handleStatement(env,bot,home,link,role,lang,message.document)}
  catch(error){return send(env,bot,chat.id,notice(lang,'⚠️',esc(errorText(lang,error,'This statement could not be read. Nothing was changed.','לא ניתן היה לקרוא את הדף. דבר לא שונה.'))),undefined,lang)}
 }
 const photo=message.photo?.length?message.photo.at(-1):message.document?.mime_type?.startsWith('image/')?message.document:null,voice=message.voice||message.audio;
 if(photo||voice){
  const caption=String(message.caption||'').trim(),privateCaption=/^\/mine(\s|$)/i.test(caption),request=privateCaption?caption.replace(/^\/mine\s*/i,''):caption,scope=privateCaption?'private':'family';
  try{return photo?await handlePhoto(env,bot,home,link,role,lang,photo,request,scope):await handleVoice(env,bot,home,link,role,lang,voice,scope)}
  catch(error){return send(env,bot,chat.id,notice(lang,'⚠️',esc(errorText(lang,error,'Bayit could not read this message. Nothing was changed.','Bayit לא הצליח לקרוא את ההודעה. דבר לא שונה.'))),undefined,lang)}
 }
 if(!text)return send(env,bot,chat.id,notice(lang,'💬',L(lang,'I can read text, photos and voice messages.','אפשר לשלוח טקסט, תמונות והודעות קוליות.')),undefined,lang);
 if(cmd&&cmd!=='mine')return send(env,bot,chat.id,helpText(lang),undefined,lang);
 return askAI(env,bot,home,link,role,lang,cmd==='mine'?rest.join(' '):text,cmd==='mine'?'private':'family');
}

async function linkChat(env,bot,message,token,lang){
 const now=Date.now(),tokenHash=await hash(token),row=await env.DB.prepare('SELECT * FROM telegram_link_tokens WHERE token_hash=? AND household_id=?').bind(tokenHash,bot.household_id).first();
 if(row&&(row.used_at||row.expires_at<now))try{lang=languageOf((await loadHousehold(env,bot.household_id)).state,row.member_id,lang)}catch{}
 if(!row||row.used_at||row.expires_at<now)return send(env,bot,message.chat.id,notice(lang,'⏱',L(lang,'This link has expired or was already used.','הקישור פג תוקף או שכבר נעשה בו שימוש.'),L(lang,'Create a new one in Bayit settings.','צרו קישור חדש בהגדרות Bayit.')),undefined,lang);
 const home=await loadHousehold(env,bot.household_id);if(!roleOf(home.state,row.member_id))return send(env,bot,message.chat.id,notice(lang,'⚠️',L(lang,'This family profile is no longer available.','פרופיל המשפחה הזה כבר אינו זמין.')),undefined,lang);
 try{await authorizeTelegramClaim(env,home,row,String(message.from.id))}catch(e){return send(env,bot,message.chat.id,notice(lang,'⚠️',esc(errorText(lang,{status:400,...e,message:e.message},'This link cannot be used for this Telegram account.','לא ניתן להשתמש בקישור הזה עבור חשבון הטלגרם הזה.'))),undefined,lang)}
 const name=[message.from.first_name,message.from.last_name].filter(Boolean).join(' ').slice(0,80)||message.from.username||'';
 if(!await claimTelegramLink(env,home,row,tokenHash,String(message.from.id),String(message.chat.id),name))return send(env,bot,message.chat.id,notice(lang,'⚠️',L(lang,'This link or identity changed.','הקישור או הזהות השתנו.'),L(lang,'Create a new link in Bayit settings.','צרו קישור חדש בהגדרות Bayit.')),undefined,lang);
 const member=home.state.members.find(m=>m.id===row.member_id),language=languageOf(home.state,row.member_id,lang);
 return send(env,bot,message.chat.id,card(language,{icon:'✅',title:L(language,'Connected, '+esc(member.name)+'!','מחובר, '+esc(member.he||member.name)+'!'),context:L(language,'Your reminders will arrive here.','מעכשיו התזכורות שלכם יגיעו לכאן.')})+'\n\n'+helpText(language),undefined,language);
}

async function sendToday(env,bot,home,memberId,chatId,lang){
 const date=localDate(),visible=deliveryView(visibleState(home.state,memberId),memberId),report=dayReport(visible,{memberId,role:roleOf(home.state,memberId),date,lang,members:home.state.members});
 const todayRows=[];for(const t of report.openTasks.slice(0,6))todayRows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(t,lang),40),{type:'done',taskId:t.id,date,keep:true})]);
 return send(env,bot,chatId,report.text,todayRows,lang);
}

async function sendShopping(env,bot,home,memberId,chatId,lang,listId){
 const visible=deliveryView(visibleState(home.state,memberId),memberId),lists=(visible.shoppingLists||[]).filter(l=>l.status==='active'),chosen=listId||visible.preferences.activeShoppingListByUser?.[memberId],list=lists.find(l=>l.id===chosen)||lists[0];
 if(!list)return send(env,bot,chatId,notice(lang,'🛒',L(lang,'You have no active shopping list.','אין לכם רשימת קניות פעילה.')),undefined,lang);
 const items=(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id&&!i.done),rows=[];
 for(const item of items.slice(0,24)){const amount=quantityText(item.quantity,undefined,lang);rows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(item,lang)+(amount?' · '+amount:''),48),{type:'buy',itemId:item.id,keep:true})])}
 const others=lists.filter(l=>l.id!==list.id).slice(0,6);if(others.length){const switches=[];for(const other of others)switches.push(await button(env,bot.household_id,memberId,'🛒 '+cut(title(other,lang),24),{type:'shoplist',listId:other.id,keep:true}));for(let i=0;i<switches.length;i+=2)rows.push(switches.slice(i,i+2))}
 return send(env,bot,chatId,card(lang,{icon:'🛒',title:esc(title(list,lang)),context:items.length?L(lang,items.length+' left · tap an item to check it off','נותרו '+items.length+' · הקישו על פריט כדי לסמן אותו כנקנה'):L(lang,'Everything on this list has been collected.','כל הפריטים ברשימה נאספו.'),hint:items.length>24?L(lang,'…and '+(items.length-24)+' more in the app.','…ועוד '+(items.length-24)+' באפליקציה.'):''}),rows,lang);
}

// /tasks: today's tasks plus "anytime" tasks for this person; parents also see approvals waiting.
// Same lines as the daily report: bold time first, ⭐ for high priority, ✓ after done, ⏳ while waiting.
async function sendTasks(env,bot,home,memberId,role,chatId,lang){
 const today=localDate(),visible=deliveryView(visibleState(home.state,memberId),memberId),mine=(visible.tasks||[]).filter(t=>isMine(t,memberId,'tasks')&&(!t.date||occursOn(t,today)));
 const line=t=>{const state=taskStateNow(t,today),star=t.priority==='high'&&state!=='done'?'⭐ ':'';return bullet([t.time&&(state==='done'?esc(t.time):'<b>'+esc(t.time)+'</b>'),star+esc(title(t,lang))+(state==='done'?' ✓':''),t.subtasks?.length&&t.subtasks.filter(x=>x.done).length+'/'+t.subtasks.length,state==='pending'&&L(lang,'⏳ waiting for approval','⏳ ממתין לאישור')])};
 const order=t=>taskStateNow(t,today)==='done'?1:0,rank={high:0,medium:1,low:2},dated=mine.filter(t=>t.date).sort((a,b)=>order(a)-order(b)||(rank[a.priority]??1)-(rank[b.priority]??1)||(a.time||'99').localeCompare(b.time||'99')),anytime=mine.filter(t=>!t.date&&taskStateNow(t,today)!=='done'),rows=[];
 for(const t of [...dated,...anytime].filter(t=>taskStateNow(t,today)==='open').slice(0,12))rows.push([await button(env,bot.household_id,memberId,'✓ '+cut(title(t,lang),44),{type:'done',taskId:t.id,date:taskStateDate(t,today),keep:true})]);
 const doneCount=dated.filter(t=>taskStateNow(t,today)==='done').length,blocks=[dated.length?block('✅',L(lang,'Today','היום')+' · '+L(lang,doneCount+'/'+dated.length+' done',doneCount+'/'+dated.length+' בוצעו'),dated.map(line)):block('✅',L(lang,'Today','היום'),[L(lang,'Nothing scheduled for today.','אין משימות מתוכננות להיום.')]),block('📋',L(lang,'Anytime','בכל זמן'),anytime.slice(0,15).map(line),anytime.length>15?L(lang,'…and '+(anytime.length-15)+' more','…ועוד '+(anytime.length-15)):'')];
 if(role==='parent'){const waiting=(visible.tasks||[]).filter(t=>t.memberId!==memberId&&(!t.date||occursOn(t,today))&&taskStateNow(t,today)==='pending');if(waiting.length){const lines=[];for(const t of waiting.slice(0,6)){const who=home.state.members.find(m=>m.id===t.memberId);lines.push(bullet([esc(lang==='he'?who?.he||who?.name:who?.name),esc(title(t,lang))]));rows.push([await button(env,bot.household_id,memberId,L(lang,'Approve: ','אישור: ')+cut(title(t,lang),36),{type:'approve',taskId:t.id,date:taskStateDate(t,today),keep:true})])}blocks.push(block('⏳',L(lang,'Waiting for your approval','ממתין לאישורכם'),lines))}}
 return send(env,bot,chatId,card(lang,{icon:'✅',title:L(lang,'Your tasks','המשימות שלכם'),context:esc(dayLabel(today,lang)),blocks,hint:L(lang,'Tap ✓ below to complete. To change or add, just write, e.g. “move laundry to tomorrow”.','הקישו ✓ למטה כדי לסמן. כדי לשנות או להוסיף, פשוט כתבו, למשל „להעביר את הכביסה למחר”.')}),rows,lang);
}

// /week: everything on the calendar this person can see for the next 7 days, one section per day.
async function sendWeek(env,bot,home,memberId,chatId,lang){
 const visible=deliveryView(visibleState(home.state,memberId),memberId),start=localDate(),end=new Date(Date.parse(start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10),days=[];
 for(let i=0;i<7;i++){const date=new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),events=(visible.events||[]).filter(e=>occursOn(e,date)).sort((a,b)=>(a.time||'').localeCompare(b.time||''));if(!events.length)continue;
  const label=(i===0?L(lang,'Today · ','היום · '):i===1?L(lang,'Tomorrow · ','מחר · '):'')+shortDay(date,lang);
  days.push(block('',esc(label),events.slice(0,8).map(e=>{const who=(e.memberIds||[]).map(id=>home.state.members.find(m=>m.id===id)).filter(Boolean).map(m=>lang==='he'?m.he||m.name:m.name);return bullet([e.time&&'<b>'+esc(e.time)+'</b>',esc(title(e,lang))+(e.visibility==='private'?' 🔒':''),who.length&&who.length<home.state.members.length&&esc(who.join(', '))])}),events.length>8?L(lang,'…and '+(events.length-8)+' more','…ועוד '+(events.length-8)):''))}
 return send(env,bot,chatId,days.length?card(lang,{icon:'🗓',title:L(lang,'The next 7 days','7 הימים הקרובים'),context:esc(dateRange(start,end,lang)),blocks:days}):notice(lang,'🗓',L(lang,'Nothing on the calendar for the next 7 days.','אין אירועים ביומן ב־7 הימים הקרובים.')),undefined,lang);
}

// /lists: shopping lists (tap to open) and task lists with what is left.
async function sendLists(env,bot,home,memberId,chatId,lang){
 const visible=deliveryView(visibleState(home.state,memberId),memberId),today=localDate(),shopping=(visible.shoppingLists||[]).filter(l=>l.status==='active'),taskLists=visible.taskLists||[],rows=[];
 for(const l of shopping.slice(0,8))rows.push([await button(env,bot.household_id,memberId,L(lang,'Open ','פתיחת ')+cut(title(l,lang),30),{type:'shoplist',listId:l.id,keep:true})]);
 const left=l=>(visible.shopping||[]).filter(i=>(i.listId||'week')===l.id&&!i.done).length,open=l=>(visible.tasks||[]).filter(t=>t.listId===l.id&&taskStateNow(t,today)!=='done').length;
 return send(env,bot,chatId,card(lang,{icon:'📚',title:L(lang,'Your lists','הרשימות שלכם'),blocks:[block('🛒',L(lang,'Shopping lists','רשימות קניות'),shopping.length?shopping.map(l=>bullet([esc(title(l,lang)),left(l)?L(lang,left(l)+' left','נותרו '+left(l)):L(lang,'all collected','הכול נאסף')])):[L(lang,'None','אין')]),block('📋',L(lang,'Task lists','רשימות משימות'),taskLists.map(l=>bullet([esc(title(l,lang)),open(l)?plural(lang,open(l),'open','open','פתוחה אחת','פתוחות'):L(lang,'all done','הכול בוצע'),l.visibility==='private'&&'🔒'])))]}),rows,lang);
}

// /expenses: this person's view of the latest month (adults only, same visibility as the Expenses page).
async function sendExpenses(env,bot,home,memberId,role,chatId,lang){
 if(role==='child')return send(env,bot,chatId,notice(lang,'🔒',L(lang,'Expenses are available to adult accounts.','ההוצאות זמינות למבוגרים בלבד.')),undefined,lang);
 let fin;try{fin=await visibleFinance(env,home,memberId)}catch{fin={transactions:[],groups:[]}}
 const rows=fin.transactions.filter(t=>t.visibility!=='private'),thisMonth=localDate().slice(0,7),month=[...new Set(rows.map(monthOf))].sort().at(-1)||thisMonth,sum=monthSummary(rows,fin.groups||[],month);
 const visible=deliveryView(visibleState(home.state,memberId),memberId),manual=(visible.expenses||[]).filter(e=>e.date?.slice(0,7)===thisMonth&&e.visibility!=='private'),manualTotal=manual.filter(e=>e.flow!=='income'&&e.flow!=='savings').reduce((n,e)=>n+(Number(e.amount)||0),0),manualIncome=manual.filter(e=>e.flow==='income').reduce((n,e)=>n+(Number(e.amount)||0),0),manualSavings=manual.filter(e=>e.flow==='savings').reduce((n,e)=>n+(Number(e.amount)||0),0);
 const label=new Date(month+'-15T12:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{month:'long',year:'numeric'});
 if(!sum.count&&!manual.length)return send(env,bot,chatId,notice(lang,'💳',L(lang,'No expenses yet.','אין הוצאות עדיין.'),L(lang,'Send a Leumi/Max statement PDF here, connect RiseUp in the app, or write “add 120 for groceries”.','שלחו כאן PDF של לאומי/מקס, חברו RiseUp באפליקציה, או כתבו „להוסיף 120 על קניות”.')),undefined,lang);
 const blocks=[];
 if(sum.count){blocks.push([bullet(L(lang,'Money in: ','נכנס: ')+money(sum.income/100)),bullet(L(lang,'Spent: ','יצא: ')+money(sum.expenses/100)),sum.savings&&bullet(L(lang,'Saved: ','נחסך: ')+money(sum.savings/100)),'<b>'+L(lang,'Left: ','נשאר: ')+money(sum.net/100)+'</b>'].filter(Boolean).join('\n'));
  blocks.push(block('📊',L(lang,'Top categories','הקטגוריות המובילות'),sum.byCategory.filter(c=>c.amount>0).slice(0,6).map(c=>bullet(esc(lang==='he'?CATEGORY[c.category]?.he||c.category:CATEGORY[c.category]?.en||c.category)+' — '+money(c.amount/100)))))}
 if(manual.length)blocks.push(block('✍️',L(lang,'Recorded by hand this month','נרשם ידנית החודש')+' · '+manual.length,[bullet(L(lang,'Spent: ','הוצאות: ')+money(manualTotal)),bullet(L(lang,'In: ','הכנסות: ')+money(manualIncome)),bullet(L(lang,'Savings: ','חיסכון: ')+money(manualSavings))]));
 return send(env,bot,chatId,card(lang,{icon:'💳',title:L(lang,'Expenses','הוצאות'),context:esc(label),blocks,hint:L(lang,'Only shared expenses are shown here; use /mine for your private ones. Ask anything, e.g. “what are our fixed bills?”','מוצגות כאן רק הוצאות משותפות; /mine למרחב הפרטי. אפשר לשאול כל דבר, למשל „מה החיובים הקבועים שלנו?”')}),undefined,lang);
}

// /note <text>: saves a family note right away (the person typed it), with Undo.
async function saveNote(env,bot,home,memberId,chatId,lang,raw){
 const body=String(raw||'').trim().slice(0,2000);if(!body)return send(env,bot,chatId,notice(lang,'📝',L(lang,'Write the note after the command.','כתבו את ההערה אחרי הפקודה.'),L(lang,'For example: /note Noa’s teacher is Dana','למשל: ‎/note המורה של נועה היא דנה')),undefined,lang);
 const firstLine=body.split('\n')[0],titleText=firstLine.length>60?firstLine.slice(0,57)+'…':firstLine,plan={id:crypto.randomUUID(),actorId:memberId,scope:'family',actions:[{kind:'note.create',title:titleText,text:body,date:localDate(),time:localTime(new Date()),memberIds:[],icon:'bayit-activities-notebook'}]};
 const {result:receipt}=await asMember(env,home.id,memberId,data=>applyAIPlan(data,plan,memberId,home.state.members,catalog));
 return send(env,bot,chatId,card(lang,{icon:'📝',title:L(lang,'Saved to the home journal','נשמר ביומן הבית'),context:esc(titleText)}),[[await button(env,home.id,memberId,L(lang,'Undo','ביטול השינוי'),{type:'undo',operationId:receipt.id})]],lang);
}

const aiOff=lang=>notice(lang,'🤖',L(lang,'AI is not connected for this household yet.','ה־AI עדיין לא מחובר לבית הזה.'),L(lang,'A parent can connect a provider in Settings → Accounts & connections.','הורה יכול לחבר ספק בהגדרות ← חשבונות וחיבורים.'));
async function askAI(env,bot,home,link,role,lang,question,scope,{images=[],label}={}){
 const stored=await aiStatusRecord(env,home.id);
 if(!stored?.ciphertext||!stored.verified||!stored.model)return send(env,bot,link.chat_id,aiOff(lang),undefined,lang);
 if(!question.trim())return send(env,bot,link.chat_id,helpText(lang),undefined,lang);
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const turns=link.turns&&link.turns_scope===scope&&link.turns_revision===home.revision&&link.turns_at>Date.now()-TURN_MINUTES*60000?JSON.parse(link.turns):[];
 let result;try{result=await runAssistant(env,{home,actorId:link.member_id,role,question,turns,scope,language:lang,images,channel:'telegram'})}
 catch(error){return send(env,bot,link.chat_id,notice(lang,'⚠️',esc(errorText(lang,error,'The AI could not complete this request. Nothing was changed.','ה־AI לא הצליח להשלים את הבקשה. דבר לא שונה.'))),undefined,lang)}
 const nextTurns=[...turns,{role:'user',content:(label||question).slice(0,1500)},{role:'assistant',content:String(result.answer).slice(0,1500)}].slice(-6);
 await env.DB.prepare('UPDATE telegram_links SET turns=?,turns_at=?,turns_scope=?,turns_revision=? WHERE household_id=? AND member_id=?').bind(JSON.stringify(nextTurns),Date.now(),scope,home.revision,home.id,link.member_id).run();
 if(!result.plan)return send(env,bot,link.chat_id,chatFormat(result.answer,lang),undefined,lang);
 const lists=visibleState(home.state,link.member_id).shoppingLists||[];
 const rows=[[await button(env,home.id,link.member_id,L(lang,'Apply','החלה'),{type:'apply',plan:result.plan}),await button(env,home.id,link.member_id,L(lang,'Discard','ביטול'),{type:'discard'})]];
 return send(env,bot,link.chat_id,chatFormat(result.answer,lang)+'\n\n'+block('📝',L(lang,'Prepared for review'+(scope==='private'?' · private':''),'מוכן לבדיקה'+(scope==='private'?' · פרטי':'')),[planText(result.plan,lang,lists)])+'\n\n<i>'+L(lang,'Nothing is saved until you press Apply.','שום דבר לא נשמר עד ללחיצה על החלה.')+'</i>',rows,lang);
}

async function handlePhoto(env,bot,home,link,role,lang,photo,caption,scope){
 const settings=await mediaSettings(env,home.id);
 if(!settings.photos)return send(env,bot,link.chat_id,notice(lang,'📷',L(lang,'Photos are turned off for this household.','תמונות כבויות בבית הזה.'),L(lang,'A parent can turn them on in Settings → Accounts & connections → Telegram.','הורה יכול להפעיל אותן בהגדרות ← חשבונות וחיבורים ← טלגרם.')),undefined,lang);
 const stored=await aiStatusRecord(env,home.id);if(!stored?.ciphertext||!stored.verified||!stored.model)return send(env,bot,link.chat_id,aiOff(lang),undefined,lang);
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes,path}=await downloadFile(env,bot,photo.file_id,MAX_PHOTO_BYTES,lang),mediaType=photo.mime_type||IMAGE_TYPES[path.split('.').pop()?.toLowerCase()];
 if(!Object.values(IMAGE_TYPES).includes(mediaType))return send(env,bot,link.chat_id,notice(lang,'📷',L(lang,'Send a JPG, PNG, WebP or GIF image.','שלחו תמונה מסוג JPG,‏ PNG,‏ WebP או GIF.')),undefined,lang);
 const question=caption||L(lang,'Look at this photo. If it clearly shows dates, events, tasks or shopping items, prepare them for review. Otherwise describe briefly what you see and ask what I would like to do.','הסתכל על התמונה. אם רואים בה בבירור תאריכים, אירועים, משימות או פריטי קניות, הכן אותם לבדיקה. אחרת תאר בקצרה מה רואים ושאל מה לעשות.');
 return askAI(env,bot,home,link,role,lang,question,scope,{images:[{mediaType,data:base64(bytes)}],label:'[photo] '+caption});
}

const shekels=agorot=>'\u2066'+(agorot<0?'−':'')+'₪'+Math.abs(agorot/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})+'\u2069';
async function handleStatement(env,bot,home,link,role,lang,document){
 if(role==='child')return send(env,bot,link.chat_id,notice(lang,'🔒',L(lang,'Expenses are available to adult accounts.','ההוצאות זמינות למבוגרים בלבד.')),undefined,lang);
 return withPDFSlot(env,async()=>{
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes}=await downloadFile(env,bot,document.file_id,5_000_000,lang),preview=await importStatement(env,home,link.member_id,bytes,document.file_name);
 const name={max:'Max',leumi:L(lang,'Bank Leumi','בנק לאומי')}[preview.source]||preview.source;
 const checks=preview.ok?L(lang,'✓ Matches the totals printed on the statement','✓ תואם לסכומים המודפסים בדף'):L(lang,'⚠️ Some totals do not match the statement; review it in Bayit before adding','⚠️ חלק מהסכומים אינם תואמים לדף; בדקו ב־Bayit לפני ההוספה');
 const summary=[bullet(L(lang,preview.newCount+' new transactions',preview.newCount+' תנועות חדשות')+(preview.duplicateCount?L(lang,' · '+preview.duplicateCount+' already imported',' · '+preview.duplicateCount+' כבר יובאו'):'')),preview.moneyIn&&bullet(L(lang,'Money in: ','הכנסות: ')+shekels(preview.moneyIn)),preview.moneyOut&&bullet(L(lang,'Money out: ','הוצאות: ')+shekels(preview.moneyOut)),checks].filter(Boolean).join('\n');
 const blocks=[summary,block('📊',L(lang,'Top categories','הקטגוריות המובילות'),preview.byCategory.slice(0,5).map(c=>bullet(esc(lang==='he'?CATEGORY[c.category]?.he:CATEGORY[c.category]?.en)+' — '+shekels(c.amount))))];
 const text=hint=>card(lang,{icon:'🧾',title:L(lang,esc(name)+' statement','דף '+esc(name)),context:esc(dateRange(preview.period.from,preview.period.to,lang)),blocks,hint});
 if(!preview.newCount)return send(env,bot,link.chat_id,text(L(lang,'Nothing new to add.','אין מה להוסיף.')),undefined,lang);
 const rows=[[await button(env,home.id,link.member_id,L(lang,'Add for all household adults','הוספה לכל המבוגרים בבית'),{type:'finance_apply',importId:preview.id,visibility:'shared'})],[await button(env,home.id,link.member_id,L(lang,'Add privately','הוספה פרטית'),{type:'finance_apply',importId:preview.id,visibility:'private'}),await button(env,home.id,link.member_id,L(lang,'Discard','ביטול'),{type:'discard'})]];
 return send(env,bot,link.chat_id,text(L(lang,'Nothing is saved until you choose.','שום דבר לא נשמר עד שתבחרו.')),rows,lang);
 });
}

async function handleVoice(env,bot,home,link,role,lang,voice,scope){
 const settings=await mediaSettings(env,home.id);
 if(settings.speechProvider==='off')return send(env,bot,link.chat_id,notice(lang,'🎙',L(lang,'Voice messages are turned off for this household.','הודעות קוליות כבויות בבית הזה.'),L(lang,'A parent can turn them on in Settings → Accounts & connections → Telegram.','הורה יכול להפעיל אותן בהגדרות ← חשבונות וחיבורים ← טלגרם.')),undefined,lang);
 const household=await speechHousehold(env,home.id,{memberId:link.member_id,feature:'telegram'});
 if(!speechState(env,settings.speechProvider,household).ok)return send(env,bot,link.chat_id,notice(lang,'🎙',L(lang,'The voice service is not available on this installation right now.','שירות ההודעות הקוליות אינו זמין כרגע בהתקנה הזו.')),undefined,lang);
 const seconds=Math.max(1,Math.ceil(Number(voice.duration)||0));if(seconds>MAX_VOICE_SECONDS)return send(env,bot,link.chat_id,notice(lang,'🎙',L(lang,'Please keep voice messages under '+MAX_VOICE_SECONDS/60+' minutes.','נא לשלוח הודעות קוליות של עד '+MAX_VOICE_SECONDS/60+' דקות.')),undefined,lang);
 const day=localDate(),used=(await env.DB.prepare('SELECT seconds FROM speech_usage WHERE household_id=? AND day=?').bind(home.id,day).first())?.seconds||0;
 if(used+seconds>DAILY_VOICE_SECONDS)return send(env,bot,link.chat_id,notice(lang,'🎙',L(lang,'Today’s voice limit for this household has been reached.','מכסת ההודעות הקוליות להיום הסתיימה.'),L(lang,'Text messages still work.','אפשר עדיין לכתוב.')),undefined,lang);
 try{await tg(env,bot.token,'sendChatAction',{chat_id:link.chat_id,action:'typing'})}catch{}
 const {bytes}=await downloadFile(env,bot,voice.file_id,MAX_VOICE_BYTES,lang);
 await env.DB.prepare('INSERT INTO speech_usage(household_id,day,seconds) VALUES(?,?,?) ON CONFLICT(household_id,day) DO UPDATE SET seconds=seconds+excluded.seconds').bind(home.id,day,seconds).run();
 const heard=await transcribe(env,settings.speechProvider,bytes,{mimeType:voice.mime_type||'audio/ogg',household});
 if(!heard)return send(env,bot,link.chat_id,notice(lang,'🎙',L(lang,'I could not hear any words in that message.','לא הצלחתי לשמוע מילים בהודעה.')),undefined,lang);
 await send(env,bot,link.chat_id,notice(lang,'🎙','<b>'+L(lang,'I heard:','שמעתי:')+'</b> <i>'+esc(heard)+'</i>'),undefined,lang);
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
 // A linked chat is answered in the person's own Bayit language, also for used, expired or foreign buttons.
 let home0=null;if(link&&link.telegram_user_id===String(query.from?.id))try{home0=await loadHousehold(env,bot.household_id)}catch{}
 const lang=home0?languageOf(home0.state,link.member_id,langHint):langHint;
 if(!link||link.telegram_user_id!==String(query.from?.id)||!action||action.member_id!==link.member_id)return answer(L(lang,'This button is not available in this chat.','הכפתור אינו זמין בצ׳אט הזה.'),true);
 if(action.used_at||action.expires_at<Date.now())return answer(L(lang,'This button has already been used or has expired.','כבר נעשה שימוש בכפתור או שפג תוקפו.'),true);
 const claimed=await env.DB.prepare('UPDATE telegram_actions SET used_at=? WHERE id=? AND used_at IS NULL').bind(Date.now(),id).run();if(!claimed.meta.changes)return answer(L(lang,'This button has already been used.','כבר נעשה שימוש בכפתור.'));
 const payload=JSON.parse(action.payload),memberId=link.member_id,release=()=>env.DB.prepare('UPDATE telegram_actions SET used_at=NULL WHERE id=?').bind(id).run();
 {const features=home0&&stateFeatureContext(home0.state,memberId),need=telegramCallbackFeature(payload.type);if(features&&(!features.on('telegram')||need&&!features.used(need))){await release();return answer(L(lang,'This is turned off in Bayit. Nothing was changed.','זה כבוי ב־Bayit. דבר לא שונה.'),true)}}
 if(!home0)home0=await loadHousehold(env,bot.household_id);
 const clearButtons=()=>tg(env,bot.token,'editMessageReplyMarkup',{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
 // List messages (/tasks, /shopping, /today) keep their other buttons: only the pressed one is removed.
 const dropButton=()=>{const rows=(query.message.reply_markup?.inline_keyboard||[]).map(r=>r.filter(b=>b.callback_data!==query.data)).filter(r=>r.length);return tg(env,bot.token,'editMessageReplyMarkup',{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:rows}}).catch(()=>{})},settle=()=>payload.keep?dropButton():clearButtons();
 try{
  if(payload.type==='discard'){await clearButtons();return answer(L(lang,'Discarded. Nothing was changed.','בוטל. דבר לא שונה.'))}
  // An older button for a later day's reminder: that item's next reminder follows, so nothing is snoozed.
  if(payload.type==='snooze'&&payload.item?.date!==localDate()){await clearButtons();return answer(L(lang,'This is for a later day. Its next reminder will come on time.','זה ליום אחר. התזכורת הבאה שלו תגיע בזמן.'))}
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
   await send(env,bot,chatId,card(lang,{icon:'✅',title:L(lang,'Applied','הוחל'),context:plural(lang,changed,'change','changes','שינוי אחד','שינויים')+(receipt.skipped?L(lang,' · '+receipt.skipped+' already on the list',' · '+receipt.skipped+' כבר ברשימה'):'')}),[[undo]],lang);return answer(L(lang,'Applied.','הוחל.'));
  }
  if(payload.type==='insurance_discard'){await discardInsurancePreview(env,home0,memberId,payload.previewId);await clearButtons();return answer(L(lang,'Discarded. No policies were changed.','בוטל. לא שונו ביטוחים.'));}
  if(payload.type==='insurance_subject'){
   const report=await readInsurancePreview(env,home0,memberId,payload.previewId),subject=home0.state.members.find(m=>m.id===payload.subjectId);if(!subject)throw fail('Choose an insured household member.',400);
   await clearButtons();await send(env,bot,chatId,insurancePreviewText(insurancePreviewSummary(report),lang)+'\n\n<b>👤 '+L(lang,'Insured: ','מבוטח: ')+esc(personName(home0.state,subject.id,lang))+'</b>\n'+bullet(L(lang,'New records and the original Excel report stay private.','הרשומות החדשות ודוח האקסל המקורי יהיו פרטיים.'))+'\n'+bullet(L(lang,'The original is saved in Documents → Insurance and linked to this import.','המקור יישמר במסמכים ← ביטוח ויקושר לייבוא.'))+'\n'+bullet(L(lang,'Existing notes, documents, payment links and sharing are kept.','הערות, מסמכים, קישורי תשלום ושיתוף קיימים נשמרים.'))+'\n\n<i>'+L(lang,'Confirm only after checking the report.','אשרו רק אחרי בדיקת הדוח.')+'</i>',[[await button(env,home0.id,memberId,L(lang,'Confirm insurance import','אישור ייבוא הביטוחים'),{type:'insurance_apply',previewId:payload.previewId,subjectId:subject.id})],[await button(env,home0.id,memberId,L(lang,'Discard report','ביטול הדוח'),{type:'insurance_discard',previewId:payload.previewId})]],lang);return answer('');
  }
  if(payload.type==='insurance_apply'){
   const outcome=await applyInsurancePreview(env,home0,memberId,payload.previewId,payload.subjectId,mutate=>asMember(env,bot.household_id,memberId,mutate));
   await clearButtons();return answer(L(lang,'Saved: '+outcome.result.added+' new coverage rows, '+outcome.result.updated+' updated. Original report saved privately in Documents → Insurance.','נשמרו: '+outcome.result.added+' שורות כיסוי חדשות, '+outcome.result.updated+' עודכנו. דוח המקור נשמר באופן פרטי במסמכים ← ביטוח.'),true);
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
 }catch(error){await release();return answer(errorText(lang,error,'Bayit could not complete this. Nothing was changed.','Bayit לא הצליח להשלים את הפעולה. דבר לא שונה.'),true)}
}

// ---- Scheduled reminders ----
export async function runReminderTick(request,env){
 const supplied=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!env.REMINDER_CRON_SECRET||!supplied||!sameDigest(await hash(supplied),await hash(env.REMINDER_CRON_SECRET)))return json({error:'Unauthorized.'},401);
 const release=await lease(env,'reminder-tick');if(!release)return json({ok:true,skipped:'another tick is running'});
 try{await maintenance(env);const deadline=Date.now()+45000,result=await deliverReminders(env,new Date(),{deadline,origin:new URL(request.url).origin});
 try{result.push=await deliverPush(env,new Date(),{deadline})}catch{result.push={failed:1}}
 // The same minute tick refreshes each optional finance connection (RiseUp) about once an hour.
 try{result.financeSynced=Date.now()<deadline?await refreshDueConnections(env,new Date(),1):0}catch{result.financeSynced=0}
 try{result.calendarSynced=await syncDueGoogleCalendar(env,deadline)}catch{result.calendarSynced=0}
 try{result.suggestionsPrepared=await generateDueSuggestions(env,deadline)}catch{result.suggestionsPrepared=0}
 try{result.bayitAI=Date.now()<deadline?await runDueBayitAI(env,deadline):0}catch{result.bayitAI=0}
 return json(result);}finally{await release()}
}

export async function deliverReminders(env,now,{deadline=Date.now()+45000,origin=env.BAYIT_ORIGIN}={}){
 const date=localDate(now),time=localTime(now),summary={households:0,sent:0,failed:0,suppressed:0};
 const bots=(await env.DB.prepare('SELECT * FROM telegram_bots ORDER BY household_id LIMIT 100').all()).results;
 for(const row of bots){if(Date.now()>=deadline)break;
  const links=(await linksFor(env,row.household_id)).filter(l=>!l.blocked);if(!links.length)continue;summary.households++;
  let bot,home;try{bot=await withToken(env,row);home=await loadHousehold(env,row.household_id)}catch{summary.failed++;continue}
  try{await ensureCommands(env,bot)}catch{}
  // Only the yes/no "Update parents" choice of each child is shared with parents' delivery.
  const childPrefs=Object.fromEntries(home.state.members.filter(m=>m.role==='child').map(m=>[m.id,notificationPrefs(home.state.profiles[m.id]).parentUpdates!==false]));
  const snoozes=(await env.DB.prepare('SELECT * FROM telegram_snoozes WHERE household_id=? AND sent_at IS NULL AND due_at<=?').bind(row.household_id,now.getTime()).all()).results;
  for(const link of links){if(Date.now()>=deadline)break;
   const memberId=link.member_id,role=roleOf(home.state,memberId);if(!role)continue;
   const visible=deliveryView(visibleState(home.state,memberId),memberId);if(!visible.features.on('telegram'))continue;
   const lang=languageOf(home.state,memberId),prefs=notificationPrefs(home.state.profiles[memberId]),quiet=inQuietHours(time,prefs.quietStart,prefs.quietEnd),outbox=[];
   // A snoozed reminder the person asked for goes first, so the per-tick limit never drops it after it was claimed.
   for(const snooze of snoozes.filter(s=>s.member_id===memberId)){
    const item=JSON.parse(snooze.payload),record=(item.kind==='event'?visible.events:visible.tasks).find(r=>r.id===item.id);
    await env.DB.prepare('UPDATE telegram_snoozes SET sent_at=? WHERE id=?').bind(now.getTime(),snooze.id).run();
    // Re-checked against the item as it is now: moved, deleted, done, no longer visible or already started → not sent.
    if(!snoozeStillDue(item,record,memberId,{date,time})){summary.suppressed++;continue}
    const reminder={...item,record,time:record.time||(item.kind==='maintenance'?time:'')};outbox.push({key:'snooze:'+snooze.id,build:async()=>[reminderText(reminder,lang,time,date),item.kind==='task'&&item.date===date?[[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:record.id,date})]]:[]]});
   }
   // Changes to things assigned to this person, by someone else; then silent corrections of reminders already sent.
   const nameOf=id=>{const m=home.state.members.find(x=>x.id===id);return lang==='he'?m?.he||m?.name:m?.name},changes=changeUpdates(visible,memberId,{time,now:now.getTime()});
   for(const burst of changes.messages)outbox.push({key:burst.key,build:async()=>[changeText(burst,lang,nameOf),[]]});
   for(const burst of changes.corrections){if(Date.now()>=deadline)break;const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,'telegram',?,'sent',?)").bind(row.household_id,memberId,'fix:'+burst.key,now.getTime()).run();if(claim.meta.changes)summary.corrected=(summary.corrected||0)+await correctSentReminders(env,bot,row.household_id,link,memberId,burst,visible,lang,nameOf,date)}
   for(const item of dueReminders(visible,memberId,{date,time}))if(!reminderMatchesOccurrence(item,{date,time}))summary.suppressed++;else outbox.push({key:item.key,build:async()=>{const row1=[...(item.kind==='task'&&item.date===date?[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:item.record.id,date})]:[])];
    // Snooze only for something happening today (Telegram audit 2026-11-08): a reminder days ahead offered "Snooze 10 min".
    if(snoozable(item,{date,time},SNOOZE_MINUTES))row1.push(await button(env,row.household_id,memberId,L(lang,'Snooze '+SNOOZE_MINUTES+' min','נודניק '+SNOOZE_MINUTES+' דק׳'),{type:'snooze',item:{kind:item.kind,id:item.record.id,date:item.date||date,time:item.time||'',category:item.category,...(item.kind==='maintenance'?{dueDate:item.dueDate}:{})}}));
    return [reminderText(item,lang,time,date),row1.length?[row1]:[]]}});
   const digest=digestDue(visible,memberId,{date,time});if(digest)outbox.push({key:digest.key,build:async()=>{const report=dayReport(visible,{memberId,role,date,lang,members:home.state.members,greeting:true}),rows=[];for(const t of report.openTasks.slice(0,4))rows.push([await button(env,row.household_id,memberId,'✓ '+cut(title(t,lang),40),{type:'done',taskId:t.id,date,keep:true})]);return [report.text,rows]}});
   const updates=quiet?[]:childUpdates(visible,memberId,{date,time},role,childPrefs),reported=new Set(updates.map(u=>u.entry.taskId+':'+u.entry.date));
   if(!quiet){
    for(const request of approvalRequests(visible,memberId,{date},role)){const who=home.state.members.find(m=>m.id===request.task.memberId);outbox.push({key:request.key,build:async()=>[card(lang,{icon:'⏳',title:esc(title(request.task,lang)),context:L(lang,'Approval needed · marked done by ','נדרש אישור · סומן כבוצע על ידי ')+esc(lang==='he'?who?.he||who?.name:who?.name)}),[[await button(env,row.household_id,memberId,L(lang,'Approve','אישור'),{type:'approve',taskId:request.task.id,date})]]]})}
    for(const alert of overdueAlerts(visible,memberId,{date,time}))outbox.push({key:alert.key,build:async()=>[card(lang,{icon:'⏰',title:esc(title(alert.task,lang)),context:[L(lang,'Not done yet','עדיין לא בוצע'),!alert.assignee&&esc(nameOf(alert.task.memberId)),esc(shortDay(alert.date,lang)),alert.task.time&&'<b>'+esc(alert.task.time)+'</b>'].filter(Boolean).join(' · ')}),alert.assignee&&alert.date===date?[[await button(env,row.household_id,memberId,L(lang,'✓ Done','✓ בוצע'),{type:'done',taskId:alert.task.id,date})]]:[]]});
    for(const update of updates){const who=home.state.members.find(m=>m.id===update.entry.memberId);outbox.push({key:update.key,build:async()=>[card(lang,{icon:'🎉',title:esc(title(update.entry,lang)),context:L(lang,'Completed by ','הושלם על ידי ')+esc(lang==='he'?who?.he||who?.name:who?.name)})]})}
   }
   for(const u of taskDoneUpdates(visible,memberId,{date})){const own=notificationPrefs(visible.profiles?.[memberId],u.task.routine?'routines':'tasks');if(!inQuietHours(time,own.quietStart,own.quietEnd)&&!reported.has(u.task.id+':'+u.date)){const actor=home.state.members.find(m=>m.id===u.actorId);outbox.push({key:u.key,build:async()=>[card(lang,{icon:'🎉',title:esc(title(u.task,lang)),context:L(lang,'Completed by ','הושלם על ידי ')+esc(lang==='he'?actor?.he||actor?.name:actor?.name)})]})}}
   if(visible.features.on('expenses'))try{for(const message of await financeDeliveryMessages(env,home,memberId,{date,time,channel:'telegram'}))outbox.push({key:message.key,build:async()=>[alertCard(lang,{icon:message.icon==='1F4C8'?'📈':'💰',title:message.title,detail:message.detail})]})}catch{summary.failed++}
   // בית AI digest (2026-11-10): only for adults who chose Telegram, outside quiet hours, while Ask AI and Expenses are on.
   try{for(const message of await bayitAIDeliveryMessages(env,home,memberId,{date,time,channel:'telegram'}))outbox.push({key:message.key,build:async()=>[alertCard(lang,{icon:'✨',title:esc(message.title),detail:esc(message.body)}),origin?[[{text:L(lang,'Open in Bayit','פתיחה בבית'),url:origin+'/'+message.url}]]:[]]})}catch{summary.failed++}
   if(visible.features.on('insurance'))for(const message of insuranceAlerts(visible,memberId,{date,time,channel:'telegram',lang}))outbox.push({key:message.key,build:async()=>[alertCard(lang,{icon:'🛡',title:message.title,detail:message.detail})]});
   if(visible.features.on('vouchers'))try{for(const message of await voucherDeliveryMessages(env,home,memberId,{date,time,channel:'telegram'}))outbox.push({key:message.key,build:async()=>[
    alertCard(lang,{icon:'🎟',title:message.title,detail:esc(message.body)}),origin?[[{text:L(lang,'Open voucher','פתיחת השובר'),url:origin+'/'+message.url}]]:[]
   ]});}catch{summary.failed++}
   for(const message of outbox.slice(0,MAX_PER_MEMBER_TICK)){if(Date.now()>=deadline)break;
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,'telegram',?,'sending',?)").bind(row.household_id,memberId,message.key,now.getTime()).run();if(!claim.meta.changes)continue;
    const mark=(status,detail='')=>env.DB.prepare("UPDATE notification_deliveries SET status=?,detail=? WHERE household_id=? AND member_id=? AND channel='telegram' AND delivery_key=?").bind(status,detail,row.household_id,memberId,message.key).run();
    try{const [text,rows]=await message.build(),sent=await send(env,bot,link.chat_id,text,rows,lang);await mark('sent',sent?.message_id?'m:'+sent.message_id:'');summary.sent++} // The message id lets a later change correct this reminder.
    catch(error){summary.failed++;
     if(error.transient)await env.DB.prepare("DELETE FROM notification_deliveries WHERE household_id=? AND member_id=? AND channel='telegram' AND delivery_key=?").bind(row.household_id,memberId,message.key).run();
     else{await mark('failed',cut(String(error.message||''),200));if(error.telegramStatus===403){await env.DB.prepare('UPDATE telegram_links SET blocked=1 WHERE household_id=? AND member_id=?').bind(row.household_id,memberId).run();break}}}
   }
  }
 }
 const at=now.getTime();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES('reminders',?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind(at,JSON.stringify(summary)),
  env.DB.prepare("DELETE FROM notification_deliveries WHERE created_at<? AND delivery_key NOT LIKE 'insurance:%'").bind(at-40*86400000),
  env.DB.prepare('DELETE FROM telegram_actions WHERE expires_at<?').bind(at-86400000),
  env.DB.prepare('DELETE FROM telegram_link_tokens WHERE expires_at<?').bind(at-86400000),
  env.DB.prepare('DELETE FROM telegram_updates WHERE received_at<?').bind(at-2*86400000),
  env.DB.prepare('DELETE FROM telegram_snoozes WHERE sent_at IS NOT NULL AND sent_at<?').bind(at-86400000)
 ]);
 return {ok:true,date,time,...summary};
}
