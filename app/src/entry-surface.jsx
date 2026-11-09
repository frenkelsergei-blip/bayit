import React,{useEffect,useRef,useState} from 'react';
import {BrandMark} from './brand-mark';
import {SketchCanvas} from './loader-sketch';

const stored=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
export function readEntryPreferences(){return {language:stored('bayit-lang','en')==='he'?'he':'en',theme:stored('bayit-theme','light')==='dark'?'dark':'light'}}

function useEntryMotion(){
 const media=useRef(matchMedia('(prefers-reduced-motion:reduce)'));
 const read=()=>media.current.matches||document.documentElement.dataset.motion==='reduced';
 const [reduced,setReduced]=useState(read);
 useEffect(()=>{const update=()=>setReduced(read()),observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});media.current.addEventListener('change',update);return()=>{observer.disconnect();media.current.removeEventListener('change',update)}},[]);
 return reduced;
}

export function EntrySurface({T,language,setLanguage,children,onboarding=false,embedded=false}){
 const preferences=readEntryPreferences(),reduced=useEntryMotion();
 const scene=useRef({id:'horizon',mirror:false,seed:crypto.getRandomValues(new Uint32Array(1))[0],scale:1});
 return <section className={'bayit-entry'+(onboarding?' bayit-entry-onboarding':'')+(embedded?' bayit-entry-embedded':'')}>
  <SketchCanvas scene={scene.current} theme={preferences.theme} reduced={reduced} once/>
  {!embedded&&<header className="bayit-entry-top"><BrandMark/><div className="bayit-entry-language" role="group" aria-label={T('Language','שפה')}>
   <button type="button" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>EN</button>
   <button type="button" aria-pressed={language==='he'} onClick={()=>setLanguage('he')}>עברית</button>
  </div></header>}
  <div className="bayit-entry-content">{children}</div>
 </section>;
}
