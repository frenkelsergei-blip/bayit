// "Changes to things assigned to me" (user request 2026-11-08): when SOMEONE ELSE deletes an event, task or routine
// assigned to a person, moves it (date/time), renames it, changes its place, or removes the person from it, that
// person is told on Telegram, Push and in the in-app inbox. The household server records one notice per recipient
// at the moment it accepts the change (app/cloud/state.mjs applyChanges); a person only ever reads their own notices.
// Quick successive edits to one item are grouped (2 minutes of quiet) into one message. The person who made the
// change gets a silent notice only, used to correct reminders already sent to them.

export const CHANGE_QUIET_MS=2*60000,CHANGE_KEEP_MS=14*86400000,CHANGE_DELIVER_MS=3*86400000,MAX_CHANGE_NOTICES=300;
const COLLECTIONS=['events','tasks'];
const assignees=(collection,r)=>collection==='events'?(r.memberIds||[]):Array.isArray(r.memberIds)&&r.memberIds.length?r.memberIds:r.memberId?[r.memberId]:[];
const place=r=>{const l=r?.location;return typeof l==='string'?l:l?.label||l?.address||''};
export const changeSummary=(collection,r)=>({title:r.title||'',he:r.he||'',date:r.date||'',time:r.time||'',place:place(r),icon:r.icon||'',repeat:r.repeat||'once',kind:collection==='events'?'event':r.routine?'routine':'task'});
const FIELDS=['date','time','place','title','he'];
const differs=(a,b)=>FIELDS.some(k=>(a?.[k]||'')!==(b?.[k]||''));

// before/after: whole household states. canSee(record, memberId, collection) is the app's access rule (record-audience canSeeRecord) (passed in to keep this
// module free of app imports). Only people who could see the item before are told; titles never reach anyone else.
export function changeNoticesFor(before,after,actorId,canSee,{at=new Date()}={}){
 const out=[],iso=at.toISOString();let n=0;
 for(const collection of COLLECTIONS){
  const next=new Map((after[collection]||[]).map(r=>[r.id,r]));
  for(const old of before[collection]||[]){
   const now=next.get(old.id);if(now&&!differs(changeSummary(collection,old),changeSummary(collection,now))&&JSON.stringify(assignees(collection,old))===JSON.stringify(assignees(collection,now))&&now.visibility===old.visibility&&JSON.stringify(now.allowedIds||[])===JSON.stringify(old.allowedIds||[]))continue;
   for(const recipientId of new Set(assignees(collection,old))){
    if(!canSee(old,recipientId,collection))continue;
    const stays=now&&assignees(collection,now).includes(recipientId)&&canSee(now,recipientId,collection);
    const type=!now?'deleted':!stays?'removed':differs(changeSummary(collection,old),changeSummary(collection,now))?'changed':null;if(!type)continue;
    out.push({id:at.getTime().toString(36)+'-'+(n++)+'-'+Math.random().toString(36).slice(2,8),at:iso,recipientId,actorId,collection,itemId:old.id,type,before:changeSummary(collection,old),after:type==='changed'?changeSummary(collection,now):null,...(recipientId===actorId?{self:true}:{})});
   }
  }
 }
 return out;
}
// Keeps the household's notice list small: two weeks, at most MAX_CHANGE_NOTICES.
export const pruneChangeNotices=(list,now=Date.now())=>(list||[]).filter(n=>now-Date.parse(n.at)<CHANGE_KEEP_MS).slice(-MAX_CHANGE_NOTICES);

// Groups one person's notices into bursts per item (a gap under 2 minutes joins the burst). A burst is ready once it
// has been quiet for 2 minutes; it merges into one change from the first "before" to the last "after".
// Keyed by its newest notice: a burst that grows after it was delivered is delivered again, merged.
// Returns [{key, collection, itemId, type, before, after, actorIds, at, ready}] newest first; net no-change bursts drop.
export function changeBursts(notices,recipientId,{now=Date.now(),includeSelf=false}={}){
 const mine=(notices||[]).filter(n=>n.recipientId===recipientId&&(includeSelf||!n.self)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),groups=[],open=new Map();
 for(const n of mine){const id=n.collection+':'+n.itemId,g=open.get(id),t=Date.parse(n.at);if(g&&t-g.last<CHANGE_QUIET_MS){g.items.push(n);g.last=t}else{const fresh={items:[n],last:t};open.set(id,fresh);groups.push(fresh)}}
 const out=[];
 for(const g of groups){const first=g.items[0],last=g.items.at(-1),type=last.type;
  const self=g.items.every(i=>i.self),merged={key:'change:'+last.id,collection:first.collection,itemId:first.itemId,type,before:first.before,after:last.type==='changed'?last.after:null,actorIds:[...new Set(g.items.map(i=>i.actorId).filter(id=>self||id!==recipientId))],at:last.at,self,ready:now-g.last>=CHANGE_QUIET_MS};
  if(merged.type==='changed'&&!differs(merged.before,merged.after))continue;
  out.push(merged);
 }
 return out.reverse();
}
// Bursts to deliver now: ready, not older than 3 days (a delay for quiet hours is fine; a week-old change is not news).
export const readyChangeBursts=(notices,recipientId,opts={})=>changeBursts(notices,recipientId,opts).filter(b=>b.ready&&(opts.now??Date.now())-Date.parse(b.at)<CHANGE_DELIVER_MS);

// ---- Wording (Telegram, Push and the inbox) ----
const L=(lang,en,he)=>lang==='he'?he:en;
const titleOf=(s,lang)=>(lang==='he'?s.he||s.title:s.title||s.he)||'';
export function changeWhen(s,lang){
 if(!s?.date)return '';
 const day=new Date(s.date+'T12:00:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
 return day+(/^\d{2}:\d{2}$/.test(s.time||'')?(lang==='he'?' ב־':' ')+s.time:'');
}
// {icon, headline, title, lines:[...]} for one burst. name(id) gives a person's name in the reader's language.
export function describeChange(burst,lang,name){
 const by=burst.actorIds.map(name).filter(Boolean).join(', ')||L(lang,'someone','מישהו'),b=burst.before,a=burst.after,was=changeWhen(b,lang),title=titleOf(a||b,lang);
 if(burst.type==='deleted')return {icon:'🗑️',headline:L(lang,'Deleted by '+by,'נמחק על ידי '+by),title:titleOf(b,lang),lines:was?[L(lang,'Was ','היה ')+was]:[]};
 if(burst.type==='removed')return {icon:'👤',headline:L(lang,'Removed you · by '+by,'הוסרתם · על ידי '+by),title:titleOf(b,lang),lines:was?[was]:[]};
 const lines=[],moved=(b.date||'')!==(a.date||'')||(b.time||'')!==(a.time||'');
 if(moved)lines.push(changeWhen(a,lang)+' ('+L(lang,'was ','היה ')+(was||L(lang,'no date','בלי תאריך'))+')');
 if(titleOf(b,lang)!==titleOf(a,lang))lines.push(L(lang,'New name · was ','שם חדש · היה ')+titleOf(b,lang));
 if((b.place||'')!==(a.place||''))lines.push(L(lang,'Place: ','מקום: ')+(a.place||L(lang,'none','ללא'))+(b.place?' ('+L(lang,'was ','היה ')+b.place+')':''));
 const only=lines.length===1;
 return {icon:'✏️',headline:moved&&only?L(lang,'Moved by '+by,'הועבר על ידי '+by):L(lang,'Changed by '+by,'שונה על ידי '+by),title,lines};
}
