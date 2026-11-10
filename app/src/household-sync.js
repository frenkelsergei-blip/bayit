// Household sync: sends record-level changes to the household server and keeps this tab's copy current.
// Offline (2026-11-09): every change is first written to this device's queue (IndexedDB) with a client
// operation id, then sent in order. A connection failure keeps it queued across reloads; the server
// de-duplicates by operation id, so a retry after a lost answer is never applied twice.
import {diffState} from '../cloud/state.mjs';
import {cloudHeaders} from './cloud-transport.js';
import {rebaseChanges} from '../../shared/change-merge.mjs';
import {pendingKeys,retryDelay,newOpId,describeConflict,keepMine,offlineSnapshot} from '../../shared/offline-sync.mjs';
import {network} from './offline-state.js';

// Household sync, session and config requests never hang the app on a flaky network: they give up and the app falls
// back to its device copy. Other callers (AI analysis, PIN checks) keep the browser's own timing unless they pass one.
const TIMEOUT={GET:12000,POST:20000},bounded=path=>/^\/api\/(households|config|session|auth\/csrf)(\/|$|\?)/.test(path);
export async function request(path,body,extraHeaders={},{timeout}={}){
 const method=body===undefined?'GET':'POST',controller=typeof AbortController==='function'?new AbortController():null,limit=timeout||(bounded(path)?TIMEOUT[method]:0),timer=controller&&limit&&setTimeout(()=>controller.abort(),limit);
 let response;
 try{response=await fetch(path,{method,headers:{...cloudHeaders(),...extraHeaders,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal})}
 catch(error){network.unreachable();throw Object.assign(Error(controller?.signal.aborted?'Bayit is taking too long to answer.':'No connection to Bayit right now.'),{network:true,timeout:!!controller?.signal.aborted})}
 finally{clearTimeout(timer)}
 network.reachable();
 if(response.status===304)return {notModified:true};let result;try{result=await response.json()}catch{throw Object.assign(Error('The server did not return a valid response.'),{status:response.status>=500?response.status:502})}if(!response.ok)throw Object.assign(Error(result.error||'The request failed.'),{status:response.status,code:result.code});return result}
// A change the server refuses (validation, permission, size) is final: it is undone locally and reported.
// Connection problems and server errors are transient: the change stays queued and is retried automatically.
// Background Sync where the browser has it (not iPhone Safari); the app's own retries never depend on it.
const requestBackgroundSync=()=>{try{globalThis.navigator?.serviceWorker?.ready?.then(r=>r.sync?.register('bayit-queue')).catch(()=>{})}catch{}};
const transient=error=>!error.status||error.status>=500||error.status===408||error.status===429;
const connectionMessage=error=>error.network||/^(Failed to fetch|Load failed|NetworkError)/.test(error.message||'')||error instanceof TypeError?'No connection to Bayit right now.':error.message;
export class HouseholdClient{
 // options: {store, actorId, role, account, queue (entries restored from this device), syncedAt, fromSnapshot, extras}
 constructor(id,initial,transport=request,options={}){this.request=transport;this.id=id;this.revision=initial.revision;this.data=initial.data;this.options=options;this.store=options.store||null;this.queue=(options.queue||[]).map(e=>({...e,queuedOnce:true}));this.seq=Math.max(0,...this.queue.map(e=>e.seq||0));this.syncedAt=options.syncedAt||(options.fromSnapshot?0:Date.now());this.fromSnapshot=!!options.fromSnapshot;this.pending=0;this.attempt=0;this.conflicts=[];this.lastError=this.queue.length&&options.fromSnapshot?'No connection to Bayit right now.':'';this.waitingForConnection=!!this.queue.length;this.retryTimer=null;this.snapshotTimer=null;this.chain=Promise.resolve();this.listeners={};this.statusListeners=new Set();if(!this.fromSnapshot&&options.store)this.saveSnapshot()}
 // Older callers and tests read the queued record changes as one list.
 get failed(){return this.queue.flatMap(e=>e.changes)}
 // failed: changes the server keeps refusing or erroring on (not a missing connection); waiting: kept until the connection returns.
 status(){const waiting=!!this.queue.length&&this.waitingForConnection;return {pending:this.pending,failed:this.queue.length&&this.lastError&&!waiting?this.queue.length:0,queued:this.queue.length,waiting,error:this.lastError,conflicts:this.conflicts,syncedAt:this.syncedAt}}
 emit(){const status=this.status();for(const fn of this.statusListeners)fn(status);network.queue({pending:pendingKeys(this.queue),queued:this.queue.length,conflicts:this.conflicts});if(!this.pending&&!this.queue.length)this.listeners.data?.(this.data)}
 subscribeStatus(fn){this.statusListeners.add(fn);fn(this.status());return()=>this.statusListeners.delete(fn)}
 connect(listeners){this.listeners=listeners;const interval=setInterval(()=>this.poll(),5000),wake=()=>{if(document.visibilityState==='hidden')return;if(this.queue.length){this.attempt=0;this.flush().catch(()=>{})}else this.poll()},online=()=>{this.attempt=0;this.flush().catch(()=>{});this.poll()},update=e=>{if(this.pending||this.queue.length)e.preventDefault()},message=e=>{if(e.data?.type==='bayit-flush')online()},offReconnect=network.onReconnect(online);window.addEventListener('bayit-before-update',update);window.addEventListener('focus',wake);document.addEventListener?.('visibilitychange',wake);navigator.serviceWorker?.addEventListener?.('message',message);this.emit();if(this.queue.length)this.flush().catch(()=>{});else this.poll();return()=>{clearInterval(interval);clearTimeout(this.retryTimer);clearTimeout(this.snapshotTimer);offReconnect();window.removeEventListener('focus',wake);document.removeEventListener?.('visibilitychange',wake);navigator.serviceWorker?.removeEventListener?.('message',message);window.removeEventListener('bayit-before-update',update);this.listeners={}}}
 async poll(){if(this.polling||this.pending||this.queue.length||document.visibilityState==='hidden')return;const started=this.revision;this.polling=true;try{const result=await this.request('/api/households/'+this.id+'/state',undefined,{'If-None-Match':'"'+this.revision+'"'});
  // Ignore a response that raced with a save made while it was in flight.
  if(this.pending||this.queue.length||this.revision!==started)return;if(result.notModified||result.revision<=this.revision){this.confirmed(false);return}this.revision=result.revision;this.data=result.data;this.confirmed(true);this.emit()}catch(error){if(error.status===401||error.status===403)this.listeners.unauthorized?.()}finally{this.polling=false}}
 async latest(){const result=await this.request('/api/households/'+this.id+'/state');this.revision=result.revision;this.data=result.data;this.confirmed(true)}
 // The server answered with the household's current data: this device's copy is fresh again.
 confirmed(changed){const first=this.fromSnapshot;this.syncedAt=Date.now();this.fromSnapshot=false;network.synced(this.syncedAt);if(changed||first)this.saveSnapshot()}
 saveSnapshot(){if(!this.store)return;clearTimeout(this.snapshotTimer);this.snapshotTimer=setTimeout(()=>{const o=this.options;this.store.saveSnapshot({account:o.account||'',householdId:this.id,actorId:o.actorId||'',role:o.role||'',revision:this.revision,savedAt:this.syncedAt||Date.now(),data:offlineSnapshot(this.data),...(o.extras?o.extras():{})}).catch?.(()=>{})},300)}
 // A rejected revision may merge independent fields; sharing and same-field conflicts require review.
 // A queued change made on an older revision is first merged onto the latest confirmed copy (same rules as a 409).
 async send(changes,clientOpId,baseRevision){if(baseRevision!==undefined&&baseRevision!==this.revision){changes=rebaseChanges(changes,this.data);if(!changes.length)return}for(let attempt=0;;attempt++){try{const result=await this.request('/api/households/'+this.id+'/changes',{baseRevision:this.revision,changes,...(clientOpId?{clientOpId}:{})});this.revision=result.revision;this.data=result.data;return}catch(error){if(error.status===409&&error.code!=='EDIT_CONFLICT'&&attempt<3){await this.latest();changes=rebaseChanges(changes,this.data);if(!changes.length)return;continue}throw error}}}
 // Sends queued changes oldest first. One refused change never blocks the ones after it.
 async drain(){
  while(this.queue.length){
   const entry=this.queue[0];
   try{await this.send(entry.changes,entry.opId,entry.baseRevision);this.queue.shift();this.store?.deleteEntry(entry.opId);this.attempt=0;this.lastError='';this.waitingForConnection=false;this.confirmed(true)}
   catch(error){
    if(error.status===401){entry.queuedOnce=true;this.lastError=error.message;this.listeners.unauthorized?.();throw error}
    if(transient(error)){for(const e of this.queue)e.queuedOnce=true;this.lastError=connectionMessage(error);this.waitingForConnection=!!error.network||error instanceof TypeError;this.scheduleRetry();requestBackgroundSync();throw Object.assign(error,{queued:true,offline:!!error.network||error instanceof TypeError})}
    this.queue.shift();this.store?.deleteEntry(entry.opId);this.lastError='';await this.latest().catch(()=>{});
    // A change made offline and refused later is explained in the sync banner; a live refusal gets the usual message.
    if(entry.queuedOnce){const conflict=describeConflict(entry,this.data,error);this.conflicts=[...this.conflicts.filter(c=>c.opId!==entry.opId),{...conflict,entry}].slice(-10)}
    entry.error=Object.assign(error,{rejected:true});
   }
  }
 }
 run(changes){let entry=null;if(changes.length){entry={opId:newOpId(),seq:++this.seq,baseRevision:this.revision,householdId:this.id,actorId:this.options.actorId||'',account:this.options.account||'',changes,createdAt:Date.now()};this.queue.push(entry);this.store?.putEntry({...entry,error:undefined})}
  this.pending++;this.emit();
  const work=async()=>{try{await this.drain()}catch(error){if(!entry||this.queue.includes(entry))throw error}finally{this.pending--;this.emit()}if(entry?.error)throw entry.error};
  this.chain=this.chain.catch(()=>{}).then(work);return this.chain}
 save(before,after){const changes=diffState(before,after);if(!changes.length)return this.pending?this.chain:this.queue.length?this.flush():Promise.resolve();return this.run(changes)}
 scheduleRetry(){clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.flush().catch(()=>{}),retryDelay(this.attempt++))}
 flush(){if(this.pending||!this.queue.length)return Promise.resolve();return this.run([])}
 async retry(){if(!this.queue.length)return;this.attempt=0;return this.run([])}
 async discard(){clearTimeout(this.retryTimer);for(const e of this.queue)this.store?.deleteEntry(e.opId);this.queue=[];this.lastError='';await this.latest();this.emit()}
 dismissConflict(opId){this.conflicts=this.conflicts.filter(c=>c.opId!==opId);this.emit()}
 // "Use mine": reapply only the fields this person changed, on the latest version. Server rules still decide.
 keepMine(opId){const conflict=this.conflicts.find(c=>c.opId===opId);this.dismissConflict(opId);if(!conflict)return Promise.resolve();const changes=keepMine(conflict.entry,this.data);return changes.length?this.run(changes):Promise.resolve()}
 exportDraft(){const url=URL.createObjectURL(new Blob([JSON.stringify({householdId:this.id,changes:this.failed},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='bayit-unsaved-changes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
