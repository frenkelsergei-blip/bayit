import {taskMemberIds} from './task-assignment.mjs';
import {clockTime} from './message-plan.mjs';
import {voucherReminderDue} from './vouchers.mjs';
import {completionState} from '../app/src/domain.js';

const pastDay = day => new Date(Date.parse(day)-7*86400000).toISOString().slice(0,10);
export function planningCandidates(tasks,vouchers,actor,today) {
 const owned = tasks.filter(task=>task.ownerId===actor&&!task.deletedAt&&!task.routine&&!task.done&&(!task.repeat||task.repeat==='once')&&completionState(task,task.date||today)==='open');
 const pickup = owned.filter(task=>task.date===today&&clockTime(task.time)&&!taskMemberIds(task).length&&/איסוף|pick[ -]?up/i.test((task.title||'')+' '+(task.he||'')));
 const old = owned.filter(task=>task.date&&task.date<=pastDay(today));
 return [...pickup.map(record=>({kind:'pickup',record})),...vouchers.filter(record=>voucherReminderDue(record,today)).map(record=>({kind:'voucher',record})),
  ...old.map(record=>({kind:'stale',record}))].slice(0,12);
}
