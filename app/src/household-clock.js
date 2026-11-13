import {useEffect,useRef,useState} from 'react';
import {anchor,refreshAnchor} from './data';
import {followDay} from './day-follow.mjs';
export function useHouseholdToday(){
 const [today,setToday]=useState(anchor);
 useEffect(()=>{const tick=()=>setToday(refreshAnchor());const visible=()=>{if(!document.hidden)tick()};tick();const timer=setInterval(tick,30000);addEventListener('focus',tick);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);removeEventListener('focus',tick);document.removeEventListener('visibilitychange',visible)}},[]);
 return today;
}
export function useHouseholdDay(a,initial,explicit=false){
 const today=a.today||anchor,[day,change]=useState(initial||today),following=useRef(!explicit),seen=useRef(today);
 /* A picked day lasts until the household date changes (day-follow.mjs, 2026-11-13). */
 useEffect(()=>{const next=followDay({day,following:following.current,seen:seen.current},today);following.current=next.following;seen.current=next.seen;if(next.day!==day)change(next.day)},[today]);
 return [day,next=>{following.current=false;change(next)},()=>{following.current=true;change(today)}];
}

export function useHouseholdMonth(a,initial,explicit=false){return useHouseholdDay({...a,today:(a.today||anchor).slice(0,7)},initial,explicit)}
