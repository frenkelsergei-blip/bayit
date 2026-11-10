// Offline support (2026-11-09): what the device keeps, how queued edits replay, idempotency and conflicts.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {offlineSnapshot,applyQueued,pendingKeys,retryDelay,needsConnection,describeConflict,keepMine,validOpId,OFFLINE_EXCLUDED} from '../shared/offline-sync.mjs';
import {HouseholdClient} from '../app/src/household-sync.js';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {appliedOperation,commitOperation} from '../app/cloud/client-ops.mjs';
import {rebaseChanges} from '../shared/change-merge.mjs';

globalThis.window??={addEventListener(){},removeEventListener(){}};
globalThis.document??={visibilityState:'visible'};
const fail=(message,status,code)=>Object.assign(Error(message),{status,code});
const item=(id,title,extra={})=>({id,title,ownerId:'dad',visibility:'family',allowedIds:[],...extra});

// --- what the device keeps -------------------------------------------------------------------------------
test('the device copy leaves out money, insurance, documents and private finance settings',()=>{
 const data={tasks:[item('t','Pick up Noa')],shopping:[item('s','Milk')],events:[item('e','Dinner')],expenses:[item('x','Rent')],bills:[item('b','Water')],insurances:[item('i','Car')],documents:[item('d','Passport')],aiOperations:{a:{ownerId:'dad',status:'applied',changes:[{after:{title:'Secret'}}]},'intake-p':{id:'intake-p',ownerId:'dad',status:'intake',title:'Trip',scope:'private',appliedAt:'2026-11-09T10:00:00Z',items:[{collection:'tasks',id:'t',after:{title:'x'}}],extra:'dropped'}},profiles:{dad:{name:'Daniel',financePlans:{save:1},financeNotifications:{on:true}}},preferences:{monthlyBudget:9000,privateGoals:{dad:1},palette:'classic'}};
 const copy=offlineSnapshot(data);
 for(const key of OFFLINE_EXCLUDED)assert.deepEqual(copy[key],[],key+' is not stored');
 assert.deepEqual(copy.aiOperations,{'intake-p':{id:'intake-p',ownerId:'dad',scope:'private',status:'intake',title:'Trip',appliedAt:'2026-11-09T10:00:00Z',items:[{collection:'tasks',id:'t'}]}},'only saved plan outlines are kept');
 assert.equal(copy.profiles.dad.financePlans,undefined);assert.equal(copy.profiles.dad.financeNotifications,undefined);
 assert.equal(copy.preferences.monthlyBudget,undefined);assert.equal(copy.preferences.privateGoals,undefined);
 assert.equal(copy.preferences.palette,'classic');
 assert.deepEqual([copy.tasks[0].title,copy.shopping[0].title,copy.events[0].title],['Pick up Noa','Milk','Dinner']);
 assert.equal(data.expenses.length,1,'the original is not modified');
});

test("a child's device copy holds only what the child may see",()=>{
 const state=blankState('home','Levi',{id:'dad',name:'Daniel'});
 state.members.push({id:'mom',name:'Hila',role:'parent'},{id:'itai',name:'Itai',role:'child'});
 state.members[0].role='parent';
 state.tasks.push(item('private-parent','Anniversary gift',{visibility:'private'}),item('family','Water plants'),item('kid-task','Homework',{memberId:'itai',memberIds:['itai']}));
 state.events.push(item('surprise','Surprise party planning',{visibility:'selected',allowedIds:['dad','mom']}),item('dinner','Family dinner'));
 state.expenses.push(item('rent','Rent',{amount:5000}));state.insurances=[item('car','Car insurance',{ownerId:'dad'})];
 state.preferences.monthlyBudget=9000;
 const copy=offlineSnapshot(visibleState(state,'itai')),text=JSON.stringify(copy);
 for(const secret of ['Anniversary gift','Surprise party planning','Rent','Car insurance','9000'])assert.ok(!text.includes(secret),secret+' must not be on the child device');
 assert.ok(copy.tasks.some(t=>t.id==='kid-task')&&copy.events.some(e=>e.id==='dinner'));
});

test('online-only pages are named explicitly; daily pages work offline',()=>{
 for(const [root,view]of [['ai',''],['household','expenses'],['household',''],['household','insurance'],['household','documents'],['household','vouchers'],['settings','connections'],['settings','ai'],['kids','parents'],['kids','hero']])assert.equal(needsConnection(root,view),true,root+'/'+view);
 for(const [root,view]of [['today',''],['calendar',''],['tasks',''],['shopping',''],['kids',''],['kids','day'],['household','pantry'],['household','meals'],['settings','general'],['mine','']])assert.equal(needsConnection(root,view),false,root+'/'+view);
});

// --- queued edits -----------------------------------------------------------------------------------------
test('queued edits apply in order on top of the device copy, and mark their rows',()=>{
 const data={shopping:[item('milk','Milk',{done:false}),item('eggs','Eggs')],tasks:[],profiles:{dad:{name:'Daniel'}}};
 const entries=[
  {opId:'op-00000001',changes:[{collection:'shopping',id:'milk',value:{...data.shopping[0],done:true},before:data.shopping[0]}]},
  {opId:'op-00000002',changes:[{collection:'shopping',id:'bread',value:item('bread','Bread'),before:null}]},
  {opId:'op-00000003',changes:[{collection:'shopping',id:'eggs',delete:true,before:data.shopping[1]}]},
  {opId:'op-00000004',changes:[{collection:'tasks',id:'call',value:item('call','Call grandma'),before:null},{collection:'profiles',id:'dad',value:{name:'Dani'},before:{name:'Daniel'}}]},
  {opId:'op-00000005',changes:[{collection:'shopping',id:'milk',value:{...data.shopping[0],done:false},before:{...data.shopping[0],done:true}}]},
 ];
 const next=applyQueued(data,entries);
 assert.deepEqual(next.shopping.map(s=>[s.id,!!s.done]),[['milk',false],['bread',false]]);
 assert.deepEqual(next.tasks.map(t=>t.title),['Call grandma']);
 assert.equal(next.profiles.dad.name,'Dani');
 assert.equal(data.shopping.length,2,'the device copy itself is unchanged');
 assert.deepEqual([...pendingKeys(entries)].sort(),['profiles:dad','shopping:bread','shopping:eggs','shopping:milk','tasks:call']);
});

test('retries back off and are capped, so a flaky network is not hammered',()=>{
 const delays=[0,1,2,3,4,5,6,12].map(n=>retryDelay(n,()=>0));
 assert.deepEqual(delays,[2000,4000,8000,16000,32000,60000,60000,60000]);
 assert.ok(retryDelay(2,()=>1)<=8000*1.2);
 assert.equal(validOpId('3f0a1c52-6a0b-4c0b-9a51-0d6c3f6f9b0e'),true);
 for(const bad of ['',null,'x','a b c d e f g','../../etc/passwd',`${'a'.repeat(81)}`])assert.equal(validOpId(bad),false);
});

// A small household server with operation-id de-duplication and a switch that loses answers after applying.
function server(initial,{loseAnswerOnce=false,refuse=()=>null}={}){
 const state={revision:1,data:structuredClone(initial)},applied=new Map(),calls=[];let lose=loseAnswerOnce,offline=false;
 const transport=async(path,body)=>{calls.push({path,body:structuredClone(body)});if(offline)throw TypeError('Load failed');
  if(!body)return {revision:state.revision,data:structuredClone(state.data)};
  if(body.clientOpId&&applied.has(body.clientOpId))return {revision:state.revision,data:structuredClone(state.data),duplicate:true};
  if(body.baseRevision!==state.revision)throw fail('This household changed on another device.',409);
  const refusal=refuse(body.changes);if(refusal)throw refusal;
  for(const op of body.changes){const list=state.data[op.collection]||=[];const i=list.findIndex(r=>r.id===op.id);if(op.delete)list.splice(i,1);else if(i<0)list.push(op.value);else list[i]=op.value}
  state.revision++;if(body.clientOpId)applied.set(body.clientOpId,state.revision);
  if(lose){lose=false;throw fail('Bayit is taking too long to answer.',undefined)}
  return {revision:state.revision,data:structuredClone(state.data)}};
 return {state,calls,transport,applied,set offline(v){offline=v}};
}
function memoryStore(){const entries=new Map(),snapshots=[];return {entries,snapshots,async putEntry(e){entries.set(e.opId,structuredClone(e))},async deleteEntry(id){entries.delete(id)},async saveSnapshot(s){snapshots.push(structuredClone(s))},queue(){return [...entries.values()].sort((a,b)=>a.seq-b.seq)}}}
const tick=(client,id)=>{const before=client.data,after=structuredClone(before);const row=after.shopping.find(s=>s.id===id);row.done=!row.done;return client.save(before,after)};

test('offline edits survive a reload and replay in order when the connection returns',async()=>{
 const srv=server({shopping:[item('milk','Milk',{done:false})],tasks:[]}),store=memoryStore();
 srv.offline=true;
 const first=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport,{store,actorId:'dad'});
 // tick Milk, add Bread, add a quick task: all while offline
 await assert.rejects(tick(first,'milk'),e=>e.queued===true);clearTimeout(first.retryTimer);
 let before=structuredClone(first.data);before.shopping[0].done=true;let after=structuredClone(before);after.shopping.push(item('bread','Bread'));
 await assert.rejects(first.save(before,after),e=>e.queued===true);clearTimeout(first.retryTimer);
 before=after;after=structuredClone(before);after.tasks.push(item('call','Call grandma'));
 await assert.rejects(first.save(before,after),e=>e.queued===true);clearTimeout(first.retryTimer);
 assert.equal(store.queue().length,3,'all three changes are on the device');
 assert.equal(srv.state.data.shopping.length,1,'nothing reached the server');
 // reload while still offline: a new client restores the queue from the device
 const restored=store.queue(),second=new HouseholdClient('h',{revision:1,data:structuredClone(first.data)},srv.transport,{store,actorId:'dad',queue:restored,fromSnapshot:true});
 const shown=applyQueued(second.data,restored);
 assert.deepEqual(shown.shopping.map(s=>[s.title,!!s.done]),[['Milk',true],['Bread',false]]);
 assert.deepEqual(shown.tasks.map(t=>t.title),['Call grandma']);
 // the connection returns
 srv.offline=false;const sentBefore=srv.calls.length;await second.flush();
 assert.equal(second.queue.length,0);assert.equal(store.queue().length,0,'the device queue is emptied after confirmation');
 assert.deepEqual(srv.state.data.shopping.map(s=>[s.title,!!s.done]),[['Milk',true],['Bread',false]]);
 assert.deepEqual(srv.state.data.tasks.map(t=>t.title),['Call grandma']);
 assert.deepEqual(srv.calls.slice(sentBefore).filter(c=>c.body).map(c=>c.body.clientOpId),restored.map(e=>e.opId),'sent oldest first, each with its operation id');
 await new Promise(r=>setTimeout(r,400));assert.ok(store.snapshots.length>0,'the device copy is refreshed after syncing');assert.equal(store.snapshots.at(-1).data.shopping.length,2);
});

test('a change retried after a lost answer is applied exactly once',async()=>{
 const srv=server({shopping:[],tasks:[]},{loseAnswerOnce:true});
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport);
 const before=client.data,after={...before,shopping:[item('bread','Bread')]};
 await assert.rejects(client.save(before,after),e=>e.queued===true);clearTimeout(client.retryTimer);
 assert.equal(srv.state.revision,2,'the server applied it, but the answer was lost');
 await client.flush();
 assert.equal(srv.state.revision,2,'the retry was recognised, not applied again');
 assert.equal(srv.state.data.shopping.length,1);
 assert.equal(client.queue.length,0);
 const ids=srv.calls.filter(c=>c.body).map(c=>c.body.clientOpId);assert.equal(ids.length,2);assert.equal(ids[0],ids[1],'the retry carried the same operation id');
});

test('conflicts are decided by the server and explained, never silently dropped',async()=>{
 const milk=item('milk','Milk',{done:false,quantity:1}),eggs=item('eggs','Eggs',{done:false});
 const srv=server({shopping:[milk,eggs]});srv.offline=true;
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport,{actorId:'dad'});
 await assert.rejects(tick(client,'milk'),e=>e.queued);clearTimeout(client.retryTimer);
 let before=structuredClone(client.data);before.shopping[0].done=true;let after=structuredClone(before);after.shopping[1].quantity=6;
 await assert.rejects(client.save(before,after),e=>e.queued);clearTimeout(client.retryTimer);
 // meanwhile on another phone: Milk is deleted, and someone sets Eggs to 12
 srv.state.data.shopping=[{...eggs,quantity:12}];srv.state.revision=5;
 srv.offline=false;await client.flush();
 assert.equal(client.queue.length,0,'nothing stays stuck');
 const [deleted,changed]=client.conflicts;
 assert.equal(deleted.reason,'deleted');assert.equal(deleted.label.en,'Milk');assert.equal(deleted.canKeepMine,false);
 assert.equal(changed.reason,'changed');assert.equal(changed.label.en,'Eggs');assert.equal(changed.canKeepMine,true);
 assert.equal(srv.state.data.shopping[0].quantity,12,'the server version is kept until the person decides');
 // "Use mine" reapplies only the field this person changed
 await client.keepMine(changed.opId);
 assert.equal(srv.state.data.shopping[0].quantity,6);assert.deepEqual(client.conflicts.map(c=>c.reason),['deleted'],'only the resolved notice is gone');
});

test('a refused offline change (permissions) is explained and the next change still syncs',async()=>{
 const srv=server({tasks:[]},{refuse:ops=>ops.some(op=>op.value?.memberIds?.includes('mom'))?fail('Children assign tasks only to themselves.',403):null});srv.offline=true;
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport,{actorId:'itai'});
 let before=client.data,after={...before,tasks:[item('a','Help mom',{ownerId:'itai',memberIds:['mom']})]};
 await assert.rejects(client.save(before,after),e=>e.queued);clearTimeout(client.retryTimer);
 before=after;after={...before,tasks:[...before.tasks,item('b','Feed the dog',{ownerId:'itai',memberIds:['itai']})]};
 await assert.rejects(client.save(before,after),e=>e.queued);clearTimeout(client.retryTimer);
 srv.offline=false;await client.flush();
 assert.deepEqual(srv.state.data.tasks.map(t=>t.title),['Feed the dog']);
 assert.equal(client.conflicts.length,1);assert.equal(client.conflicts[0].reason,'refused');assert.match(client.conflicts[0].message,/only to themselves/);
 assert.deepEqual(client.data.tasks.map(t=>t.title),['Feed the dog'],'the refused change is undone locally');
});

test('a live (online) refusal keeps the usual message and adds no offline notice',async()=>{
 const srv=server({tasks:[]},{refuse:()=>fail('This record is private.',403)});
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport);
 await assert.rejects(client.save(client.data,{...client.data,tasks:[item('a','A')]}),e=>e.rejected===true);
 assert.equal(client.conflicts.length,0);
});

test('conflict helpers are deterministic',()=>{
 const before=item('x','Bread',{quantity:1,note:'whole wheat'}),mine={...before,quantity:2},current={...before,note:'rye',quantity:3};
 const entry={opId:'op-12345678',changes:[{collection:'shopping',id:'x',value:mine,before}]};
 assert.equal(describeConflict(entry,{shopping:[]},fail('x',409,'EDIT_CONFLICT')).reason,'deleted');
 assert.equal(describeConflict(entry,{shopping:[current]},fail('x',409,'EDIT_CONFLICT')).reason,'changed');
 assert.equal(describeConflict(entry,{shopping:[current]},fail('nope',403)).reason,'refused');
 assert.deepEqual(keepMine(entry,{shopping:[current]}),[{collection:'shopping',id:'x',value:{...current,quantity:2},before:current}]);
 assert.throws(()=>rebaseChanges(entry.changes,{shopping:[current]}),/changed on another device/);
});

// --- server: operation ids -------------------------------------------------------------------------------
test('the server records operation ids with the change, and works before migration 0017',async()=>{
 for(const migrated of [true,false]){
  const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
  if(!migrated)await DB.exec('DROP TABLE client_operations');
  await DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('h','{}').run();
  const update=()=>DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=?').bind('{"v":1}','h',0);
  const result=await commitOperation({DB},update(),{householdId:'h',memberId:'dad',opId:'op-aaaaaaaa',revision:1});
  assert.equal(result.meta.changes,1);
  assert.deepEqual(await appliedOperation({DB},'h','dad','op-aaaaaaaa'),migrated?{revision:1}:null);
  assert.equal(await appliedOperation({DB},'h','mom','op-aaaaaaaa'),null,'ids are per member');
  // A lost revision race records nothing.
  const lost=await commitOperation({DB},update(),{householdId:'h',memberId:'dad',opId:'op-bbbbbbbb',revision:1});
  assert.equal(lost.meta.changes,0);assert.equal(await appliedOperation({DB},'h','dad','op-bbbbbbbb'),null);
  DB.close();
 }
});

const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-offline-'));
after(()=>rm(scratch,{recursive:true,force:true}));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile:join(scratch,'worker.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const worker=(await import(pathToFileURL(join(scratch,'worker.mjs')))).default,origin='http://127.0.0.1:55802';
test('POST /changes de-duplicates a retried operation id, even with an old base revision',async()=>{
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const state=blankState('home','Levi',{id:'dad',name:'Daniel'}),now=new Date().toISOString();state.members[0].role='parent';
 await DB.batch([DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind('dad','Daniel','dad@example.test'),DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Levi','dad',now),DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home','dad','dad','parent',now),DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state)),DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('s','fixture-offline','dad',new Date(Date.now()+86400000).toISOString())]);
 const env={DB,AUTH_SECRET:'synthetic-auth-secret-for-offline-tests',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('')}};
 const post=body=>worker.fetch(new Request(origin+'/api/households/home/changes',{method:'POST',headers:{Cookie:'authjs.session-token=fixture-offline',Origin:origin,'X-Bayit-Household':'home','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 const bread={id:'bread',title:'Bread',quantity:'1',ownerId:'dad',visibility:'family',allowedIds:[],listId:'week'},clientOpId='3f0a1c52-6a0b-4c0b-9a51-0d6c3f6f9b0e';
 const first=await post({baseRevision:0,changes:[{collection:'shopping',id:'bread',value:bread,before:null}],clientOpId});
 const firstBody=await first.json();assert.equal(first.status,200,firstBody.error);assert.equal(firstBody.revision,1);
 const again=await post({baseRevision:0,changes:[{collection:'shopping',id:'bread',value:bread,before:null}],clientOpId});
 assert.equal(again.status,200);const body=await again.json();
 assert.equal(body.duplicate,true);assert.equal(body.revision,1,'not applied twice');assert.equal(body.data.shopping.filter(s=>s.id==='bread').length,1);
 const stale=await post({baseRevision:0,changes:[{collection:'shopping',id:'eggs',value:{...bread,id:'eggs',title:'Eggs'},before:null}],clientOpId:'another-operation-id'});
 assert.equal(stale.status,409,'a new operation still needs the current revision');
 DB.close();
});

test('applyChanges keeps server rules for replayed child changes',()=>{
 const state=blankState('home','Levi',{id:'dad',name:'Daniel'});state.members[0].role='parent';state.members.push({id:'itai',name:'Itai',role:'child'});
 assert.throws(()=>applyChanges(state,[{collection:'tasks',id:'t',value:{id:'t',title:'Clean',ownerId:'itai',visibility:'family',allowedIds:[],memberId:'dad',memberIds:['dad']}}],'itai','child'),/only to themselves/);
});
