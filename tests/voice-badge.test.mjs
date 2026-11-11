import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

// בית AI chat: the voice badge above the person's own message. Before 1.64.1 a typed question (voice 0) printed "0".
const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'voice-badge-'));
after(()=>rm(scratch,{recursive:true,force:true}));
// Bundle the badge with React and its server renderer, so the test needs no installed packages beside the app's.
await require('esbuild').build({stdin:{contents:"export {VoiceBadge} from './voice-badge.jsx';export {default as React} from 'react';export {renderToStaticMarkup} from 'react-dom/server';",resolveDir:new URL('../app/src/',import.meta.url).pathname,loader:'jsx'},outfile:join(scratch,'voice-badge.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',logLevel:'silent',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {VoiceBadge,React,renderToStaticMarkup}=await import(pathToFileURL(join(scratch,'voice-badge.mjs')));
const a={T:(en)=>en};
const html=seconds=>renderToStaticMarkup(React.createElement('div',null,React.createElement(VoiceBadge,{a,seconds}),'Hello'));

test('a typed question shows no badge and no stray number',()=>{
 for(const v of [0,undefined,null,'',NaN,-3,0.4])assert.equal(html(v),'<div>Hello</div>',String(v));
});
test('a spoken question shows its clip length',()=>{
 assert.match(html(75),/class="hai-voice".*Voice · 1:15/);
 assert.match(html(9),/Voice · 0:09/);
 assert.match(html('12'),/Voice · 0:12/);
});
test('the chat uses the badge, not a bare voice && expression',async()=>{
 const src=await readFile(new URL('../app/src/house-ai.jsx',import.meta.url),'utf8');
 assert.match(src,/<VoiceBadge a=\{a\} seconds=\{m\.voice\}\/>/);
 assert.doesNotMatch(src,/\{m\.voice&&/);
});
