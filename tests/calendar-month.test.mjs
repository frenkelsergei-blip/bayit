import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDates,monthDayEvents} from '../app/src/calendar-month-model.mjs';

test('November 2026 has five complete Sunday-start weeks with unique consecutive dates',()=>{
 const dates=monthDates('2026-11-11',0);
 assert.equal(dates.length,35);
 assert.equal(dates[0],'2026-11-01');
 assert.equal(dates.at(-1),'2026-12-05');
 assert.equal(new Set(dates).size,dates.length);
 assert.ok(dates.every((day,index)=>!index||Date.parse(day)-Date.parse(dates[index-1])===86400000));
});

test('six-week months and alternative week starts retain every date',()=>{
 const august=monthDates('2026-08-15',0),november=monthDates('2026-11-11',1);
 assert.equal(august.length,42);
 assert.equal(august[0],'2026-07-26');
 assert.equal(august.at(-1),'2026-09-05');
 assert.equal(november.length,42);
 assert.equal(november[0],'2026-10-26');
 assert.equal(november.at(-1),'2026-12-06');
});

test('February retains leap day without adding a sixth week',()=>{
 const dates=monthDates('2028-02-29',1);
 assert.equal(dates.length,35);
 assert.equal(dates.filter(day=>day.startsWith('2028-02')).length,29);
 assert.ok(dates.includes('2028-02-29'));
});

test('day list is chronological, honors recurrence, and does not mutate the filtered input',()=>{
 const records=[{id:'late',date:'2026-11-11',time:'18:30'},
  {id:'weekly',date:'2026-11-04',time:'08:00',repeat:'weekly'},
  {id:'unrelated',date:'2026-11-12',time:'09:00'},
  {id:'early',date:'2026-11-11',time:'10:30'},
  {id:'expired',date:'2026-11-04',time:'12:00',repeat:'weekly',until:'2026-11-10'}];
 const before=JSON.stringify(records);
 assert.deepEqual(monthDayEvents(records,'2026-11-11').map(event=>event.id),['weekly','early','late']);
 assert.equal(JSON.stringify(records),before);
 assert.deepEqual(monthDayEvents([],'2026-11-11'),[]);
});

test('counts use only supplied accessible people-filtered records, including ties and all-day events',()=>{
 const filtered=[{id:'mine',date:'2026-11-11',time:'10:30',ownerId:'daniel',visibility:'private'},
  {id:'shared',date:'2026-11-11',time:'10:30',visibility:'family'},
  {id:'all-day',date:'2026-11-11'}];
 assert.deepEqual(monthDayEvents(filtered,'2026-11-11').map(event=>event.id),['all-day','mine','shared']);
 assert.equal(monthDayEvents(filtered,'2026-11-12').length,0);
});
