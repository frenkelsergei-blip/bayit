import {fail,unbase64} from './util.mjs';
export function encryptionKeyId(env){const id=env.APP_ENCRYPTION_KEY_ID||'main';if(!/^[a-zA-Z0-9_-]{1,32}$/.test(id))throw fail('Server credential key ID is invalid.',503);return id}
export async function credentialKey(env,id=encryptionKeyId(env),usage='decrypt'){
 let ring={};try{ring=JSON.parse(env.APP_ENCRYPTION_KEYS_JSON||'{}')}catch{throw fail('Server credential key ring is invalid.',503)}
 const raw=id===encryptionKeyId(env)?env.APP_ENCRYPTION_KEY:ring[id];
 let bytes;try{bytes=unbase64(raw||'')}catch{}
 if(bytes?.length!==32)throw fail('The original server credential key is required.',503);
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,[usage]);
}
