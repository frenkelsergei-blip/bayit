// Calendar Agenda: a chronological list (not the week grid). Days with events, from the start of the current week,
// four weeks at a time; each day has its own "Add" so adding works in every view.
import React,{useState,useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import {DensityToggle,densityOf} from './density';
import {Plus,LockSimple,CaretDown} from '@phosphor-icons/react';
import {occursOn} from './domain';
import {AvatarStack} from './avatar-stack';

const addDays=(v,n)=>{const d=new Date(v+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};

export function CalendarAgenda({a,items,start,today,selected,onChoose,onAdd,Avatar,EventIcon,Icon,limitDays,showEmpty=false}){
 const [weeks,setWeeks]=useState(4),locale=a.lang==='he'?'he-IL':'en-US';
 const days=Array.from({length:limitDays||weeks*7},(_,i)=>addDays(start,i)).map(day=>({day,events:items.filter(e=>occursOn(e,day)).sort((x,y)=>(x.time||'').localeCompare(y.time||''))}));
 const shown=days.filter(d=>showEmpty||d.events.length||d.day===today);
 // Cards | List joins the calendar page's existing "New event" row (or its control row when there is no heading),
 // only while Agenda is shown. Those rows are rendered by the calendar page, so the switch is portalled into them.
 const [slot,setSlot]=useState(null);useLayoutEffect(()=>{const el=document.querySelector('.calendar-reference>.page-actions')||document.querySelector('.calendar-reference-controls');if(el!==slot)setSlot(el)});
 const label=d=>d===today?a.T('Today','היום'):d===addDays(today,1)?a.T('Tomorrow','מחר'):'';
 return <section className={'calendar-agenda'+(densityOf(a.data,a.user,'calendar')==='compact'?' density-compact':'')} aria-label={limitDays?a.T('Week list','רשימת השבוע'):a.T('Agenda','סדר יום')}>
  {shown.map(({day,events})=>{const date=new Date(day+'T12:00:00Z');return <article key={day} className={'agenda-day'+(day===today?' is-today':'')}>
   <header className="agenda-day-head"><span className="agenda-date"><strong>{date.getUTCDate()}</strong><small>{date.toLocaleDateString(locale,{timeZone:'UTC',month:'short'})}</small></span><span className="agenda-weekday"><strong>{date.toLocaleDateString(locale,{timeZone:'UTC',weekday:'long'})}</strong>{label(day)&&<em>{label(day)}</em>}</span><button type="button" className="agenda-add" onClick={()=>onAdd(day)} aria-label={a.T('Add an event on ','הוספת אירוע ב־')+date.toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'})}><Plus size={18} weight="bold"/><span>{a.T('Add','הוספה')}</span></button></header>
   {events.length?<div className="agenda-events">{events.map(e=><button type="button" key={e.id} className={'agenda-event '+(e.color||'lilac')+(selected===e.id?' selected':'')} onClick={()=>onChoose(e.id,day)}>
    <time dir="ltr">{e.time||a.T('All day','כל היום')}</time><span className="agenda-bar" aria-hidden="true"/>
    <span className="agenda-icon">{EventIcon?<EventIcon event={e} Icon={Icon} size={30}/>:<Icon code={e.icon} size={30}/>}</span>
    <span className="agenda-text"><strong>{a.text(e).split(' · ')[0]}</strong>{(e.note||e.noteHe)&&<small>{a.lang==='he'?e.noteHe||e.note:e.note}</small>}</span>
    {e.memberIds?.length>1?<AvatarStack ids={e.memberIds} Avatar={Avatar} name={a.name} size={30} max={3}/>:<Avatar who={e.memberIds?.[0]||e.ownerId} size={34}/>}
    {e.visibility==='private'&&<LockSimple size={18} className="agenda-lock"/>}
   </button>)}</div>:<p className="agenda-empty">{a.T('Nothing planned yet.','עוד לא תוכנן כלום.')}</p>}
  </article>})}
  {slot&&createPortal(<DensityToggle a={a} page="calendar" className="agenda-density"/>,slot)}
  {!limitDays&&<button type="button" className="button secondary agenda-more" onClick={()=>setWeeks(weeks+4)}><CaretDown size={20}/>{a.T('Show the next 4 weeks','הצגת 4 השבועות הבאים')}</button>}
 </section>;
}
