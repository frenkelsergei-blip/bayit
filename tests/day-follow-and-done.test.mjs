// Owner, 2026-11-13 (iPhone, 1.75.0).
// 1. "Tasks shows two tasks; after another screen and back the rest appear". Opening a task from Today put Tasks on that one
//    date (no Overdue, no Anytime), and the date stayed when the app resumed days later ("Tuesday, Nov 10" on Friday).
//    Today's week strip and Calendar kept a picked day after midnight too.
// 2. "Once ticked it should make room for the others": a ticked task stays a moment, then leaves Today; a quiet
//    "N done today" line opens them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {followDay,linkRange} from '../app/src/day-follow.mjs';
import {doneOnDay,uniqueTasks,DONE_STAYS_MS,DONE_FADES_MS} from '../app/src/today-done.mjs';
const src=f=>readFileSync(new URL('../app/src/'+f,import.meta.url),'utf8');

test('a link with today’s date opens the whole Today view in Tasks; another date opens that day',()=>{
 assert.equal(linkRange('2026-11-10','2026-11-10'),'today');
 assert.equal(linkRange(null,'2026-11-10'),'today');
 assert.equal(linkRange('2026-11-12','2026-11-10'),'day');
});

test('a picked day lasts until the household date changes, then every screen follows today again',()=>{
 let s={day:'2026-11-12',following:false,seen:'2026-11-10'};
 s=followDay(s,'2026-11-10');assert.deepEqual(s,{day:'2026-11-12',following:false,seen:'2026-11-10'},'same day: the pick stays');
 s=followDay(s,'2026-11-13');assert.deepEqual(s,{day:'2026-11-13',following:true,seen:'2026-11-13'},'resumed on Friday: back to today');
 s=followDay(s,'2026-11-14');assert.equal(s.day,'2026-11-14','and keeps following');
 assert.equal(followDay({day:'2026-11',following:false,seen:'2026-11'},'2026-12').day,'2026-12','month cursor too');
});

test('Tasks, Today’s strip and Calendar use the rule',()=>{
 const tasks=src('tasks-view.jsx'),clock=src('household-clock.js');
 assert.match(tasks,/useState\(linkRange\(q\.get\('date'\),anchor\)\)/,'Tasks: a link with today’s date is not a one-day filter');
 assert.doesNotMatch(tasks,/useState\(q\.get\('date'\)\?'day':'today'\)/);
 assert.match(tasks,/seenDay\.current===anchor\)return;seenDay\.current=anchor;setDay\(anchor\);setRange\(r=>r==='day'\?'today':r\)/,'Tasks: a new household day leaves an old one-day view');
 assert.match(tasks,/linkDate\.current=date;setDay\(date\|\|anchor\);setRange\(linkRange\(date,anchor\)\)/,'Tasks: a new link, or Tasks in the menu after one, applies its day');
 assert.match(clock,/followDay\(\{day,following:following\.current,seen:seen\.current\},today\)/,'useHouseholdDay (Today, Calendar, meals, My Space)');
});

test('a task counts as done on the shown day only when it was finished that day',()=>{
 const daily={id:'d',completions:{'2026-11-13':{state:'done',at:'2026-11-13T05:10:00.000Z'}}};
 assert.equal(doneOnDay(daily,'2026-11-13','2026-11-13','done'),true);
 assert.equal(doneOnDay(daily,'2026-11-13','2026-11-13','pending'),false,'waiting for a parent stays in the list');
 const overdue={id:'o',date:'2026-11-09',completions:{'2026-11-09':{state:'done',at:'2026-11-13T06:00:00.000Z'}}};
 assert.equal(doneOnDay(overdue,'2026-11-09','2026-11-13','done'),true,'an overdue task finished this morning');
 assert.equal(doneOnDay(overdue,'2026-11-09','2026-11-14','done'),false,'not tomorrow');
 assert.equal(doneOnDay({id:'x',completions:{'2026-11-12':{state:'done',at:'2026-11-12T22:30:00.000Z'}}},'2026-11-12','2026-11-13','done'),true,'00:30 in Jerusalem is already the next day');
 assert.equal(doneOnDay({id:'y',completions:{'2026-11-09':{state:'done'}}},'2026-11-09','2026-11-13','done'),false,'no time recorded: not today');
 assert.deepEqual(uniqueTasks([{id:'a'},{id:'b'},{id:'a'}]).map(t=>t.id),['a','b']);
 assert.ok(DONE_FADES_MS<DONE_STAYS_MS&&DONE_STAYS_MS<=3000,'the row stays a moment, not for the rest of the session');
});

test('Today: ticked rows leave after a moment, and the done line opens them',()=>{
 const app=src('App.jsx'),done=src('today-done.jsx'),css=src('today-done.css');
 assert.match(app,/\[justDone,markDone\]=useJustDone\(\)/,'justDone is timed, not kept for the whole session');
 assert.doesNotMatch(app,/setJustDone\(v=>\[\.\.\.v,task\.id\]\)/);
 assert.equal((app.match(/\|\|justDone\.includes\(t\.id\)\|\|leaveDone\(t\)\)/g)||[]).length,2,'own and kids’ rows');
 assert.match(app,/<TodayDoneLine a=\{a\} tasks=\{doneHere\} row=\{taskRow\} today=\{isTodayView\}\/>/);
 assert.match(app,/justDone\.leaving\(task\.id\)\?' today-task-leaving'/);
 assert.match(done,/n\+' done today','בוצעו היום: '\+n/);
 assert.match(done,/aria-expanded=\{open\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/display:none/,'nothing is hidden by CSS: rows leave by rule, and the line opens them');
});
