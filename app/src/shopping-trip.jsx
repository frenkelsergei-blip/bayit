// Shopping trip: plan when and who goes shopping for a list. Creates (or updates) one linked task that appears in
// Tasks and Today, shows the bag's progress, and completes when every item on the list is bought.
import {PersonChip} from './person-chip';
import React,{useState} from 'react';
import {ShoppingCart,X,Trash,CalendarCheck} from '@phosphor-icons/react';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {DateField} from './date-field';
import {canAccessList,applyShoppingTripAudience} from '../../shared/task-lists.mjs';
import {completionState} from './domain';

export const tripFor=(data,listId)=>(data.tasks||[]).find(t=>t.shoppingListId===listId&&t.kind==='shopping-trip'&&completionState(t,t.date)!=='done');

export function ShoppingTripControl({app:a,list,anchor,className='text-link',ui:{Button,Avatar}}){
 const [open,setOpen]=useState(false),trip=tripFor(a.data,list.id),locale=a.lang==='he'?'he-IL':'en-US';
 const people=a.members.filter(m=>canAccessList(list,m.id)&&(a.member(a.user).role==='parent'||m.id===a.user));
 const [date,setDate]=useState(trip?.date||anchor),[time,setTime]=useState(trip?.time||'17:30'),[who,setWho]=useState(trip?.memberId||a.user);
 const name=a.lang==='he'?list.he||list.name:list.name;
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,{date,time,who},{enabled:open,key:open?list.id:null});
 const save=async e=>{e.preventDefault();if(!date)return;await commit(()=>a.update(d=>{const existing=d.tasks.find(t=>t.id===trip?.id),l=d.shoppingLists.find(x=>x.id===list.id);const rec=existing||{id:crypto.randomUUID(),ownerId:a.user,kind:'shopping-trip',icon:'1F6D2',repeat:'once',done:false,xp:0,allowedIds:[]};Object.assign(rec,{title:a.T('Shopping: ','קניות: ')+name,he:'קניות: '+name,date,time,memberId:who});applyShoppingTripAudience(rec,l);if(!existing)d.tasks.push(rec)}),()=>{a.notify(a.T('Trip planned. It is in Tasks and Today.','הקנייה תוכננה. היא מופיעה במשימות ובהיום.'));setOpen(false)})};
 const remove=()=>commit(()=>a.update(d=>{d.tasks=d.tasks.filter(t=>t.id!==trip.id)}),()=>setOpen(false));
 const label=trip?new Date(trip.date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'})+(trip.time?' · '+trip.time:'')+' · '+a.name(trip.memberId):a.T('Plan a trip','תכנון קנייה');
 return <>
  <button type="button" className={className+' shopping-trip-link'+(trip?' planned':'')} title={label} aria-label={label} onClick={()=>setOpen(true)}><CalendarCheck size={20}/><span>{label}</span></button>
  {open&&<div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&guard(()=>setOpen(false))}><form className="tasks-sheet shopping-trip-sheet" role="dialog" aria-modal="true" aria-label={a.T('Plan a shopping trip','תכנון קנייה')} onSubmit={save}>
   {saveError&&<p className="save-error" role="alert">{saveError}</p>}<header><h2>{a.T('Plan a trip','תכנון קנייה')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>!saving&&guard(()=>setOpen(false))}><X size={20}/></button></header>
   <p className="tasks-sheet-hint"><ShoppingCart size={18}/> {a.T('For the list','לרשימה')} <strong>{name}</strong>. {a.T('It appears in Tasks and Today and completes when everything is in the bag.','היא תופיע במשימות ובהיום ותושלם כשהכול בסל.')}</p>
   <div className="two-fields date-time-fields"><label>{a.T('Date','תאריך')}<DateField required value={date} onChange={e=>setDate(e.target.value)}/></label><label>{a.T('Time','שעה')}<input type="time" dir="ltr" value={time} onChange={e=>setTime(e.target.value)}/></label></div>
   <fieldset className="tasks-sheet-choices"><legend>{a.T('Who is going','מי הולך')}</legend><div className="tasks-sheet-people">{people.map(m=><PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={who===m.id} onClick={()=>setWho(m.id)}/>)}</div></fieldset>
   <div className="tasks-sheet-actions"><Button disabled={saving} type="submit">{trip?a.T('Save trip','שמירת הקנייה'):a.T('Plan trip','תכנון הקנייה')}</Button>{trip&&<Button secondary icon={Trash} onClick={remove}>{a.T('Remove trip','הסרת הקנייה')}</Button>}</div>
  </form></div>}
 </>;
}
