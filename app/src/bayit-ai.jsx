// בית AI (Bayit AI) recommendations in the app, concept A + B approved by the user on 2026-11-10
// (concept/explorations/ai-recommendations-20261110/concept-flow.png, mark: spark on the roof):
// • Today: "Bayit AI suggests checking" below your tasks, task rows with a real checkbox (tick = checked, OK; undo).
// • Tapping a row opens the window: amounts, recent months, two lines why, details, and three answers.
// • Tasks › "Bayit AI": To check / Checked (the history), with what was decided, by whom and what it saved.
// • Bayit AI › Settings (one place, 2026-11-11): the family switch (parents) and my digest.
// Only the server creates findings, so the AI flag is never set by a person. Adults only; money rows' own visibility.
import React,{useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {X,Check,Wrench,ArrowSquareOut,CreditCard,Eye,Sparkle,ChartBar,Info,Bell,EyeSlash,ArrowCounterClockwise,ListChecks,CalendarBlank,UsersThree,LockSimple,ArrowRight,ArrowLeft} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {FormSection} from './form-section.jsx';
import {HouseholdForm} from './household-form';
import {PriorityChoice} from './priority';
import {PersonChip} from './person-chip';
import {DateField} from './date-field';
import {TimeField} from './time-field';
import {useConfirmedSave} from './confirmed-save';
import {anchor} from './data';
import {findingTitle,findingWhy,findingDelta,findingShort,evidenceRoute,shekels,monthName,moneyFindings,audienceFor,cleanSettings,cleanPrefs,suppressKey,BAI_OUTCOMES} from '../../shared/bayit-ai.mjs';
import {PROVIDER_AREA} from '../../shared/providers.mjs';
import {demoMoneyRows,demoHistory} from './demo-bayit-ai.js';
import './bayit-ai.css';

export const BAYIT_AI_LIST='bayit-ai';

// ---- One shared store for Today, Tasks and Settings (so a tick on Today shows in Tasks at once) ----
const store={key:'',data:null,error:'',listeners:new Set(),timer:null,users:0,demo:null};
const emit=()=>{for(const l of store.listeners)l()};
async function api(path='',method='GET',body){
 const r=await fetch('/api/bayit-ai'+path,{method,cache:'no-store',headers:{...cloudHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error(j.error||'Request refused.');e.status=r.status;e.body=j;throw e}return j;
}
// The demo household (no server): fictional statement rows, the same shared rules, answers kept in memory.
function demoData(a){
 if(store.demo&&store.demo.user===a.user)return store.demo.data;
 const adults=a.members.filter(m=>m.role!=='child').map(m=>m.id),today=anchor;
 const holder=t=>t.account==='0457'?null:t.account==='5512'?adults[0]:adults[1]||adults[0];
 const now=Date.now(),open=moneyFindings(demoMoneyRows(today),{today,memberOf:holder}).map((f,i)=>({id:f.id,scopeKey:'family',kind:f.kind,area:'money',providerKey:f.providerKey,level:f.level,status:'open',createdAt:now-i*3600000,answeredAt:null,answeredBy:null,taskId:null,assignees:audienceFor(f,{adults,scope:'family'}).assignees,finding:f,aiText:null}));
 const data={available:true,adult:a.member(a.user).role!=='child',canManage:a.member(a.user).role==='parent',demo:true,features:{ai:true,expenses:true},settings:{enabled:true,areas:{money:true},frequency:'daily'},prefs:cleanPrefs({digest:'daily',push:true}),suppressions:[],lastRunAt:now,findings:[...open,...demoHistory(today,adults,now)]};
 if(!data.adult)data.findings=[];
 store.demo={user:a.user,data};return data;
}
async function load(a){
 try{store.data=a.cloud?await api():demoData(a);store.error=''}catch(e){store.error=e.message;store.data=store.data||null}emit();
}
function useStore(){return useSyncExternalStore(l=>{store.listeners.add(l);return()=>store.listeners.delete(l)},()=>store.data,()=>store.data)}

export function useBayitAI(a){
 const data=useStore(),key=(a.cloud?'c':'d')+'|'+(a.data?.householdId||'demo')+'|'+a.user;
 useEffect(()=>{
  if(store.key!==key){store.key=key;store.data=null;store.demo=null;load(a)}
  store.users++;if(!store.timer&&a.cloud)store.timer=setInterval(()=>{if(document.visibilityState==='visible')load(a)},60000);
  return()=>{store.users--;if(!store.users&&store.timer){clearInterval(store.timer);store.timer=null}};
 },[key]);
 const on=a.features?.on?.('ai')!==false&&a.features?.on?.('expenses')!==false;
 const findings=on&&data?.settings?.enabled?(data.findings||[]):[];
 const patch=f=>{if(!store.data)return;store.data={...store.data,findings:store.data.findings.map(x=>x.id===f.id&&x.scopeKey===f.scopeKey?f:x)};if(store.demo)store.demo.data=store.data;emit()};
 const act={
  reload:()=>load(a),
  answer:async(f,outcome,{suppress=false,taskId=null}={})=>{
   if(!a.cloud){const next={...f,status:outcome,answeredAt:Date.now(),answeredBy:a.user,taskId};patch(next);if(outcome==='dismissed'&&suppress){store.data={...store.data,suppressions:[{scopeKey:f.scopeKey,ruleKey:suppressKey(f.finding),label:{name:f.finding.name,kind:f.kind},createdBy:a.user,createdAt:Date.now()},...store.data.suppressions]};emit()}return next}
   try{const r=await api('/answer','POST',{id:f.id,scopeKey:f.scopeKey,outcome,suppress,taskId});patch(r.finding);if(suppress)load(a);return r.finding}
   catch(e){if(e.body?.finding)patch(e.body.finding);throw e}
  },
  undo:async f=>{
   if(!a.cloud){const next={...f,status:'open',answeredAt:null,answeredBy:null,taskId:null};patch(next);if(f.status==='dismissed'){store.data={...store.data,suppressions:store.data.suppressions.filter(s=>s.ruleKey!==suppressKey(f.finding))};emit()}return next}
   const r=await api('/undo','POST',{id:f.id,scopeKey:f.scopeKey});patch(r.finding);if(f.status==='dismissed')load(a);return r.finding;
  },
  saveSettings:async settings=>{const clean=cleanSettings(settings);if(!a.cloud){store.data={...store.data,settings:clean};emit();return}await api('/settings','PUT',clean);await load(a)},
  savePrefs:async prefs=>{const clean=cleanPrefs(prefs);if(!a.cloud){store.data={...store.data,prefs:clean};emit();return}const r=await api('/prefs','PUT',clean);store.data={...store.data,prefs:r.prefs};emit()},
  forget:async s=>{if(a.cloud)await api('/suppressions','DELETE',{scopeKey:s.scopeKey,ruleKey:s.ruleKey});store.data={...store.data,suppressions:store.data.suppressions.filter(x=>!(x.scopeKey===s.scopeKey&&x.ruleKey===s.ruleKey))};emit()},
  runNow:async()=>{if(a.cloud){await api('/run','POST');await load(a)}}
 };
 return {data,error:store.error,ready:!!data&&data.available!==false&&data.adult!==false&&on,enabled:!!data?.settings?.enabled,findings,open:findings.filter(f=>f.status==='open'),...act};
}

// ---- Small shared pieces ----
// The בית AI mark: the Bayit house with a spark on the roof (approved 2026-11-10). Night uses the light-on-dark copy.
export function BayitAIMark({size=24,className=''}){
 const file=size>48?256:size>24?128:64;
 return <span className={'bai-mark '+className} style={{width:size,height:size}} aria-hidden="true"><img className="bai-mark-day" src={'/assets/generated/bayit-ai-mark-'+file+'.png'} alt="" width={size} height={size}/><img className="bai-mark-night" src={'/assets/generated/bayit-ai-mark-'+file+'-dark.png'} alt="" width={size} height={size}/></span>;
}
// The mark as a section icon (FormSection renders <Icon size={24}/> inside its soft circle).
export const MarkIcon=({size=24})=><BayitAIMark size={size+4}/>;
export const BayitAIChip=({a})=><span className="bai-chip"><BayitAIMark size={16}/>{a.T('Bayit AI','בית AI')}</span>;
const LEVELS={3:['Check soon','לבדוק בקרוב'],2:['Worth a look','כדאי להציץ'],1:['For your information','לידיעה']};
export function AILevel({a,level,label=true}){
 const [en,he]=LEVELS[level]||LEVELS[1];
 return <span className={'bai-level l'+level} title={a.T('AI priority: ','עדיפות AI: ')+a.T(en,he)}>{[1,2,3].map(i=><Sparkle key={i} size={13} weight="fill" className={i<=level?'on':''} aria-hidden="true"/>)}{label?<em>{a.T(en,he)}</em>:<span className="bai-sr">{a.T(en,he)}</span>}</span>;
}
const OUTCOME={ok:[Check,'OK','תקין'],action:[Wrench,'Became a task','הפך למשימה'],dismissed:[X,'Not relevant','לא רלוונטי'],expired:[CalendarBlank,'Closed by itself','נסגר מעצמו']};
function OutcomePill({a,f}){const [Glyph,en,he]=OUTCOME[f.status]||OUTCOME.ok;return <span className={'bai-outcome o-'+f.status}><Glyph size={13} weight="bold"/>{a.T(en,he)}</span>}
const areaIcon=f=>PROVIDER_AREA[f.finding?.providerArea]?.icon||'1F4B0';
const fmtDay=(a,ms)=>ms?new Date(ms).toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{day:'numeric',month:'short'}):'';
export function Seg({items,value,onChange,label}){return <div className="tabs nav-filter bai-seg" role="group" aria-label={label}>{items.map(([key,text,count])=><button type="button" key={key} aria-pressed={value===key} className={value===key?'active':''} onClick={()=>onChange(key)}><span className="nav-label">{text}</span>{count!=null&&<em className="nav-count">{count}</em>}</button>)}</div>}
export function SwitchRow({checked,onChange,label,hint,disabled}){return <div className="bai-switch-row"><span><b>{label}</b>{hint&&<small>{hint}</small>}</span><button type="button" role="switch" aria-label={label} aria-checked={!!checked} disabled={disabled} className={'switch '+(checked?'on':'')} onClick={()=>onChange(!checked)}><span/></button></div>}

// A recommendation as a task row (the Today row anatomy: checkbox · icon · title + meta · faces).
export function BayitAIRow({a,f,ui:{Checkbox,Icon,Avatar},onOpen,onToggle,busy}){
 const title=findingTitle(f.finding,a.lang),done=f.status!=='open';
 return <div className={'task-row detailed today-task-row bai-row'+(done?' done':'')+' bai-l'+f.level}>
  <Checkbox checked={done} disabled={busy||f.status==='expired'} onChange={()=>onToggle(f)} aria-label={(done?a.T('Mark as not checked: ','סימון כלא נבדק: '):a.T('Checked, OK: ','נבדק, תקין: '))+title}/>
  <Icon code={areaIcon(f)}/>
  <button type="button" className="task-title" onClick={()=>onOpen(f)}>{title}
   <small className="today-task-meta bai-meta"><BayitAIChip a={a}/>{done?<><OutcomePill a={a} f={f}/>{f.answeredBy&&<span className="bai-when">{a.name(f.answeredBy)} · {fmtDay(a,f.answeredAt)}</span>}</>:<><AILevel a={a} level={f.level}/><span className="bai-delta" dir="ltr">{findingDelta(f.finding)}</span></>}</small>
  </button>
  <span className="bai-faces" aria-label={a.T('Who checks: ','מי בודק: ')+f.assignees.map(id=>a.name(id)).join(', ')}>{f.assignees.slice(0,2).map(id=><Avatar key={id} who={id} size={32} decorative/>)}</span>
 </div>;
}

// Shared row behaviour: tick = "checked, OK" with Undo; untick = undo. Tapping the title opens the window.
function useRowActions(a,bai){
 const [opened,setOpened]=useState(null),[busy,setBusy]=useState(''),[toast,setToast]=useState(null);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),6000);return()=>clearTimeout(t)},[toast]);
 const toggle=async f=>{
  if(busy)return;setBusy(f.id);
  try{if(f.status==='open'){const next=await bai.answer(f,'ok');setToast({f:next,text:a.T('Marked as checked: OK','סומן כנבדק: תקין')})}else{await bai.undo(f);setToast(null)}}
  catch(e){a.notify?.(e.status===409?a.T('Someone already answered this.','מישהו כבר ענה על זה.'):a.T('Not saved. Check the connection and try again.','לא נשמר. בדקו את החיבור ונסו שוב.'))}
  finally{setBusy('')}
 };
 const live=opened&&bai.findings.find(x=>x.id===opened.id&&x.scopeKey===opened.scopeKey)||opened;
 return {opened:live,setOpened,busy,toggle,toast,setToast};
}
function UndoToast({a,bai,toast,setToast}){
 if(!toast)return null;
 return createPortal(<div className="toast bai-toast" role="status"><Check size={20} weight="bold"/><span>{toast.text}</span><button type="button" className="text-link" onClick={async()=>{try{await bai.undo(toast.f)}finally{setToast(null)}}}>{a.T('Undo','ביטול')}</button></div>,document.body);
}

// ---- Today ----
export function BayitAIToday({a,ui}){
 const bai=useBayitAI(a),rows=useRowActions(a,bai);
 if(!bai.ready)return null;
 const mine=bai.open.filter(f=>f.assignees.includes(a.user));
 if(!mine.length&&!rows.opened)return <UndoToast a={a} bai={bai} toast={rows.toast} setToast={rows.setToast}/>;
 return <div className="bai-today">
  {mine.length>0&&<h3 className="bai-heading"><BayitAIMark size={28}/><span>{a.T('Bayit AI suggests checking','בית AI מציע לבדוק')}</span><b className="bai-count">{mine.length}</b></h3>}
  {mine.slice(0,2).map(f=><BayitAIRow key={f.scopeKey+f.id} a={a} f={f} ui={ui} busy={rows.busy===f.id} onOpen={rows.setOpened} onToggle={rows.toggle}/>)}
  {mine.length>0&&<button type="button" className="text-link bai-more" onClick={()=>a.go('tasks?list='+BAYIT_AI_LIST)}>{mine.length>2?a.T('+'+(mine.length-2)+' more recommendations','ועוד '+(mine.length-2)+' המלצות'):a.T('All recommendations','כל ההמלצות')}</button>}
  {rows.opened&&<BayitAIWindow a={a} f={rows.opened} bai={bai} ui={ui} onClose={()=>rows.setOpened(null)}/>}
  <UndoToast a={a} bai={bai} toast={rows.toast} setToast={rows.setToast}/>
 </div>;
}

// ---- Tasks › בית AI ----
export function BayitAIListCard({a,listId,onPick,Icon}){
 const bai=useBayitAI(a);if(!bai.ready||!bai.enabled)return null;
 const chosen=listId===BAYIT_AI_LIST;
 return <button type="button" aria-pressed={chosen} className={'tasks-list-card bai-list-card'+(chosen?' chosen':'')} onClick={onPick}><span className="tasks-list-icon"><BayitAIMark size={34}/></span><span className="tasks-list-text"><strong>{a.T('Bayit AI','בית AI')}</strong><small>{a.T('Suggested and checked','מה הוצע ונבדק')}</small></span><span className="tasks-list-count">{bai.open.length}</span></button>;
}
export function BayitAIList({a,ui}){
 const bai=useBayitAI(a),rows=useRowActions(a,bai),[view,setView]=useState('open');
 if(!bai.data)return <p className="muted bai-loading">{a.T('Loading…','טוען…')}</p>;
 if(!bai.ready||!bai.enabled)return <section className="bai-list"><div className="bai-empty"><BayitAIMark size={64}/><p>{!bai.data.adult?a.T('Bayit AI recommendations are for adults.','המלצות בית AI מיועדות למבוגרים.'):a.T('Bayit AI recommendations are off. A parent can turn them on in Bayit AI › Settings.','המלצות בית AI כבויות. הורה יכול להפעיל אותן בבית AI › הגדרות.')}</p>{bai.data.canManage&&<button type="button" className="button secondary" onClick={()=>a.go('ai/settings')}>{a.T('Open Bayit AI settings','פתיחת הגדרות בית AI')}</button>}</div></section>;
 const checked=bai.findings.filter(f=>f.status!=='open'),since=bai.findings.map(f=>f.createdAt).sort((x,y)=>x-y)[0];
 const handled=checked.filter(f=>f.status==='action'),saved=handled.reduce((n,f)=>n+(f.finding.yearly||0),0);
 const shown=view==='open'?bai.open:view==='checked'?checked:bai.findings;
 const groups=view==='open'?[3,2,1].map(l=>({key:'l'+l,level:l,rows:shown.filter(f=>f.level===l)})).filter(g=>g.rows.length):[{key:'all',rows:[...shown].sort((x,y)=>(y.answeredAt||y.createdAt)-(x.answeredAt||x.createdAt))}];
 return <section className="bai-list" aria-label={a.T('Bayit AI recommendations','המלצות בית AI')}>
  <Seg label={a.T('Show','הצגה')} value={view} onChange={setView} items={[['open',a.T('To check','לבדיקה'),bai.open.length],['checked',a.T('Checked','נבדקו'),checked.length],['all',a.T('All','הכל')]]}/>
  {bai.findings.length>0&&<div className="bai-stats"><div><b>{bai.findings.length}</b><small>{since?a.T('suggested since '+fmtDay(a,since),'הוצעו מאז '+fmtDay(a,since)):''}</small></div><div><b>{handled.length}</b><small>{a.T('handled','טופלו')}</small></div><div><b dir="ltr">{saved?shekels(saved):'—'}</b><small>{a.T('a year, if handled','בשנה, ממה שטופל')}</small></div></div>}
  {groups.map(g=><section key={g.key} className="tasks-group bai-group">{g.level&&<h2><span><AILevel a={a} level={g.level} label={false}/>{a.T(LEVELS[g.level][0],LEVELS[g.level][1])}</span><small>{g.rows.length}</small></h2>}
   {g.rows.map(f=><BayitAIRow key={f.scopeKey+f.id} a={a} f={f} ui={ui} busy={rows.busy===f.id} onOpen={rows.setOpened} onToggle={rows.toggle}/>)}</section>)}
  {!shown.length&&<div className="bai-empty"><BayitAIMark size={56}/><p>{view==='open'?a.T('Nothing to check right now. Bayit AI looks again '+(bai.data.settings.frequency==='weekly'?'next week.':'tomorrow.'),'אין מה לבדוק כרגע. בית AI יבדוק שוב '+(bai.data.settings.frequency==='weekly'?'בשבוע הבא.':'מחר.')):a.T('Nothing checked yet.','עדיין לא נבדק כלום.')}</p></div>}
  {rows.opened&&<BayitAIWindow a={a} f={rows.opened} bai={bai} ui={ui} onClose={()=>rows.setOpened(null)}/>}
  <UndoToast a={a} bai={bai} toast={rows.toast} setToast={rows.setToast}/>
 </section>;
}

// ---- The window ----
function Bars({a,f}){
 const h=(f.history||[]).slice(-6),max=Math.max(1,...h.map(x=>x.amount));
 if(!h.length)return null;
 return <div className="bai-bars" role="img" aria-label={h.map(x=>monthName(x.month,a.lang)+' '+shekels(x.amount)).join(', ')}>{h.map(x=><div key={x.month} className="bai-bar-col"><span className="bai-bar-value" dir="ltr">{shekels(x.amount)}</span><span className={'bai-bar'+(x.month===f.month?' hi':'')} style={{height:Math.max(8,Math.round(x.amount/max*72))+'px'}}/><small>{monthName(x.month,a.lang)}</small></div>)}</div>;
}
function Figure({a,f}){
 const he=a.lang==='he';
 if(f.kind==='jump')return <p className="bai-figure" dir="ltr"><s>{shekels(f.previous)}</s>{he?<ArrowLeft size={20}/>:<ArrowRight size={20}/>}<b>{shekels(f.amount)}</b></p>;
 if(f.kind==='new')return <p className="bai-figure"><b dir="ltr">{shekels(f.amount)}</b><small>{a.T('a month','בחודש')}</small></p>;
 return <div className="bai-charges">{(f.dates||[]).map((d,i)=><div key={i}><span dir="auto">{f.description} · {new Date(d+'T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{day:'numeric',month:'short'})}{f.times?.[i]?' '+f.times[i]:''}</span><b dir="ltr">{shekels(f.amount)}</b></div>)}</div>;
}
export function BayitAIWindow({a,f,bai,ui,onClose}){
 const uid=useId(),close=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[asking,setAsking]=useState(false),[acting,setActing]=useState(false);
 useEffect(()=>{close.current?.focus({preventScroll:true})},[]);
 const F=f.finding,lang=a.lang,why=findingWhy(F,lang),line2=f.aiText?.[lang]||why[1],priv=f.scopeKey.startsWith('private:'),open=f.status==='open';
 const answer=async(outcome,opts)=>{if(busy)return;setBusy(true);setError('');try{await bai.answer(f,outcome,opts);if(outcome!=='action')onClose()}catch(e){setError(e.status===409?a.T('Someone already answered this. The latest answer is shown.','מישהו כבר ענה על זה. מוצגת התשובה האחרונה.'):a.T('Not saved. Check the connection and try again.','לא נשמר. בדקו את החיבור ונסו שוב.'))}finally{setBusy(false)}};
 const undo=async()=>{if(busy)return;setBusy(true);setError('');try{await bai.undo(f)}catch{setError(a.T('Could not undo. Try again.','לא הצלחנו לבטל. נסו שוב.'))}finally{setBusy(false)}};
 const task=f.taskId&&(a.data.tasks||[]).find(t=>t.id===f.taskId);
 if(acting)return <BayitAIActionForm a={a} f={f} bai={bai} ui={ui} onClose={()=>setActing(false)} onDone={onClose}/>;
 return createPortal(<div className="document-editor-backdrop contact-editor-backdrop household-window-backdrop"><section className="document-editor contact-editor household-window wide bai-window" role="dialog" aria-modal="true" aria-labelledby={uid} dir={lang==='he'?'rtl':'ltr'} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.preventDefault();onClose()}}}>
  <header className="document-editor-header"><div className="bai-window-title"><span className="bai-eyebrow"><BayitAIMark size={22}/>{a.T('Bayit AI','בית AI')} · {findingShort(F,lang)}</span><h2 id={uid}>{findingTitle(F,lang)}</h2></div><button ref={close} type="button" className="icon-button" disabled={busy} aria-label={a.T('Close','סגירה')} onClick={onClose}><X size={24}/></button></header>
  <div className="document-editor-body"><div className="form-columns"><div className="form-column">
   <FormSection T={a.T} icon={ChartBar} tone="ai" title={a.T('What Bayit AI saw','מה בית AI ראה')}>
    <div className="bai-figure-row"><Figure a={a} f={F}/><AILevel a={a} level={f.level}/></div>
    <Bars a={a} f={F}/>
    <p className="bai-why">{why[0]}<span>{line2}</span></p>
   </FormSection></div>
   <div className="form-column"><FormSection T={a.T} icon={Info} tone="blue" title={a.T('Details','פרטים')}>
    <dl className="bai-facts">
     <div><dt><Sparkle size={18}/>{a.T('AI priority','עדיפות AI')}</dt><dd>{a.T(LEVELS[f.level][0],LEVELS[f.level][1])}<small>{a.T('Bayit AI’s, not your family’s priority','של בית AI, לא העדיפות של המשפחה')}</small></dd></div>
     <div><dt><UsersThree size={18}/>{a.T('Who checks','מי בודק')}</dt><dd className="bai-people">{f.assignees.map(id=><span key={id}><ui.Avatar who={id} size={28} decorative/>{a.name(id)}</span>)}{F.holder&&f.assignees.length===1&&<small>{a.T('The card holder','בעל הכרטיס')}</small>}</dd></div>
     <div><dt>{priv?<LockSimple size={18}/>:<Eye size={18}/>}{a.T('Who sees it','מי רואה')}</dt><dd>{priv?a.T('Only you (from your own money view)','רק אתם (מהכסף הפרטי שלכם)'):a.T('The adults of the family only','רק המבוגרים במשפחה')}</dd></div>
     <div><dt><CalendarBlank size={18}/>{a.T('Noticed','זוהה')}</dt><dd>{fmtDay(a,f.createdAt)}</dd></div>
     {!open&&<div><dt><ListChecks size={18}/>{a.T('Answer','תשובה')}</dt><dd><OutcomePill a={a} f={f}/>{f.answeredBy&&<small>{a.name(f.answeredBy)} · {fmtDay(a,f.answeredAt)}</small>}</dd></div>}
    </dl>
    <div className="bai-links">
     <button type="button" className="text-link" onClick={()=>{onClose();a.go(evidenceRoute(F,priv?'private':'family'))}}><ArrowSquareOut size={18}/>{F.kind==='dup'?a.T('Open this month in Expenses','פתיחת החודש בהוצאות'):a.T('Open in Who we pay','פתיחה ב„למי משלמים”')}</button>
     {task&&<button type="button" className="text-link" onClick={()=>{onClose();a.go('tasks?task='+task.id+(task.date?'&date='+task.date:''))}}><ListChecks size={18}/>{a.T('Open the task: ','פתיחת המשימה: ')}{a.text(task)}</button>}
    </div>
   </FormSection></div></div>
   {asking&&<div className="bai-ask" role="group" aria-label={a.T('Not relevant','לא רלוונטי')}><p>{a.T('Stop suggesting this kind of thing for '+(F.name?.en||'')+'?','להפסיק להציע דברים כאלה על '+(F.name?.he||F.name?.en||'')+'?')}</p><div className="actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>answer('dismissed',{suppress:false})}>{a.T('Just this time','רק הפעם')}</button><button type="button" className="button" disabled={busy} onClick={()=>answer('dismissed',{suppress:true})}><EyeSlash size={20}/>{a.T('Don’t suggest again','לא להציע שוב')}</button></div></div>}
  </div>
  <footer className="document-editor-footer">{error&&<p role="alert" className="save-error">{error}</p>}<div className="actions bai-answers">
   {open?<><button type="button" className="button secondary bai-no" disabled={busy} aria-pressed={asking} onClick={()=>setAsking(!asking)}><X size={20}/>{a.T('Not relevant','לא רלוונטי')}</button><button type="button" className="button bai-act" disabled={busy} onClick={()=>setActing(true)}><Wrench size={20}/>{a.T('Needs action','צריך לטפל')}</button><button type="button" className="button secondary bai-ok" disabled={busy} onClick={()=>answer('ok')}><Check size={20} weight="bold"/>{a.T('OK','תקין')}</button></>
    :<><button type="button" className="button secondary" disabled={busy||f.status==='expired'} onClick={undo}><ArrowCounterClockwise size={20}/>{a.T('Undo the answer','ביטול התשובה')}</button><button type="button" className="button" onClick={onClose}>{a.T('Close','סגירה')}</button></>}
  </div></footer>
 </section></div>,document.body);
}

// "Needs action": a short form that makes a normal family task, linked back to the recommendation.
const suggestions=(F,lang)=>{const raw=(lang==='he'?F.name?.he:F.name?.en)||F.name?.en||'',he=lang==='he',n=he&&/^[A-Za-z0-9]/.test(raw)?'־'+raw:raw; // Hebrew prefix + Latin name: ל־Disney+
 return F.kind==='jump'?[he?'להתקשר ל'+n+' על המחיר':'Call '+n+' about the price',he?'לבדוק מה נוסף לחשבון של '+n:'Check what was added to the '+n+' bill']
  :F.kind==='new'?[he?'לבטל את המנוי ל'+n:'Cancel the '+n+' subscription',he?'לבדוק אם משתמשים ב'+n:'Check whether anyone uses '+n]
  :[he?'לבקש החזר מ'+n:'Ask '+n+' for a refund',he?'לבדוק את החיוב הכפול ב'+n:'Check the double charge from '+n]};
export function BayitAIActionForm({a,f,bai,ui,onClose,onDone}){
 const F=f.finding,options=suggestions(F,a.lang),viewers=f.scopeKey.startsWith('private:')?[a.user]:a.members.filter(m=>m.role!=='child').map(m=>m.id);
 const plus=d=>{const x=new Date(anchor+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)};
 const [title,setTitle]=useState(options[0]),[who,setWho]=useState(f.assignees.filter(id=>viewers.includes(id)).slice(0,1).length?f.assignees.filter(id=>viewers.includes(id)).slice(0,1):[a.user]),[date,setDate]=useState(plus(3)),[priority,setPriority]=useState(f.level>=3?'high':'medium'),[error,setError]=useState('');
 const {commit,saving}=useConfirmedSave(a);
 const save=async e=>{e.preventDefault();if(!title.trim()||!who.length)return;setError('');
  const id=crypto.randomUUID(),priv=f.scopeKey.startsWith('private:'),allowed=[...new Set([a.user,...viewers])];
  const ok=await commit(()=>a.update(d=>{d.tasks.push({id,title:title.trim(),he:title.trim(),icon:areaIcon(f),memberId:who[0],memberIds:who,date,time:'',repeat:'once',done:false,xp:0,priority,ownerId:a.user,visibility:priv?'private':'selected',allowedIds:priv?[]:allowed.filter(x=>x!==a.user)})}));
  if(!ok)return;
  try{await bai.answer(f,'action',{taskId:id});onDone()}catch(e){setError(e.status===409?a.T('The task was saved, but someone already answered this recommendation.','המשימה נשמרה, אבל מישהו כבר ענה על ההמלצה.'):a.T('The task was saved. Linking it to the recommendation failed; try again.','המשימה נשמרה. הקישור להמלצה נכשל; נסו שוב.'))}
 };
 return <HouseholdForm a={a} wide className="bai-action-window" title={a.T('Needs action: ','צריך לטפל: ')+((a.lang==='he'?F.name?.he:F.name?.en)||'')} onClose={()=>!saving&&onClose()} onSubmit={save} saving={saving} error={error} actions={<button type="submit" className="button" disabled={saving||!title.trim()||!who.length}><Check size={20}/>{saving?a.T('Saving…','שומרים…'):a.T('Add to tasks','הוספה למשימות')}</button>}>
  <div className="form-columns"><div className="form-column">
   <FormSection T={a.T} icon={Sparkle} tone="ai" title={a.T('What Bayit AI found','מה בית AI מצא')}><p className="bai-why">{findingWhy(F,a.lang)[0]}<span>{f.aiText?.[a.lang]||findingWhy(F,a.lang)[1]}</span></p><Bars a={a} f={F}/></FormSection>
  </div><div className="form-column">
   <FormSection T={a.T} icon={ListChecks} tone="blue" title={a.T('A task for the family','משימה למשפחה')}>
    <label>{a.T('What to do','מה עושים')}<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} dir="auto"/></label>
    <div className="bai-chips">{options.map(o=><button key={o} type="button" className={'bai-suggest'+(o===title?' on':'')} aria-pressed={o===title} onClick={()=>setTitle(o)}>{o}</button>)}</div>
    <div className="bai-field"><span className="field-label">{a.T('Who','מי')}</span><div className="bai-people-pick">{viewers.map(id=><PersonChip key={id} who={id} name={a.name(id)} Avatar={ui.Avatar} selected={who.includes(id)} onClick={()=>setWho(who.includes(id)?who.filter(x=>x!==id):[...who,id])}/>)}</div></div>
    <label>{a.T('By','עד')}<DateField required value={date} onChange={e=>setDate(e.target.value)}/></label>
    <div className="bai-field"><span className="field-label">{a.T('Your priority','העדיפות שלכם')}</span><PriorityChoice a={a} value={priority} onChange={setPriority}/></div>
   </FormSection>
  </div></div>
 </HouseholdForm>;
}

// ---- Settings ----
// Bayit AI › Settings (one place for every AI setting, user decision 2026-11-11): the family switch (parents change it; other adults see it).
export function BayitAISettings({a}){
 const bai=useBayitAI(a),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!bai.data||bai.data.available===false||bai.data.adult===false||a.features?.on?.('ai')===false)return null;
 const s=bai.data.settings,parent=bai.data.canManage,save=async next=>{setBusy(true);setError('');try{await bai.saveSettings({...s,...next})}catch(e){setError(e.message||a.T('Not saved.','לא נשמר.'))}finally{setBusy(false)}};
 const expensesOff=a.features?.on?.('expenses')===false;
 return <FormSection T={a.T} icon={MarkIcon} tone="ai" className="settings-wide bai-settings" title={a.T('Bayit AI recommendations','המלצות בית AI')} note={parent?a.T('A parent turns it on','הורה מפעיל'):a.T('Set by a parent','נקבע על ידי הורה')}>
  <p className="settings-section-intro">{a.T('Bayit AI looks for things worth a check and adds them to Tasks with its own mark. Fixed rules find them; the household AI only words them, once per check.','בית AI מחפש דברים שכדאי לבדוק ומוסיף אותם למשימות עם סימן משלו. כללים קבועים מוצאים אותם; ה־AI של הבית רק מנסח, פעם אחת בכל בדיקה.')}</p>
  <SwitchRow label={a.T('Bayit AI checks and suggests','בית AI בודק ומציע')} hint={parent?a.T('For the adults of the family. Children never see money recommendations.','למבוגרים במשפחה. ילדים לא רואים המלצות כסף.'):a.T('Only a parent can change this.','רק הורה יכול לשנות.')} checked={s.enabled} disabled={!parent||busy} onChange={v=>save({enabled:v})}/>
  <span className="field-label">{a.T('What to check','מה לבדוק')}</span>
  <SwitchRow label={a.T('Money','כסף')} hint={expensesOff?a.T('Needs Expenses, which is off.','דורש את „הוצאות”, שכבוי.'):a.T('New recurring charges, price jumps on fixed charges, double charges. Electricity, water, gas and arnona are not flagged for price changes.','חיובים קבועים חדשים, קפיצות מחיר בחיובים קבועים, חיובים כפולים. חשמל, מים, גז וארנונה לא מסומנים על שינויי מחיר.')} checked={s.areas.money&&!expensesOff} disabled={!parent||busy||!s.enabled||expensesOff} onChange={v=>save({areas:{...s.areas,money:v}})}/>
  <div className="bai-switch-row bai-soon"><span><b>{a.T('Overlapping events','אירועים חופפים')}</b><small>{a.T('Two things at the same time for one person','שני דברים באותה שעה לאותו אדם')}</small></span><em className="bai-soon-pill">{a.T('Later','בהמשך')}</em></div>
  <div className="bai-switch-row bai-soon"><span><b>{a.T('Forgotten routines','שגרות שנשכחו')}</b><small>{a.T('Something regular not done for two weeks','משהו קבוע שלא סומן כבר שבועיים')}</small></span><em className="bai-soon-pill">{a.T('Later','בהמשך')}</em></div>
  <span className="field-label">{a.T('How often','כל כמה זמן')}</span>
  <div className={(!parent||!s.enabled)?'bai-disabled':''}><Seg label={a.T('How often','כל כמה זמן')} value={s.frequency} onChange={v=>parent&&s.enabled&&!busy&&save({frequency:v})} items={[['daily',a.T('Every day','כל יום')],['weekly',a.T('Once a week','פעם בשבוע')]]}/></div>
  {bai.data.suppressions?.length>0&&<><span className="field-label">{a.T('Not suggested again','לא להציע שוב')}</span><ul className="bai-suppressed">{bai.data.suppressions.map(x=><li key={x.scopeKey+x.ruleKey}><span><b dir="auto">{(a.lang==='he'?x.label?.name?.he:x.label?.name?.en)||x.ruleKey}</b><small>{x.label?.kind==='jump'?a.T('Price jumps','קפיצות מחיר'):x.label?.kind==='new'?a.T('New recurring charge','חיוב קבוע חדש'):a.T('Double charges','חיובים כפולים')}{x.scopeKey!=='family'?a.T(' · only me',' · רק שלי'):''}</small></span><button type="button" className="button secondary" onClick={()=>bai.forget(x)}><ArrowCounterClockwise size={18}/>{a.T('Bring back','להחזיר')}</button></li>)}</ul></>}
  {bai.data.lastRunAt>0&&s.enabled&&<p className="muted bai-last">{a.T('Last check: ','בדיקה אחרונה: ')}{new Date(bai.data.lastRunAt).toLocaleString(a.lang==='he'?'he-IL':'en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>}
  {error&&<p role="alert" className="save-error">{error}</p>}
 </FormSection>;
}

// Bayit AI › Settings › My notifications: my own digest (off / daily / weekly, time, Push, Telegram). Quiet hours always apply.
export function BayitAINotify({a}){
 const bai=useBayitAI(a),[busy,setBusy]=useState(false);
 if(!bai.data||!bai.ready||!bai.enabled)return null;
 const p=bai.data.prefs,save=async next=>{setBusy(true);try{await bai.savePrefs({...p,...next})}catch{a.notify?.(a.T('Not saved.','לא נשמר.'))}finally{setBusy(false)}};
 const days=a.lang==='he'?['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 return <div className="settings-v2 bai-notify"><FormSection T={a.T} icon={MarkIcon} tone="yellow" className="settings-wide" title={a.T('My recommendation summary','סיכום ההמלצות שלי')} note={a.T('Only mine','רק שלי')}>
  <p className="settings-section-intro">{a.T('One short summary of new recommendations, never during your quiet hours. Recommendations always appear on Today and in Tasks.','סיכום קצר אחד של המלצות חדשות, אף פעם לא בשעות השקט שלכם. ההמלצות תמיד מופיעות ב„היום שלנו” ובמשימות.')}</p>
  <Seg label={a.T('Summary','סיכום')} value={p.digest} onChange={v=>!busy&&save({digest:v})} items={[['off',a.T('Off','כבוי')],['daily',a.T('Daily','יומי')],['weekly',a.T('Weekly','שבועי')]]}/>
  {p.digest!=='off'&&<div className="bai-notify-row"><label>{a.T('At','בשעה')}<TimeField value={p.time} disabled={busy} onChange={e=>e.target.value&&save({time:e.target.value})}/></label>{p.digest==='weekly'&&<label>{a.T('On','ביום')}<select value={p.weekday} disabled={busy} onChange={e=>save({weekday:Number(e.target.value)})}>{days.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>}</div>}
  {p.digest!=='off'&&<><SwitchRow label="Push" hint={a.T('On this and your other signed-in devices','במכשיר הזה ובשאר המכשירים שלכם')} checked={p.push} disabled={busy} onChange={v=>save({push:v})}/><SwitchRow label={a.T('Telegram','טלגרם')} hint={a.T('To your linked Bayit bot','לבוט של הבית שקישרתם')} checked={p.telegram} disabled={busy} onChange={v=>save({telegram:v})}/></>}
 </FormSection></div>;
}
