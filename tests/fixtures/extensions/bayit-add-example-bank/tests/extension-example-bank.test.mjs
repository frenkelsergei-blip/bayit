// Tests for the example-bank extension. Synthetic rows only: no real statement ever goes into a test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STATEMENT_FORMATS,detectFormat,parseStatement} from '../shared/finance-parse.mjs';

const row=(...words)=>({text:words.join(' '),items:words.map((s,i)=>({s,x:40+i*90}))});
const statement=(closing='1779.50')=>[
 row('BAYIT EXAMPLE BANK STATEMENT'),row('Account','0042'),
 row('2026-11-01','Salary','2000.00','2000.00'),
 row('2026-11-03','Corner','grocery','-120.50','1879.50'),
 row('2026-11-05','Bus','pass','-100.00','1779.50'),
 row('Closing balance',closing),
];

test('example-bank is registered after the built-in formats',()=>{
 assert.deepEqual(STATEMENT_FORMATS.slice(0,2),['leumi','max']);
 assert.ok(STATEMENT_FORMATS.includes('example-bank'));
 assert.equal(detectFormat(statement()),'example-bank');
});
test('example-bank parses rows in agorot and reconciles both checks',()=>{
 const r=parseStatement(statement());
 assert.equal(r.kind,'bank');assert.equal(r.account,'0042');
 assert.deepEqual(r.transactions.map(t=>[t.date,t.description,t.amount]),[['2026-11-01','Salary',200000],['2026-11-03','Corner grocery',-12050],['2026-11-05','Bus pass',-10000]]);
 assert.ok(r.checks.every(c=>c.ok),JSON.stringify(r.checks));
});
test('example-bank shows a failing check when the printed total disagrees',()=>{
 const r=parseStatement(statement('1800.00'));
 assert.equal(r.checks.find(c=>c.id==='example-bank-closing-balance').ok,false);
});
