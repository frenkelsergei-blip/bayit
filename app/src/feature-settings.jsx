import React from 'react';
import {House,Eye,Plus,Sparkle} from '@phosphor-icons/react';
import {FormSection} from './form-section';
import {FEATURES,FEATURE_GROUPS,featureOn} from '../../shared/features.mjs';
import {FeatureIcon} from './feature-icons';
import './feature-settings.css';

// Settings › Features (user choice 2026-11-09, concept B in concept/explorations/features-20261109/):
// "What our family uses" (parents switch features on/off for everyone; off ones offer Add) and
// "What I see" (each person hides features in their own app). Off never deletes data.
export function FeatureSettings({app:a}){
 const role=a.member(a.user).role,parent=role==='parent',family=a.features.family,hidden=a.features.hidden;
 const setFamily=(id,on)=>a.update(d=>{d.preferences.features={...family,...d.preferences.features,[id]:on}});
 const setMine=(id,show)=>a.update(d=>{const now=d.preferences.featuresByUser?.[a.user]?.hidden||[],next=show?now.filter(k=>k!==id):[...new Set([...now,id])];d.preferences.featuresByUser={...d.preferences.featuresByUser,[a.user]:{hidden:next}}});
 const name=f=>a.lang==='he'?f.he:f.en,desc=f=>a.lang==='he'?f.description.he:f.description.en;
 const always=<span className="feature-pill">{a.T('Always on','תמיד פעיל')}</span>;
 const toggle=(f,checked,onChange,label)=><button type="button" role="switch" aria-checked={checked} aria-label={label} className={'switch '+(checked?'on':'')} onClick={()=>onChange(!checked)}><span/></button>;
 const row=(f,end,off,withDesc=true)=><li key={f.id} className={'feature-row'+(off?' off':'')}>
  <span className="feature-row-icon" aria-hidden="true"><FeatureIcon id={f.id} size={22}/></span>
  <span className="feature-row-text"><strong>{name(f)}</strong>{withDesc&&<small>{desc(f)}</small>}</span>{end}
 </li>;
 const visibleToRole=f=>!(f.adult&&role==='child');
 const familyList=<FormSection T={a.T} icon={House} tone="blue" title={a.T('What our family uses','במה המשפחה שלנו משתמשת')} className="feature-settings-family">
  <p className="settings-section-intro">{parent
   ?a.T('Off hides a feature for everyone: menus, Today, reminders, Telegram and AI. Its information is kept and comes back when you turn it on.','כיבוי מסתיר תכונה אצל כולם: בתפריטים, במסך היום, בתזכורות, בטלגרם וב־AI. המידע נשמר וחוזר כשמפעילים.')
   :a.T('A parent chooses what the family uses.','הורה בוחר במה המשפחה משתמשת.')}</p>
  {parent&&<p className="feature-settings-helper"><button type="button" className="button secondary" onClick={()=>a.go('settings/features?setup=1')}><Sparkle size={20} aria-hidden="true"/>{a.T('Help me choose','עזרו לי לבחור')}</button><span>{a.T('A few questions, then a suggestion.','כמה שאלות, ואז הצעה.')}</span></p>}
  {FEATURE_GROUPS.map(g=>{const list=FEATURES.filter(f=>f.group===g.id&&(parent||visibleToRole(f)));return !!list.length&&<div key={g.id} className="feature-group">
   <h4>{a.lang==='he'?g.he:g.en}</h4>
   <ul>{list.map(f=>{const on=family[f.id]===true;return row(f,f.always?always:parent
    ?(on?toggle(f,true,v=>setFamily(f.id,v),a.T('Use ','שימוש ב')+name(f)+a.T(' in the family',' במשפחה'))
     :<button type="button" className="button secondary feature-add" onClick={()=>setFamily(f.id,true)} aria-label={a.T('Add ','הוספת ')+name(f)}><Plus size={18} weight="bold"/>{a.T('Add','הוספה')}</button>)
    :<span className={'feature-pill'+(on?' on':'')}>{on?a.T('In use','בשימוש'):a.T('Not in use','לא בשימוש')}</span>,!on&&!f.always)})}</ul>
  </div>})}
 </FormSection>;
 const mine=FEATURES.filter(f=>family[f.id]===true&&visibleToRole(f));
 const myList=<FormSection T={a.T} icon={Eye} tone="lilac" title={a.T('What I see','מה אני רואה')} className="feature-settings-mine">
  <p className="settings-section-intro">{a.T('Hide what you don’t need. Only you see this; nothing changes for the family.','הסתירו את מה שלא צריך לכם. רק אתם רואים את זה; אצל השאר שום דבר לא משתנה.')}</p>
  <ul>{mine.map(f=>{const shown=featureOn({family,hidden,role},f.id);return row(f,f.always?always:toggle(f,shown,v=>setMine(f.id,v),a.T('Show ','להציג ')+name(f)+a.T(' in my app',' אצלי')),!shown,false)})}</ul>
 </FormSection>;
 return <div className="settings-v2 feature-settings"><div className="settings-grid">{parent?<>{familyList}{myList}</>:<>{myList}{familyList}</>}</div></div>;
}
