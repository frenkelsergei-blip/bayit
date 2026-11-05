import {canSee} from './data.js';
const DAY=86400000;
export const inScope=(record,user,scope)=>canSee(record,user)&&(scope==='private'?record.visibility==='private'&&record.ownerId===user:record.visibility!=='private');
export const inRange=(date,end,days)=>date<=end&&(days==='all'||date>=new Date(new Date(end+'T12:00Z').getTime()-(Number(days)-1)*DAY).toISOString().slice(0,10));
export function activityRecords(data,user,scope='family',days=7,end='2026-11-04',person='all'){
 const latest=new Map();for(const record of data.history||[])if(!latest.has(record.taskId+'|'+record.date))latest.set(record.taskId+'|'+record.date,record);
 return [...latest.values()].filter(r=>r.done&&inScope(r,user,scope)&&inRange(r.date,end,days)&&(person==='all'||r.memberId===person));
}
export function purchaseRecords(data,user,scope='family',days=30,end='2026-11-04',person='all'){
 const latest=new Map((data.purchases||[]).map(r=>[r.id+'|'+r.date,r]));
 return [...latest.values()].filter(r=>r.done&&inScope(r,user,scope)&&inRange(r.date,end,days)&&(person==='all'||(r.boughtBy||r.memberId||r.ownerId)===person));
}
export function rankBy(records,key){const groups=new Map();for(const record of records){const id=key(record);if(!groups.has(id))groups.set(id,{key:id,count:0,records:[]});const group=groups.get(id);group.count++;group.records.push(record)}return [...groups.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key))}
export function dailySeries(records,days=7,end='2026-11-04'){
 const count=days==='all'?30:Math.min(Number(days),30);return Array.from({length:count},(_,i)=>{const date=new Date(new Date(end+'T12:00Z').getTime()-(count-i-1)*DAY).toISOString().slice(0,10);return {date,count:records.filter(r=>r.date===date).length}});
}
