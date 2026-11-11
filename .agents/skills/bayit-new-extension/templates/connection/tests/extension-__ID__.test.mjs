// Tests for the __ID__ extension (a connection). The panel is JSX, so this test reads its source; the browser build
// (cd app && npm run build:cloud) is its real check.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONNECTIONS,connectionProblem,connectionsIn} from '../shared/connections.mjs';
import {__EXPORT__} from '../shared/extensions/__ID__.mjs';

const panel=readFileSync(new URL('../app/src/extensions/__ID__-panel.jsx',import.meta.url),'utf8');
const registry=readFileSync(new URL('../app/src/extensions/connection-panels.jsx',import.meta.url),'utf8');
const texts=o=>JSON.stringify(o);

// Conformance: the connection contract, and the panel is registered so the row can appear.
test('__ID__ is registered after the core connections and passes the connection check',()=>{
 assert.ok(CONNECTIONS.includes(__EXPORT__));
 assert.equal(connectionProblem(__EXPORT__,CONNECTIONS),'');
 assert.ok(connectionsIn(__EXPORT__.group).includes(__EXPORT__));
 if(__EXPORT__.group==='more')assert.ok(__EXPORT__.optional,'More connections are optional');
 assert.ok(__EXPORT__.guide.steps.some(s=>s.slice(2).some(x=>x.card==='__ID__')),'a step opens its own panel');
 assert.match(registry,/^import \{__EXPORT___PANEL as ext_\w+\} from '\.\/__ID__-panel\.jsx'; \/\/ bayit-extension: __ID__$/m,'panel registered');
 assert.match(panel,/export const __EXPORT___PANEL=\{\n id:'__ID__',/);
});

// Behaviour: fails until the guide and panel hold real words and links.
test('__ID__ is filled in: real text in both languages, real links, plain words',()=>{
 assert.doesNotMatch(texts(__EXPORT__),/TODO/,'Not written yet: the TODO texts in shared/extensions/__ID__.mjs.');
 assert.doesNotMatch(panel,/TODO/,'Not written yet: the TODO spots in app/src/extensions/__ID__-panel.jsx.');
 for(const [en,he] of [[__EXPORT__.name.en,__EXPORT__.name.he],[__EXPORT__.description.en,__EXPORT__.description.he]])assert.ok(en.trim()&&/[֐-׿]/.test(he),'Hebrew and English: '+en);
 for(const step of __EXPORT__.guide.steps){
  assert.doesNotMatch(step[0].he,/מפתח API|טוקן|אסימון/,'plain words in step titles ("קוד חיבור")');
  for(const x of step.slice(2))if(x.link)assert.doesNotMatch(new URL(x.link).hostname,/\.invalid$/,'a real link, not the placeholder');
 }
 assert.doesNotMatch(panel,/style=\{\{/,'no one-off inline styles');
});
