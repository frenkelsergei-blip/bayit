// Offline support: what a device keeps for offline use, how queued edits are applied and reported.
// Pure functions, shared by the browser client (app/src/household-sync.js) and the node tests.

import {parseExtKey,recordList,setRecordList} from './record-paths.mjs';
import {moduleById,offlineModules} from './feature-modules.mjs';

// Never kept on the device for offline use: money, insurance, documents, and AI receipts (saved plans keep their outline).
// Connection secrets are never part of household state in the first place (they live server-side).
export const OFFLINE_EXCLUDED=['expenses','bills','insurances','documents','receipts'];
const PRIVATE_PROFILE_FIELDS=['financePlans','financeNotifications','insuranceMatches'];
const PRIVATE_PREFERENCES=['monthlyBudget','privateGoals'];

// The subset of the signed-in member's visible state that is stored on the device.
// `data` is already the server's visibleState for this member, so a child's copy never holds parent-only records.
export function offlineSnapshot(data){
 const copy=structuredClone(data||{});
 for(const key of OFFLINE_EXCLUDED)copy[key]=[];
 // AI receipts stay online, except the member's saved plans ("message → one plan"): only their title and item references.
 copy.aiOperations=Object.fromEntries(Object.entries(copy.aiOperations||{}).flatMap(([id,r])=>r?.status==='intake'&&Array.isArray(r.items)
  ?[[id,{id:r.id,ownerId:r.ownerId,scope:r.scope,status:'intake',title:r.title,appliedAt:r.appliedAt,items:r.items.map(({collection,id})=>({collection,id}))}]]:[]));
 for(const profile of Object.values(copy.profiles||{}))for(const key of PRIVATE_PROFILE_FIELDS)delete profile?.[key];
 for(const key of PRIVATE_PREFERENCES)if(copy.preferences)delete copy.preferences[key];
 if(copy.extensions)copy.extensions=offlineModules(copy.extensions); // a module with offline:false stays online-only
 return copy;
}

// Pages (root/view) that need the connection. Offline they show a calm "available when you're online" state.
// Kids › Parents checks the parent code on the server; My Hero's care, shop and games are confirmed by the server.
const ONLINE_ONLY={ai:true,household:['expenses','insurance','documents','vouchers'],settings:['connections','ai','storage'],kids:['parents','hero']};
export function needsConnection(root,view=''){
 if(root==='x')return moduleById(String(view||'').split('?')[0])?.offline===false; // feature modules declare it
 const rule=ONLINE_ONLY[root];if(rule===true)return true;
 if(!Array.isArray(rule))return false;
 // The Household page opens on Expenses when no tab is chosen (Insurance/Expenses are hidden for children, see App.jsx).
 return rule.includes(String(view||'').split('?')[0]||(root==='household'?'expenses':''));
}

// Applies queued record-level changes (diffState ops) to a copy of `data`, oldest first.
export function applyQueued(data,entries){
 const next=structuredClone(data||{});
 for(const entry of entries||[])for(const op of entry.changes||[]){
  if(op.collection==='members'){next.members=structuredClone(op.value);continue}
  if(op.collection==='customIcons'){next.customIcons=structuredClone(op.value);continue}
  if(op.collection==='favorites'){next.favoriteIcons=structuredClone(op.value);continue}
  if(['profiles','preferences','aiOperations'].includes(op.collection)){next[op.collection]={...next[op.collection],[op.id]:structuredClone(op.value)};continue}
  if(parseExtKey(op.collection)&&!Array.isArray(recordList(next,op.collection)))setRecordList(next,op.collection,[]);
  const list=parseExtKey(op.collection)?recordList(next,op.collection):Array.isArray(next[op.collection])?next[op.collection]:(next[op.collection]=[]),index=list.findIndex(r=>r?.id===op.id);
  if(op.delete){if(index>=0)list.splice(index,1);continue}
  if(index>=0)list[index]=structuredClone(op.value);else list.push(structuredClone(op.value));
 }
 return next;
}

// "collection:id" keys of records with a change that is still waiting to sync.
export function pendingKeys(entries){
 const keys=new Set();
 for(const entry of entries||[])for(const op of entry.changes||[])if(op.id)keys.add(op.collection+':'+op.id);
 return keys;
}

// What the queue holds, so the sync bar can say it plainly: only a page's Cards | List or layout choice, only settings,
// or other changes (2026-11-12, the owner saw "1 change waiting to sync" for a Cards | List switch).
const LAYOUT_PREFERENCES=new Set(['appearanceByUser','todayByUser']);
export function waitingKind(entries){
 const ops=(entries||[]).flatMap(e=>e.changes||[]);if(!ops.length)return '';
 if(ops.every(op=>op.collection==='preferences'&&LAYOUT_PREFERENCES.has(op.id)))return 'layout';
 if(ops.every(op=>op.collection==='preferences'))return 'settings';
 return 'changes';
}

// Retry delays after a connection failure: 2s, 4s, 8s ... capped at 60s, with up to 20% jitter.
export function retryDelay(attempt,random=Math.random){
 const base=Math.min(60000,2000*2**Math.max(0,Math.min(attempt,10)));
 return Math.round(base*(1+0.2*random()));
}

export const validOpId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id);
export function newOpId(){
 try{return crypto.randomUUID()}catch{return 'op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)}
}

const recordOf=(data,op)=>{const collection=parseExtKey(op.collection)?recordList(data,op.collection):data?.[op.collection];return Array.isArray(collection)?collection.find(r=>r?.id===op.id):collection?.[op.id]};
const labelOf=(record,key)=>{const ref=parseExtKey(key),field=ref&&moduleById(ref.module)?.collections[ref.collection]?.label;if(field&&typeof record?.[field]==='string'){const t=record[field].slice(0,80);return {en:t,he:t}}return labelOfCore(record)};
const labelOfCore=record=>({en:String(record?.title||record?.name||record?.text||record?.he||'').slice(0,80),he:String(record?.he||record?.title||record?.name||record?.text||'').slice(0,80)});

// Why a queued change could not be applied, decided only from the server's latest data and its answer:
// - deleted: the record no longer exists (someone removed it, or it is no longer visible to this member)
// - changed: someone else changed the same field; the server's version is kept
// - refused: the server's rules refused the change (permissions, validation)
export function describeConflict(entry,latest,error){
 const op=(entry.changes||[]).find(o=>o.id&&o.collection!=='history'&&o.collection!=='purchases')||(entry.changes||[])[0]||{};
 const current=op.id?recordOf(latest,op):null;
 const reason=!op.delete&&op.before&&!current?'deleted':error?.code==='EDIT_CONFLICT'||error?.status===409?'changed':'refused';
 return {opId:entry.opId,reason,collection:op.collection||'',id:op.id||'',label:labelOf(op.value||op.before||current,op.collection),message:reason==='refused'?String(error?.message||'').slice(0,200):'',at:Date.now(),canKeepMine:reason==='changed'&&!!current&&!op.delete};
}

// "Use mine" after a same-field conflict: reapply only the fields this person changed, on top of the latest version.
// The server still checks every rule, so this never bypasses permissions.
export function keepMine(entry,latest){
 const out=[];
 for(const op of entry.changes||[]){
  if(op.delete||!op.id){continue}
  const current=recordOf(latest,op);if(!current||typeof current!=='object'||Array.isArray(current))continue;
  const value=structuredClone(current);
  for(const key of new Set([...Object.keys(op.before||{}),...Object.keys(op.value||{})])){
   if(JSON.stringify(op.before?.[key])===JSON.stringify(op.value?.[key]))continue;
   if(op.value&&Object.hasOwn(op.value,key))value[key]=structuredClone(op.value[key]);else delete value[key];
  }
  out.push({collection:op.collection,id:op.id,value,before:current});
 }
 return out;
}
