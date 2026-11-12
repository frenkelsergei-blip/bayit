import test from 'node:test';
import assert from 'node:assert/strict';
import {rhythmOf,purchaseDays,shoppingSuggestions,explainSuggestion,explainDates,markFor,parseQuickAdd,shopInProgress,isNewItem,productKey} from '../shared/shopping-rhythm.mjs';

const fam={id:'week',ownerId:'daniel',visibility:'family',allowedIds:[]};
const buy=(title,dates,extra={})=>dates.map(date=>({title,he:title,date,done:true,ownerId:'daniel',visibility:'family',allowedIds:[],listId:'week',...extra}));

test('the worked example from the design: milk every 5 days, bought 6 days ago', ()=>{
 const r=rhythmOf(['2026-10-08','2026-10-13','2026-10-18','2026-10-23','2026-10-29']);
 assert.deepEqual(r.gaps,[5,5,5,6]);assert.equal(r.interval,5);assert.equal(r.steady,true);
 const [s]=shoppingSuggestions({list:fam,purchases:buy('חלב',['2026-10-08','2026-10-13','2026-10-18','2026-10-23','2026-10-29']),today:'2026-11-04'});
 assert.equal(s.kind,'rhythm');assert.equal(s.since,6);
 assert.equal(explainSuggestion(s,'he'),'בדרך כלל כל 5 ימים · נקנה לפני 6 ימים');
 assert.equal(explainSuggestion(s,'en'),'usually every 5 days · bought 6 days ago');
});

test('unrecorded corner-shop bread only makes Bayit suggest later', ()=>{
 const p=buy('לחם',['2026-10-08','2026-10-18','2026-10-23','2026-11-03']);
 assert.equal(rhythmOf(p.map(x=>x.date)).interval,10);
 assert.equal(shoppingSuggestions({list:fam,purchases:p,today:'2026-11-04'}).length,0);
 assert.equal(shoppingSuggestions({list:fam,purchases:p,today:'2026-11-11'}).length,1);
});

test('items bought once or twice and irregular items are never suggested by rhythm', ()=>{
 assert.equal(shoppingSuggestions({list:fam,purchases:buy('קוטג',['2026-10-08','2026-10-29']),today:'2026-11-20'}).length,0);
 assert.equal(rhythmOf(['2026-09-01','2026-09-03','2026-10-20','2026-10-22','2026-12-30']).steady,false);
});

test('ticks within two days count as one purchase day', ()=>{
 assert.deepEqual(purchaseDays(['2026-10-08','2026-10-09','2026-10-13']),['2026-10-08','2026-10-13']);
});

test('already bought restarts the clock; not this time and stop hide it; open items are never repeated', ()=>{
 const p=buy('חלב',['2026-10-08','2026-10-13','2026-10-18','2026-10-23','2026-10-29']),key=productKey({title:'חלב'});
 const bought={kind:'bought',key,title:'חלב',date:'2026-11-03',ownerId:'hila',visibility:'family',allowedIds:[]};
 assert.equal(shoppingSuggestions({list:fam,purchases:p,marks:[bought],today:'2026-11-04'}).length,0);
 const later={kind:'later',key,until:'2026-11-09',ownerId:'hila',visibility:'family',allowedIds:[]};
 assert.equal(shoppingSuggestions({list:fam,purchases:p,marks:[later],today:'2026-11-04'}).length,0);
 assert.equal(shoppingSuggestions({list:fam,purchases:p,marks:[later],today:'2026-11-09'}).length,1);
 const stop={kind:'stop',key,ownerId:'hila',visibility:'family',allowedIds:[]};
 assert.equal(shoppingSuggestions({list:fam,purchases:p,marks:[stop],today:'2026-12-30'}).length,0);
 assert.equal(shoppingSuggestions({list:fam,purchases:p,items:[{title:'חלב',done:false}],today:'2026-11-04'}).length,0);
});

test('a private purchase never becomes a suggestion on a family list, and vice versa', ()=>{
 const p=buy('שוקולד',['2026-10-01','2026-10-08','2026-10-15','2026-10-22'],{visibility:'private',ownerId:'hila'});
 assert.equal(shoppingSuggestions({list:fam,purchases:p,today:'2026-11-04'}).length,0);
 const mine={id:'private-hila-week',ownerId:'hila',visibility:'private',allowedIds:[]};
 assert.equal(shoppingSuggestions({list:mine,purchases:p,today:'2026-11-04'}).length,1);
});

test('steady products not bought for 3 intervals (and 21 days) move to "haven\'t bought for a while"', ()=>{
 const [s]=shoppingSuggestions({list:fam,purchases:buy('שיבולת שועל',['2026-08-01','2026-08-15','2026-08-29','2026-09-12']),today:'2026-10-31'});
 assert.equal(s.kind,'quiet');assert.match(explainSuggestion(s,'he'),/בדרך כלל כל שבועיים · עברו 7 שבועות/);
});

test('favourites suggest after a week, with whose they are', ()=>{
 const fav={kind:'likes',status:'approved',memberId:'noa',title:'בננות',he:'בננות',key:productKey({title:'בננות'}),visibility:'family',ownerId:'hila',allowedIds:[]};
 const [s]=shoppingSuggestions({list:fam,favourites:[fav],purchases:buy('בננות',['2026-10-26']),today:'2026-11-04'});
 assert.equal(s.kind,'liked');assert.equal(explainSuggestion(s,'he',id=>({noa:'נועה'})[id]),'אהוב על נועה · לא נקנה 9 ימים');
 assert.equal(shoppingSuggestions({list:fam,favourites:[{...fav,status:'requested'}],today:'2026-11-04'}).length,0);
 assert.equal(shoppingSuggestions({list:fam,favourites:[fav],options:{liked:false},today:'2026-11-04'}).length,0);
});

test('the "why" dates and the marks', ()=>{
 assert.equal(explainDates(['2026-10-08','2026-10-13','2026-10-18','2026-10-23','2026-10-29'],'he'),'נקנה ב־8, 13, 18, 23 ו־29 באוקטובר');
 assert.equal(explainDates(['2026-10-25','2026-10-30','2026-11-05'],'he'),'נקנה ב־25 ו־30 באוקטובר ו־5 בנובמבר');
 assert.equal(explainDates(['2026-10-25','2026-11-05'],'en'),'Bought on 25 October and 5 November');
 const m=markFor('later',{key:'milk',title:'Milk'},{list:fam,actorId:'hila',today:'2026-11-04'});
 assert.equal(m.until,'2026-11-11');assert.equal(m.visibility,'family');
 assert.equal(markFor('later',{key:'milk',title:'Milk'},{list:fam,actorId:'hila',today:'2026-11-04',shopDate:'2026-11-06'}).until,'2026-11-06');
});

test('quick add without AI', ()=>{
 assert.deepEqual(parseQuickAdd('עגבניות, ביצים, 2 פיתות'),[{name:'עגבניות',quantity:1},{name:'ביצים',quantity:1},{name:'פיתות',quantity:2}]);
 assert.deepEqual(parseQuickAdd('תוסיף מלפפונים ועגבניות').map(p=>p.name),['מלפפונים','עגבניות']);
 assert.deepEqual(parseQuickAdd('תוסיף לרשימת הקניות חלב ולחם').map(p=>p.name).slice(-2),['חלב','לחם']);
 assert.deepEqual(parseQuickAdd('milk, eggs and 2 bread'),[{name:'milk',quantity:1},{name:'eggs',quantity:1},{name:'bread',quantity:2}]);
 assert.deepEqual(parseQuickAdd('  '),[]);
});

test('a shop in progress and new items', ()=>{
 const now=Date.parse('2026-11-04T18:10:00Z');
 const items=[{done:true,boughtAt:'2026-11-04T17:40:00Z',boughtBy:'hila'},{done:true,boughtAt:'2026-11-04T18:02:00Z',boughtBy:'hila'},{done:false,createdAt:'2026-11-04T17:52:00Z'},{done:false,createdAt:'2026-11-04T09:00:00Z'}];
 // The shopping flow (2026-11-12): only a started shop counts; ticks alone are not a shop. The shopper is who started it.
 assert.equal(shopInProgress(items,now),null,'ticks without Start are not a shop');
 const shop=shopInProgress(items,now,{id:'s',ownerId:'daniel',startedAt:'2026-11-04T17:35:00Z'});assert.equal(shop.startedAt,'2026-11-04T17:35:00Z');assert.equal(shop.by,'daniel');assert.deepEqual(shop.with,['hila']);
 items[2].createdBy='hila';items[3].createdBy='hila';
 assert.equal(isNewItem(items[2],'daniel','2026-11-04T17:50:00Z'),true);assert.equal(isNewItem(items[3],'daniel','2026-11-04T17:50:00Z'),false);
 assert.equal(isNewItem(items[2],'hila','2026-11-04T17:50:00Z'),false,'not my own');assert.equal(isNewItem(items[2],'daniel',null),false,'first visit: nothing is new');
});

test('while someone shops: the shopper gets what others add; the others get one "is shopping now"', async()=>{
 const {shopUpdates,shopToday}=await import('../shared/shopping-rhythm.mjs');
 const now=Date.parse('2026-11-04T18:10:00Z'),list={id:'week',status:'active',visibility:'family',ownerId:'daniel'};
 const open={id:'s1',shopOf:'week',status:'shopping',ownerId:'hila',startedBy:'hila',startedAt:'2026-11-04T18:03:00Z',visibility:'family'};
 assert.deepEqual(shopUpdates({shoppingLists:[list],preferences:{},shopping:[{id:'a',listId:'week',done:true,boughtAt:'2026-11-04T18:04:00Z',boughtBy:'hila'}]},'daniel',{now}),[],'a tick alone announces nothing');
 const visible={shoppingLists:[list,open],preferences:{},shopping:[
  {id:'a',listId:'week',done:true,boughtAt:'2026-11-04T18:04:00Z',boughtBy:'hila'},
  {id:'b',listId:'week',done:false,createdAt:'2026-11-04T18:06:00Z',createdBy:'daniel',title:'Cheese'},
  {id:'c',listId:'week',done:false,createdAt:'2026-11-04T18:07:00Z',createdBy:'hila',title:'Own'}]};
 assert.deepEqual(shopUpdates(visible,'hila',{now}).map(m=>m.key),['shopadd:b']);
 assert.deepEqual(shopUpdates(visible,'daniel',{now}).map(m=>m.kind),['started']);
 assert.deepEqual(shopUpdates(visible,'itai',{now,role:'child'}),[]);
 assert.deepEqual(shopUpdates({...visible,preferences:{shoppingByUser:{hila:{addsMessage:false}}}},'hila',{now}),[]);
 assert.deepEqual(shopUpdates(visible,'daniel',{now:Date.parse('2026-11-04T18:20:00Z')}),[],'"is shopping now" only near the start');
 const trip={id:'t',kind:'shopping-trip',shoppingListId:'week',date:'2026-11-04',memberId:'hila'};
 assert.equal(shopToday({...visible,tasks:[trip]},'daniel','2026-11-04').list.id,'week');
 assert.equal(shopToday({...visible,tasks:[trip]},'daniel','2026-11-05'),null);
});
