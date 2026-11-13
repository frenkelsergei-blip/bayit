import {anchor} from './data.js';
export const previewDate=anchor;
// The repeat rule lives in shared/repeat.mjs (custom repeat, 2026-11-12); re-exported for existing imports.
export {occursOn} from '../../shared/repeat.mjs';
export function completionState(record,date=previewDate){return record.completions?.[date]?.state||(date===previewDate&&record.done?'done':'open')}
export function completeTask(record,{date=previewDate,actorId,actorRole,time,instant}){
 const before=completionState(record,date);
 const next=before==='done'?'open':record.parentConfirm&&actorRole==='child'?'pending':'done';
 if(before==='pending'&&actorRole==='child')return {changed:false,xpDelta:0};
 record.completions={...record.completions,[date]:{state:next,time,at:instant,actorId}};
 if(date===previewDate){record.done=next==='done';record.completedAt=next==='done'?time:null}
 return {changed:true,state:next,xpDelta:((next==='done'?1:0)-(before==='done'?1:0))*(record.xp||0)};
}
export function nextLevel(xp){return {level:Math.floor((xp||0)/100)+1,progress:(xp||0)%100,remaining:100-(xp||0)%100}}
