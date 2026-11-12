import {taskMemberIds} from './task-assignment.mjs';
import {occursOn} from '../app/src/domain.js';
// Selection is a UI context; record authorization still runs before filtering.
export function kidsContext(members,actorId,preferred){
 const actor=members.find(m=>m.id===actorId),children=members.filter(m=>m.role==='child'&&(actor?.role!=='child'||m.id===actorId));
 return {children,child:children.some(m=>m.id===preferred)?preferred:children[0]?.id};
}
export const routinesForChild=(records,childId)=>records.filter(t=>t.routine&&t.memberId===childId);
// Kids' routines (user decision 2026-11-11): a routine whose people are all children. They belong to the Kids screen
// and the child's own views; grown-ups' Tasks hides them unless "Kids' routines" is chosen in Filters, and the parent's
// Today shows one summary line instead of the rows. This is a view rule only: records, statistics, reminders, Telegram
// and Bayit AI still see every routine. With the Kids feature off nothing is hidden.
export const isKidsRoutine=(task,members)=>{if(!task?.routine)return false;const ids=taskMemberIds(task);return ids.length>0&&ids.every(id=>members.find(m=>m.id===id)?.role==='child')};
export const hidesKidsRoutines=(viewerRole,kidsOn)=>!!kidsOn&&viewerRole!=='child';
// How a routine is shared between children (user report 2026-11-11: Together routines showed up as turns).
// 'alternate' (the default when nothing was saved) rotates daily, 'fixed' keeps one order, 'none' is Together:
// everyone does it at the same time, so it has no queue and never appears on the Turns screen.
export const routineTurnMode=task=>task?.turnOrder==='fixed'?'fixed':task?.turnOrder==='none'?'none':'alternate';
export const routineTakesTurns=task=>!!task?.routine&&routineTurnMode(task)!=='none';
// Whose turn it is on a date (user request 2026-11-11): the one computation behind the Turns screen and Bayit AI,
// so they can never disagree. For each routine that takes turns and happens that day (by English title, as the screen
// groups them): the children in order, their slot times, and whether a parent swapped the order for that day.
// - 'alternate' rotates one step per day, counted from the routine's first date (a fixed start, so tomorrow really
//   differs from today; before 2026-11-11 the screen counted from "today" and every day began with the same child).
// - 'fixed' keeps the family order. Together routines ('none') never appear.
// - A parent's swap is stored in preferences.turnOverrides['date|title'] and wins for that day.
// - Slot times start at the earliest routine time (19:00 when none) and are preferences.turnInterval apart (15 minutes).
const dayNumber=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);
const clock=minutes=>{const m=Math.max(0,Math.min(1439,minutes));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
export function turnsOnDate(tasks,members,date,preferences={}){
 const rank=new Map((members||[]).map((m,i)=>[m.id,i])),groups=new Map(),interval=Number(preferences?.turnInterval)||15;
 for(const t of tasks||[]){if(!routineTakesTurns(t)||!t.memberId||!occursOn(t,date))continue;if(!groups.has(t.title))groups.set(t.title,[]);groups.get(t.title).push(t)}
 return [...groups].map(([title,list])=>{
  list=[...list].sort((x,y)=>(rank.get(x.memberId)??999)-(rank.get(y.memberId)??999));
  const children=[...new Set(list.map(t=>t.memberId))],mode=routineTurnMode(list[0]),start=list.map(t=>t.date).filter(Boolean).sort()[0]||date;
  const shift=children.length?((dayNumber(date)-dayNumber(start))%children.length+children.length)%children.length:0;
  const planned=mode==='alternate'?[...children.slice(shift),...children.slice(0,shift)]:children;
  const saved=preferences?.turnOverrides?.[date+'|'+title],swapped=Array.isArray(saved)&&saved.some(id=>children.includes(id));
  const order=swapped?[...saved.filter(id=>children.includes(id)),...children.filter(id=>!saved.includes(id))]:planned;
  const first=list.map(t=>t.time).filter(v=>/^\d\d:\d\d$/.test(v||'')).sort()[0]||'19:00',base=Number(first.slice(0,2))*60+Number(first.slice(3));
  return {title,he:list[0].he||'',icon:list[0].icon||'',xp:list[0].xp||10,mode,order,times:order.map((_,i)=>clock(base+i*interval)),changedByParent:swapped&&order.join()!==planned.join(),ids:list.map(t=>t.id)};
 });
}

