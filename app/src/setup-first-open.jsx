// Install wizard, concept A (user decision 2026-11-11, AGENTS.md; concept/explorations/install-wizard-20261111/,
// e0-open, e1-code, e4-family): the entry-side screens while this installation's setup is open.
// 1. First open: "Bayit is installed", the address and three honest checks before the setup code. Each check comes
//    from a real probe made on this page (the /api/config answer from this address, the server's own database check,
//    the browser's passkey support); nothing is shown as passed before it was checked.
// 2. "Where is the code?" rows for the install kinds that exist today (Docker, Cloudflare with Claude or Codex).
//    The Deploy-button wording waits for the single-Worker work (5.2), which is not released.
// 3. The family-name card with the four step chips, right after the owner's passkey.
import React,{useEffect,useState} from 'react';
import {HouseLine,Globe,CheckCircle,WarningCircle,Key,Copy,Check,Terminal,DeviceMobile,HardDrives,Cloud,ArrowsClockwise,Plus,UsersThree,CircleNotch} from '@phosphor-icons/react';
import {SunriseTitle} from './splash';
import {passkeySupport} from './passkey-client';
import './setup-wizard.css';

const loopback=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const Note=({tone,icon:Icon,head,children})=><div className={'pk-note '+tone}><Icon size={22} aria-hidden/><div>{head&&<strong>{head}</strong>}{children&&<p>{children}</p>}</div></div>;
export const Address=({href=location.origin})=><span className="iw-addr"><Globe size={18} aria-hidden/><bdi dir="ltr">{href}</bdi></span>;
export function CopyButton({T,text,secondary=false,label}){
 const [state,setState]=useState('');
 const copy=async()=>{try{await navigator.clipboard.writeText(text);setState('ok')}catch{setState('fail')}};
 return <><button type="button" className={'button'+(secondary?' secondary':'')} onClick={copy}>{state==='ok'?<Check size={21} aria-hidden/>:<Copy size={21} aria-hidden/>}{state==='ok'?T('Copied','הועתק'):label||T('Copy','העתקה')}</button>
  {state==='fail'&&<p role="alert" className="iw-tip">{T('Copying isn’t allowed here. Press and hold the address above to copy it.','אי אפשר להעתיק כאן. לחצו לחיצה ארוכה על הכתובת למעלה כדי להעתיק.')}</p>}</>;
}

// Each probe: 'wait' until it ran, then 'ok' or a reason. The address and database checks ask the server again now,
// from this page, instead of trusting the answer that drew the screen.
function useChecks(){
 const [probe,setProbe]=useState({state:'wait'});
 useEffect(()=>{let live=true;
  fetch('/api/config',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():Promise.reject(r.status))
   .then(config=>live&&setProbe({state:'done',config})).catch(()=>live&&setProbe({state:'failed'}));
  return()=>{live=false}},[]);
 const support=passkeySupport(),config=probe.config;
 const address=probe.state==='wait'?'wait':probe.state==='failed'?'unreachable':config?.passkeys?.address===false||support==='address'?'passkey-address':'ok';
 const database=probe.state==='wait'?'wait':probe.state==='failed'?'unknown':config?.installation?.ready===true?'ok':'update';
 const browser=support==='ok'?'ok':support==='address'?'address':'browser';
 return {address,database,browser,docker:config?.registration?.setupHost==='docker'};
}

export function FirstOpen({T}){
 const c=useChecks(),all=[c.address,c.database,c.browser],waiting=all.includes('wait'),ready=all.every(x=>x==='ok');
 const row=(state,head,ok,bad)=><li key={head} className={state==='ok'?'':state==='wait'?'wait':'bad'}>{state==='ok'?<CheckCircle size={26} weight="fill" aria-hidden/>:state==='wait'?<CircleNotch className="iw-turn" size={26} aria-hidden/>:<WarningCircle size={26} weight="fill" aria-hidden/>}<span>{head}<small>{state==='ok'?ok:state==='wait'?T('Checking…','בודקים…'):bad}</small></span></li>;
 const checks=[
  row(c.address,c.address==='passkey-address'?T('Passkeys can’t work at this address','בכתובת הזו אי אפשר ליצור מפתח גישה'):c.address==='unreachable'?T('Bayit didn’t answer','Bayit לא ענה'):T('The address works','הכתובת עובדת'),T('You’re on it right now.','אתם עליה עכשיו.'),
   c.address==='unreachable'?T('Check the connection and reload this page.','בדקו את החיבור וטענו את הדף מחדש.'):T('Passkeys need a secure address that starts with https://. The installation guide shows how to give Bayit one.','מפתח גישה צריך כתובת מאובטחת שמתחילה ב־https://. מדריך ההתקנה מראה איך לתת ל־Bayit כתובת כזו.')),
  row(c.database,c.database==='ok'?T('The database is ready','מסד הנתונים מוכן'):c.database==='update'?T('The database needs an update','מסד הנתונים צריך עדכון'):T('The database wasn’t checked','מסד הנתונים לא נבדק'),T('Bayit just checked.','Bayit בדק את זה עכשיו.'),
   c.database==='update'?T('Finish the database update where Bayit is installed, then reload.','השלימו את עדכון מסד הנתונים במקום שבו Bayit מותקן, ואז טענו מחדש.'):T('Bayit didn’t answer, so this wasn’t checked.','Bayit לא ענה, ולכן זה לא נבדק.')),
  row(c.browser,c.browser==='ok'?T('This browser can create a passkey','הדפדפן הזה יכול ליצור מפתח גישה'):T('This browser can’t create a passkey','הדפדפן הזה לא יכול ליצור מפתח גישה'),T('You’ll sign in with your face, fingerprint or screen lock.','נכנסים עם הפנים, טביעת האצבע או קוד הנעילה.'),
   c.browser==='address'?T('This page isn’t on a secure address.','הדף הזה לא בכתובת מאובטחת.'):T('The link probably opened inside another app.','כנראה שהקישור נפתח בתוך אפליקציה אחרת.'))];
 let after;
 if(waiting)after=null;
 else if(c.browser==='browser')after=<><Note tone="peach" icon={WarningCircle} head={T('Open the address in Safari or Chrome','פתחו את הכתובת ב־Safari או ב־Chrome')}>{T('Copy the address, open Safari or Chrome and paste it there. That way you won’t spend a try of your code.','העתיקו את הכתובת, פתחו את Safari או Chrome והדביקו אותה שם. כך גם הקוד לא יתבזבז.')}</Note><CopyButton T={T} text={location.origin} label={T('Copy the address','העתקת הכתובת')}/></>;
 else if(ready)after=<><p className="iw-plan">{T('Four steps, about 3 minutes: your setup code, your name, a passkey and your family’s name.','ארבעה צעדים, בערך 3 דקות: קוד ההקמה, השם שלכם, מפתח גישה ושם המשפחה.')}</p>
  <button type="button" className="button sunrise-google pk-big" onClick={()=>{location.hash='setup'}}><Key size={24} aria-hidden/><span>{T('Start setting up','מתחילים להקים')}</span></button>
  {c.docker&&<Note tone="blue" icon={Terminal} head={T('The code is in Bayit’s log','הקוד מחכה ביומן של Bayit')}>{T(<>Look for the line “First-time setup code”. It’s also in setup-code.txt in the data folder.<span className="pk-code-inline iw-cmd">docker compose logs bayit</span></>,<>חפשו את השורה ״First-time setup code״. הוא נמצא גם בקובץ setup-code.txt בתיקיית הנתונים.<span className="pk-code-inline iw-cmd">docker compose logs bayit</span></>)}</Note>}</>;
 else after=<p className="iw-plan">{T('Fix what’s marked above, then reload this page. The setup code isn’t used up.','תקנו את מה שמסומן למעלה, ואז טענו את הדף מחדש. קוד ההקמה לא מתבזבז.')}</p>;
 return <><SunriseTitle text={T('Bayit is installed.','Bayit מותקן.')}/><p className="sunrise-sub">{T('Now set up your home in it.','עכשיו מקימים את הבית שלכם בו.')}</p>
  <section className="bayit-entry-card pk-card iw-open" aria-busy={waiting||undefined}>
   <div className="pk-hero"><span className="pk-ring"><HouseLine size={44} aria-hidden/></span><h2>{T('Ready to set up','הכול מוכן להקמה')}</h2></div>
   <Address/>
   <ul className="iw-checks" aria-label={T('What Bayit checked','מה Bayit בדק')}>{checks}</ul>
   {after}
   <small className="pk-foot iw-small">{T('Your family joins later, each with their own invitation link.','בני המשפחה מצטרפים אחר כך, כל אחד עם קישור הזמנה משלו.')}</small>
  </section>
  {loopback()&&<div className="iw-below"><Note tone="peach" icon={DeviceMobile} head={T('Phones can’t reach this address yet','טלפונים עוד לא יכולים להגיע לכתובת הזו')}>{T(<><bdi dir="ltr">localhost</bdi> only works on this computer. You can set up now, and give Bayit an https address before inviting the family.</>,<><bdi dir="ltr">localhost</bdi> עובד רק במחשב הזה. אפשר להקים עכשיו, ולפני שמזמינים את המשפחה לתת ל־Bayit כתובת https.</>)}</Note></div>}
 </>;
}

// "Where is the code?" on the real code screen: where it is, then what to do if it's lost. Only paths that exist today.
export function SetupWhere({T,docker}){
 return docker?<>
  <div className="pk-where-row"><span className="pk-tile lilac"><HardDrives size={22} aria-hidden/></span><strong>{T('Installed with Docker on a computer or server','התקנתם עם Docker במחשב או בשרת')}</strong><p>{T(<>It’s in the file <span className="pk-code-inline">setup-code.txt</span> in the data folder, and in the server log: <span className="pk-code-inline">docker compose logs bayit</span></>,<>הקוד נמצא בקובץ <span className="pk-code-inline">setup-code.txt</span> בתיקיית הנתונים, וגם ביומן השרת: <span className="pk-code-inline">docker compose logs bayit</span></>)}</p></div>
  <div className="pk-where-row"><span className="pk-tile lilac"><ArrowsClockwise size={22} aria-hidden/></span><strong>{T('Can’t find it?','לא מוצאים אותו?')}</strong><p>{T(<>Restart Bayit with <span className="pk-code-inline">docker compose restart bayit</span>. Until setup is done, every start writes the code in the log again.</>,<>הפעילו את Bayit מחדש עם <span className="pk-code-inline">docker compose restart bayit</span>. עד שההקמה מסתיימת, כל הפעלה כותבת את הקוד שוב ביומן.</>)}</p></div></>
 :<>
  <div className="pk-where-row"><span className="pk-tile peach"><Cloud size={22} aria-hidden/></span><strong>{T('Installed on Cloudflare with Claude or Codex','התקנתם ב־Cloudflare עם Claude או Codex')}</strong><p>{T('The code was shown once, at the end of the install.','הקוד הוצג פעם אחת, בסוף ההתקנה.')}</p></div>
  <div className="pk-where-row"><span className="pk-tile lilac"><ArrowsClockwise size={22} aria-hidden/></span><strong>{T('Lost it? Make a new one','איבדתם אותו? עושים קוד חדש')}</strong><p>{T('Ask Claude or Codex: “make a new Bayit setup code”. The old one stops working.','בקשו מ־Claude או Codex: ״צור קוד הקמה חדש ל־Bayit״. הקוד הישן יפסיק לעבוד.')}</p></div></>;
}

// The create-family card in the setup steps (e4-family): the existing create call, with step 4 of 4 shown.
export function SetupFamilyName({T,user,name,setName,busy,error,onSubmit,steps}){
 return <><SunriseTitle text={T('One more step.','עוד צעד אחד.')}/><p className="sunrise-sub">{T('What’s your home called?','איך קוראים לבית שלכם?')}</p>
  <section className="bayit-entry-card pk-card"><form className="pk-card-form" onSubmit={onSubmit}>{steps}<h2>{T('Your family’s name','שם המשפחה')}</h2>{user}
   <label>{T('Family / household name','שם המשפחה / הבית')}<input required value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder={T('e.g. The Levi family','למשל, משפחת לוי')}/></label>
   <button className="button" disabled={busy}><Plus size={21} aria-hidden/>{T('Create the family','יצירת המשפחה')}</button>
   {error&&<p role="alert" className="entry-error">{error}</p>}
   <p className="pk-rule"><UsersThree size={16} aria-hidden/> {T('Next you add the people at home. Each signs in with their own passkey.','בצעד הבא מוסיפים את בני הבית. כל אחד נכנס עם מפתח גישה משלו.')}</p></form></section></>;
}
