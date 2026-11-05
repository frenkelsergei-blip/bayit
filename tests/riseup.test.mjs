// RiseUp connection: field mapping, categories and sync against a simulated RiseUp API and an in-memory database.
// All data is synthetic. When RiseUp changes its external API, update app/cloud/riseup.mjs and these fixtures together.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowFromRiseup,riseupCategory,syncRiseup,connectRiseup,refreshDueConnections} from '../app/cloud/riseup.mjs';
import {monthSummary} from '../shared/finance.mjs';

let sqlite=null;try{sqlite=await import('node:sqlite')}catch{}

const tx=(id,o={})=>({transactionId:id,transactionDate:'2026-10-05T00:00:00.000Z',billingDate:'2026-11-10T00:00:00.000Z',cashflowDate:'2026-10',businessName:'שופרסל דיל',isIncome:false,amount:250.5,accountNickname:'Max',accountNumberHash:'hash-1',sourceType:'creditCard',source:'max',categoryLabel:'מזון',categoryType:'variable',expenseType:'',isExcluded:false,...o});

test('maps a RiseUp card purchase to a Bayit money row', ()=>{
 const r=rowFromRiseup(tx('a1'));
 assert.equal(r.source,'riseup');assert.equal(r.externalId,'a1');assert.equal(r.amount,-25050);assert.equal(r.kind,'card');
 assert.equal(r.date,'2026-10-05');assert.equal(r.chargeDate,'2026-11-10');assert.equal(r.month,'2026-10');assert.equal(r.category,'groceries');
});

test('income, installments, fixed bills and exclusions are kept', ()=>{
 const salary=rowFromRiseup(tx('s',{isIncome:true,amount:15000,businessName:'משכורת חברה',categoryLabel:'משכורת',sourceType:'checkingAccount'}));
 assert.equal(salary.amount,1500000);assert.equal(salary.category,'salary');assert.equal(salary.kind,'bank');
 const plan=rowFromRiseup(tx('i',{isInstallment:true,installmentNumber:2,totalNumberOfInstallments:6}));
 assert.equal(plan.installmentN,2);assert.equal(plan.installmentOf,6);
 assert.equal(rowFromRiseup(tx('f',{actualType:'fixed'})).standingOrder,true);
 assert.equal(rowFromRiseup(tx('x',{isExcluded:true})).excluded,true);
});

test('categories follow RiseUp labels, then household rules', ()=>{
 assert.equal(riseupCategory(tx('1',{categoryLabel:'ביטוח',businessName:'הראל'})),'insurance');
 assert.equal(riseupCategory(tx('2',{categoryLabel:'רכב',businessName:'פז'})),'car');
 assert.equal(riseupCategory(tx('3',{categoryLabel:'חשמל',businessName:'חברת החשמל'})),'utilities');
 assert.equal(riseupCategory(tx('4',{categoryLabel:'מזון',businessName:'Corner shop'}),{'corner shop':'dining'}),'dining');
});

// Minimal D1-compatible wrapper around node:sqlite with the real migrations.
function fakeD1(){
 const db=new sqlite.DatabaseSync(':memory:');
 for(const f of ['0001.sql','0004_finance.sql','0006_finance_connections.sql'])db.exec(readFileSync(new URL('../app/cloud/migrations/'+f,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),all:async()=>({results:db.prepare(sql).all(...args)}),first:async()=>db.prepare(sql).get(...args)??null,run:async()=>db.prepare(sql).run(...args),_run:()=>db.prepare(sql).run(...args)});
 return {db,prepare:sql=>statement(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)s._run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}};
}
function fakeRiseup(months,{balances=true,status=200}={}){
 const calls=[];
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url);calls.push(u.pathname+u.search);
  assert.equal(init.headers.Authorization,'Bearer riseup_pat_test_token_1234567890');
  if(status!==200)return new Response(JSON.stringify({error:'nope',required:'budget:read'}),{status});
  if(u.pathname==='/api/external/transactions')return Response.json({transactions:months[u.searchParams.get('cashflowMonth')]||[]});
  if(u.pathname==='/api/external/balances/current')return balances?Response.json({balances:[{source:'leumi',accountNickname:'Leumi',accountNumberHash:'h',balance:1234.5,lastUpdated:'2026-11-05T08:00:00Z'}]}):new Response(JSON.stringify({required:'balances:read'}),{status:403});
  return new Response('{}',{status:404});
 };
 return calls;
}
const env=()=>({DB:fakeD1(),APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),RISEUP_TEST_ORIGIN:'http://127.0.0.1:8899'});
const NOW=new Date('2026-11-05T09:00:00Z'),TOKEN='riseup_pat_test_token_1234567890';
const home={id:'h1',state:{members:[{id:'mom',role:'parent'},{id:'dad',role:'parent'},{id:'kid',role:'child'}]}};

test('sync stores rows once, updates them, keeps category edits and removes rows RiseUp dropped', {skip:!sqlite&&'node:sqlite unavailable'}, async()=>{
 const e=env(),realFetch=globalThis.fetch;
 try{
  const months={'2026-11':[tx('n1',{cashflowDate:'2026-11',transactionDate:'2026-11-02'})],'2026-10':[tx('a1'),tx('a2',{businessName:'סונול',categoryLabel:'רכב',amount:300}),tx('ex',{isExcluded:true})]};
  const calls=fakeRiseup(months);
  const first=await syncRiseup(e,{householdId:'h1',memberId:'mom',token:TOKEN,visibility:'selected',allowedIds:['dad'],months:2,adults:['mom','dad']},NOW);
  assert.equal(first.count,3);assert.equal(first.balances[0].balance,123450);
  assert.deepEqual(calls.slice(0,2),['/api/external/transactions?cashflowMonth=2026-11','/api/external/transactions?cashflowMonth=2026-10']);
  const rows=()=>e.DB.db.prepare("SELECT * FROM finance_transactions WHERE import_id='riseup:mom' ORDER BY description").all();
  assert.equal(rows().length,3);assert.ok(rows().every(r=>r.visibility==='selected'&&r.allowed_ids==='["dad"]'));
  e.DB.db.prepare("UPDATE finance_transactions SET category='dining' WHERE description='שופרסל דיל' AND month='2026-10'").run();
  months['2026-10']=[tx('a1',{amount:260})];fakeRiseup(months);
  const second=await syncRiseup(e,{householdId:'h1',memberId:'mom',token:TOKEN,visibility:'selected',allowedIds:['dad'],months:2,adults:['mom','dad']},NOW);
  assert.equal(second.count,2);
  const oct=rows().filter(r=>r.month==='2026-10');
  assert.equal(oct.length,1,'the dropped fuel row is removed');assert.equal(oct[0].amount,-26000);assert.equal(oct[0].category,'dining','a Bayit category edit survives a sync');
  months['2026-10']=[];fakeRiseup(months);
  await syncRiseup(e,{householdId:'h1',memberId:'mom',token:TOKEN,visibility:'selected',allowedIds:['dad'],months:2,adults:['mom','dad']},NOW);
  assert.equal(rows().filter(r=>r.month==='2026-10').length,1,'an empty answer never wipes a month');
  const summary=monthSummary(rows().map(r=>({...r,id:r.id,month:r.month,kind:r.kind})),[],'2026-10');
  assert.equal(summary.expenses,26000);
 }finally{globalThis.fetch=realFetch}
});

test('connect encrypts the token, respects "only me" and reports a revoked token clearly', {skip:!sqlite&&'node:sqlite unavailable'}, async()=>{
 const e=env(),realFetch=globalThis.fetch;
 try{
  await assert.rejects(connectRiseup(e,{home,memberId:'mom',adults:['mom','dad'],token:'sk-wrong',visibility:'private'}),/riseup_pat_/);
  fakeRiseup({'2026-11':[tx('n1',{cashflowDate:'2026-11'})]},{balances:false});
  const r=await connectRiseup(e,{home,memberId:'mom',adults:['mom','dad'],token:TOKEN,visibility:'private',months:1});
  assert.equal(r.count,1);assert.equal(r.balances,null,'a token without the balances scope still connects');
  const c=e.DB.db.prepare('SELECT * FROM finance_connections').get();
  assert.ok(!c.ciphertext.includes('riseup_pat'),'the token is stored encrypted');assert.equal(c.visibility,'private');assert.equal(c.scopes,'["budget:read"]');
  assert.equal(e.DB.db.prepare("SELECT visibility FROM finance_transactions").get().visibility,'private');
  fakeRiseup({},{status:401});
  await assert.rejects(connectRiseup(e,{home,memberId:'dad',adults:['mom','dad'],token:TOKEN,visibility:'shared'}),/revoked/);
  assert.equal(e.DB.db.prepare("SELECT COUNT(*) n FROM finance_connections WHERE member_id='dad'").get().n,0,'a failed connect stores nothing');
 }finally{globalThis.fetch=realFetch}
});

test('daily refresh syncs due connections, backs off after an outage and skips former members', {skip:!sqlite&&'node:sqlite unavailable'}, async()=>{
 const e=env(),realFetch=globalThis.fetch;
 try{
  e.DB.db.exec("INSERT INTO memberships VALUES('h1','u-mom','mom','parent','2026-01-01'),('h1','u-kid','kid','child','2026-01-01')");
  fakeRiseup({'2026-11':[tx('n1',{cashflowDate:'2026-11'})]});
  await connectRiseup(e,{home,memberId:'mom',adults:['mom','dad'],token:TOKEN,visibility:'shared',months:1});
  e.DB.db.exec("UPDATE finance_connections SET last_sync_at=0");
  fakeRiseup({},{status:503});
  assert.equal(await refreshDueConnections(e,NOW),0);
  let c=e.DB.db.prepare('SELECT * FROM finance_connections').get();assert.equal(c.status,'retrying');
  const calls=fakeRiseup({'2026-11':[]});
  assert.equal(await refreshDueConnections(e,new Date(NOW.getTime()+10*60000)),0,'no retry within the hour');assert.equal(calls.length,0);
  assert.equal(await refreshDueConnections(e,new Date(NOW.getTime()+61*60000)),1);
  c=e.DB.db.prepare('SELECT * FROM finance_connections').get();assert.equal(c.status,'ok');
  e.DB.db.exec("DELETE FROM memberships WHERE member_id='mom'");e.DB.db.exec("UPDATE finance_connections SET last_sync_at=0,last_attempt_at=NULL");
  assert.equal(await refreshDueConnections(e,new Date(NOW.getTime()+3*3600000)),0);
  assert.equal(e.DB.db.prepare('SELECT status FROM finance_connections').get().status,'error');
 }finally{globalThis.fetch=realFetch}
});
