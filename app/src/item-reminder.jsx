// One reminder choice for events and tasks. Empty = the recipient's own default from Settings → Notifications;
// a number = minutes before; 'none' = no reminder. The server applies the same rule (reminders.mjs dueReminders).
import React from 'react';

export const defaultLead=(a,category='events')=>{const p=a.data.profiles?.[a.user]?.notificationPrefs||{};const value=Number(p.categories?.[category]?.reminder??p.reminder??10);return Number.isFinite(value)&&value>=0?value:10};
const LEADS=[0,5,10,15,30,60,120];
const minutesLabel=(a,n)=>n===0?a.T('At the start time','בזמן ההתחלה'):n>=60?a.T(n/60===1?'1 hour before':n/60+' hours before',n/60===1?'שעה לפני':'שעתיים לפני'):a.T(n+' minutes before',n+' דקות לפני');

export function reminderText(a,value,category){
 if(value==='none')return a.T('No reminder','בלי תזכורת');
 if(value===undefined||value===null||value==='')return minutesLabel(a,defaultLead(a,category))+' · '+a.T('default','ברירת מחדל');
 return minutesLabel(a,Number(value));
}

export function ReminderSelect({a,value,onChange,Select,category='events',label}){
 const v=value===undefined||value===null?'':String(value);
 return <Select aria-label={label||a.T('Reminder','תזכורת')} value={v} onChange={e=>{const x=e.target.value;onChange(x===''?undefined:x==='none'?'none':+x)}}>
  <option value="">{a.T('My default','ברירת המחדל שלי')} · {minutesLabel(a,defaultLead(a,category))}</option>
  {LEADS.map(n=><option key={n} value={n}>{minutesLabel(a,n)}</option>)}
  <option value="none">{a.T('No reminder','בלי תזכורת')}</option>
 </Select>;
}

// ---- Several reminders (Google-style rows: number · unit · remove; up to 5, up to 4 weeks) ----
import {Bell,Plus,X} from '@phosphor-icons/react';
import {MAX_REMINDERS,MAX_LEAD,ALL_DAY_TIME,ownReminders,defaultReminders,normalizeReminders,splitLead,allDayLead,leadLabel,UNIT_MINUTES,untimed} from '../../shared/item-reminders.mjs';

const prefsOf=a=>a.data.profiles?.[a.user]?.notificationPrefs||{};
export const myDefaultReminders=(a,category)=>defaultReminders(prefsOf(a),category).map(n=>Math.max(0,n));
export const reminderListLabel=(a,leads,allDay)=>leads.length?leads.map(n=>leadLabel(n,a.lang,{allDay})).join(' · '):a.T('No notifications','בלי התראות');
const rowOf=(n,allDay)=>{if(!allDay){const r=splitLead(n);return {...r,value:String(r.value)}}const {days,time}=splitLead(n,{allDay:true});return days>0&&days%7===0?{value:String(days/7),unit:'weeks',time}:{value:String(days),unit:'days',time}};
const leadOf=(row,allDay)=>{const v=Number(row.value);if(row.value===''||!Number.isInteger(v)||v<0)return null;if(allDay){const days=row.unit==='weeks'?v*7:v;if(days>28)return null;return allDayLead(days,row.time||ALL_DAY_TIME)}const n=v*UNIT_MINUTES[row.unit];return n<=MAX_LEAD?n:null};
const maxFor=(unit,allDay)=>allDay?(unit==='weeks'?4:28):Math.floor(MAX_LEAD/UNIT_MINUTES[unit]);
const nextLead=(used,allDay)=>(allDay?[900,-540,2340,9540]:[30,10,60,1440,2880,10080,0]).find(n=>!used.includes(n))??(allDay?900:30);

// value: the item's own list, or null when it follows each person's default. onChange(list|null).
export function ReminderListEditor({a,Select,value,onChange,category='events',allDay=false,defaults=false,label}){
 const own=value===undefined?null:value;
 const [rows,setRows]=React.useState(()=>(own||[]).map(n=>rowOf(n,allDay)));
 const emitted=React.useRef(own?JSON.stringify(normalizeReminders(own,{allDay})):null);
 React.useEffect(()=>{const key=own?JSON.stringify(normalizeReminders(own,{allDay})):null;if(key!==emitted.current){emitted.current=key;setRows((own||[]).map(n=>rowOf(n,allDay)))}},[JSON.stringify(own),allDay]);
 const publish=next=>{setRows(next);const leads=next.map(r=>leadOf(r,allDay));if(leads.some(l=>l===null))return;const list=normalizeReminders(leads,{allDay});emitted.current=JSON.stringify(list);onChange(list)};
 const mine=myDefaultReminders(a,category),units=allDay?['days','weeks']:['minutes','hours','days','weeks'];
 const unitName=(u,v)=>Number(v)===1?({minutes:a.T('minute','דקה'),hours:a.T('hour','שעה'),days:a.T('day','יום'),weeks:a.T('week','שבוע')})[u]:({minutes:a.T('minutes','דקות'),hours:a.T('hours','שעות'),days:a.T('days','ימים'),weeks:a.T('weeks','שבועות')})[u];
 const add=()=>{const base=own===null&&!defaults&&!allDay?mine.map(n=>rowOf(n,false)):rows;if(base.length>=MAX_REMINDERS)return;const used=base.map(r=>leadOf(r,allDay));publish([...base,rowOf(nextLead(used,allDay),allDay)])};
 const following=own===null&&!defaults&&!allDay,full=(following?mine.length:rows.length)>=MAX_REMINDERS;
 return <div className="reminder-list" role="group" aria-label={label||a.T('Notifications','התראות')}>
  {following?<p className="reminder-default"><Bell size={22} aria-hidden="true"/><span><strong>{a.T('My default','ברירת המחדל שלי')}</strong> · {reminderListLabel(a,mine,false)}<small>{a.T('Each assigned person gets their own default.','כל משויך מקבל את ברירת המחדל שלו.')}</small></span></p>
  :rows.length===0?<p className="reminder-empty">{defaults?a.T('No default notifications','אין התראות ברירת מחדל'):a.T('No notifications','בלי התראות')}</p>
  :<ul className="reminder-rows">{rows.map((row,i)=>{const bad=leadOf(row,allDay)===null,set=patch=>publish(rows.map((r,j)=>j===i?{...r,...patch}:r));
   return <li key={i} className="reminder-row" data-invalid={bad||undefined}>
    <input type="number" inputMode="numeric" min="0" max={maxFor(row.unit,allDay)} step="1" value={row.value} aria-label={a.T('Notification amount','כמות זמן להתראה')+' '+(i+1)} aria-invalid={bad||undefined} onChange={e=>set({value:e.target.value})}/>
    <Select aria-label={a.T('Notification unit','יחידת זמן להתראה')+' '+(i+1)} value={row.unit} onChange={e=>{const unit=e.target.value,v=Math.min(Number(row.value)||0,maxFor(unit,allDay));set({unit,value:String(v)})}}>{units.map(u=><option key={u} value={u}>{unitName(u,row.value)}</option>)}</Select>
    {allDay?<><span>{a.T('before at','לפני, בשעה')}</span><input type="time" value={row.time||ALL_DAY_TIME} aria-label={a.T('Notification time','שעת ההתראה')+' '+(i+1)} onChange={e=>set({time:e.target.value||ALL_DAY_TIME})}/></>:<span>{a.T('before','לפני')}</span>}
    <button type="button" className="reminder-remove" aria-label={a.T('Remove notification','הסרת התראה')+' '+(i+1)} onClick={()=>publish(rows.filter((_,j)=>j!==i))}><X size={20} weight="bold"/></button>
    {bad&&<small className="reminder-error" role="alert">{a.T('Up to 4 weeks before','עד 4 שבועות לפני')}</small>}
   </li>})}</ul>}
  <div className="reminder-actions">
   <button type="button" className="button secondary reminder-add" disabled={full} onClick={add}><Plus size={20} weight="bold"/> {a.T('Add notification','הוספת התראה')}</button>
   {!defaults&&!allDay&&own!==null&&<button type="button" className="button quiet" onClick={()=>{emitted.current=null;setRows([]);onChange(null)}}>{a.T('Use my default','ברירת המחדל שלי')}</button>}
   {!defaults&&(own===null&&!allDay||rows.length>0)&&<button type="button" className="button quiet" onClick={()=>publish([])}>{a.T('No notifications','בלי התראות')}</button>}
  </div>
  {full&&<small className="reminder-limit">{a.T('Up to 5 notifications','עד 5 התראות')}</small>}
 </div>;
}

// Read-only: the item's notifications as pills, or the default note.
export function ReminderSummary({a,record,category='events',defaultText}){
 const allDay=untimed(record),own=ownReminders(record);
 if(own===null)return <p className="reminder-summary-default">{defaultText||a.T('My default','ברירת המחדל שלי')+' · '+reminderListLabel(a,myDefaultReminders(a,category),false)}</p>;
 if(!own.length)return <p>{a.T('No notifications','בלי התראות')}</p>;
 return <ul className="reminder-pills" aria-label={a.T('Notifications','התראות')}>{own.map(n=><li key={n}><Bell size={18} aria-hidden="true"/>{leadLabel(n,a.lang,{allDay})}</li>)}</ul>;
}

// Writes an editor result onto a record: a list replaces the older single field; null returns to the default.
export function applyReminders(record,list){delete record.reminder;if(list===null)delete record.reminders;else record.reminders=list;return record}

// Event/task details for people who may edit: the same rows, saved through the household server
// (a.update confirms or reverts). Number typing is grouped into one save.
export function ReminderDetailsEditor({a,Select,record,collection='events',category='events',label}){
 const timer=React.useRef(null),pending=React.useRef(undefined);
 const flush=()=>{clearTimeout(timer.current);timer.current=null;if(pending.current===undefined)return;const list=pending.current;pending.current=undefined;a.update(d=>{const r=(d[collection]||[]).find(x=>x.id===record.id);if(r)applyReminders(r,list)})};
 React.useEffect(()=>()=>flush(),[]);
 return <ReminderListEditor a={a} Select={Select} category={category} allDay={untimed(record)} label={label} value={ownReminders(record)??(untimed(record)?[]:null)} onChange={list=>{pending.current=list;clearTimeout(timer.current);timer.current=setTimeout(flush,700)}}/>;
}

// Settings › Notifications: a person's default list for one category (events, routines, tasks).
export function ReminderDefaultsEditor({a,Select,recipient,category}){
 const prefs=a.data.profiles?.[recipient]?.notificationPrefs||{},timer=React.useRef(null),pending=React.useRef(undefined);
 const flush=()=>{clearTimeout(timer.current);if(pending.current===undefined)return;const list=pending.current;pending.current=undefined;a.update(d=>{const p=d.profiles[recipient];const c={...p.notificationPrefs?.categories?.[category],reminders:list};delete c.reminder;p.notificationPrefs={...p.notificationPrefs,categories:{...p.notificationPrefs?.categories,[category]:c}}})};
 React.useEffect(()=>()=>flush(),[recipient,category]);
 return <ReminderListEditor key={recipient+':'+category} a={a} Select={Select} defaults category={category} label={a.T('Default notifications','התראות ברירת מחדל')} value={defaultReminders(prefs,category).map(n=>Math.max(0,n))} onChange={list=>{pending.current=list;clearTimeout(timer.current);timer.current=setTimeout(flush,700)}}/>;
}
