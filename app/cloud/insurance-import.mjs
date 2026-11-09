// Telegram staging keeps the original as an unattached private file until confirmation.
// Only parsed insurance fields enter policies; the original remains a separate private document.
import {readInsuranceWorkbook} from '../src/insurance-workbook.mjs';
import {reportRows,insuranceReportDate,insuranceSubjectCount,insuranceSummary,mergeInsuranceImport} from '../../shared/insurance.mjs';
import {encryptKey,decryptKey,random,fail} from './util.mjs';
import {handleFiles} from './files.mjs';
import {insuranceSourceDocument,sourceFingerprint} from '../../shared/insurance-sources.mjs';

const aad=(home,actor,id)=>'insurance-preview:'+home+':'+actor+':'+id;
const adult=(home,actor)=>{const member=home.state.members.find(m=>m.id===actor);if(!member||member.role==='child')throw fail('Insurance import is available to linked adult accounts.',403);};
export function prepareInsuranceReport(bytes,filename){
 const buffer=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),tables=readInsuranceWorkbook(buffer,filename);
 if(insuranceSubjectCount(tables)>1)throw fail('This report contains several insured people. Review and assign each row in the app.',400);
 const reportDate=insuranceReportDate(tables),parsed=tables.map(t=>reportRows(t,{reportDate})),rows=parsed.flatMap(x=>x.policies);
 if(!rows.length||rows.length>200||parsed.some(x=>x.issues.length)||tables.some(t=>t.unsafePolicyRows?.length))throw fail('The complete report could not be recognized. Review it in the app; nothing was imported.',400);
 return {rows,reportDate,sourceFile:String(filename||'report.xlsx').slice(0,250)};
}
export async function stageInsuranceReport(env,home,actor,bytes,filename){
 adult(home,actor);const report=prepareInsuranceReport(bytes,filename),id='insurance-'+random(12),document=insuranceSourceDocument({fileId:crypto.randomUUID(),filename:report.sourceFile,size:bytes.byteLength,ownerId:actor,channel:'telegram',sha256:await sourceFingerprint(bytes)}),fileHome={...home,membership:{member_id:actor}};
 await handleFiles(new Request('https://bayit.invalid/api/files/'+document.fileId,{method:'PUT',headers:{'Content-Type':document.mime,'X-File-Name':encodeURIComponent(document.filename)},body:bytes}),env,fileHome,document.fileId);
 try{const payload=await encryptKey(JSON.stringify({...report,document}),env,aad(home.id,actor,id));
 await env.DB.prepare('INSERT INTO telegram_actions(id,household_id,member_id,payload,expires_at) VALUES(?,?,?,?,?)').bind(id,home.id,actor,JSON.stringify({type:'insurance_preview',ciphertext:payload}),Date.now()+86400000).run();
 }catch(error){await handleFiles(new Request('https://bayit.invalid/api/files/'+document.fileId,{method:'DELETE'}),env,fileHome,document.fileId).catch(()=>{});throw error;}
 return {id,...insurancePreviewSummary(report)};
}
export function insurancePreviewSummary(report){
 const summary=insuranceSummary(report.rows,[],{today:report.reportDate||new Date().toISOString().slice(0,10),month:(report.reportDate||new Date().toISOString()).slice(0,7)});
 return {rows:report.rows.length,policyNumbers:summary.policyNumbers,reportDate:report.reportDate,numericIdentifiers:report.rows.some(p=>p.policyNumberFormat==='numeric'),unknownPremiums:summary.unknownPremiums,estimatedMonthly:summary.estimatedMonthly};
}
export async function readInsurancePreview(env,home,actor,id){
 adult(home,actor);const row=await env.DB.prepare('SELECT * FROM telegram_actions WHERE id=? AND household_id=? AND member_id=?').bind(id,home.id,actor).first();
 if(!row||row.used_at||row.expires_at<=Date.now())throw fail('This report preview was used or expired. Send the file again.',409);
 let envelope;try{envelope=JSON.parse(row.payload)}catch{}
 if(envelope?.type!=='insurance_preview')throw fail('This report preview is unavailable.',404);
 return JSON.parse(await decryptKey(envelope.ciphertext,env,aad(home.id,actor,id)));
}
export async function discardInsurancePreview(env,home,actor,id){
 adult(home,actor);const row=await env.DB.prepare('SELECT * FROM telegram_actions WHERE id=? AND household_id=? AND member_id=? AND used_at IS NULL').bind(id,home.id,actor).first();
 if(!row)return;const envelope=JSON.parse(row.payload);let fileId;
 if(envelope.type==='insurance_preview')fileId=JSON.parse(await decryptKey(envelope.ciphertext,env,aad(home.id,actor,id))).document?.fileId;
 const deleted=await env.DB.prepare('DELETE FROM telegram_actions WHERE id=? AND household_id=? AND member_id=? AND used_at IS NULL').bind(id,home.id,actor).run();
 if(deleted.meta.changes&&fileId)await handleFiles(new Request('https://bayit.invalid/api/files/'+fileId,{method:'DELETE'}),env,{...home,membership:{member_id:actor}},fileId).catch(()=>{});
}
export async function applyInsurancePreview(env,home,actor,id,subjectId,commit){
 const report=await readInsurancePreview(env,home,actor,id);
 const original=report.document?.fileId&&await env.DB.prepare('SELECT id FROM files WHERE id=? AND household_id=? AND owner_id=? AND deleting_at IS NULL').bind(report.document.fileId,home.id,actor).first();
 if(!original)throw fail('The original report is unavailable. Send the file again before confirming.',409);
 const claimed=await env.DB.prepare('UPDATE telegram_actions SET used_at=? WHERE id=? AND household_id=? AND member_id=? AND used_at IS NULL AND expires_at>?').bind(Date.now(),id,home.id,actor,Date.now()).run();
 if(!claimed.meta.changes)throw fail('This report has already been confirmed.',409);
 try{
  const outcome=await commit((data,role)=>{
   if(role==='child')throw fail('Insurance import is available to adults.',403);
   const subject=data.members.find(m=>m.id===subjectId);if(!subject)throw fail('Choose an insured household member.',400);
   const name=data.profiles?.[subjectId]?.name||subject.name||subject.he,rows=report.rows.map(p=>({...p,insuredName:p.insuredName||name,memberIds:p.insuredName&&p.insuredName!==name?[]:[subjectId]}));
   if(!name)throw fail('Choose a named insured household member.',400);
   const document={...report.document,memberIds:[subjectId]};data.documents??=[];if(!data.documents.some(d=>d.id===document.id))data.documents.push(document);
   const merged=mergeInsuranceImport(data.insurances||[],rows,{actorId:actor,visibility:'private',sourceFile:report.sourceFile,sourceDocumentId:document.id});data.insurances=merged.policies;
   return {added:merged.added,updated:merged.updated,rows:rows.length,subjectId,sourceDocumentId:document.id};
  });
  // Keep a consumed marker for idempotency, erase the sensitive staged content immediately.
  await env.DB.prepare('UPDATE telegram_actions SET payload=? WHERE id=? AND household_id=? AND member_id=?').bind(JSON.stringify({type:'insurance_consumed'}),id,home.id,actor).run().catch(()=>{});
  return outcome;
 }catch(e){await env.DB.prepare('UPDATE telegram_actions SET used_at=NULL WHERE id=? AND household_id=? AND member_id=?').bind(id,home.id,actor).run();throw e;}
}
