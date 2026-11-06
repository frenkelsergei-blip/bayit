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
