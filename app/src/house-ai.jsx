// בית AI on every screen (user decisions 2026-11-10; boards concept-fab-a/b/c and concept-voice):
// • A launcher in one of three places, chosen by each person in Settings › General (default: the floating bubble):
//   bubble (reading-end corner above the menu), edge (a tab on the screen edge, drag up/down), corner (beside the bell),
//   or hidden. It appears only while Ask AI is on for the person and the household AI is connected (the demo shows it
//   with an honest "connect" note). A gentle spark animation shows it is there; a count shows waiting recommendations.
// • The chat opens over the current screen (full screen on phones; a panel on desktop) and closing returns exactly
//   where you were. Empty chat: greeting, what is waiting (בית AI recommendations), questions for this screen, how to use.
//   After sending: Sent → Bayit AI is thinking → the answer (answer-text.jsx); proposed changes wait for approval.
// • Voice: the microphone records, the household's speech service writes it down, and it is sent as a question.
// The Today card ("Ask Bayit AI") opens this same chat instead of jumping to the Ask AI page.
// • One בית AI (2026-11-11): four tabs everywhere, Chat · Suggestions · History · Settings (bayit-ai-hub.jsx); the
//   menu item opens it full screen (#ai, #ai/suggestions, #ai/history, #ai/settings), the bubble over the screen.
import React,{useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {X,PaperPlaneTilt,CheckCircle,Check,ArrowSquareOut,UsersThree,LockSimple,ClockCounterClockwise,PencilSimple,Paperclip,Lightning,ListChecks,CalendarDots,ShoppingCart,Wallet,Sun,Sparkle,Microphone,CaretDown,ArrowCounterClockwise,ChatCircleText,MagnifyingGlass,Plus,Trash,ClipboardText,CheckSquare,Note,Lightbulb,Gear} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {api,makeContext,recordRoute} from './ai';
import {AnswerText} from './answer-text';
import {VoiceInput} from './voice-input';
import {VoiceBadge} from './voice-badge';
import {BayitAIMark,useBayitAI,AILevel,BAYIT_AI_LIST} from './bayit-ai';
import {FormSection} from './form-section.jsx';
import {applyAIPlan,undoAIPlan} from '../../shared/ai-contract.mjs';
import {useOnline} from './offline-ui';
import {MessageReview,planAvailable} from './message-to-plan';
import {describeAction} from '../../shared/ai-actions.mjs';
import {everyLabel} from '../../shared/repeat.mjs';
import {findingTitle} from '../../shared/bayit-ai.mjs';
import {HubSuggestions,HubSettings,HUB_VIEWS} from './bayit-ai-hub';
import './house-ai.css';

export const AI_BUTTON_PLACES=['bubble','edge','corner','off'];
export const aiButtonPlace=a=>{const v=a.data?.preferences?.appearanceByUser?.[a.user]?.aiButton;return AI_BUTTON_PLACES.includes(v)?v:'bubble'};

// ---- One conversation shared by the launcher, the Today card and every screen ----
const chat={open:false,messages:[],scope:'family',busy:false,error:'',ready:false,conn:null,listeners:new Set(),send:null,conversationId:null,view:'chat'};
const emit=()=>{for(const l of chat.listeners)l()};
const set=patch=>{Object.assign(chat,patch);chat.v=(chat.v||0)+1;emit()};
const useChat=()=>{useSyncExternalStore(l=>{chat.listeners.add(l);return()=>chat.listeners.delete(l)},()=>chat.v||0,()=>0);return chat};
// Opens the chat (and asks `query` when given). Returns false when no launcher is mounted, so callers can fall back.
export function openBayitAI(query,meta){if(!chat.send)return false;set({open:true,view:'chat'});if(query&&query.trim())chat.send(query.trim(),meta);return true}
export const bayitAIReady=()=>!!chat.send&&chat.ready;

// The menu icon for the Ask AI route (the mark; night copy on dark menus via CSS).
export const BayitAINavIcon=({size=26})=><BayitAIMark size={size} className="bai-nav-mark"/>;

function useAIConnected(a){
 const [c,setC]=useState(null);
 useEffect(()=>{if(!a.cloud){setC({connected:false,demo:true});return}let live=true;const load=()=>api('status',undefined,'GET').then(r=>live&&setC(r),()=>live&&setC({connected:false}));load();const f=()=>document.visibilityState==='visible'&&load();window.addEventListener('focus',f);return()=>{live=false;window.removeEventListener('focus',f)}},[a.cloud,a.data?.householdId,a.user]);
 return c;
}

// Questions that fit the screen you are on.
function starters(a,root){
 const T=a.T,S={
  today:[[Sun,T('What’s on today?','מה קורה היום?')],[ListChecks,T('What’s still open for me?','מה עוד פתוח אצלי?')],[CalendarDots,T('Plan the weekend','תכנן לנו את סוף השבוע')]],
  tasks:[[Lightning,T('What’s urgent for me today?','מה דחוף לי היום?')],[UsersThree,T('Who hasn’t finished yet?','מי עוד לא סיים?')],[ListChecks,T('Make a list for Saturday','תכין רשימה לשבת')]],
  calendar:[[CalendarDots,T('What’s on this week?','מה יש השבוע?')],[Lightning,T('Anything clashing tomorrow?','יש משהו חופף מחר?')],[CalendarDots,T('Add a dentist visit on Thursday at 16:00','תוסיף רופא שיניים ביום חמישי ב־16:00')]],
  shopping:[[ShoppingCart,T('What’s on the list?','מה ברשימה?')],[ShoppingCart,T('Add milk and eggs','תוסיף חלב וביצים')],[ShoppingCart,T('What do we usually buy?','מה אנחנו קונים בדרך כלל?')]],
  household:[[Wallet,T('What went up this month?','מה התייקר החודש?')],[Wallet,T('How much do we pay for subscriptions?','כמה אנחנו משלמים על מנויים?')],[ListChecks,T('What needs fixing at home?','מה צריך לתקן בבית?')]]
 };
 return S[root]||S.today;
}

function Intro({a,root,ui,onAsk,onClose,onPlan,onSuggestions}){
 const bai=useBayitAI(a),mine=bai.ready?bai.open.filter(f=>f.assignees.includes(a.user)):[];
 const first=(a.name(a.user)||'').split(' ')[0],h=Number(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',hour12:false,timeZone:'Asia/Jerusalem'}).slice(0,2));
 const hello=h<12?a.T('Good morning','בוקר טוב'):h<18?a.T('Good afternoon','צהריים טובים'):a.T('Good evening','ערב טוב');
 const [tips,setTips]=useState(false);
 return <div className="hai-intro">
  <p className="hai-hello">{hello}{first?', '+first:''}! {a.T('I’m here on every screen. Ask, request or plan:','אני כאן בכל מסך. שאלו, בקשו או תכננו:')}</p>
  {mine.length>0&&<section className="hai-waiting" aria-label={a.T('Waiting for a check','מחכה לבדיקה')}>
   <h3><BayitAIMark size={22}/>{a.T('Waiting for a check','מחכה לבדיקה')}<b className="hai-count">{mine.length}</b></h3>
   {mine.slice(0,3).map(f=><button type="button" key={f.scopeKey+f.id} className="hai-rec" onClick={onSuggestions}><span>{findingTitle(f.finding,a.lang)}</span><AILevel a={a} level={f.level} label={false}/></button>)}
  </section>}
  <section className="hai-starters" aria-label={a.T('Questions for this screen','שאלות למסך הזה')}><h3>{a.T('For this screen','על המסך הזה')}</h3>
   <div className="hai-chips">{starters(a,root).map(([G,q])=><button type="button" key={q} className="hai-chip" onClick={()=>onAsk(q)}><G size={17} aria-hidden="true"/>{q}</button>)}{onPlan&&<button type="button" className="hai-chip hai-chip-plan" onClick={onPlan}><ClipboardText size={17} aria-hidden="true"/>{a.T('Prepare a plan from a message','להכין תוכנית מהודעה')}</button>}</div></section>
  <section className="hai-tips"><button type="button" className="hai-tips-toggle" aria-expanded={tips} onClick={()=>setTips(!tips)}><span>{a.T('How to use Bayit AI','איך משתמשים בבית AI')}</span><CaretDown size={18}/></button>
   {tips&&<ul>{[[ClockCounterClockwise,a.T('Ask about what happened','שאלו על מה שהיה'),a.T('“When was the boiler serviced?”','„מתי היה הטיפול בדוד?”')],[PencilSimple,a.T('Ask for a change','בקשו שינוי'),a.T('“Add milk to shopping”: you always approve before it is saved','„תוסיף חלב לקניות”: תמיד מאשרים לפני שנשמר')],[Microphone,a.T('Speak instead of typing','דברו במקום להקליד'),a.T('Tap the microphone, speak up to 2 minutes, send','מקישים על המיקרופון, מדברים עד 2 דקות, שולחים')],[Paperclip,a.T('A message or photo → a plan','הודעה או צילום ← תוכנית'),a.T('“Prepare a plan” on Today turns an invitation into events and tasks','„להכין תוכנית” ביום שלנו הופך הזמנה לאירועים ומשימות')]].map(([G,t,d])=><li key={t}><G size={18} aria-hidden="true"/><span><b>{t}</b>{d}</span></li>)}</ul>}
  </section>
 </div>;
}

function Plan({a,ui,m,onApply,onUndo,onDismiss,pending}){
 const receipt=a.data.aiOperations?.[m.plan.id]||m.receipt;
 if(m.fromHistory&&!receipt)return <div className="hai-plan"><ul>{m.plan.actions.map((x,j)=><li key={j}><ui.Icon code={x.icon} size={30}/><span><b>{x.title}</b><small>{describeAction(x,a.lang)||''}</small></span></li>)}</ul></div>;
 return <div className="hai-plan"><p className="hai-step"><span>{a.T('Check and approve','לבדוק ולאשר')}</span><small>{a.T('Nothing is saved before you approve','שום דבר לא נשמר לפני שמאשרים')}</small></p>
  <ul>{m.plan.actions.map((x,j)=><li key={j}><ui.Icon code={x.icon} size={30}/><span><b>{x.title}</b><small>{describeAction(x,a.lang)||[x.date,x.time,x.repeat&&x.repeat!=='once'&&!x.routine&&everyLabel(x.repeat,x.repeatEvery,a.lang),(x.memberIds||[]).map(a.name).join(', ')].filter(Boolean).join(' · ')}</small></span></li>)}</ul>
  {receipt?<p className="hai-receipt"><CheckCircle size={20} weight="fill"/>{receipt.status==='undone'?a.T('Undone','בוטל'):a.T('Saved','נשמר')}{receipt.status!=='undone'&&<button type="button" className="text-link" disabled={pending} onClick={()=>onUndo(m)}><ArrowCounterClockwise size={16}/>{a.T('Undo','ביטול')}</button>}</p>
   :<div className="hai-plan-actions"><button type="button" className="button secondary" disabled={pending} onClick={()=>onDismiss(m)}>{a.T('Not now','לא עכשיו')}</button><button type="button" className="button" disabled={pending} onClick={()=>onApply(m)}><Check size={19}/>{a.T('Approve and save','לאשר ולשמור')}</button></div>}
 </div>;
}

function ChatWindow({a,ui,place,root,onClose,connected,embedded=false,onView}){
 const c=useChat(),uid=useId(),[text,setText]=useState(''),[pending,setPending]=useState(null),[intake,setIntake]=useState(null),end=useRef(null),closeRef=useRef(null);
 useEffect(()=>{if(!embedded)closeRef.current?.focus({preventScroll:true})},[]);
 // Escape closes the window wherever focus is (Safari does not focus a tapped button), unless a window opened over it.
 useEffect(()=>{if(embedded)return;const k=e=>{if(e.key==='Escape'&&!e.defaultPrevented&&document.documentElement.dataset.bayitDialogOpen!=='true'){e.preventDefault();onClose()}};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[embedded]);
 const canPlan=planAvailable(a);
 useEffect(()=>{if(c.messages.length)end.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[c.messages.length,c.busy]);
 const ask=(q,meta)=>{if(!q.trim())return;setText('');chat.send(q.trim(),meta)};
 const go=k=>{set({view:k});onView?.(k)},bai=useBayitAI(a),waiting=bai.ready?bai.open.filter(f=>f.assignees.includes(a.user)).length:0;
 const leave=route=>{onClose();if(route)a.go(route)};
 const apply=async m=>{if(pending)return;setPending(m.plan.id);try{const preview=structuredClone(a.data),receipt=applyAIPlan(preview,m.plan,a.user,a.members,a.catalog);await a.update(d=>{applyAIPlan(d,m.plan,a.user,a.members,a.catalog)});set({messages:chat.messages.map(x=>x===m?{...x,receipt}:x)})}catch{set({error:a.T('Not saved. Review the proposal and try again.','לא נשמר. אפשר לבדוק את ההצעה ולנסות שוב.')})}finally{setPending(null)}};
 const undo=async m=>{if(pending)return;setPending(m.plan.id);try{const preview=structuredClone(a.data),receipt=undoAIPlan(preview,m.plan.id,a.user);await a.update(d=>{undoAIPlan(d,m.plan.id,a.user)});set({messages:chat.messages.map(x=>x===m?{...x,receipt}:x)})}catch{set({error:a.T('Not saved. Try again.','לא נשמר. נסו שוב.')})}finally{setPending(null)}};
 const dismiss=m=>set({messages:chat.messages.map(x=>x===m?{...x,plan:null}:x)});
 // Rows in an answer open the record they name: the answer's own sources first, then anything visible with that title.
 const linkFor=m=>{const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase(),pool=[...(m.sources||[]).map(s=>({...s})),
  ...a.visible(a.data.tasks||[]).map(r=>({id:r.id,type:'task',title:a.text(r),date:r.date})),...a.visible(a.data.events||[]).map(r=>({id:r.id,type:'event',title:a.text(r),date:r.date})),
  ...a.visible(a.data.shopping||[]).filter(r=>!r.done).map(r=>({id:r.id,type:'shopping',title:a.text(r),listId:r.listId}))];
  return title=>{const t=norm(title);if(!t)return null;const hit=pool.find(r=>norm(r.title)===t)||pool.find(r=>t.length>5&&norm(r.title).includes(t));return hit?recordRoute(hit,c.scope):null}};
 const loadConversation=async id=>{try{const r=await fetch('/api/ai-history/'+encodeURIComponent(id),{headers:cloudHeaders(),cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error);
  go('chat');set({scope:j.conversation.scope==='private'?'private':'family',conversationId:j.conversation.id,error:'',messages:j.turns.map(t=>({query:t.question,answer:t.answer,plan:t.plan,sources:t.sources,voice:t.voice,status:'answered',fromHistory:true}))})}
  catch(e){set({error:e.message||a.T('This conversation could not be opened.','לא הצלחנו לפתוח את השיחה.')})}};
 const body=<section className={'hai-chat'+(embedded?' hai-embedded':'')} role={embedded?'region':'dialog'} aria-modal={embedded?undefined:'false'} aria-labelledby={uid} dir={a.lang==='he'?'rtl':'ltr'}>
   <header className="hai-head" hidden={embedded}><BayitAIMark size={36}/><div><h2 id={uid}>{a.T('Bayit AI','בית AI')}</h2><small>{a.T('Ask, request, plan · only what you may see','שואלים, מבקשים, מתכננים · רק מה שמותר לכם לראות')}</small></div>
    {!embedded&&<button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label={a.T('Close Bayit AI','סגירת בית AI')}><X size={24}/></button>}</header>
   <div className="hai-tabs"><div className="hai-seg hai-views" role="tablist" aria-label={a.T('Bayit AI','בית AI')}>{[['chat',a.T('Chat','שיחה'),ChatCircleText],['suggestions',a.T('Suggestions','הצעות'),Lightbulb],['history',a.T('History','היסטוריה'),ClockCounterClockwise],['settings',a.T('Settings','הגדרות'),Gear]].map(([k,t,G])=><button type="button" role="tab" key={k} aria-selected={c.view===k} className={c.view===k?'on':''} onClick={()=>go(k)}><G size={17} aria-hidden="true"/>{t}{k==='suggestions'&&waiting>0&&<b className="hai-tab-count" aria-label={a.T(waiting+' waiting',waiting+' מחכות')}>{waiting}</b>}</button>)}</div></div>
   {c.view==='history'?<div className="hai-body" role="tabpanel">{a.cloud?<History a={a} onOpen={loadConversation}/>:<p className="hai-empty">{a.T('Sample household: your own Bayit keeps your conversations here.','בית לדוגמה: ב־Bayit שלכם השיחות נשמרות כאן.')}</p>}</div>
   :c.view==='suggestions'?<div className="hai-body" role="tabpanel"><HubSuggestions a={a} ui={ui} onNavigate={leave} onSettings={()=>go('settings')}/></div>
   :c.view==='settings'?<div className="hai-body" role="tabpanel"><HubSettings a={a} ui={ui} conn={c.conn} connected={connected} buttonSettings={<BayitAIButtonSettings a={a}/>} onNavigate={leave}/></div>
   :<div className="hai-body" role="tabpanel">
    <div className="hai-scope-row"><div className="hai-seg hai-scope" role="group" aria-label={a.T('Whose records','רישומים של')}>{[['family',a.T('Family','משפחתי'),UsersThree],['private',a.T('Mine','שלי'),LockSimple]].map(([k,t,G])=><button type="button" key={k} aria-pressed={c.scope===k} className={c.scope===k?'on':''} onClick={()=>set({scope:k,messages:[],error:'',conversationId:null})}><G size={17}/>{t}</button>)}</div>
     {c.messages.length>0&&<button type="button" className="button secondary hai-new" onClick={()=>set({messages:[],conversationId:null,error:''})}><Plus size={18}/>{a.T('New chat','שיחה חדשה')}</button>}</div>
    {!connected&&<div className="hai-connect" role="note"><Sparkle size={20}/><span>{a.cloud?a.T('Connect your household’s AI in Settings → Accounts & connections to ask.','כדי לשאול, חברו את ה־AI של הבית בהגדרות ← חשבונות וחיבורים.'):a.T('Sample household: connect a real AI in your own Bayit to ask.','בית לדוגמה: כדי לשאול, חברו AI אמיתי ב־Bayit שלכם.')}</span>{a.cloud&&<button type="button" className="text-link" onClick={()=>{onClose();a.go('settings/ai')}}>{a.T('Open','פתיחה')}</button>}</div>}
    {!c.messages.length&&<Intro a={a} root={root} ui={ui} onAsk={q=>connected&&ask(q)} onClose={onClose} onPlan={canPlan?()=>setIntake(text.trim()):null} onSuggestions={()=>go('suggestions')}/>}
    {c.messages.map((m,i)=><div key={i} className="hai-pair">
     <div className="hai-mine"><VoiceBadge a={a} seconds={m.voice}/>{String(m.query).split(/\n+|(?<=[.?!])\s+(?=\S)/).filter(Boolean).map((line,j)=><span key={j} dir="auto" className="hai-line">{line}</span>)/* each sentence keeps its own language's direction */}</div>
     {m.status==='sent'&&<div className="hai-steps" aria-live="polite"><span className="hai-step done"><CheckCircle size={16} weight="fill"/>{a.T('Sent','נשלח')}</span><span className="hai-step now"><BayitAIMark size={18}/>{a.T('Bayit AI is thinking…','בית AI חושב…')}<i/><i/><i/></span></div>}
     {m.answer&&<div className="hai-answer"><AnswerText text={m.answer} a={a} Avatar={ui.Avatar} linkFor={linkFor(m)} onNavigate={route=>{onClose();a.go(route)}}/>
      {m.sources?.length>0&&<div className="hai-sources"><span className="hai-sources-title">{a.T('Records used','רישומים שנעזרתי בהם')}</span>{m.sources.slice(0,6).map(s=>{const G=s.type==='shopping'?ShoppingCart:s.type==='event'?CalendarDots:s.type==='task'?CheckSquare:Note;return <button type="button" className="hai-source" key={s.id} onClick={()=>{onClose();a.go(recordRoute(s,c.scope))}}><G size={17} aria-hidden="true"/><span dir="auto">{s.title}</span>{s.date&&<small dir="ltr">{s.date.slice(5).split('-').reverse().join('.')}</small>}</button>})}</div>}
      {m.plan&&<Plan a={a} ui={ui} m={m} pending={!!pending} onApply={apply} onUndo={undo} onDismiss={dismiss}/>}{m.fromHistory&&m.plan&&!a.data.aiOperations?.[m.plan.id]&&<p className="hai-old">{a.T('Proposed earlier and not saved. Ask again to get a fresh proposal.','הוצע בעבר ולא נשמר. שאלו שוב כדי לקבל הצעה עדכנית.')}</p>}</div>}
     {m.error&&<p className="hai-error" role="alert">{m.error}</p>}
    </div>)}
    {c.error&&<p className="hai-error" role="alert">{c.error}</p>}
    <div ref={end}/>
   </div>}
   {c.view==='chat'&&<form className="hai-composer" onSubmit={e=>{e.preventDefault();if(connected)ask(text)}}>
    <input value={text} onChange={e=>setText(e.target.value)} maxLength={2000} dir={text?'auto':undefined} placeholder={a.T('Ask Bayit AI…','לשאול את בית AI…')} aria-label={a.T('Question or request','שאלה או בקשה')} disabled={!connected}/>
    <VoiceInput a={a} disabled={!connected||c.busy} value={text} onChange={setText} onText={(t,meta)=>ask(t,meta)}/>
    {canPlan&&<button type="button" className="icon-button hai-plan-btn" onClick={()=>setIntake(text.trim())} aria-label={a.T('Prepare a plan from a message, photo or PDF','להכין תוכנית מהודעה, צילום או PDF')} title={a.T('Prepare a plan','להכין תוכנית')}><ClipboardText size={22}/></button>}
    <button type="submit" className="hai-send" disabled={!connected||c.busy||!text.trim()} aria-label={a.T('Send to Bayit AI','שליחה לבית AI')}><PaperPlaneTilt size={22} weight="fill"/></button>
   </form>}
   {intake!==null&&<MessageReview a={a} Avatar={ui.Avatar} initialSource={intake} close={()=>setIntake(null)}/>}
  </section>;
 if(embedded)return body;
 return createPortal(<div className={'hai-layer hai-at-'+place}>{body}</div>,document.body);
}

// The launcher: one per app. Also owns sending, so the Today card and the AI page can open the same chat.
export function BayitAILauncher({a,ui}){
 const c=useChat(),conn=useAIConnected(a),bai=useBayitAI(a),place=aiButtonPlace(a),root=(a.route||'today').split(/[/?]/)[0];
 const online=useOnline(),aiOn=a.features?.on?.('ai')!==false,connected=!!conn?.connected&&!!conn?.model||false,show=aiOn&&online&&(connected||conn?.demo); // offline: Bayit AI needs a connection, and the offline note takes the bottom
 const count=bai.ready?bai.open.filter(f=>f.assignees.includes(a.user)).length:0;
 const latest=useRef(a);latest.current=a;
 useEffect(()=>{
  if(!aiOn){chat.send=null;return}
  if(chat.ready!==connected||chat.conn!==conn)set({ready:connected,conn});
  chat.send=async(query,meta)=>{
   const A=latest.current;if(chat.busy)return;
   const onPage=(A.route||'').split(/[/?]/)[0]==='ai'; // on the בית AI page the chat is the page itself, so nothing pops open later
   if(!connected){set({open:!onPage});return}
   const msg={query,voice:meta?.voice?meta.seconds:0,status:'sent'};const prior=chat.messages,cid=chat.conversationId||crypto.randomUUID();set({open:!onPage,view:'chat',busy:true,error:'',messages:[...prior,msg],conversationId:cid});
   try{const r=await api('chat',{question:query,context:makeContext(A,chat.scope),scope:chat.scope,conversationId:cid,voice:msg.voice,turns:prior.filter(m=>m.answer).slice(-6).flatMap(m=>[{role:'user',content:m.query},{role:'assistant',content:m.answer}])});
    set({messages:chat.messages.map(m=>m===msg?{...m,...r,status:'answered'}:m)})}
   catch(e){set({messages:chat.messages.map(m=>m===msg?{...m,status:'failed',error:e.status===429?A.T('Too many questions right now. Wait a minute and try again.','יותר מדי שאלות כרגע. חכו דקה ונסו שוב.'):e.message||A.T('Bayit AI could not answer. Try again.','בית AI לא הצליח לענות. נסו שוב.')}:m)})}
   finally{set({busy:false})}
  };
  return()=>{chat.send=null};
 },[aiOn,connected,conn]);
 useEffect(()=>{set({messages:[],open:false,conversationId:null})},[a.user,a.data?.householdId]); // the tab follows the page's route (BayitAIChatInline) or opens on Chat
 const away=useStepAside(show&&!c.open&&root!=='ai'&&(place==='bubble'||place==='edge'),place);
 const bubbleShown=show&&!c.open&&root!=='ai'&&place==='bubble'&&!away;
 // Lets toasts sit above the bubble instead of on it (floating.css).
 useEffect(()=>{const el=document.documentElement;if(bubbleShown)el.dataset.aiBubble='';else delete el.dataset.aiBubble;return()=>{delete el.dataset.aiBubble}},[bubbleShown]);
 if(!aiOn)return null;
 const open=()=>set({open:true,view:'chat'}),close=()=>set({open:false});
 const label=a.T('Open Bayit AI','פתיחת בית AI')+(count?a.T(' · '+count+' waiting',' · '+count+' מחכות'):'');
 let button=null;
 if(show&&!c.open&&root!=='ai'&&place!=='off'){
  if(place==='bubble')button=<button type="button" className={'hai-bubble'+(away?' hai-away':'')} onClick={open} aria-label={label} aria-hidden={away||undefined} tabIndex={away?-1:undefined}><BayitAIMark size={38}/><Sparkle className="hai-twinkle" size={14} weight="fill" aria-hidden="true"/>{count>0&&<b className="hai-badge" aria-hidden="true">{count}</b>}</button>;
  else if(place==='edge')button=<EdgeTab a={a} label={label} count={count} onOpen={open} away={away}/>;
  else if(place==='corner'){const slot=document.querySelector('.bayit-shell-utility');button=slot?createPortal(<button type="button" className="hai-corner" onClick={open} aria-label={label}><BayitAIMark size={30}/>{count>0&&<b className="hai-badge" aria-hidden="true">{count}</b>}</button>,slot):null}
 }
 return <>{place==='corner'?button:button&&createPortal(button,document.body)}{c.open&&root!=='ai'&&<ChatWindow a={a} ui={ui} place={place==='edge'?'edge':place==='corner'?'corner':'bubble'} root={root} onClose={close} connected={connected}/>}</>;
}

// History: my conversations, newest first, 20 at a time, with search (user request 2026-11-10).
function History({a,onOpen}){
 const [q,setQ]=useState(''),[list,setList]=useState(null),[next,setNext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async(more=false)=>{setBusy(true);setError('');try{const u=new URLSearchParams({...(q.trim()?{q:q.trim()}:{}),...(more&&next?{before:String(next)}:{})});const r=await fetch('/api/ai-history?'+u,{headers:cloudHeaders(),cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error);setList(l=>more?[...(l||[]),...j.conversations]:j.conversations);setNext(j.next)}catch(e){setError(e.message||a.T('History is unavailable right now.','ההיסטוריה אינה זמינה כרגע.'))}finally{setBusy(false)}};
 useEffect(()=>{const t=setTimeout(()=>load(false),q?300:0);return()=>clearTimeout(t)},[q]);
 const remove=async id=>{if(!window.confirm(a.T('Delete this conversation for good?','למחוק את השיחה לצמיתות?')))return;try{const r=await fetch('/api/ai-history/'+encodeURIComponent(id),{method:'DELETE',headers:cloudHeaders()});if(!r.ok)throw Error();setList(l=>l.filter(x=>x.id!==id));if(chat.conversationId===id)set({messages:[],conversationId:null})}catch{setError(a.T('Not deleted. Try again.','לא נמחק. נסו שוב.'))}};
 const dayOf=ms=>{const d=new Date(ms),t=new Date(),y=new Date(Date.now()-86400000),same=(x,z)=>x.toDateString()===z.toDateString();return same(d,t)?a.T('Today','היום'):same(d,y)?a.T('Yesterday','אתמול'):d.toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{day:'numeric',month:'long'})};
 const mark=(text)=>{const s=String(text||''),t=q.trim();if(!t)return s;const i=s.toLowerCase().indexOf(t.toLowerCase());return i<0?s:<>{s.slice(0,i)}<mark>{s.slice(i,i+t.length)}</mark>{s.slice(i+t.length)}</>};
 let last='';
 return <div className="hai-history">
  <label className="hai-search"><MagnifyingGlass size={20} aria-hidden="true"/><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={a.T('Search my conversations…','חיפוש בשיחות שלי…')} aria-label={a.T('Search my conversations','חיפוש בשיחות שלי')}/></label>
  <p className="hai-old"><LockSimple size={14}/> {a.T('Only you see your conversations.','רק אתם רואים את השיחות שלכם.')}</p>
  {error&&<p className="hai-error" role="alert">{error}</p>}
  {list&&!list.length&&<p className="hai-empty">{q.trim()?a.T('No conversation matches “'+q.trim()+'”.','אין שיחה שמתאימה ל„'+q.trim()+'”.'):a.T('Your conversations with Bayit AI will appear here.','השיחות שלכם עם בית AI יופיעו כאן.')}</p>}
  {(list||[]).map(c=>{const d=dayOf(c.updatedAt),head=d!==last;last=d;return <React.Fragment key={c.id}>{head&&<h3 className="hai-day">{d}</h3>}
   <div className={'hai-session'+(chat.conversationId===c.id?' current':'')}><span className="hai-s-icon" aria-hidden="true">{c.scope==='private'?<LockSimple size={18}/>:<ChatCircleText size={18}/>}</span>
    <span className="hai-s-text" role="button" tabIndex={0} onClick={()=>onOpen(c.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(c.id)}}}><b dir="auto">{mark(c.title)}</b><small dir="auto">{mark(c.snippet)}</small><small>{new Date(c.updatedAt).toLocaleTimeString(a.lang==='he'?'he-IL':'en-GB',{hour:'2-digit',minute:'2-digit'})} · {a.T(c.turns+(c.turns===1?' question':' questions'),c.turns===1?'שאלה אחת':c.turns+' שאלות')}</small></span>
    <button type="button" className="icon-button" onClick={()=>remove(c.id)} aria-label={a.T('Delete conversation','מחיקת השיחה')}><Trash size={19}/></button></div></React.Fragment>})}
  {next&&<button type="button" className="button secondary hai-more" disabled={busy} onClick={()=>load(true)}>{busy?a.T('Loading…','טוען…'):a.T('Show older','להציג ישנות יותר')}</button>}
 </div>;
}

// The Ask Bayit AI page shows the same conversation inline (user report 2026-11-10: the page had its own older chat).
export function BayitAIChatInline({a,ui,view='chat'}){
 useChat();
 useEffect(()=>{if(HUB_VIEWS.includes(view)&&chat.view!==view)set({view})},[view]);
 return <ChatWindow a={a} ui={ui} place="bubble" root="ai" embedded connected={!!chat.ready} onClose={()=>{}} onView={k=>a.go(k==='chat'?'ai':'ai/'+k)}/>;
}

// The launcher steps aside (fades out, takes no taps) while a window is open, or while a save bar, sheet footer or
// another fixed/sticky bar would sit under it (orchestrator report 2026-11-10: the bubble covered Save on form pages).
// It measures what is on screen instead of a list of forms, so new forms are covered too.
// Elements marked data-keep-clear (a primary card with its button, e.g. Shopping's "Before the shop") count too, wherever
// they scroll, so the bubble never covers their button (orchestrator review 2026-11-11).
const BARS='[data-keep-clear],.form-sticky-actions,.tasks-sheet-actions,.money-manual-form-actions,.transaction-actions,.document-editor-footer,[class*="sticky-actions"],[class*="form-actions"],[class*="-actions"],footer';
function useStepAside(active,place){
 const [away,setAway]=useState(false);
 useEffect(()=>{
  if(!active){setAway(false);return}
  let frame=0;
  const check=()=>{frame=0;
   const root=document.documentElement;if(root.dataset.bayitDialogOpen==='true'){setAway(true);return}
   const me=document.querySelector(place==='edge'?'.hai-edge':'.hai-bubble');if(!me){setAway(false);return}
   const r=me.getBoundingClientRect(),pad=8,box={l:r.left-pad,r:r.right+pad,t:r.top-pad,b:r.bottom+pad};
   const hit=[...document.querySelectorAll(BARS)].some(e=>{if(e.closest('.hai-chat,.bayit-shell-nav,.bayit-shell-header,.toast,.offline-banner'))return false;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;
    if(!/sticky|fixed/.test(s.position)&&!e.closest('[role="dialog"]')&&!e.hasAttribute('data-keep-clear'))return false;const q=e.getBoundingClientRect();if(!q.width||!q.height)return false;return !(q.right<=box.l||q.left>=box.r||q.bottom<=box.t||q.top>=box.b)});
   setAway(hit);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(check)};
  const mo=new MutationObserver(schedule);mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open']});
  mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-bayit-dialog-open']});
  addEventListener('scroll',schedule,true);addEventListener('resize',schedule);schedule();
  return()=>{mo.disconnect();removeEventListener('scroll',schedule,true);removeEventListener('resize',schedule);cancelAnimationFrame(frame)};
 },[active,place]);
 return away;
}

// The edge tab can be dragged up or down; the position is a per-device convenience.
function EdgeTab({a,label,count,onOpen,away}){
 const [top,setTop]=useState(()=>{try{return Number(localStorage.getItem('bayit-ai-edge'))||50}catch{return 50}}),drag=useRef(null);
 const down=e=>{drag.current={y:e.clientY,top,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId)};
 const move=e=>{const d=drag.current;if(!d)return;const dy=e.clientY-d.y;if(Math.abs(dy)>6)d.moved=true;if(d.moved)setTop(Math.min(80,Math.max(20,d.top+dy/innerHeight*100)))};
 const up=()=>{const d=drag.current;drag.current=null;if(!d)return;if(d.moved){try{localStorage.setItem('bayit-ai-edge',String(Math.round(top)))}catch{}}else onOpen()};
 return <button type="button" className={'hai-edge'+(away?' hai-away':'')} style={{top:top+'%'}} aria-label={label} aria-hidden={away||undefined} tabIndex={away?-1:undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen()}}}><BayitAIMark size={32}/>{count>0&&<b className="hai-badge" aria-hidden="true">{count}</b>}</button>;
}

// בית AI › Settings: where my בית AI button sits (mine only).
export function BayitAIButtonSettings({a}){
 if(a.features?.on?.('ai')===false)return null;
 const place=aiButtonPlace(a),save=v=>a.update(d=>{d.preferences.appearanceByUser={...d.preferences.appearanceByUser,[a.user]:{...d.preferences.appearanceByUser?.[a.user],aiButton:v}}});
 const opts=[['bubble',a.T('Floating bubble','בועה צפה'),a.T('In the corner, above the menu','בפינה, מעל התפריט')],['edge',a.T('Side tab','לשונית בצד'),a.T('On the screen edge; drag it up or down','בקצה המסך; אפשר לגרור')],['corner',a.T('Next to the bell','ליד הפעמון'),a.T('In the header, nothing floats','בכותרת, בלי שום דבר צף')],['off',a.T('Hidden','מוסתר'),a.T('Ask from Today or the Bayit AI screen','שואלים מ„היום שלנו” או ממסך בית AI')]];
 return <div className="settings-v2 hai-settings"><FormSection T={a.T} icon={({size})=><BayitAIMark size={size+4}/>} tone="ai" className="settings-wide" title={a.T('Bayit AI button','כפתור בית AI')} note={a.T('Only mine','רק שלי')}>
  <p className="settings-section-intro">{a.T('Where Bayit AI waits for you on every screen. It appears while your household’s AI is connected.','איפה בית AI מחכה לכם בכל מסך. הוא מופיע כשה־AI של הבית מחובר.')}</p>
  <div className="hai-place" role="radiogroup" aria-label={a.T('Bayit AI button','כפתור בית AI')}>{opts.map(([k,t,d])=><button type="button" role="radio" aria-checked={place===k} key={k} className={'hai-place-option'+(place===k?' on':'')} onClick={()=>save(k)}><span className={'hai-place-pic p-'+k} aria-hidden="true"><i/></span><b>{t}</b><small>{d}</small></button>)}</div>
 </FormSection></div>;
}
