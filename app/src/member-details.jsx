import React from 'react';
import {Check,Cake,Camera} from '@phosphor-icons/react';
import {ageOn} from './birthdays.js';
export {syncBirthday,ageOn,birthdayEventId} from './birthdays.js';

// Pixel explorers. Each key has avatar-<key>.png, -cap/-cape outfits and matching -bust.png crops in /assets/generated.
export const KID_CHARACTERS=[
 ['itai','Explorer','הרפתקן'],
 ['noa','Stargazer','חוקרת כוכבים'],
 ['maya','Sunny puffs','פונפונים'],
 ['ari','Bookworm','תולעת ספרים'],
 ['lia','Braids','צמות'],
 ['tom','Freckles','נמשים'],
 ['dana','Bright clip','סיכה צהובה'],
 ['yoni','Curly','מתולתל'],
];
export const characterKeys=KID_CHARACTERS.map(([key])=>key);
export const nextCharacter=(profiles={},members=[])=>{const used=new Set([...Object.values(profiles).map(p=>p?.character),...members.filter(m=>m.role==='child').map(m=>profiles[m.id]?.character||(m.id==='noa'?'noa':'itai'))].filter(Boolean));return characterKeys.find(key=>!used.has(key))||characterKeys[0]};

export function CharacterPicker({T,value,onChange,disabled,label}){return <div className="character-picker"><span className="field-label">{label||T('Pixel character','דמות פיקסל')}</span><div className="character-grid" role="radiogroup" aria-label={label||T('Pixel character','דמות פיקסל')}>{KID_CHARACTERS.map(([key,en,he])=><button type="button" role="radio" key={key} disabled={disabled} aria-checked={value===key} aria-label={T(en,he)} title={T(en,he)} className="character-option" onClick={()=>onChange(key)}><img src={'/assets/generated/avatar-'+key+'-bust.png'} alt="" width="72" height="72"/>{value===key&&<span className="character-check"><Check size={14} weight="bold"/></span>}</button>)}</div></div>}

export function PhotoChoice({T,onPick,disabled,photo}){return <label className={'photo-choice'+(disabled?' disabled':'')}><Camera size={20}/><span>{photo?T('Change photo','החלפת תמונה'):T('Upload a photo','העלאת תמונה')}</span><input type="file" disabled={disabled} accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await onPick(file)}}/></label>}

export function BirthdayFields({T,birthday,inCalendar,onChange,disabled,today}){const age=ageOn(birthday,today);return <div className="birthday-fields"><label>{T('Birthday','יום הולדת')}<span className="birthday-input"><Cake size={20}/><input type="date" disabled={disabled} value={birthday||''} max={today} onChange={e=>onChange({birthday:e.target.value})}/></span>{age!==null&&<small>{T('Age '+age,'גיל '+age)}</small>}</label>{birthday&&<label className="birthday-calendar-toggle"><input type="checkbox" disabled={disabled} checked={inCalendar!==false} onChange={e=>onChange({birthdayInCalendar:e.target.checked})}/><span>{T('Add to the family calendar every year','להוסיף ללוח השנה המשפחתי בכל שנה')}</span></label>}</div>}
