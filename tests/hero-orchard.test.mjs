import test from 'node:test';
import assert from 'node:assert/strict';
import {GARDEN_CROPS,GARDEN_ALL_CROPS,GARDEN_ORCHARD_CROPS,GARDEN_DAY,GARDEN_WATER_INTERVAL,heroGardenState,gardenGrowth,gardenArt} from '../shared/hero-garden.mjs';
import {applyHeroCommand,heroState,heroBalance,publicHero} from '../shared/hero-home.mjs';
const now=Date.parse('2026-11-06T12:00:00Z');let seq=0;
const profile=()=>({xp:2000,character:'maya',hero:heroState({xp:2000},now)});
const act=(p,action,args={},time=now)=>applyHeroCommand(p,{kind:'garden',action,id:'orchard-test-'+(++seq),revision:heroState(p).revision,zone:'orchard',...args},time);

test('orchard migration preserves old beds, inventory and progress and gives starter seeds once',()=>{
 const old={plots:[{crop:'carrot',id:'keep'}],seeds:{carrot:0},seedlings:{mint:2},produce:{tomato:4},xp:41,harvests:3},p=profile();p.hero.garden=structuredClone(old);
 const g=heroGardenState(p);for(const key of Object.keys(old))assert.deepEqual(g[key],old[key]);assert.equal(g.orchardPlots.length,3);assert.equal(Object.values(g.orchardSeeds).reduce((a,b)=>a+b,0),3);assert.deepEqual(p.hero.garden,old);
 let saved=act(p,'plant',{crop:'apple-tree',plot:0});assert.equal(saved.hero.garden.orchardSeeds['apple-tree'],0);assert.equal(heroGardenState(saved).orchardSeeds['apple-tree'],0);assert.deepEqual(saved.hero.garden.plots,old.plots);
 assert.equal(GARDEN_CROPS.length,12);assert.equal(GARDEN_ALL_CROPS.length,18);assert.equal(GARDEN_ORCHARD_CROPS.length,6);
});

test('planting is isolated by zone and wrong-zone commands cannot consume stock or replace plants',()=>{
 const p=profile(),before=structuredClone(p);for(const args of [{crop:'apple-tree',plot:0,zone:'beds'},{crop:'carrot',plot:0},{crop:'apple-tree',plot:0,zone:'__proto__'},{crop:'apple-tree',plot:0,zone:1}]){assert.throws(()=>act(p,'plant',args),/garden-zone/);assert.deepEqual(p,before)}
 let planted=act(p,'plant',{crop:'apple-tree',plot:0});assert.equal(planted.hero.garden.orchardPlots[0].crop,'apple-tree');assert.equal(planted.hero.garden.plots[0],null);assert.throws(()=>act(planted,'plant',{crop:'banana-plant',plot:0}),/garden-occupied/);assert.throws(()=>act(planted,'plant',{crop:'banana-plant',plot:3}),/garden-plot/);
});

test('every fruit has four real-day stages, cannot be picked early and remains safe after a long absence',()=>{
 for(const c of GARDEN_ORCHARD_CROPS){let p=act(profile(),'buy-seeds',{crop:c.id}),time=now+c.days*GARDEN_DAY;p=act(p,'plant',{crop:c.id,plot:0,readyAt:'2000-01-01'});const plot=p.hero.garden.orchardPlots[0];assert.deepEqual([0,.3,.7,1].map(f=>gardenGrowth(plot,now+c.days*GARDEN_DAY*f).stage),[1,2,3,4]);assert.throws(()=>act(p,'harvest',{plot:0},time-1),/garden-growing/);p=act(p,'harvest',{plot:0},time+100*GARDEN_DAY);assert.equal(p.hero.garden.produce[c.id],c.yield);assert.equal(p.hero.garden.xp,c.xp);assert.equal(p.xp,2000);for(let stage=1;stage<=4;stage++)assert.equal(gardenArt(c.id,stage),'/assets/generated/hero-garden/orchard/'+c.id+'-stage-'+stage+'.png')}
});

test('seeds and seedlings have canonical prices, separate stocks and server-defined head starts',()=>{
 let p=profile(),balance=heroBalance(p);p=act(p,'buy-seeds',{crop:'pear-tree',quantity:2,seedling:true,price:0});assert.equal(heroBalance(p),balance-18);assert.equal(p.hero.garden.orchardSeedlings['pear-tree'],2);assert.equal(p.hero.garden.seedlings['pear-tree'],undefined);p=act(p,'plant',{crop:'pear-tree',plot:1,seedling:true});assert.equal(p.hero.garden.orchardSeedlings['pear-tree'],1);assert.equal(gardenGrowth(p.hero.garden.orchardPlots[1],now).remaining,4*GARDEN_DAY*.65);
 for(const quantity of [-1,0,1.5,6,Infinity,'2'])assert.throws(()=>act(p,'buy-seeds',{crop:'pear-tree',quantity}),/quantity/);assert.throws(()=>act(p,'buy-seeds',{crop:'pear-tree',seedling:'yes'}),/quantity/);
});

test('watering touches only the selected area, is bounded and rewards a single harvest bonus',()=>{
 let p=act(profile(),'plant',{crop:'apple-tree',plot:0});p=act(p,'plant',{crop:'carrot',plot:0,zone:'beds'});p=act(p,'water-all');assert.equal(p.hero.garden.orchardPlots[0].waterCount,1);assert.equal(p.hero.garden.plots[0].waterCount,0);assert.throws(()=>act(p,'water',{plot:0}),/garden-watered/);for(let n=1;n<=2;n++)p=act(p,'water',{plot:0},now+n*GARDEN_WATER_INTERVAL);assert.throws(()=>act(p,'water',{plot:0},now+3*GARDEN_WATER_INTERVAL),/garden-watered/);p=act(p,'harvest',{plot:0},now+4*GARDEN_DAY);assert.equal(p.hero.garden.produce['apple-tree'],5);assert.equal(p.hero.garden.orchardPlots[0].waterCount,0);assert.equal(p.hero.garden.plots[0].crop,'carrot');
});

test('fruit plants recur for their finite number of harvests without replaying a seed gift',()=>{
 const c=GARDEN_ORCHARD_CROPS.find(c=>c.id==='pineapple-plant');let p=act(profile(),'plant',{crop:c.id,plot:0}),time=now+c.days*GARDEN_DAY;for(let cycle=1;cycle<=c.cycles;cycle++){p=act(p,'harvest',{plot:0},time);assert.equal(p.hero.garden.harvests,cycle);if(cycle<c.cycles){assert.equal(gardenGrowth(p.hero.garden.orchardPlots[0],time).stage,2);time+=c.regrowDays*GARDEN_DAY}else assert.equal(p.hero.garden.orchardPlots[0],null)}assert.equal(heroGardenState(p).orchardSeeds[c.id],0);assert.throws(()=>act(p,'plant',{crop:c.id,plot:0},time),/garden-no-seed/);
});

test('selling and fridge transfers consume actual harvested fruit and cannot mint forged rewards',()=>{
 let p=act(profile(),'plant',{crop:'apple-tree',plot:0});p=act(p,'harvest',{plot:0},now+4*GARDEN_DAY);const balance=heroBalance(p);p=act(p,'fridge',{crop:'apple-tree'},now+4*GARDEN_DAY);assert.equal(p.hero.pantry.apple,3);assert.equal(p.hero.garden.produce['apple-tree'],2);p=act(p,'sell',{crop:'apple-tree',quantity:2,stars:99999},now+4*GARDEN_DAY);assert.equal(heroBalance(p),balance+2);assert.equal(p.hero.garden.produce['apple-tree'],0);assert.throws(()=>act(p,'sell',{crop:'apple-tree',quantity:1},now+4*GARDEN_DAY),/garden-no-produce/);
 let full=act(profile(),'plant',{crop:'banana-plant',plot:0});full=act(full,'harvest',{plot:0},now+3*GARDEN_DAY);full.hero.pantry['garden-fruit']=30;const before=structuredClone(full);assert.throws(()=>act(full,'fridge',{crop:'banana-plant'},now+3*GARDEN_DAY),/pantry-full/);assert.deepEqual(full,before);
});

test('orchard expansion has its own level, price and capacity and leaves beds unchanged',()=>{
 let p=profile();assert.throws(()=>act(p,'expand'),/garden-level/);p.hero.garden={...heroGardenState(p),xp:80};const balance=heroBalance(p);p=act(p,'expand',{cost:0});assert.equal(p.hero.garden.orchardPlots.length,6);assert.equal(p.hero.garden.plots.length,6);assert.equal(heroBalance(p),balance-24);assert.throws(()=>act(p,'expand'),/garden-full/);
});

test('orchard commands retain revision, replay, private-public projection and sleeping protections',()=>{
 const p=profile(),cmd={kind:'garden',action:'plant',zone:'orchard',crop:'apple-tree',plot:0,id:'orchard-stable-command',revision:0},saved=applyHeroCommand(p,cmd,now);assert.deepEqual(applyHeroCommand(saved,cmd,now),saved);assert.throws(()=>applyHeroCommand(saved,{...cmd,id:'different'},now),/stale/);assert.equal(publicHero(saved).garden,undefined);assert.equal(publicHero(saved).pantry,undefined);saved.hero.care.sleepingAt=new Date(now).toISOString();assert.throws(()=>act(saved,'water',{plot:0}),/sleeping/);
});
