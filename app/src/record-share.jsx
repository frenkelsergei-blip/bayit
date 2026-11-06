import React,{useState} from 'react';
import {ShareNetwork,Copy,Check,LockSimple} from '@phosphor-icons/react';
import {recordLink} from '../../shared/record-links.mjs';
import './locations.css';

export function RecordShare({a,record,kind,date}){
 const [manual,setManual]=useState(false),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=a.cloud?recordLink(location.href,{householdId:a.cloud.householdId,kind,id:record.id,date:date||record.date}):'';
 const copy=async()=>{setError('');try{await navigator.clipboard.writeText(url);setCopied(true);setManual(false)}catch{setManual(true);setError(a.T('Select and copy the link below.','אפשר לסמן ולהעתיק את הקישור למטה.'))}};
 const share=async()=>{if(busy)return;setBusy(true);setError('');try{if(navigator.share)await navigator.share({url});else await copy()}catch(e){if(e.name!=='AbortError')await copy()}finally{setBusy(false)}};
 return <section className="record-share"><button type="button" className="button secondary" disabled={!a.cloud||busy} onClick={share}><ShareNetwork size={21}/>{a.T(kind==='event'?'Share event':'Share task',kind==='event'?'שיתוף האירוע':'שיתוף המשימה')}</button><small><LockSimple size={15}/>{a.cloud?a.T('Opens this original record for people who already have permission. The link does not change sharing.','פותח את הפריט המקורי למי שכבר מורשה לראות אותו. הקישור אינו משנה את השיתוף.'):a.T('Sharing between people is available in your signed-in household.','שיתוף בין אנשים זמין בבית המחובר שלכם.')}</small>{a.cloud&&navigator.share&&<button type="button" className="record-copy-link" onClick={copy}><Copy size={16}/>{a.T('Copy link','העתקת קישור')}</button>}{copied&&<span className="record-link-copied" role="status"><Check size={16}/>{a.T('Link copied','הקישור הועתק')}</span>}{manual&&<label>{a.T('Original record link','קישור לפריט המקורי')}<input readOnly dir="ltr" value={url} onFocus={e=>e.target.select()}/></label>}{error&&<small role="status">{error}</small>}</section>;
}
