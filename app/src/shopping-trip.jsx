// Planning a shop: when and who goes shopping for a list. Creates (or updates) one linked task that appears in Tasks and
// Today; its checkbox opens the list, and it is done when the shop is finished (the shopping flow, 2026-11-12). One word
// for it everywhere: "shop" / "קנייה" (not trip, not task).
import {PersonChip} from './person-chip';
import React,{useState} from 'react';
import {ShoppingCart,X,Trash,CalendarCheck,CalendarBlank,Users} from '@phosphor-icons/react';
import {FormSection} from './form-section.jsx';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {DateField} from './date-field';
import {fxQuiet} from './motion-fx';
import {TimeField} from './time-field';
import {canAccessList,applyShoppingTripAudience} from '../../shared/task-lists.mjs';
import {completionState} from './domain';

// Quick choices in the window (concept C, round 2): today, tomorrow, the coming Friday, in a week.
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const quickDays=today=>{const dow=new Date(today+'T12:00:00Z').getUTCDay(),toFriday=(5-dow+7)%7||7;return [[today,'Today','היום'],[shift(today,1),'Tomorrow','מחר'],...(toFriday>1?[[shift(today,toFriday),'Friday','יום שישי']]:[]),[shift(today,7),'In a week','בעוד שבוע']]};
export const tripFor=(data,listId)=>(data.tasks||[]).find(t=>t.shoppingListId===listId&&t.kind==='shopping-trip'&&completionState(t,t.date)!=='done');

export function ShoppingTripControl({app:a,list,anchor,className='text-link',ui:{Button,Avatar},text}){
 const [open,setOpen]=useState(false),trip=tripFor(a.data,list.id),locale=a.lang==='he'?'he-IL':'en-US';
 const people=a.members.filter(m=>canAccessList(list,m.id)&&(a.member(a.user).role==='parent'||m.id===a.user));
 const [date,setDate]=useState(trip?.date||anchor),[time,setTime]=useState(trip?.time||'17:30'),[who,setWho]=useState(trip?.memberId||a.user);
 const name=a.lang==='he'?list.he||list.name:list.name;
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,{date,time,who},{enabled:open,key:open?list.id:null});
 const save=async e=>{e.preventDefault();if(!date)return;await commit(()=>{fxQuiet.on=true;try{return a.update(d=>{const existing=d.tasks.find(t=>t.id===trip?.id),l=d.shoppingLists.find(x=>x.id===list.id);const rec=existing||{id:crypto.randomUUID(),ownerId:a.user,kind:'shopping-trip',icon:'1F6D2',repeat:'once',done:false,xp:0,allowedIds:[]};Object.assign(rec,{title:a.T('Shopping: ','קניות: ')+name,he:'קניות: '+name,date,time,memberId:who});applyShoppingTripAudience(rec,l);if(!existing)d.tasks.push(rec)})}finally{fxQuiet.on=false}},()=>{a.notify(a.T('Shop planned. It is in Tasks and Today.','הקנייה תוכננה. היא מופיעה במשימות ובהיום.'));setOpen(false)})};
 const remove=()=>commit(()=>a.update(d=>{d.tasks=d.tasks.filter(t=>t.id!==trip.id)}),()=>setOpen(false));
 const label=trip?new Date(trip.date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'})+(trip.time?' · '+trip.time:'')+' · '+a.name(trip.memberId):a.T('Plan the shop','תכנון קנייה');
 return <>
  <button type="button" className={className+' shopping-trip-link'+(trip?' planned':'')} title={label} aria-label={label} onClick={()=>setOpen(true)}>{!text&&<CalendarCheck size={20}/>}<span>{text||label}</span></button>
  {open&&<div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&guard(()=>setOpen(false))}><form className="tasks-sheet shopping-trip-sheet" role="dialog" aria-modal="true" aria-label={a.T('Plan the shop','תכנון קנייה')} onSubmit={save}>
   <header><h2>{trip?a.T('The planned shop','הקנייה המתוכננת'):a.T('Plan the shop','תכנון קנייה')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>!saving&&guard(()=>setOpen(false))}><X size={20}/></button></header>
   <div className="tasks-sheet-body">
    <FormSection T={a.T} icon={CalendarBlank} tone="blue" title={a.T('When','מתי')}>
     <p className="tasks-sheet-hint shop-trip-hint"><ShoppingCart size={18}/><span>{a.T('For the list','לרשימה')} <strong>{name}</strong>. {a.T('It appears in Tasks and Today, and is done when you finish the shop.','היא תופיע במשימות ובהיום, ותסתיים כשמסיימים את הקנייה.')}</span></p>
     <div className="ss-quickdays" role="group" aria-label={a.T('Quick dates','תאריכים מהירים')}>{quickDays(anchor).map(([d,en,he])=><button type="button" key={en} className={'ss-quickday'+(date===d?' on':'')} aria-pressed={date===d} onClick={()=>setDate(d)}>{a.T(en,he)}</button>)}</div>
     <div className="two-fields date-time-fields"><label>{a.T('Date','תאריך')}<DateField required value={date} onChange={e=>setDate(e.target.value)}/></label><label>{a.T('Time','שעה')}<TimeField value={time} onChange={e=>setTime(e.target.value)}/></label></div>
    </FormSection>
    <FormSection T={a.T} icon={Users} tone="yellow" title={a.T('Who is going','מי הולך')}><div className="tasks-sheet-people" role="radiogroup" aria-label={a.T('Who is going','מי הולך')}>{people.map(m=><PersonChip key={m.id} role="radio" who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={who===m.id} onClick={()=>setWho(m.id)}/>)}</div></FormSection>
    {saveError&&<p className="save-error" role="alert">{saveError}</p>}
   </div>
   <div className="tasks-sheet-actions"><Button secondary onClick={()=>!saving&&guard(()=>setOpen(false))}>{a.T('Cancel','ביטול')}</Button><Button disabled={saving} type="submit">{trip?a.T('Save','שמירה'):a.T('Plan the shop','תכנון הקנייה')}</Button>{trip&&<Button secondary icon={Trash} onClick={remove}>{a.T('Remove the plan','הסרת התכנון')}</Button>}</div>
  </form></div>}
 </>;
}
