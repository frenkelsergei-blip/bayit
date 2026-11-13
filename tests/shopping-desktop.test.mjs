// Shopping on a computer (owner report 2026-11-12, choice B): from 1024px (1101px until the wide-screen pass, 2026-11-13) the list sits at a comfortable width and the
// shop (when, who, Start/Finish, last shop, suggestions) is a side column; phones and tablets keep it inside the list.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const view=readFileSync(new URL('../app/src/shopping-view.jsx',import.meta.url),'utf8'),css=readFileSync(new URL('../app/src/shopping-layout.css',import.meta.url),'utf8');
test('the shop lines render once: in the list below 1024px, in the side column from 1024px',()=>{
 assert.match(view,/const wide=useMedia\('\(min-width:1024px\) and \(min-height:521px\)'\),aside=wide&&!!currentList&&isActive;/);
 assert.match(view,/\{!wide&&shopLines\}/);assert.match(view,/\{aside&&<aside className="shop2-aside" aria-label=\{a\.T\('This shop','הקנייה הזו'\)\}>\{shopLines\}<\/aside>\}/);
 assert.equal((view.match(/<PlanLine /g)||[]).length,1);assert.equal((view.match(/<SmartCard /g)||[]).length,1);
});
test('desktop sizes come from the existing grid and scale: 1136px page, side 290–350px, gap 26px, normal-height Start',()=>{
 const desk=css.slice(css.indexOf('@media(min-width:1024px) and (min-height:521px){'));
 assert.match(desk,/main\.main-content\.view-shopping \.shop2\{max-width:1136px!important;margin-inline:auto\}/,'beats the page-header rule that removes the cap');
 assert.match(desk,/\.shop2-layout\.ss-two\{grid-template-columns:minmax\(0,1fr\) minmax\(290px,350px\);gap:26px/);
 assert.match(desk,/\.ss-start\{width:auto;align-self:flex-start;margin:0;min-height:var\(--scale-control,44px\)/);
 assert.doesNotMatch(css.slice(0,css.indexOf('/* ---------- Wide screens')),/shop2-aside/,'nothing for the side column outside the desktop range');
});
