import React,{useCallback,useEffect,useState} from 'react';
import {Sparkle} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {householdDate} from './household-date';
import './home-planning.css';

async function request(action,body) {
 const response=await fetch('/api/home-suggestions/'+action,{method:body?'POST':'GET',cache:'no-store',
  headers:{...cloudHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if (!response.ok) throw Error('Request refused.');
 return response.json();
}

export function HomeSuggestions({a,Button}) {
 const T=a.T;
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [confirmation,setConfirmation]=useState(null),[chosen,setChosen]=useState({});
 const load=useCallback(async()=>{
  if (!a.cloud) return;
  try {setStatus(await request('list'));}
  catch {setError(T('Suggestions are unavailable right now.','ההצעות אינן זמינות כרגע.'));}
 },[a.user,a.data.householdId,!!a.cloud,a.lang]);
 useEffect(()=>{load();if(!a.cloud)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},60000);return()=>clearInterval(timer);},[load]);
 const run=async(action,body)=>{
  if(busy)return;
  setBusy(true);setError('');
  try {await request(action,body);setConfirmation(null);await load();}
  catch {setError(T('The suggestion changed or the save was refused. Review it and try again.','ההצעה השתנתה או שהשמירה נדחתה. בדקו ונסו שוב.'));await load();}
  finally {setBusy(false);}
 };
 // Features registry (2026-11-09): task suggestions need Tasks, voucher suggestions need Vouchers.
 const featureOn=id=>a.features?.on(id)!==false,shown=item=>item.kind==='voucher'?featureOn('vouchers'):featureOn('tasks');
 // Off: nothing here; it is turned on in בית AI › Settings › Help with our day (one place for every setting, 2026-11-11).
 if(!a.cloud||(!featureOn('tasks')&&!featureOn('vouchers'))||(!status&&!error)||status?.available===false||(status&&!status.enabled&&!error))return null;
 return <section className="home-planning-panel" aria-label={T('Bayit suggestions','הצעות מבַּיִת')}>
  {error&&<p role="alert">{error}</p>}
  {status?.enabled&&<>
   {status.items.filter(shown).map(item=>{
    const suggested=item.candidate,candidate=chosen[item.key]??suggested??'';
    const open=()=>a.go(item.kind==='voucher'?item.url.replace(/^#/,''):'tasks?'+new URLSearchParams({task:item.id,date:item.date}));
    return <article className="home-planning-card" key={item.key}>
     <small>{T('Bayit suggests','בַּיִת מציע')}</small>
     <h2>{item.kind==='pickup'?T('Who is picking up?','מי אוסף?'):item.kind==='stale'?T('Still relevant?','עדיין רלוונטי?'):T('A voucher expires soon','שובר מתקרב לסוף התוקף')}</h2>
     <p><strong dir="auto">{T(item.title,item.he||item.title)}</strong> · {householdDate(a,item.date)} {item.time&&<time dir="ltr">{item.time}</time>}</p>
     {item.kind==='pickup'&&<>
      <small>{suggested?T('No overlap in the connected Google calendar for ','אין התנגשות ביומן Google שחובר עבור ')+a.name(suggested):T('Calendar availability is unknown. You can choose someone manually.','הזמינות ביומן אינה ידועה. אפשר לבחור אחראי ידנית.')}</small>
      {a.member(a.user).role!=='child'&&<label>{T('Assignee','אחראי')} <select value={candidate} onChange={event=>setChosen({...chosen,[item.key]:event.target.value})}><option value="">{T('Choose','בחירה')}</option>{a.members.filter(member=>member.role!=='child').map(member=><option key={member.id} value={member.id}>{a.name(member.id)}</option>)}</select></label>}
     </>}
     {confirmation?.key===item.key?<div>
      <p>{confirmation.change==='assign'?T('The selected person will be able to see this task.','האדם שנבחר יוכל לראות את המשימה.'):T('Mark this task complete?','לסמן את המשימה כבוצעה?')}</p>
      <div className="home-planning-actions"><Button secondary onClick={()=>setConfirmation(null)}>{T('Cancel','ביטול')}</Button><Button disabled={busy} onClick={()=>run('apply',confirmation)}>{T('Confirm','אישור')}</Button></div>
     </div>:<div className="home-planning-actions">
      {item.kind==='pickup'&&candidate&&a.member(a.user).role!=='child'&&<Button disabled={busy} onClick={()=>setConfirmation({key:item.key,change:'assign',memberId:candidate,suggested:suggested===candidate})}>{T('Assign to ','לשייך ל־')+a.name(candidate)}</Button>}
      {item.kind==='stale'&&<Button disabled={busy} onClick={()=>setConfirmation({key:item.key,change:'done'})}>{T('Mark complete','סימון כבוצע')}</Button>}
      <Button secondary onClick={open}>{item.kind==='voucher'?T('Open voucher','פתיחת השובר'):T('Open task','פתיחת המשימה')}</Button>
      <Button secondary disabled={busy} onClick={()=>run('apply',{key:item.key,change:'later'})}>{T('Later','אחר כך')}</Button>
      <Button secondary disabled={busy} onClick={()=>run('apply',{key:item.key,change:'dismiss'})}>{T('Hide','הסתרה')}</Button>
     </div>}
    </article>;
   })}
   {/* Turning this off lives in בית AI › Settings (one place for every AI setting, 2026-11-11). */}
   {a.route?.split(/[/?]/)[0]!=='ai'&&<button type="button" className="text-link home-planning-settings" onClick={()=>a.go('ai/settings')}>{T('Suggestion settings','הגדרות הצעות')}</button>}
  </>}
 </section>;
}
