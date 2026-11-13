// "I'm not shopping" within 6 seconds of Start (release check of 1.76.0, 2026-11-13): the "You started shopping · Undo"
// toast was still up, the app hides plain notices under an Undo toast, so the stop notice never showed; and the leftover
// Undo then did nothing. Every stop now closes the Start toast first, and its Undo always says what happened.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=f=>readFileSync(new URL('../app/src/'+f,import.meta.url),'utf8');
test('the toast layer closes an Undo toast by its id',()=>{
 assert.match(src('motion-fx.jsx'),/if\(type==='dismiss'\)setRemoved\(v=>v&&v\.id===payload\?null:v\)/);
 assert.match(src('motion-fx.jsx'),/\{!removed&&shown&&<div role="status"/,'a plain notice shows once no Undo toast is up');
});
test('the Start toast has an id, and its Undo always answers',()=>{
 const v=src('shopping-view.jsx');
 assert.match(v,/fxBus\.emit\('deleted',\{id:'shop-start',text:a\.T\('You started shopping\. The family can see it\.','התחלת קנייה\. המשפחה רואה את זה\.'\),restore:undoStart\}\)/);
 const undo=v.slice(v.indexOf('const undoStart='),v.indexOf('const startShop='));
 assert.match(undo,/a\.notify\(await stopNow\(\)\?a\.T\('OK, you are not shopping\. The list is back to planning\.'/,'stopped: the stop notice');
 assert.match(undo,/:a\.T\('You are not shopping now\. The list is back to planning\.','את\/ה כבר לא בקנייה\. הרשימה בהכנה\.'\)/,'already ended: says so instead of nothing');
 assert.match(undo,/catch\(e\)\{a\.notify\(e\.message\)\}/,'an error is shown, never a silent toast');
 assert.match(v,/if\(!s\|\|s\.ownerId!==latest\.current\.user\)return false;await latest\.current\.stopShopping\(s\.id\);return true\}/);
});
test('both stop paths close the Start toast before their notice',()=>{
 assert.match(src('shopping-view.jsx'),/const notShopping=async\(\)=>\{fxBus\.emit\('dismiss','shop-start'\);try\{await stopNow\(\);a\.notify\(/);
 const s=src('shopping-smart.jsx');
 assert.match(s,/import \{fxBus\} from '\.\/motion-fx';/);
 assert.match(s,/const stop=async\(\)=>\{fxBus\.emit\('dismiss','shop-start'\);try\{await a\.stopShopping\(shop\.shopId\);a\.notify\(/);
});
