// Birthdays repeat every year (Feb 29 falls back to Feb 28) and stay in sync with the profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {occursOn} from '../app/src/domain.js';
import {syncBirthday,ageOn,birthdayEventId} from '../app/src/birthdays.js';

test('a yearly record occurs on its anniversary only',()=>{
 const birthday={date:'2018-11-07',repeat:'yearly'};
 assert.equal(occursOn(birthday,'2026-11-07'),true);
 assert.equal(occursOn(birthday,'2026-11-08'),false);
 assert.equal(occursOn(birthday,'2017-11-07'),false,'not before the birth date');
 const leap={date:'2016-02-29',repeat:'yearly'};
 assert.equal(occursOn(leap,'2027-02-28'),true);
 assert.equal(occursOn(leap,'2028-02-29'),true);
 assert.equal(occursOn(leap,'2028-02-28'),false);
});

test('syncBirthday adds, updates and removes the family calendar event',()=>{
 const d={events:[]};
 syncBirthday(d,'kid',{name:'Maya',birthday:'2019-03-14',inCalendar:true,color:'peach',ownerId:'mom'});
 assert.equal(d.events.length,1);
 const event=d.events[0];
 assert.equal(event.id,birthdayEventId('kid'));
 assert.deepEqual([event.repeat,event.visibility,event.ownerId,event.memberIds[0],event.title],['yearly','family','mom','kid','Maya’s birthday']);
 syncBirthday(d,'kid',{name:'Maya',birthday:'2019-03-15',inCalendar:true,color:'peach',ownerId:'dad'});
 assert.equal(d.events.length,1);assert.equal(d.events[0].date,'2019-03-15');assert.equal(d.events[0].ownerId,'mom','original owner is kept');
 syncBirthday(d,'kid',{name:'Maya',birthday:'2019-03-15',inCalendar:false});
 assert.equal(d.events.length,0);
 syncBirthday(d,'kid',{name:'Maya',birthday:'',inCalendar:true});
 assert.equal(d.events.length,0);
});

test('age is counted from the birthday',()=>{
 assert.equal(ageOn('2019-03-14','2026-03-13'),6);
 assert.equal(ageOn('2019-03-14','2026-03-14'),7);
 assert.equal(ageOn('',  '2026-03-14'),null);
});

for(const visibility of ['private','selected'])test('profile edits preserve '+visibility+' birthday permissions',()=>{
 const existing={id:birthdayEventId('kid'),visibility,ownerId:'mom',allowedIds:visibility==='selected'?['kid']:[],editPolicy:'selected',editorIds:['kid'],date:'2019-03-14'};
 const d={events:[existing]};
 syncBirthday(d,'kid',{name:'New name',birthday:'2019-03-15',inCalendar:true,ownerId:'dad'});
 for(const key of ['visibility','ownerId','allowedIds','editPolicy','editorIds'])assert.deepEqual(d.events[0][key],existing[key],key+' is preserved');
});
