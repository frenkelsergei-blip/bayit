// Prices and spending covers every receipt the adult may see (owner report 2026-11-12): once a shop was finished its
// receipt belongs to the shop record, and the window filtered by the open list, so it said "No receipts yet" while
// History showed the receipt. Fictional family; server rules via applyChanges/visibleState.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finishShop} from '../shared/shopping-history.mjs';
import {priceHistory,productId} from '../shared/shopping-receipt.mjs';
import {blankState,applyChanges,diffState,visibleState} from '../app/cloud/state.mjs';

const members=[{id:'dan',name:'Dan',role:'parent'},{id:'mia',name:'Mia',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
const item=(id,listId,extra={})=>({id,title:id,he:id,listId,quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'dan',ownerId:'dan',visibility:'family',allowedIds:[],done:true,boughtAt:'2026-11-12T08:10:00Z',boughtBy:'dan',createdAt:'2026-11-11T08:00:00Z',createdBy:'dan',...extra});
const receipt=(id,listId,store,raw,price,extra={})=>({id,title:'Receipt',ownerId:'dan',visibility:'family',allowedIds:[],listId,store,total:price,currency:'ILS',shopDate:'2026-11-12',lines:[{raw,name:'Bread',key:'bread',quantity:1,unit:'items',price}],createdAt:'2026-11-12T09:00:00Z',...extra});
function home(){const d=blankState('h','Home',members[0]);d.members=members;d.profiles.mia={name:'Mia'};d.profiles.kid={name:'Kid'};
 d.shoppingLists.push({id:'home',name:'Home',he:'בית',ownerId:'dan',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'},
  {id:'party',name:'Party',he:'מסיבה',ownerId:'mia',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'});
 d.shopping=[item('bread','home')];
 d.receipts=[receipt('r1','home','Shop A','BREAD 7290000000011',9.9),receipt('r2','party','Shop B','BREAD 7290000000011',8.5,{createdAt:'2026-11-10T09:00:00Z',shopDate:'2026-11-10'})];
 return applyChanges(d,[],'dan','parent')}
const send=(state,actor,change)=>{const before=visibleState(state,actor),after=structuredClone(before);change(after);return applyChanges(state,diffState(before,after),actor,'parent')};
// What the Prices window shows: one row per product over the receipts it is given.
const prices=receipts=>[...new Set(receipts.flatMap(r=>(r.lines||[]).map(productId)))].map(k=>priceHistory(receipts,k)).filter(Boolean);

test('a receipt attached to a finished shop, and one on another list, both give prices',()=>{
 const next=send(home(),'dan',d=>finishShop(d,{listId:'home',actorId:'dan',shopId:'shop-1',now:'2026-11-12T12:00:00Z'}));
 const seen=visibleState(next,'dan').receipts;
 assert.equal(seen.find(r=>r.id==='r1').listId,'shop-1','the receipt now belongs to the finished shop');
 const [bread]=prices(seen);assert.equal(bread.rows.length,2,'both receipts, from the finished shop and the other list');
 assert.equal(bread.cheapest.store,'Shop B');assert.equal(bread.last.store,'Shop A');
 assert.equal(visibleState(next,'mia').receipts.length,2,'the other parent sees the same household prices');
});

test('a child gets no receipts and no prices',()=>{
 const next=send(home(),'dan',d=>finishShop(d,{listId:'home',actorId:'dan',shopId:'shop-1',now:'2026-11-12T12:00:00Z'}));
 assert.deepEqual(visibleState(next,'kid').receipts,[]);
 const src=readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 assert.match(src,/const visibleReceipts=a=>a\.member\(a\.user\)\?\.role==='child'\?\[\]:a\.visible\(a\.data\.receipts\|\|\[\]\)/);
});

test('the Prices window is household-wide: every visible receipt, no filter by the open list',()=>{
 const src=readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 const win=src.slice(src.indexOf('export function PricesWindow'),src.indexOf('export function NoteWindow'));
 assert.match(win,/receipts=visibleReceipts\(a\)/);
 assert.doesNotMatch(win,/r\.listId===list\.id|sameAudience/);
});

test('a receipt can be downloaded from History: the photo and the read lines as CSV, with a readable name',()=>{
 const src=readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 const view=src.slice(src.indexOf('export function ReceiptView'));
 assert.match(view,/src&&<Button secondary icon=\{DownloadSimple\} onClick=\{\(\)=>save\(src,fileName\(/,'the photo, only once it loaded (same access as viewing)');
 assert.match(view,/a\.T\('Download','הורדה'\)/);assert.match(view,/a\.T\('Lines as CSV','השורות כ־CSV'\)/);
 assert.match(view,/a\.T\('Receipt','קבלה'\)\+' '\+\(live\.shopDate/,'day and shop in the file name');
 assert.match(view,/so there is no photo to download\./);assert.match(view,/Attach the photo/);
});

// The receipt is what was bought (owner 2026-11-12): a product on the receipt but never on the list is still a purchase.
import {receiptPurchases} from '../shared/shopping-receipt.mjs';
import {shoppingSuggestions} from '../shared/shopping-rhythm.mjs';
const list={id:'home',ownerId:'dan',visibility:'family',allowedIds:[],status:'active'};
const shopOn=(n,date)=>({id:'r'+n,listId:'shop'+n,ownerId:'dan',visibility:'family',allowedIds:[],shopDate:date,total:30,lines:[
 {raw:'חלב 3% 7290000000031',name:'חלב',price:6.2},{raw:'שוקולד מריר 7290000000055',name:'שוקולד מריר',price:8.9},
 {raw:'שקית 0.10',name:'שקית',price:.1},{raw:'פיקדון בקבוק 0.30',name:'פיקדון',price:.3},{raw:'הנחת מבצע -5.00',name:'הנחה',price:-5}]});
const milk=n=>({id:'m'+n,title:'חלב',he:'חלב',listId:'shop'+n,done:true,ownerId:'dan',visibility:'family',allowedIds:[]});
test('a receipt line that matched no list item is a purchase; bags, deposits and discounts are not',()=>{
 const p=receiptPurchases([shopOn(1,'2026-11-01')],[milk(1)]);
 assert.deepEqual(p.map(x=>x.title),['שוקולד מריר'],'milk was on the list (ticked already), the rest is not a product');
 assert.equal(p[0].date,'2026-11-01');assert.equal(p[0].visibility,'family');
});
test('what you usually buy learns a receipt-only product with the same rule as list items (three steady shop days)',()=>{
 const receipts=[shopOn(1,'2026-11-01'),shopOn(2,'2026-11-08')],items=[milk(1),milk(2)];
 const suggest=r=>shoppingSuggestions({list,purchases:receiptPurchases(r,items),today:'2026-11-14',shopDate:'2026-11-14'}).map(s=>s.title);
 assert.deepEqual(suggest(receipts),[],'two receipts are one gap: not a rhythm yet');
 const three=[shopOn(1,'2026-10-25'),shopOn(2,'2026-11-01'),shopOn(3,'2026-11-08')];
 assert.deepEqual(shoppingSuggestions({list,purchases:receiptPurchases(three,[milk(1),milk(2),milk(3)]),today:'2026-11-14',shopDate:'2026-11-14'}).map(s=>s.title),['שוקולד מריר']);
});
test('the shop window reads receipt first, with "Your list said" under it, one way for one line or several',()=>{
 const src=readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 const row=src.slice(src.indexOf('function ShopItemRow'),src.indexOf('export function ReceiptView'));
 assert.doesNotMatch(src,/From the list: /);assert.equal((row.match(/a\.T\('Your list said: ','ברשימה היה כתוב: '\)/g)||[]).length,2);
 assert.match(src,/receiptPurchases\(visibleReceipts\(a\)/,'suggestions use the adult\'s receipts');
});

// A receipt saved by 1.70.0 on a list another parent owns was visible only to the person who saved it (owner report
// 2026-11-12). It heals on load, like items did in 1.71.0: the list's people see it, never anyone wider.
import {upgradeShoppingLists} from '../shared/shopping-lists.mjs';
test('a 1.70.0 receipt on a shared list heals on load: the list owner sees it, nobody else is added',()=>{
 const d=blankState('h','Home',members[0]);d.members=members;d.profiles.mia={name:'Mia'};d.profiles.kid={name:'Kid'};
 d.shoppingLists.push({id:'ours',name:'Ours',he:'שלנו',ownerId:'mia',visibility:'selected',allowedIds:['dan'],status:'active',createdAt:'2026-11-01T00:00:00Z'},
  {id:'shop-9',shopOf:'ours',name:'Ours',he:'שלנו',ownerId:'dan',visibility:'selected',allowedIds:['mia'],status:'archived',archivedAt:'2026-11-12T12:00:00Z',createdAt:'2026-11-12T08:00:00Z'});
 d.receipts=[receipt('old','shop-9','Shop A','BREAD 7290000000011',9.9,{visibility:'selected',allowedIds:['dan']})];
 assert.equal(visibleState(structuredClone(d),'mia').receipts.length,0,'before: only Dan saw it');
 const healed=upgradeShoppingLists(structuredClone(d),members);
 assert.deepEqual(healed.receipts[0].allowedIds,['mia']);
 assert.equal(visibleState(healed,'mia').receipts.length,1,'the list owner sees it');assert.equal(visibleState(healed,'dan').receipts.length,1);
 assert.equal(visibleState(healed,'kid').receipts.length,0);
 const again=upgradeShoppingLists(structuredClone(healed),members);assert.deepEqual(again.receipts[0].allowedIds,['mia'],'stable on the next load');
 const family=upgradeShoppingLists({...structuredClone(d),receipts:[receipt('fam','shop-9','Shop A','X',1)]},members);assert.equal(family.receipts[0].visibility,'family','other audiences are left alone');
});
