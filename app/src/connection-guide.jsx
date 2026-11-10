// One guide layout for every connection (concept A, 2026-11-10; concept/explorations/connections-20261110/guide-*.png).
// Driven by a registry guide (shared/connections.mjs): a yellow warning when there is one, what you need (time, cost,
// what to have), one plain line, works / doesn't, numbered steps and a greyed "later" step. A connection's own form
// sits inside the step that names its own window ({card:<its id>}); AI and Telegram pass slots to place their
// controls step by step. Nothing here saves anything: each form keeps its own check before saving.
import React from 'react';
import {Check,X,WarningCircle,ArrowSquareOut,Clock,Wallet,Key,User,DeviceMobile,Circle} from '@phosphor-icons/react';
import './connection-guide.css';

const ICONS={Clock,Wallet,Key,User,DeviceMobile};
const Need=({name})=>{const C=ICONS[name]||Circle;return <C size={17} aria-hidden="true"/>};
export const guideText=(a,o)=>o?(a.lang==='he'?o.he:o.en):'';

export function GuideIntro({a,g,support=true}){
 const L=o=>guideText(a,o);
 return <>
  {g.warning&&<div className="conn-guide-warning" role="note"><WarningCircle size={28} weight="fill" aria-hidden="true"/><strong>{L(g.warning.title)}</strong><span>{L(g.warning.text)}</span></div>}
  {!!g.need?.length&&<div className="setup-need conn-guide-need">{g.need.map(([icon,t],i)=><span key={i}><Need name={icon}/>{L(t)}</span>)}</div>}
  {g.intro&&<p className="conn-guide-intro">{L(g.intro)}</p>}
  {support&&(g.supported||g.unsupported)&&<div className="setup-support conn-guide-support">
   {g.supported&&<div className="yes"><strong><Check size={16} weight="bold" aria-hidden="true"/>{a.T('Works with','עובד עם')}</strong><ul>{g.supported.map((t,i)=><li key={i}>{L(t)}</li>)}</ul></div>}
   {g.unsupported&&<div className="no"><strong><X size={16} weight="bold" aria-hidden="true"/>{a.T('Doesn’t work with','לא עובד עם')}</strong><ul>{g.unsupported.map((t,i)=><li key={i}>{L(t)}</li>)}</ul></div>}
  </div>}
 </>;
}

// slots[i]: {title, text, body, done, actions:false}. Without a slot, the step that opens this connection's own
// window holds `panel` (its form, with its own check) instead of the button.
export function GuideSteps({a,g,selfId,panel,slots={},onCard,onRoute}){
 const L=o=>guideText(a,o);let placed=false;
 const action=(x,k)=>x.link?<a key={k} className="button secondary setup-action" href={x.link} target="_blank" rel="noopener noreferrer">{L(x)}<ArrowSquareOut size={18} aria-hidden="true"/></a>
  :x.card?<button key={k} type="button" className="button setup-action" onClick={()=>onCard?.(x.card)}>{L(x)}</button>
  :x.route?<button key={k} type="button" className="button setup-action" onClick={()=>onRoute?.(x.route)}>{L(x)}</button>:null;
 const steps=g.steps.map(([title,text,...actions],i)=>{
  const slot=slots[i]||{},own=actions.some(x=>x.card&&x.card===selfId),rest=actions.filter(x=>!(x.card&&x.card===selfId));
  const body=slot.body!==undefined?slot.body:own&&panel&&!placed?(placed=true,panel):null;
  return <li key={i} className={slot.done?'done':''}><span className={'setup-step-n'+(slot.done?' done':'')} aria-hidden="true">{slot.done?<Check size={18} weight="bold"/>:i+1}</span>
   <div><strong>{slot.title||L(title)}</strong>{(slot.text||text)&&<small>{slot.text||L(text)}</small>}
    {slot.actions!==false&&!!rest.length&&<div className="setup-actions">{rest.map(action)}</div>}
    {body&&<div className="conn-guide-slot">{body}</div>}</div>
   {slot.done&&<span className="sr-only">{a.T('Done','בוצע')}</span>}</li>});
 return <>
  <ol className="setup-guide-steps conn-guide-steps">{steps}{g.then&&<li className="later"><span className="setup-step-n later" aria-hidden="true">{g.steps.length+1}</span><div><strong>{L(g.then[0])}</strong><small>{L(g.then[1])}</small></div></li>}</ol>
  {panel&&!placed&&<div className="conn-guide-panel">{panel}</div>}
 </>;
}

export function ConnectionGuide(props){return <div className="conn-guide"><GuideIntro a={props.a} g={props.g}/><GuideSteps {...props}/></div>}
