import {useRef,useState,useEffect} from 'react';

// Keep the editor and its draft until the authoritative write is accepted.
export function useConfirmedSave(a){
 const lock=useRef(false),mounted=useRef(true),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const commit=async(write,accepted)=>{
  if(lock.current)return false;
  lock.current=true;setSaving(true);setSaveError('');
  const trigger=document.activeElement,surface=trigger?.closest('form,[role="dialog"],.form-stack'),wasInert=surface?.inert;if(surface)surface.inert=true;
  try{const result=await write();if(result===false)throw Error('Change was not accepted');if(mounted.current)accepted?.();return true}
  catch(error){
   // Offline: the change is kept on this device and marked “Waiting to sync”; it is sent when the connection returns.
   if(error?.queued){if(mounted.current)accepted?.();return true}
   if(mounted.current)setSaveError(a.T('Not saved. What you entered is still here. Try again.','לא נשמר. מה שכתבת עדיין כאן. אפשר לנסות שוב.'))/* "draft" (טיוטה) confused the owner, 2026-11-12 */;return false}
  finally{if(surface)surface.inert=wasInert;lock.current=false;if(mounted.current){setSaving(false);requestAnimationFrame(()=>{if(trigger?.isConnected&&surface?.isConnected&&!surface.inert)trigger.focus({preventScroll:true})})}}
 };
 return {saving,saveError,commit};
}
