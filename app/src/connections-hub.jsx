// Settings → Accounts & connections: every outside account Bayit uses, in one place, with live status.
// Each card opens the full setup for that connection (the same panels as before, now gathered here).
import React,{useEffect,useState,useCallback} from 'react';
import {PlugsConnected,GoogleLogo,Database,Sparkle,TelegramLogo,Bank,WhatsappLogo,CheckCircle,WarningCircle,Circle,CaretDown,Microphone,LockSimple} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {MapPin} from '@phosphor-icons/react';
import {useMaps} from './maps-client';
import {MapsSettings} from './maps-settings';
import {AIConnectionSettings} from './ai';
import {TelegramSettings} from './telegram-settings';
import {RiseupConnect} from './riseup-connect';
import './connections.css';
import {SecuritySettings} from './security-settings';
import {FormSection} from './form-section';
import {ShieldCheck as ConnShield,ChatCircleDots as ConnChat} from '@phosphor-icons/react';
import {ConnectionDialog,ConnectionIdentityProvider,ConnectionSecurityNotice,useConnectionIdentity} from './connection-dialog';

const get=async path=>{const r=await fetch(path,{headers:cloudHeaders(),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(String(r.status));return r.json()};
const when=(ts,lang)=>ts?new Date(ts).toLocaleString(lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';

export {PlugsConnected as ConnectionsIcon};
export function ConnectionsHub(props){return <ConnectionIdentityProvider a={props.app}><ConnectionsHubContent {...props}/></ConnectionIdentityProvider>}
function ConnectionsHubContent({app:a,ui,storage,initialOpen=''}){
 const {status:maps}=useMaps(),identity=useConnectionIdentity();
 const {Button,Badge,Avatar}=ui,T=a.T,cloud=!!a.cloud,adult=a.member(a.user).role!=='child';
 const initial=new URLSearchParams(a.route.split('?')[1]||'').get('open')||initialOpen;
 const [open,setOpen]=useState(initial),[ai,setAI]=useState(null),[tg,setTG]=useState(null),[fin,setFin]=useState(null),[config,setConfig]=useState(null),[dialogBusy,setDialogBusy]=useState(false);
 const load=useCallback(async()=>{
  const settle=(p,set)=>p.then(set).catch(()=>set({failed:true}));
  await Promise.all([settle(get('/api/config'),setConfig),...(cloud?[settle(get('/api/ai/status'),setAI),settle(get('/api/telegram/status'),setTG),...(adult?[settle(get('/api/finance/connections'),setFin)]:[])]:[])]);
 },[cloud,adult,a.data.householdId]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{setOpen(initial)},[initial]);

 const me=tg?.members?.find(m=>m.id===a.user),mineRise=fin?.connections?.find(c=>c.provider==='riseup'&&c.mine),otherRise=(fin?.connections||[]).filter(c=>c.provider==='riseup'&&!c.mine);
 const offline=!cloud&&T('Available after signing in','זמין לאחר התחברות');
 // state: on | off | warn | wait. Text is shown in the status pill; detail is one honest line.
 const cards=[
  {id:'account',icon:GoogleLogo,tone:'google',name:T('Google account','חשבון Google'),what:T('How you sign in. Each person uses their own Google account; nobody shares passwords.','כך מתחברים. כל אחד משתמש בחשבון Google שלו; אף אחד לא משתף סיסמאות.'),
   state:cloud?'on':'off',status:cloud?T('Signed in','מחובר'):T('Not signed in','לא מחובר'),detail:cloud?a.cloud.session?.user?.email:offline,panel:<ConnectionAccount a={a} Button={Button}/>},
  {id:'storage',icon:Database,tone:'storage',name:T('Household storage','אחסון הבית'),what:T('Where your family’s data and files are kept: your own installation, not ours.','איפה נשמרים הנתונים והקבצים של המשפחה: בהתקנה שלכם, לא אצלנו.'),
   state:config?.storage?.connected?'on':config?'warn':'wait',status:config?.storage?.connected?T('Connected','מחובר'):config?T('Device only','במכשיר בלבד'):T('Checking…','בודקים…'),detail:config?.storage?.connected?T('Private database and file storage on this installation','מסד נתונים ואחסון קבצים פרטיים בהתקנה הזו'):T('Demo data stays on this device','נתוני ההדגמה נשארים במכשיר הזה'),panel:<ConnectionStorage a={a} config={config} storage={storage}/>},
  {id:'ai',icon:Sparkle,tone:'ai',name:T('AI assistant','עוזר AI'),what:T('Answers questions and prepares changes in the app and on Telegram. Claude, OpenAI, Gemini, Grok or your own.','עונה על שאלות ומכין שינויים באפליקציה ובטלגרם. Claude,‏ OpenAI,‏ Gemini,‏ Grok או משלכם.'),
   state:!cloud?'off':!ai?'wait':ai.failed?'warn':ai.connected&&ai.model?'on':ai.hasKey?'warn':'off',status:!cloud?T('Not connected','לא מחובר'):!ai?T('Checking…','בודקים…'):ai.failed?T('Status unavailable','המצב אינו זמין'):ai.connected&&ai.model?T('Connected','מחובר'):ai.hasKey?T('Needs attention','דורש טיפול'):T('Not connected','לא מחובר'),
   detail:ai?.connected?ai.providerName+(ai.model?' · '+ai.model:''):offline||(ai?.canManage?T('A parent adds the household’s own key','הורה מוסיף את המפתח של הבית'):T('A parent connects it','הורה מחבר אותו')),
   panel:cloud&&<AIConnectionSettings app={a} ui={{Button,Badge}} embedded onBusy={setDialogBusy} onStatus={setAI}/>},
  {id:'telegram',icon:TelegramLogo,tone:'telegram',name:'Telegram',what:T('Your family bot: reminders with Done and Snooze, a morning summary, approvals, and chat with your AI by text, photo or voice.','בוט המשפחה: תזכורות עם בוצע ונודניק, סיכום בוקר, אישורים ושיחה עם ה־AI בטקסט, בתמונה או בקול.'),
   state:!cloud?'off':!tg?'wait':tg.failed?'warn':tg.connected?(me?.linked&&!me?.blocked?'on':'warn'):'off',
   status:!cloud?T('Not connected','לא מחובר'):!tg?T('Checking…','בודקים…'):tg.failed?T('Status unavailable','המצב אינו זמין'):tg.connected?(me?.linked?(me.blocked?T('Paused','מושהה'):T('Connected','מחובר')):T('Bot ready · link your chat','הבוט מוכן · חברו את הצ׳אט')):T('Not connected','לא מחובר'),
   detail:tg?.connected?'@'+tg.botUsername+' · '+T((tg.members||[]).filter(m=>m.linked).length+' linked',(tg.members||[]).filter(m=>m.linked).length+' מחוברים')+(tg.media?.voice&&tg.media.voice!=='off'?' · '+T('voice on','קול פעיל'):''):offline||T('A parent creates the bot once; then everyone links their own chat','הורה יוצר את הבוט פעם אחת; אחר כך כל אחד מחבר את הצ׳אט שלו'),
   panel:cloud&&<TelegramSettings app={a} ui={{Button,Badge,Avatar}} recipient={a.user} embedded onBusy={setDialogBusy} onStatus={setTG}/>},
  {id:'maps',icon:MapPin,tone:'google',name:'Google Maps',optional:true,what:T('Optional address search and a small location map on events and tasks. Manual place names always work.','חיפוש כתובת ומפה קטנה באירועים ובמשימות, באופן אופציונלי. שמות מקומות ידניים תמיד זמינים.'),state:maps?.configured?'on':maps?.failed?'warn':cloud&&!maps?'wait':'off',status:maps?.configured?T('Search connected','החיפוש מחובר'):maps?.failed?T('Status unavailable','המצב אינו זמין'):cloud&&!maps?T('Checking…','בודקים…'):T('Not connected','לא מחובר'),detail:maps?.configured?T('Search tested; map key configured','החיפוש נבדק; מפתח המפה הוגדר'):T('One optional connection for this installation','חיבור אופציונלי אחד להתקנה הזו'),panel:<MapsSettings a={a} onChanged={load} onBusy={setDialogBusy}/>},
  ...(adult?[{id:'riseup',icon:Bank,tone:'riseup',name:'RiseUp',optional:true,what:T('Optional. If you use RiseUp, Bayit reads your bank and card transactions from it about once an hour into Expenses.','אופציונלי. אם אתם משתמשים ב־RiseUp, ‏Bayit קורא ממנו בערך פעם בשעה את תנועות הבנק והאשראי אל ההוצאות.'),
   state:!cloud?'off':!fin?'wait':fin.failed?'warn':mineRise?(mineRise.status==='ok'?'on':'warn'):'off',
   status:!cloud?T('Not connected','לא מחובר'):!fin?T('Checking…','בודקים…'):fin.failed?T('Status unavailable','המצב אינו זמין'):mineRise?(mineRise.status==='ok'?T('Connected','מחובר'):mineRise.status==='retrying'?T('Retrying','מנסה שוב'):T('Needs attention','דורש טיפול')):T('Not connected','לא מחובר'),
   detail:mineRise?T('Last sync ','סנכרון אחרון ')+when(mineRise.lastSyncAt,a.lang)+' · '+(mineRise.visibility==='private'?T('only you','רק אתם'):T('shared with all household adults','משותף לכל המבוגרים בבית')):offline||(otherRise.length?T(otherRise.length+' other adult connected',otherRise.length+' מבוגרים נוספים מחוברים'):T('Each adult connects their own RiseUp account','כל מבוגר מחבר את חשבון ה־RiseUp שלו')),
   panel:cloud&&(fin&&!fin.failed?<RiseupConnect a={a} data={fin} Avatar={Avatar} embedded onBusy={setDialogBusy} onClose={()=>setOpen('')} onChanged={load}/>:<div><p>{fin?.failed?T('RiseUp status could not be loaded. Try again.','לא הצלחנו לטעון את מצב RiseUp. אפשר לנסות שוב.'):T('Checking RiseUp…','בודקים את RiseUp…')}</p><Button secondary onClick={load}>{T('Retry','ניסיון חוזר')}</Button></div>)}]:[]),
  {id:'whatsapp',icon:WhatsappLogo,tone:'whatsapp',name:'WhatsApp',optional:true,what:T('Reminders on WhatsApp need a WhatsApp Business account. Planned for later.','תזכורות בוואטסאפ דורשות חשבון WhatsApp Business. מתוכנן בהמשך.'),state:'soon',status:T('Later','בהמשך'),detail:T('Use Telegram for now','בינתיים משתמשים בטלגרם'),panel:<div className="connection-account"><p>{T('WhatsApp delivery is planned for a later version. No WhatsApp account is connected and no messages are sent through it.','משלוח דרך WhatsApp מתוכנן לגרסה עתידית. אין חשבון WhatsApp מחובר ולא נשלחות דרכו הודעות.')}</p><Button onClick={()=>setOpen('telegram')}>{T('Set up Telegram instead','הגדרת Telegram')}</Button></div>}
 ];
 const Pill=({c})=>{const Glyph=c.state==='on'?CheckCircle:c.state==='warn'?WarningCircle:Circle;return <span className={'conn-pill '+c.state}><Glyph size={16} weight={c.state==='off'||c.state==='soon'?'regular':'fill'}/>{c.status}</span>};
 const connected=cards.filter(c=>c.state==='on').length,active=cards.find(c=>c.id===open);
 const close=()=>{if(!dialogBusy&&!identity.authorizing){setOpen('');load()}};
 return <div className="connections-hub"><ConnectionSecurityNotice a={a} summary/>
  <p className="conn-intro">{T('Choose a connection to set it up or manage it. Your credentials are encrypted on your household server.','בחרו חיבור להגדרה או לניהול. המפתחות שלכם מוצפנים בשרת הבית.')} <b>{T(connected+' of '+cards.filter(c=>c.state!=='soon').length+' connected.',connected+' מתוך '+cards.filter(c=>c.state!=='soon').length+' מחוברים.')}</b></p>
  {(()=>{const renderCard=c=>{const Glyph=c.icon;return <section key={c.id} id={'connection-'+c.id} className={'conn-card tone-'+c.tone+(c.state==='soon'?' soon':'')}>
   <div className="conn-head"><span className="conn-logo"><Glyph size={30} weight={c.id==='ai'?'fill':'regular'}/></span><div className="conn-title"><h4>{c.name}{c.optional&&<small>{T('Optional','אופציונלי')}</small>}</h4><Pill c={c}/></div></div>
   <p className="conn-what">{c.what}</p>
   {c.detail&&<p className="conn-detail">{c.id==='riseup'&&mineRise?.visibility==='private'&&<LockSimple size={15}/>}{c.id==='telegram'&&tg?.media?.voice&&tg.media.voice!=='off'&&<Microphone size={15}/>}<span dir="auto">{c.detail}</span></p>}
   {c.panel&&<div className="conn-actions"><Button secondary={c.state==='on'||c.state==='soon'} aria-haspopup="dialog" onClick={()=>setOpen(c.id)}>{c.state==='soon'?T('About this connection','על החיבור'):c.state==='off'?T('Set up','הגדרה'):T('Manage','ניהול')}</Button></div>}
  </section>},groups=[{icon:ConnShield,tone:'blue',title:T('Sign-in & storage','כניסה ואחסון'),ids:['account','storage']},{icon:ConnChat,tone:'lilac',title:T('Assistant & messages','עוזר והודעות'),ids:['ai','telegram','whatsapp']},{icon:PlugsConnected,tone:'green',title:T('Optional services','שירותים אופציונליים'),ids:['maps','riseup']}],section=g=>{const list=cards.filter(c=>g.ids.includes(c.id));return list.length?<FormSection key={g.title} T={T} icon={g.icon} tone={g.tone} className={g.wide?'settings-wide':''} title={g.title} note={T(list.filter(c=>c.state==='on').length+' of '+list.filter(c=>c.state!=='soon').length+' connected',list.filter(c=>c.state==='on').length+' מתוך '+list.filter(c=>c.state!=='soon').length+' מחוברים')}><div className="conn-list">{list.map(renderCard)}</div></FormSection>:null};return <div className="settings-v2 conn-sections"><div className="settings-grid">{section(groups[0])}{section(groups[1])}{section({...groups[2],wide:true})}</div></div>})()}
  {active?.panel&&<ConnectionDialog key={active.id} a={a} title={active.name} icon={active.icon} status={<Pill c={active}/>} description={active.what} busy={dialogBusy||identity.authorizing} onClose={close}>{(['telegram','riseup'].includes(active.id)||(['ai','maps'].includes(active.id)&&a.member(a.user).role==='parent'))&&<ConnectionSecurityNotice a={a} connection={active.id}/>} {active.panel}</ConnectionDialog>}
 </div>;
}

function ConnectionAccount({a,Button}){
 return <div className="connection-account"><dl><dt>{a.T('Your Google account','חשבון Google שלכם')}</dt><dd dir="auto">{a.cloud?.session?.user?.email||a.T('Not signed in','לא מחוברים')}</dd></dl><p>{a.T('Each person signs in with their own account. Invite people to share your household; private records keep their own access rules.','כל אחד נכנס עם חשבון משלו. מזמינים אנשים כדי לשתף את הבית; לרישומים פרטיים נשמרות הרשאות הגישה שלהם.')}</p><div className="connection-dialog-actions"><Button onClick={()=>a.go('settings/family')}>{a.T('Manage family members','ניהול בני המשפחה')}</Button>{a.cloud?<Button secondary onClick={()=>a.cloud.signOut()}>{a.T('Sign out of Bayit','יציאה מ־Bayit')}</Button>:<Button onClick={()=>a.go('welcome')}>{a.T('Sign in with Google','כניסה עם Google')}</Button>}</div>{a.cloud&&<details className="connection-help"><summary>{a.T('Signed-in devices & security','מכשירים מחוברים ואבטחה')}</summary><SecuritySettings a={a} Button={Button} sessions connection="account"/></details>}</div>
}

function ConnectionStorage({a,config,storage}){
 return <div className="connection-account"><div className="connection-storage-items">{[[Database,a.T('Household records','רישומי הבית'),!!config?.storage?.connected,a.T('Calendars, tasks and notes in this installation. The server checks who can access each record.','יומנים, משימות והערות בהתקנה הזו. השרת בודק מי רשאי לגשת לכל רישום.')],[LockSimple,a.T('Private file storage','אחסון קבצים פרטי'),!!config?.storage?.files,a.T('Photos and documents follow their saved viewing permissions. Assigning a person does not grant access.','תמונות ומסמכים פועלים לפי הרשאות הצפייה שנשמרו. שיוך לאדם אינו מעניק גישה.')]].map(([Icon,title,on,description])=><div key={title}><Icon size={26}/><section><strong>{title} · {on?a.T('Connected','מחובר'):a.T('Not connected','לא מחובר')}</strong><p>{description}</p></section></div>)}</div><details className="connection-help"><summary>{a.T('Installation details & setup','פרטי ההתקנה והגדרה')}</summary>{storage}</details></div>
}
