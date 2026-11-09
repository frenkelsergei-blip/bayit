import React,{useEffect,useRef,useId} from 'react';
import {createPortal} from 'react-dom';
import {X,LockSimple,UsersThree} from '@phosphor-icons/react';
import {PersonChip} from './person-chip';

export function InsuranceModal({a,title,onClose,busy=false,children,wide=false}){
 const ref=useRef(null),close=useRef(null),titleId=useId();
 // DialogManager restores the actual pointer/keyboard trigger, including Safari buttons
 // that do not take focus on tap. A second restoration here can steal it or scroll the page.
 useEffect(()=>{close.current?.focus({preventScroll:true})},[]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape'){e.preventDefault();if(!busy)onClose()}if(e.key==='Tab'){const fields=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);if(!fields.length)return;const first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[busy,onClose]);
 return createPortal(<div className="modal-backdrop insurance-backdrop" onPointerDown={e=>e.target===e.currentTarget&&!busy&&onClose()}><section ref={ref} dir={a.lang==='he'?'rtl':'ltr'} className={'insurance-dialog'+(wide?' insurance-dialog-wide':'')} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="insurance-dialog-header"><h2 id={titleId}>{title}</h2><button ref={close} type="button" disabled={busy} className="icon-button" onClick={onClose} aria-label={a.T('Close','סגירה')}><X size={25}/></button></div>{children}</section></div>,document.body);
}
export function InsurancePeople({a,Avatar,value=[],onChange,adultsOnly=false}){
 return <div className="insurance-people" role="group" aria-label={adultsOnly?a.T('Adults with access','מבוגרים עם גישה'):a.T('Insured people','מבוטחים')}>{a.members.filter(m=>!adultsOnly||m.role!=='child'&&m.id!==a.user).map(m=><PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={value.includes(m.id)} onClick={()=>onChange(value.includes(m.id)?value.filter(id=>id!==m.id):[...value,m.id])}/>)}</div>;
}
export function InsuranceSharing({a,Avatar,visibility,allowedIds,onChange}){
 const T=a.T,others=a.members.filter(m=>m.role!=='child'&&m.id!==a.user);
 return <fieldset className="insurance-sharing"><legend>{T('Who can see this insurance?','מי יכול לראות את הביטוח?')}</legend><div className="insurance-sharing-choice"><button type="button" aria-pressed={visibility==='private'} onClick={()=>onChange('private',[])}><LockSimple size={20}/>{T('Only me','רק אני')}</button><button type="button" disabled={!others.length} aria-pressed={visibility==='selected'} onClick={()=>onChange('selected',allowedIds)}><UsersThree size={20}/>{T('Selected adults','מבוגרים שנבחרו')}</button></div>{visibility==='selected'&&<InsurancePeople a={a} Avatar={Avatar} value={allowedIds} adultsOnly onChange={ids=>onChange('selected',ids)}/>}<small className="muted">{T('The insured person and the people with access are separate choices. Children do not have access to this area.','המבוטח ומי שרשאי לראות את המידע הם בחירות נפרדות. אזור זה אינו נגיש לחשבונות ילדים.')}</small></fieldset>;
}
