// Kids' routines in grown-ups' views (user decision 2026-11-11): a view rule only, decided by shared/kids-context.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isKidsRoutine,hidesKidsRoutines} from '../shared/kids-context.mjs';

const members=[{id:'dana',role:'parent'},{id:'grandpa',role:'adult'},{id:'itai',role:'child'},{id:'noa',role:'child'}];

test('a kids\' routine is a routine whose people are all children',()=>{
 assert.equal(isKidsRoutine({routine:true,memberId:'itai'},members),true);
 assert.equal(isKidsRoutine({routine:true,memberId:'itai',memberIds:['itai','noa']},members),true);
 assert.equal(isKidsRoutine({routine:true,memberId:'itai',memberIds:['itai','dana']},members),false,'shared with a grown-up');
 assert.equal(isKidsRoutine({routine:true,memberId:'dana'},members),false,'a grown-up routine');
 assert.equal(isKidsRoutine({memberId:'itai',title:'Pack bag for the trip'},members),false,'a one-off task for a child stays a task');
 assert.equal(isKidsRoutine({routine:true},members),false,'nobody assigned');
 assert.equal(isKidsRoutine({routine:true,memberId:'gone'},members),false,'unknown person');
});

test('grown-ups hide kids\' routines only while Kids is on; children never do',()=>{
 assert.equal(hidesKidsRoutines('parent',true),true);
 assert.equal(hidesKidsRoutines('adult',true),true);
 assert.equal(hidesKidsRoutines('child',true),false);
 assert.equal(hidesKidsRoutines('parent',false),false,'Kids off: nothing changes');
});

test('hiding is a view filter: the records are not changed',()=>{
 const tasks=[{id:'a',routine:true,memberId:'itai'},{id:'b',memberId:'itai'},{id:'c',memberId:'dana'}],before=JSON.stringify(tasks);
 const shown=tasks.filter(t=>!isKidsRoutine(t,members));
 assert.deepEqual(shown.map(t=>t.id),['b','c']);
 assert.equal(JSON.stringify(tasks),before);
});
