// Display density: "comfortable" (the designed cards) or "compact" (thin one-line rows, same data).
// A person chooses the default in Settings › Colors & appearance › Lists; each page can switch with Cards | List.
// The current page's mode is written to <html data-density="…"> (and data-density-page) so page CSS can adapt.
import React from 'react';
import {SquaresFour,Rows} from '@phosphor-icons/react';

const prefsOf=(data,user)=>data?.preferences?.appearanceByUser?.[user]||{};
export const densityPageOf=route=>{const path=String(route||'').split('?')[0].split('/');return path[0]==='household'?'household-'+(path[1]||'meals'):path[0]||'today'};
export function densityOf(data,user,page){const p=prefsOf(data,user);const v=p.densityByPage?.[page]||p.density;return v==='compact'?'compact':'comfortable'}
export function setPageDensity(a,page,mode){a.update(d=>{const all=d.preferences.appearanceByUser={...d.preferences.appearanceByUser},mine=all[a.user]={...all[a.user]};mine.densityByPage={...mine.densityByPage,[page]:mode}})}
export function setDefaultDensity(a,mode){a.update(d=>{const all=d.preferences.appearanceByUser={...d.preferences.appearanceByUser};all[a.user]={...all[a.user],density:mode,densityByPage:{}}})}

// Small "Cards | List" switch for a page header or toolbar.
export function DensityToggle({a,page,className='',central=false}){
 if(!central&&page!=='notifications')return null;
 const mode=densityOf(a.data,a.user,page);
 return <div className={'density-toggle '+className} role="group" aria-label={a.T('List style','סגנון תצוגה')}>
  {[['comfortable',SquaresFour,a.T('Cards','כרטיסים')],['compact',Rows,a.T('List','רשימה')]].map(([id,Icon,label])=><button type="button" key={id} aria-pressed={mode===id} className={mode===id?'on':''} title={label} aria-label={label} onClick={()=>mode!==id&&setPageDensity(a,page,id)}><Icon size={18} weight={mode===id?'bold':'regular'}/><span>{label}</span></button>)}
 </div>;
}

// Settings › Colors & appearance › Lists
export function DensitySetting({a,Tabs}){
 const p=prefsOf(a.data,a.user),value=p.density==='compact'?'compact':'comfortable';
 return <div className="appearance-block density-setting"><span className="field-label">{a.T('Lists','רשימות')}</span>
  <Tabs value={value} onChange={v=>setDefaultDensity(a,v)} items={[['comfortable',a.T('Cards','כרטיסים'),SquaresFour],['compact',a.T('List','רשימה'),Rows]]}/>
  <p className="settings-hint">{a.T('Compact fits about twice as many rows, with the same details. Each page can still switch with Cards | List; choosing here resets those page choices.','מצומצם מכניס בערך פי שניים שורות, עם אותם פרטים. כל עמוד עדיין יכול לעבור עם כרטיסים | רשימה; בחירה כאן מאפסת את הבחירות של העמודים.')}</p>
 </div>;
}
