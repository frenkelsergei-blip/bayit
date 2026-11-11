import React,{useState,useEffect} from 'react';
import {ShieldCheck} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {googleSignIn} from './cloud-client';
import {useConnectionIdentity} from './connection-dialog';
import {FormSection} from './form-section';
import {PasskeySecurity,passkeysAvailable} from './passkey-account';
// With passkeys offered, Account security is concept A (passkey-account.jsx); a Google-only installation keeps this.
export function SecuritySettings(props){return passkeysAvailable(props.a)?<PasskeySecurity a={props.a} sessions={props.sessions!==false}/>:<GoogleSecuritySettings {...props}/>}
function GoogleSecuritySettings({a,Button,sessions=false,connection=''}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const identity=useConnectionIdentity();
 const load=async()=>{if(!a.cloud)return;const r=await fetch('/api/security/sessions',{headers:cloudHeaders()});if(!r.ok)throw Error(a.T('Session status is unavailable.','מצב הכניסה אינו זמין.'));setData(await r.json())};
 useEffect(()=>{const refresh=()=>load().catch(e=>setError(e.message));refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[a.cloud]);
 if(!a.cloud)return null;
 const revoke=async id=>{if(connection&&!await identity.guard(connection))return;setBusy(true);setError('');try{const r=await fetch('/api/security/sessions',{method:'DELETE',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify({id})});if(!r.ok){const result=await r.json();throw Object.assign(Error(result.error),{code:result.code,status:r.status})}await load()}catch(e){if(connection)identity.rejected(e,connection);setError(e.message)}finally{setBusy(false)}};
 return <FormSection T={a.T} icon={ShieldCheck} tone="peach" className="security-settings settings-wide" title={a.T('Account security','אבטחת החשבון')}><p className="settings-section-intro">{a.T('Invitations and account connections require a recent confirmation with Google.','הזמנות וחיבורי חשבונות דורשים אישור זהות עדכני עם Google.')}</p>{data&&!data.recent&&<Button disabled={busy} secondary onClick={()=>{if(connection){identity.request(connection);return}setBusy(true);googleSignIn().catch(e=>{setError(e.message);setBusy(false)})}}>{a.T('Confirm identity with Google','אישור זהות עם Google')}</Button>}{sessions&&data?.sessions?.map(s=><div className="actions" key={s.id}><span>{s.current?a.T('This sign-in','הכניסה הזו'):a.T('Another sign-in','כניסה נוספת')}{s.authenticated_at?' · '+new Date(s.authenticated_at).toLocaleString(a.lang==='he'?'he-IL':'en-GB'):''}</span>{!s.current&&<Button quiet disabled={busy||!data.recent} onClick={()=>revoke(s.id)}>{a.T('Sign out','ניתוק')}</Button>}</div>)}{error&&<p role="alert" className="ai-error">{error}</p>}</FormSection>;
}
