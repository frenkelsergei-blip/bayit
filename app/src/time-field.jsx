import React from 'react';
import {Clock} from '@phosphor-icons/react';
import './time-field.css';

// Shared time field (2026-11-11). Same idea as MonthField: our own markup draws the value (24-hour, left to
// right, centred by flexbox), and the real native <input type="time"> lies on top of it, transparent, so the
// iOS wheel, the desktop keyboard, `required`, `disabled`, `aria-label` and `onChange` all stay native. iOS
// Safari's internal date/time text (::-webkit-date-and-time-value) never takes part in layout, which is why
// line-height tweaks on the raw input looked centred in Playwright WebKit but sat high on a real iPhone.
const valid=v=>/^([01]\d|2[0-3]):[0-5]\d/.test(v||'');
export function TimeField({value='',onChange,placeholder,className='',...props}){
 const has=valid(value);
 return <span className={'time-field'+(has?'':' is-empty')+(props.disabled?' is-disabled':'')+(className?' '+className:'')}>
  <Clock size={20} className="time-field-icon" aria-hidden="true"/>
  <span className="time-field-text" dir={has?'ltr':undefined} aria-hidden="true">{has?value.slice(0,5):(placeholder||'--:--')}</span>
  <input {...props} className="time-field-native" type="time" value={value} onChange={onChange}/>
 </span>;
}
