// More AI abilities, shared by Ask AI (web) and the Telegram bot:
// change, complete, reopen and delete EXISTING records; home journal notes; manual expenses.
// Like every AI proposal, these are previews until the person presses Apply, and the household
// server re-checks every change (owner-only deletes, edit permissions, completion rules).
import {completeTask,completionState,occursOn} from '../app/src/domain.js';
import {HOME_TIMEZONE} from './home-config.mjs';
import {applyListAudience,canAccessList} from './task-lists.mjs';

const text=(value,max=600)=>typeof value==='string'?value.trim().slice(0,max):'';
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00Z'))&&new Date(value+'T12:00Z').toISOString().slice(0,10)===value;
const timeValid=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const S={type:'string'};
export const UNITS=['items','kg','g','liters','bottles','bags','packs','loaves'];
export const EXPENSE_CATEGORIES=['Groceries','Utilities','Cleaning','School','Health','Other'];
const COLLECTION={task:'tasks',event:'events',note:'notes',shopping:'shopping'};
export const homeToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE});
// The date a task's completion is read from: today, or for an "anytime" task its last completion (it stays done once done).
export function taskStateDate(task,today=homeToday()){if(task.date)return today;const last=Object.entries(task.completions||{}).filter(([,c])=>c?.state&&c.state!=='open').sort(([x],[y])=>x.localeCompare(y)).pop();return last?last[0]:today}
export const taskStateNow=(task,today=homeToday())=>task.date&&!occursOn(task,today)?undefined:completionState(task,taskStateDate(task,today));
const homeTime=()=>new Date().toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const uid=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);

export const extraAITools=[
 {name:'prepare_changes',description:'Prepare changes to EXISTING records the current user explicitly asks for: complete or reopen today\'s tasks; check off or un-check shopping items (complete / reopen); edit fields (title, date, time, note, people, duration, quantity and unit, task list, subtasks); or delete. Use the exact id and type of a record from the context. Delete only when the user clearly asks to delete, remove or cancel something. To make a task "anytime", set date to an empty string. This only previews; nothing is saved until Apply.',
  input_schema:{type:'object',properties:{changes:{type:'array',maxItems:30,items:{type:'object',properties:{
   id:S,type:{type:'string',enum:['task','event','note','shopping']},action:{type:'string',enum:['complete','reopen','update','delete']},
   title:S,date:{type:'string',description:'YYYY-MM-DD, or "" to make a task anytime'},time:{type:'string',description:'24-hour HH:mm, or "" for no time'},note:S,
   memberIds:{type:'array',items:S},durationMinutes:{type:'integer',minimum:5,maximum:1440},quantity:{type:'number',minimum:0.01},unit:{type:'string',enum:UNITS},
   listId:{type:'string',description:'Task list id for a task, or shopping list id for a shopping item'},addSubtasks:{type:'array',items:S,maxItems:20},completeSubtasks:{type:'array',items:S,maxItems:20,description:'Subtask ids or titles to check off'}
  },required:['id','type','action'],additionalProperties:false}}},required:['changes'],additionalProperties:false}},
 {name:'prepare_notes',description:'Prepare new home journal notes the user asks to write down or remember (a moment, an update, something to keep). Title is short; text holds the details.',
  input_schema:{type:'object',properties:{notes:{type:'array',maxItems:10,items:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:160},text:S,date:{type:'string',description:'YYYY-MM-DD, default today'},time:S,memberIds:{type:'array',items:S,description:'Who the note is about'}},required:['title'],additionalProperties:false}}},required:['notes'],additionalProperties:false}},
 {name:'prepare_expenses',description:'Prepare manually recorded household expenses an adult explicitly asks to add. Amount is in the household currency. Not for children.',
  input_schema:{type:'object',properties:{expenses:{type:'array',maxItems:20,items:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:160},amount:{type:'number',minimum:0.01},date:{type:'string',description:'YYYY-MM-DD, default today'},category:{type:'string',enum:EXPENSE_CATEGORIES}},required:['title','amount'],additionalProperties:false}}},required:['expenses'],additionalProperties:false}}
];

// Extra properties for prepare_tasks: anytime tasks, task lists, subtasks and (for parents) kids' routines.
export const taskExtraProperties={
 anytime:{type:'boolean',description:'True for a task with no date ("anytime")'},
 listId:{type:'string',description:'Task list id from context.taskLists'},
 shoppingListId:{type:'string',description:'Makes the task a shopping trip for this shopping list id (e.g. "Buy groceries")'},
 subtasks:{type:'array',items:S,maxItems:20},
 routine:{type:'boolean',description:'Parents only: a repeating routine for a child, with XP'},
 weekdays:{type:'array',items:{type:'integer',minimum:0,maximum:6},description:'Routine days, 0=Sunday'},
 xp:{type:'integer',minimum:0,maximum:100},
 parentConfirm:{type:'boolean',description:'Routine completion needs a parent\'s approval'}
};

// ---- Turning tool calls into plan actions (validated against the person's own context) ----
export function normalizeExtra(block,context,actions,{people,icon}){
 const input=block.input||{};
 if(block.name==='prepare_changes'){
  if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>30)throw new Error('Change up to 30 items at a time.');
  for(const change of input.changes){
   const record=context.records.find(r=>r.id===change.id&&r.type===change.type);if(!record||!COLLECTION[change.type])throw new Error('One of the items to change is not available to you.');
   const verb=['complete','reopen','update','delete'].includes(change.action)?change.action:null;if(!verb)throw new Error('A requested change is not supported.');
   if((verb==='complete'||verb==='reopen')&&!['task','shopping'].includes(change.type))throw new Error('Only tasks and shopping items can be completed.');
   const action={kind:'record.'+verb,type:change.type,collection:COLLECTION[change.type],id:record.id,title:record.title||record.he||'—',icon:icon(record.icon,record.title||'','bayit-activities-notebook')};
   if(verb==='update'){
    const fields={};
    if(change.title!==undefined){const t=text(change.title,160);if(!t)throw new Error('A new title is empty.');fields.title=t}
    if(change.date!==undefined){const d=text(change.date,10);if(d?!dateValid(d):change.type!=='task')throw new Error('A new date is invalid.');fields.date=d}
    if(change.time!==undefined){const t=text(change.time,5);if(t&&!timeValid(t)||!t&&change.type==='event')throw new Error('A new time is invalid.');fields.time=t}
    if(change.note!==undefined)fields.note=text(change.note);
    if(change.memberIds!==undefined){if(!['task','event','note'].includes(change.type))throw new Error('People can be changed on tasks, events and notes.');fields.memberIds=people(change.memberIds);if(change.type==='task'&&fields.memberIds.length!==1)throw new Error('A task belongs to one person. Create a copy for each person instead.');if(context.actor.role==='child'&&change.type==='task'&&fields.memberIds[0]!==context.actorId)throw new Error('Children can assign tasks only to themselves.')}
    if(change.durationMinutes!==undefined){if(change.type!=='event')throw new Error('Only events have a duration.');fields.durationMinutes=Math.max(5,Math.min(1440,Math.round(change.durationMinutes)))}
    if(change.quantity!==undefined||change.unit!==undefined){if(change.type!=='shopping')throw new Error('Only shopping items have a quantity.');const q=Number(change.quantity??record.quantityValue??1);if(!(q>0&&q<=100000))throw new Error('A quantity is invalid.');fields.quantity=q;fields.unit=UNITS.includes(change.unit)?change.unit:(record.unit||'items')}
    if(change.listId!==undefined){const id=text(change.listId,120);if(change.type==='task'?!(id===''||context.taskLists.some(l=>l.id===id)):change.type==='shopping'?!context.lists.includes(id):true)throw new Error('Choose a list from your lists.');fields.listId=id}
    if(change.addSubtasks?.length||change.completeSubtasks?.length){if(change.type!=='task')throw new Error('Only tasks have subtasks.');fields.addSubtasks=(change.addSubtasks||[]).map(s=>text(s,160)).filter(Boolean).slice(0,20);fields.completeSubtasks=(change.completeSubtasks||[]).map(s=>text(s,160)).filter(Boolean).slice(0,20)}
    if(!Object.keys(fields).length)throw new Error('Say what should change.');
    action.fields=fields;
   }
   actions.push(action);
  }
  return true;
 }
 if(block.name==='prepare_notes'){
  if(!Array.isArray(input.notes)||!input.notes.length||input.notes.length>10)throw new Error('Write up to 10 notes at a time.');
  for(const note of input.notes){const title=text(note.title,160),date=text(note.date,10)||context.today,time=text(note.time,5);if(!title||!dateValid(date)||time&&!timeValid(time))throw new Error('A note needs a title and a valid date.');actions.push({kind:'note.create',title,text:text(note.text,2000),date,time,memberIds:note.memberIds?.length?people(note.memberIds):[],icon:icon(undefined,title,'bayit-activities-notebook')})}
  return true;
 }
 if(block.name==='prepare_expenses'){
  if(context.actor.role==='child')throw new Error('Expenses are available to adult accounts.');
  if(!Array.isArray(input.expenses)||!input.expenses.length||input.expenses.length>20)throw new Error('Add up to 20 expenses at a time.');
  for(const e of input.expenses){const title=text(e.title,160),amount=Math.round(Number(e.amount)*100)/100,date=text(e.date,10)||context.today;if(!title||!(amount>0&&amount<=1000000)||!dateValid(date))throw new Error('An expense needs a title, a positive amount and a valid date.');actions.push({kind:'expense.create',title,amount,date,category:EXPENSE_CATEGORIES.includes(e.category)?e.category:'Other',icon:icon(undefined,title,'bayit-activities-notebook')})}
  return true;
 }
 return false;
}

// ---- Applying plan actions to the person's own (visible) copy of the household ----
// Returns true when the action kind is handled here. `prepared` collects {collection,before,after,...} for the receipt.
export function applyExtra(action,data,{actorId,members,plan,common,prepared,nextId}){
 const actor=members.find(m=>m.id===actorId),parent=actor?.role==='parent';
 if(action.kind==='note.create'){
  const note={...common,id:nextId(),title:action.title,he:action.title,text:action.text,textHe:action.text,date:action.date,time:action.time||'',memberId:action.memberIds?.[0]||actorId,memberIds:action.memberIds||[],editPolicy:'owner',editorIds:[]};
  data.notes=data.notes||[];data.notes.push(note);prepared.push({collection:'notes',before:null,after:note});return true;
 }
 if(action.kind==='expense.create'){
  if(actor?.role==='child')throw new Error('Expenses are available to adult accounts.');
  if(!(action.amount>0))throw new Error('An expense amount is invalid.');
  const expense={...common,id:nextId(),title:action.title,he:action.title,amount:action.amount,date:action.date,category:EXPENSE_CATEGORIES.includes(action.category)?action.category:'Other',memberId:actorId};
  data.expenses=data.expenses||[];data.expenses.push(expense);prepared.push({collection:'expenses',before:null,after:expense});return true;
 }
 if(!/^record\./.test(action.kind))return false;
 const list=data[action.collection]||[],index=list.findIndex(r=>r.id===action.id),record=list[index];
 if(!record)throw new Error('“'+action.title+'” is no longer available.');
 const before=structuredClone(record);
 if(action.kind==='record.delete'){
  if(record.ownerId!==actorId&&!(action.collection==='shopping'&&record.visibility==='family'))throw new Error('Only the owner can delete “'+action.title+'”.');
  list.splice(index,1);prepared.push({collection:action.collection,before,after:null,deleted:true});return true;
 }
 if(action.kind==='record.complete'||action.kind==='record.reopen'){
  const want=action.kind==='record.complete';
  if(action.collection==='shopping'){if(!!record.done===want)return true;record.done=want;record.boughtAt=want?new Date().toISOString():null;record.boughtBy=want?actorId:null;prepared.push({collection:'shopping',before,after:structuredClone(record)});return true}
  const today=homeToday(),date=taskStateDate(record,today);
  if(record.date&&!occursOn(record,date))throw new Error('“'+action.title+'” is not scheduled for today. Only today’s tasks can be completed.');
  if(!parent&&record.memberId!==actorId)throw new Error('“'+action.title+'” belongs to someone else.');
  const state=completionState(record,date);if(want?state==='done':state!=='done')return true;
  if(!want&&state==='pending')return true;
  if(date!==today)throw new Error('“'+action.title+'” was completed on an earlier day and can no longer be reopened.');
  completeTask(record,{date,actorId,actorRole:parent?'parent':'child',time:homeTime(),instant:new Date().toISOString()});
  prepared.push({collection:'tasks',before,after:structuredClone(record),completion:date});return true;
 }
 // record.update
 const f=action.fields||{};
 if(f.title!==undefined){record.title=f.title;record.he=f.title}
 if(f.date!==undefined)record.date=f.date;
 if(f.time!==undefined)record.time=f.time;
 if(f.note!==undefined){if(action.collection==='notes'){record.text=f.note;record.textHe=f.note}else{record.note=f.note;record.noteHe=f.note}}
 if(f.memberIds){if(action.collection==='tasks')record.memberId=f.memberIds[0];else{record.memberIds=f.memberIds;if(action.collection==='notes')record.memberId=f.memberIds[0]||record.memberId}}
 if(f.durationMinutes!==undefined)record.durationMinutes=f.durationMinutes;
 if(f.quantity!==undefined){record.quantityValue=f.quantity;record.unit=f.unit;record.quantity=f.quantity+' '+f.unit}
 if(f.listId!==undefined){
  if(action.collection==='tasks'){const target=f.listId?(data.taskLists||[]).find(l=>l.id===f.listId):null;if(f.listId&&(!target||!canAccessList(target,actorId)))throw new Error('This task list is unavailable.');if(record.ownerId!==actorId&&f.listId!==(record.listId||''))throw new Error('Only the owner moves “'+action.title+'” to another list.');applyListAudience(record,target)}
  else{const target=(data.shoppingLists||[]).find(l=>l.id===f.listId);if(!target||!canAccessList(target,actorId)||target.status!=='active')throw new Error('This shopping list is unavailable.');record.listId=target.id;if(record.ownerId===actorId){record.visibility=target.visibility;record.allowedIds=target.allowedIds||[]}}
 }
 if(f.addSubtasks?.length||f.completeSubtasks?.length){
  const subs=[...(record.subtasks||[])];for(const t of f.addSubtasks||[])subs.push({id:uid(),title:t,done:false});
  for(const key of f.completeSubtasks||[]){const s=subs.find(s=>s.id===key||String(s.title).toLocaleLowerCase()===key.toLocaleLowerCase());if(s)s.done=true}
  record.subtasks=subs;
 }
 prepared.push({collection:action.collection,before,after:structuredClone(record)});return true;
}

// Undo for the receipt changes made here. Returns 'restored' | 'preserved' | null (not handled).
export function undoExtra(change,data,actorId){
 const list=data[change.collection]=data[change.collection]||[];
 if(change.deleted){if(list.some(r=>r.id===change.before.id))return 'preserved';list.push(change.before);return 'restored'}
 if(change.completion){
  // The server stamps its own completion time, so compare the completion state, not the whole record.
  const index=list.findIndex(r=>r.id===change.after.id);if(index<0)return 'preserved';
  const role=(data.members||[]).find(m=>m.id===actorId)?.role,record=list[index],now=completionState(record,change.completion);
  if(now===completionState(change.before,change.completion))return 'restored';if(now!==completionState(change.after,change.completion))return 'preserved';
  completeTask(record,{date:change.completion,actorId,actorRole:role==='parent'?'parent':'child',time:homeTime(),instant:new Date().toISOString()});return 'restored';
 }
 return null;
}

// Short, human-readable description of an action for previews (Telegram and Ask AI).
export function describeAction(a,lang='en',money=v=>'\u2066₪'+v+'\u2069'){
 const he=lang==='he',T=(en,h)=>he?h:en;
 const what={task:T('task','משימה'),event:T('event','אירוע'),note:T('note','הערה'),shopping:T('item','פריט')}[a.type]||'';
 if(a.kind==='record.complete')return (a.type==='shopping'?T('Check off ','סימון כנקנה: '):T('Mark done: ','סימון כבוצע: '))+a.title;
 if(a.kind==='record.reopen')return (a.type==='shopping'?T('Back on the list: ','חזרה לרשימה: '):T('Reopen: ','פתיחה מחדש: '))+a.title;
 if(a.kind==='record.delete')return T('Delete '+what+': ','מחיקת '+what+': ')+a.title;
 if(a.kind==='record.update'){const f=a.fields||{},parts=[];if(f.title)parts.push('“'+f.title+'”');if(f.date!==undefined)parts.push(f.date||T('anytime','בכל זמן'));if(f.time!==undefined)parts.push(f.time||T('no time','ללא שעה'));if(f.durationMinutes)parts.push(f.durationMinutes+T(' min',' דק׳'));if(f.quantity!==undefined)parts.push(f.quantity+' '+f.unit);if(f.listId!==undefined)parts.push(T('another list','רשימה אחרת'));if(f.memberIds)parts.push(T('people','אנשים'));if(f.note!==undefined)parts.push(T('note','הערה'));if(f.addSubtasks?.length)parts.push('+'+f.addSubtasks.length+T(' subtasks',' תתי־משימות'));if(f.completeSubtasks?.length)parts.push('✓'+f.completeSubtasks.length+T(' subtasks',' תתי־משימות'));return T('Change ','שינוי ')+what+': '+a.title+(parts.length?' → '+parts.join(', '):'')}
 if(a.kind==='note.create')return T('New note: ','הערה חדשה: ')+a.title+(a.date?' — '+a.date:'');
 if(a.kind==='expense.create')return T('Expense: ','הוצאה: ')+a.title+' — '+money(a.amount)+' · '+a.date;
 return null;
}
