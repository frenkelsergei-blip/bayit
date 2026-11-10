// Installed Auth.js login lifecycle and real D1 adapter; no live Google verification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {authConfig,authHandler} from '../app/cloud/auth.mjs';
import {requireRecent,ownSessions,RECENT_IDENTITY_MS} from '../app/cloud/security.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {handleLoginOrRegister}=await import(pathToFileURL(require.resolve('@auth/core')).href.replace(/index\.js$/,'lib/actions/callback/handle-login.js'));
const origin='http://localhost:55807',account={provider:'google',providerAccountId:'owner-google-sub',type:'oidc'},profile={email:'owner@example.test',email_verified:true};
const request=(path='/api/auth/callback/google',token='owner-token')=>new Request(origin+path,{headers:{Cookie:'authjs.session-token='+token,Origin:origin}});
async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 for(const id of ['owner','other'])await DB.batch([DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(id,id,id+'@example.test'),DB.prepare('INSERT INTO accounts(id,userId,type,provider,providerAccountId) VALUES(?,?,?,?,?)').bind(id+'-account',id,'oidc','google',id+'-google-sub'),DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind(id+'-session',id+'-token',id,new Date(Date.now()+86400000).toISOString())]);
 await DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('second-owner','second-owner-token','owner',new Date(Date.now()+86400000).toISOString()).run();await DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
 const env={DB,AUTH_SECRET:'synthetic-auth-freshness-secret',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',BAYIT_REGISTRATION_MODE:'open'};
 return{DB,env,stamp:async token=>(await DB.prepare('SELECT authenticated_at FROM session_auth WHERE session_token=?').bind(token).first())?.authenticated_at,close:()=>DB.close()};
}
test('verified same-account login reuses the installed Auth.js session and freshens only that session',async()=>{
 const f=await fixture();try{const req=request(),options=authConfig(f.env,req),user=await options.adapter.getUser('owner');assert.equal(await options.callbacks.signIn({profile,account}),true);const before=await f.DB.prepare('SELECT COUNT(*) n FROM sessions').first();const result=await handleLoginOrRegister('owner-token',{id:'provider-sub',...profile},account,{...options,provider:{id:'google',type:'oidc'}});assert.equal(result.session.sessionToken,'owner-token');assert.equal(result.user.id,'owner');await options.events.signIn({user:result.user,account,profile,isNewUser:false});await requireRecent(req,f.env,user);assert.ok(await f.stamp('owner-token')>Date.now()-60000);assert.equal(await f.stamp('second-owner-token'),0);assert.equal(await f.stamp('other-token'),0);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM sessions').first()).n,before.n)}finally{f.close()}
});
test('wrong Google account, unknown account and unverified profile cannot link or freshen the signed-in identity',async()=>{
 const f=await fixture();try{const options=authConfig(f.env,request());for(const [candidate,p]of [[{...account,providerAccountId:'other-google-sub'},{email:'other@example.test',email_verified:true}],[{...account,providerAccountId:'unlinked-sub'},{email:'allowed@example.test',email_verified:true}],[account,{...profile,email_verified:false}]])assert.equal(await options.callbacks.signIn({account:candidate,profile:p}),false);assert.equal(await f.stamp('owner-token'),0);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM accounts').first()).n,2);await options.events.signIn({user:{id:'other'},account:{...account,providerAccountId:'other-google-sub'},profile});assert.equal(await f.stamp('owner-token'),0);assert.equal(await f.stamp('other-token'),0)}finally{f.close()}
});
test('session reads, forged return markers and failed callbacks do not refresh authentication',async()=>{
 const f=await fixture(),saved=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('No live provider calls in auth tests')};const response=await authHandler(request('/api/auth/session'),f.env);assert.equal(response.status,200);assert.equal(await f.stamp('owner-token'),0);const config=authConfig(f.env,request('/api/auth/session?reauth=1'));await config.events.signIn({user:{id:'owner'},account,profile});assert.equal(await f.stamp('owner-token'),0);await authHandler(request('/api/auth/callback/google?error=access_denied'),f.env);assert.equal(await f.stamp('owner-token'),0);await assert.rejects(requireRecent(request(),f.env,{id:'owner'}),e=>e.code==='REAUTH_REQUIRED')}finally{globalThis.fetch=saved;f.close()}
});
test('expired or revoked sessions are never made recent and are not reused by the adapter',async()=>{
 const f=await fixture();try{await f.DB.prepare('UPDATE sessions SET expires=? WHERE sessionToken=?').bind(new Date(Date.now()-60000).toISOString(),'owner-token').run();const config=authConfig(f.env,request());await config.events.signIn({user:{id:'owner'},account,profile});assert.equal(await f.stamp('owner-token'),0);assert.equal(await config.adapter.getSessionAndUser('owner-token'),null);assert.equal(await f.stamp('owner-token'),undefined);await config.events.signIn({user:{id:'owner'},account,profile});assert.equal(await f.stamp('owner-token'),undefined);assert.equal(await f.stamp('second-owner-token'),0)}finally{f.close()}
});
test('the recent-identity window is 30 minutes for everyone, and the client reads it from the server',async()=>{
 const f=await fixture();try{assert.equal(RECENT_IDENTITY_MS,30*60000);const user={id:'owner'},stamp=ms=>f.DB.prepare('UPDATE session_auth SET authenticated_at=? WHERE session_token=?').bind(ms,'owner-token').run();
  await stamp(Date.now()-20*60000);await requireRecent(request(),f.env,user);
  const body=await (await ownSessions(request('/api/security/sessions'),f.env,user)).json();assert.equal(body.recent,true);assert.equal(body.recentWindowMs,RECENT_IDENTITY_MS);
  await stamp(Date.now()-31*60000);await assert.rejects(requireRecent(request(),f.env,user),e=>e.code==='REAUTH_REQUIRED');
  assert.equal((await (await ownSessions(request('/api/security/sessions'),f.env,user)).json()).recent,false);
  assert.match(readFileSync(new URL('../app/src/connection-dialog.jsx',import.meta.url),'utf8'),/authenticated_at\+data\.recentWindowMs/,'the client uses the server value, not its own copy');
 }finally{f.close()}
});
