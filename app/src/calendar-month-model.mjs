import {occursOn} from './domain.js';

export const MONTH_PREVIEW_LIMIT=3;

export function monthDates(cursor,weekStarts=0){
 const first=new Date(cursor.slice(0,7)+'-01T12:00:00Z');
 const startOfWeek=((Number(weekStarts)||0)%7+7)%7;
 const offset=(first.getUTCDay()-startOfWeek+7)%7;
 const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const count=Math.max(35,Math.ceil((offset+days)/7)*7);
 return Array.from({length:count},(_,i)=>new Date(first.getTime()+(i-offset)*86400000).toISOString().slice(0,10));
}

// Callers supply the same access-checked, people-filtered collection as Week/Agenda.
export function monthDayEvents(items,day){
 return items.filter(event=>occursOn(event,day)).sort((left,right)=>(left.time||'').localeCompare(right.time||''));
}
