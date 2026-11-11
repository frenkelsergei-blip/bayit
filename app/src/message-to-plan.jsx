import React,{useState} from 'react';
import {CalendarDots, ClipboardText, Plus, Sparkle, Trash} from '@phosphor-icons/react';
import {DateField} from './date-field';
import {TimeField} from './time-field';
import {FormSection} from './form-section';
import {HouseholdForm} from './household-form';
import {ReminderListEditor} from './item-reminder';
import {PersonChip} from './person-chip';
import {Select} from './Select';
import {prepareMessagePlan,messagePlanReceipt,messagePlanAvailable,messagePlanKinds} from '../../shared/message-plan.mjs';
import {cloudHeaders} from './cloud-transport';
import {useOnline} from './offline-ui';
import './home-planning.css';

const readFile = file => new Promise((resolve,reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result).split(',')[1]);
 reader.onerror = reject;
 reader.readAsDataURL(file);
});
async function planRequest(action, body) {
 let response;
 try {response = await fetch('/api/message-plan/'+action,{method:'POST',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(action==='extract'?55000:30000)});}
 catch (error) {throw Object.assign(Error('offline'),{network:true,cause:error});}
 const data = await response.json().catch(()=>({}));
 if (!response.ok) throw Object.assign(Error(data.error),{status:response.status});
 return data;
}
// Like the task and event forms, a draft item starts assigned to its author: reminders reach whoever it is assigned to.
const blank = (kind,user) => ({key:crypto.randomUUID(),kind,title:'',date:'',time:'',note:'',allDay:false,assignees:user?[user]:[],visibility:'private',reminders:null,reminderRequested:false});
const withoutTime = item => item.allDay || !item.time;
// Features registry: plans need Ask AI, and each kind its own feature (events: Calendar, tasks: Tasks).
const featureOn = a => id => a.features ? a.features.on(id) : true;
export const planAvailable = a => messagePlanAvailable(featureOn(a));
export const planKinds = a => messagePlanKinds(featureOn(a));

export function MessageToPlan({a,Button,Avatar}) {
 const [open,setOpen] = useState(false);
 if (!planAvailable(a)) return null;
 return <><Button secondary icon={ClipboardText} onClick={() => setOpen(true)}>{a.T('Message to plan','מהודעה לתוכנית')}</Button>
  {open && <MessageReview a={a} Avatar={Avatar} close={() => setOpen(false)}/>}</>;
}

export function MessageReview({a,Avatar,close,initialSource=''}) {
 const {T} = a;
 const [id] = useState(() => crypto.randomUUID());
 const [source,setSource] = useState(initialSource);
 const [file,setFile] = useState(null);
 const [title,setTitle] = useState('');
 const [items,setItems] = useState([]);
 const [busy,setBusy] = useState('');
 const [error,setError] = useState('');
 // AI drafts and the server save need the connection. Offline, a hand-made plan waits on the device like any other edit.
 const online = useOnline();
 const kinds = planKinds(a);
 const change = (key,next) => {
  setError('');
  setItems(current=>current.map(item=>item.key===key ? {...item,...next} : item));
 };
 const changeSchedule = (item,next) => {
  if (withoutTime(item)!==withoutTime({...item,...next}) && item.reminders?.length) {
   Object.assign(next,{reminders:[],reminderRequested:true});
  }
  change(item.key,next);
 };
 const extract = async () => {
  if (items.length) return;
  setBusy('extract');setError('');
  try {
   if (file && file.size>2*1024*1024) {setError(T('Choose a file up to 2 MB.','בחרו קובץ בגודל עד 2 מ״ב.'));return;}
   const result = await planRequest('extract',{text:source,...(file?{file:await readFile(file)}:{})});
   setTitle(result.title||'');
   setItems(result.items.filter(item => kinds.includes(item.kind)).map(item => ({...blank(item.kind,a.user),...item,reminders:item.reminderRequested ? item.reminders||[] : null})));
   if (!result.items.some(item => kinds.includes(item.kind))) setError(kinds.length===2 ? T('No events or tasks were found. You can add a draft below.','לא נמצאו אירועים או משימות. אפשר להוסיף טיוטה למטה.')
    : kinds[0]==='event' ? T('No events were found. You can add a draft below.','לא נמצאו אירועים. אפשר להוסיף טיוטה למטה.')
    : T('No tasks were found. You can add a draft below.','לא נמצאו משימות. אפשר להוסיף טיוטה למטה.'));
  } catch (error) {
   setError(error?.network
    ? T('No connection. Preparing a draft with AI needs the internet. You can add drafts by hand below.','אין חיבור. הכנת טיוטה עם AI דורשת אינטרנט. אפשר להוסיף טיוטות ידנית למטה.')
    : error?.status===429 ? T('Too many drafts in a short time. Wait a minute and try again, or add drafts by hand below.','יותר מדי טיוטות בזמן קצר. חכו דקה ונסו שוב, או הוסיפו טיוטות ידנית למטה.')
    : T('Could not prepare a draft. Check the AI connection or add the details below.','לא הצלחנו להכין טיוטה. בדקו את חיבור ה־AI או הוסיפו פרטים למטה.'));
  }
  finally {setBusy('');}
 };
 const save = async event => {
  event.preventDefault();
  if (busy) return;
  if (items.some(item=>item.reminderRequested && (!item.date || !item.reminders?.length))) {
   setError(T('Set a date and time for each requested reminder, or remove the reminder from the draft.','בחרו תאריך ושעה לכל תזכורת שביקשתם, או הסירו אותה מהטיוטה.'));
   return;
  }
  setBusy('save');setError('');
  const actor = a.member(a.user);
  const body = {id,title,items};
  try {
   const prepared = prepareMessagePlan(body,actor,a.members);
   const receipt = messagePlanReceipt(body,actor.id,prepared);
   let queued = false;
   if (a.cloud && online) {
    await planRequest('apply',body);
    await a.cloud.client.poll();
   }
   else {
    try {
     const accepted = await a.update(data => {
      for (const {collection,record} of prepared) if (!data[collection].some(row=>row.id===record.id)) data[collection].push(record);
      data.aiOperations ||= {};
      if (!data.aiOperations[receipt.id]) data.aiOperations[receipt.id] = receipt;
     });
     if (accepted === false) throw Error();
    } catch (error) {
     if (!error?.queued) throw error;
     queued = true;
    }
   }
   a.notify(queued ? T('Plan kept on this device. It syncs when you’re back online.','התוכנית נשמרה במכשיר ותסתנכרן כשהחיבור יחזור.') : T('Plan saved.','התוכנית נשמרה.'));
   close();
   a.go('today?plan='+encodeURIComponent(receipt.id));
  } catch (error) {
   setError(error?.network
    ? T('No connection. Your draft is still here. Try saving again when you’re back online.','אין חיבור. הטיוטה נשארת כאן. נסו לשמור שוב כשהחיבור יחזור.')
    : T('Check the titles, dates and times, or mark an event as all day. If the fields are valid, try saving again.','בדקו את הכותרות, התאריכים והשעות, או סמנו אירוע לכל היום. אם הפרטים נכונים, נסו לשמור שוב.'));
  }
  finally {setBusy('');}
 };
 return <HouseholdForm a={a} title={T('Message to plan','מהודעה לתוכנית')} className="message-plan" wide onClose={close} onSubmit={save} saving={!!busy} error={error}
  actions={<button className="button" disabled={!items.length||!!busy} type="submit">{T('Save plan','שמירת התוכנית')}</button>}>
  <FormSection className="message-plan-source" icon={ClipboardText} title={T('Plan source','מקור התוכנית')} collapsible={!!items.length} defaultOpen={false} T={T}>
   <label>{T('Message or request','הודעה או בקשה')}<textarea dir="auto" value={source} maxLength={12000} disabled={!!busy||!!items.length} placeholder={T('Plan the trip, and remind me to pack on Thursday at 19:00…','תכננו את הטיול ותזכירו לי לארוז בחמישי ב־19:00…')} onChange={e=>setSource(e.target.value)}/></label>
   <label>{T('Photo or PDF','צילום או PDF')}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={!!busy||!!items.length} onChange={e=>setFile(e.target.files[0]||null)}/></label>
   {a.cloud && <button type="button" className="button secondary" disabled={!online||!!busy||!!items.length||(!source.trim()&&!file)} onClick={extract}><Sparkle size={20}/>{busy==='extract'?T('Preparing…','מכינים…'):T('Prepare a draft with AI','הכנת טיוטה עם AI')}</button>}
   <small>{a.cloud&&!online?T('Preparing a draft with AI needs a connection. You can add drafts by hand below; the plan syncs when you’re back online.','הכנת טיוטה עם AI דורשת חיבור. אפשר להוסיף טיוטות ידנית למטה, והתוכנית תסתנכרן כשהחיבור יחזור.'):a.cloud?T('Only the text or file above is sent to your connected AI provider when you choose to prepare a draft.','רק הטקסט או הקובץ שלמעלה נשלחים לספק ה־AI שחיברתם כשבוחרים להכין טיוטה.'):T('In the preview you can enter a draft manually.','בתצוגת הדוגמה אפשר להזין טיוטה ידנית.')}</small>
  </FormSection>
  {items.length>0&&<FormSection className="message-plan-group" icon={ClipboardText} title={T('One plan','תוכנית אחת')} T={T}>
   <label>{T('Plan name','שם התוכנית')}<input dir="auto" value={title} maxLength={120} placeholder={items[0].title} onChange={e=>setTitle(e.target.value)}/></label>
   <small>{T('Your plan is private. Each event or task follows the sharing choices below.','התוכנית אישית. לכל אירוע או משימה אפשר לקבוע שיתוף בנפרד.')}</small>
  </FormSection>}
  {items.map(item => <FormSection key={item.key} icon={item.kind==='event'?CalendarDots:ClipboardText}
    title={item.kind==='event'?T('Draft event','טיוטת אירוע'):T('Draft task','טיוטת משימה')} tone="peach" T={T}>
   <label>{T('Title','כותרת')}<input required value={item.title} maxLength={160} onChange={e=>change(item.key,{title:e.target.value})}/></label>
   <div className="two-fields"><div><span className="field-label">{T('Date','תאריך')}</span><DateField value={item.date} aria-label={T('Date','תאריך')} onChange={e=>change(item.key,{date:e.target.value})}/></div>
    <label>{T('Time','שעה')}<TimeField disabled={item.allDay} value={item.allDay?'':item.time} placeholder={T('No time set','ללא שעה')} onChange={e=>changeSchedule(item,{time:e.target.value})}/></label></div>
   {item.kind==='event'&&<label className="checkbox-label"><input type="checkbox" checked={item.allDay} onChange={e=>changeSchedule(item,{allDay:e.target.checked})}/>{T('All day','כל היום')}</label>}
   <div className="message-plan-reminders">
    <strong>{T('Reminders','תזכורות')}</strong>
    {item.reminderRequested&&(!item.date||!item.reminders?.length)&&<p role="status">{T('Choose when to send this reminder.','בחרו מתי לשלוח את התזכורת.')} <button type="button" className="text-link" onClick={()=>change(item.key,{reminderRequested:false,reminders:[]})}>{T('Skip reminder','דלגו על התזכורת')}</button></p>}
    {item.date&&(item.kind==='task'||item.allDay||item.time)
     ? <ReminderListEditor key={String(withoutTime(item))} a={a} Select={Select} category={item.kind==='task'?'tasks':'events'} allDay={withoutTime(item)}
       value={item.reminders} onChange={reminders=>change(item.key,{reminders,reminderRequested:false})}/>
     : <small>{T('Set a date first. Events also need a time or All day.','קבעו תאריך תחילה. לאירוע בחרו גם שעה או ״כל היום״.')}</small>}
   </div>
   <label>{T('Notes','הערות')}<textarea value={item.note} maxLength={800} onChange={e=>change(item.key,{note:e.target.value})}/></label>
   <fieldset className="message-plan-people">
    <legend>{T('Who is responsible or attending?','מי אחראי או משתתף?')}</legend>
    <div className="routine-people">{a.members.filter(member=>item.kind==='event'||a.member(a.user).role!=='child'||member.id===a.user).map(member=>{
     const selected = item.assignees.includes(member.id);
     return <PersonChip key={member.id} who={member.id} name={a.name(member.id)} Avatar={Avatar} tone={member.color} selected={selected}
      onClick={()=>change(item.key,{assignees:selected?item.assignees.filter(id=>id!==member.id):[...item.assignees,member.id]})}/>;
    })}</div>
   </fieldset>
   <label>{T('Visibility','למי זה גלוי')}<select value={item.visibility} onChange={e=>change(item.key,{visibility:e.target.value})}>
    <option value="private">{item.assignees.some(member=>member!==a.user)?T('Me and the selected people','אני והאנשים שבחרתי'):T('Only me','רק אני')}</option><option value="family">{T('Whole family','כל המשפחה')}</option>
   </select></label>
   <button className="button secondary danger" type="button" onClick={()=>setItems(items.filter(row=>row.key!==item.key))}><Trash size={20}/>{T('Remove draft item','הסרת הפריט מהטיוטה')}</button>
  </FormSection>)}
  <div className="home-planning-actions">{kinds.map(kind=><button type="button" key={kind} className="button secondary" disabled={items.length>=12||!!busy} onClick={()=>setItems([...items,blank(kind,a.user)])}><Plus size={20}/>{kind==='event'?T('Add event draft','הוספת טיוטת אירוע'):T('Add task draft','הוספת טיוטת משימה')}</button>)}</div>
 </HouseholdForm>;
}
