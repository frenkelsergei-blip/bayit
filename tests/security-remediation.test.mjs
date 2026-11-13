import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {steadyClock} from './fixtures/steady-clock.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {blankState,visibleState,applyChanges,diffState} from '../app/cloud/state.mjs';
import {inertDocument,uploadType} from '../shared/safe-media.mjs';
import {validateRecord,safePhoto} from '../shared/state-validation.mjs';
import {rebaseChanges} from '../shared/change-merge.mjs';
import {customProviderURL,pushEndpoint,boundedJSON,externalFetch} from '../app/cloud/outbound.mjs';
import {createOutboundFetch} from '../app/host/outbound-fetch.mjs';
import {authorizeChildInvitation,authorizeChildJoin,telegramLinkIdentity,authorizeTelegramClaim,claimTelegramLink,ownAccountInvitation} from '../app/cloud/child-identity.mjs';
import {currentSession,requireRecent,lease,maintenance,limit} from '../app/cloud/security.mjs';
import {signInAllowed,invitationPermit,canCreateHousehold} from '../app/cloud/registration.mjs';
import {handleFiles,maintainFiles} from '../app/cloud/files.mjs';
import {hash} from '../app/cloud/util.mjs';
import {boundedPDFRows} from '../app/cloud/statement-pdf.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-security-regressions-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile:join(scratch,'worker.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const worker=(await import(pathToFileURL(join(scratch,'worker.mjs')))).default;
after(()=>rm(scratch,{recursive:true,force:true}));
const origin='http://127.0.0.1:55801',parent={id:'owner',name:'Owner',role:'parent'},kid={id:'kid',name:'Kid',role:'child'};
async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const state=blankState('home','Fictional home',parent);state.members.push(kid,{id:'other',name:'Other',role:'adult'});state.profiles.kid={name:'Kid',xp:0};state.profiles.other={name:'Other'};
 const now=new Date().toISOString();await DB.batch([
 DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind('owner','Owner','owner@example.test'),
 DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Home','owner',now),
 DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home','owner','owner','parent',now),
 DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state)),
 DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('session-owner','fixture-token','owner',new Date(Date.now()+86400000).toISOString())]);
 const objects=new Map(),FILES={async put(k,b){objects.set(k,new Uint8Array(b))},async get(k){const b=objects.get(k);return b?{body:new Response(b).body}:null},async delete(k){objects.delete(k)}};
 const env={DB,FILES,AUTH_SECRET:'synthetic-auth-secret-for-regressions',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',APP_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64'),BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}};
 return {env,DB,objects,home:{id:'home',state,revision:0,membership:{member_id:'owner',role:'parent'}},async persist(revision=0){await DB.prepare('UPDATE household_data SET state=?,revision=? WHERE household_id=\'home\'').bind(JSON.stringify(state),revision).run()},close:()=>DB.close()};
}
const req=(path,{method='GET',body,headers={}}={})=>new Request(origin+path,{method,headers:{Cookie:'authjs.session-token=fixture-token',Origin:origin,'X-Bayit-Household':'home',...(body instanceof Uint8Array?{}:body?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});
const note=(id,ownerId='kid')=>({id,title:'PRIVATE SENTINEL',text:'Secret',date:'2026-11-06',ownerId,visibility:'private',allowedIds:[]});

test('SEC-15: uploaded HTML cannot masquerade as a preview; data URLs are refused by the actual household handler',async()=>{
 const html=new TextEncoder().encode('<html><script>opener.postMessage("proof","*")</script></html>');assert.throws(()=>uploadType(html,'image/png'));
 const inert=await inertDocument(new Blob([html],{type:'image/png'}));assert.equal(inert.canPreview,false);assert.equal(inert.blob.type,'application/octet-stream');
 const f=await fixture();try{const document={id:'doc',title:'Hostile',ownerId:'owner',visibility:'family',allowedIds:[],sampleUrl:'data:text/html,<script>alert(1)</script>',mime:'image/png'};
 const r=await worker.fetch(req('/api/households/home/changes',{method:'POST',body:{baseRevision:0,changes:[{collection:'documents',id:'doc',value:document}]}}),f.env);assert.equal(r.status,400);assert.match((await r.json()).error,/sampleUrl/);
 }finally{f.close()}
});

test('SEC-01: arbitrary URLs, private addresses and redirects fail before credentials or Push payloads are sent',async()=>{
 for(const url of ['http://127.0.0.1:8000','https://127.0.0.1','https://0x7f000001','https://[::1]','https://example.test/api','https://api.groq.com@evil.test'])assert.throws(()=>customProviderURL({},url));
 for(const url of ['http://127.0.0.1:8000/x','https://example.test/push','https://fcm.googleapis.com:8443/push'])assert.throws(()=>pushEndpoint({},url));
 assert.equal(customProviderURL({},'https://api.groq.com/openai/v1'),'https://api.groq.com/openai/v1');assert.equal(pushEndpoint({},'https://fcm.googleapis.com/fcm/send/fictional'),'https://fcm.googleapis.com/fcm/send/fictional');
 await assert.rejects(externalFetch({},'https://api.groq.com',{},async()=>new Response(null,{status:302,headers:{Location:'https://private.test'}})),/redirect/);
 await assert.rejects(boundedJSON(new Response('x'.repeat(101)),100),/too large/);
 let sent=false;await assert.rejects(createOutboundFetch({},{resolve:async()=>[{address:'10.0.0.1',family:4}],httpsRequest:()=>{sent=true}})('https://operator-approved.example'),/private/);assert.equal(sent,false);
});

test('SEC-02: parent-issued Google and Telegram links cannot assume an existing private child identity',async()=>{
 const f=await fixture();try{f.home.state.notes.push(note('private'));await f.persist();
 await assert.rejects(authorizeChildInvitation(f.env,f.home,'kid'),/own identity/);await assert.rejects(authorizeChildJoin(f.env,f.home,{member_id:'kid'}, {id:'attacker'}),/own identity/);await assert.rejects(telegramLinkIdentity(f.env,f.home,'kid','owner'),/own identity/);
 const r=await worker.fetch(req('/api/family/invitations',{method:'POST',body:{role:'child',memberId:'kid'}}),f.env);assert.equal(r.status,403);
 }finally{f.close()}
});

test('SEC-02: an identity check and a concurrent private-state change cannot race a Telegram claim',async()=>{
 const f=await fixture();try{const token='synthetic-link',tokenHash=await hash(token);await f.DB.prepare('INSERT INTO telegram_link_tokens(token_hash,household_id,member_id,created_by,expires_at) VALUES(?,?,?,?,?)').bind(tokenHash,'home','kid','owner',Date.now()+60000).run();const row=await f.DB.prepare('SELECT * FROM telegram_link_tokens').first();
 await authorizeTelegramClaim(f.env,f.home,row,'123');f.home.state.notes.push(note('new-private'));await f.persist(1);
 assert.equal(await claimTelegramLink(f.env,f.home,row,tokenHash,'123','123','Test'),false);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM telegram_links').first()).n,0);assert.equal((await f.DB.prepare('SELECT used_at FROM telegram_link_tokens').first()).used_at,null);
 }finally{f.close()}
});

test('SEC-02: initial child linking works; rebinding requires the same Telegram user and the child can invite their own Google identity',async()=>{
 const f=await fixture();try{const tokenHash=await hash('first');await f.DB.prepare('INSERT INTO telegram_link_tokens(token_hash,household_id,member_id,created_by,expires_at) VALUES(?,?,?,?,?)').bind(tokenHash,'home','kid','owner',Date.now()+60000).run();const row=await f.DB.prepare('SELECT * FROM telegram_link_tokens').first();assert.equal(await claimTelegramLink(f.env,f.home,row,tokenHash,'123','123','Kid'),true);
 assert.equal(await telegramLinkIdentity(f.env,f.home,'kid','owner'),'123');await assert.rejects(authorizeTelegramClaim(f.env,f.home,row,'999'),/already linked/);
 const link=await ownAccountInvitation(f.env,f.home,'kid','123',origin),invite=await f.DB.prepare('SELECT * FROM invitations WHERE token_hash=?').bind(await hash(new URLSearchParams(new URL(link).hash.split('?')[1]).get('invite'))).first();assert.equal(invite.identity_verified,1);await authorizeChildJoin(f.env,f.home,invite,{id:'child-google'});
 await f.DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home','child-google','kid','child',new Date().toISOString()).run();assert.equal((await f.DB.prepare("SELECT COUNT(*) AS n FROM telegram_links WHERE member_id='kid'").first()).n,0,'Google enrollment revokes the pre-enrollment Telegram chat');assert.equal((await f.DB.prepare("SELECT telegram_user_id FROM member_identities WHERE member_id='kid'").first()).telegram_user_id,null);await assert.rejects(telegramLinkIdentity(f.env,f.home,'kid','owner'),/own identity/);assert.equal(await telegramLinkIdentity(f.env,f.home,'kid','child-google'),null);
 await f.DB.prepare('DELETE FROM memberships WHERE user_id=?').bind('child-google').run();await assert.rejects(f.DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home','other-google','kid','child',new Date().toISOString()).run(),/another identity/);
 }finally{f.close()}
});

test('SEC-05/06: child budgets, history and purchases follow current source and list permissions',async()=>{
 const f=await fixture();try{const s=f.home.state;s.preferences.monthlyBudget=123456;s.tasks.push({...note('task','owner'),visibility:'family',memberId:'kid'});s.history.push({...note('hist','owner'),visibility:'family',taskId:'task'});assert.equal(visibleState(s,'other').history.length,1);s.tasks[0].visibility='private';assert.equal(visibleState(s,'other').history.length,0);assert.equal(visibleState(s,'owner').history.length,1);assert.equal(visibleState(s,'kid').preferences.monthlyBudget,undefined);
 s.shoppingLists[0].visibility='private';s.shopping.push({...note('item','owner'),visibility:'family',listId:'week'});s.purchases.push({...s.shopping[0]});assert.equal(visibleState(s,'other').purchases.length,0);
 }finally{f.close()}
});

test('SEC-07/23: malformed UI values and arbitrary profile trackers are refused, while real expense fields remain typed',()=>{
 assert.throws(()=>validateRecord('notes',{id:'a',title:{payload:1}}));assert.throws(()=>validateRecord('documents',{id:'a',sampleUrl:'https://evil.test'}));assert.throws(()=>safePhoto('https://evil.test/pixel.jpg'));
 validateRecord('expenses',{id:'e',title:'Saving',amount:20,flow:'savings',notes:'Fictional note',documentId:'d',receiptDocumentId:'d',billId:'b'});assert.throws(()=>validateRecord('expenses',{id:'e',documentId:{bad:1}}));
 assert.equal(safePhoto('https://lh3.googleusercontent.com/example',{accountImage:'https://lh3.googleusercontent.com/example'}),'https://lh3.googleusercontent.com/example');assert.throws(()=>safePhoto('https://lh3.googleusercontent.com/example',{accountImage:'https://lh3.googleusercontent.com/other'}));
});

test('SEC-08: independent fields merge, but the same field and any changed audience require a fresh review',()=>{
 const old={tasks:[{id:'t',title:'Old',note:'Before',ownerId:'one',visibility:'family',allowedIds:[]}]},after=structuredClone(old);after.tasks[0].title='Mine';const changes=diffState(old,after),fresh=structuredClone(old);fresh.tasks[0].note='Other device';assert.equal(rebaseChanges(changes,fresh)[0].value.note,'Other device');fresh.tasks[0].title='Their title';assert.throws(()=>rebaseChanges(changes,fresh),/Reopen/);fresh.tasks[0].title='Old';fresh.tasks[0].visibility='private';assert.throws(()=>rebaseChanges(changes,fresh),/Reopen/);
});

test('SEC-09: concurrent uploads reserve the exact remaining quota; a failed metadata commit removes the blob and reservation',async()=>{
 const f=await fixture();try{await f.DB.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,NULL)').bind(crypto.randomUUID(),'home','owner','old','old.bin','application/octet-stream',99*1024*1024,new Date().toISOString()).run();const ids=[crypto.randomUUID(),crypto.randomUUID()],bytes=new Uint8Array(1024*1024);
 const results=await Promise.allSettled(ids.map(id=>handleFiles(req('/api/files/'+id,{method:'PUT',body:bytes}),f.env,f.home,id)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,413);const quota=await f.DB.prepare('SELECT * FROM file_quotas').first();assert.equal(quota.used_bytes,100*1024*1024);assert.equal(quota.reserved_bytes,0);assert.equal(f.objects.size,1);
 }finally{f.close()}
 const g=await fixture();try{g.DB.raw.exec("CREATE TRIGGER refuse_file BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT,'synthetic storage failure');END");const id=crypto.randomUUID();await assert.rejects(handleFiles(req('/api/files/'+id,{method:'PUT',body:new Uint8Array([1,2,3])}),g.env,g.home,id));assert.equal(g.objects.size,0);assert.equal((await g.DB.prepare('SELECT reserved_bytes FROM file_quotas').first()).reserved_bytes,0)}finally{g.close()}
});

test('SEC-09: attachment deletion refuses retained references, then deletes physical content and releases quota',async()=>{
 const f=await fixture();try{const id=crypto.randomUUID();await handleFiles(req('/api/files/'+id,{method:'PUT',body:new TextEncoder().encode('Fictional file'),headers:{'Content-Type':'text/plain'}}),f.env,f.home,id);f.home.state.documents.push({id:'doc',fileId:id,title:'Attachment',ownerId:'owner',visibility:'private',allowedIds:[],deletedAt:'2026-11-06'});await f.persist();
 await assert.rejects(handleFiles(req('/api/files/'+id,{method:'DELETE'}),f.env,f.home,id),e=>e.status===409);f.home.state.documents=[];await f.persist();assert.equal((await handleFiles(req('/api/files/'+id,{method:'DELETE'}),f.env,f.home,id)).status,200);assert.equal(f.objects.size,0);assert.equal((await f.DB.prepare('SELECT used_bytes FROM file_quotas').first()).used_bytes,0);
 }finally{f.close()}
});

test('SEC-10/12: expired preview payloads and Telegram turns are removed; session deletion removes its Push subscription',async()=>{
 const f=await fixture();try{await f.DB.prepare("INSERT INTO finance_imports(id,household_id,owner_id,source,kind,status,payload,created_at) VALUES('expired','home','owner','max','card','pending','PRIVATE PAYLOAD',?)").bind(Date.now()-2*86400000).run();await f.DB.prepare("INSERT INTO finance_imports(id,household_id,owner_id,source,kind,status,payload,created_at) VALUES('fresh','home','owner','max','card','pending','CURRENT PAYLOAD',?)").bind(Date.now()).run();
 await f.DB.prepare("INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at,turns,turns_at) VALUES('home','owner','123','123','Owner','now','PRIVATE TURN',?)").bind(Date.now()-3600000).run();
 await f.DB.prepare("INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,device,created_at,session_id) VALUES('push','home','owner','https://fcm.googleapis.com/fixture','fake','fake','fixture',0,'session-owner')").run();
 await maintenance(f.env);assert.equal((await f.DB.prepare("SELECT COUNT(*) AS n FROM finance_imports WHERE id='expired'").first()).n,0);assert.equal((await f.DB.prepare("SELECT COUNT(*) AS n FROM finance_imports WHERE id='fresh'").first()).n,1);assert.equal((await f.DB.prepare('SELECT turns FROM telegram_links').first()).turns,null);
 await f.DB.prepare("DELETE FROM sessions WHERE id='session-owner'").run();assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first()).n,0);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM session_auth').first()).n,0);
 }finally{f.close()}
});

test('SEC-03/17/22: private installation registration, invitation permits, security headers and recent authentication are enforced',async()=>{
 const f=await fixture();try{assert.equal(await signInAllowed(f.env,{email:'stranger@example.test',email_verified:true},req('/api/auth/callback/google')),false);assert.equal(await signInAllowed(f.env,{email:'owner@example.test',email_verified:true},req('/api/auth/callback/google')),true);await assert.rejects(canCreateHousehold(f.env,{id:'stranger',email:'stranger@example.test'}),/owner/);
 const token='valid-invitation';await f.DB.prepare('INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token),'home','adult','owner',Date.now()+60000).run();const permit=await invitationPermit(req('/api/registration/invitation',{method:'POST',body:{token}}),f.env),cookie=permit.headers.get('Set-Cookie').split(';')[0];assert.match(permit.headers.get('Set-Cookie'),/HttpOnly/);assert.equal(await signInAllowed(f.env,{email:'invited@example.test',email_verified:true},new Request(origin+'/api/auth/callback/google',{headers:{Cookie:cookie}})),true);
 assert.ok(await requireRecent(req('/api/session'),f.env,{id:'owner'}));await f.DB.prepare('UPDATE session_auth SET authenticated_at=0').run();await assert.rejects(requireRecent(req('/api/session'),f.env,{id:'owner'}),e=>e.code==='REAUTH_REQUIRED');
 const response=await worker.fetch(new Request('https://home.example/'),f.env);assert.match(response.headers.get('Content-Security-Policy'),/object-src 'none'/);assert.doesNotMatch(response.headers.get('Content-Security-Policy'),/script-src[^;]*unsafe-inline/);assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
 }finally{f.close()}
});

test('SEC-20: scheduler leases, request quotas and PDF bounds fail closed and release parser resources',async()=>{
 const f=await fixture();try{const first=await lease(f.env,'tick');assert.ok(first);assert.equal(await lease(f.env,'tick'),null);await first();assert.ok(await lease(f.env,'tick'));await steadyClock(async()=>{await limit(f.env,'test',{max:1});await assert.rejects(limit(f.env,'test',{max:1}),e=>e.status===429)}) /* same minute (fixtures/steady-clock.mjs) */}finally{f.close()}
 const bytes=new TextEncoder().encode('%PDF-fixture');let destroyed=0;await assert.rejects(boundedPDFRows(bytes,async()=>({numPages:41,destroy:async()=>destroyed++})),/pages/);assert.equal(destroyed,1);await assert.rejects(boundedPDFRows(bytes,async()=>({numPages:1,getPage:async()=>({getTextContent:async()=>{throw Error('bad content')}}),destroy:async()=>destroyed++})));assert.equal(destroyed,2);
});

test('SEC-06: AI receipts do not retain another person’s revoked or deleted source snapshots',async()=>{
 const f=await fixture();try{const shared={...note('shared','other'),visibility:'family'};f.home.state.notes.push(shared);f.home.state.aiOperations.receipt={ownerId:'owner',changes:[{collection:'notes',id:shared.id,before:structuredClone(shared)}]};assert.ok(visibleState(f.home.state,'owner').aiOperations.receipt);shared.visibility='private';assert.equal(visibleState(f.home.state,'owner').aiOperations.receipt,undefined);f.home.state.notes=[];assert.equal(visibleState(f.home.state,'owner').aiOperations.receipt,undefined)}finally{f.close()}
});

test('SEC-03: concurrent household creation cannot exceed the installation quota or create orphan memberships',async()=>{
 const f=await fixture();try{f.env.BAYIT_MAX_HOUSEHOLDS='2';const responses=await Promise.all([worker.fetch(req('/api/households',{method:'POST',body:{name:'Second A'}}),f.env),worker.fetch(req('/api/households',{method:'POST',body:{name:'Second B'}}),f.env)]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);for(const table of ['households','household_data','memberships'])assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n,2)}finally{f.close()}
});

test('SEC-19: remote rotation requires the operator bearer secret, never accepts browser identity alone and returns counts only',async()=>{
 const f=await fixture();try{f.env.REMINDER_CRON_SECRET='fictional-operator-maintenance-secret';const denied=await worker.fetch(req('/api/internal/rotate-credentials',{method:'POST'}),f.env);assert.equal(denied.status,401);const result=await worker.fetch(req('/api/internal/rotate-credentials',{method:'POST',headers:{Authorization:'Bearer '+f.env.REMINDER_CRON_SECRET}}),f.env);assert.equal(result.status,200);assert.deepEqual(await result.json(),{rotated:0,concurrent:0,complete:true});assert.equal((await f.DB.prepare('SELECT action FROM security_audit ORDER BY created_at DESC LIMIT 1').first()).action,'session.credentials')}finally{f.close()}
});

test('SEC-20: PDF admission allows two operations and refuses a third before any PDF body is parsed',async()=>{
 const f=await fixture();try{const {withPDFSlot}=await import('../app/cloud/pdf-budget.mjs');let release1,release2,started1,started2;const ready1=new Promise(r=>started1=r),ready2=new Promise(r=>started2=r);const a=withPDFSlot(f.env,async()=>{started1();await new Promise(r=>release1=r)}),b=withPDFSlot(f.env,async()=>{started2();await new Promise(r=>release2=r)});await Promise.all([ready1,ready2]);let called=false;await assert.rejects(withPDFSlot(f.env,()=>{called=true}),e=>e.status===429);assert.equal(called,false);release1();release2();await Promise.all([a,b])}finally{f.close()}
});

test('migration overlap returns a controlled setup response, preserves state/sessions and recovers after migration',async()=>{
 const f=await fixture();try{await f.DB.exec('DROP TABLE security_rate_limits');const response=await worker.fetch(req('/api/households/home/changes',{method:'POST',body:{baseRevision:0,changes:[]}}),f.env);assert.equal(response.status,503);assert.equal((await response.json()).code,'SCHEMA_UPDATE_REQUIRED');const config=await (await worker.fetch(req('/api/config'),f.env)).json();assert.equal(config.installation.updateRequired,true);assert.equal((await f.DB.prepare('SELECT revision FROM household_data').first()).revision,0);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n,1);await f.DB.exec('CREATE TABLE security_rate_limits(bucket TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)');const recovered=await worker.fetch(req('/api/households/home/state'),{...f.env,DB:{...f.DB}});assert.equal(recovered.status,200)}finally{f.close()}
});

test('SEC-20: the PDF proxy uses each request’s binding and never falls back to parsing inside the household worker',async()=>{
 const a=await fixture(),b=await fixture();try{const {pdfRows}=await import('../app/cloud/statement-pdf.mjs');await assert.rejects(pdfRows(new Uint8Array([37,80,68,70]),{}),e=>e.code==='PDF_READER_SETUP_REQUIRED');const reader=text=>({fetch:async request=>{assert.equal(new URL(request.url).hostname,'pdf.internal');await Promise.resolve();return Response.json({rows:[{page:1,y:1,text,items:[]}]})}});const values=await Promise.all([pdfRows(new Uint8Array([37,80,68,70]),{...a.env,PDF_READER:reader('installation A')}),pdfRows(new Uint8Array([37,80,68,70]),{...b.env,PDF_READER:reader('installation B')})]);assert.deepEqual(values.map(rows=>rows[0].text),['installation A','installation B'])}finally{a.close();b.close()}
});
