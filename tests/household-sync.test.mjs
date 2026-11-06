// Sync client: a refused save is undone and reported but never blocks later saves; conflicts rebase;
// connection failures stay queued and are sent with the next save.
import test from 'node:test';
import assert from 'node:assert/strict';
import {HouseholdClient} from '../app/src/household-sync.js';

globalThis.window??={addEventListener(){},removeEventListener(){}};
globalThis.document??={visibilityState:'visible'};

const fail=(message,status)=>Object.assign(Error(message),{status});
const record=(id,title)=>({id,title,ownerId:'u1',visibility:'family',allowedIds:[]});

// A tiny in-memory household server. `reject(ops)` returns an error to refuse a batch.
function server({reject=()=>null}={}){
 const state={revision:1,data:{tasks:[],events:[]}},calls=[];
 const transport=async(path,body)=>{calls.push({path,body});if(!body)return {revision:state.revision,data:structuredClone(state.data)};
  if(body.baseRevision!==state.revision)throw fail('This household changed on another device.',409);
  const refusal=reject(body.changes);if(refusal)throw refusal;
  for(const op of body.changes){const list=state.data[op.collection];const i=list.findIndex(r=>r.id===op.id);if(op.delete)list.splice(i,1);else if(i<0)list.push(op.value);else list[i]=op.value}
  state.revision++;return {revision:state.revision,data:structuredClone(state.data)}};
 return {state,calls,transport};
}
const add=(data,collection,value)=>({...data,[collection]:[...data[collection],value]});

test('a refused save is reported, undone, and does not block the next save',async()=>{
 const srv=server({reject:ops=>ops.some(op=>op.value?.title==='too large')?fail('The change is too large.',413):null});
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport);
 let before=client.data,after=add(before,'tasks',record('a','too large'));
 await assert.rejects(client.save(before,after),e=>e.rejected===true&&/too large/.test(e.message));
 assert.equal(client.failed.length,0,'refused change is not left queued');
 assert.equal(client.data.tasks.length,0,'local copy matches the server again');
 before=client.data;after=add(before,'tasks',record('b','Buy milk'));
 await client.save(before,after);
 assert.deepEqual(srv.state.data.tasks.map(t=>t.title),['Buy milk']);
});

test('a conflict with another device is rebased and saved',async()=>{
 const srv=server(),client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},srv.transport);
 srv.state.data.events.push(record('other','Spouse event'));srv.state.revision=2;
 const before=client.data,after=add(before,'tasks',record('t','Pick up Noa'));
 await client.save(before,after);
 assert.equal(srv.state.revision,3);
 assert.deepEqual(srv.state.data.tasks.map(t=>t.title),['Pick up Noa']);
 assert.deepEqual(client.data.events.map(e=>e.title),['Spouse event']);
});

test('a connection failure keeps the change queued and sends it with the next save',async()=>{
 const srv=server();let offline=true;
 const transport=async(path,body)=>{if(offline&&body)throw TypeError('Load failed');return srv.transport(path,body)};
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(srv.state.data)},transport);
 let before=client.data,after=add(before,'tasks',record('x','Water plants'));
 await assert.rejects(client.save(before,after));
 clearTimeout(client.retryTimer);
 assert.equal(client.failed.length,1);
 assert.equal(client.status().error,'No connection to Bayit right now.');
 offline=false;before=after;after=add(before,'events',record('y','Dinner'));
 await client.save(before,after);
 assert.equal(client.failed.length,0);
 assert.deepEqual(srv.state.data.tasks.map(t=>t.title),['Water plants']);
 assert.deepEqual(srv.state.data.events.map(e=>e.title),['Dinner']);
});

test('a repeated no-op save waits for the pending authoritative write',async()=>{
 const before={profiles:{mom:{name:'Mom'}},preferences:{}},after=structuredClone(before);after.profiles.mom.name='New name';let release,requests=0;
 const client=new HouseholdClient('h',{revision:1,data:before},async()=>{requests++;return new Promise(resolve=>{release=resolve})});
 const first=client.save(before,after);let settled=false;const repeated=client.save(after,after).then(()=>{settled=true});await Promise.resolve();await Promise.resolve();assert.equal(settled,false);assert.equal(requests,1);release({revision:2,data:after});await Promise.all([first,repeated]);assert.equal(settled,true);
});

test('loss of household membership during polling refreshes account access',async()=>{
 const previous=globalThis.document;globalThis.document={visibilityState:'visible'};try{let refreshed=false;const client=new HouseholdClient('h',{revision:1,data:{}},async()=>{throw Object.assign(Error('Household unavailable'),{status:403})});client.listeners.unauthorized=()=>{refreshed=true};await client.poll();assert.equal(refreshed,true)}finally{globalThis.document=previous}
});
