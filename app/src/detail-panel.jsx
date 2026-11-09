import React,{useState,useEffect,useRef,useId} from 'react';
import {createPortal} from 'react-dom';
import {X} from '@phosphor-icons/react';
export function useMedia(media){const [matches,setMatches]=useState(()=>window.matchMedia(media).matches);useEffect(()=>{const query=window.matchMedia(media),change=()=>setMatches(query.matches);change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change)},[media]);return matches}
// Phones, including phones turned sideways (short landscape), use sheets and the phone menu.
export const usePhone=()=>useMedia('(max-width:700px), (max-height:520px) and (orientation:landscape)');
// Phones and tablets show details in a sheet over the page; wide screens keep the side panel.
export const useSheet=()=>useMedia('(max-width:1100px)');
export function DetailPanel({children,open,onClose,title='Details',className='',sheetBreakpoint=1100}){
 const phone=useMedia('(max-width:'+sheetBreakpoint+'px)'),panel=useRef(null),close=useRef(null),id=useId();
 useEffect(()=>{if(!phone||!open)return;const previous=document.activeElement;close.current?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'){const elements=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus?.()}},[phone,open]);
 if(!phone)return <aside aria-label={title} className={'detail-panel '+className}>{children}</aside>;if(!open)return null;
 return createPortal(<div className="detail-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={panel} className={'detail-sheet '+className} role="dialog" aria-modal="true" aria-labelledby={id}><header role="none" className="detail-sheet-header"><strong id={id}>{title}</strong><button ref={close} type="button" className="icon-button" aria-label={document.documentElement.lang==='he'?'סגירת הפרטים':'Close details'} onClick={onClose}><X size={27}/></button></header><div className="detail-sheet-body">{children}</div></section></div>,document.body)
}
