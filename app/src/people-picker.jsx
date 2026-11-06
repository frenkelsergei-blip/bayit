// Phone person filter: one compact button (stack of faces, or the chosen person) that opens a bottom sheet
// with the full name chips. Desktop/tablet keep the chip row; CSS shows one or the other.
import {PersonChip} from './person-chip';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,Users,X,Check} from '@phosphor-icons/react';
import {AvatarStack} from './avatar-stack';

export function PeoplePicker({value,onChange,people,allowAll=true,allLabel,title,T,Avatar,name,member}){
 const [open,setOpen]=useState(false),button=useRef(null),sheet=useRef(null);
 const chosen=value&&value!=='all'?value:null;
 useEffect(()=>{if(!open)return;const key=e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus()}};document.addEventListener('keydown',key);sheet.current?.querySelector('[aria-pressed=true]')?.focus();return()=>document.removeEventListener('keydown',key)},[open]);
 const pick=v=>{onChange(v);setOpen(false);requestAnimationFrame(()=>button.current?.focus())};
 const color=id=>member?.(id)?.color||'lilac';
 return <div className="people-picker">
  <button ref={button} type="button" className={'people-picker-button'+(chosen?' chosen':'')} aria-haspopup="dialog" aria-expanded={open} aria-label={(title||T('People','אנשים'))+': '+(chosen?name(chosen):allLabel)} onClick={()=>setOpen(true)}>
   {chosen?<><PersonChip who={chosen} name={name(chosen)} Avatar={Avatar} tone={color(chosen)} selected/></>:<><AvatarStack ids={people} Avatar={Avatar} name={name} size={28} max={4}/><span className="people-picker-name">{allLabel}</span></>}
   <CaretDown size={16} className="people-picker-caret"/>
  </button>
  {open&&createPortal(<div className="people-picker-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div ref={sheet} className="people-picker-sheet" role="dialog" aria-modal="true" aria-label={title||T('People','אנשים')}>
   <div className="date-pop-grab" aria-hidden="true"/>
   <header><h2>{title||T('People','אנשים')}</h2><button type="button" className="icon-button" aria-label={T('Close','סגירה')} onClick={()=>setOpen(false)}><X size={20}/></button></header>
   <div className="people-picker-options">
    {allowAll&&<button type="button" aria-pressed={!chosen} className={'people-picker-option everyone'+(!chosen?' on':'')} onClick={()=>pick('all')}><span className="people-picker-option-face"><Users size={24}/></span><span>{allLabel}</span>{!chosen&&<Check size={18} weight="bold"/>}</button>}
    {people.map(id=><PersonChip key={id} who={id} name={name(id)} Avatar={Avatar} tone={color(id)} selected={chosen===id} onClick={()=>pick(allowAll&&chosen===id?'all':id)}/>)}
   </div>
  </div></div>,document.body)}
 </div>;
}
