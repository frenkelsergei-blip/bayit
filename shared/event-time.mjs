import {normalizeLocation} from './locations.mjs';
export function eventTimeRange(event,T=(en)=>en){
 const start=event.time||'';if(!/^\d{2}:\d{2}$/.test(start)||!(Number(event.durationMinutes)>0))return start;
 const [h,m]=start.split(':').map(Number),end=h*60+m+Number(event.durationMinutes),time=String(Math.floor(end/60)%24).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
 return start+'–'+time+(end>=1440?' · '+T('next day','למחרת'):'');
}
export function validateEventTime(event){
 if(event.durationMinutes!==undefined&&(!Number.isInteger(event.durationMinutes)||event.durationMinutes<5||event.durationMinutes>1440))throw Error('Choose a duration between 5 minutes and 24 hours.');
 if(event.location!==undefined)normalizeLocation(event.location);
}
