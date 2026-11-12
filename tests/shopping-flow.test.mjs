// The shopping flow (audit 2026-11-12, owner's go-ahead): a list is Planning, Shopping now (only when someone STARTED a
// shop) or back to Planning after Finish. Fictional family; server rules via applyChanges, app rules via source checks.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startShop,stopShop,finishShop,undoShop,openShopOf,shopsOf,OPEN_MS} from '../shared/shopping-history.mjs';
import {shopInProgress,shopUpdates} from '../shared/shopping-rhythm.mjs';
import {blankState,applyChanges,diffState,visibleState} from '../app/cloud/state.mjs';

const members=[{id:'daniel',name:'Daniel',role:'parent'},{id:'hila',name:'Hila',role:'parent'},{id:'noa',name:'Noa',role:'child'}];
const T0=Date.parse('2026-11-12T15:00:00Z'),at=m=>new Date(T0+m*60000).toISOString();
const item=(id,extra={})=>({id,title:id,he:id,listId:'home',quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'hila',ownerId:'hila',visibility:'family',allowedIds:[],done:false,createdAt:at(-60),createdBy:'hila',...extra});
function home(){const d=blankState('h','Home',members[0]);d.members=members;d.profiles.hila={name:'Hila'};d.profiles.noa={name:'Noa'};
 d.shoppingLists.push({id:'home',name:'Home',he:'בית',ownerId:'hila',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'},{id:'bbq',name:'BBQ',he:'על האש',ownerId:'daniel',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'});
 d.shopping=[item('milk'),item('bread'),item('eggs'),item('coal',{listId:'bbq',ownerId:'daniel',memberId:'daniel',createdBy:'daniel'})];
 return applyChanges(d,[],'daniel','parent')}
const send=(state,actor,change)=>{const before=visibleState(state,actor),after=structuredClone(before);change(after);return applyChanges(state,diffState(before,after),actor,members.find(m=>m.id===actor).role)};
const tick=(d,id,by,m)=>Object.assign(d.shopping.find(i=>i.id===id),{done:true,boughtAt:at(m),boughtBy:by});

test('a tick alone is not a shop: nobody is told and nothing says "shopping now"',()=>{
 const s=send(home(),'daniel',d=>tick(d,'milk','daniel',1));
 assert.equal(openShopOf(s.shoppingLists,'home',T0+2*60000),null);
 assert.equal(shopInProgress(s.shopping.filter(i=>i.listId==='home'),T0+2*60000,null),null);
 assert.deepEqual(shopUpdates(visibleState(s,'hila'),'hila',{now:T0+2*60000}),[],'no "Daniel is shopping now"');
});

test('Start: the starter is the shopper; a second adult who ticks is shown as joining, not replacing',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 const open=openShopOf(s.shoppingLists,'home',T0+60000);assert.equal(open.id,'shop-1');assert.equal(open.ownerId,'daniel');assert.equal(open.status,'shopping');
 s=send(s,'hila',d=>{assert.equal(startShop(d,{listId:'home',actorId:'hila',shopId:'x',now:at(1)}).id,'shop-1','Hila joins the same shop');tick(d,'bread','hila',2)});
 assert.equal(s.shoppingLists.filter(l=>l.shopOf==='home').length,1);
 const shop=shopInProgress(s.shopping.filter(i=>i.listId==='home'),T0+3*60000,openShopOf(s.shoppingLists,'home',T0+3*60000));
 assert.equal(shop.by,'daniel');assert.deepEqual(shop.with,['hila']);
 assert.deepEqual(shopUpdates(visibleState(s,'hila'),'hila',{now:T0+3*60000}).map(m=>m.kind),[],'Hila is shopping too: no "started" for her');
 assert.equal(visibleState(s,'noa').shoppingLists.some(l=>l.id==='shop-1'),true,'the family sees who is shopping');
});

test('the server: only the starter makes a started shop; a finished shop never goes back; no wider than its list',()=>{
 const s=home(),rec=o=>({id:'o',name:'x',he:'x',ownerId:'daniel',visibility:'family',allowedIds:[],status:'shopping',shopOf:'home',startedBy:'daniel',startedAt:at(0),createdAt:at(0),...o});
 assert.doesNotThrow(()=>applyChanges(s,[{collection:'shoppingLists',id:'o',value:rec({})}],'daniel','parent'));
 assert.throws(()=>applyChanges(s,[{collection:'shoppingLists',id:'o',value:rec({startedBy:'hila'})}],'daniel','parent'),/unavailable/);
 const done=send(s,'daniel',d=>{d.shopping.find(i=>i.id==='milk').done=true;finishShop(d,{listId:'home',actorId:'daniel',shopId:'f',now:at(5)})});
 const f=done.shoppingLists.find(l=>l.id==='f');assert.throws(()=>applyChanges(done,[{collection:'shoppingLists',id:'f',value:{...f,status:'shopping',startedBy:'daniel'}}],'daniel','parent'),/unavailable/);
});

test('Finish turns my started shop into the finished one, keeps its start time and takes my receipt',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 s=send(s,'daniel',d=>{tick(d,'milk','daniel',3);tick(d,'bread','daniel',4);(d.receipts??=[]).push({id:'r',title:'Receipt',listId:'home',ownerId:'daniel',visibility:'family',allowedIds:[],store:'x',total:20,currency:'ILS',shopDate:'2026-11-12',lines:[],createdAt:at(8)})});
 s=send(s,'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'other',now:at(10)}));
 const shop=s.shoppingLists.find(l=>l.id==='shop-1');assert.equal(shop.status,'archived');assert.equal(shop.startedAt,at(0));assert.equal(shop.leftCount,1);
 assert.ok(!s.shoppingLists.some(l=>l.id==='other'));assert.equal(s.receipts[0].listId,'shop-1');
 assert.deepEqual(s.shopping.filter(i=>i.listId==='home').map(i=>i.id),['eggs'],'what was not bought stays for next time');
 assert.equal(openShopOf(s.shoppingLists,'home',T0+11*60000),null,'back to Planning');
});

test('someone else finishes: a new finished shop, and the started one stops counting (its owner removes it)',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 s=send(s,'hila',d=>{tick(d,'milk','hila',3);finishShop(d,{listId:'home',actorId:'hila',shopId:'shop-h',now:at(6)})});
 assert.equal(s.shoppingLists.find(l=>l.id==='shop-h').startedAt,at(0),'the shop started when Daniel started');
 assert.equal(openShopOf(s.shoppingLists,'home',T0+7*60000),null);
 s=send(s,'daniel',d=>stopShop(d,'shop-1','daniel'));assert.ok(!s.shoppingLists.some(l=>l.id==='shop-1'));
 assert.throws(()=>stopShop(structuredClone(s),'shop-h','daniel'),/Only the person who started/);
});

test('Stop shopping with nothing bought; a forgotten shop stops saying "shopping now" after OPEN_MS',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 assert.throws(()=>finishShop(structuredClone(s),{listId:'home',actorId:'daniel',shopId:'z',now:at(1)}),/Nothing was bought/);
 assert.equal(openShopOf(s.shoppingLists,'home',T0+OPEN_MS+1),null);
 s=send(s,'daniel',d=>stopShop(d,'shop-1','daniel'));assert.equal(openShopOf(s.shoppingLists,'home',T0+60000),null);
});

test('Undo of a started shop puts the items back and the shop back to "shopping"',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 s=send(s,'daniel',d=>{tick(d,'milk','daniel',3);finishShop(d,{listId:'home',actorId:'daniel',shopId:'n',now:at(5)})});
 s=send(s,'daniel',d=>undoShop(d,'shop-1','daniel','shop-2'));
 assert.equal(s.shopping.find(i=>i.id==='milk').listId,'home');assert.equal(s.shopping.find(i=>i.id==='milk').done,true);
 const open=openShopOf(s.shoppingLists,'home',T0+6*60000);assert.equal(open.id,'shop-2');assert.equal(open.startedAt,at(0));
 assert.ok(!s.shoppingLists.some(l=>l.id==='shop-1'));
});

test('History: one history across lists, newest first; a started shop is not in it',()=>{
 let s=send(home(),'daniel',d=>{tick(d,'coal','daniel',1);finishShop(d,{listId:'bbq',actorId:'daniel',shopId:'b1',now:at(2)})});
 s=send(s,'daniel',d=>{tick(d,'milk','daniel',3);finishShop(d,{listId:'home',actorId:'daniel',shopId:'h1',now:at(4)});startShop(d,{listId:'home',actorId:'daniel',shopId:'o',now:at(6)})});
 assert.deepEqual(shopsOf(s.shoppingLists,null).map(x=>x.id),['h1','b1']);assert.deepEqual(shopsOf(s.shoppingLists,'bbq').map(x=>x.id),['b1']);
});

test('Telegram or an offline phone ticks the last item while shopping: the shop stays open until someone finishes',()=>{
 let s=send(home(),'daniel',d=>startShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:at(0)}));
 const hila=visibleState(s,'hila'),later=structuredClone(hila);for(const id of ['milk','bread','eggs'])tick(later,id,'hila',5);
 s=applyChanges(s,diffState(hila,later),'hila','parent');
 assert.ok(s.shopping.filter(i=>i.listId==='home').every(i=>i.done));assert.equal(openShopOf(s.shoppingLists,'home',T0+6*60000).id,'shop-1','nothing finished by itself');
});

test('the app: questions, filters, the planned shop, the menu and the default list',()=>{
 const app=readFileSync(new URL('../app/src/App.jsx',import.meta.url),'utf8'),view=readFileSync(new URL('../app/src/shopping-view.jsx',import.meta.url),'utf8'),lists=readFileSync(new URL('../app/src/shopping-lists.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/closeShop\(d,listKey\)\}\);/,'the last tick no longer finishes by itself');
 assert.match(app,/trip\?\.kind==='shopping-trip'&&trip\.shoppingListId&&completionState\(trip,date\)!=='done'.*go\('shopping\?list='/,'the planned shop opens its list');
 assert.match(view,/if\(!item\.done&&!smart\.shop&&currentList\.visibility!=='private'&&!asked\.current\.has\(tab\)\)\{setPending\(item\.id\);setSmartWindow\('start'\)/,'first tick asks once per visit');
 assert.match(view,/const lastOne=!item\.done&&smart\.shop&&left===1;a\.toggleShopping\(item\.id\);if\(lastOne\)setSmartWindow\('finish'\)/,'last tick asks Finished shopping?');
 assert.match(view,/\{smart\.shop&&<div className="shop2-seg"/,'filters only while shopping');assert.match(view,/\[\['remaining',a\.T\('Left'/,'Left first');
 assert.doesNotMatch(lists,/Reuse for a new trip|Complete list/);assert.match(lists,/\["archived",a\.T\('Archive','ארכיון'\)/);
 assert.match(lists,/onHistory&&\['history'/,'History stays in the ⋯ menu (owner, 2026-11-12)');
 assert.match(lists,/unused=l=>!child&&l\.id===personalShoppingListId\(a\.user\)/,'the empty private list is hidden, not for a child');
 assert.doesNotMatch(lists,/connect shared storage/);
});

test('words: a comma add says how many; the list cards say Empty / N items, "2/5 collected" only while shopping',()=>{
 const fx=readFileSync(new URL('../app/src/motion-fx.jsx',import.meta.url),'utf8'),view=readFileSync(new URL('../app/src/shopping-view.jsx',import.meta.url),'utf8'),lists=readFileSync(new URL('../app/src/shopping-lists.jsx',import.meta.url),'utf8');
 assert.match(fx,/if\(fx\.kind==='shopping'&&fx\.count>1&&!fx\.preview\)\{if\(!String\(routeRef\.current\|\|''\)\.startsWith\('shopping'\)\)setPreviewToast\(T\(fx\.count\+' items added to shopping','נוספו '\+fx\.count\+' פריטים לקניות'\)\);return\}/,'calm toast: a count, not the first name');
 assert.match(view,/a\.T\(\(added===1\?'1 item added\.':added\+' items added\.'\)/);assert.match(view,/'נוספו '\+added\+' פריטים\.'/);
 assert.match(lists,/const countText=\(l,done,total\)=>!total\?a\.T\('Empty','ריקה'\):shoppingNow\(l\)\?<><b>\{done\}\/\{total\}<\/b> \{a\.T\('collected','נאספו'\)\}<\/>:a\.T\(total===1\?'1 item':total\+' items',total===1\?'פריט אחד':total\+' פריטים'\)/);
 assert.equal((lists.match(/<small>\{countText\(l,done,total\)\}/g)||[]).length,2,'the strip and All lists use it');assert.doesNotMatch(lists,/\{done\} \/ \{total\} \{a\.T\('collected'/);
});
