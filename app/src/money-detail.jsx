// Friendlier Money pieces: category cards, the category detail sheet and the Today widget.
import React,{useEffect,useMemo,useState} from 'react';
import {X,TrendUp,TrendDown,ArrowRight,ArrowLeft,Receipt,Storefront,ChartBar} from '@phosphor-icons/react';
import {ResponsiveContainer,BarChart,Bar,XAxis,Cell,Tooltip} from 'recharts';
import {cloudHeaders} from './cloud-transport';
import {CATEGORY,monthOf,shiftMonth,monthSummary,normalizeName,forecast,recurringPayments} from '../../shared/finance.mjs';
import {WidgetSkeleton} from './skeleton';

const tint=(hex,alpha)=>{const h=(hex||'#cccccc').replace('#','');const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`};
export const pct=(a,b)=>b?Math.round((a-b)/b*100):null;

// Small categories (under 3%) are grouped so the overview stays calm.
// "Other" itself joins the group, so there is only ever one "smaller categories" card.
export function groupedCategories(summary){
 const total=summary.expenses||1,big=summary.byCategory.filter(c=>c.category!=='other'&&c.amount/total>=.03),small=summary.byCategory.filter(c=>c.category==='other'||c.amount/total<.03);
 return small.length>1?[...big,{category:'other',amount:small.reduce((n,c)=>n+c.amount,0),members:small.map(c=>c.category)}]:summary.byCategory;
}

export function CategoryCards({a,T,money,catName,summary,previous,Icon,onOpen}){
 const [all,setAll]=useState(false),total=summary.expenses||1,prev=Object.fromEntries(previous.byCategory.map(c=>[c.category,c.amount])),items=groupedCategories(summary),shown=all?items:items.slice(0,6);
 return <div className="money-catcards-wrap"><ul className="money-catcards">{shown.map(c=>{const color=CATEGORY[c.category]?.color,d=c.members||c.category==='cards'?null:pct(c.amount,prev[c.category]);return <li key={c.category}><button type="button" onClick={()=>onOpen(c)} style={{'--cat':color,'--cat-soft':tint(color,.16)}}>
  <span className="money-catcard-icon"><Icon code={CATEGORY[c.category]?.icon} size={34}/></span>
  <span className="money-catcard-name">{c.members?T('Smaller categories ('+c.members.length+')','קטגוריות קטנות ('+c.members.length+')'):catName(c.category)}</span>
  <strong>{money(c.amount,{fraction:0})}</strong>
  <span className="money-catcard-meta"><span className="money-catcard-share">{Math.round(c.amount/total*100)}%</span>{d!=null&&isFinite(d)&&Math.abs(d)>=1?<span className={'money-catcard-delta '+(d>0?'up':'down')}>{d>0?<TrendUp size={13} weight="bold"/>:<TrendDown size={13} weight="bold"/>}{Math.abs(d)}%</span>:null}</span>
  <span className="money-catcard-bar"><i style={{width:Math.max(3,c.amount/total*100)+'%'}}/></span>
  <span className="money-catcard-go" aria-hidden="true">{a.lang==='he'?<ArrowLeft size={18} weight="bold"/>:<ArrowRight size={18} weight="bold"/>}</span>
 </button></li>})}</ul>{items.length>6&&<button type="button" className="money-show-all" onClick={()=>setAll(!all)}>{all?T('Show fewer','להציג פחות'):T('Show all '+items.length+' categories','להציג את כל '+items.length+' הקטגוריות')}</button>}</div>;
}

// Everything about one category in one place: history, top merchants and every transaction.
export function CategorySheet({a,T,money,catName,rows,groups,month,item,Icon,Avatar,onClose,onOpenLedger,onSelect}){
 const he=a.lang==='he',categories=item.members||[item.category],match=t=>categories.includes(t.category);
 const list=rows.filter(t=>monthOf(t)===month&&match(t)&&t.amount<0&&t.kind!=='card_payment').sort((x,y)=>x.amount-y.amount);
 const history=[5,4,3,2,1,0].map(i=>shiftMonth(month,-i)).map(m=>({m,label:new Date(m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short'}),v:monthSummary(rows,groups,m).byCategory.filter(c=>categories.includes(c.category)).reduce((n,c)=>n+c.amount,0)/100})).map(x=>({...x,v:Math.max(0,x.v)})).filter((x,i,arr)=>arr.slice(0,i+1).some(y=>y.v>0));
 const total=list.reduce((n,t)=>n-t.amount,0),spent=monthSummary(rows,groups,month).expenses||1,last=history.length>1?history.at(-2).v*100:0,d=pct(total,last);
 const merchants=Object.values(list.reduce((acc,t)=>{const k=normalizeName(t.description);acc[k]=acc[k]||{name:t.description,total:0,count:0};acc[k].total-=t.amount;acc[k].count++;return acc},{})).sort((x,y)=>y.total-x.total).slice(0,5);
 const color=CATEGORY[item.category]?.color;
 useEffect(()=>{const key=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 return <div className="modal-backdrop money-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="money-sheet" role="dialog" aria-modal="true" aria-label={catName(item.category)} style={{'--cat':color,'--cat-soft':tint(color,.16)}}>
  <header className="money-sheet-head"><span className="money-catcard-icon"><Icon code={CATEGORY[item.category]?.icon} size={40}/></span><div><h2>{item.members?T('Smaller categories','קטגוריות קטנות'):catName(item.category)}</h2><small>{new Date(month+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'long',year:'numeric'})}</small></div><button type="button" className="icon-button" aria-label={T('Close','סגירה')} onClick={onClose}><X size={24}/></button></header>
  <div className="money-sheet-stats">
   <div><span>{T('Spent','הוצאה')}</span><strong>{money(total)}</strong></div>
   <div><span>{T('Share of spending','מתוך כל ההוצאות')}</span><strong>{Math.round(total/spent*100)}%</strong></div>
   <div><span>{T('vs last month','לעומת החודש הקודם')}</span><strong className={d==null?'':d>0?'money-up':'money-down'}>{d==null||!isFinite(d)?'—':(d>0?'+':'')+d+'%'}</strong></div>
  </div>
  {history.length>1&&<div className="money-sheet-block"><h3><ChartBar size={20}/>{T('Last months','החודשים האחרונים')}</h3><div className="money-sheet-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={history} margin={{top:18,right:4,left:4,bottom:0}}><XAxis dataKey="label" reversed={he} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:13,fontWeight:700}}/><Tooltip formatter={v=>'₪'+Number(v).toLocaleString()} cursor={{fill:'var(--cat-soft)'}} contentStyle={{background:'var(--surface)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:14}}/><Bar dataKey="v" radius={[10,10,10,10]} isAnimationActive={false} maxBarSize={38} label={{position:'top',fill:'var(--muted)',fontSize:12,formatter:v=>v>=1000?'₪'+(v/1000).toFixed(1)+'k':'₪'+Math.round(v)}}>{history.map(x=><Cell key={x.m} fill={color} fillOpacity={x.m===month?1:.35}/>)}</Bar></BarChart></ResponsiveContainer></div></div>}
  {merchants.length>0&&<div className="money-sheet-block"><h3><Storefront size={20}/>{T('Where','איפה')}</h3><ul className="money-merchants">{merchants.map(m=><li key={m.name}><span className="money-merchant-name">{m.name}</span><span className="money-merchant-count">{m.count>1?T(m.count+' times',m.count+' פעמים'):''}</span><b>{money(m.total)}</b><span className="money-catcard-bar"><i style={{width:Math.max(4,m.total/merchants[0].total*100)+'%'}}/></span></li>)}</ul></div>}
  <div className="money-sheet-block"><h3><Receipt size={20}/>{T('Transactions','תנועות')} <span className="money-count">{list.length}</span></h3><ul className="money-sheet-rows">{list.slice(0,60).map(t=><li key={t.id} role="button" tabIndex={0} aria-label={T('Details: ','פרטים: ')+t.description} onClick={()=>onSelect(t)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(t)}}}><span className="money-sheet-date">{new Date(t.date+'T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{day:'numeric',month:'short'})}</span><span className="money-sheet-desc"><strong dir="auto" title={t.description}>{t.description}</strong>{t.installmentOf?<small>{T('payment '+t.installmentN+' of '+t.installmentOf,'תשלום '+t.installmentN+' מתוך '+t.installmentOf)}</small>:t.account&&t.source!=='manual'&&t.source!=='riseup'?<small>{t.source==='max'?'Max':T('Bank','בנק')} ••{t.account}</small>:null}</span>{t.memberId&&a.members.some(m=>m.id===t.memberId)?<Avatar who={t.memberId} size={30}/>:<span/>}<b>{money(-t.amount,{fraction:2})}</b></li>)}</ul></div>
  <button type="button" className="button secondary money-sheet-more" onClick={()=>onOpenLedger(categories.length===1?categories[0]:'all')}>{T('Open in transactions','פתיחה ברשימת התנועות')}{he?<ArrowLeft size={20}/>:<ArrowRight size={20}/>}</button>
 </section></div>;
}

// Today widgets share one request per household.
let financeCache={id:null,promise:null};
function useFinance(a){
 const [data,setData]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const id=a.data.householdId||'';if(financeCache.id!==id||!financeCache.promise){financeCache={id,promise:fetch('/api/finance/data',{headers:cloudHeaders()}).then(r=>r.ok?r.json():Promise.reject(new Error('unavailable')))};setTimeout(()=>{if(financeCache.id===id)financeCache.promise=null},60000)}financeCache.promise.then(setData).catch(()=>setFailed(true))},[a.data.householdId]);
 const view=useMemo(()=>{if(!data?.transactions?.length)return null;const rows=data.transactions.filter(t=>t.visibility!=='private'||t.ownerId===data.me);if(!rows.length)return null;const months=[...new Set(rows.map(monthOf))].sort(),bank=(data.imports||[]).filter(i=>i.kind==='bank'),thisMonth=new Date().toISOString().slice(0,7),live=new Set(rows.filter(t=>t.source==='riseup'&&t.month<thisMonth).map(t=>t.month)),complete=m=>live.has(m)||bank.some(i=>i.periodFrom<=m+'-01'&&i.periodTo>=m+'-28'),month=[...months].reverse().find(complete)||months.at(-1);return {rows,groups:data.groups,month,s:monthSummary(rows,data.groups,month),f:forecast(rows,data.groups,shiftMonth(month,1))}},[data]);
 return {data,failed,view};
}
const shekel=(v,he)=>'\u2066'+(v<0?'−':'')+'₪'+Math.abs(Math.round(v/100)).toLocaleString(he?'he-IL':'en-US')+'\u2069'; // left-to-right even in Hebrew

// Today: this month's money at a glance (adults on a signed-in household).
export function MoneyWidget({app:a,ui:{Button}}){
 const {data,failed,view}=useFinance(a),T=a.T,he=a.lang==='he',money=v=>shekel(v,he);
 if(failed)return <><h2>{T('Expenses this month','ההוצאות החודש')}</h2><p className="muted">{T('Expenses are available after signing in.','ההוצאות זמינות לאחר התחברות.')}</p></>;
 if(!data)return <><h2>{T('Expenses this month','ההוצאות החודש')}</h2><WidgetSkeleton hero rows={2} label={T('Loading expenses…','טוענים הוצאות…')}/></>;
 if(!view)return <><h2>{T('Expenses this month','ההוצאות החודש')}</h2><div className="widget-empty"><img src="/assets/generated/money-hero-320.png" alt="" width="84" height="84"/><p>{T('Import a bank or card statement to see your month.','ייבאו דף חשבון או כרטיס כדי לראות את החודש.')}</p><Button secondary onClick={()=>a.go('household/expenses')}>{T('Import statement','ייבוא דף חשבון')}</Button></div></>;
 const {s,f,month}=view,income=Math.max(s.income,1);
 return <div className="money-widget">
  <div className="money-widget-head"><div><h2>{T('Expenses this month','ההוצאות החודש')}</h2><small>{new Date(month+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'long'})}</small></div></div>
  <div className="money-widget-body">
   <div className="money-widget-copy"><span>{s.net>=0?T('Left after everything','נשאר אחרי הכול'):T('Spent more than came in','יצא יותר ממה שנכנס')}</span><strong className={s.net>=0?'':'over'}>{(s.net>0?'+':'')+money(s.net)}</strong>
    <div className="money-widget-mini"><span><small>{T('Income','הכנסות')}</small><b>{money(s.income)}</b></span><span><small>{T('Spent','הוצאות')}</small><b>{money(s.expenses)}</b></span><i className="money-widget-bar"><em style={{width:Math.min(100,s.expenses/income*100)+'%'}}/></i></div>
   </div>
   <img src="/assets/generated/money-hero-320.png" alt="" width="128" height="128"/>
  </div>
  <button type="button" className="money-widget-next" onClick={()=>a.go('household/expenses')}><span>{T('Next month expected','צפוי בחודש הבא')} <b className={f.net<0?'neg':''}>{(f.net>0?'+':'')+money(f.net)}</b></span>{he?<ArrowLeft size={20} weight="bold"/>:<ArrowRight size={20} weight="bold"/>}</button>
 </div>;
}

// Today: the next fixed bills, found from imported statements.
export function BillsWidget({app:a,ui:{Icon}}){
 const {data,failed,view}=useFinance(a),T=a.T,he=a.lang==='he';
 // Bills expected in the coming month (the same forecast the Money page uses), in date order from today.
 const bills=useMemo(()=>{if(!view)return [];const today=new Date().toISOString().slice(0,10),list=view.f.due.filter(r=>(CATEGORY[r.category]?.flow||'expense')==='expense').map(r=>({...r,due:view.f.month+'-'+String(Math.min(28,r.nextDay||1)).padStart(2,'0')}));const upcoming=list.filter(r=>r.due>=today);return (upcoming.length?upcoming:list).sort((x,y)=>x.due.localeCompare(y.due)).slice(0,4)},[view]);
 return <div className="bills-widget"><div className="section-title"><h2>{T('Coming up: bills','חשבונות קרובים')}</h2></div>
  {failed?<p className="muted">{T('Available after signing in.','זמין לאחר התחברות.')}</p>:!data?<WidgetSkeleton rows={3} label={T('Loading bills…','טוענים חשבונות…')}/>:!bills.length?<p className="muted">{T('Fixed bills appear after two months of statements.','חיובים קבועים יופיעו אחרי חודשיים של דפי חשבון.')}</p>:<ul>{bills.map(r=><li key={r.key}><Icon code={CATEGORY[r.category]?.icon} size={34}/><strong>{r.description}</strong><b>{shekel(r.typical,he)}</b><span className="money-due">{new Date(r.due+'T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{day:'numeric',month:'short'})}</span></li>)}</ul>}
  <button className="text-link widget-more" onClick={()=>a.go('household/expenses')}>{T('All fixed bills','כל החיובים הקבועים')}{he?<ArrowLeft size={18}/>:<ArrowRight size={18}/>}</button>
 </div>;
}
