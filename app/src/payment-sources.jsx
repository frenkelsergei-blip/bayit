// Payment sources (cards and bank accounts), concept C "by person" chosen by the user on 2026-11-09
// (concept/explorations/payment-sources-20261109/concept-c.png): each adult with their cards stacked beside them,
// plus Shared for joint bank accounts. Marks are original shapes in the issuer's colour, never the issuer's logo;
// anything unknown (another country, a wallet, a nickname) gets the neutral look. Model: shared/payment-sources.mjs.
import React,{useMemo,useState} from 'react';
import {CreditCard,Bank,PencilSimple,CaretDown,CaretLeft,CaretRight,UsersThree,Cards,Check,Question,Sparkle} from '@phosphor-icons/react';
import {HouseholdForm} from './household-form';
import {FormSection} from './form-section';
import {sourceName,sourceDigits,sourceLook,sourceGroups,monthlyBySource} from '../../shared/payment-sources.mjs';
import {CATEGORY} from '../../shared/finance.mjs';
import './payment-sources.css';

const motif=(m,w,h,c)=>({
 arc:<><circle cx={w*.92} cy={h*.08} r={h*.62} fill={c} opacity=".28"/><circle cx={w*.92} cy={h*.08} r={h*.38} fill={c} opacity=".35"/></>,
 stripe:<><path d={`M${w*.55} ${h}L${w*.8} 0L${w*.92} 0L${w*.67} ${h}Z`} fill={c} opacity=".45"/><path d={`M${w*.72} ${h}L${w*.97} 0L${w} 0L${w} ${h*.1}L${w*.79} ${h}Z`} fill={c} opacity=".3"/></>,
 wave:<path d={`M0 ${h*.72}C${w*.25} ${h*.55},${w*.5} ${h*.95},${w} ${h*.6}L${w} ${h}L0 ${h}Z`} fill={c} opacity=".35"/>,
 ring:<circle cx={w*.86} cy={h*.82} r={h*.5} fill="none" stroke={c} strokeWidth={h*.09} opacity=".45"/>,
 dot:<><circle cx={w*.84} cy={h*.24} r={h*.13} fill={c} opacity=".8"/><circle cx={w*.7} cy={h*.24} r={h*.13} fill={c} opacity=".45"/></>,
}[m]||null);

// Square issuer mark. Unknown sources show a card or bank glyph instead of letters.
export function IssuerMark({source,size=24,className=''}){
 const look=sourceLook(source),text=look.mark||'',fs=text.length>2?.34:text.length>1?.4:.5,Glyph=source?.kind==='bank'?Bank:source?.kind==='manual'?PencilSimple:CreditCard;
 return <span className={'issuer-mark'+(className?' '+className:'')} style={{'--mark':size+'px',background:look.bg}} aria-hidden="true">
  <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>{motif(look.motif,size,size,look.accent)}</svg>
  {look.generic?<Glyph size={Math.round(size*.6)} weight="bold"/>:<b style={{fontSize:Math.round(size*fs)+'px'}}>{text}</b>}
 </span>;
}

// Overlapping marks, like AvatarStack: up to `max`, then +N.
export function SourceStack({sources,size=22,max=4}){
 const shown=sources.slice(0,max),extra=sources.length-shown.length;if(!shown.length)return null;
 return <span className="source-stack" style={{'--stack-size':size+'px'}} aria-hidden="true">{shown.map((s,i)=><span key={s.key} className="source-stack-item" style={{zIndex:shown.length-i}}><IssuerMark source={s} size={size}/></span>)}{extra>0&&<span className="source-stack-more">{'⁦+'+extra+'⁩'}</span>}</span>;
}

const ownerName=(a,s)=>s.shared?a.T('Shared','משותף'):s.ownerId?a.name(s.ownerId):a.T('Whose?','של מי?');
// Group titles: a person, Shared, or the cards nobody has claimed yet (round 2: RiseUp never says whose a card is).
export const groupName=(a,id)=>id==='shared'?a.T('Shared','משותף'):id==='unassigned'?a.T('Not assigned yet','עדיין לא שויך'):a.name(id);
export function UnassignedFace({size=40}){return <span className="unassigned-face" style={{'--faces':size+'px'}} aria-hidden="true"><Question size={Math.round(size*.55)} weight="bold"/></span>}
function GroupFace({a,id,Avatar,size}){return id==='shared'?<SharedFaces a={a} Avatar={Avatar} size={size}/>:id==='unassigned'?<UnassignedFace size={size}/>:<Avatar decorative who={id} size={size}/>}
// "Shared" (concept C): two adults' faces in one circle, the first at the top start and the second at the bottom end.
export function SharedFaces({a,Avatar,size=40}){
 const ids=a.members.filter(m=>m.role!=='child'&&!m.former).map(m=>m.id).slice(0,2);
 if(ids.length<2)return <Avatar family decorative size={size}/>;
 return <span className="shared-faces" style={{'--faces':size+'px'}} aria-hidden="true">{ids.map(id=><Avatar key={id} decorative who={id} size={Math.round(size*.7)}/>)}</span>;
}

// A credit-card shaped visual (bank accounts get the same footprint with an account band).
export function PaymentCard({a,source,Avatar,width=180,amount,sub,className=''}){
 const look=sourceLook(source),h=Math.round(width/1.586),bank=source.kind==='bank',digits=sourceDigits(source);
 return <div className={'payment-card'+(bank?' bank':'')+(look.generic?' generic':'')+(className?' '+className:'')} style={{'--card-w':width+'px','--card-bg':look.bg,'--card-accent':look.accent}} role="img" aria-label={sourceName(source,a.lang)+(digits?' '+digits:'')+' · '+ownerName(a,source)}>
  <svg className="payment-card-art" viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" aria-hidden="true">{motif(look.motif,width,h,look.accent)}</svg>
  <span className="payment-card-top"><IssuerMark source={source} size={Math.max(18,Math.round(width*.13))}/><span className="payment-card-name" dir="auto">{sourceName(source,a.lang)}</span>{!bank&&<i className="payment-card-chip"/>}</span>
  {amount!=null&&<span className="payment-card-amount"><bdi dir="ltr">{amount}</bdi>{sub&&<small>{sub}</small>}</span>}
  <span className="payment-card-bottom"><bdi className="payment-card-digits" dir="ltr">{digits||'•• ––––'}</bdi><span className="payment-card-owner">{source.shared?<SharedFaces a={a} Avatar={Avatar} size={Math.round(width*.11)}/>:source.ownerId?<Avatar decorative who={source.ownerId} size={Math.round(width*.1)}/>:null}<span>{ownerName(a,source)}</span></span></span>
 </div>;
}

// Inline source text for a transaction row: mark, name and ending.
export function SourceLabel({a,source,via}){
 if(!source)return null;const digits=sourceDigits(source);
 return <span className="source-label"><IssuerMark source={source} size={16}/><span dir="auto">{sourceName(source,a.lang)}</span>{digits&&<bdi dir="ltr">{digits}</bdi>}{via&&<span className="source-label-via"> · {via}</span>}</span>;
}

// Cards without an ending look alike: say where each one is used most (from its own purchases; never a made-up ending).
export function useMostlyAt(a,rows,index){
 const where=useMemo(()=>{const by=new Map();for(const r of rows||[]){const k=index.keyOf(r),d=String(r.description||'').trim();if(!k||!d)continue;const m=by.get(k)||new Map();m.set(d,(m.get(d)||0)+1);by.set(k,m)}return new Map([...by].map(([k,m])=>[k,[...m].sort((x,y)=>y[1]-x[1])[0][0]]))},[rows,index]);
 return s=>!s.last4&&s.kind==='card'&&where.get(s.key)?a.T('mostly at ','בעיקר ב־')+where.get(s.key):'';
}

// Expenses › Transactions, as in concept C: one rounded row per person (avatar, name, what they hold, their cards
// stacked at the end) and Shared last; tap people (several allowed) to filter all their cards, then narrow to single
// cards in the chips under them. value: chosen source keys (OR); [] means every card and account.
export function SourceFilter({a,index,value,onChange,Avatar,memberIds,rows}){
 const groups=useMemo(()=>sourceGroups(index,memberIds),[index,memberIds]),chosen=new Set(value),mostly=useMostlyAt(a,rows,index);
 // Only when there is at least one card or account (recorded entries alone have nothing to choose between).
 if(!index.list.some(s=>s.kind!=='manual'))return null;
 const keysOf=g=>g.sources.map(s=>s.key),togglePerson=g=>{const keys=keysOf(g),every=keys.every(k=>chosen.has(k));onChange(every?value.filter(k=>!keys.includes(k)):[...new Set([...value,...keys])])};
 const toggleSource=k=>onChange(chosen.has(k)?value.filter(v=>v!==k):[...value,k]);
 const holds=g=>{const cards=g.sources.filter(s=>s.kind==='card').length,banks=g.sources.filter(s=>s.kind==='bank'),parts=[];
  if(cards)parts.push(cards===1?a.T('1 card','כרטיס אחד'):a.T(cards+' cards',cards+' כרטיסים'));
  if(banks.length)parts.push(!cards&&banks.length===1?sourceName(banks[0],a.lang):banks.length===1?a.T('bank','בנק'):a.T(banks.length+' accounts',banks.length+' חשבונות'));
  if(!parts.length)parts.push(a.T('Recorded entries','רישום ידני'));return parts.join(' · ')};
 const open=groups.filter(g=>keysOf(g).some(k=>chosen.has(k)));
 return <div className="source-filter" role="group" aria-label={a.T('Whose cards and accounts','של מי הכרטיסים והחשבונות')}>
  <div className="source-whos">{groups.map(g=>{const keys=keysOf(g),on=keys.every(k=>chosen.has(k)),some=!on&&keys.some(k=>chosen.has(k)),marks=g.sources.filter(s=>s.kind!=='manual'),name=groupName(a,g.id);
   return <button key={g.id} type="button" className={'source-who'+(on?' on':some?' some':'')+(g.id==='unassigned'?' unassigned':'')} aria-pressed={on?true:some?'mixed':false} onClick={()=>togglePerson(g)} aria-label={name+': '+g.sources.map(s=>sourceName(s,a.lang)+(s.last4?' '+sourceDigits(s):'')).join(', ')}>
    <GroupFace a={a} id={g.id} Avatar={Avatar} size={40}/>
    <span className="source-who-text"><b dir="auto">{name}</b><small>{holds(g)}{g.id==='unassigned'?' · '+a.T('choose whose in Cards & accounts','אפשר לבחור של מי בכרטיסים וחשבונות'):''}</small></span>
    {marks.length>0&&<span className="source-who-fan" aria-hidden="true">{marks.slice(0,4).map((s,i)=><span key={s.key} style={{zIndex:9-i}}><IssuerMark source={s} size={30}/></span>)}{marks.length>4&&<span className="source-who-more">{'\u2066+'+(marks.length-4)+'\u2069'}</span>}</span>}
   </button>})}</div>
  {open.map(g=><div key={g.id} className="source-filter-cards" role="group" aria-label={a.T('Cards and accounts: ','כרטיסים וחשבונות: ')+groupName(a,g.id)}>
   <span className="source-filter-of">{g.id==='shared'||g.id==='unassigned'?groupName(a,g.id)+':':a.T(a.name(g.id)+'’s:','של '+a.name(g.id)+':')}</span>
   {g.sources.map(s=><button key={s.key} type="button" className={'source-chip'+(chosen.has(s.key)?' on':'')} aria-pressed={chosen.has(s.key)} onClick={()=>toggleSource(s.key)}><IssuerMark source={s} size={20}/>{s.last4&&s.issuer?<bdi dir="ltr">{sourceDigits(s)}</bdi>:<span dir="auto">{sourceName(s,a.lang)}{mostly(s)?' · '+mostly(s):''}</span>}{chosen.has(s.key)&&<Check size={14} weight="bold" aria-hidden="true"/>}</button>)}
  </div>)}
 </div>;
}

// Statistics › Money: one panel per person (and Shared, and the cards not assigned yet) with their cards stacked, a
// small bar per month, this month and the average of the earlier months. The deck's front card and its row are the
// selected card (gold ring, highlighted row); a row also opens that card's months and what is known about it.
export function SourcePanels({a,index,rows,months,Avatar,money,memberIds,Select,onSave,onSaved}){
 const [open,setOpen]=useState(null),[front,setFront]=useState({}),[editing,setEditing]=useState(null),series=useMemo(()=>monthlyBySource(rows,index,months),[rows,index,months]);
 const mostly=useMostlyAt(a,rows,index); // before any early return (hook order)
 const groups=sourceGroups(index,memberIds).map(g=>({...g,sources:g.sources.filter(s=>(series.get(s.key)||[]).some(Boolean))})).filter(g=>g.sources.length);
 if(!groups.length||!index.list.some(s=>s.kind!=='manual'))return null;
 const avg=v=>{const done=v.slice(0,-1).filter(Boolean);return done.length?Math.round(done.reduce((n,x)=>n+x,0)/done.length):null};
 const monthName=(m,long)=>new Date(m+'-15T12:00:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',long?{month:'long',year:'numeric'}:{month:'short'});
 const now=months.at(-1),canEdit=!!(onSave&&Select);
 return <section className="source-panels" aria-label={a.T('Spending by person and card','הוצאות לפי אדם וכרטיס')}>
  <header className="source-panels-head"><h3>{a.T('By person and card','לפי אדם וכרטיס')}</h3><p>{a.T('Last six months · this month and the monthly average of the months before it','ששת החודשים האחרונים · החודש והממוצע החודשי של החודשים שלפניו')}</p></header>
  <div className="source-panels-grid">{groups.map(g=>{const total=g.sources.reduce((n,s)=>n+series.get(s.key).at(-1),0),average=g.sources.reduce((n,s)=>n+(avg(series.get(s.key))||0),0),cards=g.sources.filter(s=>s.kind!=='manual');
   const selected=cards.some(c=>c.key===front[g.id])?front[g.id]:cards[0]?.key;
   return <article key={g.id} className={'source-panel'+(g.id==='unassigned'?' unassigned':'')}>
    <header><GroupFace a={a} id={g.id} Avatar={Avatar} size={44}/><div><h4>{groupName(a,g.id)}</h4><p>{monthName(now,true)} <b><bdi dir="ltr">{money(total)}</bdi></b> · {a.T('average ','ממוצע ')}<bdi dir="ltr">{money(average)}</bdi></p></div></header>
    {g.id==='unassigned'&&<div className="source-assign-note"><p>{a.T('RiseUp does not say whose a card is. Choose whose each one is, so its spending shows under the right person.','RiseUp לא מציין של מי הכרטיס. בחרו של מי כל אחד, כדי שההוצאות יופיעו אצל האדם הנכון.')}</p>{canEdit&&<button type="button" className="button secondary" onClick={()=>setEditing({keys:cards.map(c=>c.key)})}>{a.T('Choose whose','לבחור של מי')}</button>}</div>}
    {cards.length>0&&<CardDeck a={a} cards={cards} Avatar={Avatar} focus={selected} hint={mostly} onFocus={k=>setFront({...front,[g.id]:k})}/>}
    <ul className="source-rows">{g.sources.map(s=>{const v=series.get(s.key),max=Math.max(1,...v),av=avg(v),expanded=open===s.key,isSelected=s.key===selected;
     return <li key={s.key} className={'source-row-item'+(expanded?' is-expanded':'')+(isSelected?' is-selected':'')}>
      <button type="button" className="source-row" aria-expanded={expanded} aria-current={isSelected?'true':undefined} onClick={()=>{setOpen(expanded?null:s.key);if(s.kind!=='manual')setFront({...front,[g.id]:s.key})}}>
       <IssuerMark source={s} size={30}/><span className="source-row-name"><b dir="auto">{sourceName(s,a.lang)}</b><small>{s.last4?<bdi dir="ltr">{sourceDigits(s)}</bdi>:s.kind==='manual'?'':<span className="source-row-prompt">{a.T('Add the ending','להוסיף סיומת')}</span>}</small></span>
       <span className="source-mini" aria-hidden="true">{v.map((x,i)=><i key={i} className={i===v.length-1?'now':''} style={{height:Math.round(x/max*36)+3+'px','--bar':sourceLook(s).bg,'--bar-dark':sourceLook(s).accent}}/>)}</span>
       <span className="source-row-sum"><b><bdi dir="ltr">{money(v.at(-1))}</bdi></b><small>{av!=null?<>{a.T('avg ','ממוצע ')}<bdi dir="ltr">{money(av)}</bdi></>:'—'}</small></span>
       <CaretDown className="source-row-caret" size={16} aria-hidden="true"/>
       {mostly(s)&&<span className="source-row-where" dir="auto">{mostly(s)}</span>}
      </button>
      {expanded&&<SourceDetail a={a} source={s} values={v} months={months} average={av} rows={rows.filter(r=>index.keyOf(r)===s.key)} money={money} monthName={monthName} onEdit={canEdit&&s.kind!=='manual'?()=>setEditing({keys:[s.key]}):null}/>}
     </li>})}</ul>
   </article>})}</div>
  {editing&&<SourcesEditor a={a} index={index} only={editing.keys} Avatar={Avatar} Select={Select} onSave={onSave} onClose={async saved=>{setEditing(null);if(saved)await onSaved?.()}}/>}
 </section>;
}

// The stacked cards of one person (concept C), round 2. The front card is the selected one and wears the gold ring.
// Every card is reachable: swipe the deck, use the arrows or the dots under it, tap a card behind or the "+N", or use
// the arrow keys. The others keep their stacked places; with reduced motion nothing animates.
function CardDeck({a,cards,Avatar,focus,onFocus,hint=()=>'',width=168,step=56}){
 const n=cards.length,at=Math.max(0,cards.findIndex(c=>c.key===focus)),visible=Math.min(3,n),rtl=a.lang==='he';
 const [move,setMove]=useState(null),swipe=React.useRef(null),swiped=React.useRef(0);
 const slotOf=i=>(i-at+n)%n; // 0 = front, 1 = right behind it …
 const place=(pos,extra=0)=>`translate(calc(var(--fan-dir) * ${pos*step-extra}px), ${pos*7+extra*.2}px) rotate(${-4*pos}deg)`;
 const go=i=>{const next=(i+n)%n;if(next===at)return;setMove({key:cards[next].key,from:slotOf(next),tick:(move?.tick||0)+1});onFocus(cards[next].key)};
 const h=Math.round(width/1.586),extra=n-visible;
 const keys=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const forward=(e.key==='ArrowLeft')===rtl;go(at+(forward?1:-1))};
 const down=e=>{swipe.current={x:e.clientX,y:e.clientY}};
 const up=e=>{const s=swipe.current;swipe.current=null;if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.abs(dx)<36||Math.abs(dx)<Math.abs(dy))return;swiped.current=Date.now();go(at+((dx<0)!==rtl?1:-1))};
 const Prev=rtl?CaretRight:CaretLeft,Next=rtl?CaretLeft:CaretRight,label=c=>sourceName(c,a.lang)+(c.last4?' '+sourceDigits(c):hint(c)?' · '+hint(c):'');
 return <div className="source-deck" role="group" aria-roledescription={a.T('card deck','חפיסת כרטיסים')} aria-label={a.T('Cards: ','כרטיסים: ')+label(cards[at])+' · '+(at+1)+'/'+n} onKeyDown={keys}>
  <div className="source-deck-row">
   <div className="source-fan-stage" style={{'--fan-w':width+(visible-1)*step+'px','--fan-h':h+(visible-1)*7+'px'}} onPointerDown={down} onPointerUp={up} onPointerCancel={()=>{swipe.current=null}}>
    {cards.map((c,i)=>{const slot=slotOf(i),shown=slot<visible,pos=shown?visible-1-slot:0,arriving=move?.key===c.key&&slot===0;
     return <button key={c.key} type="button" tabIndex={shown?0:-1} aria-hidden={shown?undefined:true} className={'source-fan-card'+(slot===0?' front':'')+(shown?'':' hidden')+(arriving?' arrive-'+(move.tick%2?'a':'b'):'')} aria-current={slot===0?'true':undefined} aria-label={(slot===0?a.T('Selected: ','נבחר: '):a.T('Bring to front: ','להביא לחזית: '))+label(c)}
      onClick={()=>{if(Date.now()-swiped.current<400)return;if(slot!==0)go(i)}}
      style={{zIndex:n-slot,transform:shown?place(pos):place(0,24),'--from':place(Math.max(0,visible-1-Math.min(move?.from??0,visible-1))),'--to':place(pos),'--lift':`translate(calc(var(--fan-dir) * ${Math.max(0,visible-1-Math.min(move?.from??0,visible-1))*step}px), ${-h*.32}px) rotate(0deg)`}}><PaymentCard a={a} source={c} Avatar={Avatar} width={width}/></button>})}
   </div>
  </div>
  {n>1&&<div className="source-deck-nav"><button type="button" className="icon-button" aria-label={a.T('Previous card','הכרטיס הקודם')} onClick={()=>go(at-1)}><Prev size={20}/></button>
   <span className="source-deck-dots" aria-hidden="true">{cards.map((c,i)=><button key={c.key} type="button" tabIndex={-1} className={i===at?'on':''} onClick={()=>go(i)}><i/></button>)}</span>
   <button type="button" className="icon-button" aria-label={a.T('Next card','הכרטיס הבא')} onClick={()=>go(at+1)}><Next size={20}/></button>
   {extra>0&&<button type="button" className="source-deck-more" aria-label={a.T('Show the next card','להציג את הכרטיס הבא')+' (+'+extra+')'} onClick={()=>go(at+1)}>{'⁦+'+extra+'⁩'}</button>}</div>}
 </div>;
}

function SourceDetail({a,source,values,months,average,rows,money,monthName,onEdit}){
 const max=Math.max(1,...values,average||0),cats=new Map();for(const r of rows)cats.set(r.category||'other',(cats.get(r.category||'other')||0)+r.spent);
 const top=[...cats].filter(([,n])=>n>0).sort((x,y)=>y[1]-x[1]).slice(0,3),label=id=>CATEGORY[id]?.[a.lang==='he'?'he':'en']||id;
 return <div className="source-detail">
  <div className="source-detail-bars" role="img" aria-label={sourceName(source,a.lang)+': '+months.map((m,i)=>monthName(m)+' '+money(values[i])).join(', ')}>
   {months.map((m,i)=><span key={m} className={'source-detail-bar'+(i===months.length-1?' now':'')}><small><bdi dir="ltr">{values[i]?money(values[i]):''}</bdi></small><i style={{height:Math.round(values[i]/max*110)+2+'px','--bar':sourceLook(source).bg,'--bar-dark':sourceLook(source).accent}}/><span>{monthName(m)}</span></span>)}
   {average!=null&&<span className="source-detail-average" style={{bottom:Math.round(average/max*110)+2+26+'px'}}/>}
  </div>
  {average!=null&&<p className="source-detail-legend"><i aria-hidden="true"/>{a.T('Monthly average ','ממוצע חודשי ')}<bdi dir="ltr">{money(average)}</bdi></p>}
  {top.length>0&&<p className="source-detail-top">{a.T('Most spent on: ','הכי הרבה על: ')}{top.map(([c,n],i)=><span key={c}>{i?' · ':''}{label(c)} <bdi dir="ltr">{money(n)}</bdi></span>)}</p>}
  {source.kind!=='manual'&&(source.unassigned||!source.last4||source.inferred?.last4||source.inferred?.owner)&&<div className="source-detail-assign">
   <p>{source.inferred?.last4==='statement'||source.inferred?.owner==='statement'?<><Sparkle size={16} aria-hidden="true"/>{a.T('Matched to your statement card by the same purchases. Please confirm.','הותאם לכרטיס מדף החשבון לפי אותן קניות. כדאי לאשר.')}</>:source.inferred?.owner||source.inferred?.last4?<><Sparkle size={16} aria-hidden="true"/>{a.T('Taken from the card’s RiseUp nickname. Please confirm.','נלקח מהכינוי של הכרטיס ב־RiseUp. כדאי לאשר.')}</>:source.unassigned&&!source.last4?a.T('Whose card is this, and which ending? RiseUp does not say.','של מי הכרטיס הזה, ומה הסיומת? RiseUp לא מציין.'):source.unassigned?a.T('Whose card is this? RiseUp does not say.','של מי הכרטיס הזה? RiseUp לא מציין.'):a.T('Which ending does this card have? RiseUp does not send it.','מה הסיומת של הכרטיס? RiseUp לא שולח אותה.')}</p>
   {onEdit&&<button type="button" className="button secondary" onClick={onEdit}>{source.inferred?.last4||source.inferred?.owner?a.T('Confirm or change','לאשר או לשנות'):source.unassigned?a.T('Choose whose','לבחור של מי'):a.T('Add the ending','להוסיף סיומת')}</button>}
  </div>}
  {source.kind!=='manual'&&<p className="source-detail-via">{a.T('From ','מקור: ')}{source.via.map(v=>v==='riseup'?'RiseUp':v==='statement'?a.T('statements','דפי חשבון'):a.T('recorded entries','רישום ידני')).join(' + ')}</p>}
 </div>;
}

// Cards & accounts: whose each one is (a bank account is shared unless someone is chosen), its last four digits when
// the source does not say (RiseUp never does), and an optional name. Saving digits joins a RiseUp card with its
// statement card. Uses the one Household window and section anatomy.
export function SourcesEditor({a,index,Avatar,Select,onSave,onClose,only}){
 // `only`: open on these cards alone ("Whose card is this?" from Statistics); otherwise every card and account.
 const editable=index.list.filter(s=>s.kind!=='manual'&&(!only||only.includes(s.key)));
 const [drafts,setDrafts]=useState(()=>Object.fromEntries(editable.map(s=>[s.key,{owner:s.shared?'shared':s.ownerId||'',last4:s.last4||''}])));
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const adults=a.members.filter(m=>m.role!=='child'&&!m.former);
 const typedEnding=s=>s.keys.some(k=>k.startsWith('riseup:'))&&!s.keys.some(k=>/^[a-z]+:\d{4}$/.test(k));
 // An inferred owner or ending counts as a change, so Save confirms it.
 const changed=s=>{const d=drafts[s.key];return d.owner!==(s.shared?'shared':s.ownerId||'')||(typedEnding(s)&&d.last4!==(s.last4||''))||!!(s.inferred?.owner||s.inferred?.last4)};
 const submit=async e=>{e.preventDefault();setError('');const list=editable.filter(changed);if(!list.length){onClose();return}
  for(const s of list)if(drafts[s.key].last4&&!/^\d{4}$/.test(drafts[s.key].last4)){setError(a.T('Enter exactly four digits, or leave it empty.','יש להזין בדיוק ארבע ספרות, או להשאיר ריק.'));return}
  setSaving(true);try{for(const s of list){const d=drafts[s.key];await onSave({key:s.keys.find(k=>k.startsWith('riseup:'))||s.keys[0],ownerId:d.owner&&d.owner!=='shared'?d.owner:null,shared:d.owner==='shared'?true:d.owner?false:null,last4:typedEnding(s)?d.last4||null:s.inferred?.last4&&s.keys.some(k=>k.startsWith('riseup:'))?s.last4:null,label:null})}onClose(true)}catch(err){setError(err.message||a.T('Could not save. Try again.','לא ניתן לשמור. אפשר לנסות שוב.'))}finally{setSaving(false)}};
 const groups=sourceGroups(index,adults.map(m=>m.id)).map(g=>({...g,sources:g.sources.filter(s=>s.kind!=='manual'&&(!only||only.includes(s.key)))})).filter(g=>g.sources.length);
 return <HouseholdForm a={a} title={only?(only.length===1?a.T('Whose card is this?','של מי הכרטיס הזה?'):a.T('Whose cards are these?','של מי הכרטיסים האלה?')):a.T('Cards & accounts','כרטיסים וחשבונות')} onClose={()=>onClose(false)} onSubmit={submit} saving={saving} error={error} actions={<button type="submit" className="button" disabled={saving}>{saving?a.T('Saving…','שומרים…'):a.T('Save','שמירה')}</button>}>
  <p className="source-editor-lead">{a.T('Choose whose each card is. Bank accounts are shared unless you choose someone. RiseUp does not send card endings: add the last four digits to join a RiseUp card with its statement.','בחרו של מי כל כרטיס. חשבון בנק משותף אלא אם בוחרים מישהו. RiseUp לא שולח את סיומת הכרטיס: הוסיפו 4 ספרות אחרונות כדי לחבר כרטיס מ־RiseUp לדף החשבון שלו.')}</p>
  {groups.map(g=><FormSection key={g.id} T={a.T} icon={g.id==='shared'?UsersThree:g.id==='unassigned'?Question:Cards} tone={g.id==='shared'?'peach':g.id==='unassigned'?'yellow':'blue'} title={groupName(a,g.id)}>
   {g.sources.map(s=>{const d=drafts[s.key],set=patch=>setDrafts({...drafts,[s.key]:{...d,...patch}});return <div key={s.key} className="source-editor-row">
    <PaymentCard a={a} source={{...s,shared:d.owner==='shared',ownerId:d.owner==='shared'?null:d.owner||s.ownerId,last4:d.last4&&/^\d{4}$/.test(d.last4)?d.last4:s.last4,label:s.label}} Avatar={Avatar} width={150}/>
    <div className="source-editor-fields">
     <label>{a.T('Whose is it?','של מי?')}<Select aria-label={a.T('Whose is ','של מי ')+sourceName(s,a.lang)} value={d.owner} onChange={e=>set({owner:e.target.value})}>{!d.owner&&<option value="">{a.T('Not chosen yet','עדיין לא נבחר')}</option>}<option value="shared">{a.T('Shared','משותף')}</option>{adults.map(m=><option key={m.id} value={m.id}>{a.name(m.id)}</option>)}</Select></label>
     {typedEnding(s)&&<label>{a.T('Last 4 digits (optional)','4 ספרות אחרונות (לא חובה)')}<input inputMode="numeric" pattern="\d{4}" maxLength={4} dir="ltr" value={d.last4} onChange={e=>set({last4:e.target.value.replace(/\D/g,'').slice(0,4)})}/></label>}
     {(s.inferred?.owner||s.inferred?.last4)?<small className="source-editor-hint"><Sparkle size={14} aria-hidden="true"/> {s.inferred.last4==='statement'||s.inferred.owner==='statement'?a.T('Matched to your statement card by the same purchases. Save to confirm.','הותאם לכרטיס מדף החשבון לפי אותן קניות. שמירה מאשרת.'):a.T('Taken from the RiseUp nickname. Save to confirm.','נלקח מהכינוי ב־RiseUp. שמירה מאשרת.')}</small>:s.unassigned?<small className="source-editor-hint">{a.T('RiseUp does not say whose this card is.','RiseUp לא מציין של מי הכרטיס.')}</small>:null}
    </div>
   </div>})}
  </FormSection>)}
 </HouseholdForm>;
}
