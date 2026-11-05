// The AI assistant's abilities on existing records (Ask AI and Telegram): complete, reopen, edit, move, delete,
// notes, expenses, and richer new tasks. Every plan goes through the same path as the bot:
// the person's visible copy → applyAIPlan → diffState → the server's applyChanges (permission checks).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAITools,applyAIPlan,undoAIPlan,filterAIContext,aiTools} from '../shared/ai-contract.mjs';
import {homeToday,taskStateNow} from '../shared/ai-actions.mjs';
import {blankState,visibleState,diffState,applyChanges} from '../app/cloud/state.mjs';
import catalog from '../design-system/bayit-icons.json' with {type:'json'};

const today=homeToday(),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const mom={id:'mom',name:'Mom',he:'אמא',role:'parent'},dad={id:'dad',name:'Dad',he:'אבא',role:'parent'},kid={id:'kid',name:'Kid',he:'ילד',role:'child'};
const fam=(owner,extra={})=>({ownerId:owner,visibility:'family',allowedIds:[],...extra});
function household(){
 const s=blankState('h1','Test',mom);s.members=[mom,dad,kid];for(const m of [dad,kid])s.profiles[m.id]={name:m.name,he:m.he,xp:0};
 s.tasks=[{id:'t-trash',title:'Take out the trash',he:'Take out the trash',date:today,time:'19:00',memberId:'mom',repeat:'once',icon:'1F4CB',done:false,xp:0,...fam('mom')},
  {id:'t-any',title:'Fix the shelf',he:'Fix the shelf',date:'',memberId:'mom',repeat:'once',icon:'1F4CB',done:false,xp:0,...fam('mom')},
  {id:'t-dad',title:'Call the plumber',he:'Call the plumber',date:today,memberId:'dad',repeat:'once',icon:'1F4CB',done:false,xp:0,...fam('dad')},
  {id:'t-dadprivate',title:'Dad secret',he:'Dad secret',date:today,memberId:'dad',repeat:'once',icon:'1F4CB',done:false,xp:0,ownerId:'dad',visibility:'private',allowedIds:[]}];
 s.events=[{id:'e-dentist',title:'Dentist',he:'Dentist',date:tomorrow,time:'09:00',memberIds:['mom'],durationMinutes:60,icon:'1F4C5',color:'lilac',repeat:'once',editPolicy:'owner',editorIds:[],...fam('mom')},
  {id:'e-dad',title:'Dad meeting',he:'Dad meeting',date:tomorrow,time:'10:00',memberIds:['dad'],durationMinutes:60,icon:'1F4C5',color:'lilac',repeat:'once',editPolicy:'owner',editorIds:[],...fam('dad')}];
 s.notes=[{id:'n-1',title:'Old note',he:'Old note',text:'x',textHe:'x',date:today,memberId:'mom',editPolicy:'owner',editorIds:[],...fam('mom')}];
 s.shopping=[{id:'s-milk',title:'Milk',he:'Milk',listId:'week',quantity:'1 items',quantityValue:1,unit:'items',group:'Dairy',icon:'1F95B',done:false,memberId:'mom',...fam('mom')}];
 s.taskLists=[{id:'list-home',name:'Home chores',he:'Home chores',icon:'1F9F9',ownerId:'mom',visibility:'family',allowedIds:[],createdAt:'2026-11-01T00:00:00Z'}];
 return s;
}
const roleOf=(s,id)=>s.members.find(m=>m.id===id).role;
// What the bot does: change the visible copy, then let the server check and apply the diff.
function commit(state,actorId,mutate){const before=visibleState(state,actorId),after=structuredClone(before),result=mutate(after);return {state:applyChanges(state,diffState(before,after),actorId,roleOf(state,actorId)),result}}
function contextFor(state,actorId,scope='family'){const v=visibleState(state,actorId),records=[];for(const [c,type] of [['tasks','task'],['events','event'],['shopping','shopping'],['notes','note']])records.push(...v[c].map(r=>({...r,type,state:type==='task'?taskStateNow(r,today):undefined})));return filterAIContext({actorId,members:state.members,scope,records,today,shoppingLists:v.shoppingLists,taskLists:v.taskLists,money:{months:[]}})}
const plan=(state,actorId,blocks,scope)=>normalizeAITools(blocks.map(([name,input])=>({type:'tool_use',name,input})),contextFor(state,actorId,scope),catalog,crypto.randomUUID()).plan;
const run=(state,actorId,p)=>commit(state,actorId,data=>applyAIPlan(data,p,actorId,state.members,catalog));

test('the AI offers the new tools, with task lists, subtasks, anytime and routines on prepare_tasks', ()=>{
 const names=aiTools.map(t=>t.name);for(const n of ['prepare_changes','prepare_notes','prepare_expenses'])assert.ok(names.includes(n),n);
 const props=aiTools.find(t=>t.name==='prepare_tasks').input_schema.properties.tasks.items.properties;for(const k of ['anytime','listId','subtasks','shoppingListId','routine','weekdays','xp'])assert.ok(props[k],k);
 assert.ok(!contextFor(household(),'kid').money,'children never get spending data');assert.ok(contextFor(household(),'mom').money);
});

test('complete and reopen a task, including an anytime task; Undo reopens it; the server accepts each step', ()=>{
 let s=household();
 const p=plan(s,'mom',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'complete'},{id:'t-any',type:'task',action:'complete'}]}]]);
 let r=run(s,'mom',p);s=r.state;assert.equal(r.result.changes.length,2);
 assert.equal(taskStateNow(s.tasks.find(t=>t.id==='t-trash'),today),'done');assert.equal(taskStateNow(s.tasks.find(t=>t.id==='t-any'),today),'done');
 assert.ok(s.history.some(h=>h.taskId==='t-trash'),'the server records history for completions');
 s=commit(s,'mom',data=>undoAIPlan(data,p.id,'mom')).state;
 assert.equal(taskStateNow(s.tasks.find(t=>t.id==='t-trash'),today),'open');
 const again=plan(s,'mom',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'complete'}]}]]);s=run(s,'mom',again).state;
 const reopen=plan(s,'mom',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'reopen'}]}]]);s=run(s,'mom',reopen).state;
 assert.equal(taskStateNow(s.tasks.find(t=>t.id==='t-trash'),today),'open');
});

test('edit an event (move it), a task (anytime, list, subtasks) and a shopping item (quantity, check off)', ()=>{
 let s=household();
 const p=plan(s,'mom',[['prepare_changes',{changes:[
  {id:'e-dentist',type:'event',action:'update',date:today,time:'10:30',durationMinutes:30},
  {id:'t-trash',type:'task',action:'update',date:'',listId:'list-home',addSubtasks:['Recycling','Glass']},
  {id:'s-milk',type:'shopping',action:'update',quantity:2,unit:'liters'},
  {id:'s-milk',type:'shopping',action:'complete'}]}]]);
 s=run(s,'mom',p).state;
 const ev=s.events.find(e=>e.id==='e-dentist');assert.equal(ev.date,today);assert.equal(ev.time,'10:30');assert.equal(ev.durationMinutes,30);
 const t=s.tasks.find(t=>t.id==='t-trash');assert.equal(t.date,'');assert.equal(t.listId,'list-home');assert.deepEqual(t.subtasks.map(x=>x.title),['Recycling','Glass']);
 const milk=s.shopping.find(i=>i.id==='s-milk');assert.equal(milk.quantity,'2 liters');assert.equal(milk.done,true);assert.ok(s.purchases.length,'checking off records a purchase');
 const sub=plan(s,'mom',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'update',completeSubtasks:['recycling']}]}]]);s=run(s,'mom',sub).state;
 assert.equal(s.tasks.find(t=>t.id==='t-trash').subtasks.find(x=>x.title==='Recycling').done,true);
});

test('delete is owner-only, Undo restores it, and private records of others are invisible to the AI', ()=>{
 let s=household();
 const del=plan(s,'mom',[['prepare_changes',{changes:[{id:'e-dentist',type:'event',action:'delete'},{id:'n-1',type:'note',action:'delete'}]}]]);
 s=run(s,'mom',del).state;assert.ok(!s.events.some(e=>e.id==='e-dentist'));assert.ok(!s.notes.some(n=>n.id==='n-1'));
 s=commit(s,'mom',data=>undoAIPlan(data,del.id,'mom')).state;assert.ok(s.events.some(e=>e.id==='e-dentist'));assert.ok(s.notes.some(n=>n.id==='n-1'));
 const other=plan(s,'mom',[['prepare_changes',{changes:[{id:'e-dad',type:'event',action:'delete'}]}]]);
 assert.throws(()=>run(s,'mom',other),/Only the owner/);
 assert.throws(()=>plan(s,'mom',[['prepare_changes',{changes:[{id:'t-dadprivate',type:'task',action:'complete'}]}]]),/not available/);
 assert.throws(()=>plan(s,'kid',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'update',memberIds:['mom']}]}]]),/Children can assign tasks only to themselves|not available/);
});

test('a child cannot complete someone else’s task; a parent can complete a child’s task', ()=>{
 let s=household();s.tasks.push({id:'t-kid',title:'Brush teeth',he:'Brush teeth',date:today,memberId:'kid',repeat:'daily',routine:true,xp:10,parentConfirm:false,icon:'1FAA5',done:false,...fam('mom')});
 assert.throws(()=>run(s,'kid',plan(s,'kid',[['prepare_changes',{changes:[{id:'t-trash',type:'task',action:'complete'}]}]])),/someone else/);
 s=run(s,'mom',plan(s,'mom',[['prepare_changes',{changes:[{id:'t-kid',type:'task',action:'complete'}]}]])).state;
 assert.equal(taskStateNow(s.tasks.find(t=>t.id==='t-kid'),today),'done');assert.equal(s.profiles.kid.xp,10,'routine XP is awarded by the server');
});

test('notes, expenses (adults only) and rich new tasks: anytime, in a list, with subtasks, a shopping trip, a routine', ()=>{
 let s=household();
 const p=plan(s,'mom',[['prepare_notes',{notes:[{title:'Teacher',text:'Noa’s teacher is Dana'}]}],['prepare_expenses',{expenses:[{title:'Groceries',amount:120.5,category:'Groceries'}]}],
  ['prepare_tasks',{tasks:[{title:'Paint the fence',anytime:true,listId:'list-home',subtasks:['Buy paint','Sand']},{title:'Buy groceries',date:tomorrow,shoppingListId:'week'},{title:'Feed the cat',routine:true,memberIds:['kid'],weekdays:[0,2,4],xp:15}]}]]);
 s=run(s,'mom',p).state;
 assert.ok(s.notes.some(n=>n.title==='Teacher'&&n.text.includes('Dana')));
 const e=s.expenses.find(x=>x.title==='Groceries');assert.equal(e.amount,120.5);assert.equal(e.category,'Groceries');
 const paint=s.tasks.find(t=>t.title==='Paint the fence');assert.equal(paint.date,'');assert.equal(paint.listId,'list-home');assert.equal(paint.subtasks.length,2);
 assert.equal(s.tasks.find(t=>t.title==='Buy groceries').shoppingListId,'week');
 const cat=s.tasks.find(t=>t.title==='Feed the cat');assert.equal(cat.routine,true);assert.deepEqual(cat.weekdays,[0,2,4]);assert.equal(cat.xp,15);assert.equal(cat.memberId,'kid');
 assert.throws(()=>plan(s,'kid',[['prepare_expenses',{expenses:[{title:'Candy',amount:5}]}]]),/adult/);
 assert.throws(()=>plan(s,'kid',[['prepare_tasks',{tasks:[{title:'x',routine:true,memberIds:['kid']}]}]]),/parent/);
 s=commit(s,'mom',data=>undoAIPlan(data,p.id,'mom')).state;assert.ok(!s.notes.some(n=>n.title==='Teacher'));assert.ok(!s.expenses.some(x=>x.title==='Groceries'));
});
