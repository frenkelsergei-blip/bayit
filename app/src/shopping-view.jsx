import {allowInitialTextFocus} from './form-focus';
// Shopping page v2 (styles: shopping-v2.css). One list strip, a clear header for the open list, ONE add bar
// (icon and category picked automatically from the bilingual item dictionary), one compact filter row, compact rows.
import {PersonChip} from './person-chip';
import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {DensityToggle} from './density';
import {Plus,MagnifyingGlass,PencilSimple,X,Check,Trash,Tag,ArrowCounterClockwise,Basket,LockSimple,CaretDown,GearSix,BellRinging,Camera} from '@phosphor-icons/react';
import {FormSection} from './form-section.jsx';
import {SwipeRow} from './swipe-row';
import {Select} from './Select';
import {SmartCard,DateLine,ReviewWindow,SettingsWindow,FavouritesWindow,ReceiptWindow,PricesWindow,NoteWindow,DoneCard,useShoppingSmart} from './shopping-smart';
import {isNewItem,parseQuickAdd} from '../../shared/shopping-rhythm.mjs';
import {useShoppingLists} from './shopping-lists';
import {matchItem,SHOPPING_CATEGORIES,SHOPPING_CATEGORY_KEYS} from '../../shared/item-dictionary.mjs';
import {shoppingIdentity,shoppingTarget} from '../../shared/shopping-transfer.mjs';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {anchor} from './data';
import {canAccessList,canDeleteShoppingItem} from '../../shared/shopping-lists.mjs';
import {PendingSync} from './offline-ui';

const normal=name=>String(name||'').normalize('NFKC').trim().toLocaleLowerCase();
const UNIT_ALIASES={bottle:'bottles',bag:'bags',loaf:'loaves',pack:'packs',liter:'liters'};
// The unit of an item, also for older items that keep it only inside the quantity text ("2 bottles").
export const unitOf=item=>{const parts=String(item?.quantity||'').match(/^([\d.]+)\s*(.*)$/);return item?.unit||UNIT_ALIASES[parts?.[2]]||parts?.[2]||'items'};
const UNITS=[['items','יח׳'],['kg','ק״ג'],['g','גרם'],['liters','ליטר'],['bottles','בקבוקים'],['bags','שקיות'],['packs','אריזות'],['loaves','כיכרות']];

export function ShoppingView({app:a,ui}){
 const {Heading,Button,Badge,Tabs,Visibility,Avatar,Icon,Checkbox,Empty}=ui,members=a.members;
 const params=new URLSearchParams(a.route.split('?')[1]||'');
 const [tab,setTab]=useState(()=>params.get('list')||(params.get('scope')==='private'?'private-'+a.user+'-week':a.data.preferences.activeShoppingListByUser?.[a.user])||'week');
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false),[groupFilter,setGroupFilter]=useState('all'),[catsOpen,setCatsOpen]=useState(false),[value,setValue]=useState(''),[quantity,setQuantity]=useState('1'),[unit,setUnit]=useState('items'),[editor,setEditor]=useState(null),[categoryName,setCategoryName]=useState(''),[duplicate,setDuplicate]=useState(null),[smartWindow,setSmartWindow]=useState(null);
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,{editor,value,quantity,unit,categoryName},{dirty:editor?undefined:!!value.trim()||!!categoryName.trim(),key:editor?.id||'add'});
 useEffect(()=>{const requested=new URLSearchParams(a.route.split('?')[1]||'').get('list');if(requested&&requested!==tab){setTab(requested);setFilter('all');setGroupFilter('all');setSearch('')}},[a.route]);
 const input=useRef(null),focusNext=useRef(false),addBar=useRef(null);
 const visibleItems=a.visible(a.data.shopping);
 const categories=[...SHOPPING_CATEGORIES,...Array.from(new Set([...(a.data.preferences.shoppingCategories||[]),...visibleItems.map(i=>i.group)])).filter(c=>c&&!SHOPPING_CATEGORY_KEYS.includes(c)).map(c=>[c,c,'bayit-activities-lunchbox'])];
 const currentList=(a.data.shoppingLists||[]).find(l=>l.id===tab&&canAccessList(l,a.user)),scope=currentList?.visibility==='private'?'private':'family',isActive=currentList?.status==='active';
 const selectList=(next,_scope,options={})=>{focusNext.current=!!options.focus;setTab(next);a.update(d=>{d.preferences.activeShoppingListByUser={...d.preferences.activeShoppingListByUser,[a.user]:next}});setFilter('all');setGroupFilter('all');setSearch('');setSearchOpen(false)};
 const items=a.visible(a.data.shopping,scope).filter(i=>(i.listId||'week')===tab),done=items.filter(i=>i.done).length,left=items.length-done;
 const shown=items.filter(i=>(filter==='remaining'?!i.done:filter==='bought'?i.done:true)&&(groupFilter==='all'||i.group===groupFilter)&&(!search||a.text(i).toLowerCase().includes(search.toLowerCase())||String(i.title||'').toLowerCase().includes(search.toLowerCase())));
 const smart=useShoppingSmart(a,currentList,items),quick=parseQuickAdd(value),many=quick.length>1;
 const newIds=new Set(items.filter(i=>isNewItem(i,smart.shop)).map(i=>i.id)),duringShop=smart.shop?shown.filter(i=>newIds.has(i.id)):[];
 const lists=useShoppingLists({app:a,tab,onSelect:selectList,counts:[done,items.length],onSettings:()=>setSmartWindow(smart.child?'favourites':'settings'),onReceipt:smart.child?null:()=>setSmartWindow('receipt'),onPrices:smart.child?null:()=>setSmartWindow('prices'),onNote:smart.child?null:()=>setSmartWindow('note'),ui:{Button,Badge,Tabs,Visibility,Avatar,Icon}});
 useEffect(()=>{if(focusNext.current&&input.current){focusNext.current=false;input.current.focus({preventScroll:false})}},[tab,currentList?.id]);
 // Keep the add bar under the phone top bar while scrolling.
 useEffect(()=>{const set=()=>{const top=document.querySelector('.mobile-top'),h=top&&getComputedStyle(top).display!=='none'?top.getBoundingClientRect().height:0;addBar.current?.style.setProperty('--shop2-sticky',Math.round(h)+'px')};set();addEventListener('resize',set);return()=>removeEventListener('resize',set)},[]);
 // Icon and category: what this family chose before for the same name, otherwise the bilingual dictionary.
 const guess=name=>{const n=normal(name);if(!n)return null;const known=visibleItems.filter(i=>(normal(i.title)===n||normal(i.he)===n)&&i.icon&&i.icon!=='1F6D2').at(-1);return known?{icon:known.icon,group:known.group||matchItem(name).group,learned:true}:matchItem(name)};
 const live=guess(value),categoryOf=key=>categories.find(c=>c[0]===key)||['Other','אחר','1F6D2'];
 const add=async(e,choice)=>{e.preventDefault();if(!isActive)return a.notify(a.T('Reopen this list or start a new trip first.','פתחו מחדש את הרשימה או התחילו קנייה חדשה.'));const name=value.trim();if(!name)return input.current?.focus();
 if(many&&!choice){let added=0,kept=[];await commit(()=>a.update(d=>{for(const part of quick){const key=shoppingIdentity(part.name);if(d.shopping.some(i=>(i.listId||'week')===tab&&!i.done&&shoppingIdentity(i.title)===key)){kept.push(part.name);continue}const g=guess(part.name);d.shopping.push({id:crypto.randomUUID(),title:part.name,he:part.name,listId:tab,quantity:part.quantity+' items',quantityValue:part.quantity,unit:'items',icon:g.icon,group:g.group,memberId:a.user,done:false,ownerId:a.user,visibility:currentList?.visibility||scope,allowedIds:currentList?.allowedIds||[],createdAt:new Date().toISOString(),createdBy:a.user});added++}}),()=>{setValue('');a.notify(a.T(added+' added.'+(kept.length?' Already on the list: '+kept.join(', '):''),(added===1?'נוסף פריט אחד.':'נוספו '+added+' פריטים.')+(kept.length?' כבר ברשימה: '+kept.join(', '):'')));requestAnimationFrame(()=>input.current?.focus({preventScroll:true}))});return}const {icon,group}=guess(name),q=Math.max(.01,+quantity||1),existing=items.find(i=>!i.done&&shoppingIdentity(i.title)===shoppingIdentity(name));if(existing&&!choice){if(unit==='items'&&unitOf(existing)!=='items')setUnit(unitOf(existing));setDuplicate(existing);return}await commit(()=>a.update(d=>{if(choice==='merge'&&existing){const r=d.shopping.find(i=>i.id===existing.id),u=unitOf(r);r.quantityValue=(Number(r.quantityValue)||parseFloat(r.quantity)||1)+q;r.unit=u;r.quantity=r.quantityValue+' '+u;return}d.shopping.push({id:crypto.randomUUID(),title:name,he:name,listId:tab,quantity:q+' '+unit,quantityValue:q,unit,icon,group,memberId:a.user,done:false,ownerId:a.user,visibility:currentList?.visibility||scope,allowedIds:currentList?.allowedIds||[],createdAt:new Date().toISOString(),createdBy:a.user})}),()=>{setDuplicate(null);setValue('');setQuantity('1');setUnit('items');if(filter==='bought')setFilter('all');if(groupFilter!=='all'&&groupFilter!==group)setGroupFilter('all');requestAnimationFrame(()=>requestAnimationFrame(()=>input.current?.focus({preventScroll:true})))})};
 const edit=item=>{const parts=String(item.quantity||'1').match(/^([\d.]+)\s*(.*)$/);setEditor({...item,quantityValue:item.quantityValue||Number(parts?.[1]||1),unit:unitOf(item),memberId:item.memberId||item.ownerId})};
 const save=async e=>{e.preventDefault();if(!editor.title.trim())return;if(editor.visibility==='selected'&&!editor.allowedIds?.length){a.notify(a.T('Choose who to share with.','בחרו עם מי לשתף.'));return}await commit(()=>a.update(d=>{const list=shoppingTarget(d,editor,a.user,{preferredId:tab});Object.assign(d.shopping.find(i=>i.id===editor.id),editor,{he:editor.title,quantity:editor.quantityValue+' '+editor.unit,listId:list.id})}),()=>{setEditor(null);a.notify(a.T('Item updated.','הפריט עודכן.'))})};
 // Delete: swipe a row LEFT, like Notifications (also in Hebrew), or Delete item in its window; both show Undo.
 const mayDelete=item=>canDeleteShoppingItem(a.data.shopping.find(i=>i.id===item.id)||item,a.data.shoppingLists,a.user);
 const toggle=item=>isActive?a.toggleShopping(item.id):a.notify(a.T('Reopen this list to update it.','פתחו את הרשימה מחדש כדי לעדכן אותה.'));
 const quantityText=item=>{const parts=String(item.quantity||'').match(/^([\d.]+)\s*(.*)$/),value=item.quantityValue||parts?.[1],unitKey=item.unit||({'bottle':'bottles','bag':'bags','loaf':'loaves','pack':'packs','liter':'liters'}[parts?.[2]]||parts?.[2]||'items');if(!value)return item.quantity||'';const u=UNITS.find(u=>u[0]===unitKey);const en=+value===1?({loaves:'loaf',liters:'liter',bottles:'bottle',bags:'bag',packs:'pack'}[unitKey]||unitKey):unitKey;return value+(unitKey==='items'?'':(' '+(a.lang==='he'?u?.[1]||unitKey:en)))};
 const addCategory=async e=>{e.preventDefault();const name=categoryName.trim();if(!name)return;if(categories.some(([en,he])=>en.toLocaleLowerCase()===name.toLocaleLowerCase()||he===name))return a.notify(a.T('That category already exists.','הקטגוריה כבר קיימת.'));await commit(()=>a.update(d=>{d.preferences.shoppingCategories=[...(d.preferences.shoppingCategories||[]),name]}),()=>{setCategoryName('');a.notify(a.T('Category created. Choose it in the item editor.','הקטגוריה נוצרה. בחרו אותה בעריכת הפריט.'))})};
 // Cards | List: in the filter row; on phones it moves up beside the open list's actions (the filter row has no room).
 const [headSlot,setHeadSlot]=useState(null);useLayoutEffect(()=>{const el=document.querySelector('.shop2 .shop2-head-actions');if(el!==headSlot)setHeadSlot(el)});
 const listName=currentList?(a.lang==='he'?currentList.he||currentList.name:currentList.name):'';
 const usedGroups=categories.filter(([g])=>items.some(i=>i.group===g));

 const renderRow=item=>{const who=item.memberId||item.ownerId;return <SwipeRow key={item.id} direction="left" fullSwipe onDelete={mayDelete(item)?()=>a.remove('shopping',item.id,a.text(item)):null} label={a.T('Delete','מחיקה')}><div className={'shop2-row'+(item.done?' done':'')}>
      <Checkbox checked={!!item.done} onChange={()=>toggle(item)} aria-label={a.text(item)}/>
      <button type="button" className="shop2-row-main" onClick={()=>edit(item)} title={a.T('Edit ','עריכת ')+a.text(item)}><Icon code={item.icon} size={36}/><span><strong>{a.text(item)}</strong><small><span className="shop2-qty">{quantityText(item)}</span>{newIds.has(item.id)&&<span className="ss-new">{a.T('New · ','חדש · ')+a.name(item.createdBy||item.ownerId)}</span>}<span className="shop2-who">{a.name(who)}</span><PendingSync collection="shopping" id={item.id} T={a.T}/></small></span></button>
      <span className="shop2-row-avatar" title={a.name(who)}><Avatar who={who} size={30}/></span>
      <button type="button" className="icon-button shop2-row-edit" aria-label={a.T('Edit details for ','עריכת פרטים עבור ')+a.text(item)} onClick={()=>edit(item)}><PencilSimple size={19}/></button>
     </div></SwipeRow>};
 return <div className="shop2">
  <Heading title={a.T('Good things for home.','דברים טובים לבית.')} subtitle={new Date(anchor+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}/>
  {!editor&&saveError&&<p className="save-error" role="alert">{saveError}</p>}{lists.strip}
  <div className="shop2-layout ss-one">
   <section className="shop2-panel" aria-label={listName}>
    {lists.header}
    {currentList&&(isActive?<form ref={addBar} className={'shop2-add'+(value.trim()?' typing':'')+(many?' ss-many':'')} onSubmit={add}>
     <span className={'shop2-add-icon'+(live?'':' idle')} aria-hidden="true"><Icon code={live&&!many?live.icon:'1F6D2'} size={live&&!many?36:30}/></span>
     <input ref={input} id="add-shopping" className="shop2-add-name" autoComplete="off" enterKeyHint="done" maxLength={80} aria-label={a.T('Add an item to ','הוספת פריט לרשימה ')+listName} placeholder={a.T('Add an item, e.g. milk','הוסיפו פריט, למשל חלב')} value={value} onChange={e=>setValue(e.target.value)}/>
     <span className="shop2-add-qty"><input type="number" inputMode="decimal" min="0.01" step="0.01" aria-label={a.T('Quantity','כמות')} value={quantity} onChange={e=>setQuantity(e.target.value)}/><Select aria-label={a.T('Unit','יחידה')} value={unit} onChange={e=>setUnit(e.target.value)}>{UNITS.map(([en,he])=><option value={en} key={en}>{a.T(en,he)}</option>)}</Select></span>
     <button type="submit" className="shop2-add-submit" aria-label={many?a.T('Add '+quick.length+' items','הוספת '+quick.length+' פריטים'):a.T('Add item to list','הוספה לרשימה')}><Plus size={22} weight="bold"/><span>{many?a.T('Add '+quick.length,'הוספת '+quick.length):a.T('Add','הוספה')}</span></button>
     <p className="shop2-add-hint" aria-live="polite">{many?<span className="ss-preview"><b>{a.T(quick.length+' items:',quick.length+' פריטים:')}</b>{quick.map((q,i)=><span className="ss-pv" key={i}><Icon code={guess(q.name).icon} size={22}/>{q.name}{q.quantity!==1?' · '+q.quantity:''}</span>)}{!smart.child&&<button type="button" className="button secondary ss-snap" onClick={()=>setSmartWindow('note')}><Camera size={20}/>{a.T('Photograph a list','צילום רשימה')}</button>}</span>:live?<><Icon code={categoryOf(live.group)[2]} size={20}/>{a.T('Category: ','קטגוריה: ')}<b>{a.T(...categoryOf(live.group).slice(0,2))}</b>{live.learned?' · '+a.T('as you chose before','כמו שבחרתם בעבר'):''}</>:a.T('The picture and category are chosen for you. You can change them later.','התמונה והקטגוריה נבחרות אוטומטית. אפשר לשנות אחר כך.')}</p>
    </form>:<div className="shop2-closed"><p>{a.T('This list is closed. Reopen it, or reuse it for a new trip, to add items.','הרשימה סגורה. פתחו אותה מחדש או השתמשו בה לקנייה חדשה כדי להוסיף פריטים.')}</p></div>)}
    {duplicate&&<div className="shopping-duplicate" role="status"><p>{a.T('Already on this list: ','כבר ברשימה הזו: ')}<strong>{a.text(duplicate)}</strong> · {quantityText(duplicate)}</p><div className="actions"><Button disabled={saving||unitOf(duplicate)!==unit} onClick={()=>add({preventDefault(){}},'merge')}>{a.T('Add to its quantity','הוספה לכמות הקיימת')}</Button><Button secondary disabled={saving} onClick={()=>add({preventDefault(){}},'separate')}>{a.T('Add a separate item','הוספת פריט נפרד')}</Button><Button quiet onClick={()=>setDuplicate(null)}>{a.T('Cancel','ביטול')}</Button></div>{unitOf(duplicate)!==unit&&<small>{a.T('Different units: edit the existing item or add separately.','היחידות שונות: אפשר לערוך את הפריט הקיים או להוסיף בנפרד.')}</small>}</div>}
    <DateLine a={a} list={currentList} smart={smart} ui={{Button,Avatar}}/>
    {currentList&&isActive&&!smart.child&&items.length>0&&left===0&&<DoneCard a={a} onReceipt={()=>setSmartWindow('receipt')}/>}
    {currentList&&isActive&&!smart.shop&&!(items.length>0&&left===0)&&<SmartCard a={a} smart={smart} onOpen={()=>setSmartWindow('review')} onAsk={()=>setSmartWindow('favourites')}/>}
    {currentList&&<div className="shop2-toolbar">
     <div className="shop2-seg" role="group" aria-label={a.T('Show','הצגה')}>{[['all',a.T('All','הכל'),items.length],['remaining',a.T('Left','נשארו'),left],['bought',a.T('Bought','נאספו'),done]].map(([k,t,n])=><button type="button" key={k} aria-pressed={filter===k} className={filter===k?'on':''} onClick={()=>setFilter(k)}>{t}<em>{n}</em></button>)}</div>
     <label className={'shop2-search'+(searchOpen||search?' open':'')}><MagnifyingGlass size={20}/><input aria-label={a.T('Search shopping','חיפוש בקניות')} placeholder={a.T('Find an item…','חיפוש פריט…')} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="shop2-clear" aria-label={a.T('Clear search','ניקוי חיפוש')} onClick={()=>setSearch('')}><X size={16}/></button>}</label>
     <button type="button" className={'shop2-tool shop2-search-toggle'+(searchOpen||search?' on':'')} aria-label={a.T('Search','חיפוש')} aria-expanded={searchOpen||!!search} onClick={()=>setSearchOpen(!searchOpen)}><MagnifyingGlass size={21}/></button>
     <button type="button" className={'shop2-tool shop2-cats-toggle'+(catsOpen||groupFilter!=='all'?' on':'')} aria-expanded={catsOpen} aria-label={a.T('Categories','קטגוריות')} aria-controls="shopping-category-manager" onClick={()=>setCatsOpen(!catsOpen)}>{groupFilter==='all'?<Tag size={20}/>:<Icon code={categoryOf(groupFilter)[2]} size={22}/>}<span>{groupFilter==='all'?a.T('Categories','קטגוריות'):a.T(...categoryOf(groupFilter).slice(0,2))}</span></button>
     <DensityToggle a={a} page="shopping" className="shop2-density"/>
    </div>}
    {catsOpen&&<div className="shop2-cats" id="shopping-category-manager">
     <div className="category-chips"><button type="button" aria-pressed={groupFilter==='all'} onClick={()=>setGroupFilter('all')}>{a.T('All','הכל')}</button>{categories.map(([en,he,code])=><button type="button" key={en} onClick={()=>setGroupFilter(groupFilter===en?'all':en)} aria-pressed={groupFilter===en}><Icon code={code} size={22}/>{a.T(en,he)}</button>)}</div>
     <form className="shop2-cat-add" onSubmit={addCategory}><input maxLength={40} value={categoryName} onChange={e=>setCategoryName(e.target.value)} aria-label={a.T('New shopping category','קטגוריית קניות חדשה')} placeholder={a.T('New category, e.g. Party','קטגוריה חדשה, למשל מסיבה')}/><button type="submit" className="shop2-tool"><Plus size={18} weight="bold"/>{a.T('Add category','הוספת קטגוריה')}</button></form>
    </div>}
    {duringShop.length>0&&<section className="shop2-group ss-newgroup" aria-label={a.T('Added during the shop','נוסף בזמן הקנייה')}><h3><BellRinging size={22} weight="bold" aria-hidden="true"/><span>{a.T('Added during the shop','נוסף בזמן הקנייה')}</span><small>{duringShop.length}</small></h3>{duringShop.map(renderRow)}</section>}
    {usedGroups.filter(([group])=>shown.some(i=>i.group===group&&!(smart.shop&&newIds.has(i.id)))).map(([group,he,code])=>{const rows=shown.filter(i=>i.group===group&&!(smart.shop&&newIds.has(i.id)));return <section className="shop2-group" key={group}><h3><Icon code={code} size={24}/><span>{a.T(group,he)}</span><small>{rows.length}</small></h3>
     {rows.map(renderRow)}
    </section>})}
    {currentList&&!shown.length&&<div className="shop2-empty"><Empty text={filter==='remaining'&&items.length?a.T('All packed. You’re ready to go!','הכל נאסף. אפשר לצאת לדרך!'):search||groupFilter!=='all'?a.T('Nothing matches. Try another word or category.','לא נמצא פריט. נסו מילה או קטגוריה אחרת.'):a.T('This list is empty. Type the first item above.','הרשימה ריקה. כתבו למעלה את הפריט הראשון.')}/>{(search||groupFilter!=='all'||filter!=='all')&&items.length>0&&<button type="button" className="shop2-tool" onClick={()=>{setSearch('');setGroupFilter('all');setFilter('all')}}><ArrowCounterClockwise size={18}/>{a.T('Show all items','הצגת כל הפריטים')}</button>}</div>}
   </section>
   
  </div>
  {headSlot&&createPortal(<DensityToggle central a={a} page="shopping" className="shop2-density-head"/>,headSlot)}
  {lists.modal}
  {smartWindow==='review'&&<ReviewWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} smart={smart} onClose={()=>setSmartWindow(null)} onSettings={()=>setSmartWindow('settings')}/>}
  {smartWindow==='settings'&&<SettingsWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} smart={smart} onClose={()=>setSmartWindow(null)} onFavourites={()=>setSmartWindow('favourites')}/>}
  {smartWindow==='receipt'&&<ReceiptWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} items={items} onClose={()=>setSmartWindow(null)}/>}
  {smartWindow==='note'&&<NoteWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} items={items} quantityText={quantityText} onClose={()=>setSmartWindow(null)}/>}
  {smartWindow==='prices'&&<PricesWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} onClose={()=>setSmartWindow(null)}/>}
  {smartWindow==='favourites'&&<FavouritesWindow a={a} ui={{Icon,Button,Avatar}} list={currentList} smart={smart} onClose={()=>setSmartWindow(null)}/>}
  {editor&&<div className="modal-backdrop tasks-sheet-backdrop shop-item-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&guard(()=>setEditor(null))}><form className="tasks-sheet shop-item-sheet" role="dialog" aria-modal="true" aria-label={a.T('Edit item','עריכת פריט')} onSubmit={save}>
   <header><h2>{a.T('Edit item','עריכת פריט')}</h2><button type="button" className="icon-button" aria-label={a.T('Close item editor','סגירת עורך הפריט')} onClick={()=>!saving&&guard(()=>setEditor(null))}><X size={20}/></button></header>
   <div className="tasks-sheet-body shop-item-columns">
    <FormSection T={a.T} icon={Basket} tone="blue" title={a.T('Details','פרטים')}>
     <div className="name-row"><button type="button" className="icon-choice-button" aria-label={a.T('Change icon','שינוי אייקון')} onClick={()=>a.setIconPicker({selected:editor.icon,onSelect:icon=>setEditor(v=>({...v,icon}))})}><Icon code={editor.icon} size={38}/><CaretDown size={18}/></button><label>{a.T('Item name','שם הפריט')}<input required maxLength={80} autoFocus={allowInitialTextFocus()} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label></div>
     <div className="two-fields"><label>{a.T('Quantity','כמות')}<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={editor.quantityValue} onChange={e=>setEditor({...editor,quantityValue:+e.target.value})}/></label><label>{a.T('Unit','יחידה')}<Select aria-label={a.T('Item unit','יחידת הפריט')} value={editor.unit} onChange={e=>setEditor({...editor,unit:e.target.value})}>{UNITS.map(([en,he])=><option value={en} key={en}>{a.T(en,he)}</option>)}</Select></label></div>
     <label>{a.T('Category','קטגוריה')}<Select aria-label={a.T('Item category','קטגוריית הפריט')} value={editor.group} onChange={e=>setEditor({...editor,group:e.target.value})}>{categories.map(([en,he])=><option value={en} key={en}>{a.T(en,he)}</option>)}</Select></label>
     <div className="shop-item-people"><span className="field-label" id="shop-item-assignee">{a.T('Assigned to','משויך ל־')}</span><div className="member-chips" role="radiogroup" aria-labelledby="shop-item-assignee">{members.map(m=><PersonChip key={m.id} role="radio" who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={editor.memberId===m.id} onClick={()=>setEditor({...editor,memberId:m.id})}/>)}</div></div>
    </FormSection>
    <FormSection T={a.T} icon={LockSimple} tone="lilac" title={a.T('Privacy & permissions','פרטיות והרשאות')}><Visibility value={editor.visibility} onChange={visibility=>setEditor({...editor,visibility})} allowed={editor.allowedIds} onAllowed={allowedIds=>setEditor({...editor,allowedIds})}/></FormSection>
   </div>
   {saveError&&<p className="save-error" role="alert">{saveError}</p>}
   <div className="tasks-sheet-actions shopping-item-actions"><Button secondary onClick={()=>!saving&&guard(()=>setEditor(null))}>{a.T('Cancel','ביטול')}</Button><Button disabled={saving} type="submit">{a.T('Save','שמירה')}</Button>{mayDelete(editor)&&<Button secondary icon={Trash} onClick={()=>{a.remove('shopping',editor.id,editor.title);setEditor(null)}}>{a.T('Delete item','מחיקת פריט')}</Button>}</div>
  </form></div>}
 </div>;
}
