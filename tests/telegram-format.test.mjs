// The Telegram daily report and chat formatting: tidy sections, privacy, high priority first, Hebrew right-to-left.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayReport,chatFormat} from '../app/cloud/telegram-format.mjs';
import {digestDue} from '../app/cloud/reminders.mjs';

const date='2026-11-06',yesterday='2026-11-05';
const members=[{id:'mom',name:'Mom',he:'אמא',role:'parent'},{id:'dad',name:'Dad',he:'אבא',role:'parent'},{id:'kid',name:'Noa',he:'נועה',role:'child'}];
const fam={visibility:'family',allowedIds:[]};
// Without direction marks and isolates (Telegram tidy-up 2026-11-12 adds them to every line, in English too).
const plain=s=>s.replace(/[\u200e\u200f\u2068\u2069]/g,'');
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

test('the daily report has clear sections in a fixed order, each a box; no shopping list on a day with no shop', ()=>{
 const raw=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'en',members,greeting:true}),text=plain(raw.text),openTasks=raw.openTasks;
 assert.match(text,/^☀️ <b>Good morning, Mom<\/b>\n<i>Friday 6 November · 2 events · 2 to do<\/i>/);
 const order=['📅 <b>Calendar</b>','✅ <b>To do</b>','⏰ <b>Still open</b>','📋 <b>Anytime</b>','⏳ <b>Waiting for your OK</b>'].map(h=>text.indexOf(h));
 assert.ok(order.every(i=>i>0),'every section is present');assert.deepEqual([...order].sort((a,b)=>a-b),order,'sections in order');
 assert.equal((text.match(/<blockquote>/g)||[]).length,5,'one box per section');
 assert.match(text,/<code>16:00<\/code>  <b>Dentist<\/b>  <i>with Noa<\/i>/);assert.match(text,/<code>19:00<\/code>  <b>Family dinner<\/b>  <i>everyone<\/i>/);assert.doesNotMatch(text,/Dad only/,'only my events');
 assert.match(text,/⭐ <b>Pay electricity<\/b>  <i>high priority<\/i>/);assert.match(text,/<s>✓ Water plants<\/s>/);assert.match(text,/1 of 3 done/);
 assert.match(text,/<b>Call the bank<\/b>  <i>since\u00a0Thursday<\/i>/,'a date never breaks across lines');assert.match(text,/Fix the shelf/);
 assert.doesNotMatch(text,/Shopping|Milk|This week/,'a list with no planned shop is not in the morning message (owner, 2026-11-12)');
 assert.match(text,/Noa  ·  <b>Brush teeth<\/b>/);
 assert.deepEqual(openTasks.map(t=>t.id),['t1','t2'],'buttons follow the box: timed first, then by priority');
});

test('a day where everything is done still lists it, with ✓', ()=>{
 const v={...visible,events:[],shopping:[],tasks:[{id:'d',title:'Water plants',date,time:'08:00',memberId:'mom',ownerId:'mom',repeat:'once',completions:{[date]:{state:'done',actorId:'mom'}},...fam}]};
 const r=dayReport(v,{memberId:'mom',role:'parent',date,lang:'en',members});assert.equal(r.empty,false);assert.match(plain(r.text),/<s>✓ Water plants<\/s>/);assert.match(r.text,/1 of 1 done/);
});

test('children see no approvals; an empty day says so; Hebrew lines are right-to-left', ()=>{
 assert.doesNotMatch(dayReport(visible,{memberId:'kid',role:'child',date,lang:'en',members}).text,/Waiting for your approval/);
 const empty=dayReport({tasks:[],events:[],shopping:[],shoppingLists:[],preferences:{}},{memberId:'mom',role:'parent',date,lang:'en',members});assert.equal(empty.empty,true);assert.match(empty.text,/Nothing on your plate today/);
 const he=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'he',members,greeting:true}).text;
 assert.match(he,/בוקר טוב, אמא/);assert.match(he,/<blockquote>‏<code>16:00/,'a Hebrew line in a box starts with a right-to-left mark');assert.match(he,/📅 <b>ביומן<\/b>/);
 for(const l of he.split('\n').filter(Boolean))assert.match(l,/^(<blockquote>)?‏/,'every Hebrew line: '+l);
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

// Telegram message audit 2026-11-08: one anatomy, Hebrew right-to-left on every line, dates as words.
import {rtl,card,notice,alertCard,localizeDates,dateRange,quantityText,plural} from '../app/cloud/telegram-format.mjs';
test('Hebrew lines all start right-to-left and a /command keeps its slash in front', ()=>{
 const out=rtl('he','<b>Bayit בטלגרם</b>\n\n/today – היום\n<i>/tasks לסימון</i>');
 for(const l of out.split('\n').filter(Boolean))assert.ok(l.startsWith('‏'),'every line starts with a right-to-left mark: '+l);
 assert.match(out,/‏‎\/today/);assert.match(out,/‏<i>‎\/tasks/);assert.equal(rtl('he',out),out,'applying it twice changes nothing');assert.equal(rtl('en','/today'),'‎/today','English lines start left-to-right too');
 const en=rtl('en','<b>To do</b>\n<blockquote>כביסה 1/2\nמשכורת ⁦₪9,000⁩</blockquote>');assert.equal(en,'‎<b>To do</b>\n<blockquote>‎⁨כביסה⁩ 1/2\n‎⁨משכורת⁩ ⁦₪9,000⁩</blockquote>','Hebrew is isolated, money keeps its own isolate, a box line starts inside the box');assert.equal(rtl('en',en),en,'twice changes nothing');
});
test('cards have a bold title, a context line, sections and an italic hint; notices lead with an icon', ()=>{
 assert.equal(plain(card('en',{icon:'🛒',title:'This week',context:'3 left',blocks:['• Milk'],hint:'Tap to check off.'})),'🛒 <b>This week</b>\n<i>3 left</i>\n\n<blockquote>Milk</blockquote>\n\n<i>Tap to check off.</i>');
 assert.equal(plain(card('en',{icon:'🔔',title:'Bins',blocks:['<blockquote>x</blockquote>']})),'🔔 <b>Bins</b>\n<blockquote>x</blockquote>','a box right under the title');
 assert.equal(plain(notice('en','🔗','Not linked.','Open Settings.')),'🔗 Not linked.\n\n<i>Open Settings.</i>');
});
test('dates read as words, ranges collapse, quantities and counts use the person’s language', ()=>{
 assert.equal(localizeDates('Reported period ends 2026-11-30.','en'),'Reported period ends 30\u00a0Nov\u00a02026.');assert.match(localizeDates('2026-11-02–2026-11-08 · x','he'),/^2–8 בנוב׳ · x$/);
 assert.match(dateRange('2026-12-28','2027-01-03','en'),/2026.*2027/);
 assert.equal(quantityText('12 items',undefined,'he'),'12 יח׳');assert.equal(quantityText('12 items',undefined,'en'),'×12');assert.equal(quantityText(1,'items','en'),'');assert.equal(quantityText(2,'kg','he'),'2 ק״ג');
 assert.equal(plural('he',1,'change','changes','שינוי אחד','שינויים'),'שינוי אחד');assert.equal(plural('he',3,'change','changes','שינוי אחד','שינויים'),'3 שינויים');assert.equal(plural('en',1,'change','changes','',''),'1 change');
});
test('finance and insurance alerts become a titled card with one line per fact', ()=>{
 const weekly=alertCard('en',{icon:'📈',title:'Shared · Your weekly money summary',detail:'2026-11-02–2026-11-08 · Income ₪0 · Spending ₪110'});
 assert.equal(plain(weekly),'📈 <b>Shared · Your weekly money summary</b>\n<i>'+dateRange('2026-11-02','2026-11-08','en')+'</i>\n\n<blockquote>Income ₪0\nSpending ₪110</blockquote>');
 assert.match(plain(alertCard('en',{icon:'💰',title:'Limit <x>',detail:'Recorded ₪90 of ₪100. Remaining: ₪10'})),/<b>Limit &lt;x&gt;<\/b>\n<blockquote>Recorded ₪90 of ₪100\nRemaining: ₪10<\/blockquote>$/);
});
test('AI tables, nested lists, links and rules read well in a chat', ()=>{
 const out=chatFormat('| Day | Event |\n|---|---|\n| Mon | Dentist |\n---\n- a\n  - b\nSee [site](https://x.test/?a=1&b=2)','en');
 assert.match(plain(out),/<b>Day · Event<\/b>\n• Mon · Dentist\n• a\n   ◦ b/);assert.match(out,/<a href="https:\/\/x.test\/\?a=1&amp;b=2">site<\/a>/);assert.doesNotMatch(out,/---|\|/);
});
