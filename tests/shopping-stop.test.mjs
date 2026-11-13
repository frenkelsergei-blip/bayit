// A shop started by mistake (owner report 2026-11-12, iPad: "You are shopping · since 20:49" with nothing ticked). Start
// has Undo, "I'm not shopping" ends a started shop without anything in History, an idle shop lapses after 90 minutes, and
// whoever heard "X is shopping now" on Telegram hears that it ended. Fictional family; server rules via applyChanges.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startShop,stopShop,finishShop,openShopOf,shopsOf,IDLE_MS,OPEN_MS} from '../shared/shopping-history.mjs';
import {shopUpdates} from '../shared/shopping-rhythm.mjs';
import {blankState,applyChanges,diffState,visibleState} from '../app/cloud/state.mjs';

const members=[{id:'dan',name:'Dan',role:'parent'},{id:'mia',name:'Mia',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const item=(id,extra={})=>({id,title:id,he:id,listId:'home',quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'dan',ownerId:'dan',visibility:'family',allowedIds:[],done:false,createdAt:'2026-11-12T10:00:00Z',createdBy:'dan',...extra});
function home(){const d=blankState('h','Home',members[0]);d.members=members;d.profiles.mia={name:'Mia'};d.profiles.kid={name:'Kid'};
 d.shoppingLists.push({id:'home',name:'Home',he:'בית',ownerId:'mia',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'});
 d.shopping=[item('milk'),item('bread')];return applyChanges(d,[],'dan','parent')}
const send=(state,actor,change)=>{const before=visibleState(state,actor),after=structuredClone(before);change(after);return applyChanges(state,diffState(before,after),actor,members.find(m=>m.id===actor).role)};
const src=f=>readFileSync(new URL('../app/src/'+f,import.meta.url),'utf8');

test('"I\'m not shopping": the shop ends, nothing goes to History, ticks stay plain ticks, and it cannot come back',()=>{
 const now=new Date().toISOString();
 let s=send(home(),'dan',d=>startShop(d,{listId:'home',actorId:'dan',shopId:'s1',now}));
 s=send(s,'dan',d=>{d.shopping.find(i=>i.id==='milk').done=true});
 s=send(s,'dan',d=>stopShop(d,'s1','dan'));
 const rec=s.shoppingLists.find(l=>l.id==='s1');assert.equal(rec.status,'stopped');assert.ok(rec.updatedAt);
 assert.equal(openShopOf(s.shoppingLists,'home',Date.now(),s.shopping),null,'the list is Planning again');
 assert.deepEqual(shopsOf(s.shoppingLists,'home'),[],'nothing in Shopping history');
 assert.equal(s.shopping.find(i=>i.id==='milk').done,true,'the tick stays');assert.equal(s.shopping.find(i=>i.id==='milk').listId,'home');
 assert.throws(()=>send(s,'dan',d=>{d.shoppingLists.find(l=>l.id==='s1').status='shopping'}),/unavailable/,'a stopped shop does not start again');
 assert.throws(()=>send(s,'dan',d=>{d.shoppingLists.find(l=>l.id==='s1').status='archived'}),/unavailable/,'nor become History');
});

test('only the person who started it can stop it (from any of their devices); nobody can create a stopped shop',()=>{
 const s=send(home(),'dan',d=>startShop(d,{listId:'home',actorId:'dan',shopId:'s1',now:new Date().toISOString()}));
 assert.throws(()=>stopShop(structuredClone(visibleState(s,'mia')),'s1','mia'),/Only the person who started/);
 assert.throws(()=>send(s,'mia',d=>{d.shoppingLists.find(l=>l.id==='s1').status='stopped'}),/owner|unavailable/);
 assert.throws(()=>send(home(),'dan',d=>{d.shoppingLists.push({id:'x',name:'Home',he:'בית',ownerId:'dan',visibility:'family',allowedIds:[],status:'stopped',shopOf:'home',startedBy:'dan',startedAt:new Date().toISOString(),createdAt:new Date().toISOString()})}),/unavailable/);
 assert.match(src('shopping-smart.jsx'),/me\?a\.T\('You are shopping','את\/ה בקנייה'\)/,'every device of the starter says "You are shopping"');
 assert.match(src('shopping-smart.jsx'),/\{me&&onStop&&<button type="button" className="text-link ss-line-change" onClick=\{onStop\}>\{a\.T\("I'm not shopping",'אני לא בקנייה'\)\}<\/button>\}/);
});

test('finishing with nothing bought saves no shop; the window offers "I\'m not shopping" instead',()=>{
 const s=send(home(),'dan',d=>startShop(d,{listId:'home',actorId:'dan',shopId:'s1',now:new Date().toISOString()}));
 assert.throws(()=>send(s,'dan',d=>finishShop(d,{listId:'home',actorId:'dan',shopId:'s2'})),/Nothing was bought/);
 const fin=src('shopping-smart.jsx');const w=fin.slice(fin.indexOf('export function FinishWindow'),fin.indexOf('export function HistoryWindow'));
 assert.match(w,/if\(!bought\.length\)return[^\n]*<Button onClick=\{stop\}>\{a\.T\("I'm not shopping",'אני לא בקנייה'\)\}/);
 assert.match(w,/Started by mistake\? /,'also when something was ticked');assert.match(w,/'Nothing goes to Shopping history\./);
});

test('an idle started shop lapses 90 minutes after its start or its last tick, whichever is later (12 hours at most)',()=>{
 const T=Date.parse('2026-11-12T18:49:00Z'),iso=m=>new Date(T+m*60000).toISOString();
 const lists=[{id:'home',status:'active'},{id:'s1',shopOf:'home',status:'shopping',ownerId:'dan',startedBy:'dan',startedAt:iso(0)}];
 const items=[{id:'milk',listId:'home',done:false}];
 assert.equal(IDLE_MS,90*60000);
 assert.ok(openShopOf(lists,'home',T+89*60000,items));assert.equal(openShopOf(lists,'home',T+91*60000,items),null,'no tick: gone after 90 minutes');
 const ticked=[{id:'milk',listId:'home',done:true,boughtAt:iso(60)}];
 assert.ok(openShopOf(lists,'home',T+149*60000,ticked));assert.equal(openShopOf(lists,'home',T+151*60000,ticked),null,'90 minutes after the last tick');
 assert.equal(openShopOf(lists,'home',T+OPEN_MS+1,[{id:'milk',listId:'home',done:true,boughtAt:new Date(T+OPEN_MS).toISOString()}]),null,'never past 12 hours');
 assert.ok(openShopOf(lists,'home',T+5*3600e3),'callers without items keep the 12-hour rule');
 for(const [f,re] of [['shopping-smart.jsx',/openShopOf\([^;]*list\.id,Date\.now\(\),items\)/],['shopping-lists.jsx',/openShopOf\([^;]*l\.id,Date\.now\(\),a\.data\.shopping\)/]])assert.match(src(f),re,f+' uses the idle rule');
 assert.match(readFileSync(new URL('../app/cloud/telegram.mjs',import.meta.url),'utf8'),/openShopOf\(visible\.shoppingLists,l\.id,Date\.now\(\),visible\.shopping\)/);
});

test('Telegram: whoever heard "X is shopping now" hears once that it ended; the starter and children do not',()=>{
 const now=Date.now(),started=new Date(now-3*60000).toISOString();
 let s=send(home(),'dan',d=>startShop(d,{listId:'home',actorId:'dan',shopId:'s1',now:started}));
 const start=shopUpdates(visibleState(s,'mia'),'mia',{now});assert.equal(start[0].kind,'started');
 s=send(s,'dan',d=>stopShop(d,'s1','dan'));
 const [m]=shopUpdates(visibleState(s,'mia'),'mia',{now:now+60000});
 assert.equal(m.kind,'stopped');assert.equal(m.key,'shopstop:home:'+started);assert.equal(m.requires,start[0].key,'only if the start message was sent');
 assert.deepEqual(shopUpdates(visibleState(s,'dan'),'dan',{now:now+60000}),[]);assert.deepEqual(shopUpdates(visibleState(s,'kid'),'kid',{now:now+60000,role:'child'}),[]);
 assert.deepEqual(shopUpdates(visibleState(s,'mia'),'mia',{now:now+20*60000}),[],'only shortly after the stop');
 const cd=readFileSync(new URL('../app/cloud/channel-delivery.mjs',import.meta.url),'utf8');assert.match(cd,/if\(message\.requires&&!\(await env\.DB\.prepare\("SELECT 1 FROM notification_deliveries WHERE household_id=\? AND member_id=\? AND channel=\? AND delivery_key=\? AND status='sent'"\)/);
 assert.match(readFileSync(new URL('../app/cloud/telegram.mjs',import.meta.url),'utf8'),/if\(message\.kind==='stopped'\)return \[card\(lang,\{icon:'🛒',title:esc\(L\(lang,by\+' is not shopping after all',by\+' לא בקניות בסוף'\)\)/);
});

test('Start by button has Undo on the toast; the start question does not',()=>{
 const v=src('shopping-view.jsx');
 assert.match(v,/if\(then\)a\.toggleShopping\(then\);else fxBus\.emit\('deleted',\{id:'shop-start',text:a\.T\('You started shopping\. The family can see it\.','התחלת קנייה\. המשפחה רואה את זה\.'\),restore:undoStart\}\)/);
 assert.match(v,/onStop=\{done===0\?notShopping:null\}/);
 assert.match(src('motion-fx.jsx'),/<span>\{removed\.text\|\|\(removed\.label\?/);
});

test('stopped records of the starter are cleared after a day, on the next start or stop',()=>{
 const d={shoppingLists:[{id:'home',status:'active',ownerId:'dan',visibility:'family',allowedIds:[],name:'Home'},{id:'old',shopOf:'home',status:'stopped',ownerId:'dan',startedAt:'2026-11-10T08:00:00Z',updatedAt:'2026-11-10T08:05:00Z'}],shopping:[]};
 startShop(d,{listId:'home',actorId:'dan',shopId:'new',now:'2026-11-12T08:00:00Z'});assert.deepEqual(d.shoppingLists.map(l=>l.id),['home','new']);
});

test('the Finish window stops the started shop by its id (1.74.0 passed shop.id, which the shop in progress does not have)',()=>{
 const w=src('shopping-smart.jsx');assert.match(w,/const stop=async\(\)=>\{fxBus\.emit\('dismiss','shop-start'\);try\{await a\.stopShopping\(shop\.shopId\);/);
 assert.doesNotMatch(w,/stopShopping\(shop\.id\)/);
});
