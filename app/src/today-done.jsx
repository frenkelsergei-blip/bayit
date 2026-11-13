import React,{useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle,CaretDown} from '@phosphor-icons/react';
import {DONE_STAYS_MS,DONE_FADES_MS,uniqueTasks} from './today-done.mjs';
import './today-done.css';

// Today: a ticked task stays a moment (struck through, with the celebration and its Undo), fades, then leaves the list
// (owner, 2026-11-13). Returns the ids still shown, with .leaving(id) true while a row fades out.
export function useJustDone(){
 const [phase,setPhase]=useState({}),timers=useRef([]);
 useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
 const mark=useCallback(id=>{
  setPhase(p=>({...p,[id]:'shown'}));
  timers.current.push(setTimeout(()=>setPhase(p=>p[id]?{...p,[id]:'leaving'}:p),DONE_FADES_MS));
  timers.current.push(setTimeout(()=>setPhase(p=>{if(!p[id])return p;const next={...p};delete next[id];return next}),DONE_STAYS_MS));
 },[]);
 const ids=Object.keys(phase);ids.leaving=id=>phase[id]==='leaving';
 return [ids,mark];
}

// One quiet line under the list: "3 done today". It opens the done tasks; unticking one puts it back in the list.
export function TodayDoneLine({a,tasks,row,today}){
 const [open,setOpen]=useState(false),list=uniqueTasks(tasks),n=list.length;
 if(!n)return null;
 const label=today?a.T(n+' done today','בוצעו היום: '+n):a.T(n+' done','בוצעו: '+n);
 return <div className={'today-done'+(open?' open':'')}>
  <button type="button" className="today-done-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>
   <CheckCircle size={20} weight="fill" aria-hidden="true"/><span><bdi>{label}</bdi></span><CaretDown size={16} aria-hidden="true" className="today-done-caret"/>
  </button>
  {open&&<div className="today-done-list" role="group" aria-label={label}>{list.map(row)}</div>}
 </div>;
}
