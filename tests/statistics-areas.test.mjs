// Statistics by area (user decision 2026-11-08): which areas show, the per-area numbers, and the access rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {statisticsUsage,tasksModel,calendarModel,kidsModel,shoppingModel,periodWindow,previousWindow,trend,monthlySpending,buckets} from '../app/src/statistics-data.js';
const end='2026-11-04';
const members=[{id:'daniel',role:'parent'},{id:'hila',role:'parent'},{id:'noa',role:'child'},{id:'itai',role:'child'}];
const fam={visibility:'family',ownerId:'daniel',allowedIds:[]};
const h=(id,memberId,date,extra={})=>({id,taskId:'t-'+id,title:'Task '+id,memberId,date,done:true,xp:10,...fam,...extra});
const base=()=>({tasks:[],events:[],history:[],purchases:[],expenses:[],profiles:{noa:{xp:120},itai:{xp:40}},preferences:{}});

test('only areas the household uses are offered, and Money only to parents',()=>{
 const empty=statisticsUsage({data:base(),user:'daniel',members:members.slice(0,2),parent:true});
 assert.deepEqual(empty,{tasks:false,calendar:false,kids:false,shopping:false,money:false});
 const d=base();d.history=[h('1','noa',end)];d.events=[{id:'e',date:end,memberIds:['noa'],...fam}];d.purchases=[{id:'p',date:end,done:true,...fam}];d.expenses=[{id:'x',amount:5,date:end,...fam}];
 assert.deepEqual(statisticsUsage({data:d,user:'daniel',members,parent:true}),{tasks:true,calendar:true,kids:true,shopping:true,money:true});
 assert.equal(statisticsUsage({data:d,user:'noa',members,parent:false}).money,false);
 const priv=base();priv.events=[{id:'e',date:end,visibility:'private',ownerId:'hila',allowedIds:[]}];
 assert.equal(statisticsUsage({data:priv,user:'daniel',members,parent:true}).calendar,false,'someone else’s private event does not make the area appear');
});

test('tasks: per-person bars, streaks and overdue, without other people’s private records',()=>{
 const d=base();d.history=[h('1','noa',end),h('2','noa','2026-11-03'),h('3','noa','2026-11-02'),h('4','itai',end),h('5','hila',end,{visibility:'private',ownerId:'hila'})];
 d.tasks=[{id:'late',title:'Late',memberId:'itai',date:'2026-11-01',done:false,...fam},{id:'daily',title:'Daily',repeat:'Daily',date:'2026-10-01',done:false,...fam}];
 const t=tasksModel({data:d,user:'daniel',range:'7',end,members});
 assert.equal(t.count,4);assert.equal(t.bars.length,7);assert.equal(t.bars.at(-1).total,2);assert.equal(t.bars.at(-1).noa,1);
 assert.equal(t.byPerson.find(p=>p.id==='noa').streak,3);assert.equal(t.longestStreak.id,'noa');
 assert.deepEqual(t.overdue.map(x=>x.id),['late'],'repeating tasks are not overdue');
 assert.equal(t.trend,null,'no records before the period: nothing to compare with');
 assert.equal(tasksModel({data:d,user:'hila',scope:'private',range:'7',end,members}).count,1);
});

test('trend compares with the previous window only when the family had started',()=>{
 const w=periodWindow('7',end);assert.deepEqual([w.start,w.end,w.days],['2026-10-29',end,7]);
 assert.equal(previousWindow(w,'2026-10-29'),null);assert.equal(previousWindow(w,'2026-10-20').end,'2026-10-28');
 assert.deepEqual(trend(12,10),{kind:'change',pct:20});assert.equal(trend(5,null),null);
 assert.equal(buckets(periodWindow('30',end)).length,30);assert.ok(buckets(periodWindow('all',end,'2025-01-01')).length<=31);
});

test('calendar: repeating events count on each day, by weekday and time of day',()=>{
 const d=base();d.events=[{id:'gym',date:'2026-10-01',time:'07:30',repeat:'weekly',memberIds:['hila'],...fam},{id:'party',date:'2026-11-06',time:'18:00',memberIds:['noa'],...fam}];
 const c=calendarModel({data:d,user:'daniel',range:'7',end,members});
 assert.equal(c.count,1);assert.equal(c.busiest,new Date('2026-10-29T12:00:00Z').getUTCDay());assert.equal(c.heat[c.busiest].slots[0].count,1);
 assert.equal(c.aheadTotal,2);assert.deepEqual(c.people.map(p=>p.count),[0,1,0,0]);
 assert.equal(calendarModel({data:d,user:'daniel',range:'7',end,members,person:'itai'}),null);
});

test('kids: a child sees only their own progress',()=>{
 const d=base();d.history=[h('1','noa',end),h('2','itai',end,{xp:20})];
 const all=kidsModel({data:d,user:'daniel',range:'7',end,members});
 assert.deepEqual(all.kids.map(k=>[k.id,k.periodXp,k.level]),[['noa',10,2],['itai',20,1]]);
 assert.deepEqual(kidsModel({data:d,user:'noa',range:'7',end,members,viewerIsChild:true}).kids.map(k=>k.id),['noa']);
 assert.equal(kidsModel({data:d,user:'daniel',range:'7',end,members:members.slice(0,2)}),null);
});

test('shopping: trips are days with checked-off items; month totals for money',()=>{
 const d=base();d.purchases=[{id:'a',title:'Milk',date:end,done:true,boughtBy:'noa',...fam},{id:'b',title:'Bread',date:end,done:true,...fam},{id:'c',title:'Eggs',date:'2026-11-01',done:true,...fam}];
 const s=shoppingModel({data:d,user:'daniel',range:'7',end});assert.equal(s.count,3);assert.equal(s.trips,2);assert.equal(s.perTrip,1.5);
 assert.deepEqual(shoppingModel({data:d,user:'daniel',range:'7',end,person:'noa'}).records.map(r=>r.id),['a']);
 assert.deepEqual(monthlySpending([{date:'2026-11-02',spent:500},{date:'2026-09-30',spent:100}],end,3).map(m=>m.total),[100,0,500]);
});
