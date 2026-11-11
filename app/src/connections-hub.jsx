// Settings → Accounts & connections, concept A "quiet checklist" (user decision 2026-11-10, AGENTS.md;
// concept/explorations/connections-20261110/concept-a.png). Three section cards from the connection registry:
// "To start" (AI helper, Telegram, Family members, with a small bar that never counts optional connections),
// "More connections" (optional) and "About this installation" (your account, where the data lives).
// Each row has an honest status and one button. "Set up" opens the registry guide with the connection's own form
// inside it (connection-guide.jsx); "Manage" opens the same window with the form. Nothing is saved before its check.
import React,{useEffect,useState,useCallback} from 'react';
import {PlugsConnected,GoogleLogo,Database,Sparkle,TelegramLogo,Bank,MapPin,CalendarDots,UsersThree,ListChecks,Info,CheckCircle,WarningCircle,Circle,CircleHalf,Users,LockSimple,ShieldCheck,Coins} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {useMaps} from './maps-client';
import {MapsSettings} from './maps-settings';
import {AIConnectionSettings} from './ai';
import {TelegramSettings} from './telegram-settings';
import {RiseupConnect} from './riseup-connect';
import './connections.css';
import './connections-a.css';
import {GoogleCalendarSettings} from './google-calendar';
import {SecuritySettings} from './security-settings';
import {FormSection} from './form-section';
import {ConnectionDialog,ConnectionIdentityProvider,ConnectionSecurityNotice,useConnectionIdentity} from './connection-dialog';
import {ConnectionGuide,guideText} from './connection-guide';
import {CONNECTIONS,CONNECTION_GROUPS} from '../../shared/connections.mjs';
import {EXTRA_CONNECTION_PANELS} from './extensions/connection-panels';
import {KeptExtensionData} from './kept-extension-data'; // feature modules: data kept from removed extensions (2026-11-10)

const get=async path=>{const r=await fetch(path,{headers:cloudHeaders(),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(String(r.status));return r.json()};
const when=(ts,lang)=>{if(!ts)return '';const d=new Date(ts),today=new Date().toDateString()===d.toDateString(),time=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});return today?(lang==='he'?'היום ':'today ')+time:d.toLocaleDateString(lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short'})+' '+time};
const list=(a,items)=>{try{return new Intl.ListFormat(a.lang==='he'?'he':'en',{type:'conjunction'}).format(items)}catch{return items.join(', ')}};

// Connection registry (shared/connections.mjs) gives each row its group, icon, texts, feature and guide. What only the
// client can know stays here, keyed by connection id: live status (state on | off | warn | wait; text for the pill;
// one honest detail line), the window's content, and optionally ownGuide (the panel lays out the guide itself),
// act (who gets an action button) and line (the "About" row text). Extensions register theirs in ./extensions/connection-panels.
const CONNECTION_ICONS={PlugsConnected,GoogleLogo,Database,Sparkle,TelegramLogo,Bank,MapPin,CalendarDots,UsersThree,ListChecks,Info};
const CONNECTION_LIVE={
 ai:{status:({T,cloud,ai,offline,parent,need})=>({state:!cloud?'off':!ai?'wait':ai.failed?'warn':ai.connected&&ai.model?'on':ai.hasKey?'warn':'off',
   status:!cloud?T('Not connected yet','עוד לא מחובר'):!ai?T('Checking…','בודקים…'):ai.failed?T('Status unavailable','המצב אינו זמין'):ai.connected&&ai.model?T('Connected','מחובר'):ai.connected?T('Checked · choose a model','נבדק · בחרו מודל'):ai.hasKey?T('Needs attention','דורש טיפול'):T('Not connected yet','עוד לא מחובר'),
   detail:ai?.connected?ai.providerName+(ai.model?' · '+(ai.models?.find(m=>m.id===ai.model)?.name||ai.model):''):offline||(parent?T('Needs a connection code from an AI provider','צריך קוד חיבור מספק AI')+(need?' · '+need:''):T('A parent connects it','הורה מחבר אותו'))}),
  panel:({a,cloud,parent,ai,Button,Badge,Avatar,setDialogBusy,setAI,entry,setup,T})=>cloud&&<><AIConnectionSettings app={a} ui={{Button,Badge}} embedded guide={setup?entry.guide:null} onBusy={setDialogBusy} onStatus={setAI}/>
   {/* AI usage & credit moved to בית AI › Settings (one place for every AI setting, 2026-11-11); the window links there. */}</>,
  ownGuide:true,act:({parent})=>parent,
  // The guide stays open until a model is saved, so the check and the model choice happen in one window.
  setup:({cloud,ai})=>!cloud||!!ai&&!ai.failed&&!ai.model},
 telegram:{status:({a,T,cloud,tg,me,offline,manager})=>{const linked=(tg?.members||[]).filter(m=>m.linked),missing=(tg?.members||[]).filter(m=>!m.linked).map(m=>a.name(m.id));
   if(!cloud||!tg||tg.failed||!tg.connected)return {state:!cloud?'off':!tg?'wait':tg.failed?'warn':'off',status:!cloud?T('Not connected yet','עוד לא מחובר'):!tg?T('Checking…','בודקים…'):tg.failed?T('Status unavailable','המצב אינו זמין'):T('Not connected yet','עוד לא מחובר'),
    detail:offline||(manager?T('A parent creates the bot once; then everyone links their own chat','הורה יוצר את הבוט פעם אחת; אחר כך כל אחד מקשר את הצ׳אט שלו'):T('A parent sets up the home bot first','הורה מקים קודם את בוט הבית'))};
   if(!manager)return {state:me?.linked&&!me.blocked?'on':'warn',status:me?.linked?(me.blocked?T('Paused','מושהה'):T('My chat is linked','הצ׳אט שלי מקושר')):T('Bot ready · link your chat','הבוט מוכן · קשרו את הצ׳אט'),detail:'@'+tg.botUsername};
   const all=tg.members?.length||0;return {state:missing.length?'warn':'on',status:missing.length?T('Bot ready · '+linked.length+' of '+all+' linked','הבוט מוכן · '+linked.length+' מתוך '+all+' קישרו'):T('Ready · everyone linked','מוכן · כולם קישרו'),
    detail:missing.length?T(list(a,missing)+(missing.length>1?' haven’t':' hasn’t')+' linked their chat yet',list(a,missing)+' עוד לא קישרו את הצ׳אט שלהם'):'@'+tg.botUsername+(tg.media?.voice&&tg.media.voice!=='off'?' · '+T('voice on','קול פעיל'):'')}},
  panel:({a,cloud,Button,Badge,Avatar,setDialogBusy,setTG,entry,setOpen})=>cloud&&<TelegramSettings app={a} ui={{Button,Badge,Avatar}} recipient={a.user} embedded guide={entry} onBusy={setDialogBusy} onStatus={setTG} onClose={()=>setOpen('')}/>,
  ownGuide:true,act:({manager,tg})=>manager||!!tg?.connected,personal:({manager})=>!manager},
 family:{status:({a,T})=>{const adults=a.members.filter(m=>m.role!=='child'),joined=adults.filter(m=>m.accountLinked||m.id===a.user).length,kids=a.members.filter(m=>m.role==='child').length,parents=adults.every(m=>m.role==='parent');
   const who=joined===1?T(parents?'1 parent signed in':'1 adult signed in',parents?'הורה אחד נכנס':'מבוגר אחד נכנס'):T(joined+(parents?' parents':' adults')+' signed in',joined+(parents?' הורים':' מבוגרים')+' נכנסו');
   return {state:joined>=adults.length?'on':'warn',status:joined>=adults.length?T('All set','הכול מוכן'):T(joined+' of '+adults.length+' joined',joined+' מתוך '+adults.length+' הצטרפו'),
    detail:who+(kids?' · '+(kids===1?T('1 child’s profile','פרופיל ילד אחד'):T(kids+' children’s profiles',kids+' פרופילי ילדים')):''),people:a.members.map(m=>m.id)}},
  panel:({a,T,Avatar,Button,parent,setOpen})=><div className="conn-family"><ul className="conn-family-list">{a.members.map(m=><li key={m.id}><Avatar who={m.id} size={44}/><strong>{a.name(m.id)}</strong><small className={m.role==='child'||m.accountLinked||m.id===a.user?'conn-ok':'conn-wait'}>{m.role==='child'?(m.accountLinked?T('Child · own account','ילד · חשבון משלו'):T('Child’s profile','פרופיל ילד')):m.accountLinked||m.id===a.user?T('Signed in with Google','נכנס עם Google'):T('Not joined yet','עוד לא הצטרף')}</small></li>)}</ul>
   <div className="connection-dialog-actions"><Button onClick={()=>{setOpen('');a.go('settings/family')}}>{parent?T('Invite and manage family','הזמנה וניהול המשפחה'):T('Open Family','למשפחה')}</Button></div></div>,
  act:({parent})=>parent},
 maps:{status:({T,cloud,maps})=>({state:maps?.configured?'on':maps?.failed?'warn':cloud&&!maps?'wait':'off',status:maps?.configured?T('Connected · search tested','מחובר · החיפוש נבדק'):maps?.failed?T('Status unavailable','המצב אינו זמין'):cloud&&!maps?T('Checking…','בודקים…'):T('Not connected','לא מחובר')}),
  panel:({a,load,setDialogBusy})=><MapsSettings a={a} onChanged={load} onBusy={setDialogBusy}/>},
 'google-calendar':{status:({T,cloud,calendar})=>({state:calendar?.connected?'on':calendar?.failed?'warn':cloud&&!calendar?'wait':'off',status:calendar?.connected?T('Connected','מחובר'):calendar?.failed?T('Status unavailable','המצב אינו זמין'):cloud&&!calendar?T('Checking…','בודקים…'):T('Not connected','לא מחובר')}),
  panel:({a,Button,calendar,load})=><GoogleCalendarSettings a={a} Button={Button} status={calendar} reload={load}/>},
 riseup:{status:({a,T,cloud,fin,mineRise})=>({state:!cloud?'off':!fin?'wait':fin.failed?'warn':mineRise?(mineRise.status==='ok'?'on':'warn'):'off',
   status:!cloud?T('Not connected','לא מחובר'):!fin?T('Checking…','בודקים…'):fin.failed?T('Status unavailable','המצב אינו זמין'):mineRise?(mineRise.status==='ok'?T('Connected','מחובר')+(mineRise.lastSyncAt?' · '+T('synced ','סנכרון ')+when(mineRise.lastSyncAt,a.lang):''):mineRise.status==='retrying'?T('Retrying','מנסה שוב'):T('Needs attention','דורש טיפול')):T('Not connected','לא מחובר')}),
  panel:({a,T,cloud,fin,Avatar,Button,setDialogBusy,setOpen,load})=>cloud&&(fin&&!fin.failed?<RiseupConnect a={a} data={fin} Avatar={Avatar} embedded onBusy={setDialogBusy} onClose={()=>setOpen('')} onChanged={load}/>:<div><p>{fin?.failed?T('RiseUp status could not be loaded. Try again.','לא הצלחנו לטעון את מצב RiseUp. אפשר לנסות שוב.'):T('Checking RiseUp…','בודקים את RiseUp…')}</p><Button secondary onClick={load}>{T('Retry','ניסיון חוזר')}</Button></div>)},
 account:{status:({a,T,cloud,offline})=>({state:cloud?'on':'off',status:cloud?T('Signed in','מחובר'):T('Not signed in','לא מחובר'),detail:cloud?a.cloud.session?.user?.email:offline}),
  panel:({a,Button})=><ConnectionAccount a={a} Button={Button}/>,
  line:({a,T,cloud})=>cloud?<>{T('Signed in with ','נכנסתם עם ')}<bdi dir="ltr">{a.cloud.session?.user?.email}</bdi></>:T('Not signed in · this is a preview on this device','לא נכנסתם · זו תצוגה במכשיר הזה')},
 storage:{status:({T,config})=>({state:config?.storage?.connected?'on':config?'warn':'wait',status:config?.storage?.connected?T('Connected','מחובר'):config?T('Device only','במכשיר בלבד'):T('Checking…','בודקים…')}),
  panel:({a,config,storage})=><ConnectionStorage a={a} config={config} storage={storage}/>,
  line:({T,config})=>!config?T('Checking…','בודקים…'):config.storage?.connected?(/cloudflare/.test(config.storage.provider||'')?T('In your home on Cloudflare, not with us','בבית שלכם ב־Cloudflare, לא אצלנו'):T('In your home on your own server, not with us','בבית שלכם בשרת משלכם, לא אצלנו'))+' · '+(config.storage.files?T('records and files active','רישומים וקבצים פעילים'):T('records active','רישומים פעילים')):T('Demo data stays on this device','נתוני ההדגמה נשארים במכשיר הזה')},
};
// An extension's row: its registry entry plus {id, Panel, status?(context), Icon?} from ./extensions/connection-panels.
const extensionLive=p=>({status:p.status||(({T})=>({state:'warn',status:T('Status unavailable','המצב אינו זמין')})),Icon:p.Icon,
 panel:x=><p.Panel a={x.a} ui={x.ui} onBusy={x.setDialogBusy} onClose={()=>x.setOpen('')} reload={x.load}/>});
// The install wizard (setup-checklist.jsx) reads the same live statuses for its Today card (2026-11-11).
export const connectionLive=id=>liveFor(id);
const liveFor=id=>CONNECTION_LIVE[id]||(p=>p&&extensionLive(p))(EXTRA_CONNECTION_PANELS.find(p=>p?.id===id&&p.Panel));
const COUNT_WORDS={en:['','One thing','Two things','Three things','Four things','Five things'],he:['','דבר אחד','שני דברים','שלושה דברים','ארבעה דברים','חמישה דברים']};

export {PlugsConnected as ConnectionsIcon};
export function ConnectionsHub(props){return <ConnectionIdentityProvider a={props.app}><ConnectionsHubContent {...props}/></ConnectionIdentityProvider>}
// wizard (install wizard concept A, 2026-11-11): only the To start section, Family members first, with the wizard's own
// family status and window ({status:{family}, family:({close})=>window, onSummary}). Without it nothing changes.
function ConnectionsHubContent({app:a,ui,storage,initialOpen='',wizard=null}){
 const {status:maps}=useMaps(),identity=useConnectionIdentity();
 const {Button,Badge,Avatar}=ui,T=a.T,cloud=!!a.cloud,adult=a.member(a.user).role!=='child',parent=a.member(a.user).role==='parent';
 const initial=new URLSearchParams(a.route.split('?')[1]||'').get('open')||initialOpen;
 const [open,setOpen]=useState(initial),[ai,setAI]=useState(null),[tg,setTG]=useState(null),[fin,setFin]=useState(null),[calendar,setCalendar]=useState(null),[config,setConfig]=useState(null),[dialogBusy,setDialogBusy]=useState(false);
 const load=useCallback(async()=>{
  const settle=(p,set)=>p.then(set).catch(()=>set({failed:true}));
  await Promise.all([settle(get('/api/config'),setConfig),...(cloud?[settle(get('/api/ai/status'),setAI),settle(get('/api/telegram/status'),setTG),...(adult?[settle(get('/api/finance/connections'),setFin),settle(get('/api/google-calendar/status'),setCalendar)]:[])]:[])]);
 },[cloud,adult,a.data.householdId]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{setOpen(initial)},[initial]);

 const me=tg?.members?.find(m=>m.id===a.user),mineRise=fin?.connections?.find(c=>c.provider==='riseup'&&c.mine),otherRise=(fin?.connections||[]).filter(c=>c.provider==='riseup'&&!c.mine);
 const offline=!cloud&&T('Available after signing in','זמין לאחר התחברות'),L=o=>guideText(a,o),manager=tg?.canManage??parent;
 const base={a,ui,T,cloud,adult,parent,manager,offline,ai,tg,fin,calendar,config,maps,me,mineRise,otherRise,storage,Button,Badge,Avatar,setDialogBusy,setAI,setTG,setOpen,load};
 // Every registry entry with live status and a panel becomes a row; adults-only entries are never shown to children.
 const allCards=CONNECTIONS.filter(c=>!c.adultsOnly||adult).flatMap(c=>{const live=liveFor(c.id);if(!live)return [];
  const context={...base,entry:c,need:c.guide?.need?.[0]?L(c.guide.need[0][1]):''},s=(wizard?.status?.[c.id]||live.status)(context),setup=!!c.guide&&(live.setup?live.setup(context):s.state==='off'),mine=!!(c.personal&&live.personal?.(context)),g=mine?c.personal:c.guide;
  const panel=open===c.id?live.panel({...context,setup}):null;
  return [{id:c.id,group:c.group,feature:c.feature,manage:c.manage,adultsOnly:c.adultsOnly,guide:c.guide,icon:CONNECTION_ICONS[c.icon]||live.Icon||PlugsConnected,iconWeight:c.iconWeight,tone:c.tone,name:L(c.name),optional:c.optional,what:L(c.description),action:L(c.action),
   title:mine?L(c.personal):setup?L(c.guide):L(c.name),why:g?L(g.why):L(c.description),note:L(g?.note),
   ...s,setup,act:live.act?live.act(context):c.manage==='person'||parent,line:live.line?.(context),
   // Without a server (the preview on this device) a connection's own form is not there; its guide still is.
   body:open!==c.id?null:live.ownGuide&&panel?panel:setup||!panel?(c.guide?{guide:true,panel:panel||<p className="conn-offline">{offline||T('A parent sets this up.','הורה מגדיר את זה.')}</p>}:panel):panel}]});
 // Features registry (2026-11-09): a connection whose feature is off for this person has no row.
 const cards=allCards.filter(c=>!c.feature||a.features?.on(c.feature)!==false),inGroup=id=>cards.filter(c=>c.group===id);
 const Pill=({c})=>{const Glyph=c.state==='on'?CheckCircle:c.state==='warn'?WarningCircle:c.state==='part'?CircleHalf:Circle;return <span className={'conn-pill '+c.state}><Glyph size={16} weight={c.state==='off'||c.state==='wait'?'regular':'fill'}/>{c.status}</span>};
 const active=cards.find(c=>c.id===open);
 const close=()=>{if(!dialogBusy&&!identity.authorizing){setOpen('');load()}};
 const group=id=>CONNECTION_GROUPS.find(g=>g.id===id),GroupIcon=g=>CONNECTION_ICONS[g.icon]||PlugsConnected;
 const start=wizard?[...inGroup('start')].sort((x,y)=>(y.id==='family')-(x.id==='family')):inGroup('start'),more=wizard?[]:inGroup('more'),about=inGroup('about'),ready=start.filter(c=>c.state==='on').length;
 const left=start.filter(c=>c.state!=='on').map(c=>c.state==='warn'?T('finish '+c.name,'לסיים את '+c.name):c.name);
 const button=(c,primary)=>{const label=c.label||(!c.act?T('Details','פרטים'):c.setup?T('Set up','הגדרה'):T('Manage','ניהול'));return <Button secondary={!primary||!c.act||!c.setup} aria-haspopup="dialog" aria-label={label+' · '+c.name} onClick={()=>setOpen(c.id)}>{label}</Button>};
 const row=(c,isStart)=>{const Glyph=c.icon;return <div key={c.id} id={'connection-'+c.id} className={'conn-row'+(isStart?' conn-start-row':'')}>
  <span className={'conn-tile tone-'+c.tone} aria-hidden="true"><Glyph size={isStart?28:24} weight={c.iconWeight||'regular'}/></span>
  <div className="conn-name"><h4>{c.name}</h4><Pill c={c}/></div>
  <p className="conn-what">{c.what}</p>
  {isStart?c.detail&&<p className="conn-detail">{c.people&&<span className="conn-people" aria-hidden="true">{c.people.map(id=><Avatar key={id} who={id} size={28} decorative/>)}</span>}<span dir="auto">{c.detail}</span></p>
   :<p className="conn-who"><Users size={16} aria-hidden="true"/>{c.manage==='household'?T('For the whole home','לכל הבית'):c.adultsOnly?T('Each adult separately','כל מבוגר בנפרד'):T('Each person separately','כל אחד בנפרד')}</p>}
  {button(c,isStart)}</div>};
 const g1=group('start'),g2=group('more'),g3=group('about');
 useEffect(()=>{wizard?.onSummary?.({total:start.length,ready,rows:start.map(c=>({id:c.id,name:c.name,state:c.state,status:c.status}))})},[!!wizard,start.length,ready,start.map(c=>c.id+c.state+c.status).join()]);
 const startNote=(COUNT_WORDS[a.lang==='he'?'he':'en'][start.length]||T(start.length+' things',start.length+' דברים'))+T(', and your home is ready',', והבית מוכן');
 const guard=c=>['telegram','riseup'].includes(c.id)||(['ai','maps'].includes(c.id)&&parent);
 const foot=active&&(identity.recent&&guard(active)&&active.act?T('Google confirmation is current','אישור Google בתוקף'):active.note);
 const body=active&&(active.body?.guide?<ConnectionGuide a={a} g={active.guide} selfId={active.id} panel={active.body.panel} onCard={id=>setOpen(id)} onRoute={route=>{setOpen('');a.go(route)}}/>:active.body);
 return <div className="connections-hub conn-a"><div className="settings-v2 conn-sections"><div className="settings-grid">
  {!!start.length&&<FormSection T={T} icon={GroupIcon(g1)} tone={g1.tone} className="settings-wide conn-start" title={L(g1.name)} note={startNote}>
   <div className="conn-progress" role="status"><span className="conn-bar" aria-hidden="true">{start.map(c=><i key={c.id} className={c.state==='on'?'on':''}/>)}</span>
    <span>{wizard?.progress?wizard.progress({ready,total:start.length,left:start.filter(c=>c.state!=='on').map(c=>c.name)}):<>{T('Ready: '+ready+' of '+start.length,'מוכן '+ready+' מתוך '+start.length)}{left.length?' · '+T('Left: ','נשאר: ')+list(a,left):' · '+T('your home is set up','הבית מוכן')}</>}</span></div>
   <div className="conn-rows">{start.map(c=>row(c,true))}</div></FormSection>}
  {!!more.length&&<FormSection T={T} icon={GroupIcon(g2)} tone={g2.tone} className="settings-wide conn-more" title={L(g2.name)} note={L(g2.note)}>
   <p className="conn-intro">{L(g2.intro)}</p><div className="conn-rows">{more.map(c=>row(c,false))}</div></FormSection>}
  {!wizard&&!!about.length&&<FormSection T={T} icon={GroupIcon(g3)} tone={g3.tone} className="settings-wide conn-about" title={L(g3.name)} collapsible summary={about.map(c=>c.line&&typeof c.line==='string'?c.line:'').filter(Boolean).join(' · ')}>
   <div className="conn-about-rows">{about.map(c=>{const Glyph=c.icon;return <div key={c.id} id={'connection-'+c.id} className="conn-about-row"><Glyph size={22} aria-hidden="true"/><div><strong>{c.name}</strong><span dir="auto">{c.line||c.detail||c.status}</span></div><button type="button" className="text-link conn-link" aria-haspopup="dialog" onClick={()=>setOpen(c.id)}>{c.action||T('Details','פרטים')}</button></div>})}</div></FormSection>}
 </div></div>
  {wizard&&open==='family'&&wizard.family({close:()=>{setOpen('');load()}})}
  {active&&body&&!(wizard&&open==='family')&&<ConnectionDialog key={active.id} a={a} title={active.title} icon={active.icon} status={active.group==='about'?null:<Pill c={active}/>} description={active.why} busy={dialogBusy||identity.authorizing} onClose={close}
   footer={<>{foot?<small className="conn-foot-note"><ShieldCheck size={16} aria-hidden="true"/>{foot}</small>:<span/>}<Button secondary disabled={dialogBusy||identity.authorizing} onClick={close}>{T('Close','סגירה')}</Button></>}>
   {guard(active)&&<ConnectionSecurityNotice a={a} connection={active.id}/>}{body}</ConnectionDialog>}
 </div>;
}

function ConnectionAccount({a,Button}){
 return <div className="connection-account"><dl><dt>{a.cloud?.session?.user&&!a.cloud.session.user.email?a.T('How you sign in','איך נכנסים'):a.T('Your Google account','חשבון Google שלכם')}</dt><dd dir="auto">{a.cloud?.session?.user?.email||(a.cloud?.session?.user?a.T('With a passkey','עם מפתח גישה'):a.T('Not signed in','לא מחוברים'))}</dd></dl><p>{a.T('Each person signs in with their own account. Invite people to share your household; private records keep their own access rules.','כל אחד נכנס עם חשבון משלו. מזמינים אנשים כדי לשתף את הבית; לרישומים פרטיים נשמרות הרשאות הגישה שלהם.')}</p><div className="connection-dialog-actions"><Button onClick={()=>a.go('settings/family')}>{a.T('Manage family members','ניהול בני המשפחה')}</Button>{a.cloud?<Button secondary onClick={()=>a.cloud.signOut()}>{a.T('Sign out of Bayit','יציאה מ־Bayit')}</Button>:<Button onClick={()=>a.go('welcome')}>{a.T('Sign in with Google','כניסה עם Google')}</Button>}</div>{a.cloud&&<details className="connection-help" open><summary>{a.T('Signed-in devices & security','מכשירים מחוברים ואבטחה')}</summary><SecuritySettings a={a} Button={Button} sessions connection="account"/></details>}</div>
}

function ConnectionStorage({a,config,storage}){
 return <div className="connection-account"><div className="connection-storage-items">{[[Database,a.T('Household records','רישומי הבית'),!!config?.storage?.connected,a.T('Calendars, tasks and notes in this installation. The server checks who can access each record.','יומנים, משימות והערות בהתקנה הזו. השרת בודק מי רשאי לגשת לכל רישום.')],[LockSimple,a.T('Private file storage','אחסון קבצים פרטי'),!!config?.storage?.files,a.T('Photos and documents follow their saved viewing permissions. Assigning a person does not grant access.','תמונות ומסמכים פועלים לפי הרשאות הצפייה שנשמרו. שיוך לאדם אינו מעניק גישה.')]].map(([Icon,title,on,description])=><div key={title}><Icon size={26}/><section><strong>{title} · {on?a.T('Connected','מחובר'):a.T('Not connected','לא מחובר')}</strong><p>{description}</p></section></div>)}</div><KeptExtensionData a={a}/><details className="connection-help"><summary>{a.T('Installation details & setup','פרטי ההתקנה והגדרה')}</summary>{storage}</details></div>
}
