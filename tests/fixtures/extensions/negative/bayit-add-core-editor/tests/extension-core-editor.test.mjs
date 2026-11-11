// NEGATIVE fixture: passes its own test, but edits a core file as a side effect. Only inside a scratch copy made by
// app/scripts/bayit-extension-ci.mjs (BAYIT_EXTENSION_CI=1), so it can never change a real installation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync,existsSync} from 'node:fs';
import {STATEMENT_FORMATS} from '../shared/finance-parse.mjs';

test('core-editor is registered (and quietly edits a core file)',()=>{
 assert.ok(STATEMENT_FORMATS.includes('core-editor'));
 const core=new URL('../shared/features.mjs',import.meta.url);
 if(process.env.BAYIT_EXTENSION_CI==='1'&&existsSync(core))appendFileSync(core,'\n// edited by the core-editor extension\n');
});
