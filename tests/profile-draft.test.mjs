import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasProfileChanges} from '../app/src/profile-draft.mjs';

test('profile dirtiness ignores server progress and equivalent editor defaults',()=>{
 const saved={name:'Daniel',xp:20},defaults={displayMode:'photo',color:'blue',locale:'en',character:'adult-1'};
 assert.equal(hasProfileChanges({...saved,name:' Daniel ',photo:'',displayMode:'photo',color:'blue',locale:'en',character:'adult-1',birthday:'',birthdayInCalendar:true,badgeIcon:'1F3E0',xp:80,equipped:'hat',notificationPrefs:{reminder:30}},saved,defaults),false);
});
test('actual profile edits are dirty, and undoing them restores the clean state',()=>{
 const saved={name:'Daniel',photo:'original-photo',displayMode:'pixel',character:'adult-1',locale:'en',birthday:'1990-02-03',birthdayInCalendar:true,color:'blue'};
 for(const change of [{name:'Dani'},{name:''},{photo:''},{displayMode:'icon'},{character:'adult-2'},{locale:'he'},{birthday:'1990-02-04'},{birthdayInCalendar:false},{color:'green'},{badgeIcon:'1F431'}]){
  const draft={...saved,...change};assert.equal(hasProfileChanges(draft,saved),true);assert.equal(hasProfileChanges({...draft,...saved,badgeIcon:saved.badgeIcon},saved),false);
 }
});
test('a successful-save baseline becomes clean without treating rewards as editable changes',()=>{
 const original={name:'Daniel',photo:'old',locale:'en',xp:20},draft={...original,name:'Dani',photo:'new',locale:'he'};
 assert.equal(hasProfileChanges(draft,original),true);
 assert.equal(hasProfileChanges(draft,{...draft,xp:50,equipped:'cape'}),false);
 assert.equal(hasProfileChanges({...draft,photo:''},draft),true);
});
