// Install wizard concept A, "Family members" window (user decision 2026-11-11; concept a2-people, a2-people-docker).
// One card per person: a name, a role (parent / adult / child) and that person's own invitation link with Send (the
// phone's share sheet where the browser has one) and Copy. A child can be a profile only. Uses the existing calls
// unchanged: POST /api/family/invitations (once per person, behind the 30-minute "it's you" check, so the existing
// confirm window opens when needed) and the household's members list for child profiles. The server keeps no name
// for an adult's invitation and never returns a link again, so a link (and the name typed for it) lives only in
// this window while it is open; afterwards the card shows the invitation without a name or link.
import React,{useEffect,useRef,useState} from 'react';
import {UsersThree,ShareNetwork,Copy,Check,Link as LinkIcon,UserCircle,UserPlus,Info,CheckCircle,Globe,ArrowSquareOut,DeviceMobile,Clock} from '@phosphor-icons/react';
import {ConnectionDialog,useConnectionIdentity,connectionNeedsIdentity} from './connection-dialog';
import {cloudHeaders} from './cloud-transport';
import './setup-wizard.css';

export const loopback=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const ROLES=[['parent','Parent','הורה'],['adult','Adult','מבוגר/ת'],['child','Child','ילד/ה']];
// Names typed in this window during this visit (never links or tokens), so the Done screen can say "Links for Hila and Itai".
export const invitedThisVisit=[];
const Note=({tone,icon:Icon,head,children})=><div className={'pk-note '+tone}><Icon size={22} aria-hidden/><div>{head&&<strong>{head}</strong>}{children&&<p>{children}</p>}</div></div>;
const Pill=({ok,children})=><span className={'conn-pill '+(ok?'iw-you':'off')}>{ok?<CheckCircle size={16} weight="fill" aria-hidden/>:<Clock size={16} aria-hidden/>}{children}</span>;

async function post(path,body){
 const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});
 let v={};try{v=await r.json()}catch{}
 if(!r.ok)throw Object.assign(Error(v.error||'The request failed.'),{...v,status:r.status});return v;
}

export function SetupPeople({a,ui,onClose}){
 const T=a.T,identity=useConnectionIdentity(),{Avatar,Button}=ui;
 const [cards,setCards]=useState(()=>[{key:'new-'+Date.now(),name:'',role:'adult',state:'draft'}]),[pending,setPending]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState({});
 const family=a.data.preferences.householdName||'';
 useEffect(()=>{fetch('/api/family/invitations',{headers:cloudHeaders(),credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>setPending((d?.invitations||[]).filter(i=>i.status==='pending'&&i.purpose!=='recover'))).catch(()=>setPending([]))},[]);
 const set=(key,patch)=>setCards(list=>list.map(c=>c.key===key?{...c,...patch}:c));
 const fail=(key,e)=>{if(connectionNeedsIdentity(e)){identity.rejected(e,'family');setError(x=>({...x,[key]:T('Confirm it’s you, then press it again.','אשרו שזה אתם, ואז לחצו שוב.')}));return}
  setError(x=>({...x,[key]:e.status===429?T('That’s a lot of invitations today. Try again tomorrow.','זה הרבה הזמנות להיום. נסו שוב מחר.'):e.status===409?T('This family has reached its member limit.','המשפחה הגיעה למספר החברים המרבי.'):T('Not created. Check the connection and try again.','לא נוצר. בדקו את החיבור ונסו שוב.')}))};
 // A child profile is saved first, in the household's own members list (parents only, as everywhere in Bayit).
 const addChild=async card=>{const id=crypto.randomUUID();await a.update(d=>{d.members=[...d.members,{id,name:card.name.trim(),he:card.name.trim(),color:'green',role:'child'}]});return id};
 const createLink=async card=>{if(!card.name.trim()){setError(x=>({...x,[card.key]:T('Write a name first.','כתבו קודם שם.')}));return}
  setBusy(card.key);setError(x=>({...x,[card.key]:''}));
  try{if(!await identity.guard('family'))return;
   // As Settings › Family does for a new child: no profile id, so the child's profile is made when they join with
   // their own passkey (an existing profile with private records cannot be claimed by a link; child-identity.mjs).
   const v=await post('/api/family/invitations',{householdId:a.data.householdId,role:card.role,expiresInDays:7});
   const url=new URL(v.url);if(url.origin!==location.origin)throw Error('The invitation response is invalid.');
   set(card.key,{state:'link',url:url.href,expiresAt:v.expiresAt});invitedThisVisit.push(card.name.trim());dispatchEvent(new Event('bayit-invitations-changed'));
  }catch(e){fail(card.key,e)}finally{setBusy('')}};
 const profileOnly=async card=>{if(!card.name.trim()){setError(x=>({...x,[card.key]:T('Write a name first.','כתבו קודם שם.')}));return}
  setBusy(card.key);try{const memberId=await addChild(card);set(card.key,{state:'profile',memberId})}catch(e){fail(card.key,e)}finally{setBusy('')}};
 const message=card=>T(`${card.name}, this is your invitation to ${family||'our home'} on Bayit. Open it in Safari or Chrome (not inside WhatsApp or Telegram), then create your passkey:`,`${card.name}, זו ההזמנה שלך ל${family||'בית שלנו'} ב־Bayit. פתחו אותה ב־Safari או ב־Chrome (לא בתוך וואטסאפ או טלגרם), ואז צרו מפתח גישה:`);
 const send=async card=>{const text=message(card);
  if(navigator.share){try{await navigator.share({title:'Bayit',text,url:card.url});set(card.key,{sent:'shared'})}catch(e){if(e?.name!=='AbortError')setError(x=>({...x,[card.key]:T('Sharing didn’t open. Use Copy instead.','השיתוף לא נפתח. השתמשו בהעתקה.')}))}return}
  try{await navigator.clipboard.writeText(text+' '+card.url);set(card.key,{sent:'copied-message'})}catch{setError(x=>({...x,[card.key]:T('This browser can’t share or copy here. Select the link below and copy it.','הדפדפן הזה לא יכול לשתף או להעתיק כאן. סמנו את הקישור למטה והעתיקו אותו.')}))}};
 const copy=async card=>{try{await navigator.clipboard.writeText(card.url);set(card.key,{sent:'copied'})}catch{setError(x=>({...x,[card.key]:T('Copying isn’t allowed here. Select the link below and copy it.','אי אפשר להעתיק כאן. סמנו את הקישור למטה והעתיקו אותו.')}))}};
 const add=useRef(null);
 const roles=(card,locked)=><div className="iw-roles" role={locked?undefined:'radiogroup'} aria-label={T('Role','תפקיד')}>{ROLES.map(([k,en,he])=>locked?<span key={k} className={k===card.role?'on':''}>{T(en,he)}</span>:<button type="button" role="radio" aria-checked={k===card.role} key={k} className={k===card.role?'on':''} onClick={()=>set(card.key,{role:k})}>{T(en,he)}</button>)}</div>;

 if(loopback())return <ConnectionDialog a={a} title={T('Family members','בני המשפחה')} icon={UsersThree} description={T('Each person signs in with their own passkey, on their own phone.','כל אחד נכנס עם מפתח גישה משלו, מהטלפון שלו.')} onClose={onClose}
  footer={<div className="iw-foot"><a className="button" href="https://github.com/frenkelsergei-blip/bayit/blob/main/docs/self-hosting-docker.md" target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={21} aria-hidden/>{T('Open the address guide','למדריך הכתובת')}</a><Button secondary onClick={onClose}>{T('Later','אחר כך')}</Button></div>}>
  <div className="iw-wiz"><Note tone="peach" icon={DeviceMobile} head={T('Your family’s phones can’t reach this yet','הטלפונים של המשפחה עוד לא מגיעים לכאן')}>{T(<>Your Bayit is at <bdi dir="ltr">{location.origin}</bdi>, which only works on this computer. An invitation from it won’t open on a phone.</>,<>ה־Bayit שלכם נמצא ב־<bdi dir="ltr">{location.origin}</bdi>, וזה עובד רק במחשב הזה. קישור הזמנה ממנו לא ייפתח בטלפון.</>)}</Note>
   <div className="iw-out"><strong><Globe size={20} aria-hidden/>{T('Give Bayit an https address','נותנים ל־Bayit כתובת https')}</strong><ol><li>{T('Your own domain with automatic HTTPS (Caddy), or','דומיין משלכם עם HTTPS אוטומטי (Caddy), או')}</li><li>{T('A tunnel: Cloudflare Tunnel or Tailscale Funnel, with no open ports.','מנהרה: Cloudflare Tunnel או Tailscale Funnel, בלי לפתוח פורטים.')}</li></ol><p className="iw-tip"><Info size={18} aria-hidden/>{T('Pick a final address: passkeys belong to the address they were made on.','בחרו כתובת סופית: מפתחות גישה שייכים לכתובת שבה נוצרו.')}</p></div>
   <p className="iw-tip"><UserCircle size={20} aria-hidden/>{T('Meanwhile you can add children as profiles without an account, in Settings › Family.','בינתיים אפשר להוסיף ילדים כפרופילים בלי חשבון, בהגדרות › משפחה.')}</p></div></ConnectionDialog>;

 const me=a.members.find(m=>m.id===a.user),others=a.members.filter(m=>m.id!==a.user&&!cards.some(c=>c.memberId===m.id));
 const memberState=m=>m.role==='child'?(m.accountLinked?T('Joined, with their own account','הצטרף/ה, עם חשבון משלו'):T('Profile only','פרופיל בלבד')):m.accountLinked?T('Joined','הצטרף/ה'):T('Not joined yet','עוד לא הצטרף/ה');
 const when=iso=>new Date(iso).toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'long'});
 return <ConnectionDialog a={a} title={T('Family members','בני המשפחה')} icon={UsersThree} description={T('Who lives with you?','מי גר איתכם?')} onClose={onClose} busy={!!busy||identity.authorizing}
  footer={<div className="iw-foot"><Button icon={Check} onClick={onClose} disabled={!!busy}>{T('Done','סיום')}</Button><Button secondary onClick={onClose} disabled={!!busy}>{T('Later','אחר כך')}</Button></div>}>
  <div className="iw-wiz"><p className="pk-lead">{T('Write a name and pick a role. Each person gets their own link that works once.','כתבו את השם ובחרו תפקיד. לכל אחד נוצר קישור משלו, שעובד פעם אחת.')}</p>
   <div className="iw-people">
    {me&&<div className="iw-person"><Avatar who={me.id} size={44}/><div><h4>{a.name(me.id)}<Pill ok>{T('That’s you · parent','זה אתם · הורה')}</Pill></h4></div></div>}
    {others.map(m=><div className="iw-person" key={m.id}><Avatar who={m.id} size={44}/><div><h4>{a.name(m.id)}</h4><p>{memberState(m)}</p>
     {m.role==='child'&&!m.accountLinked&&<p className="iw-tip"><Info size={18} aria-hidden/>{T('A link for this child is in Settings › Family.','קישור לילד הזה נמצא בהגדרות › משפחה.')}</p>}</div></div>)}
    {(pending||[]).filter(i=>!i.memberId||!a.members.some(m=>m.id===i.memberId)).map(i=><div className="iw-person" key={i.id}><span className="iw-ini" aria-hidden><LinkIcon size={20}/></span><div><h4>{T('An invitation for '+(i.role==='parent'?'a parent':i.role==='child'?'a child':'an adult'),'הזמנה ל'+(i.role==='parent'?'הורה':i.role==='child'?'ילד/ה':'מבוגר/ת'))}</h4><p>{T('Not opened yet · valid until '+when(i.expiresAt),'עוד לא נפתחה · בתוקף עד '+when(i.expiresAt))}</p></div></div>)}
    {cards.map(card=>{const done=card.state!=='draft',err=error[card.key];return <div className="iw-person" key={card.key}>
     {done?<span className="iw-ini" aria-hidden>{(card.name.trim()[0]||'+').toUpperCase()}</span>:<span className="iw-ini" aria-hidden>+</span>}
     <div><h4>{done?card.name:T('New person','אדם חדש')}</h4>
      {card.state==='link'&&<p>{T('Link ready · hasn’t joined yet','הקישור מוכן · עוד לא הצטרף/ה')}</p>}
      {card.state==='profile'&&<p>{T('Profile only. A parent manages it; it has no account.','פרופיל בלבד. הורה מנהל אותו, ואין לו חשבון.')}</p>}
      {card.state==='draft'&&card.role==='child'&&<p>{T('A child with their own phone gets a link. A young child can be a profile only.','ילד עם טלפון משלו מקבל קישור. ילד צעיר יכול להיות פרופיל בלבד.')}</p>}
      {roles(card,done)}
      {!done&&<label className="iw-field">{T('Name','שם')}<input value={card.name} maxLength={60} onChange={e=>set(card.key,{name:e.target.value})} placeholder={T('e.g. Noa','למשל: נועה')}/></label>}
      {!done&&card.name.trim()&&<div className="iw-link"><button type="button" className="button" disabled={!!busy} aria-busy={busy===card.key||undefined} onClick={()=>createLink(card)}><LinkIcon size={21} aria-hidden/>{T('Create a link','יצירת קישור')}</button>
       {card.role==='child'&&<button type="button" className="button secondary" disabled={!!busy} onClick={()=>profileOnly(card)}><UserCircle size={21} aria-hidden/>{T('Profile only','פרופיל בלבד')}</button>}</div>}
      {card.state==='link'&&<><div className="iw-link"><button type="button" className="button" onClick={()=>send(card)}><ShareNetwork size={21} aria-hidden/>{T('Send','שליחה')}</button><button type="button" className="button secondary" onClick={()=>copy(card)}>{card.sent==='copied'?<Check size={21} aria-hidden/>:<Copy size={21} aria-hidden/>}{card.sent==='copied'?T('Copied','הועתק'):T('Copy','העתקה')}</button></div>
       {card.sent==='copied-message'&&<p className="iw-tip" role="status"><Check size={18} aria-hidden/>{T('This browser has no share menu, so the message and link were copied. Paste them in WhatsApp or a text message.','בדפדפן הזה אין תפריט שיתוף, ולכן ההודעה והקישור הועתקו. הדביקו אותם בוואטסאפ או בהודעה.')}</p>}
       <input className="iw-url" readOnly value={card.url} dir="ltr" aria-label={T('Invitation link for ','קישור הזמנה ל')+card.name} onFocus={e=>e.target.select()}/>
       <p className="iw-meta">{T('Works once, until '+when(card.expiresAt)+'.','עובד פעם אחת, עד '+when(card.expiresAt)+'.')}</p></>}
      {err&&<p role="alert" className="iw-error">{err}</p>}
     </div></div>})}
   </div>
   <button type="button" ref={add} className="iw-add" onClick={()=>setCards(list=>[...list,{key:'new-'+Date.now(),name:'',role:'adult',state:'draft'}])}><UserPlus size={20} aria-hidden/>{T('Another person','עוד אדם')}</button>
   <Note tone="yellow" icon={Info} head={T('Open the link in Safari or Chrome','פותחים את הקישור ב־Safari או ב־Chrome')}>{T('Not inside WhatsApp or Telegram: passkeys may not work there. The message you send already says so.','לא בתוך וואטסאפ או טלגרם: שם לא תמיד אפשר ליצור מפתח גישה. ההודעה ששולחים כבר אומרת את זה.')}</Note>
  </div></ConnectionDialog>;
}
