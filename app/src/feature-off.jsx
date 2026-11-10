import React from 'react';
import {featureById,featureLabel} from '../../shared/features.mjs';
import {FeatureIcon} from './feature-icons';
import './feature-off.css';

// A direct link to a feature that is off (features registry, 2026-11-09): a calm page, never an error.
// Parents get a way back to Settings › Features; everyone else is told that a parent decides.
export function FeatureOff({app:a,id}){
 const f=featureById(id),name=id==='household'?a.T('Household','ניהול הבית'):featureLabel(id,a.lang)||a.T('This page','העמוד הזה');
 const parent=a.member(a.user).role==='parent',hiddenByMe=a.features?.family?.[id]===true&&a.features.hidden.includes(id);
 return <section className="feature-off" aria-labelledby="feature-off-title">
  <span className="feature-off-icon" aria-hidden="true"><FeatureIcon id={f?id:'household'} size={44}/></span>
  <h1 id="feature-off-title">{hiddenByMe?a.T(name+' is hidden for you',name+' מוסתר אצלכם'):a.T(name+' is turned off',name+' כבוי')}</h1>
  <p>{hiddenByMe?a.T('You hid it in Settings › Features. Nothing was deleted.','הסתרתם את זה בהגדרות › תכונות. שום דבר לא נמחק.')
   :parent?a.T('Your family isn’t using it right now. Nothing was deleted: everything comes back when you turn it on.','המשפחה לא משתמשת בזה כרגע. שום דבר לא נמחק: הכול יחזור כשתפעילו.')
   :a.T('Your family isn’t using it right now. A parent can turn it on in Settings.','המשפחה לא משתמשת בזה כרגע. הורה יכול להפעיל בהגדרות.')}</p>
  <div className="feature-off-actions">
   {(parent||hiddenByMe)&&<button type="button" className="button" onClick={()=>a.go('settings/features')}>{hiddenByMe?a.T('Show it again','להציג שוב'):a.T('Turn on in Settings','להפעלה בהגדרות')}</button>}
   <button type="button" className="button secondary" onClick={()=>a.go('today')}>{a.T('Back to Today','חזרה למסך היום')}</button>
  </div>
 </section>;
}
