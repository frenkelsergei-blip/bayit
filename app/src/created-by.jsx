// "Created by Hila · Nov 4, 18:02" line for task and event details.
import React from 'react';
export const fmtMinutes=(m,a)=>m>=1440?a.T(m/1440+' day'+(m>=2880?'s':''),m>=2880?m/1440+' ימים':'יום'):m>=60?a.T(m/60+' hour'+(m>=120?'s':''),m>=120?m/60+' שעות':'שעה'):a.T(m+' minutes',m+' דקות');
export function CreatedBy({a,record,Avatar}){
 const who=record.createdBy||record.ownerId;if(!who)return null;
 const when=record.createdAt?new Date(record.createdAt).toLocaleString(a.lang==='he'?'he-IL':'en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 return <p className="created-by"><Avatar who={who} size={24}/><span>{who===a.user?<>{a.T('Created by ','נוצר ')}<strong>{a.T('you','על ידך')}</strong></>:<>{a.T('Created by ','נוצר ע״י ')}<strong>{a.name(who)}</strong></>}{when&&<> · <time>{when}</time></>}</span></p>;
}
