import {taskAssignedTo} from '../../shared/task-assignment.mjs';
import {isMine} from '../../shared/record-audience.mjs'; // "mine": the one personal-view rule (assignment and visibility model, 2026-11-08)
// Pure reminder selection. Every function receives a member's visibleState(), so a message can only
// mention records that this recipient may already see in the app.
import {maintenanceNotices,serviceDue} from '../../shared/maintenance-service.mjs';
import {occursOn,completionState} from '../src/domain.js';
import {effectiveReminders,dueReminderFor,daysAhead,shiftDate} from '../../shared/item-reminders.mjs';
import {readyChangeBursts} from '../../shared/change-notices.mjs';

export const minutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));return match?Number(match[1])*60+Number(match[2]):null};
export function inQuietHours(time,start,end){const t=minutes(time),s=minutes(start),e=minutes(end);if(t===null||s===null||e===null||s===e)return false;return s<e?t>=s&&t<e:t>=s||t<e}

// Mirrors Settings → Notifications: profile defaults, then the per-category override.
export function notificationPrefs(profile={},category){const base={reminder:10,quietStart:'20:30',quietEnd:'07:00',enabled:true,parentUpdates:true,digest:'',...profile.notificationPrefs};return {...base,...(category?base.categories?.[category]:null)}}

const open=(record,date)=>!['done','pending'].includes(completionState(record,date));

// Each item may carry several reminders (shared/item-reminders.mjs). Every due reminder has its own key
// kind:id:occurrence-date:time:lead, so it is claimed once per person and channel. Day-based reminders look
// ahead to later occurrences; a single older-style reminder keeps its exact former timing.
export function dueReminders(visible,memberId,{date,time}){
 const now=minutes(time),profile=visible.profiles?.[memberId]||{},due=[];if(now===null)return due;
 const consider=(record,kind,category,eligible)=>{
  const prefs=notificationPrefs(profile,category);
  // The recipient's own switch for the category wins; then the item's own reminders; then the recipient's defaults.
  if(prefs.enabled===false)return;
  const choice=effectiveReminders(record,profile.notificationPrefs||{},category);if(!choice.leads.length)return;
  if(inQuietHours(time,prefs.quietStart,prefs.quietEnd))return;
  for(let k=0;k<=daysAhead(choice.leads);k++){const day=shiftDate(date,k);if(!eligible(day))continue;
   const r=dueReminderFor(day,record,choice,{date,time});
   if(r)due.push({key:kind+':'+record.id+':'+day+':'+(record.time||'')+':'+r.lead,kind,category,record,date:day,time:record.time||'',lead:r.lead});
  }
 };
 for(const task of visible.tasks||[])if(task.category!=='maintenance'&&isMine(task,memberId,'tasks')&&task.date&&(task.time||Array.isArray(task.reminders)))consider(task,'task',task.routine?'routines':'tasks',day=>occursOn(task,day)&&open(task,day));
 for(const event of visible.events||[])if(isMine(event,memberId,'events')&&(event.time||Array.isArray(event.reminders)))consider(event,'event','events',day=>occursOn(event,day));
 const prefs=notificationPrefs(profile,'tasks');if(prefs.enabled!==false&&!inQuietHours(time,prefs.quietStart,prefs.quietEnd)&&now>=540&&now<600)for(const n of maintenanceNotices(visible.tasks||[],memberId,date))if(date<=n.due)due.push({...n,kind:'maintenance',category:'tasks',date,time:'09:00',lead:0,dueDate:n.due});
 return due.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}

// Snooze (Telegram audit 2026-11-08). "Snooze 10 min" only makes sense for something happening today: a reminder
// for a later day is followed by that item's next reminder instead. An event is snoozable while its start is still
// at least one snooze away; a task or routine (a to-do) stays snoozable all day.
const wallMinutes=(day,time)=>Date.parse(day+'T'+(time||'23:59')+':00Z')/60000;
export function snoozable(item,{date,time},snooze=10){
 if(!item||item.date!==date)return false;
 if(item.kind!=='event'||!/^\d{2}:\d{2}$/.test(item.time||''))return true;
 return wallMinutes(item.date,item.time)-wallMinutes(date,time)>=snooze;
}
// A snoozed reminder is sent again only for the same occurrence: the item still exists, is still visible and
// assigned, still happens on that day (not moved), is not done, and (for an event) has not already started.
export function snoozeStillDue(item,record,memberId,{date,time}){
 if(!record||!item?.date||item.date<date)return false;
 if(item.kind==='maintenance')return taskAssignedTo(record,memberId)&&serviceDue(record)===item.dueDate;
 if(!isMine(record,memberId,item.kind==='event'?'events':'tasks'))return false;
 if(!occursOn(record,item.date))return false;
 if(item.kind==='task'&&completionState(record,item.date)!=='open')return false;
 if(item.kind==='event'&&/^\d{2}:\d{2}$/.test(record.time||'')&&item.date===date&&wallMinutes(date,time)>wallMinutes(item.date,record.time)+5)return false;
 return true;
}

// Last check before a reminder is sent (user report 2026-11-08): the stored item must really occur on the reminder's
// day, and the occurrence must be no further away than the reminder's own lead. The text ("in 2 h", "In 4 days") is
// computed from that same occurrence, so a reminder never states a distance the item does not have.
export function reminderMatchesOccurrence(item,{date,time}){
 if(item?.kind==='maintenance')return true;
 const record=item?.record;if(!record||!item.date||!occursOn(record,item.date))return false;
 const timed=/^\d{2}:\d{2}$/.test(record.time||''),start=wallMinutes(item.date,timed?record.time:'00:00'),now=wallMinutes(date,time);
 return start-now<=Math.max(0,Number(item.lead)||0)&&now<=(timed?start+5:wallMinutes(item.date,'23:59'));
}

// Changes to things assigned to me (shared/change-notices.mjs), for Telegram and Push. `messages`: bursts to tell the
// person about now — their own switch (notificationPrefs.itemChanges, on by default) and quiet hours apply; a burst
// held by quiet hours stays pending and is sent afterwards (delayed, never dropped, for up to 3 days). A "changed"
// burst is only sent while the person can still see the item. `corrections`: every ready burst, including the
// person's own changes, used to correct reminders already sent to them (silent edits).
export function changeUpdates(visible,memberId,{time,now=Date.now()}){
 const prefs=notificationPrefs(visible.profiles?.[memberId]),bursts=readyChangeBursts(visible.changeNotices||[],memberId,{now,includeSelf:true});
 const on=prefs.enabled!==false&&prefs.itemChanges!==false&&!inQuietHours(time,prefs.quietStart,prefs.quietEnd);
 const still=b=>b.type!=='changed'||(visible[b.collection]||[]).some(r=>r.id===b.itemId);
 return {messages:on?bursts.filter(b=>!b.self&&still(b)):[],corrections:bursts};
}

export function agenda(visible,memberId,date){
 const items=[];
 for(const event of visible.events||[])if(isMine(event,memberId,'events')&&occursOn(event,date))items.push({kind:'event',record:event,time:event.time||''});
 for(const task of visible.tasks||[])if(isMine(task,memberId,'tasks')&&occursOn(task,date))items.push({kind:task.routine?'routine':'task',record:task,time:task.time||'',state:completionState(task,date)});
 return items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
}

// The daily summary is sent once, in the hour after the time the person chose. That choice is explicit,
// so it is sent even inside quiet hours (the default quiet hours end at 07:00, after the earliest summary time).
export function digestDue(visible,memberId,{date,time}){
 const prefs=notificationPrefs(visible.profiles?.[memberId]),at=minutes(prefs.digest),now=minutes(time);
 if(at===null||now===null||now<at||now>at+60)return null;
 return {key:'digest:'+date,items:agenda(visible,memberId,date)};
}

// Parents only: completions waiting for approval today.
export function approvalRequests(visible,memberId,{date},role){
 if(role!=='parent')return [];
 return (visible.tasks||[]).filter(t=>t.memberId!==memberId&&occursOn(t,date)&&completionState(t,date)==='pending').map(task=>({key:'approval:'+task.id+':'+date,task,date}));
}

// Parents only: recent child completions, when that child's "Update parents" preference is on.
// childPrefs maps child IDs to that boolean only; it carries no other profile data.
export function childUpdates(visible,memberId,{date,time},role,childPrefs){
 const now=minutes(time);if(role!=='parent'||now===null)return [];
 return (visible.history||[]).filter(h=>h.date===date&&h.done&&h.memberId!==memberId&&childPrefs[h.memberId]===true&&(h.actorId||h.memberId)!==memberId&&minutes(h.time)!==null&&now-minutes(h.time)>=0&&now-minutes(h.time)<=60).slice(0,10).map(entry=>({key:'update:'+entry.id,entry}));
}

// Shared completion selection for the inbox, Telegram and Push. Keep the old export
// available for existing callers; owners and other assignees use the same delivery key.
export {taskDoneUpdates,taskDoneUpdates as ownerDoneUpdates} from '../../shared/task-completion-updates.mjs';
const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

// Overdue alerts: a task with overdueAlert {afterMinutes} that is still not done that long after its date and time
// (23:59 when it has no time) alerts its owner and the person it is assigned to. Today and the two previous days.
// Keys match the in-app inbox ('overdue:<task>:<date>').
const wall=(day,time)=>Date.parse(day+'T'+(time||'23:59')+':00Z')/60000;
export function overdueAlerts(visible,memberId,{date,time}){
 const now=wall(date,time),out=[];
 for(const task of visible.tasks||[]){const prefs=notificationPrefs(visible.profiles?.[memberId],task.routine?'routines':'tasks');if(prefs.enabled===false)continue;const after=Number(task.overdueAlert?.afterMinutes);if(!(after>0)||!task.date||(task.ownerId!==memberId&&!taskAssignedTo(task,memberId)))continue;
  for(const day of [date,shiftDay(date,-1),shiftDay(date,-2)]){if(!occursOn(task,day)||!open(task,day))continue;if(now>=wall(day,task.time)+after)out.push({key:'overdue:'+task.id+':'+day,task,date:day,assignee:taskAssignedTo(task,memberId)})}}
 return out.slice(0,10);
}
