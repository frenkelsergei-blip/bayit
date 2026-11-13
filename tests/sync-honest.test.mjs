// The sync bar tells the truth (owner, 2026-11-12): a Cards | List switch that meets a server error (Cloudflare's CPU limit
// answers 503 HTML) is "your layout choice is waiting to be saved", the server "could not be reached", and pressing
// Retry now keeps backing off instead of failing again and again at the same pace.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HouseholdClient} from '../app/src/household-sync.js';
import {waitingKind} from '../shared/offline-sync.mjs';
globalThis.window??={addEventListener(){},removeEventListener(){}};
globalThis.document??={visibilityState:'visible'};

const pref=(id,value)=>({collection:'preferences',id,value,before:null});
test('the sync bar knows what is waiting',()=>{
 assert.equal(waitingKind([]),'');
 assert.equal(waitingKind([{changes:[pref('appearanceByUser',{u:{densityByPage:{today:'compact'}}})]}]),'layout');
 assert.equal(waitingKind([{changes:[pref('appearanceByUser',{})]},{changes:[pref('todayByUser',{})]}]),'layout');
 assert.equal(waitingKind([{changes:[pref('appearanceByUser',{}),pref('weekStarts','1')]}]),'settings');
 assert.equal(waitingKind([{changes:[pref('appearanceByUser',{})]},{changes:[{collection:'tasks',id:'t1',value:{id:'t1'}}]}]),'changes');
});

test('a Cards | List save that meets a server error says so plainly, stays kept, backs off, and goes through later',async()=>{
 let down=true,posts=0;const state={revision:1,data:{tasks:[],preferences:{}}};
 const transport=async(path,body)=>{if(!body)return {revision:state.revision,data:structuredClone(state.data)};posts++;
  if(down)throw Object.assign(Error('The server did not return a valid response.'),{status:503});
  state.data.preferences={...state.data.preferences,[body.changes[0].id]:body.changes[0].value};state.revision++;return {revision:state.revision,data:structuredClone(state.data)}};
 const client=new HouseholdClient('h',{revision:1,data:structuredClone(state.data)},transport);
 const after={...state.data,preferences:{appearanceByUser:{u:{densityByPage:{today:'compact'}}}}};
 await assert.rejects(client.save(state.data,after));clearTimeout(client.retryTimer);
 let status=client.status();
 assert.equal(status.kind,'layout');assert.equal(status.queued,1);assert.ok(status.failed>0,'the bar shows');
 assert.equal(status.error,'Bayit’s server could not be reached. Trying again.','never the raw "did not return a valid response", never "sign in"');
 const attemptsBefore=client.attempt;
 await assert.rejects(client.retry());clearTimeout(client.retryTimer);
 await assert.rejects(client.retry());clearTimeout(client.retryTimer);
 assert.equal(client.attempt,attemptsBefore+2,'each failed Retry now waits longer before the automatic retry');
 down=false;await client.retry();clearTimeout(client.retryTimer);
 status=client.status();assert.equal(status.queued,0);assert.equal(status.failed,0);
 assert.deepEqual(state.data.preferences.appearanceByUser,{u:{densityByPage:{today:'compact'}}});
 assert.equal(posts,4);
});

test('a refusal from the server is still reported as itself, not as an unreachable server',async()=>{
 const client=new HouseholdClient('h',{revision:1,data:{tasks:[]}},async(path,body)=>{if(!body)return {revision:1,data:{tasks:[]}};throw Object.assign(Error('The change is too large.'),{status:413})});
 await assert.rejects(client.save({tasks:[]},{tasks:[{id:'a',title:'x'}]}),/too large/);
 assert.equal(client.status().queued,0);
});

test('the bar’s words',()=>{
 const ui=readFileSync(new URL('../app/src/offline-ui.jsx',import.meta.url),'utf8');
 assert.match(ui,/Your layout choice is waiting to be saved/);assert.match(ui,/בחירת התצוגה שלך ממתינה לשמירה/);
 assert.match(ui,/Bayit’s server could not be reached\. It is kept on this device and we keep trying\./);
 assert.doesNotMatch(ui,/Could not retry\. Your changes are still kept\./,'a failed Retry says it will try again later');
});
