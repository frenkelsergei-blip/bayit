// Passkey sign-in ("מפתח גישה") in core: docs/passkey-sign-in-design.md (approved 2026-11-10), build log docs/passkey-implementation-log.md.
// Every ceremony runs here: setup by the owner's one-time code, joining by invitation, recovery, adding a passkey,
// signing in and "confirm it's you". Rules that never bend:
//  - The origin and RP ID come only from the configured public address (BAYIT_ORIGIN), never from request headers.
//  - Challenges are made and kept by the server, used once (deleted by the read that uses them) and live 5 minutes.
//  - User verification is required on every ceremony. Attestation is 'none'. Credentials are discoverable.
//  - Sessions are Auth.js database sessions: the same table, cookie name and attributes, lifetime and sign-out.
//  - Admission stays the same people as today: the setup-code holder, invited people, recovery, existing members.
//    Open registration never admits a passkey.
//  - Codes, challenges, tokens and credential ids are never logged; the audit holds labels only.
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {json,fail,random,hash,bodyJSON,sameDigest,encoder,base64} from './util.mjs';
import {limit,auditStatement,audit,requireRecent,sessionToken} from './security.mjs';
import {joinHousehold} from './family-join.mjs';
import {authorizeRecoveryUse,noticeRecoveryUsed} from './passkey-recovery.mjs';
import {RECOVERY_GUARD_MS,recoveryGuardSince} from './security.mjs';

export const PASSKEY_ALGORITHMS=[-8,-7,-257]; // Ed25519, ES256, RS256 (Windows Hello). ML-DSA left out on purpose (design §5.2).
export const CHALLENGE_MS=5*60000,PERMIT_MS=15*60000;
// Must equal auth.mjs session.maxAge (tests/passkeys.test.mjs compares them).
export const SESSION_MAX_AGE_MS=14*86400000;
const PERMIT_COOKIE='bayit-passkey-permit',CEREMONY_COOKIE='bayit-passkey-ceremony';
const UNKNOWN='This passkey isn’t recognised here.';

// ---- Configuration ----
import {passkeysOn,relyingParty,PASSKEY_SIGNIN} from './passkey-config.mjs';
export {passkeysOn,relyingParty,PASSKEY_SIGNIN};

// ---- Codes (setup and operator recovery) ----
// Typing is case-insensitive, dashes and spaces are optional, and Crockford look-alikes (O, I, L) are accepted.
export const normalizeCode=code=>String(code||'').toUpperCase().replace(/[\s-]+/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 20 Crockford base32 characters (100 bits), shown as XXXXX-XXXXX-XXXXX-XXXXX.
export function makeCode(bytes=crypto.getRandomValues(new Uint8Array(20))){let out='';for(let i=0;i<20;i++)out+=ALPHABET[bytes[i]&31];return out.match(/.{5}/g).join('-')}
export const codeDigest=code=>hash('bayit-code:'+normalizeCode(code));
// A configured code: a plain secret (Cloudflare: BAYIT_SETUP_CODE / BAYIT_RECOVERY_CODE) or its digest written by the
// Docker host (…_HASH). Codes shorter than 16 characters are ignored rather than trusted.
async function configuredDigest(env,name){
 const plain=env[name];if(typeof plain==='string'&&normalizeCode(plain).length>=16)return codeDigest(plain);
 const stored=env[name+'_HASH'];return typeof stored==='string'&&/^[a-f0-9]{64}$/.test(stored)?stored:null;
}
async function codeUsed(env,digest){return !!await env.DB.prepare('SELECT 1 FROM used_codes WHERE code_hash=?').bind(digest).first()}

// ---- Setup state ----
export async function setupOpen(env){return !await env.DB.prepare('SELECT 1 AS x FROM installation_setup UNION ALL SELECT 1 FROM memberships LIMIT 1').first()}
// What /api/config tells the sign-in screen (a mode only, never the code). 'code': the setup-code path is open;
// 'google': setup is open only through the owner's Google email; 'none': setup is finished or not possible yet.
export async function passkeyRegistration(env){
 if(!env.DB||!await setupOpen(env))return {setup:'none'};
 const allowlist=String(env.BAYIT_ALLOWED_EMAILS||env.BAYIT_BOOTSTRAP_EMAIL||'').trim();
 if(PASSKEY_SIGNIN.configured(env)&&env.AUTH_SECRET){const digest=await configuredDigest(env,'BAYIT_SETUP_CODE');if(digest&&!await codeUsed(env,digest))return {setup:'code',setupHost:typeof env.HOST_SETUP_COMPLETE==='function'?'docker':'cloudflare'}}
 return {setup:allowlist?'google':'none'};
}

// ---- Cookies and permits ----
const cookie=(request,name)=>{for(const part of (request.headers.get('Cookie')||'').split(';')){const at=part.indexOf('=');if(at>0&&part.slice(0,at).trim()===name)return part.slice(at+1).trim()}return ''};
const setCookie=(rp,name,value,maxAge)=>name+'='+value+'; Path=/api/passkeys; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(rp.secure?'; Secure':'');
const b64u=bytes=>base64(bytes).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64u=s=>Uint8Array.from(atob(String(s).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function sign(env,value){
 // Domain-separated from the Google invitation permit (registration.mjs), so neither verifies as the other.
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('bayit-passkey-permit:'+value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function issuePermit(env,rp,data){const payload=b64u(encoder.encode(JSON.stringify({...data,until:Date.now()+PERMIT_MS,nonce:random(12)}))),value=payload+'.'+await sign(env,payload);return {value,header:setCookie(rp,PERMIT_COOKIE,value,PERMIT_MS/1000)}}
// The current permit, or null. Its digest binds a ceremony to the permit that started it.
async function readPermit(request,env){
 const value=cookie(request,PERMIT_COOKIE),[payload,sig]=value.split('.');
 if(!payload||!sig||!sameDigest(sig,await sign(env,payload)))return null;
 try{const data=JSON.parse(new TextDecoder().decode(unb64u(payload)));return data.until>Date.now()?{...data,digest:await hash(value)}:null}catch{return null}
}
const clearPermit=rp=>setCookie(rp,PERMIT_COOKIE,'',0);

// ---- Sessions: exactly what Auth.js creates (C4) ----
// Auth.js (@auth/core lib/utils/cookie.js defaultCookies) names the cookie "__Secure-authjs.session-token" on HTTPS and
// "authjs.session-token" otherwise, with HttpOnly, SameSite=Lax, Path=/ and Secure on HTTPS, expiring with the session.
export const sessionCookieName=secure=>(secure?'__Secure-':'')+'authjs.session-token';
export function newSession(env,userId,guard='1',args=[],now=Date.now()){
 const token=random(32),expires=new Date(now+SESSION_MAX_AGE_MS);
 return {token,expires,statement:env.DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) SELECT ?,?,?,? WHERE '+guard).bind(crypto.randomUUID(),token,userId,expires.toISOString(),...args)};
}
export const sessionCookie=(rp,session)=>sessionCookieName(rp.secure)+'='+session.token+'; Path=/; Expires='+session.expires.toUTCString()+'; HttpOnly; SameSite=Lax'+(rp.secure?'; Secure':'');

// ---- Challenges ----
async function storeChallenge(env,rp,{challenge,purpose,userId=null,permit=null,data=null}){
 const id=random(24);
 await env.DB.prepare('INSERT INTO webauthn_challenges(id,challenge,purpose,user_id,permit,data,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,challenge,purpose,userId,permit,data&&JSON.stringify(data),Date.now()+CHALLENGE_MS).run();
 return setCookie(rp,CEREMONY_COOKIE,id,CHALLENGE_MS/1000);
}
// Reads and deletes in one statement, so a challenge works once even when two requests race.
async function takeChallenge(request,env,purposes){
 const id=cookie(request,CEREMONY_COOKIE);if(!/^[A-Za-z0-9_-]{20,64}$/.test(id))throw fail('This step expired. Start again.',400);
 const row=await env.DB.prepare('DELETE FROM webauthn_challenges WHERE id=? RETURNING challenge,purpose,user_id,permit,data,expires_at').bind(id).first();
 if(!row||row.expires_at<=Date.now()||!purposes.includes(row.purpose))throw fail('This step expired. Start again.',400);
 return {...row,data:row.data?JSON.parse(row.data):{}};
}

// ---- Rate limits (C12): the shared fixed-window counter, with the count returned for "tries left" ----
async function count(env,bucket,period){
 const window=Math.floor(Date.now()/period),key=await hash(bucket);
 return (await env.DB.prepare('INSERT INTO security_rate_limits(bucket,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window,expires_at=excluded.expires_at RETURNING count').bind(key,window,(window+1)*period).first()).count;
}
async function peek(env,bucket,period){const row=await env.DB.prepare('SELECT count FROM security_rate_limits WHERE bucket=? AND window=?').bind(await hash(bucket),Math.floor(Date.now()/period)).first();return row?.count||0}
const clientAddress=request=>request.headers.get('CF-Connecting-IP')||'host';
const CODE_TRIES=5,CODE_WINDOW=15*60000,CODE_DAILY_FAILURES=30,DAY=86400000;
const tooMany=()=>Object.assign(fail('Too many tries. Wait 15 minutes and try again. The code itself is still safe.',429),{code:'RATE_LIMITED'});

// ---- Accounts and credentials ----
const credentialRow=(env,id,userId,info,rp,name)=>env.DB.prepare('INSERT INTO passkey_credentials(id,user_id,public_key,counter,transports,device_type,backed_up,name,rp_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,userId,b64u(info.credential.publicKey),info.credential.counter||0,(info.credential.transports||[]).join(',').slice(0,200)||null,info.credentialDeviceType==='multiDevice'?'multiDevice':'singleDevice',info.credentialBackedUp?1:0,name||null,rp.rpID,Date.now());
async function passkeyHandle(env,userId){return (await env.DB.prepare("SELECT providerAccountId AS handle FROM accounts WHERE userId=? AND provider='passkey'").bind(userId).first())?.handle||null}
const cleanName=(value,max=60)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
async function displayName(env,userId){return (await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(userId).first())?.name||'Bayit'}

// ---- Registration options ----
async function registrationOptions(env,rp,{userId,handle,name,exclude=[]}){
 return generateRegistrationOptions({rpName:'Bayit',rpID:rp.rpID,userName:name,userDisplayName:name,userID:unb64u(handle),attestationType:'none',
  authenticatorSelection:{residentKey:'required',requireResidentKey:true,userVerification:'required'},supportedAlgorithmIDs:PASSKEY_ALGORITHMS,timeout:CHALLENGE_MS,
  excludeCredentials:exclude.map(c=>({id:c.id,transports:c.transports?c.transports.split(','):undefined}))});
}
async function ownCredentials(env,userId){return (await env.DB.prepare('SELECT id,transports FROM passkey_credentials WHERE user_id=?').bind(userId).all()).results}

// ---- Admission for signing in with an existing passkey (C5) ----
// The same people as Google today: a member of a household, the owner who finished setup but has no household yet,
// or someone holding a valid invitation (who then joins). A credential alone, under any registration mode, is not enough.
async function admitted(request,env,userId){
 if(await env.DB.prepare('SELECT 1 AS x FROM memberships WHERE user_id=? UNION ALL SELECT 1 FROM installation_setup WHERE owner_user_id=? LIMIT 1').bind(userId,userId).first())return true;
 const permit=await readPermit(request,env);
 return permit?.kind==='invite'&&!!await env.DB.prepare("SELECT 1 FROM invitations WHERE token_hash=? AND purpose='join' AND used_by IS NULL AND expires_at>?").bind(permit.hash,Date.now()).first();
}

// Verifies an assertion against a stored credential with the counter policy (§5.5). Any failure is the same answer.
async function verifyAssertion(env,rp,response,expectedChallenge,{userId=null}={}){
 const id=typeof response?.id==='string'&&response.id.length<=1400?response.id:'';
 const stored=id?await env.DB.prepare('SELECT * FROM passkey_credentials WHERE id=?').bind(id).first():null;
 if(!stored||stored.rp_id!==rp.rpID||userId&&stored.user_id!==userId)throw fail(UNKNOWN,401);
 // A discoverable assertion names its account; it must be the handle this credential was registered under.
 const handle=response.response?.userHandle;if(handle&&handle!==await passkeyHandle(env,stored.user_id))throw fail(UNKNOWN,401);
 let result;try{result=await verifyAuthenticationResponse({response,expectedChallenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true,credential:{id:stored.id,publicKey:unb64u(stored.public_key),counter:0,transports:stored.transports?stored.transports.split(','):undefined}})}catch{throw fail(UNKNOWN,401)}
 if(!result.verified)throw fail(UNKNOWN,401);
 const next=result.authenticationInfo.newCounter;
 // Synced passkeys report 0; when either side is non-zero the counter must grow, otherwise it looks like a copy.
 if((stored.counter||next)&&next<=stored.counter){await audit(env,{actor:stored.user_id,action:'session.request',resource:'passkey:counter',result:'refused'}).catch(()=>{});throw Object.assign(fail('This passkey looks copied, so it was refused. Remove it in Account security and add a new one.',401),{code:'PASSKEY_COUNTER'})}
 // The guard on the old counter keeps two racing uses of the same assertion from both counting.
 const now=Date.now();
 return {stored,next,now,touch:env.DB.prepare('UPDATE passkey_credentials SET counter=?,last_used_at=? WHERE id=? AND counter=?').bind(next,now,stored.id,stored.counter),used:['EXISTS(SELECT 1 FROM passkey_credentials WHERE id=? AND counter=? AND last_used_at=?)',[stored.id,next,now]]};
}

// ---- Handler ----
const ok=(value,cookies=[],status=200)=>{const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});for(const c of cookies)headers.append('Set-Cookie',c);return new Response(JSON.stringify(value),{status,headers})};
const REGISTER=['setup','invite','recover','operator','add'];

export async function handlePasskeys(request,env,{sessionFor}){
 const url=new URL(request.url),path=url.pathname.slice('/api/passkeys/'.length),method=request.method;
 if(!passkeysOn(env))return json({error:'Not found.'},404);
 const rp=relyingParty(env);
 if(!rp||!env.AUTH_SECRET)throw Object.assign(fail('Passkeys need a secure web address (https://…). Ask the person who set up Bayit to finish its address.',503),{code:'PASSKEYS_UNAVAILABLE'});
 // Same-origin only, against the configured address: a preview or another deployment cannot drive a ceremony.
 if(method!=='GET'&&(request.headers.get('Origin')!==rp.origin||url.origin!==rp.origin))throw fail('Request origin is not allowed.',403);
 const signedIn=async()=>{const session=await sessionFor(request,env);if(!session?.user?.id)throw fail('Sign in to Bayit first.',401);await limit(env,'api:'+session.user.id);return session.user};
 const ip=clientAddress(request);

 // -- The owner's one-time setup code (C6) --
 if(path==='setup/code'&&method==='POST'){
  const body=await bodyJSON(request,2000);
  if(!await setupOpen(env))throw Object.assign(fail('This Bayit is already set up. Sign in, or ask your family for an invitation.',410),{code:'SETUP_CLOSED'});
  // The daily cap belongs to the configured code (review finding 7): a new code from the owner reopens setup.
  const expected=await configuredDigest(env,'BAYIT_SETUP_CODE'),typed=await codeDigest(body.code),daily='passkey-setup-failures:'+(expected||'none');
  if(await peek(env,daily,DAY)>=CODE_DAILY_FAILURES){console.warn('Bayit setup: too many wrong setup codes today for this setup code; setup refuses until tomorrow or until a new setup code is set.');throw Object.assign(fail('Too many wrong setup codes today. Try again tomorrow, or ask whoever installed Bayit to set a new setup code.',429),{code:'RATE_LIMITED'})}
  const tries=await count(env,'passkey-code:'+ip,CODE_WINDOW);if(tries>CODE_TRIES)throw tooMany();
  if(!expected||!sameDigest(typed,expected)||await codeUsed(env,typed)){
   await count(env,daily,DAY);await audit(env,{actor:'anonymous',action:'session.request',resource:'passkey:setup-code',result:'refused'}).catch(()=>{});
   return ok({error:'This setup code isn’t right. Check it and try again.',code:'WRONG_CODE',triesLeft:Math.max(0,CODE_TRIES-tries)},[],403);
  }
  const permit=await issuePermit(env,rp,{kind:'setup',hash:typed});await audit(env,{actor:'anonymous',action:'session.request',resource:'passkey:setup-code'}).catch(()=>{});
  return ok({ok:true},[permit.header]);
 }
 // -- An invitation link (join or recovery) opens the passkey path (C5, C8) --
 if(path==='invitation'&&method==='POST'){
  await limit(env,'passkey-invite:'+ip,{max:30,period:CODE_WINDOW});
  const body=await bodyJSON(request,3000);if(typeof body.token!=='string'||!body.token||body.token.length>200)throw fail('Choose a valid invitation.');
  const tokenHash=await hash(body.token),invite=await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? AND used_by IS NULL AND expires_at>?').bind(tokenHash,Date.now()).first();
  if(!invite)throw fail('This invitation has expired or was already used.',410);
  const home=await env.DB.prepare('SELECT name FROM households WHERE id=?').bind(invite.household_id).first();
  if(invite.purpose==='recover'){
   if(invite.usable_at>Date.now())return ok({error:'This link starts working later.',code:'RECOVERY_NOT_YET',usableAt:new Date(invite.usable_at).toISOString()},[],409);
   const permit=await issuePermit(env,rp,{kind:'recover',hash:tokenHash});
   return ok({purpose:'recover',household:home?.name||'',name:await displayName(env,invite.target_user_id)},[permit.header]);
  }
  if(invite.purpose!=='join')throw fail('This invitation has expired or was already used.',410);
  const permit=await issuePermit(env,rp,{kind:'invite',hash:tokenHash});
  // A child invitation for an existing profile already knows the child's name.
  let memberName='';if(invite.member_id){const row=await env.DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind(invite.household_id).first();const m=row&&JSON.parse(row.state).members?.find(x=>x.id===invite.member_id);memberName=m?(m.he||m.name||''):''}
  return ok({purpose:'join',household:home?.name||'',role:invite.role,memberName,expiresAt:new Date(invite.expires_at).toISOString()},[permit.header]);
 }
 // -- The owner's operator recovery code, when no other parent can help (C8, §4.3) --
 if(path==='owner/code'&&method==='POST'){
  const body=await bodyJSON(request,2000);
  const expected=await configuredDigest(env,'BAYIT_RECOVERY_CODE'),typed=await codeDigest(body.code),daily='passkey-owner-failures:'+(expected||'none');
  if(await peek(env,daily,DAY)>=CODE_DAILY_FAILURES)throw Object.assign(fail('Too many wrong recovery codes today. Make a new recovery code where Bayit is installed (Docker: recovery-cli.mjs; Cloudflare: a new BAYIT_RECOVERY_CODE) and use that one.',429),{code:'RATE_LIMITED'});
  const tries=await count(env,'passkey-code:'+ip,CODE_WINDOW);if(tries>CODE_TRIES)throw tooMany();
  if(!expected||!sameDigest(typed,expected)||await codeUsed(env,typed)){
   await count(env,daily,DAY);await audit(env,{actor:'installation-operator',action:'session.request',resource:'passkey:recovery-code',result:'refused'}).catch(()=>{});
   return ok({error:'This recovery code isn’t right, or it was already used.',code:'WRONG_CODE',triesLeft:Math.max(0,CODE_TRIES-tries)},[],403);
  }
  const parents=(await env.DB.prepare("SELECT u.id,u.name,h.name AS household FROM memberships m JOIN users u ON u.id=m.user_id JOIN households h ON h.id=m.household_id WHERE m.role='parent' ORDER BY h.created_at,m.created_at LIMIT 40").all()).results;
  const permit=await issuePermit(env,rp,{kind:'operator',hash:typed});await audit(env,{actor:'installation-operator',action:'session.request',resource:'passkey:recovery-code'}).catch(()=>{});
  return ok({accounts:parents.map(p=>({id:p.id,name:p.name||'',household:p.household}))},[permit.header]);
 }

 // -- Registration: options --
 if(path==='register/options'&&method==='POST'){
  const body=await bodyJSON(request,4000),purpose=body.purpose;if(!REGISTER.includes(purpose))throw fail('Choose what this passkey is for.');
  await limit(env,'passkey-register:'+ip,{max:30,period:CODE_WINDOW});
  const deviceName=cleanName(body.deviceName,40);let userId,handle,name,exclude=[],permitDigest=null;
  if(purpose==='add'){
   const user=await signedIn();await requireRecent(request,env,user);userId=user.id;name=user.name||await displayName(env,userId);handle=await passkeyHandle(env,userId)||random(32);exclude=await ownCredentials(env,userId);permitDigest=await hash('session:'+sessionToken(request));
  }else{
   const permit=await readPermit(request,env);
   const kind={setup:'setup',invite:'invite',recover:'recover',operator:'operator'}[purpose];
   if(!permit||permit.kind!==kind)throw Object.assign(fail('This step expired. Start again.',403),{code:'PERMIT_REQUIRED'});
   permitDigest=permit.digest;
   if(purpose==='setup'){if(!await setupOpen(env))throw Object.assign(fail('This Bayit is already set up.',410),{code:'SETUP_CLOSED'});name=cleanName(body.name);if(!name)throw fail('Write your name.');userId=crypto.randomUUID();handle=random(32)}
   if(purpose==='invite'){const invite=await env.DB.prepare("SELECT member_id,household_id FROM invitations WHERE token_hash=? AND purpose='join' AND used_by IS NULL AND expires_at>?").bind(permit.hash,Date.now()).first();if(!invite)throw fail('This invitation has expired or was already used.',410);name=cleanName(body.name);if(!name&&invite.member_id){const row=await env.DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind(invite.household_id).first();const m=row&&JSON.parse(row.state).members?.find(x=>x.id===invite.member_id);name=cleanName(m?.name||m?.he)}if(!name)throw fail('Write your name.');userId=crypto.randomUUID();handle=random(32)}
   if(purpose==='recover'){const invite=await authorizeRecoveryUse(env,permit.hash);userId=invite.target_user_id;name=await displayName(env,userId);handle=await passkeyHandle(env,userId)||random(32);exclude=await ownCredentials(env,userId)}
   if(purpose==='operator'){if(typeof body.userId!=='string'||!await env.DB.prepare("SELECT 1 FROM memberships WHERE user_id=? AND role='parent'").bind(body.userId).first())throw fail('Choose a parent account.',400);userId=body.userId;name=await displayName(env,userId);handle=await passkeyHandle(env,userId)||random(32);exclude=await ownCredentials(env,userId)}
  }
  const options=await registrationOptions(env,rp,{userId,handle,name,exclude});
  const cookieHeader=await storeChallenge(env,rp,{challenge:options.challenge,purpose,userId,permit:permitDigest,data:{handle,name,deviceName}});
  return ok({options},[cookieHeader]);
 }
 // -- Registration: verify --
 if(path==='register/verify'&&method==='POST'){
  const body=await bodyJSON(request,20000),row=await takeChallenge(request,env,REGISTER),purpose=row.purpose;
  let permit=null,user=null;
  if(purpose==='add'){user=await signedIn();await requireRecent(request,env,user);if(user.id!==row.user_id||row.permit!==await hash('session:'+sessionToken(request)))throw fail('This step expired. Start again.',403)}
  else{permit=await readPermit(request,env);if(!permit||permit.digest!==row.permit)throw Object.assign(fail('This step expired. Start again.',403),{code:'PERMIT_REQUIRED'})}
  let info;try{const result=await verifyRegistrationResponse({response:body.response,expectedChallenge:row.challenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true,supportedAlgorithmIDs:PASSKEY_ALGORITHMS});if(!result.verified)throw Error();info=result.registrationInfo}
  catch{throw fail('The passkey could not be checked. Nothing was saved. Try again.',400)}
  if(await env.DB.prepare('SELECT 1 FROM passkey_credentials WHERE id=?').bind(info.credential.id).first())throw fail('This passkey is already saved in Bayit.',409);
  const userId=row.user_id,{handle,name,deviceName}=row.data,now=Date.now(),newCredential=credentialRow(env,info.credential.id,userId,info,rp,deviceName);
  const account=(guard,args)=>env.DB.prepare("INSERT INTO accounts(id,userId,type,provider,providerAccountId) SELECT ?,?,'webauthn','passkey',? WHERE NOT EXISTS(SELECT 1 FROM accounts WHERE userId=? AND provider='passkey') AND "+guard).bind(crypto.randomUUID(),userId,handle,userId,...args);
  const withGuard=(guard,args)=>env.DB.prepare('INSERT INTO passkey_credentials(id,user_id,public_key,counter,transports,device_type,backed_up,name,rp_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+guard).bind(info.credential.id,userId,b64u(info.credential.publicKey),info.credential.counter||0,(info.credential.transports||[]).join(',').slice(0,200)||null,info.credentialDeviceType==='multiDevice'?'multiDevice':'singleDevice',info.credentialBackedUp?1:0,deviceName||null,rp.rpID,now,...args);
  const headers=[clearPermit(rp),setCookie(rp,CEREMONY_COOKIE,'',0)];
  try{
   if(purpose==='add'){
    await env.DB.batch([account('1',[]),newCredential,auditStatement(env,{actor:userId,action:'session.credentials',resource:'passkey:add'})]);
    return ok({ok:true},headers);
   }
   if(purpose==='setup'){
    // The guarded insert lets exactly one of two racing setups win; everything else hangs on that row.
    const won='EXISTS(SELECT 1 FROM installation_setup WHERE owner_user_id=?)',session=newSession(env,userId,won,[userId],now);
    const result=await env.DB.batch([
     env.DB.prepare('INSERT INTO installation_setup(id,owner_user_id,rp_id,origin,completed_at) SELECT 1,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM installation_setup) AND NOT EXISTS(SELECT 1 FROM memberships)').bind(userId,rp.rpID,rp.origin,now),
     env.DB.prepare("INSERT INTO used_codes(code_hash,purpose,used_at) SELECT ?,'setup',? WHERE "+won).bind(permit.hash,now,userId),
     env.DB.prepare('INSERT INTO users(id,name,email) SELECT ?,?,NULL WHERE '+won).bind(userId,name,userId),
     account(won,[userId]),withGuard(won,[userId]),session.statement,
     env.DB.prepare("INSERT INTO security_audit(id,household_id,actor_id,action,resource_id,result,created_at) SELECT ?,NULL,?,'session.create','passkey:setup','ok',? WHERE "+won).bind(crypto.randomUUID(),userId,now,userId)
    ]);
    if(!result[0].meta.changes)throw Object.assign(fail('This Bayit was just set up by someone else. Sign in, or ask the owner for an invitation.',409),{code:'SETUP_CLOSED'});
    try{await env.HOST_SETUP_COMPLETE?.()}catch{}
    return ok({ok:true,setup:true},[...headers,sessionCookie(rp,session)]);
   }
   if(purpose==='invite'){
    // The one join function Google uses too (family-join.mjs), with this person's user, passkey and session added
    // inside the same guarded batch: they exist only if the membership was created.
    const joined='EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND used_by=?)',args=[permit.hash,userId];let session;
    const {id}=await joinHousehold(env,{id:userId,name},permit.hash,{before:({where,whereArgs})=>[env.DB.prepare('INSERT INTO users(id,name,email) SELECT ?,?,NULL WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=?) AND EXISTS(SELECT 1 FROM invitations WHERE '+where+')').bind(userId,name,userId,...whereArgs)],after:()=>{session=newSession(env,userId,joined,args,now);return [account(joined,args),withGuard(joined,args),session.statement]}});
    return ok({ok:true,householdId:id},[...headers,sessionCookie(rp,session)]);
   }
   if(purpose==='recover'){
    const invite=await authorizeRecoveryUse(env,permit.hash);if(invite.target_user_id!==userId)throw fail('This link has expired.',410);
    const used='EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND used_by=? AND used_at=?)',args=[permit.hash,userId,now],session=newSession(env,userId,used,args,now);
    const result=await env.DB.batch([
     env.DB.prepare("UPDATE invitations SET used_by=?,used_at=?,expires_at=? WHERE token_hash=? AND purpose='recover' AND target_user_id=? AND used_by IS NULL AND usable_at<=? AND expires_at>?").bind(userId,now,now+RECOVERY_GUARD_MS+86400000,permit.hash,userId,now,now),
     account(used,args),withGuard(used,args),session.statement,
     env.DB.prepare("INSERT INTO security_audit(id,household_id,actor_id,action,resource_id,result,created_at) SELECT ?,?,?,'session.credentials','passkey:recover','ok',? WHERE "+used).bind(crypto.randomUUID(),invite.household_id,userId,now,...args)
    ]);
    if(!result[0].meta.changes)throw fail('This link has expired or was already used.',410);
    await noticeRecoveryUsed(env,userId,{exceptUserId:invite.created_by}).catch(()=>{});
    return ok({ok:true},[...headers,sessionCookie(rp,session)]);
   }
   if(purpose==='operator'){
    if(!await env.DB.prepare("SELECT 1 FROM memberships WHERE user_id=? AND role='parent'").bind(userId).first())throw fail('Choose a parent account.',400);
    // A plain insert: a code used a second time fails the whole batch on the primary key.
    const session=newSession(env,userId,'1',[],now);
    // A used recovery row marks the 72-hour guard (finding 3/9) exactly as a parent's link does; it is never listed.
    await env.DB.batch([env.DB.prepare("INSERT INTO used_codes(code_hash,purpose,used_at) VALUES(?,'recovery',?)").bind(permit.hash,now),account('1',[]),newCredential,session.statement,auditStatement(env,{actor:'installation-operator',action:'session.credentials',resource:'passkey:operator-recovery'}),
     env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,purpose,target_user_id,usable_at,used_by,used_at) SELECT ?,household_id,role,'installation-operator',?,member_id,'recover',user_id,?,user_id,? FROM memberships WHERE user_id=? ORDER BY created_at LIMIT 1").bind(await hash('operator:'+random(24)),now+RECOVERY_GUARD_MS+86400000,now,now,userId)]);
    await noticeRecoveryUsed(env,userId).catch(()=>{});
    return ok({ok:true},[...headers,sessionCookie(rp,session)]);
   }
  }catch(error){
   if(error.status)throw error;
   // A constraint (code already used, credential already saved, member taken) means nothing was saved.
   throw fail(purpose==='operator'?'This recovery code was already used. Nothing was saved.':'This could not be saved because something changed. Nothing was saved. Start again.',409);
  }
 }

 // -- Signing in with an existing passkey --
 if(path==='signin/options'&&method==='POST'){
  await limit(env,'passkey-signin:'+ip,{max:30,period:60000});
  const options=await generateAuthenticationOptions({rpID:rp.rpID,userVerification:'required',timeout:CHALLENGE_MS});
  return ok({options},[await storeChallenge(env,rp,{challenge:options.challenge,purpose:'signin'})]);
 }
 if(path==='signin/verify'&&method==='POST'){
  await limit(env,'passkey-signin:'+ip,{max:30,period:60000});
  const body=await bodyJSON(request,20000),row=await takeChallenge(request,env,['signin']);
  const {stored,touch,used}=await verifyAssertion(env,rp,body.response,row.challenge);
  if(!await admitted(request,env,stored.user_id)){await audit(env,{actor:stored.user_id,action:'session.request',resource:'passkey:signin',result:'refused'}).catch(()=>{});throw fail(UNKNOWN,401)}
  const session=newSession(env,stored.user_id,used[0],used[1]);
  const result=await env.DB.batch([touch,session.statement,auditStatement(env,{actor:stored.user_id,action:'session.create',resource:'passkey'})]);
  if(!result[0].meta.changes)throw fail(UNKNOWN,401);
  return ok({ok:true},[setCookie(rp,CEREMONY_COOKIE,'',0),sessionCookie(rp,session)]);
 }

 // -- "Confirm it's you" in place (C9): freshens only this session, only with this person's own passkey --
 if(path==='confirm/options'&&method==='POST'){
  const user=await signedIn(),credentials=await ownCredentials(env,user.id);if(!credentials.length)throw fail('Add a passkey first.',409);
  const options=await generateAuthenticationOptions({rpID:rp.rpID,userVerification:'required',timeout:CHALLENGE_MS,allowCredentials:credentials.map(c=>({id:c.id,transports:c.transports?c.transports.split(','):undefined}))});
  return ok({options},[await storeChallenge(env,rp,{challenge:options.challenge,purpose:'confirm',userId:user.id,permit:await hash('session:'+sessionToken(request))})]);
 }
 if(path==='confirm/verify'&&method==='POST'){
  const user=await signedIn(),body=await bodyJSON(request,20000),row=await takeChallenge(request,env,['confirm']),token=sessionToken(request);
  if(row.user_id!==user.id||row.permit!==await hash('session:'+token))throw fail('This step expired. Start again.',403);
  const {touch,used}=await verifyAssertion(env,rp,body.response,row.challenge,{userId:user.id});
  const result=await env.DB.batch([touch,
   env.DB.prepare('INSERT INTO session_auth(session_token,user_id,authenticated_at) SELECT s.sessionToken,s.userId,? FROM sessions s WHERE s.sessionToken=? AND s.userId=? AND s.expires>? AND '+used[0]+' ON CONFLICT(session_token) DO UPDATE SET authenticated_at=excluded.authenticated_at WHERE session_auth.user_id=excluded.user_id').bind(Date.now(),token,user.id,new Date().toISOString(),...used[1]),
   auditStatement(env,{actor:user.id,action:'session.request',resource:'passkey:confirm'})]);
  if(!result[0].meta.changes)throw fail(UNKNOWN,401);
  return ok({ok:true,recent:true},[setCookie(rp,CEREMONY_COOKIE,'',0)]);
 }

 // -- Account security (C13): this person's own passkeys --
 if(path==='credentials'){
  const user=await signedIn();
  if(method==='GET'){
   const rows=(await env.DB.prepare('SELECT id,name,device_type,backed_up,created_at,last_used_at FROM passkey_credentials WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results;
   const google=await env.DB.prepare("SELECT 1 FROM accounts WHERE userId=? AND provider='google'").bind(user.id).first();
   // Credential ids leave the server only as a digest, enough to rename or remove one.
   return json({passkeys:await Promise.all(rows.map(async r=>({id:await hash('credential:'+r.id),name:r.name||'',synced:r.device_type==='multiDevice'||!!r.backed_up,createdAt:r.created_at,lastUsedAt:r.last_used_at}))),google:!!google,email:google?user.email||'':''});
  }
  const body=await bodyJSON(request,3000),rows=(await env.DB.prepare('SELECT id FROM passkey_credentials WHERE user_id=?').bind(user.id).all()).results;
  let target=null;for(const r of rows)if(sameDigest(await hash('credential:'+r.id),String(body.id||'')))target=r;
  if(!target)throw fail('This passkey is unavailable.',404);
  if(method==='PATCH'){const name=cleanName(body.name,40);if(!name)throw fail('Write a name.');await env.DB.batch([env.DB.prepare('UPDATE passkey_credentials SET name=? WHERE id=? AND user_id=?').bind(name,target.id,user.id),auditStatement(env,{actor:user.id,action:'session.credentials',resource:'passkey:rename'})]);return json({ok:true})}
  if(method==='DELETE'){
   await requireRecent(request,env,user);
   const guard=await recoveryGuardSince(env,user.id);if(guard&&(await env.DB.prepare('SELECT created_at FROM passkey_credentials WHERE id=?').bind(target.id).first())?.created_at<guard)throw Object.assign(fail('A new passkey was added to this account by a way-back link in the last 72 hours, so the older passkeys can’t be removed yet. You can remove the new one.',409),{code:'RECOVERY_GUARD'});
   // Never remove the last way in: another passkey or a Google account must remain.
   const result=await env.DB.batch([env.DB.prepare("DELETE FROM passkey_credentials WHERE id=? AND user_id=? AND ((SELECT COUNT(*) FROM passkey_credentials WHERE user_id=?)>1 OR EXISTS(SELECT 1 FROM accounts WHERE userId=? AND provider<>'passkey'))").bind(target.id,user.id,user.id,user.id),auditStatement(env,{actor:user.id,action:'session.credentials',resource:'passkey:remove'})]);
   if(!result[0].meta.changes)throw Object.assign(fail('This is your only way to sign in, so it stays. Add another passkey first.',409),{code:'LAST_SIGNIN'});
   return json({ok:true});
  }
 }
 // -- Recovery notices for the person whose account a parent asked to recover (C8) --
 // `household`: pending recovery links in every household where this person is a parent (review finding 5), so any
 // parent sees and can cancel one made by another parent.
 if(path==='recovery'&&method==='GET'){const user=await signedIn();const household=(await env.DB.prepare("SELECT i.token_hash,i.household_id,i.member_id,i.usable_at,u.name FROM invitations i JOIN memberships me ON me.household_id=i.household_id AND me.user_id=? AND me.role='parent' LEFT JOIN users u ON u.id=i.created_by WHERE i.purpose='recover' AND i.used_by IS NULL AND i.expires_at>? AND COALESCE(i.target_user_id,'')<>? ORDER BY i.usable_at").bind(user.id,Date.now(),user.id).all()).results.map(r=>({id:r.token_hash,householdId:r.household_id,memberId:r.member_id,by:r.name||'',usableAt:new Date(r.usable_at).toISOString()}));return json({household,requests:(await env.DB.prepare("SELECT i.token_hash,i.usable_at,i.created_by,i.household_id,u.name FROM invitations i LEFT JOIN users u ON u.id=i.created_by WHERE i.purpose='recover' AND i.target_user_id=? AND i.used_by IS NULL AND i.expires_at>? ORDER BY i.usable_at").bind(user.id,Date.now()).all()).results.map(r=>({id:r.token_hash,by:r.name||'',householdId:r.household_id,usableAt:new Date(r.usable_at).toISOString()}))})}
 if(path==='recovery/cancel'&&method==='POST'){
  const user=await signedIn(),body=await bodyJSON(request,3000);if(!/^[a-f0-9]{64}$/.test(String(body.id||'')))throw fail('Choose a request.');
  const invite=await env.DB.prepare("SELECT household_id FROM invitations WHERE token_hash=? AND purpose='recover' AND target_user_id=? AND used_by IS NULL").bind(body.id,user.id).first();if(!invite)throw fail('This request is no longer open.',404);
  await env.DB.batch([env.DB.prepare("DELETE FROM invitations WHERE token_hash=? AND purpose='recover' AND target_user_id=? AND used_by IS NULL").bind(body.id,user.id),auditStatement(env,{home:invite.household_id,actor:user.id,action:'family.invitations',resource:'recovery-cancelled'})]);
  return json({ok:true});
 }
 throw fail('Unknown endpoint.',404);
}
