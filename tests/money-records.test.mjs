import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualMoneyRow,merchantKey,transactionHistory} from '../shared/money-records.mjs';
import {monthSummary} from '../shared/finance.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';

const row=(id,date,amount,extra={})=>({id,date,chargeDate:date,description:'KSP',source:'max',kind:'card',category:'shopping',amount,...extra});
test('merchant identity handles Latin/Hebrew punctuation without conflating numbered businesses',()=>{
 assert.equal(merchantKey('K.S.P'),merchantKey('\u200fKSP'));
 assert.equal(merchantKey('סופר־פארם'),merchantKey('סופר פארם'));
 assert.notEqual(merchantKey('כביש 6'),merchantKey('כביש 90'));
 assert.notEqual(merchantKey('KSP חיפה'),merchantKey('KSP תל אביב'));
});
test('merchant history uses cash-flow months, exact agorot and net refunds',()=>{
 const item=row('current','2026-10-10',-40810,{chargeDate:'2026-11-02',installmentN:2,installmentOf:5});
 const rows=[item,row('previous','2026-09-10',-40810,{chargeDate:'2026-10-02'}),row('refund','2026-10-15',5010,{chargeDate:'2026-11-02'}),row('unrelated','2026-10-14',-99900,{description:'KSP Haifa'})];
 const h=transactionHistory(rows,item);
 assert.equal(h.current.month,'2026-11');assert.equal(h.current.amount,35800);assert.equal(h.current.count,2);
 assert.equal(h.previous.amount,40810);assert.equal(h.average,40810);assert.equal(h.related.length,3);
});
test('history keeps a missing month distinct from a loaded month without matches',()=>{
 const item=row('current','2026-11-02',-15000);
 const h=transactionHistory([item,row('unrelated','2026-10-03',-10000,{description:'Other merchant'})],item);
 assert.equal(h.previous.loaded,true);assert.equal(h.previous.count,0);assert.equal(h.average,null);
 assert.equal(h.months.find(m=>m.month==='2026-09').loaded,false);
});
test('history separates bank card settlements and income from merchant spending',()=>{
 const item=row('spending','2026-11-02',-10000);
 const h=transactionHistory([item,row('settlement','2026-10-02',-10000,{kind:'card_payment'}),row('income','2026-10-03',20000,{kind:'bank',category:'income'}),row('cross-source','2026-10-01',-5000,{source:'riseup',kind:'riseup'})],item);
 assert.deepEqual(h.related.map(t=>t.id),['spending','cross-source']);
});
test('manual income and legacy expenses have correct signs in the monthly picture',()=>{
 const expense=manualMoneyRow({id:'expense',title:'Shopping',date:'2026-11-03',amount:123.45,category:'Groceries'});
 const income=manualMoneyRow({id:'salary',title:'Salary',date:'2026-11-01',amount:10000.25,category:'Salary',flow:'income'});
 assert.equal(expense.amount,-12345);assert.equal(income.amount,1000025);assert.equal(income.category,'salary');
 const s=monthSummary([expense,income],[],'2026-11');assert.equal(s.income,1000025);assert.equal(s.expenses,12345);assert.equal(s.net,987680);
});
test('server income records retain adult/owner checks and visibility before entering history',()=>{
 const d=blankState('test','Test',{id:'one',name:'One',role:'parent'});d.members.push({id:'two',name:'Two',role:'parent'},{id:'kid',name:'Kid',role:'child'});
 const income={id:'salary',ownerId:'one',memberId:'one',visibility:'private',allowedIds:[],title:'Salary',date:'2026-11-01',amount:12000,category:'Salary',flow:'income'};
 const next=applyChanges(d,[{collection:'expenses',id:income.id,value:income}],'one','parent');
 assert.equal(visibleState(next,'one').expenses.length,1);assert.equal(visibleState(next,'two').expenses.length,0);assert.equal(visibleState(next,'kid').expenses.length,0);
 assert.throws(()=>applyChanges(next,[{collection:'expenses',id:income.id,value:{...income,amount:1}}],'two','parent'),/private/);
 assert.throws(()=>applyChanges(d,[{collection:'expenses',id:income.id,value:{...income,ownerId:'kid',memberId:'kid'}}],'kid','child'),/adult/);
 assert.throws(()=>applyChanges(d,[{collection:'expenses',id:income.id,value:{...income,flow:'unknown'}}],'one','parent'),/income or expense/);
});
