// The Telegram daily report and chat formatting: tidy sections, privacy, high priority first, Hebrew right-to-left.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayReport,chatFormat} from '../app/cloud/telegram-format.mjs';
import {digestDue} from '../app/cloud/reminders.mjs';

const date='2026-11-06',yesterday='2026-11-05';
const members=[{id:'mom',name:'Mom',he:'אמא',role:'parent'},{id:'dad',name:'Dad',he:'אבא',role:'parent'},{id:'kid',name:'Noa',he:'נועה',role:'child'}];
const fam={visibility:'family',allowedIds:[]};
const visible={
 events:[{id:'e1',title:'Dentist',date,time:'16:00',memberIds:['mom','kid'],ownerId:'mom',...fam},{id:'e2',title:'Family dinner',date,time:'19:00',memberIds:['mom','dad','kid'],ownerId:'mom',...fam},{id:'e3',title:'Dad only',date,time:'10:00',memberIds:['dad'],ownerId:'dad',...fam}],
 tasks:[{id:'t1',title:'Laundry',date,time:'18:00',memberId:'mom',ownerId:'mom',repeat:'once',...fam},
  {id:'t2',title:'Pay electricity',date,memberId:'mom',ownerId:'mom',repeat:'once',priority:'high',...fam},
  {id:'t3',title:'Water plants',date,time:'08:00',memberId:'mom',ownerId:'mom',repeat:'once',completions:{[date]:{state:'done',actorId:'mom'}},...fam},
  {id:'t4',title:'Call the bank',date:yesterday,memberId:'mom',ownerId:'mom',repeat:'once',...fam},
  {id:'t5',title:'Fix the shelf',date:'',memberId:'mom',ownerId:'mom',repeat:'once',...fam},
  {id:'t6',title:'Brush teeth',date,memberId:'kid',ownerId:'mom',repeat:'daily',routine:true,parentConfirm:true,completions:{[date]:{state:'pending',actorId:'kid'}},...fam}],
 shoppingLists:[{id:'week',name:'This week',he:'השבוע',status:'active',ownerId:'mom',...fam}],
 shopping:[{id:'s1',title:'Milk',listId:'week',done:false,...fam},{id:'s2',title:'Eggs',listId:'week',done:true,...fam}],
 preferences:{}
};

test('the daily report has clear sections in a fixed order, high priority first, empty sections left out', ()=>{
 const {text,openTasks}=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'en',members,greeting:true});
 assert.match(text,/Good morning, Mom!/);
 const order=['📅 Calendar','✅ To do today','⏰ Overdue','📋 Anytime','🛒 Shopping','⏳ Waiting for your approval'].map(h=>text.indexOf(h));
 assert.ok(order.every(i=>i>0),'every section is present');assert.deepEqual([...order].sort((a,b)=>a-b),order,'sections in order');
 assert.match(text,/16:00<\/b> · Dentist · Noa/);assert.match(text,/19:00<\/b> · Family dinner · everyone/);assert.doesNotMatch(text,/Dad only/,'only my events');
 assert.ok(text.indexOf('⭐ ')<text.indexOf('Laundry'),'high priority first');assert.match(text,/Water plants ✓/);assert.match(text,/1\/3 done/);
 assert.match(text,/Call the bank/);assert.match(text,/Fix the shelf/);assert.match(text,/This week · 1 left/);assert.match(text,/Milk/);assert.doesNotMatch(text,/Eggs/);
 assert.match(text,/Noa · Brush teeth/);
 assert.deepEqual(openTasks.map(t=>t.id),['t2','t1'],'buttons are offered for open tasks, important first');
});

test('a day where everything is done still lists it, with ✓', ()=>{
 const v={...visible,events:[],shopping:[],tasks:[{id:'d',title:'Water plants',date,time:'08:00',memberId:'mom',ownerId:'mom',repeat:'once',completions:{[date]:{state:'done',actorId:'mom'}},...fam}]};
 const r=dayReport(v,{memberId:'mom',role:'parent',date,lang:'en',members});assert.equal(r.empty,false);assert.match(r.text,/Water plants ✓/);assert.match(r.text,/1\/1 done/);
});

test('children see no approvals; an empty day says so; Hebrew lines are right-to-left', ()=>{
 assert.doesNotMatch(dayReport(visible,{memberId:'kid',role:'child',date,lang:'en',members}).text,/Waiting for your approval/);
 const empty=dayReport({tasks:[],events:[],shopping:[],shoppingLists:[],preferences:{}},{memberId:'mom',role:'parent',date,lang:'en',members});assert.equal(empty.empty,true);assert.match(empty.text,/Nothing on your plate today/);
 const he=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'he',members,greeting:true}).text;
 assert.match(he,/בוקר טוב, אמא!/);assert.match(he,/‏• /,'Hebrew bullets start with a right-to-left mark');assert.match(he,/📅 ביומן/);
});

test('AI answers in Markdown become tidy chat text; HTML in the answer is escaped', ()=>{
 const out=chatFormat('## This week\n- **Mon** 16:00 · Dentist\n* Tue · Swim <script>\n\n\n\nDone.','en');
 assert.match(out,/<b>This week<\/b>/);assert.match(out,/• <b>Mon<\/b> 16:00 · Dentist/);assert.match(out,/• Tue · Swim &lt;script&gt;/);assert.doesNotMatch(out,/\n\n\n/);
});

test('the daily summary is sent at the chosen time even inside quiet hours', ()=>{
 const v={profiles:{mom:{notificationPrefs:{digest:'06:30',quietStart:'22:00',quietEnd:'07:00'}}},tasks:[],events:[]};
 assert.ok(digestDue(v,'mom',{date,time:'06:31'}),'quiet hours do not block a summary the person chose');
 assert.equal(digestDue(v,'mom',{date,time:'06:29'}),null);assert.equal(digestDue(v,'mom',{date,time:'07:40'}),null,'only within the hour after the chosen time');
});
