// Speech-to-text provider "__NAME_EN__" (extension __ID__). The contract is the comment at the top of
// app/cloud/speech.mjs; tests/speech-providers.test.mjs checks every provider against it.
// - The key is an installation secret the owner sets (wrangler pages secret put __ENV___API_KEY, or __ENV___API_KEY in
//   the Docker .env). It is never written in a file, printed, logged or sent anywhere but the provider.
// - Every outside call goes through externalFetch (app/cloud/outbound.mjs) to the origin in extension.json "outbound".
// - Never log the audio or the text. Errors reach the family only as "could not be transcribed".
import {fail} from '../util.mjs';
import {externalFetch,boundedJSON} from '../outbound.mjs';

const BASE='https://api.__ID__.invalid'; // TODO(bayit): the provider's documented https API origin (also in "outbound")
const text=(en,he)=>({en,he});
const COULD_NOT='The voice message could not be transcribed. Nothing was changed.';

export const __EXPORT__={
 id:'__ID__',
 name:text('__NAME_EN__','__NAME_HE__'),
 // TODO(bayit): one honest sentence with the rough price, checked on the provider's pricing page today.
 cost:text('Billed by __NAME_EN__ to the installation owner’s account.','החיוב דרך החשבון של בעל ההתקנה ב־__NAME_EN__.'),
 // Never calls the network: only whether this installation has what the provider needs.
 available:env=>env?.__ENV___API_KEY?{ok:true}:{ok:false,reason:text('The owner of this installation has not added the __NAME_EN__ key yet.','בעל ההתקנה עוד לא הוסיף את המפתח של __NAME_EN__.')},
 async transcribe(env,bytes,{language,mimeType}={}){
  // TODO(bayit): send the audio as the provider documents it and return the text, e.g.
  //   const response=await externalFetch(env,BASE+'/v1/transcribe',{method:'POST',headers:{Authorization:'Bearer '+env.__ENV___API_KEY,'Content-Type':mimeType||'audio/ogg'},body:bytes});
  //   if(!response.ok){await response.body?.cancel();throw fail(COULD_NOT,502)}
  //   return String((await boundedJSON(response)).text||'').trim();
  void externalFetch;void boundedJSON;void BASE;void language;void mimeType;
  throw fail(COULD_NOT,501);
 },
};
