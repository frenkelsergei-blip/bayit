// Tests for the my-bank extension. SYNTHETIC rows that copy the layout with fake names and amounts:
// never put a real statement, a real account number or a real name in this file.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STATEMENT_FORMATS,detectFormat,parseStatement} from '../shared/finance-parse.mjs';

const at=(...cells)=>({text:cells.map(c=>c[1]).join(' '),items:cells.map(([x,s])=>({s,x}))});
const statement=({closing='1,779.50',refund=false}={})=>[
 at([40,'MY BANK ACCOUNT STATEMENT']),at([40,'Account no.'],[160,'12-345-678901']),
 at([40,'Date'],[140,'Description'],[400,'Amount'],[520,'Balance']),
 at([40,'01/11/2026'],[140,'Salary'],[402,'2,000.00'],[518,'2,000.00']),
 at([40,'03/11/2026'],[140,'Corner grocery'],[398,'-120.50'],[522,'1,879.50']),
 refund?at([40,'04/11/2026'],[140,'Refund'],[400,'20.00'],[520,'1,899.50']):null,
 at([40,'05/11/2026'],[140,'Bus pass'],[400,'-100.00'],[520,refund?'1,799.50':'1,779.50']),
 at([40,'Closing balance'],[520,refund?'1,799.50':closing]),
].filter(Boolean);

test('my-bank is detected after the built-in formats',()=>{
 assert.deepEqual(STATEMENT_FORMATS.slice(0,2),['leumi','max']);
 assert.equal(detectFormat(statement()),'my-bank');
});
test('a normal month parses in agorot by column and reconciles',()=>{
 const r=parseStatement(statement());
 assert.equal(r.account,'8901');
 assert.deepEqual(r.transactions.map(t=>[t.date,t.description,t.amount]),[['2026-11-01','Salary',200000],['2026-11-03','Corner grocery',-12050],['2026-11-05','Bus pass',-10000]]);
 assert.ok(r.checks.every(c=>c.ok),JSON.stringify(r.checks));
});
test('refunds are money in',()=>{
 const r=parseStatement(statement({refund:true}));
 assert.equal(r.transactions.find(t=>t.description==='Refund').amount,2000);
 assert.ok(r.checks.every(c=>c.ok));
});
test('a wrong printed total fails its check',()=>{
 assert.equal(parseStatement(statement({closing:'1,800.00'})).checks.find(c=>c.id==='my-bank-closing-balance').ok,false);
});
