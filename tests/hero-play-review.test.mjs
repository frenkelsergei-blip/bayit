import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHeroCommand,heroState,heroBalance} from '../shared/hero-home.mjs';
import {heroGameSolution,HERO_PUZZLE_ART,heroGameReward} from '../shared/hero-games.mjs';
import {jigsawImageCrop,jigsawTargetAt} from '../app/src/hero-jigsaw-render.mjs';
const now=Date.parse('2026-11-07T12:00:00Z');
const cmd=(p,body)=>({id:crypto.randomUUID(),revision:heroState(p).revision,...body});
const act=(p,body)=>applyHeroCommand(p,cmd(p,body),now);
const start=(p,game,art)=>act(p,{kind:'start-game',game,...(art?{art}:{})});
const finish=p=>act(p,{kind:'finish-game',session:p.hero.activeGame.id,trace:heroGameSolution(p.hero.activeGame),xp:99999,stars:99999});
test('all12 stages persist and automatic next-picture selection survives a reload',()=>{
 let p={xp:70};const initial=heroBalance(p);
 for(const [art] of HERO_PUZZLE_ART){p=start(JSON.parse(JSON.stringify(p)),'puzzle');assert.equal(p.hero.activeGame.art,art);p=finish(p);assert.equal(p.hero.lastGameResult.art,art)}
 assert.deepEqual(p.hero.puzzleCompleted,HERO_PUZZLE_ART.map(a=>a[0]));assert.equal(p.xp,70+12*40);assert.equal(heroBalance(p),initial+12*8);
 p=finish(start(p,'puzzle','forest'));assert.equal(p.hero.puzzleCompleted.length,12);assert.equal(p.hero.lastGameResult.stars,8);
});
test('each completed game earns exact server prices while progress and retries cannot double-award',()=>{
 for(const kind of ['puzzle','rhythm','shopping','market']){
  let p=start({xp:125,hero:{gameStars:7,bonusStars:9,spent:3,gameRewards:{'2026-11-07:puzzle':'legacy'}}},kind),initial=heroBalance(p),g=p.hero.activeGame;
  p=act(p,{kind:'game-progress',session:g.id,trace:heroGameSolution(g).slice(0,1)});assert.equal(p.xp,125);assert.equal(heroBalance(p),initial);
  const c=cmd(p,{kind:'finish-game',session:g.id,trace:heroGameSolution(g),xp:9999,stars:9999}),prize=heroGameReward(kind);
  p=applyHeroCommand(p,c,now);assert.equal(p.xp,125+prize.xp);assert.equal(p.hero.gameXp,prize.xp);assert.equal(heroBalance(p),initial+prize.coins);
  assert.deepEqual(applyHeroCommand(p,c,now),p);assert.equal(p.hero.receipts[0].xp,prize.xp);assert.equal(p.hero.receipts[0].stars,prize.coins);
  p.xp-=10;assert.equal(heroBalance(p),initial+prize.coins-2,'undoing a routine preserves the game prize');
 }
});
test('guide crop and pointer targets share the photograph interior rather than its decorative border',()=>{
 assert.deepEqual(jigsawImageCrop(1536,1024),[0,0,1536,1024]);assert.ok(jigsawImageCrop(1000,1000).every((n,i)=>Math.abs(n-[0,500/3,1000,2000/3][i])<1e-9));
 const r={left:17,top:31,width:300,height:200,right:317,bottom:231};
 for(let i=0;i<16;i++)assert.equal(jigsawTargetAt(r,17+(i%4+.5)*75,31+(Math.floor(i/4)+.5)*50),i);
 assert.equal(jigsawTargetAt(r,16,50),null);assert.equal(jigsawTargetAt(r,317,50),null);assert.equal(jigsawTargetAt(r,100,231),null);
});

import {resolveBonusChild} from '../shared/kids-bonus.mjs';
test('bonus history and grant form resolve stale sample child IDs to a real household child',()=>{const kids=[{id:'real-or'},{id:'real-yam'}];assert.equal(resolveBonusChild(kids,'itai'),'real-or');assert.equal(resolveBonusChild(kids,'real-yam'),'real-yam');assert.equal(resolveBonusChild([], 'itai'),undefined)});
