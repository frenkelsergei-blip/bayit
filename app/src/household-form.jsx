import React,{useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from '@phosphor-icons/react';
import './document-people.css';
import './contact-editor.css';
import './household-window.css';
// The one Household window (full audit 06): header (title + X), FormSection cards in the body, footer with
// Cancel then Save at the reading end and an optional destructive action alone at the reading start.
// `wide` gives two columns of sections on desktop.
export function HouseholdForm({a,title,onClose,onSubmit,saving,error,actions,danger,wide=false,className='',children}){
 const close=useRef(null),uid=useId();useEffect(()=>{close.current?.focus({preventScroll:true})},[]);
 return createPortal(<div className="document-editor-backdrop contact-editor-backdrop household-window-backdrop"><section className={'document-editor contact-editor household-window'+(wide?' wide':'')+(className?' '+className:'')} role="dialog" aria-modal="true" aria-labelledby={uid} dir={a.lang==='he'?'rtl':'ltr'} onKeyDown={e=>{if(e.key==='Escape'&&e.target.closest('[role="dialog"]')===e.currentTarget){e.preventDefault();if(!saving)onClose()}}}><form onSubmit={onSubmit} aria-busy={saving} noValidate={false}><header className="document-editor-header"><h2 id={uid}>{title}</h2><button ref={close} type="button" className="icon-button" disabled={saving} aria-label={a.T('Close editor','סגירת העריכה')} onClick={onClose}><X size={24}/></button></header><div className="document-editor-body">{children}</div><footer className="document-editor-footer">{error&&<p role="alert" className="save-error">{error}</p>}<div className="actions">{danger&&<span className="household-window-danger">{danger}</span>}<button type="button" className="button secondary" disabled={saving} onClick={onClose}>{a.T('Cancel','ביטול')}</button>{actions}</div></footer></form></section></div>,document.body);
}
