// Installation policy, not request-body policy. Ordinary users cannot turn the server into a URL relay.
import {fail} from './util.mjs';
const CUSTOM=new Set(['https://openrouter.ai','https://api.groq.com','https://api.together.xyz','https://api.together.ai','https://api.deepseek.com','https://api.mistral.ai']);
const PUSH=['fcm.googleapis.com','web.push.apple.com','push.services.mozilla.com','notify.windows.com'];
const list=value=>String(value||'').split(/[\s,]+/).filter(Boolean);
export function isPrivateAddress(address){
 const value=String(address).toLowerCase().replace(/^\[|\]$/g,'').split('%')[0];
 if(value.includes(':')){if(value==='::'||value==='::1'||/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value))return true;const m=/^::ffff:(.+)$/.exec(value);if(m){if(m[1].includes('.'))return isPrivateAddress(m[1]);const words=m[1].split(':');if(words.length===2){const n=parseInt(words[0],16)*65536+parseInt(words[1],16);return isPrivateAddress([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.'))}}return !/^[23][0-9a-f]{0,3}:/.test(value)}
 if(/^\d+\.\d+\.\d+\.\d+$/.test(value)){const [a,b,c]=value.split('.').map(Number);return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a>=224}
 return value==='localhost'||value.endsWith('.localhost')||value.endsWith('.local')||value.endsWith('.internal');
}
function parsed(value){let u;try{u=new URL(value)}catch{throw fail('Choose a valid provider address.')}
 if(u.username||u.password||u.hash||u.href.length>2500)throw fail('The provider address is not allowed.');return u;
}
function exactOrigins(value){return new Set(list(value).map(v=>{try{return new URL(v).origin}catch{return ''}}))}
export function customProviderURL(env,value){
 const u=parsed(value);if(u.search)throw fail('Use a provider base address without query parameters.');if(u.protocol!=='https:')throw fail('Use an https provider address.');
 const privateOrigins=exactOrigins(env.AI_PRIVATE_ORIGINS),allowed=exactOrigins(env.AI_ALLOWED_ORIGINS);
 if(isPrivateAddress(u.hostname)&&!privateOrigins.has(u.origin))throw fail('Private AI servers must be explicitly allowed by this installation’s operator.',403);
 if(!CUSTOM.has(u.origin)&&!allowed.has(u.origin)&&!privateOrigins.has(u.origin))throw fail('This AI provider must be allowed by this installation’s operator first.',403);
 if(u.port&&u.port!=='443'&&!allowed.has(u.origin)&&!privateOrigins.has(u.origin))throw fail('This provider port is not allowed.',403);
 return u.href.replace(/\/+$/,'');
}
export function pushEndpoint(env,value){
 const u=parsed(value),allowed=exactOrigins(env.PUSH_ALLOWED_ORIGINS);if(/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(env.PUSH_TEST_ORIGIN||'')&&u.origin===env.PUSH_TEST_ORIGIN)return u.href;
 if(u.protocol!=='https:'||isPrivateAddress(u.hostname)||u.port&&u.port!=='443')throw fail('This device did not provide an allowed push address.');
 if(!PUSH.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))&&!allowed.has(u.origin))throw fail('This push provider is not supported by this installation.');
 return u.href;
}
export async function boundedBytes(response,max=1_000_000){
 if(Number(response.headers.get('Content-Length'))>max){await response.body?.cancel();throw fail('The provider response is too large.',502)}
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fail('The provider response is too large.',502)}parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
export async function boundedJSON(response,max=1_000_000){try{return JSON.parse(new TextDecoder().decode(await boundedBytes(response,max)))}catch(e){if(e.status)throw e;throw fail('The provider returned an unreadable response.',502)}}
export async function externalFetch(env,url,options={},fetcher){
 const signal=options.signal||AbortSignal.timeout(20000),run=fetcher||env.OUTBOUND_FETCH||fetch;
 // Workers rejects redirect:'error' before sending any request. Manual mode also
 // keeps credentials at the original provider; refuse redirects below on every host.
 const response=await run(url,{...options,signal,redirect:'manual'});
 if(response.status>=300&&response.status<400){await response.body?.cancel();throw fail('Provider redirects are not allowed.',502)}return response;
}
