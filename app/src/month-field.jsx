import React from 'react';
import {CalendarDots,CaretDown} from '@phosphor-icons/react';
import './month-field.css';

// The real native month input remains the interactive control. A formatted
// label keeps iOS's internal date text from resizing or clipping the toolbar.
export function MonthField({value,onChange,locale='en',...props}){
 const date=/^\d{4}-(0[1-9]|1[0-2])$/.test(value||'')?new Date(value+'-15T12:00:00Z'):null;
 const language=locale==='he'?'he-IL':'en-US';
 const text=date?date.toLocaleDateString(language,{month:'short',year:'numeric',timeZone:'UTC'}):locale==='he'?'בחירת חודש':'Choose month';
 return <label className="month-field" title={date?.toLocaleDateString(language,{month:'long',year:'numeric',timeZone:'UTC'})}>
  <CalendarDots size={20} aria-hidden="true"/>
  <span className="month-field-value" aria-hidden="true">{text}</span>
  <CaretDown size={14} aria-hidden="true"/>
  <input {...props} type="month" value={value} onChange={onChange}/>
 </label>;
}
