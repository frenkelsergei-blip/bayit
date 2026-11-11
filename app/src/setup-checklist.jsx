// Install wizard concept A (user decision 2026-11-11, AGENTS.md; concept a1-checklist, a5-resume, a6-done, a7-today):
// the last stage of the first-run overlay is the live "To start" section of Settings › Accounts & connections
// (connections-hub.jsx, wizard mode: the same rows, statuses, guides and windows; Family members first, opening
// setup-people.jsx). Then Done, then a parents-only "Finish setting up your home" card on Today until the To start
// rows are all ready or the card is dismissed. Status is always read live. The only progress kept is
// preferences.familyProfile.checklist = {since, dismissedAt?}: when this household's checklist began, so the Today card
// is shown only to households that went through it (never to households set up before), and the dismissal.
import React,{useCallback,useEffect,useState} from 'react';
import {ListChecks,ArrowCounterClockwise,DeviceMobile,CheckCircle,Clock,HouseLine,Info,Sparkle,TelegramLogo,UsersThree,ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import {ConnectionsHub,connectionLive} from './connections-hub';
import {SetupPeople,invitedThisVisit,loopback} from './setup-people';
import {Address,CopyButton} from './setup-first-open';
import {FormSection} from './form-section';
import {CONNECTIONS} from '../../shared/connections.mjs';
import {cloudHeaders} from './cloud-transport';
import './setup-wizard.css';

const get=async path=>{const r=await fetch(path,{headers:cloudHeaders(),credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(String(r.status));return r.json()};
export const checklistOf=a=>a.data.preferences.familyProfile?.checklist||null;
// Adds or updates the household's checklist marker, keeping every other familyProfile field.
export const markChecklist=(a,patch)=>a.update(d=>{const p=d.preferences.familyProfile||{answers:{}};d.preferences.familyProfile={...p,checklist:{since:p.checklist?.since||new Date().toISOString(),...patch}}});
const COUNT={en:['','One more thing','Two more things','Three more things','Four more things'],he:['','עוד דבר אחד','עוד שני דברים','עוד שלושה דברים','עוד ארבעה דברים']};

// The family row while the wizard is on screen: "Just you, for now" with "Add family members" when nobody else is in
// the home and nobody was invited; "N invited · M joined" while invitations are open (from the live invitation list);
// otherwise the row's own live status from the connections hub.
// The concept's own words for the To start rows while the wizard shows them (a1-checklist): AI helper and Telegram are
// marked optional, with the time and cost each takes. Statuses still come from the live checks (connectionLive); the live
// Accounts & connections screen keeps its own words.
const near=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
export function aiWizardStatus(context){
 const {T}=context,base=connectionLive('ai').status(context),what=T('Ask about your home and get suggestions you approve. Needs an account with an AI provider.','שואלים שאלות על הבית ומקבלים הצעות שאתם מאשרים. צריך חשבון אצל ספק AI.');
 return base.state==='off'?{...base,what,status:T('Optional · not connected','לא חובה · עוד לא מחובר'),detail:T('About 10 minutes · you pay the provider per use','בערך 10 דקות · משלמים לספק לפי שימוש')}:{...base,what};
}
export function telegramWizardStatus(context){
 const {T}=context,base=connectionLive('telegram').status(context);
 return base.state==='off'?{...base,status:T('Optional · not connected','לא חובה · עוד לא מחובר'),detail:near()?T('Needs a public https address','צריך כתובת https ציבורית'):T('About 5 minutes · free','בערך 5 דקות · חינם')}:base;
}
// "0 of 3 ready · start with any row" before anything is ready, then "2 of 3 ready · left: AI helper" (a1, a5, a7).
export const wizardProgress=(T,list)=>({ready,total,left})=>ready===0&&left.length===total?T(ready+' of '+total+' ready · start with any row','מוכן '+ready+' מתוך '+total+' · אפשר להתחיל מכל שורה'):left.length?T(ready+' of '+total+' ready · left: '+list(left),'מוכן '+ready+' מתוך '+total+' · נשאר: '+list(left)):T('Your home is set up','הבית מוכן');
export function familyWizardStatus(context,invites){
 const {a,T}=context,base=connectionLive('family').status(context);
 const others=a.members.filter(m=>m.id!==a.user),joined=others.filter(m=>m.accountLinked).length,open=(invites||[]).filter(i=>i.status==='pending'&&i.purpose!=='recover').length;
 const what=T('Who lives with you? Each person gets their own link and their own passkey.','מי גר איתכם? כל אחד מקבל קישור משלו ונכנס עם מפתח גישה משלו.');
 if(!others.length&&!open)return {...base,what,state:'off',status:T('Just you, for now','רק אתם, בינתיים'),detail:near()?T('First needs an address phones can reach','צריך קודם כתובת שהטלפונים מגיעים אליה'):'',people:null,label:near()?T('How to give it an address','איך נותנים כתובת'):T('Add family members','הוספת בני משפחה')};
 if(open)return {...base,what,state:'part',status:T((open+joined)+' invited · '+joined+' joined','הוזמנו '+(open+joined)+' · הצטרפו '+joined),label:T('Manage','ניהול')};
 return {...base,what,label:T('Manage','ניהול')};
}
function useInvitations(a,enabled=true){
 const [invites,setInvites]=useState(null);
 const load=useCallback(()=>{if(!a.cloud||!enabled){setInvites([]);return}get('/api/family/invitations').then(d=>setInvites(d.invitations||[])).catch(()=>setInvites([]))},[!!a.cloud,enabled,a.data.householdId]);
 useEffect(()=>{load();addEventListener('bayit-invitations-changed',load);return()=>removeEventListener('bayit-invitations-changed',load)},[load]);
 return [invites,load];
}
const sameDay=(x,y)=>x.toDateString()===y.toDateString();
function stoppedWhen(a,iso){
 if(!iso)return a.T('earlier','קודם');const d=new Date(iso),now=new Date(),y=new Date(now);y.setDate(now.getDate()-1);
 return sameDay(d,now)?a.T('earlier today','מוקדם יותר היום'):sameDay(d,y)?a.T('yesterday','אתמול'):a.T('on '+d.toLocaleDateString('en-GB',{day:'numeric',month:'long'}),'ב־'+d.toLocaleDateString('he-IL',{day:'numeric',month:'long'}));
}

// The overlay's "To start" stage (a1-checklist; a5-resume when reopened from the Today card).
export function SetupChecklist({a,ui,resume,onSummary}){
 const T=a.T,[invites,reload]=useInvitations(a),[summary,setSummary]=useState(null);
 const report=useCallback(s=>{setSummary(s);onSummary?.(s)},[onSummary]);
 const listOf=items=>{try{return new Intl.ListFormat(a.lang==='he'?'he':'en',{type:'conjunction'}).format(items)}catch{return items.join(', ')}};
 const wizard={status:{family:context=>familyWizardStatus(context,invites),ai:aiWizardStatus,telegram:telegramWizardStatus},progress:wizardProgress(T,listOf),family:({close})=><SetupPeople a={a} ui={ui} onClose={()=>{close();reload()}}/>,onSummary:report};
 const left=summary?summary.total-summary.ready:0,rows=summary?.rows||[],optional=rows.filter(r=>r.id!=='family').map(r=>r.name);
 const words=COUNT[a.lang==='he'?'he':'en'][left];
 return <div className="setup-card iw-wiz iw-checklist">
  {resume&&<div className="pk-note blue"><ArrowCounterClockwise size={22} aria-hidden/><div><strong>{T('Welcome back','ברוכים השבים')}</strong><p>{T('You stopped here '+stoppedWhen(a,checklistOf(a)?.since)+'. What you did is saved.','עצרתם כאן '+stoppedWhen(a,checklistOf(a)?.since)+'. מה שכבר עשיתם נשמר.')}</p></div></div>}
  <h1 tabIndex={-1}>{!summary?T('Almost ready','כמעט מוכן'):left===0?T('Your home is set up','הבית מוכן'):words?T(words+', and your home is ready',words+', והבית מוכן'):T(left+' more things, and your home is ready','עוד '+left+' דברים, והבית מוכן')}</h1>
  <p className="pk-lead">{optional.length?T('Family members matter most. The '+optional.join(' and ')+(optional.length>1?' are':' is')+' optional and can wait: everything stays in Settings › Accounts & connections.','בני המשפחה הכי חשובים. '+optional.join(' ו')+' לא חובה, ואפשר גם אחר כך: הכול מחכה בהגדרות › חשבונות וחיבורים.'):T('Everything here also stays in Settings › Accounts & connections.','הכול גם מחכה בהגדרות › חשבונות וחיבורים.')}</p>
  <ConnectionsHub app={a} ui={ui} wizard={wizard}/>
  <p className="iw-tip"><DeviceMobile size={20} aria-hidden/><span>{T('Tip: add Bayit to your phone’s home screen. It opens like an app, and on iPhone that’s also how notifications arrive.','טיפ: הוסיפו את Bayit למסך הבית של הטלפון. כך הוא נפתח כמו אפליקציה, ובאייפון גם מגיעות התראות.')}</span></p>
 </div>;
}

// Done (a6-done): what's ready and what waits, from the checklist's live rows; save the address; add to home screen.
export function SetupDone({a,summary,install}){
 const T=a.T,me=a.member(a.user),passkey=!!a.cloud&&!a.cloud.session?.user?.email,rows=summary?.rows||[];
 const li=(ok,head,small,key)=><li key={key} className={ok?'ok':'later'}>{ok?<CheckCircle size={24} weight="fill" aria-hidden/>:<Clock size={24} aria-hidden/>}<span>{head}<small>{small}</small></span></li>;
 const later=T('Settings › Accounts & connections › To start','הגדרות › חשבונות וחיבורים › להתחלה');
 const names=[...new Set(invitedThisVisit)],list=n=>{try{return new Intl.ListFormat(a.lang==='he'?'he':'en',{type:'conjunction'}).format(n)}catch{return n.join(', ')}};
 const row=r=>{
  if(r.id==='family')return r.state==='off'?li(false,T('Family members: later','בני המשפחה: אחר כך'),later,r.id)
   :li(true,names.length?T('Links for '+list(names),'קישורים ל'+list(names)):T('Family members','בני המשפחה'),T('They join when they open them. You’ll see it in Settings › Family.','הם יצטרפו כשיפתחו אותם. תראו את זה בהגדרות › משפחה.'),r.id);
  if(r.state==='on')return li(true,r.name,r.id==='telegram'?T('The check with Telegram passed and your chat is linked.','הבדיקה מול טלגרם עברה, והצ׳אט שלכם מקושר.'):r.id==='ai'?T('The check with the provider passed.','הבדיקה מול הספק עברה.'):r.status,r.id);
  return li(false,T(r.name+': later',r.name+': אחר כך'),r.state==='warn'?r.status+' · '+later:later,r.id)};
 return <div className="setup-card setup-done iw-wiz iw-done">
  <div className="pk-hero"><span className="pk-ring ok"><HouseLine size={46} aria-hidden/></span><h1 tabIndex={-1}>{T('Your home is ready.','הבית מוכן.')}</h1><p>{T('Here’s what’s ready and what waits. You can come back to anything from Settings.','הנה מה שמוכן ומה מחכה. אפשר לחזור לכל דבר מההגדרות.')}</p></div>
  <ul className="iw-done-list">{li(true,passkey?T(a.name(me.id)+', with a passkey',a.name(me.id)+', עם מפתח גישה'):a.name(me.id),passkey?T('You own this home. The setup code no longer works.','אתם בעלי הבית. קוד ההקמה כבר לא עובד.'):T('You own this home.','אתם בעלי הבית.'),'me')}{rows.map(row)}</ul>
  <div className="iw-save"><strong>{T('Save your home’s address','שמרו את הכתובת של הבית')}</strong><Address/>
   <div className="row"><CopyButton T={T} text={location.origin} secondary/>{install.prompt?<button type="button" className="button secondary" onClick={install.run}><DeviceMobile size={21} aria-hidden/>{T('Add to home screen','הוספה למסך הבית')}</button>:null}</div>
   <p className="iw-tip"><Info size={18} aria-hidden/><span>{install.prompt?T('Or from your browser’s menu: “Install app” or “Add to Home Screen”.','או מתפריט הדפדפן: ״התקנת האפליקציה״ או ״הוספה למסך הבית״.'):T('On iPhone: Safari’s Share button, then “Add to Home Screen”. On Android: Chrome’s menu, then “Add to Home screen”.','באייפון: כפתור השיתוף ב־Safari, ואז ״הוספה למסך הבית״. באנדרואיד: התפריט של Chrome, ואז ״הוספה למסך הבית״.')}</span></p>
   {loopback()&&<p className="iw-tip"><Info size={18} aria-hidden/><span>{T('This address only works on this computer. Before your family joins, give Bayit an https address.','הכתובת הזו עובדת רק במחשב הזה. לפני שהמשפחה מצטרפת, תנו ל־Bayit כתובת https.')}</span></p>}</div>
 </div>;
}
// The browser's own install prompt when it offers one (Chrome, Edge, Android); otherwise the steps in words.
export function useInstallPrompt(){
 const [event,setEvent]=useState(()=>window.__bayitInstallPrompt||null);
 useEffect(()=>{const keep=e=>{e.preventDefault();window.__bayitInstallPrompt=e;setEvent(e)};addEventListener('beforeinstallprompt',keep);return()=>removeEventListener('beforeinstallprompt',keep)},[]);
 return {prompt:!!event,run:async()=>{try{await event.prompt();await event.userChoice}catch{}window.__bayitInstallPrompt=null;setEvent(null)}};
}

// Today (a7-today): parents only, for households whose checklist began; hidden when every To start row is ready or
// when dismissed. Reads the same live statuses as the checklist (connectionLive) with the wizard's family status.
export function FinishSetupCard({a,Button}){
 const T=a.T,parent=a.member(a.user).role==='parent',mark=checklistOf(a),show=!!a.cloud&&parent&&!!mark&&!mark.dismissedAt;
 const [live,setLive]=useState({}),[invites]=useInvitations(a,show);
 useEffect(()=>{if(!show)return;let on=true;const settle=(k,p)=>p.then(v=>on&&setLive(s=>({...s,[k]:v}))).catch(()=>on&&setLive(s=>({...s,[k]:{failed:true}})));
  settle('ai',get('/api/ai/status'));settle('tg',get('/api/telegram/status'));return()=>{on=false}},[show,a.data.householdId]);
 if(!show)return null;
 const context={a,T,cloud:true,parent,adult:true,manager:live.tg?.canManage??parent,offline:'',ai:live.ai,tg:live.tg,me:live.tg?.members?.find(m=>m.id===a.user),need:''};
 const rows=CONNECTIONS.filter(c=>c.group==='start'&&(!c.feature||a.features?.on(c.feature)!==false)).map(c=>({c,s:c.id==='family'?familyWizardStatus(context,invites):c.id==='ai'?aiWizardStatus(context):c.id==='telegram'?telegramWizardStatus(context):connectionLive(c.id)?.status(context)})).filter(r=>r.s)
  .sort((x,y)=>(y.c.id==='family')-(x.c.id==='family'));
 if(rows.some(r=>r.s.state==='wait')||invites===null)return null; // until every status is known, say nothing rather than guess
 const ready=rows.filter(r=>r.s.state==='on').length;if(ready===rows.length)return null;
 const name=c=>a.lang==='he'?c.name.he:c.name.en,next=rows.find(r=>r.s.state!=='on'),left=rows.filter(r=>r.s.state!=='on').map(r=>name(r.c));
 const listed=(()=>{try{return new Intl.ListFormat(a.lang==='he'?'he':'en',{type:'conjunction'}).format(left)}catch{return left.join(', ')}})();
 const NEXT={family:[UsersThree,T('Each person gets their own link and their own passkey. About a minute each.','כל אחד מקבל קישור משלו ומפתח גישה משלו. בערך דקה לכל אחד.')],ai:[Sparkle,T('The AI helper answers questions about your home. About 10 minutes.','עוזר AI עונה על שאלות על הבית. בערך 10 דקות.')],telegram:[TelegramLogo,T('Reminders and a morning summary on Telegram. About 5 minutes.','תזכורות וסיכום בוקר בטלגרם. בערך 5 דקות.')]};
 const [Glyph,line]=NEXT[next.c.id]||[ListChecks,name(next.c)],Fwd=a.lang==='he'?ArrowLeft:ArrowRight;
 return <FormSection T={T} icon={ListChecks} tone="blue" className="iw-today settings-wide" title={T('Finish setting up your home','לסיים להקים את הבית')} note={T('Only parents see this','רק הורים רואים את זה')}>
  <div className="conn-progress" role="status"><span className="conn-bar" aria-hidden="true">{rows.map(r=><i key={r.c.id} className={r.s.state==='on'?'on':''}/>)}</span><span>{wizardProgress(T,()=>listed)({ready,total:rows.length,left})}</span></div>
  <div className="row"><span className="iw-tip"><Glyph size={20} weight={next.c.id==='ai'?'fill':'regular'} aria-hidden/>{line}</span>
   <span className="iw-today-acts"><button type="button" className="button" onClick={()=>a.go('today?setup=start')}>{T('Continue','להמשיך')}<Fwd size={21} aria-hidden/></button><button type="button" className="button secondary" onClick={()=>markChecklist(a,{dismissedAt:new Date().toISOString()})}>{T('Not now','לא עכשיו')}</button></span></div>
 </FormSection>;
}
