import {isInsuranceSourceDocument} from './insurance-sources.mjs';
import {insuranceDate,insurancePolicyKey} from './insurance.mjs';

export const INSURANCE_ALERT_DEFAULTS={enabled:true,inApp:true,push:false,telegram:false,leadDays:[30,7,1],documents:true};
export function insuranceAlertPrefs(profile={}){
 const base=profile.notificationPrefs||{},own=base.categories?.insurance||{};
 return {...INSURANCE_ALERT_DEFAULTS,quietStart:base.quietStart||'20:30',quietEnd:base.quietEnd||'07:00',...own,enabled:base.enabled!==false&&own.enabled!==false,inApp:base.inApp!==false&&own.inApp!==false};
}
export function validateInsuranceAlertPrefs(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Choose valid insurance alerts.');
 for(const k of ['enabled','inApp','push','telegram','documents'])if(p[k]!==undefined&&typeof p[k]!=='boolean')throw Error('Choose valid insurance alerts.');
 if(p.leadDays!==undefined&&(!Array.isArray(p.leadDays)||p.leadDays.length>6||p.leadDays.some(n=>!Number.isInteger(n)||n<1||n>365)||new Set(p.leadDays).size!==p.leadDays.length))throw Error('Choose valid renewal reminder days.');
}
export function validateInsuranceDocument(d){
 for(const key of ['validFrom','expires'])if(d[key]&&insuranceDate(d[key])!==d[key])throw Error('Check the document dates.');
 if(d.validFrom&&d.expires&&d.expires<d.validFrom)throw Error('Check the document dates.');
 if(d.supersededAt!==undefined&&d.supersededAt!==''&&(typeof d.supersededAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(d.supersededAt)||!Number.isFinite(Date.parse(d.supersededAt))))throw Error('Choose valid document history.');
}
export function insuranceDocumentStatus(d,date,policy={}){
 if(d.supersededAt)return 'history';
 if(d.expires&&d.expires<date)return 'expired';
 if(d.expires&&policy.startDate&&d.expires<policy.startDate)return 'outdated';
 if(d.validFrom&&d.validFrom>date)return 'future';
 return d.expires?'current':'unknown';
}
export function policyDocumentReview(policy,documents,date){
 const linked=documents.filter(d=>!d.deletedAt&&!isInsuranceSourceDocument(d)&&policy.documentIds?.includes(d.id)),active=linked.filter(d=>!d.supersededAt),reference=policy.startDate>date?policy.startDate:date;
 if(!active.length)return {status:'missing',linked};
 if(active.some(d=>d.expires&&d.expires>=reference&&(!d.validFrom||d.validFrom<=reference)))return {status:'current',linked};
 if(active.some(d=>!d.expires))return {status:'unknown',linked};
 if(active.every(d=>d.expires<reference))return {status:reference===date?'expired':'outdated',linked};
 return {status:'future',linked};
}
// Stable bounded notification identifiers, not a security hash. Upload timestamps do not reset a stage.
const fingerprint=value=>{let n=2166136261;for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return (n>>>0).toString(36)};
const dayDifference=(end,date)=>Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
const quiet=(time,start,end)=>time&&start!==end&&(start<end?time>=start&&time<end:time>=start||time<end);
export function insuranceAlerts(visible,memberId,{date,channel='inApp',lang='he',time}={}){
 const profile=visible.profiles?.[memberId]||{},prefs=insuranceAlertPrefs(profile),role=visible.members?.find(m=>m.id===memberId)?.role;
 if(role==='child'||!prefs.enabled||prefs[channel]!==true||insuranceDate(date)!==date||channel!=='inApp'&&quiet(time,prefs.quietStart,prefs.quietEnd))return [];
 const T=(en,he)=>lang==='he'?he:en,out=[],seen=new Set(),groups=new Map();
 for(const p of visible.insurances||[]){if(p.ownerId!==memberId||p.deletedAt||p.status==='cancelled')continue;const key=insurancePolicyKey(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 for(const p of visible.insurances||[]){
  if(p.ownerId!==memberId||p.deletedAt||p.status==='cancelled')continue;
  const title=lang==='he'?p.he||p.title:p.title||p.he,target='household/insurance?policy='+encodeURIComponent(p.id),base={kind:'insurance',who:memberId,policyId:p.id,target,url:'#'+target,date,time:''};
  const add=(suffix,heading,detail)=>{const key='insurance:'+fingerprint(insurancePolicyKey(p))+':'+suffix;if(seen.has(key))return;seen.add(key);out.push({...base,id:key,key,title:heading,detail,body:detail,tag:key})};
  if(insuranceDate(p.endDate)&&p.endDate){
   const days=dayDifference(p.endDate,date),stage=days<0?'expired':days===0?'today':[...prefs.leadDays].sort((a,b)=>a-b).find(n=>days<=n);
   if(stage!==undefined)add('renewal:'+p.endDate+':'+stage,days<0?T('Check insurance renewal: ','בדיקת חידוש ביטוח: ')+title:T('Insurance renewal approaching: ','לקראת חידוש הביטוח: ')+title,T('Reported period ends '+p.endDate+'. Check renewal terms and attach the updated policy.','תקופת הביטוח הרשומה מסתיימת ב־'+p.endDate+'. בדקו את תנאי החידוש וצרפו פוליסה מעודכנת.'));
  }
  if(prefs.documents!==false){
   const group=groups.get(insurancePolicyKey(p)),periods=group.map(p=>[p.startDate||'',p.endDate||'']).sort(),groupPolicy={...p,startDate:periods.map(x=>x[0]).filter(Boolean).sort()[0]||'',documentIds:[...new Set(group.flatMap(p=>p.documentIds||[]))]};
   const review=policyDocumentReview(groupPolicy,visible.documents||[],date);
   if(review.status!=='current'){
    const token=fingerprint(JSON.stringify([periods,review.linked.map(d=>[d.id,d.validFrom||'',d.expires||'',d.supersededAt||'']).sort()]));
    const reason={missing:T('Attach a policy document and record its validity dates.','צרפו מסמך פוליסה וציינו את תאריכי התוקף שלו.'),unknown:T('The attached documents have no confirmed expiry date. Check and complete the dates.','למסמכים המצורפים חסר תאריך תוקף מאומת. בדקו והשלימו את התאריכים.'),expired:T('The attached documents have expired. Attach an updated document; this does not prove the insurance itself ended.','תוקף המסמכים המצורפים חלף. צרפו מסמך מעודכן; אין להסיק מכך שהביטוח עצמו הסתיים.'),outdated:T('The documents do not cover the recorded policy period. Attach the updated version.','המסמכים אינם מכסים את תקופת הביטוח הרשומה. צרפו גרסה מעודכנת.'),future:T('The attached documents start later. Check the document covering the current period.','תוקף המסמכים המצורפים מתחיל בהמשך. בדקו את המסמך לתקופה הנוכחית.')}[review.status];
    add('documents:'+token+':'+review.status,T('Policy document needs attention: ','מסמך ביטוח לבדיקה: ')+title,reason);
   }
  }
 }
 return out;
}
