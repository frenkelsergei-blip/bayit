import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {dueReminders,agenda,overdueAlerts} from '../app/cloud/reminders.mjs';
import {pushMessages} from '../app/cloud/push.mjs';
import {completeTask} from '../app/src/domain.js';
import {taskMemberIds,assignTaskPeople} from '../shared/task-assignment.mjs';
import {topPriorities} from '../app/src/priority-logic.js';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
const members=[{id:'one',name:'One',role:'parent'},{id:'two',name:'Two',role:'parent'},{id:'kid',name:'Child',role:'child'},{id:'other',name:'Other',role:'child'}];
function home(){const d=blankState('home','Home',members[0]);d.members=structuredClone(members);d.profiles=Object.fromEntries(members.map(m=>[m.id,{xp:0,notificationPrefs:{quietStart:'00:00',quietEnd:'00:00'}}]));return d}
const task=()=>assignTaskPeople({id:'shared',title:'Shared work',he:'משימה משותפת',ownerId:'one',visibility:'family',allowedIds:[],date:today,time:'18:00',repeat:'once',done:false,xp:0,priority:'high'},['one','two']);
const write=(d,t,actor='one',role='parent')=>applyChanges(d,[{collection:'tasks',id:t.id,value:t}],actor,role);

test('editing a legacy single-person task persists all assignees on one record and preserves its other details',()=>{
 const d=home(),legacy={...task(),memberIds:undefined,note:'Keep this',location:{label:'Grandma'},subtasks:[{id:'step',title:'First',done:false}],completions:{[today]:{state:'open'}}};delete legacy.memberIds;d.tasks=[legacy];
 const next=write(d,assignTaskPeople(structuredClone(legacy),['two','kid']));
 assert.equal(next.tasks.length,1);assert.deepEqual(taskMemberIds(next.tasks[0]),['two','kid']);assert.equal(next.tasks[0].memberId,'two');assert.equal(next.tasks[0].note,'Keep this');assert.equal(next.tasks[0].location.label,'Grandma');assert.deepEqual(next.tasks[0].subtasks,legacy.subtasks);assert.deepEqual(next.tasks[0].completions,legacy.completions);
 const reassigned=write(next,assignTaskPeople(structuredClone(next.tasks[0]),['kid']));assert.deepEqual(taskMemberIds(reassigned.tasks[0]),['kid']);
});

test('every assigned recipient gets one reminder, agenda item and push message; unassigned viewers get none',()=>{
 const d=write(home(),task());
 for(const actor of ['one','two']){const v=visibleState(d,actor);assert.equal(dueReminders(v,actor,{date:today,time:'17:50'}).length,1);assert.equal(agenda(v,actor,today).length,1);assert.equal(pushMessages(d,actor,{date:today,time:'17:50'},'parent').filter(x=>x.key.startsWith('task:shared:')).length,1);assert.equal(topPriorities(v.tasks,{userId:actor,date:today}).length,1)}
 assert.equal(dueReminders(visibleState(d,'kid'),'kid',{date:today,time:'17:50'}).length,0);
});

test('each recipient controls their own category, lead, quiet hours and access for tasks and calendar events',()=>{
 const d=write(home(),task());d.events=[{...task(),id:'event',durationMinutes:60}];
 d.profiles.two.notificationPrefs.categories={tasks:{enabled:false},events:{reminder:0}};
 assert.equal(dueReminders(visibleState(d,'two'),'two',{date:today,time:'17:50'}).length,0);
 assert.deepEqual(dueReminders(visibleState(d,'two'),'two',{date:today,time:'18:00'}).map(x=>x.kind),['event']);
 d.profiles.two.notificationPrefs.categories.tasks={reminder:0};assert.equal(dueReminders(visibleState(d,'two'),'two',{date:today,time:'18:00'}).length,2);
 d.profiles.two.notificationPrefs.quietStart='17:00';d.profiles.two.notificationPrefs.quietEnd='19:00';assert.equal(dueReminders(visibleState(d,'two'),'two',{date:today,time:'18:00'}).length,0);
 d.tasks[0].visibility='private';d.events[0].visibility='private'; // older contradictory records: Only me, but assigned to Two
 {const v=visibleState(d,'two');assert.equal(v.tasks.length,1,'assignees always see');assert.equal(v.events.length,1);assert.equal(v.tasks[0].visibility,'selected');assert.deepEqual(v.tasks[0].allowedIds,['two'])}
 assert.equal(visibleState(d,'kid').tasks.length,0);assert.equal(visibleState(d,'kid').events.length,0);assert.equal(pushMessages(d,'kid',{date:today,time:'18:00'},'child').length,0,'nobody else gains access');
});

test('reassignment stops reminders for removed people and does not share a selected record',()=>{
 const d=write(home(),task()),next=write(d,assignTaskPeople({...d.tasks[0]},['one','kid']));
 assert.equal(dueReminders(visibleState(next,'two'),'two',{date:today,time:'17:50'}).length,0);
 next.tasks[0].visibility='selected';next.tasks[0].allowedIds=['two'];assert.equal(visibleState(next,'other').tasks.length,0);assert.equal(visibleState(next,'kid').tasks.length,1,'an assignee always sees the task');
});

test('an assigned second child can complete the shared task once; unrelated children cannot complete or reassign it',()=>{
 const d=home();d.tasks=[assignTaskPeople(task(),['two','kid'])];const change=structuredClone(d.tasks[0]);completeTask(change,{date:today,actorId:'kid',actorRole:'child',time:'18:00',instant:new Date().toISOString()});
 const next=write(d,change,'kid','child');assert.equal(next.tasks[0].completions[today].state,'done');assert.equal(next.history.length,1);assert.deepEqual(next.history[0].memberIds,['two','kid']);assert.equal(next.history[0].actorId,'kid');assert.equal(dueReminders(visibleState(next,'two'),'two',{date:today,time:'18:00'}).length,0);assert.equal(next.profiles.kid.xp,0);
 assert.throws(()=>write(d,change,'other','child'),/another person/);
 assert.throws(()=>write(d,assignTaskPeople({...d.tasks[0]},['kid','other']),'kid','child'),/Children assign/);
 assert.throws(()=>write(d,{...d.tasks[0],memberId:'kid'}),/assignees/);
 assert.throws(()=>write(d,{...d.tasks[0],routine:true,xp:10}),/assignees/);
});

test('overdue alerts include all assignees and owner and honor recipient settings',()=>{
 const d=home();d.tasks=[assignTaskPeople({...task(),overdueAlert:{afterMinutes:30}},['two','kid'])];
 for(const id of ['one','two','kid'])assert.equal(overdueAlerts(visibleState(d,id),id,{date:today,time:'18:30'}).length,1);
 assert.equal(overdueAlerts(visibleState(d,'other'),'other',{date:today,time:'18:30'}).length,0);
 d.profiles.two.notificationPrefs.categories={tasks:{enabled:false}};assert.equal(overdueAlerts(visibleState(d,'two'),'two',{date:today,time:'18:30'}).length,0);
});

import {normalizeAITools,applyAIPlan,filterAIContext} from '../shared/ai-contract.mjs';
import {diffState} from '../app/cloud/state.mjs';
import catalog from '../design-system/bayit-icons.json' with {type:'json'};
const aiContext=d=>filterAIContext({actorId:'one',members,scope:'family',today,records:d.tasks.map(t=>({...t,type:'task'})),shoppingLists:d.shoppingLists,taskLists:d.taskLists});
function aiCommit(d,block){const plan=normalizeAITools([{type:'tool_use',...block}],aiContext(d),catalog,crypto.randomUUID()).plan,before=visibleState(d,'one'),after=structuredClone(before);applyAIPlan(after,plan,'one',members,catalog);return applyChanges(d,diffState(before,after),'one','parent')}
test('reviewed AI task creation and reassignment use the same one-record multi-assignee model; routines stay per child',()=>{
 const d=aiCommit(home(),{name:'prepare_tasks',input:{tasks:[{title:'Joint work',memberIds:['one','two']}]}});assert.equal(d.tasks.length,1);assert.deepEqual(taskMemberIds(d.tasks[0]),['one','two']);
 const next=aiCommit(d,{name:'prepare_changes',input:{changes:[{id:d.tasks[0].id,type:'task',action:'update',memberIds:['two','kid']}]}});assert.deepEqual(taskMemberIds(next.tasks[0]),['two','kid']);assert.equal(next.tasks.length,1);
 const routines=aiCommit(home(),{name:'prepare_tasks',input:{tasks:[{title:'Brush teeth',routine:true,memberIds:['kid','other'],xp:10}]}});assert.equal(routines.tasks.length,2);assert.deepEqual(routines.tasks.map(t=>taskMemberIds(t)),[['kid'],['other']]);
});
