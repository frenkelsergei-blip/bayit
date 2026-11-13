// Passkey sign-in ("מפתח גישה"), docs/passkey-sign-in-design.md: every automatable item of the release checklist (§10)
// and a negative test for each threat (§9). Each test runs on both hosts: Node SQLite (Docker) and Cloudflare's local
// D1 (Miniflare). The authenticator is synthetic (tests/fixtures/soft-authenticator.mjs): real ES256 keys, real CBOR
// and real signatures, so @simplewebauthn/server verifies it as it would a phone. No real device, Face ID or WebKit.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import * as H from './passkey-harness.mjs';
import {steadyClock} from './fixtures/steady-clock.mjs';
import {authConfig,sessionFor} from '../app/cloud/auth.mjs';
import {SESSION_MAX_AGE_MS,sessionCookieName,normalizeCode,makeCode,codeDigest,CHALLENGE_MS} from '../app/cloud/passkeys.mjs';
import {signInChoices,WEBAUTHN_METHODS,webauthnMethodProblem,relyingParty,SIGNIN_METHODS} from '../app/cloud/signin-methods.mjs';
import {maintenance} from '../app/cloud/security.mjs';
import {RECOVERY_HOLD_MS} from '../app/cloud/passkey-recovery.mjs';
import {securitySchemaReady} from '../app/cloud/schema-ready.mjs';
import {ownAccountInvitation} from '../app/cloud/child-identity.mjs';
import {loadHousehold} from '../app/cloud/assistant.mjs';
import {hash as sha} from '../app/cloud/util.mjs';

const appRequire=createRequire(new URL('../app/package.json',import.meta.url));
const {defaultCookies}=await import(pathToFileURL(appRequire.resolve('@auth/core')).href.replace(/index\.js$/,'lib/utils/cookie.js'));
const {ORIGIN,RPID,SETUP_CODE,RECOVERY_CODE}=H;
after(()=>H.closeMiniflare());

// Every console line the server writes during a test, to prove no code, challenge or token is logged.
const logged=[];for(const k of ['log','warn','error','info']){const f=console[k];console[k]=(...a)=>{logged.push(a.map(String).join(' '));return f.apply(console,a)}}

// An owner who set up the installation, created the household and is signed in with a passkey.
async function ownerHome(env){const o=await H.setupOwner(env);assert.equal(o.verify.status,200,o.verify.text);const id=await H.createHousehold(o.b);assert.ok(id);return {...o,householdId:id}}
const count=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).first()).n;
// A managed child profile, written straight into the household (as the People screen would).
async function addKid(env,householdId,id='kid-1'){const row=await env.DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind(householdId).first(),state=JSON.parse(row.state);state.members.push({id,name:'Noa',he:'נועה',role:'child',color:'green'});state.profiles[id]={name:'Noa',he:'נועה',xp:0};await env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=?').bind(JSON.stringify(state),householdId).run()}

for(const host of H.HOSTS){
 const t=(name,fn)=>test(host.name+': '+name,{skip:host.skip},async()=>fn(H.makeEnv(await host.database())));
 const tEnv=(name,extra,fn)=>test(host.name+': '+name,{skip:host.skip},async()=>fn(H.makeEnv(await host.database(),extra)));
 // Tests that count requests in a rate-limit window run on a held clock (fixtures/steady-clock.mjs), so a window change
 // during the run cannot restart the count.
 const tClock=(name,fn)=>t(name,env=>steadyClock(()=>fn(env)));

 // ---- C1 / §5A: schema ----
 t('the passkey migration is required before the API runs (schema check)',async env=>{
  assert.equal(await securitySchemaReady(env),true);
  const cols=(await env.DB.prepare("SELECT name FROM pragma_table_info('invitations')").all()).results.map(r=>r.name);
  for(const c of ['purpose','target_user_id','usable_at'])assert.ok(cols.includes(c),c);
  // Only public keys, counters, flags and labels: no column for private keys, attestation or user data.
  const cred=(await env.DB.prepare("SELECT name FROM pragma_table_info('passkey_credentials')").all()).results.map(r=>r.name).sort();
  assert.deepEqual(cred,['backed_up','counter','created_at','device_type','id','last_used_at','name','public_key','rp_id','transports','user_id']);
  const bare=H.makeEnv(await host.database());await bare.DB.prepare("DELETE FROM d1_migrations WHERE name='0021_passkeys.sql'").run();
  assert.equal(await securitySchemaReady(bare),false);
  const config=await H.browser(bare).call('/api/config',{method:'GET'});assert.equal(config.json.installation.updateRequired,true);assert.equal(config.json.installation.requiredMigration,'0021_passkeys.sql');
 });

 // ---- §10.1: off means 404 everywhere; §10.3: the address decides ----
 tEnv('BAYIT_PASSKEYS=off: not offered and every passkey endpoint answers 404',{BAYIT_PASSKEYS:'off'},async env=>{
  const b=H.browser(env),config=await b.call('/api/config',{method:'GET'});
  assert.deepEqual(config.json.signIn.methods,[]);assert.equal(config.json.registration.setup,'none');assert.equal(config.json.passkeys.enabled,false);
  for(const path of ['setup/code','invitation','owner/code','register/options','register/verify','signin/options','signin/verify','confirm/options','confirm/verify','credentials','recovery','recovery/cancel'])
   for(const method of ['GET','POST'])assert.equal((await b.call('/api/passkeys/'+path,{method,body:method==='POST'?{}:undefined})).status,404,method+' '+path);
 });
 t('only an HTTPS name or http://localhost can do passkeys; IP addresses and plain-HTTP LAN names cannot',async()=>{
  const rp=o=>relyingParty({BAYIT_ORIGIN:o});
  assert.deepEqual(rp('https://family.example'),{origin:'https://family.example',rpID:'family.example',secure:true});
  assert.deepEqual(rp('https://myfamily.pages.dev'),{origin:'https://myfamily.pages.dev',rpID:'myfamily.pages.dev',secure:true});
  assert.deepEqual(rp('http://localhost:8080'),{origin:'http://localhost:8080',rpID:'localhost',secure:false});
  for(const o of ['http://192.168.1.10:8080','https://192.168.1.10','https://[::1]','http://127.0.0.1:8080','http://nas.local','https://family.example/bayit','https://u:p@family.example','',undefined,'not a url'])assert.equal(rp(o),null,String(o));
  const choices=env=>signInChoices({DB:{},AUTH_SECRET:'x',...env}).map(m=>m.id);
  assert.deepEqual(choices({BAYIT_ORIGIN:'https://family.example'}),['passkey']);
  assert.deepEqual(choices({BAYIT_ORIGIN:'http://192.168.1.10'}),[]);
  assert.deepEqual(choices({BAYIT_ORIGIN:'https://family.example',BAYIT_PASSKEYS:'off'}),[]);
  assert.deepEqual(choices({BAYIT_ORIGIN:'https://family.example',GOOGLE_CLIENT_ID:'i',GOOGLE_CLIENT_SECRET:'s'}),['passkey','google']);
 });
 t('the passkey method is a core-only ceremony method and never an Auth.js provider (C2)',async env=>{
  assert.deepEqual(WEBAUTHN_METHODS.map(m=>m.id),['passkey']);assert.equal(webauthnMethodProblem(WEBAUTHN_METHODS[0]),'');
  assert.ok(!SIGNIN_METHODS.some(m=>m.id==='passkey'));
  assert.match(webauthnMethodProblem({...WEBAUTHN_METHODS[0],provider:()=>({})}),/may not carry provider/);
  assert.match(webauthnMethodProblem({...WEBAUTHN_METHODS[0],recentIdentity:'sign-in-again'}),/recentIdentity 'assertion'/);
  // Auth.js works with no provider at all (a passkey-only installation): it still reads and signs out sessions.
  assert.deepEqual(authConfig(env,new Request(ORIGIN+'/api/auth/session')).providers,[]);
 });

 // ---- §10.7 / C6: setup code ----
 tClock('setup: the code is compared by digest, wrong codes count down, the right one makes the owner and then dies',async env=>{
  assert.equal(normalizeCode('k7q2m 9xrta-4hn6p wc3zd'),normalizeCode(SETUP_CODE));assert.equal(normalizeCode('O0-IL'),'0011');
  assert.match(makeCode(),/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  const b=H.browser(env),wrong=await b.call('/api/passkeys/setup/code',{body:{code:'AAAAA-AAAAA-AAAAA-AAAAA'}});
  assert.equal(wrong.status,403);assert.equal(wrong.json.code,'WRONG_CODE');assert.equal(wrong.json.triesLeft,4);assert.equal(b.jar.size,0,'no permit for a wrong code');
  const o=await H.setupOwner(env,{code:'k7q2m9xrta4hn6pwc3zd'});assert.equal(o.verify.status,200,o.verify.text);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM installation_setup'),1);
  const row=await env.DB.prepare('SELECT * FROM installation_setup').first();assert.equal(row.rp_id,RPID);assert.equal(row.origin,ORIGIN);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM used_codes WHERE purpose='setup' AND code_hash=?",await codeDigest(SETUP_CODE)),1);
  const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.owner_user_id).first();assert.equal(user.name,'Dana');assert.equal(user.email,null);
  // Dead afterwards, although the secret is still configured; the config stops offering it.
  const again=await H.browser(env).call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}});assert.equal(again.status,410);assert.equal(again.json.code,'SETUP_CLOSED');
  assert.equal((await H.browser(env).call('/api/config',{method:'GET'})).json.registration.setup,'none');
  // The owner (no email, no allowlist) may create the household; nobody else may.
  assert.ok(await H.createHousehold(o.b));
 });
 t('setup: a permit from before setup closed cannot finish a second setup',async env=>{
  const late=H.browser(env);assert.equal((await late.call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}})).status,200);
  await ownerHome(env);
  assert.equal((await late.call('/api/passkeys/register/options',{body:{purpose:'setup',name:'Mallory'}})).status,410);
 });
 t('setup: two simultaneous setups give exactly one owner',async env=>{
  const people=await Promise.all([0,1].map(async i=>{const b=H.browser(env),auth=await H.createAuthenticator();await b.call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}});const o=await b.call('/api/passkeys/register/options',{body:{purpose:'setup',name:'P'+i}});return {b,response:await auth.create(o.json.options,{origin:ORIGIN})}}));
  const results=await Promise.all(people.map(p=>p.b.call('/api/passkeys/register/verify',{body:{response:p.response}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM installation_setup'),1);assert.equal(await count(env,'SELECT COUNT(*) n FROM users'),1);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials'),1);assert.equal(await count(env,'SELECT COUNT(*) n FROM sessions'),1);
  assert.equal(results.filter(r=>H.sessionCookieOf({jar:new Map(r.setCookies.filter(c=>c.includes('authjs.session-token=')&&!c.includes('Max-Age=0')).map(c=>[c.split('=')[0],1]))})).length,1,'only the winner gets a session cookie');
 });
 tClock('setup: 5 tries per address per 15 minutes, then refused even with the right code',async env=>{
  const b=H.browser(env);for(let i=0;i<5;i++)assert.equal((await b.call('/api/passkeys/setup/code',{body:{code:'WRONG-'+i}})).status,403);
  const blocked=await b.call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}});assert.equal(blocked.status,429);assert.match(blocked.json.error,/still safe/);
 });
 tClock('setup: 30 failed codes in a day close setup for the day, whatever the address',async env=>{
  for(let i=0;i<30;i++)await H.browser(env).call('/api/passkeys/setup/code',{body:{code:'WRONG'},headers:{'CF-Connecting-IP':'198.51.100.'+i}});
  assert.equal((await H.browser(env).call('/api/passkeys/setup/code',{body:{code:SETUP_CODE},headers:{'CF-Connecting-IP':'203.0.113.9'}})).status,429);
 });
 tEnv('setup: without a configured code there is no setup path, and weak codes are not trusted',{BAYIT_SETUP_CODE:'short'},async env=>{
  assert.equal((await H.browser(env).call('/api/config',{method:'GET'})).json.registration.setup,'none');
  assert.equal((await H.browser(env).call('/api/passkeys/setup/code',{body:{code:'short'}})).status,403);
 });

 // ---- §10.2–10.4, T6/T7: origin, RP ID, user verification, attestation ----
 t('options require user verification, discoverable credentials, no attestation and the configured RP ID',async env=>{
  const b=H.browser(env);await b.call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}});
  const {options}=(await b.call('/api/passkeys/register/options',{body:{purpose:'setup',name:'Dana'}})).json;
  assert.equal(options.rp.id,RPID);assert.equal(options.attestation,'none');assert.equal(options.authenticatorSelection.userVerification,'required');assert.equal(options.authenticatorSelection.residentKey,'required');
  assert.deepEqual(options.pubKeyCredParams.map(p=>p.alg),[-8,-7,-257]);
  assert.equal(H.createAuthenticator.length>=0,true);assert.equal(Buffer.from(options.user.id,'base64url').length,32,'a random 32-byte user handle, not the user id');
  const signin=(await b.call('/api/passkeys/signin/options',{body:{}})).json.options;assert.equal(signin.rpId,RPID);assert.equal(signin.userVerification,'required');assert.equal(signin.allowCredentials?.length||0,0);
 });
 t('a preview or other origin is refused: the request Origin, the page origin in the ceremony, and the RP ID',async env=>{
  const {auth}=await ownerHome(env);
  // Request Origin header from a preview host.
  assert.equal((await H.browser(env).call('/api/passkeys/signin/options',{body:{},sendOrigin:'https://abc123.family.example'})).status,403);
  assert.equal((await H.browser(env).call('/api/passkeys/signin/options',{body:{},sendOrigin:null})).status,403);
  // A request served on another host (the URL itself) with a matching Origin header.
  const preview=H.browser(env,{origin:'https://abc123.family.example'});assert.equal((await preview.call('/api/passkeys/signin/options',{body:{}})).status,403);
  // The ceremony's own origin and RP ID.
  for(const overrides of [{origin:'https://abc123.family.example'},{origin:'http://family.example'},{rpId:'abc123.family.example'},{rpId:'evil.example'},{uv:false},{type:'webauthn.create'}]){
   const b=H.browser(env),o=await b.call('/api/passkeys/signin/options',{body:{}});
   const r=await b.call('/api/passkeys/signin/verify',{body:{response:await auth.get(o.json.options,{origin:ORIGIN,...overrides})}});
   assert.equal(r.status,401,JSON.stringify(overrides));assert.ok(!H.sessionCookieOf(b));
  }
 });
 t('registration is refused without user verification, from another origin or for another RP ID',async env=>{
  for(const overrides of [{uv:false},{origin:'https://abc123.family.example'},{rpId:'evil.example'},{type:'webauthn.get'}]){
   const b=H.browser(env),auth=await H.createAuthenticator();await b.call('/api/passkeys/setup/code',{body:{code:SETUP_CODE}});
   const o=await b.call('/api/passkeys/register/options',{body:{purpose:'setup',name:'Dana'}});
   const r=await b.call('/api/passkeys/register/verify',{body:{response:await auth.create(o.json.options,{origin:ORIGIN,...overrides})}});
   assert.equal(r.status,400,JSON.stringify(overrides));
  }
  assert.equal(await count(env,'SELECT COUNT(*) n FROM installation_setup'),0);assert.equal(await count(env,'SELECT COUNT(*) n FROM users'),0);
 });

 // ---- §10.5, T8: challenges ----
 t('a challenge works once, even when two verifies race, and expires after 5 minutes',async env=>{
  const {auth}=await ownerHome(env);
  // Replay: the same signed answer twice.
  const b=H.browser(env),o=await b.call('/api/passkeys/signin/options',{body:{}}),answer=await auth.get(o.json.options,{origin:ORIGIN});
  const ceremony=b.jar.get('bayit-passkey-ceremony').value;
  assert.equal((await b.call('/api/passkeys/signin/verify',{body:{response:answer}})).status,200);
  b.jar.set('bayit-passkey-ceremony',{value:ceremony,attrs:{}});
  assert.equal((await b.call('/api/passkeys/signin/verify',{body:{response:answer}})).status,400);
  // Race: two browsers holding the same challenge cookie at once.
  const c=H.browser(env),co=await c.call('/api/passkeys/signin/options',{body:{}}),signed=await auth.get(co.json.options,{origin:ORIGIN}),twin=H.browser(env);twin.jar.set('bayit-passkey-ceremony',c.jar.get('bayit-passkey-ceremony'));
  const raced=await Promise.all([c,twin].map(x=>x.call('/api/passkeys/signin/verify',{body:{response:signed}})));
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,400]);
  // Expired.
  const e=H.browser(env),eo=await e.call('/api/passkeys/signin/options',{body:{}});await env.DB.prepare('UPDATE webauthn_challenges SET expires_at=?').bind(Date.now()-1).run();
  assert.equal((await e.call('/api/passkeys/signin/verify',{body:{response:await auth.get(eo.json.options,{origin:ORIGIN})}})).status,400);
  assert.equal(CHALLENGE_MS,300000);
  // Bound to purpose: a sign-in challenge cannot confirm, and a challenge from another ceremony cannot sign in.
  const p=H.browser(env),po=await p.call('/api/passkeys/signin/options',{body:{}});
  const {b:owner}=await H.signIn(env,auth);owner.jar.set('bayit-passkey-ceremony',p.jar.get('bayit-passkey-ceremony'));
  assert.equal((await owner.call('/api/passkeys/confirm/verify',{body:{response:await auth.get(po.json.options,{origin:ORIGIN})}})).status,400);
  // Maintenance removes what is left.
  await env.DB.prepare('UPDATE webauthn_challenges SET expires_at=?').bind(Date.now()-1).run();await maintenance(env);assert.equal(await count(env,'SELECT COUNT(*) n FROM webauthn_challenges'),0);
 });
 t('a challenge is bound to the cookie that asked for it: an answer to someone else’s challenge fails',async env=>{
  const {auth}=await ownerHome(env);
  const victim=H.browser(env),vo=await victim.call('/api/passkeys/signin/options',{body:{}});
  const attacker=H.browser(env);await attacker.call('/api/passkeys/signin/options',{body:{}});
  assert.equal((await attacker.call('/api/passkeys/signin/verify',{body:{response:await auth.get(vo.json.options,{origin:ORIGIN})}})).status,401);
 });

 // ---- §10.6, T9: counters ----
 t('counter: synced passkeys at 0 keep working; a device counter that does not grow is refused and audited',async env=>{
  const {auth}=await ownerHome(env);
  for(let i=0;i<2;i++)assert.equal((await H.signIn(env,auth,{overrides:{counter:0}})).verify.status,200);
  assert.equal((await H.signIn(env,auth,{overrides:{counter:5}})).verify.status,200);
  const copied=await H.signIn(env,auth,{overrides:{counter:5}});assert.equal(copied.verify.status,401);assert.equal(copied.verify.json.code,'PASSKEY_COUNTER');
  assert.equal((await H.signIn(env,auth,{overrides:{counter:3}})).verify.status,401);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='passkey:counter' AND result='refused'"),2);
  assert.equal((await H.signIn(env,auth,{overrides:{counter:6}})).verify.status,200);
 });

 // ---- §10.10, T12: sessions exactly like Auth.js ----
 t('a passkey session is an Auth.js database session: same cookie, read, listed, revoked, expired and signed out the same way',async env=>{
  const {b,auth}=await ownerHome(env);
  // Cookie name and attributes equal Auth.js's own defaults on HTTPS.
  const ours=b.jar.get('__Secure-authjs.session-token'),theirs=defaultCookies(true).sessionToken;
  assert.equal(theirs.name,sessionCookieName(true));assert.equal(defaultCookies(false).sessionToken.name,sessionCookieName(false));
  assert.equal(ours.attrs.path,theirs.options.path);assert.equal(ours.attrs.samesite.toLowerCase(),theirs.options.sameSite);assert.equal(!!ours.attrs.httponly,theirs.options.httpOnly);assert.equal(!!ours.attrs.secure,theirs.options.secure);
  // 14 days, the same maxAge Auth.js is configured with.
  assert.equal(authConfig(env,new Request(ORIGIN+'/api/auth/session')).session.maxAge*1000,SESSION_MAX_AGE_MS);
  const row=await env.DB.prepare('SELECT * FROM sessions WHERE sessionToken=?').bind(ours.value).first();
  assert.ok(Math.abs(new Date(row.expires).getTime()-(Date.now()+SESSION_MAX_AGE_MS))<60000);assert.ok(Math.abs(new Date(ours.attrs.expires).getTime()-new Date(row.expires).getTime())<1000);
  // Auth.js's own /api/auth/session reads it.
  const authSession=await b.call('/api/auth/session',{method:'GET'});assert.equal(authSession.status,200);assert.equal(authSession.json.user.name,'Dana');
  assert.equal((await sessionFor(new Request(ORIGIN+'/api/session',{headers:{Cookie:b.cookieHeader()}}),env)).user.id,row.userId);
  // Listed and revoked by Account security like any session.
  const second=(await H.signIn(env,auth)).b,list=(await b.call('/api/security/sessions',{method:'GET'})).json;
  assert.equal(list.sessions.length,2);assert.deepEqual(list.methods,['passkey']);const other=list.sessions.find(s=>!s.current);
  assert.equal((await b.call('/api/security/sessions',{method:'DELETE',body:{id:other.id}})).status,200);
  assert.equal((await second.call('/api/session',{method:'GET'})).status,401);
  // Auth.js sign-out (CSRF form post) deletes it.
  const csrf=await b.call('/api/auth/csrf',{method:'GET'});
  const out=await b.call('/api/auth/signout',{body:'csrfToken='+encodeURIComponent(csrf.json.csrfToken)+'&callbackUrl='+encodeURIComponent(ORIGIN),raw:true,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  assert.ok([200,302].includes(out.status),out.text);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM sessions WHERE sessionToken=?',ours.value),0);
  // Expiry: an expired passkey session is refused and deleted on read, as Auth.js does for Google.
  const third=(await H.signIn(env,auth)).b,token=H.sessionCookieOf(third).value;
  await env.DB.prepare('UPDATE sessions SET expires=? WHERE sessionToken=?').bind(new Date(Date.now()-1000).toISOString(),token).run();
  assert.equal((await third.call('/api/session',{method:'GET'})).status,401);assert.equal(await count(env,'SELECT COUNT(*) n FROM sessions WHERE sessionToken=?',token),0);
 });
 tEnv('on http://localhost the session cookie is the plain Auth.js name, without Secure',{BAYIT_ORIGIN:'http://localhost:8080'},async env=>{
  const o=await H.setupOwner(env);assert.equal(o.verify.status,200,o.verify.text);
  const c=o.b.jar.get('authjs.session-token');assert.ok(c);assert.ok(!c.attrs.secure);assert.equal(c.attrs.samesite,'Lax');assert.equal(c.attrs.path,'/');
  assert.equal(o.b.jar.has('__Secure-authjs.session-token'),false);
  assert.equal((await o.b.call('/api/auth/session',{method:'GET'})).json.user.name,'Dana');
 });
 t('a fresh passkey sign-in counts as recent exactly like a fresh Google sign-in (the session trigger, unchanged)',async env=>{
  const {auth}=await ownerHome(env),{b}=await H.signIn(env,auth);
  assert.equal((await b.call('/api/security/sessions',{method:'GET'})).json.recent,true);
  await env.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
  assert.equal((await b.call('/api/security/sessions',{method:'GET'})).json.recent,false);
 });

 // ---- §10.11, C9: confirm it's you ----
 t('confirm by assertion freshens only this session, only with this person’s own passkey',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),guest=await H.joinWithPasskey(env,token);assert.equal(guest.verify.status,200);
  const a=(await H.signIn(env,owner.auth)).b,other=(await H.signIn(env,owner.auth)).b;
  await env.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
  // Another person's passkey (Avi's) cannot confirm Dana's session.
  const o=await a.call('/api/passkeys/confirm/options',{body:{}});assert.equal(o.json.options.allowCredentials.length,1);
  const wrong=await a.call('/api/passkeys/confirm/verify',{body:{response:await guest.auth.get({...o.json.options,rpId:RPID},{origin:ORIGIN})}});assert.equal(wrong.status,401);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM session_auth WHERE authenticated_at>0'),0);
  const ok=await H.confirm(env,a,owner.auth);assert.equal(ok.verify.status,200);
  assert.equal((await a.call('/api/security/sessions',{method:'GET'})).json.recent,true);
  assert.equal((await other.call('/api/security/sessions',{method:'GET'})).json.recent,false,'only the confirming session');
  // A confirm challenge from another session of the same person cannot be used here.
  const so=await other.call('/api/passkeys/confirm/options',{body:{}});a.jar.set('bayit-passkey-ceremony',other.jar.get('bayit-passkey-ceremony'));
  assert.equal((await a.call('/api/passkeys/confirm/verify',{body:{response:await owner.auth.get(so.json.options,{origin:ORIGIN})}})).status,403);
  // The method-neutral message (C10).
  await env.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
  const refused=await a.call('/api/family/invitations',{body:{role:'adult'}});assert.equal(refused.status,403);assert.equal(refused.json.code,'REAUTH_REQUIRED');assert.doesNotMatch(refused.json.error,/Google/);
 });

 // ---- §10.9, C7: join by invitation ----
 t('join with a passkey: role from the invitation, name typed, one use only; the household sees the new person',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b,{role:'adult'});
  const j=await H.joinWithPasskey(env,token,{name:'Avi Levi'});assert.equal(j.opened.json.household,'The Levi family');assert.equal(j.opened.json.role,'adult');assert.equal(j.verify.status,200);
  const s=(await j.b.call('/api/session',{method:'GET'})).json;assert.equal(s.user.name,'Avi Levi');assert.equal(s.memberships[0].role,'adult');assert.ok(!s.user.email);
  const state=(await owner.b.call('/api/households/'+owner.householdId+'/state',{method:'GET'})).json.data;assert.ok(state.members.some(m=>m.name==='Avi Levi'));
  // Invitation reuse, by passkey and by Google.
  assert.equal((await H.browser(env).call('/api/passkeys/invitation',{body:{token}})).status,410);
  const g=await H.googlePerson(env,'gina');assert.equal((await g.call('/api/family/join',{body:{token}})).status,410);
  // A permit for a used invitation cannot make options either.
  assert.equal((await j.b.call('/api/passkeys/register/options',{body:{purpose:'invite',name:'Again'}})).status,403);
 });
 t('two people racing one invitation: exactly one joins',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b);
  const people=await Promise.all([0,1].map(async i=>{const b=H.browser(env),auth=await H.createAuthenticator();await b.call('/api/passkeys/invitation',{body:{token}});const o=await b.call('/api/passkeys/register/options',{body:{purpose:'invite',name:'P'+i}});return {b,response:await auth.create(o.json.options,{origin:ORIGIN})}}));
  const r=await Promise.all(people.map(p=>p.b.call('/api/passkeys/register/verify',{body:{response:p.response}})));
  assert.deepEqual(r.map(x=>x.status).sort(),[200,410]);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM memberships WHERE household_id=?',owner.householdId),2);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM users'),2,'the loser left no user row');assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials'),2);
 });
 t('Google and passkey joins run the one join function; worker.mjs keeps no second copy',async env=>{
  const source=readFileSync(new URL('../app/cloud/worker.mjs',import.meta.url),'utf8');
  assert.match(source,/joinHousehold\(env,user,tokenHash\)/);assert.doesNotMatch(source,/INSERT OR IGNORE INTO memberships/);
  assert.match(readFileSync(new URL('../app/cloud/passkeys.mjs',import.meta.url),'utf8'),/await joinHousehold\(env,/);
  // Google join keeps its behaviour: join, rejoin answers the same household, used link refused.
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),g=await H.googlePerson(env,'gina');
  assert.equal((await g.call('/api/family/join',{body:{token}})).json.id,owner.householdId);
  assert.equal((await g.call('/api/family/join',{body:{token}})).json.id,owner.householdId);
  assert.equal((await (await H.googlePerson(env,'other')).call('/api/family/join',{body:{token}})).status,410);
 });
 t('children: a parent cannot invite a profile with private data; the child’s own verified link joins by passkey; a second identity is refused',async env=>{
  const owner=await ownerHome(env);await addKid(env,owner.householdId);
  // Every child profile owns a private shopping list, so the parent's invitation is refused (the same rule as Google).
  assert.equal((await H.invite(owner.b,{role:'child',memberId:'kid-1'})).status,403);
  // The child's own link from their private Telegram chat (/account) is proof of the child.
  await env.DB.prepare('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) VALUES(?,?,?,?)').bind(owner.householdId,'kid-1','tg-123',Date.now()).run();
  const own=async()=>new URLSearchParams(new URL(await ownAccountInvitation(env,await loadHousehold(env,owner.householdId),'kid-1','tg-123',ORIGIN)).hash.split('?')[1]).get('invite');
  const opened=await H.browser(env).call('/api/passkeys/invitation',{body:{token:await own()}});assert.equal(opened.json.memberName,'נועה');assert.equal(opened.json.role,'child');
  const kid=await H.joinWithPasskey(env,await own(),{name:''});assert.equal(kid.verify.status,200,kid.verify.text);
  const s=(await kid.b.call('/api/session',{method:'GET'})).json;assert.equal(s.memberships[0].role,'child');assert.equal(s.memberships[0].actorId,'kid-1');
  // Another passkey person cannot take the same child profile (authorizeChildJoin, before the batch).
  await env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,identity_verified) VALUES(?,?,'child','x',?,'kid-1',1)").bind(await sha('second'),owner.householdId,Date.now()+60000).run();
  const intruder=await H.joinWithPasskey(env,'second',{name:'Mallory'});assert.equal(intruder.verify.status,403);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM memberships WHERE member_id=?','kid-1'),1);assert.equal(await count(env,'SELECT COUNT(*) n FROM users'),2);
 });
 t('cross-household: a passkey member of one household cannot read or change another',async env=>{
  const a=await ownerHome(env);
  // A second household on the same installation, created directly (the limit is 1 by default).
  await env.DB.batch([env.DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('other','Other','x','2026-11-10')"),env.DB.prepare("INSERT INTO household_data(household_id,state,revision) VALUES('other','{\"members\":[]}',0)")]);
  for(const [path,method] of [['/api/households/other/state','GET'],['/api/households/other/changes','POST']])assert.equal((await a.b.call(path,{method,body:method==='POST'?{baseRevision:0,changes:[]}:undefined})).status,403);
  assert.equal((await a.b.call('/api/family/invitations',{body:{role:'parent',householdId:'other'}})).status,403);
  assert.equal((await a.b.call('/api/family/invitations/recovery',{body:{memberId:'x'},headers:{'X-Bayit-Household':'other'}})).status,403);
 });

 // ---- §10.14, decision 3: open registration never admits a passkey ----
 tEnv('open registration: no passkey without a permit, and a credential without membership does not sign in',{BAYIT_REGISTRATION_MODE:'open'},async env=>{
  for(const purpose of ['setup','invite','recover','operator','add'])assert.ok([401,403].includes((await H.browser(env).call('/api/passkeys/register/options',{body:{purpose,name:'Stranger'}})).status),purpose);
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),j=await H.joinWithPasskey(env,token);
  // Removed by a parent: the passkey no longer signs in (Google refuses a removed member's email the same way).
  const member=(await env.DB.prepare('SELECT member_id FROM memberships WHERE user_id<>? LIMIT 1').bind((await env.DB.prepare('SELECT owner_user_id FROM installation_setup').first()).owner_user_id).first()).member_id;
  assert.equal((await owner.b.call('/api/family/members/'+member,{method:'DELETE'})).status,200);
  const r=await H.signIn(env,j.auth);assert.equal(r.verify.status,401);assert.ok(!H.sessionCookieOf(r.b));
 });

 // ---- §10.8, C8, T5: recovery ----
 t('recovery: 24-hour hold, notice, cancel, then the person adds a passkey to the same account',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),j=await H.joinWithPasskey(env,token,{name:'Avi'});
  const avi=(await env.DB.prepare('SELECT user_id,member_id FROM memberships WHERE household_id=? AND user_id<>?').bind(owner.householdId,(await env.DB.prepare('SELECT owner_user_id o FROM installation_setup').first()).o).first());
  const made=await owner.b.call('/api/family/invitations/recovery',{body:{memberId:avi.member_id}});assert.equal(made.status,201,made.text);
  const usable=new Date(made.json.usableAt).getTime();assert.ok(usable>=Date.now()+RECOVERY_HOLD_MS-60000);assert.equal(RECOVERY_HOLD_MS,86400000);
  const link=new URLSearchParams(new URL(made.json.url).hash.split('?')[1]).get('invite');
  // Before the hold ends the link does nothing, by passkey or by Google.
  const early=await H.browser(env).call('/api/passkeys/invitation',{body:{token:link}});assert.equal(early.status,409);assert.equal(early.json.code,'RECOVERY_NOT_YET');
  assert.equal((await (await H.googlePerson(env,'mallory')).call('/api/family/join',{body:{token:link}})).status,410,'a recovery link never joins anyone');
  assert.equal((await H.browser(env).call('/api/registration/invitation',{body:{token:link}})).status,410,'nor admits a Google sign-in');
  // A second link while one waits is refused; the parent sees the pending one with its time.
  assert.equal((await owner.b.call('/api/family/invitations/recovery',{body:{memberId:avi.member_id}})).status,409);
  const listed=(await owner.b.call('/api/family/invitations',{method:'GET'})).json.invitations.find(i=>i.purpose==='recover');assert.ok(listed.usableAt);
  // The person sees the notice and cancels it.
  const notices=(await j.b.call('/api/passkeys/recovery',{method:'GET'})).json.requests;assert.equal(notices.length,1);assert.equal(notices[0].by,'Dana');
  assert.equal((await j.b.call('/api/passkeys/recovery/cancel',{body:{id:notices[0].id}})).status,200);
  await env.DB.prepare("UPDATE invitations SET usable_at=? WHERE purpose='recover'").bind(Date.now()-1).run();
  assert.equal((await H.browser(env).call('/api/passkeys/invitation',{body:{token:link}})).status,410,'cancelled');
  // A new link, after the hold: the new passkey belongs to Avi's existing account; the old one is kept.
  const again=await owner.b.call('/api/family/invitations/recovery',{body:{memberId:avi.member_id}}),link2=new URLSearchParams(new URL(again.json.url).hash.split('?')[1]).get('invite');
  await env.DB.prepare("UPDATE invitations SET usable_at=? WHERE purpose='recover'").bind(Date.now()-1).run();
  const phone=await H.createAuthenticator(),rec=await H.joinWithPasskey(env,link2,{authenticator:phone});assert.equal(rec.opened.json.purpose,'recover');assert.equal(rec.verify.status,200,rec.verify.text);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials WHERE user_id=?',avi.user_id),2);
  assert.equal((await rec.b.call('/api/session',{method:'GET'})).json.user.id,avi.user_id);
  assert.equal((await H.browser(env).call('/api/passkeys/invitation',{body:{token:link2}})).status,410,'single use');
  // Audited: created twice, cancelled once, used once.
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='recovery'"),2);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='recovery-cancelled'"),1);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='passkey:recover'"),1);
 });
 t('recovery: only a parent, never for oneself, never for a child with private data; the child uses their own chat',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b,{role:'adult'}),adult=await H.joinWithPasskey(env,token);
  const self=(await env.DB.prepare('SELECT member_id FROM memberships WHERE user_id=(SELECT owner_user_id FROM installation_setup)').first()).member_id;
  assert.equal((await owner.b.call('/api/family/invitations/recovery',{body:{memberId:self}})).status,409);
  assert.equal((await adult.b.call('/api/family/invitations/recovery',{body:{memberId:self}})).status,403,'an adult cannot');
  assert.equal((await owner.b.call('/api/family/invitations/recovery',{body:{memberId:'nobody'}})).status,404);
  // A child with a linked account and private data: the parent is refused.
  await addKid(env,owner.householdId);
  await env.DB.prepare('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) VALUES(?,?,?,?)').bind(owner.householdId,'kid-1','tg-123',Date.now()).run();
  const own=async()=>new URLSearchParams(new URL(await ownAccountInvitation(env,await loadHousehold(env,owner.householdId),'kid-1','tg-123',ORIGIN)).hash.split('?')[1]).get('invite');
  const kid=await H.joinWithPasskey(env,await own(),{name:''});assert.equal(kid.verify.status,200);
  assert.equal((await owner.b.call('/api/family/invitations/recovery',{body:{memberId:'kid-1'}})).status,403);
  // Joining from the child's own chat keeps that chat as the child's way back (review finding 4): no re-linking needed.
  assert.equal((await env.DB.prepare("SELECT telegram_user_id t FROM member_identities WHERE member_id='kid-1'").first()).t,'tg-123');
  // The child's own chat, already linked: a link for the same account, usable at once, adds a second passkey.
  const tablet=await H.createAuthenticator(),again=await H.joinWithPasskey(env,await own(),{authenticator:tablet});
  assert.equal(again.opened.json.purpose,'recover');assert.equal(again.verify.status,200,again.verify.text);
  const kidUser=(await env.DB.prepare("SELECT user_id FROM memberships WHERE member_id='kid-1'").first()).user_id;
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials WHERE user_id=?',kidUser),2);
  // With passkeys off the linked child keeps today's answer.
  await assert.rejects(ownAccountInvitation({...env,BAYIT_PASSKEYS:'off'},await loadHousehold(env,owner.householdId),'kid-1','tg-123',ORIGIN),/already linked/);
 });
 t('a parent’s recovery link for a child is refused at use when the child has private data',async env=>{
  const owner=await ownerHome(env);await addKid(env,owner.householdId);
  await env.DB.prepare('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) VALUES(?,?,?,?)').bind(owner.householdId,'kid-1','tg-123',Date.now()).run();
  const link=new URLSearchParams(new URL(await ownAccountInvitation(env,await loadHousehold(env,owner.householdId),'kid-1','tg-123',ORIGIN)).hash.split('?')[1]).get('invite');
  await H.joinWithPasskey(env,link,{name:''});
  // A link made by a parent (not identity-verified), as if created before the data existed; past its hold.
  const kidUser=(await env.DB.prepare("SELECT user_id FROM memberships WHERE member_id='kid-1'").first()).user_id;
  await env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,purpose,target_user_id,usable_at) VALUES(?,?,'child','p',?,'kid-1','recover',?,?)").bind(await sha('parent-link'),owner.householdId,Date.now()+60000,kidUser,Date.now()-1).run();
  const b=H.browser(env);assert.equal((await b.call('/api/passkeys/invitation',{body:{token:'parent-link'}})).status,200);
  assert.equal((await b.call('/api/passkeys/register/options',{body:{purpose:'recover'}})).status,403);
 });
 tEnv('operator recovery: the owner’s code adds a passkey to a parent account, once',{BAYIT_RECOVERY_CODE:RECOVERY_CODE},async env=>{
  const owner=await ownerHome(env),ownerId=(await env.DB.prepare('SELECT owner_user_id o FROM installation_setup').first()).o;
  assert.equal((await H.browser(env).call('/api/passkeys/owner/code',{body:{code:'WRONG'}})).status,403);
  const b=H.browser(env),entered=await b.call('/api/passkeys/owner/code',{body:{code:RECOVERY_CODE}});assert.equal(entered.status,200);
  assert.deepEqual(entered.json.accounts.map(a=>[a.id,a.name,a.household]),[[ownerId,'Dana','The Levi family']]);
  assert.equal((await b.call('/api/passkeys/register/options',{body:{purpose:'operator',userId:'someone-else'}})).status,400);
  const laptop=await H.createAuthenticator(),o=await b.call('/api/passkeys/register/options',{body:{purpose:'operator',userId:ownerId}});
  assert.equal(o.json.options.excludeCredentials.length,1,'the existing passkey is listed so it is not registered twice');
  const v=await b.call('/api/passkeys/register/verify',{body:{response:await laptop.create(o.json.options,{origin:ORIGIN})}});assert.equal(v.status,200,v.text);
  assert.equal(await count(env,'SELECT COUNT(*) n FROM passkey_credentials WHERE user_id=?',ownerId),2);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM used_codes WHERE purpose='recovery'"),1);
  assert.equal((await H.browser(env).call('/api/passkeys/owner/code',{body:{code:RECOVERY_CODE}})).status,403,'single use');
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='passkey:operator-recovery'"),1);
  assert.equal(await count(env,"SELECT COUNT(*) n FROM security_audit WHERE resource_id='passkey:recovery-code'"),3,'every attempt audited');
 });
 t('operator recovery without a configured code does nothing',async env=>{await ownerHome(env);assert.equal((await H.browser(env).call('/api/passkeys/owner/code',{body:{code:RECOVERY_CODE}})).status,403)});

 // ---- C13: Account security ----
 t('account security: list (no raw ids), rename, add needs recent, remove needs recent and keeps the last way in',async env=>{
  const {b,auth}=await ownerHome(env),raw=(await env.DB.prepare('SELECT id FROM passkey_credentials').first()).id;
  let list=(await b.call('/api/passkeys/credentials',{method:'GET'})).json;assert.equal(list.passkeys.length,1);assert.notEqual(list.passkeys[0].id,raw);assert.ok(!JSON.stringify(list).includes(raw));
  assert.equal(list.passkeys[0].synced,true);assert.equal(list.google,false);
  assert.equal((await b.call('/api/passkeys/credentials',{method:'PATCH',body:{id:list.passkeys[0].id,name:'Dana’s iPhone'}})).status,200);
  assert.equal((await b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list.passkeys[0].id}})).status,409,'the only way in stays');
  await env.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
  assert.equal((await b.call('/api/passkeys/register/options',{body:{purpose:'add'}})).status,403,'adding needs recent identity');
  await H.confirm(env,b,auth);
  const laptop=await H.createAuthenticator(),o=await b.call('/api/passkeys/register/options',{body:{purpose:'add',deviceName:'Laptop'}});
  assert.equal(o.json.options.excludeCredentials.length,1);
  assert.equal((await b.call('/api/passkeys/register/verify',{body:{response:await laptop.create(o.json.options,{origin:ORIGIN})}})).status,200);
  list=(await b.call('/api/passkeys/credentials',{method:'GET'})).json;assert.deepEqual(list.passkeys.map(p=>p.name).sort(),['Dana’s iPhone','Laptop']);
  assert.equal((await H.signIn(env,laptop)).verify.status,200,'the new passkey signs in to the same account');
  await env.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
  assert.equal((await b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list.passkeys[0].id}})).status,403,'removing needs recent identity');
  await H.confirm(env,b,laptop);
  assert.equal((await b.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list.passkeys.find(p=>p.name==='Dana’s iPhone').id}})).status,200);
  assert.equal((await H.signIn(env,auth)).verify.status,401,'a removed passkey no longer signs in');
  // Someone else's passkey id is unknown here.
  const g=await H.googlePerson(env,'gina');assert.equal((await g.call('/api/passkeys/credentials',{method:'PATCH',body:{id:list.passkeys[1].id,name:'x'}})).status,404);
 });
 t('a Google person adds a passkey to the same account, after recent identity, and can then sign in either way',async env=>{
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),g=await H.googlePerson(env,'gina');await g.call('/api/family/join',{body:{token}});
  const phone=await H.createAuthenticator(),o=await g.call('/api/passkeys/register/options',{body:{purpose:'add',deviceName:'Phone'}});assert.equal(o.status,200);
  assert.equal((await g.call('/api/passkeys/register/verify',{body:{response:await phone.create(o.json.options,{origin:ORIGIN})}})).status,200);
  const s=await H.signIn(env,phone);assert.equal((await s.b.call('/api/session',{method:'GET'})).json.user.id,'gina');
  assert.deepEqual((await g.call('/api/security/sessions',{method:'GET'})).json.methods,['passkey','google']);
  const list=(await g.call('/api/passkeys/credentials',{method:'GET'})).json;assert.equal(list.google,true);assert.equal(list.email,'gina@example.test');
  // With Google still linked, removing the only passkey is allowed.
  assert.equal((await g.call('/api/passkeys/credentials',{method:'DELETE',body:{id:list.passkeys[0].id}})).status,200);
 });

 // ---- T13: no endpoint says whether an account exists ----
 t('no enumeration: unknown passkey, removed member and bad signature get the same answer',async env=>{
  const owner=await ownerHome(env),stranger=await H.createAuthenticator();
  // A credential the server never saw.
  const fake=await H.browser(env).call('/api/passkeys/setup/code',{body:{code:'x'}});assert.equal(fake.status,410);
  const so=await H.browser(env).call('/api/passkeys/signin/options',{body:{}});const strangerAnswer={id:'AAAAAAAAAAAAAAAAAAAAAA',rawId:'AAAAAAAAAAAAAAAAAAAAAA',type:'public-key',response:{clientDataJSON:'e30',authenticatorData:'AA',signature:'AA'},clientExtensionResults:{}};
  const answers=[];
  {const b=H.browser(env);await b.call('/api/passkeys/signin/options',{body:{}});answers.push(await b.call('/api/passkeys/signin/verify',{body:{response:strangerAnswer}}))}
  {const {token}=await H.invite(owner.b),j=await H.joinWithPasskey(env,token),m=(await env.DB.prepare('SELECT member_id FROM memberships WHERE user_id<>(SELECT owner_user_id FROM installation_setup)').first()).member_id;await owner.b.call('/api/family/members/'+m,{method:'DELETE'});answers.push((await H.signIn(env,j.auth)).verify)}
  {const b=H.browser(env),o=await b.call('/api/passkeys/signin/options',{body:{}}),a=await owner.auth.get(o.json.options,{origin:ORIGIN});a.response.signature=a.response.signature.slice(0,-4)+'AAAA';answers.push(await b.call('/api/passkeys/signin/verify',{body:{response:a}}))}
  assert.deepEqual(answers.map(a=>[a.status,a.json.error]),Array(3).fill([401,'This passkey isn’t recognised here.']));
  // Invitations: unknown and used links answer alike.
  const {token}=await H.invite(owner.b);await H.joinWithPasskey(env,token);
  const used=await H.browser(env).call('/api/passkeys/invitation',{body:{token}}),unknown=await H.browser(env).call('/api/passkeys/invitation',{body:{token:'nope'}});
  assert.deepEqual([used.status,used.json.error],[unknown.status,unknown.json.error]);
  void so;void stranger;
 });

 // ---- C12: rate limits ----
 tClock('rate limits: sign-in ceremonies per address per minute, invitation lookups per address',async env=>{
  const b=H.browser(env);let last;for(let i=0;i<31;i++)last=await b.call('/api/passkeys/signin/options',{body:{}});assert.equal(last.status,429);
  const c=H.browser(env);for(let i=0;i<31;i++)last=await c.call('/api/passkeys/invitation',{body:{token:'t'+i},headers:{'CF-Connecting-IP':'198.51.100.7'}});assert.equal(last.status,429);
 });

 // ---- §10.13: nothing secret in logs or the audit ----
 t('logs and audit hold no codes, challenges, tokens or credential ids',async env=>{
  logged.length=0;
  const owner=await ownerHome(env),{token}=await H.invite(owner.b),j=await H.joinWithPasskey(env,token);await H.signIn(env,j.auth);
  const secrets=[SETUP_CODE,normalizeCode(SETUP_CODE),token,...(await env.DB.prepare('SELECT id FROM passkey_credentials').all()).results.map(r=>r.id),H.sessionCookieOf(owner.b).value];
  const audit=JSON.stringify((await env.DB.prepare('SELECT * FROM security_audit').all()).results);
  for(const s of secrets){assert.ok(!logged.join('\n').includes(s),'log');assert.ok(!audit.includes(s),'audit')}
  for(const r of (await env.DB.prepare('SELECT resource_id FROM security_audit').all()).results)assert.ok(r.resource_id===null||/^(passkey(:[a-z-]+)?|recovery(-cancelled)?)$/.test(r.resource_id)||/^[0-9a-f-]{36}$/.test(r.resource_id),String(r.resource_id));
 });

 // ---- C14: people without email ----
 t('a passkey owner has no email anywhere and the household still works for them',async env=>{
  const {b,householdId}=await ownerHome(env);
  const s=(await b.call('/api/session',{method:'GET'})).json;assert.ok(!s.user.email);assert.equal(s.memberships[0].role,'parent');
  const state=(await b.call('/api/households/'+householdId+'/state',{method:'GET'})).json;assert.equal(state.role,'parent');assert.equal(state.data.members[0].name,'Dana');
  assert.equal(await count(env,'SELECT COUNT(*) n FROM users WHERE email IS NOT NULL'),0);
 });
}
