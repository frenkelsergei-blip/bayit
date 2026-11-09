import {test} from 'node:test';
import assert from 'node:assert/strict';
import {householdMoneyStatistics as summarize} from '../app/src/household-money-statistics.mjs';
import {taskListChoices,taskListSharing,GENERAL_TASK_LIST_ID} from '../app/src/task-list-choice.mjs';
import {monthSummary} from '../shared/finance.mjs';
import {manualMoneyRow} from '../shared/money-records.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
const end='2026-11-06',base={user:'p1',end,range:'7'};
const row=(id,amount,extra={})=>({id,amount,kind:'card',category:'groceries',date:'2026-11-05',chargeDate:'2026-11-05',source:'max',ownerId:'p1',visibility:'shared',...extra});
const manual={id:'manual-one',title:'Groceries',amount:20,date:'2026-11-05',category:'Groceries',ownerId:'p1',memberId:'p1',visibility:'family'};
test('imported purchases, refunds and manual entries reconcile with the expense ledger',()=>{
 const transactions=[row('a',-5000,{kind:'bank'}),row('b',-3000),row('refund',500),row('salary',200000,{kind:'bank',category:'salary'}),row('save',-10000,{category:'savings'})];
 const result=summarize({...base,transactions,manual:[manual],plan:{expenseLimit:100000}});
 assert.equal(result.total,9500);assert.equal(result.categories[0].category,'groceries');assert.equal(result.categories[0].amount,9500);assert.equal(result.monthly,9500);assert.equal(result.used,10);
 assert.equal(result.total,monthSummary([...transactions,manualMoneyRow(manual)],[],'2026-11').expenses);
});
test('a covered bank card settlement is not counted again, including across the period boundary',()=>{
 const transactions=[row('card',-3000),row('settle',-3000,{kind:'card_payment',category:'cards',cardIssuer:'max',date:'2026-11-02'}),row('older',-9999,{date:'2026-10-20'})],groups=[{issuer:'max',chargeDate:'2026-11-04',total:3000}];
 const result=summarize({...base,transactions,groups});assert.equal(result.total,3000);assert.equal(result.count,1);assert.equal(result.uncoveredCardPayments,0);
 assert.equal(summarize({...base,transactions}).total,6000);assert.equal(summarize({...base,transactions}).uncoveredCardPayments,1);
});
test('sharing, source and person filters never label the importer as the payer',()=>{
 const transactions=[row('shared',-4000),row('mine',-2000,{visibility:'private'}),row('other-private',-90000,{visibility:'private',ownerId:'p2'}),row('assigned',-1000,{memberId:'p1'})];
 assert.equal(summarize({...base,transactions,manual:[manual]}).total,7000);
 assert.equal(summarize({...base,transactions,scope:'private'}).total,2000);
 assert.equal(summarize({...base,transactions,manual:[manual],source:'manual'}).total,2000);
 const person=summarize({...base,transactions,manual:[manual],person:'p1'});assert.equal(person.total,3000);assert.equal(person.unattributed,1);
});
test('duplicate manual records do not duplicate money; categories group merchants together',()=>{
 const result=summarize({...base,transactions:[manualMoneyRow(manual),row('other-merchant',-3000)],manual:[manual]});assert.equal(result.total,5000);assert.equal(result.categories.length,1);assert.equal(result.count,2);
});
test('selected range, all history, incomplete records and unset/private limits are explicit',()=>{
 const transactions=[row('old',-1000,{date:'2026-10-01'}),row('new',-2000),row('bad',NaN)];
 assert.equal(summarize({...base,transactions}).total,2000);assert.equal(summarize({...base,transactions,range:'all'}).total,3000);assert.equal(summarize({...base,transactions}).invalid,1);
 assert.equal(summarize({...base,legacyBudget:1000}).budget,100000);assert.equal(summarize({...base,scope:'private',legacyBudget:1000}).budget,0);assert.equal(summarize({...base,plan:{expenseLimit:0},legacyBudget:1000}).budget,0);
});
const members=[{id:'p1',name:'One',role:'parent'},{id:'p2',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const family={id:'family',name:'Family',ownerId:'p1',visibility:'family',allowedIds:[]},privateList={id:'private',name:'Private',ownerId:'p1',visibility:'private',allowedIds:[]},parents={id:'parents',name:'Parents',ownerId:'p1',visibility:'selected',allowedIds:['p2']};
test('a task editor offers only lists available both to the actor and task owner',()=>{
 const data={taskLists:[family,privateList,parents]};assert.deepEqual(taskListChoices(data,'p1').map(l=>l.id),['family','private','parents']);assert.deepEqual(taskListChoices(data,'p1',{ownerId:'kid'}).map(l=>l.id),['family']);assert.deepEqual(taskListChoices(data,'p2').map(l=>l.id),['family','parents']);
});
test('General keeps independent privacy; choosing a list remains server-confirmed and constrained',()=>{
 const state=blankState('home','Home',members[0]);state.members=members;state.profiles.p2={name:'Two'};state.profiles.kid={name:'Kid',xp:0};state.taskLists=[family,privateList,parents];
 const general={id:'general-task',title:'General private task',ownerId:'p1',memberId:'p1',visibility:'private',allowedIds:[],date:end,done:false};
 let saved=applyChanges(state,[{collection:'tasks',id:general.id,value:general}],'p1','parent');assert.equal(saved.tasks.find(t=>t.id===general.id).listId,undefined);assert.equal(saved.tasks.find(t=>t.id===general.id).visibility,'private');assert.ok(!visibleState(saved,'p2').tasks.some(t=>t.id===general.id));assert.equal(GENERAL_TASK_LIST_ID,'general');
 const move={...general,...taskListSharing('p1',parents)};saved=applyChanges(saved,[{collection:'tasks',id:general.id,value:move}],'p1','parent');assert.equal(saved.tasks.find(t=>t.id===general.id).listId,'parents');assert.deepEqual(saved.tasks.find(t=>t.id===general.id).allowedIds,['p2']);assert.ok(visibleState(saved,'p2').tasks.some(t=>t.id===general.id));
 const back={...general};saved=applyChanges(saved,[{collection:'tasks',id:general.id,value:back}],'p1','parent');assert.equal(saved.tasks.find(t=>t.id===general.id).listId,undefined);assert.equal(saved.tasks.find(t=>t.id===general.id).visibility,'private');
 assert.throws(()=>applyChanges(state,[{collection:'tasks',id:'leak',value:{...general,id:'leak',listId:'parents',visibility:'family'}}],'p1','parent'),/unavailable/);
});
