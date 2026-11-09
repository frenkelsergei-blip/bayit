// Assignment and visibility model (AGENTS.md, confirmed by the user 2026-11-08): visibility decides who sees a
// record; assignees always see it; "Only me" means only the owner; the server enforces assignees ⊆ viewers on every
// write; personal views use one "mine" rule. Documents and insurance people are not assignment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {dueReminders,agenda} from '../app/cloud/reminders.mjs';
import {pushMessages} from '../app/cloud/push.mjs';
import {canSeeRecord,isMine,normalizeAudience,effectiveAudience,recordAssignees,recordViewers,missingViewers,normalizeStateAudience} from '../shared/record-audience.mjs';
import {assignTaskPeople} from '../shared/task-assignment.mjs';

const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
const members=[{id:'daniel',name:'Daniel',role:'parent'},{id:'hila',name:'Hila',role:'parent'},{id:'noa',name:'Noa',role:'child'},{id:'itai',name:'Itai',role:'child'}];
const ids=members.map(m=>m.id);
function home(){const d=blankState('home','Home',members[0]);d.members=structuredClone(members);d.profiles=Object.fromEntries(members.map(m=>[m.id,{name:m.name,xp:0,notificationPrefs:{quietStart:'00:00',quietEnd:'00:00'}}]));return d}
const task=(id,owner,assignees,visibility,allowedIds=[])=>assignTaskPeople({id,title:id,he:id,ownerId:owner,visibility,allowedIds,date:today,time:'18:00',repeat:'once',done:false,xp:0},assignees);
const event=(id,owner,assignees,visibility,allowedIds=[])=>({id,title:id,he:id,ownerId:owner,visibility,allowedIds,memberIds:assignees,date:today,time:'18:00',durationMinutes:60,editPolicy:'owner',editorIds:[]});
const note=(id,owner,assignee,visibility,allowedIds=[])=>({id,title:id,he:id,text:'x',textHe:'x',ownerId:owner,visibility,allowedIds,memberId:assignee,date:today,time:'18:00',editPolicy:'owner',editorIds:[]});
const write=(d,collection,value,actor,role=members.find(m=>m.id===actor).role)=>applyChanges(d,[{collection,id:value.id,value}],actor,role);
const make={tasks:(id,o,a,v,al)=>task(id,o,a,v,al),events:(id,o,a,v,al)=>event(id,o,a,v,al),notes:(id,o,a,v,al)=>note(id,o,a[0],v,al)};

test('every owner × assignees × visibility combination: assignees always see, nobody else gains access, the stored record is consistent',()=>{
 const audiences=[['private',[]],['family',[]],['selected',['hila']],['selected',['noa','itai']]];
 const assigneeSets=[['daniel'],['hila'],['noa'],['daniel','hila'],['hila','noa','itai']];
 let checked=0;
 for(const collection of ['tasks','events','notes'])for(const owner of ['daniel','hila','noa'])for(const [visibility,allowed] of audiences)for(const assignees of assigneeSets){
  if(collection==='notes'&&assignees.length>1)continue; // a note has one "Assigned to" person
  const allowedIds=allowed.filter(id=>id!==owner);if(visibility==='selected'&&!allowedIds.length)continue;
  const role=members.find(m=>m.id===owner).role;if(role==='child'&&collection==='tasks'&&assignees.some(id=>id!==owner))continue; // children assign only to themselves
  const value=make[collection]('r',owner,assignees,visibility,allowedIds),saved=write(home(),collection,value,owner),stored=saved[collection].find(r=>r.id==='r');
  const others=assignees.filter(id=>id!==owner);
  assert.deepEqual(missingViewers(stored,collection),[],collection+' '+visibility+' '+assignees+': assignees ⊆ viewers after save');
  if(visibility==='private'&&others.length){assert.equal(stored.visibility,'selected','Only me + another assignee becomes Selected people');assert.deepEqual(stored.allowedIds.sort(),others.sort())}
  if(visibility==='private'&&!others.length)assert.equal(stored.visibility,'private','Only me stays Only me');
  if(visibility==='family')assert.equal(stored.visibility,'family');
  for(const person of ids){
   const sees=visibleState(saved,person)[collection].some(r=>r.id==='r');
   const expected=person===owner||visibility==='family'||allowedIds.includes(person)||assignees.includes(person);
   assert.equal(sees,expected,collection+' owned by '+owner+', '+visibility+'['+allowedIds+'], assigned '+assignees+': '+person);
  }
  checked++;
 }
 assert.ok(checked>100,'checked '+checked+' combinations');
});

test('a private record never reaches anyone else: app state, reminders, agenda, push',()=>{
 const d=home();d.tasks=[task('t','hila',['hila'],'private')];d.events=[event('e','hila',['hila'],'private')];d.notes=[note('n','hila','hila','private')];
 for(const person of ['daniel','noa','itai']){
  const v=visibleState(d,person);assert.equal(v.tasks.length+v.events.length+v.notes.length,0,person);
  assert.equal(dueReminders(v,person,{date:today,time:'17:50'}).length,0);assert.equal(agenda(v,person,today).length,0);
  assert.equal(pushMessages(d,person,{date:today,time:'17:50'},members.find(m=>m.id===person).role).length,0);
 }
 assert.equal(visibleState(d,'hila').tasks.length,1);
});

test('older contradictory records are read in their consistent form, and stored that way on the next save',()=>{
 const d=home();d.tasks=[task('wife-assigned','daniel',['hila'],'private')];d.events=[event('dentist','hila',['noa'],'selected',['daniel'])];
 const hila=visibleState(d,'hila');assert.equal(hila.tasks[0].visibility,'selected');assert.deepEqual(hila.tasks[0].allowedIds,['hila']);
 assert.ok(isMine(hila.tasks[0],'hila','tasks'));assert.equal(dueReminders(hila,'hila',{date:today,time:'17:50'}).length,1,'the assignee is reminded');
 assert.deepEqual(visibleState(d,'noa').events[0].allowedIds,['daniel','noa']);assert.equal(visibleState(d,'itai').events.length,0);
 assert.equal(d.tasks[0].visibility,'private','reading never modifies stored data');
 const saved=write(d,'notes',note('n','daniel','daniel','private'),'daniel');
 assert.equal(saved.tasks[0].visibility,'selected','the next save stores the consistent form');assert.deepEqual(saved.events[0].allowedIds,['daniel','noa']);
 assert.equal(saved.changeNotices?.length||0,0,'normalising sends nobody a change notice');
});

test('only the owner widens who can see a record; a non-owner who assigns someone new is refused clearly',()=>{
 const d=home();d.events=[{...event('e','hila',['hila','daniel'],'selected',['daniel']),editPolicy:'viewers'}];
 assert.throws(()=>write(d,'events',{...d.events[0],memberIds:['hila','daniel','noa']},'daniel'),/Only the owner can let more people see this\. Ask Hila to assign Noa/);
 const ok=write(d,'events',{...d.events[0],memberIds:['hila','daniel'],title:'Changed'},'daniel');assert.equal(ok.events[0].title,'Changed','an editor still edits within the audience');
 const owner=write(d,'events',{...d.events[0],memberIds:['hila','daniel','noa']},'hila');assert.deepEqual(owner.events[0].allowedIds,['daniel','noa']);
 assert.throws(()=>write(owner,'events',{...owner.events[0],visibility:'family',allowedIds:[]},'daniel'),/Only the owner changes sharing/,'the editor cannot change sharing');
 const kept=write(owner,'events',{...owner.events[0],allowedIds:['daniel']},'hila');assert.deepEqual(kept.events[0].allowedIds,['daniel','noa'],'an assignee cannot be dropped from who can see it');
});

test('a task in a list keeps the list audience: a new assignee outside the list is refused, the list is never widened',()=>{
 const d=home();d.taskLists=[{id:'mine',name:'Mine',ownerId:'daniel',visibility:'private',allowedIds:[]},{id:'parents',name:'Parents',ownerId:'daniel',visibility:'selected',allowedIds:['hila']}];
 const inList=(assignees,listId,vis,allowed=[])=>({...task('l','daniel',assignees,vis,allowed),listId});
 assert.throws(()=>write(d,'tasks',inList(['hila'],'mine','private'),'daniel'),/Hila can’t see this list\. Share the list with them first, or choose another list\./);
 assert.throws(()=>write(d,'tasks',inList(['noa'],'parents','selected',['hila']),'daniel'),/Noa can’t see this list/);
 const saved=write(d,'tasks',inList(['hila'],'parents','selected',['hila']),'daniel');assert.equal(saved.tasks[0].visibility,'selected');assert.deepEqual(saved.tasks[0].allowedIds,['hila']);
});

test('an assignee of an older task in a list they cannot see still sees it (without the list) and can complete it; the list stays',()=>{
 const d=home();d.taskLists=[{id:'mine',name:'Mine',ownerId:'daniel',visibility:'private',allowedIds:[]}];d.tasks=[{...task('l','daniel',['hila'],'private'),listId:'mine'}];
 const v=visibleState(d,'hila');assert.equal(v.tasks.length,1);assert.equal(v.tasks[0].listId,undefined);assert.equal(v.taskLists.length,0,'the list itself stays private');
 const done=structuredClone(v.tasks[0]);done.completions={[today]:{state:'done',by:'hila'}};
 const saved=write(d,'tasks',done,'hila');assert.equal(saved.tasks[0].listId,'mine','a hidden list link is kept');
});

test('children: assigned children see their records; a child’s private record never reaches a parent',()=>{
 const d=home();d.tasks=[task('chore','hila',['noa'],'private'),task('diary','noa',['noa'],'private')];
 assert.deepEqual(visibleState(d,'noa').tasks.map(t=>t.id).sort(),['chore','diary']);
 assert.deepEqual(visibleState(d,'hila').tasks.map(t=>t.id),['chore']);assert.deepEqual(visibleState(d,'daniel').tasks.map(t=>t.id),[]);
 assert.deepEqual(visibleState(d,'itai').tasks.map(t=>t.id),[]);
 assert.throws(()=>write(d,'tasks',task('x','noa',['noa','itai'],'private'),'noa'),/Children assign/);
});

test('Kids routines keep one record per child with per-child completion; each child sees their own',()=>{
 const d=home(),r=(id,child)=>({...task(id,'hila',[child],'private'),routine:true,routineId:'brush',xp:10});
 const saved=applyChanges(d,[{collection:'tasks',id:'b1',value:r('b1','noa')},{collection:'tasks',id:'b2',value:r('b2','itai')}],'hila','parent');
 assert.deepEqual(visibleState(saved,'noa').tasks.map(t=>t.id),['b1']);assert.deepEqual(visibleState(saved,'itai').tasks.map(t=>t.id),['b2']);
 assert.deepEqual(saved.tasks.map(t=>t.allowedIds),[['noa'],['itai']]);
});

test('"mine" is one rule: assigned to me, plus my own private records',()=>{
 const records=[task('a','hila',['daniel'],'family'),task('b','daniel',['hila'],'family'),task('c','daniel',['daniel'],'private'),{...task('d','daniel',['daniel'],'private'),memberId:undefined,memberIds:undefined},task('e','hila',['hila'],'private'),task('f','hila',['hila','daniel'],'selected',['daniel'])];
 assert.deepEqual(records.filter(r=>isMine(r,'daniel','tasks')).map(r=>r.id),['a','c','d','f']);
 assert.ok(!isMine(note('n','daniel','hila','family'),'daniel','notes'),'a family note assigned to someone else is not mine');
 assert.ok(isMine(note('n','daniel','daniel','private'),'daniel','notes'));
});

test('documents and insurance people are not assignment and grant no access',()=>{
 const doc={id:'d',ownerId:'hila',visibility:'private',allowedIds:[],memberIds:['daniel'],memberId:'daniel'};
 assert.equal(canSeeRecord(doc,'daniel','documents'),false);assert.deepEqual(recordAssignees(doc,'insurances'),[]);assert.equal(normalizeAudience(doc,'documents'),doc);
 const d=home();d.documents=[{...doc,title:'Passport',category:'identity'}];assert.equal(visibleState(d,'daniel').documents.length,0);
 assert.equal(normalizeStateAudience({documents:d.documents}).documents,d.documents);
});

test('the form helper shows what will be saved and which people the assignees added',()=>{
 assert.deepEqual(effectiveAudience({ownerId:'daniel',visibility:'private'},['daniel']),{visibility:'private',allowedIds:[],added:[],locked:[]});
 assert.deepEqual(effectiveAudience({ownerId:'daniel',visibility:'private'},['daniel','hila']),{visibility:'selected',allowedIds:['hila'],added:['hila'],locked:['hila']});
 assert.deepEqual(effectiveAudience({ownerId:'daniel',visibility:'selected',allowedIds:['noa']},['hila']),{visibility:'selected',allowedIds:['noa','hila'],added:['hila'],locked:['hila']});
 assert.deepEqual(effectiveAudience({ownerId:'daniel',visibility:'family'},['hila']).visibility,'family');
 assert.deepEqual(recordViewers(task('t','daniel',['hila'],'private'),members,'tasks'),['daniel','hila']);
});
