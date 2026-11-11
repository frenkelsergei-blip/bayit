// Offline UI: the quiet "Offline · showing data from 14:05" banner, "waiting to sync" marks on rows,
// conflict notices after reconnecting, and the calm "available when you're online" state for online-only pages.
import React,{useSyncExternalStore} from 'react';
import {CloudSlash,CloudArrowUp,ArrowsClockwise,WarningCircle,X} from '@phosphor-icons/react';
import {network} from './offline-state.js';
import {needsConnection} from '../../shared/offline-sync.mjs';
import './offline.css';

export const useNetwork=()=>useSyncExternalStore(network.subscribe,network.get,network.get);
// True while the app shows its device copy: no connection, timeouts, or opened without reaching the server.
export const isOffline=state=>!state.reachable||state.fromSnapshot;
export const useOnline=()=>!isOffline(useNetwork());

const lang=()=>typeof document!=='undefined'&&document.documentElement.lang==='he'?'he':'en';
export function syncedLabel(at,language=lang(),now=new Date()){
 if(!at)return '';const date=new Date(at),locale=language==='he'?'he-IL':'en-GB',time=date.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',hour12:false});
 if(date.toDateString()===now.toDateString())return time;
 return date.toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short'})+' '+time;
}

// A small mark on a row whose change is saved on this device and not yet confirmed by the household server.
export function PendingSync({collection,id,T}){
 const state=useNetwork();if(!state.pending.has(collection+':'+id))return null;
 const label=T('Waiting to sync','ממתין לסנכרון');
 return <span className="pending-sync" title={label}><CloudArrowUp size={14} weight="bold" aria-hidden="true"/><span>{label}</span></span>;
}

export function OfflineUnavailable({T}){
 return <section className="offline-unavailable" role="status">
  <span className="offline-unavailable-icon" aria-hidden="true"><CloudSlash size={34}/></span>
  <h2>{T('Available when you’re online','זמין כשיש חיבור')}</h2>
  <p>{T('This part of Bayit needs a connection. Today, Calendar, Tasks, Shopping and the kids’ day work from this device meanwhile.','החלק הזה של Bayit צריך חיבור. בינתיים היום, היומן, המשימות, הקניות והיום של הילדים עובדים מהמכשיר הזה.')}</p>
 </section>;
}

// Wraps a page: online-only pages show the calm unavailable state while offline.
export function OfflineGate({root,view,T,children}){
 const state=useNetwork();
 return isOffline(state)&&needsConnection(root,view)?<OfflineUnavailable T={T}/>:children;
}

const reasonText=(c,T)=>{
 const name=lang()==='he'?c.label.he||c.label.en:c.label.en||c.label.he,quoted=name?(lang()==='he'?'"'+name+'"':'“'+name+'”'):T('An item','פריט');
 if(c.reason==='deleted')return T(quoted+' was removed or is no longer shared with you, so your offline change wasn’t saved.',quoted+' נמחק או שכבר לא משותף איתך, ולכן השינוי שעשית בלי חיבור לא נשמר.');
 if(c.reason==='changed')return T('Someone else changed '+quoted+' at the same time. Their version is kept.','מישהו אחר שינה את '+quoted+' באותו זמן. הגרסה שלו נשמרה.');
 return T('Your offline change to '+quoted+' wasn’t allowed'+(c.message?': '+c.message:'.'),'השינוי שעשית בלי חיבור ב'+quoted+' לא אושר'+(c.message?': '+c.message:'.'));
};

// Sync status for the signed-in app. `status` comes from HouseholdClient.subscribeStatus.
export function SyncBanner({client,status,T,error,setError}){
 const state=useNetwork(),offline=isOffline(state),when=syncedLabel(state.syncedAt||status.syncedAt),queued=status.queued||0;
 const waiting=queued?T(queued===1?'1 change waiting to sync':queued+' changes waiting to sync',queued===1?'שינוי אחד ממתין לסנכרון':queued+' שינויים ממתינים לסנכרון'):'';
 const conflicts=status.conflicts||[];
 return <>
  {offline&&<div className="offline-banner" role="status" aria-live="polite">
   <CloudSlash size={18} weight="bold" aria-hidden="true"/>
   <span><strong>{T('Offline','אין חיבור')}</strong>{when&&<> · {T('showing data from '+when,'מוצג מידע מ-'+when)}</>}{waiting&&<> · {waiting}</>}</span>
  </div>}
  {!offline&&queued>0&&!status.failed&&<div className="offline-banner syncing" role="status" aria-live="polite"><ArrowsClockwise size={18} weight="bold" aria-hidden="true"/><span>{T('Syncing your changes…','מסנכרנים את השינויים שלך…')}</span></div>}
  {!offline&&status.failed>0&&<div className="cloud-sync-banner" role="alert"><strong>{waiting}</strong><span>{error||T('Kept on this device. We retry automatically.','נשמר במכשיר הזה. ננסה שוב אוטומטית.')}</span><button onClick={async()=>{try{await client.retry();setError('')}catch(e){setError(T('Could not retry. Your changes are still kept.','לא ניתן לנסות שוב כרגע. השינויים נשמרים.'))}}}>{T('Retry now','לנסות שוב עכשיו')}</button><button onClick={()=>client.exportDraft()}>{T('Download draft','הורדת טיוטה')}</button><button onClick={()=>client.discard().catch(()=>setError(T('Could not discard the draft yet. Try again.','עדיין לא ניתן לבטל את הטיוטה. אפשר לנסות שוב.')))}>{T('Discard draft','ביטול טיוטה')}</button></div>}
  {conflicts.length>0&&<div className="sync-conflicts" role="alert">{conflicts.map(c=><div className="sync-conflict" key={c.opId}>
   <WarningCircle size={20} weight="bold" aria-hidden="true"/>
   <p>{reasonText(c,T)}</p>
   <div className="sync-conflict-actions">{c.canKeepMine&&<button type="button" className="sync-conflict-mine" onClick={()=>client.keepMine(c.opId).catch(()=>{})}>{T('Use mine','להשתמש בשלי')}</button>}<button type="button" className="sync-conflict-ok" aria-label={T('Dismiss','סגירה')} onClick={()=>client.dismissConflict(c.opId)}><X size={18} weight="bold"/><span>{T('OK','הבנתי')}</span></button></div>
  </div>)}</div>}
 </>;
}

// After an online load: ask the service worker to keep the icons this family's records use, so pages that weren't
// opened online (Kids, Tasks, a list) still show their pictures offline. Same lookup as App.jsx Icon: catalog, then OpenMoji.
const ICON_COLLECTIONS=['tasks','events','shopping','notes','taskLists','shoppingLists','meals','pantry'];
export async function warmIcons(data){
 try{
  const controller=navigator.serviceWorker?.controller;if(!controller||!data)return;
  const codes=new Set();for(const key of ICON_COLLECTIONS)for(const record of data[key]||[]){const code=record?.icon;if(typeof code==='string'&&code&&!code.startsWith('data:'))codes.add(code);else if(code&&typeof code==='object'){if(code.base)codes.add(code.base);if(code.badge)codes.add(code.badge)}}
  const catalog=await fetch('/assets/icons/catalog.json').then(r=>r.ok?r.json():[]).catch(()=>[]),urls=[];
  for(const code of [...codes].slice(0,150)){
   if(code.startsWith('/')){urls.push(code);continue}
   const item=catalog.find(i=>i.id===code||i.aliases?.includes(code)),direct=code.match(/^bayit-(groceries|activities|pixel|life)-(.+)$/);
   if(item?.files)urls.push(...Object.values(item.files));else if(direct)urls.push(...[64,128,256].map(n=>'/assets/icons/bayit/'+direct[1]+'/'+direct[2]+'-'+n+'.png'));else if(/^[0-9A-F-]+$/i.test(code))urls.push('/assets/icons/openmoji/svg/'+code+'.svg');
  }
  if(urls.length)controller.postMessage({type:'bayit-cache-urls',urls:[...new Set(urls)].slice(0,400)});
 }catch{}
}
