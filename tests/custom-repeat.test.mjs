// Custom repeat (owner's choice A, 2026-11-12): "every N days | weeks | months | years" for events and tasks.
// One rule (shared/repeat.mjs) for every screen, the server, reminders, Telegram and the AI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {occursOn,nextOccurrences,everyLabel,describeRepeat,repeatEveryOf,shortMonthNote,repeatProblem,addMonths,REPEAT_LIMITS} from '../shared/repeat.mjs';
import {occursOn as domainOccursOn,completeTask,completionState} from '../app/src/domain.js';
import {validateRecord} from '../shared/state-validation.mjs';
import {blankState,visibleState,diffState,applyChanges} from '../app/cloud/state.mjs';
import {dueReminders} from '../app/cloud/reminders.mjs';
import {dayReport} from '../app/cloud/telegram-format.mjs';
import {normalizeAITools,applyAIPlan,filterAIContext,aiTools} from '../shared/ai-contract.mjs';
import {homeToday,taskStateNow} from '../shared/ai-actions.mjs';
import {repeatLabel} from '../app/src/repeat-label.js';
import catalog from '../design-system/bayit-icons.json' with {type:'json'};

const on=(record,dates)=>dates.filter(d=>occursOn(record,d));
const days=(from,n)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T12:00:00Z')+i*864e5).toISOString().slice(0,10));
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);

// The rule exactly as it was before this change (app/src/domain.js, live 1.73.0), to prove old records are unchanged.
import {serviceDue} from '../shared/maintenance-service.mjs';
function legacyOccursOn(record,date){
 if(record.category==='maintenance')return serviceDue(record)===date;
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

test('old records without repeatEvery behave exactly as before, day by day over four years',()=>{
 const records=[];
 for(const date of ['2026-01-31','2026-02-28','2027-03-29','2028-02-29','2026-11-04','2026-12-31'])
  for(const repeat of [undefined,'once','daily','weekly','monthly','yearly','Weekly','custom'])
   for(const until of [undefined,'2027-06-30'])records.push({date,repeat,until});
 records.push({date:'2026-11-01',routine:true,weekdays:[0,3,5]},{date:'2026-11-01',routine:true},{date:'2026-11-01',repeat:'custom',weekdays:[1,2]});
 records.push({date:'2026-01-31',repeat:'monthly',intervalMonths:6},{date:'2026-08-31',repeat:'monthly',intervalMonths:3},{date:'2026-11-10',category:'maintenance',repeat:'monthly',intervalMonths:6,completions:{'2026-11-10':{state:'done'}}});
 const all=days('2025-12-01',4*366);
 for(const r of records)for(const d of all)assert.equal(occursOn(r,d),legacyOccursOn(r,d),JSON.stringify(r)+' '+d);
 assert.equal(domainOccursOn,occursOn,'app/src/domain.js re-exports the shared rule');
});

test('every N days: every 42 days and every 45 days',()=>{
 const e42={date:'2026-11-04',repeat:'daily',repeatEvery:42},e45={date:'2026-11-04',repeat:'daily',repeatEvery:45};
 assert.deepEqual(on(e42,days('2026-11-01',140)),['2026-11-04','2026-12-16','2027-01-27','2027-03-10']);
 assert.deepEqual(on(e45,days('2026-11-01',140)),['2026-11-04','2026-12-19','2027-02-02','2027-03-19']);
 assert.equal(occursOn(e42,'2026-11-03'),false,'never before the start');
});

test('every N weeks keeps the weekday: every 6 weeks',()=>{
 const r={date:'2026-11-04',repeat:'weekly',repeatEvery:6};
 const hits=on(r,days('2026-11-01',200));
 assert.deepEqual(hits,['2026-11-04','2026-12-16','2027-01-27','2027-03-10','2027-04-21']);
 assert.ok(hits.every(d=>new Date(d+'T12:00Z').getUTCDay()===3));
});

test('every N months: the 31st every 3 months falls on the last day of a shorter month',()=>{
 const r={date:'2027-01-31',repeat:'monthly',repeatEvery:3};
 assert.deepEqual(on(r,days('2027-01-01',800)),['2027-01-31','2027-04-30','2027-07-31','2027-10-31','2028-01-31','2028-04-30','2028-07-31','2028-10-31','2029-01-31']);
 assert.equal(occursOn(r,'2027-05-01'),false,'never spills into the next month');
 const feb={date:'2027-11-30',repeat:'monthly',repeatEvery:3};
 assert.deepEqual(on(feb,days('2027-11-01',220)),['2027-11-30','2028-02-29','2028-05-30'],'leap February gets the 29th');
 const feb2={date:'2026-11-30',repeat:'monthly',repeatEvery:3};
 assert.ok(occursOn(feb2,'2027-02-28')&&!occursOn(feb2,'2027-03-02'));
 assert.equal(shortMonthNote(r),'In a shorter month it falls on the last day.');
 assert.equal(shortMonthNote(r,'he'),'בחודש קצר יותר הוא נופל ביום האחרון של החודש.');
 assert.equal(shortMonthNote({date:'2027-01-28',repeat:'monthly',repeatEvery:3}),'');
});

test('every N years and 29 February',()=>{
 const r={date:'2028-02-29',repeat:'yearly',repeatEvery:2};
 assert.deepEqual(on(r,days('2028-01-01',366*9)).filter(d=>d.slice(5,7)==='02'),['2028-02-29','2030-02-28','2032-02-29','2034-02-28','2036-02-29']);
 assert.equal(occursOn({date:'2028-02-29',repeat:'yearly',repeatEvery:1},'2029-02-28'),true,'the old yearly rule: 28 Feb in other years');
 assert.equal(shortMonthNote(r),'In years without Feb 29 it falls on Feb 28.');
 assert.deepEqual(on({date:'2026-06-15',repeat:'yearly',repeatEvery:3},days('2026-01-01',366*7)),['2026-06-15','2029-06-15','2032-06-15']);
});

test('daylight saving in the home timezone never moves a day (calendar days, not clock hours)',()=>{
 // Israel: summer time ends 2026-10-25 and starts 2027-03-26.
 const autumn={date:'2026-10-18',repeat:'daily',repeatEvery:7},spring={date:'2027-02-12',repeat:'daily',repeatEvery:42};
 assert.deepEqual(on(autumn,days('2026-10-15',30)),['2026-10-18','2026-10-25','2026-11-01','2026-11-08']);
 assert.deepEqual(on(spring,days('2027-02-01',120)),['2027-02-12','2027-03-26','2027-05-07']);
 assert.deepEqual(on({date:'2026-03-27',repeat:'weekly',repeatEvery:2},days('2026-03-20',30)),['2026-03-27','2026-04-10']);
 assert.equal(addMonths('2027-02-26',1),'2027-03-26');
});

test('an end date stops a custom repeat; repeatEvery alone never makes a one-off repeat',()=>{
 const r={date:'2026-11-04',repeat:'daily',repeatEvery:42,until:'2027-01-27'};
 assert.deepEqual(on(r,days('2026-11-01',200)),['2026-11-04','2026-12-16','2027-01-27']);
 assert.deepEqual(on({date:'2026-11-04',repeat:'once',repeatEvery:42},days('2026-11-01',100)),['2026-11-04']);
 assert.equal(repeatEveryOf({repeat:'daily',repeatEvery:'x'}),1,'unusable values count as 1');
 assert.equal(repeatEveryOf({repeat:'monthly',intervalMonths:6}),6,'maintenance keeps intervalMonths');
 assert.equal(repeatEveryOf({repeat:'monthly',intervalMonths:6,repeatEvery:2}),2);
});

test('the "next dates" preview: three dates, years shown, end date respected',()=>{
 const r={date:'2026-11-04',repeat:'daily',repeatEvery:42};
 assert.deepEqual(nextOccurrences(r,'2026-11-05',3),['2026-12-16','2027-01-27','2027-03-10']);
 assert.deepEqual(nextOccurrences(r,'2026-12-16',2),['2026-12-16','2027-01-27'],'today counts when it is an occurrence');
 assert.deepEqual(nextOccurrences({...r,until:'2027-01-30'},'2026-11-05',3),['2026-12-16','2027-01-27']);
 assert.deepEqual(nextOccurrences({date:'2027-01-31',repeat:'monthly',repeatEvery:3},'2027-02-01',3),['2027-04-30','2027-07-31','2027-10-31']);
 assert.deepEqual(nextOccurrences({date:'2016-01-01',repeat:'daily'},'2026-11-04',2),['2026-11-04','2026-11-05'],'an old daily series is fast and exact');
 assert.deepEqual(nextOccurrences({date:'2026-11-04',repeat:'once'},'2026-11-01',3),[]);
 // the preview agrees with the rule for every unit and many intervals
 for(const repeat of ['daily','weekly','monthly','yearly'])for(const n of [1,2,3,6,7,13]){const rec={date:'2026-01-31',repeat,repeatEvery:n},from='2027-05-17',got=nextOccurrences(rec,from,4);
  const want=[];for(let d=from;want.length<4&&d<'2120-01-01';d=addDays(d,1))if(occursOn(rec,d))want.push(d);assert.deepEqual(got,want,repeat+' '+n)}
});

test('wording: "Every 42 days", "Every 3 months", Hebrew numbers and pairs',()=>{
 assert.equal(everyLabel('daily',42),'Every 42 days');assert.equal(everyLabel('monthly',3),'Every 3 months');assert.equal(everyLabel('weekly',1),'Every week');
 assert.equal(everyLabel('daily',42,'he'),'כל 42 יום');assert.equal(everyLabel('daily',45,'he'),'כל 45 יום');assert.equal(everyLabel('daily',3,'he'),'כל 3 ימים');
 assert.equal(everyLabel('weekly',2,'he'),'כל שבועיים');assert.equal(everyLabel('weekly',6,'he'),'כל 6 שבועות');assert.equal(everyLabel('monthly',3,'he'),'כל 3 חודשים');
 assert.equal(everyLabel('monthly',2,'he'),'כל חודשיים');assert.equal(everyLabel('yearly',2,'he'),'כל שנתיים');assert.equal(everyLabel('monthly',1,'he'),'כל חודש');
 assert.equal(describeRepeat({repeat:'weekly',repeatEvery:6}),'Every 6 weeks');assert.equal(describeRepeat({repeat:'once'}),'Once');
 const T=(en,he)=>en,H=(en,he)=>he;
 assert.equal(repeatLabel('daily',T,undefined,42),'Every 42 days');assert.equal(repeatLabel('daily',H,undefined,42),'כל 42 יום');
 assert.equal(repeatLabel('weekly',T),'Every week','old records read as before');assert.equal(repeatLabel('custom',T,[1,3]),'2 days a week');assert.equal(repeatLabel('once',H),'פעם אחת');
});

test('server validation: whole numbers within the limits, only with a repeating unit',()=>{
 const base={id:'e1',title:'Lenses',date:'2026-11-04',time:'21:00',ownerId:'a',visibility:'family',allowedIds:[]};
 for(const [repeat,n] of [['daily',42],['daily',365],['weekly',52],['monthly',24],['yearly',10],['weekly',1]]){validateRecord('events',{...base,repeat,repeatEvery:n});validateRecord('tasks',{...base,repeat,repeatEvery:n})}
 validateRecord('events',{...base,repeat:'weekly'});
 for(const [repeat,n] of [['daily',366],['weekly',53],['monthly',25],['yearly',11],['daily',0],['daily',-3],['daily',1.5],['daily','6'],['once',6],['custom',6],[undefined,6]])
  for(const c of ['events','tasks'])assert.throws(()=>validateRecord(c,{...base,repeat,repeatEvery:n}),undefined,c+' '+repeat+' '+n);
 assert.deepEqual(REPEAT_LIMITS,{daily:365,weekly:52,monthly:24,yearly:10});
 assert.equal(repeatProblem({repeat:'daily',repeatEvery:400}),'Choose a whole number from 1 to 365.');
});

const members=[{id:'mom',name:'Mom',he:'אמא',role:'parent'},{id:'dad',name:'Dad',he:'אבא',role:'parent'},{id:'kid',name:'Kid',he:'ילד',role:'child'}];
const fam=(owner,extra={})=>({ownerId:owner,visibility:'family',allowedIds:[],...extra});
function home(){const s=blankState('h1','Test',members[0]);s.members=members;for(const m of members.slice(1))s.profiles[m.id]={name:m.name,he:m.he,xp:0};return s}

test('reminders and the Telegram morning message use the custom repeat: right days only',()=>{
 const s=home();s.events=[{id:'lenses',title:'Change lenses',he:'החלפת עדשות',date:'2026-11-04',time:'18:10',memberIds:['mom'],durationMinutes:15,repeat:'daily',repeatEvery:42,...fam('mom')}];
 s.tasks=[{id:'filter',title:'Water filter',he:'מסנן מים',date:'2026-11-04',time:'09:00',memberId:'mom',repeat:'monthly',repeatEvery:3,done:false,xp:0,...fam('mom')}];
 const view=visibleState(s,'mom');
 const at=(date,time)=>dueReminders(view,'mom',{date,time}).map(r=>r.record.id+'@'+r.date);
 assert.deepEqual(at('2026-12-16','18:00'),['lenses@2026-12-16']);
 assert.deepEqual(at('2026-12-15','18:00'),[]);assert.deepEqual(at('2026-11-25','18:00'),[]);
 assert.deepEqual(at('2027-02-04','08:50'),['filter@2027-02-04']);assert.deepEqual(at('2027-01-04','08:50'),[]);
 const report=date=>dayReport(view,{memberId:'mom',role:'parent',date,lang:'en',members}).text;
 assert.match(report('2027-01-27'),/Change lenses/);assert.doesNotMatch(report('2027-01-26'),/Change lenses/);
 assert.match(report('2027-02-04'),/Water filter/);assert.doesNotMatch(report('2027-03-04'),/Water filter/);
});

test('single occurrences of a custom-repeat task are completed per date, and the server checks the date',()=>{
 const today=homeToday(),start=addDays(today,-45),s=home();
 s.tasks=[{id:'t45',title:'Every 45 days',he:'כל 45 יום',date:start,memberId:'mom',repeat:'daily',repeatEvery:45,done:false,xp:0,...fam('mom')}];
 const before=visibleState(s,'mom'),after=structuredClone(before);
 completeTask(after.tasks[0],{date:today,actorId:'mom',actorRole:'parent',time:'10:00',instant:new Date().toISOString()});
 const next=applyChanges(s,diffState(before,after),'mom','parent');
 assert.equal(completionState(next.tasks[0],today),'done');assert.equal(completionState(next.tasks[0],start),'open','the earlier occurrence stays its own');
 assert.equal(taskStateNow(next.tasks[0],today),'done');
 // a date that is not an occurrence is refused
 const b2=visibleState(next,'mom'),a2=structuredClone(b2);
 completeTask(a2.tasks[0],{date:addDays(today,-1),actorId:'mom',actorRole:'parent',time:'10:00',instant:new Date().toISOString()});
 assert.throws(()=>applyChanges(next,diffState(b2,a2),'mom','parent'));
 // repeatEvery is kept through a save and rejected when out of range
 const b3=visibleState(next,'mom'),a3=structuredClone(b3);a3.tasks[0].repeatEvery=400;
 assert.throws(()=>applyChanges(next,diffState(b3,a3),'mom','parent'),/1 to 365/);
});

const contextFor=(state,actorId)=>{const v=visibleState(state,actorId),today=homeToday(),records=[];for(const [c,type] of [['tasks','task'],['events','event']])records.push(...v[c].map(r=>({...r,type,state:type==='task'?taskStateNow(r,today):undefined})));return filterAIContext({actorId,members:state.members,scope:'family',records,today,shoppingLists:v.shoppingLists,taskLists:v.taskLists})};
const plan=(state,actorId,blocks)=>normalizeAITools(blocks.map(([name,input])=>({type:'tool_use',name,input})),contextFor(state,actorId),catalog,crypto.randomUUID()).plan;
const run=(state,actorId,p)=>{const before=visibleState(state,actorId),after=structuredClone(before);applyAIPlan(after,p,actorId,state.members,catalog);return applyChanges(state,diffState(before,after),actorId,members.find(m=>m.id===actorId).role)};

test('AI contract: the tools offer repeat and repeatEvery for events and tasks',()=>{
 const ev=aiTools.find(t=>t.name==='prepare_calendar_events').input_schema.properties.events.items.properties,tk=aiTools.find(t=>t.name==='prepare_tasks').input_schema.properties.tasks.items.properties;
 assert.deepEqual(ev.repeat.enum,['once','daily','weekly','monthly','yearly']);assert.deepEqual(tk.repeat.enum,['once','daily','weekly','monthly','yearly']);
 for(const p of [ev,tk]){assert.equal(p.repeatEvery.type,'integer');assert.match(p.repeatEvery.description,/six weeks/)}
});

test('AI contract: "every six weeks" prepares a weekly event with repeatEvery 6; Apply saves it and the server accepts it',()=>{
 const s=home(),today=homeToday();
 const p=plan(s,'mom',[['prepare_calendar_events',{events:[{title:'Haircut',date:today,time:'17:00',repeat:'weekly',repeatEvery:6}]}]]);
 assert.equal(p.actions[0].kind,'event.create');assert.equal(p.actions[0].repeat,'weekly');assert.equal(p.actions[0].repeatEvery,6);
 const saved=run(s,'mom',p).events.find(e=>e.title==='Haircut');
 assert.equal(saved.repeat,'weekly');assert.equal(saved.repeatEvery,6);assert.ok(occursOn(saved,addDays(today,42))&&!occursOn(saved,addDays(today,7)));
 // plain requests stay as before: no repeat = a one-off event, repeatEvery 1 = plain weekly
 const once=plan(s,'mom',[['prepare_calendar_events',{events:[{title:'Dentist',date:today,time:'09:00'}]}]]).actions[0];assert.equal(once.repeat,'once');assert.equal(once.repeatEvery,undefined);
 const weekly=plan(s,'mom',[['prepare_calendar_events',{events:[{title:'Yoga',date:today,time:'08:00',repeat:'weekly',repeatEvery:1}]}]]).actions[0];assert.equal(weekly.repeatEvery,undefined);
 assert.equal(run(s,'mom',plan(s,'mom',[['prepare_calendar_events',{events:[{title:'Dentist',date:today,time:'09:00'}]}]])).events.find(e=>e.title==='Dentist').repeat,'once');
});

test('AI contract: tasks every 3 months / every 45 days; out-of-range and nonsense are refused before Apply',()=>{
 const s=home(),today=homeToday();
 const p=plan(s,'mom',[['prepare_tasks',{tasks:[{title:'Replace water filter',date:today,repeat:'monthly',repeatEvery:3},{title:'Change lenses',date:today,repeat:'daily',repeatEvery:45}]}]]);
 assert.deepEqual(p.actions.map(a=>[a.repeat,a.repeatEvery]),[['monthly',3],['daily',45]]);
 const saved=run(s,'mom',p).tasks;assert.equal(saved.find(t=>t.title==='Replace water filter').repeatEvery,3);assert.equal(saved.find(t=>t.title==='Change lenses').repeatEvery,45);
 assert.throws(()=>plan(s,'mom',[['prepare_calendar_events',{events:[{title:'X',date:today,time:'10:00',repeat:'weekly',repeatEvery:60}]}]]),/1 to 52/);
 assert.throws(()=>plan(s,'mom',[['prepare_tasks',{tasks:[{title:'X',date:today,repeat:'daily',repeatEvery:2.5}]}]]),/whole number/);
 const odd=plan(s,'mom',[['prepare_tasks',{tasks:[{title:'Y',date:today,repeat:'fortnightly',repeatEvery:3}]}]]).actions[0];assert.equal(odd.repeat,'once');assert.equal(odd.repeatEvery,undefined);
});

test('AI context: the AI reads a custom repeat on existing records',()=>{
 const s=home();s.events=[{id:'lenses',title:'Change lenses',he:'החלפת עדשות',date:'2026-11-04',time:'21:00',memberIds:['mom'],repeat:'daily',repeatEvery:42,...fam('mom')},{id:'yoga',title:'Yoga',he:'יוגה',date:'2026-11-04',time:'08:00',memberIds:['mom'],repeat:'weekly',...fam('mom')}];
 const recs=contextFor(s,'mom').records;
 assert.deepEqual([recs.find(r=>r.id==='lenses').repeat,recs.find(r=>r.id==='lenses').repeatEvery],['daily',42]);
 assert.equal(recs.find(r=>r.id==='yoga').repeatEvery,undefined);
});
