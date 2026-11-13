// Done tasks leave Today (owner, 2026-11-13: "once ticked it should make room for the others"). A ticked row stays a
// moment, struck through, with the usual celebration and its Undo, then leaves; a quiet "N done today" line opens them,
// where unticking puts a task back. A child's tick that waits for a parent stays in the list ("Parent approval requested").
import {HOME_TIMEZONE} from '../../shared/home-config.mjs';

// How long a just-ticked row stays (ms), and when it starts fading out.
export const DONE_STAYS_MS=2600,DONE_FADES_MS=2200;

const dayOf=at=>{const d=new Date(at);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})};

// Was this task finished on the shown day? `day` is the occurrence Today shows it for (today, or an earlier date for an
// overdue one, or its last completion for an anytime one); `state` is its completion state for that occurrence.
export function doneOnDay(record,day,date,state){
 if(state!=='done')return false;
 if(day===date)return true;
 const at=record?.completions?.[day]?.at;
 return !!at&&dayOf(at)===date;
}

// One entry per task, in the order given.
export const uniqueTasks=list=>{const seen=new Set();return list.filter(t=>!seen.has(t.id)&&seen.add(t.id))};
