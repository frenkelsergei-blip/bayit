// Several reminders on one event or task (like Google Calendar: up to 5, up to 4 weeks before).
// Shared by the web app (forms, details, inbox) and the cloud delivery (Telegram, Push).
//
// Record model, backward compatible:
//  - reminders: [4320,1440,10]  minutes before the start. Present → wins; [] = no reminders.
//  - reminder: n | 'none'       the older single choice, still read exactly as before when `reminders` is absent.
//  - neither                    the recipient's default from Settings › Notifications.
// An untimed (all-day) item starts at 00:00 of its day, so "1 day before at 09:00" is 900 and
// "on the day at 09:00" is -540. Untimed items only remind when they have their own `reminders` list.
// Defaults: notificationPrefs.reminders / categories.<c>.reminders lists, or the older single `reminder` number.

export const MAX_REMINDERS=5,MAX_LEAD=40320,MIN_UNTIMED_LEAD=-1439,ALL_DAY_TIME='09:00',DAY=1440;
export const REMINDER_PRESETS=[0,5,10,15,30,60,120,1440,2880,4320,10080];
export const ALL_DAY_PRESETS=[-540,900,2340,3780,9540]; // On the day, 1, 2, 3 days and 1 week before, at 09:00.

const integer=v=>typeof v==='number'&&Number.isInteger(v);
export const untimed=record=>!/^\d{2}:\d{2}$/.test(String(record?.time||''));

// Unique, valid, latest first (largest lead first), at most five.
export function normalizeReminders(list,{allDay=false}={}){
 if(!Array.isArray(list))return [];
 const min=allDay?MIN_UNTIMED_LEAD:0;
 return [...new Set(list.filter(n=>integer(n)&&n>=min&&n<=MAX_LEAD))].sort((a,b)=>b-a).slice(0,MAX_REMINDERS);
}

export function validateReminderList(value,label='reminders'){
 if(!Array.isArray(value)||value.length>MAX_REMINDERS||value.some(n=>!integer(n)||n<MIN_UNTIMED_LEAD||n>MAX_LEAD)||new Set(value).size!==value.length)throw Error('Choose up to '+MAX_REMINDERS+' different reminders, up to 4 weeks before ('+label+').');
}

// The item's own choice: an array (possibly empty), or null when it follows each recipient's default.
export function ownReminders(record){
 if(Array.isArray(record?.reminders))return normalizeReminders(record.reminders,{allDay:untimed(record)});
 if(untimed(record))return [];
 if(record?.reminder==='none')return [];
 const n=Number(record?.reminder);
 if(record?.reminder!==undefined&&record?.reminder!==null&&record?.reminder!==''&&Number.isFinite(n))return [n];
 return null;
}
export const hasOwnReminders=record=>ownReminders(record)!==null;

// Default list for a category: the category's own list or number, then the profile's, then 10 minutes.
// `prefs` is profile.notificationPrefs (not yet merged with the category).
export function defaultReminders(prefs={},category){
 for(const level of [category?prefs?.categories?.[category]:null,prefs]){
  if(!level)continue;
  if(Array.isArray(level.reminders))return normalizeReminders(level.reminders);
  const n=Number(level.reminder);if(level.reminder!==undefined&&level.reminder!==null&&level.reminder!==''&&Number.isFinite(n))return [n];
 }
 return [10];
}
const legacySingle=(record,prefs,category)=>{
 if(Array.isArray(record?.reminders))return false;
 if(ownReminders(record)!==null)return true;
 for(const level of [category?prefs?.categories?.[category]:null,prefs]){if(!level)continue;if(Array.isArray(level.reminders))return false;if(level.reminder!==undefined&&level.reminder!==null&&level.reminder!=='')return true}
 return true;
};

// The leads that apply to one recipient: {leads, source:'item'|'default', legacy}.
export function effectiveReminders(record,prefs,category){
 const own=ownReminders(record);
 return {leads:own??defaultReminders(prefs,category),source:own===null?'default':'item',legacy:legacySingle(record,prefs,category)};
}

const wall=(day,time)=>Date.parse(day+'T'+(time||'00:00')+':00Z')/60000;
export const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

// Fire times of one occurrence, earliest first. A single older-style reminder keeps its exact former rule
// (at most one day, never before 00:00 of the item's day). Newer lists keep sub-day leads on the item's day
// as well, and day-based leads (one day or more) fire on earlier days at the same clock time.
export function reminderSchedule(day,record,{leads,legacy}){
 const allDay=untimed(record),start=wall(day,allDay?'00:00':record.time),dayStart=wall(day,'00:00'),out=[];
 for(const lead of leads){
  let at;
  if(allDay)at=start-lead;
  else if(legacy){const l=Math.max(0,Math.min(DAY,lead));at=Math.max(dayStart,start-l);out.push({lead:l,at});continue}
  else at=lead>=DAY?start-lead:Math.max(dayStart,start-lead);
  out.push({lead,at});
 }
 return out.sort((a,b)=>a.at-b.at||b.lead-a.lead);
}

export const LATE_GRACE=5; // Minutes after the start a missed tick may still deliver.

// The reminder that is due now for one occurrence, or null. Each reminder may be delivered from its own time
// until the next reminder's time (or a few minutes after the start), so a reminder held back by quiet hours
// never piles up with the next one.
export function dueReminderFor(day,record,choice,{date,time}){
 const now=wall(date,time),allDay=untimed(record),end=allDay?wall(day,'23:59'):wall(day,record.time)+LATE_GRACE,schedule=reminderSchedule(day,record,choice);
 for(let i=schedule.length-1;i>=0;i--){const r=schedule[i],next=schedule[i+1];if(now<r.at)continue;if(next&&now>=next.at)return null;return now<=end?r:null}
 return null;
}

// How many days ahead the scheduler must look for this record's occurrences.
export const daysAhead=leads=>Math.min(29,Math.max(0,...leads.map(l=>Math.ceil(Math.max(0,l)/DAY))));

// ---- Labels ----
const L=(lang,en,he)=>lang==='he'?he:en;
export function splitLead(n,{allDay=false}={}){
 if(allDay){const days=Math.max(0,Math.ceil(n/DAY)),at=days*DAY-n,h=Math.floor(at/60),m=at%60;return {days,time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}}
 if(n>0&&n%10080===0)return {value:n/10080,unit:'weeks'};
 if(n>0&&n%DAY===0)return {value:n/DAY,unit:'days'};
 if(n>0&&n%60===0)return {value:n/60,unit:'hours'};
 return {value:n,unit:'minutes'};
}
export const UNIT_MINUTES={minutes:1,hours:60,days:DAY,weeks:10080};
export const allDayLead=(days,time)=>{const m=/^(\d{2}):(\d{2})$/.exec(time||ALL_DAY_TIME)||[0,9,0];return days*DAY-(Number(m[1])*60+Number(m[2]))};

const heCount=(n,one,two,many)=>n===1?one:n===2?two:n+' '+many;
export function leadLabel(n,lang='en',{allDay=false}={}){
 if(allDay){const {days,time}=splitLead(n,{allDay:true});
  if(days===0)return L(lang,'On the day at '+time,'ביום עצמו ב־'+time);
  if(days%7===0)return L(lang,(days/7===1?'1 week':days/7+' weeks')+' before at '+time,heCount(days/7,'שבוע','שבועיים','שבועות')+' לפני ב־'+time);
  return L(lang,(days===1?'1 day':days+' days')+' before at '+time,heCount(days,'יום','יומיים','ימים')+' לפני ב־'+time);
 }
 if(n===0)return L(lang,'At the start time','בזמן ההתחלה');
 const {value,unit}=splitLead(n);
 if(unit==='weeks')return L(lang,(value===1?'1 week':value+' weeks')+' before',heCount(value,'שבוע','שבועיים','שבועות')+' לפני');
 if(unit==='days')return L(lang,(value===1?'1 day':value+' days')+' before',heCount(value,'יום','יומיים','ימים')+' לפני');
 if(unit==='hours')return L(lang,(value===1?'1 hour':value+' hours')+' before',heCount(value,'שעה','שעתיים','שעות')+' לפני');
 return L(lang,(value===1?'1 minute':value+' minutes')+' before',(value===1?'דקה':value+' דקות')+' לפני');
}

// "in 10 min" on the day, "Tomorrow at 16:30", "In 3 days · Wed 11 Nov at 16:30". Dates are local calendar days.
// Always measured from the occurrence's own date and time, never from a reminder offset. A time that has
// passed reads "now" for a few minutes, then "25 min ago"; an earlier day reads as its date (never "in …").
const span=(n,lang)=>{const h=Math.floor(n/60),m=n%60;if(n<60)return L(lang,n+' min',n===1?'דקה':n+' דק׳');return L(lang,h+' h'+(m?' '+m+' min':''),(h===1?'שעה':h===2?'שעתיים':h+' שעות')+(m?' ו־'+(m===1?'דקה':m+' דק׳'):''))};
export function whenLabel({date:day,time:at},{date,time},lang='en'){
 const days=Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000),timed=/^\d{2}:\d{2}$/.test(at||'');
 const clock=timed?L(lang,' at ',' ב־')+at:'';
 const label=new Date(day+'T12:00:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
 if(days<0)return label+clock;
 if(days===0){
  if(!timed)return L(lang,'Today','היום');
  const left=wall(day,at)-wall(date,time);
  if(left<=0&&left>=-LATE_GRACE)return L(lang,'now','עכשיו');
  if(left<0)return L(lang,span(-left,lang)+' ago','לפני '+span(-left,lang));
  return L(lang,'in '+span(left,lang),'בעוד '+span(left,lang));
 }
 if(days===1)return L(lang,'Tomorrow','מחר')+clock;
 return L(lang,'In '+days+' days','בעוד '+(days===2?'יומיים':days+' ימים'))+' · '+label+clock;
}

// In-app inbox: for a later occurrence, the newest reminder whose time has come (null if none yet).
export function latestReminderAhead(day,record,choice,{date,time}){
 const now=wall(date,time);let found=null;
 for(const r of reminderSchedule(day,record,choice))if(r.at<=now)found=r;
 return found;
}
