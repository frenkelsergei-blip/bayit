import {taskAssignedTo} from './task-assignment.mjs';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00Z').toISOString().slice(0,10)===value;
export function serviceDue(record){
 if(record.serviceHistory?.length)return record.nextServiceDate||null;
 let date=record.date;for(let i=0;i<240&&record.completions?.[date]?.state==='done';i++){if(record.repeat!=='monthly')return null;date=serviceMonth(record.date,(i+1)*(record.intervalMonths||1))}return date;
}
export function serviceMonth(date,months){const d=new Date(date+'T12:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
export function recordMaintenanceService(record,command,actor,{today,now=new Date().toISOString()}={}){
 if(record.category!=='maintenance')throw Error('Choose a maintenance task.');
 if(!command?.id||!validDate(command.date)||command.date>today||!['scheduled','performed'].includes(command.basis))throw Error('Choose a valid service date and schedule basis.');
 if(record.serviceHistory?.some(r=>r.id===command.id))return record;
 const due=serviceDue(record);if(!due)throw Error('This service is already complete.');
 const last=record.serviceHistory?.at(-1);if(last&&command.date<last.performedDate)throw Error('The service date precedes the last recorded service.');
 const next=record.repeat==='monthly'?serviceMonth(command.basis==='performed'?command.date:due,Number(record.intervalMonths)||1):null;
 return {...record,serviceHistory:[...(record.serviceHistory||[]),{id:command.id,scheduledDate:due,performedDate:command.date,basis:command.basis,actorId:actor,at:now}],nextServiceDate:next};
}
export function maintenanceNotices(records,actor,today){return records.filter(r=>r.category==='maintenance'&&!r.deletedAt&&taskAssignedTo(r,actor)&&Number.isInteger(r.reminderDays)).flatMap(record=>{const due=serviceDue(record);if(!due)return [];const start=new Date(Date.parse(due+'T12:00Z')-Math.max(0,record.reminderDays)*864e5).toISOString().slice(0,10);return today>=start?[{record,due,start,key:'maintenance:'+record.id+':'+due+':'+record.reminderDays}]:[]})}
