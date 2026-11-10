import {taskAssignedTo,taskMemberIds} from '../../shared/task-assignment.mjs';
import {isMine} from '../../shared/record-audience.mjs';
import {taskDoneUpdates} from '../../shared/task-completion-updates.mjs';
import React,{useState,useEffect,useRef} from 'react';
import {Bell,X,CheckCircle,Clock,Eye,ArrowRight,Sparkle,Trash} from '@phosphor-icons/react';
import {createPortal} from 'react-dom';
import {anchor} from './data';
import {occursOn,completionState} from './domain';
import {DensityToggle,densityOf} from './density';
import {financePrefs} from '../../shared/finance-goals.mjs';
import {maintenanceNotices} from '../../shared/maintenance-service.mjs';
import {insuranceAlerts} from '../../shared/insurance-lifecycle.mjs';
import {SwipeRow} from './swipe-row';
import './notifications-inbox.css';
import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
import {effectiveReminders,latestReminderAhead,daysAhead,shiftDate,whenLabel} from '../../shared/item-reminders.mjs';
import {changeBursts,describeChange} from '../../shared/change-notices.mjs';
export function notificationItems(a){
 const profile=a.data.profiles[a.user]||{},dismissed=new Set(profile.dismissedNotifications||[]),read=new Set(profile.readNotifications||[]),items=[],enabled=category=>(profile.notificationPrefs?.categories?.[category]?.enabled??profile.notificationPrefs?.enabled)!==false;
 for(const task of a.visible(a.data.tasks).filter(t=>occursOn(t,anchor))){const state=completionState(task,anchor),pending=state==='pending'&&a.member(a.user).role==='parent';if(enabled(task.routine?'routines':'tasks')&&(pending||state==='open'&&taskAssignedTo(task,a.user)))items.push({id:(pending?'approval:':'due:')+task.id+':'+anchor,title:pending?a.T(a.name(task.memberId)+' is waiting for approval',a.name(task.memberId)+' מחכה לאישור'):a.text(task),detail:pending?a.text(task):a.T('Today','היום')+(task.time?' · '+task.time:''),icon:task.icon,date:anchor,time:task.time||'',kind:pending?'approval':'reminder',target:'tasks?date='+anchor+'&task='+encodeURIComponent(task.id),who:task.memberId})}
 for(const event of a.visible(a.data.events).filter(e=>enabled('events')&&occursOn(e,anchor)&&isMine(e,a.user,'events')))items.push({id:'event:'+event.id+':'+anchor,title:a.text(event),detail:a.T('Today at ','היום ב־')+event.time,icon:event.icon,date:anchor,time:event.time,kind:'reminder',target:'calendar?date='+anchor+'&scope='+(event.visibility==='private'?'private':'family')+'&event='+encodeURIComponent(event.id),who:event.memberIds?.[0]});
 // Day-before reminders: one entry per later occurrence, replaced (and unread again) as each closer reminder comes due.
 const nowTime=new Date().toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const ahead=(record,kind,category,eligible,target)=>{if(!enabled(category))return;const choice=effectiveReminders(record,profile.notificationPrefs||{},category);if(!choice.leads.length)return;
  for(let k=1;k<=daysAhead(choice.leads);k++){const day=shiftDate(anchor,k);if(!eligible(day))continue;const r=latestReminderAhead(day,record,choice,{date:anchor,time:nowTime});
   if(r)items.push({id:'ahead:'+kind+':'+record.id+':'+day+':'+(record.time||'')+':'+r.lead,title:a.text(record),detail:whenLabel({date:day,time:record.time||''},{date:anchor,time:nowTime},a.lang),icon:record.icon,date:day,time:record.time||'',kind:'reminder',target:target(day),who:kind==='event'?record.memberIds?.[0]:record.memberId})}};
 for(const task of a.visible(a.data.tasks))if(task.category!=='maintenance'&&task.date&&isMine(task,a.user,'tasks')&&(task.time||Array.isArray(task.reminders)))ahead(task,'task',task.routine?'routines':'tasks',day=>occursOn(task,day)&&completionState(task,day)==='open',day=>'tasks?date='+day+'&task='+encodeURIComponent(task.id));
 for(const event of a.visible(a.data.events))if(event.memberIds?.includes(a.user)&&(event.time||Array.isArray(event.reminders)))ahead(event,'event','events',day=>occursOn(event,day),day=>'calendar?date='+day+'&scope='+(event.visibility==='private'?'private':'family')+'&event='+encodeURIComponent(event.id));
 const doneUpdates=taskDoneUpdates({tasks:a.visible(a.data.tasks),profiles:a.data.profiles},a.user,{date:anchor,days:7,limit:Infinity}),doneKeys=new Set(doneUpdates.map(u=>u.task.id+'|'+u.date));
 const visibleTasks=new Map(a.visible(a.data.tasks).map(t=>[t.id,t])),latest=new Map();for(const entry of a.visible(a.data.history||[]))if(!latest.has(entry.taskId+'|'+entry.date))latest.set(entry.taskId+'|'+entry.date,entry);
 for(const entry of [...latest.values()].filter(h=>h.date===anchor&&h.done&&(h.actorId||h.memberId)!==a.user&&enabled(visibleTasks.get(h.taskId)?.routine?'routines':'tasks')&&!doneKeys.has(h.taskId+'|'+h.date)).slice(0,15))items.push({id:'update:'+entry.id,title:a.T(a.name(entry.memberId)+' completed an activity',a.name(entry.memberId)+' השלים פעילות'),detail:a.text(entry),icon:entry.icon,date:entry.date,time:entry.time,kind:'update',target:(entry.visibility==='private'?'mine':'journal')+'?record='+encodeURIComponent(entry.id),who:entry.memberId});
 for(const {key,task,date,actorId} of doneUpdates){const c=task.completions[date],previous=latest.get(task.id+'|'+date);if(previous){if(dismissed.has('update:'+previous.id))continue;if(read.has('update:'+previous.id))read.add(key)}items.push({id:key,title:a.T(a.name(actorId)+' did it: '+a.text(task),a.name(actorId)+' ביצע/ה: '+a.text(task)),detail:(date===anchor?a.T('Today','היום'):new Date(date+'T12:00:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}))+(c.time?' · '+c.time:''),icon:task.icon,date,time:c.time||'',kind:'update',target:'tasks?date='+date+'&task='+encodeURIComponent(task.id),who:actorId})}
 // Overdue alerts retain the task's chosen delay for its owner and assignees.
 const shift=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)},recent=[0,-1,-2,-3,-4,-5,-6].map(n=>shift(anchor,n));
 for(const task of a.visible(a.data.tasks)){
  const after=Number(task.overdueAlert?.afterMinutes);if(!enabled(task.routine?'routines':'tasks')||!after||!(task.ownerId===a.user||taskAssignedTo(task,a.user)))continue;
  for(const date of recent.slice(0,3)){if(!task.date||!occursOn(task,date)||completionState(task,date)==='done')continue;const due=new Date(date+'T'+(task.time||'23:59')+':00');if(Number.isNaN(due.getTime())||Date.now()<due.getTime()+after*60000)continue;
   const mine=taskAssignedTo(task,a.user);items.push({id:'overdue:'+task.id+':'+date,title:mine?a.T('Not done yet: '+a.text(task),'עוד לא בוצע: '+a.text(task)):a.T(taskMemberIds(task).map(a.name).join(', ')+' · not done yet',taskMemberIds(task).map(a.name).join(', ')+' · עדיין לא בוצע'),detail:mine?a.T('It was due ','היה צריך להתבצע ')+(date===anchor?a.T('today','היום'):date)+(task.time?' · '+task.time:''):a.text(task)+(task.time?' · '+task.time:''),icon:task.icon,date,time:task.time||'',kind:'approval',target:'tasks?date='+date+'&task='+encodeURIComponent(task.id),who:task.memberId})}
 }
 const finance=financePrefs(profile);if(a.member(a.user).role!=='child'&&finance.enabled!==false&&finance.inApp!==false)items.push(...(a.moneyGoals?.messages||[]));
 if(profile.notificationPrefs?.enabled!==false&&profile.notificationPrefs?.categories?.tasks?.enabled!==false)items.push(...maintenanceNotices(a.visible(a.data.tasks),a.user,a.today||anchor).map(n=>({id:n.key,title:a.text(n.record),detail:a.T('Home care due: ','טיפול בבית לתאריך: ')+n.due,icon:n.record.icon,date:n.due,time:'',kind:'reminder',target:'household/maintenance?task='+encodeURIComponent(n.record.id),who:n.record.memberId})));
 // Changes to things assigned to me, by someone else (deleted, moved, renamed, new place, removed me). Shown as soon as
 // the server records them; quick successive edits to one item read as one entry. Own switch in Settings → Notifications.
 if(profile.notificationPrefs?.enabled!==false&&profile.notificationPrefs?.itemChanges!==false)for(const b of changeBursts(a.data.changeNotices||[],a.user).filter(b=>Date.now()-Date.parse(b.at)<7*86400000).slice(0,20)){const d=describeChange(b,a.lang,a.name),day=b.after?.date||b.before.date||'';items.push({id:b.key,title:d.headline+': '+d.title,detail:d.lines.join(' · '),icon:b.after?.icon||b.before.icon,date:day,time:(b.after||b.before).time||'',kind:'update',target:b.type==='changed'?(b.collection==='events'?'calendar?date='+day+'&event='+encodeURIComponent(b.itemId):'tasks?date='+day+'&task='+encodeURIComponent(b.itemId)):b.collection==='events'?'calendar':'tasks',who:b.actorIds[0]})}
 items.push(...insuranceAlerts({...a.data,insurances:a.visible(a.data.insurances||[]),documents:a.visible(a.data.documents||[])},a.user,{date:a.today||anchor,lang:a.lang}));
 return items.filter(n=>!dismissed.has(n.id)).map(n=>({...n,read:read.has(n.id)})).sort((x,y)=>Number(x.read)-Number(y.read)||Number(y.kind==='approval')-Number(x.kind==='approval')||(y.time||'').localeCompare(x.time||''));
}
export function NotificationInbox({app:a,close,ui:{Button,Badge,Tabs,Avatar,Icon}}){
 const panel=useRef(null),closeButton=useRef(null),list=useRef(null),pending=useRef(false);
 const [filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement;closeButton.current?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const elements=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el=>el.getClientRects().length&&el.getAttribute('aria-hidden')!=='true'),first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus?.()}},[]);
 useEffect(()=>{if(list.current)list.current.scrollTop=0;if(panel.current)panel.current.scrollTop=0},[filter]);
 const items=notificationItems(a),unread=items.filter(i=>!i.read).length,shown=items.filter(i=>filter==='unread'?!i.read:filter==='reminders'?i.kind==='reminder':true);
 const commit=async(fn,after)=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await a.update(fn);after?.()}catch{setError(a.T('The change was not saved. Your notifications have been restored. Try again.','השינוי לא נשמר. ההתראות הוחזרו ואפשר לנסות שוב.'))}finally{pending.current=false;setBusy(false)}};
 const mark=(ids,after)=>commit(d=>{const p=d.profiles[a.user];p.readNotifications=[...new Set([...(p.readNotifications||[]),...ids])]},after);
 const dismiss=ids=>commit(d=>{const p=d.profiles[a.user];p.dismissedNotifications=[...new Set([...(p.dismissedNotifications||[]),...ids])]});
 const emptyTitle=busy?a.T('Updating notifications…','מעדכנים את ההתראות…'):filter==='unread'?a.T('No unread notifications.','אין התראות שלא נקראו.'):filter==='reminders'?a.T('No reminders.','אין תזכורות.'):a.T('No notifications.','אין התראות.');
 const emptyDetail=busy?a.T('Waiting for the change to be saved.','ממתינים לשמירת השינוי.'):filter==='unread'&&items.length?a.T('You have read every notification. They are still in All.','כל ההתראות נקראו. אפשר עדיין לראות אותן בהכול.'):filter==='reminders'&&items.length?a.T('There are no reminders in your inbox. Other updates are in All.','אין כרגע תזכורות בתיבה. עדכונים אחרים מופיעים בהכול.'):a.T('New reminders and activity updates will appear here.','תזכורות ועדכוני פעילות חדשים יופיעו כאן.');
 return createPortal(<div className="notification-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}>
  <section ref={panel} className="notification-inbox notification-inbox-v2" role="dialog" aria-modal="true" aria-label={a.T('Notifications','התראות')}>
   <header><div><Bell size={28}/><h2>{a.T('Notifications','התראות')}</h2><Badge>{unread}</Badge></div><DensityToggle a={a} page="notifications" className="notification-density"/><button ref={closeButton} type="button" className="icon-button" aria-label={a.T('Close notifications','סגירת ההתראות')} onClick={close}><X size={26}/></button></header>
   <div className="notification-toolbar">
    <Tabs variant="filter" label={a.T('Filter notifications','סינון התראות')} value={filter} onChange={setFilter} items={[["all",a.T('All','הכול')],["unread",a.T('Unread','לא נקראו')],["reminders",a.T('Reminders','תזכורות')]]}/>
    <div className="notification-bulk-actions"><Button secondary icon={CheckCircle} disabled={busy||!unread} onClick={()=>mark(items.map(i=>i.id))}>{a.T('Mark all read','סימון הכול כנקרא')}</Button><Button secondary icon={Trash} disabled={busy||!items.length} onClick={()=>dismiss(items.map(i=>i.id))}>{a.T('Remove all','מחיקת הכול')}</Button></div>
    {items.length>0&&<small className="notification-swipe-hint">{a.T('Swipe left to remove a notification.','החליקו שמאלה למחיקת התראה.')}</small>}
    {error&&<p className="notification-save-error" role="alert">{error}</p>}
   </div>
   <div ref={list} aria-busy={busy} className={'notification-items'+(densityOf(a.data,a.user,'notifications')==='compact'?' density-compact':'')}>
    {shown.map(item=><SwipeRow key={item.id} className="notification-swipe" direction="left" fullSwipe label={a.T('Remove','מחיקה')} onDelete={()=>dismiss([item.id])}>
     <article className={'notification-item '+(!item.read?'unread':'')}><Avatar who={item.who||a.user} size={48}/><div><strong>{item.title}</strong><p>{item.detail}</p><small><span className="notification-kind">{item.kind==='insurance'?a.T('Insurance & documents','ביטוחים ומסמכים'):item.kind==='finance'?a.T('Money goal alert','התראה כספית'):item.kind==='approval'?a.T('Approval requested','נדרש אישור'):item.kind==='update'?a.T('Activity update','עדכון פעילות'):a.T('On your schedule','בלוח הזמנים שלכם')}</span><span className="notification-sep">{item.time?' · ':''}</span><time dir="ltr">{item.time||''}</time></small><button type="button" disabled={busy} className="text-link" aria-label={a.T('Open '+item.title,'פתיחת '+item.title)} onClick={()=>mark([item.id],()=>{close();a.go(item.target)})}>{a.T('Open','פתיחה')}<ArrowRight size={16}/></button></div><button type="button" className="icon-button" disabled={busy} aria-label={a.T('Remove '+item.title,'מחיקת '+item.title)} onClick={()=>dismiss([item.id])}><Trash size={20}/></button></article>
    </SwipeRow>)}
    {!shown.length&&<div className="notifications-empty" role="status"><CheckCircle size={42}/><h3>{emptyTitle}</h3><p>{emptyDetail}</p>{!busy&&filter!=='all'&&items.length>0&&<Button secondary onClick={()=>setFilter('all')}>{a.T('Show all notifications','הצגת כל ההתראות')}</Button>}</div>}
   </div>
   <footer><small>{a.T('Your in-app inbox. Phone and Telegram delivery need a configured service.','תיבת העדכונים שלכם באפליקציה. משלוח לטלפון ולטלגרם דורש הגדרת שירות.')}</small><div><Button quiet icon={Bell} onClick={()=>{close();a.go('settings/notifications')}}>{a.T('Notification settings','הגדרות התראות')}</Button>{a.features?.route('ai')!==false&&<Button quiet icon={Sparkle} onClick={()=>{close();a.go('ai/suggestions')}}>{a.T('Daily suggestions','הצעות יומיות')}</Button>}</div></footer>
  </section>
 </div>,document.body)
}
