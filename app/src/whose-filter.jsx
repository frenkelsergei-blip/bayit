// Whose tasks/events a list shows (user request 2026-11-11): your own by default, Everyone or another person one tap
// away. The rule is shared/whose-filter.mjs; this file remembers the choice on this device and draws the one-line note
// that says what is hidden and switches back.
import React from 'react';
import {WHOSE_ALL,WHOSE_MINE,rememberedWhose} from '../../shared/whose-filter.mjs';
import './whose-note.css';

// Remembered per page ('tasks', 'calendar') and per person on this device. Only Everyone is stored; mine is the
// default, so a fresh device (or blocked storage) starts at mine.
const KEY='bayit-whose';
export function storedWhose(page,user){
 try{return rememberedWhose((JSON.parse(localStorage.getItem(KEY))||{})[page]?.[user])}catch{return WHOSE_MINE}
}
export function storeWhose(page,user,whose){
 if(whose!==WHOSE_ALL&&whose!==WHOSE_MINE&&whose!==user)return; // another person is a passing view
 try{const all=JSON.parse(localStorage.getItem(KEY))||{},mine=all[page]||{};
  if(whose===WHOSE_ALL)mine[user]=WHOSE_ALL;else delete mine[user];
  all[page]=mine;localStorage.setItem(KEY,JSON.stringify(all))}catch{}
}

// One line under a list's filters. whose: 'mine' | 'all' | member id. others: how many records in the current view
// are not the viewer's (hidden under mine, shown under Everyone). Nothing is drawn when nobody else has any.
export function WhoseNote({a,whose,others,onChange,className=''}){
 const mine=whose===WHOSE_MINE||whose===a.user,all=whose===WHOSE_ALL;
 if((mine||all)&&!(others>0))return null;
 const text=mine?a.T('Only yours · '+others+' more for others','רק שלכם · עוד '+others+' של אחרים'):all?a.T('Everyone’s','של כולם'):a.T('Assigned to ','משויך ל־')+a.name(whose);
 const next=mine?WHOSE_ALL:WHOSE_MINE;
 return <p className={'whose-note '+className} dir="auto"><span>{text}</span><button type="button" className="text-link" onClick={()=>onChange(next)}>{mine?a.T('Show everyone','הצגת כולם'):a.T('Only mine','רק שלי')}</button></p>;
}
