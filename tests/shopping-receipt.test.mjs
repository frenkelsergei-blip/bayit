import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeReceipt,matchLines,priceHistory,productId,groceriesMonth,matchExpense} from '../shared/shopping-receipt.mjs';

test('a read receipt is checked: lines need a price, the total is compared with the sum',()=>{
 const r=normalizeReceipt({store:'Supermarket',date:'2026-11-04',total:31.7,lines:[{raw:'עגבניה שרי מארז',name:'עגבניות',quantity:2,unit:'kg',unitPrice:8.9,price:17.8},{raw:'ביצים L 12',name:'ביצים',price:13.9},{raw:'??',price:'x'}]});
 assert.equal(r.lines.length,2);assert.equal(r.sum,31.7);assert.equal(r.checked,true);
 assert.equal(normalizeReceipt({lines:[{raw:'a',price:10}],total:50}).checked,false,'a total far from the lines is flagged');
 assert.throws(()=>normalizeReceipt({lines:[]}),/No receipt lines/);
});
test('lines match list items by product; prices over time per product and shop',()=>{
 const r=normalizeReceipt({lines:[{raw:'עגבניה',name:'עגבניות',price:9}]});
 assert.equal(matchLines(r.lines,[{id:'i1',title:'עגבניות'}])[0].itemId,'i1');
 const key=r.lines[0].key,receipts=[{store:'השוק',date:'2026-10-08',lines:[{key,price:6.9,quantity:1,unit:'kg'}]},{store:'סופר הגבעה',date:'2026-10-23',lines:[{key,price:19.8,quantity:2,unit:'kg'}]},{store:'סופר הגבעה',date:'2026-11-04',lines:[{key,price:8.9,quantity:1,unit:'kg'}]}];
 const h=priceHistory(receipts,productId(receipts[0].lines[0]));assert.equal(h.cheapest.per,6.9);assert.equal(h.dearest.per,9.9);assert.equal(h.last.date,'2026-11-04');assert.equal(h.stores.find(s=>s.store==='סופר הגבעה').average,9.4);
 assert.equal(priceHistory(receipts,'nothing'),null);
});
test('supermarket spending this month against the same days last month, and the matching statement row',()=>{
 const tx=[{category:'groceries',amount:-41260,date:'2026-11-04'},{category:'groceries',amount:-22000,date:'2026-11-02'},{category:'groceries',amount:-59000,date:'2026-10-03'},{category:'groceries',amount:-70000,date:'2026-10-20'},{category:'car',amount:-30000,date:'2026-11-01'}];
 const m=groceriesMonth(tx,'2026-11-04');assert.equal(m.thisMonth,632.6);assert.equal(m.lastMonthToDate,590);assert.equal(m.updatedTo,'2026-11-04');
 assert.equal(matchExpense({total:412.6,date:'2026-11-04'},tx).amount,-41260);assert.equal(matchExpense({total:100,date:'2026-11-04'},tx),null);
});
