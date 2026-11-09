import React,{useId} from 'react';
import {createPortal} from 'react-dom';
import {X,CaretUp,CaretDown} from '@phosphor-icons/react';
import './today-customize.css';

// Customize Today (full audit 2026-11-08, T7): one list in a bounded sheet instead of a long inline panel
// that listed every widget twice. Shown widgets come first in their order (with move buttons); hidden ones follow.
// Preferences stay personal (todayByUser) and use the same change() as before.
export function TodayCustomize({a,labels,available,order,includePrivate,showKids,isParent,onChange,onClose}){
 const title=useId();
 const shown=order.filter(key=>available.includes(key)),hidden=available.filter(key=>!order.includes(key));
 const hints={priorities:a.T('Appears only when something urgent or overdue is open.','מופיע רק כשיש משהו דחוף או באיחור.')};
 // Swap with the neighbouring shown widget, so keys that are unavailable here (e.g. money in sample mode) never block a move.
 const move=(key,delta)=>{const neighbour=shown[shown.indexOf(key)+delta];if(!neighbour)return;const next=[...order],i=next.indexOf(key),j=next.indexOf(neighbour);[next[i],next[j]]=[next[j],next[i]];onChange({order:next})};
 const toggle=(key,on)=>onChange({order:on?[...order,key]:order.filter(k=>k!==key)});
 const row=(key,on)=>{const i=shown.indexOf(key);return <li key={key} className={'today-customize-row'+(on?'':' off')}>
  <span className="today-customize-text"><strong>{labels[key]}</strong>{hints[key]&&<small>{hints[key]}</small>}</span>
  {on&&<span className="today-customize-move">
   <button type="button" className="icon-button" disabled={i===0} aria-label={a.T('Move up ','הזזה למעלה ')+labels[key]} onClick={()=>move(key,-1)}><CaretUp size={20} weight="bold"/></button>
   <button type="button" className="icon-button" disabled={i===shown.length-1} aria-label={a.T('Move down ','הזזה למטה ')+labels[key]} onClick={()=>move(key,1)}><CaretDown size={20} weight="bold"/></button>
  </span>}
  <button type="button" role="switch" aria-checked={on} aria-label={labels[key]} className={'switch '+(on?'on':'')} onClick={()=>toggle(key,!on)}><span/></button>
 </li>};
 return createPortal(<div className="today-customize-backdrop" onPointerDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="today-customize-sheet" role="dialog" aria-modal="true" aria-labelledby={title}>
   <header><div><h2 id={title}>{a.T('Customize Today','התאמת מסך היום')}</h2><p>{a.T('Choose what you see and in which order. Only you see these settings.','בחרו מה יופיע ובאיזה סדר. ההגדרות אישיות ורק אתם רואים אותן.')}</p></div>
    <button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={onClose}><X size={24}/></button></header>
   <div className="today-customize-body">
    <h3>{a.T('Shown on Today','מוצג במסך היום')}</h3>
    {shown.length?<ul>{shown.map(key=>row(key,true))}</ul>:<p className="today-customize-empty">{a.T('Nothing is shown yet. Turn on a section below.','עדיין לא נבחר אזור. הפעילו אזור מהרשימה למטה.')}</p>}
    {!!hidden.length&&<><h3>{a.T('More sections','אזורים נוספים')}</h3><ul>{hidden.map(key=>row(key,false))}</ul></>}
    <h3>{a.T('Privacy','פרטיות')}</h3>
    <ul><li className="today-customize-row"><span className="today-customize-text"><strong>{a.T('Include my private events in my agenda','לכלול את האירועים הפרטיים שלי בסדר היום')}</strong><small>{a.T('Only you see them.','רק אתם רואים אותם.')}</small></span>
     <button type="button" role="switch" aria-checked={!!includePrivate} aria-label={a.T('Include my private events in my agenda','לכלול את האירועים הפרטיים שלי בסדר היום')} className={'switch '+(includePrivate?'on':'')} onClick={()=>onChange({includePrivate:!includePrivate})}><span/></button></li></ul>
    {isParent&&<><h3>{a.T('The kids','הילדים')}</h3>
    <ul><li className="today-customize-row"><span className="today-customize-text"><strong>{a.T('Show the kids’ tasks','להציג את המשימות של הילדים')}</strong><small>{a.T('Under your own tasks, with each child’s photo.','מתחת למשימות שלכם, עם התמונה של כל ילד.')}</small></span>
     <button type="button" role="switch" aria-checked={!!showKids} aria-label={a.T('Show the kids’ tasks','להציג את המשימות של הילדים')} className={'switch '+(showKids?'on':'')} onClick={()=>onChange({showKids:!showKids})}><span/></button></li></ul></>}
   </div>
   <footer><button type="button" className="button" onClick={onClose}>{a.T('Done','סיום')}</button></footer>
  </section>
 </div>,document.body);
}
