// Each provider adapter must send its own wire format and return Bayit's single response shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate,listModels,providerBase} from '../app/cloud/ai-providers.mjs';

const tools=[{name:'prepare_tasks',description:'Prepare tasks',input_schema:{type:'object',properties:{tasks:{type:'array',maxItems:20,items:{type:'object',properties:{title:{type:'string',minLength:1}},required:['title'],additionalProperties:false}}},required:['tasks'],additionalProperties:false}}];
const image={mediaType:'image/jpeg',data:'AAAA'};
function stub(reply){const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options,body:options.body?JSON.parse(options.body):null});return new Response(JSON.stringify(typeof reply==='function'?reply(url):reply),{status:200,headers:{'Content-Type':'application/json'}})};return calls}
const env={};

test('Claude: Messages API with forced tool and images',async()=>{
 const calls=stub({content:[{type:'tool_use',name:'prepare_tasks',input:{tasks:[{title:'A'}]}}],stop_reason:'tool_use',usage:{input_tokens:5,output_tokens:6}});
 const r=await generate(env,{provider:'anthropic',key:'k',model:'claude-x',system:'S',history:[{role:'user',content:'hi'}],prompt:'P',images:[image],tools,forceTool:'prepare_tasks'});
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');assert.deepEqual(calls[0].body.tool_choice,{type:'tool',name:'prepare_tasks'});
 assert.equal(calls[0].body.messages.at(-1).content[0].type,'image');assert.equal(r.content[0].input.tasks[0].title,'A');assert.deepEqual(r.usage,{inputTokens:5,outputTokens:6,cacheReadTokens:0,cacheWriteTokens:0});
});

test('OpenAI (GPT and Codex): Responses API, function calls and truncation',async()=>{
 const calls=stub({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Sure.'}]},{type:'function_call',name:'prepare_tasks',arguments:'{"tasks":[{"title":"B"}]}'}],usage:{input_tokens:7,output_tokens:8}});
 const r=await generate(env,{provider:'openai',key:'k',model:'gpt-5-codex',system:'S',history:[{role:'assistant',content:'prev'}],prompt:'P',images:[image],tools});
 const body=calls[0].body;assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(body.instructions,'S');assert.equal(body.tools[0].type,'function');assert.equal(body.tools[0].parameters.properties.tasks.type,'array');
 assert.equal(body.input[0].content[0].type,'output_text');assert.equal(body.input.at(-1).content[0].type,'input_image');assert.equal(body.input.at(-1).content[0].image_url,'data:image/jpeg;base64,AAAA');
 assert.deepEqual(r.content,[{type:'text',text:'Sure.'},{type:'tool_use',name:'prepare_tasks',input:{tasks:[{title:'B'}]}}]);assert.equal(r.truncated,true);
});

test('Gemini: OpenAI-compatible chat with a simplified schema',async()=>{
 const calls=stub({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{type:'function',function:{name:'prepare_tasks',arguments:'{"tasks":[{"title":"C"}]}'}}]}}],usage:{prompt_tokens:3,completion_tokens:4}});
 const r=await generate(env,{provider:'gemini',key:'k',model:'gemini-2.5-flash',system:'S',prompt:'P',tools,forceTool:'prepare_tasks'});
 const body=calls[0].body;assert.equal(calls[0].url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
 assert.equal(body.messages[0].role,'system');assert.deepEqual(body.tool_choice,{type:'function',function:{name:'prepare_tasks'}});
 assert.equal(JSON.stringify(body.tools).includes('additionalProperties'),false);assert.equal(JSON.stringify(body.tools).includes('maxItems'),false);
 assert.equal(r.content[0].input.tasks[0].title,'C');assert.deepEqual(r.usage,{inputTokens:3,outputTokens:4,cacheReadTokens:0,cacheWriteTokens:0});
});

test('Grok and custom endpoints use chat completions; custom must be https',async()=>{
 const calls=stub({choices:[{finish_reason:'length',message:{content:'Hello'}}]});
 const r=await generate(env,{provider:'xai',key:'k',model:'grok-4',system:'S',prompt:'P',tools});
 assert.equal(calls[0].url,'https://api.x.ai/v1/chat/completions');assert.equal(JSON.stringify(calls[0].body.tools).includes('additionalProperties'),true);assert.equal(r.truncated,true);
 await generate(env,{provider:'custom',key:'k',baseUrl:'https://openrouter.ai/api/v1/',model:'m',system:'S',prompt:'P'});
 assert.equal(calls[1].url,'https://openrouter.ai/api/v1/chat/completions');
 assert.throws(()=>providerBase(env,'custom','http://10.0.0.5/v1'),/https/);assert.throws(()=>providerBase(env,'nope',''),/supported/);
});

test('model lists keep chat models and drop embeddings, audio and images',async()=>{
 stub({data:[{id:'gpt-5'},{id:'gpt-5-codex'},{id:'text-embedding-3-large'},{id:'whisper-1'},{id:'dall-e-3'},{id:'gpt-4o-realtime-preview'},{id:'o4-mini'}]});
 assert.deepEqual((await listModels(env,{provider:'openai',key:'k'})).map(m=>m.id).sort(),['gpt-5','gpt-5-codex','o4-mini']);
 stub({data:[{id:'models/gemini-2.5-pro'},{id:'models/text-embedding-004'},{id:'models/imagen-3'}]});
 assert.deepEqual((await listModels(env,{provider:'gemini',key:'k'})).map(m=>m.id),['gemini-2.5-pro']);
});

test('provider errors are explained without echoing the key',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'Incorrect API key provided: sk-...abcd'}}),{status:401});
 await assert.rejects(generate(env,{provider:'openai',key:'sk-secret',model:'m',system:'S',prompt:'P'}),e=>/OpenAI rejected the API key/.test(e.message)&&!e.message.includes('sk-secret'));
});

test('a loopback test origin replaces any provider origin (local tests only)',()=>{
 assert.equal(providerBase({AI_TEST_ORIGIN:'http://127.0.0.1:8899'},'gemini',''),'http://127.0.0.1:8899/v1beta/openai');
 assert.equal(providerBase({AI_TEST_ORIGIN:'http://evil.example.com'},'openai',''),'https://api.openai.com/v1');
});
