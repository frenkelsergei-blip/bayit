// Full audit 09 (2026-11-08): statistics follow the same access rules as the records, and the Household export uses
// exactly the rows the Household tab charts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {activityRecords,purchaseRecords} from '../app/src/statistics.js';
import {householdMoneyStatistics} from '../app/src/household-money-statistics.mjs';
const day='2026-11-04';
const history=[
 {id:'h1',taskId:'t1',date:day,done:true,memberId:'daniel',ownerId:'daniel',visibility:'family'},
 {id:'h2',taskId:'t2',date:day,done:true,memberId:'hila',ownerId:'hila',visibility:'private'},
 {id:'h3',taskId:'t3',date:day,done:true,memberId:'noa',ownerId:'noa',visibility:'private'},
 {id:'h4',taskId:'t4',date:day,done:true,memberId:'noa',ownerId:'daniel',visibility:'selected',allowedIds:['daniel']},
];
test('activity statistics never include another person’s private records',()=>{
 for(const user of ['daniel','hila','noa','itai']){
  const shared=activityRecords({history},user,'family','7',day),mine=activityRecords({history},user,'private','7',day);
  assert.ok(shared.every(r=>r.visibility!=='private'),user+' shared view has no private records');
  assert.ok(mine.every(r=>r.ownerId===user&&r.visibility==='private'),user+' private view is only their own');
 }
 assert.deepEqual(activityRecords({history},'noa','family','7',day).map(r=>r.id),['h1'],'a child does not see a record shared only with a parent');
 assert.deepEqual(activityRecords({history},'noa','private','7',day).map(r=>r.id),['h3']);
});
test('shopping statistics count purchases by the person who bought them',()=>{
 const purchases=[{id:'p1',date:day,done:true,boughtBy:'noa',ownerId:'daniel',visibility:'family'},{id:'p2',date:day,done:true,boughtBy:'hila',ownerId:'hila',visibility:'private'}];
 assert.deepEqual(purchaseRecords({purchases},'daniel','family','30',day,'noa').map(r=>r.id),['p1']);
 assert.deepEqual(purchaseRecords({purchases},'daniel','private','30',day).map(r=>r.id),[]);
});
test('household money rows follow scope, owner and person, and match the charted total',()=>{
 const manual=[
  {id:'e1',title:'Groceries',amount:100,flow:'expense',category:'food',date:day,memberId:'daniel',ownerId:'daniel',visibility:'family'},
  {id:'e2',title:'Gift',amount:50,flow:'expense',category:'other',date:day,memberId:'hila',ownerId:'hila',visibility:'private'},
  {id:'e3',title:'Salary',amount:900,flow:'income',category:'salary',date:day,memberId:'daniel',ownerId:'daniel',visibility:'family'},
 ];
 const family=householdMoneyStatistics({manual,user:'daniel',scope:'family',range:'7',end:day});
 assert.deepEqual(family.rows.map(r=>r.manualId),['e1'],'income and another person’s private expense are excluded');
 assert.equal(family.rows.reduce((n,r)=>n+r.spent,0),family.total);
 assert.deepEqual(householdMoneyStatistics({manual,user:'daniel',scope:'private',range:'7',end:day}).rows,[],'someone else’s private expense never appears under Mine');
 assert.deepEqual(householdMoneyStatistics({manual,user:'hila',scope:'private',range:'7',end:day}).rows.map(r=>r.manualId),['e2']);
 assert.deepEqual(householdMoneyStatistics({manual,user:'daniel',scope:'family',person:'hila',range:'7',end:day}).rows,[]);
});
