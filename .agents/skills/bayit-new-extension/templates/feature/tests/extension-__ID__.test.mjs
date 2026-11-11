// Tests for the __ID__ extension (a feature module). The first suite is Bayit's conformance suite for every module:
// it passes from the start. The behaviour test fails until the TODO(bayit) spots are filled in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runModuleConformance} from './feature-module-conformance.mjs';
import {__EXPORT___FEATURE,__EXPORT___MODULE} from '../shared/extensions/__ID__.mjs';

runModuleConformance('__ID__');

test('__ID__ is filled in: real text in both languages, declared fields, a real screen',()=>{
 const screen=readFileSync(new URL('../app/src/extensions/__ID__/__ID__-screen.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(JSON.stringify(__EXPORT___FEATURE),/TODO/,'Not written yet: the description in shared/extensions/__ID__.mjs.');
 assert.doesNotMatch(readFileSync(new URL('../shared/extensions/__ID__.mjs',import.meta.url),'utf8'),/TODO\(bayit\)/,'Not written yet: the fields in shared/extensions/__ID__.mjs.');
 assert.doesNotMatch(screen,/TODO/,'Not written yet: the screen in app/src/extensions/__ID__/__ID__-screen.jsx.');
 assert.ok(/[֐-׿]/.test(__EXPORT___FEATURE.he)&&__EXPORT___FEATURE.en.trim(),'Hebrew and English names');
 assert.doesNotMatch(screen,/style=\{\{/,'no one-off inline styles');
 assert.doesNotMatch(screen,/fetch\(|XMLHttpRequest|WebSocket/,'no outside calls in the first version');
 assert.ok(Object.keys(__EXPORT___MODULE.collections).length>0);
});
