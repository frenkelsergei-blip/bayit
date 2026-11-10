// Speech-to-text through the household's own AI provider key (Modular Bayit work package 2.2). Works on every host,
// including Docker, because it only needs the key the household already stored in Settings → AI.
// Verified against the providers' official documentation on 2026-11-10:
//  • OpenAI: POST {base}/audio/transcriptions, multipart {file, model, language?}; models include gpt-4o-mini-transcribe;
//    files flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm; the JSON reply has `text` and `usage` of type "tokens"
//    {input_tokens, output_tokens} or "duration" {seconds}.
//    https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
//    Price (https://developers.openai.com/api/docs/pricing): gpt-4o-mini-transcribe $1.25 in / $5 out per 1M tokens,
//    estimated $0.003 a minute.
//  • Gemini: POST /v1beta/interactions with header x-goog-api-key and Api-Revision 2026-05-20, body {model, input:[{type:
//    'text'},{type:'audio',data,mime_type}], store}; audio/ogg, webm, mp4/m4a, mp3, wav are supported; up to 20 MB inline;
//    32 tokens a second of audio. The reply has steps[] (type model_output, content[{type:'text',text}]) and usage
//    {total_input_tokens,total_output_tokens,total_thought_tokens,total_cached_tokens}. Its OpenAI-compatible layer
//    has no /audio/transcriptions. https://aistudio.google.com/docs/audio · https://aistudio.google.com/api-reference/interactions-api
//    The household's own chosen Gemini model does the transcription, so no model name is assumed here.
//  • Custom OpenAI-compatible services: the same /audio/transcriptions call, with the first model the service itself lists
//    whose id contains "transcribe" or "whisper". Nothing is assumed when the service lists none.
//  • Claude has no audio input, and Bayit does not transcribe through Grok: shown as unavailable with the reason.
// Neither the audio nor the text is ever logged or stored here; only billed token counts reach the AI usage ledger.
import {fail,base64} from './util.mjs';
import {providerBase} from './ai-providers.mjs';
import {externalFetch,boundedJSON} from './outbound.mjs';
import {recordAICall} from './ai-usage.mjs';
import {providerName} from '../../shared/ai-providers.mjs';

export const OPENAI_TRANSCRIBE_MODEL='gpt-4o-mini-transcribe';
const GEMINI_REVISION='2026-05-20',TIMEOUT=30000;
const MODEL_PATTERN=/transcribe|whisper/i;
const FILE_TYPES={'audio/ogg':'ogg','audio/opus':'ogg','audio/webm':'webm','audio/mp4':'m4a','audio/m4a':'m4a','audio/x-m4a':'m4a','audio/aac':'m4a','audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/flac':'flac'};
const audioType=v=>{const t=String(v||'').split(';')[0].trim().toLowerCase();return FILE_TYPES[t]?t:'audio/ogg'};
const count=v=>Number.isFinite(+v)&&+v>0?Math.round(+v):0;
const text=(en,he)=>({en,he});

const NOT_HERE={
 none:text('Connect the AI helper first (Settings → Accounts & connections → AI).','קודם מחברים את עוזר ה־AI (הגדרות ← חשבונות וחיבורים ← AI).'),
 anthropic:text('Claude cannot turn speech into text. Use OpenAI or Gemini for the AI helper, or another voice option.','Claude לא יודע להפוך דיבור לטקסט. אפשר להשתמש ב־OpenAI או ב־Gemini לעוזר ה־AI, או באפשרות קולית אחרת.'),
 other:text('Bayit cannot transcribe through this AI provider yet.','Bayit עדיין לא יודע לתמלל דרך ספק ה־AI הזה.'),
 policy:text('This installation does not allow the custom AI address.','ההתקנה הזו לא מאפשרת את כתובת ה־AI המותאמת.')
};

function availableFor(env,household){
 const ai=household?.ai;
 if(!ai)return {ok:false,reason:NOT_HERE.none};
 if(ai.provider==='custom'){try{providerBase(env,'custom',ai.baseUrl)}catch{return {ok:false,reason:NOT_HERE.policy}}}
 if(ai.provider==='openai'||ai.provider==='gemini'||ai.provider==='custom')return {ok:true,label:providerName(ai.provider)};
 return {ok:false,reason:NOT_HERE[ai.provider]||NOT_HERE.other,label:providerName(ai.provider)};
}

async function post(env,url,options,name){
 let response;
 try{response=await externalFetch(env,url,{method:'POST',...options,signal:AbortSignal.timeout(TIMEOUT)})}
 catch(error){if(error.status)throw error;throw fail(name+' could not be reached. Nothing was changed.',502)}
 if(!response.ok){await response.body?.cancel();const auth=response.status===401||response.status===403;throw fail(auth?name+' rejected the API key.':response.status===429?name+' rate limit or quota reached. Please try again shortly.':'The voice message could not be transcribed. Nothing was changed.',auth?400:502)}
 return boundedJSON(response);
}

// The first transcription model a custom OpenAI-compatible service lists itself. null when it lists none.
async function customModel(env,base,key){
 let response;
 try{response=await externalFetch(env,base+'/models',{method:'GET',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(TIMEOUT)})}catch{return null}
 if(!response.ok){await response.body?.cancel();return null}
 const list=await boundedJSON(response).catch(()=>({}));
 return (list.data||list.models||[]).map(m=>String(m?.id||m?.name||'')).find(id=>MODEL_PATTERN.test(id))||null;
}

const ledger=(env,household,provider,model,usage)=>recordAICall(env,{householdId:household?.id,memberId:household?.memberId,feature:household?.feature||'assistant',provider,model,usage});

async function openAICompatible(env,household,bytes,{language,mimeType},key,base,model){
 const type=audioType(mimeType),form=new FormData();
 form.append('file',new Blob([bytes],{type}),'voice.'+FILE_TYPES[type]);form.append('model',model);form.append('response_format','json');
 if(language)form.append('language',language);
 // Encoded to bytes here: the Docker host's pinned outbound fetch (app/host/outbound-fetch.mjs) sends only string or byte bodies.
 const encoded=new Response(form),body=new Uint8Array(await encoded.arrayBuffer());
 const r=await post(env,base+'/audio/transcriptions',{headers:{Authorization:'Bearer '+key,'Content-Type':encoded.headers.get('Content-Type')},body},providerName(household.ai.provider));
 // Duration-billed models report seconds, not tokens; the ledger counts tokens, so only token usage is recorded.
 if(r?.usage?.type==='tokens'||r?.usage?.input_tokens!==undefined)await ledger(env,household,household.ai.provider,model,{inputTokens:count(r.usage.input_tokens),outputTokens:count(r.usage.output_tokens)});
 return typeof r?.text==='string'?r.text:'';
}

async function gemini(env,household,bytes,{language,mimeType},key){
 const base=providerBase(env,'gemini'),url=new URL(base).origin+'/v1beta/interactions',model=household.ai.model;
 const prompt='Transcribe this voice message word for word, in the language it is spoken'+(language?' (most likely '+(language==='he'?'Hebrew':'English')+')':'')+'. Reply with the transcript only. If no words are spoken, reply with nothing.';
 const r=await post(env,url,{headers:{'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':GEMINI_REVISION},body:JSON.stringify({model,store:false,input:[{type:'text',text:prompt},{type:'audio',data:base64(bytes),mime_type:audioType(mimeType)}]})},'Gemini');
 const u=r?.usage||{},all=count(u.total_input_tokens),cached=Math.min(count(u.total_cached_tokens),all);
 await ledger(env,household,'gemini',model,{inputTokens:all-cached,cacheReadTokens:cached,outputTokens:count(u.total_output_tokens)+count(u.total_thought_tokens)});
 return (r?.steps||[]).filter(s=>s?.type==='model_output').flatMap(s=>s.content||[]).filter(c=>c?.type==='text').map(c=>c.text||'').join('');
}

export const HOUSEHOLD_AI_SPEECH={
 id:'household-ai',
 name:text('Your AI account','חשבון ה־AI שלכם'),
 cost:text('Billed by your AI provider on your own key: about $0.003 a minute with OpenAI, and at your model’s price with Gemini. Shown in AI usage.','מחויב אצל ספק ה־AI שלכם, על המפתח שלכם: כ־0.003$ לדקה ב־OpenAI, ולפי מחיר המודל שלכם ב־Gemini. מופיע בשימוש ב־AI.'),
 available:availableFor,
 // Before a parent chooses it: a custom service must list a transcription model.
 async check(env,household){
  if(household?.ai?.provider!=='custom')return {ok:true};
  const model=await customModel(env,providerBase(env,'custom',household.ai.baseUrl),await household.key());
  return model?{ok:true}:{ok:false,reason:text('Your AI service does not list a transcription model (whisper or transcribe).','שירות ה־AI שלכם לא מציע מודל תמלול (whisper או transcribe).')};
 },
 async transcribe(env,bytes,options={}){
  const household=options.household,state=availableFor(env,household);if(!state.ok)throw fail('This voice provider is not available for this household.',409);
  const key=await household.key(),provider=household.ai.provider;
  if(provider==='gemini')return gemini(env,household,bytes,options,key);
  const base=providerBase(env,provider,household.ai.baseUrl);
  const model=provider==='openai'?OPENAI_TRANSCRIBE_MODEL:await customModel(env,base,key);
  if(!model)throw fail('Your AI service does not offer a transcription model.',409);
  return openAICompatible(env,household,bytes,options,key,base,model);
 }
};
