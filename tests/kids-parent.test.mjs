import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {handleKidsParent} from '../app/cloud/kids-parent.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {heroState,heroBalance,publicHero} from '../shared/hero-home.mjs';
import {validateKidsBonus} from '../shared/kids-bonus.mjs';

async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const parent={id:'parent',role:'parent',name:'Parent'},child={id:'kid',role:'child',name:'Child'},sibling={id:'sibling',role:'child',name:'Sibling'},state=blankState('home','Test home',parent);
 state.members.push(child,sibling);state.profiles.kid={xp:120,character:'noa',hero:heroState({})};state.profiles.sibling={xp:0,hero:heroState({})};
 await DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind('account','Parent','bonus@example.invalid').run();
 await DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('session','token','account','2099-01-01').run();
 await DB.prepare('INSERT INTO households(id,name,created_by,created_at) VALUES(?,?,?,?)').bind('home','Test','account','2026-11-07').run();
 await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind('home',JSON.stringify(state)).run();
 const env={DB,AUTH_SECRET:'disposable-parent-area-test-secret'},user={id:'account'};
 const home=async()=>{const row=await DB.prepare('SELECT state,revision FROM household_data WHERE household_id=?').bind('home').first();return {id:'home',state:JSON.parse(row.state),revision:row.revision,membership:{role:'parent',member_id:'parent'}}};
 const call=async(action,body,token,customHome)=>{const url=new URL('http://local/api/kids-parent/'+action),req=new Request(url,{method:body===undefined?'GET':'POST',headers:{Cookie:'authjs.session-token=token',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{'X-Bayit-Parent-Unlock':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return handleKidsParent(req,env,user,customHome||await home(),url.pathname,url)};
 const unlock=async code=>(await (await call('unlock',{pin:code})).json()).token;
 return {DB,env,user,home,call,unlock,state};
}
test('parent bonus is server-confirmed once, adds coins without XP and cannot be forged through profile sync',async()=>{
 const f=await fixture(),token=await f.unlock('0000'),input={id:'test-grant-0001',childId:'kid',amount:20,reason:'Helped with the laundry'},before=f.state.profiles.kid,balance=heroBalance(before);
 const result=await (await f.call('grant',input,token)).json();assert.equal(result.data.profiles.kid.xp,120);assert.equal(heroBalance(result.data.profiles.kid),balance+20);assert.deepEqual(result.data.profiles.kid.hero.owned,before.hero.owned);assert.deepEqual(result.data.profiles.kid.hero.care,before.hero.care);
 await f.call('grant',input,token);const h=await f.home();assert.equal(h.revision,1);assert.equal(heroBalance(h.state.profiles.kid),balance+20);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM kids_bonus_grants').first()).n,1);
 const forged=applyChanges(h.state,[{collection:'profiles',id:'kid',value:{hero:{bonusStars:999999},xp:99999}}],'kid','child');assert.equal(forged.profiles.kid.hero.bonusStars,20);assert.equal(forged.profiles.kid.xp,120);
 assert.equal(publicHero(h.state.profiles.kid).bonusStars,undefined);assert.equal(visibleState(h.state,'sibling').profiles.kid.hero.bonusStars,undefined);
 await assert.rejects(f.call('grant',{...input,reason:'Changed reason'},token),/already used/);
});
test('child and non-parent accounts cannot unlock or grant; history is private to child and parents',async()=>{
 const f=await fixture(),token=await f.unlock('0000'),childHome={...await f.home(),membership:{role:'child',member_id:'kid'}};
 await assert.rejects(f.call('unlock',{pin:'0000'},null,childHome),/authenticated parent/);
 await assert.rejects(f.call('grant',{id:'test-grant-0002',childId:'kid',amount:10,reason:'Kindness'},token,childHome),/authenticated parent/);
 const url=new URL('http://local/api/kids-parent/history?childId=kid'),request=new Request(url);
 const own=await handleKidsParent(request,f.env,f.user,childHome,url.pathname,url);assert.equal(own.status,200);
 await assert.rejects(handleKidsParent(request,f.env,f.user,{...childHome,membership:{role:'child',member_id:'sibling'}},url.pathname,url),/private/);
 const adultHome={...await f.home(),membership:{role:'adult',member_id:'adult'}};await assert.rejects(f.call('unlock',{pin:'0000'},null,adultHome),/authenticated parent/);
});
test('PIN changes invalidate previous unlocks, are hashed privately and remain bound to the authenticated session',async()=>{
 const f=await fixture(),old=await f.unlock('0000');await f.call('pin',{pin:'2817'},old);
 await assert.rejects(f.call('grant',{id:'test-grant-0003',childId:'kid',amount:10,reason:'Help'},old),/Unlock/);
 await assert.rejects(f.unlock('0000'),/incorrect/);const token=await f.unlock('2817');assert.ok(token);
 const row=await f.DB.prepare('SELECT * FROM kids_parent_controls').first();assert.notEqual(row.pin_hash,'2817');assert.ok(row.salt);assert.equal(JSON.stringify(visibleState((await f.home()).state,'kid')).includes(row.pin_hash),false);
 await f.DB.prepare('UPDATE sessions SET id=? WHERE id=?').bind('replacement-session','session').run();await assert.rejects(f.call('pin',{pin:'7777'},token),/Unlock/);
});
test('invalid and conflicting bonuses never alter coins or create a history entry; code guessing is bounded',async()=>{
 const f=await fixture(),token=await f.unlock('0000'),valid={id:'test-grant-0004',childId:'kid',amount:10,reason:'Kindness'};
 for(const patch of [{amount:-1},{amount:1.5},{amount:10001},{reason:''},{reason:'x'.repeat(241)},{childId:'parent'}])assert.throws(()=>validateKidsBonus({...valid,...patch},f.state.members));
 const stale=await f.home();await f.DB.prepare('UPDATE household_data SET revision=revision+1').run();await assert.rejects(f.call('grant',valid,token,stale),/household changed/);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM kids_bonus_grants').first()).n,0);assert.equal((await f.home()).state.profiles.kid.hero.bonusStars,0);
 for(let i=0;i<4;i++)await assert.rejects(f.unlock('9999'),/incorrect/);await assert.rejects(f.unlock('9999'),/Too many/);
});

test('an installation missing the parent migration receives a controlled update response',async()=>{
 const f=await fixture();await f.DB.prepare('DROP TABLE kids_bonus_grants').run();await assert.rejects(f.call('status'),error=>error.status===503&&error.message==='Update the household server before using the parent area.');
});
