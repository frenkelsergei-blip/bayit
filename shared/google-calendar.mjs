import {HOME_TIMEZONE} from './home-config.mjs';
import {calendarDate, clockTime} from './message-plan.mjs';

const formatter = new Intl.DateTimeFormat('sv-SE',{timeZone:HOME_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function localEventTime(day,time) {
 if (!calendarDate(day) || !clockTime(time)) return null;
 const target = Date.parse(day+'T'+time+':00Z');
 let instant = target;
 for (let tries=0;tries<4;tries++) {
  const local = formatter.format(instant).replace(' ','T');
  const correction = target-Date.parse(local+':00Z');
  if (!correction) return new Date(instant).toISOString();
  instant += correction;
 }
 return null;
}
const followingDay = date => new Date(Date.parse(date)+86400000).toISOString().slice(0,10);

export function googleEventFields(event) {
 if (event?.status === 'cancelled' || !event?.start || !event?.end) return null;
 const title = String(event.summary || '').trim().slice(0,160);
 if (!title) return null;
 if (event.start.date) return calendarDate(event.start.date) && event.end.date === followingDay(event.start.date) ?
  {title,date:event.start.date,time:'',durationMinutes:60} : null;
 const start=Date.parse(event.start.dateTime),end=Date.parse(event.end.dateTime),durationMinutes=Math.round((end-start)/60000);
 if (!Number.isFinite(start) || !Number.isInteger(durationMinutes) || durationMinutes<5 || durationMinutes>1440) return null;
 const [date,time]=formatter.format(start).split(' ');
 return {title,date,time,durationMinutes};
}

export function exportGoogleEvent(event) {
 if (!calendarDate(event.date) || event.deletedAt || (event.repeat && event.repeat !== 'once')) return null;
 const summary = event.title || event.he;
 if (!event.time) return {summary,start:{date:event.date},end:{date:followingDay(event.date)}};
 const start = localEventTime(event.date,event.time);
 if (!start) return null;
 return {summary,start:{dateTime:start,timeZone:HOME_TIMEZONE},
  end:{dateTime:new Date(Date.parse(start)+(event.durationMinutes || 60)*60000).toISOString(),timeZone:HOME_TIMEZONE}};
}

export function isFreeBusyFree(response,start,end) {
 const calendars = Object.values(response?.calendars || {});
 const result = calendars.length === 1 ? calendars[0] : null;
 if (!Array.isArray(result?.busy) || result.errors?.length) return null;
 if (result.busy.some(block=>!Number.isFinite(Date.parse(block?.start)) || !Number.isFinite(Date.parse(block?.end)))) return null;
 return result.busy.every(block => Date.parse(block.start)>=Date.parse(end) || Date.parse(block.end)<=Date.parse(start));
}
