import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHeroCommand,heroState,heroBalance,publicHero} from '../shared/hero-home.mjs';
import {heroGameSolution,HERO_GAME_MAX_AGE} from '../shared/hero-games.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {jigsawEdges,traceJigsaw} from '../app/src/hero-jigsaw-geometry.mjs';

const now=Date.parse('2026-11-07T12:00:00Z');
const command=(p,payload)=>({id:crypto.randomUUID(),revision:heroState(p,now).revision,...payload});
const act=(p,payload,time=now)=>applyHeroCommand(p,command(p,payload),time);
const start=(p,kind)=>act(p,{kind:'start-game',game:kind});
const save=(p,count)=>act(p,{kind:'game-progress',session:p.hero.activeGame.id,trace:heroGameSolution(p.hero.activeGame).slice(0,count)});

test('switching games preserves each server-issued session and exact confirmed progress across reload',()=>{
 let p={xp:380,character:'noa'};p=save(start(p,'puzzle'),3);const puzzle=structuredClone(p.hero.activeGame);
 p=save(start(p,'rhythm'),2);const rhythm=structuredClone(p.hero.activeGame);
 p=JSON.parse(JSON.stringify(p));p=start(p,'puzzle');assert.deepEqual(p.hero.activeGame,puzzle);assert.deepEqual(p.hero.savedGames.rhythm,rhythm);assert.equal(p.hero.savedGames.puzzle,undefined);
 p=start(p,'rhythm');assert.deepEqual(p.hero.activeGame,rhythm);assert.deepEqual(p.hero.savedGames.puzzle,puzzle);assert.equal(p.xp,380);assert.equal(p.hero.gameStars,0);
});
test('free entry, explicit puzzle restart and completion keep other games and repeatable rewards',()=>{
 let p={xp:0,hero:{spent:12}};assert.equal(heroBalance(p),0);
 p=save(start(p,'rhythm'),1);const rhythm=structuredClone(p.hero.activeGame);p=save(start(p,'puzzle'),2);const old=p.hero.activeGame.id;
 p=act(p,{kind:'start-game',game:'puzzle',art:'garden',restart:true});assert.notEqual(p.hero.activeGame.id,old);assert.equal(p.hero.activeGame.art,'garden');assert.deepEqual(p.hero.activeGame.progress,[]);assert.deepEqual(p.hero.savedGames.rhythm,rhythm);
 p=act(p,{kind:'finish-game',session:p.hero.activeGame.id,trace:heroGameSolution(p.hero.activeGame)});assert.equal(p.hero.gameStars,8);assert.deepEqual(p.hero.savedGames.rhythm,rhythm);
 p=start(p,'puzzle');p=act(p,{kind:'finish-game',session:p.hero.activeGame.id,trace:heroGameSolution(p.hero.activeGame)});assert.equal(p.hero.lastGameResult.stars,8);assert.equal(p.hero.gameStars,16);assert.equal(p.xp,80);
});
test('old sessions cannot finish against another active game and expired saved games restart without rewards',()=>{
 let p=save(start({},'puzzle'),2),old=structuredClone(p.hero.activeGame);p=start(p,'rhythm');
 assert.throws(()=>act(p,{kind:'finish-game',session:old.id,trace:heroGameSolution(old)}),/game-changed/);
 p=act(p,{kind:'start-game',game:'puzzle'},now+HERO_GAME_MAX_AGE+1000);assert.notEqual(p.hero.activeGame.id,old.id);assert.deepEqual(p.hero.activeGame.progress,[]);assert.equal(p.hero.gameStars,0);
 assert.throws(()=>act(p,{kind:'start-game',game:'__proto__'}),/game/);assert.throws(()=>act(p,{kind:'start-game',game:'puzzle',restart:'yes'}),/game/);
});
test('saved progress stays child-private and forged incoming saved-game snapshots are ignored by server',()=>{
 const d=blankState('hero-org-home','Hero home',{id:'parent',name:'Parent',role:'parent'});d.members.push({id:'kid',role:'child'},{id:'sibling',role:'child'});d.profiles.kid={xp:380};d.profiles.sibling={xp:0};
 let next=d;
 for(const game of ['puzzle','rhythm']){const request=command(next.profiles.kid,{kind:'start-game',game});const ops=[{collection:'profiles',id:'kid',value:{hero:{savedGames:{puzzle:{id:'forged',progress:Array(16).fill({piece:0,target:0})}},gameStars:99999},heroRequest:request}}];assert.throws(()=>applyChanges(next,ops,'sibling','child'),/private/);next=applyChanges(next,ops,'kid','child')}
 assert.notEqual(next.profiles.kid.hero.savedGames.puzzle.id,'forged');assert.equal(next.profiles.kid.hero.gameStars,0);assert.equal(visibleState(next,'sibling').profiles.kid.hero.savedGames,undefined);assert.equal(publicHero(next.profiles.kid).savedGames,undefined);assert.ok(visibleState(next,'parent').profiles.kid.hero.savedGames.puzzle);
});
test('all16 jigsaw pieces have flat outer boundaries and matching complementary internal tabs',()=>{
 for(let i=0;i<16;i++){const e=jigsawEdges(i),r=Math.floor(i/4),c=i%4;
  if(r===0)assert.equal(e[0],0);else assert.equal(e[0],-jigsawEdges(i-4)[2]);
  if(c===3)assert.equal(e[1],0);else assert.equal(e[1],-jigsawEdges(i+1)[3]);
  if(r===3)assert.equal(e[2],0);if(c===0)assert.equal(e[3],0);
  const calls=[],ctx={beginPath(){},closePath(){},moveTo(...v){calls.push(v)},lineTo(...v){calls.push(v)},bezierCurveTo(...v){calls.push(v)}};traceJigsaw(ctx,i);assert.ok(calls.every(v=>v.every(Number.isFinite)));assert.ok(calls.some(v=>v.some(n=>n<0||n>100)),'a piece must have real curved protrusions or recesses');
 }
});
