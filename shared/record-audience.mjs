// Assignment and visibility model (confirmed by the user 2026-11-08; AGENTS.md "Assignment and visibility model").
// Every event, task (incl. Kids routines) and note has an owner (creator), assignees (who should do it) and a
// visibility (private = Only me / family = Whole family / selected = Selected people), plus a separate edit permission.
//  1. Visibility decides who can see a record, everywhere.
//  2. Assignees ALWAYS see the record. Assigning someone adds them to who can see it: "Only me" plus another assignee
//     becomes "Selected people: owner + assignees". The server normalises every write (app/cloud/state.mjs), so
//     assignees ⊆ viewers always holds in stored data; reads normalise older records the same way.
//  3. "Only me" means only the owner, with no other assignees.
//  4. Personal views ("mine": Today's little things to do, My Space › My tasks, reminders, Telegram, Push, change
//     notices) use isMine(): assigned to me, plus my own private records.
// Documents and insurance "who it concerns / insured person" are NOT assignment and never grant access: only the
// collections below take part. One module for the client and the server.
import {taskMemberIds} from './task-assignment.mjs';
import {listAudience,canAccessList} from './task-lists.mjs';

export const AUDIENCE_COLLECTIONS=Object.freeze(['events','tasks','notes','history']);
const audienceCollection=collection=>AUDIENCE_COLLECTIONS.includes(collection);
const clean=ids=>[...new Set((ids||[]).filter(id=>typeof id==='string'&&id))];

// Who should do it. Tasks and their history rows use memberIds (or the older single memberId); events use
// memberIds; a note has one memberId ("Assigned to" in the note window).
export function recordAssignees(record,collection){
 if(!record||!audienceCollection(collection))return [];
 if(collection==='events')return clean(record.memberIds);
 if(collection==='notes')return clean([...(Array.isArray(record.memberIds)?record.memberIds:[]),record.memberId]);
 return taskMemberIds(record);
}
export const assignedTo=(record,userId,collection)=>!!userId&&recordAssignees(record,collection).includes(userId);

// The visibility-only rule (unchanged from app/src/data.js canSee).
export const visibilityAllows=(record,userId)=>!!record&&!!userId&&(record.ownerId===userId||record.visibility==='family'||record.visibility==='selected'&&(record.allowedIds||[]).includes(userId));

// Can this person see the record? Visibility, plus: assignees always see it.
export const canSeeRecord=(record,userId,collection)=>visibilityAllows(record,userId)||assignedTo(record,userId,collection);

// Everyone who can see the record. members: [{id}] or ids.
export function recordViewers(record,members,collection){
 const ids=(members||[]).map(m=>typeof m==='string'?m:m?.id).filter(Boolean);
 return ids.filter(id=>canSeeRecord(record,id,collection));
}

// Assignees (other than the owner) that the chosen visibility leaves out. Empty when the record is consistent.
export function missingViewers(record,collection){
 if(!record||record.visibility==='family')return [];
 const allowed=record.visibility==='selected'?record.allowedIds||[]:[];
 return recordAssignees(record,collection).filter(id=>id!==record.ownerId&&!allowed.includes(id));
}

// The consistent form of a record: "Only me" or "Selected people" widened to owner + assignees. Returns the same
// object when nothing changes, otherwise a shallow copy. Tasks inside a task list or shopping list take the list's
// audience (shared/task-lists.mjs); they are never widened here. The server refuses an assignee outside the list.
export function normalizeAudience(record,collection){
 if(!record||typeof record!=='object'||record.listId&&collection==='tasks'||record.shoppingListId)return record;
 const missing=missingViewers(record,collection);if(!missing.length)return record;
 const allowed=record.visibility==='selected'?clean(record.allowedIds):[];
 return {...record,visibility:'selected',allowedIds:[...allowed,...missing]};
}
// Normalises every audience collection of a household state (or a visible projection). Pure: returns a new
// top-level object and new arrays only where something changed.
export function normalizeStateAudience(state){
 if(!state||typeof state!=='object')return state;let out=state;
 for(const collection of AUDIENCE_COLLECTIONS){const list=state[collection];if(!Array.isArray(list))continue;let changed=false;
  const next=list.map(r=>{const n=normalizeAudience(r,collection);if(n!==r)changed=true;return n});
  if(changed){if(out===state)out={...state};out[collection]=next}}
 return out;
}

// "Mine": assigned to me, plus my own private records. The single rule for every personal view.
export function isMine(record,userId,collection){
 if(!record||!userId||!canSeeRecord(record,userId,collection))return false;
 return assignedTo(record,userId,collection)||record.ownerId===userId&&record.visibility==='private';
}

// For the form: what saving will store, and the note to show. value: {ownerId, visibility, allowedIds}.
// Returns {visibility, allowedIds, added:[ids the assignees added], locked:[assignees other than the owner]}.
export function effectiveAudience({ownerId,visibility,allowedIds=[]},assignees=[]){
 const people=clean(assignees),locked=people.filter(id=>id!==ownerId);
 if(visibility==='family')return {visibility,allowedIds:[],added:[],locked};
 const base=visibility==='selected'?clean(allowedIds):[],added=locked.filter(id=>!base.includes(id));
 if(!added.length)return {visibility,allowedIds:base,added,locked};
 return {visibility:'selected',allowedIds:[...base,...added],added,locked};
}

// Server-side check on every write of an event, task or note (web app, Telegram, AI actions, imports all go through
// app/cloud/state.mjs applyChanges). Returns the value to store, normalised, or throws a clear message:
//  - an assignee must be a family member;
//  - a task in a task list (or a shopping trip task) keeps the list's audience: a newly assigned person who cannot
//    see the list is refused ("share the list or choose another list"); a hidden listId is kept for assignees who
//    see the task but not its list;
//  - only the owner widens who can see a record, so a non-owner who assigns someone outside it is refused.
// ctx: {old, actorId, members:[{id,name}], memberIds:Set, taskLists, shoppingLists}
export function enforceAudience(collection,value,{old=null,actorId,members=[],memberIds,taskLists=[],shoppingLists=[]}={}){
 const ids=memberIds||new Set(members.map(m=>m.id)),name=id=>members.find(m=>m.id===id)?.name||'This person';
 const people=recordAssignees(value,collection);if(people.some(id=>!ids.has(id)))throw Error('A family member is invalid.');
 if(collection==='tasks'&&old?.listId&&value.listId===undefined){const hidden=(taskLists||[]).find(l=>l.id===old.listId);if(hidden&&!canAccessList(hidden,actorId))value.listId=old.listId}
 const list=collection==='tasks'&&value.listId?(taskLists||[]).find(l=>l.id===value.listId):value.shoppingListId?(shoppingLists||[]).find(l=>l.id===value.shoppingListId):null;
 if(list&&canAccessList(list,value.ownerId)){const audience=listAudience(list),outside=audience==='family'?[]:people.filter(id=>!audience.has(id)&&!assignedTo(old,id,collection));
  if(outside.length)throw Error(outside.map(name).join(', ')+' can’t see this list. Share the list with them first, or choose another list.');
  return value}
 const normalized=normalizeAudience(value,collection);if(normalized===value)return value;
 if(old&&old.ownerId!==actorId){const added=missingViewers(value,collection).filter(id=>!canSeeRecord(old,id,collection));
  if(added.length)throw Error('Only the owner can let more people see this. Ask '+name(old.ownerId)+' to assign '+added.map(name).join(', ')+'.')}
 return normalized;
}
