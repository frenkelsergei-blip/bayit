// The shopping list that proposes itself (docs/shopping-smart-design.md §2.1, concept C chosen 2026-11-11).
// Pure functions, no AI: a product's interval is the median gap between its last purchase days; it is suggested once
// 80% of that interval has passed. Unrecorded small purchases only make gaps longer, so Bayit suggests later, never early.
// "Already bought", "not this time" and "stop suggesting" are shoppingMarks records; favourites feed suggestions too.
import {shoppingIdentity} from './shopping-transfer.mjs';

export const RHYTHM={maxDays:6,minDays:3,band:.4,minBand:2,due:.8,maxInterval:60,quietFactor:3,quietMinDays:21,mergeDays:2,likedDays:7};
const DAY=86400000;
const dayNum=date=>Math.round(Date.parse(String(date).slice(0,10)+'T12:00:00Z')/DAY);
export const daysBetween=(a,b)=>dayNum(b)-dayNum(a);
export const productKey=record=>shoppingIdentity(record?.title||record?.name||'')||String(record?.he||'').trim();
const median=values=>{const s=[...values].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};

// The audience of a list or record: suggestions for a list only use records with exactly the same audience.
export const audienceOf=r=>r.visibility==='private'?'private:'+r.ownerId:r.visibility==='selected'?'selected:'+[...new Set([r.ownerId,...(r.allowedIds||[])])].sort().join(','):'family';
export const sameAudience=(record,list)=>audienceOf(record)===audienceOf(list)||list.visibility==='private'&&record.visibility==='private'&&record.ownerId===list.ownerId;

// Distinct purchase days (YYYY-MM-DD), oldest first; ticks within mergeDays of the previous day count as one.
export function purchaseDays(dates){
 const sorted=[...new Set(dates.filter(Boolean).map(d=>String(d).slice(0,10)))].sort(),out=[];
 for(const d of sorted)if(!out.length||daysBetween(out.at(-1),d)>=RHYTHM.mergeDays)out.push(d);
 return out;
}

// { days, gaps, interval, steady }: interval is the median of the gaps between the last maxDays purchase days.
export function rhythmOf(dates){
 const days=purchaseDays(dates).slice(-RHYTHM.maxDays),gaps=days.slice(1).map((d,i)=>daysBetween(days[i],d));
 if(days.length<RHYTHM.minDays)return {days,gaps,interval:null,steady:false};
 const interval=median(gaps),band=Math.max(interval*RHYTHM.band,RHYTHM.minBand),inside=gaps.filter(g=>Math.abs(g-interval)<=band).length;
 return {days,gaps,interval,steady:interval<=RHYTHM.maxInterval&&inside*2>=gaps.length};
}

// Everything the list can propose for one list on one day. Inputs are the actor's VISIBLE records only.
//  purchases: done purchase records (statistics.purchaseRecords) · marks: shoppingMarks · favourites: approved favourites
//  items: every item on the list · today / shopDate: YYYY-MM-DD (shopDate = planned trip, else today)
//  options: {liked:true} to include favourites.
export function shoppingSuggestions({list,purchases=[],marks=[],favourites=[],items=[],today,shopDate=today,options={}}){
 if(!list)return [];
 const fits=r=>sameAudience(r,list),byKey=new Map(),info=new Map();
 const remember=r=>{const k=productKey(r);if(!k)return null;if(!info.has(k)||r.icon&&r.icon!=='1F6D2')info.set(k,{title:r.title,he:r.he||r.title,icon:r.icon,group:r.group,quantityValue:r.quantityValue,unit:r.unit});return k};
 for(const p of purchases)if(p.done!==false&&fits(p)){const k=remember(p);if(k)byKey.set(k,[...(byKey.get(k)||[]),p.date])}
 const myMarks=marks.filter(fits);
 for(const m of myMarks)if(m.kind==='bought'){const k=m.key||remember(m);remember(m);if(k)byKey.set(k,[...(byKey.get(k)||[]),m.date])}
 const stopped=new Set(myMarks.filter(m=>m.kind==='stop').map(m=>m.key)),later=new Set(myMarks.filter(m=>m.kind==='later'&&m.until&&m.until>today).map(m=>m.key));
 // On the list and not bought, or bought on the list in the last two days (this shop): never proposed again.
 const open=new Set(items.filter(i=>!i.done||i.boughtAt&&daysBetween(String(i.boughtAt).slice(0,10),today)<RHYTHM.mergeDays).map(productKey));
 const blocked=k=>!k||stopped.has(k)||later.has(k)||open.has(k);
 const out=[];
 for(const [key,dates] of byKey){
  if(blocked(key))continue;
  const r=rhythmOf(dates);if(!r.steady)continue;
  const since=daysBetween(r.days.at(-1),shopDate);
  if(since<RHYTHM.due*r.interval)continue;
  const quiet=since>=Math.max(RHYTHM.quietFactor*r.interval,RHYTHM.quietMinDays);
  out.push({key,...info.get(key),kind:quiet?'quiet':'rhythm',interval:r.interval,since,ago:daysBetween(r.days.at(-1),today),days:r.days,score:since/r.interval});
 }
 if(options.liked!==false){
  const seen=new Set(out.map(s=>s.key));
  for(const f of favourites){
   if(f.kind!=='likes'||f.status!=='approved')continue;
   const key=f.key||productKey(f);if(blocked(key)||seen.has(key))continue;
   const last=purchaseDays(byKey.get(key)||[]).at(-1),since=last?daysBetween(last,shopDate):null;
   if(since!==null&&since<RHYTHM.likedDays)continue;
   const s=out.find(x=>x.key===key);if(s){s.likedBy=[...(s.likedBy||[]),f.memberId];continue}
   seen.add(key);out.push({key,title:f.title,he:f.he||f.title,icon:f.icon,group:f.group,kind:'liked',likedBy:[f.memberId],since,ago:last?daysBetween(last,today):null,days:purchaseDays(byKey.get(key)||[]),score:since===null?1:since/RHYTHM.likedDays});
  }
  for(const s of out)if(s.kind!=='liked'){const by=favourites.filter(f=>f.kind==='likes'&&f.status==='approved'&&(f.key||productKey(f))===s.key).map(f=>f.memberId);if(by.length)s.likedBy=by}
 }
 const order={rhythm:0,liked:1,quiet:2};
 return out.sort((a,b)=>order[a.kind]-order[b.kind]||b.score-a.score||String(a.title).localeCompare(String(b.title)));
}

// One short line: "usually every 5 days · bought 6 days ago". name(id) gives a person's name.
const every=(n,he)=>{
 if(n%7===0&&n>=7){const w=n/7;return he?(w===1?'כל שבוע':w===2?'כל שבועיים':'כל '+w+' שבועות'):(w===1?'every week':'every '+w+' weeks')}
 const d=Math.round(n);return he?(d===1?'כל יום':d===2?'כל יומיים':'כל '+d+' ימים'):(d===1?'every day':'every '+d+' days');
};
const ago=(n,he)=>he?(n===0?'היום':n===1?'אתמול':n===2?'לפני יומיים':n===7?'לפני שבוע':'לפני '+n+(n>10?' יום':' ימים')):(n===0?'today':n===1?'yesterday':n===7?'a week ago':n+' days ago');
export function explainSuggestion(s,lang='he',name=id=>id){
 const he=lang==='he',who=(s.likedBy||[]).map(name);
 const liked=who.length?(he?'אהוב על '+who.join(' ו'):(who.length>1?who.join(' and ')+' like it':who[0]+' likes it')):'';
 if(s.kind==='liked')return [liked,(s.ago??s.since)===null?(he?'עוד לא נקנה':'not bought yet'):(he?'לא נקנה '+((s.ago??s.since)===7?'שבוע':(s.ago??s.since)+' ימים'):'not bought for '+(s.ago??s.since)+' days')].join(' · ');
 const base=(he?'בדרך כלל ':'usually ')+every(s.interval,he)+' · '+(s.kind==='quiet'?(he?'עברו '+(s.since>=14?Math.round(s.since/7)+' שבועות':s.since+' ימים'):'it has been '+(s.since>=14?Math.round(s.since/7)+' weeks':s.since+' days')):(he?'נקנה ':'bought ')+ago(s.ago??s.since,he));
 return liked?liked+' · '+base:base;
}
// The dates behind it, for "why": "Bought on 8, 13, 18, 23 and 29 October".
export function explainDates(days,lang='he'){
 if(!days?.length)return '';
 const he=lang==='he',month=d=>new Date(d+'T12:00:00Z').toLocaleDateString(he?'he-IL':'en-GB',{timeZone:'UTC',month:'long'}),groups=[];
 for(const d of days){const m=month(d),n=Number(d.slice(8,10));if(groups.at(-1)?.m===m)groups.at(-1).n.push(n);else groups.push({m,n:[n]})}
 const and=list=>list.length>1?list.slice(0,-1).join(', ')+(he?' ו־':' and ')+list.at(-1):String(list[0]);
 // Days of one month together: "8, 13, 18, 23 ו־29 באוקטובר"; months joined the same way.
 const parts=groups.map((g,i)=>(i<groups.length-1||groups.length===1?and(g.n):g.n.length>1?g.n.slice(0,-1).join(', ')+(he?' ו־':' and ')+g.n.at(-1):String(g.n[0]))+(he?' ב'+g.m:' '+g.m));
 return (he?'נקנה ב־':'Bought on ')+(parts.length>1?parts.slice(0,-1).join(', ')+(he?' ו־':' and ')+parts.at(-1):parts[0]);
}

// Records the three answers create (shoppingMarks). The caller sets id, ownerId and the list's audience.
export function markFor(kind,suggestion,{list,actorId,today,shopDate}){
 const base={kind,key:suggestion.key,title:suggestion.title,he:suggestion.he||suggestion.title,icon:suggestion.icon,group:suggestion.group,listId:list.id,ownerId:actorId,visibility:list.visibility,allowedIds:list.allowedIds||[],date:today,createdAt:new Date().toISOString()};
 if(kind==='later'){const next=shopDate&&shopDate>today?shopDate:null;base.until=next||new Date(Date.parse(today+'T12:00:00Z')+7*DAY).toISOString().slice(0,10)}
 return base;
}

// "New" for items: added in the last 30 minutes, or during the current shop. A shop is running while someone who can see
// the list ticked something in the last 30 minutes; it started at the first of those ticks.
export const NEW_MINUTES=30;
export function shopInProgress(items,now=Date.now()){
 const ticks=items.filter(i=>i.done&&i.boughtAt&&now-Date.parse(i.boughtAt)<=NEW_MINUTES*60000).map(i=>({at:i.boughtAt,by:i.boughtBy})).sort((x,y)=>x.at.localeCompare(y.at));
 if(!ticks.length)return null;
 // Walk back while ticks keep coming within 30 minutes of each other: the start of this shop.
 const all=items.filter(i=>i.done&&i.boughtAt).map(i=>i.boughtAt).sort();let start=ticks[0].at;
 for(let i=all.indexOf(start)-1;i>=0&&Date.parse(start)-Date.parse(all[i])<=NEW_MINUTES*60000;i--)start=all[i];
 return {startedAt:start,by:ticks.at(-1).by,lastAt:ticks.at(-1).at};
}
export function isNewItem(item,shop,now=Date.now()){
 if(item.done||!item.createdAt)return false;
 if(shop&&item.createdAt>=shop.startedAt)return true;
 return now-Date.parse(item.createdAt)<=NEW_MINUTES*60000;
}

// Quick add without AI: "עגבניות, ביצים, 2 פיתות" or "תוסיף מלפפונים ועגבניות" → [{name, quantity}].
const LEAD=/^(?:\/add\b|תוסיפ[וי]?|תוסיף|להוסיף|הוסף|הוסיפי|הוסיפו|add)\s*/i,TAIL=/\s*(?:ל|אל\s+)?(?:רשימת\s+ה?קניות|ה?רשימה|לקניות)\s*$|\s+to\s+(?:the\s+)?(?:shopping\s+)?list\s*$/i;
export function parseQuickAdd(text){
 let s=String(text||'').replace(/\s+/g,' ').trim();if(!s)return [];
 s=s.replace(LEAD,'').replace(/^(?:ל|אל\s+)?(?:רשימת\s+ה?קניות|ה?רשימה|לקניות)\s*:?\s*/,'').replace(TAIL,'').replace(/^[:\-–]\s*/,'');
 const parts=s.split(/\s*[,،;\n]\s*|\s+(?:and|ו)\s+|\s+ו(?=[^\s])/).flatMap(p=>p.split(/\s+ו(?=\S{2,})/)).map(p=>p.trim()).filter(Boolean);
 return parts.slice(0,30).map(p=>{const m=p.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/)||p.match(/^(.+?)\s+[x×]?\s*(\d+(?:[.,]\d+)?)$/);
  if(!m)return {name:p.slice(0,80),quantity:1};const [num,name]=/^\d/.test(m[1])?[m[1],m[2]]:[m[2],m[1]];return {name:name.trim().slice(0,80),quantity:Math.min(1000,Math.max(.01,parseFloat(num.replace(',','.'))||1))}}).filter(p=>p.name.length>=1);
}

// Telegram (and any channel) while someone shops, planned from the recipient's VISIBLE state only:
//  · to whoever is shopping (ticked something in the last 30 minutes): every item someone else added since the shop began;
//  · to the other adults who can see the list: one "X is shopping now" when a shop begins (within 10 minutes of its start).
// Each has a stable key, so it is sent once. Personal switch: shoppingByUser[me].addsMessage (default on).
export function shopUpdates(visible,memberId,{now=Date.now(),role='parent'}={}){
 if(visible.preferences?.shoppingByUser?.[memberId]?.addsMessage===false)return [];
 const out=[];
 for(const list of (visible.shoppingLists||[]).filter(l=>l.status==='active')){
  const items=(visible.shopping||[]).filter(i=>(i.listId||'week')===list.id),shop=shopInProgress(items,now);if(!shop)continue;
  const shoppers=new Set(items.filter(i=>i.done&&i.boughtAt&&now-Date.parse(i.boughtAt)<=NEW_MINUTES*60000).map(i=>i.boughtBy));
  if(shoppers.has(memberId)){for(const item of items)if(!item.done&&item.createdAt&&item.createdAt>=shop.startedAt&&item.createdBy&&item.createdBy!==memberId)out.push({key:'shopadd:'+item.id,type:'shopping',kind:'added',list,item,by:item.createdBy})}
  else if(role!=='child'&&now-Date.parse(shop.startedAt)<=10*60000)out.push({key:'shopstart:'+list.id+':'+shop.startedAt,type:'shopping',kind:'started',list,by:shop.by,left:items.filter(i=>!i.done).length});
 }
 return out;
}
// The shop planned for today (a "Plan a trip" task), for the morning summary. Switch: shoppingByUser[me].dayMessage.
export function shopToday(visible,memberId,date){
 if(visible.preferences?.shoppingByUser?.[memberId]?.dayMessage===false)return null;
 const trip=(visible.tasks||[]).find(t=>t.kind==='shopping-trip'&&t.date===date&&!t.done&&!(t.completions||{})[date]);if(!trip)return null;
 const list=(visible.shoppingLists||[]).find(l=>l.id===trip.shoppingListId&&l.status==='active');return list?{trip,list}:null;
}
