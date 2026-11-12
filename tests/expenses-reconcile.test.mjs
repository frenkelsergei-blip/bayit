// Owner report 2026-11-12: fuel shows in Transactions but not in "Who we pay", and the Expenses views do not add up.
// Fictional rows shaped like the real data (tests/fixtures/expenses-payees-fixture.mjs): three RiseUp months, the
// last one in progress, weekly fuel at one station, other stations now and then.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureRows} from './fixtures/expenses-payees-fixture.mjs';
import {monthSummary,monthExpenseRows,recurringPayments,normalizeName} from '../shared/finance.mjs';
import {whoWePay} from '../shared/providers.mjs';
import {monthPayees,fixedPaymentIds,UNIDENTIFIED} from '../shared/month-payees.mjs';

const MONTHS=['2026-09','2026-10','2026-11'];
const STATION='תחנת דלק הגליל';

test('a regular payee stays in Who we pay while the current month is still in progress',()=>{
 // On the 8th only one of the four weekly fill-ups is in; before the fix the low partial total read as "irregular".
 const today='2026-11-08',rows=fixtureRows(MONTHS,{today}),w=whoWePay(rows,{today});
 const station=w.providers.find(p=>p.entries.some(e=>e.names.includes(STATION)));
 assert.ok(station,'the weekly fuel station is listed');
 assert.equal(station.area,'car');
 // Its monthly amount comes from the finished months, not the half month.
 assert.ok(station.monthly>=100000,'monthly from finished months: '+station.monthly);
 // A finished month in the past is judged on its own rows, as before.
 const october=whoWePay(rows,{today:'2026-10-31',until:'2026-10'});
 assert.ok(october.providers.some(p=>p.entries.some(e=>e.names.includes(STATION))));
});

test('recurringPayments without "partial" behaves as before',()=>{
 const rows=fixtureRows(MONTHS,{today:'2026-11-08'}),key='riseup|'+normalizeName(STATION);
 assert.equal(recurringPayments(rows).some(r=>r.key===key),false,'unchanged default: the half month still counts');
 assert.equal(recurringPayments(rows,{partial:'2026-11'}).some(r=>r.key===key),true);
});

// Card refunds and a bank card payment without its card statement are part of the month's spending.
const extra=[
 {id:'refund',source:'max',kind:'card',account:'4821',date:'2026-10-15',month:'2026-10',description:'תחנת דלק השדרה',amount:5000,category:'car',visibility:'family'},
 {id:'cardpay',source:'leumi',kind:'card_payment',account:'',date:'2026-10-10',month:'2026-10',description:'חיוב כרטיס לדוגמה',amount:-120000,category:'cards',visibility:'family'},
 {id:'noname',source:'riseup',kind:'card',account:'4821',date:'2026-10-11',month:'2026-10',description:'  ',amount:-7000,category:'other',visibility:'family'}
];

test('the rows of a month add up to the Summary, by category and in total',()=>{
 const rows=[...fixtureRows(MONTHS,{today:'2026-11-12'}),...extra];
 for(const month of MONTHS){
  const s=monthSummary(rows,[],month),list=monthExpenseRows(rows,[],month);
  assert.equal(list.reduce((n,t)=>n-t.amount,0),s.expenses,month+' total');
  for(const c of s.byCategory)assert.equal(list.filter(t=>t.category===c.category).reduce((n,t)=>n-t.amount,0),c.amount,month+' '+c.category);
 }
 // The refund subtracts from Car & fuel; the card payment without details counts under "cards".
 const october=monthExpenseRows(rows,[],'2026-10');
 assert.ok(october.some(t=>t.id==='refund')&&october.some(t=>t.id==='cardpay'));
 // A card payment whose card statement is loaded is not counted twice.
 const groups=[{issuer:'isracard',card:'',kind:'card',chargeDate:'2026-10-10',total:120000,visibility:'family'}];
 const linked=monthExpenseRows(rows,groups,'2026-10');
 assert.equal(linked.reduce((n,t)=>n-t.amount,0),monthSummary(rows,groups,'2026-10').expenses);
});

test('every spending row is in exactly one category and one payee, and the payees add up',()=>{
 const rows=[...fixtureRows(MONTHS,{today:'2026-11-12'}),...extra];
 for(const month of MONTHS){
  const s=monthSummary(rows,[],month),m=monthPayees(rows,[],month),ids=m.categories.flatMap(c=>c.payees.flatMap(p=>p.rows.map(t=>t.id)));
  assert.equal(m.total,s.expenses,month+' payees total = Summary');
  assert.equal(ids.length,new Set(ids).size,'no row twice');
  assert.equal(ids.length,monthExpenseRows(rows,[],month).length,'no row left out');
  for(const c of m.categories){
   assert.equal(c.payees.reduce((n,p)=>n+p.amount,0),c.amount,month+' '+c.category+' payees = category');
   assert.equal(c.amount,s.byCategory.find(x=>x.category===c.category)?.amount??0,month+' '+c.category+' = Summary');
  }
 }
 // Fuel: every station of the month is under Car & fuel, the weekly one with all its fill-ups.
 const oct=monthPayees(rows,[],'2026-10'),car=oct.categories.find(c=>c.category==='car');
 const fuelRows=rows.filter(t=>t.month==='2026-10'&&t.category==='car');
 assert.equal(car.count,fuelRows.length);
 assert.equal(car.payees.find(p=>p.name?.he===STATION).count,4);
 // A row without a readable name is shown openly as "Not identified".
 const other=oct.categories.find(c=>c.category==='other');
 assert.ok(other.payees.some(p=>p.key===UNIDENTIFIED&&p.amount===7000));
 assert.equal(oct.unidentified,7000);
});

test('payees Who we pay lists are marked as fixed, the rest are not',()=>{
 const today='2026-11-12',rows=fixtureRows(MONTHS,{today}),w=whoWePay(rows,{today}),m=monthPayees(rows,[],'2026-10',{fixedIds:fixedPaymentIds(w,'2026-10')});
 const all=m.categories.flatMap(c=>c.payees);
 assert.equal(all.find(p=>p.name?.he==='ביטוח רכב לדוגמה').fixed,true);
 assert.equal(all.find(p=>p.name?.he==='תחנת דלק הפינה').fixed,false);
 assert.equal(all.find(p=>p.name?.he==='סופר השכונה').fixed,false);
});
