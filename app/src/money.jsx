import React,{useState,useEffect,useMemo,useRef} from 'react';
import {PencilSimple,ArrowLeft,ArrowRight,CalendarDots,UsersThree,LockSimple,UploadSimple,TrendUp,TrendDown,PiggyBank,Scales,Bank,Sparkle,X,Check,CheckCircle,WarningCircle,ArrowsClockwise,MagnifyingGlass,Trash,FilePdf,TelegramLogo,ChartLineUp,Receipt,Lightbulb,Info} from '@phosphor-icons/react';
import {ResponsiveContainer,PieChart,Pie,Cell,Tooltip,BarChart,Bar,XAxis,YAxis,CartesianGrid,Legend} from 'recharts';
import {cloudHeaders} from './cloud-transport';
import {ExpensesView} from './expenses-view';
import {CATEGORY,CATEGORIES,flowOf,monthOf,shiftMonth,monthSummary,recurringPayments,forecast,linkCardPayments} from '../../shared/finance.mjs';
import {MoneyHero,MoneyTile,FlowChart,CategoryRing,ForecastBar,NavArrow} from './money-charts';
import {CategoryCards,CategorySheet} from './money-detail';
import './money.css';
import {PageSkeleton} from './skeleton';

async function api(path,{method='GET',body,headers={}}={}){
 const response=await fetch('/api/finance/'+path,{method,headers:{...cloudHeaders(),...headers,...(body&&!(body instanceof Blob)&&!(body instanceof ArrayBuffer)?{'Content-Type':'application/json'}:{})},body:body&&!(body instanceof Blob)&&!(body instanceof ArrayBuffer)?JSON.stringify(body):body,signal:AbortSignal.timeout(60000)});
 let result;try{result=await response.json()}catch{throw new Error('The money service is unavailable.')}
 if(!response.ok)throw new Error(result.error||'The request failed.');return result;
}
// Manual expenses recorded in Bills & manual join the same picture.
const MANUAL_CATEGORY={Groceries:'groceries',Utilities:'utilities',Cleaning:'home',School:'kids',Health:'health',Other:'other'};
const SOURCE={leumi:['Bank Leumi','בנק לאומי'],max:['Max','מקס'],manual:['Recorded','נרשם ידנית'],riseup:['RiseUp','RiseUp']};

export function MoneyView({app:a,ui}){
 const {Button,Icon,Avatar,Tabs,Select,Empty}=ui;
 const [data,setData]=useState(null),[error,setError]=useState(''),[tab,setTab]=useState('overview'),[scope,setScope]=useState('family'),[month,setMonth]=useState(null),[importing,setImporting]=useState(false),[insights,setInsights]=useState(null),[insightBusy,setInsightBusy]=useState(false),[insightError,setInsightError]=useState(''),[sheet,setSheet]=useState(null),[ledgerCategory,setLedgerCategory]=useState('all');
 const he=a.lang==='he',T=a.T,money=(agorot,{sign=false,fraction}={})=>{const v=agorot/100;return (sign&&v>0?'+':v<0&&sign?'−':'')+'₪'+Math.abs(v).toLocaleString(he?'he-IL':'en-US',{maximumFractionDigits:fraction??(Math.abs(v)>=1000?0:2)})};
 const catName=id=>he?CATEGORY[id]?.he:CATEGORY[id]?.en,monthName=m=>new Date(m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'long',year:'numeric'}),shortMonth=m=>new Date(m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short'});
 const load=async()=>{try{setData(await api('data'));setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{load()},[a.data.householdId]);

 // All visible money rows: imported statements plus manual expenses from Bills & manual.
 const manual=useMemo(()=>a.visible(a.data.expenses||[]).map(e=>({id:'manual-'+e.id,source:'manual',kind:'manual',date:e.date,chargeDate:e.date,description:a.text(e),amount:-Math.round(Number(e.amount)*100),category:MANUAL_CATEGORY[e.category]||'other',memberId:e.memberId,visibility:e.visibility,ownerId:e.ownerId})),[a.data.expenses,a.lang]);
 const all=useMemo(()=>[...(data?.transactions||[]),...manual],[data,manual]);
 const rows=useMemo(()=>all.filter(t=>scope==='private'?t.visibility==='private':t.visibility!=='private'),[all,scope]);
 const groups=data?.groups||[];
 const months=useMemo(()=>[...new Set(rows.map(monthOf))].sort(),[rows]);
 // Bank statements cover their period; a live RiseUp connection covers every finished month it returned.
 const coverage=useMemo(()=>{const thisMonth=new Date().toISOString().slice(0,7),live=[...new Set((data?.transactions||[]).filter(t=>t.source==='riseup'&&t.month<thisMonth).map(t=>t.month))];return [...(data?.imports||[]).filter(i=>i.kind==='bank').map(i=>[i.periodFrom,i.periodTo]),...live.map(m=>[m+'-01',m+'-31'])]},[data]);
 const complete=m=>coverage.some(([f,t])=>f<=m+'-01'&&t>=m+'-28');
 useEffect(()=>{if(!month&&months.length){const done=[...months].reverse().find(complete);setMonth(done||months.at(-1))}},[months.join(),coverage.length]);
 const current=month||months.at(-1)||new Date().toISOString().slice(0,7);
 const summary=useMemo(()=>monthSummary(rows,groups,current),[rows,groups,current]);
 const previous=useMemo(()=>monthSummary(rows,groups,shiftMonth(current,-1)),[rows,groups,current]);
 const trend=useMemo(()=>[5,4,3,2,1,0].map(i=>shiftMonth(current,-i)).filter(m=>!coverage.length||coverage.some(([f,t])=>f.slice(0,7)<=m&&t.slice(0,7)>=m)).map(m=>({m,s:monthSummary(rows,groups,m)})).filter(x=>x.s.count),[rows,groups,current,coverage]);
 const recurring=useMemo(()=>recurringPayments(rows),[rows]);
 const outlook=useMemo(()=>forecast(rows,groups,shiftMonth(current,1)),[rows,groups,current]);
 const links=useMemo(()=>linkCardPayments(rows,groups),[rows,groups]);
 const partial=months.length&&!complete(current)&&coverage.length;

 if(error&&!data)return <div className="money-page"><p role="alert" className="ai-error">{error}</p><Button secondary onClick={load}>{T('Try again','לנסות שוב')}</Button></div>;
 if(!data)return <div className="money-page"><PageSkeleton variant="money" label={T('Loading your expenses…','טוענים את ההוצאות…')}/></div>;

 const delta=(now,before)=>before?Math.round((now-before)/before*100):null;
 const metric=(Glyph,label,value,color,sub)=><section className={'money-metric '+color}><span className="money-metric-icon"><Glyph size={30} weight="duotone"/></span><div><h3>{label}</h3><strong>{value}</strong>{sub&&<small>{sub}</small>}</div></section>;
 const change=(now,before,invert)=>{const d=delta(now,before);if(d===null||!isFinite(d))return null;const up=d>0;return <span className={'money-change '+((up!==!!invert)?'bad':'good')}>{up?<TrendUp size={14}/>:<TrendDown size={14}/>}{Math.abs(d)}% {T('vs last month','מהחודש שעבר')}</span>};

 const myLink=(data.connections||[]).find(c=>c.provider==='riseup'&&c.mine);
 // Live bank balances from RiseUp connections this person may see (shared ones in Together, own private ones in Just me).
 const liveList=(data.connections||[]).filter(c=>c.balances?.length&&(scope==='private'?c.mine&&c.visibility==='private':c.visibility!=='private')).flatMap(c=>c.balances.filter(b=>b.source!=='creditCard'));
 const liveBalance=liveList.length?{amount:liveList.reduce((n,b)=>n+b.balance,0)}:null;
 const toolbar=<div className="money-toolbar">
  <div className="expense-month"><button className="icon-button" aria-label={T('Previous month','החודש הקודם')} onClick={()=>setMonth(shiftMonth(current,-1))}>{he?<ArrowRight size={21}/>:<ArrowLeft size={21}/>}</button><label><CalendarDots size={22}/><input aria-label={T('Month','חודש')} type="month" value={current} onChange={e=>e.target.value&&setMonth(e.target.value)}/></label><button className="icon-button" aria-label={T('Next month','החודש הבא')} onClick={()=>setMonth(shiftMonth(current,1))}>{he?<ArrowLeft size={21}/>:<ArrowRight size={21}/>}</button></div>
  <Tabs variant="filter" value={scope} onChange={setScope} items={[["family",T('Together','ביחד'),UsersThree],["private",T('Just me','רק אני'),LockSimple]]}/>
  <Button icon={PencilSimple} onClick={()=>setTab('manual')}>{T('Add by hand','רישום ידני')}</Button>
  <Button secondary icon={UploadSimple} onClick={()=>setImporting(true)}>{T('Import statement','ייבוא דף חשבון')}</Button>
  <Button secondary icon={myLink?ArrowsClockwise:Bank} onClick={()=>a.go('settings/connections?open=riseup')}>{myLink?'RiseUp':T('Connect RiseUp','חיבור RiseUp')}</Button>
 </div>;
 const nav=<Tabs variant="view" value={tab} onChange={v=>{setTab(v);if(v!=='transactions')setLedgerCategory('all')}} items={[["overview",T('Summary','סיכום'),ChartLineUp],["transactions",T('Transactions','תנועות'),Receipt,rows.filter(t=>monthOf(t)===current).length],["recurring",T('Fixed bills','חיובים קבועים'),ArrowsClockwise,recurring.length]]}/>;
 const noData=!(data.transactions||[]).length;

 return <div className="money-page">
  <div className="money-controls"><div className="money-nav">{nav}</div>{toolbar}</div>
  {tab==='manual'?<ExpensesView app={a} ui={ui}/>:noData?<MoneyWelcome a={a} onImport={()=>setImporting(true)} onConnect={()=>a.go('settings/connections?open=riseup')}/>:<>
   {data.setAside>0&&<p className="money-partial"><Info size={18}/>{T('RiseUp is used for the months it covers, so '+data.setAside+' rows from imported statements are set aside to avoid double counting.','RiseUp משמש לחודשים שהוא מכסה, ולכן '+data.setAside+' שורות מדפי חשבון שיובאו הוסתרו כדי לא לספור פעמיים.')} <button type="button" className="text-link" onClick={()=>a.go('settings/connections?open=riseup')}>{T('Change','שינוי')}</button></p>}
   {partial?<p className="money-partial"><Info size={18}/>{T('Partial month: your bank statements cover only part of ','חודש חלקי: דפי הבנק מכסים רק חלק מ')}{monthName(current)}.</p>:null}
   {tab==='overview'&&<div className="money-board">
    <MoneyHero a={a} T={T} money={money} monthName={monthName} summary={summary} month={current} live={liveBalance}/>
    <div className="money-tiles">
     <MoneyTile T={T} tone="in" icon="1F4B0" label={T('Money in','נכנס')} value={money(summary.income)} series={trend.map(x=>x.s.income)} delta={delta(summary.income,previous.income)}/>
     <MoneyTile T={T} tone="out" icon="1F6D2" label={T('Spent','יצא')} value={money(summary.expenses)} series={trend.map(x=>x.s.expenses)} delta={delta(summary.expenses,previous.expenses)} invert/>
     <MoneyTile T={T} tone="save" icon="1F4C8" label={T('Saved & pension','חיסכון ופנסיה')} value={money(summary.savings)} series={trend.map(x=>x.s.savings)} delta={delta(summary.savings,previous.savings)}/>
    </div>
    <section className="money-card money-span-12 money-where"><div className="section-title"><div><h2>{T('Where the money went','לאן הלך הכסף')}</h2><p className="money-lead">{T('Tap a category to see every purchase in it.','הקישו על קטגוריה כדי לראות כל קנייה בה.')}</p></div><button type="button" className="money-total-pill" onClick={()=>setTab('transactions')}>{T('All transactions','כל התנועות')} <NavArrow he={he} next/></button></div>
     {summary.byCategory.length?<div className="money-where-body"><CategoryRing a={a} T={T} money={money} catName={catName} summary={summary} Icon={Icon} onSelect={setSheet}/><CategoryCards a={a} T={T} money={money} catName={catName} summary={summary} previous={previous} Icon={Icon} onOpen={setSheet}/></div>:<p className="muted">{T('No spending recorded for this month.','לא נרשמו הוצאות בחודש הזה.')}</p>}
    </section>
    <section className="money-card money-span-7"><div className="section-title"><div><h2>{T('Money flow','זרימת הכסף')}</h2><p className="money-lead">{T('In above the line, out below. Tap a month to open it.','נכנס מעל הקו, יצא מתחתיו. הקישו על חודש כדי לפתוח אותו.')}</p></div><span className="money-legend"><i style={{background:'#2FA86B'}}/>{T('In','נכנס')}<i style={{background:'var(--primary)'}}/>{T('Out','יצא')}<i style={{background:'#FFB547'}}/>{T('Saved','נחסך')}<i className="line"/>{T('Left','נשאר')}</span></div>
     <FlowChart a={a} T={T} money={money} trend={trend} month={current} onPick={setMonth}/>
    </section>
    <section className="money-card money-span-5 money-coming"><div className="section-title"><div><h2>{T('Coming up','מה צפוי')}</h2><p className="money-lead">{monthName(outlook.month)}</p></div><button type="button" className="money-total-pill" onClick={()=>setTab('recurring')}>{T('Fixed bills','חיובים קבועים')} <NavArrow he={he} next/></button></div>
     <div className="money-forecast-net"><span>{T('Expected to remain','צפוי להישאר')}</span><strong className={outlook.net>=0?'good':'bad'}>{money(outlook.net,{sign:true,fraction:0})}</strong></div>
     <p className="money-coming-line"><span><i className="bills"/>{T('Fixed bills','חיובים קבועים')} <b>{money(outlook.bills,{fraction:0})}</b></span><span><i className="everyday"/>{T('Everyday','שוטף')} <b>{money(outlook.everyday,{fraction:0})}</b></span><span><i className="in"/>{T('Income','הכנסה')} <b>{money(outlook.income,{fraction:0})}</b></span></p>
     <ul className="money-bills">{outlook.due.filter(r=>flowOf(r.category)==='expense').sort((x,y)=>y.typical-x.typical).slice(0,4).map(r=><li key={r.key}><span className="money-cat-icon"><Icon code={CATEGORY[r.category]?.icon} size={26}/></span><strong>{r.description}</strong><b>{money(r.typical,{fraction:0})}</b><span className="money-due">{dueLabel({...r,nextMonth:outlook.month},a.lang)}</span></li>)}</ul>
     <small className="muted">{T('Estimate from '+outlook.basedOnMonths+' month(s) of statements.','הערכה לפי '+outlook.basedOnMonths+' חודשי דפי חשבון.')}</small>
    </section>
    <div className="money-span-7"><MoneyInsights a={a} T={T} month={current} insights={insights} busy={insightBusy} error={insightError} onAsk={async()=>{setInsightBusy(true);setInsightError('');try{setInsights(await api('insights',{method:'POST',body:{month:current,language:a.lang}}))}catch(e){setInsightError(e.message)}finally{setInsightBusy(false)}}}/></div>
    <div className="money-span-5 money-sources"><Connections a={a} T={T} data={data} Avatar={Avatar} onOpen={()=>a.go('settings/connections?open=riseup')}/><Statements a={a} T={T} data={data} onRemove={async id=>{if(!window.confirm(T('Remove this statement and its transactions?','להסיר את הדף ואת התנועות שלו?')))return;try{await api('imports/'+id,{method:'DELETE'});await load()}catch(e){setError(e.message)}}}/></div>
   </div>}
   {tab==='transactions'&&<Ledger key={ledgerCategory} initialCategory={ledgerCategory} a={a} ui={ui} T={T} money={money} catName={catName} rows={rows} month={current} links={links} data={data} reload={load}/>}
   {tab==='recurring'&&<RecurringView a={a} ui={ui} T={T} money={money} catName={catName} monthName={monthName} recurring={recurring} outlook={outlook} latest={months.at(-1)}/>}
  </>}
  {sheet&&<CategorySheet a={a} T={T} money={money} catName={catName} rows={rows} groups={groups} month={current} item={sheet} Icon={Icon} Avatar={Avatar} onClose={()=>setSheet(null)} onOpenLedger={c=>{setSheet(null);setLedgerCategory(c);setTab('transactions')}}/>}
  {importing&&<ImportDialog a={a} ui={ui} T={T} money={money} catName={catName} onClose={()=>setImporting(false)} onApplied={async()=>{setImporting(false);await load();setTab('overview')}}/>}
 </div>;
}

export const dueLabel=(r,lang)=>new Date(r.nextMonth+'-'+String(Math.min(28,r.nextDay||1)).padStart(2,'0')+'T12:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-US',{day:'numeric',month:'short'});
function MoneyWelcome({a,onImport,onConnect}){const T=a.T;return <section className="money-welcome"><img src="/assets/icons/bayit/pixel/blue-house-128.png" alt="" width="96" height="96"/><h2>{T('See where the money goes.','לראות לאן הכסף הולך.')}</h2><p>{T('Import a Bank Leumi account statement and your Max card statements (PDF). Bayit checks every total against the statement, avoids counting card charges twice, and builds your monthly picture.','ייבאו דף חשבון של בנק לאומי ודפי פירוט של מקס (PDF). Bayit בודק כל סכום מול הדף, לא סופר חיובי כרטיס פעמיים, ובונה את תמונת החודש.')}</p><div className="money-welcome-steps"><span><FilePdf size={24}/>{T('Download the PDF from Leumi or Max','מורידים PDF מלאומי או ממקס')}</span><span><UploadSimple size={24}/>{T('Import it here','מייבאים כאן')}</span><span><TelegramLogo size={24}/>{T('…or send it to your Bayit bot','…או שולחים לבוט של Bayit')}</span></div><div className="money-welcome-actions"><button type="button" className="button" onClick={onImport}><UploadSimple size={23}/> {T('Import statement','ייבוא דף חשבון')}</button><button type="button" className="button secondary" onClick={onConnect}><Bank size={23}/> {T('Or connect RiseUp','או לחבר RiseUp')}</button></div><small className="muted">{T('RiseUp is optional: if you already use it, Bayit can read your transactions from it every day.','RiseUp הוא אופציונלי: אם אתם כבר משתמשים בו, Bayit יכול לקרוא ממנו את התנועות כל יום.')}</small></section>}

function MoneyInsights({a,T,month,insights,busy,error,onAsk}){
 return <section className="money-card money-insights"><div className="section-title"><h2 className="icon-heading"><Sparkle size={26} weight="duotone"/>{T('AI tips','טיפים מה־AI')}</h2></div>
  {!insights&&<div className="money-insights-empty"><div><p>{T('Your AI reviews totals, categories and recurring bills (no account or card numbers) and suggests where you could save.','ה־AI שלכם בוחן סכומים, קטגוריות וחיובים קבועים (ללא מספרי חשבון או כרטיס) ומציע איפה אפשר לחסוך.')}</p><ul className="money-insight-topics">{[['Price increases in fixed bills','עליות מחיר בחיובים קבועים'],['Insurance worth comparing','ביטוחים שכדאי להשוות'],['Subscriptions to review','מנויים לבדיקה'],['Categories that grew','קטגוריות שגדלו']].map(([en,he])=><li key={en}><Sparkle size={15} weight="fill"/>{T(en,he)}</li>)}</ul><button type="button" className="button" disabled={busy} onClick={onAsk}><Lightbulb size={22}/> {busy?T('Thinking…','חושב…'):T('Review this month','לסקור את החודש')}</button></div><img src="/assets/icons/bayit/pixel/smiling-sun-128.png" alt="" width="110" height="110"/></div>}
  {error&&<p role="alert" className="ai-error">{error}</p>}
  {insights&&<div className="money-insight-body"><p className="money-headline">{insights.headline}</p>{insights.observations?.length>0&&<ul>{insights.observations.map((o,i)=><li key={i}><strong>{o.title}</strong><span>{o.detail}</span></li>)}</ul>}{insights.tips?.length>0&&<><h3>{T('Ways to save','דרכים לחסוך')}</h3><ul className="money-tips">{insights.tips.map((t,i)=><li key={i}><Lightbulb size={20} weight="duotone"/><div><strong>{t.title}</strong><span>{t.detail}</span></div>{t.estimatedMonthlySaving>0&&<b>~₪{Math.round(t.estimatedMonthlySaving).toLocaleString()}</b>}</li>)}</ul></>}<small className="muted">{T('Generated by AI for '+month+'. Not financial advice.','נוצר על ידי AI עבור '+month+'. אינו ייעוץ פיננסי.')}</small><button type="button" className="text-link" disabled={busy} onClick={onAsk}>{busy?T('Thinking…','חושב…'):T('Refresh','רענון')}</button></div>}
 </section>;
}

const fmtRange=(from,to,lang)=>[from,to].map(d=>new Date(d+'T12:00Z').toLocaleDateString(lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short'})).join(' – ');
function Connections({a,T,data,Avatar,onOpen}){
 const list=(data.connections||[]).filter(c=>c.provider==='riseup');if(!list.length)return null;
 const when=ts=>ts?new Date(ts).toLocaleString(a.lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
 return <section className="money-card money-statements money-connections"><div className="section-title"><h2>{T('Live connections','חיבורים חיים')}</h2><button type="button" className="money-total-pill" onClick={onOpen}>{T('Manage','ניהול')}</button></div><ul>{list.map(c=><li key={c.memberId}><Avatar who={c.memberId} size={30}/><div><strong>RiseUp · {a.name(c.memberId)}</strong><small>{T('Last sync ','סנכרון אחרון ')}{when(c.lastSyncAt)}{c.lastCount!=null?' · '+c.lastCount+' '+T('transactions','תנועות'):''} · {c.visibility==='private'?T('Only me','רק אני'):T('Shared','משותף')}</small>{c.balances?.length>0&&<small className="money-balances">{c.balances.map(b=>(b.label||'')+' '+(b.balance<0?'−':'')+'₪'+Math.abs(Math.round(b.balance/100)).toLocaleString()).join(' · ')}</small>}</div>{c.status==='ok'?<span className="money-ok" title={T('Working','פועל')}><CheckCircle size={20} weight="fill"/></span>:<span className="money-warn" title={T('Needs attention','דורש טיפול')}><WarningCircle size={20} weight="fill"/></span>}</li>)}</ul></section>;
}
function Statements({a,T,data,onRemove}){
 const list=data.imports||[];if(!list.length)return null;
 return <section className="money-card money-statements"><div className="section-title"><h2>{T('Imported statements','דפי חשבון שיובאו')}</h2></div><ul>{list.map(i=><li key={i.id}><FilePdf size={26} weight="duotone"/><div><strong>{(a.lang==='he'?SOURCE[i.source]?.[1]:SOURCE[i.source]?.[0])||i.source} · {i.kind==='card'?new Date((i.statementDate||i.periodTo)+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{month:'long',year:'numeric'}):fmtRange(i.periodFrom,i.periodTo,a.lang)}</strong><small>{i.newCount} {T('transactions','תנועות')} · {i.visibility==='private'?T('Only me','רק אני'):T('Shared','משותף')}</small></div>{i.checksOk?<span className="money-ok" title={T('Totals match the statement','הסכומים תואמים לדף')}><CheckCircle size={20} weight="fill"/></span>:<span className="money-warn" title={T('Check totals','לבדוק סכומים')}><WarningCircle size={20} weight="fill"/></span>}{i.ownerId===data.me&&<button className="icon-button" aria-label={T('Remove statement','הסרת דף')} onClick={()=>onRemove(i.id)}><Trash size={20}/></button>}</li>)}</ul></section>;
}

function Ledger({a,ui:{Icon,Avatar,Select},T,money,catName,rows,month,links,data,reload,initialCategory='all'}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState(initialCategory),[source,setSource]=useState('all'),[limit,setLimit]=useState(80),[editing,setEditing]=useState(null),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false);
 const list=rows.filter(t=>monthOf(t)===month&&(category==='all'||t.category===category)&&(source==='all'||t.source===source)&&(!query||t.description.toLowerCase().includes(query.toLowerCase()))).sort((x,y)=>y.date.localeCompare(x.date)||(x.seq??0)-(y.seq??0));
 const used=[...new Set(rows.filter(t=>monthOf(t)===month).map(t=>t.category))];
 const save=async(t,value)=>{setBusy(true);try{await fetch('/api/finance/transactions/'+t.id,{method:'PATCH',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify({category:value,remember})}).then(async r=>{if(!r.ok)throw new Error((await r.json()).error)});setEditing(null);await reload()}catch(e){a.notify(e.message)}finally{setBusy(false)}};
 return <section className="money-ledger">
  <div className="money-filters"><label className="money-search"><MagnifyingGlass size={20}/><input placeholder={T('Search merchants','חיפוש בית עסק')} value={query} onChange={e=>setQuery(e.target.value)}/></label><Select aria-label={T('Source','מקור')} value={source} onChange={e=>setSource(e.target.value)}><option value="all">{T('All accounts','כל החשבונות')}</option><option value="leumi">{T('Bank Leumi','בנק לאומי')}</option><option value="max">Max</option><option value="manual">{T('Recorded manually','נרשם ידנית')}</option></Select></div>
  <div className="money-chips" role="group" aria-label={T('Categories','קטגוריות')}><button className={'money-chip '+(category==='all'?'on':'')} onClick={()=>setCategory('all')}>{T('All','הכול')}</button>{used.map(c=><button key={c} className={'money-chip '+(category===c?'on':'')} onClick={()=>setCategory(c)}><Icon code={CATEGORY[c]?.icon} size={20}/>{catName(c)}</button>)}</div>
  <ul className="money-rows">{list.slice(0,limit).map(t=>{const covered=t.kind==='card_payment'&&links.has(t.id);return <li key={t.id} className={covered?'covered':''}>
   <span className="money-cat-icon"><Icon code={CATEGORY[t.category]?.icon||'1F9FE'} size={30}/></span>
   <div className="money-row-main"><strong>{t.description}</strong><small>{editing===t.id?<span className="money-recat"><Select aria-label={T('Category','קטגוריה')} value={t.category} onChange={e=>save(t,e.target.value)}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{a.lang==='he'?c.he:c.en}</option>)}</Select><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>{T('Always for this merchant','תמיד לבית העסק הזה')}</label><button className="text-link" onClick={()=>setEditing(null)}>{T('Cancel','ביטול')}</button></span>:<><button className="money-cat-button" disabled={t.source==='manual'||busy} onClick={()=>setEditing(t.id)}>{catName(t.category)}</button> · {(a.lang==='he'?SOURCE[t.source]?.[1]:SOURCE[t.source]?.[0])||t.source}{t.account&&t.source!=='manual'?' ••'+t.account:''}{t.installmentOf?' · '+T('payment '+t.installmentN+' of '+t.installmentOf,'תשלום '+t.installmentN+' מתוך '+t.installmentOf):''}{t.foreign&&t.currency!=='ILS'?' · '+t.currency:''}{covered?' · '+T('details counted from the card statement','הפירוט נספר מדף הכרטיס'):''}</>}</small></div>
   <span className="money-row-date">{new Date(t.date+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{day:'numeric',month:'short'})}</span>
   {t.memberId&&a.members.some(m=>m.id===t.memberId)?<Avatar who={t.memberId} size={30}/>:<span/>}
   <b className={'money-amount '+(t.amount>0?'in':'')}>{money(t.amount,{sign:true,fraction:2})}</b>
  </li>})}</ul>
  {list.length>limit&&<button className="button secondary" onClick={()=>setLimit(limit+120)}>{T('Show more','להציג עוד')}</button>}
  {!list.length&&<p className="muted">{T('No transactions match.','אין תנועות מתאימות.')}</p>}
 </section>;
}

function RecurringView({a,ui:{Icon},T,money,catName,monthName,recurring,outlook,latest}){
 const out=recurring.filter(r=>flowOf(r.category)!=='income'),total=out.filter(r=>r.period===1).reduce((n,r)=>n+r.typical,0)+out.filter(r=>r.period===2).reduce((n,r)=>n+r.typical/2,0);
 return <div className="money-grid money-grid-recurring">
  <section className="money-card"><div className="section-title"><h2>{T('Fixed payments','חיובים קבועים')}</h2><b>{money(total)} {T('/ month','לחודש')}</b></div>
   <ul className="money-recurring">{out.map(r=><li key={r.key}><span className="money-cat-icon"><Icon code={CATEGORY[r.category]?.icon} size={30}/></span><div><strong>{r.description}</strong><small>{catName(r.category)} · {r.period===2?T('every 2 months','כל חודשיים'):T('monthly','חודשי')}{r.installmentsLeft!=null?' · '+T(r.installmentsLeft+' payments left','נותרו '+r.installmentsLeft+' תשלומים'):''}{r.standingOrder?' · '+T('standing order','הוראת קבע'):''}</small></div><span className="money-row-date">{r.nextMonth>=latest?T('Next: ','הבא: ')+monthName(r.nextMonth):T('Last seen: ','נראה לאחרונה: ')+monthName(r.months.at(-1))}</span>{r.changePercent>=5?<em className="money-up">↑{r.changePercent}%</em>:r.changePercent<=-5?<em className="money-down">↓{Math.abs(r.changePercent)}%</em>:<span/>}<b>{money(r.typical)}</b></li>)}</ul>
   {!out.length&&<p className="muted">{T('Import at least two months of statements to find recurring payments.','ייבאו לפחות חודשיים של דפי חשבון כדי למצוא חיובים קבועים.')}</p>}
  </section>
  <section className="money-card money-forecast"><div className="section-title"><h2>{T('Forecast','תחזית')}</h2><small className="muted">{monthName(outlook.month)}</small></div>
   <div className="money-forecast-net"><span>{T('Expected to remain','צפוי להישאר')}</span><strong className={outlook.net>=0?'good':'bad'}>{money(outlook.net,{sign:true})}</strong></div>
   <dl className="money-forecast-lines"><div><dt>{T('Expected income','הכנסה צפויה')}</dt><dd>{money(outlook.income)}</dd></div><div><dt>{T('Recurring bills','חיובים קבועים')}</dt><dd>{money(outlook.bills)}</dd></div><div><dt>{T('Everyday spending (typical)','הוצאות שוטפות (טיפוסי)')}</dt><dd>{money(outlook.everyday)}</dd></div><div><dt>{T('Savings & pension','חיסכון ופנסיה')}</dt><dd>{money(outlook.savings)}</dd></div></dl>
   <h3>{T('Due that month','לתשלום באותו חודש')}</h3><ul className="money-recurring-mini">{outlook.due.filter(r=>flowOf(r.category)!=='income').slice(0,10).map(r=><li key={r.key}><span className="money-cat-icon"><Icon code={CATEGORY[r.category]?.icon} size={26}/></span><div><strong>{r.description}</strong></div><b>{money(r.typical)}</b></li>)}</ul>
  </section>
 </div>;
}

function ImportDialog({a,ui:{Button,Select,Avatar},T,money,catName,onClose,onApplied}){
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[visibility,setVisibility]=useState('shared'),[owners,setOwners]=useState({}),input=useRef(null);
 const adults=a.members.filter(m=>m.role!=='child');
 const upload=async file=>{if(!file)return;setError('');setBusy(true);try{const result=await api('import',{method:'POST',body:file,headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)}});setPreview(result);setOwners(Object.fromEntries(result.accounts.map(x=>[x.account,x.suggestedMember])))}catch(e){setError(e.message)}finally{setBusy(false)}};
 const apply=async()=>{setBusy(true);setError('');try{await api('imports/'+preview.id+'/apply',{method:'POST',body:{visibility,cardMembers:owners}});await onApplied()}catch(e){setError(e.message);setBusy(false)}};
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}><section className="item-editor money-import" role="dialog" aria-modal="true" aria-label={T('Import statement','ייבוא דף חשבון')}>
  <div className="section-title"><h2>{T('Import a statement','ייבוא דף חשבון')}</h2><button type="button" className="icon-button" aria-label={T('Close','סגירה')} onClick={onClose} disabled={busy}><X size={24}/></button></div>
  {!preview&&<><button type="button" className="money-drop" onClick={()=>input.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload(e.dataTransfer.files[0])}} disabled={busy}><FilePdf size={46} weight="duotone"/><strong>{busy?T('Reading the statement…','קוראים את הדף…'):T('Choose or drop a PDF','בחרו או גררו קובץ PDF')}</strong><small>{T('Bank Leumi account statement (דף חשבון) or Max card statement · up to 5 MB','דף חשבון של בנק לאומי או דף פירוט של מקס · עד 5MB')}</small></button><input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e=>upload(e.target.files[0])}/>
   <p className="muted money-privacy"><LockSimple size={18}/>{T('The PDF is read on your household server and not kept. Only dates, merchants, amounts, card endings and categories are saved. No passwords are needed.','ה־PDF נקרא בשרת הבית ואינו נשמר. נשמרים רק תאריכים, בתי עסק, סכומים, סיומות כרטיס וקטגוריות. אין צורך בסיסמאות.')}</p></>}
  {preview&&<div className="money-preview">
   <div className="money-preview-head"><FilePdf size={34} weight="duotone"/><div><strong>{(a.lang==='he'?SOURCE[preview.source]?.[1]:SOURCE[preview.source]?.[0])} · {preview.period.from} → {preview.period.to}</strong><small>{preview.newCount} {T('new','חדשות')}{preview.duplicateCount?' · '+preview.duplicateCount+' '+T('already imported','כבר יובאו'):''}</small></div></div>
   <p className={preview.ok?'money-ok':'money-warn'}>{preview.ok?<CheckCircle size={20} weight="fill"/>:<WarningCircle size={20} weight="fill"/>}{preview.ok?T('Every total matches the statement ('+preview.checks.length+' checks).','כל הסכומים תואמים לדף ('+preview.checks.length+' בדיקות).'):T('Some totals do not match the statement. You can still import, but please review the transactions.','חלק מהסכומים אינם תואמים לדף. אפשר לייבא, אבל כדאי לבדוק את התנועות.')}</p>
   <div className="money-preview-totals">{preview.moneyIn>0&&<span><small>{T('Money in','הכנסות')}</small><b className="good">{money(preview.moneyIn)}</b></span>}<span><small>{T('Spending','הוצאות')}</small><b>{money(preview.moneyOut)}</b></span>{preview.cardPayments>0&&<span><small>{T('Card payments','חיובי כרטיסים')}</small><b>{money(preview.cardPayments)}</b></span>}</div>
   {preview.kind==='card'&&<div className="money-owners"><h3>{T('Whose card is it?','של מי הכרטיס?')}</h3>{preview.accounts.map(x=><label key={x.account}><span>••{x.account} <small>{x.holder}</small></span><Select aria-label={T('Card owner','בעל הכרטיס')} value={owners[x.account]||''} onChange={e=>setOwners({...owners,[x.account]:e.target.value})}>{adults.map(m=><option key={m.id} value={m.id}>{a.name(m.id)}</option>)}</Select></label>)}</div>}
   <div className="money-visibility"><h3>{T('Who can see these transactions?','מי יכול לראות את התנועות?')}</h3><div className="money-choice"><button type="button" className={visibility==='shared'?'on':''} onClick={()=>setVisibility('shared')}><UsersThree size={22}/>{T('Both parents','שני ההורים')}</button><button type="button" className={visibility==='private'?'on':''} onClick={()=>setVisibility('private')}><LockSimple size={22}/>{T('Only me','רק אני')}</button></div><small className="muted">{T('Children never see expenses.','ילדים אף פעם לא רואים את ההוצאות.')}</small></div>
   {preview.byCategory.length>0&&<ul className="money-category-list compact">{preview.byCategory.slice(0,5).map(c=><li key={c.category}><strong>{catName(c.category)}</strong><b>{money(c.amount)}</b></li>)}</ul>}
   <div className="money-preview-actions"><Button icon={Check} disabled={busy||!preview.newCount} onClick={apply}>{busy?T('Adding…','מוסיפים…'):T('Add '+preview.newCount+' transactions','הוספת '+preview.newCount+' תנועות')}</Button><Button secondary disabled={busy} onClick={()=>setPreview(null)}>{T('Choose another file','בחירת קובץ אחר')}</Button></div>
  </div>}
  {error&&<p role="alert" className="ai-error">{error}</p>}
 </section></div>;
}
