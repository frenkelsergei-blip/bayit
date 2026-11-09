import {insurancePolicyKey,monthlyPremium,cleanInsuranceText} from './insurance.mjs';
export const INSURANCE_REVIEW_KINDS=['possible_overlap','status_check','missing_data','premium_check','document_check'];
function reviewTextMask(policies){
 const tokens=[...new Set(policies.flatMap(p=>[p.policyNumber,p.sourcePolicyNumber,p.insuredName]).map(v=>cleanInsuranceText(v).replace(/[^\p{L}\p{N}]/gu,'')).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=tokens.length?new RegExp(tokens.map(value=>[...value].map(escape).join('[^\\p{L}\\p{N}]*')).join('|'),'giu'):null;
 return value=>{const text=cleanInsuranceText(value);return pattern?text.replace(pattern,'[redacted]'):text};
}
export function insuranceReviewContext(policies,{today,language='en',documents=[]}={}){
 const documentIds=new Set(documents.filter(d=>!d.deletedAt).map(d=>d.id)),contracts=new Map(),people=new Map(),mask=reviewTextMask(policies),clip=(s,n)=>cleanInsuranceText(s).slice(0,n),masked=(s,n)=>mask(s).slice(0,n);
 const rows=policies.map(p=>{const contract=p.policyNumber?insurancePolicyKey(p):'record:'+p.id,person=p.memberIds?.length?[...p.memberIds].sort().join('|'):p.insuredName||'unknown';if(!contracts.has(contract))contracts.set(contract,'P'+(contracts.size+1));if(!people.has(person))people.set(person,'I'+(people.size+1));return {id:p.id,contractRef:contracts.get(contract),insuredRef:people.get(person),insuredCount:p.memberIds?.length||Number(!!p.insuredName),insurer:masked(p.insurer,160),coverage:masked(p.title||p.he,240),type:p.type||'other',premiumCents:Number.isSafeInteger(p.premiumCents)?p.premiumCents:null,currency:p.currency||'unknown',premiumPeriod:p.premiumPeriod||'unknown',monthlyEquivalentILSCents:monthlyPremium(p),reportedStatus:p.status||'unknown',startDate:clip(p.startDate,10),endDate:clip(p.endDate,10),reportDate:clip(p.reportDate,10),accessibleDocumentCount:(p.documentIds||[]).filter(id=>documentIds.has(id)).length,importWarnings:(p.importWarnings||[]).map(s=>masked(s,60)).slice(0,8)}});
 return {today,language:language==='he'?'he':'en',amountUnit:'minor currency units (cents/agorot); no currency conversion',actualPaymentsIncluded:false,rows};
}
export function insuranceReviewSchema(ids){return {name:'review_insurance_records',description:'Return cautious, evidence-linked checks for the supplied insurance summaries, with no changes or definitive coverage/duplication decisions.',input_schema:{type:'object',additionalProperties:false,required:['summary','findings'],properties:{summary:{type:'string',maxLength:1500},findings:{type:'array',maxItems:25,items:{type:'object',additionalProperties:false,required:['kind','policyIds','title','explanation'],properties:{kind:{type:'string',enum:INSURANCE_REVIEW_KINDS},policyIds:{type:'array',minItems:1,maxItems:12,items:{type:'string',enum:ids}},title:{type:'string',maxLength:160},explanation:{type:'string',maxLength:1000}}}}}}}}
export function normalizeInsuranceReview(value,ids){
 if(!value||typeof value.summary!=='string'||!Array.isArray(value.findings)||value.findings.length>25)throw Error('AI_REVIEW_INVALID');
 const allowed=new Set(ids),text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>n)throw Error('AI_REVIEW_INVALID');return v.trim()};
 const summary=text(value.summary,1500),findings=value.findings.map(f=>{if(!f||!INSURANCE_REVIEW_KINDS.includes(f.kind)||!Array.isArray(f.policyIds)||!f.policyIds.length||f.policyIds.length>12||f.policyIds.some(id=>typeof id!=='string'||!allowed.has(id)))throw Error('AI_REVIEW_INVALID');return {kind:f.kind,policyIds:[...new Set(f.policyIds)],title:text(f.title,160),explanation:text(f.explanation,1000)}});
 return {summary,findings};
}
