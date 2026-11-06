// Task priority: pure helpers shared by the Tasks page, the Today widget and tests.
// A task may carry priority 'high' | 'medium' | 'low'; anything else means no priority.
import {occursOn,completionState} from './domain.js';

export const PRIORITY_IDS=['high','medium','low'];
export const normalizePriority=value=>PRIORITY_IDS.includes(value)?value:undefined;
// Lower rank sorts first: high 0, medium 1, low 2, none 3.
export const priorityRank=value=>{const i=PRIORITY_IDS.indexOf(value);return i<0?PRIORITY_IDS.length:i};
export const comparePriority=(x,y)=>priorityRank(x?.priority)-priorityRank(y?.priority);

// Rows are {t,date}. Groups come back in High, Medium, Low, None order, empty groups left out.
// Within a group rows keep a calm order: by date (no date last), then time (no time last).
export function groupByPriority(rows){
 const order=[...PRIORITY_IDS,'none'],buckets=Object.fromEntries(order.map(k=>[k,[]]));
 for(const row of rows)buckets[normalizePriority(row.t.priority)||'none'].push(row);
 const when=r=>(r.t.date?r.date||r.t.date:'9999-99-99')+' '+(r.t.time||'99:99');
 return order.filter(k=>buckets[k].length).map(k=>({key:k,rows:buckets[k].slice().sort((a,b)=>when(a).localeCompare(when(b)))}));
}

// An anytime task counts as done when its latest recorded completion is not open (same rule as the Tasks page).
const anytimeState=t=>{const last=Object.entries(t.completions||{}).sort(([x],[y])=>x.localeCompare(y)).pop();return last?last[1]?.state||'open':(t.done?'done':'open')};

// Open high-priority tasks that belong to userId (assigned to them, or created by them) for the chosen day:
// overdue one-time tasks first, then the day's tasks by time, then anytime tasks. Pass only records the
// person may already see (a.visible(...)); this never widens access.
export function topPriorities(tasks,{userId,date,today=date,level='high'}={}){
 const mine=(tasks||[]).filter(t=>!t.routine&&normalizePriority(t.priority)===level&&(t.memberId===userId||t.ownerId===userId));
 const overdue=mine.filter(t=>t.date&&t.date<today&&(t.repeat||'once').toLowerCase()==='once'&&completionState(t,t.date)!=='done').map(t=>({t,date:t.date,when:'overdue'}));
 const seen=new Set(overdue.map(r=>r.t.id));
 const onDay=mine.filter(t=>!seen.has(t.id)&&t.date&&occursOn(t,date)&&completionState(t,date)!=='done').map(t=>({t,date,when:'day'})).sort((a,b)=>(a.t.time||'99').localeCompare(b.t.time||'99'));
 const anytime=mine.filter(t=>!t.date&&anytimeState(t)!=='done').map(t=>({t,date:today,when:'anytime'}));
 return [...overdue.sort((a,b)=>(a.date+(a.t.time||'')).localeCompare(b.date+(b.t.time||''))),...onDay,...anytime];
}
