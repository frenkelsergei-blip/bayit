// The photographed-note endpoint (2026-11-12) through the real worker: adults only, photos only, the household's own
// provider, a DRAFT back and nothing saved or added. Fake provider and fictional data only.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';import {blankState} from '../app/cloud/state.mjs';import {encryptKey} from '../app/cloud/util.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-note-'));await require('esbuild').build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile:join(scratch,'worker.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'silent',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});const worker=(await import(pathToFileURL(join(scratch,'worker.mjs')))).default;after(()=>rm(scratch,{recursive:true,force:true}));
const origin='http://127.0.0.1:55804',PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0]);
async function fixture(){const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);const state=blankState('home','Fictional',{id:'alice',name:'Alice',role:'parent'});state.members.push({id:'kid',name:'Kid',role:'child'});state.profiles.kid={name:'Kid'};const now=new Date().toISOString();
 for(const id of ['alice','kid'])await DB.batch([DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(id,id,id+'@example.test'),DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind(id,'token-'+id,id,new Date(Date.now()+864e5).toISOString())]);
 await DB.batch([DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Fictional','alice',now),...state.members.map(m=>DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home',m.id,m.id,m.role,now)),DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state))]);
 const env={DB,AUTH_SECRET:'synthetic-receipt-session-secret',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('fixture')}};
 await DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider) VALUES(?,?,?,?,1,?)').bind('home',await encryptKey('fake-not-a-provider-key',env,'home'),'fake-model','[]','anthropic').run();
 const call=(actor,body,headers={})=>worker.fetch(new Request(origin+'/api/shopping/note',{method:'POST',headers:{Cookie:'authjs.session-token=token-'+actor,Origin:origin,'X-Bayit-Household':'home','Content-Type':'application/octet-stream',...headers},body}),env);
 return {DB,env,call,close:()=>DB.close()}}

import {normalizeNote,noteRows} from '../shared/shopping-note.mjs';
import {rememberedNames,matchLines,normalizeReceipt} from '../shared/shopping-receipt.mjs';

test('a note is read into unique items; a non-list photo gives nothing',()=>{
 const n=normalizeNote({items:[{written:'חלב 2',title:'חלב',quantity:2},{written:'פיתות',title:'פיתות',unit:'packs',quantity:1},{written:'חלב',title:'חלב'},{written:'',title:''}]});
 assert.equal(n.items.length,2);assert.equal(n.items[0].quantity,2);assert.equal(n.items[1].unit,'packs');
 assert.throws(()=>normalizeNote({items:[]}));assert.throws(()=>normalizeNote({}));
 const rows=noteRows(n.items,[{id:'x',title:'חלב',done:false}]);assert.equal(rows[0].picked,false);assert.equal(rows[0].onList.id,'x');assert.equal(rows[1].picked,true);
});
test('receipt "Correct?" is asked once: a confirmed line is remembered for the next receipt',()=>{
 const first=normalizeReceipt({store:'s',lines:[{raw:'יוגורט פרי 4*150',name:'יוגורט פרי',price:18.9}]});
 const asked=matchLines(first.lines,[]);assert.equal(asked[0].sure,false);
 const saved=[{createdAt:'2026-11-01',lines:[{...asked[0],name:'יוגורט',key:'yogurt',confirmed:true}]}];
 const next=matchLines(normalizeReceipt({store:'s',lines:[{raw:'יוגורט  פרי 4*150',name:'משהו אחר',price:19.9}]}).lines,[],rememberedNames(saved));
 assert.equal(next[0].sure,true);assert.equal(next[0].name,'יוגורט');assert.equal(next[0].confirmed,true);
 assert.equal(matchLines(first.lines,[],rememberedNames([{lines:[{raw:'יוגורט פרי 4*150',name:'x'}]}]))[0].sure,false,'an unconfirmed line is not remembered');
});
test('note endpoint: adults only, photos only, a draft and nothing saved',async t=>{const original=globalThis.fetch;let calls=0,captured='',headers={},good={items:[{written:'חלב 2',title:'חלב',quantity:2},{written:'דבש',title:'דבש'}]},input=good;
 globalThis.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/api.anthropic.com\//);calls++;captured=options.body;headers=Object.fromEntries(new Headers(options.headers));return new Response(JSON.stringify({content:[{type:'tool_use',name:'read_shopping_note',input}],stop_reason:'tool_use'}),{headers:{'Content-Type':'application/json'}})};
 try{
  await t.test('a child cannot send a note to the AI',async()=>{const f=await fixture();try{const n=calls;assert.equal((await f.call('kid',PNG)).status,403);assert.equal(calls,n)}finally{f.close()}});
  await t.test('an adult gets a draft; nothing is added or stored',async()=>{const f=await fixture();try{const before=(await f.DB.prepare('SELECT state FROM household_data').first()).state;const r=await f.call('alice',PNG,{'X-Bayit-Language':'he'});assert.equal(r.status,200,await r.clone().text());const d=await r.json();assert.equal(d.draftOnly,true);assert.equal(d.items.length,2);assert.match(JSON.parse(captured).system,/UNTRUSTED DATA/);assert.equal(headers.authorization,'Bearer fake-not-a-provider-key');assert.equal((await f.DB.prepare('SELECT state FROM household_data').first()).state,before);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM files').first()).n,0)}finally{f.close()}});
  await t.test('no AI connected or not a photo fails honestly before the provider',async()=>{const f=await fixture();try{const n=calls;assert.equal((await f.call('alice',new TextEncoder().encode('hello'))).status,415);await f.DB.prepare('DELETE FROM household_secrets').run();const r=await f.call('alice',PNG);assert.equal(r.status,409);assert.match((await r.json()).error,/Connect/);assert.equal(calls,n)}finally{f.close()}});
  await t.test('an empty or unreadable answer is refused, never shown as a result',async()=>{const f=await fixture();try{input={items:[]};assert.equal((await f.call('alice',PNG)).status,422)}finally{input=good;f.close()}});
  await t.test('other sites and oversized photos are refused before the provider',async()=>{const f=await fixture();try{const n=calls;assert.equal((await f.call('alice',PNG,{Origin:'https://foreign.example'})).status,403);assert.equal((await f.call('alice',new Uint8Array(5*1024*1024+1))).status,413);assert.equal(calls,n)}finally{f.close()}});
 }finally{globalThis.fetch=original}});
