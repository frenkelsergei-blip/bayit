// Statistics by area (user decision 2026-11-08, AGENTS.md "Statistics direction"). Pure functions over the household
// data, so they can be tested without the app. Every function only reads records the viewer may see (canSee /
// inScope); a missing area returns null instead of zeros, so the view can hide it.
import {canSee,anchor} from './data.js';
import {occursOn,completionState} from './domain.js';
import {activityRecords,purchaseRecords,inScope,rankBy} from './statistics.js';
import {heroBalance} from '../../shared/hero-home.mjs';

const DAY=86400000;
export const isoDay=t=>new Date(t).toISOString().slice(0,10);
export const addDays=(date,n)=>isoDay(Date.parse(date+'T12:00:00Z')+n*DAY);
const between=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY);

// The selected period as a window of days ending on `end`. "All" starts at the oldest record given (at most 2 years).
export function periodWindow(range,end=anchor,oldest){
 const days=range==='all'?Math.min(730,Math.max(7,oldest&&oldest<end?between(oldest,end)+1:7)):Math.max(1,Number(range)||7);
 return {start:addDays(end,-(days-1)),end,days,range};
}
// The previous window of the same length, or null when there is nothing to compare with ("All", or no record
// before the current period: the family had not started yet, which is not the same as zero).
export const previousWindow=(w,oldest)=>{if(w.range==='all'||!oldest)return null;const p={start:addDays(w.start,-w.days),end:addDays(w.start,-1),days:w.days,range:w.range};return oldest<=p.end?p:null};
export const windowDays=w=>Array.from({length:w.days},(_,i)=>addDays(w.start,i));
const inWindow=(date,w)=>!!date&&date>=w.start&&date<=w.end;
// Days grouped into at most `max` bars (one per day for 7 days, weeks for longer periods).
export function buckets(w,max=31){
 const size=w.days<=max?1:w.days<=7*16?7:Math.ceil(w.days/max);
 const out=[];for(let i=0;i<w.days;i+=size)out.push({date:addDays(w.start,i),endDate:addDays(w.start,Math.min(w.days-1,i+size-1))});
 return out;
}
const bucketOf=(list,date)=>list.find(b=>date>=b.date&&date<=b.endDate);
// Change against the previous window: null when there is nothing to compare with.
export function trend(now,before){if(before===null||before===undefined)return null;if(!before)return now?{kind:'new'}:null;return {kind:'change',pct:Math.round((now-before)/before*100)}}
const oldestDate=list=>list.map(r=>r.date).filter(Boolean).sort()[0];
const isRoutine=(r,data)=>r.routine===true||(data.tasks||[]).some(t=>t.routine&&t.id===r.taskId);

// ---------- which areas this household uses (for this viewer) ----------
export function statisticsUsage({data,user,members,parent,money}){
 const seen=list=>(list||[]).filter(r=>canSee(r,user));
 const children=members.filter(m=>m.role==='child');
 return {
  tasks:seen(data.history).some(h=>h.done)||seen(data.tasks).some(t=>t.kind!=='shopping'),
  calendar:seen(data.events).length>0,
  kids:children.length>0&&(children.some(c=>(data.profiles?.[c.id]?.xp||0)>0)||seen(data.tasks).some(t=>t.routine)),
  shopping:seen(data.purchases).some(p=>p.done),
  money:!!parent&&(seen(data.expenses).length>0||!!money?.transactions?.length||(Number(data.preferences?.monthlyBudget)||0)>0),
 };
}

// ---------- Tasks & routines ----------
export function tasksModel({data,user,scope='family',range='7',end=anchor,person='all',members=[],recordType='all'}){
 const kind=r=>recordType==='all'||(recordType==='routines'?isRoutine(r,data):!isRoutine(r,data));
 const all=activityRecords(data,user,scope,'all',end,person).filter(kind);
 const oldest=oldestDate(all),w=periodWindow(range,end,oldest),prevW=previousWindow(w,oldest);
 const records=all.filter(r=>inWindow(r.date,w)),previous=prevW?all.filter(r=>inWindow(r.date,prevW)):null;
 const people=members.filter(m=>person==='all'||m.id===person);
 const bars=buckets(w).map(b=>({...b,total:0,...Object.fromEntries(people.map(m=>[m.id,0]))}));
 for(const r of records){const b=bucketOf(bars,r.date);if(b){b.total++;if(r.memberId in b)b[r.memberId]++}}
 const datesBy=id=>new Set(activityRecords(data,user,scope,'all',end,id).filter(kind).map(r=>r.date));
 const streakOf=id=>{const dates=datesBy(id);let day=dates.has(end)?end:addDays(end,-1),n=0;while(dates.has(day)){n++;day=addDays(day,-1)}return n};
 const byPerson=people.map(m=>({id:m.id,count:records.filter(r=>r.memberId===m.id).length,xp:records.filter(r=>r.memberId===m.id).reduce((n,r)=>n+(r.xp||0),0),streak:streakOf(m.id)}));
 const overdue=(data.tasks||[]).filter(t=>t.kind!=='shopping'&&!t.routine&&(!t.repeat||String(t.repeat).toLowerCase()==='once')&&t.date&&t.date<end&&inScope(t,user,scope)&&(person==='all'||t.memberId===person)&&completionState(t,t.date)!=='done'&&!t.done);
 const activeDays=new Set(records.map(r=>r.date)).size;
 return {window:w,records,count:records.length,previous:previous?previous.length:null,trend:trend(records.length,previous?previous.length:null),bars,people:people.map(m=>m.id),byPerson,
  longestStreak:byPerson.reduce((best,p)=>p.streak>best.streak?p:best,{id:null,streak:0}),overdue,activeDays,ranking:rankBy(records,r=>r.title),spark:bars.map(b=>b.total)};
}

// ---------- Calendar ----------
const SLOTS=[['morning',0,12],['afternoon',12,17],['evening',17,24]];
export function calendarModel({data,user,scope='family',range='7',end=anchor,person='all',members=[]}){
 const events=(data.events||[]).filter(e=>inScope(e,user,scope)&&(person==='all'||(e.memberIds||[]).includes(person)||(!e.memberIds?.length&&e.ownerId===person)));
 if(!events.length)return null;
 const oldest=oldestDate(events),w=periodWindow(range,end,oldest),prevW=previousWindow(w,oldest);
 const occurrences=win=>windowDays(win).flatMap(date=>events.filter(e=>occursOn(e,date)).map(e=>({date,event:e})));
 const list=occurrences(w),previous=prevW?occurrences(prevW).length:null;
 const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
 const heat=Array.from({length:7},(_,day)=>({day,slots:SLOTS.map(([slot,from,to])=>({slot,count:list.filter(o=>weekday(o.date)===day&&o.event.time&&Number(o.event.time.slice(0,2))>=from&&Number(o.event.time.slice(0,2))<to).length})),allDay:list.filter(o=>weekday(o.date)===day&&!o.event.time).length}));
 const perDay=heat.map(h=>h.slots.reduce((n,s)=>n+s.count,0)+h.allDay),busiest=perDay.some(Boolean)?perDay.indexOf(Math.max(...perDay)):null;
 const people=members.filter(m=>person==='all'||m.id===person).map(m=>({id:m.id,count:list.filter(o=>(o.event.memberIds||[]).includes(m.id)).length}));
 const ahead=Array.from({length:7},(_,i)=>{const date=addDays(end,i+1);return {date,count:events.filter(e=>occursOn(e,date)).length}});
 const bars=buckets(w).map(b=>({...b,total:list.filter(o=>o.date>=b.date&&o.date<=b.endDate).length}));
 return {window:w,count:list.length,previous,trend:trend(list.length,previous),heat,busiest,people,ahead,aheadTotal:ahead.reduce((n,d)=>n+d.count,0),bars,spark:bars.map(b=>b.total)};
}

// ---------- Kids ----------
// XP comes from completed records the viewer may see; level and stars come from each child's profile.
export function kidsModel({data,user,range='7',end=anchor,person='all',members=[],viewerIsChild=false}){
 const children=members.filter(m=>m.role==='child'&&(viewerIsChild?m.id===user:person==='all'||m.id===person));
 if(!children.length)return null;
 const history=[...new Map((data.history||[]).filter(h=>h.done&&canSee(h,user)).map(h=>[h.taskId+'|'+h.date+'|'+(h.memberId||''),h])).values()];
 const mine=id=>history.filter(h=>h.memberId===id);
 const oldest=oldestDate(children.flatMap(c=>mine(c.id))),w=periodWindow(range,end,oldest),prevW=previousWindow(w,oldest),days=buckets(w);
 const sum=(list,win)=>list.filter(h=>inWindow(h.date,win)).reduce((n,h)=>n+(h.xp||0),0);
 const kids=children.map(c=>{const list=mine(c.id),profile=data.profiles?.[c.id]||{},xp=Number(profile.xp)||0;
  return {id:c.id,xp,level:Math.floor(xp/100)+1,toNext:100-xp%100,stars:heroBalance(profile),periodXp:sum(list,w),previousXp:prevW?sum(list,prevW):null,
   routines:list.filter(h=>inWindow(h.date,w)&&isRoutine(h,data)).length,activeDays:new Set(list.filter(h=>inWindow(h.date,w)).map(h=>h.date)).size}});
 const series=days.map(b=>({...b,...Object.fromEntries(children.map(c=>[c.id,mine(c.id).filter(h=>h.date>=b.date&&h.date<=b.endDate).reduce((n,h)=>n+(h.xp||0),0)]))}));
 const periodXp=kids.reduce((n,k)=>n+k.periodXp,0),previous=prevW?kids.reduce((n,k)=>n+k.previousXp,0):null;
 return {window:w,kids,series,periodXp,previous,trend:trend(periodXp,previous),spark:series.map(s=>children.reduce((n,c)=>n+s[c.id],0))};
}

// ---------- Shopping ----------
export function shoppingModel({data,user,scope='family',range='30',end=anchor,person='all',group='all'}){
 const all=purchaseRecords(data,user,scope,'all',end,person).filter(r=>group==='all'||(r.group||'Other')===group);
 if(!all.length)return null;
 const oldest=oldestDate(all),w=periodWindow(range,end,oldest),prevW=previousWindow(w,oldest);
 const records=all.filter(r=>inWindow(r.date,w)),previous=prevW?all.filter(r=>inWindow(r.date,prevW)):null;
 const trips=new Set(records.map(r=>r.date)).size,previousTrips=previous?new Set(previous.map(r=>r.date)).size:null;
 const bars=buckets(w).map(b=>({...b,total:records.filter(r=>r.date>=b.date&&r.date<=b.endDate).length,trips:new Set(records.filter(r=>r.date>=b.date&&r.date<=b.endDate).map(r=>r.date)).size}));
 return {window:w,records,count:records.length,trips,previousTrips,trend:trend(trips,previousTrips),perTrip:trips?Math.round(records.length/trips*10)/10:0,
  ranking:rankBy(records,r=>r.title),categories:rankBy(records,r=>r.group||'Other'),groups:[...new Set(all.map(r=>r.group||'Other'))],bars,spark:bars.map(b=>b.total)};
}

// ---------- Money: spending per month for the last `months` months, from rows already filtered by access ----------
export function monthlySpending(rows,end=anchor,months=6){
 const last=end.slice(0,7),keys=Array.from({length:months},(_,i)=>{const d=new Date(Date.parse(last+'-15T12:00:00Z'));d.setUTCMonth(d.getUTCMonth()-(months-1-i));return d.toISOString().slice(0,7)});
 return keys.map(month=>({month,total:rows.filter(r=>String(r.date||'').slice(0,7)===month).reduce((n,r)=>n+r.spent,0)}));
}
