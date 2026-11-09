import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankState,visibleState} from '../app/cloud/state.mjs';
import {dueReminders,inQuietHours,digestDue,approvalRequests,childUpdates,notificationPrefs} from '../app/cloud/reminders.mjs';

const members=[{id:'parent-one',name:'One',role:'parent'},{id:'parent-two',name:'Two',role:'parent'},{id:'child',name:'Child',role:'child'}];
const date='2026-11-04';
function home(){
 const d=blankState('home','Home',members[0]);d.members=members;d.profiles['parent-two']={name:'Two'};d.profiles.child={name:'Child',notificationPrefs:{parentUpdates:true}};
 const record=(id,extra)=>({id,title:id,he:id,ownerId:'parent-one',visibility:'family',allowedIds:[],date,...extra});
 d.tasks=[
  record('plants',{memberId:'parent-one',time:'18:00'}),
  record('done-task',{memberId:'parent-one',time:'18:00',completions:{[date]:{state:'done'}}}),
  record('spouse-task',{memberId:'parent-two',time:'18:00'}),
  record('secret',{memberId:'parent-two',time:'18:00',ownerId:'parent-two',visibility:'private'}),
  record('shower',{memberId:'child',time:'19:00',routine:true,parentConfirm:true,completions:{[date]:{state:'pending'}}}),
  record('yesterday',{memberId:'parent-one',time:'18:00',date:'2026-11-03'}),
  record('daily',{memberId:'parent-one',time:'18:05',date:'2026-11-01',repeat:'daily'})
 ];
 d.events=[record('dinner',{memberIds:['parent-one','child'],time:'18:10'}),record('not-mine',{memberIds:['parent-two'],time:'18:10'})];
 d.history=[{id:'h1',taskId:'brush',title:'Brush',memberId:'child',actorId:'child',date,time:'17:40',done:true,ownerId:'parent-one',visibility:'family',allowedIds:[]},{id:'h2',taskId:'old',title:'Old',memberId:'child',actorId:'child',date,time:'15:00',done:true,ownerId:'parent-one',visibility:'family',allowedIds:[]}];
 return d;
}

test('reminders include only open, assigned, visible records inside the reminder window',()=>{
 const view=visibleState(home(),'parent-one');
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'17:49'}).map(r=>r.record.id),[]);
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'17:50'}).map(r=>r.record.id),['plants']);
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'18:00'}).map(r=>r.record.id),['plants','daily','dinner']);
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'18:06'}).map(r=>r.record.id),['daily','dinner']);
});

test('another person’s private task never reaches a reminder; assigning the recipient makes it Selected people (assignment and visibility model 2026-11-08)',()=>{
 const view=visibleState(home(),'parent-one');assert.ok(!view.tasks.some(t=>t.id==='secret'));
 assert.ok(!dueReminders(view,'parent-one',{date,time:'18:00'}).some(r=>r.record.id==='secret'));
 const d=home();d.tasks.find(t=>t.id==='secret').memberId='parent-one'; // an older contradictory record: Only me, assigned to someone else
 const assigned=visibleState(d,'parent-one'),task=assigned.tasks.find(t=>t.id==='secret');assert.equal(task.visibility,'selected');assert.deepEqual(task.allowedIds,['parent-one']);
 assert.ok(dueReminders(assigned,'parent-one',{date,time:'18:00'}).some(r=>r.record.id==='secret'),'assignees always see and are reminded');
 assert.ok(!visibleState(d,'child').tasks.some(t=>t.id==='secret'),'nobody else gains access');
});

test('category preferences and quiet hours suppress reminders',()=>{
 const d=home();d.profiles['parent-one'].notificationPrefs={reminder:30,quietStart:'17:45',quietEnd:'17:55',categories:{events:{enabled:false}}};
 const view=visibleState(d,'parent-one');
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'17:50'}).map(r=>r.record.id),[]);
 assert.deepEqual(dueReminders(view,'parent-one',{date,time:'17:56'}).map(r=>r.record.id),['plants','daily']);
 assert.ok(inQuietHours('23:00','20:30','07:00'));assert.ok(inQuietHours('06:59','20:30','07:00'));assert.ok(!inQuietHours('07:00','20:30','07:00'));assert.ok(!inQuietHours('12:00','12:00','12:00'));
});

test('a reminder key changes when its time or lead changes so a rescheduled item is sent again',()=>{
 const view=visibleState(home(),'parent-one'),[first]=dueReminders(view,'parent-one',{date,time:'17:55'});
 view.tasks.find(t=>t.id==='plants').time='18:01';const [second]=dueReminders(view,'parent-one',{date,time:'17:55'});
 assert.notEqual(first.key,second.key);
});

test('morning summary is due once in the hour after the chosen time',()=>{
 const d=home();d.profiles['parent-one'].notificationPrefs={digest:'07:30'};const view=visibleState(d,'parent-one');
 assert.equal(digestDue(view,'parent-one',{date,time:'07:29'}),null);
 const digest=digestDue(view,'parent-one',{date,time:'07:31'});assert.equal(digest.key,'digest:'+date);assert.ok(digest.items.some(i=>i.record.id==='dinner'));assert.ok(!digest.items.some(i=>i.record.id==='secret'||i.record.id==='not-mine'));
 assert.equal(digestDue(view,'parent-one',{date,time:'08:31'}),null);
 assert.equal(notificationPrefs({}).digest,'');
});

test('approvals and child updates go only to parents and respect the child preference',()=>{
 const d=home(),view=visibleState(d,'parent-one');
 assert.deepEqual(approvalRequests(view,'parent-one',{date},'parent').map(a=>a.task.id),['shower']);
 assert.deepEqual(approvalRequests(visibleState(d,'child'),'child',{date},'child'),[]);
 assert.deepEqual(childUpdates(view,'parent-one',{date,time:'18:00'},'parent',{child:true}).map(u=>u.entry.id),['h1']);
 assert.deepEqual(childUpdates(view,'parent-one',{date,time:'18:00'},'parent',{child:false}),[]);
 assert.deepEqual(childUpdates(view,'parent-one',{date,time:'18:00'},'child',{child:true}),[]);
});

test('an item shortly after midnight is reminded from 00:00 on the same day',()=>{
 const d=home();d.tasks.push({id:'early',title:'early',ownerId:'parent-one',visibility:'family',allowedIds:[],date,memberId:'parent-one',time:'00:07'});d.profiles['parent-one'].notificationPrefs={quietStart:'00:00',quietEnd:'00:00'};
 assert.deepEqual(dueReminders(visibleState(d,'parent-one'),'parent-one',{date,time:'00:00'}).map(r=>r.record.id),['early']);
});

import {ownerDoneUpdates,overdueAlerts} from '../app/cloud/reminders.mjs';
const own=(extra)=>({id:'t1',title:'Laundry',date:'2026-11-05',time:'18:00',repeat:'once',memberId:'kid',ownerId:'mom',visibility:'family',allowedIds:[],...extra});

test('owner hears when someone else completes a "notify me" task, once per day key, never for their own completion', ()=>{
 const done=own({notifyOwnerOnDone:true,completions:{'2026-11-05':{state:'done',actorId:'kid'}}});
 const out=ownerDoneUpdates({tasks:[done]},'mom',{date:'2026-11-05'});
 assert.equal(out.length,1);assert.equal(out[0].key,'done:t1:2026-11-05');assert.equal(out[0].actorId,'kid');
 assert.equal(ownerDoneUpdates({tasks:[own({completions:{'2026-11-05':{state:'done',actorId:'kid'}}})]},'mom',{date:'2026-11-05'}).length,0,'only when the owner opted in');
 assert.equal(ownerDoneUpdates({tasks:[own({notifyOwnerOnDone:true,completions:{'2026-11-05':{state:'done',actorId:'mom'}}})]},'mom',{date:'2026-11-05'}).length,0,'not for the owner\'s own completion');
 assert.equal(ownerDoneUpdates({tasks:[done]},'kid',{date:'2026-11-05'}).length,0,'the completing assignee is not told about their own action');
});

test('overdue alerts go to the owner and the assignee after the chosen delay, for today and the two days before', ()=>{
 const task=own({overdueAlert:{afterMinutes:30}});
 assert.equal(overdueAlerts({tasks:[task]},'mom',{date:'2026-11-05',time:'18:29'}).length,0,'not before time + delay');
 const owner=overdueAlerts({tasks:[task]},'mom',{date:'2026-11-05',time:'18:30'});assert.equal(owner.length,1);assert.equal(owner[0].key,'overdue:t1:2026-11-05');assert.equal(owner[0].assignee,false);
 const assignee=overdueAlerts({tasks:[task]},'kid',{date:'2026-11-05',time:'18:30'});assert.equal(assignee[0].assignee,true);
 assert.equal(overdueAlerts({tasks:[task]},'dad',{date:'2026-11-05',time:'20:00'}).length,0,'not for other people');
 assert.equal(overdueAlerts({tasks:[own({overdueAlert:{afterMinutes:30},completions:{'2026-11-05':{state:'done',actorId:'kid'}}})]},'mom',{date:'2026-11-05',time:'20:00'}).length,0,'not when done');
 assert.equal(overdueAlerts({tasks:[own({time:'',overdueAlert:{afterMinutes:60}})]},'mom',{date:'2026-11-06',time:'00:58'}).length,0,'no time means 23:59 + delay');
 assert.equal(overdueAlerts({tasks:[own({time:'',overdueAlert:{afterMinutes:60}})]},'mom',{date:'2026-11-06',time:'00:59'}).length,1);
 assert.equal(overdueAlerts({tasks:[task]},'mom',{date:'2026-11-08',time:'09:00'}).length,0,'older than two days is not repeated');
 assert.equal(overdueAlerts({tasks:[own({date:'',overdueAlert:{afterMinutes:30}})]},'mom',{date:'2026-11-05',time:'23:00'}).length,0,'anytime tasks have no due time');
});
