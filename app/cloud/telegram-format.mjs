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
// ---- Boxes (Telegram tidy-up, 2026-11-12, owner's choice "D · Boxes, nicer"; concept/explorations/telegram-tidy-20261112) ----
// A section is a heading ("📅 <b>Calendar</b> <i>2</i>": the first part bold, details after " · " in italics) over a
// Telegram quote block (<blockquote>: a tinted box with a bar). In a box each line leads with the time (<code>) and the
// name in bold; details follow in italics. Expandable boxes are not used: everything is visible at once.
export const box=lines=>{lines=(lines||[]).filter(Boolean).map(l=>String(l).replace(/^(\u200f)?• /,'$1'));return lines.length?'<blockquote>'+lines.join('\n')+'</blockquote>':''};
export const heading=(icon,title)=>{const [first,...rest]=String(title).split(' · ');return (icon?icon+' ':'')+'<b>'+first+'</b>'+(rest.length?'  <i>'+rest.join(' · ')+'</i>':'')};
// One line in a box: <code>16:30</code>  <b>Dentist</b>  <i>with Noa</i>. Callers pass HTML-safe text.
export const row=(time,name,details)=>[time?'<code>'+time+'</code>':'',name?'<b>'+name+'</b>':'',details?'<i>'+details+'</i>':''].filter(Boolean).join('  ');
export function section(lang,icon,title,lines,extra){if(!lines.length)return '';return heading(icon,esc(title))+'\n'+box(lines)+(extra?'\n<i>'+extra+'</i>':'')}
const join=parts=>parts.filter(Boolean).join('\n\n');
const PRIORITY={high:0,medium:1,low:2};
const byPriorityThenTime=(a,b)=>(PRIORITY[a.priority]??1)-(PRIORITY[b.priority]??1)||(a.time||'99:99').localeCompare(b.time||'99:99');
const star=t=>t.priority==='high'?'⭐ ':'';
// In a box the time leads, so timed items come first in time order, then the rest by priority.
const byTimeThenPriority=(a,b)=>(a.time?0:1)-(b.time?0:1)||(a.time||'').localeCompare(b.time||'')||(PRIORITY[a.priority]??1)-(PRIORITY[b.priority]??1);

// The day for one person: calendar, to do (high priority first), still open, anytime, shopping on a shop day, approvals.
// Boxes layout (2026-11-12): an overview line under the greeting, then one box per section.
export function dayReport(visible,{memberId,role,date,lang,members=[],greeting=false}){
 const nameOf=id=>{const m=members.find(x=>x.id===id);return lang==='he'?m?.he||m?.name:m?.name};
 const me=members.find(m=>m.id===memberId),everyone=members.length;
 const events=(visible.events||[]).filter(e=>(e.memberIds||[]).includes(memberId)&&occursOn(e,date)).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
 const eventLines=events.slice(0,10).map(e=>{const others=(e.memberIds||[]).filter(id=>id!==memberId);return row(e.time&&esc(e.time),esc(titleOf(e,lang))+(e.visibility==='private'?' 🔒':''),others.length&&e.memberIds.length<everyone?L(lang,'with ','עם ')+esc(others.map(nameOf).filter(Boolean).join(', ')):e.memberIds.length===everyone&&everyone>1?L(lang,'everyone','כולם'):'')});
 const planned=shopToday(visible,memberId,date),list=planned?.list;
 // The planned shop leads its own section, so it is not repeated under To do.
 const mine=(visible.tasks||[]).filter(t=>isMine(t,memberId,'tasks')&&t.id!==planned?.trip.id);
 const today=mine.filter(t=>t.date&&occursOn(t,date)),open=today.filter(t=>['open','pending'].includes(completionState(t,date))).sort(byTimeThenPriority),doneCount=today.length-open.length;
 const todoLines=open.slice(0,12).map(t=>(t.priority==='high'?'⭐ ':'')+row(t.time&&esc(t.time),esc(titleOf(t,lang)),[completionState(t,date)==='pending'?L(lang,'⏳ waiting for approval','⏳ ממתין לאישור'):'',t.subtasks?.length?L(lang,t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length+' steps',t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length+' שלבים'):'',t.priority==='high'&&!t.time?L(lang,'high priority','עדיפות גבוהה'):''].filter(Boolean).join(' · ')));
 const done=today.filter(t=>completionState(t,date)==='done').sort(byTimeThenPriority);for(const t of done.slice(0,Math.max(0,12-todoLines.length)))todoLines.push('<s>✓ '+esc(titleOf(t,lang))+'</s>');
 // Still open: earlier days in the last week that were never done (routines are daily habits, so they are not nagged here).
 const overdue=[];for(let i=1;i<=7;i++){const day=shift(date,-i);for(const t of mine)if(!t.routine&&t.date&&t.date<=day&&occursOn(t,day)&&completionState(t,day)==='open'&&(t.repeat||'once')==='once')overdue.push({t,day})}
 const overdueLines=overdue.slice(0,6).map(({t,day})=>(t.priority==='high'?'⭐ ':'')+row('',esc(titleOf(t,lang)),keep(L(lang,'since ','מ')+dayLabel(day,lang,{weekday:'long'}))));
 const anytime=mine.filter(t=>!t.date&&taskStateNow(t,date)==='open').sort(byPriorityThenTime),anytimeLines=anytime.slice(0,4).map(t=>(t.priority==='high'?'⭐ ':'')+row('',esc(titleOf(t,lang))));
 // Shopping only on the day a shop is planned for (a "Plan a trip" date); a list with no date is not in the morning
 // message (owner, 2026-11-12: "the shopping list is sent on the shop date, not every day"). /shopping always shows it.
 const left=list?(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id&&!i.done):[];
 const names=left.slice(0,8).map(i=>esc(titleOf(i,lang))),shoppingLines=list?['<b>'+esc(titleOf(list,lang))+'</b>  <i>'+L(lang,left.length?left.length+' left':'everything is in the bag',left.length?'נותרו '+left.length:'הכול בסל')+'</i>',...[names.slice(0,4),names.slice(4)].filter(n=>n.length).map(n=>n.join('  ·  '))].map((l,i,all)=>i===all.length-1&&left.length>8?l+L(lang,'  and '+(left.length-8)+' more','  ועוד '+(left.length-8)):l):[];
 const approvals=role==='parent'?(visible.tasks||[]).filter(t=>t.memberId!==memberId&&occursOn(t,date)&&completionState(t,date)==='pending'):[];
 const approvalLines=approvals.slice(0,6).map(t=>esc(nameOf(t.memberId))+'  ·  <b>'+esc(titleOf(t,lang))+'</b>');
 const overview=[esc(dayLabel(date,lang)),planned&&L(lang,'shop day','יום קניות'),events.length&&plural(lang,events.length,'event','events','אירוע אחד','אירועים'),open.length&&L(lang,open.length+' to do',open.length===1?'משימה אחת':open.length+' משימות')].filter(Boolean).join(' · ');
 const header=(greeting?'☀️ <b>'+L(lang,'Good morning'+(me?', '+esc(nameOf(me.id)):''),'בוקר טוב'+(me?', '+esc(nameOf(me.id)):''))+'</b>':'🗓 <b>'+L(lang,'Your day','היום שלכם')+'</b>')+'\n<i>'+overview+'</i>';
 const body=join([
  list&&section(lang,'🛒',L(lang,'Shopping today','היום יש קניות')+([planned.trip.time,planned.trip.memberId&&nameOf(planned.trip.memberId)].some(Boolean)?' · '+[planned.trip.time,planned.trip.memberId&&nameOf(planned.trip.memberId)].filter(Boolean).join(' · '):''),shoppingLines),
  section(lang,'📅',L(lang,'Calendar','ביומן')+' · '+events.length,eventLines,events.length>10?L(lang,'…and '+(events.length-10)+' more','…ועוד '+(events.length-10)):''),
  section(lang,'✅',L(lang,'To do','לעשות היום')+(today.length?' · '+L(lang,doneCount+' of '+today.length+' done',doneCount+' מתוך '+today.length+' בוצעו'):''),todoLines),
  section(lang,'⏰',L(lang,'Still open','עדיין פתוח'),overdueLines),
  section(lang,'📋',L(lang,'Anytime','בכל זמן'),anytimeLines,anytime.length>4?L(lang,'…and '+(anytime.length-4)+' more','…ועוד '+(anytime.length-4)):''),
  section(lang,'⏳',L(lang,'Waiting for your OK','מחכה לאישור שלך'),approvalLines)
 ]);
 const empty=!events.length&&!today.length&&!overdue.length&&!anytime.length&&!left.length&&!approvals.length;
 return {text:rtl(lang,join([header,empty?L(lang,'Nothing on your plate today. Enjoy! 🌿','אין לכם כלום היום. תהנו! 🌿'):body,greeting?'':'<i>'+L(lang,'/tasks to tick things off · /week for the week ahead','/tasks לסימון משימות · /week לשבוע הקרוב')+'</i>'])),openTasks:open.filter(t=>completionState(t,date)==='open'),empty};
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
// 2026-11-12: also for English. Every line starts with a left-to-right mark, so a line that begins with a Hebrew name
// (records are often written in Hebrew while the app is in English) stays on the left instead of jumping right, and
// Hebrew runs are isolated (FSI…PDI) so a number after them ("כביסה 1/2") stays after them. The mark goes after a
// leading <blockquote>, so a box starts on its own line. A bold time is shown as a time (<code>).
const FSI='\u2068',PDI='\u2069',HEBREW_RUN=/[\u0590-\u05FF](?:[\u0590-\u05FF'"׳״\-–.,!?() ]*[\u0590-\u05FF)])?/g;
// Already isolated (a second pass) → unchanged; other isolates (money is wrapped LRI…PDI) are kept as they are.
const isolate=l=>l.includes(FSI)?l:l.replace(/(<[^>]*>)|([^<\u2066-\u2069]+)/g,(m,tag,text)=>tag||text.replace(HEBREW_RUN,r=>FSI+r+PDI));
export function rtl(lang,text){
 const s=String(text??'').replace(/<b>(\d{1,2}:\d{2})<\/b>/g,'<code>$1</code>');
 return s.split('\n').map(l=>{if(!l.trim())return l;const lead=/^[\u200e\u200f]*((?:<blockquote[^>]*>)?)[\u200e\u200f]*/.exec(l),open=lead[1],body=l.slice(lead[0].length); // Idempotent: card() and send() both pass through here.
  if(lang==='he')return open+RLM+body.replace(/(^|[\s>(])\/(?=[a-z])/g,'$1'+LRM+'/');
  return open+LRM+isolate(body)}).join('\n');
}
// A list line. With parts [time?, name, …details] it becomes a box line: the time leads (<code>), the name is bold and
// the details follow in italics; a single plain part stays a "•" line (box() drops the "•" inside a box).
export const bullet=parts=>{if(!Array.isArray(parts))return '• '+parts;parts=parts.filter(Boolean);const time=/^(?:<b>)?(\d{1,2}:\d{2})(?:<\/b>)?$/.exec(parts[0]||'')?.[1];const [name,...details]=time?parts.slice(1):parts;
 return time||details.length?'• '+row(time||'',name||'',details.join(' · ')):'• '+(name||'')};
export function block(icon,title,lines,more){lines=(lines||[]).filter(Boolean);if(!lines.length)return '';return (title?heading(icon,title)+'\n':'')+box(lines)+(more?'\n<i>'+more+'</i>':'')}
// A block of plain "•" lines (no heading) becomes a box too; the context line under the title is in italics.
const boxed=b=>!b||/<blockquote/.test(b)||!String(b).split('\n').every(l=>/^(\u200f)?• /.test(l))?b:box(String(b).split('\n'));
export function card(lang,{icon,title,context,blocks=[],hint}){blocks=blocks.filter(Boolean).map(boxed);const head=[(icon?icon+' ':'')+'<b>'+title+'</b>',context&&'<i>'+context+'</i>'];
 // A box right under the title (a reminder) sits directly under it, with no blank line.
 if(!context&&/^<blockquote/.test(blocks[0]||''))head.push(blocks.shift());
 return rtl(lang,join([head.filter(Boolean).join('\n'),...blocks,hint?'<i>'+hint+'</i>':'']))}
// A short one-off reply (an error, a setting that is off, a confirmation): icon, sentence, optional hint.
export const notice=(lang,icon,text,hint)=>rtl(lang,(icon?icon+' ':'')+text+(hint?'\n\n<i>'+hint+'</i>':''));
export const plural=(lang,n,en1,enN,he1,heN)=>lang==='he'?(n===1?he1:n+' '+heN):(n===1?'1 '+en1:n+' '+enN);
// Dates read as words in the person's language, never as 2026-11-08. A range collapses ("2–8 Nov").
const locale=lang=>lang==='he'?'he-IL':'en-GB',at=date=>new Date(date+'T12:00:00Z');
// Short dates never break across lines (owner's screenshot 2026-11-12: "Tue 10" / "Nov" on two lines): no-break spaces.
const keep=s=>String(s).replace(/ /g,'\u00a0');
export const shortDay=(date,lang)=>keep(dayLabel(date,lang,{weekday:'short',day:'numeric',month:'short'}));
export const shortDate=(date,lang)=>keep(dayLabel(date,lang,{day:'numeric',month:'short',year:'numeric'}));
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
