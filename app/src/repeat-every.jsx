// Custom repeat (owner's choice A, 2026-11-12): "Repeats: Custom" opens "Every [n] [days|weeks|months|years]" in place,
// with the next three dates and, for the 29th-31st / 29 Feb, where the date falls in shorter months.
// Concept: work/custom-repeat-20261112/concepts/board-A.png. The rule and wording are in shared/repeat.mjs.
import React from 'react';
import {Select} from './Select';
import {REPEAT_LIMITS,nextOccurrences,shortMonthNote,addDays} from '../../shared/repeat.mjs';
import './repeat-every.css';

const UNITS=[['daily','days','ימים'],['weekly','weeks','שבועות'],['monthly','months','חודשים'],['yearly','years','שנים']];
export function repeatEveryValid(unit,every){const n=Number(every);return Number.isInteger(n)&&n>=1&&n<=(REPEAT_LIMITS[unit]||0)}
export function RepeatEvery({a,unit,every,onUnit,onEvery,date,until,today}){
 const hintId=React.useId(),he=a.lang==='he',valid=repeatEveryValid(unit,every),max=REPEAT_LIMITS[unit];
 const record={date,repeat:unit,repeatEvery:valid?Number(every):1,until:until||undefined};
 const after=date?addDays(date,1):'',from=today&&today>after?today:after;
 let year=(date||'').slice(0,4);
 const fmt=d=>{const y=d.slice(0,4),withYear=y!==year;year=y;return new Date(d+'T12:00:00Z').toLocaleDateString(he?'he-IL':'en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',...(withYear?{year:'numeric'}:{})})};
 const next=valid&&date?nextOccurrences(record,from,3):[],note=valid?shortMonthNote(record,a.lang):'';
 const hint=!valid?a.T('Choose a whole number from 1 to '+max+'.','בחרו מספר שלם מ־1 עד '+max+'.'):next.length?a.T('Next: ','הבאים: ')+next.map(fmt).join(' · ')+(note?'. '+note:''):a.T('No more dates before the end date.','אין עוד מועדים לפני תאריך הסיום.');
 return <div className="repeat-every">
  <div className="repeat-every-row">
   <span>{a.T('Every','כל')}</span>
   <input type="number" inputMode="numeric" required min="1" max={max} step="1" aria-label={a.T('Repeat every','חוזר כל')} aria-invalid={!valid||undefined} aria-describedby={hintId} value={every} onChange={e=>onEvery(e.target.value)}/>
   <Select aria-label={a.T('Repeat unit','יחידת חזרה')} value={unit} onChange={e=>onUnit(e.target.value)}>{UNITS.map(([v,en,h])=><option key={v} value={v}>{a.T(en,h)}</option>)}</Select>
  </div>
  <small id={hintId} className={'repeat-ends-hint repeat-every-hint'+(valid?'':' invalid')} aria-live="polite">{hint}</small>
 </div>;
}
