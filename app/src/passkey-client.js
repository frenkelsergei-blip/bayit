// Passkeys in the browser (docs/passkey-sign-in-design.md): the WebAuthn calls with the browser's own APIs and the
// /api/passkeys/* requests. The server sends standard JSON options; we turn base64url fields into bytes for
// navigator.credentials and the answer back into JSON. Nothing here is stored: no credential, code or challenge
// is kept in React state, storage or URLs. The phone's own Face ID / fingerprint window is the browser's, never ours.
import {cloudHeaders} from './cloud-transport';

const toBytes=s=>Uint8Array.from(atob(String(s).replaceAll('-','+').replaceAll('_','/')+'==='.slice((String(s).length+3)%4)),c=>c.charCodeAt(0));
const toText=buffer=>{let s='';for(const b of new Uint8Array(buffer))s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const descriptors=list=>(list||[]).map(c=>({...c,id:toBytes(c.id)}));

// 'ok', 'browser' (no WebAuthn here: an in-app browser such as WhatsApp's or Telegram's, or an old browser)
// or 'address' (not a secure page, so the browser refuses passkeys).
export function passkeySupport(){
 if(typeof window==='undefined')return 'browser';
 if(!window.isSecureContext)return 'address';
 return typeof window.PublicKeyCredential==='function'&&!!navigator.credentials?.create?'ok':'browser';
}

// Errors keep every field the server sent (code, triesLeft, usableAt) so screens can say exactly what happened.
export async function passkeyCall(path,body,{method=body===undefined?'GET':'POST'}={}){
 let response;
 try{response=await fetch('/api/passkeys/'+path,{method,credentials:'same-origin',headers:{...cloudHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})}
 catch{throw Object.assign(Error('No connection to Bayit right now.'),{network:true})}
 let result={};try{result=await response.json()}catch{}
 if(!response.ok)throw Object.assign(Error(result.error||'The request failed.'),{...result,status:response.status});
 return result;
}
export const familyCall=async(path,body,method='POST')=>{const r=await fetch(path,{method,credentials:'same-origin',headers:{...cloudHeaders(),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let result={};try{result=await r.json()}catch{}if(!r.ok)throw Object.assign(Error(result.error||'The request failed.'),{...result,status:r.status});return result};

// The person closed the phone's window, it timed out, or the device refused: nothing was saved.
export const cancelled=e=>e?.name==='NotAllowedError'||e?.name==='AbortError';
export const alreadySaved=e=>e?.name==='InvalidStateError';

async function create(options){
 const credential=await navigator.credentials.create({publicKey:{...options,challenge:toBytes(options.challenge),user:{...options.user,id:toBytes(options.user.id)},excludeCredentials:descriptors(options.excludeCredentials)}});
 const r=credential.response;
 return {id:credential.id,rawId:toText(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||undefined,clientExtensionResults:credential.getClientExtensionResults?.()||{},
  response:{clientDataJSON:toText(r.clientDataJSON),attestationObject:toText(r.attestationObject),transports:r.getTransports?.()||[]}};
}
async function get(options){
 const credential=await navigator.credentials.get({publicKey:{...options,challenge:toBytes(options.challenge),allowCredentials:descriptors(options.allowCredentials)}});
 const r=credential.response;
 return {id:credential.id,rawId:toText(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||undefined,clientExtensionResults:credential.getClientExtensionResults?.()||{},
  response:{clientDataJSON:toText(r.clientDataJSON),authenticatorData:toText(r.authenticatorData),signature:toText(r.signature),userHandle:r.userHandle?toText(r.userHandle):undefined}};
}

// Registration for setup, an invitation, recovery, the owner's code or Account security ('add').
export async function registerPasskey(purpose,fields={}){
 const {options}=await passkeyCall('register/options',{purpose,...fields});
 return passkeyCall('register/verify',{response:await create(options)});
}
export async function signInWithPasskey(){const {options}=await passkeyCall('signin/options',{});return passkeyCall('signin/verify',{response:await get(options)})}
// "Confirm it's you" in place: no redirect, only this session becomes recent.
export async function confirmWithPasskey(){const {options}=await passkeyCall('confirm/options',{});return passkeyCall('confirm/verify',{response:await get(options)})}
