// Tasks page: shareable task lists, one-row filters (range, date, people, status, search), tasks grouped by
// day with overdue and anytime groups, subtasks, and a detail panel in the Calendar detail style.
import React,{useMemo,useState} from 'react';
import {ShoppingCart,Plus,MagnifyingGlass,LockSimple,Users,Repeat,Clock,CalendarDots,UserCircle,Stack,PencilSimple,Trash,X,Check,ListChecks,NotePencil,CaretDown} from '@phosphor-icons/react';
import {occursOn,completionState} from './domain';
import {DateField} from './date-field';
import {canAccessList,applyListAudience,createTaskList} from '../../shared/task-lists.mjs';

const addDays=(v,n)=>{const d=new Date(v+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const uid=()=>crypto.randomUUID();

export function TasksView({app:a,anchor,ui:{Heading,Button,Badge,Avatar,Icon,Checkbox,DetailPanel,Empty}}){
 const q=new URLSearchParams(a.route.split('?')[1]||''),parent=a.member(a.user).role==='parent',he=a.lang==='he',locale=he?'he-IL':'en-US';
 const [listId,setListId]=useState(q.get('list')||'all'),[range,setRange]=useState(q.get('date')?'day':'today'),[day,setDay]=useState(q.get('date')||anchor),[person,setPerson]=useState('all'),[status,setStatus]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState(q.get('task')?{id:q.get('task'),date:q.get('date')||anchor}:null),[detailOpen,setDetailOpen]=useState(!!q.get('task')),[sheet,setSheet]=useState(null);
 const lists=(a.data.taskLists||[]).filter(l=>canAccessList(l,a.user));
 const base=a.visible(a.data.tasks).filter(t=>parent||t.memberId===a.user||t.ownerId===a.user);
 const inList=t=>listId==='all'||t.listId===listId;
 const matches=t=>inList(t)&&(person==='all'||t.memberId===person)&&(!search||[a.text(t),t.note,t.noteHe].join(' ').toLowerCase().includes(search.toLowerCase()));
 const label=d=>d===anchor?a.T('Today','היום'):d===addDays(anchor,1)?a.T('Tomorrow','מחר'):d===addDays(anchor,-1)?a.T('Yesterday','אתמול'):new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'short'});
 const anyDate=t=>{const last=Object.entries(t.completions||{}).sort(([x],[y])=>x.localeCompare(y)).pop();return last&&last[1]?.state!=='open'?last[0]:anchor};
 const stateOf=(t,date)=>t.date?completionState(t,date):completionState(t,anyDate(t));
 const tripProgress=t=>{if(!t.shoppingListId)return null;const items=(a.data.shopping||[]).filter(i=>(i.listId||'week')===t.shoppingListId);return items.length?items.filter(i=>i.done).length+'/'+items.length:null};
 const groups=useMemo(()=>{
  const out=[],pool=base.filter(matches),keep=state=>status==='all'||(status==='done'?state==='done':state!=='done');
  const dates=range==='day'?[day]:range==='today'?[anchor]:Array.from({length:range==='week'?7:14},(_,i)=>addDays(anchor,i));
  if(range!=='day'){const overdue=pool.filter(t=>t.date&&t.date<anchor&&(t.repeat||'once')==='once'&&!t.routine&&completionState(t,t.date)!=='done').map(t=>({t,date:t.date}));if(overdue.length&&status!=='done')out.push({key:'overdue',title:a.T('Overdue','באיחור'),tone:'overdue',rows:overdue})}
  for(const d of dates){const rows=pool.filter(t=>occursOn(t,d)).map(t=>({t,date:d})).filter(r=>keep(completionState(r.t,r.date))).sort((x,y)=>(x.t.time||'99').localeCompare(y.t.time||'99'));if(rows.length)out.push({key:d,title:label(d),tone:d===anchor?'today':'',rows})}
  if(range!=='day'){const anytime=pool.filter(t=>!t.date).map(t=>({t,date:anyDate(t)})).filter(r=>keep(completionState(r.t,r.date)));if(anytime.length)out.push({key:'anytime',title:a.T('Anytime','בלי תאריך'),tone:'',rows:anytime})}
  return out;
 },[base,listId,person,status,search,range,day,anchor,a.lang]);
 const total=groups.reduce((n,g)=>n+g.rows.length,0);
 const current=selected&&base.find(t=>t.id===selected.id)?{t:base.find(t=>t.id===selected.id),date:selected.date}:groups[0]?.rows[0];
 const canEdit=t=>parent||t.ownerId===a.user;
 const listOf=t=>lists.find(l=>l.id===t.listId);
 const repeatLabel=t=>{const r=(t.repeat||(t.routine?'daily':'once')).toLowerCase();return r==='once'?'':r==='daily'?a.T('Daily','יומי'):r==='weekly'?a.T('Weekly','שבועי'):r==='monthly'?a.T('Monthly','חודשי'):a.T('Repeats','חוזר')};
 const subProgress=t=>t.subtasks?.length?(t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length):'';
 const countIn=id=>base.filter(t=>(id==='all'||t.listId===id)&&(!t.date||completionState(t,t.date>anchor?t.date:anchor)!=='done')).length;
 const shareText=l=>l.visibility==='family'?a.T('Family','כל המשפחה'):l.visibility==='private'?a.T('Only me','רק אני'):a.T('Shared','משותף');
 const pick=(t,date)=>{setSelected({id:t.id,date});setDetailOpen(true)};

 const rangeButtons=[['today',a.T('Today','היום')],['week',a.T('This week','השבוע')],['upcoming',a.T('Upcoming','בקרוב')]];
 return <div className="tasks-v2">
  <Heading title={a.T('Little things, shared.','דברים קטנים, ביחד.')} subtitle={new Date(anchor+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'})} action={<><Button icon={Plus} onClick={()=>a.go('tasks/new'+(listId!=='all'?'?list='+encodeURIComponent(listId):''))}>{a.T('New task','משימה חדשה')}</Button><Button secondary icon={Plus} onClick={()=>setSheet({mode:'new'})}>{a.T('New list','רשימה חדשה')}</Button></>}/>

  <div className="tasks-lists" role="tablist" aria-label={a.T('Task lists','רשימות משימות')}>
   <button type="button" role="tab" aria-selected={listId==='all'} className={'tasks-list-card'+(listId==='all'?' chosen':'')} onClick={()=>setListId('all')}><span className="tasks-list-icon"><Stack size={26}/></span><span className="tasks-list-text"><strong>{a.T('All tasks','כל המשימות')}</strong><small>{a.T('Everything you can see','כל מה שגלוי לכם')}</small></span><span className="tasks-list-count">{countIn('all')}</span></button>
   {lists.map(l=><button type="button" role="tab" aria-selected={listId===l.id} key={l.id} className={'tasks-list-card'+(listId===l.id?' chosen':'')} onClick={()=>setListId(l.id)}><span className="tasks-list-icon"><Icon code={l.icon||'1F4CB'} size={34}/></span><span className="tasks-list-text"><strong>{he?l.he||l.name:l.name}</strong><small>{countIn(l.id)} · {shareText(l)}</small></span>{l.visibility==='private'?<LockSimple size={20} className="tasks-list-lock"/>:<span className="tasks-list-people">{(l.visibility==='family'?a.members.map(m=>m.id):[l.ownerId,...l.allowedIds]).slice(0,4).map(id=><Avatar key={id} who={id} size={28}/>)}</span>}{l.ownerId===a.user&&listId===l.id&&<span className="tasks-list-edit" role="button" tabIndex={0} aria-label={a.T('Edit list','עריכת רשימה')} onClick={e=>{e.stopPropagation();setSheet({mode:'edit',list:l})}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();setSheet({mode:'edit',list:l})}}}><PencilSimple size={16}/></span>}</button>)}
   <button type="button" className="tasks-list-card tasks-list-new" onClick={()=>setSheet({mode:'new'})}><Plus size={22}/><strong>{a.T('New list','רשימה חדשה')}</strong></button>
  </div>

  <div className="tasks-filters">
   <div className="tasks-range" role="group" aria-label={a.T('When','מתי')}>{rangeButtons.map(([k,t])=><button type="button" key={k} aria-pressed={range===k} className={range===k?'on':''} onClick={()=>setRange(k)}>{t}</button>)}<DateField variant="toolbar" className={'tasks-day'+(range==='day'?' on':'')} required aria-label={a.T('Choose a day','בחירת יום')} value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setRange('day')}}}/></div>
   <div className="tasks-people calendar-person-legend"><button type="button" className={'calendar-all-members '+(person==='all'?'chosen':'')} onClick={()=>setPerson('all')}><Users size={18}/>{a.T('Everyone','כולם')}</button>{a.members.filter(m=>parent||m.id===a.user).map(m=><button type="button" key={m.id} aria-pressed={person===m.id} className={'calendar-person '+m.color+(person===m.id?' chosen':'')} onClick={()=>setPerson(person===m.id?'all':m.id)}><Avatar who={m.id} size={40}/><span>{a.name(m.id)}</span></button>)}</div>
   <div className="tasks-status" role="group" aria-label={a.T('Status','מצב')}>{[['all',a.T('All','הכל')],['open',a.T('To do','לביצוע')],['done',a.T('Done','בוצע')]].map(([k,t])=><button type="button" key={k} aria-pressed={status===k} className={status===k?'on':''} onClick={()=>setStatus(k)}>{t}</button>)}</div>
   <label className="tasks-search"><MagnifyingGlass size={18}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={a.T('Search tasks','חיפוש משימות')} aria-label={a.T('Search tasks','חיפוש משימות')}/></label>
  </div>

  <div className="split task-list-layout tasks-v2-layout"><section className="tasks-groups">
   {groups.map(g=><section key={g.key} className={'tasks-group '+(g.tone?'tone-'+g.tone:'')}><h3><span>{g.title}</span><small>{g.rows.length}</small></h3>
    {g.rows.map(({t,date})=>{const state=completionState(t,date),l=listOf(t),focused=current&&current.t.id===t.id&&current.date===date;return <div key={t.id+date} className={'task-row detailed tasks-row'+(state==='done'?' done':'')+(focused?' focused':'')}>
     <Checkbox checked={state==='done'} disabled={state==='pending'&&!parent} onChange={()=>a.toggleTask(t.id,date)} aria-label={a.text(t)}/>
     <Icon code={t.icon}/>
     <button type="button" className="task-title tasks-row-main" onClick={()=>pick(t,date)}><strong>{a.text(t)}</strong><small className="tasks-meta">{t.time&&<span dir="ltr"><Clock size={14}/>{t.time}</span>}{repeatLabel(t)&&<span><Repeat size={14}/>{repeatLabel(t)}</span>}{l&&<span className="tasks-meta-list">{he?l.he||l.name:l.name}</span>}{subProgress(t)&&<span><ListChecks size={14}/>{subProgress(t)}</span>}{tripProgress(t)&&<span className="tasks-meta-trip"><ShoppingCart size={14}/>{a.T(tripProgress(t)+' in the bag',tripProgress(t)+' בסל')}</span>}{state==='pending'&&<span>{a.T('Waiting for a parent','ממתין להורה')}</span>}</small></button>
     <span className={'tasks-assignee '+a.member(t.memberId).color}><Avatar who={t.memberId} size={30}/><span>{a.name(t.memberId)}</span></span>
     {!!t.xp&&<Badge color="green">+{t.xp} XP</Badge>}{t.visibility==='private'&&<LockSimple size={18}/>}
    </div>})}
   </section>)}
   {!total&&<Empty text={search||person!=='all'||listId!=='all'?a.T('No tasks match these filters.','אין משימות שמתאימות לסינון.'):a.T('Nothing here yet. Add the next little thing.','עוד אין כאן משימות. הוסיפו את הדבר הקטן הבא.')}/>}
  </section>
  <DetailPanel open={detailOpen} onClose={()=>setDetailOpen(false)} title={a.T('Task details','פרטי המשימה')} className="calendar-event-details">{current?<TaskDetail a={a} t={current.t} date={current.date} lists={lists} canEdit={canEdit(current.t)} ui={{Button,Badge,Avatar,Icon,Checkbox}} repeatLabel={repeatLabel} onClose={()=>setDetailOpen(false)}/>:<Empty text={a.T('Choose a task to see its details.','בחרו משימה כדי לראות פרטים.')}/>}</DetailPanel>
  </div>
  {sheet&&<ListSheet a={a} sheet={sheet} ui={{Button,Avatar,Icon}} onClose={()=>setSheet(null)} onCreated={id=>{setListId(id);setSheet(null)}} onDeleted={()=>{setListId('all');setSheet(null)}}/>}
 </div>;
}

function TaskDetail({a,t,date,lists,canEdit,ui:{Button,Badge,Avatar,Icon,Checkbox},repeatLabel}){
 const [newSub,setNewSub]=useState(''),locale=a.lang==='he'?'he-IL':'en-US',l=lists.find(x=>x.id===t.listId),owner=t.ownerId===a.user;
 const when=t.date?new Date(date+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}):a.T('Anytime','בלי תאריך');
 const edit=fn=>a.update(d=>{const x=d.tasks.find(r=>r.id===t.id);if(x)fn(x,d)});
 const addSub=e=>{e.preventDefault();const title=newSub.trim();if(!title)return;edit(x=>{x.subtasks=[...(x.subtasks||[]),{id:uid(),title,done:false}]});setNewSub('')};
 return <div className="task-detail-v2">
  <div className="calendar-detail-heading tasks-detail-heading"><span className="tasks-detail-icon"><Icon code={t.icon} size={72}/></span><h2><span>{a.text(t)}<img src="/assets/generated/title-underline-clean.png" alt=""/></span></h2></div>
  {t.routine&&<div className="journal-detail-kind"><Badge color="yellow">{a.T('Kids routine','שגרת ילדים')}{t.xp?' · +'+t.xp+' XP':''}</Badge></div>}
  <div className="calendar-detail-row"><UserCircle size={27}/><span className="tasks-detail-person"><Avatar who={t.memberId} size={34}/>{a.name(t.memberId)}</span></div>
  <div className="calendar-detail-row"><CalendarDots size={27}/><strong>{when}</strong>{t.time&&<time dir="ltr" className="tasks-detail-time">· {t.time}</time>}</div>
  {repeatLabel(t)&&<div className="calendar-detail-row"><Repeat size={27}/><span>{repeatLabel(t)}</span></div>}
  {!t.shoppingListId&&<div className="calendar-detail-row"><Stack size={27}/>{owner&&!t.routine?<select className="tasks-detail-list" aria-label={a.T('List','רשימה')} value={t.listId||''} onChange={e=>edit((x,d)=>{const target=(d.taskLists||[]).find(r=>r.id===e.target.value);if(target)applyListAudience(x,target);else delete x.listId})}><option value="">{a.T('No list','ללא רשימה')}</option>{lists.filter(x=>canAccessList(x,a.user)).map(x=><option key={x.id} value={x.id}>{a.lang==='he'?x.he||x.name:x.name}</option>)}</select>:<span>{l?(a.lang==='he'?l.he||l.name:l.name):a.T('No list','ללא רשימה')}</span>}</div>}
  <div className="calendar-detail-row"><span className="journal-detail-lock">{t.visibility==='private'?<LockSimple size={27}/>:<Users size={27}/>}</span><span>{t.visibility==='private'?a.T('Only me','רק אני'):t.visibility==='selected'?a.T('Selected people','אנשים נבחרים'):a.T('Whole family','כל המשפחה')}</span></div>
  <div className="calendar-detail-section tasks-subtasks"><div className="calendar-detail-row"><ListChecks size={27}/><span>{a.T('Subtasks','תת־משימות')}</span>{t.subtasks?.length>0&&<small>{t.subtasks.filter(s=>s.done).length}/{t.subtasks.length}</small>}</div>
   {(t.subtasks||[]).map(s=><div key={s.id} className={'tasks-subtask'+(s.done?' done':'')}><Checkbox checked={!!s.done} disabled={!canEdit} onChange={()=>edit(x=>{const y=x.subtasks.find(v=>v.id===s.id);y.done=!y.done})} aria-label={s.title}/><span>{s.title}</span>{canEdit&&<button type="button" className="icon-button" aria-label={a.T('Remove','הסרה')} onClick={()=>edit(x=>{x.subtasks=x.subtasks.filter(v=>v.id!==s.id)})}><X size={16}/></button>}</div>)}
   {canEdit&&<form className="tasks-subtask-add" onSubmit={addSub}><input value={newSub} onChange={e=>setNewSub(e.target.value)} maxLength={120} placeholder={a.T('Add a step','הוספת שלב')} aria-label={a.T('Add a subtask','הוספת תת־משימה')}/><button type="submit" className="icon-button" aria-label={a.T('Add','הוספה')} disabled={!newSub.trim()}><Plus size={18}/></button></form>}
   {!canEdit&&!(t.subtasks||[]).length&&<p className="muted">{a.T('No steps yet.','אין עדיין שלבים.')}</p>}
  </div>
  {t.shoppingListId&&<div className="calendar-detail-row tasks-detail-trip"><ShoppingCart size={27}/><span>{a.T('Shopping trip','קנייה מתוכננת')}</span><Button secondary onClick={()=>a.go('shopping?list='+encodeURIComponent(t.shoppingListId))}>{a.T('Open shopping list','פתיחת רשימת הקניות')}</Button></div>}{(t.note||t.noteHe)&&<div className="calendar-detail-section"><div className="calendar-detail-row"><NotePencil size={27}/><span>{a.T('Note','הערה')}</span></div><p className="journal-detail-text">{a.lang==='he'?t.noteHe||t.note:t.note}</p></div>}
  <div className="journal-detail-actions">{canEdit&&<Button icon={PencilSimple} onClick={()=>a.go((t.routine?'kids':'tasks')+'/edit?'+t.id)}>{a.T('Edit task','עריכת משימה')}</Button>}{owner&&<Button secondary icon={Trash} onClick={()=>{if(window.confirm(a.T('Delete this task?','למחוק את המשימה?')))a.update(d=>{d.tasks=d.tasks.filter(x=>x.id!==t.id)})}}>{a.T('Delete','מחיקה')}</Button>}</div>
 </div>;
}

function ListSheet({a,sheet,ui:{Button,Avatar,Icon},onClose,onCreated,onDeleted}){
 const editing=sheet.mode==='edit'?sheet.list:null,others=a.members.filter(m=>m.id!==a.user);
 const [name,setName]=useState(editing?(a.lang==='he'?editing.he||editing.name:editing.name):''),[icon,setIcon]=useState(editing?.icon||'1F4CB'),[visibility,setVisibility]=useState(editing?.visibility||'family'),[allowed,setAllowed]=useState(editing?.allowedIds||[]),[error,setError]=useState('');
 const save=e=>{e.preventDefault();if(!name.trim())return setError(a.T('Give the list a name.','תנו לרשימה שם.'));if(visibility==='selected'&&!allowed.length)return setError(a.T('Choose who can see it.','בחרו מי יכול לראות.'));
  if(editing){a.update(d=>{const l=d.taskLists.find(x=>x.id===editing.id);Object.assign(l,{name:name.trim(),he:name.trim(),icon,visibility,allowedIds:visibility==='selected'?allowed:[]});for(const t of d.tasks)if(t.listId===l.id&&t.ownerId===a.user)applyListAudience(t,l)});a.notify(a.T('List saved.','הרשימה נשמרה.'));onClose();return}
  const id=uid();try{a.update(d=>{createTaskList(d,{id,name,icon,ownerId:a.user,visibility,allowedIds:allowed,memberIds:a.members.map(m=>m.id)})});onCreated(id)}catch(err){setError(err.message)}};
 const choices=[['private',a.T('Only me','רק אני'),LockSimpleIcon],['family',a.T('Whole family','כל המשפחה'),UsersIcon],['selected',a.T('Selected people','אנשים נבחרים'),UsersIcon]];
 return <div className="modal-backdrop tasks-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="tasks-sheet" role="dialog" aria-modal="true" aria-label={editing?a.T('Edit list','עריכת רשימה'):a.T('New list','רשימה חדשה')} onSubmit={save}>
  <header><h2>{editing?a.T('Edit list','עריכת רשימה'):a.T('New list','רשימה חדשה')}</h2><button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={onClose}><X size={20}/></button></header>
  <div className="name-row"><button type="button" className="icon-choice-button" aria-label={a.T('Choose an icon','בחירת אייקון')} onClick={()=>a.setIconPicker({selected:icon,onSelect:setIcon})}><Icon code={icon} size={38}/><CaretDown size={18}/></button><label>{a.T('List name','שם הרשימה')}<input autoFocus value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder={a.T('e.g. Weekend chores','למשל, מטלות סוף שבוע')}/></label></div>
  <fieldset className="tasks-sheet-choices"><legend>{a.T('Who can see it','מי יכול לראות')}</legend>{choices.map(([k,t,I])=><label key={k} className={'tasks-choice'+(visibility===k?' on':'')}><input type="radio" name="list-visibility" checked={visibility===k} onChange={()=>setVisibility(k)}/><I/><span>{t}</span>{k==='family'&&<span className="tasks-choice-people">{a.members.slice(0,4).map(m=><Avatar key={m.id} who={m.id} size={26}/>)}</span>}</label>)}</fieldset>
  {visibility==='selected'&&<div className="tasks-sheet-people">{others.map(m=><button type="button" key={m.id} aria-pressed={allowed.includes(m.id)} className={'calendar-person '+m.color+(allowed.includes(m.id)?' chosen':'')} onClick={()=>setAllowed(allowed.includes(m.id)?allowed.filter(x=>x!==m.id):[...allowed,m.id])}><Avatar who={m.id} size={36}/><span>{a.name(m.id)}</span>{allowed.includes(m.id)&&<Check size={16}/>}</button>)}</div>}
  <p className="tasks-sheet-hint">{a.T('Tasks in this list are visible to exactly these people.','משימות ברשימה הזו גלויות בדיוק לאנשים האלה.')}</p>
  {error&&<p role="alert" className="ai-error">{error}</p>}
  <div className="tasks-sheet-actions"><Button type="submit">{editing?a.T('Save list','שמירת הרשימה'):a.T('Create list','יצירת רשימה')}</Button>{editing&&<Button secondary icon={Trash} onClick={()=>{if(window.confirm(a.T('Delete this list? Its tasks stay in All tasks.','למחוק את הרשימה? המשימות יישארו בכל המשימות.'))){a.update(d=>{d.taskLists=d.taskLists.filter(x=>x.id!==editing.id);for(const t of d.tasks)if(t.listId===editing.id&&t.ownerId===a.user)delete t.listId});onDeleted()}}}>{a.T('Delete list','מחיקת רשימה')}</Button>}</div>
 </form></div>;
}
const LockSimpleIcon=()=> <LockSimple size={20}/>;
const UsersIcon=()=> <Users size={20}/>;
