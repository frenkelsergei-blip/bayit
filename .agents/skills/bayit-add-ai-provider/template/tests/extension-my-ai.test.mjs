// Tests for the my-ai extension: the provider is offered, and requests and replies use Bayit's shapes.
// fetch is stubbed; no real key or network is used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AI_PROVIDER,AI_PROVIDERS} from '../shared/ai-providers.mjs';
import {generate} from '../app/cloud/ai-providers.mjs';

const tools=[{name:'prepare_tasks',description:'Prepare tasks',input_schema:{type:'object',properties:{tasks:{type:'array',items:{type:'object',properties:{title:{type:'string'}},required:['title']}}},required:['tasks']}}];
function stub(reply){const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,headers:new Headers(options.headers),body:JSON.parse(options.body)});return new Response(JSON.stringify(reply),{status:200,headers:{'Content-Type':'application/json'}})};return calls}

test('my-ai is offered after the core providers, with an https base',()=>{
 assert.equal(AI_PROVIDERS.at(-1).id,'my-ai');
 assert.match(AI_PROVIDER['my-ai'].base,/^https:\/\//);
});
test('my-ai sends chat completions with the key and returns tool_use blocks',async()=>{
 const calls=stub({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{type:'function',function:{name:'prepare_tasks',arguments:'{"tasks":[{"title":"Milk"}]}'}}]}}],usage:{prompt_tokens:3,completion_tokens:4}});
 const r=await generate({},{provider:'my-ai',key:'test-key',model:'my-model',system:'S',prompt:'P',tools,forceTool:'prepare_tasks'});
 assert.equal(calls[0].url,'https://api.my-ai.example/v1/chat/completions');
 assert.equal(calls[0].headers.get('authorization'),'Bearer test-key');
 assert.equal(calls[0].body.model,'my-model');
 assert.deepEqual(r.content,[{type:'tool_use',name:'prepare_tasks',input:{tasks:[{title:'Milk'}]}}]);
});
