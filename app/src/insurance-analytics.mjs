import {insurancePolicyKey,insuranceIdentity,insuranceTextKey,insurerKey,monthlyPremium,policyStatus,insuranceNeedsReview} from '../../shared/insurance.mjs';
import {policyDocumentReview} from '../../shared/insurance-lifecycle.mjs';

export const insuranceDirection=(value,fallback='ltr')=>{
 const first=String(value||'').match(/[A-Za-z\u0590-\u05ff\u0600-\u06ff]/)?.[0];
 return first?/^[\u0590-\u05ff\u0600-\u06ff]$/.test(first)?'rtl':'ltr':fallback;
};
export const insuranceSubjectKey=p=>p.memberIds?.length?'members:'+Array.from(new Set(p.memberIds)).sort().join(','):p.insuredName?'name:'+insuranceTextKey(p.insuredName):'unknown';
export const insuranceGroupKey=p=>p.policyNumber?insurancePolicyKey(p):'record:'+p.id;
const dateGap=(date,today)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const gap=Math.round((Date.parse(date+'T12:00Z')-Date.parse(today+'T12:00Z'))/86400000);return Number.isFinite(gap)?gap:null};
const eligible=(p,today)=>['active','unknown'].includes(policyStatus(p,today));
const exactKey=p=>[insuranceIdentity(p),[...(p.memberIds||[])].sort().join(','),p.premiumCents,p.premiumPeriod,p.currency,p.startDate,p.endDate,p.status].join('|');

export function insuranceAnalytics(policies,{today,documents=[],relatedPolicies=policies}={}){
 const rows=policies.filter(p=>p&&!p.deletedAt),groups=new Map(),identities=new Map(),numbers=new Set();
 for(const p of rows){
  const key=insuranceGroupKey(p);
  if(!groups.has(key))groups.set(key,{key,rows:[],insurer:p.insurer||'',policyNumber:p.policyNumber||'',subjectKey:insuranceSubjectKey(p),memberIds:[...(p.memberIds||[])],insuredName:p.insuredName||''});
  groups.get(key).rows.push(p);
  const identity=exactKey(p);if(!identities.has(identity))identities.set(identity,[]);identities.get(identity).push(p.id);
  if(p.policyNumber)numbers.add([insurerKey(p.insurer),insuranceTextKey(p.policyNumber)].join('|'));
 }
 const issues=new Map(),types=new Map(),people=new Map(),currencies=new Map();let known=0,total=0,unknown=0,shared=0;
 const addBucket=(map,key,p,amount)=>{if(!map.has(key))map.set(key,{key,rows:[],groupKeys:new Set(),known:0,monthlyCents:0,memberIds:[...(p.memberIds||[])],insuredName:p.insuredName||''});const b=map.get(key);b.rows.push(p);b.groupKeys.add(insuranceGroupKey(p));if(amount!==null){b.known++;b.monthlyCents+=amount}};
 for(const group of groups.values()){
  const linked=Array.from(new Set(relatedPolicies.filter(p=>!p.deletedAt&&insuranceGroupKey(p)===group.key).flatMap(p=>p.documentIds||[])));
  group.documentStatus=policyDocumentReview({...group.rows[0],documentIds:linked},documents,today).status;
  group.monthlyCents=null;group.knownPremiums=0;group.issueCodes=new Set();
  for(const p of group.rows){
   const codes=[],current=eligible(p,today),amount=current?monthlyPremium(p):null,gap=dateGap(p.endDate,today);
   if(insuranceNeedsReview(p))codes.push('missing_data');
   if(current&&(p.memberIds||[]).length>1){codes.push('shared_amount');shared++}
   if(policyStatus(p,today)!=='cancelled'){
    if(gap!==null&&gap<0)codes.push('period_ended');else if(gap!==null&&gap<=30)codes.push('renewal_due');
    if(!p.endDate)codes.push('date_unknown');
    if(group.documentStatus!=='current')codes.push('document_'+group.documentStatus);
   }
   if(identities.get(exactKey(p)).length>1)codes.push('similar_record');
   if(current){if(amount===null)unknown++;else{known++;total+=amount;group.monthlyCents=(group.monthlyCents??0)+amount;group.knownPremiums++}}
   if(p.currency&&p.currency!=='ILS'){
    const key=p.currency+'|'+p.premiumPeriod;if(!currencies.has(key))currencies.set(key,{currency:p.currency,period:p.premiumPeriod,count:0,totalCents:0,known:0});
    const c=currencies.get(key);c.count++;if(Number.isSafeInteger(p.premiumCents)){c.totalCents+=p.premiumCents;c.known++}
   }
   issues.set(p.id,codes);codes.forEach(c=>group.issueCodes.add(c));
   addBucket(types,p.type||'other',p,amount);addBucket(people,insuranceSubjectKey(p),p,amount);
  }
  group.issueCodes=[...group.issueCodes];group.expiry=group.rows.map(p=>p.endDate).filter(Boolean).sort()[0]||'';
 }
 const finish=map=>[...map.values()].map(b=>({...b,count:b.rows.length,groups:b.groupKeys.size,groupKeys:undefined,monthlyCents:b.known?b.monthlyCents:null})).sort((a,b)=>(b.monthlyCents??-1)-(a.monthlyCents??-1)||b.count-a.count||a.key.localeCompare(b.key));
 const groupList=[...groups.values()];
 return {rows,groups:groupList,groupCount:groupList.length,policyNumberCount:numbers.size,coverageCount:rows.length,monthlyCents:known?total:null,knownPremiums:known,excludedPremiums:rows.length-known,sharedPremiumRows:shared,types:finish(types),people:finish(people),currencies:[...currencies.values()],issues,reviewRows:rows.filter(p=>(issues.get(p.id)||[]).length),reviewGroups:groupList.filter(g=>g.issueCodes.length),dueGroups:groupList.filter(g=>g.issueCodes.includes('renewal_due')),pastPeriodGroups:groupList.filter(g=>g.issueCodes.includes('period_ended')),missingDocumentGroups:groupList.filter(g=>g.documentStatus!=='current'&&g.rows.some(p=>policyStatus(p,today)!=='cancelled')),similarRows:rows.filter(p=>issues.get(p.id)?.includes('similar_record'))};
}

export function filterInsuranceRows(policies,{type='all',person='all',subject='',status='all',query='',today,text=p=>p.title||p.he||'',name=id=>id}={}){
 const selected=v=>Array.isArray(v)?v.filter(id=>id&&id!=='all'):v&&v!=='all'?[v]:[],types=selected(type),people=selected(person),statuses=selected(status),q=String(query).normalize('NFKC').trim().toLocaleLowerCase();
 return policies.filter(p=>(!types.length||types.includes(p.type||'other'))&&(!people.length||people.some(id=>p.memberIds?.includes(id)))&&(!subject||insuranceSubjectKey(p)===subject)&&(!statuses.length||statuses.some(id=>id==='current'?['active','unknown','upcoming'].includes(policyStatus(p,today)):policyStatus(p,today)===id))&&(!q||[text(p),p.title,p.he,p.insurer,p.policyNumber,p.insuredName,...(p.memberIds||[]).map(name)].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(q)));
}
