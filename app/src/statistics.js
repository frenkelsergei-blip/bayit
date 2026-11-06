import {canSee,anchor} from './data.js';
const DAY=86400000;
export const inScope=(record,user,scope)=>canSee(record,user)&&(scope==='private'?record.visibility==='private'&&record.ownerId===user:record.visibility!=='private');
export const inRange=(date,end,days)=>date<=end&&(days==='all'||date>=new Date(new Date(end+'T12:00Z').getTime()-(Number(days)-1)*DAY).toISOString().slice(0,10));
export function activityRecords(data,user,scope='family',days=7,end=anchor,person='all'){
 const latest=new Map();for(const record of data.history||[])if(!latest.has(record.taskId+'|'+record.date))latest.set(record.taskId+'|'+record.date,record);
 return [...latest.values()].filter(r=>r.done&&inScope(r,user,scope)&&inRange(r.date,end,days)&&(person==='all'||r.memberId===person));
}
export function purchaseRecords(data,user,scope='family',days=30,end=anchor,person='all'){
 const latest=new Map((data.purchases||[]).map(r=>[r.id+'|'+r.date,r]));
 return [...latest.values()].filter(r=>r.done&&inScope(r,user,scope)&&inRange(r.date,end,days)&&(person==='all'||(r.boughtBy||r.memberId||r.ownerId)===person));
}
export function rankBy(records,key){const groups=new Map();for(const record of records){const id=key(record);if(!groups.has(id))groups.set(id,{key:id,count:0,records:[]});const group=groups.get(id);group.count++;group.records.push(record)}return [...groups.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key))}
export function periodDays(records,days,end=anchor){
 if(days!=='all')return Math.max(1,Number(days)||7);
 const first=records.map(r=>r.date).filter(d=>d<=end).sort()[0]||end;
 return Math.max(1,Math.round((Date.parse(end+'T12:00Z')-Date.parse(first+'T12:00Z'))/DAY)+1);
}
export function dailySeries(records,days=7,end=anchor){
 const count=periodDays(records,days,end),size=Math.max(1,Math.ceil(count/30)),start=Date.parse(end+'T12:00Z')-(count-1)*DAY,iso=t=>new Date(t).toISOString().slice(0,10);
 return Array.from({length:Math.ceil(count/size)},(_,i)=>{const date=iso(start+i*size*DAY),endDate=iso(Math.min(Date.parse(end+'T12:00Z'),start+((i+1)*size-1)*DAY));return {date,endDate,count:records.filter(r=>r.date>=date&&r.date<=endDate).length}});
}
