import {taskMemberIds,taskAssignedTo} from '../../shared/task-assignment.mjs';
import {RecordAssignees,RecordAudience,RecordRecurrence,TaskReminderDetails} from './record-assignment';
import {allowInitialTextFocus} from './form-focus';
// Tasks page: shareable task lists, one-row filters (range, date, people, status, search), tasks grouped by
// day with overdue and anytime groups, subtasks, and a detail panel in the Calendar detail style.
import {PersonChip} from './person-chip';
import {AssignedPeople} from './assigned-people';
import {PinToToday} from './household-pins';
import {DetailTitle} from './detail-title';
import {RecordLocation} from './location-field';
import {RecordShare} from './record-share';
import React,{useMemo,useState,useEffect} from 'react';
import {Bell,ShoppingCart,Plus,MagnifyingGlass,LockSimple,Users,Repeat,Clock,CalendarDots,UserCircle,Stack,PencilSimple,Trash,X,Check,ListChecks,NotePencil,CaretDown,SortAscending} from '@phosphor-icons/react';
import {occursOn,completionState} from './domain';
import {DateField} from './date-field';
import {AvatarStack} from './avatar-stack';
import {CreatedBy,fmtMinutes} from './created-by';
import {SwipeRow} from './swipe-row';
import {canAccessList,applyListAudience,createTaskList} from '../../shared/task-lists.mjs';
import {GENERAL_TASK_LIST_ID,generalTaskList} from './task-list-choice.mjs';
import {isKidsRoutine,hidesKidsRoutines} from '../../shared/kids-context.mjs';
import {PeoplePicker} from './people-picker';
import {matchesWhose,WHOSE_ALL,WHOSE_MINE} from '../../shared/whose-filter.mjs';
import {WhoseNote,storedWhose,storeWhose} from './whose-filter';
import {Select} from './Select';
import {PriorityMark,PriorityChoice,priorityLabel,priorityTitle,groupByPriority,normalizePriority} from './priority';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard,confirmDraftNavigation} from './draft-guard';
import {DensityToggle} from './density';
import {repeatLabel as describeRepeat} from './repeat-label';
import {FormSection} from './form-section.jsx';
import {PendingSync} from './offline-ui';
import {BayitAIList,BayitAIListCard,BAYIT_AI_LIST} from './bayit-ai';
import {ClipboardText as SecDetails,LockSimple as SecPrivacy,Funnel,Flag,Baby} from '@phosphor-icons/react';
const storedView=()=>{try{return JSON.parse(localStorage.getItem('bayit-tasks-view'))||{}}catch{return {}}};
/* Kids' routines shown in Tasks: remembered per person on this device (user decision 2026-11-11). */
const storedKidsRoutines=user=>{try{return !!(JSON.parse(localStorage.getItem('bayit-tasks-kids-routines'))||{})[user]}catch{return false}};
const storeKidsRoutines=(user,on)=>{try{const all=JSON.parse(localStorage.getItem('bayit-tasks-kids-routines'))||{};if(on)all[user]=true;else delete all[user];localStorage.setItem('bayit-tasks-kids-routines',JSON.stringify(all))}catch{}};

const addDays=(v,n)=>{const d=new Date(v+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const uid=()=>crypto.randomUUID();

export function TasksView({app:a,anchor,ui:{Heading,Button,Badge,Avatar,Icon,Checkbox,DetailPanel,Empty}}){
 const q=new URLSearchParams(a.route.split('?')[1]||''),parent=a.member(a.user).role==='parent',he=a.lang==='he',locale=he?'he-IL':'en-US';
 const [filtersOpen,setFiltersOpen]=useState(false),[listId,setListId]=useState(q.get('list')||'all'),[range,setRange]=useState(q.get('date')?'day':'today'),[day,setDay]=useState(q.get('date')||anchor),[person,setPerson]=useState(()=>storedWhose('tasks',a.user)),[status,setStatus]=useState('open'),[search,setSearch]=useState(''),[selected,setSelected]=useState(q.get('task')?{id:q.get('task'),date:q.get('date')||anchor}:null),[detailOpen,setDetailOpen]=useState(!!q.get('task')),[sheet,setSheet]=useState(null);
 const [prio,setPrio]=useState(()=>{const v=q.get('priority')||storedView().priority;return normalizePriority(v)||'all'}),[order,setOrder]=useState(()=>(q.get('order')||storedView().order)==='priority'?'priority':'time');
 useEffect(()=>{try{localStorage.setItem('bayit-tasks-view',JSON.stringify({priority:prio,order}))}catch{}},[prio,order]);
 const [kidsRoutines,setKidsRoutines]=useState(()=>storedKidsRoutines(a.user));
 useEffect(()=>{setKidsRoutines(storedKidsRoutines(a.user));setPerson(storedWhose('tasks',a.user))},[a.user]);
 /* Whose tasks: yours by default; Everyone is remembered per person on this device (user request 2026-11-11). */
 const choosePerson=who=>{setPerson(who);storeWhose('tasks',a.user,who)};
 useEffect(()=>{storeKidsRoutines(a.user,kidsRoutines)},[a.user,kidsRoutines]);
 useEffect(()=>{const link=new URLSearchParams(a.route.split('?')[1]||'');if(link.get('task')){const date=link.get('date')||anchor;setSelected({id:link.get('task'),date});setDetailOpen(true)}else setDetailOpen(false)},[a.route]);
 const lists=(a.data.taskLists||[]).filter(l=>canAccessList(l,a.user));
 /* Tasks shows what you may see, filtered by whose: yours by default (shared/whose-filter.mjs inMyView), Everyone or one person (2026-11-11). */
 /* Kids' routines live on the Kids screen; grown-ups see them here only with the "Kids' routines" filter (2026-11-11). */
 const routineRule=hidesKidsRoutines(a.member(a.user).role,a.features?.route?.('kids')),allTasks=a.visible(a.data.tasks),kidsRoutineCount=routineRule?allTasks.filter(t=>isKidsRoutine(t,a.members)).length:0,showKidsRoutines=routineRule&&kidsRoutines;
 const base=routineRule&&!kidsRoutines?allTasks.filter(t=>!isKidsRoutine(t,a.members)):allTasks;
 const knownList=id=>!!id&&lists.some(l=>l.id===id),inList=t=>listId==='all'||(listId===GENERAL_TASK_LIST_ID?!knownList(t.listId)&&!t.routine:t.listId===listId);
 const whoseOk=(t,who=person)=>showKidsRoutines&&isKidsRoutine(t,a.members)||matchesWhose(t,who,a.user,'tasks')/* a shown kids' routine is never hidden by whose */;
 const matches=(t,who=person)=>inList(t)&&whoseOk(t,who)&&(prio==='all'||normalizePriority(t.priority)===prio)&&(!search||[a.text(t),t.note,t.noteHe].join(' ').toLowerCase().includes(search.toLowerCase()));
 const label=d=>d===anchor?a.T('Today','היום'):d===addDays(anchor,1)?a.T('Tomorrow','מחר'):d===addDays(anchor,-1)?a.T('Yesterday','אתמול'):new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'short'});
 const anyDate=t=>{const last=Object.entries(t.completions||{}).sort(([x],[y])=>x.localeCompare(y)).pop();return last&&last[1]?.state!=='open'?last[0]:anchor};
 const stateOf=(t,date)=>t.date?completionState(t,date):completionState(t,anyDate(t));
 const tripProgress=t=>{if(!t.shoppingListId)return null;const items=(a.data.shopping||[]).filter(i=>(i.listId||'week')===t.shoppingListId);return items.length?items.filter(i=>i.done).length+'/'+items.length:null};
 const build=who=>{
  const out=[],pool=base.filter(t=>matches(t,who)),keep=state=>status==='all'||(status==='done'?state==='done':state!=='done');
  const dates=range==='day'?[day]:range==='today'?[anchor]:Array.from({length:range==='week'?7:14},(_,i)=>addDays(anchor,i));
  if(range!=='day'){const overdue=pool.filter(t=>t.date&&t.date<anchor&&(t.repeat||'once')==='once'&&!t.routine&&completionState(t,t.date)!=='done').map(t=>({t,date:t.date}));if(overdue.length&&status!=='done')out.push({key:'overdue',title:a.T('Overdue','באיחור'),tone:'overdue',rows:overdue})}
  for(const d of dates){const rows=pool.filter(t=>occursOn(t,d)).map(t=>({t,date:d})).filter(r=>keep(completionState(r.t,r.date))).sort((x,y)=>(x.t.time||'99').localeCompare(y.t.time||'99'));if(rows.length)out.push({key:d,title:label(d),tone:d===anchor?'today':'',rows})}
  if(range!=='day'){const anytime=pool.filter(t=>!t.date).map(t=>({t,date:anyDate(t)})).filter(r=>keep(completionState(r.t,r.date)));if(anytime.length)out.push({key:'anytime',title:a.T('Anytime','בלי תאריך'),tone:'',rows:anytime})}
  if(order==='priority'){const titles={high:a.T('High priority','עדיפות גבוהה'),medium:a.T('Medium priority','עדיפות בינונית'),low:a.T('Low priority','עדיפות נמוכה'),none:a.T('No priority','ללא עדיפות')};return groupByPriority(out.flatMap(g=>g.rows)).map(g=>({key:'prio-'+g.key,title:titles[g.key],tone:'prio-'+g.key,mark:g.key==='none'?'':g.key,rows:g.rows}))}
  return out;
 };
 const groups=useMemo(()=>build(person),[base,listId,person,status,search,range,day,anchor,a.lang,prio,order,showKidsRoutines]);
 /* Rows in this view that are someone else's: hidden under mine, shown under Everyone (for the whose note). */
 const others=useMemo(()=>build(WHOSE_ALL).flatMap(g=>g.rows).filter(r=>!whoseOk(r.t,WHOSE_MINE)).length,[base,listId,status,search,range,day,anchor,a.lang,prio,showKidsRoutines]);
 const total=groups.reduce((n,g)=>n+g.rows.length,0);
 const activeFilters=(prio!=='all')+(order!=='time')+(search.trim()?1:0)+(showKidsRoutines?1:0);
 const filterSummary=[prio!=='all'&&priorityTitle(prio,a.lang),order!=='time'&&a.T('By priority','לפי עדיפות'),search.trim()&&'“'+search.trim()+'”',showKidsRoutines&&a.T('Kids’ routines','שגרות הילדים')].filter(Boolean).join(' · ');
 const clearFilters=()=>change(()=>{setPrio('all');setOrder('time');setSearch('');setKidsRoutines(false)});
 const linkedTask=q.get('task')&&a.visible(a.data.tasks).find(t=>t.id===q.get('task'));
 const current=selected?(base.find(t=>t.id===selected.id)||linkedTask?.id===selected.id&&linkedTask?{t:base.find(t=>t.id===selected.id)||linkedTask,date:selected.date}:null):groups[0]?.rows[0];
 const canEdit=t=>parent||t.ownerId===a.user;
 const listOf=t=>lists.find(l=>l.id===t.listId)||(!knownList(t.listId)&&!t.routine?generalTaskList:null);
 const repeatLabel=t=>{const r=(t.repeat||(t.routine?'daily':'once')).toLowerCase();return r==='once'?'':describeRepeat(r,a.T,t.weekdays)};
 const subProgress=t=>t.subtasks?.length?(t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length):'';
 const countIn=id=>base.filter(t=>whoseOk(t)&&(id==='all'||(id===GENERAL_TASK_LIST_ID?!knownList(t.listId)&&!t.routine:t.listId===id))&&(!t.date||completionState(t,t.date>anchor?t.date:anchor)!=='done')).length;
 const shareText=l=>l.visibility==='family'?a.T('Family','כל המשפחה'):l.visibility==='private'?a.T('Only me','רק אני'):a.T('Shared','משותף');
 const change=action=>{if(confirmDraftNavigation())action()},closeDetails=()=>change(()=>setDetailOpen(false)),pick=(t,date)=>change(()=>{setSelected({id:t.id,date});setDetailOpen(true)});

 const rangeButtons=[['today',a.T('Today','היום')],['week',a.T('This week','השבוע')],['upcoming',a.T('Upcoming','בקרוב')]];
 return <div className="tasks-v2">
  <Heading title={a.T('Little things, shared.','דברים קטנים, ביחד.')} subtitle={new Date(anchor+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'})} action={<><Button icon={Plus} onClick={()=>a.go('tasks/new'+(listId!=='all'?'?list='+encodeURIComponent(listId):''))}>{a.T('New task','משימה חדשה')}</Button></>}/>

  <div className="list-selector-layout"><div className="tasks-lists" role="group" aria-label={a.T('Task lists','רשימות משימות')}>
   <button type="button" aria-pressed={listId==='all'} className={'tasks-list-card'+(listId==='all'?' chosen':'')} onClick={()=>change(()=>setListId('all'))}><span className="tasks-list-icon"><Stack size={26}/></span><span className="tasks-list-text"><strong>{a.T('All tasks','כל המשימות')}</strong><small>{person===WHOSE_ALL?a.T('Everything you can see','כל מה שגלוי לכם'):person===WHOSE_MINE||person===a.user?a.T('Assigned to you','משויכות אליכם'):a.T('Assigned to ','משויכות ל־')+a.name(person)}</small></span><span className="tasks-list-count">{countIn('all')}</span></button>
   <button type="button" aria-pressed={listId===GENERAL_TASK_LIST_ID} className={'tasks-list-card'+(listId===GENERAL_TASK_LIST_ID?' chosen':'')} onClick={()=>change(()=>setListId(GENERAL_TASK_LIST_ID))}><span className="tasks-list-icon"><Icon code="bayit-activities-notebook" size={34}/></span><span className="tasks-list-text"><strong>{a.T('General','כללי')}</strong><small>{a.T('Tasks without a dedicated list','משימות ללא רשימה ייעודית')}</small></span><span className="tasks-list-count">{countIn(GENERAL_TASK_LIST_ID)}</span></button>
   <BayitAIListCard a={a} listId={listId} Icon={Icon} onPick={()=>change(()=>setListId(BAYIT_AI_LIST))}/>
   {lists.map(l=><div className="tasks-list-shell" key={l.id}><button type="button" aria-pressed={listId===l.id} key={l.id} className={'tasks-list-card'+(listId===l.id?' chosen':'')} onClick={()=>change(()=>setListId(l.id))}><span className="tasks-list-icon"><Icon code={l.icon||'1F4CB'} size={34}/></span><span className="tasks-list-text"><strong>{he?l.he||l.name:l.name}</strong><small>{countIn(l.id)} · {shareText(l)}</small></span>{l.visibility==='private'?<LockSimple size={20} className="tasks-list-lock"/>:<AvatarStack ids={l.visibility==='family'?a.members.map(m=>m.id):[l.ownerId,...l.allowedIds]} Avatar={Avatar} name={a.name} size={28} label={a.T('Shared with','משותף עם')}/>}</button>{l.ownerId===a.user&&listId===l.id&&<button type="button" className="tasks-list-edit" aria-label={a.T('Edit list','עריכת רשימה')} onClick={e=>{e.stopPropagation();setSheet({mode:'edit',list:l})}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();setSheet({mode:'edit',list:l})}}}><PencilSimple size={16}/></button>}</div>)}

  </div>   <button type="button" className="tasks-list-card tasks-list-new" onClick={()=>setSheet({mode:'new'})}><Plus size={22}/><strong>{a.T('New list','רשימה חדשה')}</strong></button></div>

  {listId===BAYIT_AI_LIST&&<BayitAIList a={a} ui={{Checkbox,Icon,Avatar}}/>/* בית AI recommendations (2026-11-10) */}
  <div className={'tasks-filters'+(listId===BAYIT_AI_LIST?' bai-hidden':'')}>
   <div className="tasks-range" role="group" aria-label={a.T('When','מתי')}>{rangeButtons.map(([k,t])=><button type="button" key={k} aria-pressed={range===k} className={range===k?'on':''} onClick={()=>change(()=>setRange(k))}>{t}</button>)}<DateField variant="toolbar" className={'tasks-day'+(range==='day'?' on':'')} required aria-label={a.T('Choose a day','בחירת יום')} value={day} onChange={e=>{if(e.target.value)change(()=>{setDay(e.target.value);setRange('day')})}}/></div>
   <div className="tasks-status" role="group" aria-label={a.T('Status','מצב')}>{[['all',a.T('All','הכל')],['open',a.T('To do','לביצוע')],['done',a.T('Done','בוצע')]].map(([k,t])=><button type="button" key={k} aria-pressed={status===k} className={status===k?'on':''} onClick={()=>change(()=>setStatus(k))}>{t}</button>)}</div>
   <button type="button" className={'tasks-filter-button'+(activeFilters?' on':'')} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(true)}><Funnel size={20}/><span>{a.T('Filters','סינון')}</span>{activeFilters>0&&<b className="tasks-filter-count">{activeFilters}</b>}</button>
   <WhoseNote a={a} whose={person} others={others} onChange={who=>change(()=>choosePerson(who))} className="tasks-whose-note"/>
   {activeFilters>0&&<p className="tasks-filter-summary" dir="auto"><span>{filterSummary}</span><button type="button" className="text-link" onClick={clearFilters}>{a.T('Clear','ניקוי')}</button></p>}
  </div>
  {filtersOpen&&<div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setFiltersOpen(false)}><section className="tasks-sheet tasks-filter-sheet" role="dialog" aria-modal="true" aria-label={a.T('Filters','סינון')} onKeyDown={e=>e.key==='Escape'&&setFiltersOpen(false)}><header><h2>{a.T('Filters','סינון')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>setFiltersOpen(false)}><X size={20}/></button></header><div className="tasks-sheet-body"><FormSection T={a.T} icon={MagnifyingGlass} tone="blue" title={a.T('Search','חיפוש')}><label className="tasks-search tasks-search-field"><MagnifyingGlass size={18}/><input type="search" value={search} onChange={e=>change(()=>setSearch(e.target.value))} placeholder={a.T('Search tasks','חיפוש משימות')} aria-label={a.T('Search tasks','חיפוש משימות')}/></label>
  </FormSection><FormSection T={a.T} icon={Users} tone="yellow" title={a.T('Whose tasks','המשימות של')}><div className="tasks-people calendar-person-legend"><button type="button" aria-pressed={person===WHOSE_ALL} className={'calendar-all-members '+(person===WHOSE_ALL?'chosen':'')} onClick={()=>change(()=>choosePerson(WHOSE_ALL))}><Users size={18}/>{a.T('Everyone','כולם')}</button>{a.members.filter(m=>parent||m.id===a.user).map(m=>{const on=person===m.id||m.id===a.user&&person===WHOSE_MINE;return <PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={on} onClick={()=>change(()=>choosePerson(on?WHOSE_ALL:m.id===a.user?WHOSE_MINE:m.id))}/>})}</div>
   </FormSection>{routineRule&&(kidsRoutineCount>0||kidsRoutines)&&<FormSection T={a.T} icon={Baby} tone="green" title={a.T('Kids’ routines','שגרות הילדים')} note={a.T('They stay on the Kids screen. Show them here too when you want.','הן נמצאות במסך הילדים. אפשר להציג אותן גם כאן.')}><div className="tasks-people calendar-person-legend"><button type="button" className={'calendar-all-members tasks-kids-routines '+(kidsRoutines?'chosen':'')} aria-pressed={kidsRoutines} onClick={()=>change(()=>setKidsRoutines(!kidsRoutines))}>{a.T('Show the kids’ routines','להציג את שגרות הילדים')} <bdi>({kidsRoutineCount})</bdi></button></div>
   </FormSection>}<FormSection T={a.T} icon={Flag} tone="peach" title={a.T('Priority & order','עדיפות וסדר')}><div className="tasks-prio-filters"><Select className={'tasks-prio-select'+(prio!=='all'?' filtered':'')} aria-label={a.T('Priority','עדיפות')} value={prio} onChange={e=>change(()=>setPrio(e.target.value))}><option value="all"><span className="prio-opt"><PriorityMark a={a} priority="" size={18} decorative/>{a.T('All priorities','כל העדיפויות')}</span></option>{['high','medium','low'].map(p=><option key={p} value={p}><span className="prio-opt"><PriorityMark a={a} priority={p} size={18} decorative/>{a.lang==='he'?'עדיפות '+priorityLabel(p,a.lang):priorityLabel(p,a.lang)}</span></option>)}</Select><Select className={'tasks-order-select'+(order==='priority'?' filtered':'')} aria-label={a.T('Order','סדר')} value={order} onChange={e=>change(()=>setOrder(e.target.value))}><option value="time"><span className="prio-opt"><Clock size={18}/>{a.T('By time','לפי זמן')}</span></option><option value="priority"><span className="prio-opt"><SortAscending size={18}/>{a.T('By priority','לפי עדיפות')}</span></option></Select></div>
   </FormSection></div><div className="tasks-sheet-actions"><Button secondary onClick={clearFilters} disabled={!activeFilters}>{a.T('Clear filters','ניקוי הסינון')}</Button><Button onClick={()=>setFiltersOpen(false)}>{total===1?a.T('Show 1 task','הצגת משימה אחת'):a.T('Show '+total+' tasks','הצגת '+total+' משימות')}</Button></div></section></div>}

  <div className={'split task-list-layout tasks-v2-layout'+(listId===BAYIT_AI_LIST?' bai-hidden':'')}><section className="tasks-groups">
   {groups.map(g=><section key={g.key} className={'tasks-group '+(g.tone?'tone-'+g.tone:'')}><h2><span>{g.mark!==undefined&&<PriorityMark a={a} priority={g.mark} size={18} decorative/>}{g.title}</span><small>{g.rows.length}</small></h2>
    {g.rows.map(({t,date})=>{const state=completionState(t,date),l=listOf(t),focused=current&&current.t.id===t.id&&current.date===date;return <SwipeRow key={t.id+date} onDelete={t.ownerId===a.user?()=>a.remove('tasks',t.id,a.text(t)):null} label={a.T('Delete','מחיקה')}><div className={'task-row detailed tasks-row'+(normalizePriority(t.priority)?' has-prio prio-row-'+t.priority:'')+(state==='done'?' done':'')+(focused?' focused':'')}>
     <Checkbox checked={state==='done'} disabled={state==='pending'&&!parent} onChange={()=>a.toggleTask(t.id,date)} aria-label={a.text(t)}/>
     <Icon code={t.icon}/>
     <button type="button" className="task-title tasks-row-main" onClick={()=>pick(t,date)}><strong>{a.text(t)}</strong>{(he?t.noteHe||t.note:t.note)&&<span className="tasks-note">{he?t.noteHe||t.note:t.note}</span>}<small className="tasks-meta"><PendingSync collection="tasks" id={t.id} T={a.T}/>{normalizePriority(t.priority)&&<span className="task-priority-label"><PriorityMark a={a} priority={t.priority} size={18} decorative/>{priorityTitle(t.priority,a.lang)}</span>}<span className="tasks-meta-assignees"><Users size={14}/><span>{taskMemberIds(t).length>1?a.T(taskMemberIds(t).length+' assignees',taskMemberIds(t).length+' משויכים'):<>{a.T('Assigned to: ','משויך ל־')}{taskMemberIds(t).map(a.name).join(', ')}</>}</span></span>{order==='priority'&&range!=='day'&&(range!=='today'||!t.date||date!==anchor)&&<span className="tasks-meta-date"><CalendarDots size={14}/>{t.date?label(date):a.T('Anytime','בלי תאריך')}</span>}{t.time?<span dir="ltr" className="tasks-meta-time"><Clock size={14}/>{t.time}</span>:<span className="tasks-meta-time tasks-meta-time-none" aria-hidden="true"/>}{repeatLabel(t)&&<span className="tasks-meta-repeat"><Repeat size={14}/>{repeatLabel(t)}</span>}{l&&<span className="tasks-meta-list">{he?l.he||l.name:l.name}</span>}{subProgress(t)&&<span className="tasks-meta-sub"><ListChecks size={14}/>{subProgress(t)}</span>}{tripProgress(t)&&<span className="tasks-meta-trip"><ShoppingCart size={14}/>{a.T(tripProgress(t)+' in the bag',tripProgress(t)+' בסל')}</span>}{state==='pending'&&<span className="tasks-meta-pending">{a.T('Waiting for a parent','ממתין להורה')}</span>}</small></button>
     {taskMemberIds(t).length>1?<AssignedPeople ids={taskMemberIds(t)} Avatar={Avatar} name={a.name} member={a.member} size={26} max={2} label={a.T('Assigned to','משויך ל־')}/>:<span className={'tasks-assignee '+a.member(t.memberId).color} title={taskMemberIds(t).map(a.name).join(', ')}><span className="tasks-assignee-summary"><Avatar who={taskMemberIds(t)[0]} size={30}/>{taskMemberIds(t).length>1&&<b className="tasks-assignee-count">{taskMemberIds(t).length}</b>}</span><span>{taskMemberIds(t).map(a.name).join(', ')}</span></span>}
     <span className="tasks-col-lock" aria-label={t.visibility==='private'?a.T('Private','פרטי'):undefined}>{t.visibility==='private'&&<LockSimple size={18}/>}</span>
    </div></SwipeRow>})}
   </section>)}
   {!total&&<Empty text={(person===WHOSE_MINE||person===a.user)&&others>0?a.T('Nothing assigned to you here. Show everyone to see the other '+others+'.','אין כאן משימות שמשויכות אליכם. אפשר להציג את כולם ולראות עוד '+others+'.'):search||person!==WHOSE_ALL&&person!==WHOSE_MINE&&person!==a.user||listId!=='all'||prio!=='all'?a.T('No tasks match these filters.','אין משימות שמתאימות לסינון.'):a.T('Nothing here yet. Add the next little thing.','עוד אין כאן משימות. הוסיפו את הדבר הקטן הבא.')}/>}
  </section>
  <DetailPanel open={detailOpen} onClose={closeDetails} title={a.T('Task details','פרטי המשימה')} className="calendar-event-details" sheetBreakpoint={1280}>{current?<TaskDetail key={current.t.id} a={a} t={current.t} date={current.date} lists={lists} canEdit={canEdit(current.t)} ui={{Button,Badge,Avatar,Icon,Checkbox}} repeatLabel={repeatLabel} onClose={closeDetails}/>:<Empty text={a.T(q.get('task')?'This task is unavailable or was removed.':'Choose a task to see its details.',q.get('task')?'המשימה אינה זמינה או הוסרה.':'בחרו משימה כדי לראות פרטים.')}/>}</DetailPanel>
  </div>
  {sheet&&<ListSheet a={a} sheet={sheet} ui={{Button,Avatar,Icon}} onClose={()=>setSheet(null)} onCreated={id=>{setListId(id);setSheet(null)}} onDeleted={()=>{setListId('all');setSheet(null)}}/>}
 </div>;
}

function TaskDetail({a,t,date,lists,canEdit,ui:{Button,Badge,Avatar,Icon,Checkbox},repeatLabel,onClose}){
 const [newSub,setNewSub]=useState(''),locale=a.lang==='he'?'he-IL':'en-US',l=lists.find(x=>x.id===t.listId),owner=t.ownerId===a.user;
 const when=t.date?new Date(date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}):a.T('Anytime','בלי תאריך');
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,{newSub},{enabled:!!newSub,key:t.id});
 const edit=fn=>a.update(d=>{const x=d.tasks.find(r=>r.id===t.id);if(x)fn(x,d)});
 const addSub=async e=>{e.preventDefault();const title=newSub.trim();if(!title)return;await commit(()=>edit(x=>{x.subtasks=[...(x.subtasks||[]),{id:uid(),title,done:false}]}),()=>setNewSub(''))};
 return <div className="task-detail-v2">{saveError&&<p className="save-error" role="alert">{saveError}</p>}
  <div className="calendar-detail-heading tasks-detail-heading"><span className="tasks-detail-icon"><Icon code={t.icon} size={72}/></span><DetailTitle text={a.text(t)}/></div>
  <PinToToday a={a} collection="tasks" record={t}/>
  {t.routine&&<div className="journal-detail-kind"><Badge color="yellow">{a.T('Kids routine','שגרת ילדים')}{t.xp?' · +'+t.xp+' XP':''}</Badge></div>}
  <RecordAssignees a={a} record={t} Avatar={Avatar} task/><div className="tasks-detail-status"><strong>{a.T('Status: ','מצב: ')}</strong>{completionState(t,date)==='done'?a.T('Done','בוצע'):completionState(t,date)==='pending'?a.T('Waiting for a parent','ממתין להורה'):a.T('To do','לביצוע')}</div>
  {!t.routine&&(canEdit?<div className="tasks-detail-prio-edit"><span className="calendar-detail-row"><PriorityMark a={a} priority={t.priority} size={27} decorative/><span>{a.T('Priority','עדיפות')}</span></span><PriorityChoice a={a} value={normalizePriority(t.priority)||''} onChange={v=>edit(x=>{if(v)x.priority=v;else delete x.priority})}/></div>:normalizePriority(t.priority)&&<div className="calendar-detail-row tasks-detail-prio"><PriorityMark a={a} priority={t.priority} size={27} decorative/><span>{a.T('Priority: ','עדיפות: ')}<strong>{priorityLabel(t.priority,a.lang)}</strong></span></div>)}
  <div className="calendar-detail-row"><CalendarDots size={27}/><strong>{when}</strong>{t.time&&<time dir="ltr" className="tasks-detail-time">· {t.time}</time>}</div>
  <RecordLocation a={a} record={t} collection="tasks"/>
  <RecordShare key={t.id} a={a} record={t} kind="task" date={t.date?date:undefined}/>
  <RecordRecurrence a={a} record={t}/><TaskReminderDetails a={a} task={t}/>{t.routine&&<div className="calendar-detail-row"><ListChecks size={27}/><span>{a.T('Parent approval: ','אישור הורה: ')}{t.parentConfirm?a.T('Required','נדרש'):a.T('Not required','לא נדרש')} · {a.T('Turn order: ','סדר ביצוע: ')}{t.turnOrder==='none'?a.T('Together / no order','ביחד / ללא תור'):t.turnOrder==='fixed'?a.T('Fixed order','סדר קבוע'):a.T('Alternate daily','החלפה יומית')/* nothing saved = alternate, as on the Turns screen (2026-11-11) */}</span></div>}
  {!t.shoppingListId&&<div className="calendar-detail-row"><Stack size={27}/>{owner&&!t.routine?<select className="tasks-detail-list" aria-label={a.T('List','רשימה')} value={t.listId||''} onChange={e=>edit((x,d)=>{const target=(d.taskLists||[]).find(r=>r.id===e.target.value);if(target)applyListAudience(x,target);else delete x.listId})}><option value="">{a.T('General','כללי')}</option>{lists.filter(x=>canAccessList(x,a.user)).map(x=><option key={x.id} value={x.id}>{a.lang==='he'?x.he||x.name:x.name}</option>)}</select>:<span>{l?(a.lang==='he'?l.he||l.name:l.name):a.T('General','כללי')}</span>}</div>}
  <RecordAudience a={a} record={t}/>
  <div className="calendar-detail-section tasks-subtasks"><div className="calendar-detail-row"><ListChecks size={27}/><span>{a.T('Subtasks','תת־משימות')}</span>{t.subtasks?.length>0&&<small>{t.subtasks.filter(s=>s.done).length}/{t.subtasks.length}</small>}</div>
   {(t.subtasks||[]).map(s=><div key={s.id} className={'tasks-subtask'+(s.done?' done':'')}><Checkbox checked={!!s.done} disabled={!canEdit&&!taskAssignedTo(t,a.user)} onChange={()=>commit(()=>edit(x=>{const y=x.subtasks.find(v=>v.id===s.id);y.done=!y.done}))} aria-label={s.title}/><span>{s.title}</span>{canEdit&&<button type="button" className="icon-button" aria-label={a.T('Remove','הסרה')} onClick={()=>edit(x=>{x.subtasks=x.subtasks.filter(v=>v.id!==s.id)})}><X size={16}/></button>}</div>)}
   {canEdit&&<form className="tasks-subtask-add" onSubmit={addSub}><input value={newSub} onChange={e=>setNewSub(e.target.value)} maxLength={120} placeholder={a.T('Add a step','הוספת שלב')} aria-label={a.T('Add a subtask','הוספת תת־משימה')}/><button type="submit" className="icon-button" aria-label={a.T('Add','הוספה')} disabled={!newSub.trim()}><Plus size={18}/></button></form>}
   {!canEdit&&!(t.subtasks||[]).length&&<p className="muted">{a.T('No steps yet.','אין עדיין שלבים.')}</p>}
  </div>
  {t.shoppingListId&&<div className="calendar-detail-row tasks-detail-trip"><ShoppingCart size={27}/><span>{a.T('Planned shop','קנייה מתוכננת')}</span>{a.features?.route('shopping')!==false&&<Button secondary onClick={()=>a.go('shopping?list='+encodeURIComponent(t.shoppingListId))}>{a.T('Open shopping list','פתיחת רשימת הקניות')}</Button>}</div>}{(t.note||t.noteHe)&&<div className="calendar-detail-section"><div className="calendar-detail-row"><NotePencil size={27}/><span>{a.T('Note','הערה')}</span></div><p className="journal-detail-text">{a.lang==='he'?t.noteHe||t.note:t.note}</p></div>}
  <CreatedBy a={a} record={t} Avatar={Avatar}/>{(t.notifyOwnerOnDone||t.overdueAlert)&&t.ownerId===a.user&&<p className="created-by-updates"><Bell size={16}/>{[t.notifyOwnerOnDone&&a.T('You’ll be told when it’s done','תקבלו עדכון כשזה יבוצע'),t.overdueAlert&&a.T('Overdue alert after '+fmtMinutes(t.overdueAlert.afterMinutes,a),'התראת איחור אחרי '+fmtMinutes(t.overdueAlert.afterMinutes,a))].filter(Boolean).join(' · ')}</p>}<div className="journal-detail-actions">{canEdit&&<Button icon={PencilSimple} onClick={()=>a.go((t.routine?'kids':'tasks')+'/edit?'+t.id)}>{a.T('Edit task','עריכת משימה')}</Button>}{owner&&<Button secondary icon={Trash} disabled={saving} onClick={()=>{if(confirmDraftNavigation())commit(()=>a.remove('tasks',t.id,a.text(t)),()=>{guard.accept();setNewSub('');onClose?.()})}}>{a.T('Delete','מחיקה')}</Button>}</div>
 </div>;
}

function ListSheet({a,sheet,ui:{Button,Avatar,Icon},onClose,onCreated,onDeleted}){
 const editing=sheet.mode==='edit'?sheet.list:null,others=a.members.filter(m=>m.id!==a.user);
 const [name,setName]=useState(editing?(a.lang==='he'?editing.he||editing.name:editing.name):''),[icon,setIcon]=useState(editing?.icon||'1F4CB'),[visibility,setVisibility]=useState(editing?.visibility||'family'),[allowed,setAllowed]=useState(editing?.allowedIds||[]),[error,setError]=useState('');
 const {saving,saveError,commit}=useConfirmedSave(a),guard=useDraftGuard(a,{name,icon,visibility,allowed});
 const save=async e=>{e.preventDefault();if(!name.trim())return setError(a.T('Give the list a name.','תנו לרשימה שם.'));if(visibility==='selected'&&!allowed.length)return setError(a.T('Choose who can see it.','בחרו מי יכול לראות.'));
  if(editing){await commit(()=>a.update(d=>{const l=d.taskLists.find(x=>x.id===editing.id);Object.assign(l,{name:name.trim(),he:name.trim(),icon,visibility,allowedIds:visibility==='selected'?allowed:[]});for(const t of d.tasks)if(t.listId===l.id&&t.ownerId===a.user)applyListAudience(t,l)}),()=>{a.notify(a.T('List saved.','הרשימה נשמרה.'));onClose()});return}
  const id=uid();await commit(()=>a.update(d=>{createTaskList(d,{id,name,icon,ownerId:a.user,visibility,allowedIds:allowed,memberIds:a.members.map(m=>m.id)})}),()=>onCreated(id))};
 const choices=[['private',a.T('Only me','רק אני'),LockSimpleIcon],['family',a.T('Whole family','כל המשפחה'),UsersIcon],['selected',a.T('Selected people','אנשים נבחרים'),UsersIcon]];
 return <div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&guard(onClose)}><form className="tasks-sheet" role="dialog" aria-modal="true" aria-label={editing?a.T('Edit list','עריכת רשימה'):a.T('New list','רשימה חדשה')} onSubmit={save}>
  {saveError&&<p role="alert" className="save-error">{saveError}</p>}<header><h2>{editing?a.T('Edit list','עריכת רשימה'):a.T('New list','רשימה חדשה')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={()=>!saving&&guard(onClose)}><X size={20}/></button></header>
  <div className="tasks-sheet-body"><FormSection T={a.T} icon={SecDetails} tone="blue" title={a.T('Details','פרטים')}><div className="name-row"><button type="button" className="icon-choice-button" aria-label={a.T('Choose an icon','בחירת אייקון')} onClick={()=>a.setIconPicker({selected:icon,onSelect:setIcon})}><Icon code={icon} size={38}/><CaretDown size={18}/></button><label>{a.T('List name','שם הרשימה')}<input autoFocus={allowInitialTextFocus()} value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder={a.T('e.g. Weekend chores','למשל, מטלות סוף שבוע')}/></label></div>
  </FormSection><FormSection T={a.T} icon={SecPrivacy} tone="lilac" title={a.T('Privacy & permissions','פרטיות והרשאות')}><fieldset className="tasks-sheet-choices"><legend>{a.T('Who can see it','מי יכול לראות')}</legend>{choices.map(([k,t,I])=><label key={k} className={'tasks-choice'+(visibility===k?' on':'')}><input type="radio" name="list-visibility" checked={visibility===k} onChange={()=>setVisibility(k)}/><I/><span>{t}</span>{k==='family'&&<span className="tasks-choice-people"><AvatarStack ids={a.members.map(m=>m.id)} Avatar={Avatar} name={a.name} size={26}/></span>}</label>)}</fieldset>
  {visibility==='selected'&&<div className="tasks-sheet-people">{others.map(m=><PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={allowed.includes(m.id)} onClick={()=>setAllowed(allowed.includes(m.id)?allowed.filter(x=>x!==m.id):[...allowed,m.id])}/>)}</div>}
  <p className="tasks-sheet-hint">{a.T('Tasks in this list are visible to exactly these people.','משימות ברשימה הזו גלויות בדיוק לאנשים האלה.')}</p>
  </FormSection>{error&&<p role="alert" className="ai-error">{error}</p>}
  </div><div className="tasks-sheet-actions"><Button secondary onClick={()=>!saving&&guard(onClose)}>{a.T('Cancel','ביטול')}</Button><Button disabled={saving} type="submit">{editing?a.T('Save list','שמירת הרשימה'):a.T('Create list','יצירת רשימה')}</Button>{editing&&<Button secondary icon={Trash} onClick={()=>{if(window.confirm(a.T('Delete this list? Its tasks stay in All tasks.','למחוק את הרשימה? המשימות יישארו בכל המשימות.'))){commit(()=>a.update(d=>{d.taskLists=d.taskLists.filter(x=>x.id!==editing.id);for(const t of d.tasks)if(t.listId===editing.id&&t.ownerId===a.user)delete t.listId}),onDeleted)}}}>{a.T('Delete list','מחיקת רשימה')}</Button>}</div>
 </form></div>;
}
const LockSimpleIcon=()=> <LockSimple size={20}/>;
const UsersIcon=()=> <Users size={20}/>;
