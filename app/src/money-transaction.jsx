import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,ClockCounterClockwise,PencilSimple,Paperclip,ChartBar,LockSimple,UsersThree} from '@phosphor-icons/react';
import {CATEGORY,CATEGORIES,monthOf} from '../../shared/finance.mjs';
import {transactionHistory} from '../../shared/money-records.mjs';
import './money-transaction.css';

const SOURCES={leumi:['Bank Leumi','בנק לאומי'],max:['Max','מקס'],manual:['Recorded manually','רישום ידני'],riseup:['RiseUp','RiseUp']};
export function TransactionSheet({a,ui:{Icon,Avatar,Select},item,rows,imports=[],covered=false,onClose,onSelect,onEdit,onCategoryChange}){
 const T=a.T,he=a.lang==='he',locale=he?'he-IL':'en-US',id=useId(),panel=useRef(null),close=useRef(null),[limit,setLimit]=useState(8);
 const [editing,setEditing]=useState(false),[chosen,setChosen]=useState(item.category),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const closeHandler=useRef(onClose);closeHandler.current=onClose;
 const history=transactionHistory(rows,item),category=CATEGORY[item.category],receipt=a.visible(a.data.documents||[]).find(d=>!d.deletedAt&&d.id===item.receiptDocumentId),statement=imports.find(i=>i.id===item.importId);
 const money=(amount,signed=false)=>new Intl.NumberFormat(locale,{style:'currency',currency:'ILS',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:signed?'exceptZero':'auto'}).format(amount/100);
 const date=value=>value?new Date(value+'T12:00Z').toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'}):'—';
 const month=value=>new Date(value+'-15T12:00Z').toLocaleDateString(locale,{month:'short',year:'2-digit'});
 const source=(SOURCES[item.source]||[item.source,item.source])[he?1:0],previous=history.previous;
 const related=history.related.filter(t=>t.id!==item.id),max=Math.max(1,...history.months.map(m=>Math.abs(m.amount)));
 const unknown=T('Not provided by the source','לא נמסר במקור');
 const facts=[
  [T('Transaction date','תאריך העסקה'),date(item.date)],
  [T('Charge / value date','תאריך חיוב / ערך'),item.chargeDate?date(item.chargeDate):unknown],
  [T('Cash-flow month','חודש בתזרים'),new Date(monthOf(item)+'-15T12:00Z').toLocaleDateString(locale,{month:'long',year:'numeric'})],
  [T('Category','קטגוריה'),he?category?.he:category?.en],
  [T('Source','מקור הנתונים'),source],
  ...(item.account&&item.source!=='manual'?[[T('Card / account','כרטיס / חשבון'),<bdi dir="ltr">••{String(item.account).slice(-4)}</bdi>]]:[]),
  ...(item.cardIssuer?[[T('Bank / card issuer','בנק / חברת אשראי'),<bdi dir="auto">{item.cardIssuer}</bdi>]]:[]),
  ...(item.memberId&&a.members.some(m=>m.id===item.memberId)?[[history.kind==='income'?T('Received by','התקבל אצל'):T('Paid by','שולם על ידי'),<span className="transaction-person"><Avatar who={item.memberId} size={26}/>{a.name(item.memberId)}</span>]]:[]),
  ...(item.ownerId&&a.members.some(m=>m.id===item.ownerId)?[[T('Recorded by','נרשם על ידי'),a.name(item.ownerId)]]:[]),
  ...(item.installmentOf?[[T('Installments','תשלומים'),T('Payment '+item.installmentN+' of '+item.installmentOf,'תשלום '+item.installmentN+' מתוך '+item.installmentOf)]]:[]),
  ...(item.standingOrder?[[T('Payment type','סוג תשלום'),T('Standing order','הוראת קבע')]]:[]),
  ...(item.originalAmount!=null&&item.currency&&item.currency!=='ILS'?[[T('Original amount','סכום במטבע המקורי'),<bdi dir="ltr">{new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Math.abs(item.originalAmount)/100)} {item.currency}</bdi>]]:[]),
  ...(statement?[[T('Imported statement','דף חשבון שיובא'),<bdi dir="auto">{statement.fileName||source}</bdi>]]:[])
 ];
 useEffect(()=>{
  const previousFocus=document.activeElement;close.current?.focus();
   const key=e=>{if(e.key==='Escape'){e.preventDefault();closeHandler.current()}if(e.key==='Tab'){
   const focusable=[...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
   const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previousFocus?.isConnected)previousFocus.focus()};
 },[]);
 useEffect(()=>{setLimit(8);setEditing(false);setError('');setChosen(item.category);panel.current?.scrollTo({top:0})},[item.id]);
 return createPortal(<div className="modal-backdrop transaction-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={panel} className="transaction-sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
  <header className="transaction-head"><span className="transaction-icon"><Icon code={category?.icon||'1F9FE'} size={38}/></span><div><small>{history.kind==='savings'?T('Savings transfer details','פרטי הפקדה לחיסכון'):history.kind==='income'?T('Income details','פרטי הכנסה'):T('Transaction details','פרטי העסקה')}</small><h2 id={id} dir="auto">{item.description}</h2></div><button ref={close} type="button" className="icon-button" aria-label={T('Close transaction details','סגירת פרטי העסקה')} onClick={onClose}><X size={24}/></button></header>
  <div className={'transaction-hero '+(item.amount>0?'income':'')}><strong><bdi dir="ltr">{money(item.amount,true)}</bdi></strong><span>{date(item.date)}</span><span className="transaction-visibility">{item.visibility==='private'?<LockSimple size={16}/>:<UsersThree size={16}/>} {item.visibility==='private'?T('Only me','רק אני'):item.visibility==='selected'?T('Selected adults','מבוגרים שנבחרו'):T('Shared with adults','משותף למבוגרים')}</span></div>
  {covered&&<p className="transaction-note">{T('This bank card payment is already represented by its card-statement purchases and is not counted twice.','חיוב הכרטיס הזה בבנק כבר מיוצג בפירוט העסקאות של הכרטיס ואינו נספר פעמיים.')}</p>}
  <dl className="transaction-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||unknown}</dd></div>)}</dl>
  {item.notes&&<section className="transaction-section"><h3>{T('Notes','הערות')}</h3><p className="transaction-notes" dir="auto">{item.notes}</p></section>}
  {receipt&&<button type="button" className="button secondary transaction-receipt" onClick={()=>{onClose();a.go('household/documents?doc='+receipt.id)}}><Paperclip size={20}/>{T('Open receipt','פתיחת קבלה')}</button>}
  <section className="transaction-section"><h3><ChartBar size={22}/>{history.kind==='savings'?T('Savings transfers over time','הפקדות לחיסכון לאורך זמן'):history.kind==='income'?T('This income over time','ההכנסה הזאת לאורך זמן'):T('This merchant over time','בית העסק לאורך זמן')}</h3>
   <div className="transaction-comparison"><div><span>{T('This cash-flow month','בחודש התזרים הזה')}</span><strong><bdi dir="ltr">{money(history.current.amount)}</bdi></strong><small>{history.current.count} {T('transactions','תנועות')}</small></div><div><span>{T('Previous month','בחודש הקודם')}</span><strong>{previous.count?<bdi dir="ltr">{money(previous.amount)}</bdi>:'—'}</strong><small>{previous.count?previous.count+' '+T('transactions','תנועות'):previous.loaded?T('No matching transactions','אין תנועות תואמות'):T('No data loaded','לא נטענו נתונים')}</small></div><div><span>{T('Earlier monthly average','ממוצע חודשי קודם')}</span><strong>{history.average==null?'—':<bdi dir="ltr">{money(history.average)}</bdi>}</strong><small>{T('Months with matching transactions','בחודשים עם תנועות תואמות')}</small></div></div>
   <ul className="transaction-months">{history.months.map(m=><li key={m.month} className={m.month===monthOf(item)?'current':''}><span>{month(m.month)}</span><span className="transaction-bar" aria-hidden="true"><i style={{width:Math.abs(m.amount)/max*100+'%'}}/></span><strong>{m.count?<bdi dir="ltr">{money(m.amount)}</bdi>:'—'}</strong><small>{m.count?m.count+' '+T('transactions','תנועות'):m.loaded?T('No match','אין התאמה'):T('No data','אין נתונים')}</small></li>)}</ul>
   <p className="transaction-note">{T('Matches use the same merchant name in the loaded records you can see. Different names are not automatically linked. Missing records do not mean there was no spending.','ההתאמה היא לפי אותו שם בית עסק ברשומות שנטענו ושיש לכם הרשאה לראות. שמות שונים אינם מקושרים אוטומטית. מידע חסר אינו אומר שלא היו הוצאות.')}</p>
  </section>
  <section className="transaction-section"><h3><ClockCounterClockwise size={22}/>{history.kind==='expense'?T('Other transactions at this merchant','תנועות נוספות בבית העסק'):T('Other transactions with this name','תנועות נוספות עם השם הזה')} <span className="money-count">{related.length}</span></h3>
   {related.length?<><ul className="transaction-history">{related.slice(0,limit).map(t=><li key={t.id}><button type="button" onClick={()=>onSelect(t)}><span><strong dir="auto">{t.description}</strong><small>{date(t.date)} · {(SOURCES[t.source]||[t.source,t.source])[he?1:0]}{t.installmentOf?' · '+T('payment '+t.installmentN+' of '+t.installmentOf,'תשלום '+t.installmentN+' מתוך '+t.installmentOf):''}</small></span><bdi dir="ltr">{money(t.amount,true)}</bdi></button></li>)}</ul>{related.length>limit&&<button type="button" className="control-button" onClick={()=>setLimit(limit+12)}>{T('Show more','הצגת תנועות נוספות')}</button>}</>:<p className="muted">{T('No other matching transactions have been loaded. Import earlier statements or extend your RiseUp history to compare months.','לא נטענו תנועות תואמות נוספות. אפשר לייבא דפי חשבון קודמים או להרחיב את ההיסטוריה בחיבור RiseUp כדי להשוות בין חודשים.')}</p>}
  </section>
  {(onEdit||onCategoryChange)&&<footer className="transaction-actions">{editing?<form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onCategoryChange(item,chosen,remember);setEditing(false)}catch(err){setError(err.message)}finally{setBusy(false)}}}><label>{T('Category','קטגוריה')}<Select value={chosen} disabled={busy} onChange={e=>setChosen(e.target.value)}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{he?c.he:c.en}</option>)}</Select></label><label className="transaction-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={e=>setRemember(e.target.checked)}/>{T('Apply to this merchant’s visible history and future imports','החלה על ההיסטוריה הגלויה של בית העסק ועל ייבואים עתידיים')}</label>{error&&<p role="alert" className="money-manual-error">{error}</p>}<div className="actions"><button className="button" type="submit" disabled={busy}>{busy?T('Saving…','שומרים…'):T('Save category','שמירת קטגוריה')}</button><button className="button secondary" type="button" disabled={busy} onClick={()=>setEditing(false)}>{T('Cancel','ביטול')}</button></div></form>:<button type="button" className="button secondary" onClick={()=>onEdit?onEdit(item):setEditing(true)}><PencilSimple size={20}/>{onEdit?T('Edit entry','עריכת רישום'):T('Change category','שינוי קטגוריה')}</button>}</footer>}
 </section></div>,document.body);
}
