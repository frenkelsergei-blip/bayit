import React,{useEffect,useRef,useState} from 'react';
import {ArrowClockwise,ChartBar,Info,Receipt,Wallet,Gauge,BookOpenText} from '@phosphor-icons/react';
import {StatisticsSummary,StatisticsFooter,downloadCSV,DownloadSimple} from './statistics-summary';
import {ChartCard,BarsChart} from './statistics-charts';
import {monthlySpending} from './statistics-data';
import {CATEGORY} from '../../shared/finance.mjs';
import {cloudHeaders} from './cloud-transport';
import {householdMoneyStatistics} from './household-money-statistics.mjs';
import './household-money-statistics.css';
import {SourcePanels} from './payment-sources';
import {Select} from './Select';
import {memberNames} from '../../shared/payment-sources.mjs';
// "Whose card is this?" from Statistics saves through the adult-only finance API, then reloads the records.
const saveSource=async body=>{const r=await fetch('/api/finance/sources',{method:'PUT',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});let out={};try{out=await r.json()}catch{}if(!r.ok)throw new Error(out.error||'The card could not be saved.');return out};

// Connected money records (statements, RiseUp) for this household and viewer, loaded from the finance server, which
// already applies the access rules. `enabled` is false for children: they never load money.
export function useStatisticsMoney(a,enabled=true){
 const key=(a.data.householdId||'demo')+'|'+a.user,remote=!!a.cloud&&enabled,[loaded,setLoaded]=useState(null),[busy,setBusy]=useState(remote),[error,setError]=useState(false),request=useRef(0),controller=useRef(null);
 const load=async()=>{if(!remote)return;const sequence=++request.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);try{const response=await fetch('/api/finance/data',{headers:cloudHeaders(),signal:controller.current.signal});if(!response.ok)throw Error('Unavailable');const data=await response.json();if(!Array.isArray(data.transactions))throw Error('Invalid data');if(sequence===request.current){setLoaded({key,data,at:Date.now()});setError(false)}}catch(e){if(e.name!=='AbortError'&&sequence===request.current)setError(true)}finally{if(sequence===request.current)setBusy(false)}};
 useEffect(()=>{load();const focus=()=>{if(!document.hidden)load()};window.addEventListener('focus',focus);return()=>{request.current++;controller.current?.abort();window.removeEventListener('focus',focus)}},[key,remote]);
 return {data:loaded?.key===key?loaded.data:null,ready:!remote||loaded?.key===key,busy,error,load};
}
export const moneyFormat=(a,cents,digits=2)=>new Intl.NumberFormat(a.lang==='he'?'he-IL':'en-US',{style:'currency',currency:'ILS',maximumFractionDigits:digits}).format(cents/100);
export const moneyModel=(a,remote,{range,scope='family',person='all',source='all',sourceKeys=[],end})=>householdMoneyStatistics({manual:a.visible(a.data.expenses||[]),transactions:remote.data?.transactions||[],groups:remote.data?.groups||[],savedSources:remote.data?.sources||[],inferredSources:remote.data?.inferred||[],memberList:memberNames(a.members,a.data.profiles),sourceKeys,user:a.user,scope,person,source,range,end,plan:a.data.profiles[a.user]?.financePlans?.[scope],legacyBudget:a.data.preferences.monthlyBudget});

// The Money tab (adults only; the view never renders it for a child).
export function HouseholdMoneyStatistics({a,range,scope='family',person='all',source='all',sourceKeys=[],end,Button,Avatar,remote:given}){
 const own=useStatisticsMoney(a,!given),remote=given||own,T=a.T,locale=a.lang==='he'?'he-IL':'en-US',rtl=a.lang==='he';
 const model=moneyModel(a,remote,{range,scope,person,source,sourceKeys,end}),history=moneyModel(a,remote,{range:'all',scope,person,source,sourceKeys,end});
 const months=monthlySpending(history.rows,end,6),monthName=m=>new Date(m+'-15T12:00:00Z').toLocaleDateString(locale,{month:'short'});
 const money=n=>moneyFormat(a,n),label=id=>CATEGORY[id]?.[a.lang==='he'?'he':'en']||id,maximum=Math.max(1,...model.categories.map(r=>Math.abs(r.amount)));
 const exportCSV=()=>downloadCSV('bayit-money-'+scope+'.csv',['date','description','category','amount','person','source'],model.rows,(r,k)=>k==='date'?String(r.date||'').slice(0,10):k==='description'?r.description||r.title||'':k==='category'?label(r.category||'other'):k==='amount'?(r.spent/100).toFixed(2):k==='person'?(r.memberId?a.name(r.memberId):''):r.source==='manual'?T('Recorded manually','נרשם ידנית'):T('Statement or connection','דף חשבון או חיבור'));
 const openLedger=()=>a.go('household/expenses?scope='+scope+'&month='+end.slice(0,7));
 const waiting=<div className="household-stat-empty"><ChartBar size={36}/><p role="status">{remote.busy?T('Loading the expense records available to you…','טוענים את ההוצאות הזמינות לכם…'):T('Expense records are unavailable. Try refreshing or open the expense ledger.','רשומות ההוצאות אינן זמינות. אפשר לרענן או לפתוח את רישום ההוצאות.')}</p></div>;
 return <div className="household-money-statistics" aria-busy={remote.busy}>
  <StatisticsSummary rtl={rtl} items={[{icon:Receipt,viz:months.some(m=>m.total)?{kind:'bars',values:months.map(m=>m.total)}:null,label:T('Recorded expenses','הוצאות שתועדו'),value:remote.ready&&(!model.invalid||model.count>0)?money(model.total):'—',word:true,hint:remote.ready?(model.count===1?T('1 record in this period','רשומה אחת בתקופה'):T(model.count+' records in this period',model.count+' רשומות בתקופה')):T('Not loaded yet','עדיין לא נטען')},{icon:Wallet,label:T('Monthly limit','תקרה חודשית'),value:model.budget?money(model.budget):T('Not set','לא הוגדרה'),word:true,hint:model.budget?null:T('Set it in Expenses','אפשר להגדיר בהוצאות')},{icon:Gauge,label:T('Limit used this month','ניצול התקרה החודש'),value:remote.ready&&model.used!==null?model.used+'%':'—',word:true,hint:!model.budget?T('No limit to compare','אין תקרה להשוואה'):null,viz:model.budget&&remote.ready&&model.used!==null?{kind:'ring',pct:model.used}:null}]}/>
  {/* By person and card (concept C, 2026-11-09): right under the summary, before the charts. */}
  {remote.ready&&Avatar&&<SourcePanels a={a} index={history.index} rows={history.rows} months={months.map(m=>m.month)} Avatar={Avatar} money={n=>moneyFormat(a,n,0)} memberIds={a.members.filter(m=>m.role!=='child'&&!m.former).map(m=>m.id)} Select={Select} onSave={a.cloud?saveSource:null} onSaved={remote.load}/>}
  {remote.error&&<div className="household-stat-message" role="alert"><Info size={20}/><p>{remote.ready?T('Could not refresh connected records. The last loaded records are still shown.','לא ניתן לרענן את הרשומות המחוברות. הרשומות האחרונות שנטענו עדיין מוצגות.'):T('Connected expense records could not be loaded. This does not mean there was no spending.','לא ניתן לטעון את ההוצאות המחוברות. אין להסיק שלא היו הוצאות.')}</p><button className="control-button" type="button" disabled={remote.busy} onClick={remote.load}>{T('Try again','ניסיון נוסף')}</button></div>}
  <div className="stats-grid two">
   <ChartCard title={T('Spending against the limit','הוצאות חודשיות מול התקרה')} note={T('Last six months, by transaction date','ששת החודשים האחרונים, לפי תאריך העסקה')} footer={model.budget?T('Limit used this month: ','ניצול התקרה החודש: ')+(model.used??'—')+'%':T('No monthly limit set yet. Set one in Expenses to see it here.','עוד לא הוגדרה תקרה חודשית. אפשר להגדיר בהוצאות ולראות אותה כאן.')}>
    {!remote.ready?waiting:months.some(m=>m.total)?<BarsChart rtl={rtl} rows={months.map(m=>({date:m.month,spent:m.total}))} keys={[{id:'spent',color:'var(--stats-c1)',label:T('Spent','הוצאות')}]} xTick={monthName} yTick={v=>moneyFormat(a,v,0)} valueFormat={v=>v?moneyFormat(a,v,0):''} tooltipLabel={m=>new Date(m+'-15T12:00:00Z').toLocaleDateString(locale,{month:'long',year:'numeric'})} tooltipValue={v=>money(v)} yLabel={T('Spent','הוצאות')} xLabel={T('Month','חודש')} reference={model.budget?{y:model.budget,label:T('Monthly limit ','תקרה חודשית ')+moneyFormat(a,model.budget,0)}:null}/>:<div className="household-stat-empty"><ChartBar size={36}/><p>{T('No recorded expenses in the last six months.','אין הוצאות מתועדות בששת החודשים האחרונים.')}</p></div>}
   </ChartCard>
   <ChartCard title={T('Expenses by category','הוצאות לפי קטגוריה')} note={T('In the selected period.','בתקופה שנבחרה.')} action={a.cloud&&<button type="button" className="icon-button" aria-label={T('Refresh statistics expenses','רענון ההוצאות בסטטיסטיקה')} disabled={remote.busy} onClick={remote.load}><ArrowClockwise size={22}/></button>}>
    {!remote.ready?waiting:model.categories.length?<ul className="household-category-bars">{model.categories.map(row=><li key={row.category}><strong>{label(row.category)}</strong><bdi dir="ltr">{money(row.amount)}</bdi><span className={'household-category-track'+(row.amount<0?' refund':'')} aria-hidden="true"><i style={{width:Math.abs(row.amount)/maximum*100+'%'}}/></span></li>)}</ul>:<div className="household-stat-empty"><ChartBar size={36}/><p>{T('No net recorded expenses to chart for this period. Choose another period or open the expense ledger.','אין הוצאות נטו מתועדות להצגה בתקופה הזאת. אפשר לבחור תקופה אחרת או לפתוח את רישום ההוצאות.')}</p></div>}
    {remote.ready&&model.budget>0&&<p className="household-stat-note">{T('Monthly limit use includes all sources in the selected sharing view.','ניצול התקרה החודשית כולל את כל המקורות בתצוגת השיתוף שנבחרה.')}</p>}
    {model.invalid>0&&<p className="household-stat-note" role="status">{T('Incomplete expense records are excluded from these totals.','רשומות הוצאה שחסרים בהן פרטים אינן נכללות בסכומים האלה.')}</p>}
    {model.unattributed>0&&<p className="household-stat-note">{T('Records without an assigned person are excluded from this person filter.','רשומות ללא שיוך לאדם אינן נכללות בסינון לפי אדם.')}</p>}
    {model.uncoveredCardPayments>0&&<p className="household-stat-note">{T('Card settlements without matching statement details are included once as settlements.','חיובי כרטיס ללא פירוט תואם נכללים פעם אחת כחיוב הכרטיס.')}</p>}
   </ChartCard>
  </div>
  <StatisticsFooter lines={[T('Totals use the expense records you can see, by transaction date.','הסכומים מבוססים על ההוצאות שאתם רואים, לפי תאריך העסקה.'),T('Private expenses appear only in their owner’s Mine view.','הוצאות פרטיות מופיעות רק בתצוגת "שלי" של בעליהן.')]}><Button secondary icon={DownloadSimple} disabled={!remote.ready||!model.rows.length} onClick={exportCSV}>{T('Export CSV','ייצוא CSV')}</Button><Button secondary icon={BookOpenText} onClick={openLedger}>{T('Open expense ledger','פתיחת רישום ההוצאות')}</Button></StatisticsFooter>
 </div>;
}
