// Shopping trip: plan when and who goes shopping for a list. Creates (or updates) one linked task that appears in
// Tasks and Today, shows the bag's progress, and completes when every item on the list is bought.
import React,{useState} from 'react';
import {ShoppingCart,X,Trash,CalendarCheck} from '@phosphor-icons/react';
import {DateField} from './date-field';
import {canAccessList,applyShoppingTripAudience} from '../../shared/task-lists.mjs';
import {completionState} from './domain';

export const tripFor=(data,listId)=>(data.tasks||[]).find(t=>t.shoppingListId===listId&&t.kind==='shopping-trip'&&completionState(t,t.date)!=='done');

export function ShoppingTripControl({app:a,list,anchor,ui:{Button,Avatar}}){
 const [open,setOpen]=useState(false),trip=tripFor(a.data,list.id),locale=a.lang==='he'?'he-IL':'en-US';
 const people=a.members.filter(m=>canAccessList(list,m.id)&&(a.member(a.user).role==='parent'||m.id===a.user));
 const [date,setDate]=useState(trip?.date||anchor),[time,setTime]=useState(trip?.time||'17:30'),[who,setWho]=useState(trip?.memberId||a.user);
 const name=a.lang==='he'?list.he||list.name:list.name;
 const save=e=>{e.preventDefault();if(!date)return;a.update(d=>{const existing=d.tasks.find(t=>t.id===trip?.id),l=d.shoppingLists.find(x=>x.id===list.id);const rec=existing||{id:crypto.randomUUID(),ownerId:a.user,kind:'shopping-trip',icon:'1F6D2',repeat:'once',done:false,xp:0,allowedIds:[]};Object.assign(rec,{title:a.T('Shopping: ','קניות: ')+name,he:'קניות: '+name,date,time,memberId:who});applyShoppingTripAudience(rec,l);if(!existing)d.tasks.push(rec)});a.notify(a.T('Trip planned. It is in Tasks and Today.','הקנייה תוכננה. היא מופיעה במשימות ובהיום.'));setOpen(false)};
 const remove=()=>{a.update(d=>{d.tasks=d.tasks.filter(t=>t.id!==trip.id)});setOpen(false)};
 const label=trip?new Date(trip.date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'})+(trip.time?' · '+trip.time:'')+' · '+a.name(trip.memberId):a.T('Plan a trip','תכנון קנייה');
 return <>
  <button type="button" className={'text-link shopping-trip-link'+(trip?' planned':'')} onClick={()=>setOpen(true)}><CalendarCheck size={18}/>{label}</button>
  {open&&<div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}><form className="tasks-sheet shopping-trip-sheet" role="dialog" aria-modal="true" aria-label={a.T('Plan a shopping trip','תכנון קנייה')} onSubmit={save}>
   <header><h2>{a.T('Plan a trip','תכנון קנייה')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>setOpen(false)}><X size={20}/></button></header>
   <p className="tasks-sheet-hint"><ShoppingCart size={18}/> {a.T('For the list','לרשימה')} <strong>{name}</strong>. {a.T('It appears in Tasks and Today and completes when everything is in the bag.','היא תופיע במשימות ובהיום ותושלם כשהכול בסל.')}</p>
   <div className="two-fields date-time-fields"><label>{a.T('Date','תאריך')}<DateField required value={date} onChange={e=>setDate(e.target.value)}/></label><label>{a.T('Time','שעה')}<input type="time" dir="ltr" value={time} onChange={e=>setTime(e.target.value)}/></label></div>
   <fieldset className="tasks-sheet-choices"><legend>{a.T('Who is going','מי הולך')}</legend><div className="tasks-sheet-people">{people.map(m=><button type="button" key={m.id} aria-pressed={who===m.id} className={'calendar-person '+m.color+(who===m.id?' chosen':'')} onClick={()=>setWho(m.id)}>{Avatar&&<Avatar who={m.id} size={36}/>}<span>{a.name(m.id)}</span></button>)}</div></fieldset>
   <div className="tasks-sheet-actions"><Button type="submit">{trip?a.T('Save trip','שמירת הקנייה'):a.T('Plan trip','תכנון הקנייה')}</Button>{trip&&<Button secondary icon={Trash} onClick={remove}>{a.T('Remove trip','הסרת הקנייה')}</Button>}</div>
  </form></div>}
 </>;
}
