// Swipe a row toward the start edge (left in English, right in Hebrew) to reveal a Delete button, like mail and
// to-do apps. Works with touch and mouse; a tap elsewhere closes it. The row's own markup stays untouched inside.
import React,{useEffect,useRef,useState} from 'react';
import {Trash} from '@phosphor-icons/react';
const REVEAL=96;
let closeOthers=null;
export function SwipeRow({children,onDelete,label,disabled,className='',direction='start',fullSwipe=false}){
 const [dx,setDx]=useState(0),[open,setOpen]=useState(false),start=useRef(null),wrap=useRef(null),dragged=useRef(false),rtl=()=>document.documentElement.dir==='rtl';
 useEffect(()=>{if(!open)return;const off=e=>{if(!wrap.current?.contains(e.target)){setOpen(false);setDx(0)}};document.addEventListener('pointerdown',off,true);return()=>document.removeEventListener('pointerdown',off,true)},[open]);
 if(disabled||!onDelete)return children;
 const sign=()=>direction==='left'?-1:rtl()?1:-1;
 const down=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;dragged.current=false;start.current={x:e.clientX,y:e.clientY,base:open?sign()*REVEAL:0,locked:null}};
 const move=e=>{const s=start.current;if(!s)return;const mx=e.clientX-s.x,my=e.clientY-s.y;if(s.locked===null){if(Math.abs(mx)<8&&Math.abs(my)<8)return;s.locked=Math.abs(mx)>Math.abs(my)?'x':'y';if(s.locked==='x'){dragged.current=true;closeOthers?.();closeOthers=()=>{setOpen(false);setDx(0)};if(fullSwipe)wrap.current?.setPointerCapture(e.pointerId)}}if(s.locked!=='x')return;e.preventDefault();const next=s.base+mx,limit=sign()*(fullSwipe?wrap.current?.clientWidth||REVEAL+40:REVEAL+40);s.dx=sign()<0?Math.max(limit,Math.min(0,next)):Math.min(limit,Math.max(0,next));setDx(s.dx)};
 const up=()=>{const s=start.current;start.current=null;if(!s||s.locked!=='x')return;const distance=Math.abs(s.dx??dx);if(fullSwipe&&distance>=Math.max(REVEAL*1.5,(wrap.current?.clientWidth||0)*.65)){setOpen(false);setDx(0);onDelete();return}const shouldOpen=distance>REVEAL*.45;setOpen(shouldOpen);setDx(shouldOpen?sign()*REVEAL:0)};
 const cancel=()=>{start.current=null;setOpen(false);setDx(0)};
 return <div ref={wrap} className={'swipe-row'+(open?' open':'')+(className?' '+className:'')} data-swipe-direction={direction} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onClickCapture={e=>{if(e.target.closest('.swipe-delete'))return;if(dragged.current){dragged.current=false;e.stopPropagation();e.preventDefault();return}if(open){e.stopPropagation();e.preventDefault();setOpen(false);setDx(0)}}}>
  <button type="button" className="swipe-delete" tabIndex={open?0:-1} aria-hidden={!open} onClick={()=>{setOpen(false);setDx(0);onDelete()}}><Trash size={22}/><span>{label}</span></button>
  <div className="swipe-content" style={{transform:dx?`translateX(${dx}px)`:undefined,transition:start.current?'none':undefined}}>{children}</div>
 </div>;
}
