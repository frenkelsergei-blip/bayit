// Smarter shopping, the four leftovers (2026-11-12): "only me" favourites and a per-child "needs a parent's OK" switch.
// Fictional data only. The note photo and the receipt "Correct?" step are in shopping-note.test.mjs.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
import {shoppingSuggestions} from '../shared/shopping-rhythm.mjs';
const members=[{id:'one',name:'One',role:'parent'},{id:'two',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'},{id:'kid2',name:'Kid2',role:'child'}];
const state=()=>{const d=blankState('home','Home',members[0]);d.members=members;for(const m of members.slice(1))d.profiles[m.id]={name:m.name};return d};
const fav=(over={})=>({id:'f1',kind:'likes',status:'approved',memberId:'one',ownerId:'one',visibility:'family',allowedIds:[],title:'Coffee',he:'קפה',key:'coffee',...over});

test('only me: an adult keeps their own favourite to themselves; nobody else sees it',()=>{
 const d=applyChanges(state(),[{collection:'favourites',id:'f1',value:fav({visibility:'private'})}],'one','parent');
 assert.equal(visibleState(d,'one').favourites.length,1);
 assert.equal(visibleState(d,'two').favourites.length,0);assert.equal(visibleState(d,'kid').favourites.length,0);
 assert.throws(()=>applyChanges(state(),[{collection:'favourites',id:'f2',value:fav({id:'f2',memberId:'kid',visibility:'private'})}],'one','parent'),/to yourself/,'a parent cannot hide a child\'s favourite');
 assert.throws(()=>applyChanges(state(),[{collection:'favourites',id:'f3',value:fav({id:'f3',memberId:'kid',ownerId:'kid',status:'requested',visibility:'private'})}],'kid','child'),/to yourself|parent approves/,'a child\'s favourites stay visible to parents');
});
test('only me: suggested only on that person\'s own private list',()=>{
 const f=fav({visibility:'private'}),today='2026-11-12';
 const family={id:'week',ownerId:'one',visibility:'family',allowedIds:[]},mine={id:'p',ownerId:'one',visibility:'private',allowedIds:[]};
 const run=list=>shoppingSuggestions({list,purchases:[],marks:[],favourites:[f],items:[],today,shopDate:today}).map(s=>s.key||s.title);
 assert.equal(run(family).length,0);assert.equal(run(mine).length,1);
});
test('per child: by default every child still asks; a parent can let one child in without asking',()=>{
 const asked={id:'k1',kind:'likes',status:'approved',memberId:'kid',ownerId:'kid',visibility:'family',allowedIds:[],title:'Cornflakes'};
 assert.throws(()=>applyChanges(state(),[{collection:'favourites',id:'k1',value:asked}],'kid','child'),/parent approves/,'default unchanged');
 assert.throws(()=>applyChanges(state(),[{collection:'preferences',id:'shoppingNoApproval',value:['kid']}],'kid','child'),/parent manages/);
 assert.throws(()=>applyChanges(state(),[{collection:'preferences',id:'shoppingNoApproval',value:'kid'}],'one','parent'),/valid children/);
 const d=applyChanges(state(),[{collection:'preferences',id:'shoppingNoApproval',value:['kid']}],'one','parent');
 const ok=applyChanges(d,[{collection:'favourites',id:'k1',value:asked}],'kid','child');assert.equal(ok.favourites[0].status,'approved');
 assert.throws(()=>applyChanges(d,[{collection:'favourites',id:'k2',value:{...asked,id:'k2',memberId:'kid2',ownerId:'kid2'}}],'kid2','child'),/parent approves/,'only that child');
 assert.throws(()=>applyChanges(d,[{collection:'favourites',id:'k3',value:{...asked,id:'k3',kind:'avoid'}}],'kid','child'),/parent approves/,'likes only');
 assert.throws(()=>applyChanges(d,[{collection:'favourites',id:'k4',value:{...asked,id:'k4',memberId:'kid2'}}],'kid','child'),/parent approves/,'for themselves only');
 assert.equal(visibleState(ok,'one').favourites.length,1,'parents still see it');
});
