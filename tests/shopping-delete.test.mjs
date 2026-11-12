// Deleting in Shopping (2026-11-11): items by anyone who may use the list and see the item, lists by their owner,
// "My shopping" stays; a deleted list takes its items with it on the server. Fake data only.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {canDeleteShoppingItem,canDeleteShoppingList,personalShoppingListId} from '../shared/shopping-lists.mjs';
import {blankState,applyChanges} from '../app/cloud/state.mjs';
const members=[{id:'one',name:'One',role:'parent'},{id:'two',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const list=(id,ownerId,visibility,allowedIds=[])=>({id,name:id,he:id,ownerId,visibility,allowedIds,status:'active',createdAt:'2026-11-01T00:00:00Z'});
const item=(id,listId,ownerId,visibility,allowedIds=[])=>({id,title:id,listId,ownerId,visibility,allowedIds,quantity:'1 items',quantityValue:1,unit:'items',done:false});
const state=()=>{const d=blankState('home','Home',members[0]);d.members=members;d.profiles.two={name:'Two'};d.profiles.kid={name:'Kid'};
 d.shoppingLists=[list('fam','one','family'),list('parents','one','selected',['two']),list('two-fam','two','family'),list(personalShoppingListId('one'),'one','private'),list(personalShoppingListId('two'),'two','private')];
 d.shopping=[item('milk','fam','two','family'),item('wine','parents','two','selected',['one']),item('gift','parents','one','selected',['two']),item('cream',personalShoppingListId('two'),'two','private'),item('bread','two-fam','two','family')];
 d.tasks=[{id:'trip',title:'Buy groceries',ownerId:'two',memberId:'two',memberIds:['two'],visibility:'family',allowedIds:[],date:'2026-11-12',repeat:'once',done:false,shoppingListId:'fam'}];return d};
test('an item can be deleted by its owner and by anyone who uses its list and sees it',()=>{const d=state(),find=id=>d.shopping.find(i=>i.id===id);
 assert.equal(canDeleteShoppingItem(find('milk'),d.shoppingLists,'one'),true);
 assert.equal(canDeleteShoppingItem(find('milk'),d.shoppingLists,'kid'),true,'children already remove family items');
 assert.equal(canDeleteShoppingItem(find('wine'),d.shoppingLists,'one'),true,'a selected list: the list owner removes the other parent’s item');
 assert.equal(canDeleteShoppingItem(find('gift'),d.shoppingLists,'two'),true,'a selected list: the allowed person removes the owner’s item');
 assert.equal(canDeleteShoppingItem(find('gift'),d.shoppingLists,'kid'),false,'outside the list');
 assert.equal(canDeleteShoppingItem(find('cream'),d.shoppingLists,'one'),false,'someone else’s private item');
 assert.equal(canDeleteShoppingItem(find('cream'),d.shoppingLists,'two'),true);
});
test('a list is deleted by its owner only, and “My shopping” stays',()=>{const d=state(),l=id=>d.shoppingLists.find(x=>x.id===id);
 assert.equal(canDeleteShoppingList(l('fam'),'one'),true);assert.equal(canDeleteShoppingList(l('fam'),'two'),false);assert.equal(canDeleteShoppingList(l('two-fam'),'one'),false);
 assert.equal(canDeleteShoppingList(l(personalShoppingListId('one')),'one'),false);
});
test('the server lets a list member delete an item in a selected list and still refuses outsiders',()=>{
 const next=applyChanges(state(),[{collection:'shopping',id:'wine',delete:true}],'one','parent');assert.ok(!next.shopping.some(i=>i.id==='wine'));
 assert.ok(!applyChanges(state(),[{collection:'shopping',id:'gift',delete:true}],'two','parent').shopping.some(i=>i.id==='gift'));
 assert.throws(()=>applyChanges(state(),[{collection:'shopping',id:'gift',delete:true}],'kid','child'),/private|owner/);
 assert.throws(()=>applyChanges(state(),[{collection:'shopping',id:'cream',delete:true}],'one','parent'),/private|owner/);
});
test('deleting a list removes its items, unlinks its trips and accepts the client’s own item deletes in the same request',()=>{
 const next=applyChanges(state(),[{collection:'shoppingLists',id:'fam',delete:true},{collection:'shopping',id:'milk',delete:true}],'one','parent');
 assert.ok(!next.shoppingLists.some(l=>l.id==='fam'));assert.ok(!next.shopping.some(i=>i.listId==='fam'));assert.equal(next.tasks[0].shoppingListId,undefined);assert.ok(next.shopping.some(i=>i.id==='bread'),'other lists untouched');
 const hidden=applyChanges(state(),[{collection:'shoppingLists',id:'parents',delete:true}],'one','parent');assert.ok(!hidden.shopping.some(i=>i.listId==='parents'),'items the owner cannot see do not bring the list back');
 assert.throws(()=>applyChanges(state(),[{collection:'shoppingLists',id:'fam',delete:true}],'two','parent'),/owner/);
});
test('a missing item that was not removed with its list is still refused',()=>{assert.throws(()=>applyChanges(state(),[{collection:'shopping',id:'nope',delete:true}],'one','parent'),/owner/)});
