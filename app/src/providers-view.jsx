// Household › Expenses › Who we pay (concept A, chosen by the user 2026-11-09,
// concept/explorations/providers-20261109/): one total with a bar by area, a short "what stands out" note, then a
// tile per provider grouped by area. Tapping a tile opens its details, where adults rename, regroup, say who it is
// for, combine, hide, or add a provider by hand. Money is adult-only: the page is reached only from Expenses.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Sparkle,ArrowsClockwise,ClipboardText,Receipt,UsersThree,EyeSlash,Trash,Check,Info,TrendUp,ShieldCheck,ClockCounterClockwise,ListMagnifyingGlass,CaretDown,Buildings} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {HouseholdForm} from './household-form';
import {FormSection} from './form-section';
import {PersonChip} from './person-chip';
import {DateField} from './date-field';
import {whoWePay,providerHighlights,providerFingerprint,PROVIDER_GROUPS,PROVIDER_AREAS,PROVIDER_AREA,PAYMENT_KINDS,PROVIDER_PERIODS,insuranceTypeLabel} from '../../shared/providers.mjs';
import {demoProviderSettings} from './demo-providers';
import './providers.css';

const EMPTY={providers:{},added:[],aiLabels:{}};
// The monthly AI summary is asked for at most once per page load per household, view and person; the server decides
// whether it is due (once a calendar month, only with the household's own AI connected).
const autoAsked=new Set();
async function api(method,body,query=''){
 const r=await fetch('/api/finance/providers'+(method==='POST'?'/ai':'')+query,{method,headers:{...cloudHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 let result;try{result=await r.json()}catch{throw Object.assign(Error('The money service is unavailable.'),{status:r.status})}
 if(!r.ok)throw Object.assign(Error(result.error||'The request failed.'),{status:r.status,result});return result;
}

// The family's corrections for one money view (Together / Just me). Signed in: stored on the household server,
// adults only, versioned. Demo: kept with the sample household in this browser.
export function useProviderSettings(a,scope){
 const [remote,setRemote]=useState(null),[error,setError]=useState(''),[aiBusy,setAiBusy]=useState(false),[aiError,setAiError]=useState(''),latest=useRef('');
 const key=(a.data.householdId||'')+'|'+scope+'|'+a.user;latest.current=key;
 useEffect(()=>{setRemote(null);setError('');setAiError('');if(!a.cloud)return;let live=true;api('GET',null,'?scope='+scope).then(r=>{if(!live)return;setRemote(r);
  const month=new Date().toISOString().slice(0,7);if(a.features?.on('ai')===false||autoAsked.has(key)||r.ai?.generatedAt?.slice(0,7)===month)return;autoAsked.add(key);
  api('POST',{scope,language:a.lang,auto:true}).then(next=>{if(live&&latest.current===key&&!next.skipped)setRemote(next)}).catch(()=>{});
 }).catch(()=>{if(live){setRemote({settings:EMPTY,ai:null,version:0,failed:true})}});return()=>{live=false}},[key]);
 const local=a.data.providerSettings?.[scope]||(scope==='family'?demoProviderSettings(a.lang):EMPTY);
 const current=a.cloud?remote||{settings:EMPTY,ai:null,version:0,loading:true}:{settings:local,ai:null,version:0};
 const save=async settings=>{
  setError('');
  if(!a.cloud){await a.update(d=>{d.providerSettings={...(d.providerSettings||{}),[scope]:settings}});return true}
  try{const r=await api('PUT',{scope,version:current.version,settings});if(latest.current===key)setRemote(r);return true}
  catch(e){if(e.result?.current&&latest.current===key)setRemote(e.result.current);setError(e.status===409?a.T('Someone else changed this list. The latest version is shown; please make your change again.','מישהו אחר שינה את הרשימה. מוצגת הגרסה העדכנית; אפשר לבצע את השינוי שוב.'):a.T('Not saved. Please try again.','לא נשמר. אפשר לנסות שוב.'));return false}
 };
 const summarize=async()=>{
  setAiError('');
  if(!a.cloud){setAiError(a.T('An AI summary uses your household’s own AI provider. Connect one in Settings → Accounts & connections in your own Bayit.','סיכום AI משתמש בספק ה־AI של הבית. אפשר לחבר ספק בהגדרות ← חשבונות וחיבורים ב־Bayit שלכם.'));return}
  setAiBusy(true);try{const r=await api('POST',{scope,language:a.lang});if(latest.current===key)setRemote(r)}catch(e){if(latest.current===key)setAiError(e.message)}finally{if(latest.current===key)setAiBusy(false)}
 };
 return {...current,error,save,summarize,aiBusy,aiError};
}

// Policies the viewer may see in this money view (Insurance › policies), joined to the providers.
export const providerPolicies=(a,scope)=>a.visible(a.data.insurances||[]).filter(p=>!p.deletedAt&&(scope==='private'?p.visibility==='private':p.visibility!=='private'));
// month ("YYYY-MM", optional): the picture at the end of that month (user report 2026-11-10: the month control did
// nothing here). The current month and later show today's picture.
const lastDay=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
export const usePayees=(a,rows,scope,store,month)=>useMemo(()=>{const today=a.today,past=!!month&&!!today&&month<today.slice(0,7);
 return {...whoWePay(rows,{policies:providerPolicies(a,scope),settings:store.settings,today:past?lastDay(month):today,until:past?month:undefined}),past}},[rows,a.data.insurances,store.settings,scope,a.today,a.user,month]);

// onTransactions(provider): opens Transactions filtered to the provider's payments (signed in). reopen: a provider key
// whose details open again when coming back from there.
export function ProvidersView({a,ui,summary,store,scope,onTransactions,reopen}){
 const {Icon,Avatar,Select,Button,Tabs}=ui,he=a.lang==='he',T=a.T;
 const [open,setOpen]=useState(reopen?{key:reopen}:null);
 useEffect(()=>{if(reopen)setOpen({key:reopen})},[reopen]);
 // By area (the headings) or by company (user request 2026-11-10: one Cellcom card with its mobile, internet and energy).
 // The viewer's last choice is remembered in this browser only.
 const [by,setByState]=useState(()=>{try{return localStorage.getItem('bayit-who-pay-by')==='company'?'company':'area'}catch{return 'area'}});
 const setBy=v=>{setByState(v);try{localStorage.setItem('bayit-who-pay-by',v)}catch{}};
 // Expand / collapse (user feedback 2026-11-10): each area heading and each company with several services opens and
 // closes. Headings start open, companies closed (their services show as small chips until opened). Remembered here.
 const stored=k=>{try{return new Set(JSON.parse(localStorage.getItem(k)||'[]'))}catch{return new Set()}};
 const [closedGroups,setClosedGroups]=useState(()=>stored('bayit-who-pay-closed-areas')),[openCompanies,setOpenCompanies]=useState(()=>stored('bayit-who-pay-open-companies'));
 const flip=(set,setter,key,id)=>{const next=new Set(set);if(next.has(id))next.delete(id);else next.add(id);setter(next);try{localStorage.setItem(key,JSON.stringify([...next]))}catch{}};
 const money=(agorot,{fraction=0}={})=>agorot==null?'—':'⁦₪'+(agorot/100).toLocaleString(he?'he-IL':'en-US',{maximumFractionDigits:fraction})+'⁩';
 const name=p=>he?p.name.he:p.name.en,area=id=>he?PROVIDER_AREA[id]?.he:PROVIDER_AREA[id]?.en,group=g=>he?g.he:g.en;
 const day=iso=>iso?new Date(iso+'T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short',day:'numeric'}):'';
 const monthLabel=m=>m?new Date(m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'long',year:'numeric'}):'';
 const how=p=>{const k=p.payment?.kind,parts=[];
  if(k==='card')parts.push(T('Card','כרטיס')+(p.payment.account?' ··'+p.payment.account:''));else if(k==='standing')parts.push(T('Standing order','הוראת קבע'));else if(k==='bank')parts.push(T('Bank debit','חיוב בבנק'));else if(k==='policy')parts.push(T('From the policy','לפי הפוליסה'));else if(k==='cash')parts.push(T('Cash','מזומן'));else if(k==='manual')parts.push(T('Recorded by hand','נרשם ידנית'));else if(p.manual)parts.push(T('Added by hand','נוסף ידנית'));
  if(p.period===2)parts.push(T('every 2 months','כל חודשיים'));else if(p.period>2)parts.push(T('every '+p.period+' months','כל '+p.period+' חודשים'));
  if(p.installmentsLeft!=null)parts.push(T(p.installmentsLeft+' payments left','נותרו '+p.installmentsLeft+' תשלומים'));
  return parts.join(' · ')};
 const areaOf=p=>p.types?.length&&p.area==='insurance'?p.types.map(t=>insuranceTypeLabel(t,a.lang)).join(', '):area(p.area);
 const highlights=useMemo(()=>providerHighlights(summary,{today:a.today}),[summary,a.today]);
 const B=x=><bdi>{he?x.he:x.en}</bdi>,list=names=>names.map((x,i)=><React.Fragment key={i}>{i?', ':''}{B(x)}</React.Fragment>);
 const sentence=h=>{
  if(h.kind==='up')return he?<>{B(h.name)} עלה ב־<bdi dir="ltr">{h.percent}%</bdi> מהחיוב הקודם.</>:<>{B(h.name)} went up {h.percent}% since the last bill.</>;
  if(h.kind==='same')return he?<>{h.names.length} ספקים ל{area(h.area)}: {list(h.names)} ({money(h.monthly)} לחודש ביחד).</>:<>{h.names.length} providers for {area(h.area).toLowerCase()}: {list(h.names)} ({money(h.monthly)} a month together).</>;
  if(h.kind==='ending')return he?<>{B(h.name)}: נותרו {h.left} תשלומים.</>:<>{B(h.name)}: {h.left} payments left.</>;
  if(h.kind==='renewal')return he?<>הביטוח ב{B(h.name)} מסתיים ב־{day(h.date)}.</>:<>{B(h.name)} insurance ends on {day(h.date)}.</>;
  if(h.kind==='new')return he?<>חדש: {B(h.name)}, {money(h.monthly)} לחודש.</>:<>New: {B(h.name)}, {money(h.monthly)} a month.</>;
  return null};
 // One provider tile (by area, and inside an opened company).
 const tileOf=p=><button type="button" key={p.key} className="who-pay-tile" aria-label={name(p)+', '+areaOf(p)+', '+(p.monthly==null?T('amount unknown','סכום לא ידוע'):money(p.monthly)+' '+T('a month','לחודש'))} onClick={()=>setOpen({key:p.key})}>
    <Icon code={PROVIDER_AREA[p.area]?.icon} size={44}/>
    <small className="who-pay-area">{areaOf(p)}</small>
    <strong><bdi>{name(p)}</bdi></strong>
    <span className="who-pay-amount">{p.monthly==null?<span className="who-pay-unknown">{T('Amount unknown','סכום לא ידוע')}</span>:<>{money(p.monthly)}<span>{T('a month','לחודש')}</span></>}{p.changePercent>=5&&<em className="who-pay-up" aria-label={T('Up '+p.changePercent+'%','עלייה של '+p.changePercent+'%')}><TrendUp size={14} weight="bold"/><bdi dir="ltr">{p.changePercent}%</bdi></em>}</span>
    <span className="who-pay-how">{how(p)}</span>
    {p.memberIds.length>0&&<span className="who-pay-people" aria-label={T('For ','עבור ')+p.memberIds.map(id=>a.name(id)).join(', ')}>{p.memberIds.slice(0,3).map(id=><Avatar key={id} decorative who={id} size={26}/>)}</span>}
   </button>;
 const past=!!summary.past,ai=past?null:store.ai,aiCurrent=ai&&ai.fingerprint===providerFingerprint(summary),points=ai?.points?.length&&aiCurrent?ai.points:null;
 const extra=[...summary.hidden,...summary.ended];
 const loading=store.loading&&!summary.count;

 return <div className="who-pay">
  {store.error&&<p role="alert" className="save-error">{store.error}</p>}
  {store.failed&&<p role="alert" className="save-error">{T('Your saved changes to this list could not be loaded. The list below is built from your records.','לא ניתן לטעון את השינויים ששמרתם ברשימה. הרשימה מטה נבנתה מהרשומות.')}</p>}
  <section className="who-pay-card who-pay-head" aria-label={T('Monthly total','סך לחודש')}>
   <div className="who-pay-total"><small>{past?T('In '+monthLabel(summary.month)+', about','ב'+monthLabel(summary.month)+', בערך'):T('Every month, about','בכל חודש, בערך')}</small><strong>{money(summary.total)}</strong><span>{summary.count===1?T('to 1 provider','לספק אחד'):T('to '+summary.count+' providers','ל־'+summary.count+' ספקים')}{by==='company'&&summary.companies.length!==summary.count?' · '+T(summary.companies.length+' companies',summary.companies.length+' חברות'):''}{summary.unknownAmounts?' · '+T(summary.unknownAmounts+' without a known amount',summary.unknownAmounts+' בלי סכום ידוע'):''}</span></div>
   <div className="who-pay-split">
    {summary.total>0&&<div className="who-pay-bar" aria-hidden="true">{summary.groups.filter(g=>g.monthly>0).map(g=><i key={g.id} style={{flexGrow:g.monthly,background:g.color}}/>)}</div>}
    <ul className="who-pay-legend">{summary.groups.map(g=><li key={g.id}><i style={{background:g.color}}/>{group(g)} <b>{money(g.monthly)}</b></li>)}</ul>
   </div>
   <button type="button" className="button secondary who-pay-add" onClick={()=>setOpen({add:true})}><Plus size={20}/>{T('Add provider','הוספת ספק')}</button>
  </section>

  {summary.count>0&&<section className="who-pay-note" aria-label={T('What stands out','מה בולט')}>
   <span className="who-pay-note-icon" aria-hidden="true">{points?<Sparkle size={22}/>:<Info size={22}/>}</span>
   <div>
    <h3>{T('What stands out','מה בולט')}</h3>
    {points?<ul>{points.map((x,i)=><li key={i} dir="auto">{x}</li>)}</ul>:highlights.length?<ul>{highlights.map((h,i)=><li key={i}>{sentence(h)}</li>)}</ul>:<p>{T('Nothing unusual: no price rises or overlapping providers in your records.','שום דבר חריג: אין עליות מחיר או ספקים כפולים ברשומות.')}</p>}
    <small className="who-pay-note-source">{points?T('AI summary, updated once a month · ','סיכום AI, מתעדכן פעם בחודש · ')+day(ai.generatedAt.slice(0,10)):past?T('From your statements up to '+monthLabel(summary.month)+'.','לפי דפי החשבון עד '+monthLabel(summary.month)+'.'):ai&&!aiCurrent?T('Your providers changed since the last AI summary.','הספקים השתנו מאז סיכום ה־AI האחרון.'):T('From your statements and records.','לפי דפי החשבון והרשומות.')}</small>
    {store.aiError&&<p role="alert" className="who-pay-ai-error">{store.aiError}</p>}
   </div>
   {!past&&a.features?.on('ai')!==false&&<button type="button" className="control-button who-pay-ai" disabled={store.aiBusy} onClick={store.summarize}>{points?<ArrowsClockwise size={18}/>:<Sparkle size={18}/>}{store.aiBusy?T('Summarizing…','מסכמים…'):points?T('Refresh','רענון'):T('Summarize with AI','סיכום עם AI')}</button>}
  </section>}

  {loading?<p className="muted">{T('Loading…','טוענים…')}</p>:!summary.count&&<p className="muted who-pay-empty">{T('Import at least two months of statements, or connect RiseUp, to see who you pay. You can also add a provider by hand.','ייבאו לפחות חודשיים של דפי חשבון, או חברו את RiseUp, כדי לראות למי משלמים. אפשר גם להוסיף ספק ידנית.')}</p>}

  {summary.count>0&&<div className="who-pay-by"><Tabs variant="view" label={T('Group providers','קיבוץ הספקים')} value={by} onChange={setBy} items={[['area',T('By area','לפי תחום'),null],['company',T('By company','לפי חברה'),null,summary.companies.length]]}/></div>}

  {by==='company'&&summary.count>0&&<section className="who-pay-group" aria-label={T('By company','לפי חברה')}>
   <div className="who-pay-companies">{summary.companies.map(c=>c.providers.length===1?(p=>
   // A company with one service: one compact card (its name, what it is for, how it is paid), the whole card opens it.
   <article key={c.id} className="who-pay-company single"><button type="button" className="who-pay-service" aria-label={name(p)+', '+areaOf(p)+', '+(p.monthly==null?T('amount unknown','סכום לא ידוע'):money(p.monthly)+' '+T('a month','לחודש'))} onClick={()=>setOpen({key:p.key})}>
    <Icon code={PROVIDER_AREA[p.area]?.icon} size={40}/>
    <span className="who-pay-service-text"><strong><bdi>{name(p)}</bdi></strong><small>{areaOf(p)}{how(p)?' · '+how(p):''}</small></span>
    <span className="who-pay-service-amount">{p.monthly==null?T('Amount unknown','סכום לא ידוע'):money(p.monthly)}{p.changePercent>=5&&<em className="who-pay-up" aria-label={T('Up '+p.changePercent+'%','עלייה של '+p.changePercent+'%')}><TrendUp size={14} weight="bold"/><bdi dir="ltr">{p.changePercent}%</bdi></em>}</span>
   </button></article>)(c.providers[0]):(open=><article key={c.id} className={'who-pay-company multi'+(open?' open':'')}>
    {/* A company with several services: the whole header opens and closes it; closed, its services show as chips under
        the name ("Mobile ₪149", "Internet ₪99"); open, the card takes the full row and shows them as the same tiles as
        By area, inside a tinted panel under the company. */}
    <button type="button" className="who-pay-company-head" aria-expanded={open} aria-controls={'who-pay-co-'+c.id} onClick={()=>flip(openCompanies,setOpenCompanies,'bayit-who-pay-open-companies',c.id)}>
     <span className="who-pay-company-mark" aria-hidden="true"><Buildings size={26} weight="duotone"/></span>
     <span className="who-pay-company-text"><small>{T('Company · '+c.providers.length+' services','חברה · '+c.providers.length+' שירותים')}</small><strong><bdi>{he?c.name.he:c.name.en}</bdi></strong></span>
     <span className="who-pay-company-total"><b>{money(c.monthly)}</b> <small>{T('a month, together','לחודש, ביחד')}</small></span>
     <CaretDown size={22} weight="bold" className="who-pay-caret" aria-hidden="true"/>
     {!open&&<span className="who-pay-chips">{c.providers.map(p=><span key={p.key} className="who-pay-chip"><Icon code={PROVIDER_AREA[p.area]?.icon} size={18}/>{areaOf(p)} <b>{p.monthly==null?'—':money(p.monthly)}</b></span>)}</span>}
    </button>
    <div className="who-pay-company-body" id={'who-pay-co-'+c.id} hidden={!open}><div className="who-pay-tiles">{c.providers.map(tileOf)}</div></div>
   </article>)(openCompanies.has(c.id)))}</div>
  </section>}

  {by==='area'&&summary.groups.map(g=><section key={g.id} className="who-pay-group" aria-labelledby={'who-pay-'+g.id}>
   <div className="who-pay-group-head"><h2 id={'who-pay-'+g.id}><button type="button" className="who-pay-toggle" aria-expanded={!closedGroups.has(g.id)} aria-controls={'who-pay-tiles-'+g.id} onClick={()=>flip(closedGroups,setClosedGroups,'bayit-who-pay-closed-areas',g.id)}><CaretDown size={20} weight="bold" className="who-pay-caret" aria-hidden="true"/>{group(g)}</button></h2><b>{money(g.monthly)} {T('a month','לחודש')}</b>{closedGroups.has(g.id)&&<small className="who-pay-closed-note">{T(g.providers.length===1?'1 provider':g.providers.length+' providers',g.providers.length===1?'ספק אחד':g.providers.length+' ספקים')}</small>}</div>
   <div className="who-pay-tiles" id={'who-pay-tiles-'+g.id} hidden={closedGroups.has(g.id)}>{g.providers.map(tileOf)}</div>
  </section>)}

  {extra.length>0&&<details className="who-pay-more"><summary>{T('Hidden and stopped','מוסתרים והופסקו')} <em className="nav-count">{extra.length}</em></summary>
   <ul>{extra.map(p=><li key={p.key}><Icon code={PROVIDER_AREA[p.area]?.icon} size={30}/><span><strong><bdi>{name(p)}</bdi></strong><small>{p.hidden?T('Hidden','מוסתר'):T('No charge since ','אין חיוב מאז ')+monthLabel(p.lastSeen)}</small></span><button type="button" className="control-button" onClick={()=>setOpen({key:p.key})}>{T('Details','פרטים')}</button></li>)}</ul>
  </details>}

  {open&&<ProviderWindow a={a} ui={ui} summary={summary} store={store} scope={scope} target={open} money={money} name={name} how={how} day={day} monthLabel={monthLabel} onTransactions={onTransactions} onClose={()=>setOpen(null)}/>}
 </div>;
}

function ProviderWindow({a,ui:{Select,Avatar,Button},summary,store,target,money,name,how,day,monthLabel,onTransactions,onClose}){
 const T=a.T,he=a.lang==='he',all=[...summary.providers,...summary.hidden,...summary.ended],p=target.add?null:all.find(x=>x.key===target.key);
 const own=p?store.settings.providers[p.key]||{}:{},manual=target.add?{id:crypto.randomUUID().slice(0,8),name:'',area:'other',amount:0,period:1,how:'card',nextDate:'',memberIds:[],note:''}:p?.manual||null;
 const [draft,setDraft]=useState(()=>({name:p?(own.name||''):'',area:own.area||p?.area||'other',memberIds:p?[...p.memberIds]:[],hidden:!!own.hidden||!!p?.hidden,mergeInto:'',...(manual?{amount:manual.amount?String(manual.amount/100):'',period:manual.period,how:manual.how,nextDate:manual.nextDate||'',note:manual.note||'',manualName:manual.name}:{})}));
 const [saving,setSaving]=useState(false),[allMonths,setAllMonths]=useState(false);
 if(!target.add&&!p)return null;
 const set=patch=>setDraft({...draft,...patch});
 const others=all.filter(x=>p&&x.key!==p.key&&!x.manual);
 const members=a.members;
 const submit=async e=>{
  e.preventDefault();if(saving)return;
  const settings=structuredClone(store.settings);settings.providers??={};settings.added??=[];
  if(manual){
   const amount=Math.round(Number(draft.amount||0)*100);if(!draft.manualName.trim()||!Number.isFinite(amount)||amount<0)return;
   const value={id:manual.id,name:draft.manualName.trim(),area:draft.area,amount,period:Number(draft.period)||1,how:draft.how,nextDate:draft.nextDate||'',memberIds:draft.memberIds,note:draft.note.trim()};
   const at=settings.added.findIndex(x=>x.id===manual.id);if(at<0)settings.added.push(value);else settings.added[at]=value;
   const key='add:'+manual.id;if(draft.hidden)settings.providers[key]={hidden:true};else delete settings.providers[key];
  }else{
   const base=p.key,next={},auto=p.autoName?(he?p.autoName.he:p.autoName.en):(he?p.name.he:p.name.en);
   if(draft.name.trim()&&draft.name.trim()!==auto)next.name=draft.name.trim();
   if(draft.area!==p.area||own.area)next.area=draft.area;
   if(JSON.stringify([...draft.memberIds].sort())!==JSON.stringify([...p.memberIds].sort())||own.memberIds)next.memberIds=draft.memberIds;
   if(draft.hidden)next.hidden=true;
   if(draft.mergeInto)next.mergeInto=draft.mergeInto;
   if(Object.keys(next).length)settings.providers[base]=next;else delete settings.providers[base];
  }
  setSaving(true);const ok=await store.save(settings);setSaving(false);if(ok)onClose();
 };
 const remove=async()=>{if(!manual||!window.confirm(T('Remove this provider from the list?','להסיר את הספק מהרשימה?')))return;const settings=structuredClone(store.settings);settings.added=(settings.added||[]).filter(x=>x.id!==manual.id);delete settings.providers['add:'+manual.id];setSaving(true);const ok=await store.save(settings);setSaving(false);if(ok)onClose()};
 const unmerge=async key=>{const settings=structuredClone(store.settings);if(settings.providers[key]){delete settings.providers[key].mergeInto;if(!Object.keys(settings.providers[key]).length)delete settings.providers[key]}setSaving(true);const ok=await store.save(settings);setSaving(false);if(ok)onClose()};
 const title=target.add?T('Add provider','הוספת ספק'):name(p);
 const areaSelect=<label>{T('What it’s for','עבור מה')}<Select aria-label={T('What it’s for','עבור מה')} value={draft.area} onChange={e=>set({area:e.target.value})}>{PROVIDER_GROUPS.flatMap(g=>PROVIDER_AREAS.filter(x=>x.group===g.id).map(x=><option key={x.id} value={x.id}>{he?x.he:x.en}<small className="who-pay-option-group"> · {he?g.he:g.en}</small></option>))}</Select><small className="muted">{T('Moves the provider to that heading. Your statements do not change.','מעביר את הספק לכותרת הזו. דפי החשבון לא משתנים.')}</small></label>;
 const people=<div className="field-group"><span className="field-title">{T('Who it’s for (optional)','עבור מי (לא חובה)')}</span><div className="insurance-people who-pay-people-pick" role="group" aria-label={T('Who it’s for','עבור מי')}>{members.map(m=><PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={draft.memberIds.includes(m.id)} onClick={()=>set({memberIds:draft.memberIds.includes(m.id)?draft.memberIds.filter(id=>id!==m.id):[...draft.memberIds,m.id]})}/>)}</div></div>;
 return <HouseholdForm a={a} wide className="who-pay-window" title={title} onClose={()=>!saving&&onClose()} onSubmit={submit} saving={saving} error={store.error}
  danger={manual&&!target.add&&<Button secondary disabled={saving} icon={Trash} onClick={remove}>{T('Remove','הסרה')}</Button>}
  actions={<Button disabled={saving} type="submit" icon={Check}>{saving?T('Saving…','שומרים…'):T('Save','שמירה')}</Button>}>
  <div className="form-columns"><div className="form-column">
   <FormSection T={T} icon={ClipboardText} tone="blue" title={T('Details','פרטים')}>
    {manual?<label>{T('Provider name','שם הספק')}<input required autoFocus value={draft.manualName} maxLength={60} onChange={e=>set({manualName:e.target.value})} placeholder={T('For example: Building committee','לדוגמה: ועד בית')}/></label>
     :<label>{T('Name','שם')}<input value={draft.name} maxLength={60} placeholder={p.autoName?(he?p.autoName.he:p.autoName.en):(he?p.name.he:p.name.en)} onChange={e=>set({name:e.target.value})}/><small className="muted">{T('Leave empty to use the name found in your statements.','השאירו ריק כדי להשתמש בשם שנמצא בדפי החשבון.')}</small></label>}
    {areaSelect}
    {people}
   </FormSection>
   {manual&&<FormSection T={T} icon={Receipt} tone="peach" title={T('Payment','תשלום')}>
    <div className="two-fields"><label>{T('Amount (₪)','סכום (₪)')}<input type="number" min="0" max="10000000" step="0.01" value={draft.amount} onChange={e=>set({amount:e.target.value})}/></label>
     <label>{T('Paid','משולם')}<Select aria-label={T('How often','באיזו תדירות')} value={String(draft.period)} onChange={e=>set({period:Number(e.target.value)})}>{PROVIDER_PERIODS.map(n=><option key={n} value={n}>{n===1?T('Every month','כל חודש'):n===12?T('Once a year','פעם בשנה'):T('Every '+n+' months','כל '+n+' חודשים')}</option>)}</Select></label></div>
    <div className="two-fields"><label>{T('How it’s paid','איך משלמים')}<Select aria-label={T('How it’s paid','איך משלמים')} value={draft.how} onChange={e=>set({how:e.target.value})}>{PAYMENT_KINDS.filter(k=>k!=='policy'&&k!=='manual').map(k=><option key={k} value={k}>{({card:T('Card','כרטיס'),standing:T('Standing order','הוראת קבע'),bank:T('Bank transfer','העברה בנקאית'),cash:T('Cash','מזומן'),other:T('Other','אחר')})[k]}</option>)}</Select></label>
     <label>{T('Next payment (optional)','התשלום הבא (לא חובה)')}<DateField value={draft.nextDate} onChange={e=>set({nextDate:e.target.value})}/></label></div>
    <label>{T('Notes (optional)','הערות (לא חובה)')}<textarea maxLength={200} value={draft.note} onChange={e=>set({note:e.target.value})}/></label>
   </FormSection>}
  </div><div className="form-column">
   {p&&!manual&&<FormSection T={T} icon={Receipt} tone="peach" title={T('Payments','תשלומים')}>
    <dl className="who-pay-facts">
     <div><dt>{T('A month','לחודש')}</dt><dd>{money(p.monthly)}</dd></div>
     <div><dt>{T('How it’s paid','איך משלמים')}</dt><dd>{how(p)||'—'}</dd></div>
     {p.next&&!summary.past&&<div><dt>{T('Next charge (expected)','החיוב הבא (צפוי)')}</dt><dd>{day(p.next)}</dd></div>}
     {p.changePercent!==0&&<div><dt>{T('Change since the last charge','שינוי מהחיוב הקודם')}</dt><dd><bdi dir="ltr">{p.changePercent>0?'+':''}{p.changePercent}%</bdi></dd></div>}
    </dl>
    {p.entries.length>0&&<ul className="who-pay-lines">{p.entries.map(e=><li key={e.key}><strong dir="auto">{(e.names?.length?e.names:[e.description]).join(' · ')}</strong><small>{money(e.typical,{fraction:2})} · {e.period===2?T('every 2 months','כל חודשיים'):T('monthly','חודשי')} · {e.stale?T('last seen ','נראה לאחרונה ')+monthLabel(e.months.at(-1)):T('last ','אחרון ')+monthLabel(e.months.at(-1))}</small></li>)}</ul>}
    {p.policies.length>0&&<ul className="who-pay-lines">{p.policies.map(x=><li key={x.id}><strong>{insuranceTypeLabel(x.type,a.lang)} <ShieldCheck size={16}/></strong><small>{x.monthly==null?T('Premium unknown','פרמיה לא ידועה'):money(x.monthly)+' '+T('a month','לחודש')}{x.endDate?' · '+T('ends ','מסתיים ')+day(x.endDate):''} · <button type="button" className="text-link" onClick={()=>a.go('household/insurance?policy='+x.id)}>{T('Open policy','פתיחת הפוליסה')}</button></small></li>)}</ul>}
    {p.merged?.length>0&&<div className="who-pay-merged"><span className="field-title">{T('Combined here','מאוחדים כאן')}</span>{p.merged.map(m=><span key={m.key} className="who-pay-merged-row"><span dir="auto">{he?m.name.he:m.name.en}</span><button type="button" className="text-link" disabled={saving} onClick={()=>unmerge(m.key)}>{T('Separate','הפרדה')}</button></span>)}</div>}
   </FormSection>}
   {p&&p.history?.length>0&&<FormSection T={T} icon={ClockCounterClockwise} tone="green" title={T('Payment history','היסטוריית תשלומים')}>
    <p className="who-pay-history-sum">{T(p.history.length===1?'1 month':p.history.length+' months',p.history.length===1?'חודש אחד':p.history.length+' חודשים')} · {T('paid ','שולמו ')}<strong>{money(p.paid,{fraction:2})}</strong></p>
    <ol className="who-pay-history">{(allMonths?p.history:p.history.slice(0,6)).map(m=><li key={m.month}><span className="who-pay-history-month">{monthLabel(m.month)}</span><b>{money(m.amount,{fraction:2})}</b>
     {m.payments.length>1&&<ul>{m.payments.map((x,i)=><li key={x.id||i}><span>{day(x.date)}</span><bdi>{x.description}</bdi><span>{money(x.amount,{fraction:2})}</span></li>)}</ul>}
     {m.payments.length===1&&<small>{day(m.payments[0].date)} · <bdi>{m.payments[0].description}</bdi>{m.payments[0].installmentOf?' · '+T('payment '+m.payments[0].installmentN+' of '+m.payments[0].installmentOf,'תשלום '+m.payments[0].installmentN+' מתוך '+m.payments[0].installmentOf):''}</small>}</li>)}</ol>
    {p.history.length>6&&<button type="button" className="control-button" onClick={()=>setAllMonths(!allMonths)}>{allMonths?T('Show fewer months','פחות חודשים'):T('Show all '+p.history.length+' months','כל '+p.history.length+' החודשים')}</button>}
    {onTransactions&&p.history.some(m=>m.payments.some(x=>x.id))&&<button type="button" className="button secondary who-pay-to-ledger" onClick={()=>onTransactions(p)}><ListMagnifyingGlass size={20}/>{T('Show in Transactions','הצגה בתנועות')}</button>}
   </FormSection>}
   <FormSection T={T} icon={EyeSlash} tone="lilac" title={T('Combine or hide','איחוד או הסתרה')}>
    {p&&!manual&&others.length>0&&<label>{T('Same provider as','אותו ספק כמו')}<Select aria-label={T('Combine with another provider','איחוד עם ספק אחר')} value={draft.mergeInto} onChange={e=>set({mergeInto:e.target.value})}><option value="">{T('Not combined','לא מאוחד')}</option>{others.map(o=><option key={o.key} value={o.key}>{name(o)}</option>)}</Select><small className="muted">{T('Use this when the same company appears under two names.','לשימוש כשאותה חברה מופיעה בשני שמות.')}</small></label>}
    <label className="who-pay-check"><input type="checkbox" checked={draft.hidden} onChange={e=>set({hidden:e.target.checked})}/>{T('Hide from Who we pay','הסתרה מ"למי משלמים"')}</label>
    <small className="muted">{T('Hidden providers are not counted in the monthly total. Your statements and transactions do not change.','ספקים מוסתרים לא נספרים בסך החודשי. דפי החשבון והתנועות לא משתנים.')}</small>
   </FormSection>
  </div></div>
 </HouseholdForm>;
}
