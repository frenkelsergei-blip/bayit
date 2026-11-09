import {useEffect} from 'react';
import './dialog-manager.css';
const focusable=root=>[...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert]'));
// One focus boundary for sheets, item editors, people pickers and nested dialogs.
export function DialogManager(){
 useEffect(()=>{
  let active=null,previous=null,sequence=0,lastOutside=document.activeElement,pendingTrigger=null;
  const opened=new WeakMap(),returnTo=new WeakMap(),lastInside=new WeakMap();
  const top=()=>{const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');for(const dialog of dialogs)if(!opened.has(dialog))opened.set(dialog,++sequence);dialogs.sort((a,b)=>opened.get(a)-opened.get(b));return dialogs.some(e=>e.getAttribute('aria-modal')==='true')?dialogs.at(-1):null};
  const initialFocus=root=>{const target=focusable(root).find(el=>!el.matches('input,textarea,select,[contenteditable=true]'));if(target)target.focus({preventScroll:true});else{if(!root.hasAttribute('tabindex'))root.tabIndex=-1;root.focus({preventScroll:true})}};
  const restore=(target,expected,{respectCurrent=false}={})=>{if(!target?.isConnected)return;requestAnimationFrame(()=>{const current=document.activeElement;if(respectCurrent&&current&&current!==document.body&&current!==document.documentElement&&current.isConnected&&current.getClientRects().length)return;if(top()===expected&&target.isConnected&&target.getClientRects().length)target.focus({preventScroll:true})})};
  const reconcile=()=>{const next=top();if(next===active){if(active&&!active.contains(document.activeElement))initialFocus(active);return}const closing=active;
   if(!next){active=null;delete document.documentElement.dataset.bayitDialogOpen;delete document.body.dataset.bayitDialogOpen;restore(previous,null,{respectCurrent:true});previous=null;pendingTrigger=null;return}
   if(!active){previous=pendingTrigger||lastOutside;if(next.contains(previous))previous=null;document.documentElement.dataset.bayitDialogOpen='true';document.body.dataset.bayitDialogOpen='true'}
   const opening=!closing||opened.get(next)>opened.get(closing);
   if(opening){const trigger=pendingTrigger||lastInside.get(closing)||previous;if(trigger&&!next.contains(trigger))returnTo.set(next,trigger)}
   active=next;pendingTrigger=null;
   if(!opening){const target=returnTo.get(closing);if(target&&next.contains(target)){restore(target,next);return}}
   if(!active.contains(document.activeElement))initialFocus(active);
  };
  const key=e=>{const dialog=top();if(!dialog)return;
   if(e.key==='Escape'){
    const nested=[...dialog.querySelectorAll('[role="combobox"][aria-expanded="true"][aria-controls]')].find(button=>{const popup=document.getElementById(button.getAttribute('aria-controls'));return popup?.getAttribute('role')==='listbox'&&popup.getClientRects().length});
    if(nested){e.preventDefault();e.stopImmediatePropagation();nested.click();nested.focus({preventScroll:true});return}
    const close=[...dialog.querySelectorAll('button')].find(b=>/^(close|סגיר)/i.test(b.getAttribute('aria-label')||'')||/^(Cancel|ביטול)$/.test(b.textContent.trim()));if(close){e.preventDefault();e.stopImmediatePropagation();close.click()}return
   }
   if(e.target.closest?.('[role="listbox"]'))return;
   if(e.key==='Tab'){const elements=focusable(dialog).filter(el=>el.tabIndex>=0);e.preventDefault();e.stopImmediatePropagation();if(!elements.length)return;const index=elements.indexOf(document.activeElement);if(e.target.getAttribute('role')==='combobox'&&e.target.getAttribute('aria-expanded')==='true')e.target.click();const next=index<0?(e.shiftKey?elements.length-1:0):(index+(e.shiftKey?-1:1)+elements.length)%elements.length;elements[next].focus()}
  };
  const focus=e=>{const dialog=top();if(!dialog){lastOutside=e.target;return}if(dialog.contains(e.target)){lastInside.set(dialog,e.target);return}if(!e.target.closest?.('[role="listbox"]'))initialFocus(dialog)};
  const pointer=e=>{const trigger=e.target.closest?.('button,a[href],input,select,textarea,[tabindex]');if(!trigger)return;pendingTrigger=trigger;if(!top())lastOutside=trigger;else if(active?.contains(trigger))lastInside.set(active,trigger)};
  const observer=new MutationObserver(reconcile);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden','inert']});document.addEventListener('keydown',key,true);document.addEventListener('focusin',focus);document.addEventListener('pointerdown',pointer,true);reconcile();
  return()=>{observer.disconnect();document.removeEventListener('keydown',key,true);document.removeEventListener('focusin',focus);document.removeEventListener('pointerdown',pointer,true);delete document.documentElement.dataset.bayitDialogOpen;delete document.body.dataset.bayitDialogOpen};
 },[]);return null;
}
