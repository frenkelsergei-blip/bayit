import {FieldTitle} from './field-title';
import {Flag as FtPriority} from '@phosphor-icons/react';
// Task priority UI: the flag marker, labels and the editor's four-way choice. Colors come from
// semantic tokens in priority.css, so day and night only change the token values.
import React,{useId} from 'react';
import {Flag} from '@phosphor-icons/react';
export {PRIORITY_IDS,normalizePriority,priorityRank,comparePriority,groupByPriority,topPriorities} from './priority-logic.js';

export const PRIORITIES=[
 {id:'high',en:'High',he:'גבוהה',color:'var(--prio-high)'},
 {id:'medium',en:'Medium',he:'בינונית',color:'var(--prio-medium)'},
 {id:'low',en:'Low',he:'נמוכה',color:'var(--prio-low)'},
];
export const priorityInfo=id=>PRIORITIES.find(p=>p.id===id);
export const priorityLabel=(id,lang)=>{const p=priorityInfo(id);return p?(lang==='he'?p.he:p.en):(lang==='he'?'ללא':'None')};
export const priorityTitle=(id,lang)=>lang==='he'?'עדיפות '+priorityLabel(id,lang):priorityLabel(id,lang)+' priority';

// Filled Phosphor flag in the level's color. Without a level it draws a quiet outline flag (used for "None" / "All").
export function PriorityMark({a,lang=a?.lang,priority,size=18,decorative=false,className=''}){
 const p=priorityInfo(priority);
 return <span className={'prio-mark prio-'+(p?p.id:'none')+(className?' '+className:'')} style={{'--prio-size':size+'px'}} role={decorative?undefined:'img'} aria-hidden={decorative||undefined} aria-label={decorative?undefined:priorityTitle(priority,lang)} title={decorative?undefined:priorityTitle(priority,lang)}><Flag size={size} weight={p?'fill':'regular'}/></span>;
}

// Editor control: None · Low · Medium · High as a radiogroup with roving focus and arrow keys (RTL aware).
export function PriorityChoice({a,value,onChange}){
 const labelId=useId(),options=['','low','medium','high'],current=Math.max(0,options.indexOf(value||''));
 const keydown=(e,i)=>{const rtl=getComputedStyle(e.currentTarget).direction==='rtl',k=e.key;let next=null;
  if(k==='ArrowDown'||k===(rtl?'ArrowLeft':'ArrowRight'))next=(i+1)%options.length;
  else if(k==='ArrowUp'||k===(rtl?'ArrowRight':'ArrowLeft'))next=(i-1+options.length)%options.length;
  else if(k==='Home')next=0;else if(k==='End')next=options.length-1;
  if(next===null)return;e.preventDefault();onChange(options[next]);const group=e.currentTarget.parentElement;requestAnimationFrame(()=>group?.children[next]?.focus())};
 return <div className="prio-choice-field"><span className="field-label" id={labelId}><FieldTitle icon={FtPriority}>{a.T('Priority','עדיפות')}</FieldTitle></span>
  <div className="prio-choice" role="radiogroup" aria-labelledby={labelId}>{options.map((id,i)=><button type="button" role="radio" key={id||'none'} aria-checked={i===current} tabIndex={i===current?0:-1} className={'prio-option prio-option-'+(id||'none')+(i===current?' on':'')} onClick={()=>onChange(id)} onKeyDown={e=>keydown(e,i)}><PriorityMark a={a} priority={id} size={18} decorative/><span>{priorityLabel(id,a.lang)}</span></button>)}</div>
 </div>;
}
