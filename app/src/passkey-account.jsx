// Passkeys inside the app, concept A and the single proposals chosen 2026-11-10 (concept/explorations/passkey-20261110/):
// 4 · Account security: one section, "Ways to sign in" (Google) and "Passkeys" (list, add, rename, remove), then sessions.
// 5 · "Confirm it's you": a passkey touch in place, no redirect; Google stays as a small link for people who have it.
// 6 · Recovery: a parent's "Help <name> get back in" with the 24-hour hold, and the notice the person sees on Today.
import React,{useState,useEffect,useCallback} from 'react';
import {ShieldCheck,SignIn,Fingerprint,GoogleLogo,Plus,PencilSimple,Trash,HandPalm,Devices,DeviceMobile,Laptop,CloudCheck,Info,Lifebuoy,Clock,Copy,Check,X,Question,WarningCircle} from '@phosphor-icons/react';
import {FormSection} from './form-section';
import {ConnectionDialog} from './connection-dialog';
import {googleSignIn} from './cloud-client';
import {passkeyCall,familyCall,registerPasskey,confirmWithPasskey,cancelled,alreadySaved} from './passkey-client';
import {Explain,Note} from './passkey-entry';
import {cloudHeaders} from './cloud-transport';
import './passkeys.css';

export const passkeysAvailable=a=>!!a.cloud?.config?.signIn?.methods?.some(m=>m.id==='passkey');
const when=(a,ms)=>{if(!ms)return '';const d=new Date(ms),today=new Date(),same=d.toDateString()===today.toDateString(),locale=a.lang==='he'?'he-IL':'en-GB',time=d.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});return same?a.T('today ','היום ')+time:d.toLocaleDateString(locale,{day:'numeric',month:'short'})+' '+time};
const day=(a,ms)=>new Date(ms).toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'long'});
const deviceIcon=name=>/laptop|mac|computer|pc|desktop|מחשב/i.test(name||'')?Laptop:DeviceMobile;
const Btn=({icon:Icon,children,secondary,...rest})=><button type="button" className={'button'+(secondary?' secondary':'')} {...rest}>{Icon&&<Icon size={21} aria-hidden/>}{children}</button>;

// ---------------------------------------------------------------- 5 · Confirm it's you
// Shown by the identity provider (connection-dialog.jsx) and by Account security when a change needs recent identity.
export function ConfirmIdentityDialog({a,google,windowMs=30*60000,onDone,onClose,returnHash='#settings/connections'}){
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),minutes=Math.round(windowMs/60000);
 const go=async()=>{setBusy(true);setFailed(false);try{await confirmWithPasskey();onDone?.()}catch(e){setFailed(true)}finally{setBusy(false)}};
 return <ConnectionDialog a={a} compact busy={busy} icon={ShieldCheck} title={a.T('Confirm it’s you','לאשר שזה אתם')} onClose={onClose}
  footer={<><Btn icon={Fingerprint} disabled={busy} onClick={go} aria-busy={busy||undefined}>{failed?a.T('Try again','ניסיון נוסף'):a.T('Confirm with a passkey','אישור עם מפתח גישה')}</Btn><Btn secondary disabled={busy} onClick={onClose}>{a.T('Not now','לא עכשיו')}</Btn></>}>
  <div className="pk-dialog-body">
   <p>{failed?a.T('Before changing an account or connection, confirm it’s you.','לפני שינוי חשבון או חיבור, מאשרים שזה אתם.'):a.T('Before changing an account or connection, confirm it’s you. It takes a second: face, fingerprint or screen lock.','לפני שינוי חשבון או חיבור, מאשרים שזה אתם. זה לוקח שנייה: פנים, טביעת אצבע או קוד הנעילה.')}</p>
   {failed?<p role="alert" className="connection-error">{a.T('The confirmation wasn’t completed. Nothing changed. You can try again.','האישור לא הושלם. שום דבר לא השתנה. אפשר לנסות שוב.')}</p>
   :<p className="muted">{a.T('You stay on this page. Nothing has been saved yet. The confirmation lasts '+minutes+' minutes.','נשארים בדף הזה. שום דבר עוד לא נשמר. האישור תקף ל־'+minutes+' דקות.')}</p>}
   {google&&!failed&&<p className="pk-hint" style={{margin:0}}>{a.T('Don’t have your passkey here?','אין לכם את מפתח הגישה כאן?')} <a className="pk-link" href="#" onClick={e=>{e.preventDefault();setBusy(true);googleSignIn({returnHash}).catch(()=>setBusy(false))}}>{a.T('Confirm with Google','אישור עם Google')}</a></p>}
  </div>
 </ConnectionDialog>;
}

// ---------------------------------------------------------------- 4 · Account security
export function PasskeySecurity({a,sessions:showSessions=true}){
 const [keys,setKeys]=useState(null),[status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[renaming,setRenaming]=useState(null),[removing,setRemoving]=useState(null),[adding,setAdding]=useState(false),[confirming,setConfirming]=useState(null);
 const load=useCallback(async()=>{try{const [k,s]=await Promise.all([passkeyCall('credentials'),fetch('/api/security/sessions',{headers:cloudHeaders()}).then(r=>r.ok?r.json():Promise.reject())]);setKeys(k);setStatus(s)}catch{setError(a.T('Account security is unavailable right now.','אבטחת החשבון לא זמינה כרגע.'))}},[]);
 useEffect(()=>{load();const focus=()=>load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus)},[load]);
 // A change that needs recent identity: confirm in place first (a passkey touch, or Google when it is the only way).
 const recent=async(then)=>{const s=await fetch('/api/security/sessions',{headers:cloudHeaders()}).then(r=>r.json()).catch(()=>null);setStatus(s);if(s?.recent)return then();if(keys?.passkeys?.length)setConfirming(()=>then);else{setBusy(true);googleSignIn({returnHash:'#settings/privacy'}).catch(()=>setBusy(false))}};
 const run=async work=>{setBusy(true);setError('');try{await work();await load();return true}catch(e){if(e.code==='REAUTH_REQUIRED'){setBusy(false);return recent(()=>run(work))}setError(e.message);return false}finally{setBusy(false)}};
 const list=keys?.passkeys||[],google=!!keys?.google;
 const revoke=id=>run(async()=>{const r=await fetch('/api/security/sessions',{method:'DELETE',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify({id})});if(!r.ok){const v=await r.json().catch(()=>({}));throw Object.assign(Error(v.error),{code:v.code})}});
 const others=k=>[google&&'Google',...list.filter(x=>x.id!==k.id).map(x=>'“'+(x.name||a.T('Passkey','מפתח גישה'))+'”')].filter(Boolean);
 const row=k=>{const Icon=deviceIcon(k.name),name=k.name||a.T('Passkey','מפתח גישה'),meta=a.T('Created ','נוצר ')+day(a,k.createdAt)+' · '+(k.lastUsedAt?a.T('Last used: ','שימוש אחרון: ')+when(a,k.lastUsedAt):a.T('Not used yet','עוד לא השתמשו בו'));
  if(renaming?.id===k.id)return <div className="pk-row" key={k.id}><span className="pk-tile"><Icon size={22} aria-hidden/></span><form className="pk-rename" onSubmit={async e=>{e.preventDefault();if(await run(()=>passkeyCall('credentials',{id:k.id,name:renaming.name},{method:'PATCH'})))setRenaming(null)}}><input value={renaming.name} onChange={e=>setRenaming({...renaming,name:e.target.value})} maxLength={40} aria-label={a.T('Passkey name','שם מפתח הגישה')} autoFocus/><button className="button" disabled={busy||!renaming.name.trim()}>{a.T('Save','שמירה')}</button><Btn secondary onClick={()=>setRenaming(null)}>{a.T('Cancel','ביטול')}</Btn></form><span className="pk-meta">{meta}</span></div>;
  return <div className="pk-row" key={k.id}><span className="pk-tile"><Icon size={22} aria-hidden/></span><strong>{name}{k.synced?<span className="pk-badge sync"><CloudCheck size={14} aria-hidden/>{a.T('Synced across your devices','מסונכרן בין המכשירים שלכם')}</span>:<span className="pk-badge here"><DeviceMobile size={14} aria-hidden/>{a.T('This device only','רק במכשיר הזה')}</span>}</strong><div className="pk-acts"><button type="button" className="pk-iconbtn" aria-label={a.T('Rename','שינוי שם')+' '+name} onClick={()=>setRenaming({id:k.id,name:k.name||''})}><PencilSimple size={20} aria-hidden/></button><button type="button" className="pk-iconbtn danger" aria-label={a.T('Remove','הסרה')+' '+name} disabled={!google&&list.length<2} title={!google&&list.length<2?a.T('This is your only way to sign in. Add another passkey first.','זו הדרך היחידה שלכם להיכנס. הוסיפו קודם מפתח גישה נוסף.'):undefined} onClick={()=>setRemoving(k)}><Trash size={20} aria-hidden/></button></div><span className="pk-meta">{meta}</span></div>};
 const sessionsList=status?.sessions||[];
 return <FormSection T={a.T} icon={ShieldCheck} tone="peach" className="security-settings settings-wide pk-sec-section" title={a.T('Account security','אבטחת החשבון')}>
  <div className="pk-sec">
   <p className="settings-section-intro">{a.T('Your ways into Bayit. Invitations and changing connections need a quick check that it’s you.','הדרכים שלכם להיכנס ל־Bayit. הזמנות ושינוי חיבורים דורשים אישור קצר שזה אתם.')}</p>
   {google&&<><div className="pk-sub-h"><SignIn size={18} aria-hidden/>{a.T('Ways to sign in','דרכי כניסה')}</div><div className="pk-rows"><div className="pk-row"><span className="pk-tile soft"><GoogleLogo size={22} aria-hidden/></span><strong>Google</strong><div className="pk-acts"><span className="pk-badge">{a.T('Connected','מחובר')}</span></div><span className="pk-meta"><bdi dir="ltr">{keys.email}</bdi></span></div></div></>}
   <div className="pk-sub-h"><Fingerprint size={18} aria-hidden/>{a.T('Passkeys','מפתחות גישה')}{list.length>0&&<span className="pk-count">{list.length}</span>}</div>
   {keys===null&&!error?<p className="muted">{a.T('Loading…','טוענים…')}</p>:list.length?<div className="pk-rows">{list.map(row)}</div>
    :<div className="pk-empty"><span className="pk-tile"><Fingerprint size={24} aria-hidden/></span><p><strong>{a.T('You don’t have a passkey yet','עוד אין לכם מפתח גישה')}</strong>{a.T('With a passkey you sign in with your face, fingerprint or screen lock, without going through Google. Google keeps working.','עם מפתח גישה נכנסים בפנים, בטביעת אצבע או בקוד הנעילה, בלי לעבור דרך Google. Google ימשיך לעבוד.')}</p></div>}
   <div className="pk-actions"><Btn icon={Plus} secondary={list.length>0} disabled={busy||keys===null} onClick={()=>setAdding(true)}>{a.T('Add a passkey','הוספת מפתח גישה')}</Btn></div>
   {list.length>0&&<p className="pk-hint" style={{margin:0}}><HandPalm size={15} aria-hidden/> {a.T('A passkey is your key to Bayit. Don’t share it, and don’t create it on a device someone else uses.','מפתח גישה הוא המפתח שלכם ל־Bayit. אל תשתפו אותו, ואל תיצרו אותו במכשיר שמישהו אחר נכנס אליו.')}</p>}
   {showSessions&&sessionsList.length>0&&<><div className="pk-sub-h"><Devices size={18} aria-hidden/>{a.T('Where you’re signed in now','איפה אתם מחוברים עכשיו')}</div><div className="pk-sessions">{sessionsList.map(s=><div className="pk-srow" key={s.id}><span>{(s.current?a.T('This sign-in','הכניסה הזו'):a.T('Another sign-in','כניסה נוספת'))+(s.authenticated_at?' · '+when(a,s.authenticated_at):'')}</span>{!s.current&&<button type="button" className="button secondary" style={{minHeight:40}} disabled={busy} onClick={()=>revoke(s.id)}>{a.T('Sign out','ניתוק')}</button>}</div>)}</div></>}
   {error&&<p role="alert" className="ai-error">{error}</p>}
  </div>
  {adding&&<AddPasskeyDialog a={a} onClose={()=>setAdding(false)} onAdded={()=>{setAdding(false);load()}} needsConfirm={()=>recent(()=>setAdding(true))}/>}
  {removing&&<ConnectionDialog a={a} compact busy={busy} icon={Trash} title={a.T('Remove “'+(removing.name||'Passkey')+'”?','להסיר את "'+(removing.name||'מפתח גישה')+'"?')} onClose={()=>setRemoving(null)}
   footer={<><Btn icon={Trash} disabled={busy} onClick={async()=>{if(await run(()=>passkeyCall('credentials',{id:removing.id},{method:'DELETE'})))setRemoving(null)}}>{a.T('Remove','הסרה')}</Btn><Btn secondary disabled={busy} onClick={()=>setRemoving(null)}>{a.T('Cancel','ביטול')}</Btn></>}>
   <div className="pk-dialog-body"><p>{a.T('After removing it, this passkey can’t be used to sign in. It stays saved on the device until you delete it there, but Bayit won’t accept it any more.','אחרי ההסרה אי אפשר יהיה להיכנס עם המפתח הזה. המפתח עצמו נשאר שמור במכשיר עד שתמחקו אותו שם, אבל Bayit כבר לא יקבל אותו.')}</p><Note tone="blue" icon={Info}>{a.T('You can still sign in with '+others(removing).join(' and ')+'.','עדיין תוכלו להיכנס עם '+others(removing).join(' ועם ')+'.')}</Note>{error&&<p role="alert" className="connection-error">{error}</p>}</div>
  </ConnectionDialog>}
  {confirming&&<ConfirmIdentityDialog a={a} google={google} windowMs={status?.recentWindowMs} returnHash="#settings/privacy" onClose={()=>setConfirming(null)} onDone={()=>{const next=confirming;setConfirming(null);next()}}/>}
 </FormSection>;
}
function AddPasskeyDialog({a,onClose,onAdded,needsConfirm}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const create=async()=>{setBusy(true);setError('');try{await registerPasskey('add',{deviceName:name.trim()});onAdded()}catch(e){if(e.code==='REAUTH_REQUIRED'){onClose();needsConfirm();return}setError(cancelled(e)?a.T('No passkey was created. Nothing was saved.','לא נוצר מפתח גישה. שום דבר לא נשמר.'):alreadySaved(e)?a.T('This device already has your Bayit passkey.','במכשיר הזה כבר יש את מפתח הגישה שלכם ל־Bayit.'):e.message)}finally{setBusy(false)}};
 return <ConnectionDialog a={a} compact busy={busy} icon={Fingerprint} title={a.T('Add a passkey','הוספת מפתח גישה')} description={a.T('On the device you’re using now','במכשיר שאתם משתמשים בו עכשיו')} onClose={onClose}
  footer={<><Btn icon={Fingerprint} disabled={busy} onClick={create} aria-busy={busy||undefined}>{busy?a.T('Continue in your device’s window…','ממשיכים בחלון של המכשיר…'):a.T('Create a passkey','יצירת מפתח גישה')}</Btn><Btn secondary disabled={busy} onClick={onClose}>{a.T('Cancel','ביטול')}</Btn></>}>
  <div className="pk-dialog-body"><Explain T={a.T}/><label style={{display:'grid',gap:6,fontWeight:800}}>{a.T('Name for this device','שם למכשיר')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder={a.T('e.g. My iPhone','למשל, האייפון שלי')}/></label><p className="pk-hint" style={{margin:0}}>{a.T('So you recognise it in the list. Only you see the name.','כדי שתזהו אותו ברשימה. רק אתם רואים את השם.')}</p><Note tone="yellow" icon={HandPalm}>{a.T('This passkey is yours alone. Don’t share it with another family member.','המפתח הזה רק שלכם. אל תשתפו אותו עם בן משפחה אחר.')}</Note>{error&&<p role="alert" className="connection-error">{error}</p>}</div>
 </ConnectionDialog>;
}

// ---------------------------------------------------------------- 6 · Recovery: a parent helps someone back in
const tomorrowAt=(a,iso)=>{const d=new Date(iso),locale=a.lang==='he'?'he-IL':'en-GB',time=d.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'}),tomorrow=new Date(Date.now()+86400000).toDateString()===d.toDateString();return tomorrow?a.T('tomorrow at '+time,'מחר ב־'+time):d.toLocaleString(locale,{weekday:'long',hour:'2-digit',minute:'2-digit'})};
export function HelpBackInDialog({a,memberId,onClose,onChanged}){
 const name=a.name(memberId),[busy,setBusy]=useState(false),[made,setMade]=useState(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const create=async()=>{setBusy(true);setError('');try{const r=await familyCall('/api/family/invitations/recovery',{memberId});setMade(r);onChanged?.()}catch(e){setError(e.code==='REAUTH_REQUIRED'?a.T('Confirm it’s you first (Settings › Privacy › Account security), then try again.','קודם מאשרים שזה אתם (הגדרות › פרטיות › אבטחת החשבון), ואז מנסים שוב.'):e.message)}finally{setBusy(false)}};
 const cancel=async()=>{setBusy(true);try{const id=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new URLSearchParams(new URL(made.url).hash.split('?')[1]).get('invite'))).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''));await fetch('/api/family/invitations/'+id,{method:'DELETE',headers:cloudHeaders()});onChanged?.();onClose()}catch{setError(a.T('The link could not be cancelled. Try again.','לא הצלחנו לבטל את הקישור. נסו שוב.'))}finally{setBusy(false)}};
 if(made)return <ConnectionDialog a={a} compact busy={busy} icon={Lifebuoy} title={a.T('A way-back link for '+name+' is ready','קישור חזרה ל'+name+' נוצר')} onClose={onClose}
  footer={<><Btn icon={copied?Check:Copy} onClick={async()=>{try{await navigator.clipboard.writeText(made.url);setCopied(true)}catch{window.prompt(a.T('Copy this link','העתיקו את הקישור'),made.url)}}}>{copied?a.T('Copied','הועתק'):a.T('Copy the link','העתקת הקישור')}</Btn><Btn icon={X} secondary disabled={busy} onClick={cancel}>{a.T('Cancel the link','ביטול הקישור')}</Btn></>}>
  <div className="pk-dialog-body"><div className="pk-hero"><span className="pk-ring"><Clock size={40} aria-hidden/></span><p>{a.T('The link starts working ','הקישור יתחיל לעבוד ')}<span className="pk-when">{tomorrowAt(a,made.usableAt)}</span>. {made.reached?a.T(name+' already got a notice.',name+' כבר קיבל/ה הודעה.'):''}{made.parentsNotified?' '+a.T('The other parents were told too.','גם ההורים האחרים קיבלו הודעה.'):''}</p></div>{!made.reached&&<Note tone="peach" icon={WarningCircle} head={a.T(name+' didn’t get a notice','ההודעה לא הגיעה ל'+name)}>{a.T('They have no phone notifications or Telegram from Bayit. Tell them yourself; otherwise they see it only when they open Bayit.','אין להם התראות בטלפון או טלגרם מ־Bayit. ספרו להם בעצמכם; אחרת הם יראו את זה רק כשיפתחו את Bayit.')}</Note>}<label style={{display:'grid',gap:6,fontWeight:800}}>{a.T('The link','הקישור')}<input dir="ltr" value={made.url} readOnly onFocus={e=>e.target.select()}/></label><p className="pk-hint" style={{margin:0}}>{a.T('You can send it now. It won’t work before then.','אפשר לשלוח אותו כבר עכשיו. לפני הזמן הזה הוא לא יעבוד.')}</p>{error&&<p role="alert" className="connection-error">{error}</p>}</div>
 </ConnectionDialog>;
 return <ConnectionDialog a={a} compact busy={busy} icon={Lifebuoy} title={a.T('Help '+name+' get back in','לעזור ל'+name+' לחזור לחשבון')} description={a.T('When they have no device with their passkey','כשאין מכשיר עם מפתח הגישה')} onClose={onClose}
  footer={<><Btn icon={Lifebuoy} disabled={busy} onClick={create}>{a.T('Create a way-back link','יצירת קישור חזרה')}</Btn><Btn secondary disabled={busy} onClick={onClose}>{a.T('Cancel','ביטול')}</Btn></>}>
  <div className="pk-dialog-body"><ul className="pk-list"><li><b>1</b><span>{a.T('You create a way-back link for them.','יוצרים קישור חזרה בשבילו או בשבילה.')}</span></li><li><b>2</b><span>{a.T('It starts working only ','הוא יתחיל לעבוד רק ')}<span className="pk-when">{a.T('after 24 hours','אחרי 24 שעות')}</span>.</span></li><li><b>3</b><span>{a.T('Meanwhile '+name+' gets a notice in the app and on Telegram, and can cancel it.','בינתיים '+name+' מקבל/ת הודעה באפליקציה ובטלגרם, ויכול/ה לבטל.')}</span></li><li><b>4</b><span>{a.T('Then they open the link and create a new passkey.','אחר כך פותחים את הקישור ויוצרים מפתח גישה חדש.')}</span></li></ul><Note tone="lilac" icon={Question} head={a.T('Why wait a day?','למה לחכות יום?')}>{a.T('So nobody in the family can get into someone else’s account without them knowing.','כדי שאף אחד במשפחה לא יוכל להיכנס לחשבון של מישהו אחר בלי שהוא יידע.')}</Note>{error&&<p role="alert" className="connection-error">{error}</p>}</div>
 </ConnectionDialog>;
}

// The notice on Today: "<Parent> asked for a new passkey for your account", with Cancel and "That's fine".
export function RecoveryNotice({a}){
 const [requests,setRequests]=useState([]),[hidden,setHidden]=useState(()=>{try{return JSON.parse(sessionStorage.getItem('bayit-recovery-seen')||'[]')}catch{return []}}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [household,setHousehold]=useState([]);
 useEffect(()=>{if(!passkeysAvailable(a))return;let live=true;passkeyCall('recovery').then(r=>{if(live){setRequests(r.requests||[]);setHousehold((r.household||[]).filter(x=>x.householdId===a.data.householdId))}}).catch(()=>{});return()=>{live=false}},[a.data.householdId]);
 const shown=requests.filter(r=>!hidden.includes(r.id));if(!shown.length)return <ParentRecoveryNotice a={a} list={household} hidden={hidden} hide={id=>{const next=[...hidden,id];setHidden(next);try{sessionStorage.setItem('bayit-recovery-seen',JSON.stringify(next))}catch{}}} drop={id=>setHousehold(l=>l.filter(x=>x.id!==id))}/>;const r=shown[0];
 const keep=()=>{const next=[...hidden,r.id];setHidden(next);try{sessionStorage.setItem('bayit-recovery-seen',JSON.stringify(next))}catch{}};
 const cancel=async()=>{setBusy(true);setError('');try{await passkeyCall('recovery/cancel',{id:r.id});setRequests(list=>list.filter(x=>x.id!==r.id))}catch{setError(a.T('It could not be cancelled. Try again.','לא הצלחנו לבטל. נסו שוב.'))}finally{setBusy(false)}};
 return <section className="pk-banner" role="alert"><span className="pk-tile"><WarningCircle size={26} aria-hidden/></span><strong>{a.T(r.by+' asked for a new passkey for your account',r.by+' ביקש/ה מפתח גישה חדש לחשבון שלכם')}</strong><p>{a.T('It would let someone into your account from a new device, from ','הוא יאפשר להיכנס לחשבון שלכם ממכשיר חדש, החל מ')}<b>{tomorrowAt(a,r.usableAt)}</b>{a.T('. If you asked for this, there’s nothing to do.','. אם ביקשתם את זה, אין צורך לעשות כלום.')}</p>{error&&<p role="alert">{error}</p>}<div className="pk-actions"><Btn icon={X} disabled={busy} onClick={cancel}>{a.T('I didn’t ask, cancel it','לא ביקשתי, לבטל')}</Btn><Btn secondary disabled={busy} onClick={keep}>{a.T('That’s fine','זה בסדר')}</Btn></div></section>;
}

// Every parent sees a pending recovery in their household, whoever made it, and can cancel it (review finding 5).
function ParentRecoveryNotice({a,list,hidden,hide,drop}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const r=list.find(x=>!hidden.includes(x.id));if(!r)return null;const name=a.name(r.memberId);
 const cancel=async()=>{setBusy(true);setError('');try{const res=await fetch('/api/family/invitations/'+r.id,{method:'DELETE',headers:cloudHeaders()});if(!res.ok)throw Error();drop(r.id)}catch{setError(a.T('It could not be cancelled. Try again.','לא הצלחנו לבטל. נסו שוב.'))}finally{setBusy(false)}};
 return <section className="pk-banner" role="status"><span className="pk-tile"><Lifebuoy size={26} aria-hidden/></span><strong>{a.T(r.by+' asked for a new passkey for '+name,r.by+' ביקש/ה מפתח גישה חדש ל'+name)}</strong><p>{a.T('The way-back link works from ','קישור החזרה יעבוד החל מ')}<b>{tomorrowAt(a,r.usableAt)}</b>{a.T('. If this isn’t right, cancel it.','. אם זה לא נראה נכון, בטלו אותו.')}</p>{error&&<p role="alert">{error}</p>}<div className="pk-actions"><Btn icon={X} disabled={busy} onClick={cancel}>{a.T('Cancel the link','ביטול הקישור')}</Btn><Btn secondary disabled={busy} onClick={()=>hide(r.id)}>{a.T('That’s fine','זה בסדר')}</Btn></div></section>;
}
