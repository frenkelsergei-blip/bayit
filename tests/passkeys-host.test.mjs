// Passkeys on the Docker host (app/host/setup-code.mjs, recovery-cli.mjs), run as a real Node server process:
// the first-time setup code appears in the log and in data/setup-code.txt (0600) only while setup is open, the whole
// setup ceremony works over HTTP on http://localhost, and afterwards the file, the stored digest and the log line are
// gone for good. The operator recovery CLI makes a one-time code the running server accepts without a restart.
// Also: Google sign-in admission is identical with passkeys on and off. Synthetic data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import http from 'node:http';
import net from 'node:net';
import {createAuthenticator} from './fixtures/soft-authenticator.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {authConfig} from '../app/cloud/auth.mjs';
import {MIGRATIONS} from './passkey-harness.mjs';

let sqlite=null;try{sqlite=await import('node:sqlite')}catch{}
const skip=!sqlite&&'node:sqlite unavailable';
const host=name=>new URL('../app/host/'+name,import.meta.url).pathname;
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})});
function start(env){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',host('node-server.mjs')],{env:{PATH:process.env.PATH,MIGRATIONS_DIR:MIGRATIONS,...env},stdio:['ignore','pipe','pipe']});
  let out='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('did not start: '+out))},20000);
  child.stdout.on('data',d=>{out+=d;if(out.includes('Bayit is running')){clearTimeout(timer);resolve({child,out:()=>out,stop:()=>new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);child.kill('SIGTERM')})})}});
  child.stderr.on('data',d=>{out+=d});child.on('exit',code=>{clearTimeout(timer);reject(Error('exited '+code+': '+out))});
 });
}
// A tiny browser over real HTTP with the Host the server expects.
function client(origin,port){
 const jar=new Map();
 return {jar,call:(path,{method='POST',body}={})=>new Promise((resolve,reject)=>{
  const data=body===undefined?null:JSON.stringify(body);
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{Host:new URL(origin).host,Origin:origin,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{})}},res=>{
   const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>{for(const c of res.headers['set-cookie']||[]){const [pair]=c.split(';'),i=pair.indexOf('='),k=pair.slice(0,i),v=pair.slice(i+1);if(!v||/Max-Age=0/.test(c))jar.delete(k);else jar.set(k,v)}const text=Buffer.concat(parts).toString();let json=null;try{json=JSON.parse(text)}catch{}resolve({status:res.statusCode,json,text})});
  });req.on('error',reject);if(data)req.write(data);req.end();
 })};
}

test('Docker host: setup code in the log and file while setup is open, the ceremony over http://localhost, then gone for good; the recovery CLI works live',{skip},async()=>{
 const data=await mkdtemp(join(tmpdir(),'bayit-passkey-host-')),pub=await mkdtemp(join(tmpdir(),'bayit-passkey-static-'));await writeFile(join(pub,'index.html'),'<!doctype html>');
 const port=await freePort(),origin='http://localhost:'+port,env={HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,STATIC_DIR:pub,BAYIT_ORIGIN:origin};
 try{
  let server=await start(env);
  const line=server.out().match(/First-time setup code: ([0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}) Open (\S+) and enter it/);assert.ok(line,server.out());
  const code=line[1];assert.equal(line[2],origin);
  assert.equal((await readFile(join(data,'setup-code.txt'),'utf8')).trim(),code);assert.equal((await stat(join(data,'setup-code.txt'))).mode&0o777,0o600);
  assert.match(JSON.parse(await readFile(join(data,'secrets.json'),'utf8')).BAYIT_SETUP_CODE_HASH,/^[a-f0-9]{64}$/);
  assert.ok(!(await readFile(join(data,'secrets.json'),'utf8')).includes(code),'only the digest is kept in secrets.json');
  // A restart before setup prints the same code again (it is in the file).
  await server.stop();server=await start(env);assert.ok(server.out().includes(code));
  const b=client(origin,port),config=await b.call('/api/config',{method:'GET'});assert.equal(config.json.registration.setup,'code');assert.deepEqual(config.json.signIn.methods.map(m=>m.id),['passkey']);
  assert.equal((await b.call('/api/passkeys/setup/code',{body:{code:code.toLowerCase().replaceAll('-','')}})).status,200);
  const auth=await createAuthenticator(),options=await b.call('/api/passkeys/register/options',{body:{purpose:'setup',name:'Dana'}});assert.equal(options.json.options.rp.id,'localhost');
  const verify=await b.call('/api/passkeys/register/verify',{body:{response:await auth.create(options.json.options,{origin})}});assert.equal(verify.status,200,verify.text);
  assert.ok(b.jar.has('authjs.session-token'));assert.equal((await b.call('/api/households',{body:{name:'Home'}})).status,201);
  await assert.rejects(stat(join(data,'setup-code.txt')),'the file is deleted when setup completes');
  assert.equal(JSON.parse(await readFile(join(data,'secrets.json'),'utf8')).BAYIT_SETUP_CODE_HASH,undefined);
  await server.stop();server=await start(env);
  assert.doesNotMatch(server.out(),/setup code/i,'never printed again after setup');assert.ok(!server.out().includes(code));
  await assert.rejects(stat(join(data,'setup-code.txt')));
  // Operator recovery code from the CLI, accepted by the running server without a restart, once.
  const {stdout}=await promisify(execFile)(process.execPath,['--disable-warning=ExperimentalWarning',host('recovery-cli.mjs'),'--data',data]);
  const recovery=stdout.match(/One-time recovery code: (\S+)/)[1];
  const r=client(origin,port),entered=await r.call('/api/passkeys/owner/code',{body:{code:recovery}});assert.equal(entered.status,200,entered.text);assert.equal(entered.json.accounts[0].name,'Dana');
  const laptop=await createAuthenticator(),o=await r.call('/api/passkeys/register/options',{body:{purpose:'operator',userId:entered.json.accounts[0].id}});
  assert.equal((await r.call('/api/passkeys/register/verify',{body:{response:await laptop.create(o.json.options,{origin})}})).status,200);
  assert.equal((await client(origin,port).call('/api/passkeys/owner/code',{body:{code:recovery}})).status,403,'single use');
  assert.ok(!server.out().includes(recovery),'the server never logs it');
  await server.stop();
 }finally{await rm(data,{recursive:true,force:true});await rm(pub,{recursive:true,force:true})}
});

test('Docker host: no code is made when passkeys are off, the owner chose Google, or the address cannot do passkeys',{skip},async()=>{
 for(const extra of [{BAYIT_PASSKEYS:'off'},{BAYIT_BOOTSTRAP_EMAIL:'owner@example.test'},{}]){
  const data=await mkdtemp(join(tmpdir(),'bayit-passkey-nocode-')),port=await freePort(),origin='http://localhost:'+port;
  try{const server=await start({HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,STATIC_DIR:data,...(Object.keys(extra).length?{BAYIT_ORIGIN:origin}:{}),...extra});
   assert.doesNotMatch(server.out(),/setup code/i,JSON.stringify(extra));await assert.rejects(stat(join(data,'setup-code.txt')));await server.stop()}
  finally{await rm(data,{recursive:true,force:true})}
 }
});

test('Google admission is the same with passkeys on, off, and on a passkey-capable address',{skip},async()=>{
 const DB=openD1(':memory:');migrate(DB,MIGRATIONS);
 await DB.batch([DB.prepare("INSERT INTO users(id,name,email) VALUES('m','m','member@example.test')"),DB.prepare("INSERT INTO households(id,name,created_by,created_at) VALUES('h','Home','m','2026-11-10')"),DB.prepare("INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES('h','m','m','parent','2026-11-10')")]);
 const base={DB,AUTH_SECRET:'synthetic-google-parity-secret',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',BAYIT_ALLOWED_EMAILS:'owner@example.test'};
 const cases=[['owner@example.test',true],['OWNER@example.test',true],['member@example.test',true],['stranger@example.test',true],['owner@example.test',false]];
 const answers=async env=>{const out=[];for(const mode of ['private','open'])for(const [email,verified] of cases){const e={...env,BAYIT_REGISTRATION_MODE:mode==='open'?'open':undefined},config=authConfig(e,new Request('https://family.example/api/auth/session'));out.push(await config.callbacks.signIn({profile:{email,email_verified:verified},account:{provider:'google',providerAccountId:'sub-'+email,type:'oidc'}}))}return out};
 const off=await answers({...base,BAYIT_PASSKEYS:'off'}),on=await answers(base),onAddress=await answers({...base,BAYIT_ORIGIN:'https://family.example'});
 assert.deepEqual(on,off);assert.deepEqual(onAddress,off);
 assert.deepEqual(off,[true,true,true,false,false,true,true,true,true,false]);
 for(const env of [base,{...base,BAYIT_ORIGIN:'https://family.example'},{...base,BAYIT_PASSKEYS:'off'}])assert.deepEqual(authConfig(env,new Request('https://family.example/api/auth/session')).providers.map(p=>p.id),['google']);
 DB.close();
});

// Cloudflare Workers runtime: the worker bundled exactly as app/cloud/prepare-pages.mjs bundles it, running inside
// workerd (Miniflare) with a D1 binding and nodejs_compat, does the whole setup and sign-in. This is the proof that
// @simplewebauthn/server runs on Pages Functions, which its authors do not list as supported.
import {createRequire} from 'node:module';
import {d1Database,closeMiniflare,MiniflareAvailable} from './passkey-harness.mjs';
test('Cloudflare Workers runtime: the bundled worker runs setup, sign-in and confirm inside workerd',{skip:!MiniflareAvailable&&'miniflare unavailable'},async()=>{
 const appRequire=createRequire(new URL('../app/package.json',import.meta.url)),{build}=appRequire('esbuild'),{Miniflare,convertV4MiniflareOptions:convert}=appRequire('miniflare');
 const dir=await mkdtemp(join(tmpdir(),'bayit-pages-bundle-')),outfile=join(dir,'_worker.js');
 await build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022',define:{__BAYIT_CSP__:JSON.stringify("default-src 'self'")},external:['node:*'],minify:true,logLevel:'silent'});
 const size=(await stat(outfile)).size;assert.ok(size<10*1024*1024,'bundle '+size);
 const origin='https://family.example',code='K7Q2M-9XRTA-4HN6P-WC3ZD';
 // Migrate a D1 database through the shared harness, then hand its persisted state to a worker Miniflare.
 const persist=await mkdtemp(join(tmpdir(),'bayit-d1-'));
 const mf=new Miniflare(convert({modules:true,scriptPath:outfile,modulesRoot:dir,compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],d1Persist:persist,bindings:{AUTH_SECRET:'synthetic-passkey-auth-secret-0123456789',BAYIT_ORIGIN:origin,BAYIT_SETUP_CODE:code}}));
 try{
  const DB=await mf.getD1Database('DB');
  {const {readdirSync,readFileSync}=await import('node:fs');await DB.prepare('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
   for(const f of readdirSync(MIGRATIONS).filter(f=>f.endsWith('.sql')).sort()){const sql=readFileSync(MIGRATIONS+'/'+f,'utf8').replace(/^\s*--.*$/gm,''),st=[];let cur='';for(const line of sql.split('\n')){cur+=' '+line.trim();if(/;\s*$/.test(line)&&!(/\bBEGIN\b/i.test(cur)&&!/\bEND\s*;\s*$/i.test(cur))){st.push(cur.trim());cur=''}}await DB.batch([...st.filter(Boolean).map(s=>DB.prepare(s)),DB.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(f)])}}
  const jar=new Map(),call=async(path,{method='POST',body}={})=>{const r=await mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{})},body:body&&JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [pair]=c.split(';'),i=pair.indexOf('=');if(/Max-Age=0/.test(c))jar.delete(pair.slice(0,i));else jar.set(pair.slice(0,i),pair.slice(i+1))}return {status:r.status,json:await r.json().catch(()=>null)}};
  assert.equal((await call('/api/passkeys/setup/code',{body:{code}})).status,200);
  const auth=await createAuthenticator(),o=await call('/api/passkeys/register/options',{body:{purpose:'setup',name:'Dana'}});
  const v=await call('/api/passkeys/register/verify',{body:{response:await auth.create(o.json.options,{origin})}});assert.equal(v.status,200,JSON.stringify(v.json));
  assert.equal((await call('/api/session',{method:'GET'})).json.user.name,'Dana');
  jar.clear();const so=await call('/api/passkeys/signin/options',{body:{}});
  assert.equal((await call('/api/passkeys/signin/verify',{body:{response:await auth.get(so.json.options,{origin})}})).status,200);
  const co=await call('/api/passkeys/confirm/options',{body:{}});assert.equal((await call('/api/passkeys/confirm/verify',{body:{response:await auth.get(co.json.options,{origin})}})).status,200);
  const wrong=await call('/api/passkeys/signin/options',{body:{}});assert.equal((await call('/api/passkeys/signin/verify',{body:{response:await auth.get(wrong.json.options,{origin:'https://preview.family.example'})}})).status,401);
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});await rm(persist,{recursive:true,force:true});await closeMiniflare()}
});

// ---- Security review finding 2: on Docker every client used to share one rate-limit bucket ----
import {clientAddress,trustedProxies,normalizeAddress} from '../app/host/client-address.mjs';
test('Docker client address: the socket, or the forwarded hop only through a trusted proxy',()=>{
 const none=trustedProxies(''),proxy=trustedProxies('127.0.0.1, 172.16.0.0/12 ,::1');
 assert.equal(normalizeAddress('::ffff:10.1.2.3'),'10.1.2.3');
 assert.equal(clientAddress('::ffff:203.0.113.9','198.51.100.1',none),'203.0.113.9','a client cannot choose its address');
 assert.equal(clientAddress('127.0.0.1','198.51.100.1',proxy),'198.51.100.1');
 assert.equal(clientAddress('172.18.0.4','6.6.6.6, 198.51.100.2, 172.18.0.1',proxy),'198.51.100.2','right-most hop that is not a proxy');
 assert.equal(clientAddress('172.18.0.4','',proxy),'172.18.0.4');
 assert.equal(clientAddress('10.0.0.9','198.51.100.1',proxy),'10.0.0.9','an untrusted socket is never replaced');
 assert.equal(clientAddress('::1','2001:db8::7',proxy),'2001:db8::7');
 // Re-review R2: anything that is not an IP literal in the forwarded header means the socket address is used.
 for(const bad of ['<script>','198.51.100.77, evil','unknown','1.2.3.4.5','999.1.1.1'])assert.equal(clientAddress('127.0.0.1',bad,proxy),'127.0.0.1',bad);
 assert.equal(clientAddress('127.0.0.1','::ffff:198.51.100.8',proxy),'198.51.100.8');
});
function post(origin,port,path,body,headers={}){return new Promise((resolve,reject)=>{const data=JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port,path,method:'POST',headers:{Host:new URL(origin).host,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.end(data)})}
test('Docker host: a stranger behind the proxy cannot lock the owner out, and a client cannot spoof its address',{skip},async()=>{
 for(const trusted of ['','127.0.0.1']){
  const data=await mkdtemp(join(tmpdir(),'bayit-passkey-ip-')),port=await freePort(),origin='http://localhost:'+port;
  try{const server=await start({HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,STATIC_DIR:data,BAYIT_ORIGIN:origin,BAYIT_TRUSTED_PROXIES:trusted});
   const code=(await readFile(join(data,'setup-code.txt'),'utf8')).trim();
   // The stranger sends 6 wrong codes, each time claiming another address.
   let last;for(let i=0;i<6;i++)last=await post(origin,port,'/api/passkeys/setup/code',{code:'AAAAA-AAAAA-AAAAA-AAAAA'},{'X-Forwarded-For':'203.0.113.'+(trusted?5:i),'CF-Connecting-IP':'203.0.113.'+i});
   assert.equal(last,429,'the stranger is limited ('+(trusted||'no proxy')+')');
   const owner=await post(origin,port,'/api/passkeys/setup/code',{code},{'X-Forwarded-For':'198.51.100.7'});
   if(trusted)assert.equal(owner,200,'behind a trusted proxy the owner has their own bucket');
   else assert.equal(owner,429,'without a trusted proxy every request is the socket (here one machine), and forged headers are ignored');
   await server.stop();
  }finally{await rm(data,{recursive:true,force:true})}
 }
});
