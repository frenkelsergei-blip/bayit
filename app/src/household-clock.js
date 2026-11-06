import {useEffect,useRef,useState} from 'react';
import {anchor,refreshAnchor} from './data';
export function useHouseholdToday(){
 const [today,setToday]=useState(anchor);
 useEffect(()=>{const tick=()=>setToday(refreshAnchor());const visible=()=>{if(!document.hidden)tick()};tick();const timer=setInterval(tick,30000);addEventListener('focus',tick);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);removeEventListener('focus',tick);document.removeEventListener('visibilitychange',visible)}},[]);
 return today;
}
export function useHouseholdDay(a,initial,explicit=false){
 const today=a.today||anchor,[day,change]=useState(initial||today),following=useRef(!explicit);
 useEffect(()=>{if(following.current)change(today)},[today]);
 return [day,next=>{following.current=false;change(next)},()=>{following.current=true;change(today)}];
}

export function useHouseholdMonth(a,initial,explicit=false){return useHouseholdDay({...a,today:(a.today||anchor).slice(0,7)},initial,explicit)}
