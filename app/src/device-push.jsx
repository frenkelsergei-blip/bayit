// Settings → Notifications: turn real phone/computer notifications on for THIS device (Web Push).
// Honest status only: "On" means the server stored this device; "Test sent" means the push service accepted it.
import React,{useEffect,useState} from 'react';
import {Bell,BellSlash,DeviceMobile,PaperPlaneTilt,Export,PlusSquare,Info} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';

const supported=()=>typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
const keyBytes=b64=>{const s=b64.replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))};
const deviceName=()=>{const ua=navigator.userAgent;return /iPhone/.test(ua)?'iPhone':/iPad/.test(ua)||isIOS()?'iPad':/Android/.test(ua)?'Android':/Mac/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':'Browser'};

async function api(path,body){
 const response=await fetch('/api/push/'+path,{method:body===undefined?'GET':'POST',headers:{...cloudHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 let result={};try{result=await response.json()}catch{}
 if(!response.ok)throw new Error(result.error||'The notification service did not answer.');
 return result;
}

export function registerServiceWorker(){
 if(!supported())return;
 navigator.serviceWorker.register('/sw.js').catch(()=>{});
 navigator.serviceWorker.addEventListener?.('message',event=>{if(event.data?.type==='bayit-open'&&typeof event.data.url==='string')location.hash=event.data.url.replace(/^#/,'')});
}

export function DevicePush({a,Button}){
 const [state,setState]=useState('checking'),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
 const T=a.T;
 const refresh=async()=>{
  if(!a.cloud){setState('preview');return}
  if(!supported()){setState(isIOS()&&!standalone()?'ios-install':'unsupported');return}
  if(Notification.permission==='denied'){setState('denied');return}
  try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();const status=sub?await api('status?endpoint='+encodeURIComponent(sub.endpoint)):null;setState(sub&&status?.registered?'on':'off')}catch{setState('off')}
 };
 useEffect(()=>{refresh()},[a.cloud]);
 const enable=async()=>{
  setBusy(true);setError('');setNote('');
  try{
   // Must run straight from the tap: iPhone only asks for permission in response to a user action.
   const permission=await Notification.requestPermission();
   if(permission!=='granted'){setState(permission==='denied'?'denied':'off');return}
   const status=await api('status');if(!status.available||!status.publicKey)throw new Error(T('This installation cannot send notifications yet: its server encryption key is missing.','ההתקנה הזו עדיין לא יכולה לשלוח התראות: חסר מפתח ההצפנה בשרת.'));
   const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
   let sub=await reg.pushManager.getSubscription();
   if(sub&&sub.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey),wanted=keyBytes(status.publicKey);if(current.length!==wanted.length||current.some((b,i)=>b!==wanted[i])){await sub.unsubscribe();sub=null}}
   sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(status.publicKey)});
   await api('subscribe',{subscription:sub.toJSON(),device:deviceName()});
   setState('on');setNote(T('Notifications are on for this device. Send a test to check.','ההתראות פעילות במכשיר הזה. שלחו בדיקה כדי לוודא.'));
  }catch(e){setError(e.message||String(e));await refresh()}finally{setBusy(false)}
 };
 const disable=async()=>{
  setBusy(true);setError('');setNote('');
  try{const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();if(sub){await api('unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}setState('off')}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const test=async()=>{
  setBusy(true);setError('');setNote('');
  try{const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();if(!sub){setState('off');return}await api('test',{endpoint:sub.endpoint,lang:a.lang});setNote(T('Test sent. It should appear on this device in a few seconds.','הבדיקה נשלחה. היא אמורה להופיע במכשיר בעוד כמה שניות.'))}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const status={
  checking:[T('Checking this device…','בודקים את המכשיר…'),''],
  preview:[T('Not available in the local preview','לא זמין בתצוגה המקומית'),T('Phone notifications work in the signed-in app.','התראות לטלפון עובדות באפליקציה המחוברת.')],
  'ios-install':[T('Add Bayit to your Home Screen first','קודם מוסיפים את Bayit למסך הבית'),''],
  unsupported:[T('This browser can’t receive notifications','הדפדפן הזה לא יכול לקבל התראות'),T('Use Safari on iPhone (from the Home Screen), or Chrome, Edge or Firefox.','השתמשו ב־Safari באייפון (מתוך מסך הבית), או ב־Chrome, Edge או Firefox.')],
  denied:[T('Notifications are blocked for Bayit','ההתראות חסומות עבור Bayit'),isIOS()?T('Open iPhone Settings → Notifications → Bayit and allow notifications, then come back.','פתחו בהגדרות האייפון ← עדכונים ← Bayit, אפשרו התראות וחזרו לכאן.'):T('Allow notifications for this site in the browser’s site settings, then come back.','אפשרו התראות לאתר הזה בהגדרות האתר בדפדפן, וחזרו לכאן.')],
  off:[T('Off on this device','כבוי במכשיר הזה'),T('Reminders, “done” updates and overdue alerts can pop up on this device like any app.','תזכורות, עדכוני „בוצע” והתראות על איחור יקפצו במכשיר הזה כמו בכל אפליקציה.')],
  on:[T('On for this device','פעיל במכשיר הזה'),T('Same notifications as Telegram, with the same privacy and quiet hours.','אותן התראות כמו בטלגרם, עם אותה פרטיות ושעות שקט.')]
 }[state];
 return <div className={'device-push device-push-'+state}>
  <div className="notification-channel"><DeviceMobile size={29}/><div><strong>{T('Notifications on this device','התראות במכשיר הזה')}</strong><small>{status[0]}</small></div>
   {state==='off'&&<Button icon={Bell} disabled={busy} onClick={enable}>{T('Turn on','הפעלה')}</Button>}
   {state==='on'&&<Button secondary icon={BellSlash} disabled={busy} onClick={disable}>{T('Turn off','כיבוי')}</Button>}
  </div>
  {status[1]&&<p className="device-push-hint">{status[1]}</p>}
  {a.cloud&&<label className="setting-toggle"><input type="checkbox" checked={a.data.profiles?.[a.user]?.notificationPrefs?.previews===true} onChange={e=>{const checked=e.target.checked;a.update(d=>{const p=d.profiles[a.user];p.notificationPrefs={...p.notificationPrefs,previews:checked}})}}/>{T('Show notification text on the lock screen','הצגת תוכן ההתראות במסך הנעילה')}</label>}
  {state==='ios-install'&&<ol className="device-push-steps"><li><Export size={20}/>{T('In Safari, tap Share','ב־Safari לוחצים על שיתוף')}</li><li><PlusSquare size={20}/>{T('Choose “Add to Home Screen”','בוחרים „הוספה למסך הבית”')}</li><li><Bell size={20}/>{T('Open Bayit from its icon and turn notifications on here','פותחים את Bayit מהאייקון ומפעילים כאן התראות')}</li></ol>}
  {state==='on'&&<Button secondary icon={PaperPlaneTilt} disabled={busy} onClick={test}>{T('Send a test','שליחת בדיקה')}</Button>}
  {isIOS()&&['off','on'].includes(state)&&<p className="device-push-hint"><Info size={16}/>{T('On iPhone, notifications work only in the Home Screen app.','באייפון ההתראות עובדות רק מאפליקציית מסך הבית.')}</p>}
  {note&&<p className="device-push-note" role="status">{note}</p>}
  {error&&<p className="device-push-error" role="alert">{error}</p>}
 </div>;
}
