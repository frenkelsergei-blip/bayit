import React,{useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X,FloppyDisk} from '@phosphor-icons/react';
// The note editor window for the Home journal and My Space (full audit 07, 2026-11-08). It uses the shared window
// anatomy (.tasks-sheet: title + X on top, FormSection cards in the scrolling body, Cancel then Save at the reading
// end of a fixed footer, a destructive Delete alone at the reading start), so window-fit.css makes it full screen on
// phones in either menu position and a centred window above the menu on wider screens. `wide` lays the sections out
// in two columns on desktop. The X gets focus first, so phones do not pop the keyboard on open.
export function NoteWindow({a,title,onClose,onSave,saving=false,saveDisabled=false,saveLabel,error,danger,wide=false,className='',children}){
 const close=useRef(null),uid=useId();
 useEffect(()=>{close.current?.focus({preventScroll:true})},[]);
 const submit=e=>{e.preventDefault();if(!saving&&!saveDisabled)onSave()};
 return createPortal(<div className="modal-backdrop tasks-sheet-backdrop note-window-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose()}}>
  <form className={'tasks-sheet note-window'+(wide?' wide':'')+(className?' '+className:'')} role="dialog" aria-modal="true" aria-labelledby={uid} aria-busy={saving} dir={a.lang==='he'?'rtl':'ltr'} onSubmit={submit} onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&e.target.closest('[role="dialog"]')===e.currentTarget){e.preventDefault();if(!saving)onClose()}}}>
   <header><h2 id={uid}>{title}</h2><button ref={close} type="button" className="icon-button" disabled={saving} aria-label={a.T('Close','סגירה')} onClick={onClose}><X size={24}/></button></header>
   <div className="tasks-sheet-body">{children}{error&&<p role="alert" className="save-error">{error}</p>}</div>
   <div className="tasks-sheet-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>{a.T('Cancel','ביטול')}</button><button type="submit" className="button" disabled={saving||saveDisabled}><FloppyDisk size={23}/> {saveLabel||a.T('Save note','שמירת ההערה')}</button>{danger}</div>
  </form>
 </div>,document.body);
}
