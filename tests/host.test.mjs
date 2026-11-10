// Host conformance (docs/host-contract.md): the Node/Docker host passes the whole suite in tests/host-conformance.mjs.
// Cloudflare's local D1 and R2 (Miniflare) run the database and file-store parts, so the contract stays D1's, not SQLite's.
// Node-only checks (adapter leniency, process start-up refusals, file modes, DNS pinning, reader admission) follow.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {mkdtemp,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {runHostConformance,MIGRATIONS} from './host-conformance.mjs';

let sqlite=null;try{sqlite=await import('node:sqlite')}catch{}
const skip=!sqlite&&'node:sqlite unavailable';
const host=name=>new URL('../app/host/'+name,import.meta.url).pathname;
const {openD1,migrate}=sqlite?await import('../app/host/d1-sqlite.mjs'):{};
const {openFileStore}=await import('../app/host/file-store.mjs');
const {installationSecrets}=await import('../app/host/installation-secrets.mjs');
const {createOutboundFetch}=await import('../app/host/outbound-fetch.mjs');
const {isolatedPDFRows}=await import('../app/host/pdf-isolate.mjs');

const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})});
// Starts app/host/node-server.mjs unbundled with a clean environment; the same file dist/host/server.mjs bundles.
function startNode(extra={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',host('node-server.mjs')],{env:{PATH:process.env.PATH,MIGRATIONS_DIR:MIGRATIONS,...extra},stdio:['ignore','pipe','pipe']});
  let out='';const done=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Node host did not start: '+out))},20000);
  child.stdout.on('data',d=>{out+=d;if(out.includes('Bayit is running')){clearTimeout(done);resolve({child,out})}});
  child.stderr.on('data',d=>{out+=d});
  child.on('exit',code=>{clearTimeout(done);reject(Object.assign(Error('Node host exited '+code+': '+out),{code,out}))});
 });
}
async function serveNode({staticDir}){
 const dataDir=await mkdtemp(join(tmpdir(),'bayit-host-data-')),port=await freePort();
 const {child}=await startNode({HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dataDir,STATIC_DIR:staticDir});
 return {origin:'http://127.0.0.1:'+port,dataDir,stop:async()=>{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited}await rm(dataDir,{recursive:true,force:true})}};
}

runHostConformance({
 name:'node',skip,
 database:()=>openD1(':memory:'),
 migrate:db=>migrate(db,MIGRATIONS),
 files:()=>openFileStore(mkdtempSync(join(tmpdir(),'bayit-files-'))),
 fileKeysArePaths:true,
 installation:async()=>{const dir=await mkdtemp(join(tmpdir(),'bayit-install-'));return {secrets:()=>installationSecrets(dir,{}),cleanup:()=>rm(dir,{recursive:true,force:true})}},
 outboundFetch:env=>createOutboundFetch(env),
 pdfReader:()=>isolatedPDFRows,
 serve:serveNode,
});

// Cloudflare reference: Miniflare's local D1 and R2 (the same engines `wrangler dev` uses).
let miniflare=null,nextDB=0;
const appRequire=createRequire(new URL('../app/package.json',import.meta.url));
let Miniflare=null,convert=null;try{({Miniflare,convertV4MiniflareOptions:convert}=appRequire('miniflare'))}catch{}
async function cloudflare(){if(!miniflare)miniflare=new Miniflare(convert({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-11-04',d1Databases:Array.from({length:12},(_,i)=>'DB'+i),r2Buckets:Array.from({length:4},(_,i)=>'FILES'+i)}));return miniflare}
let nextBucket=0;
runHostConformance({
 name:'cloudflare (Miniflare D1/R2)',skip:!Miniflare&&'miniflare unavailable',
 database:async()=>(await cloudflare()).getD1Database('DB'+(nextDB++)),
 files:async()=>(await cloudflare()).getR2Bucket('FILES'+(nextBucket++)),
});
after(async()=>{await miniflare?.dispose()});

// ---- Node-only checks ----
test('Node D1 adapter binds undefined as NULL; real D1 refuses it, so server code must never rely on this', {skip}, async()=>{
 const db=openD1(':memory:');try{await db.exec('CREATE TABLE t(id TEXT, n INTEGER)');await db.prepare('INSERT INTO t VALUES(?,?)').bind('b',undefined).run();assert.equal(await db.prepare('SELECT n FROM t').first('n'),null)}finally{db.close()}
});

test('Node host refuses a public bind without BAYIT_ORIGIN and a non-HTTPS public origin', {skip}, async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'bayit-host-refuse-'));
 try{
  for(const extra of [{HOST:'0.0.0.0'},{HOST:'0.0.0.0',BAYIT_ORIGIN:'http://home.example'},{HOST:'127.0.0.1',BAYIT_ORIGIN:'https://home.example/bayit'}]){
   await assert.rejects(startNode({PORT:String(await freePort()),DATA_DIR:dataDir,STATIC_DIR:dataDir,...extra}),e=>e.code!==0&&/BAYIT_ORIGIN/.test(e.out),JSON.stringify(extra));
  }
 }finally{await rm(dataDir,{recursive:true,force:true})}
});

test('Node host keeps its data directory private: folder 0700, database and keys 0600', {skip}, async()=>{
 const staticDir=await mkdtemp(join(tmpdir(),'bayit-host-static-'));await writeFile(join(staticDir,'index.html'),'<!doctype html>');
 const served=await serveNode({staticDir});
 try{
  assert.equal((await stat(served.dataDir)).mode&0o777,0o700);
  for(const f of ['secrets.json','bayit.sqlite'])assert.equal((await stat(join(served.dataDir,f))).mode&0o777,0o600,f);
  assert.equal((await stat(join(served.dataDir,'files'))).mode&0o777,0o700);
 }finally{await served.stop();await rm(staticDir,{recursive:true,force:true})}
});

test('Node outbound fetch connects to the exact address it checked, and only operator-listed private origins pass', async()=>{
 const fakeRequest=(seen,status=200)=>(url,opts,cb)=>{opts.lookup(url.hostname,{},(err,address)=>seen.push(address));setImmediate(()=>cb(Object.assign(Readable.from([Buffer.from('ok')]),{statusCode:status,rawHeaders:['Content-Type','text/plain']})));return {on(){},write(){},end(){},destroy(){}}};
 const seen=[],run=createOutboundFetch({},{resolve:async()=>[{address:'93.184.215.14',family:4}],httpsRequest:fakeRequest(seen)});
 const response=await run('https://provider.example/');assert.equal(await response.text(),'ok');assert.deepEqual(seen,['93.184.215.14']);
 const privateSeen=[],allowed=createOutboundFetch({AI_PRIVATE_ORIGINS:'https://models.home.internal'},{resolve:async()=>[{address:'10.0.0.5',family:4}],httpsRequest:fakeRequest(privateSeen)});
 assert.equal((await allowed('https://models.home.internal/v1/models')).status,200);assert.deepEqual(privateSeen,['10.0.0.5']);
 await assert.rejects(allowed('https://other.home.internal/'),/private/);
 await assert.rejects(createOutboundFetch({},{resolve:async()=>[{address:'93.184.215.14',family:4}],httpsRequest:fakeRequest([],302)})('https://provider.example/'),/redirects/);
});

test('Node statement reader admits two PDFs at a time and refuses a third before parsing', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bayit-reader-busy-'));
 try{
  const stuck=join(dir,'stuck.mjs');await writeFile(stuck,'while(true){}');const opts={workerURL:new URL('file://'+stuck),timeout:400};
  const running=[isolatedPDFRows(new Uint8Array([1]),opts),isolatedPDFRows(new Uint8Array([1]),opts)];
  await assert.rejects(isolatedPDFRows(new Uint8Array([1]),opts),e=>e.status===503);
  for(const r of running)await assert.rejects(r,/too long/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
