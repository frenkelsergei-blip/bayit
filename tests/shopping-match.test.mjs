// Receipt lines ↔ list items in a finished shop (owner report 2026-11-12: several items showed no price, one showed another
// product's price, two lines for one item showed one). Invented shop, names, codes and prices of the same shape.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchLines,shopRows,matchWord,rememberedNames} from '../shared/shopping-receipt.mjs';

const items=[{id:'steak',title:'אנטריקוטים',he:'אנטריקוטים'},{id:'fries',title:'ציפס',he:'ציפס'},{id:'cab',title:'כרוב',he:'כרוב'},
 {id:'mush',title:'פטריות',he:'פטריות'},{id:'bun',title:'לחמניה',he:'לחמניה'},{id:'kebab',title:'קבבים',he:'קבבים'},
 {id:'burger',title:'המבורגר צמחי',he:'המבורגר צמחי'},{id:'eggs',title:'ביצים',he:'ביצים'}];
// The dictionary would call steak, kebab and burger all "beef": the line keys below are what the reading stores.
const lines=[{raw:'פטריות יער מ 7290000000101 12.50',name:'Forest mushrooms',key:'mushrooms',price:12.5},
 {raw:'פטריות לבנות 7290000000102 9.90',name:'White mushrooms',key:'mushrooms',price:9.9},
 {raw:'קבב בקר קפוא 1 קג 4000001 49.90',name:'Frozen kebab',key:'beef',price:49.9},
 {raw:'כדוב ירוק 2031 6.20',name:'כרוב ירוק',key:'lettuce',price:6.2,confirmed:true},
 {raw:"צ'יפס קפוא 7290000000103 21.90",name:'Frozen chips',key:'chips',price:21.9},
 {raw:'המבורגר 4 יח 7290000000104 31.90',name:'Hamburger 4 pcs',key:'beef',price:31.9},
 {raw:'לחמניות מחיטה 7290000000105 8.00',name:'Wheat rolls',key:'bread',price:8},
 {raw:'אנטריקוט בקר קפוא 4000002 120.00',name:'Frozen entrecote',key:'beef',price:96.4,discount:23.6},
 {raw:'שקית 0.30',name:'Bag',key:'bags',price:.3}];
const total=12.5+9.9+49.9+6.2+21.9+31.9+8+96.4+.3;

test('Hebrew words are normalised: geresh, final letters, doubled letters, plural endings',()=>{
 assert.deepEqual(["צ'יפס",'קבבים','פטריות','לחמניות','פיקנייה','מלפפון','Tomatoes'].map(matchWord),['ציפס','קבב','פטרי','לחמני','פיקני','מלפפונ','tomatoe']);
});

test('each item gets its own line; one item may take two; nothing takes a line another item fits better',()=>{
 const r=shopRows(lines,items),by=Object.fromEntries(r.items.map(x=>[x.item.id,x]));
 assert.equal(by.steak.price,96.4,'plural item, singular line');assert.equal(by.fries.price,21.9,'ציפס / צ\'יפס');
 assert.equal(by.kebab.price,49.9);assert.equal(by.burger.price,31.9,'the burger does not take the kebab (both "beef")');
 assert.equal(by.burger.sure,false,'"plant-based" is not on the line: asks Correct?');
 assert.equal(by.mush.price,22.4);assert.equal(by.mush.lines.length,2);
 assert.equal(by.cab.price,6.2,'a misread line confirmed by name');assert.equal(by.bun.price,8);assert.equal(by.bun.sure,true,'לחמניה / לחמניות by word, not by the dictionary');
 assert.equal(by.eggs.price,null,'an item with no line says so');
 assert.deepEqual(r.other.map(l=>l.raw),['שקית 0.30'],'what matched nothing is listed, not hidden');
 const shown=r.items.reduce((s,x)=>s+(x.price||0),0)+r.other.reduce((s,l)=>s+l.price,0);
 assert.equal(Math.round(shown*100)/100,Math.round(total*100)/100,'the rows add up to the receipt');assert.equal(r.sum,Math.round(total*100)/100);
});

test('a tie goes to nobody, and No frees the line',()=>{
 const two=[{id:'a',title:'גבינה צהובה'},{id:'b',title:'גבינה לבנה'}],m=matchLines([{raw:'גבינה 9.90',price:9.9}],two);
 assert.equal(m[0].itemId,null,'one word fits both items equally: left unmatched rather than wrong');
 const no=matchLines([{raw:'המבורגר 4 יח 31.90',price:31.9,skip:['burger']}],items);assert.equal(no[0].itemId,null);
});

test('Yes is remembered: the next receipt with the same printed line matches for sure',()=>{
 const yes=[{createdAt:'1',lines:[{raw:'המבורגר 4 יח 7290000000104 31.90',name:'המבורגר צמחי',confirmed:true}]}];
 const m=matchLines([{raw:'המבורגר 4 יח 7290000000104 31.90',name:'Hamburger',price:31.9}],items,rememberedNames(yes));
 assert.equal(m[0].itemId,'burger');assert.equal(m[0].sure,true);
});

test('the shop window shows every item, the lines of each, and what is not on the list',()=>{
 const src=readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 assert.match(src,/shopRows\(s\.receipt\.lines,s\.bought/);assert.match(src,/'Not on the receipt','לא בקבלה'/);
 assert.match(src,/'On the receipt, not on the list · '/);assert.match(src,/if\(sure\)return lines\.map\(\(l,n\)=>/,'each sure line is its own row, so two lines for one item are two rows (owner 2026-11-12)');assert.match(src,/'Correct\?','נכון\?'/);
});
