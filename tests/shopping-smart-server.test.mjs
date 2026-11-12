import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
const members=[{id:'one',name:'One',role:'parent'},{id:'two',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const state=()=>{const d=blankState('home','Home',members[0]);d.members=members;d.profiles.two={name:'Two'};d.profiles.kid={name:'Kid'};return d};
const fav=(over={})=>({id:'f1',kind:'likes',status:'requested',memberId:'kid',ownerId:'kid',visibility:'family',allowedIds:[],title:'Cornflakes',he:'קורנפלקס',key:'cornflakes',...over});
const mark=(over={})=>({id:'m1',kind:'stop',key:'milk',title:'Milk',listId:'week',ownerId:'two',visibility:'family',allowedIds:[],date:'2026-11-04',...over});

test('new shopping items get a server time and author, kept on later edits',()=>{
 const d=state();const item={id:'i1',ownerId:'one',visibility:'family',allowedIds:[],title:'Milk',quantity:'1',quantityValue:1,listId:'week',done:false,createdAt:'1999-01-01T00:00:00Z'};
 const a=applyChanges(d,[{collection:'shopping',id:'i1',value:item}],'one','parent');
 const saved=a.shopping.find(i=>i.id==='i1');assert.notEqual(saved.createdAt,'1999-01-01T00:00:00Z');assert.equal(saved.createdBy,'one');
 const b=applyChanges(a,[{collection:'shopping',id:'i1',value:{...saved,title:'Milk 3%',createdAt:'2000-01-01T00:00:00Z'}}],'two','parent');
 assert.equal(b.shopping.find(i=>i.id==='i1').createdAt,saved.createdAt);
});

test('a child asks for a favourite; only a parent approves it',()=>{
 const d=state();
 assert.throws(()=>applyChanges(d,[{collection:'favourites',id:'f1',value:fav({status:'approved'})}],'kid','child'),/parent approves/);
 assert.throws(()=>applyChanges(d,[{collection:'favourites',id:'f1',value:fav({memberId:'one'})}],'kid','child'),/parent approves/);
 const a=applyChanges(d,[{collection:'favourites',id:'f1',value:fav()}],'kid','child');
 const asked=a.favourites.find(f=>f.id==='f1');
 assert.throws(()=>applyChanges(a,[{collection:'favourites',id:'f1',value:{...asked,status:'approved'}}],'kid','child'),/parent approves/);
 assert.throws(()=>applyChanges(a,[{collection:'favourites',id:'f1',value:{...asked,title:'Chocolate',status:'approved'}}],'one','parent'),/parent decides/);
 const b=applyChanges(a,[{collection:'favourites',id:'f1',value:{...asked,status:'approved'}}],'one','parent');
 const ok=b.favourites.find(f=>f.id==='f1');assert.equal(ok.status,'approved');assert.equal(ok.decidedBy,'one');
 const c=applyChanges(b,[{collection:'favourites',id:'f1',delete:true}],'kid','child');assert.equal(c.favourites.length,0,'a child removes its own like');
});

test('"stop suggesting" can be undone by anyone who sees it; private marks stay with their owner',()=>{
 const d=state();const a=applyChanges(d,[{collection:'shoppingMarks',id:'m1',value:mark()}],'two','parent');
 assert.throws(()=>applyChanges(a,[{collection:'shoppingMarks',id:'m1',value:mark({kind:'never'})}],'two','parent'),/valid answer/);
 const b=applyChanges(a,[{collection:'shoppingMarks',id:'m1',delete:true}],'one','parent');assert.equal(b.shoppingMarks.length,0);
 d.shoppingLists.push({id:'private-two-week',ownerId:'two',visibility:'private',allowedIds:[],status:'active',name:'My shopping'});
 assert.throws(()=>applyChanges(d,[{collection:'shoppingMarks',id:'m2',value:mark({id:'m2',listId:'private-two-week'})}],'two','parent'),/widely/);
});

test('receipts are adults only and never reach a child',()=>{
 const d=state();const r={id:'r1',listId:'week',ownerId:'one',visibility:'family',allowedIds:[],title:'Receipt',store:'Supermarket',total:412.6,lines:[{raw:'עגבניה שרי',price:17.8,key:'tomato'}]};
 assert.throws(()=>applyChanges(d,[{collection:'receipts',id:'r1',value:{...r,ownerId:'kid'}}],'kid','child'),/adult/);
 const a=applyChanges(d,[{collection:'receipts',id:'r1',value:r}],'one','parent');
 assert.equal(visibleState(a,'two').receipts.length,1);assert.deepEqual(visibleState(a,'kid').receipts,[]);
});

test('personal shopping switches are private to each person',()=>{
 const d=state();const a=applyChanges(d,[{collection:'preferences',id:'shoppingByUser',value:{one:{suggest:false}}}],'one','parent');
 assert.deepEqual(visibleState(a,'one').preferences.shoppingByUser,{one:{suggest:false}});
 assert.equal(visibleState(a,'two').preferences.shoppingByUser,undefined);
});

test('a child never holds receipts, prices or charge links: not in sync, offline copy or export',async()=>{
 const {offlineSnapshot}=await import('../shared/offline-sync.mjs'),{accessibleExport}=await import('../shared/access-export.mjs');
 const d=state();const r={id:'r1',listId:'week',ownerId:'one',visibility:'family',allowedIds:[],title:'Receipt',store:'Supermarket',total:412.6,matchedExpenseId:'tx-1',lines:[{raw:'tomato',price:17.8,key:'tomato'}]};
 const a=applyChanges(d,[{collection:'receipts',id:'r1',value:r}],'one','parent');
 const kid=visibleState(a,'kid');assert.deepEqual(kid.receipts,[]);assert.ok(!JSON.stringify(kid).includes('412.6')&&!JSON.stringify(kid).includes('tx-1'),'no total or charge link anywhere in the child\'s state');
 assert.deepEqual(offlineSnapshot(visibleState(a,'one')).receipts,[],'never kept offline, even for adults');
 assert.ok(!JSON.stringify(accessibleExport(kid,'kid',list=>list)).includes('412.6'),'not in the child\'s export');
});

test('a favourite kept "only me" is not readable by anyone else',()=>{
 const d=state();const a=applyChanges(d,[{collection:'favourites',id:'f9',value:fav({id:'f9',memberId:'one',ownerId:'one',status:'approved',visibility:'private'})}],'one','parent');
 assert.equal(visibleState(a,'one').favourites.length,1);assert.equal(visibleState(a,'two').favourites.length,0);assert.equal(visibleState(a,'kid').favourites.length,0);
});
