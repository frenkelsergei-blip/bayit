import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
// Shared server helpers for the Pages API, the Telegram bot and reminder delivery.
import {credentialKey,encryptionKeyId} from './credential-keys.mjs';
export const encoder=new TextEncoder();
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export const fail=(message,status=400)=>Object.assign(Error(message),{status});
// Chunked so large media (photos, voice notes) does not exceed the argument limit of fromCharCode.
export const base64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)};
// Test-only loopback override for an external API origin; production always uses the real origin.
export const loopbackOr=(value,fallback)=>/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(value||'')?value:fallback;
export const unbase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const random=(size=32)=>base64(crypto.getRandomValues(new Uint8Array(size))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const TIMEZONE=HOME_TIMEZONE;
export const localDate=(now=new Date())=>now.toLocaleDateString('en-CA',{timeZone:TIMEZONE});
export const localTime=(now=new Date())=>now.toLocaleTimeString('en-GB',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
// Compares two hex digests without an early exit.
export function sameDigest(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function bodyJSON(request,max=400000){if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw fail('Send JSON.',415);const reader=request.body?.getReader();if(!reader)return {};let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fail('The change is too large.',413)}parts.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw fail('Invalid JSON.')}}
export async function encryptKey(value,env,id){if(!env.APP_ENCRYPTION_KEY)throw fail('Server credential encryption is not configured.',503);const activeId=encryptionKeyId(env),key=await credentialKey(env,activeId,'encrypt'),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},key,encoder.encode(value));return 'v2.'+activeId+'.'+base64(iv)+'.'+base64(new Uint8Array(cipher))}
export async function decryptKey(value,env,id){const parts=value.split('.'),[iv,cipher]=parts[0]==='v2'?parts.slice(2):parts,keyId=parts[0]==='v2'?parts[1]:(env.APP_ENCRYPTION_KEYS_JSON&&JSON.parse(env.APP_ENCRYPTION_KEYS_JSON).legacy?'legacy':encryptionKeyId(env)),key=await credentialKey(env,keyId,'decrypt');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:encoder.encode(id)},key,unbase64(cipher)))}
