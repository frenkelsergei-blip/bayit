// Passkey entry screens, concept A chosen 2026-11-10 (concept/explorations/passkey-20261110/, boards 1–3 and 6):
// the sign-in screen with two equal doors, first-run setup one step per screen, joining by invitation on one screen,
// and the owner's recovery. Words and layout follow mock.mjs exactly. The phone's own Face ID / fingerprint window is
// the browser's: while it is open we only say "continue in your phone's window".
import React,{useState,useEffect} from 'react';
import {Fingerprint,GoogleLogo,WarningCircle,Wrench,HouseLine,Key,Cloud,HardDrives,MagnifyingGlass,CaretUp,CaretDown,ShieldCheck,Check,CheckCircle,Info,LockSimple,ArrowLeft,ArrowRight,UserCircle,HandPalm,House,Clock} from '@phosphor-icons/react';
import {EntrySurface} from './entry-surface';
import {SunriseTitle} from './splash';
import {passkeySupport,passkeyCall,registerPasskey,signInWithPasskey,cancelled,alreadySaved} from './passkey-client';
import {FirstOpen,SetupWhere} from './setup-first-open'; // install wizard concept A (2026-11-11)
import './passkeys.css';

const FAMILY='/assets/shell-20261107/default-family-landscape-small.png';
const CODE_PH='XXXXX-XXXXX-XXXXX-XXXXX';
const goHome=(hash='#today')=>{location.hash=hash;location.reload()};
const route=()=>location.hash.split('?')[0];
const clock=(T,ms)=>new Date(ms).toLocaleTimeString(T('en','he')==='he'?'he-IL':'en-GB',{hour:'2-digit',minute:'2-digit'});

export const Explain=({T})=><p className="pk-explain"><Fingerprint size={20} aria-hidden/><span><strong>{T('A passkey','מפתח גישה')}</strong> {T('lets you sign in with your face, fingerprint or your device’s screen lock. No password.','= נכנסים עם הפנים, טביעת האצבע או קוד הנעילה של המכשיר. בלי סיסמה.')}</span></p>;
export const Note=({tone,icon:Icon,head,children})=><div className={'pk-note '+tone}><Icon size={22} aria-hidden/><div>{head&&<strong>{head}</strong>}{children&&<p>{children}</p>}</div></div>;
export const DontShare=({T})=><Note tone="yellow" icon={HandPalm} head={T('This passkey is yours alone','המפתח הזה רק שלכם')}>{T('Don’t share it with another family member, and don’t create it on a device someone else uses (like a shared iPad).','אל תשתפו אותו עם בן משפחה אחר, ואל תיצרו אותו במכשיר שמישהו אחר נכנס אליו (למשל אייפד משותף).')}</Note>;
export function Steps({T,n,labels}){return <ol className="pk-steps" aria-label={T('Steps','שלבים')}>{labels.map((l,i)=><li key={i} className={i<n-1?'done':i===n-1?'now':''} aria-current={i===n-1?'step':undefined}><span>{i<n-1?<Check size={14} weight="bold" aria-hidden/>:i+1}</span>{l}</li>)}</ol>}
const Big=({icon:Icon,children,secondary,...rest})=><button type="button" className={'button sunrise-google pk-big'+(secondary?' secondary':'')} {...rest}>{Icon&&<Icon size={24} aria-hidden/>}<span>{children}</span></button>;
const Btn=({icon:Icon,children,secondary,...rest})=><button type="button" className={'button'+(secondary?' secondary':'')} {...rest}>{Icon&&<Icon size={21} aria-hidden/>}{children}</button>;
const Demo=({T,onDemo})=><button type="button" className="text-link entry-demo" onClick={onDemo}>{T('Explore with sample data','התנסות עם מידע לדוגמה')}</button>;
const Hero=({ring='',icon:Icon,weight,head,children})=><div className="pk-hero"><span className={'pk-ring '+ring}>{Icon?<Icon size={ring==='ok'?46:44} weight={weight} aria-hidden/>:<span className="pk-spin" style={{width:40,height:40,borderWidth:5}} aria-hidden/>}</span><h2>{head}</h2>{children&&<p>{children}</p>}</div>;
const Forward=({T})=>T('en','he')==='he'?<ArrowLeft size={21} aria-hidden/>:<ArrowRight size={21} aria-hidden/>;

// ---------------------------------------------------------------- 1 · Sign-in (A: two doors)
const browserNote=T=><Note tone="peach" icon={WarningCircle} head={T('This browser can’t use passkeys','הדפדפן הזה לא יודע להשתמש במפתח גישה')}>{T('The link may have opened inside another app (WhatsApp, Telegram). Open it in Safari or Chrome, or update this browser.','אולי הקישור נפתח בתוך אפליקציה אחרת (וואטסאפ, טלגרם). פתחו אותו ב־Safari או ב־Chrome, או עדכנו את הדפדפן.')}</Note>;
const addressNote=T=><Note tone="peach" icon={WarningCircle} head={T('Passkeys can’t work at this address','בכתובת הזו אי אפשר להשתמש במפתח גישה')}>{T(<>Passkeys only work at a secure address that starts with <bdi dir="ltr">https://</bdi>. The installation owner needs to set one up (there’s a guide), then come back.</>,<>מפתח גישה עובד רק בכתובת מאובטחת שמתחילה ב־<bdi dir="ltr">https://</bdi>. בעל ההתקנה צריך להגדיר כתובת כזו (יש מדריך), ואז לחזור לכאן.</>)}</Note>;
const UNKNOWN=T=>T('This passkey isn’t recognised here. It may belong to another Bayit address, or it was removed. Try another one, or ask a parent in your family for a way back in.','המפתח הזה לא מוכר כאן. אולי הוא שייך לכתובת אחרת של Bayit, או שהוסר. נסו מפתח אחר, או בקשו מהורה במשפחה קישור חזרה.');

function SignIn({T,methods,config,onGoogle,onDemo,error:outer}){
 const pk=methods.some(m=>m.id==='passkey'),google=methods.some(m=>m.id==='google'),support=passkeySupport(),setup=config?.registration?.setup==='code';
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const start=async()=>{setBusy(true);setError('');try{await signInWithPasskey();goHome()}catch(e){if(!cancelled(e))setError(e.status===401&&!e.code?UNKNOWN(T):e.code==='PASSKEY_COUNTER'?T('This passkey looks copied, so it was refused. Remove it in Account security and add a new one.','מפתח הגישה הזה נראה כמו העתק, ולכן לא התקבל. הסירו אותו באבטחת החשבון והוסיפו חדש.'):e.network?T('No connection to Bayit right now.','אין חיבור ל־Bayit כרגע.'):T('Sign-in didn’t work. Try again.','הכניסה לא הצליחה. נסו שוב.'));setBusy(false)}};
 if(setup&&!google)return <>
  <section className="bayit-entry-card pk-card"><Hero icon={HouseLine} head={T('This installation isn’t set up yet','ההתקנה הזו עוד לא הוקמה')}>{T('Whoever installed Bayit received a one-time setup code. Use it to create the first account and the family.','מי שהתקין את Bayit קיבל קוד הקמה חד־פעמי. עם הקוד יוצרים את החשבון הראשון ואת המשפחה.')}</Hero><Btn icon={Key} onClick={()=>{location.hash='setup'}}>{T('I have a setup code','יש לי קוד הקמה')}</Btn><p className="pk-rule">{T('Family members join later with an invitation link.','בני המשפחה מצטרפים אחר כך עם קישור הזמנה.')}</p></section>
  <Demo T={T} onDemo={onDemo}/></>;
 const canPasskey=pk&&support==='ok';
 return <>
  <div className="pk-doors">
   {canPasskey&&<Big icon={Fingerprint} onClick={start} disabled={busy} aria-busy={busy||undefined}>{busy?T('Continue in your device’s window…','ממשיכים בחלון של המכשיר…'):T('Sign in with a passkey','כניסה עם מפתח גישה')}</Big>}
   {google&&<Big icon={GoogleLogo} secondary={canPasskey} onClick={onGoogle} disabled={busy}>{T('Continue with Google','המשך עם Google')}</Big>}
   {pk&&support==='browser'&&browserNote(T)}{pk&&support==='address'&&addressNote(T)}
   {(error||outer)&&<p role="alert" className="entry-error">{error||outer}</p>}
  </div>
  {canPasskey&&<Explain T={T}/>}
  <Demo T={T} onDemo={onDemo}/>
  <div className="pk-foot">
   {setup&&<span className="pk-setup-entry"><Wrench size={20} aria-hidden/>{T('Setting up this installation?','מקימים את ההתקנה הזו?')} <a className="pk-link" href="#setup">{T('I have a setup code','יש לי קוד הקמה')}</a></span>}
   <span>{T('First time here? Open the invitation link your family sent you.','בפעם הראשונה? פתחו את קישור ההזמנה שקיבלתם מהמשפחה.')}</span>
   {pk&&<a className="pk-quiet-link" href="#owner-recovery">{T('Own this installation and can’t sign in?','בעלי ההתקנה ולא מצליחים להיכנס?')}</a>}
  </div>
 </>;
}

// ---------------------------------------------------------------- shared: the passkey step, as in setup board 2
function PasskeyStep({T,steps,head,lead,button,onCreate,done,onDone,doneHead,doneText,doneButton}){
 const [state,setState]=useState('ready'),[error,setError]=useState('');
 const create=async()=>{setState('waiting');setError('');try{await onCreate();setState('done')}catch(e){setState('cancelled');setError(cancelled(e)?'':alreadySaved(e)?T('This device already has a Bayit passkey. Sign in with it instead.','במכשיר הזה כבר יש מפתח גישה ל־Bayit. אפשר להיכנס איתו.'):e.message)}};
 if(state==='done')return <>{done}<Hero ring="ok" icon={CheckCircle} weight="fill" head={doneHead}>{doneText}</Hero><Btn onClick={onDone}>{doneButton}<Forward T={T}/></Btn></>;
 if(state==='waiting')return <>{steps}<Hero head={T('Continue in your phone’s window','ממשיכים בחלון של הטלפון')}>{T('Your phone is asking for your face, fingerprint or screen lock. When you’re done, you’ll come back here by itself.','הטלפון מבקש את הפנים, טביעת האצבע או קוד הנעילה. כשתסיימו, נחזור לכאן לבד.')}</Hero><p className="pk-rule">{T('The window didn’t open?','החלון לא נפתח?')} <a className="pk-link" href="#" onClick={e=>{e.preventDefault();create()}}>{T('Try again','נסו שוב')}</a></p></>;
 return <>{steps}<Hero icon={Fingerprint} head={head}>{state==='cancelled'?T('With it you sign in to Bayit with your face, fingerprint or screen lock. No password.','עם המפתח נכנסים ל־Bayit בפנים, בטביעת אצבע או בקוד הנעילה. בלי סיסמה.'):lead}</Hero>
  {state==='cancelled'?<><p role="alert" className="entry-error">{error||T('No passkey was created. If you closed the window by mistake, try again. Nothing was saved.','לא נוצר מפתח גישה. אם סגרתם את החלון בטעות, נסו שוב. שום דבר לא נשמר.')}</p><Btn icon={Fingerprint} onClick={create}>{T('Try again','ניסיון נוסף')}</Btn></>
  :<><Btn icon={Fingerprint} onClick={create}>{button}</Btn><Note tone="blue" icon={Info} head={T('If your phone asks where to save it','אם הטלפון שואל איפה לשמור')}>{T('Choose your Apple or Google account. That way the passkey moves with you to a new phone.','בחרו בחשבון Apple או Google שלכם. כך המפתח יעבור איתכם גם לטלפון חדש.')}</Note><p className="pk-rule"><LockSimple size={16} aria-hidden/> {T('Your face and fingerprint never leave the device. Bayit never sees them.','הפנים וטביעת האצבע לא יוצאות מהמכשיר. Bayit לא רואה אותן.')}</p></>}
 </>;
}

// ---------------------------------------------------------------- 2 · First-run setup (A: one step per screen)
function CodeInput({T,label,value,setValue,bad,locked}){return <><label>{label}<input className={'pk-code'+(bad?' bad':'')} value={value} onChange={e=>setValue(e.target.value)} placeholder={CODE_PH} disabled={locked} autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr" aria-invalid={bad||undefined}/></label><p className="pk-hint">{T('20 letters and numbers. Upper or lower case, dashes optional.','20 אותיות ומספרים. לא משנה אם באותיות גדולות או קטנות, ומקפים לא חובה.')}</p></>}
function codeTrouble(T,e,setBad,setLocked){
 if(e.status===429){setLocked(Date.now()+15*60000);return ''}
 if(e.code==='WRONG_CODE'){setBad(true);return T('That code isn’t right. Check you copied all of it. You can try '+e.triesLeft+' more times in the next 15 minutes.','הקוד לא נכון. בדקו שהעתקתם את כולו. אפשר לנסות עוד '+e.triesLeft+' פעמים ברבע השעה הקרובה.')}
 return e.message;
}
const Locked=({T,until})=><Note tone="peach" icon={Clock} head={T('Too many tries','יותר מדי ניסיונות')}>{T('You can try again in 15 minutes, at '+clock(T,until)+'. The code itself is still safe: nobody got in.','אפשר לנסות שוב בעוד 15 דקות, בשעה '+clock(T,until)+'. הקוד עצמו עדיין בטוח: אף אחד לא נכנס.')}</Note>;

function Setup({T,config}){
 const docker=config?.registration?.setupHost==='docker',labels=[T('Setup code','קוד הקמה'),T('Your name','השם שלכם'),T('Passkey','מפתח גישה'),T('Family','המשפחה')];
 const [step,setStep]=useState('code'),[code,setCode]=useState(''),[name,setName]=useState(''),[bad,setBad]=useState(false),[locked,setLocked]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(true);
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');setBad(false);try{await passkeyCall('setup/code',{code});setCode('');setStep('name')}catch(err){setError(codeTrouble(T,err,setBad,setLocked));if(err.code==='SETUP_CLOSED')setError(T('This Bayit is already set up. Sign in, or ask your family for an invitation.','ה־Bayit הזה כבר הוקם. היכנסו, או בקשו מהמשפחה קישור הזמנה.'))}finally{setBusy(false)}};
 const where=<SetupWhere T={T} docker={docker}/>;
 const isLocked=locked>Date.now();
 let body;
 if(step==='code')body=<form className="pk-card-form" onSubmit={submit} noValidate><Steps T={T} n={1} labels={labels}/><h2>{T('Type your setup code','הקלידו את קוד ההקמה')}</h2><p className="pk-lead">{T('The code proves you’re the one who installed Bayit. It works only once.','הקוד מוכיח שאתם מי שהתקין את Bayit. הוא עובד פעם אחת בלבד.')}</p>
  <CodeInput T={T} label={T('Setup code','קוד הקמה')} value={code} setValue={v=>{setCode(v);setBad(false)}} bad={bad} locked={isLocked}/>
  {error&&<p role="alert" className="entry-error">{error}</p>}{isLocked&&<Locked T={T} until={locked}/>}
  <button className="button" disabled={busy||isLocked||!code.trim()}>{T('Continue','המשך')}</button>
  <details className="pk-where" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary><MagnifyingGlass size={20} aria-hidden/>{T('Where is the code?','איפה הקוד?')}{open?<CaretUp size={18} aria-hidden/>:<CaretDown size={18} aria-hidden/>}</summary>{where}</details>
  <p className="pk-rule"><ShieldCheck size={16} aria-hidden/> {T('Only ever type this code on your own Bayit address.','הקלידו את הקוד רק בכתובת של ה־Bayit שלכם.')}</p></form>;
 else if(step==='name')body=<form className="pk-card-form" onSubmit={e=>{e.preventDefault();if(name.trim())setStep('passkey')}}><Steps T={T} n={2} labels={labels}/><h2>{T('What should we call you?','איך לקרוא לכם?')}</h2><p className="pk-lead">{T('Your family will see this name, and so will your phone, next to the passkey.','השם יופיע לבני המשפחה, וגם ליד מפתח הגישה בטלפון.')}</p><label>{T('Your name','השם שלכם')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} autoComplete="name" required/></label><button className="button" disabled={!name.trim()}>{T('Continue','המשך')}</button></form>;
 else body=<PasskeyStep T={T} steps={<Steps T={T} n={3} labels={labels}/>} done={<Steps T={T} n={4} labels={labels}/>}
  head={T('Create your passkey','יוצרים את מפתח הגישה שלכם')} lead={T('A passkey is how you’ll sign in to Bayit, with no password. When you tap the button, your phone asks for your face, fingerprint or screen lock.','מפתח גישה הוא הדרך שלכם להיכנס ל־Bayit, בלי סיסמה. בלחיצה על הכפתור הטלפון יבקש את הפנים, טביעת האצבע או קוד הנעילה.')}
  button={T('Create a passkey','יצירת מפתח גישה')} onCreate={()=>registerPasskey('setup',{name:name.trim()})}
  doneHead={T('Your passkey is saved','מפתח הגישה נשמר')} doneText={T('From now on you sign in to Bayit with your face, fingerprint or screen lock. The setup code no longer works; you can delete it.','מעכשיו נכנסים ל־Bayit בפנים, בטביעת אצבע או בקוד הנעילה. קוד ההקמה כבר לא עובד, ואפשר למחוק אותו.')}
  doneButton={T('Continue: create your family','המשך: יצירת המשפחה')} onDone={()=>goHome('')}/>;
 return <><SunriseTitle text={T('Let’s set up your home.','בואו נקים את הבית.')}/><p className="sunrise-sub">{T('A few short steps, then you create your family.','כמה צעדים קצרים, ואז יוצרים את המשפחה.')}</p><section className="bayit-entry-card pk-card">{body}</section></>;
}

// ---------------------------------------------------------------- 3 · Join by invitation (A: one screen)
const ROLE={parent:T=>[T('parent','הורה'),T('You can invite others and manage the family.','תוכלו להזמין אחרים ולנהל את המשפחה.')],adult:T=>[T('adult','מבוגר/ת'),T('You see what’s shared and can add your own.','תראו את מה שמשותף, ותוכלו להוסיף משלכם.')],child:T=>[T('child','ילד/ה'),T('Parents manage routines and rewards.','ההורים מנהלים את השגרות והתגמולים.')]};
function Join({T,token,methods,onGoogle}){
 const pk=methods.some(m=>m.id==='passkey')&&passkeySupport()==='ok',google=methods.some(m=>m.id==='google');
 const [invite,setInvite]=useState(null),[problem,setProblem]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[joined,setJoined]=useState(false);
 useEffect(()=>{passkeyCall('invitation',{token}).then(r=>{setInvite(r);setName(r.memberName||'')}).catch(e=>setProblem(e.code==='RECOVERY_NOT_YET'?T('This link starts working at '+new Date(e.usableAt).toLocaleString('en-GB',{weekday:'long',hour:'2-digit',minute:'2-digit'})+'. Open it again then.','הקישור יתחיל לעבוד ב'+new Date(e.usableAt).toLocaleString('he-IL',{weekday:'long',hour:'2-digit',minute:'2-digit'})+'. פתחו אותו שוב אז.'):e.network?T('No connection to Bayit right now.','אין חיבור ל־Bayit כרגע.'):T('This invitation has expired or was already used. Ask your family for a new one.','ההזמנה הזו פגה או שכבר השתמשו בה. בקשו מהמשפחה הזמנה חדשה.')))},[token]);
 const create=async()=>{if(!name.trim()&&invite.purpose!=='recover'){setError(T('Write your name.','כתבו את השם שלכם.'));return}setBusy(true);setError('');try{await registerPasskey(invite.purpose==='recover'?'recover':'invite',{name:name.trim()});setJoined(true)}catch(e){setError(cancelled(e)?T('No passkey was created. If you closed the window by mistake, try again. Nothing was saved.','לא נוצר מפתח גישה. אם סגרתם את החלון בטעות, נסו שוב. שום דבר לא נשמר.'):alreadySaved(e)?T('This device already has a Bayit passkey. Sign in with it instead.','במכשיר הזה כבר יש מפתח גישה ל־Bayit. אפשר להיכנס איתו.'):e.message)}finally{setBusy(false)}};
 const family=invite?.household||'';
 const head=<><SunriseTitle text={T('You’re invited home.','הוזמנתם הביתה.')}/><p className="sunrise-sub">{family?T('Come and join '+family+'.','בואו להצטרף ל'+family+'.'):T('Come and join your family.','בואו להצטרף למשפחה.')}</p></>;
 if(problem)return <>{head}<section className="bayit-entry-card pk-card"><Note tone="peach" icon={WarningCircle}>{problem}</Note></section></>;
 if(!invite)return <>{head}<section className="bayit-entry-card pk-card" aria-busy="true"><div className="pk-hero"><span className="pk-ring"><span className="pk-spin" aria-hidden/></span></div></section></>;
 if(joined)return <>{head}<section className="bayit-entry-card pk-card"><Hero ring="ok" icon={CheckCircle} weight="fill" head={invite.purpose==='recover'?T('You’re back in','חזרתם לחשבון'):T('You’ve joined '+family,'הצטרפתם ל'+family)}>{T('Your passkey is saved. Next time, tap “Sign in with a passkey”.','מפתח הגישה נשמר. בפעם הבאה נכנסים בלחיצה על "כניסה עם מפתח גישה".')}</Hero>{invite.role==='child'&&<p className="pk-rule">{T('Keep your Telegram chat with Bayit linked, or ask a parent to help you add a second passkey on another device: that is how you get back in if you lose this one.','השאירו את הצ׳אט בטלגרם עם Bayit מחובר, או בקשו מהורה לעזור לכם להוסיף מפתח גישה שני במכשיר נוסף: כך חוזרים לחשבון אם המכשיר הזה הולך לאיבוד.')}</p>}<Btn icon={House} onClick={()=>goHome()}>{T('Go to the home','כניסה לבית')}</Btn></section></>;
 const [roleName,roleLine]=(ROLE[invite.role]||ROLE.adult)(T),recover=invite.purpose==='recover';
 const expires=invite.expiresAt&&new Date(invite.expiresAt).toLocaleDateString(T('en-GB','he-IL'),{weekday:'long',day:'numeric',month:'long'});
 return <>{head}<section className="bayit-entry-card pk-card">
  <div className="pk-house"><img src={FAMILY} alt=""/><div><strong>{family}</strong><span className="pk-role"><UserCircle size={16} aria-hidden/>{recover?T('A new passkey for ','מפתח גישה חדש בשביל ')+invite.name:T('Joining as ','מצטרפים כ')+roleName}</span></div></div>
  {!recover&&<p className="pk-lead" style={{margin:0}}>{roleLine}</p>}
  <div className="pk-divider">{pk&&google&&!recover?T('How will you sign in?','איך תיכנסו?'):pk?T('In this home you sign in with a passkey','בבית הזה נכנסים עם מפתח גישה'):T('Sign in with your Google account','נכנסים עם חשבון Google')}</div>
  {pk&&<>{!recover&&<label>{T('Your name','השם שלכם')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} autoComplete="name" placeholder={T('What the family will call you','איך יקראו לכם במשפחה')}/></label>}
   <Btn icon={Fingerprint} onClick={create} disabled={busy} aria-busy={busy||undefined}>{busy?T('Continue in your phone’s window…','ממשיכים בחלון של הטלפון…'):T('Create a passkey on this device','יצירת מפתח גישה במכשיר הזה')}</Btn><Explain T={T}/></>}
  {!pk&&methods.some(m=>m.id==='passkey')&&browserNote(T)}
  {pk&&google&&!recover&&<div className="pk-divider">{T('or','או')}</div>}
  {google&&!recover&&<Btn icon={GoogleLogo} secondary={pk} onClick={onGoogle} disabled={busy}>{T('Continue with Google','המשך עם Google')}</Btn>}
  {error&&<p role="alert" className="entry-error">{error}</p>}
  {pk&&<DontShare T={T}/>}
  {expires&&!recover&&<p className="pk-rule">{T('This invitation is valid until '+expires+'.','ההזמנה בתוקף עד '+expires+'.')}</p>}
 </section></>;
}

// ---------------------------------------------------------------- 6 · Owner recovery (code → which account → passkey)
function OwnerRecovery({T}){
 const labels=[T('Recovery code','קוד שחזור'),T('Which account','איזה חשבון'),T('Passkey','מפתח גישה')];
 const [step,setStep]=useState('code'),[code,setCode]=useState(''),[accounts,setAccounts]=useState([]),[chosen,setChosen]=useState(''),[bad,setBad]=useState(false),[locked,setLocked]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');setBad(false);try{const r=await passkeyCall('owner/code',{code});setCode('');setAccounts(r.accounts||[]);setChosen(r.accounts?.[0]?.id||'');setStep('pick')}catch(err){setError(codeTrouble(T,err,setBad,setLocked).replace(/setup|הקמה/,m=>m))}finally{setBusy(false)}};
 const isLocked=locked>Date.now();let body;
 if(step==='code')body=<form className="pk-card-form" onSubmit={submit} noValidate><Steps T={T} n={1} labels={labels}/><h2>{T('Type your recovery code','הקלידו את קוד השחזור')}</h2><p className="pk-lead">{T('A one-time code you make where Bayit is installed. Without access there, there’s no code.','קוד חד־פעמי שיוצרים במקום שבו Bayit מותקן. בלי גישה לשם אין קוד.')}</p>
  <CodeInput T={T} label={T('Recovery code','קוד שחזור')} value={code} setValue={v=>{setCode(v);setBad(false)}} bad={bad} locked={isLocked}/>
  {error&&<p role="alert" className="entry-error">{error}</p>}{isLocked&&<Locked T={T} until={locked}/>}
  <button className="button" disabled={busy||isLocked||!code.trim()}>{T('Continue','המשך')}</button>
  <details className="pk-where" open><summary><MagnifyingGlass size={20} aria-hidden/>{T('How do I get a code?','איך מקבלים קוד?')}<CaretUp size={18} aria-hidden/></summary>
   <div className="pk-where-row"><span className="pk-tile peach"><Cloud size={22} aria-hidden/></span><strong>{T('On Cloudflare','ב־Cloudflare')}</strong><p>{T('Ask Claude or Codex: “make a Bayit recovery code”.','בקשו מ־Claude או Codex: "צור קוד שחזור ל־Bayit".')}</p></div>
   <div className="pk-where-row"><span className="pk-tile lilac"><HardDrives size={22} aria-hidden/></span><strong>{T('On Docker','ב־Docker')}</strong><p>{T('Run on the server’s computer: ','הריצו במחשב של השרת: ')}<span className="pk-code-inline">docker compose exec bayit node recovery-cli.mjs</span></p></div></details></form>;
 else if(step==='pick')body=<><Steps T={T} n={2} labels={labels}/><div className="pk-pick" role="radiogroup" aria-label={T('Which account','איזה חשבון')}>{accounts.map(acc=><button type="button" role="radio" aria-checked={chosen===acc.id} key={acc.id} className={'pk-option'+(chosen===acc.id?' on':'')} style={{gridTemplateColumns:'auto 44px minmax(0,1fr)'}} onClick={()=>setChosen(acc.id)}><span className="pk-radio"/><span className="pk-tile"><UserCircle size={26} aria-hidden/></span><strong>{acc.name||T('Parent','הורה')}</strong><span className="pk-sub">{T('Parent · ','הורה · ')+acc.household}</span></button>)}</div>
  {!accounts.length&&<Note tone="peach" icon={WarningCircle}>{T('There is no parent account yet. Use the setup code instead.','עדיין אין חשבון של הורה. השתמשו בקוד ההקמה.')}</Note>}
  <p className="pk-hint" style={{margin:0}}>{T('Only parent accounts are shown. Old passkeys aren’t deleted; you can check them afterwards.','מוצגים רק חשבונות של הורים. המפתחות הישנים לא נמחקים; תוכלו לבדוק אותם אחר כך.')}</p><Btn icon={Fingerprint} disabled={!chosen} onClick={()=>setStep('passkey')}>{T('Continue to create a passkey','המשך ליצירת מפתח גישה')}</Btn></>;
 else body=<PasskeyStep T={T} steps={<Steps T={T} n={3} labels={labels}/>} done={null} head={T('Create a new passkey','יוצרים מפתח גישה חדש')} lead={T('When you tap the button, your phone asks for your face, fingerprint or screen lock.','בלחיצה על הכפתור הטלפון יבקש את הפנים, טביעת האצבע או קוד הנעילה.')} button={T('Create a passkey','יצירת מפתח גישה')} onCreate={()=>registerPasskey('operator',{userId:chosen})} doneHead={T('You’re back in','חזרתם פנימה')} doneText={T('The recovery code no longer works. Check your passkeys in Account security.','קוד השחזור כבר לא עובד. בדקו את מפתחות הגישה באבטחת החשבון.')} doneButton={T('Go to the home','כניסה לבית')} onDone={()=>goHome()}/>;
 return <><SunriseTitle text={T('Back in.','חוזרים פנימה.')}/><p className="sunrise-sub">{step==='pick'?T('The code was accepted. Which account should get a passkey?','הקוד אושר. לאיזה חשבון להוסיף מפתח גישה?'):T('Only for the installation owner, when no parent can sign in.','לבעלי ההתקנה בלבד, כשאף הורה לא יכול להיכנס.')}</p><section className="bayit-entry-card pk-card">{body}</section></>;
}

// The create-family card, signed in by passkey: no email, so the user row says how they signed in (setup board 2).
export const PasskeySignedUser=({T,name})=><div className="pk-user"><span className="pk-tile"><UserCircle size={26} aria-hidden/></span><div><strong>{name}</strong><small><Fingerprint size={15} aria-hidden/>{T('Signed in with a passkey','נכנסתם עם מפתח גישה')}</small></div></div>;

// ---------------------------------------------------------------- the entry, signed out
// Used by cloud-client.jsx whenever passkeys are offered (or setup is open); otherwise the Google-only screen is unchanged.
export const passkeysOffered=(config,methods)=>methods.some(m=>m.id==='passkey')||config?.registration?.setup==='code';
export function PasskeyEntry({T,language,setLanguage,config,methods,onGoogle,onDemo,error}){
 const [where,setWhere]=useState(route);
 useEffect(()=>{const change=()=>setWhere(route());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
 const token=new URLSearchParams(location.hash.split('?')[1]||'').get('invite');
 const setup=config?.registration?.setup==='code';
 let screen;
 if(where==='#join'&&token)screen=<Join T={T} token={token} methods={methods} onGoogle={onGoogle}/>;
 else if(where==='#setup'&&setup)screen=<Setup T={T} config={config}/>;
 else if(where==='#owner-recovery'&&methods.some(m=>m.id==='passkey'))screen=<OwnerRecovery T={T}/>;
 // Setup open and passkeys only: the first-open screen with its honest checks (install wizard concept A, e0-open).
 else if(setup&&!methods.some(m=>m.id==='google'))screen=<FirstOpen T={T}/>;
 else screen=<><SunriseTitle text={T('A little more together.','קצת יותר ביחד.')}/><p className="sunrise-sub">{T('One home. Your own accounts. All the little things, shared.','בית אחד. חשבון אישי לכל אחד. כל הדברים הקטנים, ביחד.')}</p><SignIn T={T} methods={methods} config={config} onGoogle={onGoogle} onDemo={onDemo} error={error}/></>;
 return <EntrySurface {...{T,language,setLanguage}}>{screen}</EntrySurface>;
}
