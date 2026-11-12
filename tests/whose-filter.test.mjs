// "Mine by default" for Tasks, Today and Calendar (user request 2026-11-11): shared/whose-filter.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {inMyView,matchesWhose,rememberedWhose,WHOSE_ALL,WHOSE_MINE} from '../shared/whose-filter.mjs';
import {canSeeRecord} from '../shared/record-audience.mjs';
import {topPriorities} from '../app/src/priority-logic.js';

const dad='dad',mom='mom',kid='kid',everyone=[dad,mom,kid];
const task=(id,extra)=>({id,title:id,ownerId:mom,visibility:'family',allowedIds:[],...extra});

test('a task is mine when I am its assignee or one of its assignees',()=>{
 assert.equal(inMyView(task('single',{memberId:dad}),dad,'tasks'),true);
 assert.equal(inMyView(task('shared',{memberId:mom,memberIds:[mom,dad]}),dad,'tasks'),true);
 assert.equal(inMyView(task('hers',{memberId:mom,memberIds:[mom]}),dad,'tasks'),false);
 assert.equal(inMyView(task('kid',{memberId:kid}),dad,'tasks'),false);
});

test('a task I created for someone else is theirs, not mine',()=>{
 assert.equal(inMyView(task('for-mom',{ownerId:dad,memberId:mom,memberIds:[mom]}),dad,'tasks'),false);
 assert.equal(inMyView(task('for-mom',{ownerId:dad,memberId:mom,memberIds:[mom]}),mom,'tasks'),true);
});

test('my own private record is mine; whole-family and unassigned records are everyone’s',()=>{
 assert.equal(inMyView(task('diary',{ownerId:dad,visibility:'private'}),dad,'tasks'),true);
 assert.equal(inMyView(task('family',{memberId:mom,memberIds:everyone}),dad,'tasks'),true);
 assert.equal(inMyView(task('nobody',{}),dad,'tasks'),true,'a task without an assignee belongs to everyone');
 assert.equal(inMyView({id:'e',ownerId:mom,visibility:'family',memberIds:[]},dad,'events'),true);
});

test('an event is mine when I am one of its people; birthdays concern everyone',()=>{
 const event=(memberIds,extra)=>({id:'e',ownerId:mom,visibility:'family',allowedIds:[],memberIds,...extra});
 assert.equal(inMyView(event([mom,dad]),dad,'events'),true);
 assert.equal(inMyView(event([mom]),dad,'events'),false);
 assert.equal(inMyView(event([kid]),dad,'events'),false);
 assert.equal(inMyView(event([kid],{birthdayOf:kid}),dad,'events'),true);
});

test('mine never widens access: a record I cannot see is never mine',()=>{
 const secret=task('secret',{visibility:'private'}),hidden={id:'h',ownerId:mom,visibility:'private',memberIds:[],birthdayOf:mom};
 assert.equal(canSeeRecord(secret,dad,'tasks'),false);
 assert.equal(inMyView(secret,dad,'tasks'),false);
 assert.equal(inMyView(hidden,dad,'events'),false);
 assert.equal(matchesWhose(secret,WHOSE_ALL,dad,'tasks'),true,'whose only narrows; callers pass visible records');
});

test('whose: mine, me, everyone and another person',()=>{
 const mine=task('mine',{memberId:dad}),hers=task('hers',{memberId:mom,memberIds:[mom]}),nobody=task('nobody',{});
 const pick=(who,user=dad)=>[mine,hers,nobody].filter(t=>matchesWhose(t,who,user,'tasks')).map(t=>t.id);
 assert.deepEqual(pick(WHOSE_MINE),['mine','nobody']);
 assert.deepEqual(pick(dad),['mine','nobody'],'choosing yourself is the same as mine');
 assert.deepEqual(pick(WHOSE_ALL),['mine','hers','nobody']);
 assert.deepEqual(pick(undefined),['mine','hers','nobody']);
 assert.deepEqual(pick(mom),['hers'],'another person: what is assigned to them');
 assert.deepEqual(pick(WHOSE_MINE,mom),['hers','nobody']);
});

test('only Everyone is remembered; anything else, or nothing, starts at mine',()=>{
 assert.equal(rememberedWhose(WHOSE_ALL),WHOSE_ALL);
 for(const v of [undefined,null,'',WHOSE_MINE,'mom',42])assert.equal(rememberedWhose(v),WHOSE_MINE);
});

test('a household where the two adults have different loads: each sees their own by default',()=>{
 const tasks=[...Array.from({length:20},(_,i)=>task('mom-'+i,{memberId:mom,memberIds:[mom]})),task('dad-1',{ownerId:dad,memberId:dad}),task('dad-2',{memberId:dad}),task('both',{memberIds:[mom,dad],memberId:mom})];
 const count=(who,user)=>tasks.filter(t=>matchesWhose(t,who,user,'tasks')).length;
 assert.equal(count(WHOSE_MINE,dad),3);
 assert.equal(count(WHOSE_MINE,mom),21);
 assert.equal(count(WHOSE_ALL,dad),23);
});

test('Top priorities on Today lists only my own high tasks',()=>{
 const today='2026-11-11',high={priority:'high',date:today};
 const rows=topPriorities([task('mine',{...high,memberId:dad}),task('made-for-mom',{...high,ownerId:dad,memberId:mom}),task('hers',{...high,memberId:mom})],{userId:dad,date:today,today});
 assert.deepEqual(rows.map(r=>r.t.id),['mine']);
});
