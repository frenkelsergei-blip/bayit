import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
import {applyListAudience,taskFitsList,createTaskList,upgradeTaskLists} from '../shared/task-lists.mjs';
const members=[{id:'p1',name:'One',role:'parent'},{id:'p2',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const state=()=>{const d=blankState('home','Home',members[0]);d.members=members;d.profiles.p2={name:'Two'};d.profiles.kid={name:'Kid',xp:0};d.taskLists=[];return d};
const task=(id,ownerId,extra={})=>({id,ownerId,visibility:'family',allowedIds:[],title:'Task '+id,memberId:ownerId,date:'2026-11-05',done:false,...extra});
test('a task takes its list audience from the owner’s point of view',()=>{
 const list={id:'l',ownerId:'p1',visibility:'selected',allowedIds:['p2']};
 assert.deepEqual(applyListAudience(task('a','p1'),list),{...task('a','p1'),listId:'l',visibility:'selected',allowedIds:['p2']});
 assert.deepEqual(applyListAudience(task('b','p2'),list).allowedIds,['p1']);
 assert.equal(applyListAudience(task('c','p1'),{id:'m',ownerId:'p1',visibility:'private'}).visibility,'private');
 assert.equal(taskFitsList(applyListAudience(task('d','p2'),list),list),true);
 assert.equal(taskFitsList({...task('e','kid'),listId:'l'},list),false);
});
test('server hides tasks in lists the actor cannot access and returns only accessible lists',()=>{
 const d=state();d.taskLists=[{id:'parents',name:'Parents',ownerId:'p1',visibility:'selected',allowedIds:['p2']},{id:'mine',name:'Mine',ownerId:'p1',visibility:'private',allowedIds:[]}];
 d.tasks=[applyListAudience(task('gift','p1'),d.taskLists[0]),applyListAudience(task('secret','p1'),d.taskLists[1]),task('open','p1')];
 const kid=visibleState(d,'kid'),spouse=visibleState(d,'p2');
 assert.deepEqual(kid.taskLists.map(l=>l.id),[]);assert.deepEqual(kid.tasks.map(t=>t.id),['open']);
 assert.deepEqual(spouse.taskLists.map(l=>l.id),['parents']);assert.deepEqual(spouse.tasks.map(t=>t.id).sort(),['gift','open']);
});
test('a task cannot widen or leak a list audience, or join an inaccessible list',()=>{
 const d=state();d.taskLists=[{id:'parents',name:'Parents',ownerId:'p1',visibility:'selected',allowedIds:['p2']}];
 assert.throws(()=>applyChanges(d,[{collection:'tasks',id:'t',value:{...task('t','p1'),listId:'parents'}}],'p1','parent'),/unavailable/);
 assert.throws(()=>applyChanges(d,[{collection:'tasks',id:'k',value:{...task('k','kid'),listId:'parents'}}],'kid','child'),/unavailable/);
 const ok=applyChanges(d,[{collection:'tasks',id:'t',value:applyListAudience(task('t','p2'),d.taskLists[0])}],'p2','parent');
 assert.equal(ok.tasks.find(t=>t.id==='t').listId,'parents');
});
test('only the owner edits a task list; deleting it keeps its tasks outside the list',()=>{
 const d=state();d.taskLists=[{id:'home',name:'Home',ownerId:'p1',visibility:'family',allowedIds:[]}];d.tasks=[applyListAudience(task('t','p2'),d.taskLists[0])];
 assert.throws(()=>applyChanges(d,[{collection:'taskLists',id:'home',value:{...d.taskLists[0],name:'Renamed'}}],'p2','parent'),/owner/);
 assert.throws(()=>applyChanges(d,[{collection:'taskLists',id:'x',value:{id:'x',name:'',ownerId:'p1',visibility:'family',allowedIds:[]}}],'p1','parent'),/list name/);
 const next=applyChanges(d,[{collection:'taskLists',id:'home',delete:true}],'p1','parent');
 assert.equal(next.taskLists.length,0);assert.equal(next.tasks[0].listId,undefined);assert.equal(next.tasks[0].visibility,'family');
});
test('createTaskList validates and demo upgrade adds sample lists once',()=>{
 const d={members,taskLists:[]};assert.throws(()=>createTaskList(d,{id:'a',name:' ',ownerId:'p1'}));
 assert.equal(createTaskList(d,{id:'b',name:'Weekend',ownerId:'p1',visibility:'selected',allowedIds:['p2']}).visibility,'selected');
 const demo=upgradeTaskLists({members,tasks:[task('x','p1')]},{demo:true});assert.equal(demo.taskLists.length,3);assert.equal(demo.tasks[0].listId,'list-home');
 assert.equal(upgradeTaskLists(demo,{demo:true}).taskLists.length,3);assert.deepEqual(upgradeTaskLists({tasks:[]}).taskLists,[]);
});
import {applyShoppingTripAudience} from '../shared/task-lists.mjs';
const todayHome=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
test('a shopping trip task takes the shopping list audience and cannot leak it',()=>{
 const d=state();d.shoppingLists.push({id:'parents-shop',name:'Gifts',ownerId:'p1',visibility:'selected',allowedIds:['p2'],status:'active'});
 const trip=applyShoppingTripAudience({...task('trip','p1'),kind:'shopping-trip'},d.shoppingLists.find(l=>l.id==='parents-shop'));
 assert.equal(trip.shoppingListId,'parents-shop');assert.equal(trip.listId,undefined);assert.deepEqual(trip.allowedIds,['p2']);
 const next=applyChanges(d,[{collection:'tasks',id:'trip',value:trip}],'p1','parent');assert.equal(next.tasks.find(t=>t.id==='trip').visibility,'selected');
 assert.throws(()=>applyChanges(d,[{collection:'tasks',id:'leak',value:{...task('leak','p1'),kind:'shopping-trip',shoppingListId:'parents-shop'}}],'p1','parent'),/shopping list is unavailable/);
 assert.equal(visibleState(next,'kid').tasks.some(t=>t.id==='trip'),false);
});
test('a task without a date can be completed for today only',()=>{
 const d=state();d.tasks=[{...task('any','p1'),date:undefined}];delete d.tasks[0].date;
 const done={...d.tasks[0],completions:{[todayHome]:{state:'done',time:'10:00',at:new Date().toISOString(),actorId:'p1'}},done:true};
 const next=applyChanges(d,[{collection:'tasks',id:'any',value:done}],'p1','parent');assert.equal(next.tasks[0].completions[todayHome].state,'done');
 assert.throws(()=>applyChanges(d,[{collection:'tasks',id:'any',value:{...d.tasks[0],completions:{'2020-01-01':{state:'done'}}}}],'p1','parent'));
});
