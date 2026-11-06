// Today widget: the current person's open high-priority tasks (assigned to them or created by them) for the
// chosen day, plus overdue and anytime ones. Uses a.visible(...) so it follows the same access rules as Tasks.
import React from 'react';
import {Clock,WarningCircle,ArrowRight,Infinity as Anytime} from '@phosphor-icons/react';
import {PriorityMark,topPriorities} from './priority';

export function TopPriorities({app:a,date,today,ui:{Avatar}}){
 const rows=topPriorities(a.visible(a.data.tasks),{userId:a.user,date,today}),shown=rows.slice(0,5),locale=a.lang==='he'?'he-IL':'en-US';
 if(!rows.length)return null; // Calm by default: the section collapses (priority.css) when nothing high is open.
 const short=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
 return <>
  <div className="section-title"><h2>{a.T('Top priorities','הכי חשוב')}</h2><span className="prio-widget-count" aria-label={a.T(rows.length+' open','פתוחות: '+rows.length)}>{rows.length}</span></div>
  <div className="prio-widget-list">{shown.map(({t,date:d,when})=><button type="button" key={t.id+d} className={'prio-widget-row'+(when==='overdue'?' overdue':'')} onClick={()=>a.go('tasks?task='+encodeURIComponent(t.id)+'&date='+d)}>
   <PriorityMark a={a} priority={t.priority} size={24}/>
   <span className="prio-widget-text"><strong>{a.text(t)}</strong><small>{when==='overdue'?<><WarningCircle size={15}/>{a.T('Overdue','באיחור')} · {short(d)}{t.time&&<> · <span dir="ltr">{t.time}</span></>}</>:when==='anytime'?<><Anytime size={15}/>{a.T('Anytime','בלי תאריך')}</>:t.time?<><Clock size={15}/><span dir="ltr">{t.time}</span></>:<><Clock size={15}/>{a.T('Today','היום')}</>}</small></span>
   <Avatar who={t.memberId} size={40}/>
  </button>)}</div>
  <button type="button" className="text-link widget-more" onClick={()=>a.go('tasks?order=priority')}>{a.T('All tasks by priority','כל המשימות לפי עדיפות')}<ArrowRight size={18}/></button>
 </>;
}
