// Provider adapters. The rest of Bayit speaks one shape:
//   request  {system, history:[{role,content}], prompt, images:[{mediaType,data}], tools:[{name,description,input_schema}], forceTool, maxTokens}
//   response {content:[{type:'text',text}|{type:'tool_use',name,input}], truncated, usage:{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}}
// usage.inputTokens are the prompt tokens billed at the normal input price (cache reads and writes are counted separately).
// A reply that fails after the provider answered carries error.usage, because those tokens were still billed.
// so normalizeAITools(), Apply/Undo and every safety rule work the same for every provider.
import {fail,loopbackOr} from './util.mjs';
import {AI_PROVIDER,providerName} from '../../shared/ai-providers.mjs';
import {customProviderURL,externalFetch,boundedJSON} from './outbound.mjs';

const TIMEOUT=45000;

// Base URL for a provider. Custom endpoints must be https. A loopback AI_TEST_ORIGIN replaces the origin in local tests only.
export function providerBase(env,provider,baseUrl){
 const p=AI_PROVIDER[provider];if(!p)throw fail('Choose a supported AI provider.');
 let base=provider==='custom'?String(baseUrl||'').trim().replace(/\/+$/,''):p.base;
 // The https rule applies everywhere, including local tests.
 if(provider==='custom'&&!/^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(base))throw fail('Enter the provider’s https base URL, for example https://openrouter.ai/api/v1.');
 if(provider==='custom')base=customProviderURL(env,base);
 const test=loopbackOr(env.AI_TEST_ORIGIN||env.ANTHROPIC_TEST_ORIGIN,'');
 return test?test+new URL(base).pathname.replace(/\/+$/,''):base;
}

async function call(env,provider,url,key,body){
 const p=AI_PROVIDER[provider],name=providerName(provider),headers={'Content-Type':'application/json'};
 if(p.format==='anthropic'){headers.Authorization='Bearer '+key;headers['anthropic-version']='2026-10-21'}else headers.Authorization='Bearer '+key;
 let response;
 try{response=await externalFetch(env,url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(TIMEOUT)})}
 catch{throw fail(name+' could not be reached. No app changes were applied.',502)}
 if(!response.ok){
  await response.body?.cancel();
  const auth=response.status===401||response.status===403;
  throw fail(auth?name+' rejected the API key.':response.status===429?name+' rate limit or quota reached. Please try again shortly.':name+' could not complete the request ('+response.status+'). No app changes were applied.',auth?400:502);
 }
 return boundedJSON(response);
}

// Some OpenAI-compatible services (OpenRouter and others) list prices with their models, in US$ per token. Kept only as
// a suggestion for a parent's own price in Settings; Bayit never applies it on its own.
function listedPricing(p){
 const per=v=>{const n=Number(v);return v!==undefined&&v!==null&&v!==''&&Number.isFinite(n)&&n>=0&&n<0.01?Math.round(n*1e6*1e6)/1e6:null};
 const input=per(p?.prompt),output=per(p?.completion);
 return input===null||output===null?undefined:{input,output,cacheRead:per(p?.input_cache_read),cacheWrite:per(p?.input_cache_write)};
}
// Models this key can use, filtered to chat-capable ones.
export async function listModels(env,{provider,key,baseUrl}){
 const p=AI_PROVIDER[provider],base=providerBase(env,provider,baseUrl);
 const result=await call(env,provider,base+(p.format==='anthropic'?'/models?limit=100':'/models'),key);
 let models=(result.data||result.models||[]).map(m=>({id:String(m.id||m.name||'').replace(/^models\//,''),name:m.display_name||m.displayName||String(m.id||m.name||'').replace(/^models\//,''),retired:m.lifecycle==='retired',pricing:listedPricing(m.pricing)})).filter(m=>m.id&&!m.retired);
 const skip=/(embed|tts|whisper|dall-e|image|imagen|audio|realtime|transcribe|moderation|search-|instruct|babbage|davinci|aqa|veo|vision-preview)/i;
 if(provider==='openai')models=models.filter(m=>/^(gpt|o\d|codex|chatgpt)/i.test(m.id)&&!skip.test(m.id));
 if(provider==='gemini')models=models.filter(m=>/gemini|gemma/i.test(m.id)&&!skip.test(m.id));
 if(provider==='xai')models=models.filter(m=>/grok/i.test(m.id)&&!skip.test(m.id));
 models=models.map(({id,name,pricing})=>pricing?{id,name,pricing}:{id,name}).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,120);
 if(!models.length)throw fail('No chat models were returned for this key.');
 return models;
}

// Gemini's OpenAI-compatible endpoint accepts only a subset of JSON Schema.
function plainSchema(schema){
 if(Array.isArray(schema))return schema.map(plainSchema);
 if(!schema||typeof schema!=='object')return schema;
 const out={};for(const [k,v]of Object.entries(schema)){if(['additionalProperties','exclusiveMinimum','minLength','maxLength','minItems','maxItems'].includes(k))continue;out[k]=plainSchema(v)}return out;
}
const dataUrl=i=>'data:'+i.mediaType+';base64,'+i.data;
const count=v=>Number.isFinite(+v)&&+v>0?Math.round(+v):0;
const anthropicUsage=u=>({inputTokens:count(u?.input_tokens),outputTokens:count(u?.output_tokens),cacheReadTokens:count(u?.cache_read_input_tokens),cacheWriteTokens:count(u?.cache_creation_input_tokens)});
// OpenAI-style totals include cached prompt tokens; split them out so each is priced once.
const openAIUsage=(input,output,cached)=>{const all=count(input),hit=Math.min(count(cached),all);return {inputTokens:all-hit,outputTokens:count(output),cacheReadTokens:hit,cacheWriteTokens:0}};
const billed=(usage,read)=>{try{return read()}catch(error){if(error&&typeof error==='object'&&!error.usage)error.usage=usage;throw error}};
const parseArgs=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'{}')}catch{throw fail('The AI returned an unreadable tool call. Nothing was applied.',502)}};

export async function generate(env,{provider,key,baseUrl,model,system,history=[],prompt,images=[],tools=[],forceTool,maxTokens=4096}){
 const p=AI_PROVIDER[provider],base=providerBase(env,provider,baseUrl);
 if(p.format==='anthropic'){
  const content=images.length?[...images.map(i=>({type:'image',source:{type:'base64',media_type:i.mediaType,data:i.data}})),{type:'text',text:prompt}]:prompt;
  const r=await call(env,provider,base+'/messages',key,{model,max_tokens:maxTokens,stream:false,system,messages:[...history,{role:'user',content}],tools,...(forceTool?{tool_choice:{type:'tool',name:forceTool}}:{})});
  return {content:r.content||[],truncated:r.stop_reason==='max_tokens',usage:anthropicUsage(r.usage)};
 }
 if(p.format==='responses'){
  const input=[...history.map(t=>({role:t.role,content:[{type:t.role==='assistant'?'output_text':'input_text',text:t.content}]})),{role:'user',content:[...images.map(i=>({type:'input_image',image_url:dataUrl(i)})),{type:'input_text',text:prompt}]}];
  const r=await call(env,provider,base+'/responses',key,{model,instructions:system,input,tools:tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.input_schema,strict:false})),tool_choice:forceTool?{type:'function',name:forceTool}:'auto',max_output_tokens:maxTokens,store:false});
  const usage=openAIUsage(r.usage?.input_tokens,r.usage?.output_tokens,r.usage?.input_tokens_details?.cached_tokens);
  const content=billed(usage,()=>{const out=[];for(const item of r.output||[]){if(item.type==='message')for(const c of item.content||[]){if(c.type==='output_text'&&c.text)out.push({type:'text',text:c.text})}if(item.type==='function_call')out.push({type:'tool_use',name:item.name,input:parseArgs(item.arguments)})}return out});
  return {content,truncated:r.status==='incomplete'&&/max_output_tokens/.test(r.incomplete_details?.reason||''),usage};
 }
 const userContent=images.length?[...images.map(i=>({type:'image_url',image_url:{url:dataUrl(i)}})),{type:'text',text:prompt}]:prompt;
 const schema=provider==='gemini'?plainSchema:s=>s;
 const r=await call(env,provider,base+'/chat/completions',key,{model,messages:[{role:'system',content:system},...history,{role:'user',content:userContent}],tools:tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:schema(t.input_schema)}})),tool_choice:forceTool?{type:'function',function:{name:forceTool}}:'auto',max_tokens:maxTokens});
 // Some compatible providers (Gemini) leave thinking tokens out of completion_tokens but bill them; total minus prompt includes them.
 const choice=r.choices?.[0]||{},message=choice.message||{},usage=openAIUsage(r.usage?.prompt_tokens,Math.max(count(r.usage?.completion_tokens),count(r.usage?.total_tokens)-count(r.usage?.prompt_tokens)),r.usage?.prompt_tokens_details?.cached_tokens);
 const content=billed(usage,()=>{const out=[],text=Array.isArray(message.content)?message.content.map(c=>c.text||'').join(''):message.content;if(text)out.push({type:'text',text});
  for(const call of message.tool_calls||[])if(call.function?.name)out.push({type:'tool_use',name:call.function.name,input:parseArgs(call.function.arguments)});return out});
 return {content,truncated:choice.finish_reason==='length',usage};
}
