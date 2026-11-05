// Slim menu: collapse the wide sidebar to the icon rail (labels become hover tooltips). The toggle is the last
// row of the menu, styled like My profile / Settings. Remembered per device; index.html applies the saved choice
// before first paint so there is no jump.
import React,{useEffect,useState} from 'react';
import {SidebarSimple} from '@phosphor-icons/react';
// Touch tablets (iPad landscape) default to the slim menu so content gets the width; a saved choice always wins.
export const defaultSlim=()=>window.matchMedia?.('(pointer:coarse) and (min-width:1101px) and (max-width:1366px)').matches||false;
const read=()=>{try{const v=localStorage.getItem('bayit-menu');return v?v==='slim':defaultSlim()}catch{return defaultSlim()}};
export function SidebarToggle({T}){
 const [slim,setSlim]=useState(read);
 useEffect(()=>{document.documentElement.dataset.menu=slim?'slim':'full'},[slim]);
 const label=slim?T('Expand menu','הרחבת התפריט'):T('Collapse menu','כיווץ התפריט');
 return <button type="button" className="sidebar-toggle" aria-pressed={slim} aria-label={label} title={label} onClick={()=>{const next=!slim;setSlim(next);try{localStorage.setItem('bayit-menu',next?'slim':'full')}catch{}}}><SidebarSimple size={27}/><span>{label}</span></button>;
}
