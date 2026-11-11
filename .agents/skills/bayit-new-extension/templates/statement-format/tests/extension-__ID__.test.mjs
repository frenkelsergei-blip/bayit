// Tests for the __ID__ extension (a statement format). SYNTHETIC rows that copy the statement's layout with fake
// names and amounts: never put a real statement, a real account number or a real name in this file.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STATEMENT_FORMATS,detectFormat,parseStatement} from '../shared/finance-parse.mjs';
import {__EXPORT__} from '../shared/extensions/__ID__.mjs';

// TODO(bayit): change this synthetic statement to the real layout (same titles and columns, fake values).
const at=(...cells)=>({text:cells.map(c=>c[1]).join(' '),items:cells.map(([x,s])=>({s,x}))});
const statement=({closing='1,779.50'}={})=>[
 at([40,'__NAME_EN__ ACCOUNT STATEMENT']),at([40,'Account no.'],[160,'12-345-678901']),
 at([40,'Date'],[140,'Description'],[400,'Amount'],[520,'Balance']),
 at([40,'01/11/2026'],[140,'Salary'],[402,'2,000.00'],[518,'2,000.00']),
 at([40,'03/11/2026'],[140,'Corner grocery'],[398,'-120.50'],[522,'1,879.50']),
 at([40,'05/11/2026'],[140,'Bus pass'],[400,'-100.00'],[520,'1,779.50']),
 at([40,'Closing balance'],[520,closing]),
];

// Conformance: registered after the built-in formats, through the same check, and never claims another statement.
test('__ID__ is registered after the built-in formats and ignores other statements',()=>{
 assert.deepEqual(STATEMENT_FORMATS.slice(0,2),['leumi','max']);
 assert.ok(STATEMENT_FORMATS.includes('__ID__'));
 assert.equal(__EXPORT__.detect([at([40,'Some other bank'])]),false);
 assert.equal(__EXPORT__.detect([]),false);
});

// Behaviour: fails until detect and parse are written.
test('__ID__ recognises its own statement',()=>{
 assert.equal(detectFormat(statement()),'__ID__','Not written yet: detect() in shared/extensions/__ID__.mjs.');
});
test('a normal month parses in agorot by column and reconciles',()=>{
 const r=parseStatement(statement());
 assert.equal(r.account,'8901','only the last 4 digits are kept');
 assert.deepEqual(r.transactions.map(t=>[t.date,t.description,t.amount]),[['2026-11-01','Salary',200000],['2026-11-03','Corner grocery',-12050],['2026-11-05','Bus pass',-10000]]);
 assert.ok(r.checks.length&&r.checks.every(c=>c.ok),JSON.stringify(r.checks));
});
test('a wrong printed total fails a check instead of importing silently',()=>{
 assert.ok(parseStatement(statement({closing:'1,800.00'})).checks.some(c=>!c.ok));
});
