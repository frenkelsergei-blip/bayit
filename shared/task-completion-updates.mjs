import {taskAssignedTo} from './task-assignment.mjs';

// Input must already be filtered for the recipient's access (including task-list access).
// Ordinary task assignees hear when someone else finishes their task. The owner's
// separate opt-in and routines' existing parent-update rules remain intact.
export function taskDoneUpdates(visible,memberId,{date,days=2,limit=10}){
 const prefs=visible.profiles?.[memberId]?.notificationPrefs||{},recent=new Set(Array.from({length:days},(_,n)=>new Date(Date.parse(date+'T12:00:00Z')-n*86400000).toISOString().slice(0,10))),out=[];
 for(const task of visible.tasks||[]){
  const category=task.routine?'routines':'tasks',enabled=prefs.categories?.[category]?.enabled??prefs.enabled;
  const recipient=task.ownerId===memberId?task.notifyOwnerOnDone===true:!task.routine&&taskAssignedTo(task,memberId);
  if(task.deletedAt||enabled===false||!recipient)continue;
  for(const day of recent){const completion=task.completions?.[day];
   if(completion?.state==='done'&&completion.actorId&&completion.actorId!==memberId)out.push({key:'done:'+task.id+':'+day,task,date:day,actorId:completion.actorId});
  }
 }
 return out.slice(0,limit);
}
