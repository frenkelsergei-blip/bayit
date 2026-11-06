import {json,fail} from './util.mjs';
import {uploadSlot} from './leases.mjs';
import {canSee} from '../src/data.js';
import {uploadType} from '../../shared/safe-media.mjs';
const LIMIT=100*1024*1024,MAX=10*1024*1024;
async function readUpload(request){
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a file.');let size=0;const parts=[];
 let expired=false;const timer=setTimeout(()=>{expired=true;reader.cancel().catch(()=>{})},30000);
 try{for(;;){const {done,value}=await reader.read();if(expired)throw fail('The upload took too long. Try again.',408);if(done)break;size+=value.length;if(size>MAX){await reader.cancel();throw fail('Choose a file under 10 MB.',413)}parts.push(value)}}finally{clearTimeout(timer);reader.releaseLock()}
 if(!size)throw fail('Choose a nonempty file.');const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
export async function releaseReservation(env,id){await env.DB.batch([env.DB.prepare('UPDATE file_quotas SET reserved_bytes=MAX(0,reserved_bytes-COALESCE((SELECT size FROM file_reservations WHERE id=?),0)) WHERE household_id=(SELECT household_id FROM file_reservations WHERE id=?)').bind(id,id),env.DB.prepare('DELETE FROM file_reservations WHERE id=?').bind(id)])}
const referenced="EXISTS(SELECT 1 FROM household_data hd,json_each(hd.state,'$.documents') d WHERE hd.household_id=files.household_id AND json_extract(d.value,'$.fileId')=files.id)";
export async function removeFile(env,row){
 await env.FILES.delete(row.object_key);
 await env.DB.batch([env.DB.prepare('UPDATE file_quotas SET used_bytes=MAX(0,used_bytes-COALESCE((SELECT size FROM files WHERE id=? AND deleting_at IS NOT NULL),0)) WHERE household_id=?').bind(row.id,row.household_id),env.DB.prepare('DELETE FROM files WHERE id=? AND household_id=? AND deleting_at IS NOT NULL').bind(row.id,row.household_id)]);
}
export async function handleFiles(request,env,home,id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw fail('Invalid file identifier.');if(!env.FILES)throw fail('File storage is not configured.',503);
 const actor=home.membership.member_id,existing=await env.DB.prepare('SELECT * FROM files WHERE id=? AND household_id=?').bind(id,home.id).first();
 if(request.method==='GET'){
  const attached=home.state.documents.some(d=>d.fileId===id&&!d.deletedAt&&canSee(d,actor));
  if(!existing||existing.deleting_at||existing.owner_id!==actor&&!attached)throw fail('This file is unavailable.',404);
  const object=await env.FILES.get(existing.object_key);if(!object)throw fail('This file is unavailable.',404);
  const filename=existing.filename.replace(/["\\\r\n]/g,'');return new Response(object.body,{headers:{'Content-Type':existing.mime,'Content-Disposition':"attachment; filename=\""+filename.replace(/[^\x20-\x7e]/g,'_')+"\"; filename*=UTF-8''"+encodeURIComponent(filename),"Content-Security-Policy":"sandbox; default-src 'none'",'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='DELETE'){
  if(!existing||existing.owner_id!==actor)throw fail('This file is unavailable.',404);
  if(!existing.deleting_at){const marked=await env.DB.prepare('UPDATE files SET deleting_at=? WHERE id=? AND household_id=? AND owner_id=? AND NOT '+referenced).bind(Date.now(),id,home.id,actor).run();if(!marked.meta.changes)throw fail('Remove the document from the trash before deleting its attachment.',409)}
  await removeFile(env,existing);return json({ok:true});
 }
 if(request.method!=='PUT')throw fail('Method not allowed.',405);if(existing)throw fail('This file already exists. Upload a new version.',409);
 const release=await uploadSlot(env);if(!release)throw fail('The attachment service is busy. Try again shortly.',429);
 try{const bytes=await readUpload(request);let mime;try{mime=uploadType(bytes,request.headers.get('Content-Type')||'application/octet-stream')}catch(e){throw fail(e.message)}
 let filename;try{filename=decodeURIComponent(request.headers.get('X-File-Name')||'document')}catch{throw fail('Choose a valid filename.')}filename=filename.replace(/[\x00-\x1f\x7f"\\]/g,'').slice(0,200)||'document';
 const reservation=crypto.randomUUID(),size=bytes.length,key=home.id+'/'+id+'/'+reservation;
 const reserved=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO file_quotas(household_id,used_bytes) SELECT ?,COALESCE(SUM(size),0) FROM files WHERE household_id=?').bind(home.id,home.id),
  env.DB.prepare('INSERT OR IGNORE INTO file_reservations(id,household_id,file_id,size,created_at) SELECT ?,?,?,?,? FROM file_quotas WHERE household_id=? AND used_bytes+reserved_bytes+?<=? AND NOT EXISTS(SELECT 1 FROM files WHERE id=?)').bind(reservation,home.id,id,size,Date.now(),home.id,size,LIMIT,id),
  env.DB.prepare('UPDATE file_quotas SET reserved_bytes=reserved_bytes+? WHERE household_id=? AND EXISTS(SELECT 1 FROM file_reservations WHERE id=?)').bind(size,home.id,reservation)
 ]);if(!reserved[1].meta.changes)throw fail('This file is already uploading or the household has reached its 100 MB attachment limit.',413);
 try{
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
  const saved=await env.DB.batch([
   env.DB.prepare('INSERT INTO files(id,household_id,owner_id,object_key,filename,mime,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM file_reservations WHERE id=?)').bind(id,home.id,actor,key,filename,mime,size,new Date().toISOString(),reservation),
   env.DB.prepare('UPDATE file_quotas SET used_bytes=used_bytes+?,reserved_bytes=MAX(0,reserved_bytes-?) WHERE household_id=? AND EXISTS(SELECT 1 FROM file_reservations WHERE id=?)').bind(size,size,home.id,reservation),
   env.DB.prepare('DELETE FROM file_reservations WHERE id=?').bind(reservation)
  ]);if(!saved[0].meta.changes)throw fail('The upload expired. Try uploading again.',409);return json({id,size,mime},201);
 }catch(e){await env.FILES.delete(key).catch(()=>{});await releaseReservation(env,reservation);throw e}
 }finally{await release()}
}
export async function maintainFiles(env,now=Date.now()){
 if(!env.FILES)return;
 const reservations=(await env.DB.prepare('SELECT * FROM file_reservations WHERE created_at<? LIMIT 50').bind(now-15*60000).all()).results;for(const r of reservations){await env.FILES.delete(r.household_id+'/'+r.file_id+'/'+r.id);await releaseReservation(env,r.id);}
 // Pending physical deletion is retryable after a crash. Unattached uploads are kept for a full day.
 await env.DB.prepare('UPDATE files SET deleting_at=? WHERE deleting_at IS NULL AND created_at<? AND NOT '+referenced).bind(now,new Date(now-86400000).toISOString()).run();
 const tombstones=(await env.DB.prepare('SELECT * FROM files WHERE deleting_at IS NOT NULL LIMIT 50').all()).results;for(const row of tombstones)await removeFile(env,row);
}
