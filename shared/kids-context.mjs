import {taskMemberIds} from './task-assignment.mjs';
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
