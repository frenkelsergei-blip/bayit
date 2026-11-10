import React,{useEffect,useState} from 'react';
import {ArrowClockwise, CalendarDots} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {ConnectionSecurityNotice,useConnectionIdentity} from './connection-dialog';
import {householdDate} from './household-date';
import './home-planning.css';

export async function googleCalendarRequest(action,body,params) {
 const response = await fetch('/api/google-calendar/'+action+(params?'?'+new URLSearchParams(params):''),{
  method:body?'POST':'GET',cache:'no-store',headers:{...cloudHeaders(),...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const result = await response.json();
 if (!response.ok) throw Object.assign(Error(result.error),{code:result.code,status:response.status});
 return result;
}

export function GoogleCalendarSettings({a,Button,status,reload}) {
 const T=a.T,identity=useConnectionIdentity();
 const [read,setRead]=useState(false),[write,setWrite]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [calendar,setCalendar]=useState(''),[calendars,setCalendars]=useState([]),[calendarPage,setCalendarPage]=useState('');
 const [events,setEvents]=useState([]),[eventPage,setEventPage]=useState(''),[follow,setFollow]=useState(false),[exportId,setExportId]=useState('');
 const [disconnect,setDisconnect]=useState(false);
 const result = new URLSearchParams(a.route.split('?')[1]||'').get('calendar');
 const run = async action => {
  if (busy) return;
  setBusy(true);setError('');setMessage('');
  try {await action();}
  catch (failure) {if (!identity.rejected(failure,'google-calendar')) setError(T('Google Calendar could not complete that action. Try again or reconnect.','לא הצלחנו להשלים את הפעולה מול Google Calendar. נסו שוב או חברו מחדש.'));}
  finally {setBusy(false);}
 };
 const change = async (action,body) => {
  if (!await identity.guard('google-calendar')) return;
  const data = await googleCalendarRequest(action,body);
  if (action==='connect') location.assign(data.url);
  else {await reload();if(action==='disconnect'){setDisconnect(false);setCalendars([]);setEvents([]);setCalendar('');}}
 };
 const loadCalendars = async page => {
  const response = await googleCalendarRequest('calendars',undefined,page?{page}:undefined);
  setCalendars(current=>page?[...current,...response.calendars]:response.calendars);setCalendarPage(response.next);
 };
 const loadEvents = async (id,page) => {
  if (!page) {setCalendar(id);setEvents([]);setEventPage('');}
  if (!id) return;
  const response = await googleCalendarRequest('events',undefined,{calendar:id,...(page?{page}:{})});
  setEvents(current=>page?[...current,...response.events]:response.events);setEventPage(response.next);
 };
 const sync = async (action,id) => {
  const response=await googleCalendarRequest(action,{id});
  if (action==='sync') await a.cloud.client.poll();
  await reload();
  setMessage(response.status==='synced'?T('Google confirmed the event.','Google אישר את האירוע.'):T('Link updated. See its status below.','הקישור עודכן. אפשר לבדוק את המצב למטה.'));
 };
 if (!a.cloud) return <p>{T('Sign in to your own Bayit account to connect your calendar.','היכנסו לחשבון האישי שלכם בבַּיִת כדי לחבר את היומן.')}</p>;
 if (status && !status.available && !status.failed) return <p>{T('The person who manages this Bayit installation needs to enable Google Calendar. Once it is ready, you can connect your own account here.','מי שמנהל את ההתקנה צריך להפעיל את Google Calendar פעם אחת. אחרי ההפעלה אפשר לחבר כאן את חשבון Google האישי שלכם.')}</p>;
 if (!status) return <p role="status">{T('Checking Calendar connection…','בודקים חיבור ליומן…')}</p>;
 if (status.failed) return <div><p role="alert">{T('Calendar status is unavailable.','מצב החיבור ליומן אינו זמין.')}</p><Button secondary onClick={reload}>{T('Try again','ניסיון חוזר')}</Button></div>;
 const owns = (a.data.events||[]).filter(item=>item.ownerId===a.user&&!item.deletedAt&&(!item.repeat||item.repeat==='once'));
 const state = value=>({synced:T('Synced','מסונכרן'),error:T('Needs attention','דורש טיפול'),unavailable:T('Source unavailable','המקור אינו זמין'),paused:T('Paused','מושהה')})[value]||T('Pending','ממתין');
 return <div className="google-calendar-panel" aria-busy={busy}>
  <ConnectionSecurityNotice a={a} connection="google-calendar"/>
  {result==='failed'&&!status.connected&&<p role="alert">{T('Google did not complete the connection. Try again with your own account. If Google blocks access, contact the person who manages this Bayit installation.','Google לא השלים את החיבור. נסו שוב עם חשבון Google שלכם. אם Google חוסם את הגישה, פנו למי שמנהל את ההתקנה.')}</p>}
  {result==='cancelled'&&!status.connected&&<p role="status">{T('The connection was cancelled. You can try again when you are ready.','החיבור בוטל. אפשר לנסות שוב כשתרצו.')}</p>}
  {result==='connected'&&status.connected&&<p role="status">{T('Your Google Calendar is connected. Choose how to use it below.','יומן Google שלכם מחובר. בחרו למטה איך להשתמש בו.')}</p>}
  {error&&<p role="alert" className="save-error">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {!status.connected ? <>
   <p>{T('Each adult connects their own calendar from their Bayit account. Continue to Google, choose your account and approve the permissions you want to use.','כל מבוגר מחבר את היומן שלו מתוך החשבון שלו בבַּיִת. המשיכו ל־Google, בחרו את החשבון האישי ואשרו את ההרשאות שבחרתם.')}</p>
   <p>{T('For availability only, leave both boxes clear. Bayit checks busy times on your primary calendar.','לזמינות בלבד, השאירו את שתי האפשרויות ללא סימון. בַּיִת בודק חלונות תפוסים ביומן הראשי שלכם.')}</p>
   <fieldset className="google-calendar-options" disabled={busy||identity.recent!==true}>
    <legend>{T('Optional permissions','הרשאות לפי בחירה')}</legend>
    <label className="checkbox-label"><input type="checkbox" checked={read} onChange={e=>setRead(e.target.checked)}/>{T('Browse Google events and import only the ones I choose','לעיין באירועים ב־Google ולייבא רק את אלה שבחרתי')}</label>
    <label className="checkbox-label"><input type="checkbox" checked={write} onChange={e=>setWrite(e.target.checked)}/>{T('Send selected events to a separate Bayit calendar in Google','לשלוח אירועים שבחרתי ליומן Bayit נפרד ב־Google')}</label>
   </fieldset>
   <Button disabled={busy||identity.recent!==true} onClick={()=>run(()=>change('connect',{read,write}))}>{T('Continue to Google','המשך ל־Google')}</Button>
  </> : <>
   <label className="checkbox-label"><input type="checkbox" checked={status.sharing} disabled={busy} onChange={e=>run(()=>change('sharing',{enabled:e.target.checked}))}/>{T('Use my availability for household suggestions','להשתמש בזמינות שלי להצעות בבית')}</label>
   {!status.sharing&&<p>{T('Turn this on to let Bayit check your availability when suggesting who can pick up.','הפעילו את האפשרות כדי שבַּיִת יבדוק זמינות כשהוא מציע מי יכול לאסוף.')}</p>}
   {status.read&&<>
    <h3>{T('Choose events to bring from Google','בחירת אירועים להביא מ־Google')}</h3>
    {!calendars.length?<Button secondary disabled={busy} onClick={()=>run(()=>loadCalendars(''))}>{T('Show my calendars','הצגת היומנים שלי')}</Button>:<>
     <label>{T('Google calendar','יומן Google')} <select value={calendar} disabled={busy} onChange={e=>run(()=>loadEvents(e.target.value,''))}><option value="">{T('Choose a calendar','בחירת יומן')}</option>{calendars.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
     {calendarPage&&<Button secondary disabled={busy} onClick={()=>run(()=>loadCalendars(calendarPage))}>{T('More calendars','יומנים נוספים')}</Button>}
    </>}
    {calendar&&<>
     <label className="checkbox-label"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>{T('Follow changes for the events I import','לעקוב אחרי שינויים באירועים שאייבא')}</label>
     <p>{T('Imports are private. Following an event updates its title and time from Google.','אירועים מיובאים נשמרים כפרטיים. מעקב מעדכן את שם האירוע ואת השעה לפי Google.')}</p>
     <ul className="google-calendar-event-list">{events.map(item=><li key={item.id}><strong dir="auto">{item.title}</strong><small>{householdDate(a,item.date)} {item.time}</small>
      <Button secondary disabled={busy} onClick={()=>run(async()=>{const imported=await googleCalendarRequest('import',{calendar,remote:item.id,follow});if(!imported.id)throw Error();await Promise.all([a.cloud.client.poll(),reload()]);setMessage(T('Event saved privately.','האירוע נשמר בפרטי.'));setEvents(current=>current.filter(event=>event.id!==item.id));})}>{follow?T('Import and follow','ייבוא ומעקב'):T('Import once','ייבוא חד־פעמי')}</Button>
     </li>)}</ul>
     {!events.length&&!busy&&<p>{T('No upcoming single-day events in this view.','אין אירועים קרובים בני יום אחד בתצוגה הזו.')}</p>}
     {eventPage&&<Button secondary disabled={busy} onClick={()=>run(()=>loadEvents(calendar,eventPage))}>{T('More events','אירועים נוספים')}</Button>}
    </>}
   </>}
   {status.write&&<>
    <h3>{T('Send an event to Google','שליחת אירוע ל־Google')}</h3>
    <p>{T('Bayit sends the title and schedule to its own Google calendar. Changes in Bayit update the selected copy.','בַּיִת שולח את הכותרת והמועד ליומן נפרד ב־Google. שינויים בבַּיִת מעדכנים את העותק שנבחר.')}</p>
    <label>{T('Bayit event','אירוע בבַּיִת')} <select value={exportId} onChange={e=>setExportId(e.target.value)}><option value="">{T('Choose an event','בחירת אירוע')}</option>{owns.map(item=><option key={item.id} value={item.id}>{a.text(item)} · {householdDate(a,item.date)}</option>)}</select></label>
    <Button disabled={!exportId||busy} onClick={()=>run(()=>sync('export',exportId))}>{T('Create in Google and keep updated','יצירה ב־Google ועדכון בהמשך')}</Button>
   </>}
   {!!status.links?.length&&<>
    <h3>{T('Linked events','אירועים מקושרים')}</h3>
    <ul className="google-calendar-event-list">{status.links.map(link=><li key={link.event_id}>
     <strong dir="auto">{a.text(a.data.events.find(item=>item.id===link.event_id)||{})||T('Event unavailable','האירוע אינו זמין')}</strong>
     <small>{link.direction==='import'?T('From Google to Bayit','מ־Google לבַּיִת'):T('From Bayit to Google','מבַּיִת ל־Google')} · {state(link.status)}</small>
     {link.checked_at&&<small>{T('Last check ','בדיקה אחרונה ')}{new Date(link.checked_at).toLocaleString(a.lang==='he'?'he-IL':'en-GB')}</small>}
     <div className="home-planning-actions"><Button secondary icon={ArrowClockwise} disabled={busy} onClick={()=>run(()=>sync('sync',link.event_id))}>{T('Sync now','סנכרון עכשיו')}</Button><Button secondary disabled={busy} onClick={()=>run(()=>sync('unlink',link.event_id))}>{T('Stop syncing','הפסקת סנכרון')}</Button></div>
    </li>)}</ul>
   </>}
   {disconnect?<div role="alert"><p>{T('Disconnect the account and stop syncing its linked events? Saved event copies are kept.','לנתק את החשבון ולהפסיק את סנכרון האירועים המקושרים? עותקים שכבר נשמרו נשארים.')}</p>
    <div className="home-planning-actions"><Button secondary onClick={()=>setDisconnect(false)}>{T('Cancel','ביטול')}</Button><Button disabled={busy} onClick={()=>run(()=>change('disconnect',{}))}>{T('Disconnect','ניתוק')}</Button></div>
   </div>:<Button secondary disabled={busy} onClick={()=>setDisconnect(true)}>{T('Disconnect Calendar','ניתוק היומן')}</Button>}
  </>}
 </div>;
}

export function GoogleEventSyncChoice({a,enabled,value,onChange}) {
 const [canExport,setCanExport]=useState(false);
 useEffect(()=>{
  let alive=true;
  if (enabled && a.cloud && a.member(a.user).role!=='child') googleCalendarRequest('status').then(state=>{if(alive)setCanExport(!!state.write);}).catch(()=>{});
  return ()=>{alive=false;};
 },[enabled,a.user,a.data.householdId,!!a.cloud]);
 if (!enabled || !canExport) return null;
 return <div className="home-planning-panel"><label className="checkbox-label"><input type="checkbox" checked={value} onChange={event=>onChange(event.target.checked)}/><CalendarDots size={20}/>{a.T('Also create in Google Calendar','ליצור גם ב־Google Calendar')}</label>
  {value&&<small>{a.T('Sends the title and schedule to your Bayit calendar in Google.','הכותרת והמועד יישלחו ליומן Bayit שלכם ב־Google.')}</small>}
 </div>;
}
