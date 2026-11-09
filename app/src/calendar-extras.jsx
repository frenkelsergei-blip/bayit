import React from 'react';
import {periodDays} from './statistics';
import {anchor} from './data';
import {occursOn} from './domain';
export function MonthCalendar({app:a,items,cursor,setCursor,setSelected,onChoose,weekStarts,Icon,onAdd,onDay}){
 const selectDay=day=>onDay?onDay(day):setCursor(day);
 const first=new Date(cursor.slice(0,7)+'-01T12:00Z'),offset=(first.getUTCDay()-weekStarts+7)%7,start=new Date(first.getTime()-offset*86400000);
 const daysInMonth=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),count=Math.max(35,Math.ceil((offset+daysInMonth)/7)*7);
 const dates=Array.from({length:count},(_,i)=>new Date(start.getTime()+i*86400000).toISOString().slice(0,10)),locale=a.lang==='he'?'he-IL':'en-US',today=a.today||anchor;
 const eventsFor=day=>items.filter(event=>occursOn(event,day)).sort((left,right)=>(left.time||'').localeCompare(right.time||''));
 return <section className="calendar-month" aria-label={a.T('Month calendar','תצוגת חודש')}>
  <div className="month-weekdays">{dates.slice(0,7).map(date=><strong key={date}>{new Date(date+'T12:00Z').toLocaleDateString(locale,{weekday:'short'})}</strong>)}</div>
  <div className="month-grid">{dates.map(day=>{
   const events=eventsFor(day),outside=day.slice(0,7)!==cursor.slice(0,7),selected=day===cursor;
   const label=new Date(day+'T12:00Z').toLocaleDateString(locale,{dateStyle:'full'})+', '+a.T(events.length+' events',events.length+' אירועים');
   return <div key={day} data-day={day} className={'month-cell'+(selected?' selected':'')+(outside?' outside':'')+(day===today?' is-today':'')}>
    <button type="button" className="month-day" aria-label={label} onClick={()=>selectDay(day)} aria-pressed={selected} aria-current={day===today?'date':undefined}>
     <span className="month-day-label">{outside&&day.endsWith('-01')&&<span className="month-outside-name">{new Date(day+'T12:00Z').toLocaleDateString(locale,{month:'short'})} </span>}{Number(day.slice(-2))}</span>
    </button>
    <div className="month-events">{events.slice(0,2).map(event=><button type="button" key={event.id} className={'month-event '+(event.color||'lilac')}
     title={(event.time?event.time+' · ':'')+a.text(event)} onClick={()=>{if(onChoose)onChoose(event.id,day);else{setCursor(day);setSelected(event.id)}}}>
     {event.time&&<time dir="ltr" dateTime={event.time}>{event.time}</time>}<span dir="auto">{a.text(event)}</span>
    </button>)}{events.length>2&&<button type="button" className="month-more" onClick={()=>selectDay(day)}>{'\u2066+'+(events.length-2)+'\u2069'} {a.T('more','נוספים')}</button>}</div>
    <div className="month-dots" aria-hidden="true">{events.slice(0,3).map(event=><i key={event.id} className={event.color||'lilac'}/>)}{events.length>3&&<span>+{events.length-3}</span>}</div>
   </div>;
  })}</div>
  {!onDay&&<div className="month-day-agenda"><div className="month-day-agenda-head"><h3>{new Date(cursor+'T12:00Z').toLocaleDateString(locale,{weekday:'long',month:'long',day:'numeric'})}</h3>{onAdd&&<button type="button" className="button secondary month-add" onClick={()=>onAdd(cursor)}>+ {a.T('Add event','הוספת אירוע')}</button>}</div>{eventsFor(cursor).map(event=><button key={event.id} onClick={()=>setSelected(event.id)}><Icon code={event.icon} size={35}/><time dir="ltr">{event.time}</time><strong>{a.text(event)}</strong></button>)}{!eventsFor(cursor).length&&<p className="muted">{a.T('A little room for something new.','יש מקום לתוכנית חדשה.')}</p>}</div>}
 </section>;
}
export function ActivityHeatmap({app:a,records,end=anchor,range='30'}){
 const count=periodDays(records,range,end),days=Array.from({length:count},(_,i)=>{const date=new Date(new Date(end+'T12:00Z').getTime()-(count-i-1)*86400000).toISOString().slice(0,10);return {date,count:records.filter(r=>r.date===date).length}}),max=Math.max(1,...days.map(d=>d.count));
 return <section className="activity-heatmap"><div className="section-title"><div><h2>{a.T('Your rhythm at a glance','הקצב שלכם במבט אחד')}</h2><p className="muted">{a.T('Each square is a day. More activity, deeper color.','כל ריבוע הוא יום. יותר פעילות, צבע עמוק יותר.')}</p></div><span>{count} {a.T('days','ימים')}</span></div><div className="heatmap-cells" role="list" style={{'--heat-columns':Math.min(count,21)}}>{days.map(d=><div role="listitem" key={d.date} tabIndex={0} className={'heat-cell level-'+(d.count===0?0:Math.max(1,Math.ceil(d.count/max*4)))} aria-label={new Date(d.date+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{weekday:'short',month:'short',day:'numeric'})+': '+(d.count===1?a.T('1 activity','פעילות אחת'):d.count+' '+a.T('activities','פעילויות'))}><span>{new Date(d.date+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{month:'short',day:'numeric'})}<br/>{d.count===1?a.T('1 activity','פעילות אחת'):d.count+' '+a.T('activities','פעילויות')}</span></div>)}</div><div className="heatmap-legend"><span>{a.T('Less','פחות')}</span>{[0,1,2,3,4].map(n=><i aria-hidden="true" className={'heat-cell level-'+n} key={n}/>)}<span>{a.T('More','יותר')}</span></div></section>
}
