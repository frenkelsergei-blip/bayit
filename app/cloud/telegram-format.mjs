import {isMine} from '../../shared/record-audience.mjs';
import {shopToday} from '../../shared/shopping-rhythm.mjs';
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
 const eventLines=events.slice(0,10).map(e=>{const others=(e.memberIds||[]).filter(id=>id!==memberId);return line(lang,[e.time&&'<b>'+esc(e.time)+'</b>',esc(titleOf(e,lang))+(e.visibility==='private'?' 🔒':''),others.length&&e.memberIds.length<everyone?esc(others.map(nameOf).filter(Boolean).join(', ')):e.memberIds.length===everyone&&everyone>1?L(lang,'everyone','כולם'):''])});
 const mine=(visible.tasks||[]).filter(t=>isMine(t,memberId,'tasks'));
 const today=mine.filter(t=>t.date&&occursOn(t,date)),open=today.filter(t=>['open','pending'].includes(completionState(t,date))).sort(byPriorityThenTime),doneCount=today.length-open.length;
 const todoLines=open.slice(0,12).map(t=>line(lang,[t.time?'<b>'+esc(t.time)+'</b>':'',star(t)+esc(titleOf(t,lang)),completionState(t,date)==='pending'?L(lang,'⏳ waiting for approval','⏳ ממתין לאישור'):'',t.subtasks?.length?t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length:'']));
 const done=today.filter(t=>completionState(t,date)==='done').sort(byPriorityThenTime);for(const t of done.slice(0,Math.max(0,12-todoLines.length)))todoLines.push(line(lang,[t.time?esc(t.time):'',esc(titleOf(t,lang))+' ✓']));
 // Overdue: earlier days in the last week that were never done (routines are daily habits, so they are not nagged here).
 const overdue=[];for(let i=1;i<=7;i++){const day=shift(date,-i);for(const t of mine)if(!t.routine&&t.date&&t.date<=day&&occursOn(t,day)&&completionState(t,day)==='open'&&(t.repeat||'once')==='once')overdue.push({t,day})}
 const overdueLines=overdue.slice(0,6).map(({t,day})=>line(lang,[star(t)+esc(titleOf(t,lang)),esc(dayLabel(day,lang,{weekday:'short',day:'numeric',month:'short'}))]));
 const anytime=mine.filter(t=>!t.date&&taskStateNow(t,date)==='open').sort(byPriorityThenTime),anytimeLines=anytime.slice(0,4).map(t=>line(lang,[star(t)+esc(titleOf(t,lang))]));
 // A shop planned for today leads the shopping part of the morning summary (2026-11-11).
 const planned=greeting?shopToday(visible,memberId,date):null;
 const lists=(visible.shoppingLists||[]).filter(l=>l.status==='active'),chosen=visible.preferences?.activeShoppingListByUser?.[memberId],list=planned?.list||lists.find(l=>l.id===chosen)||lists[0];
 const left=list?(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id&&!i.done):[];
 const shoppingLine=left.length?[line(lang,[esc(left.slice(0,8).map(i=>titleOf(i,lang)).join(', '))+(left.length>8?L(lang,' and '+(left.length-8)+' more',' ועוד '+(left.length-8)):'')])]:[];
 const approvals=role==='parent'?(visible.tasks||[]).filter(t=>t.memberId!==memberId&&occursOn(t,date)&&completionState(t,date)==='pending'):[];
 const approvalLines=approvals.slice(0,6).map(t=>line(lang,[esc(nameOf(t.memberId)),esc(titleOf(t,lang))]));
 const header=greeting?(lang==='he'?RLM:'')+'☀️ <b>'+L(lang,'Good morning'+(me?', '+esc(nameOf(me.id)):'')+'!','בוקר טוב'+(me?', '+esc(nameOf(me.id)):'')+'!')+'</b>\n'+(lang==='he'?RLM:'')+esc(dayLabel(date,lang)):(lang==='he'?RLM:'')+'🗓 <b>'+L(lang,'Your day','היום שלכם')+'</b>\n'+(lang==='he'?RLM:'')+esc(dayLabel(date,lang));
 const body=join([
  section(lang,'📅',L(lang,'Calendar','ביומן'),eventLines,events.length>10?L(lang,'…and '+(events.length-10)+' more','…ועוד '+(events.length-10)):''),
  section(lang,'✅',L(lang,'To do today','לעשות היום')+(today.length?' · '+L(lang,doneCount+'/'+today.length+' done',doneCount+'/'+today.length+' בוצעו'):''),todoLines),
  section(lang,'⏰',L(lang,'Overdue','באיחור'),overdueLines),
  section(lang,'📋',L(lang,'Anytime','בכל זמן'),anytimeLines,anytime.length>4?L(lang,'…and '+(anytime.length-4)+' more','…ועוד '+(anytime.length-4)):''),
  list?section(lang,'🛒',(planned?L(lang,'Shopping today','היום יש קניות')+(planned.trip.time?' · '+planned.trip.time:'')+(planned.trip.memberId?' · '+nameOf(planned.trip.memberId):''):L(lang,'Shopping','קניות'))+' · '+titleOf(list,lang)+' · '+L(lang,left.length+' left','נותרו '+left.length),shoppingLine):'',
  section(lang,'⏳',L(lang,'Waiting for your approval','ממתין לאישורכם'),approvalLines)
 ]);
 const empty=!events.length&&!today.length&&!overdue.length&&!anytime.length&&!left.length&&!approvals.length;
 return {text:join([header,empty?(lang==='he'?RLM:'')+L(lang,'Nothing on your plate today. Enjoy! 🌿','אין לכם כלום היום. תהנו! 🌿'):body,(lang==='he'?RLM:'')+'<i>'+L(lang,'/tasks to tick things off · /week for the week ahead','‎/tasks לסימון משימות · ‎/week לשבוע הקרוב')+'</i>']),openTasks:open.filter(t=>completionState(t,date)==='open'),empty};
}

// AI answers come as plain text that may contain Markdown. Make it read well in a phone chat: headings in bold
// with a blank line before them, "•" bullets (nested ones as "◦"), tables as one line per row, links kept,
// rules and code fences dropped. Hebrew lines are right-to-left (rtl).
export function chatFormat(text,lang){
 const lines=esc(String(text||'').trim()).replace(/\r/g,'').split('\n'),out=[];let table=0;
 const inline=l=>l.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/__([^_]+)__/g,'<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g,'$1<i>$2</i>').replace(/`([^`]+)`/g,'$1')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g,'<a href="$2">$1</a>');
 for(const raw of lines){let l=raw.trimEnd();
  if(/^\s*```/.test(l)||/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)){table=0;continue}
  if(/^\s*\|.*\|\s*$/.test(l)){
   if(/^\s*\|[\s:|-]+\|\s*$/.test(l))continue;
   const cells=l.trim().slice(1,-1).split('|').map(c=>inline(c.trim().replace(/\*\*/g,''))).filter(Boolean);
   out.push(table++?'• '+cells.join(' · '):'<b>'+cells.join(' · ')+'</b>');continue;
  }
  table=0;
  if(/^\s*#{1,6}\s+/.test(l)){if(out.length&&out.at(-1).trim())out.push('');l='<b>'+l.replace(/^\s*#{1,6}\s+/,'').replace(/\*\*/g,'')+'</b>'}
  else if(/^\s{2,}[-*•]\s+/.test(l))l='   ◦ '+inline(l.replace(/^\s*[-*•]\s+/,''));
  else if(/^\s*[-*•]\s+/.test(l))l='• '+inline(l.replace(/^\s*[-*•]\s+/,''));
  else l=inline(l.trim());
  out.push(l);
 }
 return rtl(lang,out.join('\n').replace(/\n{3,}/g,'\n\n'));
}

// ---- One anatomy for every bot message (Telegram message audit, 2026-11-08) ----
// icon + bold title · one plain context line · blank line · sections ("<b>icon Title</b>" + "•" lines) · italic hint.
// Callers pass HTML-safe strings (escape record text with esc). Hebrew: every line starts with a right-to-left
// mark, so lines that begin with a time, a /command, "Bayit" or an English name still align right, and a
// /command (at the start or mid-sentence) keeps its slash in front (left-to-right mark before the slash).
const LRM='‎';
export function rtl(lang,text){
 const s=String(text??'');if(lang!=='he')return s;
 return s.split('\n').map(l=>{if(!l.trim())return l;const body=l.startsWith(RLM)?l.slice(1):l;return RLM+body.replace(/(^|[\s>(])\/(?=[a-z])/g,'$1'+LRM+'/')}).join('\n');
}
export const bullet=parts=>'• '+(Array.isArray(parts)?parts.filter(Boolean).join(' · '):parts);
export function block(icon,heading,lines,more){lines=(lines||[]).filter(Boolean);if(!lines.length)return '';return (heading?'<b>'+(icon?icon+' ':'')+heading+'</b>\n':'')+lines.join('\n')+(more?'\n'+more:'')}
export function card(lang,{icon,title,context,blocks=[],hint}){return rtl(lang,join([[(icon?icon+' ':'')+'<b>'+title+'</b>',context].filter(Boolean).join('\n'),...blocks,hint?'<i>'+hint+'</i>':'']))}
// A short one-off reply (an error, a setting that is off, a confirmation): icon, sentence, optional hint.
export const notice=(lang,icon,text,hint)=>rtl(lang,(icon?icon+' ':'')+text+(hint?'\n\n<i>'+hint+'</i>':''));
export const plural=(lang,n,en1,enN,he1,heN)=>lang==='he'?(n===1?he1:n+' '+heN):(n===1?'1 '+en1:n+' '+enN);
// Dates read as words in the person's language, never as 2026-11-08. A range collapses ("2–8 Nov").
const locale=lang=>lang==='he'?'he-IL':'en-GB',at=date=>new Date(date+'T12:00:00Z');
export const shortDay=(date,lang)=>dayLabel(date,lang,{weekday:'short',day:'numeric',month:'short'});
export const shortDate=(date,lang)=>dayLabel(date,lang,{day:'numeric',month:'short',year:'numeric'});
export function dateRange(from,to,lang){try{return new Intl.DateTimeFormat(locale(lang),{day:'numeric',month:'short',...(from.slice(0,4)!==to.slice(0,4)?{year:'numeric'}:{}),timeZone:'UTC'}).formatRange(at(from),at(to))}catch{return shortDate(from,lang)+' – '+shortDate(to,lang)}}
const ISO_RANGE=/\b(\d{4}-\d{2}-\d{2})\s*(?:–|-|→)\s*(\d{4}-\d{2}-\d{2})\b/g,ISO=/\b(\d{4}-\d{2}-\d{2})\b/g;
export const localizeDates=(text,lang)=>String(text??'').replace(ISO_RANGE,(_,a,b)=>dateRange(a,b,lang)).replace(ISO,d=>shortDate(d,lang));
// Shopping quantities in the person's language; a plain "1 item" is left out.
const UNIT={items:['','יח׳'],kg:['kg','ק״ג'],g:['g','גרם'],liters:['L','ליטר'],bottles:['bottles','בקבוקים'],bags:['bags','שקיות'],packs:['packs','אריזות'],loaves:['loaves','כיכרות']};
export function quantityText(quantity,unit,lang){
 let n=quantity,u=unit;if(u===undefined&&typeof quantity==='string'){const m=/^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(quantity);if(!m)return String(quantity);n=Number(m[1]);u=m[2]||'items'}
 n=Number(n);if(!Number.isFinite(n))return '';u=/^items?$/.test(u||'items')?'items':u;if(u==='items'&&n===1)return '';
 const label=UNIT[u]?.[lang==='he'?1:0]??u;return u==='items'?(lang==='he'?n+' '+label:'×'+n):n+' '+label;
}
// A finance or insurance alert (title + one detail sentence) as a card: the detail's parts become lines.
export function alertCard(lang,{icon,title,detail}){
 const raw=String(detail??''),range=/^(\d{4}-\d{2}-\d{2})\s*(?:–|-|→)\s*(\d{4}-\d{2}-\d{2})/.exec(raw);
 const rest=range?raw.slice(range[0].length).replace(/^\s*·\s*/,''):raw,parts=localizeDates(rest,lang).split(/\s+·\s+|;\s+|\.\s+(?=[^\s·])/).map(p=>p.replace(/^·\s*/,'').replace(/[.;]\s*$/,'').trim()).filter(Boolean).map(p=>lang==='he'?p:p[0].toUpperCase()+p.slice(1));
 return card(lang,{icon,title:esc(title),context:range?esc(dateRange(range[1],range[2],lang)):parts.length===1?esc(parts[0]):'',blocks:parts.length>1?[parts.map(p=>bullet(esc(p))).join('\n')]:[]});
}
