// Bayit motion layer: pixel-art celebrations, honest save status, bell nudges and page entrances.
// Celebrations fire only after a change is confirmed (household server in cloud mode, device storage locally).
import {sectionRoot} from '../../shared/section-navigation.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {Bell,X,CloudCheck,CloudArrowUp,ArrowCounterClockwise,CheckCircle,WarningCircle,Play} from '@phosphor-icons/react';

const FX='/assets/generated/fx/',GEN='/assets/generated/';
export const sprite=name=>FX+name+'.png';

// --- tiny event bus: App.update() reports saves, FxLayer/SaveStatus listen ---
const listeners=new Set();
export const fxBus={on(fn){listeners.add(fn);return()=>listeners.delete(fn)},emit(type,payload){listeners.forEach(fn=>fn(type,payload))}};
let pending=0;
export function trackSave(saving,fx){
 if(!saving){fxBus.emit('save','local');if(fx)fxBus.emit('celebrate',fx);return}
 pending++;fxBus.emit('save','saving');
 saving.then(()=>{pending=Math.max(0,pending-1);if(!pending)fxBus.emit('save','saved');if(fx)fxBus.emit('celebrate',fx)},error=>{pending=Math.max(0,pending-1);
  // Offline: the change is kept on this device and sent when the connection returns. Not "saved" yet, not a failure either.
  if(error?.queued){fxBus.emit('save','queued');return}fxBus.emit('save','failed');fxBus.emit('failed')});
}

export const FX_STYLES=['calm','playful','party'];
export function fxStyleFor(appearance={},role){return FX_STYLES.includes(appearance.fx)?appearance.fx:role==='child'?'playful':'calm'}
const reducedMotion=()=>document.documentElement.dataset.motion==='reduced'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// --- what just happened? Compare the state before and after one update. ---
// Set while restoring deleted records (Undo), so a restore isn't celebrated as something new.
export const fxQuiet={on:false};
export function detectFx(prev,next){
 if(fxQuiet.on)return null;
 const added=key=>{const before=new Set((prev[key]||[]).map(x=>x.id));return (next[key]||[]).filter(x=>x&&!before.has(x.id))};
 for(const t of next.tasks||[]){const old=(prev.tasks||[]).find(o=>o.id===t.id);if(!old)continue;for(const [date,c] of Object.entries(t.completions||{})){const was=old.completions?.[date]?.state;if(!c||c.state===was)continue;if(c.state==='done'){const level=x=>Math.floor((x||0)/100)+1,before=level(prev.profiles?.[t.memberId]?.xp),after=level(next.profiles?.[t.memberId]?.xp);return {kind:'complete',record:t,date,xp:t.xp||0,memberId:t.memberId,routine:!!t.routine,levelUp:after>before?after:0}}if(c.state==='pending')return {kind:'pending',record:t,date,memberId:t.memberId,routine:!!t.routine}}}
 const events=added('events');if(events.length)return {kind:'event',record:events[0],collection:'events',ids:events.map(e=>e.id),memberIds:events[0].memberIds||[]};
 const tasks=added('tasks');if(tasks.length)return {kind:tasks[0].routine?'routine':'task',record:tasks[0],collection:'tasks',ids:tasks.map(t=>t.id),memberId:tasks[0].memberId,memberIds:tasks[0].memberIds||[]};
 const notes=added('notes');if(notes.length)return {kind:notes[0].visibility==='private'?'private-note':'note',record:notes[0],collection:'notes',ids:notes.map(n=>n.id),memberId:notes[0].memberId};
 const shopping=added('shopping');if(shopping.length)return {kind:'shopping',record:shopping[0],count:shopping.length,collection:'shopping',ids:shopping.map(s=>s.id)};
 const open=list=>(list||[]).filter(i=>!i.done&&!i.deletedAt).length;
 const justBought=(next.shopping||[]).some(i=>i.done&&(prev.shopping||[]).some(o=>o.id===i.id&&!o.done));
 if(justBought&&open(prev.shopping)>0&&open(next.shopping)===0)return {kind:'shopping-done'};
 const expenses=added('expenses');if(expenses.length)return {kind:'expense',record:expenses[0],collection:'expenses',ids:expenses.map(e=>e.id)};
 return null;
}

const KINDS={
 event:{sprite:'calendar-check',en:'Event added!',he:'האירוע נוסף!',view:['View in calendar','ליומן'],route:'calendar'},
 task:{sprite:'clipboard-check',en:'Task added!',he:'המשימה נוספה!',view:['View tasks','למשימות'],route:'tasks'},
 routine:{sprite:'rocket',en:'Routine ready!',he:'השגרה מוכנה!',view:['View routines','לשגרות'],route:'kids'},
 note:{sprite:'note',en:'Note saved!',he:'ההערה נשמרה!',view:['Open journal','ליומן הבית'],route:'journal'},
 'private-note':{sprite:'envelope-lock',en:'Kept just for you',he:'נשמר רק בשבילך',view:['Open my space','למקום שלי'],route:'mine'},
 shopping:{sprite:'shopping-bag',en:'Added to the list!',he:'נוסף לרשימה!',view:['Open list','לרשימה'],route:'shopping'},
 'shopping-done':{sprite:'cart',en:'List complete!',he:'הרשימה הושלמה!',route:null},
 expense:{sprite:'coin',en:'Expense recorded',he:'ההוצאה נרשמה',view:['Open expenses','להוצאות'],route:'household/expenses'},
 complete:{sprite:'check-badge',en:'Nice work!',he:'כל הכבוד!',route:null},
 pending:{sprite:'envelope-lock',en:'Sent for approval',he:'נשלח לאישור',route:null},
};
const CREATE_KINDS=new Set(['event','task','routine','note','private-note','shopping','expense']);
const SPARKS=['spark-yellow','spark-cobalt','twinkle-lilac','spark-yellow','confetti-cobalt','twinkle-lilac','spark-cobalt','confetti-yellow'];
const CONFETTI=['confetti-cobalt','confetti-yellow','confetti-lilac','confetti-apricot','confetti-green','spark-yellow','spark-cobalt','twinkle-lilac'];

function TitleAccent({text}){const words=String(text).split(' '),tail=words.pop(),prefix=words.join(' ');return <strong className="fx-title">{prefix}{prefix?' ':''}<span className="fx-title-end">{tail}<img className="fx-underline" src={GEN+'title-underline-clean.png'} alt=""/><img className="fx-rays" src={GEN+'title-rays.png'} alt=""/></span></strong>}

function Confetti({count=28,origin='top'}){
 const [pieces]=useState(()=>Array.from({length:count},(_,i)=>({src:sprite(CONFETTI[i%CONFETTI.length]),x:Math.round(Math.random()*100),dx:Math.round(Math.random()*160-80),r:Math.round(Math.random()*720-360),d:Math.round(Math.random()*500),t:1700+Math.round(Math.random()*1300),s:12+Math.round(Math.random()*14)})));
 return <div className={'fx-confetti fx-from-'+origin} aria-hidden="true">{pieces.map((p,i)=><img key={i} src={p.src} alt="" style={{'--x':p.x+'%','--dx':p.dx+'px','--r':p.r+'deg','--d':p.d+'ms','--t':p.t+'ms','--s':p.s+'px'}}/>)}</div>;
}

function Celebration({fx,style,T,go,undo,characterSrc,characterNode,avatar,close}){
 const kind=KINDS[fx.kind]||KINDS.task,record=fx.record||{},lang=T('en','he'),corner=fx.kind==='complete'||fx.kind==='pending'||fx.kind==='shopping-done';
 const people=[fx.memberId,...(fx.memberIds||[])].filter(Boolean),hero=people.map(id=>characterSrc?.(id)).find(Boolean)||(fx.preview?GEN+'avatar-noa-cape.png':null),heroNode=people.map(id=>characterNode?.(id)).find(Boolean);
 const name=lang==='he'?record.he||record.title:record.title||record.he;
 const when=[record.date&&new Date(record.date+'T12:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-US',{weekday:'short',month:'short',day:'numeric'}),record.time].filter(Boolean).join(' · ');
 const detail=fx.kind==='shopping'&&fx.count>1?T(fx.count+' items added to shopping',fx.count+' פריטים נוספו לקניות'):fx.kind==='complete'?[name,fx.xp?null:T('Marked done','סומן כבוצע')].filter(Boolean).join(' · '):fx.kind==='pending'?T(name+' · a parent will confirm it',name+' · הורה יאשר'):fx.kind==='shopping-done'?T('Everything is in the bag.','הכול בסל.'):[name,/item/i.test(record.quantity||'')?null:record.quantity,when].filter(Boolean).join(' · ');
 const title=fx.levelUp?T('Level up! Level '+fx.levelUp,'עלית שלב! שלב '+fx.levelUp):fx.kind==='complete'&&fx.routine?T('Routine step done!','שלב בשגרה הושלם!'):T(kind.en,kind.he);
 const life=corner?3800:4600;
 useEffect(()=>{const t=setTimeout(close,life*3);return()=>clearTimeout(t)},[]);// safety net if CSS animations are not running (background tab)
 return <div className={'fx-card fx-kind-'+fx.kind+(corner?' fx-corner':' fx-center')+(hero?' has-hero':'')} role="status" aria-live="polite" style={{'--life':life+'ms'}} onAnimationEnd={e=>{if(e.animationName==='fx-life')close()}}>
  <button type="button" className="fx-close" aria-label={T('Close','סגירה')} onClick={close}><X size={18} weight="bold"/></button>
  <div className="fx-stage" aria-hidden="true">
   <span className="fx-floor"/>
   {hero||heroNode?<>{heroNode?<span className="fx-hero">{heroNode}</span>:<img className="fx-hero" src={hero} alt=""/>}<img className="fx-prop" src={sprite(fx.levelUp?'crown':kind.sprite)} alt=""/></>:<img className="fx-hero fx-hero-sprite" src={sprite(kind.sprite)} alt=""/>}
   {SPARKS.map((s,i)=><img key={i} className="fx-spark" src={sprite(s)} alt="" style={{'--a':(i*45+20)+'deg','--i':i}}/>)}
   {fx.kind==='complete'&&fx.xp>0&&[0,1,2,3].map(i=><img key={'c'+i} className="fx-coin" src={sprite('coin')} alt="" style={{'--i':i}}/>)}
  </div>
  <div className="fx-copy">
   <TitleAccent text={title}/>
   {detail&&<p>{detail}</p>}
   {(fx.kind==='complete'&&fx.xp>0||people.length>0&&avatar)&&<div className="fx-meta">{fx.kind==='complete'&&fx.xp>0&&<span className="fx-xp">{'\u2066+'+(fx.xp)+' XP\u2069'}</span>}{avatar&&people.slice(0,3).map(id=><span className="fx-face" key={id}>{avatar(id)}</span>)}</div>}
  </div>
  <span className="fx-life" aria-hidden="true"><span/></span>
  {!fx.preview&&(kind.route||fx.ids||fx.kind==='complete')&&<div className="fx-actions">
   {kind.route&&<button type="button" className="button" onClick={()=>{go(kind.route);close()}}>{T(...kind.view)}</button>}
   {(fx.ids||fx.kind==='complete')&&undo&&<button type="button" className="button secondary" onClick={()=>{undo(fx);close()}}><ArrowCounterClockwise size={18}/>{T('Undo','ביטול')}</button>}
  </div>}
 </div>;
}

// Renders toasts and celebrations. Replaces the plain bottom toast in App.
export function FxLayer({toast,appearance,role,T,go,undo,route,characterSrc,characterNode,avatar}){
 const [removed,setRemoved]=useState(null),[undoBusy,setUndoBusy]=useState(false);
 useEffect(()=>fxBus.on((type,payload)=>{if(type==='deleted')setRemoved({...payload,key:Date.now()})}),[]);
 useEffect(()=>{if(!removed||undoBusy)return;const t=setTimeout(()=>setRemoved(null),6000);return()=>clearTimeout(t)},[removed,undoBusy]);
 const style=fxStyleFor(appearance,role),[card,setCard]=useState(null),[party,setParty]=useState(0),[failed,setFailed]=useState(false),[previewToast,setPreviewToast]=useState(''),shownAt=useRef(0),styleRef=useRef(style);
 styleRef.current=style;
 const routeRef=useRef(route);routeRef.current=route;
 useEffect(()=>fxBus.on((type,fx)=>{
  if(type==='failed'){setCard(null);setFailed(true);setTimeout(()=>setFailed(false),4500);return}
  if(type!=='celebrate')return;
  const s=fx.style||styleRef.current;
  if(s==='calm'){if(fx.preview||CREATE_KINDS.has(fx.kind)){const k=KINDS[fx.kind]||KINDS.task,r=fx.record||{},n=T(r.title||'',r.he||r.title||'');setPreviewToast(fx.preview?T('Saved.','נשמר.'):T(k.en,k.he)+(n?' '+n:''))}return}
  if(!fx.preview&&(CREATE_KINDS.has(fx.kind)?appearance?.fxCreate===false:appearance?.fxComplete===false))return;
  // Adding items on the Shopping page itself: the new row is the feedback; no pop-up covering the add bar.
  if(!fx.preview&&fx.kind==='shopping'&&String(routeRef.current||'').startsWith('shopping'))return;
  shownAt.current=Date.now();setCard({...fx,key:shownAt.current});
  if(!reducedMotion()&&(s==='party'||fx.kind==='shopping-done'||fx.levelUp))setParty(shownAt.current);
 }),[appearance?.fxCreate,appearance?.fxComplete,T]);
 useEffect(()=>{if(!party)return;const t=setTimeout(()=>setParty(0),3400);return()=>clearTimeout(t)},[party]);
 useEffect(()=>{if(!previewToast)return;const t=setTimeout(()=>setPreviewToast(''),3000);return()=>clearTimeout(t)},[previewToast]);
 // Animate only entry into a main section; inner tabs keep their menu visible.
 const entranceSection=useRef(null);
 useEffect(()=>{const main=document.querySelector('.main-content'),section=sectionRoot(route),changed=entranceSection.current!==section;entranceSection.current=section;if(!main)return;main.classList.remove('fx-enter');if(!changed||style==='calm')return;void main.offsetWidth;main.classList.add('fx-enter');const t=setTimeout(()=>main.classList.remove('fx-enter'),1400);return()=>clearTimeout(t)},[route,style]);
 const message=typeof toast==='string'?toast:'',decided=useRef({message:'',absorbed:false});
 // The celebration already tells the user it saved; hide the duplicate plain toast (decided once per message).
 if(decided.current.message!==message)decided.current={message,absorbed:!!(message&&!failed&&Date.now()-shownAt.current<1500)};
 const shown=previewToast||(!decided.current.absorbed&&message);
 return <>
  {removed&&<div role="status" key={removed.key} className="toast fx-toast undo-toast"><img className="fx-toast-sprite" src={sprite('undo')} alt=""/><span>{removed.label?T('Deleted “'+removed.label+'”','נמחק „'+removed.label+'”'):T('Deleted','נמחק')}</span><button type="button" disabled={undoBusy} onClick={async()=>{if(undoBusy)return;setUndoBusy(true);try{await removed.restore();setRemoved(null)}catch{setRemoved(v=>v?{...v,key:Date.now()}:v)}finally{setUndoBusy(false)}}}>{T('Undo','ביטול')}</button></div>}
  {!removed&&shown&&<div role="status" className={'toast'+(style!=='calm'?' fx-toast':'')+(failed?' fx-toast-failed':'')}>{style!=='calm'?<img className="fx-toast-sprite" src={sprite(failed?'undo':'check-badge')} alt=""/>:failed?<WarningCircle size={23}/>:<CheckCircle size={23}/>}{shown}</div>}
  {card&&<Celebration key={'card-'+card.key} fx={card} style={style} T={T} go={go} undo={undo} characterSrc={characterSrc} characterNode={characterNode} avatar={avatar} close={()=>setCard(null)}/>}
  {party>0&&<Confetti key={'confetti-'+party}/>}
  {style!=='calm'&&<CheckBursts/>}
 </>;
}

// Bell with a ring when new notifications arrive and a badge that pops.
export function BellFx({unread=0,size=27,showCount=true}){
 const prev=useRef(null),[ring,setRing]=useState(0);
 useEffect(()=>{if(prev.current===null?unread>0:unread>prev.current)setRing(Date.now());prev.current=unread},[unread]);
 useEffect(()=>{if(!ring)return;const t=setTimeout(()=>setRing(0),1600);return()=>clearTimeout(t)},[ring]);
 return <><i className={'bell-glyph'+(ring?' ring':'')} key={ring||'idle'}><Bell size={size}/>{ring>0&&<img className="bell-spark" src={sprite('spark-yellow')} alt=""/>}</i>{showCount&&unread>0&&<span key={'n'+unread} className="bell-count"><span className="bell-count-number">{unread>9?'9+':unread}</span></span>}</>;
}

// Small truthful save indicator for the header utility corner.
export function SaveStatus({T,cloud}){
 const [state,setState]=useState('idle');
 useEffect(()=>{let timer;const off=fxBus.on((type,value)=>{if(type!=='save')return;clearTimeout(timer);setState(value);if(value!=='saving')timer=setTimeout(()=>setState('idle'),value==='failed'?4500:1700)});return()=>{off();clearTimeout(timer)}},[]);
 if(state==='idle')return null;
 const label=state==='saving'?T('Saving…','שומרים…'):state==='queued'?T('Waiting to sync','ממתין לסנכרון'):state==='failed'?T('Not saved','לא נשמר'):state==='local'?T('Saved on this device','נשמר במכשיר'):T('Saved','נשמר');
 const img=state==='saving'||state==='queued'?'cloud-up':state==='failed'?'undo':'cloud-check',Glyph=state==='saving'||state==='queued'?CloudArrowUp:state==='failed'?WarningCircle:CloudCheck;
 return <span className={'save-status save-'+state} role="status" title={label}><img className="save-sprite" src={sprite(img)} alt=""/><Glyph className="save-glyph" size={20}/><span className="save-label">{label}</span>{state==='saving'&&<span className="save-dots" aria-hidden="true"><i/><i/><i/></span>}</span>;
}

// Settings → Colors & appearance → Animations & celebrations
export function FxSettings({appearance={},role,change,T,Switch,Button}){
 const style=fxStyleFor(appearance,role);
 const options=[
  ['calm',T('Calm','רגוע'),T('Quiet and simple. A small message at the bottom.','שקט ופשוט. הודעה קטנה למטה.')],
  ['playful',T('Playful','שובב'),T('Small pixel moments of joy when you add or finish things.','רגעי פיקסל קטנים כשמוסיפים או מסיימים.')],
  ['party',T('Party','מסיבה'),T('Big pixel confetti for little victories. Kids love it.','קונפטי פיקסלים לניצחונות קטנים. ילדים אוהבים.')],
 ];
 const preview=()=>fxBus.emit('celebrate',{kind:'event',preview:true,style,record:{title:'Family dinner',he:'ארוחת ערב משפחתית',date:new Date().toISOString().slice(0,10),time:'19:00'}});
 return <div className="fx-settings">
  <div className="fx-style-options" role="radiogroup" aria-label={T('Animation style','סגנון האנימציה')}>{options.map(([key,label,text])=><button type="button" role="radio" aria-checked={style===key} key={key} className={'fx-style-option'+(style===key?' selected':'')} onClick={()=>change({fx:key})}>
   <span className={'fx-mini fx-mini-'+key} aria-hidden="true">
    <span className="fx-mini-bar"/><span className="fx-mini-line"/><span className="fx-mini-line short"/>
    {key==='calm'&&<span className="fx-mini-toast"><CheckCircle size={14} weight="fill"/>{T('Saved','נשמר')}</span>}
    {key==='playful'&&<span className="fx-mini-card"><img src={GEN+'avatar-tom-cape.png'} alt=""/><img className="fx-mini-spark a" src={sprite('spark-yellow')} alt=""/><img className="fx-mini-spark b" src={sprite('spark-cobalt')} alt=""/><b>{T('You did it!','הצלחת!')}</b></span>}
    {key==='party'&&<>{CONFETTI.concat(CONFETTI).map((s,i)=><img key={i} className="fx-mini-confetti" src={sprite(s)} alt="" style={{left:(i*53%92)+'%',top:(14+i*37%64)+'px'}}/>)}<img className="fx-mini-hero" src={GEN+'avatar-noa-cape.png'} alt=""/></>}
   </span>
   <span className="fx-style-text"><strong>{label}</strong><small>{text}</small></span>
  </button>)}</div>
  <Switch checked={appearance.fxCreate!==false} onChange={v=>change({fxCreate:v})} label={T('Pop-up when I create something','חלון קופץ כשאני יוצר משהו')}/>
  <Switch checked={appearance.fxComplete!==false} onChange={v=>change({fxComplete:v})} label={T('Celebrate completed tasks','חגיגה למשימות שהושלמו')}/>
  <Switch checked={appearance.fxHeader!==false} onChange={v=>change({fxHeader:v})} label={T('Animate the bell and saving status','אנימציה לפעמון ולמצב השמירה')}/>
  <p className="fx-settings-note">{T('Reduce motion (Comfort & accessibility, or your device setting) always wins and keeps everything still.','הפחתת תנועה (בנוחות ונגישות או בהגדרות המכשיר) תמיד גוברת ומשאירה הכול שקט.')}</p>
  <Button secondary icon={Play} onClick={preview}>{T('Preview animation','תצוגה מקדימה')}</Button>
 </div>;
}

// --- Empty states: a pixel helper says the message in a speech bubble ---
const HELPERS=['tom','maya','ari','lia','dana','yoni','noa','itai'];
// Prefer characters nobody in this family uses, so the helper never looks like a specific member.
export function pickHelper(profiles={},text=''){
 const used=new Set(Object.values(profiles||{}).map(p=>p?.character).filter(Boolean)),pool=HELPERS.filter(h=>!used.has(h)),list=pool.length?pool:HELPERS;
 let hash=0;for(const ch of String(text))hash=(hash*31+ch.charCodeAt(0))>>>0;
 return 'avatar-'+list[hash%list.length]+(hash%2?'-cape':'-cap')+'.png';
}
export function EmptyHello({text,src}){
 return <div className="empty empty-hello"><img className="empty-helper" src={src} alt=""/><p className="empty-bubble">{text}</p></div>;
}

// --- Check-off bursts: sparks (and a tiny bag for shopping) where a checkbox was ticked ---
export function CheckBursts(){
 const [bursts,setBursts]=useState([]);
 useEffect(()=>{
  const onChange=e=>{const box=e.target;if(!(box instanceof HTMLInputElement)||box.type!=='checkbox'||!box.checked)return;const row=box.closest('.shopping-item,.task-row,.widget-item,.meal-ingredient');if(!row)return;const fx=document.documentElement.dataset.fx;if(fx==='calm'||reducedMotion())return;const r=box.getBoundingClientRect(),id=Date.now()+Math.random();setBursts(list=>[...list.slice(-4),{id,x:r.left+r.width/2,y:r.top+r.height/2,shop:row.classList.contains('shopping-item')||!!row.closest('.today-shopping,.shopping-widget')}]);setTimeout(()=>setBursts(list=>list.filter(b=>b.id!==id)),1000)};
  document.addEventListener('change',onChange,true);return()=>document.removeEventListener('change',onChange,true);
 },[]);
 return bursts.map(b=><div key={b.id} className="check-burst" style={{left:b.x,top:b.y}} aria-hidden="true">{[0,1,2,3,4,5].map(i=><img key={i} src={sprite(SPARKS[i])} alt="" style={{'--a':(i*60+15)+'deg'}}/>)}{b.shop&&<img className="check-bag" src={sprite('shopping-bag')} alt=""/>}</div>);
}
