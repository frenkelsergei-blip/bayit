// Speech-to-text providers for voice messages. Each installation uses its own account:
// "cloudflare" runs Whisper on this installation's Workers AI binding (its free daily allowance first).
// New providers (for example an OpenAI- or Google-compatible service with an encrypted key) plug in here.
import {fail,base64,loopbackOr} from './util.mjs';

export const SPEECH_PROVIDERS=['off','cloudflare'];
export const MAX_VOICE_SECONDS=120,MAX_VOICE_BYTES=1_500_000,DAILY_VOICE_SECONDS=3600;
const CLOUDFLARE_MODEL='@cf/openai/whisper-large-v3-turbo';

export const speechAvailability=env=>({cloudflare:!!env.AI||!!loopbackOr(env.SPEECH_TEST_ORIGIN,'')});

export async function transcribe(env,provider,bytes,{language}={}){
 if(provider!=='cloudflare')throw fail('Voice messages are turned off for this household.',409);
 const input={audio:base64(bytes),task:'transcribe',...(language?{language}:{})},test=loopbackOr(env.SPEECH_TEST_ORIGIN,'');
 let result;
 try{
  if(test){const response=await fetch(test+'/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLOUDFLARE_MODEL,...input}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(String(response.status));result=await response.json()}
  else{if(!env.AI)throw fail('Workers AI is not connected to this installation.',503);result=await env.AI.run(CLOUDFLARE_MODEL,input)}
 }catch(error){if(error.status)throw error;throw fail('The voice message could not be transcribed. Nothing was changed.',502)}
 return String(result?.text||'').trim().slice(0,2000);
}
