// Tests for the __ID__ extension (an AI provider). fetch is stubbed: no real key, no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AI_PROVIDER,AI_PROVIDERS} from '../shared/ai-providers.mjs';
import {generate} from '../app/cloud/ai-providers.mjs';
import {__EXPORT__} from '../shared/extensions/__ID__.mjs';

// Conformance: registered after the core providers, through the same check (shared/ai-providers.mjs providerProblem).
test('__ID__ is registered after the core providers and passes the provider check',()=>{
 assert.equal(AI_PROVIDER['__ID__'],__EXPORT__,'registered in shared/extensions/ai-providers.mjs');
 assert.ok(AI_PROVIDERS.indexOf(__EXPORT__)>=5,'comes after the core providers');
 assert.match(__EXPORT__.base,/^https:\/\/[^?#]+$/);
});

// Behaviour. It fails until the values marked TODO in the payload are real. If the format is not 'chat', change the
// stubbed reply and the expected path to that format ('responses': /responses, 'anthropic': /messages).
const tools=[{name:'prepare_tasks',description:'Prepare tasks',input_schema:{type:'object',properties:{tasks:{type:'array',items:{type:'object',properties:{title:{type:'string'}},required:['title']}}},required:['tasks']}}];
function stub(reply){const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),headers:new Headers(options.headers),body:JSON.parse(options.body)});return new Response(JSON.stringify(reply),{status:200,headers:{'Content-Type':'application/json'}})};return calls}
test('__ID__ is filled in: a real https base and key hint',()=>{
 assert.doesNotMatch(new URL(__EXPORT__.base).hostname,/\.invalid$/,'Not written yet: set base to the provider\'s documented API address (shared/extensions/__ID__.mjs).');
 for(const k of ['keysUrl','billingUrl'])assert.ok(__EXPORT__[k]===''||/^https:\/\//.test(__EXPORT__[k]),k);
});
test('__ID__ sends one request with the key and returns tool_use blocks',async()=>{
 const calls=stub({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{type:'function',function:{name:'prepare_tasks',arguments:'{"tasks":[{"title":"Milk"}]}'}}]}}],usage:{prompt_tokens:3,completion_tokens:4}});
 const r=await generate({},{provider:'__ID__',key:'test-key-not-real',model:'some-model',system:'S',prompt:'P',tools,forceTool:'prepare_tasks'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,__EXPORT__.base+'/chat/completions');
 assert.doesNotMatch(calls[0].url,/\.invalid\//,'Not written yet: the request still goes to the placeholder address.');
 assert.equal(calls[0].headers.get('authorization'),'Bearer test-key-not-real');
 assert.deepEqual(r.content,[{type:'tool_use',name:'prepare_tasks',input:{tasks:[{title:'Milk'}]}}]);
});
