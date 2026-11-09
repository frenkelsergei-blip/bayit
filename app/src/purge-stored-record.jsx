import React,{useState} from 'react';
import {Trash} from '@phosphor-icons/react';
import {deleteLocalFile} from './file-store';
// A separate permanent action: ordinary deletion keeps its existing Restore/Undo behavior.
export function PurgeStoredRecord({a,record,onRemove,Button}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const purge=async()=>{setBusy(true);setError('');let removed=false;try{const sharedFile=record.fileId&&a.data.documents?.some(d=>d.id!==record.id&&d.fileId===record.fileId);const accepted=await onRemove();if(accepted===false)throw Error(a.T('Not removed. Try again.','לא נמחק. נסו שוב.'));removed=true;if(record.fileId&&!sharedFile)await deleteLocalFile(record.fileId);a.notify(a.T('Permanently removed.','נמחק לצמיתות.'))}catch(e){const message=removed?a.T('The record was removed. Attachment cleanup will retry on the server.','הרישום נמחק. השרת ינסה שוב להשלים את מחיקת הקובץ.'):e.message||a.T('Could not remove this item.','לא ניתן למחוק את הפריט.');setError(message);a.notify(message)}finally{setBusy(false)}};
 return <span className="purge-stored-record">{confirm?<span className="form-stack" role="alert"><span>{a.T('Permanently delete this item and its unused attachment? It cannot be restored.','למחוק לצמיתות את הפריט ואת הקובץ שאינו בשימוש? לא ניתן יהיה לשחזר אותם.')}</span><span className="actions"><Button quiet icon={Trash} disabled={busy} onClick={purge}>{a.T('Delete permanently','מחיקה לצמיתות')}</Button><Button secondary disabled={busy} onClick={()=>setConfirm(false)}>{a.T('Cancel','ביטול')}</Button></span></span>:<Button quiet icon={Trash} onClick={()=>setConfirm(true)}>{a.T('Delete permanently','מחיקה לצמיתות')}</Button>}{error&&<span role="alert">{error}</span>}</span>;
}
