// Receipt photos (owner's request 2026-11-12): kept in the installation's own file store, adults only, size-limited, deleted
// with the receipt. Exercised through the deployed worker entry point on the Docker host's SQLite, once with an in-memory
// store shaped like R2 and once with the Docker host's own file store. Fictional people and bytes only.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {openFileStore} from '../app/host/file-store.mjs';
import {blankState} from '../app/cloud/state.mjs';
import {maintainFiles} from '../app/cloud/files.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'bayit-receipt-photo-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile:join(scratch,'worker.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const worker=(await import(pathToFileURL(join(scratch,'worker.mjs')))).default;
after(()=>rm(scratch,{recursive:true,force:true}));
const origin='http://127.0.0.1:55803',jpeg=n=>{const b=new Uint8Array(n);b.set([0xFF,0xD8,0xFF,0xE0,0,16,74,70,73,70,0]);return b};
async function fixture(store){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const members=[{id:'p1',name:'Parent',role:'parent'},{id:'p2',name:'Partner',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
 const state=blankState('home','Fictional home',members[0]);state.members=members;for(const m of members)state.profiles[m.id]={name:m.name};
 state.shoppingLists.push({id:'fam',name:'Groceries',he:'מכולת',ownerId:'p1',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'});
 const other=blankState('other-home','Other home',{id:'outsider',name:'Outsider',role:'parent'}),now=new Date().toISOString();
 for(const actor of [...members,{id:'outsider',name:'Outsider'}])await DB.batch([
  DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(actor.id,actor.name,actor.id+'@example.test'),
  DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('session-'+actor.id,'token-'+actor.id,actor.id,new Date(Date.now()+86400000).toISOString())]);
 await DB.batch([DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Fictional home','p1',now),DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('other-home','Other home','outsider',now),
  ...members.map(m=>DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home',m.id,m.id,m.role,now)),DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('other-home','outsider','outsider','parent',now),
  DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state)),DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('other-home',JSON.stringify(other))]);
 const env={DB,FILES:store,AUTH_SECRET:'synthetic-receipt-photo-secret',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('fixture')}};
 const request=(actor,path,{method='GET',body,home='home',headers={}}={})=>worker.fetch(new Request(origin+path,{method,headers:{Cookie:'authjs.session-token=token-'+actor,Origin:origin,'X-Bayit-Household':home,...(body instanceof Uint8Array?{}:body?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined}),env);
 const read=async actor=>{const r=await request(actor,'/api/households/home/state');assert.equal(r.status,200);return r.json()};
 const change=async(actor,ops)=>request(actor,'/api/households/home/changes',{method:'POST',body:{baseRevision:(await read('p1')).revision,changes:ops}});
 const put=(actor,id,bytes,purpose='receipt')=>request(actor,'/api/files/'+id,{method:'PUT',body:bytes,headers:{'Content-Type':'image/jpeg','X-File-Name':'receipt.jpg',...(purpose?{'X-Bayit-Purpose':purpose}:{})}});
 return {env,DB,request,read,change,put};
}
const receipt=(id,fileId,ownerId='p1')=>({id,title:'Receipt',listId:'fam',ownerId,visibility:'family',allowedIds:[],store:'Fictional shop',total:12.5,currency:'ILS',shopDate:'2026-11-12',fileId,lines:[{raw:'bread 12.50',name:'bread',key:'bread',quantity:1,unit:'items',price:12.5}]});
const memory=()=>{const objects=new Map();return {objects,async put(key,b){objects.set(key,new Uint8Array(await new Response(b).arrayBuffer()))},async get(key){const v=objects.get(key);return v?{body:new Response(v).body}:null},async delete(key){objects.delete(key)}}};
for(const [name,make] of [['R2-shaped store',async()=>memory()],['Docker host file store',async()=>openFileStore(await mkdtemp(join(scratch,'files-')))]]){
 test('receipt photo, '+name+': adults only on upload, read and delete; deleted with the receipt',async()=>{
  const f=await fixture(await make()),id=crypto.randomUUID();
  assert.equal((await f.put('kid',crypto.randomUUID(),jpeg(2000))).status,403,'a child cannot upload a receipt photo');
  assert.equal((await f.put('p1',crypto.randomUUID(),jpeg(1600*1024))).status,413,'over 1.5 MB is refused');
  assert.equal((await f.put('p1',crypto.randomUUID(),new TextEncoder().encode('not an image'))).status>=400,true,'only an image');
  assert.equal((await f.put('p1',id,jpeg(4000))).status,201);
  assert.equal((await f.change('p1',[{collection:'receipts',id:'r1',value:receipt('r1',id)}])).status,200);
  assert.equal((await f.request('p1','/api/files/'+id)).status,200);
  assert.equal((await f.request('p2','/api/files/'+id)).status,200,'another adult who sees the receipt sees its photo');
  assert.equal((await f.request('kid','/api/files/'+id)).status,404,'never a child');
  assert.deepEqual((await f.read('kid')).data.receipts,[],'nor in a child\'s state');
  assert.equal((await f.request('outsider','/api/files/'+id,{home:'other-home'})).status,404);
  assert.equal((await f.change('p2',[{collection:'receipts',id:'r2',value:receipt('r2',id,'p2')}])).status,403,'someone else\'s photo cannot be attached');
  // A receipt's photo is kept by maintenance; a photo nobody used is removed after a day.
  const stray=crypto.randomUUID();assert.equal((await f.put('p1',stray,jpeg(3000))).status,201);
  await maintainFiles(f.env,Date.now()+2*86400000);
  const left=(await f.DB.prepare('SELECT id,deleting_at FROM files').all()).results;
  assert.ok(left.some(r=>r.id===id&&!r.deleting_at),'the receipt photo stays');assert.ok(!left.some(r=>r.id===stray),'the unused one is gone');
  assert.equal((await f.request('p1','/api/files/'+id,{method:'DELETE'})).status,409,'not while the receipt uses it');
  assert.equal((await f.request('kid','/api/files/'+id,{method:'DELETE'})).status,404);
  assert.equal((await f.change('p1',[{collection:'receipts',id:'r1',delete:true}])).status,200);
  assert.equal((await f.request('p1','/api/files/'+id,{method:'DELETE'})).status,200,'deleting the receipt, then its photo');
  assert.equal((await f.request('p1','/api/files/'+id)).status,404);
  f.DB.close();
 });
}
