// Finishing a shop and the shopping history (owner's choice B, 2026-11-12): what was bought moves to a shop (an archived
// list record { shopOf }) and the list keeps its id as the new, empty list. Fictional family, server rules via applyChanges.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {finishShop,undoShop,shopsOf,shopSummary,PAGE,isShop} from '../shared/shopping-history.mjs';
import {personalShoppingListId,canDeleteShoppingList} from '../shared/shopping-lists.mjs';
import {shopToday} from '../shared/shopping-rhythm.mjs';
import {blankState,applyChanges,diffState,visibleState} from '../app/cloud/state.mjs';
import {readFileSync} from 'node:fs';

const members=[{id:'daniel',name:'Daniel',role:'parent'},{id:'hila',name:'Hila',role:'parent'},{id:'noa',name:'Noa',role:'child'}];
const list=(id,ownerId,visibility,allowedIds=[])=>({id,name:id,he:id,ownerId,visibility,allowedIds,status:'active',createdAt:'2026-11-01T00:00:00Z'});
const item=(id,listId,extra={})=>({id,title:id,he:id,listId,quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'daniel',ownerId:'daniel',visibility:'selected',allowedIds:['hila'],done:false,createdAt:'2026-11-12T08:00:00Z',createdBy:'daniel',...extra});
const ticked=(id,listId,extra={})=>item(id,listId,{done:true,boughtAt:'2026-11-12T10:25:00Z',boughtBy:'daniel',...extra});
function home(){const d=blankState('h','Home',members[0]);d.members=members;d.profiles.hila={name:'Hila'};d.profiles.noa={name:'Noa'};
 d.shoppingLists.push(list('home','hila','selected',['daniel']),list('fam','daniel','family'));
 d.shopping=[ticked('kebab','home'),ticked('challah','home'),item('cabbage','home'),item('milk','fam',{visibility:'family',allowedIds:[]})];
 d.tasks=[{id:'trip',title:'Shopping: home',he:'קניות: home',kind:'shopping-trip',icon:'1F6D2',repeat:'once',done:false,xp:0,ownerId:'hila',memberId:'hila',memberIds:['hila'],visibility:'selected',allowedIds:['daniel'],date:'2099-01-01',time:'17:30',shoppingListId:'home'}];
 return applyChanges(d,[],'daniel','parent')}
// What the app sends: a change computed from the person's own copy, applied by the server.
const send=(state,actor,change)=>{const before=visibleState(state,actor),after=structuredClone(before);change(after);return applyChanges(state,diffState(before,after),actor,members.find(m=>m.id===actor).role)};

test('finishing moves what was bought to a shop; the list keeps its id, owner and what was left',()=>{
 const next=send(home(),'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:'2026-11-12T10:30:00Z'}));
 const shop=next.shoppingLists.find(l=>l.id==='shop-1'),own=next.shoppingLists.find(l=>l.id==='home');
 assert.equal(own.ownerId,'hila');assert.equal(own.status,'active','the list is the new, empty list');
 assert.deepEqual({o:shop.ownerId,v:shop.visibility,a:shop.allowedIds,s:shop.status,of:shop.shopOf,left:shop.leftCount},{o:'daniel',v:'selected',a:['hila'],s:'archived',of:'home',left:1});
 assert.deepEqual(next.shopping.filter(i=>i.listId==='shop-1').map(i=>i.id).sort(),['challah','kebab']);
 assert.deepEqual(next.shopping.filter(i=>i.listId==='home').map(i=>i.id),['cabbage'],'not bought stays for next time');
 assert.ok(visibleState(next,'hila').shoppingLists.some(l=>l.id==='shop-1'),'the list owner sees the shop');
});

test('the planned shop, Telegram and "My shopping" keep pointing at the same list',()=>{
 const next=send(home(),'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1'}));
 assert.equal(next.tasks[0].shoppingListId,'home');
 assert.equal(shopToday(visibleState(next,'hila'),'hila','2099-01-01').list.id,'home','the shop-day message still finds its list');
 const mine=personalShoppingListId('daniel'),p=home();p.shopping.push(ticked('pitas',mine,{visibility:'private',allowedIds:[]}));
 const after=send(applyChanges(p,[],'daniel','parent'),'daniel',d=>finishShop(d,{listId:mine,actorId:'daniel',shopId:'shop-p'}));
 assert.ok(after.shoppingLists.some(l=>l.id===mine&&l.status==='active'),'"My shopping" stays');assert.equal(canDeleteShoppingList(after.shoppingLists.find(l=>l.id===mine),'daniel'),false);
 assert.equal(after.shoppingLists.find(l=>l.id==='shop-p').visibility,'private');
 assert.throws(()=>finishShop(structuredClone(after),{listId:mine,actorId:'hila',shopId:'x'}),/unavailable/,'nobody else finishes a private list');
});

test('Undo puts everything back exactly',()=>{
 const start=home(),done=send(start,'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',keepLeft:false}));
 assert.equal(done.shopping.filter(i=>i.listId==='shop-1').length,3,'without keeping, the left item goes with the shop');
 const undone=send(done,'daniel',d=>undoShop(d,'shop-1','daniel'));
 assert.deepEqual(undone.shopping,start.shopping,'items exactly as before (no leftover fields)');
 assert.deepEqual(undone.shoppingLists,start.shoppingLists);
 assert.throws(()=>undoShop(structuredClone(visibleState(done,'hila')),'shop-1','hila'),/Only the person who finished/);
});

test('a phone that had not seen the shop close does not pull a bought item back onto the list',()=>{
 const start=home(),hilaCopy=visibleState(start,'hila'),done=send(start,'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1'}));
 // Hila's stale copy: she renames the kebab (pending offline) and adds a new item to the list meanwhile.
 const stale=structuredClone(hilaCopy);stale.shopping.find(i=>i.id==='kebab').title='kebab 1 kg';stale.shopping.push(item('eggs','home',{ownerId:'hila',memberId:'hila',createdBy:'hila',allowedIds:['daniel']}));
 const next=applyChanges(done,diffState(hilaCopy,stale),'hila','parent');
 const kebab=next.shopping.find(i=>i.id==='kebab');assert.equal(kebab.listId,'shop-1');assert.equal(kebab.title,'kebab 1 kg','her edit is kept, in the shop');
 assert.equal(next.shopping.find(i=>i.id==='eggs').listId,'home','what she added is for the next shop');
 assert.equal(next.shopping.find(i=>i.id==='kebab').restoredFrom,undefined);
});

test('a shop is checked by the server: archived, of a list you use, no wider than that list',()=>{
 const s=home(),shop=o=>({id:'s',name:'x',he:'x',ownerId:'daniel',status:'archived',shopOf:'home',visibility:'selected',allowedIds:['hila'],archivedAt:'2026-11-12T10:30:00Z',finishedBy:'daniel',...o});
 assert.doesNotThrow(()=>applyChanges(s,[{collection:'shoppingLists',id:'s',value:shop({})}],'daniel','parent'));
 assert.throws(()=>applyChanges(s,[{collection:'shoppingLists',id:'s',value:shop({visibility:'family',allowedIds:[]})}],'daniel','parent'),/more widely/);
 assert.throws(()=>applyChanges(s,[{collection:'shoppingLists',id:'s',value:shop({status:'active'})}],'daniel','parent'),/unavailable/);
 assert.throws(()=>applyChanges(s,[{collection:'shoppingLists',id:'s',value:shop({ownerId:'noa',shopOf:'home'})}],'noa','child'),/unavailable|ownership/,'a child outside the list cannot make a shop of it');
});

test('history: newest first, PAGE at a time, never in the list strip or the AI list catalog',()=>{
 const lists=[...Array(45)].map((_,n)=>({id:'s'+n,shopOf:'home',status:'archived',archivedAt:new Date(Date.UTC(2026,9,1)+n*864e5).toISOString()}));
 const h=shopsOf(lists,'home');assert.equal(h.length,45);assert.equal(h[0].id,'s44');assert.equal(PAGE,20);
 assert.ok(isShop(h[0]));
 const src=readFileSync(new URL('../app/src/shopping-lists.jsx',import.meta.url),'utf8');assert.match(src,/canAccessList\(l,a\.user\)&&!l\.shopOf/);
 assert.match(readFileSync(new URL('../shared/ai-contract.mjs',import.meta.url),'utf8'),/canAccessList\(l,actorId\)&&!l\.shopOf/);
 const sum=shopSummary({id:'s',leftCount:2},{shopping:[{id:'a',listId:'s',done:true}],receipts:[{id:'r',listId:'s',total:10,createdAt:'1'}]});assert.equal(sum.bought.length,1);assert.equal(sum.leftCount,2);assert.equal(sum.total,10);
});

test('Undo of a finish restores the planned shop (App)',()=>{
 const src=readFileSync(new URL('../app/src/App.jsx',import.meta.url),'utf8');
 assert.match(src,/const undoShopping=shopId=>update\(d=>\{const shop=undoShop\(d,shopId,user,id\(\)\),trip=shop\.tripId/);
});
