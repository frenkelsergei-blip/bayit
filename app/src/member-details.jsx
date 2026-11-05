import React,{useState} from 'react';
import {Check,Cake,Camera} from '@phosphor-icons/react';
import {ageOn} from './birthdays.js';
import {CameraButton} from './camera';
import {DateField} from './date-field';
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
// Grown-up characters have no wardrobe outfits.
export const ADULT_CHARACTERS=[
 ['adult-beard','Beard','זקן'],
 ['adult-bun','Top bun','קוקו גבוה'],
 ['adult-glasses','Glasses','משקפיים'],
 ['adult-curls','Red curls','תלתלים אדומים'],
 ['adult-braids','Long braids','צמות ארוכות'],
 ['adult-hoodie','Hoodie','קפוצ׳ון'],
 ['adult-grandma','Grandma','סבתא'],
 ['adult-grandpa','Grandpa','סבא'],
];
export const isAdultCharacter=key=>String(key||'').startsWith('adult-');
export const characterKeys=KID_CHARACTERS.map(([key])=>key);
const adultKeys=ADULT_CHARACTERS.map(([key])=>key);
export const nextCharacter=(profiles={},members=[],group='kids')=>{const used=new Set([...Object.values(profiles).map(p=>p?.character),...members.filter(m=>m.role==='child').map(m=>profiles[m.id]?.character||(m.id==='noa'?'noa':'itai'))].filter(Boolean)),keys=group==='adults'?adultKeys:characterKeys;return keys.find(key=>!used.has(key))||keys[0]};

export function CharacterPicker({T,value,onChange,disabled,label,group='kids'}){const [shown,setShown]=useState(isAdultCharacter(value)?'adults':value&&characterKeys.includes(value)?'kids':group),list=shown==='adults'?ADULT_CHARACTERS:KID_CHARACTERS;return <div className="character-picker"><div className="character-picker-head"><span className="field-label">{label||T('Pixel character','דמות פיקסל')}</span><div className="character-groups" role="tablist" aria-label={T('Character group','קבוצת דמויות')}>{[['adults',T('Grown-ups','מבוגרים')],['kids',T('Kids','ילדים')]].map(([key,text])=><button type="button" role="tab" key={key} aria-selected={shown===key} onClick={()=>setShown(key)}>{text}</button>)}</div></div><div className="character-grid" role="radiogroup" aria-label={label||T('Pixel character','דמות פיקסל')}>{list.map(([key,en,he])=><button type="button" role="radio" key={key} disabled={disabled} aria-checked={value===key} aria-label={T(en,he)} title={T(en,he)} className="character-option" onClick={()=>onChange(key)}><img src={'/assets/generated/avatar-'+key+'-bust.png'} alt="" width="72" height="72"/>{value===key&&<span className="character-check"><Check size={14} weight="bold"/></span>}</button>)}</div></div>}

export function PhotoChoice({T,onPick,disabled,photo,facing='user'}){return <span className="photo-choices"><label className={'photo-choice'+(disabled?' disabled':'')}><Camera size={20}/><span>{photo?T('Change photo','החלפת תמונה'):T('Upload a photo','העלאת תמונה')}</span><input type="file" disabled={disabled} accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await onPick(file)}}/></label><CameraButton className="photo-choice" disabled={disabled} facing={facing} label={T('Take a photo','צילום תמונה')} onFile={onPick}/></span>}

export function BirthdayFields({T,birthday,inCalendar,onChange,disabled,today}){const age=ageOn(birthday,today);return <div className="birthday-fields"><label>{T('Birthday','יום הולדת')}<DateField disabled={disabled} value={birthday||''} max={today} aria-label={T('Birthday','יום הולדת')} placeholder={T('Add a birthday','הוספת יום הולדת')} onChange={e=>onChange({birthday:e.target.value})}/>{age!==null&&<small>{T('Age '+age,'גיל '+age)}</small>}</label>{birthday&&<label className="birthday-calendar-toggle"><input type="checkbox" disabled={disabled} checked={inCalendar!==false} onChange={e=>onChange({birthdayInCalendar:e.target.checked})}/><span>{T('Add to the family calendar every year','להוסיף ללוח השנה המשפחתי בכל שנה')}</span></label>}</div>}
