import {allowInitialTextFocus} from './form-focus';
import React,{useState,useEffect,useRef} from 'react';
import {Plus,ListChecks,PencilSimple,CheckCircle,Archive,ArrowCounterClockwise,X,ShoppingCart,Copy,Link,Trash,LockSimple,DotsThree,Check,GearSix,Camera,Scan,Receipt,ClockCounterClockwise} from '@phosphor-icons/react';
import {AvatarStack} from './avatar-stack';
import {SwipeRow} from './swipe-row';
import {fxBus,fxQuiet} from './motion-fx';
import {createShoppingList,canAccessList,canDeleteShoppingList,canDeleteShoppingItem,personalShoppingListId} from '../../shared/shopping-lists.mjs';
import {openShopOf} from '../../shared/shopping-history.mjs';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {anchor} from './data';
import {FormSection} from './form-section.jsx';
// Shopping lists (shopping-view.jsx): one strip of list cards (family and private together, the open one highlighted,
// "+ New list" at the end), a header for the open list with its actions in one row (secondary ones fold into "⋯" when
// the column is narrow), and the "All lists" manager / new list dialog.
// Only in the ⋯ menu, also on wide screens (where the other actions are buttons): delete and the smart-shopping extras.
const MENU_ONLY=['delete','smart','receipt','prices','note','history'];
export function useShoppingLists({app:a,tab,onSelect,counts,stateEl,shopping,onSettings,onReceipt,onPrices,onNote,onHistory,ui:{Button,Badge,Tabs,Visibility,Avatar,Icon}}){
 const [manager,setManager]=useState(false),[view,setView]=useState('active'),[draft,setDraft]=useState(null),[copyRemaining,setCopyRemaining]=useState(false),[menu,setMenu]=useState(false),menuRef=useRef(null),stripRef=useRef(null);
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,draft,{enabled:!!draft,key:draft?.id||draft?.mode||null});
 const lists=(a.data.shoppingLists||[]).filter(l=>canAccessList(l,a.user)&&!l.shopOf)/* finished shops live in History (2026-11-12) */,active=lists.filter(l=>l.status==='active'),current=lists.find(l=>l.id===tab),listName=l=>a.lang==='he'?l.he||l.name:l.name,scopeOf=l=>l?.visibility==='private'?'private':'family';
 // The family's shared list is the default (2026-11-12). Each person's automatic private list ("My shopping") is not in the
 // strip while it is empty and has never had a shop; it appears with its first item. A child keeps it (it is the child's list).
 const child=a.member(a.user)?.role==='child',unused=l=>!child&&l.id===personalShoppingListId(a.user)&&!a.visible(a.data.shopping).some(i=>(i.listId||'week')===l.id)&&!(a.data.shoppingLists||[]).some(s=>s.shopOf===l.id);
 const shown=active.filter(l=>!unused(l)),strip=[...shown.filter(l=>l.visibility!=='private'),...shown.filter(l=>l.visibility==='private')];if(current&&(current.status!=='active'||unused(current))&&!strip.includes(current))strip.unshift(current);
 useEffect(()=>{if(new URLSearchParams(a.route.split('?')[1]||'').get('list'))return;if(!current&&strip[0])onSelect(strip[0].id,scopeOf(strip[0]));else if(current&&unused(current)&&strip.find(l=>l!==current))onSelect(strip.find(l=>l!==current).id,'family')},[tab,a.data.shoppingLists]);
 useEffect(()=>{stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'})},[tab]);
 useEffect(()=>{if(!menu)return;const off=e=>{if(!menuRef.current?.contains(e.target))setMenu(false)},key=e=>{if(e.key==='Escape')setMenu(false)};document.addEventListener('pointerdown',off,true);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',off,true);document.removeEventListener('keydown',key)}},[menu]);
 const openCreate=(from='page')=>{setDraft({name:'',visibility:current?.visibility==='private'?'private':'family',allowedIds:[],mode:'new',from:from==='manager'?'manager':'page'});setManager(true)};
 const save=async e=>{e.preventDefault();if(!draft.name.trim())return;const newId=crypto.randomUUID();return commit(async()=>{if(draft.id){await a.update(d=>{const list=d.shoppingLists.find(l=>l.id===draft.id);if(list.ownerId!==a.user)throw Error('Only the owner can rename this list.');list.name=draft.name.trim();list.he=draft.name.trim()})}else{const spec={id:newId,name:draft.name,ownerId:a.user,visibility:draft.visibility,allowedIds:draft.allowedIds};const preview=structuredClone(a.data);createShoppingList(preview,spec);await a.update(d=>createShoppingList(d,spec));onSelect(newId,draft.visibility==='private'?'private':'family',{focus:true})}setDraft(null);setManager(false);a.notify(draft.id?a.T('List renamed.','שם הרשימה עודכן.'):a.T('List ready. You are in it now.','הרשימה מוכנה ואתם בתוכה.'))})};
 // One way to end a shop is Finish (2026-11-12). A list nobody needs goes to the archive; old "completed" lists show there too.
 const status=(list,next)=>commit(()=>a.update(d=>{d.shoppingLists.find(l=>l.id===list.id).status=next}),()=>a.notify(next==='archived'?a.T('List archived. You can restore it from All lists.','הרשימה הועברה לארכיון. אפשר לשחזר אותה מכל הרשימות.'):a.T('List restored.','הרשימה שוחזרה.')));
 const inList=(i,l)=>(i.listId||'week')===l.id,canDelete=l=>canDeleteShoppingList(l,a.user)&&a.visible(a.data.shopping).filter(i=>inList(i,l)).every(i=>canDeleteShoppingItem(i,a.data.shoppingLists,a.user));
 const removeList=(l,then)=>{if(!canDelete(l))return;let list,items=[],trips=[];return commit(()=>a.update(d=>{list=d.shoppingLists.find(x=>x.id===l.id);items=d.shopping.filter(i=>inList(i,l));trips=d.tasks.filter(t=>t.shoppingListId===l.id&&t.ownerId===a.user);d.shoppingLists=d.shoppingLists.filter(x=>x.id!==l.id);d.shopping=d.shopping.filter(i=>!inList(i,l));d.tasks=d.tasks.filter(t=>!trips.includes(t));for(const t of d.tasks)if(t.shoppingListId===l.id)delete t.shoppingListId}),()=>{then?.();if(tab===l.id){const next=active.find(x=>x.id!==l.id);if(next)onSelect(next.id,scopeOf(next))}fxBus.emit('deleted',{label:listName(l),restore:async()=>{fxQuiet.on=true;try{await a.update(d=>{if(list&&!d.shoppingLists.some(x=>x.id===list.id))d.shoppingLists.push(list);const have=new Set(d.shopping.map(i=>i.id));d.shopping.push(...items.filter(i=>!have.has(i.id)).map(i=>i.ownerId===a.user?i:{...i,ownerId:a.user}));const tasks=new Set(d.tasks.map(t=>t.id));d.tasks.push(...trips.filter(t=>!tasks.has(t.id)))})}finally{fxQuiet.on=false}}})})};
 // Deleting a whole list (its ⋯ menu, its Rename window or All lists) asks first, naming the list and how many items go with it.
 const askRemove=(l,then)=>{if(!canDelete(l))return;const n=countOf(l)[1],name=listName(l);if(window.confirm(n?a.T('Delete "'+name+'" and its '+(n===1?'1 item':n+' items')+'? You can undo it right after.','למחוק את „'+name+'” ו'+(n===1?'את הפריט שבה':'את '+n+' הפריטים שבה')+'? אפשר לבטל מיד אחרי המחיקה.'):a.T('Delete the empty list "'+name+'"?','למחוק את הרשימה הריקה „'+name+'”?')))removeList(l,then)};
 const audience=l=>l.visibility==='family'?a.members.map(m=>m.id):[l.ownerId,...(l.allowedIds||[])];
 const shareText=l=>l.visibility==='private'?a.T('Only me','רק אני'):l.visibility==='family'?a.T('Family','כל המשפחה'):a.T(audience(l).length+' people',audience(l).length+' אנשים');
 const countOf=l=>{const items=a.visible(a.data.shopping).filter(i=>inList(i,l));return [items.filter(i=>i.done).length,items.length]};
 // The counter in words (owner report 2026-11-12: "0/0 collected" on an empty list): Empty, "5 items" while planning, and
 // "2/5 collected" only while a shop is in progress (someone started it).
 const shoppingNow=l=>!!openShopOf((a.data.shoppingLists||[]).filter(x=>canAccessList(x,a.user)),l.id);
 const countText=(l,done,total)=>!total?a.T('Empty','ריקה'):shoppingNow(l)?<><b>{done}/{total}</b> {a.T('collected','נאספו')}</>:a.T(total===1?'1 item':total+' items',total===1?'פריט אחד':total+' פריטים');
 const stripEl=<div className="list-selector-layout"><div className="tasks-lists shop2-lists" ref={stripRef} role="group" aria-label={a.T('Shopping lists','רשימות קניות')}>
  {strip.map(l=>{const [done,total]=countOf(l),chosen=l.id===tab;return <button type="button" key={l.id} aria-pressed={chosen} className={'tasks-list-card shop2-list-card'+(chosen?' chosen':'')+(l.status!=='active'?' closed':'')} onClick={()=>onSelect(l.id,scopeOf(l))}>
   <span className="tasks-list-icon"><Icon code={l.icon||'1F6D2'} size={30}/></span>
   <span className="tasks-list-text"><strong>{listName(l)}</strong><small>{countText(l,done,total)}</small></span>
   {l.visibility==='private'?<span className="shop2-list-private" title={shareText(l)}><LockSimple size={18} aria-label={a.T('Private · only me','פרטית · רק אני')}/></span>:<AvatarStack ids={audience(l)} Avatar={Avatar} name={a.name} size={22} max={3} label={a.T('Shared with','משותף עם')}/>}
   <span className="shop2-list-progress" aria-hidden="true" style={shoppingNow(l)?undefined:{visibility:'hidden'}}><i style={{width:(total?Math.round(done/total*100):0)+'%'}}/></span>
  </button>})}

 </div>  <button type="button" className="tasks-list-card tasks-list-new shop2-list-new" onClick={openCreate}><Plus size={22} weight="bold"/><strong>{a.T('New list','רשימה חדשה')}</strong></button></div>;
 const [done,total]=counts||(current?countOf(current):[0,0]);
 const more=current?[
  current.ownerId===a.user&&current.status!=='active'&&['status',ArrowCounterClockwise,a.T('Restore list','שחזור הרשימה'),()=>status(current,'active')],
  current.ownerId===a.user&&['rename',PencilSimple,a.T('Rename list','שינוי שם הרשימה'),()=>{setDraft({...current,mode:'new',from:'page'});setManager(true)}],
  ['all',ListChecks,a.T('All lists','כל הרשימות'),()=>{setDraft(null);setManager(true)}],
  onSettings&&['smart',GearSix,a.T('Shopping settings','הגדרות קניות'),onSettings],
  onNote&&['note',Scan,a.T('Photograph a list','צילום רשימה'),onNote],
  onReceipt&&['receipt',Camera,a.T('Photograph receipt','צילום קבלה'),onReceipt],
  onHistory&&['history',ClockCounterClockwise,a.T('Shopping history','היסטוריית קניות'),onHistory],
  onPrices&&['prices',Receipt,a.T('Prices and spending','מחירים והוצאות'),onPrices],
  canDelete(current)&&['delete',Trash,a.T('Delete list','מחיקת רשימה'),()=>askRemove(current)]].filter(Boolean):[];
 const headerEl=current?<header className="shop2-head">
  <div className="shop2-head-title">
   <span className="shop2-head-kicker">{current.visibility==='private'?<LockSimple size={16}/>:<ShoppingCart size={16}/>}{a.T('Shopping list','רשימת קניות')}{current.status!=='active'&&<Badge>{a.T('Archived','בארכיון')}</Badge>}</span>
   <h2>{listName(current)}</h2>
   <div className="shop2-head-meta">{stateEl||<span className="shop2-count"><b>{done}</b>/{total} {a.T('collected','נאספו')}</span>}{shopping&&<span className="shop2-progress" aria-hidden="true"><i style={{width:(total?Math.round(done/total*100):0)+'%'}}/></span>}<span className="shop2-share">{current.visibility==='private'?<><LockSimple size={17}/>{a.T('Only me','רק אני')}</>:<><AvatarStack ids={audience(current)} Avatar={Avatar} name={a.name} size={24} max={4} label={a.T('Shared with','משותף עם')}/><span className="shop2-share-text">{current.visibility==='family'?a.T('Shared with family','משותף עם המשפחה'):a.T('Shared with '+audience(current).length,'משותף עם '+audience(current).length)}</span></>}</span></div>
  </div>
  <div className="shop2-head-actions">
   {more.filter(([key])=>!MENU_ONLY.includes(key)).map(([key,I,text,fn])=><button type="button" key={key} className={'shop2-act shop2-act-wide'+(key==='rename'?' shop2-act-rename':'')} title={key==='rename'?text:undefined} aria-label={key==='rename'?text:undefined} onClick={fn}><I size={20}/><span>{text}</span></button>)}
   <div className="shop2-more" ref={menuRef}><button type="button" className="shop2-act shop2-act-icon" aria-haspopup="menu" aria-expanded={menu} aria-label={a.T('More list actions','פעולות נוספות לרשימה')} onClick={()=>setMenu(!menu)}><DotsThree size={24} weight="bold"/></button>
    {menu&&<div className="shop2-menu" role="menu">{more.map(([key,I,text,fn])=><button type="button" role="menuitem" key={key} className={MENU_ONLY.includes(key)?'':'ss-core'} onClick={()=>{setMenu(false);fn()}}><I size={20}/>{text}</button>)}</div>}</div>
  </div>
 </header>:!active.length?<div className="shopping-list-empty shop2-head"><p>{a.T('No active lists yet. Start a fresh list or reopen one from All lists.','אין רשימות פעילות. צרו רשימה או פתחו מחדש מתוך כל הרשימות.')}</p><div className="shop2-head-actions"><button type="button" className="shop2-act shop2-act-primary" onClick={openCreate}><Plus size={20}/>{a.T('Create a list','יצירת רשימה')}</button><button type="button" className="shop2-act" onClick={()=>{setDraft(null);setManager(true)}}><ListChecks size={20}/>{a.T('All lists','כל הרשימות')}</button></div></div>:null;
 // Windows on the shared section anatomy (form-window.css): title + X, sections, then Cancel and Save. Cancel goes back to
 // where the window was opened from: the All lists window, or the page.
 const closeAll=()=>{setManager(false);setDraft(null)},cancelDraft=()=>{if(draft?.from==='manager')setDraft(null);else closeAll()};
 const draftTitle=draft?(draft.id?a.T('Rename list','שינוי שם הרשימה'):a.T('New list','רשימה חדשה')):a.T('All lists','כל הרשימות');
 const modalEl=<>{!manager&&saveError&&<p className="save-error" role="alert">{saveError}</p>}{manager&&<div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)guard(closeAll)}}>{draft?<form className="tasks-sheet shop-list-sheet" role="dialog" aria-modal="true" aria-label={draftTitle} onSubmit={save}>
  <header><h2>{draftTitle}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>!saving&&guard(closeAll)}><X size={20}/></button></header>
  <div className="tasks-sheet-body"><FormSection T={a.T} icon={ShoppingCart} tone="blue" title={a.T('Details','פרטים')}><label className="shop-list-name">{a.T('List name','שם הרשימה')}<input autoFocus={allowInitialTextFocus()} required maxLength={60} placeholder={a.T('e.g. Weekend barbecue','למשל, על האש בסופ״ש')} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label></FormSection>
   {draft.mode==='new'&&!draft.id&&<FormSection T={a.T} icon={LockSimple} tone="lilac" title={a.T('Privacy & permissions','פרטיות והרשאות')}><Visibility value={draft.visibility} onChange={visibility=>setDraft({...draft,visibility})} allowed={draft.allowedIds} onAllowed={allowedIds=>setDraft({...draft,allowedIds})}/></FormSection>}
   {saveError&&<p role="alert" className="save-error">{saveError}</p>}</div>
  <div className="tasks-sheet-actions"><Button secondary onClick={()=>!saving&&guard(cancelDraft)}>{a.T('Cancel','ביטול')}</Button><Button disabled={saving} type="submit">{draft.id?a.T('Save name','שמירת שם'):a.T('Create list','יצירת רשימה')}</Button>{draft.id&&canDelete(lists.find(l=>l.id===draft.id))&&<Button secondary icon={Trash} disabled={saving} onClick={()=>askRemove(lists.find(l=>l.id===draft.id),closeAll)}>{a.T('Delete list','מחיקת רשימה')}</Button>}</div>
 </form>:<section className="tasks-sheet shop-list-sheet shop-lists-manager" role="dialog" aria-modal="true" aria-label={draftTitle}>
  <header><h2>{draftTitle}</h2><button type="button" className="icon-button" aria-label={a.T('Close lists','סגירת הרשימות')} onClick={()=>!saving&&closeAll()}><X size={20}/></button></header>
  <div className="tasks-sheet-body"><Tabs variant="view" value={view} onChange={setView} items={[["active",a.T('Lists','רשימות'),null,active.length],["archived",a.T('Archive','ארכיון'),null,lists.filter(l=>l.status!=='active').length]]}/>
   <div className="list-manager-rows">{lists.filter(l=>view==='active'?l.status==='active':l.status!=='active').map(l=>{const [done,total]=countOf(l);return <SwipeRow key={l.id} direction="left" onDelete={()=>askRemove(l)} label={a.T('Delete','מחיקה')} disabled={!canDelete(l)}><article><button type="button" className="list-open" onClick={()=>{onSelect(l.id,scopeOf(l));closeAll()}}>{l.visibility==='private'?<LockSimple size={26}/>:<ShoppingCart size={26}/>}<span><strong>{listName(l)}</strong><small>{countText(l,done,total)} · {shareText(l)}</small></span></button><div className="list-row-actions">{l.ownerId===a.user&&<><button type="button" className="icon-button" aria-label={a.T('Rename '+listName(l),'שינוי שם '+listName(l))} title={a.T('Rename list','שינוי שם הרשימה')} onClick={()=>setDraft({...l,mode:'new',from:'manager'})}><PencilSimple size={21}/></button><button type="button" className="icon-button" aria-label={a.T(l.status!=='active'?'Restore '+listName(l):'Archive '+listName(l),l.status!=='active'?'שחזור '+listName(l):'העברה לארכיון '+listName(l))} title={a.T(l.status!=='active'?'Restore':'Archive',l.status!=='active'?'שחזור':'העברה לארכיון')} onClick={()=>status(l,l.status!=='active'?'active':'archived')}><Archive size={21}/></button>{canDelete(l)&&<button type="button" className="icon-button" aria-label={a.T('Delete '+listName(l),'מחיקת '+listName(l))} title={a.T('Delete','מחיקה')} onClick={()=>askRemove(l)}><Trash size={21}/></button>}</>}</div></article></SwipeRow>})}</div>
   <p className="tasks-sheet-hint list-manager-help">{a.T('A list is shared with the people you chose when you made it. To add someone to the family:','רשימה משותפת עם מי שבחרתם כשיצרתם אותה. כדי להוסיף מישהו למשפחה:')} <button type="button" className="text-link" onClick={()=>a.go('family?invite=1')}><Link size={18}/>{a.T('Family sharing','שיתוף המשפחה')}</button></p>
   {saveError&&<p role="alert" className="save-error">{saveError}</p>}</div>
  <div className="tasks-sheet-actions"><Button secondary onClick={closeAll}>{a.T('Close','סגירה')}</Button><Button icon={Plus} onClick={()=>openCreate('manager')}>{a.T('New list','רשימה חדשה')}</Button></div>
 </section>}</div>}</>;
 return {strip:stripEl,header:headerEl,modal:modalEl,current,openCreate};
}
