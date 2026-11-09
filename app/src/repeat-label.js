// Repeat wording for rows and details. "custom" is what the form saves when the person picks weekdays
// (for example 5 of 7 days for dinner); it used to fall back to "Once", which is wrong (user report 2026-11-08).
export function repeatLabel(repeat,T,weekdays){
 const labels={once:['Once','פעם אחת'],daily:['Every day','כל יום'],weekly:['Every week','כל שבוע'],monthly:['Every month','כל חודש'],yearly:['Every year','כל שנה']};
 const key=String(repeat||'once').toLowerCase();
 if(key==='custom'){
  const count=Array.isArray(weekdays)?new Set(weekdays).size:0;
  if(count>=7)return T(...labels.daily);
  if(count===1)return T('Once a week','פעם בשבוע');
  if(count>1)return T(count+' days a week',count+' ימים בשבוע');
  return T('On chosen days','בימים נבחרים');
 }
 return T(...(labels[key]||labels.once));
}
