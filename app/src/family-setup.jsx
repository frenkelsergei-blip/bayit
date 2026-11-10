// First-run setup (user decision 2026-11-09; concept/explorations/features-20261109/setup-v2-*.png):
// 1. questions, one per screen (skippable → the Core 5); 2. "Here's what we suggest" from the answers;
// 3. "Connect your own accounts" with a simple guide per connection and live, honest status; 4. "Your home is ready".
// Only a parent completes it. Answers are kept as preferences.familyProfile for the AI.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {House,User,Users,UsersThree,HouseLine,Baby,PuzzlePiece,Student,Smiley,X,Lightning,CheckCircle,CalendarDots,ShoppingCart,Wallet,FileText,ForkKnife,Truck,Bank,PencilSimple,Archive,Package,CloudArrowUp,ShieldCheck,Ticket,Gift,Wrench,Fan,Car,Plant,Receipt,CookingPot,Coffee,BookOpen,Bell,TelegramLogo,ChartLineUp,Sparkle,Key,Question,HardDrives,UserPlus,MapPin,Clock,ArrowRight,ArrowLeft,Check,LockSimple,SquaresFour,ArrowSquareOut,Circle,WarningCircle} from '@phosphor-icons/react';
// Only the icons the setup questions and guides name (shared/family-setup.mjs, shared/setup-guides.mjs).
const P={House,User,Users,UsersThree,HouseLine,Baby,PuzzlePiece,Student,Smiley,X,Lightning,CheckCircle,CalendarDots,ShoppingCart,Wallet,FileText,ForkKnife,Truck,Bank,PencilSimple,Archive,Package,CloudArrowUp,ShieldCheck,Ticket,Gift,Wrench,Fan,Car,Plant,Receipt,CookingPot,Coffee,BookOpen,Bell,TelegramLogo,ChartLineUp,Sparkle,Key,Question,HardDrives,UserPlus,MapPin,Clock,ArrowRight,ArrowLeft,Check,LockSimple,SquaresFour,ArrowSquareOut,Circle,WarningCircle};
import {FEATURES,FEATURE_GROUPS,featureDefaults} from '../../shared/features.mjs';
import {questionsFor,suggestFeatures} from '../../shared/family-setup.mjs';
import {SETUP_GUIDES} from '../../shared/setup-guides.mjs';
import {FeatureIcon} from './feature-icons';
import {cloudHeaders} from './cloud-transport';
import {BrandMark} from './brand-mark';
import './family-setup.css';
import './connection-guide.css';

const Icon=({name,size=24,...rest})=>{const C=P[name]||P.Circle;return <C size={size} {...rest}/>};
const L=(a,o)=>o?(a.lang==='he'?o.he:o.en):'';
const get=async path=>{const r=await fetch(path,{headers:cloudHeaders(),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(String(r.status));return r.json()};

export function FamilySetup({app:a,onClose,start='questions'}){
 const profile=a.data.preferences.familyProfile||{};
 const [stage,setStage]=useState(start),[answers,setAnswers]=useState(profile.answers||{}),[index,setIndex]=useState(0),[dir,setDir]=useState(1);
 const [picked,setPicked]=useState(()=>start==='features'?{...a.features.family}:featureDefaults()),[reasons,setReasons]=useState({}),[guide,setGuide]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const questions=questionsFor(answers),q=questions[Math.min(index,questions.length-1)],he=a.lang==='he';
 const Back=he?P.ArrowRight:P.ArrowLeft,Next=he?P.ArrowLeft:P.ArrowRight;
 const body=useRef(null);useEffect(()=>{body.current?.scrollTo?.(0,0);body.current?.querySelector('h1')?.focus?.()},[stage,index,guide]);
 const go=(next,d=1)=>{setDir(d);setStage(next)};
 const toSuggest=(skipped=false)=>{const s=skipped?{features:featureDefaults(),reasons:{}}:suggestFeatures(answers);setPicked(s.features);setReasons(s.reasons);go('features')};
 const answer=(value)=>{const next={...answers};if(q.multi){const now=next[q.id]||[];next[q.id]=now.includes(value)?now.filter(v=>v!==value):[...now,value]}else next[q.id]=value;setAnswers(next);
  if(!q.multi)setTimeout(()=>{setDir(1);const list=questionsFor(next),i=list.findIndex(x=>x.id===q.id);if(i<list.length-1)setIndex(i+1);else toSuggestWith(next)},220)};
 const toSuggestWith=next=>{const s=suggestFeatures(next);setPicked(s.features);setReasons(s.reasons);go('features')};
 const nextQ=()=>{setDir(1);if(index<questions.length-1)setIndex(index+1);else toSuggest()};
 const prevQ=()=>{setDir(-1);if(index>0)setIndex(index-1);else onClose?.()};
 const save=async(skipped)=>{setSaving(true);setError('');try{await a.update(d=>{d.preferences.features={...picked};d.preferences.familyProfile={answers:skipped?{}:answers,completedAt:new Date().toISOString(),...(skipped?{skipped:true}:{})}});go('connect')}catch(e){setError(a.T('Not saved. Check the connection and try again.','לא נשמר. בדקו את החיבור ונסו שוב.'))}finally{setSaving(false)}};
 const steps=[['questions',a.T('About you','עליכם')],['features',a.T('Features','תכונות')],['connect',a.T('Connect','חיבורים')]],cur=steps.findIndex(s=>s[0]===stage);
 const count=Object.values(picked).filter(Boolean).length;
 const header=<header className="setup-top"><span className="setup-logo"><BrandMark/></span>{stage!=='done'&&<ol className="setup-steps">{steps.map(([id,label],i)=><li key={id} className={i<cur?'done':i===cur?'current':''} aria-current={i===cur?'step':undefined}><span>{i<cur?<P.Check size={14} weight="bold"/>:i+1}</span>{label}</li>)}</ol>}
  {onClose&&stage!=='done'&&<button type="button" className="icon-button setup-close" aria-label={a.T('Close setup','סגירת ההגדרה')} onClick={onClose}><P.X size={22}/></button>}</header>;
 let content,footer;
 if(stage==='questions'){
  const multi=!!q.multi,chosen=answers[q.id];
  content=<div className="setup-card" key={'q'+q.id} data-dir={dir}>
   <div className="setup-progress" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={index+1}><span style={{width:(index+1)/questions.length*100+'%'}}/></div>
   <p className="setup-count">{a.T(`Question ${index+1} of ${questions.length}`,`שאלה ${index+1} מתוך ${questions.length}`)}</p>
   <span className="setup-qicon" aria-hidden="true"><Icon name={q.icon} size={30}/></span>
   <h1 tabIndex={-1}>{he?q.he:q.en}</h1>{q.hint&&<p className="setup-hint">{L(a,q.hint)}</p>}
   <div className={'setup-options'+(q.options.length>4?' six':'')} role={multi?'group':'radiogroup'} aria-label={he?q.he:q.en}>
    {q.options.map(([id,icon,en,heText],i)=>{const on=multi?(chosen||[]).includes(id):chosen===id;return <button type="button" key={id} style={{'--i':i}} role={multi?'checkbox':'radio'} aria-checked={on} className={'setup-option'+(on?' on':'')} onClick={()=>answer(id)}>
     <span className="setup-option-icon" aria-hidden="true"><Icon name={icon} size={26}/></span><strong>{he?heText:en}</strong>{multi&&<span className="setup-check" aria-hidden="true"><P.Check size={14} weight="bold"/></span>}</button>})}
   </div></div>;
  footer=<><button type="button" className="button quiet" onClick={prevQ}><Back size={20}/>{a.T('Back','חזרה')}</button><button type="button" className="setup-skip" onClick={()=>toSuggest(true)}>{a.T('Skip the questions','לדלג על השאלות')}</button><button type="button" className="button" onClick={nextQ} disabled={!multi&&!chosen}>{a.T('Next','הבא')}<Next size={20}/></button></>;
 }else if(stage==='features'){
  content=<div className="setup-wide" key="features" data-dir={dir}>
   <h1 tabIndex={-1}>{a.T('Here’s what we suggest.','זה מה שאנחנו מציעים.')}</h1>
   <p className="setup-hint">{Object.keys(reasons).length?a.T('Based on your answers. Tap to add or remove; you can change it any time in Settings › Features.','לפי התשובות שלכם. הקישו כדי להוסיף או להסיר; אפשר לשנות בכל רגע בהגדרות › תכונות.'):a.T('Tap to add or remove; you can change it any time in Settings › Features.','הקישו כדי להוסיף או להסיר; אפשר לשנות בכל רגע בהגדרות › תכונות.')}</p>
   {FEATURE_GROUPS.map(g=><section key={g.id} className="setup-group"><h2>{he?g.he:g.en}</h2><div className="setup-tiles">{FEATURES.filter(f=>f.group===g.id).map((f,i)=>{const on=!!(f.always||picked[f.id]),why=reasons[f.id];
    return <button type="button" key={f.id} style={{'--i':i}} role="checkbox" aria-checked={on} aria-disabled={f.always||undefined} className={'setup-tile'+(on?' on':'')} onClick={()=>!f.always&&setPicked({...picked,[f.id]:!picked[f.id]})}>
     <span className="setup-check" aria-hidden="true">{f.always?<P.LockSimple size={13} weight="bold"/>:<P.Check size={14} weight="bold"/>}</span>
     <span className="setup-tile-icon" aria-hidden="true"><FeatureIcon id={f.id} size={26}/></span><strong>{he?f.he:f.en}</strong><small>{L(a,f.description)}</small>
     {why&&on&&<em><P.Sparkle size={13}/>{L(a,why)}</em>}</button>})}</div></section>)}
   {error&&<p className="save-error" role="alert">{error}</p>}</div>;
  footer=<><button type="button" className="button quiet" onClick={()=>{setDir(-1);setStage('questions')}}><Back size={20}/>{a.T('Back','חזרה')}</button><span className="setup-count-pill">{a.T(count+' on',count+' פעילות')}</span><button type="button" className="button" disabled={saving} onClick={()=>save(!Object.keys(answers).length)}>{a.T('Looks good','נראה טוב')}<Next size={20}/></button></>;
 }else if(stage==='connect'){
  content=<SetupConnect a={a} picked={picked} answers={answers} openGuide={setGuide} dir={dir}/>;
  footer=<><button type="button" className="button quiet" onClick={()=>{setDir(-1);setStage('features')}}><Back size={20}/>{a.T('Back','חזרה')}</button><button type="button" className="setup-skip" onClick={()=>go('done')}>{a.T('I’ll do it later','אעשה את זה אחר כך')}</button><button type="button" className="button" onClick={()=>go('done')}>{a.T('Finish','סיום')}<Next size={20}/></button></>;
 }else{
  const on=FEATURES.filter(f=>picked[f.id]||f.always);
  content=<div className="setup-card setup-done" key="done" data-dir={1}><span className="setup-burst" aria-hidden="true"><img className="setup-ray-right" src="/assets/generated/title-rays-144.png" alt=""/><img className="setup-ray-left" src="/assets/generated/title-rays-144.png" alt=""/><P.House size={52}/></span>
   <h1 tabIndex={-1}>{a.T('Your home is ready.','הבית שלכם מוכן.')}</h1><p className="setup-hint">{a.T(on.length+' features are on.',on.length+' תכונות פעילות.')}</p>
   <div className="setup-done-icons" aria-hidden="true">{on.map((f,i)=><span key={f.id} style={{'--i':i}}><FeatureIcon id={f.id} size={21}/></span>)}</div>
   <ul className="setup-tips"><li><P.SquaresFour size={22}/><span>{a.T('Change what your family uses in Settings › Features.','משנים במה המשפחה משתמשת בהגדרות › תכונות.')}</span></li><li><P.Key size={22}/><span>{a.T('Finish connections in Settings › Accounts & connections.','משלימים חיבורים בהגדרות › חשבונות וחיבורים.')}</span></li><li><P.UserPlus size={22}/><span>{a.T('Invite the family from Settings › Family.','מזמינים את המשפחה בהגדרות › משפחה.')}</span></li></ul>
   <button type="button" className="button setup-big" onClick={()=>{onClose?.();a.go('today')}}>{a.T('Go to Today','למסך היום')}<Next size={22}/></button></div>;
  footer=null;
 }
 const g=guide&&SETUP_GUIDES[guide];
 return createPortal(<div className="family-setup" role="dialog" aria-modal="true" aria-label={a.T('Set up your home','הגדרת הבית')} dir={he?'rtl':'ltr'}>
  {header}<div className="setup-body" ref={body}>{content}</div>{footer&&<footer className="setup-foot">{footer}</footer>}
  {g&&<SetupGuide a={a} id={guide} g={g} onClose={()=>setGuide('')} openCard={card=>{setGuide('');onClose?.();a.go('settings/connections?open='+card)}}/>}
 </div>,document.body);
}

function SetupConnect({a,picked,answers,openGuide,dir}){
 const cloud=!!a.cloud,[status,setStatus]=useState({});
 useEffect(()=>{if(!cloud)return;let live=true;const settle=(key,p)=>p.then(v=>live&&setStatus(s=>({...s,[key]:v}))).catch(()=>live&&setStatus(s=>({...s,[key]:{failed:true}})));
  settle('config',get('/api/config'));if(picked.ai)settle('ai',get('/api/ai/status'));if(picked.telegram)settle('telegram',get('/api/telegram/status'));if(picked.expenses)settle('finance',get('/api/finance/connections'));
  return()=>{live=false}},[cloud]);
 const pill=(state,text)=>({state,text});
 const check=a.T('Checking…','בודקים…'),notYet=a.T('Not connected','לא מחובר'),preview=a.T('Preview only','תצוגה בלבד');
 const joined=a.members.filter(m=>m.role!=='child'&&(m.accountLinked||m.id===a.user)).length,adults=a.members.filter(m=>m.role!=='child').length;
 const ai=status.ai,tg=status.telegram,fin=status.finance,mineRise=fin?.connections?.find(c=>c.provider==='riseup'&&c.mine);
 const rows=[
  ['hosting',!cloud?pill('opt',preview):!status.config?pill('wait',check):status.config.storage?.connected?pill('ok',a.T('Ready','מוכן')):pill('todo',a.T('Device only','במכשיר בלבד')),false],
  ['family',adults>1&&joined>=adults?pill('ok',a.T('Everyone joined','כולם הצטרפו')):pill('todo',a.T(joined+' of '+Math.max(adults,1)+' joined',joined+' מתוך '+Math.max(adults,1)+' הצטרפו')),true],
  ...(picked.ai?[['ai',!cloud?pill('todo',notYet):!ai?pill('wait',check):ai.failed?pill('todo',a.T('Status unavailable','המצב אינו זמין')):ai.connected&&ai.model?pill('ok',a.T('Connected','מחובר')):pill('todo',notYet),true]]:[]),
  ...(picked.telegram?[['telegram',!cloud?pill('todo',notYet):!tg?pill('wait',check):tg.failed?pill('todo',a.T('Status unavailable','המצב אינו זמין')):tg.connected?pill('ok',a.T('Bot connected','הבוט מחובר')):pill('todo',notYet),true]]:[]),
  ...(picked.expenses?[['riseup',!cloud?pill('opt',a.T('Optional','אופציונלי')):!fin?pill('wait',check):mineRise?pill('ok',a.T('Connected','מחובר')):pill('opt',a.T('Optional','אופציונלי')),answers.money==='bank']]:[]),
  ['maps',pill('opt',a.T('Optional','אופציונלי')),false],
 ];
 return <div className="setup-wide" key="connect" data-dir={dir}>
  <h1 tabIndex={-1}>{a.T('Connect your own accounts.','חברו את החשבונות שלכם.')}</h1>
  <p className="setup-hint">{a.T('Bayit is open source and runs on accounts you own. Here’s what your choices need. Tap any card for simple steps; do it now or later in Settings › Accounts & connections.','Bayit הוא קוד פתוח ופועל על חשבונות שלכם. זה מה שהבחירות שלכם צריכות. הקישו על כרטיס לשלבים פשוטים; אפשר עכשיו או מאוחר יותר בהגדרות › חשבונות וחיבורים.')}</p>
  <div className="setup-connect">{rows.map(([id,p,primary],i)=>{const g=SETUP_GUIDES[id];return <button type="button" key={id} style={{'--i':i}} className={'setup-conn '+p.state} onClick={()=>openGuide(id)}>
   <span className="setup-tile-icon" aria-hidden="true"><Icon name={g.icon} size={24}/></span><span className="setup-conn-text"><strong>{L(a,g)}</strong><small>{L(a,g.why)}</small></span>
   <span className={'setup-status '+p.state}>{p.state==='ok'&&<P.Check size={14} weight="bold"/>}{p.text}</span><span className={'setup-conn-go'+(primary&&p.state!=='ok'?' primary':'')}>{p.state==='ok'?a.T('Details','פרטים'):a.T('Show me how','איך עושים')}</span></button>})}</div>
 </div>;
}

function SetupGuide({a,id,g,onClose,openCard}){
 const title=useRef(null);useEffect(()=>{title.current?.focus()},[]);
 const he=a.lang==='he',Ext=P.ArrowSquareOut;
 const action=(x,k)=>x.link?<a key={k} className="button secondary setup-action" href={x.link} target="_blank" rel="noopener noreferrer">{L(a,x)}<Ext size={18}/></a>
  :x.card?<button key={k} type="button" className="button setup-action" onClick={()=>openCard(x.card)}>{L(a,x)}</button>
  :x.route?<button key={k} type="button" className="button setup-action" onClick={()=>{onClose();a.go(x.route)}}>{L(a,x)}</button>:null;
 return <div className="setup-guide-backdrop" onPointerDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="setup-guide" role="dialog" aria-modal="true" aria-labelledby={'guide-'+id}>
   <header><span className="setup-tile-icon" aria-hidden="true"><Icon name={g.icon} size={24}/></span><div><h2 id={'guide-'+id} tabIndex={-1} ref={title}>{L(a,g)}</h2><p>{L(a,g.why)}</p></div>
    <button type="button" className="icon-button" aria-label={a.T('Close','סגירה')} onClick={onClose}><P.X size={22}/></button></header>
   <div className="setup-guide-body">
    {g.warning&&<div className="conn-guide-warning" role="note"><P.WarningCircle size={28} weight="fill" aria-hidden="true"/><strong>{L(a,g.warning.title)}</strong><span>{L(a,g.warning.text)}</span></div>}
    {!!g.need?.length&&<div className="setup-need">{g.need.map(([icon,t],i)=><span key={i}><Icon name={icon} size={17}/>{L(a,t)}</span>)}</div>}
    {(g.supported||g.unsupported)&&<div className="setup-support">{g.supported&&<div className="yes"><strong><P.Check size={16} weight="bold"/>{a.T('Supported','נתמך')}</strong><ul>{g.supported.map((t,i)=><li key={i}>{L(a,t)}</li>)}</ul></div>}
     {g.unsupported&&<div className="no"><strong><P.X size={16} weight="bold"/>{a.T('Not supported','לא נתמך')}</strong><ul>{g.unsupported.map((t,i)=><li key={i}>{L(a,t)}</li>)}</ul></div>}</div>}
    <ol className="setup-guide-steps">{g.steps.map(([h,d,...actions],i)=><li key={i}><span className="setup-step-n" aria-hidden="true">{i+1}</span><div><strong>{L(a,h)}</strong>{d&&<small>{L(a,d)}</small>}{!!actions.length&&<div className="setup-actions">{actions.map(action)}</div>}</div></li>)}</ol>
    <p className="setup-guide-foot">{a.T('Nothing is saved until the check on the card passes. You can come back to this guide any time.','שום דבר לא נשמר עד שהבדיקה בכרטיס עוברת. אפשר לחזור למדריך בכל רגע.')}</p>
   </div>
   <footer><button type="button" className="button secondary" onClick={onClose}>{a.T('Back to the list','חזרה לרשימה')}</button></footer>
  </section>
 </div>;
}

// Shown automatically to a parent of a new family (familyProfile.pending), or from Settings › Features.
export function FamilySetupGate({app:a}){
 const parent=a.member(a.user).role==='parent',pending=a.data.preferences.familyProfile?.pending===true;
 const asked=/[?&]setup=1/.test(a.route),[closed,setClosed]=useState(false);
 useEffect(()=>{if(asked)setClosed(false)},[asked]);
 if(!parent||closed||!(pending||asked))return null;
 // Closing a new family's setup keeps the Core 5 and does not ask again; it can be run later from Settings › Features.
 const close=()=>{setClosed(true);if(pending)a.update(d=>{d.preferences.familyProfile={answers:{},skipped:true,completedAt:new Date().toISOString()}});if(asked)a.go('settings/features')};
 return <FamilySetup app={a} onClose={close}/>;
}
