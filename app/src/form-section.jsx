// One section anatomy for every form, editor, sheet and settings group (user decision 2026-11-08, AGENTS.md;
// concept/explorations/forms-20261108/forms-desktop-dialog.png): a rounded card whose header band carries the
// section tone, a real Phosphor icon centred in a soft circle at the reading start, then plain field titles in
// the body. A section can collapse to a one-line summary. A required field inside a collapsed section opens it
// again when the form is submitted, so validation never points at a hidden control.
import React,{useId,useState} from 'react';
import {CaretDown} from '@phosphor-icons/react';
import './form-section.css';

export function FormSection({icon:Icon,title,note,tone='blue',summary,collapsible=false,defaultOpen=true,className='',children,T=(en)=>en}){
 const id=useId(),[open,setOpen]=useState(defaultOpen),shut=collapsible&&!open;
 const reopen=e=>{if(!shut)return;setOpen(true);const field=e.target;setTimeout(()=>field.reportValidity?.(),0)};
 return <section className={'form-section tone-'+tone+(shut?' collapsed':'')+(className?' '+className:'')} aria-labelledby={id+'-title'} onInvalidCapture={reopen}>
  <header className="form-section-head">
   {Icon&&<span className="form-section-icon" aria-hidden="true"><Icon size={24} weight="regular"/></span>}
   <span className="form-section-heading"><h3 id={id+'-title'}>{title}{note&&<small className="form-section-note">{note}</small>}</h3>{shut&&summary&&<span className="form-section-summary" dir="auto">{summary}</span>}</span>
   {collapsible&&<button type="button" className="form-section-toggle" aria-expanded={open} aria-controls={id+'-body'} aria-label={(open?T('Collapse ','כיווץ '):T('Expand ','הרחבה '))+(typeof title==='string'?title:'')} onClick={()=>setOpen(!open)}><CaretDown size={20} weight="bold"/></button>}
  </header>
  <div className="form-section-body" id={id+'-body'} hidden={shut}>{children}</div>
 </section>;
}
