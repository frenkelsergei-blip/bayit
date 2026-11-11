// Settings › Accounts & connections › Storage: data kept from removed extensions (feature modules).
// User's choices, 2026-11-10: removing an extension keeps what the family saved, hidden; a parent can download a copy
// and then delete it on purpose (Settings concept A), and the delete step says plainly that it also deletes records
// other people kept privately in it, with how many people (a count only, no names; option 1).
// Parents only, cloud only. Existing markup and classes only (connection-storage-items rows, buttons, form-stack).
import React,{useEffect,useState,useCallback} from 'react';
import {PuzzlePiece,DownloadSimple,Trash} from '@phosphor-icons/react';
import {request} from './household-sync';

// The extension's own name in the person's language, kept with its data; the id only when no name was ever saved.
const nameOf=(k,lang)=>k.name?.[lang==='he'?'he':'en']||k.name?.en||k.id;

export function KeptExtensionData({a}){
 const home=a.cloud?.householdId,parent=a.member(a.user)?.role==='parent';
 const [kept,setKept]=useState([]),[downloaded,setDownloaded]=useState({}),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const base='/api/households/'+encodeURIComponent(home||'')+'/extensions';
 const load=useCallback(()=>{if(!home||!parent)return;request(base).then(r=>setKept((r.kept||[]).filter(k=>!k.installed))).catch(()=>setKept([]))},[home,parent,base]);
 useEffect(()=>{load()},[load]);
 if(!home||!parent||!kept.length)return null;
 const download=async id=>{setBusy(id);setError('');try{const copy=await request(base+'/'+id+'/export');const url=URL.createObjectURL(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='bayit-extension-'+id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloaded(d=>({...d,[id]:true}))}catch(e){setError(e.message)}finally{setBusy('')}};
 const remove=async id=>{setBusy(id);setError('');try{await request(base+'/'+id+'/delete',{confirm:id,baseRevision:a.cloud.client.revision});await a.cloud.client.latest?.();setConfirm('');a.notify(a.T('Deleted. It cannot be restored.','נמחק. לא ניתן לשחזר.'));load()}catch(e){setError(e.code==='REAUTH_REQUIRED'?a.T('Sign in with Google again, then delete.','היכנסו שוב עם Google, ואז מחקו.'):e.message)}finally{setBusy('')}};
 return <div className="connection-storage-items kept-extension-data">{kept.map(k=><div key={k.id}><PuzzlePiece size={26}/><section>
  <strong>{a.T('Kept from a removed extension','נשמר מהרחבה שהוסרה')} · <bdi>{nameOf(k,a.lang)}</bdi></strong>
  <p>{a.T('Hidden from everyone. Installing the extension again brings it all back. Download a copy before you delete it.','מוסתר מכולם. התקנה מחדש של ההרחבה תחזיר הכול. הורידו עותק לפני שמוחקים.')}</p>
  {confirm===k.id?<span className="form-stack" role="alert">
   <span>{a.T('Permanently delete everything saved in this extension? It cannot be restored.','למחוק לצמיתות את כל מה שנשמר בהרחבה הזו? לא ניתן יהיה לשחזר.')}</span>
   {k.privateOthers>0&&<span>{k.privateOthers===1?a.T('This also deletes records that 1 other person kept privately in it. You cannot see or download them.','זה ימחק גם רישומים שאדם אחד נוסף שמר בה באופן פרטי. אינכם יכולים לראות או להוריד אותם.'):a.T('This also deletes records that '+k.privateOthers+' other people kept privately in it. You cannot see or download them.','זה ימחק גם רישומים ש־'+k.privateOthers+' אנשים נוספים שמרו בה באופן פרטי. אינכם יכולים לראות או להוריד אותם.')}</span>}
   <span className="actions"><button type="button" className="button quiet danger" disabled={!!busy} onClick={()=>remove(k.id)}><Trash size={20}/> {a.T('Delete permanently','מחיקה לצמיתות')}</button><button type="button" className="button secondary" disabled={!!busy} onClick={()=>setConfirm('')}>{a.T('Cancel','ביטול')}</button></span>
  </span>:<span className="actions">
   <button type="button" className="button secondary" disabled={!!busy} onClick={()=>download(k.id)}><DownloadSimple size={20}/> {a.T('Download copy','הורדת עותק')}</button>
   <button type="button" className="button quiet danger" disabled={!!busy||!downloaded[k.id]} title={downloaded[k.id]?'':a.T('Download a copy first','הורידו עותק קודם')} onClick={()=>setConfirm(k.id)}><Trash size={20}/> {a.T('Delete…','מחיקה…')}</button>
  </span>}
 </section></div>)}{error&&<p role="alert">{error}</p>}</div>;
}
