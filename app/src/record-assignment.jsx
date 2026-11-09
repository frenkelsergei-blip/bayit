import React from 'react';
import {Users,LockSimple,Repeat,Bell} from '@phosphor-icons/react';
import {AssignedPeople} from './assigned-people';
import {taskMemberIds} from '../../shared/task-assignment.mjs';
import {normalizeAudience} from '../../shared/record-audience.mjs';
import {repeatLabel} from './repeat-label';
import {ReminderSummary,reminderListLabel,myDefaultReminders} from './item-reminder';
import './record-assignment.css';

export function RecordAssignees({a,record,Avatar,task=false}){
 const people=task?taskMemberIds(record):record.memberIds||[];
 return <section className="record-assignment" aria-label={a.T('Assigned to','משויך ל־')}>
  <div className="calendar-detail-row"><Users size={27}/><strong>{a.T('Assigned to','משויך ל־')}</strong></div>
  <div className="record-assignment-people"><AssignedPeople ids={people} Avatar={Avatar} name={a.name} member={a.member} size={37} label={a.T('Assigned to','משויך ל־')} showNames/></div>
  {!people.length&&<p>{a.T('No assignees','ללא שיוך')}</p>}
 </section>;
}

// Read-only "Who can see" for events and tasks, in the consistent form: assignees always see (2026-11-08).
export function RecordAudience({a,record:stored,showEditors=false}){
 const record=normalizeAudience(stored,'tasks'); // tasks and events: memberIds (or a task's single memberId) are the assignees
 const audience=record.visibility==='private'?a.T('Only me','רק אני'):record.visibility==='selected'?a.T('Selected people','אנשים נבחרים'):a.T('Whole family','כל המשפחה');
 const names=[...new Set([record.ownerId,...(record.allowedIds||[])])].filter(Boolean).map(a.name).join(', ');
 const editors=record.visibility==='private'||record.editPolicy==='owner'?a.T('Owner only','בעל הרשומה בלבד'):record.editPolicy==='viewers'?a.T('Everyone who can view','כל מי שרשאי לצפות'):record.editPolicy==='selected'?[...new Set([record.ownerId,...(record.editorIds||[])])].map(a.name).join(', '):a.T('Owner and parents','בעל הרשומה וההורים');
 return <div className="calendar-detail-row record-audience">{record.visibility==='private'?<LockSimple size={27}/>:<Users size={27}/>}<span><strong>{a.T('Who can see: ','מי יכול לראות: ')}</strong>{audience}{record.visibility==='selected'&&<small dir="auto">{names}</small>}{showEditors&&<small><strong>{a.T('Who can edit: ','מי יכול לערוך: ')}</strong>{editors}</small>}</span></div>;
}

export function RecordRecurrence({a,record}){
 const locale=a.lang==='he'?'he-IL':'en-US',repeat=(record.repeat||(record.routine?'daily':'once')).toLowerCase();
 const days=record.routine&&record.weekdays?.length?record.weekdays.map(d=>new Date(Date.UTC(2026,10,1+d)).toLocaleDateString(locale,{weekday:'short',timeZone:'UTC'})).join(', '):'';
 return <div className="calendar-detail-row record-recurrence"><Repeat size={27}/><span><strong>{a.T('Repeats: ','חזרה: ')}</strong>{repeatLabel(repeat,a.T,record.weekdays)}{days&&<small>{days}</small>}{record.until&&repeat!=='once'&&<small>{a.T('Until ','עד ')}{new Date(record.until+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})}</small>}</span></div>;
}

export function TaskReminderDetails({a,task}){
 const category=task.routine?'routines':'tasks';
 return <section className="record-reminder"><div className="calendar-detail-row"><Bell size={27}/><strong>{a.T('Reminders','תזכורות')}</strong></div>{!task.date||!task.time&&!Array.isArray(task.reminders)?<p>{a.T('No scheduled time for a reminder','ללא שעה מתוכננת לתזכורת')}</p>:<ReminderSummary a={a} record={task} category={category} defaultText={a.T('Each assignee’s default','ברירת המחדל של כל משויך')+' · '+a.T('mine: ','שלי: ')+reminderListLabel(a,myDefaultReminders(a,category),false)}/>}<p className="muted">{a.T('Reminders go to all assigned people who can view this task, subject to their notification settings, quiet hours and linked channels.','תזכורות נשלחות לכל המשויכים שמורשים לצפות במשימה, בהתאם להגדרות ההתראות, לשעות השקט ולערוצים המחוברים של כל אחד.')}</p></section>;
}
