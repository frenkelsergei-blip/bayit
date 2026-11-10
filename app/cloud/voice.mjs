// Voice questions to בית AI from the app (user request 2026-11-10, board ד): the same speech-to-text service and limits
// as Telegram voice messages (speech.mjs: the household's chosen provider, up to 2 minutes a message and the
// shared daily allowance). The recording is never stored; only the text comes back, for the person to send or correct.
// GET  /api/voice            → {available, provider, maxSeconds}
// POST /api/voice/transcribe   body: the audio (audio/webm, audio/ogg, audio/mp4…), header X-Voice-Seconds → {text}
import {stateFeatureContext} from '../../shared/features.mjs';
import {json,fail,localDate} from './util.mjs';
import {SPEECH_PROVIDERS,MAX_VOICE_SECONDS,MAX_VOICE_BYTES,DAILY_VOICE_SECONDS,speechState,speechHousehold,transcribe} from './speech.mjs';

async function provider(env,homeId){
 try{const row=await env.DB.prepare('SELECT speech_provider FROM media_settings WHERE household_id=?').bind(homeId).first();return SPEECH_PROVIDERS.includes(row?.speech_provider)?row.speech_provider:'off'}
 catch{return 'off'}
}
export async function handleVoice(request,env,home,path){
 const me=home.membership.member_id;
 if(!stateFeatureContext(home.state,me).on('ai'))throw fail('Bayit AI is turned off in Bayit. Nothing was changed.',403);
 const p=await provider(env,home.id),household=await speechHousehold(env,home.id,{memberId:me,feature:'assistant'}),available=p!=='off'&&speechState(env,p,household).ok;
 if(path==='/api/voice'&&request.method==='GET')return json({available,provider:p,maxSeconds:MAX_VOICE_SECONDS});
 if(path==='/api/voice/transcribe'&&request.method==='POST'){
  if(!available)throw fail(p==='off'?'Voice is turned off for this household. A parent can turn it on in Settings → Accounts & connections → Telegram.':'The voice service is not available on this installation right now.',409);
  const type=String(request.headers.get('Content-Type')||'');if(!/^audio\//.test(type))throw fail('Send a voice recording.',415);
  const declared=Number(request.headers.get('Content-Length')||0);if(declared>MAX_VOICE_BYTES)throw fail('Please keep voice messages under '+MAX_VOICE_SECONDS/60+' minutes.',413);
  const bytes=new Uint8Array(await request.arrayBuffer());if(!bytes.length)throw fail('The recording was empty.',400);if(bytes.length>MAX_VOICE_BYTES)throw fail('Please keep voice messages under '+MAX_VOICE_SECONDS/60+' minutes.',413);
  const seconds=Math.min(MAX_VOICE_SECONDS,Math.max(1,Math.ceil(Number(request.headers.get('X-Voice-Seconds'))||Math.ceil(bytes.length/8000))));
  const day=localDate(),used=(await env.DB.prepare('SELECT seconds FROM speech_usage WHERE household_id=? AND day=?').bind(home.id,day).first())?.seconds||0;
  if(used+seconds>DAILY_VOICE_SECONDS)throw fail('Today’s voice limit for this household has been reached. Typing still works.',429);
  await env.DB.prepare('INSERT INTO speech_usage(household_id,day,seconds) VALUES(?,?,?) ON CONFLICT(household_id,day) DO UPDATE SET seconds=seconds+excluded.seconds').bind(home.id,day,seconds).run();
  const lang=home.state.profiles?.[me]?.locale==='he'?'he':undefined;
  const text=await transcribe(env,p,bytes,{language:lang,mimeType:type,household});
  if(!text)throw fail('No words were heard in the recording. Try again a little closer to the microphone.',422);
  return json({text});
 }
 throw fail('Unknown endpoint.',404);
}
