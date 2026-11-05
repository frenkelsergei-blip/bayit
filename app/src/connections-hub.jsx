// Settings → Accounts & connections: every outside account Bayit uses, in one place, with live status.
// Each card opens the full setup for that connection (the same panels as before, now gathered here).
import React,{useEffect,useState,useCallback} from 'react';
import {PlugsConnected,GoogleLogo,Database,Sparkle,TelegramLogo,Bank,WhatsappLogo,CheckCircle,WarningCircle,Circle,CaretDown,Microphone,LockSimple} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {AIConnectionSettings} from './ai';
import {TelegramSettings} from './telegram-settings';
import {RiseupConnect} from './riseup-connect';
import './connections.css';

const get=async path=>{const r=await fetch(path,{headers:cloudHeaders(),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(String(r.status));return r.json()};
const when=(ts,lang)=>ts?new Date(ts).toLocaleString(lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';

export {PlugsConnected as ConnectionsIcon};
export function ConnectionsHub({app:a,ui,storage,initialOpen=''}){
 const {Button,Badge,Avatar}=ui,T=a.T,cloud=!!a.cloud,adult=a.member(a.user).role!=='child';
 const initial=new URLSearchParams(a.route.split('?')[1]||'').get('open')||initialOpen;
 const [open,setOpen]=useState(initial),[ai,setAI]=useState(null),[tg,setTG]=useState(null),[fin,setFin]=useState(null),[config,setConfig]=useState(null),[riseup,setRiseup]=useState(initial==='riseup');
 const load=useCallback(async()=>{
  const settle=(p,set)=>p.then(set).catch(()=>set({failed:true}));
  await Promise.all([settle(get('/api/config'),setConfig),...(cloud?[settle(get('/api/ai/status'),setAI),settle(get('/api/telegram/status'),setTG),...(adult?[settle(get('/api/finance/connections'),setFin)]:[])]:[])]);
 },[cloud,adult,a.data.householdId]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{if(initial)setTimeout(()=>document.getElementById('connection-'+initial)?.scrollIntoView({behavior:'smooth',block:'start'}),300)},[]);

 const me=tg?.members?.find(m=>m.id===a.user),mineRise=fin?.connections?.find(c=>c.provider==='riseup'&&c.mine),otherRise=(fin?.connections||[]).filter(c=>c.provider==='riseup'&&!c.mine);
 const offline=!cloud&&T('Available after signing in','זמין לאחר התחברות');
 // state: on | off | warn | wait. Text is shown in the status pill; detail is one honest line.
 const cards=[
  {id:'account',icon:GoogleLogo,tone:'google',name:T('Google account','חשבון Google'),what:T('How you sign in. Each person uses their own Google account; nobody shares passwords.','כך מתחברים. כל אחד משתמש בחשבון Google שלו; אף אחד לא משתף סיסמאות.'),
   state:cloud?'on':'off',status:cloud?T('Signed in','מחובר'):T('Not signed in','לא מחובר'),detail:cloud?a.cloud.session?.user?.email:offline},
  {id:'storage',icon:Database,tone:'storage',name:T('Household storage','אחסון הבית'),what:T('Where your family’s data and files are kept: your own installation, not ours.','איפה נשמרים הנתונים והקבצים של המשפחה: בהתקנה שלכם, לא אצלנו.'),
   state:config?.storage?.connected?'on':config?'warn':'wait',status:config?.storage?.connected?T('Connected','מחובר'):config?T('Device only','במכשיר בלבד'):T('Checking…','בודקים…'),detail:config?.storage?.connected?T('Private database and file storage on this installation','מסד נתונים ואחסון קבצים פרטיים בהתקנה הזו'):T('Demo data stays on this device','נתוני ההדגמה נשארים במכשיר הזה'),panel:storage},
  {id:'ai',icon:Sparkle,tone:'ai',name:T('AI assistant','עוזר AI'),what:T('Answers questions and prepares changes in the app and on Telegram. Claude, OpenAI, Gemini, Grok or your own.','עונה על שאלות ומכין שינויים באפליקציה ובטלגרם. Claude,‏ OpenAI,‏ Gemini,‏ Grok או משלכם.'),
   state:!cloud?'off':!ai?'wait':ai.connected&&ai.model?'on':ai.hasKey?'warn':'off',status:!cloud?T('Not connected','לא מחובר'):!ai?T('Checking…','בודקים…'):ai.connected&&ai.model?T('Connected','מחובר'):ai.hasKey?T('Needs attention','דורש טיפול'):T('Not connected','לא מחובר'),
   detail:ai?.connected?ai.providerName+(ai.model?' · '+ai.model:''):offline||(ai?.canManage?T('A parent adds the household’s own key','הורה מוסיף את המפתח של הבית'):T('A parent connects it','הורה מחבר אותו')),
   panel:cloud&&<AIConnectionSettings app={a} ui={{Button,Badge}}/>},
  {id:'telegram',icon:TelegramLogo,tone:'telegram',name:'Telegram',what:T('Your family bot: reminders with Done and Snooze, a morning summary, approvals, and chat with your AI by text, photo or voice.','בוט המשפחה: תזכורות עם בוצע ונודניק, סיכום בוקר, אישורים ושיחה עם ה־AI בטקסט, בתמונה או בקול.'),
   state:!cloud?'off':!tg?'wait':tg.failed?'warn':tg.connected?(me?.linked&&!me?.blocked?'on':'warn'):'off',
   status:!cloud?T('Not connected','לא מחובר'):!tg?T('Checking…','בודקים…'):tg.connected?(me?.linked?(me.blocked?T('Paused','מושהה'):T('Connected','מחובר')):T('Bot ready · link your chat','הבוט מוכן · חברו את הצ׳אט')):T('Not connected','לא מחובר'),
   detail:tg?.connected?'@'+tg.botUsername+' · '+T((tg.members||[]).filter(m=>m.linked).length+' linked',(tg.members||[]).filter(m=>m.linked).length+' מחוברים')+(tg.media?.voice&&tg.media.voice!=='off'?' · '+T('voice on','קול פעיל'):''):offline||T('A parent creates the bot once; then everyone links their own chat','הורה יוצר את הבוט פעם אחת; אחר כך כל אחד מחבר את הצ׳אט שלו'),
   panel:cloud&&<TelegramSettings app={a} ui={{Button,Badge,Avatar}} recipient={a.user}/>},
  ...(adult?[{id:'riseup',icon:Bank,tone:'riseup',name:'RiseUp',optional:true,what:T('Optional. If you use RiseUp, Bayit reads your bank and card transactions from it every day, read-only, into Expenses.','אופציונלי. אם אתם משתמשים ב־RiseUp, ‏Bayit קורא ממנו כל יום את תנועות הבנק והאשראי, לקריאה בלבד, אל ההוצאות.'),
   state:!cloud?'off':!fin?'wait':fin.failed?'warn':mineRise?(mineRise.status==='ok'?'on':'warn'):'off',
   status:!cloud?T('Not connected','לא מחובר'):!fin?T('Checking…','בודקים…'):mineRise?(mineRise.status==='ok'?T('Connected','מחובר'):mineRise.status==='retrying'?T('Retrying','מנסה שוב'):T('Needs attention','דורש טיפול')):T('Not connected','לא מחובר'),
   detail:mineRise?T('Last sync ','סנכרון אחרון ')+when(mineRise.lastSyncAt,a.lang)+' · '+(mineRise.visibility==='private'?T('only you','רק אתם'):T('shared with parents','משותף להורים')):offline||(otherRise.length?T(otherRise.length+' other adult connected',otherRise.length+' מבוגרים נוספים מחוברים'):T('Each adult connects their own RiseUp account','כל מבוגר מחבר את חשבון ה־RiseUp שלו')),
   action:cloud&&fin&&!fin.failed?()=>setRiseup(true):null}]:[]),
  {id:'whatsapp',icon:WhatsappLogo,tone:'whatsapp',name:'WhatsApp',optional:true,what:T('Reminders on WhatsApp need a WhatsApp Business account. Planned for later.','תזכורות בוואטסאפ דורשות חשבון WhatsApp Business. מתוכנן בהמשך.'),state:'soon',status:T('Later','בהמשך'),detail:T('Use Telegram for now','בינתיים משתמשים בטלגרם')}
 ];
 const Pill=({c})=>{const Glyph=c.state==='on'?CheckCircle:c.state==='warn'?WarningCircle:Circle;return <span className={'conn-pill '+c.state}><Glyph size={16} weight={c.state==='off'||c.state==='soon'?'regular':'fill'}/>{c.status}</span>};
 const connected=cards.filter(c=>c.state==='on').length;
 return <div className="connections-hub">
  <p className="conn-intro">{T('Every outside account Bayit uses is here. Keys and tokens are encrypted on your household server and are never shown again.','כל החשבונות החיצוניים ש־Bayit משתמש בהם נמצאים כאן. מפתחות ואסימונים מוצפנים בשרת הבית ולא מוצגים שוב.')} <b>{T(connected+' of '+cards.filter(c=>c.state!=='soon').length+' connected.',connected+' מתוך '+cards.filter(c=>c.state!=='soon').length+' מחוברים.')}</b></p>
  <div className="conn-grid">{cards.map(c=>{const Glyph=c.icon,expanded=open===c.id&&!!c.panel;return <section key={c.id} id={'connection-'+c.id} className={'conn-card tone-'+c.tone+(expanded?' expanded':'')+(c.state==='soon'?' soon':'')}>
   <div className="conn-head"><span className="conn-logo"><Glyph size={30} weight={c.id==='ai'?'fill':'regular'}/></span><div className="conn-title"><h3>{c.name}{c.optional&&<small>{T('Optional','אופציונלי')}</small>}</h3><Pill c={c}/></div></div>
   <p className="conn-what">{c.what}</p>
   {c.detail&&<p className="conn-detail">{c.id==='riseup'&&mineRise?.visibility==='private'&&<LockSimple size={15}/>}{c.id==='telegram'&&tg?.media?.voice&&tg.media.voice!=='off'&&<Microphone size={15}/>}<span dir="auto">{c.detail}</span></p>}
   {c.state!=='soon'&&(c.panel||c.action)&&<div className="conn-actions">
    {c.action?<Button secondary={c.state==='on'} onClick={c.action}>{c.state==='off'?T('Connect','חיבור'):T('Manage','ניהול')}</Button>
     :<Button secondary={c.state==='on'||expanded} aria-expanded={expanded} onClick={()=>setOpen(expanded?'':c.id)}>{expanded?T('Close','סגירה'):c.state==='off'?T('Set up','הגדרה'):T('Manage','ניהול')}<CaretDown size={18} className="conn-caret"/></Button>}
   </div>}
   {expanded&&<div className="conn-panel">{c.panel}</div>}
  </section>})}</div>
  {riseup&&fin&&!fin.failed&&<RiseupConnect a={a} data={fin} Avatar={Avatar} onClose={()=>setRiseup(false)} onChanged={async()=>setFin(await get('/api/finance/connections'))}/>}
 </div>;
}
