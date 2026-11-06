// Household sync: sends record-level changes to the household server and keeps this tab's copy current.
import {diffState} from '../cloud/state.mjs';
import {cloudHeaders} from './cloud-transport.js';
import {rebaseChanges} from '../../shared/change-merge.mjs';
export async function request(path,body,extraHeaders={}){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...cloudHeaders(),...extraHeaders,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(response.status===304)return {notModified:true};let result;try{result=await response.json()}catch{throw Error('The server did not return a valid response.')}if(!response.ok)throw Object.assign(Error(result.error||'The request failed.'),{status:response.status});return result}
// A change the server refuses (validation, permission, size) is final: it is undone locally and reported.
// Connection problems and server errors are transient: the change stays queued and is retried automatically.
const transient=error=>!error.status||error.status>=500||error.status===408||error.status===429;
export class HouseholdClient{
 constructor(id,initial,transport=request){this.request=transport;this.id=id;this.revision=initial.revision;this.data=initial.data;this.pending=0;this.failed=[];this.lastError='';this.retryTimer=null;this.chain=Promise.resolve();this.listeners={};this.statusListeners=new Set()}
 status(){return {pending:this.pending,failed:this.failed.length,error:this.lastError}}
 emit(){for(const fn of this.statusListeners)fn(this.status());if(!this.pending&&!this.failed.length)this.listeners.data?.(this.data)}
 subscribeStatus(fn){this.statusListeners.add(fn);fn(this.status());return()=>this.statusListeners.delete(fn)}
 connect(listeners){this.listeners=listeners;const interval=setInterval(()=>this.poll(),5000),focus=()=>this.poll(),online=()=>this.flush(),update=e=>{if(this.pending||this.failed.length)e.preventDefault()};window.addEventListener('bayit-before-update',update);window.addEventListener('focus',focus);window.addEventListener('online',online);this.poll();return()=>{clearInterval(interval);clearTimeout(this.retryTimer);window.removeEventListener('focus',focus);window.removeEventListener('online',online);window.removeEventListener('bayit-before-update',update);this.listeners={}}}
 async poll(){if(this.pending||this.failed.length||document.visibilityState==='hidden')return;const started=this.revision;try{const result=await this.request('/api/households/'+this.id+'/state',undefined,{'If-None-Match':'"'+this.revision+'"'});
  // Ignore a response that raced with a save made while it was in flight.
  if(result.notModified||this.pending||this.revision!==started||result.revision<=this.revision)return;this.revision=result.revision;this.data=result.data;this.emit()}catch(error){if(error.status===401||error.status===403)this.listeners.unauthorized?.()}}
 async latest(){const result=await this.request('/api/households/'+this.id+'/state');this.revision=result.revision;this.data=result.data}
 // A rejected revision may merge independent fields; sharing and same-field conflicts require review.
 async send(changes){for(let attempt=0;;attempt++){try{const result=await this.request('/api/households/'+this.id+'/changes',{baseRevision:this.revision,changes});this.revision=result.revision;this.data=result.data;return}catch(error){if(error.status===409&&attempt<3){await this.latest();changes=rebaseChanges(changes,this.data);if(!changes.length)return;continue}throw error}}}
 run(changes){this.pending++;this.emit();const work=async()=>{const queued=this.failed,batch=[...queued,...changes];this.failed=[];try{try{await this.send(batch)}catch(error){
   // A refused batch that also carried older queued changes: give the newest change its own chance.
   if(transient(error)||!queued.length||!changes.length)throw error;await this.send(changes)}this.lastError=''}catch(error){
   if(error.status===401){this.failed=batch;this.lastError=error.message;this.listeners.unauthorized?.();throw error}
   if(transient(error)){this.failed=batch;this.lastError=error.message==='Failed to fetch'||error.message==='Load failed'?'No connection to Bayit right now.':error.message;this.scheduleRetry();throw error}
   this.lastError='';await this.latest().catch(()=>{});throw Object.assign(error,{rejected:true})}finally{this.pending--;this.emit()}};
  this.chain=this.chain.catch(()=>{}).then(work);return this.chain}
 save(before,after){const changes=diffState(before,after);if(!changes.length)return this.pending?this.chain:this.failed.length?this.flush():Promise.resolve();return this.run(changes)}
 scheduleRetry(){clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.flush().catch(()=>{}),8000)}
 flush(){if(this.pending||!this.failed.length)return Promise.resolve();return this.run([])}
 async retry(){if(!this.failed.length)return;await this.latest();return this.run([])}
 async discard(){clearTimeout(this.retryTimer);this.failed=[];this.lastError='';await this.latest();this.emit()}
 exportDraft(){const url=URL.createObjectURL(new Blob([JSON.stringify({householdId:this.id,changes:this.failed},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='bayit-unsaved-changes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
