// Repeat wording for rows and details. "custom" is what the form saves when the person picks weekdays
// (for example 5 of 7 days for dinner); it used to fall back to "Once", which is wrong (user report 2026-11-08).
// `every` is the custom repeat's repeatEvery (2026-11-12): "Every 42 days", "כל 3 חודשים"; wording in shared/repeat.mjs.
import {everyLabel} from '../../shared/repeat.mjs';
export function repeatLabel(repeat,T,weekdays,every){
 const key=String(repeat||'once').toLowerCase();
 if(key==='custom'){
  const count=Array.isArray(weekdays)?new Set(weekdays).size:0;
  if(count>=7)return T('Every day','כל יום');
  if(count===1)return T('Once a week','פעם בשבוע');
  if(count>1)return T(count+' days a week',count+' ימים בשבוע');
  return T('On chosen days','בימים נבחרים');
 }
 return T(everyLabel(key,every,'en'),everyLabel(key,every,'he'));
}
