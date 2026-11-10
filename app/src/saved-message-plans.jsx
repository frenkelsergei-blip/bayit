import React,{useEffect,useId,useRef,useState} from 'react';
import {CalendarDots,CaretDown,ClipboardText,LockSimple} from '@phosphor-icons/react';
import {ReminderSummary} from './item-reminder';
import {completionState} from './domain';
import {AssignedPeople} from './assigned-people';
import {taskMemberIds} from '../../shared/task-assignment.mjs';
import {PendingSync} from './offline-ui';
import './saved-message-plans.css';

const dateLabel = (date,lang) => new Date(date+'T12:00:00Z').toLocaleDateString(
 lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}
);

export function SavedMessagePlans({a,Avatar}) {
 const {T} = a;
 const planId = new URLSearchParams(a.route.split('?')[1]).get('plan');
 const [expanded,setExpanded] = useState(false);
 const id = useId();
 const heading = useRef(null), card = useRef(null);
 // An opened plan (after saving, or from the list) comes to the top of the visible page, below a fixed header or top menu.
 useEffect(()=>{
  if (!planId) return;
  card.current?.scrollIntoView({block:'start'});
  heading.current?.focus({preventScroll:true});
 },[planId]);
 // Features registry: tasks show while Tasks is on, events while Calendar is on; a plan with neither is hidden (its data stays).
 const on = id => a.features ? a.features.on(id) : true;
 const shown = {tasks:on('tasks'),events:on('calendar')};
 const receipts = Object.values(a.data.aiOperations||{})
  .filter(receipt=>receipt?.ownerId===a.user && receipt.status==='intake' && Array.isArray(receipt.items)
   && (!receipt.items.length || receipt.items.some(reference=>shown[reference?.collection])))
  .sort((x,y)=>String(y.appliedAt||'').localeCompare(String(x.appliedAt||'')));
 if (!shown.tasks && !shown.events) return null;
 if (!receipts.length && !planId) return null;
 const records = {
  tasks:new Map(shown.tasks ? a.visible(a.data.tasks).map(record=>[record.id,record]) : []),
  events:new Map(shown.events ? a.visible(a.data.events).map(record=>[record.id,record]) : [])
 };
 const entries = receipt => receipt.items.flatMap(reference=>{
  const {collection,id} = reference||{};
  const record = (collection==='tasks'||collection==='events') ? records[collection].get(id) : null;
  return record?.ownerId===receipt.ownerId ? [{record,collection}] : [];
 });
 const planTitle = (receipt,items) => (typeof receipt.title==='string' && receipt.title) || (items[0] && a.text(items[0].record)) || T('Saved plan','תוכנית שמורה');
 const selected = receipts.find(receipt=>receipt.id===planId);
 const list = () => {setExpanded(true);a.go('today');};
 const openRecord = ({record,collection}) => {
  const query = new URLSearchParams();
  if (record.date) query.set('date',record.date);
  query.set(collection==='events'?'event':'task',record.id);
  a.go((collection==='events'?'calendar':'tasks')+'?'+query);
 };
 if (planId) {
  const items = selected ? entries(selected) : [];
  return <section ref={card} className="saved-message-plans" aria-labelledby={id}>
   <header className="saved-plan-header">
    <div><span><LockSimple size={16} aria-hidden="true"/>{T('My plans','התוכניות שלי')}</span>
     <h2 id={id} ref={heading} tabIndex={-1} dir="auto">{selected?planTitle(selected,items):T('Saved plan','תוכנית שמורה')}</h2>
    </div>
    <button type="button" className="button secondary" onClick={list}>{T('Back to plans','חזרה לתוכניות')}</button>
   </header>
   {!selected ? <p role="status">{T('This plan is unavailable or still syncing.','התוכנית אינה זמינה או עדיין מסתנכרנת.')}</p>
    : items.length ? <ol className="saved-plan-items">{items.map(entry=>{
     const {record,collection} = entry;
     const event = collection==='events';
     const Icon = event ? CalendarDots : ClipboardText;
     const done = !event && completionState(record,record.date||a.today)==='done';
     return <li key={collection+record.id}>
      <Icon size={21} aria-hidden="true"/>
      <div>
       <button type="button" className="text-link" onClick={()=>openRecord(entry)} dir="auto">{a.text(record)}</button>
       <small>{event ? T('Event','אירוע') : T('Task','משימה')}{done&&(' · '+T('Done','הושלמה'))}
        {record.date&&<> · {dateLabel(record.date,a.lang)}{record.time&&<> · <bdi>{record.time}</bdi></>}</>}
        <PendingSync collection={collection} id={record.id} T={T}/></small>
       <AssignedPeople ids={event?record.memberIds:taskMemberIds(record)} Avatar={Avatar} name={a.name} member={a.member} size={32}
        label={T('Assigned to','משויך ל־')} showNames/>
       {record.date&&<ReminderSummary a={a} record={record} category={collection} defaultText={T("Each recipient’s default","ברירת המחדל של כל מקבל")}/>}
      </div>
     </li>;
    })}</ol> : <p>{T('There are no available items in this plan.','אין פריטים זמינים בתוכנית הזו.')}</p>}
  </section>;
 }
 return <section className="saved-message-plans" aria-label={T('My plans','התוכניות שלי')}>
  <button type="button" className="saved-plans-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>
   <ClipboardText size={22} aria-hidden="true"/><strong>{T('My plans','התוכניות שלי')}</strong><span>{receipts.length}</span><CaretDown size={18} aria-hidden="true"/>
  </button>
  <div id={id} hidden={!expanded}>{expanded&&<ul className="saved-plan-list">{receipts.map(receipt=>{
   const items = entries(receipt);
   return <li key={receipt.id}><button type="button" className="button secondary" onClick={()=>a.go('today?plan='+encodeURIComponent(receipt.id))}>
    <strong dir="auto">{planTitle(receipt,items)}</strong><small>{items.length} {T(items.length===1?'item':'items',items.length===1?'פריט':'פריטים')}</small>
   </button></li>;
  })}</ul>}</div>
 </section>;
}
