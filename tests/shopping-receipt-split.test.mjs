// Receipt totals (owner report 2026-11-12): a receipt paid partly by meal card was saved with what the credit card was
// charged instead of what the shop cost. Synthetic receipts of the same shape; invented shop, items and numbers.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeReceipt,matchExpense,priceHistory,productId} from '../shared/shopping-receipt.mjs';
import {validateRecord} from '../shared/state-validation.mjs';

// Lines: tomatoes, weighed cucumbers (1.340 kg × 6.00), steak with a line discount and a packaging offset, a bottle deposit.
// They add up to the subtotal 91.74. Then two meal-card lines (60.00 and 20.50), and the payment table:
// total 25.00 · account discount -13.76 · to pay 11.24 · card 11.24 · "you saved 13.76".
const lines=[{raw:'עגבניות תמר 7290000000017 12.90',name:'עגבניות',price:12.9},
 {raw:'מלפפון 2031 8.04',name:'מלפפונים',quantity:1.34,unit:'kg',unitPrice:6,price:8.04},
 {raw:'סטייק אנטריקוט 5550001 96.00',name:'סטייק',price:96},{raw:'הנחת מבצע סטייק -24.00',name:'הנחה',price:-24},
 {raw:'קיזוז אריזה -1.50',name:'קיזוז אריזה',price:-1.5},{raw:'פיקדון בקבוק 0.30',name:'פיקדון',price:.3}];
const split={store:'שוק הפינה',date:'2026-11-10',lines,currency:'ILS'};

test('a receipt paid partly by meal card: the total is what the shop cost, not what the card was charged',()=>{
 // What the model did on 1.70.0: "total" = the amount to pay.
 const r=normalizeReceipt({...split,total:11.24,subtotal:91.74,payments:[{method:'meal card',amount:60},{method:'meal card',amount:20.5},{method:'card',amount:11.24}],charged:11.24});
 assert.equal(r.total,91.74);assert.equal(r.checked,true);assert.equal(r.paidOther,80.5);assert.equal(r.charged,11.24);
 assert.equal(r.sum,91.74);
 const steak=r.lines.find(l=>l.name==='סטייק');assert.equal(steak.price,70.5,'the line discount and offset belong to the product above');assert.equal(steak.discount,25.5);
 assert.equal(r.lines.length,4,'no separate discount rows');assert.equal(r.lines.find(l=>l.name==='מלפפונים').unitPrice,6);
});

test('without a subtotal, the meal-card payments still show what was charged and what the shop cost',()=>{
 const r=normalizeReceipt({...split,total:11.24,payments:[{method:'meal card',amount:60},{method:'meal card',amount:20.5},{method:'card',amount:11.24}]});
 assert.equal(r.total,91.74);assert.equal(r.checked,true);assert.equal(r.charged,11.24);
 const asDiscount=normalizeReceipt({...split,total:91.74,subtotal:91.74,discount:13.76,payments:[{method:'meal card',amount:80.5}],charged:11.24});
 assert.equal(asDiscount.total,91.74,'an "account discount" in the payment table that the lines do not support is not taken off');
});

test('a plain receipt and a receipt with a real whole-receipt discount keep their right totals',()=>{
 const plain=normalizeReceipt({store:'מכולת',lines:[{raw:'לחם 10.00',price:10},{raw:'חלב 5.50',price:5.5}],total:15.5,payments:[{method:'card',amount:15.5}]});
 assert.equal(plain.total,15.5);assert.equal(plain.checked,true);assert.equal(plain.paidOther,undefined);
 const coupon=normalizeReceipt({store:'מכולת',lines:[{raw:'קפה 100.00',price:100},{raw:'סוכר 50.00',price:50}],subtotal:150,discount:15,total:135,payments:[{method:'card',amount:135}]});
 assert.equal(coupon.total,135);assert.equal(coupon.checked,true);assert.equal(coupon.paidOther,undefined);
 const noTotal=normalizeReceipt({lines:[{raw:'a',price:10}]});assert.equal(noTotal.total,10);assert.equal(noTotal.checked,true);
});

test('lines that add up to no printed total still ask the person',()=>{
 const r=normalizeReceipt({lines:[{raw:'a',price:10}],total:50});assert.equal(r.checked,false);assert.equal(r.total,50);
 const s=normalizeReceipt({lines:[{raw:'a',price:10}],total:3,payments:[{method:'meal card',amount:5}],charged:3});assert.equal(s.checked,false);assert.equal(s.paidOther,undefined);
});

test('the statement row is matched by what the card was charged, and the split can be saved',()=>{
 const tx=[{id:'t1',amount:-1124,date:'2026-11-10',category:'groceries'},{id:'t2',amount:-9174,date:'2026-11-10',category:'groceries'}];
 assert.equal(matchExpense({total:91.74,charged:11.24,date:'2026-11-10'},tx).id,'t1');
 assert.equal(matchExpense({total:91.74,date:'2026-11-10'},tx).id,'t2');
 assert.doesNotThrow(()=>validateRecord('receipts',{id:'r',title:'Receipt',ownerId:'p',visibility:'family',allowedIds:[],listId:'l',store:'x',total:91.74,charged:11.24,paidOther:80.5,currency:'ILS',shopDate:'2026-11-10',lines:[]}));
});

test('prices over time use what each product cost after its discount',()=>{
 const r=normalizeReceipt({...split,subtotal:91.74});
 const h=priceHistory([{shopDate:'2026-11-10',store:'שוק הפינה',lines:r.lines}],productId(r.lines.find(l=>l.name==='סטייק')));
 assert.equal(h.last.price,70.5);
});
