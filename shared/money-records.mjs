import {flowOf,monthOf,shiftMonth} from './finance.mjs';

const MANUAL_CATEGORY={Groceries:'groceries',Utilities:'utilities',Cleaning:'home',School:'kids',Health:'health',Other:'other',Salary:'salary',Benefits:'benefits',Income:'income',Savings:'savings',Insurance:'insurance'};

// Manual records retain their existing positive shekel amount in household state.
// The finance model uses signed integer agorot for both imports and manual entries.
export function manualMoneyRow(record,description=record.title){
 const income=record.flow==='income';
 return {...record,id:'manual-'+record.id,manualId:record.id,source:'manual',kind:'manual',chargeDate:record.date,description,
  amount:Math.round(Number(record.amount)*100)*(income?1:-1),category:income?MANUAL_CATEGORY[record.category]||'income':MANUAL_CATEGORY[record.category]||'other'};
}

// Conservative identity: ignore case, punctuation and directional formatting, but keep digits.
// Branch names and different spellings are not guessed to be the same merchant.
export const merchantKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const historyKind=t=>t.kind==='card_payment'?'card_payment':flowOf(t.category)==='savings'?'savings':flowOf(t.category)==='income'||t.amount>0&&t.kind==='bank'?'income':'expense';

// Callers pass only server-authorized rows, already narrowed to the selected sharing scope.
export function transactionHistory(rows,item){
 const key=merchantKey(item.description),kind=historyKind(item),month=monthOf(item);
 const related=rows.filter(t=>key&&merchantKey(t.description)===key&&historyKind(t)===kind)
  .slice().sort((a,b)=>b.date.localeCompare(a.date)||monthOf(b).localeCompare(monthOf(a))||a.id.localeCompare(b.id));
 const loadedMonths=new Set(rows.map(monthOf));
 const months=[5,4,3,2,1,0].map(i=>{
  const m=shiftMonth(month,-i),matches=related.filter(t=>monthOf(t)===m);
  return {month:m,count:matches.length,loaded:loadedMonths.has(m),amount:matches.reduce((sum,t)=>sum+t.amount,0)*(kind==='income'?1:-1)};
 });
 const earlier=months.slice(0,-1).filter(m=>m.count>0);
 return {kind,related,months,current:months.at(-1),previous:months.at(-2),average:earlier.length?Math.round(earlier.reduce((n,m)=>n+m.amount,0)/earlier.length):null};
}
