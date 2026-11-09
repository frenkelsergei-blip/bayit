import React,{useEffect,useRef,useState} from 'react';
import {CaretDown} from '@phosphor-icons/react';

// A small button that opens a short list of actions (Expenses › Import, Insurance › Add).
// items: [{key, icon, label, onClick}]. Closes on choice, outside click and Escape.
export function HouseholdMenu({label,icon:IconComponent,items,primary=false,className='',ariaLabel}){
 const [open,setOpen]=useState(false),root=useRef(null),button=useRef(null);
 useEffect(()=>{if(!open)return;
  const away=e=>{if(root.current&&!root.current.contains(e.target))setOpen(false)};
  const key=e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus()}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',key);
  root.current?.querySelector('[role=menuitem]')?.focus();
  return ()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',key)}},[open]);
 return <div className={'household-menu '+className} ref={root}>
  <button type="button" ref={button} className={'button household-menu-button'+(primary?'':' secondary')} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={()=>setOpen(v=>!v)}>{IconComponent&&<IconComponent size={20}/>}<span className="household-menu-label">{label}</span><CaretDown size={16} className="household-menu-caret"/></button>
  {open&&<div className="household-menu-list" role="menu">{items.map(({key,icon:I,label:text,onClick})=><button type="button" role="menuitem" key={key} onClick={()=>{setOpen(false);onClick()}}>{I&&<I size={20}/>}<span>{text}</span></button>)}</div>}
 </div>;
}
