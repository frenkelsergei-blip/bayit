// AI answers rendered as real structure (user reports 2026-11-10): a bold lead line, then one card-like section per
// title with an icon in a soft circle, its tone and a count, and each list line as a row: the time in its own pill,
// the title in bold, the person's face at the end. The whole answer takes one direction from its language. No HTML
// from the AI and no emoji (shared/answer-format.mjs). Styles: answer-text.css.
import React from 'react';
import {Sun,SunHorizon,Infinity as Anytime,CheckCircle,WarningCircle,CalendarDots,CalendarBlank,ShoppingCart,Wallet,Bell,ListChecks,NotePencil,ListBullets,Clock,CaretLeft,CaretRight} from '@phosphor-icons/react';
import {parseAnswer,answerDirection,answerSections,splitItem} from '../../shared/answer-format.mjs';
import './answer-text.css';
const ICON={today:Sun,tomorrow:SunHorizon,anytime:Anytime,done:CheckCircle,overdue:WarningCircle,events:CalendarDots,week:CalendarBlank,shopping:ShoppingCart,money:Wallet,reminders:Bell,tasks:ListChecks,notes:NotePencil,other:ListBullets};
const Runs=({runs})=>runs.map((r,i)=>r.bold?<strong key={i}>{r.text}</strong>:<React.Fragment key={i}>{r.text}</React.Fragment>);
// linkFor(title) → a route for the record a row names (user request 2026-11-10: tap a task in the answer to open it).
function Rows({a,Avatar,items,ordered,linkFor,onNavigate}){
 const people=(a?.members||[]).flatMap(m=>[a.name?.(m.id),m.name,m.he].filter(Boolean).map(n=>[n,m.id]));
 const idOf=name=>people.find(([n])=>n.toLowerCase()===String(name).toLowerCase())?.[1];
 return <ul className={'answer-rows'+(ordered?' ordered':'')}>{items.map((runs,i)=>{const it=splitItem(runs,people.map(([n])=>n)),who=it.person&&idOf(it.person);
  const title=(it.runs.filter(r=>r.bold).map(r=>r.text).join(' ')||it.runs.map(r=>r.text).join('')).trim(),route=linkFor?.(title);
  const body=<>{it.time?<span className="answer-time" dir="ltr"><Clock size={14} weight="bold" aria-hidden="true"/>{it.time}</span>:<span className="answer-dot" aria-hidden="true">{ordered?i+1:''}</span>}
   <span className="answer-row-text"><Runs runs={it.runs}/></span>
   {it.person&&<span className="answer-person">{who&&Avatar?<Avatar who={who} size={28} decorative/>:null}<small>{it.person}</small></span>}</>;
  return <li key={i} className={'answer-row'+(route?' linked':'')}>{route?<button type="button" className="answer-row-link" onClick={()=>onNavigate?.(route)} aria-label={(a?.T?a.T('Open: ','פתיחה: '):'')+title}>{body}{a?.lang==='he'?<CaretLeft size={16} className="answer-go" aria-hidden="true"/>:<CaretRight size={16} className="answer-go" aria-hidden="true"/>}</button>:body}</li>})}</ul>;
}
const Body=({a,Avatar,blocks,linkFor,onNavigate})=>blocks.map((b,i)=>b.type==='p'?<p key={i} dir="auto"><Runs runs={b.runs}/></p>:b.items?<Rows key={i} a={a} Avatar={Avatar} items={b.items} ordered={b.type==='ol'} linkFor={linkFor} onNavigate={onNavigate}/>:null);
export function AnswerText({text,className='',a,Avatar,linkFor,onNavigate}){
 const {lead,sections}=answerSections(parseAnswer(text));
 return <div className={'answer-text '+className} dir={answerDirection(text)}>
  {lead.length>0&&<div className="answer-lead"><Body a={a} Avatar={Avatar} blocks={lead} linkFor={linkFor} onNavigate={onNavigate}/></div>}
  {sections.map((s,i)=>{const Glyph=ICON[s.kind]||ListBullets;return <section key={i} className={'answer-section tone-'+s.kind}>
   <h3><span className="answer-icon" aria-hidden="true"><Glyph size={18} weight="bold"/></span><span className="answer-title"><Runs runs={s.title}/></span>{s.count>0&&<b className="answer-count">{s.count}</b>}</h3>
   <Body a={a} Avatar={Avatar} blocks={s.blocks} linkFor={linkFor} onNavigate={onNavigate}/></section>})}
 </div>;
}
