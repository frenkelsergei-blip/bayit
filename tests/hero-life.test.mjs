import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HERO_ITEMS} from '../shared/hero-catalog.mjs';
import {heroState,heroCare,heroBalance,applyHeroCommand,HERO_REST_MS} from '../shared/hero-home.mjs';
import {heroRoomDisplay} from '../shared/hero-room-layout.mjs';
import {makeHeroGame} from '../shared/hero-games.mjs';
import {gardenTarget} from '../app/src/hero-garden-targets.mjs';
import {applyChanges,blankState,visibleState} from '../app/cloud/state.mjs';
const now=Date.parse('2026-11-07T12:00:00Z');let sequence=0;
const command=(p,args)=>({id:'hero-life-test-'+(++sequence),revision:heroState(p,now).revision,...args});
const act=(p,args,time=now)=>applyHeroCommand(p,command(p,args),time);
test('two stars per ten XP preserves spent coins, game gifts, inventory and XP',()=>{
 const p={xp:380,hero:{spent:28,gameStars:4,owned:['gold'],pantry:{apple:3}}};
 assert.equal(heroBalance(p),12+76+4-28);assert.equal(heroBalance({...p,xp:390})-heroBalance(p),2);assert.equal(p.xp,380);assert.deepEqual(p.hero.owned,['gold']);assert.equal(p.hero.pantry.apple,3);
 assert.equal(HERO_ITEMS.filter(i=>i.category==='food').length,36);
});
test('five-minute sleep survives reload and intervening purchases; full energy wakes automatically',()=>{
 let p={xp:100,hero:{care:{...heroState({},now).care,energy:36}}};p=act(p,{kind:'care',action:'sleep'});
 assert.equal(heroCare(p,now+HERO_REST_MS/2).energy,68);p=act(p,{kind:'buy',item:'apple'},now+60000);
 p=JSON.parse(JSON.stringify(p));assert.equal(heroCare(p,now+HERO_REST_MS/2).energy,68);assert.ok(heroCare(p,now+HERO_REST_MS-1).sleepingAt);
 assert.equal(heroCare(p,now+HERO_REST_MS).sleepingAt,null);assert.equal(heroCare(p,now+HERO_REST_MS).energy,100);
 p=act(p,{kind:'care',action:'feed',food:'apple'},now+HERO_REST_MS);assert.equal(p.hero.care.sleepingAt,null);
});
test('legacy sleeping records also wake, and active-day mess never accumulates while absent',()=>{
 const p={hero:{care:{...heroState({},now).care,energy:40,sleepingAt:new Date(now).toISOString()}}};assert.equal(heroCare(p,now+HERO_REST_MS).sleepingAt,null);
 let active=act({},{kind:'care',action:'play'});assert.equal(active.hero.care.tidy,55);
 active=act(active,{kind:'care',action:'tidy'},now+3000);assert.equal(active.hero.care.tidy,100);
 active=act(active,{kind:'care',action:'play'},now+6000);assert.equal(active.hero.care.tidy,100);assert.equal(heroCare(active,now+365*86400000).tidy,100);
 active=act(active,{kind:'care',action:'play'},now+86400000);assert.equal(active.hero.care.tidy,55);
});
test('room purchase stays in storage; room placement is owned, typed, atomic and idempotent',()=>{
 let p={xp:1000,hero:{owned:['plant','ball','books','calendar'],loadout:{decor:'plant'}}};assert.equal(heroRoomDisplay(p).window,'plant');
 p=act(p,{kind:'buy',item:'clock'});assert.equal(p.hero.loadout.decor,'plant');assert.ok(p.hero.owned.includes('clock'));
 const layout={shelf:'books',window:'plant',wall:'calendar',floor:'ball'},req=command(p,{kind:'room-layout',placements:layout});
 const next=applyHeroCommand(p,req,now);assert.deepEqual(heroRoomDisplay(next),layout);assert.deepEqual(applyHeroCommand(next,req,now),next);assert.equal(next.hero.spent,p.hero.spent);
 for(const placements of [{floor:'dragon'},{floor:'plant'},{floor:'bike'},{unknown:'ball'},[],{shelf:{id:'books'}}])assert.throws(()=>act(next,{kind:'room-layout',placements}),/room-layout/);
 assert.deepEqual(next.hero.roomDisplay,layout);const stored=act(next,{kind:'room-layout',placements:{...layout,floor:null}});assert.ok(stored.hero.owned.includes('ball'));
});
test('household server rejects forged room inventory and a sibling cannot manage the room',()=>{
 const d=blankState('home','Review',{id:'parent',role:'parent'});d.members.push({id:'kid',role:'child'},{id:'sibling',role:'child'});d.profiles.kid={xp:200,hero:{owned:['ball']}};
 const req=command(d.profiles.kid,{kind:'room-layout',placements:{floor:'bike'}}),op={collection:'profiles',id:'kid',value:{hero:{owned:['bike']},heroRequest:req}};
 assert.throws(()=>applyChanges(d,[op],'kid','child'),/room-layout/);
 op.value.heroRequest=command(d.profiles.kid,{kind:'room-layout',placements:{floor:'ball'}});assert.throws(()=>applyChanges(d,[op],'sibling','child'),/private/);
 const next=applyChanges(d,[op],'kid','child');assert.equal(next.profiles.kid.hero.roomDisplay.floor,'ball');assert.equal(visibleState(next,'sibling').profiles.kid.hero.roomDisplay,undefined);
});
test('Simon patterns grow by one color while different rounds receive different sequences',()=>{
 const patterns=new Set();for(let i=0;i<20;i++){const g=makeHeroGame('rhythm',{entropy:'simon-'+i,now});assert.deepEqual(g.rounds.map(r=>r.length),[1,2,3,4,5]);for(let r=1;r<5;r++)assert.deepEqual(g.rounds[r].slice(0,r),g.rounds[r-1]);for(let r=1;r<5;r++)assert.notEqual(g.rounds[4][r],g.rounds[4][r-1]);patterns.add(g.rounds[4].join(','))}assert.ok(patterns.size>15);
});
test('garden tool targets match watering cooldown, readiness, stock and planting zone',()=>{
 const p={crop:'tomato',plantedAt:new Date(now-1000).toISOString(),readyAt:new Date(now+86400000).toISOString(),waterCount:0};
 const target=(plot,tool,zone='beds',crop='carrot',hasSeed=true)=>gardenTarget({plot,tool,zone,crop,hasSeed,now});
 assert.equal(target(p,'water').actionable,true);assert.equal(target({...p,wateredAt:new Date(now).toISOString()},'water').actionable,false);assert.equal(target({...p,waterCount:3},'water').actionable,false);
 assert.equal(target({...p,readyAt:new Date(now).toISOString()},'harvest').actionable,true);assert.equal(target(p,'harvest').actionable,false);assert.equal(target(null,'water').actionable,false);
 assert.equal(target(null,'seeds').actionable,true);assert.equal(target(null,'seeds','orchard').actionable,false);assert.equal(target(null,'seeds','orchard','apple-tree').actionable,true);assert.equal(target(null,'seeds','beds','carrot',false).actionable,false);assert.equal(target(p,'seeds').inspectable,true);
});
