import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../app/node_modules/xlsx/xlsx.mjs';
import {readInsuranceWorkbook} from '../app/src/insurance-workbook.mjs';
import {reportRows,mergeInsuranceImport,insuranceIdentity,insuranceReportDate,insuranceSubjectCount} from '../shared/insurance.mjs';
import {insuranceAlerts,insuranceDocumentStatus,policyDocumentReview} from '../shared/insurance-lifecycle.mjs';
import {visibleState,applyChanges} from '../app/cloud/state.mjs';
import {pushMessages} from '../app/cloud/push.mjs';

const policy=(extra={})=>({id:'p',title:'Test coverage',he:'כיסוי לבדיקה',insurer:'Test insurance',policyNumber:'00123456789',insuredName:'Test Person',ownerId:'a',visibility:'private',allowedIds:[],memberIds:['a'],startDate:'2026-01-01',endDate:'2026-12-31',status:'active',type:'health',premiumCents:10000,premiumPeriod:'monthly',currency:'ILS',source:'manual',documentIds:[],paymentIds:[],...extra});
const state=(p=policy())=>({members:[{id:'a',role:'parent'},{id:'b',role:'parent'},{id:'kid',role:'child'}],profiles:{a:{locale:'en'},b:{},kid:{}},preferences:{},tasks:[],events:[],notes:[],history:[],documents:[],insurances:[p]});
const alerts=(s,date='2026-12-05',extra={})=>insuranceAlerts(visibleState(s,'a'),'a',{date,lang:'en',...extra});

test('original report history survives reimport without satisfying the full-policy document check or publishing private source identifiers',()=>{
 const p=policy({source:'har-habituach'}),first=mergeInsuranceImport([], [p],{actorId:'a',sourceFile:'first.xlsx',sourceDocumentId:'source-first'});
 const second=mergeInsuranceImport(first.policies,[p],{actorId:'a',sourceFile:'second.xlsx',sourceDocumentId:'source-second'});
 assert.deepEqual(second.policies[0].sourceDocumentIds,['source-first','source-second']);assert.deepEqual(second.policies[0].documentIds,[]);
 const original={id:'source-first',title:'Original',ownerId:'a',visibility:'private',allowedIds:[],sourceKind:'insurance-report',expires:'2028-01-01'};
 assert.equal(policyDocumentReview({...p,documentIds:[original.id]},[original],'2026-11-07').status,'missing');
 const s=state({...second.policies[0],visibility:'selected',allowedIds:['b']});s.documents=[original];assert.deepEqual(visibleState(s,'b').insurances[0].sourceDocumentIds,[]);assert.deepEqual(visibleState(s,'a').insurances[0].sourceDocumentIds,['source-first','source-second']);
});

test('renewal reminders use inclusive end dates, catch up to the nearest stage, and keys change with renewal',()=>{
 const s=state();assert.equal(alerts(s,'2026-11-01').filter(x=>x.key.includes('renewal')).length,0);
 const at=date=>alerts(s,date).find(x=>x.key.includes('renewal'));
 assert.match(at('2026-12-05').key,/:30$/);assert.equal(at('2026-12-05').key,at('2026-12-06').key);assert.match(at('2026-12-27').key,/:7$/);assert.match(at('2026-12-30').key,/:1$/);assert.match(at('2026-12-31').key,/:today$/);assert.match(at('2027-01-01').key,/:expired$/);
 const old=at('2026-12-05').key;s.insurances[0].endDate='2027-12-31';assert.equal(at('2026-12-05'),undefined);assert.notEqual(at('2027-12-05').key,old);
 s.insurances[0].endDate='';assert.equal(at('2027-12-05'),undefined);s.insurances[0].status='cancelled';assert.equal(alerts(s).length,0);
});
test('separate document validity, unknown dates, renewed policy periods and previous versions remain distinguishable',()=>{
 const p=policy({documentIds:['d']}),doc={id:'d',title:'Policy',ownerId:'a',visibility:'private',allowedIds:[],expires:'2026-11-06',validFrom:'2026-01-01'};
 assert.equal(insuranceDocumentStatus(doc,'2026-11-06',p),'current');assert.equal(insuranceDocumentStatus(doc,'2026-11-07',p),'expired');assert.equal(insuranceDocumentStatus({...doc,supersededAt:'2026-11-06T12:00:00Z'},'2026-11-06',p),'history');
 assert.equal(insuranceDocumentStatus({id:'d',date:'2026-11-06'},'2026-11-06',p),'unknown');assert.equal(policyDocumentReview(p,[{id:'d',date:'2026-11-06'}],'2026-11-06').status,'unknown');
 assert.equal(policyDocumentReview({...p,startDate:'2027-01-01'},[doc],'2026-11-06').status,'outdated');
 const s=state(p);s.documents=[doc];const old=alerts(s,'2026-11-07').find(x=>x.key.includes('documents'));assert.ok(old);assert.match(old.detail,/does not prove/);
 s.documents.push({id:'new',title:'Updated policy',ownerId:'a',visibility:'private',allowedIds:[],expires:'2027-12-31'});s.insurances[0].documentIds.push('new');assert.equal(alerts(s,'2026-11-07').some(x=>x.key.includes('documents')),false);assert.equal(s.documents[0].expires,'2026-11-06');
});
test('private policies and document status never notify other adults or children; delivery needs opt-in and respects quiet hours',()=>{
 const s=state(policy({visibility:'selected',allowedIds:['b']}));assert.equal(insuranceAlerts(visibleState(s,'b'),'b',{date:'2026-12-05'}).length,0);assert.equal(insuranceAlerts(visibleState(s,'kid'),'kid',{date:'2026-12-05'}).length,0);
 assert.equal(pushMessages(s,'a',{date:'2026-12-05',time:'12:00'},'parent').length,0);
 s.profiles.a.notificationPrefs={categories:{insurance:{push:true,telegram:true}}};
 assert.ok(pushMessages(s,'a',{date:'2026-12-05',time:'12:00'},'parent').some(x=>x.key.startsWith('insurance:')));
 assert.equal(pushMessages(s,'a',{date:'2026-12-05',time:'23:00'},'parent').length,0);assert.equal(alerts(s,'2026-12-05',{channel:'telegram',time:'23:00'}).length,0);assert.ok(alerts(s,'2026-12-05',{channel:'telegram',time:'12:00'}).length);
 s.profiles.a.notificationPrefs.enabled=false;assert.equal(alerts(s).length,0);
});
test('several coverage rows produce one document request and one reminder per policy/end date; repeated uploads do not reset keys',()=>{
 const s=state();s.insurances.push(policy({id:'rider',title:'Additional coverage'}));const items=alerts(s);assert.equal(items.length,2);s.insurances[0].importedAt='2026-12-06T12:00:00Z';assert.deepEqual(alerts(s).map(x=>x.key),items.map(x=>x.key));
 s.documents=[{id:'d',title:'Policy',ownerId:'a',visibility:'private',allowedIds:[],expires:'2027-01-01'}];s.insurances[1].documentIds=['d'];assert.equal(alerts(s).filter(x=>x.key.includes('documents')).length,0);
});
test('server rejects invalid document ranges and malformed reminder settings without changing existing records',()=>{
 const s=state(),d={id:'doc',title:'Policy',ownerId:'a',visibility:'private',allowedIds:[],validFrom:'2026-02-01',expires:'2026-01-01'};
 assert.throws(()=>applyChanges(s,[{collection:'documents',id:d.id,value:d}],'a','parent'),/dates/);assert.equal(s.documents.length,0);
 assert.throws(()=>applyChanges(s,[{collection:'profiles',id:'a',value:{notificationPrefs:{categories:{insurance:{leadDays:[-1]}}}}}],'a','parent'),/reminder/);
 const saved=applyChanges(s,[{collection:'documents',id:d.id,value:{...d,expires:'2026-12-31',supersededAt:'2026-11-06T12:00:00Z'}}],'a','parent');assert.equal(saved.documents[0].supersededAt,'2026-11-06T12:00:00Z');
});

const officialHeaders=['תעודת זהות','ענף ראשי','ענף (משני)','סוג מוצר','חברה','תקופת ביטוח','פרטים נוספים','פרמיה בש"ח','סוג פרמיה','מספר פוליסה','סיווג תכנית'];
const row=(number,period='01/01/2026 - 31/12/2026',amount=100)=>['TEST-ID','ביטוח בריאות','ניתוחים','פוליסת ביטוח','חברת בדיקה',period,'מידע לבדיקה',amount,'חודשית',number,'אישי'];
test('official export columns retain each coverage, combined validity periods, recurring text and the report date',()=>{
 const tables=[{name:'Test',rows:[['התיק הביטוחי בתאריך','06/11/2026'],[],officialHeaders,row('00000000000000123456'),row('00000000000000123456','01/01/2026 - 31/12/2027',150),row('00000000000000123457','מתחדש')]}];
 const r=reportRows(tables[0],{defaultInsuredName:'Test Person'});assert.equal(r.policies.length,3);assert.equal(new Set(r.policies.map(insuranceIdentity)).size,3);assert.equal(r.policies[0].policyNumber,'00000000000000123456');assert.equal(r.policies[0].premiumPeriod,'monthly');assert.equal(r.policies[0].coverageSub,'ניתוחים');assert.equal(r.policies[0].additionalDetails,'מידע לבדיקה');assert.equal(r.policies[0].endDate,'2026-12-31');assert.equal(r.policies[2].endDate,'');assert.equal(r.policies[2].coveragePeriodText,'מתחדש');assert.equal(insuranceReportDate(tables),'2026-11-06');assert.equal(insuranceSubjectCount(tables),1);assert.ok(r.policies.every(p=>!JSON.stringify(p).includes('TEST-ID')));
});
test('reader ignores a stale worksheet dimension and preserves numeric identifiers without scientific-display rounding',()=>{
 const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([[],officialHeaders,row(123456789012),row('00000000000000123456'),row(7654321)]);s.J5.z='00000000000000000000';XLSX.utils.book_append_sheet(w,s,'Test');
 const original=XLSX.write(w,{type:'buffer',bookType:'xlsx'}),zip=XLSX.CFB.read(original,{type:'buffer'}),entry=zip.FileIndex.find(f=>f.name==='sheet1.xml');assert.ok(entry);const xml=Buffer.from(entry.content).toString().replace(/<dimension ref="[^"]+"\/>/,'<dimension ref="A1:K2"/>');entry.content=Buffer.from(xml);entry.size=entry.content.length;const bytes=XLSX.CFB.write(zip,{type:'buffer',fileType:'zip'}),tables=readInsuranceWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'test.xlsx'),p=reportRows(tables[0]).policies;
 assert.equal(p.length,3);assert.equal(p[0].policyNumber,'123456789012');assert.equal(p[1].policyNumber,'00000000000000123456');assert.equal(p[2].policyNumber,'00000000000007654321');assert.equal(p[0].policyNumberFormat,'numeric');
 const unsafe=XLSX.utils.book_new();XLSX.utils.book_append_sheet(unsafe,XLSX.utils.aoa_to_sheet([officialHeaders,row(1234567890123456)]),'Unsafe');const encoded=XLSX.write(unsafe,{type:'array',bookType:'xlsx'}),table=readInsuranceWorkbook(encoded,'unsafe.xlsx')[0];assert.equal(table.unsafePolicyRows.length,1);assert.equal(reportRows(table).policies.length,0);
});
test('manual website-number correction survives reimport of the numeric Excel source',()=>{
 const incoming=policy({policyNumber:'7654321',sourcePolicyNumber:'7654321',policyNumberFormat:'numeric'}),corrected={...incoming,policyNumber:'00000000000007654321',policyNumberFormat:'manual'};
 const saved=mergeInsuranceImport([corrected],[incoming],{actorId:'a'});assert.equal(saved.added,0);assert.equal(saved.updated,1);assert.equal(saved.policies[0].policyNumber,corrected.policyNumber);assert.equal(saved.policies[0].sourcePolicyNumber,'7654321');
});
