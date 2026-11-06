import {useEffect} from 'react';

// Safari can resize the visual viewport while keeping the layout viewport tall.
// Keep the phone save bar and editors inside the space above the keyboard.
export function useViewportInsets(){
 useEffect(()=>{
  const root=document.documentElement,viewport=window.visualViewport;let frame=0;
  const update=()=>{
   const scale=viewport?.scale||1,top=Math.max(0,viewport?.offsetTop||0),height=viewport?.height||innerHeight;
   const inset=Math.abs(scale-1)<.03?Math.max(0,innerHeight-height-top):0,keyboard=inset>120;
   root.dataset.keyboardOpen=String(keyboard);
   root.style.setProperty('--keyboard-inset',(keyboard?inset:0)+'px');
   root.style.setProperty('--visible-view-height',height+'px');
   root.style.setProperty('--visible-view-top',(keyboard?top:0)+'px');
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)};update();
  addEventListener('resize',schedule);viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  return()=>{cancelAnimationFrame(frame);removeEventListener('resize',schedule);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);delete root.dataset.keyboardOpen;for(const key of ['--keyboard-inset','--visible-view-height','--visible-view-top'])root.style.removeProperty(key)};
 },[]);
}
