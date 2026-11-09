import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
const people=[{id:'one',name:'One',role:'parent'},{id:'two',name:'Two',role:'parent'}];
function home(){const s=blankState('home','Home',people[0]);s.members=structuredClone(people);s.profiles.two={name:'Two',readNotifications:['other-read'],dismissedNotifications:['other-dismissed']};s.events=[{id:'event',title:'Family event',date:'2026-11-07',time:'18:00',memberIds:['one','two'],ownerId:'one',visibility:'family',allowedIds:[]}];return s}
test('bulk inbox removal is stored per recipient and leaves the shared source untouched',()=>{
 const s=home(),ids=['event:event:2026-11-07','due:task:2026-11-07'],next=applyChanges(s,[{collection:'profiles',id:'one',value:{...visibleState(s,'one').profiles.one,readNotifications:ids,dismissedNotifications:ids}}],'one','parent');
 assert.deepEqual(next.profiles.one.dismissedNotifications,ids);assert.deepEqual(next.profiles.one.readNotifications,ids);assert.deepEqual(next.events,s.events);assert.deepEqual(next.profiles.two,s.profiles.two);assert.equal(visibleState(next,'two').profiles.one.dismissedNotifications,undefined);assert.equal(visibleState(next,'one').profiles.two.readNotifications,undefined);
});
test('a refused inbox write leaves authoritative records unchanged and does not prevent a later valid removal',()=>{
 const s=home(),before=structuredClone(s);
 assert.throws(()=>applyChanges(s,[{collection:'profiles',id:'two',value:{dismissedNotifications:['event:event:2026-11-07']}}],'one','parent'),/private/);
 assert.deepEqual(s,before);
 const next=applyChanges(s,[{collection:'profiles',id:'one',value:{dismissedNotifications:['event:event:2026-11-07']}}],'one','parent');assert.deepEqual(next.profiles.one.dismissedNotifications,['event:event:2026-11-07']);assert.deepEqual(next.events,before.events);
});
test('invalid dismissal payload is refused without clearing saved dismissals',()=>{
 const s=home();s.profiles.one.dismissedNotifications=['saved'];
 assert.throws(()=>applyChanges(s,[{collection:'profiles',id:'one',value:{dismissedNotifications:['saved',{}]}}],'one','parent'),/preferences/);assert.deepEqual(s.profiles.one.dismissedNotifications,['saved']);
});
