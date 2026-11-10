// Host conformance suite: what any place that runs Bayit must provide (docs/host-contract.md).
// Not a test file on its own. A host's test file calls runHostConformance(host); tests/host.test.mjs runs it
// against the Node/Docker host and, for the database and file store, against Cloudflare's local D1/R2 (Miniflare).
//
// host = {
//  name, skip?,                         // label; a string skips every check with that reason
//  database(): DB,                      // a fresh, empty D1-compatible database (env.DB)
//  migrate?(DB): string[],              // applies app/cloud/migrations once each, returns the names applied
//  files?(): FILES,                     // a fresh, empty R2-compatible store (env.FILES)
//  fileKeysArePaths?: true,             // the store maps keys to a file system and must refuse escaping keys
//  installation?(): {secrets(), cleanup()},   // first-start key generation; secrets() is called twice
//  outboundFetch?(env): fetch|null,     // env.OUTBOUND_FETCH; null when the platform itself enforces the policy
//  pdfReader?(): (bytes)=>rows,         // the isolated statement reader the host installs
//  serve?({staticDir}): {origin, stop(), dataDir?},   // the whole host process on a loopback address
// }
// A check whose hook the host does not provide is skipped and says so; docs/host-contract.md lists which are required.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../app/cloud/worker.mjs';
import {encryptKey,decryptKey} from '../app/cloud/util.mjs';
import {externalFetch} from '../app/cloud/outbound.mjs';

export const MIGRATIONS=new URL('../app/cloud/migrations',import.meta.url).pathname;

// A one-page PDF with real text, built in memory so no fixture file is needed.
export function tinyPDF(lines){
 const content=lines.map((t,i)=>'BT /F1 12 Tf 72 '+(720-i*20)+' Td ('+t+') Tj ET').join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let out='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});
 const xref=out.length;out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return new TextEncoder().encode(out);
}

// Raw HTTP, so the Host header can be chosen.
export function rawRequest(origin,path,{method='GET',headers={}}={}){
 const u=new URL(origin);
 return new Promise((resolve,reject)=>{const req=http.request({hostname:u.hostname,port:u.port,path,method,headers:{Host:u.host,...headers}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}))});req.on('error',reject);req.end()});
}

async function loopbackServer(handler){
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};
}

export function runHostConformance(host){
 const check=(name,needs,fn)=>{const missing=needs.filter(k=>typeof host[k]!=='function');test(host.name+' host: '+name,{skip:host.skip||(missing.length?'this host provides no '+missing.join(', '):false)},fn)};
 const close=db=>{try{db.close?.()}catch{}};

 // ---- Database (env.DB): the D1 subset the server and @auth/d1-adapter use ----
 check('database: prepare, bind, first, all and run return D1 result shapes',['database'],async()=>{
  const db=await host.database();try{
   await db.prepare('CREATE TABLE t(id TEXT PRIMARY KEY, n INTEGER, flag INTEGER)').run();
   const r=await db.prepare('INSERT INTO t VALUES(?,?,?)').bind('a',1,true).run();
   assert.equal(r.success,true);assert.equal(r.meta.changes,1);assert.deepEqual(r.results,[]);
   assert.equal((await db.prepare('INSERT OR IGNORE INTO t VALUES(?,?,?)').bind('a',2,false).run()).meta.changes,0);
   assert.deepEqual({...await db.prepare('SELECT * FROM t WHERE id=?').bind('a').first()},{id:'a',n:1,flag:1},'booleans are stored as 1/0');
   assert.equal(await db.prepare('SELECT n FROM t WHERE id=?').bind('a').first('n'),1);
   assert.equal(await db.prepare('SELECT * FROM t WHERE id=?').bind('zz').first(),null);
   assert.equal(await db.prepare('SELECT n FROM t WHERE id=?').bind('zz').first('n'),null);
   await db.prepare('INSERT INTO t VALUES(?,?,?)').bind('b',null,null).run();
   const all=await db.prepare('SELECT * FROM t ORDER BY id').all();
   assert.equal(all.success,true);assert.equal(all.results.length,2);assert.equal(all.results[1].n,null);
   const s=db.prepare('SELECT id FROM t WHERE id=?');
   assert.equal(await s.bind('a').first('id'),'a');assert.equal(await s.bind('b').first('id'),'b','bind returns an independent statement');
   assert.equal((await db.prepare('UPDATE t SET n=5').run()).meta.changes,2);
  }finally{close(db)}
 });
 check('database: upserts with RETURNING (leases and rate limits) through first() and run()',['database'],async()=>{
  const db=await host.database();try{
   await db.prepare('CREATE TABLE l(name TEXT PRIMARY KEY, token TEXT, expires_at INTEGER)').run();
   const take=(token,now)=>db.prepare('INSERT INTO l(name,token,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE l.expires_at<? RETURNING token').bind('tick',token,now+1000,now).first();
   assert.equal((await take('one',0))?.token,'one');assert.equal(await take('two',10),null,'a live lease is not taken over');assert.equal((await take('three',5000))?.token,'three');
   const counted=await db.prepare("INSERT INTO l(name,token,expires_at) VALUES('c','1',0) ON CONFLICT(name) DO UPDATE SET token=token||'1' RETURNING token").run();
   assert.equal(counted.success,true);assert.equal(counted.results[0].token,'1');
  }finally{close(db)}
 });
 check('database: batch() is one transaction and returns one result per statement',['database'],async()=>{
  const db=await host.database();try{
   await db.prepare('CREATE TABLE t(id TEXT PRIMARY KEY, n INTEGER)').run();
   await db.batch([db.prepare('INSERT INTO t VALUES(?,?)').bind('a',1),db.prepare('INSERT INTO t VALUES(?,?)').bind('b',1)]);
   await assert.rejects(db.batch([db.prepare('UPDATE t SET n=9 WHERE id=?').bind('a'),db.prepare('INSERT INTO t VALUES(?,?)').bind('a',3)]),/UNIQUE/);
   assert.equal(await db.prepare('SELECT n FROM t WHERE id=?').bind('a').first('n'),1,'a failed batch changes nothing');
   const out=await db.batch([db.prepare('UPDATE t SET n=n+1').bind(),db.prepare('SELECT COUNT(*) c FROM t').bind()]);
   assert.equal(out.length,2);assert.equal(out[0].meta.changes,2);assert.equal(out[1].results[0].c,2);
  }finally{close(db)}
 });
 check('database: the SQLite dialect the server relies on (JSON1, sqlite_master, rowid, upsert)',['database'],async()=>{
  const db=await host.database();try{
   await db.prepare('CREATE TABLE h(id TEXT PRIMARY KEY, state TEXT)').run();
   await db.prepare('INSERT INTO h VALUES(?,?)').bind('home',JSON.stringify({documents:[{fileId:'f1'},{fileId:null}],vault:{a:1}})).run();
   assert.equal(await db.prepare("SELECT COUNT(*) c FROM h, json_each(h.state,'$.documents') d WHERE json_extract(d.value,'$.fileId') IS NOT NULL").first('c'),1);
   assert.equal(await db.prepare("SELECT json_type(state,'$.vault') t FROM h").first('t'),'object');
   assert.ok((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.some(r=>r.name==='h'));
   const row=await db.prepare('SELECT rowid AS r,* FROM h').first();assert.equal(typeof row.r,'number');
   await db.prepare('INSERT INTO h VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').bind('home','{}').run();
   assert.equal(await db.prepare('SELECT state FROM h').first('state'),'{}');
  }finally{close(db)}
 });

 // ---- Migrations: the host applies app/cloud/migrations and records them in d1_migrations ----
 check('migrations run in order, once each, and are recorded in d1_migrations',['database','migrate'],async()=>{
  const db=await host.database();try{
   const first=await host.migrate(db);assert.ok(first.includes('0001.sql')&&first.includes('0006_finance_connections.sql')&&first.includes('0009_security.sql'));
   assert.deepEqual(await host.migrate(db),[],'nothing runs twice');
   assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='finance_connections'").first());
   assert.equal(await db.prepare('SELECT name FROM d1_migrations WHERE name=?').bind('0009_security.sql').first('name'),'0009_security.sql');
  }finally{close(db)}
 });
 check('an unmigrated database refuses changes; a migrated one is ready and runs a full scheduler tick',['database','migrate'],async()=>{
  const empty=await host.database(),db=await host.database(),secret='conformance-scheduler-secret-0123456789';
  try{
   const base={REMINDER_CRON_SECRET:secret,ASSETS:{fetch:()=>new Response('static')},...(host.files?{FILES:await host.files()}:{})};
   const before=await worker.fetch(new Request('https://home.example/api/health'),{...base,DB:empty});
   assert.equal(before.status,503);assert.equal((await before.json()).code,'SCHEMA_UPDATE_REQUIRED');
   await host.migrate(db);const env={...base,DB:db};
   const health=await worker.fetch(new Request('https://home.example/api/health'),env);assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
   const tick=token=>worker.fetch(new Request('https://home.example/api/internal/reminders',{method:'POST',headers:{Authorization:'Bearer '+token}}),env);
   assert.equal((await tick('wrong-secret-wrong-secret-wrong')).status,401);
   const ran=await tick(secret);assert.equal(ran.status,200);const result=await ran.json();assert.equal(typeof result.sent,'number');
   assert.equal((await tick(secret)).status,200,'the tick releases its lease');
  }finally{close(empty);close(db)}
 });

 // ---- File store (env.FILES): the R2 subset used for private attachments ----
 check('file store keeps content, type and size; get/head of a missing key is null; delete removes it',['files'],async()=>{
  const files=await host.files();
  const put=await files.put('households/h1/doc',new TextEncoder().encode('hello'),{httpMetadata:{contentType:'application/pdf'}});
  assert.equal(put.key,'households/h1/doc');assert.equal(put.size,5);
  const got=await files.get('households/h1/doc');assert.equal(await new Response(got.body).text(),'hello');assert.equal(got.httpMetadata.contentType,'application/pdf');assert.equal(got.size,5);
  const head=await files.head('households/h1/doc');assert.equal(head.size,5);assert.equal(head.httpMetadata.contentType,'application/pdf');
  assert.equal(await files.get('households/h1/missing'),null);assert.equal(await files.head('households/h1/missing'),null);
  await files.put('households/h1/doc',new TextEncoder().encode('replaced'),{httpMetadata:{contentType:'image/png'}});
  const again=await files.get('households/h1/doc');assert.equal(await new Response(again.body).text(),'replaced');assert.equal(again.httpMetadata.contentType,'image/png');
  await files.delete('households/h1/doc');assert.equal(await files.get('households/h1/doc'),null);
  await files.delete('households/h1/never-existed');
  if(host.fileKeysArePaths)await assert.rejects(files.put('../escape','x'),/Invalid file key/);
 });

 // ---- Installation secrets: generated once, kept, never silently replaced ----
 check('installation secrets have the required lengths, persist across restarts and encrypt credentials',['installation'],async()=>{
  const install=await host.installation();try{
   const first=await install.secrets(),second=await install.secrets();
   assert.ok(first.AUTH_SECRET.length>=32);assert.ok(first.REMINDER_CRON_SECRET.length>=24);assert.equal(Buffer.from(first.APP_ENCRYPTION_KEY,'base64').length,32);
   assert.deepEqual(second,first,'a restart keeps the same keys');
   const cipher=await encryptKey('synthetic provider key',first,'home');assert.equal(await decryptKey(cipher,second,'home'),'synthetic provider key');
  }finally{await install.cleanup?.()}
 });

 // ---- Outbound requests (env.OUTBOUND_FETCH) ----
 check('outbound fetch refuses plain http, credentials in the address and private or reserved addresses',['outboundFetch'],async t=>{
  const run=host.outboundFetch({});if(!run)return t.skip('the platform enforces the outbound policy');
  for(const url of ['http://example.com/','https://user:pw@example.com/','https://127.0.0.1/','https://10.1.2.3/','https://192.168.1.1/','https://169.254.169.254/latest','https://100.64.0.1/','https://[::1]/'])
   await assert.rejects(run(url,{signal:AbortSignal.timeout(2000)}),/not allowed|private|reserved/,url);
 });
 check('outbound fetch returns provider responses and never follows redirects',['outboundFetch'],async t=>{
  const server=await loopbackServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:'https://elsewhere.example/'});res.end()}else{res.writeHead(201,{'Content-Type':'application/json','X-Probe':'yes'});res.end(JSON.stringify({ok:true,method:req.method,auth:req.headers.authorization||null}))}});
  try{
   const env={TELEGRAM_API_ORIGIN:server.origin},run=host.outboundFetch(env);if(!run)return t.skip('the platform enforces the outbound policy');
   const ok=await run(server.origin+'/ok',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
   assert.equal(ok.status,201);assert.equal(ok.headers.get('X-Probe'),'yes');assert.deepEqual(await ok.json(),{ok:true,method:'POST',auth:'Bearer fictional'});
   await assert.rejects(externalFetch({...env,OUTBOUND_FETCH:run},server.origin+'/redirect'),/redirects are not allowed/);
  }finally{await server.close()}
 });

 // ---- Isolated statement reader ----
 check('the PDF reader returns positioned text rows and refuses non-PDF and oversized input',['pdfReader'],async()=>{
  const read=host.pdfReader();
  const rows=await read(tinyPDF(['Synthetic line one','Total 123.45']));
  assert.deepEqual(rows.map(r=>r.text),['Synthetic line one','Total 123.45']);assert.equal(rows[0].page,1);
  await assert.rejects(read(new TextEncoder().encode('not a pdf')),e=>e.status===415);
  const big=new Uint8Array(5_000_001);big.set([0x25,0x50,0x44,0x46]);await assert.rejects(read(big),e=>e.status===413);
 });

 // ---- The host process: static files, headers, origin checks ----
 check('the running host serves the app, its API and security headers, and refuses unknown hosts',['serve'],async()=>{
  const staticDir=await mkdtemp(join(tmpdir(),'bayit-conformance-static-'));
  await mkdir(join(staticDir,'assets'));await writeFile(join(staticDir,'index.html'),'<!doctype html><title>conformance</title>');await writeFile(join(staticDir,'assets','app-Abcdefgh12.js'),'export{}');
  const served=await host.serve({staticDir});
  try{
   const health=await rawRequest(served.origin,'/api/health');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).ok,true);
   const config=JSON.parse((await rawRequest(served.origin,'/api/config')).body);assert.equal(config.installation.ready,true);assert.equal(config.publicOrigin,served.origin);
   const page=await rawRequest(served.origin,'/');
   assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);assert.match(page.body,/conformance/);
   assert.match(page.headers['content-security-policy'],/object-src 'none'/);assert.equal(page.headers['x-frame-options'],'DENY');assert.equal(page.headers['x-content-type-options'],'nosniff');
   assert.equal(page.headers['referrer-policy'],'strict-origin-when-cross-origin');assert.match(page.headers['permissions-policy'],/camera=\(\)/);
   if(served.origin.startsWith('http:'))assert.equal(page.headers['strict-transport-security'],undefined);
   const deep=await rawRequest(served.origin,'/settings/connections');assert.equal(deep.status,200);assert.match(deep.body,/conformance/,'single-page-app fallback');
   assert.equal((await rawRequest(served.origin,'/missing.js')).status,404,'a missing asset is not the app page');
   const asset=await rawRequest(served.origin,'/assets/app-Abcdefgh12.js');assert.equal(asset.status,200);assert.match(asset.headers['cache-control'],/immutable/);
   const head=await rawRequest(served.origin,'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');
   for(const path of ['/%2e%2e/secrets.json','/..%2fsecrets.json','/../bayit.sqlite']){const r=await rawRequest(served.origin,path);assert.doesNotMatch(r.body,/AUTH_SECRET|SQLite format/,path)}
   assert.equal((await rawRequest(served.origin,'/api/health',{headers:{Host:'attacker.example'}})).status,421);
  }finally{await served.stop();await rm(staticDir,{recursive:true,force:true})}
 });
}
