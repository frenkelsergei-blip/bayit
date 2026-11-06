import {useLayoutEffect,useRef,useState} from 'react';
const guards=new Map();
export function clearDraftGuard(){guards.clear()}
export function confirmDraftNavigation(){const latest=[...guards.values()].at(-1);return !latest||window.confirm(latest.message)}
export function useDraftGuard(a,value,{dirty,enabled=true,key}={}){
 const owner=useRef(Symbol('draft')),recordKey=useRef(key),initial=useRef(JSON.stringify(value));if(recordKey.current!==key){recordKey.current=key;initial.current=JSON.stringify(value)}
 const latest=useRef(value),[,render]=useState(0),serialized=JSON.stringify(value),changed=enabled&&(dirty??(serialized!==initial.current));latest.current=serialized;
 useLayoutEffect(()=>{
  if(!changed)return;
  const guard={message:a.T('Leave this form? Your unsaved changes will be lost.','לעזוב את הטופס? השינויים שטרם נשמרו יאבדו.')};guards.set(owner.current,guard);
  const warn=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);
  return()=>{if(guards.get(owner.current)===guard)guards.delete(owner.current);window.removeEventListener('beforeunload',warn)};
 },[changed,a.lang,serialized]);
 const guard=action=>{if(!changed){action();return true}if(window.confirm(a.T('Discard these unsaved changes?','לבטל את השינויים שלא נשמרו?'))){guards.delete(owner.current);action();return true}return false};
 guard.accept=()=>{initial.current=latest.current;guards.delete(owner.current);render(n=>n+1)};
 return guard;
}
