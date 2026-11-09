// Who a task is assigned to. Since the assignment and visibility model of 2026-11-08, assignees always see the task:
// use shared/record-audience.mjs (canSeeRecord, isMine, normalizeAudience) for access and personal views.
// Old tasks keep their single memberId; new shared tasks also store the full memberIds list.
export function taskMemberIds(task){
 const ids=Array.isArray(task?.memberIds)&&task.memberIds.length?task.memberIds:[task?.memberId];
 return [...new Set(ids.filter(id=>typeof id==='string'&&id))];
}
export const taskAssignedTo=(task,memberId)=>taskMemberIds(task).includes(memberId);
export function assignTaskPeople(task,ids){
 const people=[...new Set(ids)];
 if(!people.length)throw Error('Choose at least one family member.');
 task.memberId=people[0];task.memberIds=people;
 return task;
}
