import {anchor} from './data.js';
export const previewDate=anchor;
export function occursOn(record,date){
 if(!record.date||date<record.date)return false;
 if(record.until&&date>record.until)return false;
 const repeat=(record.repeat||(record.routine?'daily':'once')).toLowerCase();
 if(repeat==='once')return date===record.date;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if(record.weekdays?.length&&record.routine)return record.weekdays.includes(weekday);
 if(repeat==='monthly'){const start=new Date(record.date+'T12:00:00Z'),current=new Date(date+'T12:00:00Z'),months=(current.getUTCFullYear()-start.getUTCFullYear())*12+current.getUTCMonth()-start.getUTCMonth(),last=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+1,0)).getUTCDate();return months%Math.max(1,Number(record.intervalMonths)||1)===0&&current.getUTCDate()===Math.min(start.getUTCDate(),last)}
 if(repeat==='yearly'){const [,month,day]=record.date.split('-').map(Number),[year,m,d]=date.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0);return m===month&&(d===day||(month===2&&day===29&&!leap&&d===28))}
 if(repeat==='weekly')return weekday===new Date(record.date+'T12:00:00Z').getUTCDay();
 return true;
}
export function completionState(record,date=previewDate){return record.completions?.[date]?.state||(date===previewDate&&record.done?'done':'open')}
export function completeTask(record,{date=previewDate,actorId,actorRole,time,instant}){
 const before=completionState(record,date);
 const next=before==='done'?'open':record.parentConfirm&&actorRole==='child'?'pending':'done';
 if(before==='pending'&&actorRole==='child')return {changed:false,xpDelta:0};
 record.completions={...record.completions,[date]:{state:next,time,at:instant,actorId}};
 if(date===previewDate){record.done=next==='done';record.completedAt=next==='done'?time:null}
 return {changed:true,state:next,xpDelta:((next==='done'?1:0)-(before==='done'?1:0))*(record.xp||0)};
}
export function nextLevel(xp){return {level:Math.floor((xp||0)/100)+1,progress:(xp||0)%100,remaining:100-(xp||0)%100}}
