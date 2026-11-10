// Device storage for offline use (IndexedDB): the last confirmed household data for the signed-in member,
// and the edits made while the connection was down. Cleared on sign-out and when another account signs in.
// Every call fails soft: without IndexedDB (private mode, old browser) the app simply works online-only.
const DB_NAME='bayit-offline',VERSION=1;
// Set while signing out: a snapshot or queued change scheduled a moment earlier must not land after the clear.
let locked=false;
let opening=null;
function open(){
 if(opening)return opening;
 opening=new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(Error('IndexedDB unavailable'));return}
  const req=indexedDB.open(DB_NAME,VERSION);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots');if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'opId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta')};
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null};resolve(db)};
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('IndexedDB blocked'));
 }).catch(error=>{opening=null;throw error});
 return opening;
}
const tx=async(stores,mode,fn)=>{const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(stores,mode);let result;Promise.resolve(fn(t)).then(r=>{result=r});t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('aborted'))})};
const wrap=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});

// The account key ties stored data to one signed-in Google account on this device.
export const accountKey=session=>session?.user?.email||session?.user?.id||'';

// Keeps only the active household+member: saving for another member or household replaces the old copy.
export async function saveSnapshot(snapshot){
 if(locked)return false;
 try{await tx(['snapshots','meta'],'readwrite',t=>{const s=t.objectStore('snapshots');s.clear();s.put(snapshot,'current');t.objectStore('meta').put({account:snapshot.account,householdId:snapshot.householdId,actorId:snapshot.actorId,savedAt:snapshot.savedAt},'last')});return true}catch{return false}
}
export async function readSnapshot(){try{return await tx(['snapshots'],'readonly',t=>wrap(t.objectStore('snapshots').get('current')))||null}catch{return null}}

export async function loadQueue(householdId,actorId){
 try{const all=await tx(['queue'],'readonly',t=>wrap(t.objectStore('queue').getAll()));return (all||[]).filter(e=>e.householdId===householdId&&e.actorId===actorId).sort((a,b)=>a.seq-b.seq)}catch{return []}
}
export async function putEntry(entry){if(locked)return false;try{await tx(['queue'],'readwrite',t=>{t.objectStore('queue').put(entry)});return true}catch{return false}}
export async function deleteEntry(opId){try{await tx(['queue'],'readwrite',t=>{t.objectStore('queue').delete(opId)});return true}catch{return false}}
export async function queueSize(){try{return await tx(['queue'],'readonly',t=>wrap(t.objectStore('queue').count()))}catch{return 0}}

// Removes everything this device keeps for offline use. With {lock:true} (sign-out) nothing more is written by this page.
export async function clearOfflineData({lock=false}={}){
 if(lock)locked=true;
 try{await tx(['snapshots','queue','meta'],'readwrite',t=>{for(const s of ['snapshots','queue','meta'])t.objectStore(s).clear()});return true}
 catch{try{await new Promise(r=>{const req=indexedDB.deleteDatabase(DB_NAME);req.onsuccess=req.onerror=req.onblocked=()=>r()})}catch{}return false}
}

// Another account signed in on this device: drop the previous account's copy and its unsent edits.
export async function forgetOtherAccounts(account){
 try{const meta=await tx(['meta'],'readonly',t=>wrap(t.objectStore('meta').get('last')));if(meta&&meta.account&&meta.account!==account)await clearOfflineData()}catch{}
}

export const offlineStore={saveSnapshot,readSnapshot,loadQueue,putEntry,deleteEntry,clearOfflineData};
