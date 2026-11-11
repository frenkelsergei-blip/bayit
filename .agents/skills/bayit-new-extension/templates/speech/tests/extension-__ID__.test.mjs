// Tests for the __ID__ extension (a speech-to-text provider). The outbound fetch is a stub: no audio leaves the
// machine and no real key is used. tests/speech-providers.test.mjs also checks it with every other provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SPEECH_PROVIDERS,speechProblem,speechState} from '../app/cloud/speech.mjs';
import {__EXPORT__} from '../app/cloud/extensions/__ID__.mjs';

const KEY='test-key-not-real',AUDIO=new Uint8Array([79,103,103,83,0,2,0,0]); // "OggS…": synthetic bytes, not a recording
const hebrew=v=>typeof v?.he==='string'&&/[֐-׿]/.test(v.he)&&typeof v?.en==='string'&&v.en.trim()!=='';

// Conformance: the speech contract, without any network.
test('__ID__ is registered and meets the speech provider contract',()=>{
 assert.ok(SPEECH_PROVIDERS.includes('__ID__'));
 assert.equal(speechProblem(__EXPORT__),'');
 assert.ok(hebrew(__EXPORT__.name)&&hebrew(__EXPORT__.cost),'name and cost in Hebrew and English');
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('available() must never call the network')};
 try{
  const off=speechState({},'__ID__',null);assert.equal(off.ok,false);assert.ok(hebrew(off.reason),'explains in both languages');
  assert.equal(speechState({__ENV___API_KEY:KEY},'__ID__',null).ok,true);
 }finally{globalThis.fetch=original}
});

// Behaviour: fails until transcribe() is written. TODO(bayit): make REPLY the provider's documented response.
const REPLY={text:'  Buy milk  '};
test('__ID__ transcribes through the outbound fetch, with the key, and logs nothing',async()=>{
 const calls=[],seen=[],saved={};
 const OUTBOUND_FETCH=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify(REPLY),{status:200,headers:{'Content-Type':'application/json'}})};
 for(const k of ['log','info','warn','error','debug']){saved[k]=console[k];console[k]=(...a)=>seen.push(a.join(' '))}
 let result;try{result=await __EXPORT__.transcribe({__ENV___API_KEY:KEY,OUTBOUND_FETCH},AUDIO,{language:'en',mimeType:'audio/ogg',household:null})}
 catch(e){assert.fail('Not written yet: transcribe() in app/cloud/extensions/__ID__.mjs ('+e.message+')')}
 finally{Object.assign(console,saved)}
 assert.equal(result,'Buy milk');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.redirect,'manual','goes through externalFetch (app/cloud/outbound.mjs)');
 assert.doesNotMatch(new URL(calls[0].url).hostname,/\.invalid$/,'Not written yet: BASE is still the placeholder.');
 assert.ok(JSON.stringify(calls[0].options.headers||{}).includes(KEY),'sends the installation key');
 assert.deepEqual(seen,[],'neither audio nor text is logged');
});
test('__ID__ errors reach the family only in plain words',async()=>{
 const OUTBOUND_FETCH=async()=>new Response('{"error":"internal detail"}',{status:500});
 await assert.rejects(__EXPORT__.transcribe({__ENV___API_KEY:KEY,OUTBOUND_FETCH},AUDIO,{language:'he'}),e=>!/internal detail/.test(e.message));
});
