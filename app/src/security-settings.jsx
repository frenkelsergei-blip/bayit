import React,{useState,useEffect} from 'react';
import {ShieldCheck} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {googleSignIn} from './cloud-client';
export function SecuritySettings({a,Button,sessions=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{if(!a.cloud)return;const r=await fetch('/api/security/sessions',{headers:cloudHeaders()});if(!r.ok)throw Error(a.T('Session status is unavailable.','מצב הכניסה אינו זמין.'));setData(await r.json())};
 useEffect(()=>{const refresh=()=>load().catch(e=>setError(e.message));refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[a.cloud]);
 if(!a.cloud)return null;
 const revoke=async id=>{setBusy(true);setError('');try{const r=await fetch('/api/security/sessions',{method:'DELETE',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify({id})});if(!r.ok)throw Error((await r.json()).error);await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <section className="settings-category security-settings"><header><span className="settings-category-icon"><ShieldCheck size={28}/></span><h2>{a.T('Account security','אבטחת החשבון')}</h2></header><div className="settings-category-body form-stack"><p>{a.T('Invitations and account connections require a recent confirmation with Google.','הזמנות וחיבורי חשבונות דורשים אישור זהות עדכני עם Google.')}</p>{data&&!data.recent&&<Button disabled={busy} secondary onClick={()=>{setBusy(true);googleSignIn().catch(e=>{setError(e.message);setBusy(false)})}}>{a.T('Confirm identity with Google','אישור זהות עם Google')}</Button>}{sessions&&data?.sessions?.map(s=><div className="actions" key={s.id}><span>{s.current?a.T('This sign-in','הכניסה הזו'):a.T('Another sign-in','כניסה נוספת')}{s.authenticated_at?' · '+new Date(s.authenticated_at).toLocaleString(a.lang==='he'?'he-IL':'en-GB'):''}</span>{!s.current&&<Button quiet disabled={busy||!data.recent} onClick={()=>revoke(s.id)}>{a.T('Sign out','ניתוק')}</Button>}</div>)}{error&&<p role="alert" className="ai-error">{error}</p>}</div></section>;
}
