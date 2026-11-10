// AI answers in the app (user report 2026-11-10: answers were one block of text with "- " lines, mixed Hebrew/English
// out of order and emoji). The assistant is asked for a small Markdown subset; this turns it into safe blocks the app
// renders itself (no HTML from the AI): paragraphs, section titles, bullet and numbered lists, separators and **bold**.
// Emoji are removed for the app; Telegram keeps its own formatting.

const EMOJI=/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}])+/gu;
export const stripEmoji=text=>String(text??'').replace(EMOJI,'').replace(/[ \t]{2,}/g,' ');

// "**bold**" (also "__bold__") → runs [{text,bold}]. Unclosed markers stay as text.
export function inlineRuns(text){
 const out=[],re=/(\*\*|__)(.+?)\1/g;let last=0,m;
 const s=String(text??'');
 while((m=re.exec(s))){if(m.index>last)out.push({text:s.slice(last,m.index),bold:false});out.push({text:m[2],bold:true});last=re.lastIndex}
 if(last<s.length)out.push({text:s.slice(last),bold:false});
 // Stray emphasis stars (an unclosed **, a single *word*) are dropped rather than shown.
 return out.map(r=>({...r,text:r.text.replace(/(^|\s)\*{1,2}(?=\S)/g,'$1').replace(/(?<=\S)\*{1,2}(?=\s|$)/g,'')})).filter(r=>r.text);
}

// Blocks: {type:'p'|'h'|'ul'|'ol'|'hr', runs | items:[runs]}.
export function parseAnswer(text){
 const lines=stripEmoji(text).replace(/\r\n?/g,'\n').split('\n').map(l=>l.trim());
 const blocks=[];let para=[],list=null;
 const flushPara=()=>{if(para.length){blocks.push({type:'p',runs:inlineRuns(para.join(' '))});para=[]}};
 const flushList=()=>{if(list){blocks.push(list);list=null}};
 for(const line of lines){
  if(!line){flushPara();flushList();continue}
  if(/^(-{3,}|\*{3,}|_{3,}|—{2,})$/.test(line)){flushPara();flushList();blocks.push({type:'hr'});continue}
  const heading=/^#{1,6}\s+(.+)$/.exec(line)||/^\*\*([^*]+?)\*\*:?$/.exec(line);
  if(heading){flushPara();flushList();blocks.push({type:'h',runs:inlineRuns(heading[1].replace(/:$/,''))});continue}
  const bullet=/^(?:[-*•·–]|•)\s+(.+)$/.exec(line),numbered=/^(\d{1,2})[.)]\s+(.+)$/.exec(line);
  if(bullet||numbered){flushPara();const type=bullet?'ul':'ol';if(!list||list.type!==type){flushList();list={type,items:[]}}list.items.push(inlineRuns((bullet?bullet[1]:numbered[2]).trim()));continue}
  flushList();para.push(line);
 }
 flushPara();flushList();
 return blocks;
}

// The answer's direction: the first letter that has one (Hebrew → rtl, Latin → ltr).
export function answerDirection(text){const m=/[A-Za-z\u00C0-\u024F]|[\u0590-\u05FF\u0600-\u06FF]/.exec(stripEmoji(text));return m&&/[\u0590-\u06FF]/.test(m[0])?'rtl':'ltr'}

// ---- Sections and rows (user feedback 2026-11-10: "everything is text; it needs icons so it's clear what is what") ----
// What a section is about, from its title (Hebrew or English), so the app can give it an icon and a tone.
const KINDS=[['overdue',/overdue|late|באיחור|לא בוצע/i],['done',/done|completed|finished|בוצע|הושלם|סומן/i],['today',/today|this morning|tonight|היום|הבוקר|הערב/i],
 ['tomorrow',/tomorrow|מחר/i],['anytime',/anytime|any time|no date|undated|בלי תאריך|ללא תאריך|בכל זמן/i],['week',/week|שבוע/i],['events',/event|calendar|schedule|יומן|אירוע|לוח/i],
 ['shopping',/shopping|groceries|קניות|רשימת קניות/i],['money',/money|expense|spend|bill|payment|כסף|הוצאות|חיוב|תשלום/i],['reminders',/remind|תזכור/i],['tasks',/task|to.?do|משימ/i],['notes',/note|journal|הערות|יומן הבית/i]];
export const sectionKind=title=>{const t=String(title||'');for(const [k,re]of KINDS)if(re.test(t))return k;return 'other'};
const plain=runs=>runs.map(r=>r.text).join('');
// Lead (everything before the first title) and sections (a title with what follows it).
export function answerSections(blocks){
 const lead=[],sections=[];let cur=null;
 for(const b of blocks){
  if(b.type==='h'){cur={title:b.runs,kind:sectionKind(plain(b.runs)),blocks:[]};sections.push(cur);continue}
  if(b.type==='hr'){cur=null;continue}
  (cur?cur.blocks:lead).push(b);
 }
 for(const s of sections)s.count=s.blocks.reduce((n,b)=>n+(b.items?b.items.length:0),0);
 return {lead,sections};
}
// A list line "18:00 · **Title** · Shani" → {time:'18:00', runs:[title…], person:'Shani'} (person only when it is a
// family member's name, so a title is never mistaken for a person).
export function splitItem(runs,names=[]){
 let rs=runs.map(r=>({...r})),time=null,person=null;
 const first=rs[0];if(first&&!first.bold){const m=/^\s*(\d{1,2}:\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*[·•|,:-]?\s*/.exec(first.text);if(m){time=m[0].replace(/[\s·•|,:-]+$/,'').trim();first.text=first.text.slice(m[0].length)}}
 const last=rs[rs.length-1],known=names.map(n=>String(n||'').trim().toLowerCase()).filter(Boolean);
 if(last&&!last.bold){const m=/\s*[·•|]\s*([^·•|]{1,40})\s*$/.exec(last.text);if(m&&known.includes(m[1].trim().toLowerCase())){person=m[1].trim();last.text=last.text.slice(0,m.index)}}
 rs=rs.map(r=>({...r,text:r.text.replace(/^\s*[·•|]\s*/,'').replace(/\s*[·•|]\s*$/,'')})).filter(r=>r.text.trim());
 return {time,runs:rs,person};
}
