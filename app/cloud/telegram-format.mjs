// Tidy, sectioned Telegram messages (HTML parse mode): a header, short sections with an icon and a title,
// one "•" line per item ("08:00 · Title · Who"), empty sections left out. Hebrew lines start with a
// right-to-left mark so bullets and times sit on the right. Every builder receives the recipient's own
// visibleState(), so a message can only mention what this person may already see in the app.
import {occursOn,completionState} from '../src/domain.js';
import {taskStateNow} from '../../shared/ai-actions.mjs';

export const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const L=(lang,en,he)=>lang==='he'?he:en;
const RLM='‏';
const titleOf=(r,lang)=>lang==='he'?r.he||r.title||r.name:r.title||r.name||r.he;
const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export const dayLabel=(date,lang,opts={weekday:'long',day:'numeric',month:'long'})=>new Date(date+'T12:00:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',opts);

export function line(lang,parts){return (lang==='he'?RLM:'')+'• '+parts.filter(Boolean).join(' · ')}
export function section(lang,icon,title,lines,extra){if(!lines.length)return '';return (lang==='he'?RLM:'')+'<b>'+icon+' '+esc(title)+'</b>\n'+lines.join('\n')+(extra?'\n'+(lang==='he'?RLM:'')+extra:'')}
const join=parts=>parts.filter(Boolean).join('\n\n');
const PRIORITY={high:0,medium:1,low:2};
const byPriorityThenTime=(a,b)=>(PRIORITY[a.priority]??1)-(PRIORITY[b.priority]??1)||(a.time||'99:99').localeCompare(b.time||'99:99');
const star=t=>t.priority==='high'?'⭐ ':'';

// The day for one person: calendar, to do (high priority first), overdue, anytime, shopping, approvals.
export function dayReport(visible,{memberId,role,date,lang,members=[],greeting=false}){
 const nameOf=id=>{const m=members.find(x=>x.id===id);return lang==='he'?m?.he||m?.name:m?.name};
 const me=members.find(m=>m.id===memberId),everyone=members.length;
 const events=(visible.events||[]).filter(e=>(e.memberIds||[]).includes(memberId)&&occursOn(e,date)).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
 const eventLines=events.slice(0,10).map(e=>{const others=(e.memberIds||[]).filter(id=>id!==memberId);return line(lang,[e.time&&'<b>'+esc(e.time)+'</b>',esc(titleOf(e,lang)),others.length&&e.memberIds.length<everyone?esc(others.map(nameOf).filter(Boolean).join(', ')):e.memberIds.length===everyone&&everyone>1?L(lang,'everyone','כולם'):'',e.visibility==='private'?'🔒':''])});
 const mine=(visible.tasks||[]).filter(t=>t.memberId===memberId);
 const today=mine.filter(t=>t.date&&occursOn(t,date)),open=today.filter(t=>['open','pending'].includes(completionState(t,date))).sort(byPriorityThenTime),doneCount=today.length-open.length;
 const todoLines=open.slice(0,12).map(t=>line(lang,[t.time?star(t)+'<b>'+esc(t.time)+'</b>':'',(t.time?'':star(t))+esc(titleOf(t,lang)),completionState(t,date)==='pending'?L(lang,'⏳ waiting for approval','⏳ ממתין לאישור'):'',t.subtasks?.length?t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length:'']));
 const done=today.filter(t=>completionState(t,date)==='done').sort(byPriorityThenTime);for(const t of done.slice(0,Math.max(0,12-todoLines.length)))todoLines.push(line(lang,[t.time?esc(t.time):'',esc(titleOf(t,lang))+' ✓']));
 // Overdue: earlier days in the last week that were never done (routines are daily habits, so they are not nagged here).
 const overdue=[];for(let i=1;i<=7;i++){const day=shift(date,-i);for(const t of mine)if(!t.routine&&t.date&&t.date<=day&&occursOn(t,day)&&completionState(t,day)==='open'&&(t.repeat||'once')==='once')overdue.push({t,day})}
 const overdueLines=overdue.slice(0,6).map(({t,day})=>line(lang,[star(t)+esc(titleOf(t,lang)),esc(dayLabel(day,lang,{weekday:'short',day:'numeric',month:'short'}))]));
 const anytime=mine.filter(t=>!t.date&&taskStateNow(t,date)==='open').sort(byPriorityThenTime),anytimeLines=anytime.slice(0,4).map(t=>line(lang,[star(t)+esc(titleOf(t,lang))]));
 const lists=(visible.shoppingLists||[]).filter(l=>l.status==='active'),chosen=visible.preferences?.activeShoppingListByUser?.[memberId],list=lists.find(l=>l.id===chosen)||lists[0];
 const left=list?(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id&&!i.done):[];
 const shoppingLine=left.length?[(lang==='he'?RLM:'')+esc(left.slice(0,8).map(i=>titleOf(i,lang)).join(', '))+(left.length>8?L(lang,' and '+(left.length-8)+' more',' ועוד '+(left.length-8)):'')]:[];
 const approvals=role==='parent'?(visible.tasks||[]).filter(t=>t.memberId!==memberId&&occursOn(t,date)&&completionState(t,date)==='pending'):[];
 const approvalLines=approvals.slice(0,6).map(t=>line(lang,[esc(nameOf(t.memberId)),esc(titleOf(t,lang))]));
 const header=greeting?(lang==='he'?RLM:'')+'☀️ <b>'+L(lang,'Good morning'+(me?', '+esc(nameOf(me.id)):'')+'!','בוקר טוב'+(me?', '+esc(nameOf(me.id)):'')+'!')+'</b>\n'+(lang==='he'?RLM:'')+esc(dayLabel(date,lang)):(lang==='he'?RLM:'')+'<b>'+L(lang,'Your day','היום שלכם')+'</b> · '+esc(dayLabel(date,lang));
 const body=join([
  section(lang,'📅',L(lang,'Calendar','ביומן'),eventLines,events.length>10?L(lang,'…and '+(events.length-10)+' more','…ועוד '+(events.length-10)):''),
  section(lang,'✅',L(lang,'To do today','לעשות היום')+(today.length?' · '+L(lang,doneCount+'/'+today.length+' done',doneCount+'/'+today.length+' בוצעו'):''),todoLines),
  section(lang,'⏰',L(lang,'Overdue','באיחור'),overdueLines),
  section(lang,'📋',L(lang,'Anytime','בכל זמן'),anytimeLines,anytime.length>4?L(lang,'…and '+(anytime.length-4)+' more','…ועוד '+(anytime.length-4)):''),
  list?section(lang,'🛒',L(lang,'Shopping','קניות')+' · '+titleOf(list,lang)+' · '+L(lang,left.length+' left','נותרו '+left.length),shoppingLine):'',
  section(lang,'⏳',L(lang,'Waiting for your approval','ממתין לאישורכם'),approvalLines)
 ]);
 const empty=!events.length&&!today.length&&!overdue.length&&!anytime.length&&!left.length&&!approvals.length;
 return {text:join([header,empty?(lang==='he'?RLM:'')+L(lang,'Nothing on your plate today. Enjoy! 🌿','אין לכם כלום היום. תהנו! 🌿'):body,(lang==='he'?RLM:'')+'<i>'+L(lang,'/tasks to tick things off · /week for the week ahead','‎/tasks לסימון משימות · ‎/week לשבוע הקרוב')+'</i>']),openTasks:open.filter(t=>completionState(t,date)==='open'),empty};
}

// AI answers come as plain text that may contain Markdown. Make it read well in a phone chat.
export function chatFormat(text,lang){
 const lines=esc(String(text||'').trim()).replace(/\r/g,'').split('\n');
 const out=lines.map(raw=>{let l=raw.trimEnd();
  if(/^\s*#{1,6}\s+/.test(l))l='<b>'+l.replace(/^\s*#{1,6}\s+/,'').replace(/\*\*/g,'')+'</b>';
  else if(/^\s*[-*•]\s+/.test(l))l='• '+l.replace(/^\s*[-*•]\s+/,'');
  else if(/^\s*\d+[.)]\s+/.test(l))l=l.trim();
  l=l.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/__([^_]+)__/g,'<b>$1</b>').replace(/`([^`]+)`/g,'$1');
  return l&&lang==='he'?RLM+l:l});
 return out.join('\n').replace(/\n{3,}/g,'\n\n');
}
