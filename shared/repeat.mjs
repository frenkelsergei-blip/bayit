// The one repeat rule (custom repeat, 2026-11-12). Every screen, the server, reminders, Telegram and the AI decide
// "does this record happen on this date?" here.
//
// Stored shape (no migration): `repeat` is once | daily | weekly | monthly | yearly (routines: custom + weekdays),
// plus an optional whole-number `repeatEvery` (absent = 1), so "every 42 days" is {repeat:'daily',repeatEvery:42}.
// Maintenance keeps its older `intervalMonths` for monthly. `until` (YYYY-MM-DD) ends a repeat.
// Dates are plain calendar days (read at UTC noon), so daylight-saving changes in the home timezone cannot move a day.
import {serviceDue} from './maintenance-service.mjs';

export const REPEAT_UNITS=['daily','weekly','monthly','yearly'];
// Largest "every N" per unit: about a year of days or weeks, two years of months, ten years.
export const REPEAT_LIMITS={daily:365,weekly:52,monthly:24,yearly:10};
const DAY=86400000;
const parse=date=>Date.parse(date+'T12:00:00Z');
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(parse(value))&&iso(parse(value))===value;

export function repeatOf(record){return String(record?.repeat||(record?.routine?'daily':'once')).toLowerCase()}
// How many units between occurrences; anything missing or unusable counts as 1.
export function repeatEveryOf(record){
 const repeat=repeatOf(record),raw=record?.repeatEvery??(repeat==='monthly'?record?.intervalMonths:undefined),n=Number(raw);
 return Number.isInteger(n)&&n>=1?n:1;
}
export function addDays(date,days){return iso(parse(date)+days*DAY)}
// Months forward; a day the target month does not have (31st, 30th, 29 Feb) falls on that month's last day.
export function addMonths(date,months){
 const [y,m,d]=date.split('-').map(Number),first=new Date(Date.UTC(y,m-1+months,1,12)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(d,last));return iso(first.getTime());
}
const daysBetween=(from,to)=>Math.round((parse(to)-parse(from))/DAY);

export function occursOn(record,date){
 if(record.category==='maintenance')return serviceDue(record)===date;
 if(!record.date||date<record.date)return false;
 if(record.until&&date>record.until)return false;
 const repeat=repeatOf(record);
 if(repeat==='once')return date===record.date;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if(record.weekdays?.length&&record.routine)return record.weekdays.includes(weekday);
 const every=repeatEveryOf(record);
 if(repeat==='daily')return daysBetween(record.date,date)%every===0;
 if(repeat==='weekly')return daysBetween(record.date,date)%(7*every)===0;
 if(repeat==='monthly'||repeat==='yearly'){
  const [sy,sm]=record.date.split('-').map(Number),[y,m]=date.split('-').map(Number),months=(y-sy)*12+m-sm,step=repeat==='yearly'?12*every:every;
  return months%step===0&&addMonths(record.date,months)===date;
 }
 return true;
}

// The k-th occurrence (k=0 is the start date) for daily/weekly/monthly/yearly repeats.
function nth(record,k){
 const repeat=repeatOf(record),every=repeatEveryOf(record);
 if(repeat==='daily')return addDays(record.date,k*every);
 if(repeat==='weekly')return addDays(record.date,7*k*every);
 if(repeat==='monthly')return addMonths(record.date,k*every);
 return addMonths(record.date,12*k*every);
}
// The next `count` dates on or after `from` (the form's "Next: …" line). Stops at `until`.
export function nextOccurrences(record,from,count=3){
 if(!validDate(record?.date)||!REPEAT_UNITS.includes(repeatOf(record))||record.category==='maintenance')return [];
 const start=validDate(from)&&from>record.date?from:record.date,repeat=repeatOf(record),every=repeatEveryOf(record);
 const span=repeat==='daily'?every:repeat==='weekly'?7*every:repeat==='monthly'?28*every:365*every;
 let k=Math.max(0,Math.floor(daysBetween(record.date,start)/span)-1);const out=[];
 for(let guard=0;out.length<count&&guard<400;guard++,k++){const date=nth(record,k);if(record.until&&date>record.until)break;if(date>=start)out.push(date)}
 return out;
}
// One line for monthly on the 29th-31st and yearly on 29 February, saying where the date falls in shorter months.
export function shortMonthNote(record,lang='en'){
 const repeat=repeatOf(record),day=record?.date?.slice(8),he=lang==='he';
 if(repeat==='monthly'&&Number(day)>28)return he?'בחודש קצר יותר הוא נופל ביום האחרון של החודש.':'In a shorter month it falls on the last day.';
 if(repeat==='yearly'&&record.date.slice(5)==='02-29')return he?'בשנה בלי 29 בפברואר הוא נופל ב־28 בפברואר.':'In years without Feb 29 it falls on Feb 28.';
 return '';
}

const EN={daily:['day','days'],weekly:['week','weeks'],monthly:['month','months'],yearly:['year','years']};
const HE={daily:['יום','יומיים','ימים','יום'],weekly:['שבוע','שבועיים','שבועות','שבועות'],monthly:['חודש','חודשיים','חודשים','חודשים'],yearly:['שנה','שנתיים','שנים','שנה']};
const PLAIN={once:['Once','פעם אחת'],daily:['Every day','כל יום'],weekly:['Every week','כל שבוע'],monthly:['Every month','כל חודש'],yearly:['Every year','כל שנה']};
// "Every 42 days" / "כל 42 יום", "Every 3 months" / "כל 3 חודשים", "Every 2 weeks" / "כל שבועיים".
export function everyLabel(repeat,every,lang='en'){
 const he=lang==='he';every=Number.isInteger(Number(every))&&every>1?Number(every):1;
 if(!REPEAT_UNITS.includes(repeat))return PLAIN.once[he?1:0];
 if(every===1)return PLAIN[repeat][he?1:0];
 if(!he)return 'Every '+every+' '+EN[repeat][1];
 const w=HE[repeat];return every===2?'כל '+w[1]:'כל '+every+' '+(every>10?w[3]:w[2]);
}
export function describeRepeat(record,lang='en'){return everyLabel(repeatOf(record),repeatEveryOf(record),lang)}

// Server and form validation of the repeat fields. Returns an error message or ''.
export function repeatProblem(value){
 if(value?.repeatEvery===undefined||value.repeatEvery===null)return '';
 const repeat=repeatOf(value),n=value.repeatEvery;
 if(!REPEAT_UNITS.includes(repeat))return 'A custom repeat needs days, weeks, months or years.';
 if(!Number.isInteger(n)||n<1||n>REPEAT_LIMITS[repeat])return 'Choose a whole number from 1 to '+REPEAT_LIMITS[repeat]+'.';
 return '';
}
