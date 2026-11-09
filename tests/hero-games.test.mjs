import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {makeHeroGame,heroGameSolution,heroGameReward,heroPuzzleThumbnail,validHeroGameProgress,validHeroGameFinish,heroGameRewardKey,HERO_MARKET_ITEMS,HERO_MARKET_BY_ID,HERO_PUZZLE_ART,HERO_RHYTHM_PADS,HERO_GAME_MAX_AGE} from '../shared/hero-games.mjs';
import {heroState,heroBalance,applyHeroCommand} from '../shared/hero-home.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
const now=Date.parse('2026-11-06T10:00:00Z'),profile=()=>({name:'Player',xp:380,character:'itai'});let index=0;
const command=(p,payload)=>({id:'game-test-command-'+(++index),revision:heroState(p).revision,...payload});
const act=(p,payload,time=now)=>applyHeroCommand(p,command(p,payload),time);
const start=(p,kind,time=now)=>act(p,{kind:'start-game',game:kind},time);
function finish(p,time=now+10000){const game=p.hero.activeGame;return act(p,{kind:'finish-game',session:game.id,trace:heroGameSolution(game)},time)}

test('every game uses existing PNGs; puzzle offers twelve 16-piece pictures',()=>{
 for(const item of HERO_MARKET_ITEMS)assert.ok(existsSync(new URL('../app/public'+item.image,import.meta.url)),item.id);
 for(const art of HERO_PUZZLE_ART){assert.ok(existsSync(new URL('../app/public'+art[3],import.meta.url)),art[0]);assert.ok(existsSync(new URL('../app/public'+heroPuzzleThumbnail(art[0]),import.meta.url)),art[0]+' thumbnail')}
 for(const pad of HERO_RHYTHM_PADS)assert.ok(existsSync(new URL('../app/public/assets/icons/bayit/pixel/'+pad[3]+'-256.png',import.meta.url)));
 assert.equal(HERO_PUZZLE_ART.length,12);
});
test('server-generated rounds are deterministic, varied and solvable across many seeds',()=>{
 const arrangements=new Set();for(let seed=0;seed<60;seed++)for(const kind of ['puzzle','shopping','market','rhythm']){
  const options={now,entropy:'seed-for-game-'+seed},g=makeHeroGame(kind,options);assert.deepEqual(g,makeHeroGame(kind,options));assert.ok(validHeroGameFinish(g,heroGameSolution(g)));assert.ok(!validHeroGameFinish(g,[]));
  if(kind==='puzzle'){assert.equal(new Set(g.pieces).size,16);assert.ok(g.pieces.some((v,i)=>v!==i))}
  if(['shopping','market'].includes(kind)){assert.equal(new Set(g.items).size,kind==='shopping'?12:20);arrangements.add(g.items.join(','))}
  if(kind==='shopping'){assert.equal(g.goal,'budget');assert.ok(g.required.every(i=>g.items.includes(i.id)));assert.equal(g.budget,g.required.reduce((sum,i)=>sum+HERO_MARKET_BY_ID[i.id].price*i.quantity,0));assert.ok(g.budget>=7&&g.budget<=18)}
  if(kind==='rhythm')assert.deepEqual(g.rounds.map(r=>r.length),[1,2,3,4,5]);
 }assert.ok(arrangements.size>50);
});
test('invalid kinds, pictures, traces, duplicate placements and non-integer beats are refused',()=>{
 for(const kind of ['fake','__proto__'])assert.throws(()=>makeHeroGame(kind));assert.throws(()=>makeHeroGame('puzzle',{art:'outside'}));
 for(const kind of ['puzzle','shopping','market','rhythm']){const g=makeHeroGame(kind,{now,entropy:'fixed-game-seed'}),solution=heroGameSolution(g);assert.ok(validHeroGameProgress(g,solution.slice(0,1)));assert.ok(!validHeroGameFinish(g,solution.slice(0,-1)));assert.ok(!validHeroGameProgress(g,Array(100).fill(0)));assert.ok(!validHeroGameProgress(g,{}))}
 const puzzle=makeHeroGame('puzzle'),sol=heroGameSolution(puzzle);assert.ok(!validHeroGameProgress(puzzle,[sol[0],sol[0]]));assert.ok(!validHeroGameProgress(puzzle,[{piece:0,target:(sol[0].target+1)%16}]));
 const shopping=makeHeroGame('shopping');assert.ok(!validHeroGameProgress(shopping,[shopping.required[0].id,shopping.required[0].id]));assert.ok(!validHeroGameProgress(shopping,['__proto__']));
 const rhythm=makeHeroGame('rhythm');assert.ok(!validHeroGameProgress(rhythm,['0']));assert.ok(!validHeroGameProgress(rhythm,[NaN]));
});
test('game checkpoints persist on the authoritative profile and survive a JSON reload',()=>{
 for(const kind of ['puzzle','shopping','market','rhythm']){let p=start(profile(),kind),g=p.hero.activeGame,trace=heroGameSolution(g).slice(0,2);p=act(p,{kind:'game-progress',session:g.id,trace});p=JSON.parse(JSON.stringify(p));assert.deepEqual(p.hero.activeGame.progress,trace);assert.equal(p.xp,380);assert.equal(p.hero.gameStars,0);p=finish(p);assert.equal(p.hero.activeGame,null);assert.equal(p.hero.lastGameResult.stars,heroGameReward(kind).coins);assert.equal(p.xp,380+heroGameReward(kind).xp)}
});
test('every completed game rewards again, including both market games and later home days',()=>{
 let p=profile(),initial=heroBalance(p),xp=380,coins=0;for(const kind of ['puzzle','rhythm','shopping','market','puzzle','rhythm']){p=finish(start(p,kind));xp+=heroGameReward(kind).xp;coins+=heroGameReward(kind).coins;assert.equal(p.xp,xp);assert.equal(p.hero.gameStars,coins);assert.equal(heroBalance(p),initial+coins)}
 assert.equal(p.hero.gameStats.puzzle,2);assert.equal(p.hero.gameStats.rhythm,2);assert.equal(p.hero.gameStats.shopping,1);
 const later=now+86400000;p=finish(start(p,'puzzle',later),later+10000);assert.equal(p.hero.gameStars,coins+8);
 assert.notEqual(heroGameRewardKey('puzzle',Date.parse('2026-11-06T21:59:59Z')),heroGameRewardKey('puzzle',Date.parse('2026-11-06T22:00:01Z')));
});

test('shopping awards actual fridge food per completion and food capacity never overflows',()=>{
 let p=start(profile(),'shopping'),food=p.hero.activeGame.food,before=p.hero.pantry[food]||0;p=finish(p);assert.equal(p.hero.pantry[food],before+1);assert.equal(p.hero.lastGameResult.food,food);p=finish(start(p,'shopping'));assert.equal(p.hero.pantry[food],before+2);
 p=profile();p.hero=heroState(p,now);p.hero.pantry.apple=30;p=finish(start(p,'market'));assert.equal(p.hero.pantry.apple,30);assert.equal(p.hero.lastGameResult.food,null);assert.equal(p.hero.lastGameResult.stars,2);
});
test('finishing twice, forged proof, changed sessions and expired rounds cannot mint rewards',()=>{
 let p=start(profile(),'puzzle'),g=p.hero.activeGame,good=command(p,{kind:'finish-game',session:g.id,trace:heroGameSolution(g)});
 assert.throws(()=>act(p,{kind:'finish-game',session:'other',trace:good.trace}),/game-changed/);assert.throws(()=>act(p,{kind:'finish-game',session:g.id,trace:[]}),/game-proof/);assert.throws(()=>applyHeroCommand(p,good,now+HERO_GAME_MAX_AGE+1),/game-expired/);
 const done=applyHeroCommand(p,good,now+10000);assert.deepEqual(applyHeroCommand(done,good,now+11000),done);assert.throws(()=>act(done,{kind:'finish-game',session:g.id,trace:good.trace}),/game-changed/);assert.equal(done.hero.gameStars,8);
});
test('cancelling and starting anew do not grant XP or prizes, and sleep prevents gameplay',()=>{
 let p=start(profile(),'puzzle'),g=p.hero.activeGame;p=act(p,{kind:'cancel-game',session:g.id});assert.equal(p.hero.activeGame,null);assert.equal(p.hero.gameStars,0);p=act(p,{kind:'care',action:'sleep'});assert.throws(()=>start(p,'market'),/sleeping/);assert.equal(p.xp,380);
});
test('the actual server gate ignores forged game snapshots and isolates every child’s game history',()=>{
 const d=blankState('games-home','Games home',{id:'parent',name:'Parent',role:'parent'});d.members.push({id:'kid',role:'child'},{id:'sibling',role:'child'});d.profiles.kid=profile();d.profiles.sibling=profile();
 const first=command(d.profiles.kid,{kind:'start-game',game:'puzzle'}),ops=[{collection:'profiles',id:'kid',value:{hero:{gameStars:999999,activeGame:{id:'forged'}},heroRequest:first}}];
 assert.throws(()=>applyChanges(d,ops,'sibling','child'),/private/);let next=applyChanges(d,ops,'kid','child');assert.equal(next.profiles.kid.hero.gameStars,0);assert.equal(next.profiles.kid.hero.activeGame.id,first.id);
 const game=next.profiles.kid.hero.activeGame,complete=command(next.profiles.kid,{kind:'finish-game',session:game.id,trace:heroGameSolution(game)});next=applyChanges(next,[{collection:'profiles',id:'kid',value:{heroRequest:complete}}],'parent','parent');assert.equal(next.profiles.kid.hero.gameStars,8);assert.equal(next.profiles.kid.xp,420);
 const sibling=visibleState(next,'sibling').profiles.kid.hero;for(const key of ['gameStars','gameRewards','gameStats','lastGameResult','activeGame','pantry'])assert.equal(sibling[key],undefined);assert.equal(visibleState(next,'parent').profiles.kid.hero.gameStats.puzzle,1);
});
test('new shopping rounds change the budget and accept any exact affordable combination',()=>{
 let p=profile(),last=0;for(let round=0;round<20;round++){p=start(p,'shopping');const g=p.hero.activeGame;assert.notEqual(g.budget,last);last=g.budget;const combinations=[];const find=(from,trace,total)=>{if(total===g.budget){combinations.push(trace);return}if(trace.length>=5||total>g.budget)return;for(let i=from;i<g.items.length;i++)find(i+1,[...trace,g.items[i]],total+HERO_MARKET_BY_ID[g.items[i]].price)};find(0,[],0);assert.ok(combinations.length);for(const trace of combinations.slice(0,8))assert.ok(validHeroGameFinish(g,trace));assert.ok(!validHeroGameFinish(g,heroGameSolution(g).slice(0,-1)));p=finish(p)}assert.equal(p.xp,680);
});
test('legacy shopping rounds keep their issued recipe and budget rules',()=>{
 const g={id:'legacy-shopping',kind:'shopping',items:['apple','bread','milk-carton'],required:[{id:'apple',quantity:1},{id:'bread',quantity:1}],budget:7};assert.ok(validHeroGameFinish(g,['apple','bread']));assert.ok(!validHeroGameFinish(g,['milk-carton','bread']));
});
