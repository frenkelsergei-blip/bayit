import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {cloudHeaders} from './cloud-transport';

export async function mapsRequest(path,body,signal){
 const response=await fetch('/api/maps/'+path,{method:body===undefined?'GET':'POST',headers:{...cloudHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});
 let result;try{result=await response.json()}catch{throw Error('MAPS_UNAVAILABLE')}
 if(!response.ok)throw Object.assign(Error(result.error||'MAPS_UNAVAILABLE'),{code:result.code,status:response.status});return result;
}
export function mapsError(a,error){
 if(error?.code==='MAPS_SETUP_PENDING')return a.T('Maps is waiting for an installation update. You can still write a place name.','חיבור המפות ממתין לעדכון ההתקנה. עדיין אפשר לכתוב שם מקום.');
 if(error?.code==='MAPS_QUOTA'||error?.code==='MAPS_RATE')return a.T('The search limit was reached. Try again later or keep a manual location.','הגענו למגבלת החיפוש. אפשר לנסות בהמשך או לכתוב מיקום ידני.');
 if(error?.code==='MAPS_NOT_CONFIGURED')return a.T('Maps is not connected. You can still write a place name.','המפות אינן מחוברות. עדיין אפשר לכתוב שם מקום.');
 if(error?.code==='MAPS_KEYS')return a.T('Enter two different keys: a server key for Places and a website-restricted key for Embed.','הזינו שני מפתחות שונים: מפתח שרת ל־Places ומפתח מוגבל לאתר ל־Embed.');
 if(error?.code==='MAPS_ENCRYPTION')return a.T('Set up credential encryption on this household server first.','צריך להגדיר קודם הצפנת מפתחות בשרת הבית.');
 if(error?.code==='MAPS_REJECTED')return a.T('Google rejected the request. Check that the APIs and key restrictions match the setup instructions.','Google דחתה את הבקשה. בדקו שהשירותים והגבלות המפתחות תואמים להוראות החיבור.');
 return a.T('Maps could not be reached. Your place name is still here; you can retry.','לא הצלחנו להגיע למפות. שם המקום נשאר כאן ואפשר לנסות שוב.');
}
const empty={configured:false,available:false,canManage:false},Context=createContext({status:empty,refresh:()=>{},getPlace:()=>Promise.reject(Error('MAPS_NOT_CONFIGURED'))});
export function MapsProvider({a,children}){
 const [status,setStatus]=useState(a.cloud?null:empty),cache=useRef(new Map()),pending=useRef(new Map()),generation=useRef(0);
 const home=(a.cloud?.householdId||a.data.householdId||'')+':'+a.user;
 const refresh=useCallback(async()=>{if(!a.cloud){setStatus(empty);return}const epoch=generation.current;try{const next=await mapsRequest('status');if(epoch===generation.current){setStatus(next);if(!next.configured)cache.current.clear()}}catch(e){if(epoch===generation.current)setStatus({...empty,failed:true,setupPending:e.code==='MAPS_SETUP_PENDING',storageReady:e.code==='MAPS_SETUP_PENDING'?false:undefined})}},[!!a.cloud,home]);
 useEffect(()=>{generation.current++;cache.current.clear();pending.current.clear();refresh();window.addEventListener('focus',refresh);window.addEventListener('bayit-maps-changed',refresh);return()=>{generation.current++;window.removeEventListener('focus',refresh);window.removeEventListener('bayit-maps-changed',refresh)}},[refresh]);
 const getPlace=useCallback(async(placeId,sessionToken,record)=>{
  const key=[a.lang,placeId,record?.collection||'',record?.id||''].join('|');
  // Ephemeral provider data only: no localStorage, IndexedDB or household state caching.
  const cached=cache.current.get(key);if(!sessionToken&&cached&&cached.expires>Date.now())return cached.value;
  const pendingKey=key+'|'+(sessionToken||'lookup');if(pending.current.has(pendingKey))return pending.current.get(pendingKey);
  const epoch=generation.current,work=mapsRequest('place',{placeId,language:a.lang,...(sessionToken?{sessionToken}:{}),...(record?{collection:record.collection,recordId:record.id}:{})}).then(value=>{if(epoch===generation.current)cache.current.set(key,{value,expires:Date.now()+5*60000});return value}).finally(()=>{if(pending.current.get(pendingKey)===work)pending.current.delete(pendingKey)});
  pending.current.set(pendingKey,work);return work;
 },[a.lang,home]);
 const value=useMemo(()=>({status,refresh,getPlace}),[status,refresh,getPlace]);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useMaps=()=>useContext(Context);
export function usePlace(a,location,record){
 const maps=useMaps(),[detail,setDetail]=useState(null),[error,setError]=useState(''),id=location?.placeId;
 useEffect(()=>{let active=true;setDetail(null);setError('');if(id&&maps.status?.configured)maps.getPlace(id,undefined,record).then(result=>{if(active)setDetail(result)},e=>{if(active)setError(mapsError(a,e))});return()=>{active=false}},[id,a.lang,record?.id,record?.collection,maps.status?.configured,maps.getPlace]);
 return {detail,error};
}
