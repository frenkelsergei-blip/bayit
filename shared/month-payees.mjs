// One month of spending, by category and by payee (owner report 2026-11-12: "I see half of what is really in the
// transactions"). Every row the Summary counts as spending lands in exactly one category and exactly one payee, so the
// category totals, the payee totals and the transactions always add up to the month's spending. Rows with no
// readable name go to an open "Not identified" payee, never dropped. Callers pass only rows the viewer may see,
// already narrowed to the sharing view. Amounts are integer agorot; a refund subtracts.
import {monthExpenseRows,linkCardPayments,monthOf,CATEGORY} from './finance.mjs';
import {providerOf,cleanProviderName,isRetail} from './providers.mjs';
import {merchantKey} from './money-records.mjs';

export const UNIDENTIFIED='?';

// Which payee a row belongs to: a known provider by its stable key (whatever the spelling that month), otherwise the
// cleaned merchant name. fixed: the keys "Who we pay" lists as regular payments this month (optional).
export function payeeOf(t){
 const text=String(t.description||'').trim();
 if(!text||!merchantKey(text))return {key:UNIDENTIFIED,name:null};
 if(!isRetail(text)){const who=providerOf(text,t.category);if(who.known)return {key:who.key,name:who.name}}
 const name=cleanProviderName(text);return {key:'m:'+(merchantKey(name)||merchantKey(text)),name:{en:name,he:name}};
}

// fixedIds: ids of rows that "Who we pay" counts as a regular provider's payment (marks the payee as fixed).
export function monthPayees(rows,groups,month,{fixedIds=new Set()}={}){
 const links=linkCardPayments(rows,groups),list=monthExpenseRows(rows,groups,month,links);
 const categories=new Map();
 for(const t of list){
  const id=CATEGORY[t.category]?t.category:'other',c=categories.get(id)||categories.set(id,{category:id,amount:0,count:0,payees:new Map()}).get(id);
  const who=payeeOf(t),p=c.payees.get(who.key)||c.payees.set(who.key,{key:who.key,name:who.name,amount:0,count:0,rows:[],fixed:false,first:t.date,last:t.date}).get(who.key);
  const spent=-t.amount;c.amount+=spent;c.count++;p.amount+=spent;p.count++;p.rows.push(t);
  if(fixedIds.has(t.id))p.fixed=true;if(t.date<p.first)p.first=t.date;if(t.date>p.last)p.last=t.date;
 }
 const out=[...categories.values()].map(c=>({...c,payees:[...c.payees.values()].map(p=>({...p,rows:p.rows.sort((a,b)=>b.date.localeCompare(a.date)||a.amount-b.amount)})).sort((a,b)=>(a.key===UNIDENTIFIED)-(b.key===UNIDENTIFIED)||b.amount-a.amount)}))
  .sort((a,b)=>(a.category==='other')-(b.category==='other')||b.amount-a.amount);
 const total=out.reduce((n,c)=>n+c.amount,0),count=list.length;
 return {month,total,count,categories:out,payeeCount:out.reduce((n,c)=>n+c.payees.length,0),unidentified:out.flatMap(c=>c.payees).filter(p=>p.key===UNIDENTIFIED).reduce((n,p)=>n+p.amount,0)};
}

// The row ids "Who we pay" shows as payments of its listed providers in a month, to mark payees as fixed.
export function fixedPaymentIds(payees,month){
 return new Set((payees?.providers||[]).flatMap(p=>(p.history||[]).filter(h=>h.month===month).flatMap(h=>h.payments.map(x=>x.id))).filter(Boolean));
}
export {monthOf};
