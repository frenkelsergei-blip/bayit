// Settings › Accounts & connections › AI usage & credit (parents only; children and other adults never see cost).
// An ESTIMATE of Bayit's own AI use with any provider (Claude, OpenAI/Codex, Gemini, Grok, a custom endpoint): tokens
// the provider reported × the price in effect that day (Bayit's shipped list or the parent's own price). Each call keeps
// its own provider, model, cost and price version. A parent enters the prepaid credit per provider account; Bayit
// subtracts its own spend since then and estimates how long the rest lasts. The provider's billing page is the truth.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Coins,Sparkle,TelegramLogo,FileText,ShieldCheck,Wallet,DotsThree,ArrowSquareOut,Info,PencilSimple,Trash,Hourglass,CalendarBlank,ChartBar,Tag,Cpu,ClockCounterClockwise,Receipt} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {BarsChart,shortDate} from './statistics-charts';
import {DateField} from './date-field';
import {aiUsageSummary,addDays,formatUSD,formatRate,MIN_RUNWAY_DAYS,WINDOW_DAYS} from '../../shared/ai-usage.mjs';
import {aiCallPricing,resolvePrice,PRICES_CHECKED} from '../../shared/ai-pricing.mjs';
import {AI_PROVIDERS,providerName} from '../../shared/ai-providers.mjs';
import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
import './ai-usage.css';

const FEATURES={
 assistant:{icon:Sparkle,en:'Assistant in the app',he:'העוזר באפליקציה'},
 telegram:{icon:TelegramLogo,en:'Telegram chat',he:'שיחה בטלגרם'},
 document:{icon:FileText,en:'Document summaries',he:'סיכומי מסמכים'},
 insurance:{icon:ShieldCheck,en:'Insurance review',he:'בדיקת ביטוחים'},
 finance:{icon:Wallet,en:'Money tips',he:'טיפים לכסף'},
 providers:{icon:Receipt,en:'Who we pay',he:'למי משלמים'},
 recommendations:{icon:Sparkle,en:'Bayit AI recommendations',he:'המלצות בית AI'},
 other:{icon:DotsThree,en:'Other',he:'אחר'}
};

async function send(path,method,body){
 const response=await fetch(path,{method,headers:{...cloudHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let result;try{result=await response.json()}catch{throw Error('The server did not return a valid response.')}
 if(!response.ok)throw Object.assign(Error(result?.error||'Request failed.'),{status:response.status});
 return result;
}
const localToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE});
const billingUrls=Object.fromEntries(AI_PROVIDERS.map(p=>[p.id,p.billingUrl||null]));

// Example figures for the design preview (no household server): Claude for most of the family, OpenAI for one adult,
// and a custom model without a known price. Clearly labelled; never presented as real usage.
export function exampleUsage(members,today=localToday()){
 const adults=members.filter(m=>m.role!=='child').map(m=>m.id),kid=members.find(m=>m.role==='child')?.id,people=[...adults.slice(0,2),...(kid?[kid]:[])],rows=[],recent=[];
 const call=(day,memberId,feature,provider,model,calls,inputTokens,outputTokens)=>{const {costMicros}=aiCallPricing({provider,model,day,inputTokens,outputTokens});const unpriced=costMicros===null;rows.push({day,memberId,feature,provider,model,calls,inputTokens:inputTokens*calls,outputTokens:outputTokens*calls,cacheReadTokens:0,cacheWriteTokens:0,costMicros:unpriced?0:costMicros*calls,unpricedCalls:unpriced?calls:0});if(recent.length<12)recent.push({id:recent.length+1,ts:day+'T'+String(20-recent.length).padStart(2,'0')+':15:00Z',memberId,feature,provider,model,inputTokens,outputTokens,cacheReadTokens:0,cacheWriteTokens:0,costMicros,priceVersion:unpriced?null:'bayit:'+PRICES_CHECKED,ok:true})};
 for(let i=0;i<24;i++){const day=addDays(today,-i),wave=1+((i*7)%5)/4;
  call(day,people[0],i%3?'assistant':'telegram','anthropic','claude-haiku-5-5',3,Math.round(21000*wave),600);
  if(people[1])call(day,people[1],i%4?'assistant':'document','openai','gpt-5.4-mini',2,Math.round(18000*wave),700);
  if(people[2])call(day,people[2],'assistant','anthropic','claude-haiku-5-5',1,Math.round(16000*wave),400);
  if(i%7===3)call(day,people[0],'finance','custom','llama-4-scout',1,9000,800);
 }
 const sum=(provider,since)=>rows.filter(r=>r.provider===provider&&r.day>=since).reduce((t,r)=>({calls:t.calls+r.calls,costMicros:t.costMicros+r.costMicros,unpricedCalls:t.unpricedCalls+r.unpricedCalls}),{calls:0,costMicros:0,unpricedCalls:0});
 const credits=[{provider:'anthropic',amountMicros:100e6,since:addDays(today,-20)},{provider:'openai',amountMicros:20e6,since:addDays(today,-12)}];
 const models=[['anthropic','claude-haiku-5-5'],['openai','gpt-5.4-mini'],['custom','llama-4-scout']].map(([provider,model])=>{const p=resolvePrice({provider,model,day:today});const unpricedCalls=rows.filter(r=>r.model===model).reduce((n,r)=>n+r.unpricedCalls,0);return {provider,model,calls:rows.filter(r=>r.model===model).reduce((n,r)=>n+r.calls,0),unpricedCalls,firstUnpricedDay:unpricedCalls?addDays(today,-17):null,current:p?{source:p.source,version:p.version,...p.rates}:null,history:[],hint:null}});
 return {ready:true,example:true,...aiUsageSummary({rows,credits,sinceCredit:{anthropic:sum('anthropic',credits[0].since),openai:sum('openai',credits[1].since)},firstDay:addDays(today,-23),firstDays:{anthropic:addDays(today,-23),openai:addDays(today,-23),custom:addDays(today,-17)},currentProvider:'anthropic',today}),recent,models,pricesChecked:PRICES_CHECKED,provider:'anthropic',model:'claude-haiku-5-5',billingUrls};
}

export function AIUsageSection({a,Button,Avatar}){
 const T=a.T,cloud=!!a.cloud,locale=a.lang==='he'?'he-IL':'en-US',rtl=a.lang==='he';
 const [data,setData]=useState(null),[error,setError]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState(''),[saved,setSaved]=useState('');
 const [amount,setAmount]=useState(''),[since,setSince]=useState(localToday()),[priceFor,setPriceFor]=useState(null),run=useRef(0);
 const load=useCallback(async()=>{
  const n=++run.current;setError('');
  if(!cloud){setData(exampleUsage(a.members));return}
  try{const result=await send('/api/ai-usage','GET');if(n===run.current)setData(result)}catch{if(n===run.current)setError(T('AI usage could not be loaded. Try again.','לא הצלחנו לטעון את השימוש ב־AI. אפשר לנסות שוב.'))}
 },[cloud,a.data.householdId]);
 useEffect(()=>{load()},[load]);
 const money=micros=>formatUSD(micros),count=n=>Number(n||0).toLocaleString(locale),day=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',day:'numeric',month:'short',year:d.slice(0,4)===localToday().slice(0,4)?undefined:'numeric'}):'';
 const perM=formatRate;
 const pName=id=>id==='custom'?T('Custom endpoint','שירות מותאם'):providerName(id);
 // Saving needs the household server; a refusal (4xx) shows its reason, anything else keeps the entry for a retry.
 const save=async(work,ok)=>{if(busy)return;setBusy(true);setSaveError('');setSaved('');try{if(!cloud)throw Object.assign(Error(),{demo:true});await work();setSaved(ok)}catch(error){setSaveError(error.demo?T('Sign in to save. Nothing was saved.','כדי לשמור צריך להתחבר. דבר לא נשמר.'):error.status&&error.status<500?error.message:T('Saving was not confirmed. Your entry is kept; try again.','השמירה לא אושרה. מה שהזנתם נשמר כאן; אפשר לנסות שוב.'))}finally{setBusy(false)}};

 if(error)return <div className="ai-usage"><p role="alert" className="save-error">{error}</p><div><Button secondary onClick={load}>{T('Retry','ניסיון חוזר')}</Button></div></div>;
 if(!data)return <div className="ai-usage"><p className="ai-usage-muted" role="status">{T('Loading AI usage…','טוענים את השימוש ב־AI…')}</p></div>;
 if(!data.ready)return <div className="ai-usage"><p className="ai-usage-note"><Info size={20} aria-hidden="true"/><span>{T('Usage tracking starts after the installation owner applies the latest database update. AI keeps working meanwhile.','מדידת השימוש תתחיל אחרי שבעל ההתקנה יחיל את עדכון מסד הנתונים האחרון. בינתיים ה־AI ממשיך לעבוד.')}</span></p></div>;

 const current=data.provider,b=data.balance,others=(data.balances||[]).filter(x=>x.provider!==current),links=data.billingUrls||billingUrls;
 const name=id=>a.members.some(m=>m.id===id)?a.name(id):T('Former member','חבר/ה לשעבר');
 const span=days=>days<120?T('≈ '+count(days)+' days','≈ '+count(days)+' ימים'):days<730?T('≈ '+count(Math.round(days/30.4))+' months','≈ '+count(Math.round(days/30.4))+' חודשים'):T('≈ '+count(Math.round(days/365))+' years','≈ '+count(Math.round(days/365))+' שנים');
 const runway=!b?{value:'—',hint:current?T('Add your '+pName(current)+' credit to estimate','הוסיפו את היתרה ב־'+pName(current)+' כדי לחשב'):T('Connect an AI provider first','קודם מחברים ספק AI')}:b.remainingMicros<=0?{value:T('May be used up','ייתכן שנגמרה'),hint:T('Check the billing page','בדקו בדף החיוב'),warn:true}:!b.enoughData?{value:T('Not enough data yet','אין עדיין מספיק נתונים'),hint:T(b.trackedDays+' of '+MIN_RUNWAY_DAYS+' days recorded',b.trackedDays+' מתוך '+MIN_RUNWAY_DAYS+' ימים נמדדו'),word:true}:b.runwayDays===null?{value:T('No recent use','אין שימוש לאחרונה'),hint:T('Nothing spent in the last 30 days','לא הייתה הוצאה ב־30 הימים האחרונים'),word:true}:{value:span(b.runwayDays),hint:T('Until about '+day(b.runoutDay),'עד בערך '+day(b.runoutDay)),warn:b.runwayDays<14};
 const tiles=[
  {icon:Coins,label:b?T('Remaining · '+pName(b.provider),'נשאר · '+pName(b.provider)):T('Estimated remaining','יתרה משוערת'),value:b?money(Math.max(0,b.remainingMicros)):'—',hint:b?T('of '+money(b.amountMicros)+' on '+day(b.since),'מתוך '+money(b.amountMicros)+' ב־'+day(b.since)):T('No credit entered yet','עדיין לא הוזנה יתרה'),warn:b&&b.remainingMicros<=0},
  {icon:CalendarBlank,label:T('This month','החודש'),value:money(data.month.costMicros),hint:T(count(data.month.calls)+' AI requests',count(data.month.calls)+' בקשות AI')},
  {icon:ChartBar,label:T('Average per day','ממוצע ליום'),value:data.enoughData?money(data.averageDailyMicros):'—',hint:data.enoughData?T('Last '+data.trackedDays+' days','ב־'+data.trackedDays+' הימים האחרונים'):T('Needs '+MIN_RUNWAY_DAYS+' days of data','צריך '+MIN_RUNWAY_DAYS+' ימים של נתונים')},
  {icon:Hourglass,label:T('Runway','לכמה זמן תספיק'),...runway}
 ];
 // Phones get short numeric dates (25.10 / 10/25) so the axis labels never run together.
 const narrow=typeof window!=='undefined'&&window.innerWidth<=700;
 // The shared chart has whole-number axes, so small spend is drawn in US cents.
 const cents=Math.max(0,...data.daily.map(d=>d.costMicros))<1e6,rows=data.daily.map(d=>({date:d.date,spend:d.costMicros/(cents?1e4:1e6),calls:d.calls}));
 const roundIcon=Glyph=><span className="ai-usage-row-icon" aria-hidden="true"><Glyph size={20}/></span>;
 const meters=(list,key,label,icon)=>{const max=Math.max(1,...list.map(x=>x.costMicros));return <ul className="ai-usage-bars">{list.map(x=><li key={x[key]}>{icon(x)}<span className="ai-usage-row-name" dir="auto">{label(x)}</span><span className="ai-usage-meter" aria-hidden="true"><i style={{inlineSize:Math.max(x.costMicros?4:0,x.costMicros/max*100)+'%'}}/></span><b><bdi dir="ltr">{money(x.costMicros)}</bdi><small>{x.unpricedCalls?T(count(x.calls)+' req. · '+count(x.unpricedCalls)+' unpriced',count(x.calls)+' בקשות · '+count(x.unpricedCalls)+' ללא מחיר'):T(count(x.calls)+' req.',count(x.calls)+' בקשות')}</small></b></li>)}</ul>};
 const priceLabel=m=>!m.current?T('Price unknown · tokens only','מחיר לא ידוע · טוקנים בלבד'):m.current.source==='household'?T('Your price','המחיר שלכם'):T('Bayit’s price list','רשימת המחירים של Bayit');
 const saveCredit=e=>{e.preventDefault();save(async()=>{const result=await send('/api/ai-usage/credit','PUT',{provider:current,amountUsd:amount,since});if(result?.balance?.since!==since)throw Error('not confirmed');setData(result);setEditing(false)},T('Credit saved.','היתרה נשמרה.'))};
 const removeCredit=provider=>save(async()=>{const result=await send('/api/ai-usage/credit','DELETE',{provider});if(result.balances?.some(x=>x.provider===provider))throw Error('not confirmed');setData(result);setEditing(false)},T('Credit removed. Usage is still tracked.','היתרה הוסרה. השימוש עדיין נמדד.'));
 const savePrice=body=>save(async()=>{const result=await send('/api/ai-usage/prices','POST',body);setData(result);setPriceFor(null)},body.active===false?T('Your price is no longer used. New requests use Bayit’s list.','המחיר שלכם כבר לא בשימוש. בקשות חדשות משתמשות ברשימה של Bayit.'):body.priceUnpriced?T('Price saved, and earlier requests without a price now have a cost.','המחיר נשמר, ולבקשות קודמות בלי מחיר יש עכשיו עלות.'):T('Price saved. New requests use it.','המחיר נשמר. בקשות חדשות ישתמשו בו.'));

 return <div className="ai-usage">
  <p className="ai-usage-lead">{data.example&&<span className="ai-usage-example">{T('Example data','נתוני דוגמה')}</span>}{T('An estimate of Bayit’s own AI use only, with whichever provider and model each request used: the tokens the provider reported × the price in effect that day. Other apps or people using the same key are not included.','הערכה של השימוש של Bayit בלבד, בכל ספק ודגם שבהם נעשתה כל בקשה: הטוקנים שהספק דיווח כפול המחיר שהיה בתוקף באותו יום. אפליקציות או אנשים אחרים שמשתמשים באותו מפתח לא נכללים.')}</p>
  {data.example&&<p className="ai-usage-note"><Info size={20} aria-hidden="true"/><span>{T('This preview shows example figures. After signing in, parents see the household’s real usage here.','התצוגה הזו מציגה מספרי דוגמה. אחרי התחברות, ההורים רואים כאן את השימוש האמיתי של הבית.')}</span></p>}
  <div className="ai-usage-tiles">{tiles.map(t=>{const Glyph=t.icon;return <section key={t.label} className={'ai-usage-tile'+(t.warn?' warn':'')}><span className="ai-usage-tile-icon" aria-hidden="true"><Glyph size={22}/></span><div><h4>{t.label}</h4><strong className={t.word?'word':''}><bdi dir="auto">{t.value}</bdi></strong><small>{t.hint}</small></div></section>})}</div>
  <section className="ai-usage-block ai-usage-chart" aria-label={T('Spend per day, last 30 days','הוצאה ליום, 30 הימים האחרונים')}>
   <h4>{T('Spend per day','הוצאה ליום')}<small>{T('Last '+WINDOW_DAYS+' days · all providers · '+(cents?'US cents':'US$'),WINDOW_DAYS+' הימים האחרונים · כל הספקים · '+(cents?'סנטים':'דולרים'))}</small></h4>
   {data.window.calls?<BarsChart rows={rows} keys={[{id:'spend',color:'var(--stats-c1)',label:T('Spend','הוצאה')}]} rtl={rtl} height="var(--ai-usage-chart)" valueLabels={false} xTick={d=>narrow?new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',day:'numeric',month:'numeric'}):shortDate(d,locale)} yTick={v=>cents?v+'¢':'$'+v} tooltipLabel={d=>day(d)} tooltipValue={(v,_,p)=>[money(Math.round(v*(cents?1e4:1e6)))+' · '+T(count(p.payload.calls)+' requests',count(p.payload.calls)+' בקשות'),T('Spend','הוצאה')]}/>:<p className="ai-usage-muted">{T('No AI requests in the last 30 days.','לא היו בקשות AI ב־30 הימים האחרונים.')}</p>}
  </section>
  {data.window.calls>0&&<div className="ai-usage-split">
   {data.byProvider?.length>1&&<section className="ai-usage-block ai-usage-wide"><h4>{T('By provider','לפי ספק')}<small>{T('Last 30 days','30 הימים האחרונים')}</small></h4>{meters(data.byProvider,'provider',x=>pName(x.provider),()=>roundIcon(Cpu))}</section>}
   <section className="ai-usage-block"><h4>{T('By person','לפי אדם')}<small>{T('Last 30 days','30 הימים האחרונים')}</small></h4>{meters(data.byPerson,'memberId',x=>name(x.memberId),x=>Avatar&&a.members.some(m=>m.id===x.memberId)?<Avatar decorative who={x.memberId} size={36}/>:roundIcon(DotsThree))}</section>
   <section className="ai-usage-block"><h4>{T('By feature','לפי שימוש')}<small>{T('Last 30 days','30 הימים האחרונים')}</small></h4>{meters(data.byFeature,'feature',x=>(FEATURES[x.feature]||FEATURES.other)[a.lang==='he'?'he':'en'],x=>roundIcon((FEATURES[x.feature]||FEATURES.other).icon))}</section>
  </div>}

  <section className="ai-usage-block ai-usage-models"><h4>{T('Models & prices','דגמים ומחירים')}<small>{T('US$ per million tokens','דולר למיליון טוקנים')}</small></h4>
   <p className="ai-usage-small">{T('Each request keeps the provider, model and price it had that day, so switching models or a later price change never rewrites past spend. Bayit’s price list was checked on '+day(data.pricesChecked||PRICES_CHECKED)+' and is updated with app updates. For a model Bayit does not know, or when a provider changes its prices, enter your own price.','כל בקשה שומרת את הספק, הדגם והמחיר שהיו באותו יום, כך שהחלפת דגם או שינוי מחיר מאוחר יותר לא משנים הוצאה קודמת. רשימת המחירים של Bayit נבדקה ב־'+day(data.pricesChecked||PRICES_CHECKED)+' ומתעדכנת עם עדכוני האפליקציה. לדגם ש־Bayit לא מכיר, או כשספק משנה מחירים, אפשר להזין מחיר משלכם.')}</p>
   {data.models?.length?<ul className="ai-usage-model-list">{data.models.map(m=>{const key=m.provider+'|'+m.model,open=priceFor===key;return <li key={key} className={!m.current?'unknown':''}>
    <div className="ai-usage-model-row">
     <div className="ai-usage-model-name"><strong><bdi dir="ltr">{m.model}</bdi></strong><small>{pName(m.provider)}{m.provider===current&&m.model===data.model?' · '+T('in use now','בשימוש עכשיו'):''}{m.calls?' · '+T(count(m.calls)+' requests',count(m.calls)+' בקשות'):''}</small></div>
     <div className="ai-usage-model-price"><span className={'ai-usage-chip '+(m.current?m.current.source:'unknown')}><Tag size={15} aria-hidden="true"/>{priceLabel(m)}</span>{m.current&&<small>{T('In','נכנס')} <bdi dir="ltr">{perM(m.current.input)}</bdi> · {T('out','יוצא')} <bdi dir="ltr">{perM(m.current.output)}</bdi></small>}{m.unpricedCalls>0&&<small className="ai-usage-warn-text">{T(count(m.unpricedCalls)+' requests without a price',count(m.unpricedCalls)+' בקשות ללא מחיר')}</small>}</div>
     <Button secondary icon={m.current?.source==='household'?PencilSimple:Tag} aria-expanded={open} disabled={busy} onClick={()=>{setPriceFor(open?null:key);setSaveError('');setSaved('')}}>{m.current?.source==='household'?T('Change price','שינוי מחיר'):T('Set price','הגדרת מחיר')}</Button>
    </div>
    {open&&<PriceForm a={a} T={T} m={m} Button={Button} busy={busy} perM={perM} pName={pName} day={day} count={count} onCancel={()=>setPriceFor(null)} onSave={savePrice}/>}
   </li>})}</ul>:<p className="ai-usage-muted">{T('No AI requests yet.','עדיין אין בקשות AI.')}</p>}
  </section>

  <section className="ai-usage-block ai-usage-credit"><h4>{current?T('Your '+pName(current)+' credit','היתרה שלכם ב־'+pName(current)):T('Your credit','היתרה שלכם')}</h4>
   {links[current]&&<p><a className="ai-usage-link" href={links[current]} target="_blank" rel="noreferrer noopener">{T('Check the real balance on '+pName(current),'לבדיקת היתרה האמיתית ב־'+pName(current))}<ArrowSquareOut size={16} aria-hidden="true"/></a></p>}
   {!current?<p>{T('Connect an AI provider above to track its credit.','חברו ספק AI למעלה כדי לעקוב אחרי היתרה שלו.')}</p>:!editing?<div className="ai-usage-credit-row"><p>{b?T('You entered '+money(b.amountMicros)+' on '+day(b.since)+'. Bayit has spent about '+money(b.spentMicros)+' with '+pName(current)+' since then.','הזנתם '+money(b.amountMicros)+' ב־'+day(b.since)+'. מאז Bayit הוציא בערך '+money(b.spentMicros)+' ב־'+pName(current)+'.'):T('Enter the prepaid API credit shown on '+pName(current)+'’s billing page and the date you checked it. Bayit then estimates what is left and how long it will last.','הזינו את יתרת ה־API ששילמתם מראש כפי שמופיעה בדף החיוב של '+pName(current)+', ואת התאריך שבו בדקתם. Bayit יעריך כמה נשאר ולכמה זמן זה יספיק.')}</p>
    <Button secondary={!!b} icon={b?PencilSimple:Coins} onClick={()=>{setAmount(b?String(b.amountMicros/1e6):'');setSince(b?.since||localToday());setSaveError('');setSaved('');setEditing(true)}}>{b?T('Update credit','עדכון היתרה'):T('Add credit','הוספת יתרה')}</Button></div>
   :<form className="ai-usage-form" onSubmit={saveCredit}>
    <label>{T('Credit in US$','יתרה בדולרים')}<input type="text" inputMode="decimal" dir="ltr" autoComplete="off" required pattern="[0-9]+([.,][0-9]{1,2})?" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value.replace(/[^0-9.,]/g,''))}/></label>
    <label><span>{T('Checked on','נבדקה בתאריך')}</span><DateField value={since} max={localToday()} required disabled={busy} aria-label={T('Checked on','נבדקה בתאריך')} onChange={e=>setSince(e.target.value)}/></label>
    <div className="ai-usage-form-actions"><Button secondary disabled={busy} onClick={()=>{setEditing(false);setSaveError('')}}>{T('Cancel','ביטול')}</Button><button type="submit" className="button" disabled={busy||!amount}>{busy?T('Saving…','שומרים…'):T('Save credit','שמירת היתרה')}</button></div>
    {b&&cloud&&<div className="ai-usage-form-remove"><Button secondary icon={Trash} disabled={busy} onClick={()=>removeCredit(current)}>{T('Remove credit','הסרת היתרה')}</Button></div>}
   </form>}
   {saveError&&<p role="alert" className="save-error">{saveError}</p>}{saved&&<p role="status" className="ai-usage-saved">{saved}</p>}
   {others.length>0&&<ul className="ai-usage-other-credits">{others.map(o=><li key={o.provider}><span>{T('Earlier '+pName(o.provider)+' credit: '+money(o.amountMicros)+' on '+day(o.since)+' · about '+money(Math.max(0,o.remainingMicros))+' left','יתרה קודמת ב־'+pName(o.provider)+': '+money(o.amountMicros)+' ב־'+day(o.since)+' · נשארו בערך '+money(Math.max(0,o.remainingMicros)))}</span>{cloud&&<Button secondary icon={Trash} disabled={busy} aria-label={T('Remove '+pName(o.provider)+' credit','הסרת היתרה ב־'+pName(o.provider))} onClick={()=>removeCredit(o.provider)}>{T('Remove','הסרה')}</Button>}</li>)}</ul>}
   <p className="ai-usage-small">{T('Subscriptions such as ChatGPT (including Codex), Claude or Gemini apps are separate from API credit. Bayit only counts requests made with the API key connected here.','מינויים כמו ChatGPT (כולל Codex), ‏Claude או Gemini נפרדים מיתרת ה־API. ‏Bayit סופר רק בקשות שנעשו עם מפתח ה־API שמחובר כאן.')}</p>
  </section>

  {data.recent?.length>0&&<section className="ai-usage-block ai-usage-recent"><h4>{T('Recent requests','בקשות אחרונות')}<small>{T('Last '+data.recent.length,'ה־'+data.recent.length+' האחרונות')}</small></h4>
   <ul>{data.recent.map(r=>{const meta=FEATURES[r.feature]||FEATURES.other;return <li key={r.id}>
    {roundIcon(meta.icon)}
    <div className="ai-usage-recent-main"><strong dir="auto">{name(r.memberId)} · {a.lang==='he'?meta.he:meta.en}</strong><small><bdi dir="ltr">{r.model}</bdi> · {pName(r.provider)} · {new Date(r.ts).toLocaleString(locale,{timeZone:HOME_TIMEZONE,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}{!r.ok&&' · '+T('reply not used','התשובה לא נוצלה')}</small></div>
    <div className="ai-usage-recent-cost"><b>{r.costMicros===null?T('Price unknown','מחיר לא ידוע'):<bdi dir="ltr">{money(r.costMicros)}</bdi>}</b><small>{T('in','נכנס')} <bdi dir="ltr">{count(r.inputTokens+r.cacheReadTokens+r.cacheWriteTokens)}</bdi> · {T('out','יוצא')} <bdi dir="ltr">{count(r.outputTokens)}</bdi></small></div>
   </li>})}</ul>
  </section>}
  <p className="ai-usage-foot">{T('Requests that fail before the provider answers are not billed and not counted. A reply Bayit could not use is still counted, because the provider billed it.','בקשות שנכשלו לפני שהספק ענה אינן מחויבות ואינן נספרות. תשובה ש־Bayit לא יכול היה להשתמש בה עדיין נספרת, כי הספק חייב עליה.')}</p>
 </div>;
}

// A new version of the household's own price for one model. Prefilled from the price in effect, or the provider's
// listed price as a suggestion. Pricing earlier unpriced requests is an explicit choice; priced requests never change.
function PriceForm({a,T,m,Button,busy,perM,pName,day,count,onCancel,onSave}){
 const today=localToday(),base=m.current||{},fmt=v=>v===null||v===undefined?'':String(v);
 const [input,setInput]=useState(fmt(base.input)),[output,setOutput]=useState(fmt(base.output)),[cacheRead,setCacheRead]=useState(fmt(base.cacheRead)),[cacheWrite,setCacheWrite]=useState(fmt(base.cacheWrite));
 const [from,setFrom]=useState(m.firstUnpricedDay&&!m.current?m.firstUnpricedDay:today),[priceUnpriced,setPriceUnpriced]=useState(false);
 const num=v=>v.replace(/[^0-9.,]/g,''),field=(label,value,set,required)=><label>{label}<input type="text" inputMode="decimal" dir="ltr" autoComplete="off" required={required} pattern="[0-9]+([.,][0-9]+)?" value={value} disabled={busy} onChange={e=>set(num(e.target.value))}/></label>;
 const submit=e=>{e.preventDefault();onSave({provider:m.provider,model:m.model,input,output,cacheRead,cacheWrite,effectiveFrom:from,priceUnpriced})};
 return <form className="ai-usage-price-form" onSubmit={submit}>
  {m.hint&&<p className="ai-usage-small">{T(pName(m.provider)+' lists in '+perM(m.hint.input)+' · out '+perM(m.hint.output)+' for this model.',pName(m.provider)+' מציג לדגם הזה נכנס '+perM(m.hint.input)+' · יוצא '+perM(m.hint.output)+'.')} <button type="button" className="ai-usage-text-button" onClick={()=>{setInput(fmt(m.hint.input));setOutput(fmt(m.hint.output));setCacheRead(fmt(m.hint.cacheRead));setCacheWrite(fmt(m.hint.cacheWrite))}}>{T('Use these prices','להשתמש במחירים האלה')}</button></p>}
  <div className="ai-usage-price-fields">
   {field(T('Input','נכנס'),input,setInput,true)}{field(T('Output','יוצא'),output,setOutput,true)}
   {field(T('Cache read (optional)','קריאה מהמטמון (רשות)'),cacheRead,setCacheRead,false)}{field(T('Cache write (optional)','כתיבה למטמון (רשות)'),cacheWrite,setCacheWrite,false)}
   <label><span>{T('Applies from','בתוקף מ־')}</span><DateField value={from} max={today} required disabled={busy} aria-label={T('Applies from','בתוקף מ־')} onChange={e=>setFrom(e.target.value)}/></label>
  </div>
  {m.unpricedCalls>0&&<label className="ai-usage-check"><input type="checkbox" checked={priceUnpriced} disabled={busy} onChange={e=>setPriceUnpriced(e.target.checked)}/><span>{T('Also price the '+count(m.unpricedCalls)+' earlier requests without a price','לתמחר גם '+count(m.unpricedCalls)+' בקשות קודמות ללא מחיר')}</span></label>}
  {m.unpricedCalls>0&&<p className="ai-usage-small">{T('Only requests from '+day(from)+' that have no cost yet. Requests that already have a cost never change.','רק בקשות מ־'+day(from)+' שעדיין אין להן עלות. בקשות שכבר יש להן עלות לא משתנות לעולם.')}</p>}
  <div className="ai-usage-form-actions">
   {m.current?.source==='household'&&<Button secondary icon={Trash} disabled={busy} onClick={()=>onSave({provider:m.provider,model:m.model,effectiveFrom:today,active:false})}>{T('Stop using my price','הפסקת השימוש במחיר שלי')}</Button>}
   <Button secondary disabled={busy} onClick={onCancel}>{T('Cancel','ביטול')}</Button><button type="submit" className="button" disabled={busy||!input||!output}>{busy?T('Saving…','שומרים…'):T('Save price','שמירת המחיר')}</button>
  </div>
  {m.history?.length>0&&<details className="ai-usage-history"><summary><ClockCounterClockwise size={16} aria-hidden="true"/>{T('Price history','היסטוריית מחירים')}</summary><ul>{m.history.slice().reverse().map(h=><li key={h.id}>{day(h.effectiveFrom)} · {h.active?<>{T('in','נכנס')} <bdi dir="ltr">{perM(h.input)}</bdi> · {T('out','יוצא')} <bdi dir="ltr">{perM(h.output)}</bdi></>:T('back to Bayit’s list','חזרה לרשימה של Bayit')}{a.members.some(x=>x.id===h.createdBy)?' · '+a.name(h.createdBy):''}</li>)}</ul></details>}
 </form>;
}
