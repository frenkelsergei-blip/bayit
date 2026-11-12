// Prices over time (owner report 2026-11-12): one receipt showed kebab, hamburgers and picanha as one "beef" row with
// "per kg" on pack prices, portobello and champignon as one row, and "cheapest / dearest" with one price. Invented data.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeReceipt,priceHistory,productId,weighed} from '../shared/shopping-receipt.mjs';
const receipt=normalizeReceipt({store:'סופר הדוגמה',subtotal:224.3,lines:[
 {raw:'קציצות קפואות 1 קג 4400001 49.90',name:'Frozen patties 1 kg',quantity:1,unit:'kg',price:49.9},
 {raw:'שניצל 4 יח 7290000000123 32.90',name:'Schnitzel 4 pcs',price:32.9},
 {raw:'אסאדו בקר 4400002 120.00',name:'Beef asado',quantity:1.2,unit:'kg',unitPrice:100,price:120},{raw:'הנחה אסאדו -20.00',price:-20},
 {raw:'פטריות יער 7290000000222 12.90',name:'Wild mushrooms',price:12.9},{raw:'פטריות לבנות 7290000000333 11.90',name:'White mushrooms',price:11.9},
 {raw:'גזר ישראלי 2031 6.70',name:'Carrots',quantity:1.34,unit:'kg',unitPrice:5,price:6.7},{raw:'גזר ישראלי 2031 0.00 ',price:0}]});
const r={shopDate:'2026-11-12',store:'סופר הדוגמה',lines:receipt.lines};
test('each product is its own row: barcode or printed text, never the category it was matched to',()=>{
 const ids=new Set(receipt.lines.map(productId));assert.equal(ids.size,6);
 const beef=receipt.lines.filter(l=>l.key===receipt.lines[2].key);assert.ok(beef.length>=1);
 assert.equal(productId({raw:'שניצל 4 יח 7290000000123 31.90'}),productId(receipt.lines[1]),'the same barcode at another price is the same product');
 assert.equal(productId({raw:'גזר ישראלי 2031 7.20'}),productId(receipt.lines[5]),'without a barcode, the same printed text');
 assert.notEqual(productId(receipt.lines[3]),productId(receipt.lines[4]),'two kinds of mushrooms stay apart');
});
test('per kg only for weighed lines; a pack shows its pack price; a line discount is in its line',()=>{
 const h=id=>priceHistory([r],productId(receipt.lines[id]));
 assert.equal(weighed(receipt.lines[0]),false,'a 1 kg pack is a pack');assert.equal(h(0).last.unit,'items');assert.equal(h(0).last.per,49.9);
 assert.equal(h(1).last.unit,'items');assert.equal(h(1).last.per,32.9);
 assert.equal(h(2).last.unit,'kg');assert.equal(h(2).last.price,100);assert.equal(h(2).last.per,83.33,'paid per kg after the discount');
 assert.equal(h(5).last.unit,'kg');assert.equal(h(5).last.per,5,'the printed price per kg');
});
test('one purchase is one price; cheapest and dearest need two',async()=>{
 const one=priceHistory([r],productId(receipt.lines[1]));assert.equal(one.rows.length,1);
 const two=priceHistory([r,{shopDate:'2026-11-19',store:'סופר הדוגמה',lines:[{raw:'שניצל 4 יח 7290000000123 29.90',name:'Schnitzel',price:29.9}]}],productId(receipt.lines[1]));
 assert.equal(two.rows.length,2);assert.equal(two.cheapest.per,29.9);assert.equal(two.dearest.per,32.9);
 const src=(await import('node:fs')).readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8');
 assert.match(src,/p\.h\.rows\.length<2\?per\(p,p\.h\.last\.per\)\+' · '\+longDate\(a,p\.h\.last\.date\)/);
});
