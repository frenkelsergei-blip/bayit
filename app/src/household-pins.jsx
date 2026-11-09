import React from 'react';
import {PushPin} from '@phosphor-icons/react';
import {pinKey} from '../../shared/household-pins.mjs';
import {useConfirmedSave} from './confirmed-save';
export function PinToToday({a,collection,record,compact=false}){
 const pins=a.data.profiles[a.user]?.pinnedRecords||[],pin={collection,id:record.id},chosen=pins.some(p=>pinKey(p)===pinKey(pin)),{saving,saveError,commit}=useConfirmedSave(a);
 const toggle=()=>commit(()=>a.update(d=>{const profile=d.profiles[a.user];profile.pinnedRecords=chosen?(profile.pinnedRecords||[]).filter(p=>pinKey(p)!==pinKey(pin)):[...(profile.pinnedRecords||[]),pin];if(!chosen){const settings=d.preferences.todayByUser?.[a.user]||{},order=Array.isArray(settings.order)?settings.order:['priorities','agenda','tasks',...(a.cloud&&a.member(a.user).role!=='child'?['money','bills']:[]),'ai'];d.preferences.todayByUser={...d.preferences.todayByUser,[a.user]:{...settings,priorityOffered:true,order:order.includes('pins')?order:[...order,'pins']}}}}));
 return <span className="household-pin-control"><button type="button" className={compact?'icon-button':'control-button'} disabled={saving} aria-pressed={chosen} aria-label={a.T(chosen?'Unpin from Today: ':'Pin to Today: ',chosen?'ביטול נעיצה ביום שלי: ':'נעיצה ביום שלי: ')+a.text(record)} onClick={toggle}><PushPin size={20} weight={chosen?'fill':'regular'}/>{!compact&&(chosen?a.T('Pinned to Today','נעוץ ביום שלי'):a.T('Pin to Today','נעיצה ביום שלי'))}</button>{saveError&&<small role="alert" className="save-error">{saveError}</small>}</span>;
}
