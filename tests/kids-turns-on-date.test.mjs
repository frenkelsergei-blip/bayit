// Whose turn it is (user request 2026-11-11): one shared computation for the Turns screen and Bayit AI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {turnsOnDate} from '../shared/kids-context.mjs';

const members=[{id:'dana',role:'parent'},{id:'itai',role:'child'},{id:'noa',role:'child'}];
const routine=(memberId,title,extra={})=>({id:memberId+'-'+title,title,he:title==='Shower'?'מקלחת':'ארוחת ערב',memberId,routine:true,repeat:'daily',date:'2026-11-01',time:'19:00',...extra});
const tasks=[routine('noa','Shower'),routine('itai','Shower'),routine('itai','Dinner',{turnOrder:'none',time:'18:00'}),routine('noa','Dinner',{turnOrder:'none',time:'18:00'})];

test('Together routines never appear as turns',()=>{
 assert.deepEqual(turnsOnDate(tasks,members,'2026-11-11').map(t=>t.title),['Shower']);
});
test('alternate rotates one step a day from the routine start, in family order',()=>{
 const day=d=>turnsOnDate(tasks,members,d)[0].order;
 assert.deepEqual(day('2026-11-01'),['itai','noa'],'start day: family order');
 assert.deepEqual(day('2026-11-02'),['noa','itai']);
 assert.deepEqual(day('2026-11-11'),['itai','noa'],'10 days later: the same child starts again');
 assert.deepEqual(day('2026-11-12'),['noa','itai'],'tomorrow really differs from today');
});
test('fixed keeps the family order every day',()=>{
 const fixed=tasks.map(t=>t.title==='Shower'?{...t,turnOrder:'fixed'}:t);
 for(const d of ['2026-11-11','2026-11-12'])assert.deepEqual(turnsOnDate(fixed,members,d)[0].order,['itai','noa']);
});
test('a parent\'s swap wins for that day only and is reported',()=>{
 const preferences={turnOverrides:{'2026-11-11|Shower':['noa','itai']}};
 const today=turnsOnDate(tasks,members,'2026-11-11',preferences)[0],tomorrow=turnsOnDate(tasks,members,'2026-11-12',preferences)[0];
 assert.deepEqual(today.order,['noa','itai'],'the swap');assert.equal(today.changedByParent,true);
 assert.deepEqual(tomorrow.order,['noa','itai'],'tomorrow: the planned rotation');assert.equal(tomorrow.changedByParent,false);
});
test('slot times follow the earliest routine time and the interval',()=>{
 assert.deepEqual(turnsOnDate(tasks,members,'2026-11-11',{turnInterval:20})[0].times,['19:00','19:20']);
 assert.deepEqual(turnsOnDate(tasks,members,'2026-11-11')[0].times,['19:00','19:15']);
});
test('routines that do not happen that day are left out',()=>{
 const weekly=tasks.map(t=>t.title==='Shower'?{...t,weekdays:[0]}:t);// Sundays only
 assert.equal(turnsOnDate(weekly,members,'2026-11-11').length,0);// a Wednesday
 assert.equal(turnsOnDate(weekly,members,'2026-11-15').length,1);// a Sunday
});
