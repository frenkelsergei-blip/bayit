// Task lists: named, shareable groups of tasks (e.g. "Home chores", "Noa's birthday party").
// Same audience model as shopping lists: the owner, the whole family, or selected people.
// A task placed in a list always has exactly the list's audience, so a list can never leak a task
// to someone outside it (enforced on the server in app/cloud/state.mjs).
import {canAccessList} from './shopping-lists.mjs';
export {canAccessList};

export const TASK_LIST_LIMIT=60;

// The set of people who can see a list ('family' means everyone in the household).
export function listAudience(list){return list.visibility==='family'?'family':new Set([list.ownerId,...(list.visibility==='selected'?list.allowedIds||[]:[])])}

// Give a task the list's audience, from the point of view of the task's owner. Returns the task.
export function applyListAudience(task,list){
 if(!list){delete task.listId;return task}
 task.listId=list.id;
 const audience=listAudience(list);
 if(audience==='family'){task.visibility='family';task.allowedIds=[];return task}
 const others=[...audience].filter(id=>id!==task.ownerId);
 if(!others.length){task.visibility='private';task.allowedIds=[]}else{task.visibility='selected';task.allowedIds=others}
 return task;
}

// Shopping trip: a task linked to a shopping list ("Buy groceries · This week"). It takes the shopping list's
// audience the same way a task takes its task list's audience. Uses shoppingListId, not listId.
export function applyShoppingTripAudience(task,list){
 const listId=task.listId;applyListAudience(task,list);
 if(list){task.shoppingListId=list.id;if(listId)task.listId=listId;else delete task.listId}else delete task.shoppingListId;
 return task;
}

// True when the task owner may use the list and the task's audience equals the list's audience.
export function taskFitsList(task,list){
 if(!list||!canAccessList(list,task.ownerId))return false;
 const audience=listAudience(list);
 if(audience==='family')return task.visibility==='family';
 if(task.visibility==='family')return false;
 const people=new Set([task.ownerId,...(task.visibility==='selected'?task.allowedIds||[]:[])]);
 return people.size===audience.size&&[...people].every(id=>audience.has(id));
}

export function validateTaskList(list,memberIds){
 const title=String(list?.name||'').trim();
 if(!title||title.length>60)throw Error('Enter a list name (up to 60 characters).');
 if(!['private','family','selected'].includes(list.visibility))throw Error('Choose who can see the list.');
 if(list.visibility==='selected'&&(!Array.isArray(list.allowedIds)||!list.allowedIds.length||list.allowedIds.some(id=>!memberIds.has(id))))throw Error('Choose who can see the list.');
 return true;
}

export function createTaskList(data,{id,name,icon='1F4CB',ownerId,visibility='family',allowedIds=[],memberIds}){
 const list={id,name:String(name||'').trim().slice(0,60),he:String(name||'').trim().slice(0,60),icon,ownerId,visibility,allowedIds:visibility==='selected'?allowedIds:[],createdAt:new Date().toISOString()};
 validateTaskList(list,new Set(memberIds||(data.members||[]).map(m=>m.id)));
 data.taskLists=[...(data.taskLists||[]),list];
 return list;
}

// Ensure the collection exists. For the local sample family, add a few illustrative lists once.
export function upgradeTaskLists(data,{demo=false}={}){
 if(Array.isArray(data.taskLists))return data;
 data.taskLists=[];
 if(!demo)return data;
 const parent=(data.members||[]).find(m=>m.role==='parent')?.id||'daniel',other=(data.members||[]).find(m=>m.role==='parent'&&m.id!==parent)?.id;
 const lists=[{id:'list-home',name:'Home chores',he:'מטלות הבית',icon:'1F9F9',ownerId:parent,visibility:'family',allowedIds:[]},
  ...(other?[{id:'list-party',name:'Noa’s birthday party',he:'מסיבת יום ההולדת של נועה',icon:'1F389',ownerId:parent,visibility:'selected',allowedIds:[other]}]:[]),
  {id:'list-moving',name:'Moving boxes',he:'ארגזי מעבר',icon:'1F4E6',ownerId:parent,visibility:'private',allowedIds:[]}].map(l=>({...l,createdAt:'2026-11-01T09:00:00Z'}));
 data.taskLists=lists;
 const home=lists[0];
 for(const t of data.tasks||[])if(!t.routine&&!t.listId&&t.visibility==='family')applyListAudience(t,home);
 return data;
}
