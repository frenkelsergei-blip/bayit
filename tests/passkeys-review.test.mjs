// Fixes from the independent passkey security review (docs/audits/2026-11-10-passkey-security-review.md). Each test is
// one of the review's attacks that succeeded before the fix (A5, A6, A8, A9, A10, A1c, the webauthn-provider suspicion)
// and now must fail for the attacker. Both hosts: Node SQLite and Cloudflare's local D1. The Docker client-address fix
// (finding 2) is tested against the real Node server in tests/passkeys-host.test.mjs. Synthetic data only.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import * as H from './passkey-harness.mjs';
import {encryptKey,hash} from '../app/cloud/util.mjs';
import {ownAccountInvitation} from '../app/cloud/child-identity.mjs';
import {loadHousehold} from '../app/cloud/assistant.mjs';
import {signInProvider} from '../app/cloud/signin-methods.mjs';
import * as RECOVERY from '../app/cloud/passkey-recovery.mjs';
const RECOVERY_GUARD_MS=RECOVERY.RECOVERY_GUARD_MS??72*3600000;
const {ORIGIN,SETUP_CODE,RECOVERY_CODE}=H;
after(()=>H.closeMiniflare());

const KEY=Buffer.alloc(32,7).toString('base64');
const count=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).first()).n;
const linkOf=url=>new URLSearchParams(new URL(url).hash.split('?')[1]).get('invite');
const ownerId=async env=>(await env.DB.prepare('SELECT owner_user_id o FROM installation_setup').first()).o;
async function ownerHome(env){const o=await H.setupOwner(env);assert.equal(o.verify.status,200,o.verify.text);const id=await H.createHousehold(o.b);assert.ok(id);return {...o,householdId:id}}
async function editState(env,householdId,fn){const row=await env.DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind(householdId).first(),state=JSON.parse(row.state);fn(state);await env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=?').bind(JSON.stringify(state),householdId).run()}
const addKid=(env,householdId,id='kid-1')=>editState(env,householdId,s=>{s.members.push({id,name:'Noa',he:'נועה',role:'child',color:'green'});s.profiles[id]={name:'Noa',he:'נועה',xp:0}});
// A household Telegram bot (fake Bot API through OUTBOUND_FETCH) with chats for the given members; returns the sends.
async function telegram(env,householdId,memberIds){
 const sends=[],chats=new Map();
 env.OUTBOUND_FETCH=async(url,options)=>{const body=JSON.parse(options?.body||'{}');if(new URL(url).pathname.endsWith('/sendMessage'))sends.push({to:chats.get(String(body.chat_id)),text:body.text});return Response.json({ok:true,result:{message_id:1}})};
 await env.DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind(householdId,await encryptKey('123:fake-token-abcdefghijklmnopqrstuv',env,'telegram:'+householdId),'123','fake_bot','hook'+householdId.replace(/\W/g,'').slice(0,20),await hash('s'),'x',new Date().toISOString()).run();
 let n=1000;for(const m of memberIds){const chat=String(++n);chats.set(chat,m);await env.DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) VALUES(?,?,?,?,?,?)').bind(householdId,m,chat,String(n+5000),'chat '+m,new Date().toISOString()).run()}
 await editState(env,householdId,s=>{s.preferences.features={...s.preferences.features,telegram:true}});
 return sends;
}
// Owner Dana (parent), a second parent Gil and an adult Avi, all by passkey.
async function family(env){
 const o=await ownerHome(env);
 const gil=await H.joinWithPasskey(env,(await H.invite(o.b,{role:'parent'})).token,{name:'Gil'}),avi=await H.joinWithPasskey(env,(await H.invite(o.b,{role:'adult'})).token,{name:'Avi'});
 const ids=Object.fromEntries((await env.DB.prepare('SELECT m.member_id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.household_id=?').bind(o.householdId).all()).results.map(r=>[r.name,r.member_id]));
 return {o,gil,avi,ids};
}
const pastHold=env=>env.DB.prepare("UPDATE invitations SET usable_at=? WHERE purpose='recover'").bind(Date.now()-1).run();

for(const host of H.HOSTS){
 const t=(name,fn,extra={})=>test(host.name+': '+name,{skip:host.skip},async()=>fn(H.makeEnv(await host.database(),{APP_ENCRYPTION_KEY:KEY,...extra})));

 // ---- Finding 1 (A5): recovery must not reach another household ----
 t('F1 a parent cannot recover someone who also belongs to another household, at creation or at use',async env=>{
  const o=await ownerHome(env),bob=await H.googlePerson(env,'bob'),hb=await H.createHousehold(bob,'Bob home');assert.ok(hb);
  assert.equal((await bob.call('/api/family/join',{body:{token:(await H.invite(o.b)).token}})).status,200);
  const bobMember=(await env.DB.prepare('SELECT member_id FROM memberships WHERE household_id=? AND user_id=?').bind(o.householdId,'bob').first()).member_id;
  const made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:bobMember}});
  assert.equal(made.status,409,made.text);assert.equal(made.json.code,'OTHER_HOUSEHOLD');assert.equal(await count(env,"SELECT COUNT(*) n FROM invitations WHERE purpose='recover'"),0);
  // At use: Avi had only this household when the link was made, then joined another one during the hold.
  const avi=await H.joinWithPasskey(env,(await H.invite(o.b)).token,{name:'Avi'}),aviRow=await env.DB.prepare("SELECT user_id,member_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.name='Avi'").first();
  const link=await o.b.call('/api/family/invitations/recovery',{body:{memberId:aviRow.member_id}});assert.equal(link.status,201);
  await env.DB.prepare("INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,'parent',?)").bind(hb,aviRow.user_id,aviRow.user_id,new Date().toISOString()).run();
  await pastHold(env);
  const b=H.browser(env);assert.equal((await b.call('/api/passkeys/invitation',{body:{token:linkOf(link.json.url)}})).status,200);
  const options=await b.call('/api/passkeys/register/options',{body:{purpose:'recover'}});assert.equal(options.status,409);assert.equal(options.json.code,'OTHER_HOUSEHOLD');
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials WHERE user_id=?',aviRow.user_id),1);void avi;
 },{BAYIT_MAX_HOUSEHOLDS:'2',BAYIT_ALLOWED_EMAILS:'bob@example.test'});

 // ---- Finding 3 (A6) and 9 (A10): a used link is announced and cannot erase the real person's way back ----
 t('F3 after a recovery link is used: the person and the other parents are told; older passkeys and other sessions are protected for 72 hours',async env=>{
  const {o,avi,ids}=await family(env),sends=await telegram(env,o.householdId,Object.values(ids));
  const made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:ids.Avi}});assert.equal(made.status,201);sends.length=0;
  await pastHold(env);
  const rec=await H.joinWithPasskey(env,linkOf(made.json.url));assert.equal(rec.verify.status,200,rec.verify.text);
  // Told at use: Avi and Gil (the other parent); not Dana, who made it.
  assert.deepEqual([...new Set(sends.map(s=>s.to))].sort(),[ids.Avi,ids.Gil].sort());assert.ok(sends.every(s=>/used|נוצל|נעשה שימוש/.test(s.text)),JSON.stringify(sends));
  assert.equal(RECOVERY_GUARD_MS,72*3600000);
  const older=(await rec.b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.find(k=>k.createdAt<Date.now()-1||true);
  const list=(await rec.b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.sort((a,b)=>a.createdAt-b.createdAt);
  const del=await rec.b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list[0].id}});assert.equal(del.status,409,del.text);assert.equal(del.json.code,'RECOVERY_GUARD');
  // Sessions are not guarded (re-review R1); the kept passkey is what lets the real person back in (test G1).
  assert.equal((await avi.b.call('/api/session',{method:'GET'})).status,200,'the real person is still signed in');
  // The new passkey itself may be removed (the person can undo it), and after 72 hours the guard ends.
  assert.equal((await rec.b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list.at(-1).id}})).status,200);
  void older;
 });
 t('F3 after the 72 hours the person manages their passkeys and sessions as usual',async env=>{
  const {o,ids}=await family(env),made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:ids.Avi}});await pastHold(env);
  const rec=await H.joinWithPasskey(env,linkOf(made.json.url));assert.equal(rec.verify.status,200);
  await env.DB.prepare("UPDATE invitations SET used_at=? WHERE purpose='recover'").bind(Date.now()-RECOVERY_GUARD_MS-1000).run();
  await env.DB.prepare('UPDATE passkey_credentials SET created_at=created_at-?').bind(RECOVERY_GUARD_MS+1000).run();
  const list=(await rec.b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.sort((a,b)=>a.createdAt-b.createdAt);
  assert.equal((await rec.b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list[0].id}})).status,200);
 });
 // ---- Re-review R1: the session half of the guard is gone; the passkey half carries the protection ----
 t('G1 the link-user can sign the real person out, but the real person signs in again with the kept passkey and removes the intruder',async env=>{
  const {o,avi,ids}=await family(env),made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:ids.Avi}});await pastHold(env);
  const rec=await H.joinWithPasskey(env,linkOf(made.json.url));assert.equal(rec.verify.status,200);
  // Avi keeps using Bayit, so Auth.js rolls the session's expiry: its age can no longer be told from it.
  await avi.b.call('/api/session',{method:'GET'});
  const theirs=(await rec.b.call('/api/security/sessions',{method:'GET'})).json.sessions.filter(s=>!s.current);
  for(const s of theirs)assert.equal((await rec.b.call('/api/security/sessions',{method:'DELETE',body:{id:s.id}})).status,200);
  assert.equal((await avi.b.call('/api/session',{method:'GET'})).status,401);
  // The older passkey could not be removed, so Avi is back in at once and removes the intruder's passkey and session.
  const back=await H.signIn(env,avi.auth);assert.equal(back.verify.status,200);
  const keys=(await back.b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.sort((a,b)=>a.createdAt-b.createdAt);
  assert.equal(keys.length,2);assert.equal((await back.b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:keys[1].id}})).status,200);
  for(const s of (await back.b.call('/api/security/sessions',{method:'GET'})).json.sessions.filter(s=>!s.current))assert.equal((await back.b.call('/api/security/sessions',{method:'DELETE',body:{id:s.id}})).status,200);
  assert.equal((await rec.b.call('/api/session',{method:'GET'})).status,401,'the intruder is out');
 });
 t('G2 after losing a phone and recovering, the person signs out the lost phone at once; its passkey stays for 72 hours',async env=>{
  const {o,avi,ids}=await family(env),made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:ids.Avi}});await pastHold(env);
  const me=await H.joinWithPasskey(env,linkOf(made.json.url));assert.equal(me.verify.status,200); // Avi, on a new phone; avi.b is the lost phone
  const lost=(await me.b.call('/api/security/sessions',{method:'GET'})).json.sessions.filter(s=>!s.current);assert.ok(lost.length>=1);
  for(const s of lost)assert.equal((await me.b.call('/api/security/sessions',{method:'DELETE',body:{id:s.id}})).status,200);
  assert.equal((await avi.b.call('/api/session',{method:'GET'})).status,401,'the lost phone is signed out');
  const keys=(await me.b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.sort((a,b)=>a.createdAt-b.createdAt);
  const r=await me.b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:keys[0].id}});assert.equal(r.status,409);assert.equal(r.json.code,'RECOVERY_GUARD');
 });
 t('F9 an operator recovery is announced to that parent and the household’s other parents, and guarded the same way',async env=>{
  const {o,ids}=await family(env),sends=await telegram(env,o.householdId,Object.values(ids)),dana=await ownerId(env);
  const b=H.browser(env);assert.equal((await b.call('/api/passkeys/owner/code',{body:{code:RECOVERY_CODE}})).status,200);
  const k=await H.createAuthenticator(),opt=await b.call('/api/passkeys/register/options',{body:{purpose:'operator',userId:dana}});
  assert.equal((await b.call('/api/passkeys/register/verify',{body:{response:await k.create(opt.json.options,{origin:ORIGIN})}})).status,200);
  assert.deepEqual([...new Set(sends.map(s=>s.to))].sort(),[ids.Dana,ids.Gil].sort());
  const list=(await b.call('/api/passkeys/credentials',{method:'GET'})).json.passkeys.sort((x,y)=>x.createdAt-y.createdAt);
  assert.equal((await b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list[0].id}})).status,409);
 },{BAYIT_RECOVERY_CODE:RECOVERY_CODE});

 // ---- Finding 5: the 24-hour notice reaches the other parents, and the creator learns who was not reached ----
 t('F5 creating a recovery tells the other parents; every parent sees it pending; the creator learns the person was not reached',async env=>{
  const {o,gil,ids}=await family(env),sends=await telegram(env,o.householdId,[ids.Gil]);
  const made=await o.b.call('/api/family/invitations/recovery',{body:{memberId:ids.Avi}});assert.equal(made.status,201);
  assert.equal(made.json.reached,false,'Avi has no Push and no Telegram');assert.equal(made.json.parentsNotified,1);
  assert.deepEqual(sends.map(s=>s.to),[ids.Gil]);
  const seen=(await gil.b.call('/api/passkeys/recovery',{method:'GET'})).json;assert.equal(seen.household.length,1);assert.equal(seen.household[0].memberId,ids.Avi);assert.equal(seen.household[0].by,'Dana');
  // A parent cancels it from that list.
  assert.equal((await gil.b.call('/api/family/invitations/'+seen.household[0].id,{method:'DELETE'})).status,200);
  assert.equal((await o.b.call('/api/passkeys/recovery',{method:'GET'})).json.household.length,0);
 });

 // ---- Finding 4 (A9): a child who joins from their own chat keeps that chat as their way back ----
 t('F4 a child who joined from their own Telegram chat keeps the chat link and can use /account again',async env=>{
  const o=await ownerHome(env);await addKid(env,o.householdId);await telegram(env,o.householdId,[]);
  await env.DB.prepare('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) VALUES(?,?,?,?)').bind(o.householdId,'kid-1','tg-1',Date.now()).run();
  await env.DB.prepare("INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) VALUES(?,'kid-1','777','tg-1','Noa',?)").bind(o.householdId,new Date().toISOString()).run();
  const own=async()=>linkOf(await ownAccountInvitation(env,await loadHousehold(env,o.householdId),'kid-1','tg-1',ORIGIN));
  const kid=await H.joinWithPasskey(env,await own(),{name:''});assert.equal(kid.verify.status,200,kid.verify.text);
  const identity=await env.DB.prepare("SELECT user_id,telegram_user_id FROM member_identities WHERE member_id='kid-1'").first();
  assert.equal(identity.telegram_user_id,'tg-1');assert.ok(identity.user_id);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM telegram_links WHERE member_id='kid-1' AND chat_id='777'"),1);
  const again=await H.joinWithPasskey(env,await own(),{authenticator:await H.createAuthenticator()});assert.equal(again.verify.status,200,'a new passkey from the same chat');
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials WHERE user_id=?',identity.user_id),2);
  // A parent's ordinary child invitation still clears the chat, as before (the 0009 trigger is unchanged).
 });

 // ---- Finding 7 (A1c): rotating the code reopens setup and operator recovery after the daily cap ----
 t('F7 the daily failure caps follow the configured code, so a new code reopens setup and operator recovery',async env=>{
  for(let i=0;i<30;i++)await H.browser(env).call('/api/passkeys/setup/code',{body:{code:'WRONG-'+i},headers:{'CF-Connecting-IP':'10.0.0.'+i}});
  assert.equal((await H.browser(env).call('/api/passkeys/setup/code',{body:{code:SETUP_CODE},headers:{'CF-Connecting-IP':'10.9.9.9'}})).status,429);
  const NEW='M4QPZ-7WRTH-2KD9N-XC5BA';env.BAYIT_SETUP_CODE=NEW;
  assert.equal((await H.browser(env).call('/api/passkeys/setup/code',{body:{code:NEW},headers:{'CF-Connecting-IP':'10.9.9.8'}})).status,200);
  await ownerHome({...env,BAYIT_SETUP_CODE:NEW}).catch(()=>{});
  env.BAYIT_RECOVERY_CODE=RECOVERY_CODE;
  for(let i=0;i<30;i++)await H.browser(env).call('/api/passkeys/owner/code',{body:{code:'WRONG-'+i},headers:{'CF-Connecting-IP':'10.1.0.'+i}});
  const blocked=await H.browser(env).call('/api/passkeys/owner/code',{body:{code:RECOVERY_CODE},headers:{'CF-Connecting-IP':'10.1.9.9'}});
  assert.equal(blocked.status,429);assert.match(blocked.json.error,/new recovery code/);
  env.BAYIT_RECOVERY_CODE='Q7ZXW-K3MNB-8RTPV-2HJCD';
  assert.equal((await H.browser(env).call('/api/passkeys/owner/code',{body:{code:env.BAYIT_RECOVERY_CODE},headers:{'CF-Connecting-IP':'10.1.9.8'}})).status,200);
 });

 // ---- Finding 8 (A8): no recovery links while passkeys are off or cannot work ----
 for(const extra of [{BAYIT_PASSKEYS:'off'},{BAYIT_ORIGIN:'https://192.168.1.10'}])t('F8 recovery links answer 404 when passkeys are '+(extra.BAYIT_PASSKEYS?'off':'not possible at this address'),async env=>{
  const p=await H.googlePerson(env,'gparent');assert.ok(await H.createHousehold(p));
  const a=await H.googlePerson(env,'gadult');assert.equal((await a.call('/api/family/join',{body:{token:(await H.invite(p)).token}})).status,200);
  const m=(await env.DB.prepare("SELECT member_id FROM memberships WHERE user_id='gadult'").first()).member_id;
  const r=await p.call('/api/family/invitations/recovery',{body:{memberId:m}});assert.equal(r.status,404);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM invitations WHERE purpose='recover'"),0);
 },{...extra,BAYIT_ALLOWED_EMAILS:'gparent@example.test',GOOGLE_CLIENT_ID:'i',GOOGLE_CLIENT_SECRET:'s'});
}

// ---- Suspicion: an Auth.js passkey provider would bypass Bayit's ceremony and admission ----
test('an Auth.js provider of type webauthn is refused when the sign-in method is built',()=>{
 const method={id:'otherkey',label:{en:'x',he:'x'},start:'authjs',configured:()=>true,provider:()=>({id:'otherkey',type:'webauthn'}),verifiedAccount:()=>({}),recentIdentity:'sign-in-again'};
 assert.throws(()=>signInProvider(method,{}),/webauthn providers are not supported/);
});
