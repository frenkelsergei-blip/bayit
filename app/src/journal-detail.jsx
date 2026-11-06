// Journal detail panel (read view) in the same style as the Calendar event details:
// avatar + title with the real yellow underline, then icon rows for date, time, people, note, tags and sharing.
import {DetailTitle} from './detail-title';
import React from 'react';
import {CalendarDots,Clock,Users,NotePencil,Tag,LockSimple,PencilSimple,Trash,ArrowSquareOut,Sparkle,CheckCircle} from '@phosphor-icons/react';

export function JournalRecordView({a,item,ui:{Avatar,Button,Badge},editable,onEdit,onDelete,onOpenOriginal,onAskAI}){
 const locale=a.lang==='he'?'he-IL':'en-US',he=a.lang==='he';
 const date=item.date?new Date(item.date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}):'';
 const people=Array.from(new Set([...(item.memberIds||[]),item.memberId].filter(Boolean)));
 const who=people[0]||item.ownerId,text=he?item.textHe||item.text:item.text||item.textHe;
 const kind=item.recordType==='note'?a.T('Note','הערה'):item.recordType==='event'?a.T('Event','אירוע'):a.T('Task completed','משימה שהושלמה');
 const sharing=item.visibility==='private'?a.T('Only me','רק אני'):item.visibility==='selected'?a.T('Selected people','אנשים נבחרים'):a.T('Whole family','כל המשפחה');
 const tags=(item.tags||[]).filter(Boolean);
 return <div className="journal-detail calendar-event-details">
  <div className="calendar-detail-heading"><Avatar who={who} size={90}/><DetailTitle text={a.text(item).split(' · ')[0]}/></div>
  <div className="journal-detail-kind"><Badge color={item.recordType==='note'?'peach':item.recordType==='event'?'lilac':'green'} icon={item.recordType==='task'?CheckCircle:undefined}>{kind}</Badge></div>
  {date&&<div className="calendar-detail-row"><CalendarDots size={27}/><strong>{date}</strong></div>}
  {item.time&&<div className="calendar-detail-row"><Clock size={27}/><time dir="ltr">{item.time}</time></div>}
  {people.length>0&&<div className="calendar-detail-row calendar-detail-people"><Users size={27}/><div>{people.map(id=><span key={id}><Avatar who={id} size={37}/>{a.name(id)}</span>)}</div></div>}
  <div className="calendar-detail-section"><div className="calendar-detail-row"><NotePencil size={27}/><span>{item.recordType==='note'?a.T('Note','הערה'):a.T('Details','פרטים')}</span></div><p className="journal-detail-text">{text||a.T('No extra details yet.','אין עדיין פרטים נוספים.')}</p></div>
  {tags.length>0&&<div className="calendar-detail-row journal-detail-tags"><Tag size={27}/><div>{tags.map(t=><span className="journal-tag" key={t}>#{t}</span>)}</div></div>}
  <div className="calendar-detail-row"><span className="journal-detail-lock">{item.visibility==='private'?<LockSimple size={27}/>:<Users size={27}/>}</span><span>{sharing}</span></div>
  <div className="journal-detail-actions">
   {item.recordType==='note'?<>{editable&&<Button icon={PencilSimple} onClick={onEdit}>{a.T('Edit note','עריכת הערה')}</Button>}{item.ownerId===a.user&&<Button secondary icon={Trash} onClick={onDelete}>{a.T('Delete','מחיקה')}</Button>}</>
   :<Button icon={ArrowSquareOut} onClick={onOpenOriginal}>{item.recordType==='event'?a.T('Open in calendar','פתיחה ביומן'):a.T('Open in tasks','פתיחה במשימות')}</Button>}
  </div>
  <button className="text-link journal-detail-ai" onClick={onAskAI}><Sparkle size={21}/>{a.T('Ask AI about this','שאלו את AI על הרישום')}</button>
 </div>;
}
