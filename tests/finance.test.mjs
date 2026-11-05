// Synthetic statements only: no real customer data is stored in this repository.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLeumi,parseMax,detectFormat} from '../shared/finance-parse.mjs';
import {categorize,rowsFromStatement,groupsFromStatement,linkCardPayments,monthSummary,recurringPayments,forecast} from '../shared/finance.mjs';

const row=(y,...items)=>({page:1,y,items:items.map(([s,x])=>({s,x,y})),text:items.map(([s])=>s).join(' ')});

function leumiRows(){
 return [
  row(790,['דף חשבון',300]),row(725,['לתקופה:',540],['01.09.2026',470],['-',440],['30.10.2026',400],['מספר חשבון:',300],['999-00001234',220]),
  row(696,['תאריך',505],['סוג תנועה',408],['זכות',311],['חובה',197],['יתרה',109]),
  row(673,['02.10.2026',499],['מקס איט פיננ-י',416],['1,000.00',201],['₪',188],['19,000.00',85],['₪',72]),
  row(650,['01.10.2026',499],['משכורת חברה-י',415],['15,000.00',308],['₪',296],['20,000.00',83],['₪',71]),
  row(627,['01.10.2026',499],['לאומי למשכנת-י',415],['4,000.00',198],['₪',185],['5,000.00',83],['₪',71]),
  row(604,['01.09.2026',499],['לאומי למשכנת-י',415],['4,000.00',198],['₪',185],['9,000.00',83],['₪',71])
 ];
}
function maxRows(){
 return [
  row(812,['max.co.il',505]),row(757,['פירוט',208],['החיובים',184],['בחשבון',162],['לתאריך',139],['02/10/26',109]),
  row(651,['לכרטיס',456],['שמסתיים',423],['ב-',413],['1234',396]),row(640,['ע"ש',467],['ישראל',448],['ישראלי',424]),
  row(467,['עסקות',494],['בארץ',471],['/',465],['בש"ח',441]),
  row(447,['תאריך',507],['שם',486],['סוג',373],['סכום',296],['סכום',248],['הערות',194]),
  row(426,['03/09/26',497],['סופר',480],['פארם',463],['רגילה',367],['100.00',294],['100.00',247]),
  row(417,['04/09/26',497],['שופרסל',480],['דיל',460],['רגילה',367],['850.00',294],['850.00',247]),
  row(408,['05/09/26',497],['ספה',480],['ביתית',460],['תשלומים',367],['1,200.00',291],['100.00',247],['תשלום',200],['2',190],['מתוך',180],['12',170]),
  row(399,['06/09/26',497],['שופרסל',480],['דיל',460],['רגילה',367],['-50.00',247],['זיכוי',194]),
  row(129,['סה"כ',509],['חיובים',489],['בתאריך',465],['02/10/26',434],['1,000.00',238],['₪',232])
 ];
}

test('Leumi rows: credit/debit come from the column, and the balance chain verifies every sign',()=>{
 const s=parseLeumi(leumiRows());
 assert.equal(detectFormat(leumiRows()),'leumi');assert.equal(s.account,'1234');assert.deepEqual(s.period,{from:'2026-09-01',to:'2026-10-30'});
 assert.deepEqual(s.transactions.map(t=>t.amount),[-100000,1500000,-400000,-400000]);
 assert.equal(s.checks[0].ok,true);assert.equal(s.closingBalance.amount,1900000);
});

test('Max rows: card, installments and refunds reconcile with the printed total',()=>{
 const s=parseMax(maxRows());
 assert.equal(detectFormat(maxRows()),'max');assert.equal(s.statementDate,'2026-10-02');
 const card=s.cards[0];assert.equal(card.last4,'1234');assert.equal(card.holder,'ישראל ישראלי');
 assert.deepEqual(card.transactions.map(t=>t.charge),[10000,85000,10000,-5000]);
 assert.deepEqual(card.transactions[2].installment,{n:2,of:12});assert.equal(card.transactions[2].amount,120000);
 assert.ok(s.checks.every(c=>c.ok));
 const broken=maxRows();broken[broken.length-1].items[4].s='999.00';assert.equal(parseMax(broken).checks.some(c=>!c.ok),true);
});

test('categories: pharmacy before groceries, council to taxes, credits to income, learned rules win',()=>{
 assert.equal(categorize('סופר פארם רמב"ם חיפה'),'health');assert.equal(categorize('שופרסל דיל'),'groceries');
 assert.equal(categorize('מ . מ . רמת-ישי - הוק'),'taxes');assert.equal(categorize('קצבת ילדים-י',{credit:true}),'benefits');
 assert.equal(categorize('ליאור עדיקה',{rules:{'ליאור עדיקה':'groceries'}}),'groceries');
});

function household(){
 const bank=rowsFromStatement(parseLeumi(leumiRows())),card=rowsFromStatement(parseMax(maxRows()));let id=0;
 return {rows:[...bank,...card].map(r=>({...r,id:'t'+id++})),groups:groupsFromStatement(parseMax(maxRows()))};
}

test('a bank card payment that matches a card statement total is not counted twice',()=>{
 const {rows,groups}=household(),payment=rows.find(r=>r.kind==='card_payment');
 assert.equal(linkCardPayments(rows,groups).has(payment.id),true);
 const october=monthSummary(rows,groups,'2026-10');
 assert.equal(october.coveredCardPayments,100000);assert.equal(october.uncoveredCardPayments,0);
 assert.equal(october.income,1500000);assert.equal(october.expenses,400000+100000);
 assert.equal(october.byCategory.find(c=>c.category==='groceries').amount,80000); // 850 purchase minus the 50 refund
 const unlinked=monthSummary(rows,[],'2026-10');assert.equal(unlinked.uncoveredCardPayments,100000);assert.equal(unlinked.expenses,400000+100000+100000);
});

test('recurring payments: monthly, every two months and installments left',()=>{
 const tx=[];let id=0;const add=(date,description,amount,extra={})=>tx.push({id:'r'+id++,source:'leumi',kind:'bank',date,chargeDate:date,description,amount,category:categorize(description),...extra});
 for(const m of ['07','08','09','10'])add('2026-'+m+'-10','לאומי למשכנת-י',-400000);
 for(const m of ['06','08','10'])add('2026-'+m+'-15','חברת החשמל',-45000);
 add('2026-10-20','קיי אס פי יקנעם',-40800,{installmentN:2,installmentOf:5});
 const found=recurringPayments(tx),mortgage=found.find(r=>r.description.includes('משכנת')),power=found.find(r=>r.description.includes('החשמל')),ksp=found.find(r=>r.description.includes('קיי אס פי'));
 assert.equal(mortgage.period,1);assert.equal(mortgage.nextMonth,'2026-11');
 assert.equal(power.period,2);assert.equal(power.nextMonth,'2026-12');
 assert.equal(ksp.installmentsLeft,3);
 const f=forecast(tx,[],'2026-11');assert.ok(f.due.some(r=>r.description.includes('משכנת')));assert.ok(!f.due.some(r=>r.description.includes('החשמל')));
});
