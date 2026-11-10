// Sign-in method seam (Modular Bayit work package 2.4, docs/sign-in-methods.md): every registered method meets the
// contract, a broken extra method fails loudly, and an extra method can never skip core admission or freshen
// another person's identity. Synthetic accounts only; no live provider calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {SIGNIN_METHODS,SIGNIN_FIELDS,signInMethodProblem,signInProvider,signInChoices,configuredSignInMethods} from '../app/cloud/signin-methods.mjs';
import {authReady,authConfig} from '../app/cloud/auth.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),real=p=>pathToFileURL(join(root,p)).href;
const scratch=mkdtempSync(join(tmpdir(),'bayit-signin-'));
process.on('exit',()=>rmSync(scratch,{recursive:true,force:true}));
let copies=0;
// A copy of the sign-in code with its own local registry file; everything else is the real module.
function copyWith(extra){
 const dir=join(scratch,'copy-'+(++copies)),put=(p,code)=>{mkdirSync(dirname(join(dir,p)),{recursive:true});writeFileSync(join(dir,p),code)};
 for(const f of ['app/cloud/auth.mjs','app/cloud/signin-methods.mjs'])put(f,readFileSync(join(root,f),'utf8'));
 for(const f of ['app/cloud/registration.mjs','app/cloud/security.mjs','shared/extension-registry.mjs'])put(f,`export * from '${real(f)}';\n`);
 put('app/cloud/extensions/signin.mjs',extra);
 symlinkSync(join(root,'app/node_modules'),join(dir,'app/node_modules'),'dir');
 return dir;
}
const load=async extra=>{const dir=copyWith(extra);return {...await import(pathToFileURL(join(dir,'app/cloud/signin-methods.mjs')).href),...await import(pathToFileURL(join(dir,'app/cloud/auth.mjs')).href)}};
// A well-formed extra method with a stand-in provider (never contacted). verifiedAccount reports what the provider proved.
const method=(fields='')=>`{id:'testkey',label:{en:'Continue with a test key',he:'המשך עם מפתח בדיקה'},start:'authjs',configured:env=>!!env.TESTKEY_ON,provider:()=>({id:'testkey',name:'Test key',type:'oauth'}),verifiedAccount:({profile})=>({email:profile.email,email_verified:profile.verified===true}),recentIdentity:'sign-in-again'${fields}}`;
const withMethod=(m=method())=>load(`export const EXTRA_SIGNIN=[${m}];\n`);

const origin='http://localhost:55808';
const request=(path,token='owner-token')=>new Request(origin+path,{headers:{Cookie:'authjs.session-token='+token,Origin:origin}});
async function fixture(env={}){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 for(const [id,provider] of [['owner','testkey'],['other','testkey']])await DB.batch([DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(id,id,id+'@example.test'),DB.prepare('INSERT INTO accounts(id,userId,type,provider,providerAccountId) VALUES(?,?,?,?,?)').bind(id+'-account',id,'oauth',provider,id+'-key'),DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind(id+'-session',id+'-token',id,new Date(Date.now()+86400000).toISOString())]);
 await DB.prepare('UPDATE session_auth SET authenticated_at=0').run();
 return {DB,env:{DB,AUTH_SECRET:'synthetic-signin-secret',TESTKEY_ON:'1',BAYIT_ALLOWED_EMAILS:'owner@example.test',...env},stamp:async token=>(await DB.prepare('SELECT authenticated_at FROM session_auth WHERE session_token=?').bind(token).first())?.authenticated_at,close:()=>DB.close()};
}

test('with an empty local file Google is the only method and meets the contract',()=>{
 assert.equal(readFileSync(join(root,'app/cloud/extensions/signin.mjs'),'utf8').replace(/^\s*\/\/.*\n/gm,'').trim(),'export const EXTRA_SIGNIN=[];');
 assert.deepEqual(SIGNIN_METHODS.map(m=>m.id),['google']);
 for(const m of SIGNIN_METHODS){
  assert.equal(signInMethodProblem(m),'',m.id);assert.deepEqual(Object.keys(m).sort(),[...SIGNIN_FIELDS].sort());
  const p=signInProvider(m,{GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'});assert.equal(p.id,m.id);assert.notEqual(p.type,'credentials');
 }
 const google=signInProvider(SIGNIN_METHODS[0],{GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'});
 assert.deepEqual(google.options.checks,['pkce','state','nonce']);assert.equal(google.options.authorization.params.scope,'openid email profile');
 // Google's own profile reaches admission unchanged, so who may sign in is exactly as before.
 const profile={email:'x@example.test',email_verified:true,sub:'1'};assert.equal(SIGNIN_METHODS[0].verifiedAccount({profile}),profile);
});

test('only configured methods are offered, and none without the owner’s Google setup',()=>{
 const base={DB:{},AUTH_SECRET:'x'};
 assert.deepEqual(signInChoices({...base,GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}),[{id:'google',label:{en:'Continue with Google',he:'המשך עם Google'}}]);
 for(const env of [base,{...base,GOOGLE_CLIENT_ID:'id'},{...base,GOOGLE_CLIENT_SECRET:'secret'}]){assert.deepEqual(configuredSignInMethods(env),[]);assert.equal(authReady(env),false)}
 assert.equal(authReady({...base,GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}),true);
 assert.equal(authReady({AUTH_SECRET:'x',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}),false);
 assert.equal(authConfig({...base,DB:openD1(':memory:'),GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'},request('/api/auth/session')).providers.map(p=>p.id).join(),'google');
});

test('a well-formed extra method is registered after Google and offered only when configured',async()=>{
 const m=await withMethod();
 assert.deepEqual(m.SIGNIN_METHODS.map(x=>x.id),['google','testkey']);
 assert.deepEqual(m.signInChoices({TESTKEY_ON:'1'}).map(x=>x.id),['testkey']);assert.deepEqual(m.signInChoices({}),[]);
 assert.equal(m.authReady({DB:{},AUTH_SECRET:'x',TESTKEY_ON:'1'}),true);
});

test('a broken extra method fails loudly when the registry loads',async()=>{
 const reject=(m,pattern)=>assert.rejects(withMethod(m),pattern);
 await reject(method().replace(`he:'המשך עם מפתח בדיקה'`,`he:''`),/sign-in method "testkey": needs label \{en, he\}/);
 await reject(method().replace(`start:'authjs'`,`start:'popup'`),/start must be 'authjs'/);
 await reject(method().replace(`,recentIdentity:'sign-in-again'`,''),/recentIdentity must be 'sign-in-again'/);
 await reject(method().replace(`verifiedAccount:({profile})=>({email:profile.email,email_verified:profile.verified===true}),`,''),/needs configured\(env\), provider\(env\) and verifiedAccount/);
 await reject(method().replace(`id:'testkey'`,`id:'google'`),/"google": this id is already registered/);
 // Admission, sessions, the recent-identity window and rate limits belong to core: a method may not bring its own.
 await reject(method(`,signIn:()=>true`),/may not carry signIn/);
 await reject(method(`,callbacks:{signIn:()=>true}`),/may not carry callbacks/);
 await reject(method(`,session:{maxAge:31536000}`),/may not carry session/);
 await reject(method(`,admit:()=>true,rateLimit:false`),/may not carry admit, rateLimit/);
 await assert.rejects(load('export const EXTRA_SIGNIN={};\n'),/must export an array/);
 // The provider itself is checked whenever it is built.
 for(const [provider,pattern] of [[`({id:'google',type:'oauth'})`,/provider id must be "testkey"/],[`({id:'testkey',type:'credentials'})`,/credentials providers are not supported/],[`({id:'testkey',type:'oauth',allowDangerousEmailAccountLinking:true})`,/may not link accounts by email/],[`({id:'testkey',type:'oauth',options:{allowDangerousEmailAccountLinking:true}})`,/may not link accounts by email/]]){
  const m=await withMethod(method().replace(`provider:()=>({id:'testkey',name:'Test key',type:'oauth'})`,'provider:()=>'+provider));
  assert.throws(()=>m.signInProvider(m.SIGNIN_METHODS[1],{}),pattern);assert.throws(()=>m.authConfig({DB:openD1(':memory:'),TESTKEY_ON:'1'},request('/api/auth/session')),pattern);
 }
});

test('an extra method cannot skip admission',async()=>{
 const m=await withMethod(),f=await fixture();try{
  const signIn=(profile,provider='testkey',path='/api/auth/session')=>m.authConfig(f.env,request(path,'none')).callbacks.signIn({profile,account:{provider,providerAccountId:'new-key',type:'oauth'}});
  assert.equal(await signIn({email:'owner@example.test',verified:true}),true,'the owner on the allowlist is admitted');
  assert.equal(await signIn({email:'stranger@example.test',verified:true}),false,'a verified stranger is refused in a private installation');
  assert.equal(await signIn({email:'owner@example.test',verified:false}),false,'an address the method did not verify is refused');
  assert.equal(await signIn({email:'owner@example.test',email_verified:true}),false,'the method’s verified account decides, not raw provider fields');
  assert.equal(await signIn({email:'owner@example.test',verified:true},'unregistered'),false,'an unregistered provider is refused');
  // Existing members and invitations still come only through core: a member of a household is admitted.
  await f.DB.batch([f.DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind('member','member','member@example.test'),f.DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('h','Home','member','2026-11-10')"),f.DB.prepare("INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES('h','member','m','adult','2026-11-10')")]);
  assert.equal(await signIn({email:'member@example.test',verified:true}),true,'an existing member is admitted by core');
  // Open registration is an owner setting in core; the method cannot turn it on, but it is honoured.
  assert.equal(await m.authConfig({...f.env,BAYIT_REGISTRATION_MODE:'open'},request('/api/auth/session','none')).callbacks.signIn({profile:{email:'stranger@example.test',verified:true},account:{provider:'testkey',providerAccountId:'s',type:'oauth'}}),true);
 }finally{f.close()}
});

test('an extra method confirms only its own signed-in person, on its own callback',async()=>{
 const m=await withMethod(),f=await fixture({BAYIT_REGISTRATION_MODE:'open'});try{
  const own={provider:'testkey',providerAccountId:'owner-key',type:'oauth'},theirs={...own,providerAccountId:'other-key'},profile={email:'owner@example.test',verified:true};
  const options=m.authConfig(f.env,request('/api/auth/callback/testkey'));
  assert.equal(await options.callbacks.signIn({profile,account:theirs}),false,'another person’s key cannot link to or freshen this session');
  await options.events.signIn({user:{id:'other'},account:theirs,profile});assert.equal(await f.stamp('owner-token'),0);
  // Completing the method on another method's callback path does not count.
  await m.authConfig(f.env,request('/api/auth/callback/google')).events.signIn({user:{id:'owner'},account:own,profile});assert.equal(await f.stamp('owner-token'),0);
  assert.equal(await options.callbacks.signIn({profile,account:own}),true);
  await options.events.signIn({user:{id:'owner'},account:own,profile});assert.ok(await f.stamp('owner-token')>Date.now()-60000);assert.equal(await f.stamp('other-token'),0);
 }finally{f.close()}
});
