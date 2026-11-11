// Shared harness for the passkey tests (tests/passkeys*.test.mjs): the real worker, a real database (Node SQLite or
// Cloudflare's local D1 in Miniflare), a cookie-keeping "browser" per person and the synthetic authenticator
// (tests/fixtures/soft-authenticator.mjs). Synthetic data only; nothing leaves the machine.
import {readdirSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import worker from '../app/cloud/worker.mjs';
import {createAuthenticator} from './fixtures/soft-authenticator.mjs';
export {createAuthenticator};

export const ORIGIN='https://family.example',RPID='family.example',SETUP_CODE='K7Q2M-9XRTA-4HN6P-WC3ZD',RECOVERY_CODE='R2D2C-3POBB-8HJKM-NQRST';
export const MIGRATIONS=new URL('../app/cloud/migrations',import.meta.url).pathname;
const migrationFiles=()=>readdirSync(MIGRATIONS).filter(f=>f.endsWith('.sql')).sort();

// Cloudflare reference: local D1 in Miniflare, migrated statement by statement and recorded like wrangler does.
let miniflare=null,next=0;
const appRequire=createRequire(new URL('../app/package.json',import.meta.url));
export let MiniflareAvailable=true;try{appRequire.resolve('miniflare')}catch{MiniflareAvailable=false}
export async function d1Database(){
 if(!miniflare){const {Miniflare,convertV4MiniflareOptions:convert}=appRequire('miniflare');miniflare=new Miniflare(convert({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-11-04',d1Databases:Array.from({length:60},(_,i)=>'DB'+i)}))}
 const db=await miniflare.getD1Database('DB'+(next++));
 await db.prepare('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
 for(const f of migrationFiles()){
  const sql=readFileSync(MIGRATIONS+'/'+f,'utf8').replace(/^\s*--.*$/gm,''),statements=[];let current='';
  for(const line of sql.split('\n')){current+=' '+line.trim();if(/;\s*$/.test(line)&&!(/\bBEGIN\b/i.test(current)&&!/\bEND\s*;\s*$/i.test(current))){statements.push(current.trim());current=''}}
  if(current.trim())statements.push(current.trim());
  await db.batch([...statements.filter(Boolean).map(s=>db.prepare(s)),db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(f)]);
 }
 return db;
}
export async function closeMiniflare(){await miniflare?.dispose();miniflare=null}
export async function sqliteDatabase(){const {openD1,migrate}=await import('../app/host/d1-sqlite.mjs');const db=openD1(':memory:');migrate(db,MIGRATIONS);return db}
export const HOSTS=[{name:'node',database:sqliteDatabase},{name:'cloudflare',database:d1Database,skip:!MiniflareAvailable&&'miniflare unavailable'}];

export function makeEnv(DB,extra={}){return {DB,AUTH_SECRET:'synthetic-passkey-auth-secret-0123456789',BAYIT_ORIGIN:ORIGIN,BAYIT_SETUP_CODE:SETUP_CODE,ASSETS:{fetch:()=>new Response('static')},...extra}}

// A browser: keeps cookies (name → {value, attributes}) and sends every request same-origin unless told otherwise.
export function browser(env,{origin=env.BAYIT_ORIGIN||ORIGIN}={}){
 const jar=new Map();
 const b={jar,origin,
  cookieHeader:()=>[...jar].map(([k,v])=>k+'='+v.value).join('; '),
  async call(path,{method='POST',body,headers={},sendOrigin=origin,raw=false}={}){
   const h=new Headers(headers);if(sendOrigin)h.set('Origin',sendOrigin);if(jar.size&&!h.has('Cookie'))h.set('Cookie',b.cookieHeader());
   if(body!==undefined&&!raw)h.set('Content-Type','application/json');
   const response=await worker.fetch(new Request(origin+path,{method,headers:h,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'manual'}),env);
   const setCookies=response.headers.getSetCookie();
   for(const c of setCookies){const [pair,...attrs]=c.split(';').map(x=>x.trim()),at=pair.indexOf('='),name=pair.slice(0,at),value=pair.slice(at+1);const a=Object.fromEntries(attrs.map(x=>{const i=x.indexOf('=');return i<0?[x.toLowerCase(),true]:[x.slice(0,i).toLowerCase(),x.slice(i+1)]}));if(a['max-age']==='0'||value===''||a.expires&&new Date(a.expires).getTime()<Date.now())jar.delete(name);else jar.set(name,{value,attrs:a})}
   const text=await response.text();let json=null;try{json=JSON.parse(text)}catch{}
   return {status:response.status,json,text,headers:response.headers,setCookies};
  }
 };
 return b;
}
export const sessionCookieOf=b=>b.jar.get('__Secure-authjs.session-token')||b.jar.get('authjs.session-token');

// Full flows, as the app runs them.
export async function setupOwner(env,{name='Dana',code=SETUP_CODE,authenticator}={}){
 const b=browser(env),auth=authenticator||await createAuthenticator({synced:true});
 const entered=await b.call('/api/passkeys/setup/code',{body:{code}});if(entered.status!==200)return {b,auth,entered};
 const options=await b.call('/api/passkeys/register/options',{body:{purpose:'setup',name}});
 const verify=await b.call('/api/passkeys/register/verify',{body:{response:await auth.create(options.json.options,{origin:env.BAYIT_ORIGIN})}});
 return {b,auth,entered,options,verify};
}
export async function createHousehold(b,name='The Levi family'){const r=await b.call('/api/households',{body:{name}});return r.json?.id}
export async function invite(b,{role='adult',memberId,householdId}={}){const r=await b.call('/api/family/invitations',{body:{role,memberId,householdId},headers:householdId?{'X-Bayit-Household':householdId}:{}});return {status:r.status,token:r.json?.url&&new URLSearchParams(new URL(r.json.url).hash.split('?')[1]).get('invite'),json:r.json}}
export async function joinWithPasskey(env,token,{name='Avi',authenticator}={}){
 const b=browser(env),auth=authenticator||await createAuthenticator({synced:true});
 const opened=await b.call('/api/passkeys/invitation',{body:{token}});if(opened.status!==200)return {b,auth,opened};
 const options=await b.call('/api/passkeys/register/options',{body:{purpose:opened.json.purpose==='recover'?'recover':'invite',name}});if(options.status!==200)return {b,auth,opened,options};
 const verify=await b.call('/api/passkeys/register/verify',{body:{response:await auth.create(options.json.options,{origin:env.BAYIT_ORIGIN})}});
 return {b,auth,opened,options,verify};
}
export async function signIn(env,auth,{credential,overrides={},b=browser(env)}={}){
 const options=await b.call('/api/passkeys/signin/options',{body:{}});
 const verify=await b.call('/api/passkeys/signin/verify',{body:{response:await auth.get(options.json.options,{origin:env.BAYIT_ORIGIN,credential:credential||auth.credentials[0],...overrides})}});
 return {b,options,verify};
}
export async function confirm(env,b,auth,{credential}={}){
 const options=await b.call('/api/passkeys/confirm/options',{body:{}});if(options.status!==200)return {options};
 return {options,verify:await b.call('/api/passkeys/confirm/verify',{body:{response:await auth.get(options.json.options,{origin:env.BAYIT_ORIGIN,credential:credential||auth.credentials[0]})}})};
}
// A Google-style person (Auth.js account and database session) for parity tests; no live Google call.
export async function googlePerson(env,id,{email=id+'@example.test'}={}){
 const token=id+'-google-session-'+crypto.randomUUID();
 await env.DB.batch([env.DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(id,id,email),env.DB.prepare('INSERT INTO accounts(id,userId,type,provider,providerAccountId) VALUES(?,?,?,?,?)').bind(id+'-account',id,'oidc','google',id+'-sub'),env.DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind(id+'-session',token,id,new Date(Date.now()+86400000).toISOString())]);
 const b=browser(env);b.jar.set('__Secure-authjs.session-token',{value:token,attrs:{}});return b;
}
