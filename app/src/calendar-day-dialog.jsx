import React,{useId} from 'react';
import {createPortal} from 'react-dom';
import {Plus,X,LockSimple} from '@phosphor-icons/react';
import {occursOn} from './domain';
import {AvatarStack} from './avatar-stack';
import './calendar-day-dialog.css';

export function CalendarDayDialog({a,day,items,onClose,onChoose,onAdd,Avatar}){
 const title=useId(),locale=a.lang==='he'?'he-IL':'en-US';
 const events=items.filter(e=>occursOn(e,day)).sort((x,y)=>(x.time||'').localeCompare(y.time||''));
 const date=new Date(day+'T12:00:00Z').toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 return createPortal(<div className="calendar-day-backdrop" onPointerDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="calendar-day-dialog" role="dialog" aria-modal="true" aria-labelledby={title}>
   <header role="none"><div><h2 id={title}>{date}</h2><p>{events.length===1?a.T('1 event','אירוע אחד'):a.T(events.length+' events',events.length+' אירועים')}</p></div><button type="button" className="icon-button" aria-label={a.T('Close day events','סגירת אירועי היום')} onClick={onClose}><X size={24}/></button></header>
   <div className="calendar-day-dialog-events">
    {events.map(event=><button type="button" key={event.id} onClick={()=>onChoose(event.id,day)}>
     <time dir="ltr">{event.time||a.T('All day','כל היום')}</time>
     <span className="calendar-day-event-text"><strong dir="auto">{a.text(event)}</strong><small>{event.memberIds?.map(a.name).join(', ')}{event.visibility==='private'&&<LockSimple size={14} aria-label={a.T('Private event','אירוע פרטי')}/>}</small></span>
     {event.memberIds?.length>1?<AvatarStack ids={event.memberIds} Avatar={Avatar} name={a.name} size={30} max={3}/>:<Avatar decorative who={event.memberIds?.[0]||event.ownerId} size={40}/>}
    </button>)}
    {!events.length&&<p className="calendar-day-empty">{a.T('Nothing planned for this day yet.','עוד לא נקבעו אירועים ליום הזה.')}</p>}
   </div>
   <footer><button type="button" className="button" onClick={()=>{onClose();onAdd(day)}}><Plus size={21}/>{a.T('Add event','הוספת אירוע')}</button></footer>
  </section>
 </div>,document.body);
}
