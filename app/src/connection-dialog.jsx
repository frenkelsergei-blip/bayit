import React,{createContext,useCallback,useContext,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,ShieldCheck,CheckCircle,WarningCircle,GoogleLogo} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {googleSignIn} from './cloud-client';
import './connection-dialog.css';

export const connectionNeedsIdentity=e=>e?.code==='REAUTH_REQUIRED'||e?.status===401||(e?.status===403&&/^Confirm your identity with Google/.test(e.message||''));
const Identity=createContext({recent:null,checking:false,guard:async()=>true,request:()=>{},rejected:()=>{}});
export const useConnectionIdentity=()=>useContext(Identity);

// Header: icon, title, one plain line and the status; the body scrolls; an optional footer holds a short note and Close
// (concept A, 2026-11-10). Phones open it full screen (connections-a.css).
export function ConnectionDialog({a,title,icon:Icon,status,description,onClose,busy=false,children,compact=false,footer=null}){
 const id=useId(),close=useRef(null);
 useEffect(()=>{close.current?.focus({preventScroll:true})},[]);
 return createPortal(<div className="connection-dialog-backdrop" onPointerDown={e=>e.target===e.currentTarget&&!busy&&onClose()}>
  <section className={'connection-dialog'+(compact?' connection-dialog-compact':'')} role="dialog" aria-modal="true" aria-labelledby={id} dir={a.lang==='he'?'rtl':'ltr'} aria-busy={busy||undefined}>
   <header className="connection-dialog-header"><div className="connection-dialog-heading">{Icon&&<span className="connection-dialog-icon"><Icon size={27}/></span>}<div><h2 id={id}>{title}</h2>{description&&<p className="connection-dialog-description">{description}</p>}{status}</div></div><button ref={close} type="button" className="icon-button connection-dialog-close" aria-label={a.T('Close','סגירה')} onClick={onClose} disabled={busy}><X size={25}/></button></header>
   <div className="connection-dialog-body">{children}</div>
   {footer&&<footer className="connection-dialog-footer">{footer}</footer>}
  </section>
 </div>,document.body);
}

// This context contains identity status only. Credentials never enter React state or the return URL.
export function ConnectionIdentityProvider({a,children}){
 const [identity,setIdentity]=useState({recent:null,checking:!!a.cloud}),[confirmation,setConfirmation]=useState(null),[busy,setBusy]=useState(false),[authorizing,setAuthorizing]=useState(false),[error,setError]=useState('');
 const current=useRef(identity),generation=useRef(0),guardLock=useRef(false);
 const refresh=useCallback(async()=>{
  if(!a.cloud)return true;const epoch=generation.current;
  try{const r=await fetch('/api/security/sessions',{headers:cloudHeaders(),cache:'no-store'});if(!r.ok)throw Error();const data=await r.json(),session=data.sessions?.find(s=>s.current),next={recent:!!data.recent,checking:false,expiresAt:session?.authenticated_at&&data.recentWindowMs?session.authenticated_at+data.recentWindowMs:0};if(epoch===generation.current){current.current=next;setIdentity(next)}return !!data.recent}
  catch{if(epoch===generation.current){const next={recent:null,checking:false,failed:true};current.current=next;setIdentity(next)}return null}
 },[!!a.cloud,a.user]);
 useEffect(()=>{generation.current++;refresh();const focus=()=>refresh(),timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);window.addEventListener('focus',focus);return()=>{generation.current++;clearInterval(timer);window.removeEventListener('focus',focus)}},[refresh]);
 useEffect(()=>{if(!identity.recent||!identity.expiresAt)return;const timer=setTimeout(()=>{const next={...current.current,recent:false};current.current=next;setIdentity(next)},Math.max(0,identity.expiresAt-Date.now()));return()=>clearTimeout(timer)},[identity.recent,identity.expiresAt]);
 const request=id=>{setError('');setConfirmation(id||'')};
 const guard=async id=>{if(!a.cloud)return true;if(guardLock.current)return false;guardLock.current=true;setAuthorizing(true);try{const recent=await refresh();if(recent===true)return true;request(id);if(recent===null)setError(a.T('We could not check your sign-in. Confirm with Google, or cancel and try again.','לא הצלחנו לבדוק את הכניסה. אפשר לאשר עם Google, או לבטל ולנסות שוב.'));return false}finally{guardLock.current=false;setAuthorizing(false)}};
 const rejected=(e,id)=>{if(!connectionNeedsIdentity(e))return false;const next={recent:false,checking:false};current.current=next;setIdentity(next);request(id);return true};
 const dismiss=()=>{setConfirmation(null);requestAnimationFrame(()=>{const dialog=[...document.querySelectorAll('.connection-dialog:not(.connection-dialog-compact)')].at(-1);if(dialog&&!dialog.contains(document.activeElement))(dialog.querySelector('.connection-security-notice button:not(:disabled)')||dialog.querySelector('.connection-dialog-close'))?.focus({preventScroll:true})})};
 const confirm=async()=>{if(busy)return;setBusy(true);setError('');document.querySelectorAll('.connection-dialog input[type="password"]').forEach(input=>{input.value=''});try{await googleSignIn({returnHash:'#settings/connections'+(confirmation?'?open='+encodeURIComponent(confirmation):'')})}catch{setError(a.T('Google sign-in could not open. Try again; no connection was changed.','לא הצלחנו לפתוח את הכניסה ל־Google. אפשר לנסות שוב; לא שונה אף חיבור.'));setBusy(false)}};
 return <Identity.Provider value={{...identity,authorizing,refresh,guard,request,rejected}}>{children}{confirmation!==null&&<ConnectionDialog a={a} title={a.T('Confirm with Google to continue','אישור עם Google להמשך')} icon={ShieldCheck} compact busy={busy} onClose={dismiss}><div className="connection-confirmation"><p>{a.T('Before changing an account or connection, confirm that it’s you. You’ll return here afterwards.','לפני שינוי חשבון או חיבור, צריך לאשר שאלה אתם. לאחר האישור תחזרו לכאן.')}</p><p className="muted">{a.T('No changes have been saved. Paste any keys after returning from Google.','עדיין לא נשמר שום שינוי. מפתחות מדביקים לאחר החזרה מ־Google.')}</p>{error&&<p role="alert" className="connection-error">{error}</p>}<div className="connection-dialog-actions"><button type="button" className="button" disabled={busy} onClick={confirm}><GoogleLogo size={22}/>{busy?a.T('Opening Google…','פותחים את Google…'):a.T('Confirm with Google','אישור עם Google')}</button><button type="button" className="button secondary" disabled={busy} onClick={dismiss}>{a.T('Not now','לא עכשיו')}</button></div></div></ConnectionDialog>}</Identity.Provider>;
}

export function ConnectionSecurityNotice({a,connection='',summary=false}){
 const identity=useConnectionIdentity();if(!a.cloud)return null;
 if(identity.checking)return <p className="connection-security-check" role="status">{a.T('Checking Google confirmation…','בודקים אישור Google…')}</p>;
 if(identity.recent)return summary?<div className="connection-security-ready" role="status"><CheckCircle size={22} weight="fill"/><span>{a.T('Google confirmation is current. You can manage your connections.','אישור Google בתוקף. אפשר לנהל את החיבורים.')}</span></div>:null;
 return <section className="connection-security-notice" aria-label={a.T('Google confirmation needed','נדרש אישור Google')}><ShieldCheck size={29}/><div><strong>{a.T('Confirm before making changes','אישור לפני ביצוע שינויים')}</strong><p>{a.T('You can view your connections. To add or change one, confirm with Google first.','אפשר לצפות בחיבורים. כדי להוסיף או לשנות חיבור, מאשרים קודם עם Google.')}</p></div><button type="button" className="button" onClick={()=>identity.request(connection)}><GoogleLogo size={21}/>{a.T('Confirm with Google','אישור עם Google')}</button>{identity.failed&&<button type="button" className="button secondary" onClick={identity.refresh}>{a.T('Retry check','בדיקה חוזרת')}</button>}</section>;
}
