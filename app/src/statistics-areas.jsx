// The Statistics area tabs (user decision 2026-11-08). Each tab gets its model from statistics-data.js (built in
// statistics-view.jsx) and draws it with the shared parts in statistics-charts.jsx and statistics-summary.jsx.
import React,{useState} from 'react';
import {CheckCircle,CalendarDots,Star,ShoppingCart,Wallet,Target,ChartBar,Crown,PencilSimple,ArrowRight,Fire,Clock,Lightning,Sparkle,Trophy,Basket,Receipt} from '@phosphor-icons/react';
import {StatisticsSummary,StatisticsFooter,downloadCSV,DownloadSimple} from './statistics-summary';
import {AreaCard,ChartCard,PeopleLegend,BarsChart,LinesChart,PersonBars,HeatGrid,RankRows,Donut,SERIES,LINES,shortDate,bucketTick,Trend} from './statistics-charts';
import {SHOPPING_CATEGORIES} from '../../shared/item-dictionary.mjs';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {NoteWindow} from './note-window';
import {FormSection} from './form-section';
import {moneyFormat} from './household-money-statistics.jsx';

const WEEKDAYS_EN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],WEEKDAYS_HE=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const SHORT_EN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],SHORT_HE=['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
export const count=(T,n,en1,enN,he1,heN)=>T(n+' '+(n===1?en1:enN),n===1?he1:n+' '+heN);
const periodText=(T,w)=>w.range==='all'?T('in all history','בכל ההיסטוריה'):T('in the last '+w.days+' days','ב־'+w.days+' הימים האחרונים');
// The day axis title (a week of single days) or the date axis title (longer periods).
const dayAxis=(T,rows)=>rows.length<=7&&rows.every(r=>r.date===r.endDate)?T('Day of the week','יום בשבוע'):T('Date','תאריך');
const tooltipDate=(rows,locale)=>v=>{const b=rows.find(r=>r.date===v);return shortDate(v,locale)+(b&&b.endDate!==v?' – '+shortDate(b.endDate,locale):'')};
const personSeries=(ids,name)=>ids.map((id,i)=>({id,color:SERIES[i%SERIES.length],label:name(id)}));

// ---------- Overview ----------
export function OverviewTab({c,usage,m,open}){
 const {a,T,rtl,locale,ui:{Avatar}}=c,days=c.window.days;
 const kidsFaces=m.kids&&<div className="stats-area-faces">{m.kids.kids.map(k=><span key={k.id}><Avatar decorative who={k.id} size={28}/>{a.name(k.id)}</span>)}</div>;
 const cards=[
  usage.tasks&&m.tasks&&<AreaCard key="tasks" icon={CheckCircle} tone="green" title={T('Tasks','משימות')} value={m.tasks.count} label={T('tasks and routines completed','משימות ושגרות הושלמו')} trend={m.tasks.trend} days={days} mini={{rows:m.tasks.bars,unit:T('Tasks','משימות'),xTick:bucketTick(m.tasks.bars,locale),label:T('Completed per day','הושלמו בכל יום')}} onOpen={()=>open('tasks')} T={T} rtl={rtl}/>,
  usage.calendar&&m.calendar&&<AreaCard key="calendar" icon={CalendarDots} tone="lilac" title={T('Calendar','יומן')} value={m.calendar.count} label={T('events','אירועים')+' '+periodText(T,m.calendar.window)} trend={m.calendar.trend} days={days} mini={{rows:m.calendar.bars,unit:T('Events','אירועים'),xTick:bucketTick(m.calendar.bars,locale),label:T('Events per day','אירועים בכל יום')}} onOpen={()=>open('calendar')} T={T} rtl={rtl}/>,
  usage.kids&&m.kids&&<AreaCard key="kids" icon={Star} tone="yellow" title={T('Kids','ילדים')} value={m.kids.periodXp+' XP'} label={c.isChild?T('you earned','צברת'):T('earned by the kids','צברו הילדים')} trend={m.kids.trend} days={days} mini={{rows:m.kids.series.map((s,i)=>({...s,total:m.kids.spark[i]})),unit:'XP',xTick:bucketTick(m.kids.series,locale),label:T('XP per day','נקודות בכל יום')}} onOpen={()=>open('kids')} T={T} rtl={rtl}>{kidsFaces}</AreaCard>,
  usage.shopping&&m.shopping&&<AreaCard key="shopping" icon={ShoppingCart} tone="peach" title={T('Shopping','קניות')} value={m.shopping.trips} label={count(T,m.shopping.trips,'shopping trip','shopping trips','סבב קניות אחד','סבבי קניות')+' · '+count(T,m.shopping.count,'item','items','פריט אחד','פריטים')} trend={m.shopping.trend} days={days} mini={{rows:m.shopping.bars,unit:T('Items','פריטים'),xTick:bucketTick(m.shopping.bars,locale),label:T('Items per day','פריטים בכל יום')}} onOpen={()=>open('shopping')} T={T} rtl={rtl}/>,
  usage.money&&m.money&&<AreaCard key="money" icon={Wallet} tone="blue" title={T('Money','כסף')} value={m.money.ready?moneyFormat(a,m.money.total,0):'—'} label={m.money.ready?T('recorded expenses','הוצאות שתועדו'):T('Loading…','טוענים…')} trend={m.money.trend} upIsGood={false} days={days} mini={m.money.ready&&m.money.months.some(x=>x.total)?{rows:m.money.months,unit:'₪',xTick:v=>new Date(v+'-15T12:00:00Z').toLocaleDateString(locale,{month:'short'}),label:T('Spending per month','הוצאות בכל חודש')}:null} onOpen={()=>open('money')} T={T} rtl={rtl}/>,
 ].filter(Boolean);
 const t=m.tasks,best=t?.byPerson.slice().sort((x,y)=>y.count-x.count)[0];
 const highlights=[
  t?.longestStreak?.streak>0&&{icon:Fire,label:T('Longest streak','הרצף הארוך'),who:t.longestStreak.id,value:count(T,t.longestStreak.streak,'day','days','יום אחד','ימים')},
  best?.count>0&&{icon:Trophy,label:T('Most completed','השלימו הכי הרבה'),who:best.id,value:count(T,best.count,'task','tasks','משימה אחת','משימות')},
  m.calendar?.busiest!=null&&{icon:CalendarDots,label:T('Busiest day','היום העמוס'),value:(rtl?'יום ':'')+(rtl?WEEKDAYS_HE:WEEKDAYS_EN)[m.calendar.busiest]},
  t&&{icon:Clock,label:T('Overdue now','באיחור כרגע'),value:count(T,t.overdue.length,'task','tasks','משימה אחת','משימות')},
 ].filter(Boolean);
 if(!cards.length)return <c.ui.Empty text={T('Statistics appear here once the family starts using Bayit: tasks, events, shopping and more.','הסטטיסטיקה תופיע כאן כשהמשפחה תתחיל להשתמש בבית: משימות, אירועים, קניות ועוד.')}/>;
 return <>
  <div className="stats-area-grid">{cards}{highlights.length>0&&<section className="stats-area-card tone-cream stats-highlights"><header><span className="summary-symbol" aria-hidden="true"><Sparkle size={24}/></span><h2>{T('Highlights','רגעים בולטים')}</h2></header><ul>{highlights.map(h=><li key={h.label}><h.icon size={20} aria-hidden="true"/><span>{h.label}</span>{h.who&&<Avatar decorative who={h.who} size={28}/>}<b>{h.who?a.name(h.who)+' · ':''}<bdi>{h.value}</bdi></b></li>)}</ul></section>}</div>
  {t&&t.count>0&&<ChartCard title={T('The period by person','התקופה לפי בני המשפחה')} note={<><b>{t.count}</b> {T('tasks completed ','משימות הושלמו ')}{periodText(T,t.window)}</>} legend={<PeopleLegend items={personSeries(t.people,a.name).map(s=>({...s,total:t.byPerson.find(p=>p.id===s.id)?.count||0}))} Avatar={Avatar} name={a.name}/>}>
   <BarsChart rtl={rtl} rows={t.bars} keys={personSeries(t.people,a.name)} xTick={bucketTick(t.bars,locale)} yLabel={T('Tasks completed','משימות שהושלמו')} xLabel={dayAxis(T,t.bars)} tooltipLabel={tooltipDate(t.bars,locale)}/>
  </ChartCard>}
 </>;
}

// ---------- Tasks & routines ----------
export function TasksTab({c,m}){
 const {a,T,rtl,locale,ui:{Avatar,Badge,Icon,Switch,Empty,Button},scope,person,range}=c,t=m.tasks;
 const [allHistory,setAllHistory]=useState(false),[goalsOpen,setGoalsOpen]=useState(false),[draftGoals,setDraftGoals]=useState({});
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,draftGoals,{enabled:goalsOpen,key:goalsOpen?'goals':null});
 const parent=!c.isChild,privateScope=scope==='private',people=privateScope?a.members.filter(x=>x.id===a.user):a.members;
 const goals=Object.fromEntries(people.map(p=>[p.id,privateScope?(a.data.preferences.privateGoals?.[a.user]||10):(a.data.preferences.goals?.[p.id]||(p.role==='child'?20:15))]));
 const factor=t.window.days/7,periodGoals=Object.fromEntries(Object.entries(goals).map(([id,n])=>[id,Math.round(n*factor)]));
 const periodGoal=Math.round((person==='all'?Object.values(goals).reduce((n,v)=>n+Number(v),0):goals[person]||10)*factor);
 const rank=new Map(t.byPerson.map(p=>[p.id,p])),memberRows=people.filter(p=>person==='all'||p.id===person).sort((x,y)=>Number(y.role==='child')-Number(x.role==='child')||(rank.get(y.id)?.count||0)-(rank.get(x.id)?.count||0));
 const xpRank=t.byPerson.filter(p=>p.xp>0&&(privateScope||a.data.profiles[p.id]?.participateChallenge!==false)).sort((x,y)=>y.xp-x.xp);
 const challenge=a.data.preferences.familyChallenge!==false,scopeNote=privateScope?T('(private)','(פרטי)'):T('(shared)','(משותף)');
 const history=t.records.slice().sort((x,y)=>y.date.localeCompare(x.date)||(y.time||'').localeCompare(x.time||''));
 const exportCSV=()=>downloadCSV('bayit-tasks-'+scope+'.csv',['date','title','memberId','time','visibility'],t.records,(r,k)=>k==='memberId'?a.name(r[k]):k==='title'?a.text(r):r[k]);
 const series=personSeries(t.people,a.name),streaks=t.byPerson.filter(p=>p.streak>0||person!=='all').sort((x,y)=>y.streak-x.streak);
 return <>
  <StatisticsSummary rtl={rtl} items={[{icon:CheckCircle,label:T('Completed','הושלמו'),value:t.count,hint:t.trend?null:periodText(T,t.window),trend:<Trend pill t={t.trend} T={T} days={t.window.days}/>,viz:{kind:'bars',values:t.bars.map(b=>b.total)}},{icon:Target,label:T('Goal progress','עמידה ביעד'),value:Math.round(t.count/Math.max(1,periodGoal)*100)+'%',accent:true,hint:T('Goal: ','יעד: ')+periodGoal},{icon:Fire,label:T('Longest streak','רצף ארוך'),value:t.longestStreak.streak||'—',hint:t.longestStreak.streak?count(T,t.longestStreak.streak,'day','days','יום','ימים')+' · '+a.name(t.longestStreak.id):T('No streak yet','עוד אין רצף'),viz:t.longestStreak.streak?{kind:'dots',values:Array.from({length:7},(_,i)=>i>=7-Math.min(7,t.longestStreak.streak))}:null},{icon:Clock,label:T('Overdue now','באיחור כרגע'),value:t.overdue.length,hint:t.overdue.length?T('Open tasks from earlier days','משימות פתוחות מימים קודמים'):T('All on time','הכל בזמן')}]}/>
  <ChartCard title={T('Completed per day, by person','השלמות לפי יום ובן משפחה')} note={<><b>{t.count}</b> {T('of '+periodGoal+' (goal) ','מתוך '+periodGoal+' (היעד) ')}{periodText(T,t.window)}</>} legend={series.length>1&&<PeopleLegend items={series.map(s=>({...s,total:rank.get(s.id)?.count||0}))} Avatar={Avatar} name={a.name}/>} footer={(t.longestStreak.streak?T('Longest streak: ','רצף ארוך: ')+count(T,t.longestStreak.streak,'day','days','יום אחד','ימים')+' ('+a.name(t.longestStreak.id)+')':T('No streak yet','עוד אין רצף'))+' · '+T('Overdue now: ','באיחור כרגע: ')+t.overdue.length}>
   {t.count?<BarsChart rtl={rtl} rows={t.bars} keys={series} xTick={bucketTick(t.bars,locale)} yLabel={T('Tasks completed','משימות שהושלמו')} xLabel={dayAxis(T,t.bars)} tooltipLabel={tooltipDate(t.bars,locale)}/>:<Empty text={T('Nothing completed in this period yet.','עוד לא הושלם דבר בתקופה הזאת.')}/>}
  </ChartCard>
  {streaks.length>0&&<ChartCard title={T('Our streaks','הרצפים שלנו')} note={T('Days in a row with at least one completed task.','ימים ברצף עם לפחות משימה אחת שהושלמה.')}><div className="stats-streaks">{streaks.map((p,i)=><div key={p.id} className={'stats-streak'+(i===0&&p.streak>0?' best':'')}><Avatar decorative who={p.id} size={44}/><span><strong>{a.name(p.id)}</strong><small>{p.streak?count(T,p.streak,'day in a row','days in a row','יום אחד ברצף','ימים ברצף'):T('No streak right now','אין רצף כרגע')}</small></span></div>)}</div></ChartCard>}
  <div className="statistics-progress-grid"><section className="statistics-member-progress"><div className="section-title"><div><h2>{T('Member progress','התקדמות בני המשפחה')}</h2><p>{periodText(T,t.window)}</p></div><Button quiet icon={PencilSimple} onClick={()=>{setDraftGoals({...goals});setGoalsOpen(true)}}>{T('Edit goals','עריכת יעדים')}</Button></div>
   {memberRows.map(p=>{const n=rank.get(p.id)?.count||0,g=periodGoals[p.id]||1;return <div className="statistics-member-row" key={p.id}><Avatar who={p.id} size={44}/><strong>{a.name(p.id)}</strong><span className="statistics-member-bar"><span dir="ltr">{n} / {periodGoals[p.id]}</span><progress value={n} max={g} aria-label={a.name(p.id)+' '+n+' / '+periodGoals[p.id]}/></span><Badge color="green">{Math.round(n/g*100)}%</Badge></div>})}
   <div className="statistics-progress-total"><span>{privateScope?T('Total (private tasks)','סה״כ (משימות פרטיות)'):T('Total (shared tasks)','סה״כ (משימות משותפות)')}</span><strong dir="ltr">{t.count} / {periodGoal}</strong></div></section>
  <aside className="statistics-family-challenge"><div className="section-title"><h2>{privateScope?T('My personal progress','ההתקדמות האישית שלי'):T('Family challenge','אתגר משפחתי')}</h2>{!privateScope&&<button type="button" className="challenge-state" aria-label={(challenge?T('Enabled','מופעל'):T('Off','כבוי'))+' · '+T('Family challenge','אתגר משפחתי')} aria-pressed={challenge} disabled={!parent} title={parent?undefined:T('A parent can turn the challenge on or off.','הורה יכול להפעיל או לכבות את האתגר.')} onClick={()=>a.update(d=>{d.preferences.familyChallenge=!challenge})}><Badge color={challenge?'green':'lilac'} icon={challenge?CheckCircle:undefined}>{challenge?T('Enabled','מופעל'):T('Off','כבוי')}</Badge></button>}</div>
   {privateScope||challenge?<><p className="statistics-challenge-lead"><strong>{privateScope?T('XP for your private tasks','נקודות למשימות הפרטיות שלכם'):T('XP for shared tasks','נקודות למשימות משותפות')}</strong><small>{T('From completed activities in this period','מתוך פעילויות שהושלמו בתקופה הזו')}</small></p>{xpRank.map((r,i)=><div className="statistics-challenge-row" key={r.id}><Crown className={'rank-crown rank-'+i} size={24} weight="duotone" aria-hidden="true"/><Avatar who={r.id} size={44}/><strong>{a.name(r.id)}</strong><Badge color="lilac"><bdi dir="ltr">{r.xp} XP</bdi></Badge></div>)}{!xpRank.length&&<p className="statistics-challenge-lead"><small>{T('No XP in this period yet.','עוד אין נקודות בתקופה הזאת.')}</small></p>}{!privateScope&&<details className="challenge-preferences"><summary>{T('Challenge preferences','העדפות האתגר')}</summary><Switch label={T('Include me in the ranking','לכלול אותי בדירוג')} checked={a.data.profiles[a.user]?.participateChallenge!==false} onChange={v=>a.update(d=>{d.profiles[a.user].participateChallenge=v})}/></details>}</>:<p className="statistics-challenge-lead">{T('The challenge is paused. Your progress is still saved.','האתגר כבוי. ההתקדמות שלכם עדיין נשמרת.')}</p>}</aside></div>
  <div className="stats-grid two">
   <ChartCard title={<>{T('Task ranking','המשימות המובילות')} <span>{scopeNote}</span></>} note={T('Most completed in this period','הושלמו הכי הרבה בתקופה')}>{t.ranking.length?<RankRows rows={t.ranking} Icon={Icon} label={r=>a.text(r.records[0])}/>:<Empty text={T('Complete an activity to start the ranking.','השלימו פעילות כדי להתחיל את הדירוג.')}/>}</ChartCard>
   <ChartCard title={T('Overdue now','באיחור כרגע')} note={T('Open one-time tasks from earlier days','משימות חד־פעמיות פתוחות מימים קודמים')}>{t.overdue.length?<div className="stats-list">{t.overdue.slice(0,6).map(o=><button type="button" className="stats-list-row" key={o.id} onClick={()=>a.go('tasks?task='+o.id+'&date='+o.date)}><Icon code={o.icon||'1F4CB'} size={32}/><strong>{a.text(o)}</strong><span>{o.memberId?a.name(o.memberId)+' · ':''}<bdi>{shortDate(o.date,locale)}</bdi></span></button>)}</div>:<p className="stats-good-news"><CheckCircle size={22} aria-hidden="true"/>{T('Nothing is overdue.','אין משימות באיחור.')}</p>}</ChartCard>
  </div>
  <section className="statistics-history"><div className="section-title"><h2>{T('Activity history','היסטוריית הפעילות')} <span>{scopeNote}</span></h2>{history.length>4&&<button type="button" className="text-link" onClick={()=>setAllHistory(!allHistory)}>{allHistory?T('Show less','הצגת פחות'):T('View all ('+history.length+')','הצגת הכל ('+history.length+')')}<ArrowRight size={18} aria-hidden="true"/></button>}</div>
   {history.length?<div className="data-table"><table><thead><tr><th>{T('Date','תאריך')}</th><th>{T('Person','בן משפחה')}</th><th>{T('Task','משימה')}</th><th>{T('Completion time','שעת השלמה')}</th></tr></thead><tbody>{history.slice(0,allHistory?undefined:4).map(r=><tr key={r.id}><td className="history-date">{new Date(r.date+'T12:00:00Z').toLocaleDateString(locale,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</td><td className="history-person"><Avatar decorative who={r.memberId||r.ownerId} size={32}/><span>{a.name(r.memberId||r.ownerId)}</span></td><td className="history-item"><Icon code={r.icon||'1F4CB'} size={30}/><span>{a.text(r)}</span></td><td className="history-time"><bdi dir="ltr">{r.time||'—'}</bdi></td></tr>)}</tbody></table></div>:<Empty text={T('Complete an activity to start your history.','השלימו פעילות כדי להתחיל את ההיסטוריה.')}/>}
  </section>
  <StatisticsFooter lines={[T('Completion times are recorded when members mark Done.','שעת ההשלמה נרשמת כשבני המשפחה מסמנים שסיימו.'),T('Private tasks stay in their owner’s personal statistics.','משימות פרטיות נשארות בסטטיסטיקה האישית של בעליהן.')]}><Button secondary icon={DownloadSimple} disabled={!t.records.length} onClick={exportCSV}>{T('Export CSV','ייצוא CSV')}</Button></StatisticsFooter>
  {goalsOpen&&<NoteWindow a={a} className="statistics-goals-window" title={T('Edit goals','עריכת יעדים')} saving={saving} error={saveError} saveLabel={T('Save goals','שמירת יעדים')} saveDisabled={people.some(p=>!(Number(draftGoals[p.id])>=1&&Number(draftGoals[p.id])<=500))} onClose={()=>!saving&&guard(()=>setGoalsOpen(false))} onSave={()=>commit(()=>a.update(d=>{if(privateScope)d.preferences.privateGoals={...d.preferences.privateGoals,[a.user]:Math.max(1,draftGoals[a.user]||1)};else d.preferences.goals={...d.preferences.goals,...Object.fromEntries(Object.entries(draftGoals).filter(([k])=>parent||k===a.user).map(([k,v])=>[k,Math.max(1,Math.min(500,Number(v)||1))]))}}),()=>setGoalsOpen(false))}>
   <FormSection T={T} icon={Target} tone="green" title={privateScope?T('My weekly goal','היעד השבועי שלי'):T('Weekly goals','יעדים שבועיים')} note={T('Completed activities per week, scaled to the selected period.','פעילויות שהושלמו בשבוע, מותאם לאורך התקופה שנבחרה.')}>
    <div className="statistics-goal-fields">{people.map(p=><label key={p.id} className="statistics-goal-field"><Avatar decorative who={p.id} size={36}/><span>{a.name(p.id)}</span><input aria-label={a.name(p.id)+' '+T('weekly goal','יעד שבועי')} disabled={!parent&&p.id!==a.user} type="number" inputMode="numeric" min="1" max="500" value={draftGoals[p.id]??10} onChange={e=>setDraftGoals({...draftGoals,[p.id]:e.target.value===''?'':+e.target.value})}/></label>)}</div>
    {!parent&&!privateScope&&<p className="statistics-goal-hint">{T('A parent sets the other family members’ goals.','הורה קובע את היעדים של שאר בני המשפחה.')}</p>}
   </FormSection>
  </NoteWindow>}
 </>;
}

// ---------- Calendar ----------
export function CalendarTab({c,m}){
 const {a,T,rtl,locale,ui:{Avatar,Empty,Button}}=c,cal=m.calendar;
 if(!cal)return <Empty text={T('No events for this filter.','אין אירועים לסינון הזה.')}/>;
 const names=rtl?WEEKDAYS_HE:WEEKDAYS_EN,shortNames=rtl?SHORT_HE:SHORT_EN;
 return <>
  <StatisticsSummary rtl={rtl} items={[{icon:CalendarDots,label:T('Events','אירועים'),value:cal.count,hint:periodText(T,cal.window),trend:<Trend pill t={cal.trend} T={T} days={cal.window.days}/>,viz:{kind:'bars',values:cal.bars.map(b=>b.total)}},{icon:Lightning,label:T('Busiest day','היום העמוס'),value:cal.busiest==null?'—':names[cal.busiest],word:true,hint:cal.busiest==null?T('No events in this period','אין אירועים בתקופה'):T('Sunday to Saturday','ראשון עד שבת'),viz:cal.busiest==null?null:{kind:'bars',values:cal.heat.map(h=>h.slots.reduce((n,x)=>n+x.count,0)+h.allDay),highlight:cal.busiest}},{icon:Clock,label:T('Next 7 days','7 הימים הבאים'),value:cal.aheadTotal,hint:count(T,cal.aheadTotal,'event coming up','events coming up','אירוע אחד בדרך','אירועים בדרך'),viz:{kind:'bars',values:cal.ahead.map(d=>d.count),highlight:0}}]}/>
  <div className="stats-grid two">
   <ChartCard title={T('When the family is busy','מתי המשפחה עסוקה')} note={T('Events by weekday and time of day','אירועים לפי יום בשבוע ושעה ביום')} footer={cal.busiest==null?null:T('Busiest day: ','היום העמוס: ')+names[cal.busiest]+' · '+T('Next 7 days: ','7 הימים הבאים: ')+count(T,cal.aheadTotal,'event','events','אירוע אחד','אירועים')}>{cal.count?<HeatGrid heat={cal.heat} T={T} weekdayNames={shortNames}/>:<Empty text={T('No events in this period.','אין אירועים בתקופה הזאת.')}/>}</ChartCard>
   <ChartCard title={T('Events per person','אירועים לכל בן משפחה')} note={periodText(T,cal.window)}>{cal.people.some(p=>p.count)?<PersonBars rows={cal.people} Avatar={Avatar} name={a.name}/>:<Empty text={T('No events with people in this period.','אין אירועים עם אנשים בתקופה הזאת.')}/>}</ChartCard>
  </div>
  <div className="stats-grid two">
   <ChartCard title={T('Events per day','אירועים בכל יום')} note={periodText(T,cal.window)}>{cal.count?<BarsChart rtl={rtl} rows={cal.bars} keys={[{id:'total',color:'var(--stats-c1)',label:T('Events','אירועים')}]} xTick={bucketTick(cal.bars,locale)} yLabel={T('Events','אירועים')} xLabel={dayAxis(T,cal.bars)} tooltipLabel={tooltipDate(cal.bars,locale)}/>:<Empty text={T('No events in this period.','אין אירועים בתקופה הזאת.')}/>}</ChartCard>
   <ChartCard title={T('The week ahead','השבוע הבא')} note={T('Events in the next 7 days','אירועים ב־7 הימים הבאים')}>{cal.aheadTotal?<BarsChart rtl={rtl} rows={cal.ahead.map(d=>({...d,endDate:d.date}))} keys={[{id:'count',color:'var(--stats-c2)',label:T('Events','אירועים')}]} xTick={v=>new Date(v+'T12:00:00Z').toLocaleDateString(locale,{weekday:'short'})} yLabel={T('Events','אירועים')} tooltipLabel={v=>shortDate(v,locale)}/>:<Empty text={T('Nothing planned for the next 7 days.','אין תוכניות ל־7 הימים הבאים.')}/>}</ChartCard>
  </div>
  <StatisticsFooter lines={[T('Repeating events count on every day they happen.','אירועים חוזרים נספרים בכל יום שהם מתקיימים.'),T('Private events stay in their owner’s Mine view.','אירועים פרטיים נשארים בתצוגת "שלי" של בעליהם.')]}><Button secondary icon={CalendarDots} onClick={()=>a.go('calendar')}>{T('Open calendar','פתיחת היומן')}</Button></StatisticsFooter>
 </>;
}

// ---------- Kids ----------
export function KidsTab({c,m}){
 const {a,T,rtl,locale,ui:{Avatar,Empty,Button,Badge}}=c,k=m.kids;
 if(!k)return <Empty text={T('No kids’ progress for this filter.','אין התקדמות של ילדים לסינון הזה.')}/>;
 const lineKeys=k.kids.map((x,i)=>({id:x.id,color:LINES[i%LINES.length],ink:i===1?'#10152A':'#fff',label:a.name(x.id)})),running=k.series.map((s,i)=>({...s,...Object.fromEntries(k.kids.map(x=>[x.id,k.series.slice(0,i+1).reduce((n,r)=>n+r[x.id],0)]))})),routines=k.kids.reduce((n,x)=>n+x.routines,0),stars=k.kids.reduce((n,x)=>n+x.stars,0);
 return <>
  <StatisticsSummary rtl={rtl} items={[{icon:Star,label:T('XP earned','נקודות שנצברו'),value:k.periodXp,hint:periodText(T,k.window),trend:<Trend pill t={k.trend} T={T} days={k.window.days}/>,viz:{kind:'bars',values:k.spark}},{icon:CheckCircle,label:T('Routines done','שגרות שבוצעו'),value:routines,hint:periodText(T,k.window),viz:{kind:'dots',values:k.series.slice(-7).map(b=>k.kids.some(x=>b[x.id]>0))}},{icon:Sparkle,label:T('Stars to spend','כוכבים לשימוש'),value:stars,hint:T('In My Hero','בגיבור שלי')}]}/>
  <ChartCard title={T('XP collected','נקודות שנצברו')} note={<>{T('Running total ','סך מצטבר ')}{periodText(T,k.window)}</>} legend={lineKeys.length>1&&<PeopleLegend items={lineKeys.map(s=>({...s,total:(k.kids.find(x=>x.id===s.id)?.periodXp||0)}))} Avatar={Avatar} name={a.name}/>} footer={k.kids.map(x=>a.name(x.id)+': '+T('level ','שלב ')+x.level+' · '+x.stars+' '+T('stars','כוכבים')).join('   |   ')}>
   {k.periodXp?<LinesChart rtl={rtl} rows={running} keys={lineKeys} xTick={bucketTick(k.series,locale)} yLabel={T('XP collected','נקודות מצטברות')} xLabel={dayAxis(T,k.series)} tooltipLabel={tooltipDate(k.series,locale)}/>:<Empty text={T('No XP earned in this period yet.','עוד לא נצברו נקודות בתקופה הזאת.')}/>}
  </ChartCard>
  <div className="stats-kid-cards">{k.kids.map((x,i)=>{const days=k.series.slice(-7),pct=100-x.toNext;return <section className={'stats-kid-card tone-'+(i%2?'lilac':'yellow')} key={x.id}>
   <header className="stats-kid-hero"><span className="stats-kid-ring" style={{'--pct':pct}} role="img" aria-label={T(pct+'% of the way to level '+(x.level+1),pct+'% מהדרך לשלב '+(x.level+1))}><Avatar decorative who={x.id} size={72}/><b className="stats-kid-level-badge"><Star size={13} weight="fill" aria-hidden="true"/>{x.level}</b></span>
    <div className="stats-kid-name"><h2>{a.name(x.id)}</h2><span>{T('Level '+x.level,'שלב '+x.level)}</span><small>{T(x.toNext+' XP to level '+(x.level+1),'עוד '+x.toNext+' נקודות לשלב '+(x.level+1))}</small></div>
    <div className="stats-kid-xp"><strong><bdi dir="ltr">{x.xp}</bdi></strong><small>XP</small></div></header>
   <div className="stats-kid-progress"><span className="stats-hbar" aria-hidden="true"><i style={{width:pct+'%'}}/></span></div>
   {days.length===7&&days.every(d=>d.date===d.endDate)&&<div className="stats-kid-week" aria-label={T('Days with progress','ימים עם התקדמות')}>{days.map(d=><span key={d.date} className={d[x.id]>0?'on':''}><i aria-hidden="true">{d[x.id]>0?<CheckCircle size={16} weight="fill"/>:null}</i><small>{bucketTick(days,locale)(d.date).replace(/^יום\s+/,'')}</small></span>)}</div>}
   <ul className="stats-kid-stats"><li className="t-green"><span aria-hidden="true"><Star size={18} weight="bold"/></span><b>{x.periodXp}</b><small>{T('XP this period','נקודות בתקופה')}</small></li><li className="t-lilac"><span aria-hidden="true"><CheckCircle size={18} weight="bold"/></span><b>{x.routines}</b><small>{T('Routines','שגרות')}</small></li><li className="t-blue"><span aria-hidden="true"><CalendarDots size={18} weight="bold"/></span><b><bdi dir="ltr">{x.activeDays}/{k.window.days}</bdi></b><small>{T('Active days','ימים פעילים')}</small></li><li className="t-peach"><span aria-hidden="true"><Sparkle size={18} weight="bold"/></span><b>{x.stars}</b><small>{T('Stars','כוכבים')}</small></li></ul>
  </section>})}</div>
  <StatisticsFooter lines={[T('XP comes from completed routines and tasks; stars are spent in My Hero.','נקודות מגיעות משגרות ומשימות שהושלמו; כוכבים מוציאים בגיבור שלי.'),c.isChild?T('You see your own progress.','אתם רואים את ההתקדמות שלכם.'):T('Each child sees only their own progress here.','כל ילד רואה כאן רק את ההתקדמות שלו.')]}><Button secondary icon={Star} onClick={()=>a.go('kids')}>{T('Open Kids','פתיחת ילדים')}</Button></StatisticsFooter>
 </>;
}

// ---------- Shopping ----------
export function ShoppingTab({c,m}){
 const {a,T,rtl,locale,ui:{Avatar,Icon,Empty,Button},scope}=c,s=m.shopping,[allHistory,setAllHistory]=useState(false);
 if(!s)return <Empty text={T('No purchases for this filter.','אין קניות לסינון הזה.')}/>;
 const categoryLabel=key=>{const pair=SHOPPING_CATEGORIES.find(x=>x[0]===key);return pair?T(pair[0],pair[1]):key},who=r=>r.boughtBy||r.memberId||r.ownerId;
 const history=s.records.slice().sort((x,y)=>y.date.localeCompare(x.date));
 const exportCSV=()=>downloadCSV('bayit-shopping-'+scope+'.csv',['date','title','group','boughtBy'],s.records,(r,k)=>k==='boughtBy'?a.name(who(r)):k==='title'?a.text(r):r[k]);
 return <>
  <StatisticsSummary rtl={rtl} items={[{icon:Basket,label:T('Items collected','פריטים שנאספו'),value:s.count,hint:periodText(T,s.window),trend:<Trend pill t={s.trend} T={T} days={s.window.days}/>,viz:{kind:'bars',values:s.bars.map(b=>b.total)}},{icon:ShoppingCart,label:T('Shopping trips','סבבי קניות'),value:s.trips,hint:T('Days with checked-off items','ימים עם פריטים שסומנו'),viz:s.bars.length<=14?{kind:'dots',values:s.bars.map(b=>b.total>0)}:null},{icon:Receipt,label:T('Items per trip','פריטים לסבב'),value:s.perTrip,hint:T('On average','בממוצע')}]}/>
  <ChartCard title={s.bars.every(b=>b.date===b.endDate)?T('Items per day','פריטים בכל יום'):T('Items per week','פריטים בכל שבוע')} note={periodText(T,s.window)}>
   <BarsChart rtl={rtl} rows={s.bars} keys={[{id:'total',color:'var(--stats-c1)',label:T('Items','פריטים')}]} xTick={bucketTick(s.bars,locale)} yLabel={T('Items','פריטים')} xLabel={dayAxis(T,s.bars)} tooltipLabel={tooltipDate(s.bars,locale)}/>
  </ChartCard>
  <div className="stats-grid two">
   <ChartCard title={T('Most purchased items','הפריטים הנקנים ביותר')} note={periodText(T,s.window)}>{s.ranking.length?<RankRows rows={s.ranking} Icon={Icon} label={r=>a.text(r.records[0])}/>:<Empty text={T('No purchases in this period yet.','עוד אין קניות בתקופה הזאת.')}/>}</ChartCard>
   <ChartCard title={T('By category','לפי קטגוריה')} note={periodText(T,s.window)} footer={s.ranking.length?T('Most bought: ','הכי קונים: ')+s.ranking.slice(0,3).map(r=>a.text(r.records[0])).join(' · '):null}>{s.categories.length?<Donut rows={s.categories} label={categoryLabel} total={s.count} totalLabel={T('items','פריטים')}/>:<Empty text={T('No purchases in this period yet.','עוד אין קניות בתקופה הזאת.')}/>}</ChartCard>
  </div>
  <section className="statistics-history"><div className="section-title"><h2>{T('Purchase history','היסטוריית הקניות')} <span>{scope==='private'?T('(private)','(פרטי)'):T('(shared)','(משותף)')}</span></h2>{history.length>4&&<button type="button" className="text-link" onClick={()=>setAllHistory(!allHistory)}>{allHistory?T('Show less','הצגת פחות'):T('View all ('+history.length+')','הצגת הכל ('+history.length+')')}<ArrowRight size={18} aria-hidden="true"/></button>}</div>
   <div className="data-table"><table><thead><tr><th>{T('Date','תאריך')}</th><th>{T('Person','בן משפחה')}</th><th>{T('Item','פריט')}</th></tr></thead><tbody>{history.slice(0,allHistory?undefined:4).map(r=><tr key={r.purchaseId||r.id}><td className="history-date">{new Date(r.date+'T12:00:00Z').toLocaleDateString(locale,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</td><td className="history-person"><Avatar decorative who={who(r)} size={32}/><span>{a.name(who(r))}</span></td><td className="history-item"><Icon code={r.icon||'1F6D2'} size={30}/><span>{a.text(r)}</span></td></tr>)}</tbody></table></div>
  </section>
  <StatisticsFooter lines={[T('Purchases are counted when an item is checked off a shopping list.','קנייה נספרת כשמסמנים פריט ברשימת הקניות.'),T('Private lists stay in their owner’s personal statistics.','רשימות פרטיות נשארות בסטטיסטיקה האישית של בעליהן.')]}><Button secondary icon={DownloadSimple} disabled={!s.records.length} onClick={exportCSV}>{T('Export CSV','ייצוא CSV')}</Button></StatisticsFooter>
 </>;
}
