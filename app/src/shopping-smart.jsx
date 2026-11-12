// The smarter shopping list, concept C (chosen 2026-11-11; concept/explorations/shopping-20261111/, round 2).
// One card above a clean list ("Before the shop: N suggestions") opens a one-at-a-time review: Add, Already bought,
// Not this time, Stop suggesting. Suggestions are plain arithmetic from the family's own ticks (shared/shopping-rhythm.mjs);
// no AI. A quiet date line shows the next shop; while someone shops, items added since then sit on top.
// Styles: shopping-smart.css. Everything is written as ordinary household records and synced like the rest.
import React,{useMemo,useState} from 'react';
import {Cards,Plus,BagSimple,Clock,BellSlash,X,CheckCircle,HandWaving,Heart,ProhibitInset,GearSix,CalendarCheck,Info,Check,Camera,Storefront,ListChecks,CreditCard,Receipt,Warning,CaretDown,Question,LockSimple,ClockCounterClockwise,PencilSimple} from '@phosphor-icons/react';
import {FormSection} from './form-section.jsx';
import {PersonChip} from './person-chip';
import {purchaseRecords} from './statistics';
import {anchor} from './data';
import {cloudHeaders} from './cloud-transport.js';
import {matchLines,rememberedNames,priceHistory,productId,groceriesMonth,matchExpense} from '../../shared/shopping-receipt.mjs';
import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
import {tripFor,ShoppingTripControl} from './shopping-trip';
import {matchItem} from '../../shared/item-dictionary.mjs';
import {noteRows} from '../../shared/shopping-note.mjs';
import {itemAudience,canAccessList} from '../../shared/shopping-lists.mjs';
import {shopsOf,shopSummary,PAGE} from '../../shared/shopping-history.mjs';
import {shoppingSuggestions,explainSuggestion,explainDates,markFor,productKey,shopInProgress,sameAudience} from '../../shared/shopping-rhythm.mjs';

const DEFAULTS={suggest:true,liked:true,requests:true,dayMessage:true,addsMessage:true};
export const shoppingPrefs=a=>({...DEFAULTS,...(a.data.preferences?.shoppingByUser?.[a.user]||{})});
export function setShoppingPref(a,key,value){a.update(d=>{const all=d.preferences.shoppingByUser||{};d.preferences.shoppingByUser={...all,[a.user]:{...DEFAULTS,...(all[a.user]||{}),[key]:value}}})}

const dayWord=(a,date)=>{
 const diff=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(anchor+'T12:00:00Z'))/86400000);
 if(diff===0)return a.T('today','היום');if(diff===1)return a.T('tomorrow','מחר');
 const d=new Date(date+'T12:00:00Z');
 return diff>1&&diff<7?d.toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{timeZone:'UTC',weekday:'long'}):d.toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{timeZone:'UTC',day:'numeric',month:'long'});
};

// What the list proposes, the children's requests a parent decides on, and the shop in progress.
export function useShoppingSmart(a,list,items){
 const prefs=shoppingPrefs(a),child=a.member(a.user)?.role==='child',parent=a.member(a.user)?.role==='parent';
 const trip=list?tripFor(a.data,list.id):null,shopDate=trip?.date&&trip.date>=anchor?trip.date:anchor;
 const favourites=a.visible(a.data.favourites||[]),marks=a.visible(a.data.shoppingMarks||[]);
 const suggestions=useMemo(()=>!list||!prefs.suggest||list.status!=='active'?[]:shoppingSuggestions({list,purchases:purchaseRecords(a.data,a.user,list.visibility==='private'?'private':'family','all',anchor),marks,favourites,items,today:anchor,shopDate,options:{liked:prefs.liked}}),
  [list,items,a.data.purchases,a.data.shoppingMarks,a.data.favourites,prefs.suggest,prefs.liked,shopDate]);
 const requests=parent&&prefs.requests&&list?favourites.filter(f=>f.status==='requested'&&a.member(f.memberId)?.role==='child'&&sameAudience(f,list)):[];
 const shop=list?shopInProgress(items):null;
 const free=child&&(a.data.preferences?.shoppingNoApproval||[]).includes(a.user);
 return {prefs,child,parent,free,trip,shopDate,suggestions,requests,shop,favourites,marks};
}

const newItem=(a,list,s,quantity,extra={})=>{const match=matchItem(s.title||''),unit=s.unit||'items';return {id:crypto.randomUUID(),title:s.title,he:s.he||s.title,listId:list.id,quantityValue:quantity,unit,quantity:quantity+' '+unit,group:s.group||match.group,icon:s.icon||match.icon,done:false,memberId:a.user,ownerId:a.user,...itemAudience(list,a.user),createdAt:new Date().toISOString(),createdBy:a.user,...extra}};
const onList=(d,list,key)=>(d.shopping||[]).some(i=>(i.listId||'week')===list.id&&!i.done&&productKey(i)===key);

// ---------- the card above the list ----------
export function SmartCard({a,smart,onOpen,onAsk}){
 if(smart.child)return <button type="button" className="ss-card ss-card-ask" data-keep-clear onClick={onAsk}><HandWaving size={26} weight="bold" aria-hidden="true"/><span><strong>{a.T('Would you like something?','בא לך משהו?')}</strong><small>{smart.free?a.T('What you choose is suggested before the next shop.','מה שבוחרים כאן יוצע לפני הקנייה הבאה.'):a.T('Ask, and a parent says yes or no.','מבקשים, והורה מאשר.')}</small></span><span className="button ss-small">{smart.free?a.T('Choose','לבחור'):a.T('Ask','לבקש')}</span></button>;
 const n=smart.suggestions.length+smart.requests.length;if(!n)return null;
 const names=smart.suggestions.slice(0,3).map(s=>a.lang==='he'?s.he||s.title:s.title),more=smart.suggestions.length-names.length;
 const req=smart.requests.length?(a.lang==='he'?(smart.requests.length===1?'בקשה אחת':smart.requests.length+' בקשות')+' של '+[...new Set(smart.requests.map(r=>a.name(r.memberId)))].join(' ו'):(smart.requests.length===1?'one request':smart.requests.length+' requests')+' from '+[...new Set(smart.requests.map(r=>a.name(r.memberId)))].join(' and ')):'';
 const line=[names.length?names.join(a.lang==='he'?', ':', ')+(more>0?a.T(' and '+more+' more',' ועוד '+more):''):'',req].filter(Boolean).join(' · ');
 return <button type="button" className="ss-card" data-keep-clear onClick={onOpen}><Cards size={26} weight="bold" aria-hidden="true"/><span><strong>{a.T('Before the shop: '+n+(n===1?' suggestion':' suggestions'),'לפני הקנייה: '+(n===1?'הצעה אחת':n+' הצעות'))}</strong><small>{line}</small></span><span className="button ss-small">{a.T('Check','לבדוק')}</span></button>;
}

// ---------- the quiet line: next shop, or someone shopping now ----------
export function DateLine({a,list,smart,ui,onFinish}){
 if(!list||list.status!=='active')return null;
 if(smart.shop){const t=new Date(smart.shop.startedAt).toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit'});
  return <div className="ss-line ss-line-now" role="status" data-keep-clear><span className="ss-line-face"><ui.Avatar who={smart.shop.by} size={30}/></span><span><b>{smart.shop.by===a.user?a.T('You started shopping','התחלת קנייה'):a.T(a.name(smart.shop.by)+' is shopping now',a.name(smart.shop.by)+' בקניות עכשיו')}</b> · {a.T('since '+t,'מ־'+t)}</span>{onFinish?<button type="button" className="button ss-small" onClick={onFinish}>{a.T('Finish','לסיים')}</button>:<i className="ss-live" aria-hidden="true"/>}</div>}
 const trip=smart.trip;if(!trip||!trip.date||trip.date<anchor)return null;
 return <div className="ss-line" data-keep-clear><CalendarCheck size={24} aria-hidden="true"/><span><b>{a.T('Next shop: ','הקנייה הבאה: ')+dayWord(a,trip.date)+(trip.time?', '+trip.time:'')}</b>{trip.memberId&&<small className="ss-line-who">{a.T('Who goes: ','מי הולך: ')+a.name(trip.memberId)}</small>}</span><ShoppingTripControl app={a} list={list} anchor={anchor} className="text-link ss-line-change" text={a.T('Change','שינוי')} ui={ui}/></div>;
}

// ---------- shared window frame (full screen on phones, centred on larger screens) ----------
function Window({a,title,onClose,children,actions,className=''}){
 return <div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className={'tasks-sheet ss-window '+className} role="dialog" aria-modal="true" aria-label={title}>
  <header><h2>{title}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={onClose}><X size={20}/></button></header>
  <div className="tasks-sheet-body">{children}</div>{actions&&<div className="tasks-sheet-actions">{actions}</div>}</div></div>;
}

// ---------- the review, one at a time ----------
export function ReviewWindow({a,ui,list,smart,onClose,onSettings}){
 const {Icon,Button}=ui;
 const [queue]=useState(()=>[...smart.requests.map(r=>({...r,isRequest:true,key:r.key||productKey(r)})),...smart.suggestions]);
 const [index,setIndex]=useState(0),[qty,setQty]=useState(null),[done,setDone]=useState({added:[],bought:[],later:[],stopped:[],approved:[]});
 const current=queue[index],next=(bucket,s)=>{setDone(d=>({...d,[bucket]:[...d[bucket],s]}));setQty(null);setIndex(i=>i+1)};
 const name=s=>a.lang==='he'?s.he||s.title:s.title,quantityOf=s=>qty??(Number(s.quantityValue)||1);
 const add=s=>{const q=quantityOf(s);a.update(d=>{if(!onList(d,list,s.key))d.shopping.push(newItem(a,list,s,q,{source:'suggested'}))});next('added',s)};
 const mark=(kind,s)=>{a.update(d=>{(d.shoppingMarks??=[]).push({id:crypto.randomUUID(),...markFor(kind,s,{list,actorId:a.user,today:anchor,shopDate:smart.shopDate})})});next(kind==='bought'?'bought':kind==='later'?'later':'stopped',s)};
 const decide=(s,yes)=>{a.update(d=>{const f=(d.favourites||[]).find(x=>x.id===s.id);if(!f)return;if(yes){f.status='approved';if(!onList(d,list,s.key))d.shopping.push(newItem(a,list,s,quantityOf(s),{memberId:s.memberId,source:'request'}))}else d.favourites=d.favourites.filter(x=>x.id!==s.id)});next(yes?'approved':'later',s)};
 const cnt=(n,en1,enN,he1,heN)=>a.T(n+' '+(n===1?en1:enN),n===1?he1:n+' '+heN);
 if(!current){const row=(icon,label,list)=>list.length?<div className="ss-sum">{icon}<span><strong>{label}</strong><small>{list.map(name).join(a.lang==='he'?', ':', ')}</small></span></div>:null;
  return <Window a={a} title={a.T('All done','סיימנו')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('To the list','לרשימה')}</Button>}>
   <div className="ss-big ss-done"><CheckCircle size={72} weight="fill"/><h3>{a.T('The list is ready','הרשימה מוכנה')}</h3></div>
   {row(<Plus size={24}/>,cnt(done.added.length,'item added to the list','items added to the list','פריט אחד נוסף לרשימה','נוספו לרשימה'),done.added)}
   {row(<HandWaving size={24}/>,cnt(done.approved.length,'request approved','requests approved','בקשה אחת אושרה','בקשות אושרו'),done.approved)}
   {row(<BagSimple size={24}/>,cnt(done.bought.length,'already bought','already bought','אחד כבר נקנה','כבר נקנו'),done.bought)}
   {row(<Clock size={24}/>,cnt(done.later.length,'not this time','not this time','אחד לא הפעם','לא הפעם'),done.later)}
   {row(<BellSlash size={24}/>,cnt(done.stopped.length,'no longer suggested','no longer suggested','אחד לא יוצע יותר','לא יוצעו יותר'),done.stopped)}
  </Window>}
 const why=current.isRequest?a.T('Asked by '+a.name(current.memberId),'בקשה של '+a.name(current.memberId)):explainSuggestion(current,a.lang,a.name);
 const q=quantityOf(current);
 return <Window a={a} title={a.T('Before the shop','לפני הקנייה')} onClose={onClose} className="ss-review">
  <div className="ss-dots" aria-label={a.T(index+1+' of '+queue.length,(index+1)+' מתוך '+queue.length)}>{queue.map((_,i)=><i key={i} className={i<index?'done':i===index?'now':''}/>)}<b>{a.T((index+1)+' of '+queue.length,(index+1)+' מתוך '+queue.length)}</b></div>
  <div className="ss-big"><Icon code={current.icon||matchItem(current.title||'').icon} size={104}/><h3>{name(current)}</h3><p>{why}</p>{!current.isRequest&&current.days?.length>0&&<span className="ss-dates">{explainDates(current.days,a.lang)}</span>}
   <div className="ss-qty"><button type="button" className="icon-button" aria-label={a.T('Less','פחות')} onClick={()=>setQty(Math.max(1,q-1))}>−</button><b>{q}</b><button type="button" className="icon-button" aria-label={a.T('More','יותר')} onClick={()=>setQty(q+1)}>+</button></div></div>
  {current.isRequest?<div className="ss-big-acts"><Button icon={Check} onClick={()=>decide(current,true)}>{a.T('Yes, add it','כן, להוסיף לרשימה')}</Button><Button secondary onClick={()=>decide(current,false)}>{a.T('Not this time','לא הפעם')}</Button></div>
  :<div className="ss-big-acts"><Button icon={Plus} onClick={()=>add(current)}>{a.T('Add to the list','להוסיף לרשימה')}</Button><Button secondary icon={BagSimple} onClick={()=>mark('bought',current)}>{a.T('Already bought','כבר קנינו')}</Button><Button secondary icon={Clock} onClick={()=>mark('later',current)}>{a.T('Not this time','לא הפעם')}</Button>
   <button type="button" className="text-link ss-stop" onClick={()=>mark('stop',current)}><BellSlash size={18}/>{a.T('Stop suggesting '+name(current),'להפסיק להציע '+name(current))}</button></div>}
  <button type="button" className="text-link ss-settings-link" onClick={onSettings}><GearSix size={18}/>{a.T('Suggestion settings','הגדרות ההצעות')}</button>
 </Window>;
}

// ---------- Settings › Shopping (personal switches, and what we no longer suggest) ----------
const OnlyMe=({a})=><span className="badge lilac ss-only"><LockSimple size={14} weight="bold" aria-hidden="true"/>{a.T('Only me','רק אני')}</span>;
const Switch=({on,label,onChange})=><button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch'+(on?' on':'')} onClick={()=>onChange(!on)}><span/></button>;
export function SettingsWindow({a,ui,list,smart,onClose,onFavourites}){
 const {Icon,Button}=ui,p=smart.prefs;
 const row=(key,title,sub)=><div className="ss-sw" key={key}><span><strong>{title}</strong>{sub&&<small>{sub}</small>}</span><Switch on={p[key]} label={title} onChange={v=>setShoppingPref(a,key,v)}/></div>;
 const stopped=smart.marks.filter(m=>m.kind==='stop'&&(!list||sameAudience(m,list)));
 const kids=a.members.filter(m=>m.role==='child'),noOK=a.data.preferences?.shoppingNoApproval||[];
 return <Window a={a} title={a.T('Settings · Shopping','הגדרות · קניות')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('Done','סיום')}</Button>}>
  <FormSection T={a.T} icon={Cards} tone="green" title={a.T('Suggestions before the shop','הצעות לפני הקנייה')}>
   {row('suggest',a.T('Suggest what to buy','להציע מה לקנות'),a.T('From what you usually buy. No AI. Off: no card on the list at all.','לפי מה שאתם קונים בדרך כלל. בלי AI. כבוי: אין כרטיס ברשימה בכלל.'))}
   {row('liked',a.T('Suggest what people like','להציע את מה שאוהבים בבית'),a.T('What each person marked as liked','מה שכל אחד סימן שהוא אוהב'))}
   {smart.parent&&row('requests',a.T('Children’s requests','בקשות של הילדים'),a.T('A child asks, a parent decides','ילד מבקש, הורה מאשר'))}
   <button type="button" className="text-link ss-fav-link" onClick={onFavourites}><Heart size={18}/>{a.T('Liked at home','אהובים בבית')}</button>
  </FormSection>
  {smart.parent&&kids.length>0&&<FormSection T={a.T} icon={HandWaving} tone="yellow" title={a.T('What the children ask for','מה הילדים מבקשים')}>
   {kids.map(k=>{const needs=!noOK.includes(k.id),n=a.name(k.id);return <div className="ss-sw ss-sw-face" key={k.id}><span className="ss-line-face"><ui.Avatar who={k.id} size={34}/></span><span><strong>{a.T(n+': needs a parent’s OK',n+': צריך אישור של הורה')}</strong><small>{needs?a.T('What '+n+' asks for waits for a parent','הבקשות של '+n+' מחכות שהורה יאשר'):a.T('Off: what '+n+' asks for goes straight into their favourites and is suggested before the shop','כבוי: הבקשות של '+n+' נכנסות ישר לאהובים ומוצעות לפני הקנייה')}</small></span><Switch on={needs} label={a.T(n+': needs a parent’s OK',n+': צריך אישור של הורה')} onChange={v=>a.update(d=>{const cur=(d.preferences.shoppingNoApproval||[]).filter(id=>id!==k.id);d.preferences.shoppingNoApproval=v?cur:[...cur,k.id]})}/></div>})}
   <p className="ss-fine">{a.T('Only a parent changes this. A child never sees prices or receipts.','רק הורה משנה את זה. ילד אף פעם לא רואה מחירים וקבלות.')}</p>
  </FormSection>}
  <FormSection T={a.T} icon={BellSlash} tone="lilac" title={a.T('Not suggested','לא מציעים')}>
   {stopped.length?stopped.map(m=><div className="ss-like" key={m.id}><Icon code={m.icon||matchItem(m.title||'').icon} size={36}/><span className="ss-text"><strong>{a.lang==='he'?m.he||m.title:m.title}</strong><small>{a.T('Stopped by '+a.name(m.ownerId)+' · '+m.date,'הופסק על ידי '+a.name(m.ownerId)+' · '+new Date(m.date+'T12:00:00Z').toLocaleDateString('he-IL',{timeZone:'UTC',day:'numeric',month:'long'}))}</small></span><Button secondary className="button secondary ss-small" onClick={()=>a.remove('shoppingMarks',m.id,a.lang==='he'?m.he||m.title:m.title)}>{a.T('Bring back','להחזיר')}</Button></div>)
   :<p className="ss-fine">{a.T('Nothing yet. "Stop suggesting" in the review puts a product here.','עוד אין. "להפסיק להציע" בבדיקה שם מוצר כאן.')}</p>}
  </FormSection>
  <FormSection T={a.T} icon={CalendarCheck} tone="blue" title={a.T('Shop day','יום הקנייה')}>
   {row('dayMessage',a.T('Telegram message on shop day','הודעה בטלגרם ביום הקנייה'),a.T('In the morning, to whoever is going','בבוקר, למי שהולך לקניות'))}
   {row('addsMessage',a.T('Telegram: what is added while I shop','טלגרם: מה שנוסף בזמן שאני בקניות'),a.T('And one message when someone else starts shopping','והודעה אחת כשמישהו אחר מתחיל לקנות'))}
  </FormSection>
 </Window>;
}

// ---------- Liked at home: each person's likes and "doesn't eat"; children ask ----------
export function FavouritesWindow({a,ui,list,smart,onClose}){
 const {Icon,Button,Avatar}=ui,members=a.members,me=a.user;
 const [who,setWho]=useState(smart.child?me:(members.find(m=>m.role==='child')?.id||me)),[text,setText]=useState(''),[kind,setKind]=useState('likes'),[onlyMe,setOnlyMe]=useState(false);
 const canHide=!smart.child&&who===me;
 const mine=smart.favourites.filter(f=>f.memberId===who),requests=mine.filter(f=>f.status==='requested'),likes=mine.filter(f=>f.status==='approved'&&f.kind==='likes'),avoid=mine.filter(f=>f.status==='approved'&&f.kind==='avoid');
 const vis=list?{visibility:list.visibility==='private'?'family':list.visibility,allowedIds:list.visibility==='selected'?list.allowedIds||[]:[]}:{visibility:'family',allowedIds:[]};
 const name=f=>a.lang==='he'?f.he||f.title:f.title;
 const save=e=>{e.preventDefault();const t=text.trim();if(!t)return;const m=matchItem(t);a.update(d=>{(d.favourites??=[]).push({id:crypto.randomUUID(),kind:smart.child?'likes':kind,status:smart.child&&!smart.free?'requested':'approved',memberId:who,ownerId:me,...(canHide&&onlyMe?{visibility:'private',allowedIds:[]}:vis),title:t,he:t,key:productKey({title:t}),icon:m.icon,group:m.group,createdAt:new Date().toISOString()})});setText('');a.notify(smart.child&&!smart.free?a.T('Asked. A parent will decide.','ביקשת. הורה יחליט.'):smart.child?a.T('Saved. It will be suggested before the shop.','נשמר. יוצע לפני הקנייה.'):a.T('Saved.','נשמר.'))};
 const addToList=f=>{if(!list)return;a.update(d=>{if(!onList(d,list,f.key||productKey(f)))d.shopping.push(newItem(a,list,f,1,{memberId:f.memberId}))});a.notify(a.T('Added to the list.','נוסף לרשימה.'))};
 const decide=(f,yes)=>a.update(d=>{const x=(d.favourites||[]).find(r=>r.id===f.id);if(!x)return;if(yes)x.status='approved';else d.favourites=d.favourites.filter(r=>r.id!==f.id)});
 const remove=f=>{if(smart.child&&f.memberId!==me)return;a.remove('favourites',f.id,name(f))};
 const line=f=>{const last=(a.data.purchases||[]).filter(p=>p.done&&productKey(p)===(f.key||productKey(f))).map(p=>p.date).sort().at(-1);if(!last)return a.T('Not bought yet','עוד לא נקנה');const n=Math.round((Date.parse(anchor+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000);return n<=0?a.T('Bought today','נקנה היום'):a.T('Bought '+n+' days ago',n===1?'נקנה אתמול':n===7?'נקנה לפני שבוע':'נקנה לפני '+n+' ימים')};
 const person=a.name(who);
 return <Window a={a} title={smart.child?a.T('My favourites','האהובים שלי'):a.T('Liked at home','אהובים בבית')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  {!smart.child&&<><p className="tasks-sheet-hint ss-hint"><Info size={18}/><span>{a.T('What each person likes is suggested when it hasn’t been bought for a week. The whole family sees it, except what you marked "only me".','מה שכל אחד אוהב מוצע כשלא נקנה שבוע. כל המשפחה רואה, חוץ ממה שסימנתם "רק אני".')}</span></p>
   <div className="tasks-sheet-people ss-people" role="radiogroup" aria-label={a.T('Whose','של מי')}>{members.map(m=><PersonChip key={m.id} role="radio" who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} size={40} selected={who===m.id} onClick={()=>setWho(m.id)}/>)}</div></>}
  <FormSection T={a.T} icon={Heart} tone="peach" title={smart.child?a.T('Mine','שלי'):a.T(person+' likes','אהוב על '+person)}>
   {requests.map(f=><div className="ss-like ss-pending" key={f.id}><Icon code={f.icon} size={40}/><span className="ss-text"><strong>{name(f)}</strong><small>{a.T('Asked · waiting for a parent','בקשה · מחכה לאישור של הורה')}</small></span>{smart.parent?<span className="ss-acts"><Button secondary className="button secondary ss-small" onClick={()=>decide(f,false)}>{a.T('No','לא')}</Button><Button className="button ss-small" icon={Check} onClick={()=>decide(f,true)}>{a.T('Approve','אישור')}</Button></span>:<span className="badge yellow">{a.T('Waiting','מחכה')}</span>}</div>)}
   {likes.map(f=><div className="ss-like" key={f.id}><Icon code={f.icon} size={40}/><span className="ss-text"><strong>{name(f)}{f.visibility==='private'&&<OnlyMe a={a}/>}</strong><small>{line(f)}{f.visibility==='private'?a.T(' · only you see it, suggested in "My shopping"',' · גלוי רק לך, מוצע ב"הקניות שלי"'):''}</small></span><span className="ss-acts">{list&&!smart.child&&<button type="button" className="ss-add" aria-label={a.T('Add to the list','הוספה לרשימה')} onClick={()=>addToList(f)}><Plus size={22} weight="bold"/></button>}<button type="button" className="icon-button ss-heart" aria-label={a.T('Remove from favourites','הסרה מהאהובים')} onClick={()=>remove(f)}><Heart size={22} weight="fill"/></button></span></div>)}
   {!requests.length&&!likes.length&&<p className="ss-fine">{a.T('Nothing yet.','עוד אין.')}</p>}
  </FormSection>
  {!smart.child&&<FormSection T={a.T} icon={ProhibitInset} tone="lilac" title={a.T('Not for '+person,'לא בשביל '+person)}>
   {avoid.map(f=><div className="ss-like" key={f.id}><Icon code={f.icon} size={40}/><span className="ss-text"><strong>{name(f)}{f.visibility==='private'&&<OnlyMe a={a}/>}</strong></span><button type="button" className="icon-button" aria-label={a.T('Remove','הסרה')} onClick={()=>remove(f)}><X size={20}/></button></div>)}
   <p className="ss-fine">{a.T('A preference, not medical information. Bayit does not check allergies.','זו העדפה, לא מידע רפואי. Bayit לא בודק אלרגיות.')}</p>
  </FormSection>}
  <form className="ss-addlike" onSubmit={save}>
   {!smart.child&&<div className="shop2-seg ss-kind" role="group">{[['likes',a.T('Likes','אהוב')],['avoid',a.T('Not for','לא בשביל')]].map(([k,t])=><button type="button" key={k} className={kind===k?'on':''} aria-pressed={kind===k} onClick={()=>setKind(k)}>{t}</button>)}</div>}
   <input maxLength={80} value={text} onChange={e=>setText(e.target.value)} placeholder={smart.child?a.T('What would you like? e.g. cornflakes','מה בא לך? למשל קורנפלקס'):a.T('e.g. bananas','למשל בננות')} aria-label={a.T('Product','מוצר')}/>
   <Button type="submit" icon={Plus}>{smart.child&&!smart.free?a.T('Ask','לבקש'):a.T('Add','הוספה')}</Button>
  </form>
  {canHide&&<div className="ss-sw ss-onlyme"><span><strong>{a.T('Only me','רק אני')}</strong><small>{a.T('Not shown to the rest of the family. Suggested only on "My shopping".','לא מוצג לשאר המשפחה. מוצע רק ברשימה "הקניות שלי".')}</small></span><Switch on={onlyMe} label={a.T('Only me','רק אני')} onChange={setOnlyMe}/></div>}
 </Window>;
}

// ---------- receipts and prices (adults only; reading needs the household's own AI helper) ----------
let financeOnce=null;
const useGroceries=a=>{const [tx,setTx]=useState(null);React.useEffect(()=>{if(!a.cloud||a.member(a.user)?.role==='child'||a.features?.on?.('expenses')===false)return;financeOnce??=fetch('/api/finance/data',{headers:cloudHeaders()}).then(r=>r.ok?r.json():null).catch(()=>null);financeOnce.then(d=>setTx(d?.transactions||[]))},[a.cloud]);return tx};
const money=(a,n)=>(Math.round(n*100)/100).toLocaleString(a.lang==='he'?'he-IL':'en-GB',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})+' ₪';
const longDate=(a,d)=>d?new Date(d+'T12:00:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{timeZone:'UTC',day:'numeric',month:'long'}):'';

export function DoneCard({a,onReceipt,title}){return <div className="ss-donecard" data-keep-clear><CheckCircle size={30} weight="fill" aria-hidden="true"/><span><strong>{title||a.T('Everything is in the bag','הכל נאסף')}</strong><small>{a.T('Photograph the receipt to keep the prices of this shop.','אפשר לצלם את הקבלה ולשמור את המחירים של הקנייה הזו.')}</small></span><button type="button" className="button ss-small" onClick={onReceipt}><Camera size={20}/>{a.T('Photograph receipt','לצלם קבלה')}</button></div>}

export function ReceiptWindow({a,ui,list:asked,items,onClose,shop:forShop}){
 // Which shop the receipt belongs to: the one it is attached to from History, or the shop just finished on this list without
 // a receipt yet; otherwise the list (a receipt photographed before finishing moves with the shop).
 const recent=forShop?null:recentShop(a,asked),list=forShop||(recent&&!summaryOf(a,recent).receipt?recent:asked),shopItems=forShop||list!==asked?summaryOf(a,list).bought:items;
 const {Icon,Button}=ui,tx=useGroceries(a),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(null),[pair,setPair]=useState(true),[photo,setPhoto]=useState(null),file=React.useRef(null);
 const read=async f=>{if(!f)return;setBusy(true);setError('');try{const small=await receiptPhoto(f).catch(()=>f);setPhoto(small instanceof Blob&&small!==f?small:null);const r=await fetch('/api/shopping/receipt',{method:'POST',headers:{...cloudHeaders(),'Content-Type':'application/octet-stream','X-Bayit-Language':a.lang},body:small});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||a.T('The receipt could not be read.','לא הצלחנו לקרוא את הקבלה.'));setDraft({...d,lines:matchLines(d.lines,shopItems,rememberedNames(a.visible(a.data.receipts||[])))})}catch(e){setError(e.message)}finally{setBusy(false)}};
 const expense=draft&&tx?matchExpense({total:draft.total,charged:draft.charged,date:draft.date||anchor},tx):null;
 // The photo is kept with the receipt (owner's request 2026-11-12); if that fails, the reading is still saved and the photo can be attached later.
 const save=async()=>{const shopDate=draft.date||anchor;let fileId=null;if(photo){setBusy(true);try{fileId=await storeReceiptPhoto(photo)}catch{a.notify(a.T('The receipt is saved without its photo. You can attach it from Shopping history.','הקבלה נשמרה בלי התמונה. אפשר לצרף אותה מהיסטוריית הקניות.'))}finally{setBusy(false)}}
  a.update(d=>{(d.receipts??=[]).push({id:crypto.randomUUID(),...(fileId?{fileId}:{}),title:a.T('Receipt','קבלה')+(draft.store?' · '+draft.store:''),listId:list.id,ownerId:a.user,...itemAudience(list,a.user),store:draft.store,total:draft.total,...(draft.paidOther?{paidOther:draft.paidOther,charged:draft.charged}:{}),currency:draft.currency,shopDate,lines:draft.lines.map(({raw,name,key,quantity,unit,unitPrice,price,discount,y,confirmed})=>({raw,name,key,quantity,unit,...(unitPrice!=null?{unitPrice}:{}),price,...(discount?{discount}:{}),...(y!=null?{y}:{}),...(confirmed?{confirmed:true}:{})})),...(expense&&pair?{matchedExpenseId:String(expense.id||'')}:{}),createdAt:new Date().toISOString()})});a.notify(a.T('Receipt saved. Prices are in Shopping › Prices.','הקבלה נשמרה. המחירים ב"מחירים והוצאות".'));onClose()};
 const removeLine=i=>setDraft(d=>({...d,lines:d.lines.filter((_,n)=>n!==i)}));
 const [asking,setAsking]=useState(null),[answer,setAnswer]=useState('');
 const confirm=i=>{const name=answer.trim();if(!name)return;setDraft(d=>({...d,lines:d.lines.map((l,n)=>n===i?{...l,name,key:productKey({title:name}),confirmed:true,sure:true}:l)}));setAsking(null)};
 return <Window a={a} title={a.T('The receipt of this shop','הקבלה של הקנייה')} onClose={onClose} actions={draft?<><Button secondary onClick={onClose}>{a.T('Cancel','ביטול')}</Button><Button disabled={busy} onClick={save}>{a.T('Save','שמירה')}</Button></>:<Button secondary onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  {!draft&&<>{!a.cloud?<p className="tasks-sheet-hint ss-hint"><Info size={18}/><span>{a.T('Reading receipts works in your own installation with an AI helper connected.','קריאת קבלות עובדת בהתקנה שלכם, כשעוזר AI מחובר.')}</span></p>
   :<><p className="tasks-sheet-hint ss-hint"><Camera size={18}/><span>{a.T('The photo goes only to your own AI helper and uses a little of your AI credit. When you save, it is kept with the receipt in your own Bayit, for adults only, so you can compare it with what the AI read. Deleting the receipt deletes the photo.','התמונה נשלחת רק לעוזר ה־AI שלכם ומשתמשת קצת בקרדיט ה־AI. כששומרים, היא נשמרת עם הקבלה ב־Bayit שלכם, רק למבוגרים, כדי שאפשר יהיה להשוות לקריאה של ה־AI. מחיקת הקבלה מוחקת גם את התמונה.')}</span></p>
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>read(e.target.files?.[0])}/>
    <Button icon={Camera} disabled={busy} onClick={()=>file.current?.click()}>{busy?a.T('Reading…','קוראים…'):a.T('Photograph or choose a receipt','לצלם או לבחור קבלה')}</Button></>}
   {error&&<p className="save-error" role="alert">{error}</p>}</>}
  {draft&&<>
   <p className="tasks-sheet-hint ss-hint"><Info size={18}/><span>{a.T('Read by '+draft.providerName+'. Check before saving.','נקרא על ידי '+draft.providerName+'. כדאי לבדוק לפני השמירה.')}</span></p>
   <FormSection T={a.T} icon={Storefront} tone="yellow" title={a.T('From the receipt','מהקבלה')}>
    <div className="ss-kv"><span>{a.T('Shop','חנות')}</span><b>{draft.store||a.T('Not printed','לא כתוב')}</b></div>
    <div className="ss-kv"><span>{a.T('Date','תאריך')}</span><b>{longDate(a,draft.date)||a.T('Not printed · today','לא כתוב · היום')}</b></div>
    <div className="ss-kv ss-total"><span>{a.T('Total','סה"כ')}</span><b>{money(a,draft.total)}</b></div>
    {draft.checked&&draft.paidOther>0&&<p className="ss-fine">{a.T('Paid in part by meal card or voucher ('+money(a,draft.paidOther)+'), the rest by card or cash ('+money(a,draft.charged)+'). The total is what the shop cost.','שולם בחלקו בסיבוס, תן ביס או תו ('+money(a,draft.paidOther)+'), והשאר בכרטיס או במזומן ('+money(a,draft.charged)+'). הסה"כ הוא מה שהקנייה עלתה.')}</p>}
    {!draft.checked&&<p className="ss-fine ss-warn"><Warning size={16} weight="fill"/>{a.T('The lines add up to '+money(a,draft.sum)+', not the total. Some lines may be missing.','השורות מסתכמות ב־'+money(a,draft.sum)+' ולא בסה"כ. אולי חסרות שורות.')}</p>}
   </FormSection>
   <FormSection T={a.T} icon={ListChecks} tone="green" title={a.T('Item by item','מוצר מוצר')}>
    {draft.lines.map((l,i)=><div className={'ss-rline'+(l.sure?'':' ss-ask')} key={i}><span className="ss-raw">{l.raw}</span><Icon code={matchItem(l.name).icon} size={32}/><span className="ss-text"><strong>{l.name}</strong><small>{(l.quantity!==1?l.quantity+(l.unit==='kg'?a.T(' kg',' ק"ג'):''):'')+(l.unitPrice!=null&&l.unit==='kg'?' · '+money(a,l.unitPrice)+a.T(' per kg',' לק"ג'):'')+(l.discount?' · '+a.T('after a discount of ','אחרי הנחה של ')+money(a,l.discount):'')}</small>{!l.sure&&asking!==i&&<button type="button" className="ss-q" onClick={()=>{setAsking(i);setAnswer(l.name)}}><Question size={18} weight="bold"/>{a.T('Correct?','נכון?')}</button>}</span><b className="ss-price">{money(a,l.price)}</b><button type="button" className="icon-button" aria-label={a.T('Remove line','הסרת שורה')} onClick={()=>removeLine(i)}><X size={18}/></button>
     {asking===i&&<form className="ss-qform" onSubmit={e=>{e.preventDefault();confirm(i)}}><label><span>{a.T('What is it?','מה זה?')}</span><input autoFocus maxLength={80} value={answer} onChange={e=>setAnswer(e.target.value)}/></label><Button type="submit" icon={Check}>{a.T('Yes, remember','כן, לזכור')}</Button></form>}</div>)}
    {draft.lines.some(l=>!l.sure)&&<p className="ss-fine">{a.T('A line with "Correct?" waits for you to confirm it once; after that Bayit remembers.','שורה עם "נכון?" מחכה שתאשרו פעם אחת, ואחר כך Bayit זוכר.')}</p>}
   </FormSection>
   {expense&&<FormSection T={a.T} icon={CreditCard} tone="blue" title={a.T('In Expenses','בהוצאות')}>
    <div className="ss-sw"><span><strong>{money(a,-Number(expense.amount)/100)+' · '+(expense.description||'')+' · '+longDate(a,expense.date)}</strong><small>{a.T('Same amount, same day or the next. Link it to this shop?','אותו סכום, באותו יום או למחרת. לחבר לקנייה הזו?')}</small></span><Switch on={pair} label={a.T('Link','חיבור')} onChange={setPair}/></div>
   </FormSection>}
  </>}
 </Window>;
}

export function PricesWindow({a,ui,list,onClose}){
 const {Icon,Button}=ui,tx=useGroceries(a),receipts=a.visible(a.data.receipts||[]).filter(r=>!list||r.listId===list.id||sameAudience(r,list)),[open,setOpen]=useState(null);
 // One row per product (its barcode or printed text), not per list item or category (2026-11-12).
 const month=tx?groceriesMonth(tx,anchor):null,keys=[...new Set(receipts.flatMap(r=>(r.lines||[]).map(productId)))];
 const products=keys.map(key=>{const h=priceHistory(receipts,key);return {key,name:h?.last.name||key,h}}).filter(p=>p.h).sort((x,y)=>y.h.rows.length-x.h.rows.length||x.name.localeCompare(y.name));
 const per=(p,v,unit=p.h.last.unit)=>money(a,v)+(unit==='kg'?a.T(' per kg',' לק"ג'):'');
 // One purchase: its price and date. Cheapest and dearest only from two purchases on.
 const summary=p=>p.h.rows.length<2?per(p,p.h.last.per)+' · '+longDate(a,p.h.last.date):a.T('Last ','בפעם האחרונה ')+per(p,p.h.last.per)+' · '+a.T('cheapest ','הכי זול ')+per(p,p.h.cheapest.per,p.h.cheapest.unit)+' · '+a.T('dearest ','הכי יקר ')+per(p,p.h.dearest.per,p.h.dearest.unit);
 return <Window a={a} title={a.T('Prices and spending','מחירים והוצאות')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  {month&&<div className="ss-stats ss-two"><div><small>{a.T('This month at the supermarket','בסופר החודש')}</small><b>{money(a,month.thisMonth)}</b><span>{a.T('From your statements · updated to '+longDate(a,month.updatedTo),'מהדוחות · עודכן ל־'+longDate(a,month.updatedTo))}</span></div><div><small>{a.T('Last month, same days','חודש שעבר, אותם ימים')}</small><b>{money(a,month.lastMonthToDate)}</b><span>{a.T('Small card purchases count too','גם קניות קטנות בכרטיס נספרות')}</span></div></div>}
  {!month&&a.cloud&&<p className="ss-fine">{a.T('Spending appears here once bank or card statements are imported in Expenses.','ההוצאות יופיעו כאן אחרי שמייבאים דוחות בנק או אשראי בהוצאות.')}</p>}
  <FormSection T={a.T} icon={Receipt} tone="yellow" title={a.T('Prices from your receipts','מחירים מהקבלות שלכם')} note={receipts.length?a.T(receipts.length+' receipts',receipts.length===1?'קבלה אחת':receipts.length+' קבלות'):''}>
   {!products.length&&<p className="ss-fine">{a.T('No receipts yet. Photograph one when everything is in the bag; shops without a receipt have no prices.','עוד אין קבלות. מצלמים קבלה כשהכל נאסף; לקניות בלי קבלה אין מחירים.')}</p>}
   {products.map(p=><div key={p.key} className="ss-product"><button type="button" className="ss-product-head" aria-expanded={open===p.key} onClick={()=>setOpen(open===p.key?null:p.key)}><Icon code={matchItem(p.name).icon} size={32}/><span className="ss-text"><strong>{p.name}</strong><small>{summary(p)}</small></span><CaretDown size={18}/></button>
    {open===p.key&&<div className="ss-history">{p.h.rows.map((r,i)=><div className="ss-prow" key={i}><span><strong>{longDate(a,r.date)}</strong><small><bdi>{r.store}</bdi></small></span><span className="ss-bar"><i className={r===p.h.cheapest?'lo':r===p.h.dearest?'hi':''} style={{width:Math.max(8,Math.round(r.per/p.h.dearest.per*100))+'%'}}/></span><b>{per(p,r.per,r.unit)}</b></div>)}{p.h.stores.length>1&&p.h.stores.map(s=><div className="ss-kv" key={s.store}><span><bdi>{s.store}</bdi>{' · '+a.T(s.count===1?'1 receipt':s.count+' receipts',s.count===1?'קבלה אחת':s.count+' קבלות')}</span><b>{a.T('average ','ממוצע ')+per(p,s.average)}</b></div>)}</div>}
   </div>)}
  </FormSection>
 </Window>;
}

// ---------- a photographed shopping note (adults; reading needs the household's own AI helper) ----------
// Concept C round 2 (r2q3-snap): the photo goes to the household's provider only, is not stored, and the answer is a
// draft. Nothing is added until the person ticks items and presses Add. No key: the window says so and sends nothing.
export function NoteWindow({a,ui,list,items,quantityText,onClose}){
 const {Icon,Button}=ui,[status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[rows,setRows]=useState(null),file=React.useRef(null);
 const parent=a.member(a.user)?.role==='parent';
 React.useEffect(()=>{if(!a.cloud)return;let on=true;fetch('/api/ai/status',{headers:cloudHeaders()}).then(r=>r.ok?r.json():null).then(s=>{if(on)setStatus(s||{connected:false})}).catch(()=>{if(on)setStatus({connected:false,unknown:true})});return()=>{on=false}},[a.cloud]);
 const read=async f=>{if(!f)return;setBusy(true);setError('');try{const r=await fetch('/api/shopping/note',{method:'POST',headers:{...cloudHeaders(),'Content-Type':'application/octet-stream','X-Bayit-Language':a.lang},body:f});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||a.T('The list could not be read.','לא הצלחנו לקרוא את הרשימה.'));if(!d.draftOnly||!Array.isArray(d.items))throw Error(a.T('The list could not be read.','לא הצלחנו לקרוא את הרשימה.'));setRows(noteRows(d.items,items))}catch(e){setError(e.message)}finally{setBusy(false);if(file.current)file.current.value=''}};
 const picked=rows?rows.filter(r=>r.picked):[];
 const qty=r=>r.quantity!=null?r.quantity+(r.unit==='kg'?a.T(' kg',' ק"ג'):r.unit==='packs'?a.T(r.quantity===1?' pack':' packs',r.quantity===1?' חבילה':' חבילות'):''):'';
 const add=()=>{a.update(d=>{for(const r of picked){if(onList(d,list,r.key))continue;const q=r.quantity||1,unit=r.unit||'items';d.shopping.push({...newItem(a,list,{title:r.title,icon:r.icon,group:r.group,unit},q),source:'note'})}});a.notify(a.T(picked.length===1?'1 item added.':picked.length+' items added.',picked.length===1?'נוסף פריט אחד.':'נוספו '+picked.length+' פריטים.'));onClose()};
 const listName=list?(a.lang==='he'?list.he||list.name:list.name):'';
 return <Window a={a} title={rows?a.T('From the list you photographed','מהרשימה שצילמתם'):a.T('Photograph a list','צילום רשימה')} onClose={onClose} actions={rows?<><Button secondary onClick={onClose}>{a.T('Cancel','ביטול')}</Button><Button icon={Plus} disabled={!picked.length} onClick={add}>{a.T(picked.length===1?'Add 1 item':'Add '+picked.length+' items',picked.length===1?'הוספת פריט אחד':'הוספת '+picked.length+' פריטים')}</Button></>:<Button secondary onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  {!rows&&<>{!a.cloud?<p className="tasks-sheet-hint ss-hint"><Info size={18}/><span>{a.T('Reading a photographed list works in your own installation with an AI helper connected.','קריאת רשימה מצולמת עובדת בהתקנה שלכם, כשעוזר AI מחובר.')}</span></p>
   :status&&!status.connected?<p className="tasks-sheet-hint ss-hint"><Info size={18}/><span>{status.unknown?a.T('We could not check the AI helper right now. Try again in a moment.','לא הצלחנו לבדוק את עוזר ה־AI כרגע. נסו שוב בעוד רגע.'):parent?a.T('Reading a photographed list needs your AI helper. Connect one in Settings › Accounts & connections. Typing items with commas works without AI.','קריאת רשימה מצולמת צריכה עוזר AI. מחברים אותו בהגדרות › חשבונות וחיבורים. הקלדה עם פסיקים עובדת גם בלי AI.'):a.T('Reading a photographed list needs the AI helper, which a parent connects. Typing items with commas works without AI.','קריאת רשימה מצולמת צריכה עוזר AI, והורה מחבר אותו. הקלדה עם פסיקים עובדת גם בלי AI.')}</span></p>
   :<><p className="tasks-sheet-hint ss-hint"><Camera size={18}/><span>{a.T('A handwritten or printed note. The photo goes only to your own AI helper, uses a little of your AI credit, and is not stored. You choose what to add.','פתק בכתב יד או מודפס. התמונה נשלחת רק לעוזר ה־AI שלכם, משתמשת קצת בקרדיט ה־AI, ולא נשמרת. אתם בוחרים מה להוסיף.')}</span></p>
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>read(e.target.files?.[0])}/>
    <Button icon={Camera} disabled={busy||!status} onClick={()=>file.current?.click()}>{busy?a.T('Reading…','קוראים…'):a.T('Photograph or choose a list','לצלם או לבחור רשימה')}</Button></>}
   {error&&<p className="save-error" role="alert">{error}</p>}</>}
  {rows&&<>
   <p className="tasks-sheet-hint ss-hint"><Camera size={18}/><span>{a.T('Handwritten note · read by '+(status?.providerName||'your AI helper')+' · the photo was not stored','פתק בכתב יד · נקרא על ידי '+(status?.providerName||'עוזר ה־AI שלכם')+' · התמונה לא נשמרה')}</span></p>
   <FormSection T={a.T} icon={ListChecks} tone="yellow" title={a.T('Add to "'+listName+'"','להוסיף לרשימה "'+listName+'"')} note={a.T(picked.length+' of '+rows.length+' ticked',picked.length+' מתוך '+rows.length+' מסומנים')}>
    {rows.map((r,i)=><label className="ss-pickrow" key={r.key}><span className="checkbox-control"><input type="checkbox" checked={r.picked} onChange={e=>setRows(rs=>rs.map((x,n)=>n===i?{...x,picked:e.target.checked}:x))}/><Check size={21} weight="bold" aria-hidden="true"/></span><Icon code={r.icon} size={36}/><span className="ss-text"><strong><bdi>{r.title}</bdi>{qty(r)&&<span className="ss-q2"><bdi>{qty(r)}</bdi></span>}</strong><small>{r.onList?a.T('Already on the list','כבר ברשימה')+(quantityText?.(r.onList)?': '+quantityText(r.onList):''):<bdi>{'"'+r.written+'"'}</bdi>}</small></span></label>)}
   </FormSection>
  </>}
 </Window>;
}

// ---------- finishing a shop, the shopping history, the receipt photo (owner's choices, 2026-11-12) ----------
// B: a new list for each shop. The last tick or Finish moves what was bought into a shop in the history; the list is new
// and empty. The person who finished can undo it. History lives in the list's ⋯ menu. A receipt keeps its photo in the
// installation's own file store (adults only), so it can be compared with what the AI read.
const RECENT_MS=12*3600e3,photoUrl=id=>'/api/files/'+encodeURIComponent(id);
const dayOf=iso=>iso?new Date(iso).toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE}):'';
const timeOf=iso=>iso?new Date(iso).toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit'}):'';
const shortDay=(a,iso)=>iso?new Date(iso).toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{timeZone:HOME_TIMEZONE,weekday:'short',day:'numeric',month:'short'}):'';
export const recentShop=(a,list)=>{if(!list)return null;const s=shopsOf((a.data.shoppingLists||[]).filter(l=>canAccessList(l,a.user)),list.id)[0];return s&&Date.now()-Date.parse(s.archivedAt)<RECENT_MS?s:null};
const visibleReceipts=a=>a.member(a.user)?.role==='child'?[]:a.visible(a.data.receipts||[]);
const summaryOf=(a,shop)=>shopSummary(shop,{shopping:a.visible(a.data.shopping||[]),receipts:visibleReceipts(a)});

// A receipt photo is made smaller (about 1 MB at most) and re-encoded as JPEG before it is read or stored.
export async function receiptPhoto(file){
 const url=URL.createObjectURL(file);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
  for(const [side,q] of [[1800,.82],[1400,.75],[1100,.7]]){const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
   const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',q));if(blob&&blob.size<=1400*1024)return blob}
  throw Error('This photo is too large.')}finally{URL.revokeObjectURL(url)}
}
export async function storeReceiptPhoto(blob){const id=crypto.randomUUID(),r=await fetch(photoUrl(id),{method:'PUT',headers:{...cloudHeaders(),'Content-Type':'image/jpeg','X-File-Name':'receipt.jpg','X-Bayit-Purpose':'receipt'},body:blob});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||'The photo was not kept.');return id}
const dropPhoto=id=>id&&fetch(photoUrl(id),{method:'DELETE',headers:cloudHeaders()}).catch(()=>{});

// After a shop: one quiet line on the new, empty list. Open goes to the shop; Undo (who finished it) puts it back.
export function ShopDoneLine({a,list,onOpen}){
 const shop=recentShop(a,list);if(!shop||list.status!=='active')return null;const s=summaryOf(a,shop),name=a.lang==='he'?shop.he||shop.name:shop.name,mine=shop.ownerId===a.user;
 return <div className="ss-line ss-line-done" data-keep-clear><ClockCounterClockwise size={24} aria-hidden="true"/><span><b>{a.T('“'+name+' · '+shortDay(a,shop.archivedAt)+'” was archived','„'+name+' · '+shortDay(a,shop.archivedAt)+'” עברה לארכיון')}</b><small className="ss-line-who">{(mine?'':a.name(shop.finishedBy)+' · ')+a.T(s.bought.length+' bought',s.bought.length+' נקנו')+(s.leftCount?a.T(' · '+s.leftCount+' left for next time',' · '+s.leftCount+' נשארו לפעם הבאה'):'')}</small></span>
  <button type="button" className="text-link ss-line-change" onClick={()=>onOpen(shop)}>{a.T('Open','פתיחה')}</button>{mine&&<button type="button" className="text-link ss-line-change" onClick={()=>a.undoShopping(shop.id)}>{a.T('Undo','ביטול')}</button>}</div>;
}

// Finish with items left: what happens, and the left items stay for next time unless the person says otherwise.
export function FinishWindow({a,ui,list,items,onClose}){
 const {Button}=ui,bought=items.filter(i=>i.done),left=items.filter(i=>!i.done),[keep,setKeep]=useState(true),[error,setError]=useState('');
 const names=left.slice(0,3).map(i=>a.text(i)),more=left.length-names.length,leftText=names.join(a.lang==='he'?', ':', ')+(more>0?a.T(' and '+more+' more',' ועוד '+more):'');
 const finish=async()=>{try{await a.finishShopping(list.id,{keepLeft:keep});a.notify(a.T('Shop finished. It is in Shopping history.','הקנייה הסתיימה ונשמרה בהיסטוריית הקניות.'));onClose()}catch(e){setError(e.message)}};
 return <Window a={a} title={a.T('Finish this shop?','לסיים את הקנייה?')} onClose={onClose} actions={<><Button secondary onClick={onClose}>{a.T('Keep shopping','להמשיך לקנות')}</Button><Button disabled={!bought.length} onClick={finish}>{a.T('Finish shop','לסיים קנייה')}</Button></>}>
  <p className="ss-lead"><b>{a.T(bought.length+' bought.',bought.length+' נקנו.')}</b> {left.length?a.T(leftText+(left.length===1?' was':' were')+' not bought.','לא נקנו: '+leftText+'.'):''}</p>
  <FormSection T={a.T} icon={ListChecks} tone="green" title={a.T('What happens','מה קורה')}>
   <p className="ss-fine">{a.T('• The shop is saved in Shopping history, with the receipt if you photograph it.','• הקנייה נשמרת בהיסטוריית הקניות, עם הקבלה אם מצלמים אותה.')}</p>
   <p className="ss-fine">{a.T('• What was bought leaves the list, and the list is ready for the next shop.','• מה שנקנה יורד מהרשימה, והרשימה מוכנה לקנייה הבאה.')}</p>
   {left.length>0&&<label className="checkbox-label ss-keep"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/><span>{a.T('Keep the '+(left.length===1?'item':left.length+' items')+' not bought on the list for next time','להשאיר ברשימה לפעם הבאה את '+(left.length===1?'הפריט שלא נקנה':left.length+' הפריטים שלא נקנו'))}</span></label>}
  </FormSection>{error&&<p className="save-error" role="alert">{error}</p>}
 </Window>;
}

// Shopping history of a list: newest first, by month, PAGE at a time.
export function HistoryWindow({a,ui,list,onOpen,onClose}){
 const {Button}=ui,[shown,setShown]=useState(PAGE),shops=shopsOf((a.data.shoppingLists||[]).filter(l=>canAccessList(l,a.user)),list.id),page=shops.slice(0,shown);
 const months=[...new Set(page.map(s=>dayOf(s.archivedAt).slice(0,7)))],monthName=m=>new Date(m+'-15T12:00:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const listName=a.lang==='he'?list.he||list.name:list.name;
 return <Window a={a} title={a.T('Shopping history','היסטוריית קניות')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  <p className="ss-fine">{shops.length?a.T('Every finished shop of “'+listName+'”, newest first.','כל הקניות שהסתיימו של „'+listName+'”, מהחדשה לישנה.'):a.T('No finished shops yet. When the last item is ticked, or you press Finish, the shop is saved here.','עוד אין קניות שהסתיימו. כשמסמנים את הפריט האחרון, או לוחצים "לסיים", הקנייה נשמרת כאן.')}</p>
  {months.map(m=><FormSection key={m} T={a.T} icon={ClockCounterClockwise} tone="yellow" title={monthName(m)}>{page.filter(s=>dayOf(s.archivedAt).slice(0,7)===m).map(s=>{const sum=summaryOf(a,s);
   return <div key={s.id} className="ss-product"><button type="button" className="ss-product-head" onClick={()=>onOpen(s)}><span className="ss-text"><strong>{shortDay(a,s.archivedAt)+(sum.receipt?.store?' · '+sum.receipt.store:'')}</strong><small>{[a.name(s.finishedBy),a.T(sum.bought.length+' bought',sum.bought.length+' נקנו'),sum.leftCount?a.T(sum.leftCount+' left',sum.leftCount+' נשארו'):'',a.member(a.user)?.role==='child'?'':sum.receipt?a.T('receipt','קבלה'):a.T('no receipt','בלי קבלה')].filter(Boolean).join(' · ')}</small></span><b className="ss-price">{sum.total!=null&&a.member(a.user)?.role!=='child'?money(a,sum.total):'—'}</b></button></div>})}</FormSection>)}
  {shops.length>shown&&<Button secondary onClick={()=>setShown(shown+PAGE)}>{a.T('Show '+Math.min(PAGE,shops.length-shown)+' more','להציג עוד '+Math.min(PAGE,shops.length-shown))}</Button>}
 </Window>;
}

// One shop: its receipt (adults), what was bought and for how much, what was left, who and when.
export function ShopWindow({a,ui,shop,onClose,onAttach,onReceipt}){
 const {Button}=ui,s=summaryOf(a,shop),adult=a.member(a.user)?.role!=='child',mine=shop.ownerId===a.user,[busy,setBusy]=useState(false);
 const priced=s.receipt?matchLines(s.receipt.lines||[],s.bought):[],priceOf=i=>priced.find(l=>l.itemId===i.id)?.price;
 const remove=async()=>{if(!window.confirm(a.T('Delete this shop from the history? Its receipt and photo are deleted too.','למחוק את הקנייה מההיסטוריה? גם הקבלה והתמונה שלה יימחקו.')))return;setBusy(true);const photos=visibleReceipts(a).filter(r=>r.listId===shop.id&&r.ownerId===a.user).map(r=>r.fileId).filter(Boolean);
  try{await a.update(d=>{d.receipts=(d.receipts||[]).filter(r=>!(r.listId===shop.id&&r.ownerId===a.user));d.shopping=d.shopping.filter(i=>i.listId!==shop.id);d.shoppingLists=d.shoppingLists.filter(l=>l.id!==shop.id)});photos.forEach(dropPhoto);onClose()}finally{setBusy(false)}};
 return <Window a={a} title={shortDay(a,shop.archivedAt)+(s.receipt?.store?' · '+s.receipt.store:'')} onClose={onClose} actions={<>{mine&&<Button secondary disabled={busy} onClick={remove}>{a.T('Delete','מחיקה')}</Button>}<Button onClick={onClose}>{a.T('Close','סגירה')}</Button></>}>
  {adult&&<FormSection T={a.T} icon={Receipt} tone="yellow" title={a.T('Receipt','קבלה')}>{s.receipt?<>
   <div className="ss-kv ss-total"><span>{a.T('Total','סה"כ')}</span><b>{money(a,s.receipt.total)}</b></div>
   {s.receipt.paidOther>0&&<div className="ss-kv"><span>{a.T('Paid','שולם')}</span><b>{a.T('meal card or voucher '+money(a,s.receipt.paidOther)+' · card '+money(a,s.receipt.charged),'סיבוס או תו '+money(a,s.receipt.paidOther)+' · כרטיס '+money(a,s.receipt.charged))}</b></div>}
   <p className="ss-act"><Button secondary onClick={()=>onReceipt(s.receipt)}>{a.T('View the receipt','לראות את הקבלה')}</Button></p></>
   :<><p className="ss-fine">{a.T('No receipt for this shop yet. Add it now and its prices join Prices.','עוד אין קבלה לקנייה הזו. מוסיפים אותה עכשיו, והמחירים שלה נכנסים ל"מחירים".')}</p>{a.cloud&&<Button icon={Camera} onClick={()=>onAttach(shop)}>{a.T('Attach a receipt','לצרף קבלה')}</Button>}</>}</FormSection>}
  <FormSection T={a.T} icon={ListChecks} tone="green" title={a.T('Bought · '+s.bought.length,'נקנו · '+s.bought.length)}>{s.bought.map(i=><div className="ss-kv" key={i.id}><span>{a.text(i)}</span><b>{priceOf(i)!=null?money(a,priceOf(i)):''}</b></div>)}</FormSection>
  {s.leftCount>0&&<FormSection T={a.T} icon={BagSimple} tone="blue" title={a.T('Left for next time · '+s.leftCount,'נשארו לפעם הבאה · '+s.leftCount)}>{s.left.length?s.left.map(i=><div className="ss-kv" key={i.id}><span>{a.text(i)}</span></div>):<p className="ss-fine">{a.T('They stayed on the list.','הם נשארו ברשימה.')}</p>}</FormSection>}
  <FormSection T={a.T} icon={Clock} tone="lilac" title={a.T('Who and when','מי ומתי')}><div className="ss-kv"><span>{a.T('Shopped by','קנה/תה')}</span><b>{a.name(shop.finishedBy)}</b></div><div className="ss-kv"><span>{a.T('Time','שעה')}</span><b dir="ltr">{timeOf(shop.startedAt)+'–'+timeOf(shop.archivedAt)}</b></div></FormSection>
 </Window>;
}

// The receipt itself: the photo, and what the AI read under it. Tapping a line marks it on the photo (when the reading
// says where it is). The person who saved it can correct a line, or attach the photo to a receipt read before photos were kept.
export function ReceiptView({a,ui,receipt,onClose}){
 const {Button}=ui,[src,setSrc]=useState(''),[error,setError]=useState(''),[on,setOn]=useState(null),[edit,setEdit]=useState(null),[busy,setBusy]=useState(false),file=React.useRef(null),mine=receipt.ownerId===a.user;
 const live=visibleReceipts(a).find(r=>r.id===receipt.id)||receipt;
 React.useEffect(()=>{if(!live.fileId)return setSrc('');let url='';fetch(photoUrl(live.fileId),{headers:cloudHeaders()}).then(r=>r.ok?r.blob():Promise.reject()).then(b=>{url=URL.createObjectURL(b);setSrc(url)}).catch(()=>setError(a.T('The photo could not be loaded.','לא הצלחנו לטעון את התמונה.')));return()=>url&&URL.revokeObjectURL(url)},[live.fileId]);
 const attach=async f=>{if(!f)return;setBusy(true);setError('');try{const id=await storeReceiptPhoto(await receiptPhoto(f));await a.update(d=>{const r=(d.receipts||[]).find(x=>x.id===live.id);if(r)r.fileId=id})}catch(e){setError(e.message)}finally{setBusy(false)}};
 const saveLine=async e=>{e.preventDefault();const price=Number(edit.price);if(!edit.name.trim()||!Number.isFinite(price)||price<0)return;await a.update(d=>{const r=(d.receipts||[]).find(x=>x.id===live.id),l=r?.lines?.[edit.i];if(l){l.name=edit.name.trim();l.key=productKey({title:l.name});l.price=Math.round(price*100)/100;l.confirmed=true}});setEdit(null)};
 const lines=live.lines||[];
 return <Window a={a} className="ss-receipt-view" title={a.T('Receipt','קבלה')+(live.shopDate?' · '+longDate(a,live.shopDate):'')} onClose={onClose} actions={<Button onClick={onClose}>{a.T('Close','סגירה')}</Button>}>
  {src?<div className="ss-photo">{<img src={src} alt={a.T('The receipt photo','תמונת הקבלה')}/>}{on!=null&&lines[on]?.y!=null&&<i className="ss-photo-mark" style={{top:(lines[on].y*100)+'%'}}/>}</div>
   :<div className="ss-photo-none"><p className="ss-fine">{live.fileId?(error||a.T('Loading the photo…','טוענים את התמונה…')):a.T('This receipt was read before photos were kept.','הקבלה הזו נקראה לפני שתמונות נשמרו.')}</p>{!live.fileId&&mine&&a.cloud&&<><input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>attach(e.target.files?.[0])}/><Button icon={Camera} disabled={busy} onClick={()=>file.current?.click()}>{busy?a.T('Saving…','שומרים…'):a.T('Attach the photo','לצרף את התמונה')}</Button></>}</div>}
  {error&&src&&<p className="save-error" role="alert">{error}</p>}
  <p className="ss-fine">{a.T('Tap a line to find it on the photo. If the AI got one wrong, correct it here.','לוחצים על שורה כדי למצוא אותה בתמונה. אם ה־AI טעה בשורה, מתקנים אותה כאן.')}</p>
  <FormSection T={a.T} icon={ListChecks} tone="green" title={a.T('What the AI read','מה ה־AI קרא')}>
   {lines.map((l,i)=><div key={i} className={'ss-rline ss-rline-view'+(on===i?' on':'')}><button type="button" className="ss-rline-pick" onClick={()=>setOn(on===i?null:i)}><span className="ss-raw"><bdi>{'"'+l.raw+'"'}</bdi></span><span className="ss-text"><strong>{l.name}</strong>{l.discount?<small>{a.T('after a discount of ','אחרי הנחה של ')+money(a,l.discount)}</small>:null}</span><b className="ss-price">{money(a,l.price)}</b></button>
    {mine&&edit?.i!==i&&<button type="button" className="icon-button" aria-label={a.T('Correct this line','תיקון השורה')} onClick={()=>setEdit({i,name:l.name,price:String(l.price)})}><PencilSimple size={18}/></button>}
    {edit?.i===i&&<form className="ss-qform" onSubmit={saveLine}><label><span>{a.T('Name','שם')}</span><input autoFocus maxLength={80} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><label><span>{a.T('Price','מחיר')}</span><input inputMode="decimal" value={edit.price} onChange={e=>setEdit({...edit,price:e.target.value})}/></label><Button type="submit" icon={Check}>{a.T('Save','שמירה')}</Button></form>}</div>)}
   <div className="ss-kv ss-total"><span>{a.T('Total','סה"כ')}</span><b>{money(a,live.total)}</b></div>
  </FormSection>
 </Window>;
}
