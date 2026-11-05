// Slim menu: collapse the wide sidebar to the icon rail (labels become hover tooltips). The toggle is the last
// row of the menu, styled like My profile / Settings. Remembered per device; index.html applies the saved choice
// before first paint so there is no jump.
import React,{useEffect,useState} from 'react';
import {SidebarSimple} from '@phosphor-icons/react';
const read=()=>{try{return localStorage.getItem('bayit-menu')==='slim'}catch{return false}};
export function SidebarToggle({T}){
 const [slim,setSlim]=useState(read);
 useEffect(()=>{document.documentElement.dataset.menu=slim?'slim':'full';try{localStorage.setItem('bayit-menu',slim?'slim':'full')}catch{}},[slim]);
 const label=slim?T('Expand menu','הרחבת התפריט'):T('Collapse menu','כיווץ התפריט');
 return <button type="button" className="sidebar-toggle" aria-pressed={slim} aria-label={label} title={label} onClick={()=>setSlim(!slim)}><SidebarSimple size={27}/><span>{label}</span></button>;
}
