import React,{useState,useEffect,useRef,useId} from 'react';
import {TelegramLogo,Link,LinkBreak,PaperPlaneTilt,ArrowSquareOut,ArrowClockwise,LockSimple,CheckCircle,WarningCircle,PauseCircle,CircleDashed,Camera,Microphone,CaretDown,SunHorizon} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {Select} from './Select';
import './telegram.css';
import {WidgetSkeleton} from './skeleton';
import {useConnectionIdentity} from './connection-dialog';
import {GuideIntro,GuideSteps,guideText} from './connection-guide';

async function api(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch('/api/telegram/'+path,{method,headers:{...cloudHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 let result;try{result=await response.json()}catch{throw new Error('The Telegram service is unavailable.')}
 if(!response.ok)throw Object.assign(new Error(result.error||'The Telegram request failed.'),{code:result.code,status:response.status});return result;
}
const clock=iso=>iso?new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'';

// Settings → Accounts & connections → Telegram. States shown here come only from the server; nothing claims a
// delivery unless Telegram's API accepted the message.
// guide (the registry entry, concept A 2026-11-10): a parent sets the bot up once through the registry guide, and it then
// shrinks to one summary line above the family list; everyone else sees only "My Telegram chat". Photos & voice and the
// morning summary are closed rows in one style.
export function TelegramSettings({app:a,ui:{Button,Badge,Avatar},recipient,embedded=false,guide=null,onBusy,onStatus}){
 const cloud=!!a.cloud,[status,setStatus]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState(null),tokenInput=useRef(null),[botOpen,setBotOpen]=useState(false),[checkedAt,setCheckedAt]=useState(''),formId=useId();
 const identity=useConnectionIdentity();useEffect(()=>{onBusy?.(!!busy)},[busy,onBusy]);
 useEffect(()=>{if(status)onStatus?.(status)},[status,onStatus]);
 const refresh=async()=>{if(!cloud)return;try{setStatus(await api('status'))}catch(e){setStatus({unavailable:true,members:[]});setError(e.message)}};
 useEffect(()=>{if(!cloud)return;refresh();window.addEventListener('focus',refresh);const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},15000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer)}},[cloud]);
 const run=async(key,work,authorized=false)=>{if(!authorized&&/^(bot|media|link:|unlink:)/.test(key)&&!await identity.guard('telegram'))return;setError('');setNotice('');setBusy(key);try{return await work()}catch(e){if(identity.rejected(e,'telegram'))setError(a.T('Confirm with Google before changing this connection. No changes were saved.','צריך לאשר עם Google לפני שינוי החיבור. לא נשמרו שינויים.'));else setError(e.message)}finally{setBusy('')}};
 const connectBot=async e=>{e.preventDefault();if(!await identity.guard('telegram'))return;const token=tokenInput.current.value.trim();tokenInput.current.value='';if(token)run('bot',async()=>setStatus(await api('bot',{token})),true)};
 const link=memberId=>run('link:'+memberId,async()=>{const result=await api('link',{memberId});setPending({memberId,...result});window.open(result.url,'_blank','noopener')});
 const unlink=memberId=>run('unlink:'+memberId,async()=>{setStatus(await api('link/'+encodeURIComponent(memberId),undefined,'DELETE'));setPending(null)});
 const test=()=>run('test',async()=>{const result=await api('test',{});setNotice(a.T('Telegram accepted the test message at '+clock(result.at)+'. Check your chat.','טלגרם קיבל את הודעת הבדיקה ב־'+clock(result.at)+'. בדקו את הצ׳אט.'))});
 const check=()=>run('check',async()=>{const r=await api('check',{});if(r.ok)setCheckedAt(r.checkedAt);setNotice(r.ok?a.T('Webhook verified with Telegram at '+clock(r.checkedAt)+'.','החיבור אומת מול טלגרם ב־'+clock(r.checkedAt)+'.'):a.T('Telegram reports a problem: ','טלגרם מדווח על בעיה: ')+(r.lastError||a.T('the webhook address does not match.','כתובת ה־webhook אינה תואמת.')))});
 const disconnect=()=>{if(window.confirm(a.T('Disconnect the household bot? Everyone will need to connect again.','לנתק את בוט הבית? כל אחד יצטרך להתחבר מחדש.')))run('bot',async()=>setStatus(await api('bot',undefined,'DELETE')))};
 const profile=a.data.profiles[recipient]||{},digest=profile.notificationPrefs?.digest||'',setDigest=value=>a.update(d=>{d.profiles[recipient].notificationPrefs={...d.profiles[recipient].notificationPrefs,digest:value}});
 const connected=cloud&&status?.connected,me=status?.members?.find(m=>m.id===a.user),lastRun=status?.schedulerLastRun,stale=!lastRun||Date.now()-Date.parse(lastRun)>5*60000;
 const memberState=m=>{const s=status?.members?.find(x=>x.id===m.id);return s?.blocked?['peach',a.T('Paused','מושהה')]:s?.linked?['green',a.T('Linked','מקושר')]:['peach',a.T('Not linked','לא מקושר')]};
 const Step=({n,children})=><h3 className="telegram-step"><span aria-hidden="true">{n}</span>{children}</h3>;
 const media=status?.media,canManage=!!status?.canManage,setMedia=change=>run('media',async()=>setStatus(await api('media',change)));
 // Voice messages: every speech provider from the server's registry (app/cloud/speech.mjs) with honest availability for
 // this household; unavailable ones stay listed, disabled, with the reason underneath in the same quiet style.
 const voiceRow=disabled=>{const T=a.T,options=media?.speechOptions||[],current=media?.speechProvider||'off',chosen=options.find(o=>o.id===current),name=o=>T(o.name.en,o.name.he)+(o.label?' · '+o.label:'');
  return <div className="telegram-media-row"><span className="telegram-media-icon"><Microphone size={26} weight="duotone"/></span><div><label className="telegram-media-select"><span>{T('Voice messages','הודעות קוליות')}</span><Select aria-label={T('Voice transcription provider','ספק תמלול קולי')} value={current} disabled={disabled} onChange={e=>setMedia({speechProvider:e.target.value})}><option value="off">{T('Off','כבוי')}</option>{options.map(o=><option key={o.id} value={o.id} disabled={!o.available&&o.id!==current}>{name(o)+(o.available?'':T(' · not available',' · לא זמין'))}</option>)}</Select></label>
   <small>{chosen?T(chosen.cost.en,chosen.cost.he)+' ':''}{T('Up to 2 minutes per message and 60 minutes a day. You see what was heard before anything is prepared.','עד 2 דקות להודעה ו־60 דקות ביום. תראו מה נשמע לפני שמשהו מוכן.')}</small>
   {options.filter(o=>!o.available&&o.reason).map(o=><small key={o.id}><strong>{name(o)}:</strong> {T(o.reason.en,o.reason.he)}</small>)}</div></div>};
 // Same markup and classes as the app's Switch, with a disabled state for members who cannot manage it.
 const Toggle=({checked,onChange,label,disabled})=><label className="switch-row telegram-toggle"><span>{label}</span><button type="button" role="switch" aria-checked={!!checked} disabled={disabled} className={'switch '+(checked?'on':'')} onClick={()=>onChange(!checked)}><span/></button></label>;
 if(cloud&&!status)return <aside className="warm-panel telegram-panel" aria-labelledby="telegram-title"><header className="telegram-head"><span className="telegram-logo-tile"><TelegramLogo size={38} weight="fill"/></span><div><h2 id="telegram-title">{a.T('Telegram','טלגרם')}</h2><p>{a.T('Reminders and Bayit chat in your own bot','תזכורות וצ׳אט עם Bayit בבוט שלכם')}</p></div></header><WidgetSkeleton rows={3} label={a.T('Checking the Telegram connection…','בודקים את החיבור לטלגרם…')}/></aside>;
 if(guide&&embedded&&cloud&&status){
  const T=a.T,L=o=>guideText(a,o),members=status.members||[],when=iso=>{if(!iso)return '';const d=new Date(iso);return (new Date().toDateString()===d.toDateString()?T('today ','היום '):d.toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short'})+' ')+clock(iso)};
  const fold=(Icon,title,sub,children,cls='')=><details className={'conn-fold '+cls}><summary><Icon size={24} aria-hidden="true"/><span><strong>{title}</strong><small>{sub}</small></span><CaretDown className="conn-fold-caret" size={20} weight="bold" aria-hidden="true"/></summary><div className="conn-fold-body">{children}</div></details>;
  const morning=fold(SunHorizon,T('Morning summary','סיכום בוקר'),digest?T('Every morning at '+digest,'כל בוקר ב־'+digest):me?.linked?T('Off · choose a time','כבוי · בחרו שעה'):T('You can choose a time after linking','אפשר לבחור שעה אחרי הקישור'),
   <div className="telegram-digest"><div><span>{T('Your day, sent to Telegram every morning at','היום שלכם, נשלח לטלגרם כל בוקר בשעה')}</span><Select aria-label={T('Daily summary time','שעת הסיכום היומי')} value={digest} onChange={e=>setDigest(e.target.value)}><option value="">{T('Off','כבוי')}</option>{['05:30','06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00'].map(t=><option key={t} value={t}>{t}</option>)}</Select><small className="telegram-digest-note">{T('Calendar, today’s tasks (important first), anything overdue, anytime tasks, what’s left to buy and, for parents, approvals. Personal: only what you can see. Sent even during quiet hours.','יומן, משימות להיום (חשובות קודם), מה שבאיחור, משימות בכל זמן, מה נשאר לקנות, ולהורים גם אישורים. אישי: רק מה שמותר לכם לראות. נשלח גם בשעות השקט.')}</small></div></div>);
  const messages=<>{error&&<p role="alert" className="ai-error">{error}</p>}{notice&&<p role="status" className="telegram-notice">{notice}</p>}</>;
  const linkNote=pending&&!members.find(x=>x.id===pending.memberId)?.linked&&<p className="telegram-link-note"><a href={pending.url} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={19}/> {T('Open Telegram and press Start','פתחו את טלגרם ולחצו Start')}</a><small>{T('One-time link for '+a.name(pending.memberId)+' · valid until '+clock(pending.expiresAt),'קישור חד־פעמי עבור '+a.name(pending.memberId)+' · בתוקף עד '+clock(pending.expiresAt))}</small></p>;
  if(canManage&&!connected){const g=guide.guide;
   return <div className="conn-guide telegram-guide"><GuideIntro a={a} g={g}/><form id={formId} onSubmit={connectBot} hidden/>
    <GuideSteps a={a} g={g} slots={{2:{actions:false,body:<div className="conn-field"><input ref={tokenInput} form={formId} type="password" name="telegram-bot-token" autoComplete="off" spellCheck={false} dir="ltr" placeholder="123456789:AA…" aria-label={T('Telegram bot code (bot token)','קוד הבוט מטלגרם (Bot Token)')} disabled={!!busy||status.available===false}/></div>},
     3:{body:<div className="setup-actions"><Button type="submit" form={formId} disabled={!!busy||status.available===false}>{busy==='bot'?T('Checking…','בודקים…'):T('Check','בדיקה')}</Button></div>}}}/>{messages}</div>;
  }
  if(canManage){
   return <div className="conn-telegram">
    <div className="conn-summary" role="status"><CheckCircle size={26} weight="fill" aria-hidden="true"/><strong>{T('Home bot ','בוט הבית ')}<bdi dir="ltr">@{status.botUsername}</bdi>{T(' is working',' פועל')}</strong>
     <span>{checkedAt?T('Checked with Telegram '+when(checkedAt),'נבדק מול טלגרם '+when(checkedAt)):status.connectedAt?T('Connected '+when(status.connectedAt),'חובר '+when(status.connectedAt)):''}{' · '}{T('Set up once; no need to do it again','הוקם פעם אחת, אין צורך לחזור על זה')}</span>
     <button type="button" className="text-link conn-link" aria-expanded={botOpen} onClick={()=>setBotOpen(!botOpen)}>{T('Manage the bot','ניהול הבוט')}</button></div>
    {botOpen&&<div className="conn-bot-manage"><div className="telegram-actions"><Button secondary icon={ArrowClockwise} disabled={!!busy} onClick={check}>{busy==='check'?T('Checking…','בודקים…'):T('Test connection','בדיקת חיבור')}</Button><Button quiet icon={LinkBreak} disabled={!!busy} onClick={disconnect}>{T('Disconnect','ניתוק')}</Button></div>
     <div className="telegram-schedule" data-stale={stale}><img src="/assets/icons/bayit/activities/alarm-clock-64.png" alt="" width="40" height="40"/><span>{lastRun?(stale?T('Reminder schedule has not run since ','לוח התזכורות לא פעל מאז ')+clock(lastRun):T('Reminder schedule is running · last run ','לוח התזכורות פועל · ריצה אחרונה ')+clock(lastRun)):T('Timed reminders start once the bayit-reminders schedule is deployed. Chat and buttons already work.','תזכורות מתוזמנות יתחילו לאחר הפעלת לוח התזכורות bayit-reminders. הצ׳אט והכפתורים כבר עובדים.')}</span></div></div>}
    {messages}
    <h3 className="conn-h">{T('Who linked their chat','מי קישר את הצ׳אט')}</h3>
    <ul className="conn-members">{a.members.map(m=>{const s=members.find(x=>x.id===m.id),own=m.id===a.user;return <li key={m.id}><Avatar who={m.id} size={44}/><strong>{a.name(m.id)}{own?T(' (you)',' (אתם)'):''}</strong>
     <small className={s?.blocked?'conn-wait':s?.linked?'conn-ok':'conn-wait'}>{s?.blocked?T('Paused','מושהה'):s?.linked?T('Linked','מקושר')+(own&&digest?' · '+T('morning summary '+digest,'סיכום בוקר '+digest):''):T('Not linked yet','עוד לא מקושר')}</small>
     {s?.canLink&&<div className="conn-act">{s.linked?<>{own&&<Button secondary icon={PaperPlaneTilt} disabled={!!busy} onClick={test}>{busy==='test'?T('Sending…','שולחים…'):T('Test','בדיקה')}</Button>}<Button quiet disabled={!!busy} onClick={()=>unlink(m.id)}>{T('Unlink','ניתוק')}</Button></>:<Button secondary icon={Link} disabled={!!busy} onClick={()=>link(m.id)}>{busy==='link:'+m.id?T('Creating…','יוצרים…'):own?T('Link my chat','קישור הצ׳אט שלי'):T('Send link','שליחת קישור')}</Button>}</div>}</li>})}</ul>
    {linkNote}{morning}
    {fold(Camera,T('Photos & voice','תמונות והודעות קוליות'),T('Photos: ','תמונות: ')+(media?.photos?T('on','פועל'):T('off','כבוי'))+' · '+T('voice messages: ','הודעות קוליות: ')+(media?.speechProvider&&media.speechProvider!=='off'?T('on','פועל'):T('off','כבוי')),
     <div className="telegram-media">
      <div className="telegram-media-row"><span className="telegram-media-icon"><Camera size={26} weight="duotone"/></span><div><Toggle checked={!!media?.photos} disabled={!!busy} onChange={v=>setMedia({photos:v})} label={T('Read photos with AI','קריאת תמונות עם AI')}/><small>{T('Send a schedule, a list or an invitation; the AI prepares events, tasks or items for you to apply.','שלחו מערכת שעות, רשימה או הזמנה; ה־AI מכין אירועים, משימות או פריטים לאישורכם.')}{media&&!media.aiConnected?' '+T('Needs the AI helper connected first.','דורש קודם חיבור של עוזר ה־AI.'):''}</small></div></div>
      {voiceRow(!!busy)}
     </div>)}
   </div>;
  }
  // Everyone else: only "My Telegram chat".
  const p=guide.personal;
  if(!connected)return <div className="conn-telegram"><p className="conn-guide-intro">{T('A parent sets up the home bot first. Then you link your own chat here.','הורה מקים קודם את בוט הבית. אחר כך מקשרים כאן את הצ׳אט שלך.')}</p>{messages}</div>;
  if(me?.linked)return <div className="conn-telegram"><div className="conn-summary" role="status"><CheckCircle size={26} weight="fill" aria-hidden="true"/><strong>{me.blocked?T('Your chat is paused','הצ׳אט שלך מושהה'):T('Your chat is linked','הצ׳אט שלך מקושר')}</strong><span><bdi dir="ltr">@{status.botUsername}</bdi>{me.telegramName?' · '+me.telegramName:''}</span></div>
   <div className="telegram-actions"><Button secondary icon={PaperPlaneTilt} disabled={!!busy} onClick={test}>{busy==='test'?T('Sending…','שולחים…'):T('Send me a test','שליחת בדיקה אליי')}</Button><Button quiet icon={LinkBreak} disabled={!!busy} onClick={()=>unlink(a.user)}>{T('Unlink','ניתוק')}</Button></div>{messages}{morning}</div>;
  return <div className="conn-guide telegram-guide"><p className="conn-guide-intro">{T('The home bot is ready. All that’s left is to link your own chat.','בוט הבית כבר מוכן. נשאר לך רק לקשר את הצ׳אט שלך.')}</p><GuideIntro a={a} g={{...p,icon:'TelegramLogo'}}/>
   <GuideSteps a={a} g={p} slots={{0:{body:<div className="setup-actions"><Button icon={TelegramLogo} disabled={!!busy} onClick={()=>link(a.user)}>{busy==='link:'+a.user?T('Creating…','יוצרים…'):T('Link my chat','קישור הצ׳אט שלי')}</Button></div>}}}/>{linkNote}{messages}{morning}</div>;
 }
 return <aside className="warm-panel telegram-panel" aria-labelledby="telegram-title">
  {!embedded&&<header className="telegram-head">
   <span className="telegram-logo-tile"><TelegramLogo size={38} weight="fill"/></span>
   <div><h2 id="telegram-title">{a.T('Telegram','טלגרם')}</h2><p>{a.T('Reminders and Bayit chat in your own bot','תזכורות וצ׳אט עם Bayit בבוט שלכם')}</p></div>
  </header>}
  <div className={'telegram-conn'+(connected?' is-on':'')} role="status">
   <span className="telegram-conn-icon">{connected?<CheckCircle size={30} weight="fill"/>:<WarningCircle size={30} weight="fill"/>}</span>
   <div><strong>{connected?a.T('Bot connected','הבוט מחובר'):a.T('Not connected yet','עדיין לא מחובר')}</strong><small dir={connected?'ltr':undefined}>{connected?'@'+status.botUsername:cloud?a.T('A parent adds the household bot below','הורה מוסיף את בוט הבית למטה'):a.T('Local preview · no messages are sent','תצוגה מקומית · לא נשלחות הודעות')}</small></div>
  </div>
  {error&&<p role="alert" className="ai-error">{error}</p>}{notice&&<p role="status" className="telegram-notice">{notice}</p>}

  <section className="telegram-section">
   <Step n="1">{a.T('Household bot','בוט הבית')}</Step>
   {!cloud&&<p className="telegram-copy">{a.T('Telegram works on your hosted Bayit after Google sign-in. This local preview never sends messages.','טלגרם פועל ב־Bayit המאוחסן שלכם לאחר כניסה עם Google. התצוגה המקומית הזו אינה שולחת הודעות.')}</p>}
   {cloud&&!connected&&(status?.canManage?<form className="telegram-form" onSubmit={connectBot}>
    <label>{a.T('Bot token','אסימון בוט (Bot Token)')}<input ref={tokenInput} type="password" name="telegram-bot-token" autoComplete="off" spellCheck={false} dir="ltr" placeholder="123456789:AA…" aria-label={a.T('Telegram bot token','אסימון בוט טלגרם')} disabled={!!busy||status?.available===false}/></label>
    <details className="connection-help"><summary>{a.T("Need a bot token?","צריכים אסימון בוט?")}</summary><ol className="telegram-howto"><li>{a.T('In Telegram, open @BotFather and send /newbot.','בטלגרם, פתחו את ‎@BotFather ושלחו ‎/newbot.')}</li><li>{a.T('Paste the token it gives you here.','הדביקו כאן את האסימון שתקבלו.')}</li></ol></details>
    <Button type="submit" icon={Link} disabled={!!busy||status?.available===false}>{busy==='bot'?a.T('Connecting…','מתחברים…'):a.T('Connect bot','חיבור הבוט')}</Button>
    <small className="telegram-fine"><LockSimple size={17}/>{a.T('Encrypted on your household server. Never returned to the browser.','מוצפן בשרת הבית. לעולם אינו מוחזר לדפדפן.')}</small>
   </form>:status&&<p className="telegram-copy">{a.T('A parent connects the household bot. Then each person links their own chat below.','הורה מחבר את בוט הבית. לאחר מכן כל אחד מקשר כאן את הצ׳אט שלו.')}</p>)}
   {connected&&<div className="telegram-actions"><Button secondary icon={ArrowClockwise} disabled={!!busy} onClick={check}>{busy==='check'?a.T('Checking…','בודקים…'):a.T('Test connection','בדיקת חיבור')}</Button>{status.canManage&&<Button quiet icon={LinkBreak} disabled={!!busy} onClick={disconnect}>{a.T('Disconnect','ניתוק')}</Button>}</div>}
   {connected&&<div className="telegram-schedule" data-stale={stale}><img src="/assets/icons/bayit/activities/alarm-clock-64.png" alt="" width="40" height="40"/><span>{lastRun?(stale?a.T('Reminder schedule has not run since ','לוח התזכורות לא פעל מאז ')+clock(lastRun):a.T('Reminder schedule is running · last run ','לוח התזכורות פועל · ריצה אחרונה ')+clock(lastRun)):a.T('Timed reminders start once the bayit-reminders schedule is deployed. Chat and buttons already work.','תזכורות מתוזמנות יתחילו לאחר הפעלת לוח התזכורות bayit-reminders. הצ׳אט והכפתורים כבר עובדים.')}</span></div>}
  </section>

  <section className="telegram-section">
   <Step n="2">{a.T('Link family members','קישור בני המשפחה')}</Step>
   <p className="telegram-copy">{a.T('Each person presses Start in their own Telegram. Messages only include what they can see in Bayit.','כל אחד לוחץ Start בטלגרם שלו. ההודעות כוללות רק מה שמותר לו לראות ב־Bayit.')}</p>
   <ul className="telegram-members">{a.members.map(m=>{const s=status?.members?.find(x=>x.id===m.id),[color,label]=memberState(m),canLink=connected&&s?.canLink;return <li className="telegram-member" key={m.id}>
    <Avatar who={m.id} size={46}/>
    <div className="telegram-member-name"><strong>{a.name(m.id)}</strong><span className={'telegram-chip '+(s?.blocked?'is-paused':s?.linked?'is-on':'is-off')}>{s?.blocked?<PauseCircle size={16} weight="fill"/>:s?.linked?<CheckCircle size={16} weight="fill"/>:<CircleDashed size={16} weight="bold"/>}{label}</span></div>
    {canLink&&<div className="telegram-member-actions">{s.linked?<>{m.id===a.user&&<Button secondary icon={PaperPlaneTilt} disabled={!!busy} onClick={test}>{busy==='test'?a.T('Sending…','שולחים…'):a.T('Test','בדיקה')}</Button>}<Button quiet disabled={!!busy} onClick={()=>unlink(m.id)}>{a.T('Unlink','ניתוק')}</Button></>:<Button secondary icon={Link} disabled={!!busy} onClick={()=>link(m.id)}>{busy==='link:'+m.id?a.T('Creating…','יוצרים…'):a.T('Connect','חיבור')}</Button>}</div>}
   </li>})}</ul>
   {pending&&!status?.members?.find(x=>x.id===pending.memberId)?.linked&&<p className="telegram-link-note"><a href={pending.url} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={19}/> {a.T('Open Telegram and press Start','פתחו את טלגרם ולחצו Start')}</a><small>{a.T('One-time link for '+a.name(pending.memberId)+' · valid until '+clock(pending.expiresAt),'קישור חד־פעמי עבור '+a.name(pending.memberId)+' · בתוקף עד '+clock(pending.expiresAt))}</small></p>}
  </section>

  <section className="telegram-section">
   <Step n="3">{a.T('Daily summary','סיכום יומי')}</Step>
   <div className="telegram-digest"><img src="/assets/icons/bayit/pixel/smiling-sun-64.png" alt="" width="48" height="48"/><div><span>{a.T('Your day, sent to Telegram every morning at','היום שלכם, נשלח לטלגרם כל בוקר בשעה')}</span><Select aria-label={a.T('Daily summary time','שעת הסיכום היומי')} value={digest} onChange={e=>setDigest(e.target.value)}><option value="">{a.T('Off','כבוי')}</option>{['05:30','06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00'].map(t=><option key={t} value={t}>{t}</option>)}</Select><small className="telegram-digest-note">{a.T('Calendar, today’s tasks (important first), anything overdue, anytime tasks, what’s left to buy and, for parents, approvals. Personal: only what you can see. Sent even during quiet hours.','יומן, משימות להיום (חשובות קודם), מה שבאיחור, משימות בכל זמן, מה נשאר לקנות, ולהורים גם אישורים. אישי: רק מה שמותר לכם לראות. נשלח גם בשעות השקט.')}</small></div></div>
  </section>

  <details className="telegram-section connection-help telegram-media-fold"><summary><span className="telegram-step-inline" aria-hidden="true">4</span>{a.T('Photos & voice','תמונות והודעות קוליות')}</summary>
   <div className="telegram-media">
    <div className="telegram-media-row"><span className="telegram-media-icon"><Camera size={26} weight="duotone"/></span><div><Toggle checked={!!media?.photos} disabled={!connected||!canManage||!!busy} onChange={v=>setMedia({photos:v})} label={a.T('Read photos with AI','קריאת תמונות עם AI')}/><small>{a.T('Send a schedule, a list or an invitation; the AI prepares events, tasks or items for you to apply.','שלחו מערכת שעות, רשימה או הזמנה; ה־AI מכין אירועים, משימות או פריטים לאישורכם.')}{connected&&media&&!media.aiConnected?' '+a.T('Needs an AI provider connected in Settings → Accounts & connections.','דורש חיבור ספק AI בהגדרות ← חשבונות וחיבורים.'):''}</small></div></div>
    {voiceRow(!connected||!canManage||!!busy)}
    {connected&&!canManage&&<small className="telegram-fine"><LockSimple size={17}/>{a.T('A parent manages photos and voice for the household.','הורה מנהל תמונות והודעות קוליות עבור הבית.')}</small>}
   </div>
  </details>

  <footer className="telegram-foot"><img src="/assets/icons/openmoji/svg/1F4AC.svg" alt="" width="34" height="34"/><small>{a.T('Write, send a photo or speak to the bot, like “add milk to the list”. You review and press Apply. Start with /mine for your private space. Private chats only; Telegram does not sign anyone in.','כתבו, שלחו תמונה או דברו אל הבוט, למשל „להוסיף חלב לרשימה”. אתם בודקים ולוחצים על החלה. התחילו ב־/mine למרחב הפרטי. צ׳אטים פרטיים בלבד; טלגרם אינו משמש לכניסה.')}{me?.linked&&me.telegramName?' · '+a.T('Your chat: ','הצ׳אט שלכם: ')+me.telegramName:''}</small></footer>
  {!cloud&&<Button secondary onClick={()=>a.go('settings/storage')}>{a.T('Installation setup','הגדרת ההתקנה')}</Button>}
 </aside>;
}
