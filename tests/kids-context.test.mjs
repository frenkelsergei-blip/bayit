import test from 'node:test';
import assert from 'node:assert/strict';
import {kidsContext,routinesForChild} from '../shared/kids-context.mjs';
const members=[{id:'parent',role:'parent'},{id:'first',role:'child'},{id:'second',role:'child'}];
test('a parent keeps one valid selected child across Kids sections',()=>{
 assert.deepEqual(kidsContext(members,'parent','second'),{children:members.slice(1),child:'second'});
 assert.equal(kidsContext(members,'parent','stale-id').child,'first');
 assert.equal(kidsContext([members[0]],'parent','second').child,undefined);
});
test('a child context contains only themselves, regardless of remembered sibling selection',()=>{
 assert.deepEqual(kidsContext(members,'first','second'),{children:[members[1]],child:'first'});
});
test('a selected child routine list excludes siblings and ordinary tasks',()=>{
 const records=[{id:'a',routine:true,memberId:'first'},{id:'b',routine:true,memberId:'second'},{id:'c',memberId:'first'}];
 assert.deepEqual(routinesForChild(records,'second'),[records[1]]);
 assert.deepEqual(routinesForChild(records,'missing'),[]);
});
