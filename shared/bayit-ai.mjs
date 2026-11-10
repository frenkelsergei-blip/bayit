// בית AI (Bayit AI) recommendations: things that look odd and are worth a check (user request and concept A + B,
// 2026-11-10). Rules find them; the AI may only word them. v1 covers money:
//  • new    a recurring charge never seen before (a forgotten trial or subscription)
//  • jump   a price jump on a stable recurring charge (Cellcom ₪89 for months, then ₪129)
//  • dup    the same charge twice within two days
// Bills that vary by nature (electricity, water, gas, arnona, mortgage) never count as a price jump.
// Rows are money rows as Expenses has them: amount in agorot (negative = money out), date, description, category.
import {providerOf,isRetail,PROVIDER_AREA} from './providers.mjs';
import {normalizeName,monthOf,shiftMonth,flowOf} from './finance.mjs';

export const BAI_KINDS=['new','jump','dup'];
export const BAI_OUTCOMES=['ok','action','dismissed'];
export const BAI_AREAS=['money']; // later: 'events' (overlaps), 'routines' (forgotten)
export const BAI_FREQUENCIES=['daily','weekly'];
export const BAI_DIGESTS=['off','daily','weekly'];
// Naturally variable bills: no price-jump findings. Who we pay marks electricity, water, gas and arnona
// (PROVIDER_AREA[id].variable, 2026-11-10); bills that follow an index or a balance are added here.
const MORE_VARIABLE=['electricity','water','gas','arnona','utility','taxes','housing','loan','savings'];
export const isVariableArea=area=>PROVIDER_AREA[area]?.variable===true||MORE_VARIABLE.includes(area);
const NOT_MONEY_OUT=new Set(['groceries','dining','cards','transfers','cash']);
const MIN_JUMP_PERCENT=8,MIN_JUMP_AGOROT=1000,STABLE_PERCENT=3,MIN_DUP_AGOROT=3000,OPEN_DAYS=30;

const DAY=86400000;
const dayNum=d=>Math.floor(Date.parse(String(d).slice(0,10)+'T12:00:00Z')/DAY);
const median=v=>{const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length?(s.length%2?s[m]:Math.round((s[m-1]+s[m])/2)):0};
const monthsBetween=(a,b)=>{const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return (by-ay)*12+bm-am};
const hashKey=s=>{let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36)};
// Provider key of a row, in Who we pay's format (p:/ins:/m:), so the evidence link opens the same provider.
export function seriesOf(t){
 const who=providerOf(t.description,t.category);
 return {key:who.key,name:who.name,area:who.area,known:!!who.known};
}
const outRow=t=>t&&t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)!=='income'&&!t.deletedAt;
const isInstalment=t=>t.installmentOf!=null&&t.installmentOf>1;

// Yearly impact decides the AI priority (3 = check soon, 2 = worth a look, 1 = for your information).
export function levelFor(kind,agorot){
 const year=kind==='dup'?agorot:agorot*12;
 // A new charge is often wanted, so it needs more before it is "check soon".
 return kind==='dup'?(year>=20000?3:year>=5000?2:1):kind==='new'?(year>=120000?3:year>=10000?2:1):(year>=40000?3:year>=10000?2:1);
}

// All money findings in these rows. options:
//  today       "YYYY-MM-DD" (household date)
//  suppressed  Set of "<kind>:<providerKey>" the family marked "Not relevant"
//  memberOf    (row) → card holder's member id or null (shared account)
export function moneyFindings(rows,{today,suppressed=new Set(),memberOf=()=>null}={}){
 const out=[],list=(rows||[]).filter(outRow);if(!list.length||!today)return out;
 const now=dayNum(today),thisMonth=today.slice(0,7),firstMonth=list.map(monthOf).sort()[0];
 // Series by provider, monthly totals; instalments and shops are purchases, not providers.
 const series=new Map();
 for(const t of list){
  if(isInstalment(t)||NOT_MONEY_OUT.has(t.category)||isRetail(t.description))continue;
  const s=seriesOf(t);if(!s.key)continue;
  let e=series.get(s.key);if(!e){e={...s,months:new Map(),rows:[]};series.set(s.key,e)}
  const m=monthOf(t);e.months.set(m,(e.months.get(m)||0)-t.amount);e.rows.push(t);
 }
 for(const e of series.values()){
  const months=[...e.months.keys()].sort(),amounts=months.map(m=>e.months.get(m)),last=months.at(-1);
  if(!last||monthsBetween(last,thisMonth)>1)continue; // only what is still being charged
  const holder=pickHolder(e.rows.filter(r=>monthOf(r)===last),memberOf);
  const history=months.slice(-6).map(m=>({month:m,amount:e.months.get(m)}));
  // Price jump: at least three earlier monthly charges within ±3% of their median, then up ≥8% and ≥₪10.
  if(!isVariableArea(e.area)&&months.length>=4&&!suppressed.has('jump:'+e.key)){
   const before=amounts.slice(-4,-1),base=median(before),consecutive=months.slice(-4).every((m,i,a)=>!i||monthsBetween(a[i-1],m)===1);
   const stable=base>0&&before.every(v=>Math.abs(v-base)/base*100<=STABLE_PERCENT),now1=amounts.at(-1),diff=now1-base;
   if(consecutive&&stable&&diff>=MIN_JUMP_AGOROT&&diff/base*100>=MIN_JUMP_PERCENT){
    const steady=countSteady(amounts.slice(0,-1),base);
    out.push(finding('jump',e,{month:last,amount:now1,previous:base,percent:Math.round(diff/base*100),steadyMonths:steady,history,rowIds:e.rows.filter(r=>monthOf(r)===last).map(r=>r.id).filter(Boolean),holder,level:levelFor('jump',diff),yearly:diff*12}));
   }
  }
  // New recurring: charged in two or three consecutive recent months at a similar amount, never before, while the
  // rows go back at least three months earlier (so it is new, not just where the imports start).
  if(!suppressed.has('new:'+e.key)&&months.length>=2&&months.length<=3){
   const first=months[0],recent=monthsBetween(first,thisMonth)<=3,consecutive=months.every((m,i)=>!i||monthsBetween(months[i-1],m)===1);
   const similar=Math.max(...amounts)-Math.min(...amounts)<=median(amounts)*0.15,known=monthsBetween(firstMonth,first)>=3;
   if(recent&&consecutive&&similar&&known){
    const amount=median(amounts),same=[...series.values()].filter(o=>o!==e&&o.area===e.area&&!['other','utility'].includes(e.area)&&[...o.months.keys()].some(m=>monthsBetween(m,thisMonth)<=1)).map(o=>o.name).slice(0,2);
    out.push(finding('new',e,{month:last,firstMonth:first,amount,charges:months.length,history,alsoPaying:same,rowIds:e.rows.map(r=>r.id).filter(Boolean),holder,level:levelFor('new',amount),yearly:amount*12}));
   }
  }
 }
 // Duplicates: the same merchant, card and amount within two days, in the last 45 days, unless that pair is a pattern
 // in earlier months (two phone lines with the same price).
 const recent=list.filter(t=>!isInstalment(t)&&-t.amount>=MIN_DUP_AGOROT&&now-dayNum(t.date)<=45&&now>=dayNum(t.date));
 const seen=new Set();
 for(const a of recent)for(const b of recent){
  if(a===b||!a.id||!b.id||String(a.id)>=String(b.id)||a.amount!==b.amount)continue;
  if(normalizeName(a.description)!==normalizeName(b.description)||(a.source||'')!==(b.source||'')||(a.account||'')!==(b.account||''))continue;
  if(Math.abs(dayNum(a.date)-dayNum(b.date))>2||a.standingOrder||b.standingOrder)continue;
  const s=seriesOf(a);if(suppressed.has('dup:'+s.key))continue;
  const pairKey=normalizeName(a.description)+'|'+a.amount;if(seen.has(pairKey))continue;
  const pattern=list.filter(t=>t!==a&&t!==b&&t.amount===a.amount&&normalizeName(t.description)===normalizeName(a.description)&&monthOf(t)<monthOf(a));
  if(new Set(pattern.map(monthOf)).size>=2&&pattern.length>=4)continue;
  seen.add(pairKey);
  const [x,y]=[a,b].sort((p,q)=>String(p.date).localeCompare(String(q.date)));
  out.push(finding('dup',{...s},{month:monthOf(x),amount:-a.amount,dates:[x.date,y.date],times:[x.time||'',y.time||''],description:a.description,rowIds:[x.id,y.id],holder:pickHolder([a],memberOf),level:levelFor('dup',-a.amount),yearly:-a.amount,idParts:[x.id,y.id]}));
 }
 return out.sort((a,b)=>b.level-a.level||b.yearly-a.yearly);
}
function countSteady(amounts,base){let n=0;for(let i=amounts.length-1;i>=0&&Math.abs(amounts[i]-base)/base*100<=STABLE_PERCENT;i--)n++;return n}
function pickHolder(rows,memberOf){const ids=rows.map(r=>memberOf(r)).filter(v=>v!==undefined);if(!ids.length)return null;const first=ids[0];return ids.every(v=>v===first)?first:null}
function finding(kind,s,data){
 const {idParts,...rest}=data;
 const id=kind==='dup'?'dup:'+hashKey(idParts.join('|')):kind==='jump'?'jump:'+hashKey(s.key+'|'+data.month+'|'+data.amount):'new:'+hashKey(s.key);
 return {id,kind,area:'money',providerKey:s.key,name:s.name,providerArea:s.area,...rest};
}

// Who sees and who checks a money finding. Money is parents/adults only: viewers are the adults of the household
// (family-scope rows) or only the owner (private rows); the checker is the card holder when known, else all viewers.
export function audienceFor(f,{adults,scope,ownerId}){
 const viewers=scope==='private'?[ownerId]:[...adults];
 const assignees=f.holder&&viewers.includes(f.holder)?[f.holder]:viewers;
 return {viewers,assignees};
}

// Open findings expire quietly after 30 days without an answer.
export const expired=(createdAt,now=Date.now())=>now-createdAt>OPEN_DAYS*DAY;

// Learning from "Not relevant": the rule key to suppress.
export const suppressKey=f=>f.kind+':'+f.providerKey;

// ---- Words (deterministic; the optional AI may replace `why2` only) ----
const MONTH_HE=['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
const MONTH_HE_LONG=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const MONTH_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_EN_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const shekels=agorot=>{const v=Math.abs(agorot)/100;return '₪'+(Number.isInteger(v)?v.toLocaleString('en-US'):v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}))};
export const monthName=(m,lang,long=false)=>{const i=Number(String(m).slice(5,7))-1;return (lang==='he'?(long?MONTH_HE_LONG:MONTH_HE):(long?MONTH_EN_LONG:MONTH_EN))[i]||m};
const dayLabel=(d,lang)=>{const n=Number(d.slice(8,10));return lang==='he'?n+' ב'+monthName(d,'he'):monthName(d,'en')+' '+n};
// Latin names inside Hebrew sentences keep their direction (FSI … PDI).
const nm=(f,lang)=>{const n=(lang==='he'?f.name?.he:f.name?.en)||f.name?.en||'';return lang==='he'&&/[A-Za-z]/.test(n)?'\u2068'+n+'\u2069':n};
const money=a=>'\u2066'+shekels(a)+'\u2069';

export function findingTitle(f,lang){
 const he=lang==='he';
 if(f.kind==='jump')return he?nm(f,lang)+' עלה ל־'+money(f.amount):nm(f,lang)+' went up to '+shekels(f.amount);
 if(f.kind==='new')return he?'חיוב קבוע חדש: '+nm(f,lang):'New recurring charge: '+nm(f,lang);
 return he?nm(f,lang)+' חויב פעמיים':nm(f,lang)+' charged twice';
}
export function findingShort(f,lang){
 const he=lang==='he';return f.kind==='jump'?(he?'מחיר עלה':'Price went up'):f.kind==='new'?(he?'חיוב קבוע חדש':'New recurring charge'):(he?'חיוב כפול':'Charged twice');
}
export function findingDelta(f){return f.kind==='jump'?'+'+shekels(f.amount-f.previous):f.kind==='dup'?shekels(f.amount)+' ×2':shekels(f.amount)}
// Two lines: what happened (facts), then why it may matter.
export function findingWhy(f,lang){
 const he=lang==='he';
 if(f.kind==='jump'){
  const n=Math.max(3,f.steadyMonths||3);
  return [he?n+' חודשים שילמתם '+money(f.previous)+' בחודש, וב'+monthName(f.month,'he',true)+' '+money(f.amount)+' (+'+f.percent+'%).':'For '+n+' months you paid '+shekels(f.previous)+' a month; in '+monthName(f.month,'en',true)+' it was '+shekels(f.amount)+' (+'+f.percent+'%).',
   he?'אולי נגמרה הנחה או נוסף שירות. '+money(f.yearly)+' בשנה.':'Maybe a discount ended or a service was added. '+shekels(f.yearly)+' a year.'];
 }
 if(f.kind==='new'){
  const also=(f.alsoPaying||[]).map(x=>he?x.he:x.en).filter(Boolean);
  return [he?'חיוב חדש של '+money(f.amount)+' בכל חודש מאז '+monthName(f.firstMonth,'he',true)+' ('+f.charges+' חיובים).':'A new charge of '+shekels(f.amount)+' every month since '+monthName(f.firstMonth,'en',true)+' ('+f.charges+' charges).',
   (he?'אולי ניסיון חינם שהפך למנוי.':'Maybe a free trial that became a subscription.')+(also.length?(he?' יש לכם גם '+also.map(x=>/[A-Za-z]/.test(x)?'\u2068'+x+'\u2069':x).join(' ו־')+'.':' You also pay '+also.join(' and ')+'.'):'')];
 }
 const [d1,d2]=f.dates||[];
 return [he?'שני חיובים זהים של '+money(f.amount)+(d1===d2?' ב־'+dayLabel(d1,'he'):' ב־'+dayLabel(d1,'he')+' וב־'+dayLabel(d2,'he'))+'.':'Two identical charges of '+shekels(f.amount)+(d1===d2?' on '+dayLabel(d1,'en'):' on '+dayLabel(d1,'en')+' and '+dayLabel(d2,'en'))+'.',
  he?'אם זו הייתה הזמנה אחת, אפשר לבקש החזר.':'If it was one order, you can ask for a refund.'];
}
// The page that shows the evidence: the provider in Who we pay (its months and payments), or the month in Expenses.
export function evidenceRoute(f,scope='family'){
 const q=new URLSearchParams({...(f.kind==='dup'?{}:{view:'providers',provider:f.providerKey}),month:f.month,...(scope==='private'?{scope:'private'}:{})});
 return 'household/expenses?'+q.toString();
}

// ---- What the optional AI may see and say ----
// Only provider names, areas, amounts and months: never card digits, accounts, people or statement lines.
export function findingsAIContext(findings){
 return findings.map(f=>({id:f.id,kind:f.kind,provider:f.name?.en||'',area:f.providerArea,month:f.month,amountILS:Math.round(f.amount)/100,previousILS:f.previous!=null?Math.round(f.previous)/100:undefined,percent:f.percent,firstMonth:f.firstMonth,charges:f.charges,alsoPaying:(f.alsoPaying||[]).map(x=>x.en)}));
}
const line=v=>typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,160):'';
export function cleanFindingsAI(output,findings){
 const ids=new Set(findings.map(f=>f.id)),out={};
 for(const x of Array.isArray(output?.findings)?output.findings.slice(0,50):[]){if(!ids.has(x?.id))continue;const he=line(x.he),en=line(x.en);if(he||en)out[x.id]={...(he?{he}:{}),...(en?{en}:{})}}
 return out;
}

// ---- Settings (family, parents) and personal notification choices ----
export function cleanSettings(v={}){
 return {enabled:v?.enabled===true,areas:{money:v?.areas?.money!==false},frequency:BAI_FREQUENCIES.includes(v?.frequency)?v.frequency:'daily'};
}
export function cleanPrefs(v={}){
 const time=/^([01]\d|2[0-3]):[0-5]\d$/.test(v?.time||'')?v.time:'09:00';
 return {digest:BAI_DIGESTS.includes(v?.digest)?v.digest:'off',time,push:v?.push===true,telegram:v?.telegram===true,weekday:Number.isInteger(v?.weekday)&&v.weekday>=0&&v.weekday<=6?v.weekday:0};
}
// Is a digest due for this person at this household minute? Once per day (or week), at or after the chosen time.
export function digestDue(prefs,{date,time,weekday,quiet=false}){
 const p=cleanPrefs(prefs);if(p.digest==='off'||quiet||time<p.time)return null;
 if(p.digest==='weekly'&&weekday!==p.weekday)return null;
 return 'bai-digest:'+(p.digest==='weekly'?'w':'d')+':'+date;
}
export function digestText(findings,lang){
 const he=lang==='he',n=findings.length;
 const head=he?(n===1?'בית AI מציע לבדוק דבר אחד':'בית AI מציע לבדוק '+n+' דברים'):(n===1?'Bayit AI suggests checking one thing':'Bayit AI suggests checking '+n+' things');
 return {title:head,lines:findings.slice(0,5).map(f=>findingTitle(f,lang)),more:n>5?n-5:0};
}
