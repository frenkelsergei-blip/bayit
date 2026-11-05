// Branded date picker that replaces <input type="date">. Drop-in: same value (YYYY-MM-DD) and an onChange that
// receives {target:{value}}, so existing handlers (e=>setX(e.target.value)) keep working. Desktop/tablet open a
// popover under the field; phones (≤700px) open a bottom sheet. Keyboard: arrows move days (mirrored in RTL),
// PageUp/PageDown change month, Enter picks, Escape closes. A visually hidden native input keeps `required`
// form validation working.
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDots,CaretDown,CaretLeft,CaretRight,X} from '@phosphor-icons/react';

const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const parse=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Date(v+'T12:00:00Z'):null;
const addDays=(v,n)=>{const d=parse(v);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const addMonths=(v,n)=>{const d=parse(v),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d)};
const todayIso=()=>{const n=new Date();return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())};
const lang=()=>document.documentElement.lang==='he'||document.documentElement.dir==='rtl'?'he':'en';
const T=(en,he)=>lang()==='he'?he:en;

export function DateField({value='',onChange,required,disabled,min,max,variant='field',placeholder,marks,className='',id,...rest}){
 const [open,setOpen]=useState(false),button=useRef(null),he=lang()==='he',locale=he?'he-IL':'en-US';
 const label=rest['aria-label'];
 const text=parse(value)?parse(value).toLocaleDateString(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:variant==='toolbar'?undefined:'numeric'}):(placeholder||T('Choose a date','בחירת תאריך'));
 const pick=v=>{onChange?.({target:{value:v}});setOpen(false);requestAnimationFrame(()=>button.current?.focus())};
 return <span className={'date-field date-field-'+variant+(open?' is-open':'')+(value?'':' is-empty')+(className?' '+className:'')}>
  <button ref={button} id={id} type="button" className="date-field-button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={(label?label+': ':'')+(value?text:T('no date chosen','לא נבחר תאריך'))} onClick={()=>setOpen(!open)}>
   <CalendarDots size={20} className="date-field-icon"/><span className="date-field-text">{text}</span><CaretDown size={16} className="date-field-caret"/>
  </button>
  {required&&<input className="date-field-native" tabIndex={-1} aria-hidden="true" type="date" required value={value} min={min} max={max} onChange={()=>{}} onFocus={()=>button.current?.focus()}/>}
  {open&&<DatePopover anchor={button} value={value} min={min} max={max} marks={marks} required={required} onPick={pick} onClose={()=>{setOpen(false);button.current?.focus()}} title={label}/>}
 </span>;
}

function DatePopover({anchor,value,min,max,marks,required,onPick,onClose,title}){
 const today=todayIso(),[focus,setFocus]=useState(parse(value)?value:today),panel=useRef(null),[pos,setPos]=useState(null),he=lang()==='he',locale=he?'he-IL':'en-US',phone=window.matchMedia('(max-width:700px)').matches;
 const month=focus.slice(0,7),first=parse(month+'-01'),start=addDays(month+'-01',-first.getUTCDay());
 const days=useMemo(()=>Array.from({length:42},(_,i)=>addDays(start,i)),[start]);
 const weeks=days.slice(35).every(d=>!d.startsWith(month))?days.slice(0,35):days;
 const names=useMemo(()=>Array.from({length:7},(_,i)=>parse(addDays('2026-11-01',i)).toLocaleDateString(locale,{timeZone:'UTC',weekday:'narrow'})),[locale]);
 const out=d=>(min&&d<min)||(max&&d>max);
 useLayoutEffect(()=>{if(phone)return;const place=()=>{const r=anchor.current?.getBoundingClientRect(),w=320,h=panel.current?.offsetHeight||360;if(!r)return;const below=window.innerHeight-r.bottom>=h+12||r.top<h+12,left=Math.min(Math.max(8,he?r.right-w:r.left),window.innerWidth-w-8);setPos({left,top:below?r.bottom+8:r.top-h-8})};place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}},[]);
 useEffect(()=>{if(!phone&&!pos)return;panel.current?.querySelector('[data-focus=true]')?.focus({preventScroll:true})},[focus,pos]);
 useEffect(()=>{const down=e=>{if(panel.current&&!panel.current.contains(e.target)&&!anchor.current?.contains(e.target))onClose()};document.addEventListener('pointerdown',down,true);return()=>document.removeEventListener('pointerdown',down,true)},[]);
 const key=e=>{const step={ArrowLeft:he?1:-1,ArrowRight:he?-1:1,ArrowUp:-7,ArrowDown:7}[e.key];if(step){e.preventDefault();setFocus(addDays(focus,step))}else if(e.key==='PageUp'){e.preventDefault();setFocus(addMonths(focus,-1))}else if(e.key==='PageDown'){e.preventDefault();setFocus(addMonths(focus,1))}else if(e.key==='Escape'){e.preventDefault();onClose()}else if(e.key==='Tab'&&!panel.current.contains(document.activeElement))onClose()};
 const body=<div ref={panel} className={'date-pop'+(phone?' date-pop-sheet':'')} role="dialog" aria-modal={phone||undefined} aria-label={title||T('Choose a date','בחירת תאריך')} onKeyDown={key} style={!phone&&pos?{left:pos.left,top:pos.top}:!phone?{visibility:'hidden'}:undefined}>
  {phone&&<div className="date-pop-grab" aria-hidden="true"/>}
  <div className="date-pop-head">
   <button type="button" className="date-pop-nav" aria-label={T('Previous month','החודש הקודם')} onClick={()=>setFocus(addMonths(focus,-1))}>{he?<CaretRight size={20}/>:<CaretLeft size={20}/>}</button>
   <strong aria-live="polite">{first.toLocaleDateString(locale,{timeZone:'UTC',month:'long',year:'numeric'})}</strong>
   <button type="button" className="date-pop-nav" aria-label={T('Next month','החודש הבא')} onClick={()=>setFocus(addMonths(focus,1))}>{he?<CaretLeft size={20}/>:<CaretRight size={20}/>}</button>
   {phone&&<button type="button" className="date-pop-close" aria-label={T('Close','סגירה')} onClick={onClose}><X size={20}/></button>}
  </div>
  <div className="date-pop-grid" role="grid">
   {names.map((n,i)=><span key={'n'+i} className="date-pop-dow" aria-hidden="true">{n}</span>)}
   {weeks.map(d=>{const inMonth=d.startsWith(month),disabled=out(d);return <button type="button" key={d} role="gridcell" tabIndex={d===focus?0:-1} data-focus={d===focus} disabled={disabled} aria-selected={d===value} aria-label={parse(d).toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'})} className={'date-pop-day'+(inMonth?'':' other')+(d===value?' selected':'')+(d===today?' today':'')+(marks?.has?.(d)?' marked':'')} onClick={()=>onPick(d)} onFocus={()=>d!==focus&&setFocus(d)}>{parse(d).getUTCDate()}</button>})}
  </div>
  <div className="date-pop-foot">
   <button type="button" className="date-pop-today" disabled={out(today)} onClick={()=>onPick(today)}>{T('Today','היום')}</button>
   {!required&&value&&<button type="button" className="date-pop-clear" onClick={()=>onPick('')}>{T('Clear','ניקוי')}</button>}
  </div>
 </div>;
 return createPortal(phone?<div className="date-pop-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}>{body}</div>:body,document.body);
}
