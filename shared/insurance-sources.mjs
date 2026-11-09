import {DOCUMENT_CATEGORIES} from './document-categories.mjs';
export function insuranceReportMime(filename){
 const ext=String(filename).split('.').at(-1)?.toLowerCase();
 return {xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',csv:'text/csv',tsv:'text/tab-separated-values'}[ext]||'application/octet-stream';
}
export async function sourceFingerprint(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function insuranceSourceDocument({id=crypto.randomUUID(),fileId,filename,size,ownerId,memberIds=[],channel='web',sha256,now=new Date().toISOString()}){
 return {id,fileId,filename,title:filename,he:filename,mime:insuranceReportMime(filename),size,ownerId,...(memberIds.length?{memberIds:[...new Set(memberIds)]}:{}),visibility:'private',allowedIds:[],category:'Insurance',categories:[DOCUMENT_CATEGORIES.find(c=>c.id==='Insurance')],sourceKind:'insurance-report',importChannel:channel,importedAt:now,date:now.slice(0,10),sourceSha256:sha256,description:'Original Har HaBituach report. This source report is not a full policy document.'};
}
export function isInsuranceSourceDocument(document){return document?.sourceKind==='insurance-report'||!!document?.description?.startsWith('Original Har HaBituach report.')}
export function insuranceSourceDocuments(policy,documents){
 return documents.filter(d=>!d.deletedAt&&(policy.sourceDocumentIds?.includes(d.id)||d.ownerId===policy.ownerId&&d.filename===policy.sourceFile&&(/\.(xlsx|xls|csv|tsv)$/i.test(d.filename||''))&&isInsuranceSourceDocument(d)));
}
