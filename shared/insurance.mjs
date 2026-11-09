// Insurance reports are evidence, not a live connection. Premiums and payments stay separate.
import {flowOf,monthOf} from './finance.mjs';

export const INSURANCE_TYPES=[['health','Health','בריאות'],['life','Life','חיים'],['car','Car','רכב'],['home','Home','דירה'],['care','Long-term care','סיעוד'],['accident','Personal accident','תאונות אישיות'],['other','Other','אחר']];
export const PREMIUM_PERIODS=[['monthly','Monthly','חודשי'],['yearly','Yearly','שנתי'],['quarterly','Quarterly','רבעוני'],['once','One-off','חד־פעמי'],['unknown','Not specified','לא צוין']];
export const REPORT_FIELDS=[['insurer','Insurer','חברת ביטוח'],['title','Product / coverage','מוצר / כיסוי'],['policyNumber','Policy number','מספר פוליסה'],['insuredName','Insured person','שם המבוטח'],['premium','Premium','דמי ביטוח'],['premiumPeriod','Premium period','תקופת הפרמיה'],['startDate','Start date','תחילת ביטוח'],['endDate','End date','סיום ביטוח'],['status','Status','מצב'],['currency','Currency','מטבע'],['type','Insurance type','ענף הביטוח'],['coverageSub','Sub-branch','ענף משני'],['productType','Product type','סוג מוצר'],['coveragePeriodText','Coverage period','תקופת ביטוח'],['additionalDetails','Additional details','פרטים נוספים'],['classification','Plan classification','סיווג תכנית']];
export const cleanInsuranceText=v=>String(v??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim();
export const insuranceTextKey=v=>cleanInsuranceText(v).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const aliases={
 insurer:['חברת הביטוח','חברת ביטוח','שם חברת הביטוח','שם החברה','שם חברה','חברה מבטחת','חברה','מבטח','insurer','insurance company','company'],
 title:['שם מוצר הביטוח','שם המוצר','מוצר ביטוח','שם מוצר','שם הפוליסה','שם התכנית','שם התוכנית','תכנית ביטוח','תיאור הביטוח','סוג הביטוח','סוג ביטוח','כיסוי','product','coverage','policy name'],
 policyNumber:['מספר פוליסה','מספר הפוליסה','מס פוליסה','מספוליסה','מספר תוכנית','מספר תכנית','policy number','policy no'],
 insuredName:['שם המבוטח','שם מבוטח','שם מלא של המבוטח','מבוטח','insured','insured name'],
 premium:['פרמיה חודשית','דמי ביטוח חודשיים','דמי הביטוח החודשיים','דמי הביטוח בגין החודש הקודם','פרמיה שנתית','דמי ביטוח שנתיים','סך דמי הביטוח השנתיים','דמי ביטוח','דמי הביטוח','פרמיה','עלות הביטוח','פרמיה בש"ח','premium','monthly premium','annual premium'],
 premiumPeriod:['סוג פרמיה','סוג הפרמיה','תקופת פרמיה','תקופת הפרמיה','תדירות תשלום','תדירות התשלום','אופן תשלום','premium period','frequency'],
 startDate:['תאריך תחילת הביטוח','תחילת תקופת הביטוח','תאריך תחילת ביטוח','מועד תחילת הביטוח','תחילת ביטוח','תאריך תחילה','תחילת תקופה','start date','start'],
 endDate:['תאריך סיום הביטוח','תום תקופת הביטוח','מועד תום הביטוח','תאריך תום ביטוח','תום ביטוח','תאריך סיום','תאריך תום','סיום תקופה','end date','expiry','expires'],
 status:['מצב פוליסה','סטטוס פוליסה','סטטוס','מצב','status'], currency:['מטבע','סוג מטבע','currency'],
 type:['ענף ביטוח','ענף הביטוח','ענף ראשי','ענף','קטגוריה','insurance type','category'],
 coverageSub:['ענף (משני)','ענף משני','sub branch'],productType:['סוג מוצר','product type'],coveragePeriodText:['תקופת ביטוח','תקופת הביטוח','coverage period'],additionalDetails:['פרטים נוספים','additional details'],classification:['סיווג תכנית','סיווג תוכנית','plan classification']
};
const headerKeys=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,new Set(v.map(insuranceTextKey))]));
export function detectInsuranceHeader(rows){
 let best={index:0,mapping:{},score:0};
 for(let i=0;i<Math.min(rows.length,80);i++){
  const mapping={};for(let c=0;c<Math.min(rows[i]?.length||0,60);c++){const key=insuranceTextKey(rows[i][c]);for(const [field,names]of Object.entries(headerKeys))if(names.has(key)&&mapping[field]===undefined)mapping[field]=c;}
  const score=Object.keys(mapping).length+(mapping.insurer!==undefined?2:0)+(mapping.policyNumber!==undefined?2:0);
  if(score>best.score)best={index:i,mapping,score};
 }
 return {...best,recognized:best.mapping.insurer!==undefined&&best.mapping.policyNumber!==undefined&&(best.mapping.title!==undefined||best.mapping.type!==undefined)};
}
export function insuranceReportDate(tables){
 for(const table of tables)for(const row of table.rows.slice(0,detectInsuranceHeader(table.rows).index))if(row.some(v=>/תאריך|report date/i.test(cleanInsuranceText(v))))for(const value of row){const date=insuranceDate(value);if(date)return date;}
 return '';
}
export function insuranceSubjectCount(tables){
 const ids=new Set();for(const table of tables){const h=detectInsuranceHeader(table.rows),columns=table.rows[h.index]||[],column=columns.findIndex(v=>['תעודתזהות','מספרזהות','מספרתעודתזהות','idnumber'].includes(insuranceTextKey(v)));if(column>=0)for(const row of table.rows.slice(h.index+1))if(cleanInsuranceText(row[column]))ids.add(cleanInsuranceText(row[column]));}return ids.size;
}
export function parsePremium(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?Math.round(value*100):null;
 let s=cleanInsuranceText(value).replace(/(?:₪|ש[״\"']?ח|ILS|NIS|USD|EUR|GBP|[$€£])/gi,'').replace(/\s/g,'');
 if(!s||!/^\d[\d,.]*$/.test(s))return null;
 if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s))s=s.replace(/,/g,'');
 else if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');
 if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
 const cents=Math.round(Number(s)*100);return Number.isSafeInteger(cents)&&cents<=10000000000?cents:null;
}
export function premiumPeriod(value){
 const s=cleanInsuranceText(value).toLowerCase();
 if(/חצי.?שנת|דו.?חודש|bi.?month|semi.?annual/.test(s))return 'unknown';
 if(/חודשי|חודשית|לחודש|החודש הקודם|monthly|per month/.test(s))return 'monthly';
 if(/שנתי|שנתית|לשנה|annual|yearly|per year/.test(s))return 'yearly';
 if(/רבעונ|quarter/.test(s))return 'quarterly';
 if(/חד.?פעמ|one.?off|once|single/.test(s))return 'once';
 return 'unknown';
}
export function insuranceDate(value){
 const s=cleanInsuranceText(value);let out='';
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))out=s;
 else{const m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);if(m)out=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
 if(!out)return '';const n=Date.parse(out+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===out?out:'';
}
export function insuranceType(value){
 const s=cleanInsuranceText(value).toLowerCase();
 if(/סיעוד|long.?term|nursing/.test(s))return 'care';if(/תאונ|accident/.test(s))return 'accident';
 if(/בריאות|רפוא|ניתוח|תרופ|health|medical/.test(s))return 'health';if(/חיים|מוות|משכנת|life/.test(s))return 'life';
 if(/רכב|דרך וגרירה|שמשות|car|vehicle|motor/.test(s))return 'car';if(/דירה|מבנה|תכולה|home|property/.test(s))return 'home';return 'other';
}
function reportStatus(value){const s=cleanInsuranceText(value).toLowerCase();if(/בוטל|מבוטל|cancel/.test(s))return 'cancelled';if(/לא בתוקף|פג|expired|inactive/.test(s))return 'expired';if(/בתוקף|פעיל|active/.test(s))return 'active';return 'unknown';}
export function reportRows(table,{headerIndex,mapping,defaultInsuredName='',memberIds=[],defaultPeriod='unknown',reportDate=''}={}){
 const detected=detectInsuranceHeader(table.rows),index=headerIndex??detected.index,map=mapping??detected.mapping,header=table.rows[index]||[],policies=[],issues=[];
 if(map.insurer===undefined||map.policyNumber===undefined||map.title===undefined&&map.type===undefined)return {policies,issues:[{row:index+1,code:'columns'}]};
 for(let i=index+1;i<table.rows.length;i++){
  const row=table.rows[i]||[];if(!row.some(v=>cleanInsuranceText(v)))continue;
  if(detectInsuranceHeader([row]).recognized)continue;
  const get=k=>map[k]===undefined?'':cleanInsuranceText(row[map[k]]),insurer=get('insurer'),policyNumber=get('policyNumber'),title=get('title')||get('type');
  if(!insurer&&!policyNumber&&!title||/^(סה[״\"]?כ|סך הכל|total)/i.test(insurer+' '+title))continue;
  if(!insurer&&!policyNumber&&/^תחום\s*[-–—]/.test(title))continue;
  if(!insurer||!policyNumber||!title){issues.push({row:i+1,code:'identity'});continue;}
  const coverageSub=get('coverageSub'),productType=get('productType'),coveragePeriodText=get('coveragePeriodText'),additionalDetails=get('additionalDetails'),classification=get('classification');
  const parts=[title,coverageSub,productType==='פוליסת ביטוח'?'':productType].filter(Boolean),fullTitle=[...new Set(parts)].join(' · ');
  const rawPremium=get('premium'),period=premiumPeriod(get('premiumPeriod'))!=='unknown'?premiumPeriod(get('premiumPeriod')):premiumPeriod(header[map.premium]),insuredName=get('insuredName')||defaultInsuredName;
  const rawCurrency=get('currency')||(/[$]/.test(rawPremium)?'USD':/€/.test(rawPremium)?'EUR':/£/.test(rawPremium)?'GBP':'ILS');
  const currency=/^(₪|ש[״\"]?ח|ILS|NIS)$/i.test(rawCurrency)?'ILS':['USD','EUR','GBP'].includes(rawCurrency.toUpperCase())?rawCurrency.toUpperCase():'unknown';
  const dates=coveragePeriodText.match(/\d{1,2}[./-]\d{1,2}[./-]\d{4}/g)||[];
  const startDate=insuranceDate(get('startDate')||dates[0]),endDate=insuranceDate(get('endDate')||dates[1]);
  const warnings=[];if(rawPremium&&parsePremium(rawPremium)===null)warnings.push('premium');if(get('startDate')&&!startDate||get('endDate')&&!endDate)warnings.push('date');if(startDate&&endDate&&endDate<startDate)warnings.push('range');
  policies.push({sourcePolicyNumber:policyNumber,policyNumberFormat:table.numericPolicyRows?.includes(i+1)?'numeric':'text',title:fullTitle,he:fullTitle,coverageMain:get('type'),coverageSub,productType,coveragePeriodText,additionalDetails,classification,insurer,policyNumber,insuredName,memberIds:get('insuredName')&&insuranceTextKey(get('insuredName'))!==insuranceTextKey(defaultInsuredName)?[]:memberIds.slice(),premiumCents:parsePremium(rawPremium),premiumPeriod:period==='unknown'?defaultPeriod:period,currency,type:insuranceType(get('type')+' '+title),startDate,endDate,status:reportStatus(get('status')),source:'har-habituach',sourceSheet:table.name,sourceRow:i+1,sourcePremiumText:rawPremium,reportDate,importWarnings:warnings});
 }
 // Two real coverages can share a policy number and title while having different terms.
 // Disambiguate only those collisions; ordinary renewals retain the existing identity.
 const groups=new Map();for(const p of policies){const key=insuranceIdentity(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 for(const group of groups.values())if(group.length>1&&new Set(group.map(p=>[p.startDate,p.endDate,p.classification,p.premiumCents].join('|'))).size>1)for(const p of group)p.coverageVariant=[p.startDate,p.endDate,p.classification].join('|');
 return {policies,issues};
}
const insurers=[['harel',['הראל','harel']],['phoenix',['הפניקס','פניקס','phoenix']],['migdal',['מגדל','migdal']],['clal',['כלל ביטוח','כלל חברה לביטוח','clal insurance']],['menora',['מנורה','menora']],['aig',['aig']],['direct',['ביטוח ישיר','איי די איי','איי.די.איי','idi']],['ayalon',['איילון','ayalon']],['libra',['ליברה','libra']],['shomera',['שומרה','shomera']],['hachshara',['הכשרה ביטוח','הכשרה חברה','hachshara']],['shlomo',['שלמה ביטוח','shlomo insurance']],['bittuh9',['9 מיליון','תשעה מיליון','9 ביטוח']],['we-sure',['ווישור','we sure','wesure']]];
export function insurerKey(value){
 const s=' '+cleanInsuranceText(value).toLowerCase()+' ',compact=insuranceTextKey(s);
 for(const [key,names]of insurers)if(names.some(n=>/[a-z]/i.test(n)?new RegExp('(?:^|[^a-z])'+n.replace(/ /g,'\\s*')+'(?:[^a-z]|$)','i').test(s):s.includes(n)))return key;
 if(/^כלל(?:חברהלביטוח)?(?:בעמ)?$/.test(compact))return 'clal';
 return compact.replace(/חברהלביטוח|חברתביטוח|לביטוח|ביטוח|בעמ/g,'');
}
export function insuranceIdentity(p){return [insurerKey(p.insurer),insuranceTextKey(p.policyNumberFormat==='manual'&&p.sourcePolicyNumber?p.sourcePolicyNumber:p.policyNumber),insuranceTextKey(p.title),insuranceTextKey(p.insuredName)||[...(p.memberIds||[])].sort().join(','),p.coverageVariant||''].join('|');}
export function insurancePolicyKey(p){return [insurerKey(p.insurer),insuranceTextKey(p.policyNumber),insuranceTextKey(p.insuredName)||[...(p.memberIds||[])].sort().join(',')].join('|');}
export function monthlyPremium(p){if(p.currency!=='ILS'||!Number.isSafeInteger(p.premiumCents)||p.premiumCents<0)return null;return p.premiumPeriod==='monthly'?p.premiumCents:p.premiumPeriod==='yearly'?Math.round(p.premiumCents/12):p.premiumPeriod==='quarterly'?Math.round(p.premiumCents/3):null;}
export function policyStatus(p,today){if(p.status==='cancelled')return 'cancelled';if(p.status==='expired'||p.endDate&&p.endDate<today)return 'expired';if(p.startDate&&p.startDate>today)return 'upcoming';return p.status==='active'||p.startDate&&p.endDate?'active':'unknown';}
export function insuranceNeedsReview(p){return !p.insuredName&&!p.memberIds?.length||p.premiumCents==null||p.premiumPeriod==='unknown'||p.currency==='unknown'||p.importWarnings?.length>0;}
// The finance model stores charge amounts in ILS agorot. A row's currency can describe the ORIGINAL
// foreign purchase; it must never relabel or exclude its already-converted shekel debit.
export function insurancePaymentRows(rows,confirmed=new Set()){return [...new Map(rows.filter(t=>Number.isSafeInteger(t.amount)&&t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)==='expense'&&(t.category==='insurance'||confirmed.has(t.id))).map(t=>[t.id,t])).values()];}
export function paymentCandidates(policy,rows){
 const company=insurerKey(policy.insurer),number=insuranceTextKey(policy.policyNumber),monthly=monthlyPremium(policy);
 return rows.filter(t=>t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)==='expense').map(t=>{
  const exact=number.length>=6&&insuranceTextKey(t.description).includes(number),sameCompany=!!company&&insurerKey(t.description)===company,sameAmount=monthly!=null&&Math.abs(-t.amount-monthly)<=100;
  return {transaction:t,exact,sameCompany,sameAmount,score:exact?100:sameCompany?40+(sameAmount?10:0):0};
 }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||b.transaction.date.localeCompare(a.transaction.date));
}
export function insuranceSummary(policies,rows,{month,today}){
 const active=policies.filter(p=>['active','unknown'].includes(policyStatus(p,today))),known=active.map(monthlyPremium).filter(v=>v!==null),linked=new Set(policies.flatMap(p=>p.paymentIds||[])),payments=insurancePaymentRows(rows,linked).filter(t=>monthOf(t)===month);
 return {policies:policies.length,policyNumbers:new Set(policies.map(insurancePolicyKey)).size,active:active.length,estimatedMonthly:known.length?known.reduce((n,v)=>n+v,0):null,unknownPremiums:active.length-known.length,payments,paymentTotal:payments.reduce((n,t)=>n-t.amount,0),unlinked:payments.filter(t=>!linked.has(t.id)),review:policies.filter(insuranceNeedsReview).length};
}
export function mergeInsuranceImport(existing,rows,{actorId,visibility='private',allowedIds=[],sourceFile='',sourceDocumentId='',now=new Date().toISOString(),id=()=>crypto.randomUUID()}={}){
 const result=structuredClone(existing),seen=new Set(),counts={added:0,updated:0,duplicates:0};
 for(const raw of rows){
  const row={...raw};delete row.selected;const key=insuranceIdentity(row);if(seen.has(key)){counts.duplicates++;continue;}seen.add(key);
  const index=result.findIndex(p=>p.ownerId===actorId&&!p.deletedAt&&insuranceIdentity(p)===key),old=result[index];
  const next={...row,...(old?.policyNumberFormat==='manual'?{policyNumber:old.policyNumber,policyNumberFormat:'manual',sourcePolicyNumber:old.sourcePolicyNumber}:{}),id:old?.id||id(),ownerId:actorId,visibility:old?.visibility||visibility,allowedIds:old?.allowedIds||allowedIds.slice(),memberIds:old?.memberIds?.length?old.memberIds:row.memberIds||[],documentIds:old?.documentIds||[],...(sourceDocumentId||old?.sourceDocumentIds?.length?{sourceDocumentIds:[...new Set([...(old?.sourceDocumentIds||[]),...(sourceDocumentId?[sourceDocumentId]:[])])]}:{}),paymentIds:old?.paymentIds||[],note:old?.note||'',sourceFile,importedAt:now,createdAt:old?.createdAt||now,updatedAt:now};
  if(index>=0){result[index]=next;counts.updated++;}else{result.push(next);counts.added++;}
 }
 return {policies:result,...counts};
}
const validDate=s=>!s||insuranceDate(s)===s;
export function validateInsurancePolicy(p,memberIds,adults){
 for(const key of ['insurer','policyNumber','insuredName','type','status','premiumPeriod','currency','startDate','endDate','source','sourceFile','sourceSheet','sourcePremiumText','reportDate','importedAt','coverageMain','coverageSub','productType','coveragePeriodText','additionalDetails','classification','coverageVariant','sourcePolicyNumber','policyNumberFormat'])if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>300))throw Error('Choose valid insurance details.');
 if(!p.title?.trim()||!p.insurer?.trim())throw Error('Enter an insurance product and company.');
 if(!INSURANCE_TYPES.some(([id])=>id===p.type)||!PREMIUM_PERIODS.some(([id])=>id===p.premiumPeriod)||!['active','expired','cancelled','unknown'].includes(p.status)||!['ILS','USD','EUR','GBP','unknown'].includes(p.currency)||!['manual','har-habituach'].includes(p.source))throw Error('Choose valid insurance details.');
 if(p.premiumCents!=null&&(!Number.isSafeInteger(p.premiumCents)||p.premiumCents<0||p.premiumCents>10000000000))throw Error('Choose a valid insurance premium.');
 if(!validDate(p.startDate)||!validDate(p.endDate)||!validDate(p.reportDate)||p.startDate&&p.endDate&&p.endDate<p.startDate)throw Error('Check the insurance dates.');
 if((p.memberIds||[]).some(id=>!memberIds.has(id)))throw Error('Choose an insured family member.');
 if(!['private','selected'].includes(p.visibility)||p.visibility==='selected'&&(p.allowedIds||[]).some(id=>!adults.has(id)))throw Error('Insurance can be shared only with selected adults.');
 for(const key of ['documentIds','paymentIds','sourceDocumentIds'])if(!Array.isArray(p[key]||[])||(p[key]||[]).length>500||(p[key]||[]).some(id=>typeof id!=='string'||id.length>180||!id))throw Error('Choose valid linked insurance records.');
 if(p.sourceRow!==undefined&&(!Number.isInteger(p.sourceRow)||p.sourceRow<1||p.sourceRow>5001))throw Error('Choose a valid report row.');
 if(p.importWarnings!==undefined&&(!Array.isArray(p.importWarnings)||p.importWarnings.length>10||p.importWarnings.some(w=>!['premium','date','range'].includes(w))))throw Error('Choose valid report warnings.');
}
