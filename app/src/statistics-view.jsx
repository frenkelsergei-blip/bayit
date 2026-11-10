import React,{useEffect,useRef,useState} from 'react';
import {statsFeature} from '../../shared/features.mjs';
import {CalendarDots,Stack,UsersThree,ChartPieSlice,CheckCircle,Star,ShoppingCart,Wallet,Cards} from '@phosphor-icons/react';
import {MultiFilter} from './multi-filter';
import {IssuerMark} from './payment-sources';
import {sourceName,sourceDigits} from '../../shared/payment-sources.mjs';
import {Select} from './Select';
import {anchor} from './data';
import {SHOPPING_CATEGORIES} from '../../shared/item-dictionary.mjs';
import {PeoplePicker} from './people-picker';
import {statisticsUsage,tasksModel,calendarModel,kidsModel,shoppingModel,periodWindow,previousWindow,trend,monthlySpending} from './statistics-data';
import {OverviewTab,TasksTab,CalendarTab,KidsTab,ShoppingTab} from './statistics-areas';
import {HouseholdMoneyStatistics,useStatisticsMoney,moneyModel} from './household-money-statistics.jsx';
import './statistics-layout.css';
// Statistics (user decision 2026-11-08, AGENTS.md "Statistics direction"): tabs by area — Overview, Tasks, Calendar,
// Kids, Shopping, Money — and only for areas this household uses. One aligned filter row (period · person · the
// tab's own filter · Family/Mine), the full-width tab strip, then the tab. Children never get Money and see only
// their own Kids progress. Routes: #statistics (Overview), #statistics/<tab>; the old #statistics/household opens Money.
const TABS=[['overview',ChartPieSlice,'Overview','סקירה'],['tasks',CheckCircle,'Tasks','משימות'],['calendar',CalendarDots,'Calendar','יומן'],['kids',Star,'Kids','ילדים'],['shopping',ShoppingCart,'Shopping','קניות'],['money',Wallet,'Money','כסף']];
// Phones get short period wording.
function useNarrow(){const query='(max-width:700px)',[narrow,setNarrow]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches);useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(query),on=()=>setNarrow(m.matches);m.addEventListener('change',on);return()=>m.removeEventListener('change',on)},[]);return narrow}

export function StatisticsView({app:a,ui}){
 const {Heading,Tabs,Scope,Avatar}=ui,narrow=useNarrow(),tabsRef=useRef(null);
 const isChild=a.member(a.user).role==='child',parent=!isChild,T=a.T,rtl=a.lang==='he',locale=rtl?'he-IL':'en-US',end=anchor;
 const [scope,setScope]=useState('family'),[person,setPerson]=useState('all'),[range,setRange]=useState('7'),[recordType,setRecordType]=useState('all'),[group,setGroup]=useState('all'),[source,setSource]=useState('all'),[sourceKeys,setSourceKeys]=useState([]);
 const remote=useStatisticsMoney(a,parent);
 // Features registry (2026-11-09): an area that is off for this person has no tab and no Overview card.
 const usage=Object.fromEntries(Object.entries(statisticsUsage({data:a.data,user:a.user,members:a.members,parent,money:remote.data})).map(([id,used])=>{const f=statsFeature(id);return [id,used&&(!f||!a.features||a.features.on(f))]}));
 const requested=(a.route.split('?')[0].split('/')[1]||'overview').replace(/^household$/,'money');
 const tabs=TABS.filter(([id])=>id==='overview'||usage[id]),tab=tabs.some(([id])=>id===requested)?requested:'overview';
 const kidsOnly=tab==='kids',personFilter=!(kidsOnly&&isChild)&&scope!=='private',people=kidsOnly?a.members.filter(m=>m.role==='child'):a.members;
 const who=personFilter&&people.some(m=>m.id===person)?person:'all';
 const base={data:a.data,user:a.user,scope,range,end,person:who,members:scope==='private'?a.members.filter(m=>m.id===a.user):a.members};
 const models={
  tasks:usage.tasks&&(tab==='overview'||tab==='tasks')?tasksModel({...base,recordType:tab==='tasks'?recordType:'all'}):null,
  calendar:usage.calendar&&(tab==='overview'||tab==='calendar')?calendarModel(base):null,
  kids:usage.kids&&(tab==='overview'||tab==='kids')?kidsModel({...base,members:a.members,viewerIsChild:isChild}):null,
  shopping:usage.shopping&&(tab==='overview'||tab==='shopping')?shoppingModel({...base,group:tab==='shopping'?group:'all'}):null,
 };
 if(usage.money&&tab==='overview'){const now=moneyModel(a,remote,{range,scope,person:who,end}),all=moneyModel(a,remote,{range:'all',scope,person:who,end}),oldest=all.rows.map(r=>String(r.date).slice(0,10)).sort()[0],w=periodWindow(range,end,oldest),prev=previousWindow(w,oldest),before=prev?moneyModel(a,remote,{range,scope,person:who,end:prev.end}).total:null;models.money={ready:remote.ready,total:now.total,trend:remote.ready?trend(now.total,before):null,months:monthlySpending(all.rows,end,6).map(m=>({date:m.month,total:Math.round(m.total/100)}))}}
 const ctx={a,T,rtl,locale,ui,scope,person:who,range,isChild,window:periodWindow(range,end)};
 // Cards and accounts for the Money filter (several at once), from the records this viewer may see in this sharing view.
 const sourceIndex=tab==='money'&&usage.money?moneyModel(a,remote,{range:'all',scope,end}).index:{list:[],byKey:new Map()};
 const go=id=>a.go(id==='overview'?'statistics':'statistics/'+id);
 // On phones the tab strip scrolls sideways: keep the chosen tab in view (same as the Household module tabs).
 useEffect(()=>{const reveal=()=>{const el=tabsRef.current?.querySelector('[aria-current=page]'),strip=el?.parentElement;if(!el||!strip||strip.scrollWidth<=strip.clientWidth+1)return;const s=strip.getBoundingClientRect(),r=el.getBoundingClientRect();if(r.left<s.left+4||r.right>s.right-4)strip.scrollBy({left:r.left<s.left+4?r.left-s.left-8:r.right-s.right+8,behavior:'auto'})};const f=requestAnimationFrame(()=>requestAnimationFrame(reveal)),t=setTimeout(reveal,400);return()=>{cancelAnimationFrame(f);clearTimeout(t)}},[tab]);
 const categoryLabel=key=>{const pair=SHOPPING_CATEGORIES.find(c=>c[0]===key);return pair?T(pair[0],pair[1]):key};
 const third=tab==='tasks'?<div className="stat-select-icon stat-records"><Stack size={22}/><Select aria-label={T('Statistics records','סוג הרשומות לסטטיסטיקה')} value={recordType} onChange={e=>setRecordType(e.target.value)}><option value="all">{T('All activities','כל הפעילויות')}</option><option value="routines">{narrow?T('Routines','שגרות'):T('Children’s routines','שגרות הילדים')}</option><option value="tasks">{T('Other tasks','משימות אחרות')}</option></Select></div>
  :tab==='shopping'&&models.shopping?<div className="stat-select-icon stat-records"><Stack size={22}/><Select aria-label={T('Shopping category','קטגוריית קניות')} value={group} onChange={e=>setGroup(e.target.value)}><option value="all">{T('All purchases','כל הקניות')}</option>{models.shopping.groups.map(g=><option key={g} value={g}>{categoryLabel(g)}</option>)}</Select></div>
  :tab==='money'?<div className="stat-select-icon stat-records stat-sources"><Cards size={22}/><MultiFilter T={T} label={T('Cards & accounts','כרטיסים וחשבונות')} allLabel={T('All cards & accounts','כל הכרטיסים והחשבונות')} value={sourceKeys.filter(k=>sourceIndex.byKey.has(k))} onChange={setSourceKeys} options={sourceIndex.list.map(s=>{const text=sourceName(s,a.lang)+(s.last4?' '+sourceDigits(s):'')+' · '+(s.kind==='manual'?a.name(s.ownerId):s.shared||!s.ownerId?T('Shared','משותף'):a.name(s.ownerId));return {id:s.key,label:text,content:<span className="source-option"><IssuerMark source={s} size={22}/><span dir="auto">{text}</span></span>}})}/></div>:null;
 return <div className={'statistics-reference statistics-'+tab}><Heading title={T('Every little step adds up.','כל צעד קטן מצטבר.')} subtitle={T('Statistics · '+(!a.data.householdId||a.data.householdId==='demo'?'Sample data':'Saved records'),'סטטיסטיקה · '+(!a.data.householdId||a.data.householdId==='demo'?'מידע לדוגמה':'הרישומים שלכם'))}/>
  <div className={'statistics-filter-grid'+(personFilter?'':' no-person')+(third?'':' no-third')+(kidsOnly?' no-scope':'')}>
   <div className="stat-select-icon stat-period"><CalendarDots size={22}/><Select aria-label={T('Statistics period','תקופת הסטטיסטיקה')} value={range} onChange={e=>setRange(e.target.value)}>{(narrow?[['7','7 days','7 ימים'],['30','30 days','30 ימים'],['all','All time','כל הזמן']]:[['7','Last 7 days','7 ימים אחרונים'],['30','Last 30 days','30 ימים אחרונים'],['all','All history','כל ההיסטוריה']]).map(([v,en,he])=><option key={v} value={v}>{T(en,he)}</option>)}</Select></div>
   {personFilter&&<div className="statistics-person"><UsersThree className="statistics-person-icon" size={20} aria-hidden="true"/><PeoplePicker value={who} onChange={setPerson} people={people.map(m=>m.id)} allLabel={kidsOnly?T('All kids','כל הילדים'):T('All family','כל המשפחה')} title={T('Whose statistics','הסטטיסטיקה של')} T={T} Avatar={Avatar} name={a.name} member={a.member}/></div>}
   {third}
   {!kidsOnly&&<div className="statistics-scope"><Scope value={scope} onChange={v=>{setScope(v);setPerson('all')}}/></div>}
  </div>
  <div className="statistics-mode-tabs" ref={tabsRef}><Tabs variant="section" label={T('Statistics areas','אזורי הסטטיסטיקה')} value={tab} onChange={go} items={tabs.map(([id,Glyph,en,he])=>[id,T(en,he),Glyph])}/></div>
  {tab==='overview'?<OverviewTab c={ctx} usage={usage} m={models} open={go}/>
   :tab==='tasks'?<TasksTab c={ctx} m={models}/>
   :tab==='calendar'?<CalendarTab c={ctx} m={models}/>
   :tab==='kids'?<KidsTab c={ctx} m={models}/>
   :tab==='shopping'?<ShoppingTab c={ctx} m={models}/>
   :<HouseholdMoneyStatistics a={a} range={range} scope={scope} person={who} source={source} sourceKeys={sourceKeys.filter(k=>sourceIndex.byKey.has(k))} end={end} Button={ui.Button} Avatar={Avatar} remote={remote}/>}
 </div>;
}
