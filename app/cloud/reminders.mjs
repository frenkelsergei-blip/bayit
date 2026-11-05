// Pure reminder selection. Every function receives a member's visibleState(), so a message can only
// mention records that this recipient may already see in the app.
import {occursOn,completionState} from '../src/domain.js';

export const minutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));return match?Number(match[1])*60+Number(match[2]):null};
export function inQuietHours(time,start,end){const t=minutes(time),s=minutes(start),e=minutes(end);if(t===null||s===null||e===null||s===e)return false;return s<e?t>=s&&t<e:t>=s||t<e}

// Mirrors Settings → Notifications: profile defaults, then the per-category override.
export function notificationPrefs(profile={},category){const base={reminder:10,quietStart:'20:30',quietEnd:'07:00',enabled:true,parentUpdates:true,digest:'',...profile.notificationPrefs};return {...base,...(category?base.categories?.[category]:null)}}

const LATE_GRACE=5; // Minutes after the start time a missed cron tick may still deliver.
const open=(record,date)=>!['done','pending'].includes(completionState(record,date));

export function dueReminders(visible,memberId,{date,time}){
 const now=minutes(time),profile=visible.profiles?.[memberId]||{},due=[];if(now===null)return due;
 const consider=(record,kind,category)=>{
  const prefs=notificationPrefs(profile,category),start=minutes(record.time);
  if(prefs.enabled===false||start===null)return;
  // An item just after midnight is reminded from 00:00 rather than on the previous day.
  const lead=Math.max(0,Math.min(120,Number(prefs.reminder)||10)),from=Math.max(0,start-lead);
  if(now<from||now>start+LATE_GRACE)return;
  if(inQuietHours(time,prefs.quietStart,prefs.quietEnd))return;
  due.push({key:kind+':'+record.id+':'+date+':'+record.time+':'+lead,kind,category,record,date,time:record.time,lead});
 };
 for(const task of visible.tasks||[])if(task.memberId===memberId&&task.time&&occursOn(task,date)&&open(task,date))consider(task,'task',task.routine?'routines':'tasks');
 for(const event of visible.events||[])if(event.memberIds?.includes(memberId)&&event.time&&occursOn(event,date))consider(event,'event','events');
 return due.sort((a,b)=>a.time.localeCompare(b.time));
}

export function agenda(visible,memberId,date){
 const items=[];
 for(const event of visible.events||[])if(event.memberIds?.includes(memberId)&&occursOn(event,date))items.push({kind:'event',record:event,time:event.time||''});
 for(const task of visible.tasks||[])if(task.memberId===memberId&&occursOn(task,date))items.push({kind:task.routine?'routine':'task',record:task,time:task.time||'',state:completionState(task,date)});
 return items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
}

// The morning summary is sent once, in the hour after the chosen time, outside quiet hours.
export function digestDue(visible,memberId,{date,time}){
 const prefs=notificationPrefs(visible.profiles?.[memberId]),at=minutes(prefs.digest),now=minutes(time);
 if(at===null||now===null||now<at||now>at+60||inQuietHours(time,prefs.quietStart,prefs.quietEnd))return null;
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

// Owner updates: the owner of a task marked "notify me when done" hears when someone else completes it.
// Keys match the in-app inbox ('done:<task>:<date>') so a person is told once per channel.
const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export function ownerDoneUpdates(visible,memberId,{date}){
 const out=[];
 for(const task of visible.tasks||[]){if(task.ownerId!==memberId||task.notifyOwnerOnDone!==true)continue;
  for(const day of [date,shiftDay(date,-1)]){const c=task.completions?.[day];if(c?.state==='done'&&c.actorId&&c.actorId!==memberId)out.push({key:'done:'+task.id+':'+day,task,date:day,actorId:c.actorId})}}
 return out.slice(0,10);
}

// Overdue alerts: a task with overdueAlert {afterMinutes} that is still not done that long after its date and time
// (23:59 when it has no time) alerts its owner and the person it is assigned to. Today and the two previous days.
// Keys match the in-app inbox ('overdue:<task>:<date>').
const wall=(day,time)=>Date.parse(day+'T'+(time||'23:59')+':00Z')/60000;
export function overdueAlerts(visible,memberId,{date,time}){
 const now=wall(date,time),out=[];
 for(const task of visible.tasks||[]){const after=Number(task.overdueAlert?.afterMinutes);if(!(after>0)||!task.date||(task.ownerId!==memberId&&task.memberId!==memberId))continue;
  for(const day of [date,shiftDay(date,-1),shiftDay(date,-2)]){if(!occursOn(task,day)||!open(task,day))continue;if(now>=wall(day,task.time)+after)out.push({key:'overdue:'+task.id+':'+day,task,date:day,assignee:task.memberId===memberId})}}
 return out.slice(0,10);
}
