import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLocation,locationOf,mapsLink} from '../shared/locations.mjs';
import {recordLink,linkedHousehold} from '../shared/record-links.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';

const members=[{id:'parent',role:'parent',name:'Parent'},{id:'adult',role:'adult',name:'Adult'},{id:'child',role:'child',name:'Child'}];
function home(){const d=blankState('h','Fixture',members[0]);d.members=members;d.profiles={parent:{},adult:{},child:{}};return d}
const event=(id,extra={})=>({id,title:'Friday dinner',ownerId:'parent',visibility:'family',allowedIds:[],memberIds:['parent'],date:'2026-11-06',time:'18:00',location:{label:'At Grandma’s',address:'A street 12',placeId:'test-place'},...extra});

test('location supports optional text, legacy names, selected IDs and removal',()=>{
 assert.equal(normalizeLocation(undefined),null);assert.equal(normalizeLocation({label:'  '}),null);
 assert.deepEqual(normalizeLocation('At Grandma’s'),{label:'At Grandma’s'});
 assert.deepEqual(normalizeLocation({label:' Home ',address:' A street 12 ',placeId:'test-place'}),{label:'Home',address:'A street 12',placeId:'test-place'});
 assert.equal(locationOf({location:{apiKey:'no'}}),null);
});
test('location cannot carry credentials, raw provider coordinates or executable URLs as place IDs',()=>{
 for(const value of [{label:'x'.repeat(241)},{address:'x'.repeat(301)},{placeId:'javascript:bad'},{placeId:'id\nother'},{label:7},{placeId:'x',lat:1},{key:'secret'},[]])assert.throws(()=>normalizeLocation(value));
});
test('maps URLs encode addresses and exact IDs without assuming a nickname is a resolved pin',()=>{
 assert.equal(mapsLink({label:'At Grandma’s'}),'');
 const url=new URL(mapsLink({label:'Grandma',address:'הגפן 12, רמת גן & חו״ל',placeId:'exact-place'}));
 assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('query_place_id'),'exact-place');assert.equal(url.searchParams.get('query'),'הגפן 12, רמת גן & חו״ל');
});
test('original-record links retain household identity, remove demo query and carry no private data',()=>{
 const url=new URL(recordLink('https://example.invalid/?demo=1#today',{householdId:'home-b',kind:'event',id:'id & one',date:'2026-11-06'}));
 assert.equal(url.search,'');assert.equal(linkedHousehold(url.hash),'home-b');assert.equal(new URLSearchParams(url.hash.split('?')[1]).get('event'),'id & one');assert.ok(url.hash.startsWith('#calendar?'));
 assert.ok(!url.href.includes('Grandma'));assert.throws(()=>recordLink('javascript:bad',{householdId:'h',kind:'event',id:'x'}));
});
test('server persists optional event/task locations and clears them without changing ownership',()=>{
 let d=home(),e=event('e'),t={...event('t'),memberId:'parent'};delete t.memberIds;
 d=applyChanges(d,[{collection:'events',id:'e',value:e},{collection:'tasks',id:'t',value:t}],'parent','parent');
 assert.deepEqual(d.events[0].location,e.location);assert.deepEqual(d.tasks[0].location,t.location);
 d=applyChanges(d,[{collection:'events',id:'e',value:{...e,location:null}}],'parent','parent');assert.equal(d.events[0].location,undefined);
 assert.throws(()=>applyChanges(d,[{collection:'tasks',id:'t',value:{...t,location:{lat:32}}}],'parent','parent'),/location/);
});
test('private locations, reusable places and note content are filtered on the server, including parents',()=>{
 const d=home();d.events=[event('private',{ownerId:'child',visibility:'private',memberIds:['child']}),event('selected',{visibility:'selected',allowedIds:['adult']})];
 d.places=[{id:'child-place',ownerId:'child',visibility:'private',location:{label:'Private place'}},{id:'selected-place',ownerId:'parent',visibility:'selected',allowedIds:['adult'],location:{label:'Selected place'}}];
 assert.deepEqual(visibleState(d,'parent').events.map(e=>e.id),['selected']);assert.deepEqual(visibleState(d,'adult').events.map(e=>e.id),['selected']);assert.deepEqual(visibleState(d,'child').events.map(e=>e.id),['private']);
 assert.deepEqual(visibleState(d,'parent').places.map(p=>p.id),['selected-place']);assert.deepEqual(visibleState(d,'child').places.map(p=>p.id),['child-place']);
 assert.throws(()=>applyChanges(d,[{collection:'places',id:'child-place',value:{...d.places[0],location:{label:'Changed'}}}],'parent','parent'),/private/);
});
test('saving a reusable place and activity is atomic and reusing a place never edits its audience',()=>{
 const d=home(),p={id:'place',title:'At Grandma’s',ownerId:'parent',visibility:'private',allowedIds:[],location:{label:'At Grandma’s'}},e=event('e');
 assert.throws(()=>applyChanges(d,[{collection:'places',id:p.id,value:p},{collection:'events',id:e.id,value:{...e,ownerId:'adult'}}],'parent','parent'),/ownership/);assert.equal(d.places.length,0);
 const saved=applyChanges(d,[{collection:'places',id:p.id,value:p},{collection:'events',id:e.id,value:e}],'parent','parent');assert.equal(saved.places[0].visibility,'private');assert.equal(saved.events[0].visibility,'family');
 assert.throws(()=>applyChanges(saved,[{collection:'places',id:p.id,value:{...p,ownerId:'adult'}}],'parent','parent'),/ownership/);
});


test('existing editor assignment, priority and recurrence fields remain compatible with optional locations',()=>{
 const d=home(),common={ownerId:'parent',visibility:'family',allowedIds:[],title:'Existing editor',date:'2026-11-06',time:'18:00',weekdays:[1,5],repeat:'weekly',until:'2026-12-31',turnOrder:'alternate',parentConfirm:false,location:{label:'At Grandma’s'}};
 const next=applyChanges(d,[{collection:'events',id:'editor-event',value:{...common,id:'editor-event',memberIds:['parent'],durationMinutes:60,editPolicy:'owner',editorIds:[]}},{collection:'tasks',id:'editor-task',value:{...common,id:'editor-task',memberId:'parent',priority:'high',routineId:'group-1',aiOperationId:'operation-1',done:false}}],'parent','parent');
 assert.equal(next.events[0].until,'2026-12-31');assert.equal(next.tasks[0].priority,'high');assert.equal(next.tasks[0].location.label,'At Grandma’s');
 const task=next.tasks[0];for(const invalid of [{priority:'urgent'},{until:'2026-02-30'},{apiKey:'never-a-record-field'}])assert.throws(()=>applyChanges(next,[{collection:'tasks',id:task.id,value:{...task,...invalid}}],'parent','parent'));
});
