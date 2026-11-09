// Kids / My Hero audit 08 (2026-11-08): the user's reported items that are decided by shared rules.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {heroState,heroCare,applyHeroCommand,heroNeedFull,HERO_REST_MS} from '../shared/hero-home.mjs';
import {makeHeroGame,validHeroGameFinish} from '../shared/hero-games.mjs';
import {gardenTarget} from '../app/src/hero-garden-targets.mjs';
const now=Date.parse('2026-11-08T12:00:00Z');let n=0;
const withCare=care=>({xp:0,hero:{...heroState({},now),care:{food:80,clean:80,energy:75,joy:80,tidy:80,updatedAt:new Date(now).toISOString(),sleepingAt:null,...care}}});
const act=(p,args,time=now)=>applyHeroCommand(p,{id:'audit-08-test-'+(++n),revision:heroState(p,time).revision,...args},time);

test('a need is full only when its meter shows 100%',()=>{
 assert.equal(heroNeedFull(99.4),false);assert.equal(heroNeedFull(99.5),true);assert.equal(heroNeedFull(100),true);assert.equal(heroNeedFull(98),false);
});
test('Rest is allowed at 98–99% energy (the meter is below 100%) and refused only at 100%',()=>{
 for(const energy of [98,99,99.4]){const p=act(withCare({energy}),{kind:'care',action:'sleep'});assert.ok(heroCare(p,now).sleepingAt,'rest at '+energy)}
 assert.throws(()=>act(withCare({energy:99.6}),{kind:'care',action:'sleep'}),e=>e.code==='rested');
 assert.throws(()=>act(withCare({energy:100}),{kind:'care',action:'sleep'}),e=>e.code==='rested');
});
test('feed, shower and tidy use the same full rule as their meters',()=>{
 assert.ok(act(withCare({clean:98}),{kind:'care',action:'wash'}).hero.care.clean>98);
 assert.throws(()=>act(withCare({clean:99.7}),{kind:'care',action:'wash'}),e=>e.code==='clean');
 assert.ok(act(withCare({tidy:99}),{kind:'care',action:'tidy'}).hero.care.tidy>99);
 assert.throws(()=>act(withCare({food:100}),{kind:'care',action:'feed',food:'apple'}),e=>e.code==='full');
});
test('after the five-minute rest ends by itself, energy is 100 and then follows the gentle hourly rate',()=>{
 const start=now-HERO_REST_MS-3600000,p=withCare({energy:40,updatedAt:new Date(start).toISOString(),sleepingAt:new Date(start).toISOString(),sleepEndsAt:new Date(start+HERO_REST_MS).toISOString(),sleepStartEnergy:40});
 assert.equal(heroCare(p,start+HERO_REST_MS).energy,100);
 const later=heroCare(p,now);assert.equal(later.sleepingAt,null);assert.ok(Math.abs(later.energy-98)<.01,String(later.energy));
 // and the child may rest again, because the meter now reads 98%
 assert.ok(heroCare(act(p,{kind:'care',action:'sleep'}),now).sleepingAt);
 // absence never drops energy below the gentle floor
 assert.equal(heroCare(p,now+3*86400000).energy,84);
});
test('Supermarket detectives: 20 products (five per painted shelf) and a valid round of five targets',()=>{
 for(let i=0;i<20;i++){const g=makeHeroGame('market',{now,entropy:'audit-08-market-'+i});assert.equal(g.items.length,20);assert.equal(new Set(g.items).size,20);assert.equal(g.targets.length,5);assert.ok(g.targets.every(t=>t>=0&&t<20));assert.ok(validHeroGameFinish(g,g.targets))}
 // budget shopping is unchanged
 assert.equal(makeHeroGame('shopping',{now,entropy:'audit-08-shop'}).items.length,12);
});
test('garden targets: an empty bed without a matching packet is not "plantable", but planted plots stay inspectable',()=>{
 const empty=gardenTarget({plot:null,zone:'beds',tool:'seeds',crop:'carrot',hasSeed:false,now});assert.equal(empty.plantable,false);
 const growing=gardenTarget({plot:{crop:'carrot',plantedAt:new Date(now).toISOString(),readyAt:new Date(now+86400000).toISOString(),waterCount:1,wateredAt:new Date(now).toISOString()},zone:'beds',tool:'water',crop:'carrot',hasSeed:true,now});
 assert.equal(growing.actionable,false);assert.equal(growing.growth.waterable,false);
});
