import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../app/node_modules/xlsx/xlsx.mjs';
import {readInsuranceWorkbook} from '../app/src/insurance-workbook.mjs';
import {detectInsuranceHeader,reportRows,parsePremium,premiumPeriod,insuranceDate,monthlyPremium,mergeInsuranceImport,paymentCandidates,insuranceSummary,insuranceIdentity} from '../shared/insurance.mjs';
import {blankState,visibleState,applyChanges,diffState} from '../app/cloud/state.mjs';
import {accessibleExport} from '../shared/access-export.mjs';

const header=['חברת הביטוח','שם מוצר הביטוח','מספר פוליסה','שם המבוטח','דמי ביטוח שנתיים','תאריך תחילת הביטוח','תאריך סיום הביטוח','מצב פוליסה'];
const table={name:'בריאות',rows:[['הר הביטוח — קובץ בדיקה בדיוני'],header,['הראל','תרופות מחוץ לסל','00123456','דניאל לוי','1,200.00 ₪','01/01/2026','31/12/2026','בתוקף']]};
const policy=extra=>({id:'p1',title:'תרופות מחוץ לסל',he:'תרופות מחוץ לסל',insurer:'הראל חברה לביטוח בע״מ',policyNumber:'00123456',insuredName:'דניאל לוי',memberIds:['daniel'],premiumCents:10000,premiumPeriod:'monthly',currency:'ILS',type:'health',startDate:'2026-01-01',endDate:'2026-12-31',status:'active',ownerId:'daniel',visibility:'private',allowedIds:[],source:'har-habituach',documentIds:[],paymentIds:[],...extra});
const tx=(id,description,extra={})=>({id,description,amount:-10000,kind:'card',currency:'ILS',date:'2026-11-01',chargeDate:'2026-11-05',category:'insurance',...extra});
const state=()=>{const d=blankState('home','בית',{id:'daniel',name:'Daniel',role:'parent'});d.members.push({id:'hila',role:'parent'},{id:'kid',role:'child'});d.profiles.hila={};d.profiles.kid={};return d;};

test('Hebrew report recognizes a displaced header, keeps leading zeros and explicit annual basis',()=>{
 assert.equal(detectInsuranceHeader(table.rows).index,1);
 const {policies,issues}=reportRows(table);assert.deepEqual(issues,[]);assert.equal(policies.length,1);
 const p=policies[0];assert.equal(p.policyNumber,'00123456');assert.equal(p.premiumCents,120000);assert.equal(p.premiumPeriod,'yearly');assert.equal(monthlyPremium(p),10000);assert.equal(p.startDate,'2026-01-01');assert.equal(p.endDate,'2026-12-31');assert.equal(p.sourceRow,3);assert.deepEqual(p.memberIds,[]);
});
test('a payer is never inferred to be the insured person; ambiguous premium basis remains unknown',()=>{
 const t={name:'כללי',rows:[['חברת ביטוח','שם המוצר','מספר פוליסה','פרמיה'],['הראל','בריאות','123456','100']]};
 const p=reportRows(t).policies[0];assert.equal(p.insuredName,'');assert.deepEqual(p.memberIds,[]);assert.equal(p.premiumPeriod,'unknown');assert.equal(monthlyPremium(p),null);
 const q=reportRows(t,{defaultInsuredName:'נועה',memberIds:['kid'],defaultPeriod:'monthly'}).policies[0];assert.equal(q.insuredName,'נועה');assert.deepEqual(q.memberIds,['kid']);assert.equal(monthlyPremium(q),10000);
 const person=reportRows(table,{defaultInsuredName:'נועה',memberIds:['kid']}).policies[0];assert.equal(person.insuredName,'דניאל לוי');assert.deepEqual(person.memberIds,[]);
});
test('parsing distinguishes missing amounts, zero amounts, annual and one-off premiums and invalid dates',()=>{
 assert.equal(parsePremium(''),null);assert.equal(parsePremium('ללא מידע'),null);assert.equal(parsePremium('0'),0);assert.equal(parsePremium('123,45'),12345);assert.equal(parsePremium('1,234.50 ₪'),123450);assert.equal(parsePremium('1.234,50'),null);assert.equal(parsePremium('=1+2'),null);assert.equal(parsePremium('-10'),null);assert.equal(premiumPeriod('חד פעמי'),'once');assert.equal(monthlyPremium(policy({premiumPeriod:'once'})),null);assert.equal(monthlyPremium(policy({currency:'USD'})),null);assert.equal(insuranceDate('31/02/2026'),'');assert.equal(insuranceDate('01.11.2026'),'2026-11-01');
});
test('duplicates update only the current owner and keep attachments, sharing, notes and confirmed payment links',()=>{
 const old=policy({documentIds:['doc'],paymentIds:['tx'],note:'בדיקה ידנית',visibility:'selected',allowedIds:['hila']});
 const input=reportRows(table,{defaultInsuredName:'דניאל לוי',memberIds:['daniel']}).policies[0];
 const other=policy({id:'other',ownerId:'hila'}),r=mergeInsuranceImport([old,other],[input,input],{actorId:'daniel',sourceFile:'report.xlsx',now:'2026-11-06T10:00:00Z'});
 assert.equal(r.updated,1);assert.equal(r.added,0);assert.equal(r.duplicates,1);assert.equal(r.policies.length,2);assert.equal(r.policies[0].premiumCents,120000);assert.deepEqual(r.policies[0].documentIds,['doc']);assert.deepEqual(r.policies[0].paymentIds,['tx']);assert.deepEqual(r.policies[0].allowedIds,['hila']);assert.equal(r.policies[0].note,'בדיקה ידנית');assert.deepEqual(r.policies[1],other);
 assert.notEqual(insuranceIdentity(old),insuranceIdentity({...old,title:'ניתוחים'}));
});
test('matching suggests candidates without mutating or confirming them, rejects refunds and aggregate card payments',()=>{
 const p=policy(),rows=[tx('a','הראל'),tx('b','הראל פוליסה 00123456'),tx('c','כללית שירותי בריאות'),tx('refund','הראל',{amount:10000}),tx('aggregate','הראל',{kind:'card_payment'}),tx('saving','הראל פנסיה',{category:'savings'})];
 const c=paymentCandidates(p,rows);assert.deepEqual(c.map(x=>x.transaction.id),['b','a']);assert.equal(c[0].exact,true);assert.equal(c[1].sameCompany,true);assert.deepEqual(p.paymentIds,[]);
});
test('one company payment linked to several policies is counted only once; unknown costs are not zero',()=>{
 const policies=[policy({paymentIds:['a']}),policy({id:'p2',title:'תאונות',premiumCents:null,premiumPeriod:'unknown',paymentIds:['a']})],rows=[tx('a','הראל'),tx('old','הראל',{chargeDate:'2026-10-05'})];
 const s=insuranceSummary(policies,rows,{month:'2026-11',today:'2026-11-06'});assert.equal(s.paymentTotal,10000);assert.equal(s.estimatedMonthly,10000);assert.equal(s.unknownPremiums,1);assert.equal(s.unlinked.length,0);
 assert.equal(insuranceSummary([policy({premiumCents:null})],[],{month:'2026-11',today:'2026-11-06'}).estimatedMonthly,null);
});
test('foreign statement metadata never relabels the shekel charge, and unsupported premium periods remain unknown',()=>{
 const row=tx('foreign','הראל',{currency:'USD',originalAmount:2500,amount:-10000,foreign:true});
 const s=insuranceSummary([policy()],[row,row],{month:'2026-11',today:'2026-11-06'});assert.equal(s.paymentTotal,10000);assert.equal(s.payments.length,1);assert.equal(paymentCandidates(policy(),[row])[0].sameAmount,true);assert.equal(premiumPeriod('חצי שנתי'),'unknown');assert.equal(premiumPeriod('דו חודשי'),'unknown');
});
test('server authorizes insurance records independently of insured people and rejects children and another owner',()=>{
 const d=state(),p=policy({memberIds:['kid']});d.insurances=[p];
 assert.equal(visibleState(d,'daniel').insurances.length,1);assert.equal(visibleState(d,'hila').insurances.length,0);assert.equal(visibleState(d,'kid').insurances.length,0);
 const shared={...p,visibility:'selected',allowedIds:['hila'],paymentIds:['private-payment'],documentIds:['private-doc']},next=applyChanges(d,[{collection:'insurances',id:p.id,value:shared}],'daniel','parent');assert.equal(visibleState(next,'hila').insurances.length,1);assert.equal(visibleState(next,'kid').insurances.length,0);assert.equal(visibleState(next,'hila').insurances[0].paymentIds,undefined);assert.deepEqual(visibleState(next,'hila').insurances[0].documentIds,[]);assert.deepEqual(visibleState(next,'daniel').insurances[0].paymentIds,['private-payment']);
 assert.throws(()=>applyChanges(next,[{collection:'insurances',id:p.id,value:{...shared,title:'changed'}}],'hila','parent'),/owner/);
 assert.throws(()=>applyChanges(d,[{collection:'insurances',id:'p2',value:policy({id:'p2',ownerId:'kid',visibility:'private'})}],'kid','child'),/adult/);
 assert.throws(()=>applyChanges(d,[{collection:'insurances',id:p.id,value:{...shared,allowedIds:['kid']}}],'daniel','parent'),/adults/);
 assert.throws(()=>applyChanges(d,[{collection:'insurances',id:p.id,delete:true}],'kid','child'),/private|adult/);
 assert.throws(()=>applyChanges(d,[{collection:'insurances',id:p.id,value:{...p,premiumCents:1.5}}],'daniel','parent'),/premium/);
 assert.equal(accessibleExport(d,'kid',r=>r).insurances.length,0);
});
test('a policy import participates in confirmed household changes without requiring a new database table',()=>{
 const before=state(),after=structuredClone(before);after.insurances=[policy()];const changes=diffState(before,after);assert.equal(changes.length,1);assert.equal(changes[0].collection,'insurances');const saved=applyChanges(before,changes,'daniel','parent');assert.equal(saved.insurances[0].id,'p1');
});
test('real XLSX, legacy XLS and CSV readers preserve policy numbers and consume synthetic reports only',()=>{
 for(const bookType of ['xlsx','xls']){
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(table.rows),'בריאות');const bytes=XLSX.write(book,{bookType,type:'array'}),tables=readInsuranceWorkbook(bytes,'report.'+bookType);assert.equal(tables.length,1);assert.equal(reportRows(tables[0]).policies[0].policyNumber,'00123456');
 }
 const bytes=new TextEncoder().encode('\ufeff'+header.join(',')+'\r\nהראל,בריאות,00123456,דניאל,1200,01/01/2026,31/12/2026,בתוקף');assert.equal(reportRows(readInsuranceWorkbook(bytes.buffer,'report.csv')[0]).policies[0].policyNumber,'00123456');
});
