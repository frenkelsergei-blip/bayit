// Speech-to-text providers for voice messages (Telegram voice notes and בית AI voice questions). Each installation and
// household uses its own account. Core providers come first, then the ones installed extensions add in
// app/cloud/extensions/speech.mjs. Every provider, core or extra, passes the same check (speechProblem) and the same
// conformance test (tests/speech-providers.test.mjs).
//
// The speech provider contract:
//   id          new, lower-case id (letters, digits, - or _); "off" is reserved
//   name        {en, he}: shown in Telegram settings → Photos & voice
//   cost        {en, he}: one honest sentence about who bills it and roughly how much
//   available(env, household) → boolean or {ok, reason?:{en,he}, label?}: whether it works on THIS installation for
//               THIS household, and in plain words why not. Never calls the network.
//   check?(env, household) → {ok, reason?}: optional network check before a parent chooses it.
//   transcribe(env, bytes, {language, mimeType, household}) → text
//               bytes: the audio, already within MAX_VOICE_BYTES; language: 'he' | 'en' | undefined; mimeType of the audio.
//               household: speechHousehold(): {id, memberId, feature, ai:{provider,model,baseUrl}|null, key()}.
//               It must go through outbound.mjs (externalFetch) for any outside call, never log audio or text, and
//               record billed tokens with recordAICall (ai-usage.mjs). Its own errors reach the family only as
//               "could not be transcribed".
// The daily allowance (DAILY_VOICE_SECONDS) and the per-message limits are enforced by the callers (telegram.mjs,
// voice.mjs) before transcribe() runs; transcribe() refuses audio over MAX_VOICE_BYTES and providers that are not available.
import {fail,base64,loopbackOr,decryptKey} from './util.mjs';
import {joinRegistry} from '../../shared/extension-registry.mjs';
import {EXTRA_SPEECH} from './extensions/speech.mjs';
import {HOUSEHOLD_AI_SPEECH} from './speech-household-ai.mjs';

export const MAX_VOICE_SECONDS=120,MAX_VOICE_BYTES=1_500_000,DAILY_VOICE_SECONDS=3600;
const CLOUDFLARE_MODEL='@cf/openai/whisper-large-v3-turbo';
const text=(en,he)=>({en,he});

// "cloudflare" runs Whisper on this installation's Workers AI binding (its free daily allowance first). Cloudflare only.
const CLOUDFLARE={
 id:'cloudflare',
 name:text('Cloudflare Workers AI · this installation','Cloudflare Workers AI · ההתקנה הזו'),
 cost:text('Transcribed on your own Cloudflare account (about $0.0005 a minute after the free daily allowance).','התמלול מתבצע בחשבון Cloudflare שלכם (כ־0.0005$ לדקה אחרי המכסה היומית החינמית).'),
 available:env=>env?.AI||loopbackOr(env?.SPEECH_TEST_ORIGIN,'')?{ok:true}:{ok:false,reason:text('Only on a Cloudflare installation with Workers AI. This one runs elsewhere (for example Docker).','רק בהתקנה על Cloudflare עם Workers AI. ההתקנה הזו רצה במקום אחר (למשל Docker).')},
 async transcribe(env,bytes,{language}={}){
  const input={audio:base64(bytes),task:'transcribe',...(language?{language}:{})},test=loopbackOr(env.SPEECH_TEST_ORIGIN,'');
  let result;
  if(test){const response=await fetch(test+'/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLOUDFLARE_MODEL,...input}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(String(response.status));result=await response.json()}
  else{if(!env.AI)throw fail('Workers AI is not connected to this installation.',503);result=await env.AI.run(CLOUDFLARE_MODEL,input)}
  return result?.text;
 }
};

const isText=v=>v&&typeof v.en==='string'&&v.en.trim()&&typeof v.he==='string'&&v.he.trim();
export function speechProblem(p){
 if(p?.id==='off')return 'the id "off" is reserved for turning voice off.';
 if(!isText(p.name)||!isText(p.cost)||typeof p.available!=='function'||typeof p.transcribe!=='function'||p.check!==undefined&&typeof p.check!=='function')
  return 'needs name {en, he}, cost {en, he}, available(env, household) and transcribe(env, bytes, {language}).';
 return '';
}
const CORE=[CLOUDFLARE,HOUSEHOLD_AI_SPEECH];
// Every provider object, core first. "off" is not a provider; it is the household's choice to turn voice off.
export const SPEECH_REGISTRY=joinRegistry('speech provider',CORE,EXTRA_SPEECH,speechProblem);
const BY_ID=Object.fromEntries(SPEECH_REGISTRY.map(p=>[p.id,p]));
export const SPEECH_PROVIDERS=['off',...SPEECH_REGISTRY.map(p=>p.id)];

// A provider's availability as {ok, reason, label}. An extra's own error counts as unavailable, never as a crash.
export function speechState(env,id,household=null){
 const p=BY_ID[id];if(!p)return {ok:false,reason:null};
 let v;try{v=p.available(env,household)}catch{v=false}
 return typeof v==='object'&&v?{ok:!!v.ok,reason:v.ok?null:isText(v.reason)?v.reason:null,label:typeof v.label==='string'?v.label:''}:{ok:!!v,reason:null,label:''};
}
// Installation-level map (no household), kept for older callers and extensions: {id: boolean}.
export const speechAvailability=env=>Object.fromEntries(SPEECH_REGISTRY.map(p=>[p.id,speechState(env,p.id).ok]));
// Names of the providers extensions add (older settings windows show these after the core options).
export const speechNames=()=>Object.fromEntries(SPEECH_REGISTRY.filter(p=>!CORE.includes(p)).map(p=>[p.id,p.name]));
// Every provider with honest availability for this household, for Telegram settings → Photos & voice.
export const speechOptions=(env,household)=>SPEECH_REGISTRY.map(p=>{const s=speechState(env,p.id,household);return {id:p.id,name:p.name,cost:p.cost,label:s.label||'',available:s.ok,reason:s.reason}});

// The household context a provider receives. The AI key is decrypted only when a provider asks for it.
export async function speechHousehold(env,householdId,{memberId=null,feature='assistant'}={}){
 let stored=null;try{stored=await env.DB.prepare('SELECT provider,model,base_url,ciphertext,verified FROM household_secrets WHERE household_id=?').bind(householdId).first()}catch{}
 const ready=!!(stored?.ciphertext&&stored.verified&&stored.model);
 return {id:householdId,memberId,feature,ai:ready?{provider:stored.provider||'anthropic',model:stored.model,baseUrl:stored.base_url||''}:null,key:async()=>{if(!ready)throw fail('Connect the AI helper first.',409);return decryptKey(stored.ciphertext,env,householdId)}};
}

// Before a parent chooses a provider: available here, and its own check (if any) passes. Returns {ok, reason}.
export async function speechChoice(env,id,household){
 if(id==='off')return {ok:true,reason:null};
 const s=speechState(env,id,household);if(!s.ok)return s;
 if(!BY_ID[id].check)return s;
 try{const c=await BY_ID[id].check(env,household);return c?.ok?s:{ok:false,reason:isText(c?.reason)?c.reason:null}}catch{return {ok:false,reason:null}}
}

export async function transcribe(env,provider,bytes,{language,mimeType,household=null}={}){
 const p=BY_ID[provider];
 if(!p)throw fail('Voice messages are turned off for this household.',409);
 if(!speechState(env,provider,household).ok)throw fail('This voice provider is not available for this household.',409);
 if(!bytes?.length||bytes.length>MAX_VOICE_BYTES)throw fail('Please keep voice messages under '+MAX_VOICE_SECONDS/60+' minutes.',413);
 let heard;
 try{heard=await p.transcribe(env,bytes,{language,mimeType,household})}
 catch(error){if(error?.status)throw error;throw fail('The voice message could not be transcribed. Nothing was changed.',502)}
 return String(heard||'').trim().slice(0,2000);
}
