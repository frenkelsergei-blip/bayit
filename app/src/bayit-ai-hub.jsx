// One בית AI (user decision 2026-11-11, boards concept/explorations/ai-recommendations-20261110/concept-one-bayit-ai.png
// and concept-settings-options.png): the menu item, the bubble and the Today card open the same בית AI with four tabs,
// Chat · Suggestions · History · Settings. Every AI setting lives only in בית AI › Settings (the user: "managing the
// same thing twice"); elsewhere in Settings one row opens it (BayitAISettingsLink). Each section says who sees/changes it.
// Suggestions brings the three kinds together, each under its own source: בית AI recommendations (money rules, adults),
// daily ideas (routines and lists, no AI) and help with our day (home-suggestions, no AI).
import React,{useEffect,useState} from 'react';
import {Plugs,Eye,Lightbulb,Sun,Microphone,Coins,CaretLeft,CaretRight,Gear,Plus,CheckCircle} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {FormSection} from './form-section.jsx';
import {BayitAIToday,BayitAISettings,BayitAINotify,SwitchRow,MarkIcon,useBayitAI} from './bayit-ai';
import {HomeSuggestions} from './home-suggestions';
import {AIUsageSection} from './ai-usage';
import {TimeField} from './time-field';
import {Select} from './Select';
import {canSee,anchor} from './data';
import './bayit-ai-hub.css';

export const HUB_VIEWS=['chat','suggestions','history','settings'];
const role=a=>a.member?.(a.user)?.role||'parent';
const Caret=({a,size=18})=>a.lang==='he'?<CaretLeft size={size} aria-hidden="true"/>:<CaretRight size={size} aria-hidden="true"/>;

// ---- Daily ideas: pattern-based, local, no AI (moved from the old AI › Daily suggestions page) ----
export function dailyIdeas(a,scope='family'){
 const prefs=a.data.preferences||{},personal=prefs.suggestionsByUser?.[a.user]||{},enabled=personal.enabled??prefs.smartSuggestions??true,time=personal.time||'19:30',max=personal.max||prefs.maxSuggestions||2;
 const history=a.visible(a.data.history||[],scope).filter(h=>h.done),bags=history.filter(h=>/bag|תיק/i.test(h.title||h.he||'')),bagDates=[...new Set(bags.map(h=>h.date))].sort().slice(-3);
 const oil=a.visible(a.data.shopping||[],scope).find(i=>!i.done&&/olive oil|שמן זית/i.test(i.title+' '+i.he));
 const ideas=[...(bagDates.length>=3?[{id:'bags',title:a.T('Prepare tomorrow’s school bags?','להכין את תיקי בית הספר למחר?'),taskTitle:'Prepare tomorrow’s school bags',taskHe:'להכין את תיקי בית הספר למחר',icon:'1F392',why:a.T('School bags were marked complete on '+bagDates.join(', ')+'.','אריזת תיקים סומנה כהושלמה בתאריכים '+bagDates.join(', ')+'.'),source:'kids/turns'}]:[]),
  ...(oil?[{id:'oil',title:a.T('Olive oil is still on the list.','שמן זית עדיין ברשימה.'),taskTitle:'Review the shopping list',taskHe:'לעבור על רשימת הקניות',icon:oil.icon,why:a.T('This item is still unchecked in your current list.','הפריט עדיין לא נאסף ברשימה הנוכחית.'),source:'shopping'}]:[])];
 const list=enabled?ideas.filter(i=>!personal.dismissed?.includes(anchor+'|'+i.id)&&!personal.accepted?.includes(anchor+'|'+i.id)&&!a.visible(a.data.tasks||[],scope).some(t=>t.date===anchor&&t.title===i.taskTitle)).slice(0,max):[];
 return {enabled,personal,time,max,list};
}
const saveIdeas=(a,next)=>a.update(d=>{d.preferences.suggestionsByUser={...d.preferences.suggestionsByUser,[a.user]:{...d.preferences.suggestionsByUser?.[a.user],...next}}});

function Ideas({a,ui,onNavigate}){
 const d=dailyIdeas(a);
 if(!d.enabled)return null;
 const accept=idea=>{a.update(x=>{if(!x.tasks.some(t=>canSee(t,a.user)&&t.date===anchor&&t.title===idea.taskTitle&&t.visibility==='family'))x.tasks.push({id:crypto.randomUUID(),title:idea.taskTitle,he:idea.taskHe,memberId:a.user,date:anchor,time:d.time,icon:idea.icon,done:false,xp:0,ownerId:a.user,visibility:'family',allowedIds:[]});
  const p=x.preferences.suggestionsByUser?.[a.user]||{};x.preferences.suggestionsByUser={...x.preferences.suggestionsByUser,[a.user]:{...p,accepted:[...(p.accepted||[]),anchor+'|'+idea.id]}}});a.notify?.(a.T('Task added to your day.','המשימה נוספה ליום שלכם.'))};
 return <section className="bh-group" aria-label={a.T('Ideas for today','רעיונות להיום')}>
  <h3 className="bh-head"><Lightbulb size={22} aria-hidden="true"/><span>{a.T('Ideas for today','רעיונות להיום')}<small>{a.T('From your routines and lists','מהשגרות והרשימות שלכם')}</small></span>{d.list.length>0&&<b className="bh-count">{d.list.length}</b>}</h3>
  {d.list.map(idea=><article className="bh-card" key={idea.id}>{ui.Icon?<ui.Icon code={idea.icon} size={40}/>:null}<div><b dir="auto">{idea.title}</b><small>{idea.why}</small>
   <div className="bh-actions"><button type="button" className="button" onClick={()=>accept(idea)}><Plus size={18}/>{a.T('Add a '+d.time+' task','משימה ל־'+d.time)}</button><button type="button" className="button secondary" onClick={()=>saveIdeas(a,{dismissed:[...(d.personal.dismissed||[]),anchor+'|'+idea.id]})}>{a.T('Not today','לא היום')}</button><button type="button" className="text-link" onClick={()=>onNavigate(idea.source)}>{a.T('Where this comes from','מאיפה זה')}</button></div></div></article>)}
  {!d.list.length&&<p className="bh-empty">{a.T('No idea for today. Ideas appear when your routines and lists show a useful next step.','אין רעיון להיום. רעיונות מופיעים כשהשגרות והרשימות מראות צעד הבא.')}</p>}
 </section>;
}

// ---- Suggestions tab ----
export function HubSuggestions({a,ui,onNavigate,onSettings}){
 const bai=useBayitAI(a),adult=role(a)!=='child',mine=bai.ready?bai.open.filter(f=>f.assignees.includes(a.user)):[];
 // BayitAIToday's own links (all recommendations) leave the chat, so close the window first.
 return <div className="bh-suggestions" onClickCapture={e=>{if(e.target.closest?.('.bai-more'))onNavigate(null)}}>
  {adult&&bai.ready&&<section className="bh-group bh-bai" aria-label={a.T('To check','לבדיקה')}>
   {mine.length?<BayitAIToday a={a} ui={ui}/>:<><h3 className="bh-head"><MarkIcon size={22}/><span>{a.T('To check','לבדיקה')}<small>{a.T('Bayit AI recommendations','המלצות בית AI')}</small></span></h3><p className="bh-empty"><CheckCircle size={18} weight="fill" aria-hidden="true"/>{a.T('Nothing to check right now.','אין כרגע מה לבדוק.')}</p></>}
  </section>}
  <Ideas a={a} ui={ui} onNavigate={onNavigate}/>
  <DayHelp a={a} ui={ui}/>
  <p className="bh-foot">{a.T('Each kind of suggestion comes from a different place, and each turns on or off in ','כל סוג הצעה מגיע ממקום אחר, וכל אחד נדלק ונכבה ב')}<button type="button" className="text-link" onClick={onSettings}><Gear size={16} aria-hidden="true"/>{a.T('Settings','הגדרות')}</button></p>
 </div>;
}
// Help with our day: shown under its own heading while it is on and has something; turning it on is in Settings.
function DayHelp({a,ui}){
 const [s]=useJSON('/api/home-suggestions/list',!!a.cloud);
 if(!a.cloud||!s||s.failed||!s.enabled||!s.items?.length)return null;
 return <section className="bh-group bh-day" aria-label={a.T('Help with our day','עזרה ביום שלנו')}><h3 className="bh-head"><Sun size={22} aria-hidden="true"/><span>{a.T('Help with our day','עזרה ביום שלנו')}<small>{a.T('Pickups, stuck tasks, vouchers','איסופים, משימות תקועות, שוברים')}</small></span><b className="bh-count">{s.items.length}</b></h3><HomeSuggestions a={a} Button={ui.Button||Btn}/></section>;
}
const Btn=({children,secondary,quiet,icon:I,...p})=><button type="button" className={'button '+(secondary?'secondary ':'')+(quiet?'quiet':'')} {...p}>{I&&<I size={20}/>}{children}</button>;

// ---- Settings tab: every AI setting, in one place ----
function useJSON(url,on=true){
 const [v,setV]=useState(null);
 useEffect(()=>{if(!on)return;let live=true;fetch(url,{headers:cloudHeaders(),cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>live&&setV(j||{failed:true}),()=>live&&setV({failed:true}));return()=>{live=false}},[url,on]);
 return [v,setV];
}
function DaySettings({a}){
 const [s,setS]=useJSON('/api/home-suggestions/list',!!a.cloud),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!a.cloud||!s||s.failed||s.available===false)return null;
 const save=async v=>{setBusy(true);setError('');try{const r=await fetch('/api/home-suggestions/preferences',{method:'POST',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:JSON.stringify({enabled:v})});if(!r.ok)throw Error();setS({...s,enabled:v})}catch{setError(a.T('Not saved. Try again.','לא נשמר. נסו שוב.'))}finally{setBusy(false)}};
 return <FormSection T={a.T} icon={Sun} tone="green" className="settings-wide" title={a.T('Help with our day','עזרה ביום שלנו')} note={a.T('Only mine','רק שלי')}>
  <SwitchRow label={a.T('Suggest help with the day','להציע עזרה ביום')} hint={a.T('Who picks up, tasks that got stuck, vouchers about to expire. No AI.','מי אוסף, משימות שנתקעו, שוברים שעומדים לפוג. בלי AI.')} checked={!!s.enabled} disabled={busy} onChange={save}/>
  {error&&<p role="alert" className="save-error">{error}</p>}
 </FormSection>;
}
function IdeasSettings({a}){
 const d=dailyIdeas(a);
 return <FormSection T={a.T} icon={Lightbulb} tone="yellow" className="settings-wide" title={a.T('Daily ideas','רעיונות יומיים')} note={a.T('Only mine','רק שלי')}>
  <SwitchRow label={a.T('Daily ideas','רעיונות יומיים')} hint={a.T('From your routines and lists; they change nothing until you accept. No AI.','מהשגרות והרשימות שלכם; לא משנים כלום עד שמאשרים. בלי AI.')} checked={d.enabled} onChange={v=>saveIdeas(a,{enabled:v})}/>
  {d.enabled&&<div className="bh-fields"><label>{a.T('How many','כמה')}<Select aria-label={a.T('Ideas per day','רעיונות ביום')} value={d.max} onChange={e=>saveIdeas(a,{max:+e.target.value})}>{[1,2,3].map(n=><option value={n} key={n}>{a.T('Up to '+n+' a day','עד '+n+' ביום')}</option>)}</Select></label><label>{a.T('Task time','שעת המשימה')}<TimeField value={d.time} onChange={e=>e.target.value&&saveIdeas(a,{time:e.target.value})}/></label></div>}
 </FormSection>;
}
function VoiceSettings({a,onNavigate}){
 const [v]=useJSON('/api/voice',!!a.cloud),parent=role(a)==='parent';
 if(!a.cloud||!v||v.failed)return null;
 return <FormSection T={a.T} icon={Microphone} tone="peach" className="settings-wide" title={a.T('Voice','הקלטה')} note={a.T('A parent turns it on','הורה מפעיל')}>
  <div className="bh-row"><span><b>{v.available?a.T('On · up to '+Math.round((v.maxSeconds||120)/60)+' minutes a message','פעיל · עד '+Math.round((v.maxSeconds||120)/60)+' דקות להודעה'):a.T('Off','כבוי')}</b><small>{a.T('The household’s speech service, the same one Telegram voice messages use. Recordings are never kept.','שירות התמלול של הבית, אותו אחד של הודעות קוליות בטלגרם. ההקלטות לא נשמרות.')}</small></span>
   {parent&&<button type="button" className="button secondary" onClick={()=>onNavigate('settings/connections')}>{a.T('Change','שינוי')}</button>}</div>
 </FormSection>;
}
export function HubSettings({a,ui,conn,connected,buttonSettings,onNavigate}){
 const r=role(a),parent=r==='parent',T=a.T,sources=a.data.preferences?.aiSources||{};
 const model=conn?.models?.find(m=>m.id===conn.model)?.name||conn?.model;
 return <div className="bh-settings">
  <p className="bh-intro">{T('Everything about Bayit AI, in one place. Each part says who it is for.','כל מה שקשור לבית AI, במקום אחד. בכל חלק כתוב למי הוא.')}</p>
  <FormSection T={T} icon={Plugs} tone="blue" className="settings-wide" title={T('Connection','חיבור')} note={T('Parents','הורים')}>
   <div className="bh-row"><span><b>{connected?(conn?.providerName||'AI')+(model?' · '+model:''):a.cloud?T('Not connected','לא מחובר'):T('Sample household','בית לדוגמה')}</b><small>{connected?T('The household’s AI is connected and checked.','ה־AI של הבית מחובר ונבדק.'):!a.cloud?T('Connect a real AI in your own Bayit.','חברו AI אמיתי ב־Bayit שלכם.'):parent?T('Needs a connection code from an AI provider.','צריך קוד חיבור מספק AI.'):T('A parent connects it.','הורה מחבר אותו.')}</small></span>
    {parent&&a.cloud&&<button type="button" className="button secondary" onClick={()=>onNavigate('settings/ai')}>{connected?T('Manage','ניהול'):T('Connect','חיבור')}</button>}</div>
  </FormSection>
  <FormSection T={T} icon={Eye} tone="lilac" className="settings-wide" title={T('What Bayit AI may read','מה בית AI רשאי לקרוא')} note={T('The whole family','לכל המשפחה')}>
   <div className="bh-checks">{[['Calendar','לוח שנה'],['Tasks','משימות'],['Shopping','קניות'],['Home journal','יומן הבית']].map(([en,he])=><label className="ai-source-option" key={en}><input type="checkbox" checked={sources[en]!==false} onChange={e=>a.update(d=>{d.preferences.aiSources={...d.preferences.aiSources,[en]:e.target.checked}})}/>{T(en,he)}</label>)}</div>
   <p className="muted bh-note">{T('Each person’s questions use only what that person may see. Other people’s private records are never included.','השאלות של כל אחד משתמשות רק במה שהוא רשאי לראות. רשומות פרטיות של אחרים לא נכללות.')}</p>
  </FormSection>
  {r!=='child'&&<BayitAISettings a={a}/>}
  <IdeasSettings a={a}/>
  <DaySettings a={a}/>
  <BayitAINotify a={a}/>
  {buttonSettings}
  <VoiceSettings a={a} onNavigate={onNavigate}/>
  {parent&&(connected||!a.cloud)&&<FormSection T={T} icon={Coins} tone="peach" className="settings-wide" title={T('Usage and cost','שימוש ועלות')} note={T('Estimate · parents','הערכה · הורים')}><AIUsageSection a={a} Button={ui.Button||Btn} Avatar={ui.Avatar}/></FormSection>}
 </div>;
}

// Settings › General / Notifications / the AI connection: one row that opens בית AI › Settings (no second copy).
export function BayitAISettingsLink({a,where='general'}){
 if(a.features?.on?.('ai')===false)return null;
 const text=where==='notifications'?a.T('The Bayit AI recommendation summary and daily ideas are set in Bayit AI › Settings.','סיכום ההמלצות של בית AI והרעיונות היומיים מוגדרים בבית AI › הגדרות.')
  :a.T('What Bayit AI does, what it may read, its notifications, your button and usage: all in Bayit AI › Settings.','מה בית AI עושה, מה מותר לו לקרוא, ההודעות שלו, הכפתור שלכם והשימוש: הכול בבית AI › הגדרות.');
 return <div className="settings-v2 bh-link"><FormSection T={a.T} icon={MarkIcon} tone="ai" className="settings-wide" title={a.T('Bayit AI','בית AI')}>
  <div className="bh-row"><span><small>{text}</small></span><button type="button" className="button secondary" onClick={()=>a.go('ai/settings')}>{a.T('Bayit AI settings','הגדרות בית AI')}<Caret a={a}/></button></div>
 </FormSection></div>;
}
