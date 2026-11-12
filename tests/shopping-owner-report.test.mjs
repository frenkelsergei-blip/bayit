// Owner report 2026-11-12 (live 1.70.0), fake data. Daniel added items to "קניות לבית", a list Hila owns and shares
// with him only: (1) each item was saved for Daniel alone, so Hila, the list's owner, could not see it, and renaming
// it failed ("Not saved…") because the editor looked for a list with that narrower audience and tried to create one
// shared with nobody; (2) after his first tick every item he had added in the half hour before moved into the flat
// "Added during the shop" group, so the list lost its categories ("it turned into a list instead of cards").
import {test} from 'node:test';import assert from 'node:assert/strict';
import {itemAudience,includeListOwner,upgradeShoppingLists} from '../shared/shopping-lists.mjs';
import {shoppingTarget,transferShoppingItems} from '../shared/shopping-transfer.mjs';
import {addedDuringShop,isNewItem,shopInProgress} from '../shared/shopping-rhythm.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {canSeeRecord} from '../shared/record-audience.mjs';
import {readFileSync} from 'node:fs';

const members=[{id:'daniel',name:'Daniel',role:'parent'},{id:'hila',name:'Hila',role:'parent'},{id:'noa',name:'Noa',role:'child'}];
const home={id:'home',name:'קניות לבית',he:'קניות לבית',ownerId:'hila',visibility:'selected',allowedIds:['daniel'],status:'active',createdAt:'2026-11-05T18:09:43Z'};
const item=(id,extra={})=>({id,title:id,he:id,listId:'home',quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'daniel',done:false,ownerId:'daniel',...extra});
const state=items=>{const d=blankState('h','Home',members[0]);d.members=members;d.profiles.hila={name:'Hila'};d.profiles.noa={name:'Noa'};d.shoppingLists.push(structuredClone(home));d.shopping=items;return d};

test('an item someone else adds to a shared list is shared with the list’s owner too',()=>{
 assert.deepEqual(itemAudience(home,'daniel'),{visibility:'selected',allowedIds:['hila']});
 assert.deepEqual(itemAudience(home,'hila'),{visibility:'selected',allowedIds:['daniel']});
 assert.deepEqual(itemAudience({...home,visibility:'family',allowedIds:[]},'daniel'),{visibility:'family',allowedIds:[]});
 assert.deepEqual(itemAudience({...home,visibility:'private',allowedIds:[]},'hila'),{visibility:'private',allowedIds:[]});
});

test('the server keeps the list’s owner on items written with only the list’s allowed people (old app, Telegram, AI)',()=>{
 const next=applyChanges(state([]),[{collection:'shopping',id:'פטריו',value:item('פטריו',{visibility:'selected',allowedIds:['daniel']})}],'daniel','parent');
 const saved=next.shopping.find(i=>i.id==='פטריו');
 assert.ok(saved.allowedIds.includes('hila'));assert.ok(canSeeRecord(saved,'hila','shopping'));
 assert.ok(visibleState(next,'hila').shopping.some(i=>i.id==='פטריו'),'Hila sees what Daniel added to her list');
 assert.ok(!visibleState(next,'noa').shopping.some(i=>i.id==='פטריו'),'still not someone outside the list');
});

test('items saved before the fix are repaired when the family’s data is read',()=>{
 const d=upgradeShoppingLists(state([item('ציפס',{visibility:'selected',allowedIds:['daniel']}),item('own',{ownerId:'hila',visibility:'selected',allowedIds:['daniel']})]),members);
 assert.deepEqual(d.shopping.find(i=>i.id==='ציפס').allowedIds,['daniel','hila']);
 assert.deepEqual(d.shopping.find(i=>i.id==='own').allowedIds,['daniel'],'the owner’s own item is unchanged');
 const fam=includeListOwner(item('x',{visibility:'family',allowedIds:[]}),home);assert.equal(fam.visibility,'family','a family item is left as it is');
});

test('renaming the item finds its own list again instead of creating one shared with nobody',()=>{
 const d=state([item('פטריו',{visibility:'selected',allowedIds:['daniel']})]);
 assert.throws(()=>shoppingTarget(structuredClone(d),d.shopping[0],'daniel',{preferredId:'home'}),/Choose who can access/,'1.70.0: the narrow audience matched no list');
 const repaired=upgradeShoppingLists(structuredClone(d),members),before=repaired.shoppingLists.length;
 assert.equal(shoppingTarget(repaired,repaired.shopping[0],'daniel',{preferredId:'home'}).id,'home');assert.equal(repaired.shoppingLists.length,before);
 const renamed=applyChanges(repaired,[{collection:'shopping',id:'פטריו',value:{...repaired.shopping[0],title:'פטריות',he:'פטריות'}}],'daniel','parent');
 assert.equal(renamed.shopping.find(i=>i.id==='פטריו').title,'פטריות');
});

test('the item editor keeps the item on its own list and writes only what it edits',()=>{
 const src=readFileSync(new URL('../app/src/shopping-view.jsx',import.meta.url),'utf8'),save=src.slice(src.indexOf(' const save=async e=>'),src.indexOf(' // Delete: swipe'));
 assert.ok(!/Object\.assign\([^)]*,editor,/.test(save),'no stale copy of the whole item (a tick made meanwhile would be undone)');
 assert.match(save,/same&&own&&own\.status==='active'&&canAccessList\(own,a\.user\)\?own:shoppingTarget/);
 assert.match(save,/includeListOwner\(item,list\)/);
});

test('Telegram and other transfers add items that the list’s owner sees',()=>{
 const d=state([]);transferShoppingItems(d,[{title:'חלב'}],{visibility:'selected',ownerId:'daniel',allowedIds:['hila']},'daniel',{preferredId:'home'});
 const added=d.shopping.find(i=>i.title==='חלב');assert.equal(added.listId,'home');assert.ok(canSeeRecord(added,'hila','shopping'));
});

test('“Added during the shop” holds only what was added after the first tick',()=>{
 const items=[item('built-10:15',{createdAt:'2026-11-12T10:15:02Z'}),item('built-10:24',{createdAt:'2026-11-12T10:24:52Z'}),
  item('ticked',{createdAt:'2026-11-12T10:15:16Z',done:true,boughtAt:'2026-11-12T10:25:00Z',boughtBy:'daniel'}),item('added-later',{createdAt:'2026-11-12T10:26:00Z',createdBy:'hila'})];
 const now=Date.parse('2026-11-12T10:27:00Z'),shop=shopInProgress(items,now);assert.equal(shop.startedAt,'2026-11-12T10:25:00Z');
 assert.deepEqual(items.filter(i=>addedDuringShop(i,shop)).map(i=>i.id),['added-later']);
 assert.ok(isNewItem(items[1],shop,now),'the “New” tag still shows on what was just added');
 assert.equal(addedDuringShop(items[3],null),false,'no shop, no group');
});


// Part 2 (owner, 2026-11-12, after the questions): a list without a date stays without one; a date is a target. Ticking
// means shopping now, today, whatever date was set, so finishing early completes the planned shop today.
test('finishing a shop before its planned day completes the plan today, and the server accepts it',async()=>{
 const {completeTask}=await import('../app/src/domain.js'),{HOME_TIMEZONE}=await import('../shared/home-config.mjs');
 const today=new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE}),later=new Date(Date.parse(today+'T12:00:00Z')+3*864e5).toISOString().slice(0,10);
 const src=readFileSync(new URL('../app/src/App.jsx',import.meta.url),'utf8');
 assert.match(src,/t\.kind==='shopping-trip'&&t\.shoppingListId===listKey&&t\.date&&completionState\(t,t\.date\)!=='done'&&canSee\(t,user\)&&\(member\(user\)\.role==='parent'\|\|t\.memberId===user\)\);if\(!trip\)return null;const was=trip\.date;if\(trip\.date>anchor\)trip\.date=anchor;/);
 const d=state([item('a',{visibility:'selected',allowedIds:['hila']})]);
 d.tasks=[{id:'trip',title:'Shopping: קניות לבית',he:'קניות: קניות לבית',kind:'shopping-trip',icon:'1F6D2',repeat:'once',done:false,xp:0,ownerId:'hila',memberId:'hila',memberIds:['hila'],visibility:'selected',allowedIds:['daniel'],date:later,time:'17:30',shoppingListId:'home'}];
 const trip=structuredClone(d.tasks[0]);trip.date=today;completeTask(trip,{date:today,actorId:'daniel',actorRole:'parent',time:'10:25',instant:'2026-11-12T08:25:00Z'});
 const next=applyChanges(d,[{collection:'tasks',id:'trip',value:trip}],'daniel','parent'),saved=next.tasks.find(t=>t.id==='trip');
 assert.equal(saved.date,today);assert.equal(saved.completions[today].state,'done');
 const other=structuredClone(d.tasks[0]);other.kind='chore';other.date=today;completeTask(other,{date:today,actorId:'daniel',actorRole:'parent',time:'10:25',instant:new Date().toISOString()});
 assert.throws(()=>applyChanges({...structuredClone(d),tasks:[{...d.tasks[0],kind:'chore'}]},[{collection:'tasks',id:'trip',value:other}],'daniel','parent'),/another person/,'only a planned shop moves; other future tasks still cannot be completed early');
});
