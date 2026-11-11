import React from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import {isKidsRoutine} from '../../shared/kids-context.mjs';
import {occursOn,completionState} from './domain';
import './today-kids-routines.css';

// Today for grown-ups (user decision 2026-11-11): the kids' routines are not listed among the small tasks. One line
// says how many of today's routines are done and opens the Kids screen. The kids still see every routine there and
// on their own Today. A routine waiting for a parent's OK is not counted as done.
export function kidsRoutinesToday(a,date){
 const routines=a.visible(a.data.tasks).filter(t=>isKidsRoutine(t,a.members)&&occursOn(t,date));
 const states=routines.map(t=>completionState(t,date));
 return {total:routines.length,done:states.filter(s=>s==='done').length,waiting:states.filter(s=>s==='pending').length,children:[...new Set(routines.flatMap(t=>t.memberIds?.length?t.memberIds:[t.memberId]))]};
}

export function TodayKidsRoutines({a,summary:{total,done,waiting,children},Avatar}){
 if(!total)return null;
 const detail=[a.T(done+' of '+total+' done','בוצעו '+done+' מתוך '+total),waiting>0&&a.T(waiting+' waiting for your OK',waiting+' מחכות לאישור')].filter(Boolean).join(' · ');
 return <button type="button" className="today-kids-routines" onClick={()=>a.go('kids')} aria-label={a.T('Kids’ routines today: '+detail+'. Open Kids','שגרות הילדים היום: '+detail+'. פתיחת מסך הילדים')}>
  <span className="today-kids-routines-faces" aria-hidden="true">{children.slice(0,3).map(id=><Avatar key={id} who={id} size={30}/>)}</span>
  <span className="today-kids-routines-text"><strong>{a.T('Kids’ routines','שגרות הילדים')}</strong><span><bdi>{detail}</bdi></span></span>
  <span className="today-kids-routines-meter" aria-hidden="true"><i style={{width:Math.round(done/total*100)+'%'}}/></span>
  <ArrowRight size={18} aria-hidden="true"/>
 </button>;
}
