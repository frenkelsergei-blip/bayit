import {manualMoneyRow} from '../../shared/money-records.mjs';
import {flowOf,monthOf,linkCardPayments} from '../../shared/finance.mjs';
import {inRange} from './statistics.js';
import {paymentSources,matchesSources,ownerOfRow} from '../../shared/payment-sources.mjs';

// Inputs are records already authorized by the household/finance server. The
// view keeps sharing scopes separate and never treats an importer as a payer.
export function householdMoneyStatistics({manual=[],transactions=[],groups=[],savedSources=[],inferredSources=[],memberList=[],sourceKeys=[],user,scope='family',person='all',source='all',range='7',end,plan,legacyBudget=0}){
 const rows=[...new Map([...transactions,...manual.map(e=>manualMoneyRow(e))].map(r=>[r.id,r])).values()]
  .filter(r=>(scope==='private'?r.visibility==='private':r.visibility!=='private')&&!(r.visibility==='private'&&r.ownerId&&r.ownerId!==user));
 // Cards and accounts (shared/payment-sources.mjs): a row belongs to its card's owner, and a shared account to nobody in particular.
 const index=paymentSources(rows,savedSources,{inferred:inferredSources,members:memberList});
 const linked=linkCardPayments(rows,groups),expenses=[];let invalid=0;
 for(const row of rows){
  if(row.kind==='card_payment'&&linked.has(row.id))continue;
  const flow=flowOf(row.category);if(flow==='income'||flow==='savings'||(row.amount>0&&row.kind==='bank'))continue;
  if(!Number.isFinite(row.amount)||!/^\d{4}-\d{2}-\d{2}/.test(row.date||'')){invalid++;continue}
  expenses.push({...row,spent:-row.amount});
 }
 const period=expenses.filter(r=>inRange(r.date.slice(0,10),end,range)&&(source==='all'||(source==='manual'?r.source==='manual':r.source!=='manual'))&&matchesSources(r,index,sourceKeys));
 const selected=period.filter(r=>person==='all'||ownerOfRow(r,index)===person),categories=new Map();
 for(const row of selected)categories.set(row.category||'other',(categories.get(row.category||'other')||0)+row.spent);
 const budget=plan?Math.max(0,Number(plan.expenseLimit)||0):scope==='family'?Math.max(0,Number(legacyBudget)||0)*100:0;
 const monthly=expenses.filter(r=>monthOf(r)===end.slice(0,7)).reduce((n,r)=>n+r.spent,0);
 return {index,expenses,rows:selected,total:selected.reduce((n,r)=>n+r.spent,0),count:selected.length,categories:[...categories].map(([category,amount])=>({category,amount})).filter(r=>r.amount!==0).sort((a,b)=>b.amount-a.amount||a.category.localeCompare(b.category)),budget,monthly,used:budget?Math.max(0,Math.round(monthly/budget*100)):null,invalid,unattributed:person==='all'?0:period.filter(r=>!ownerOfRow(r,index)).length,uncoveredCardPayments:selected.filter(r=>r.kind==='card_payment').length};
}
