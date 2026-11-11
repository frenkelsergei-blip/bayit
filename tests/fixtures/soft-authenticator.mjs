// A synthetic WebAuthn authenticator for tests: ES256 keys from WebCrypto, 'none' attestation,
// real CBOR and real signatures, so the server library verifies it exactly as it would a phone.
// Runs on Node and on Cloudflare's workerd (WebCrypto only).
const enc=new TextEncoder();
export const b64u=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
export const unb64u=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const cat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
const sha256=async data=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?enc.encode(data):data));
// Minimal CBOR encoder: unsigned/negative ints, byte strings, text strings, arrays, maps.
function head(major,n){if(n<24)return Uint8Array.of(major<<5|n);if(n<256)return Uint8Array.of(major<<5|24,n);if(n<65536)return Uint8Array.of(major<<5|25,n>>8,n&255);return Uint8Array.of(major<<5|26,n>>>24,n>>16&255,n>>8&255,n&255)}
export function cbor(v){
 if(typeof v==='number')return v>=0?head(0,v):head(1,-1-v);
 if(v instanceof Uint8Array)return cat(head(2,v.length),v);
 if(typeof v==='string'){const b=enc.encode(v);return cat(head(3,b.length),b)}
 if(Array.isArray(v))return cat(head(4,v.length),...v.map(cbor));
 if(v instanceof Map)return cat(head(5,v.size),...[...v].flatMap(([k,x])=>[cbor(k),cbor(x)]));
 throw Error('cbor: unsupported value');
}
const u32=n=>Uint8Array.of(n>>>24,n>>16&255,n>>8&255,n&255);
// WebCrypto ECDSA gives r||s; WebAuthn wants an ASN.1 DER signature.
function der(raw){const int=x=>{let i=0;while(i<x.length-1&&x[i]===0)i++;x=x.slice(i);if(x[0]&0x80)x=cat(Uint8Array.of(0),x);return cat(Uint8Array.of(2,x.length),x)};const body=cat(int(raw.slice(0,32)),int(raw.slice(32)));return cat(Uint8Array.of(0x30,body.length),body)}
const FLAGS={UP:1,UV:4,BE:8,BS:16,AT:64};
export async function createAuthenticator({synced=false}={}){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
 const cose=cbor(new Map([[1,2],[3,-7],[-1,1],[-2,unb64u(jwk.x)],[-3,unb64u(jwk.y)]]));
 const credentials=[];
 const flagsOf=({uv=true,up=true}={})=>(up?FLAGS.UP:0)|(uv?FLAGS.UV:0)|(synced?FLAGS.BE|FLAGS.BS:0);
 return {
  credentials,
  // options: the JSON the server sent (PublicKeyCredentialCreationOptionsJSON). Overrides allow negative tests.
  async create(options,{origin,rpId=options.rp?.id,uv=true,type='webauthn.create',challenge=options.challenge}={}){
   const id=crypto.getRandomValues(new Uint8Array(16));
   const authData=cat(await sha256(rpId),Uint8Array.of(flagsOf({uv})|FLAGS.AT),u32(0),new Uint8Array(16),Uint8Array.of(0,id.length),id,cose);
   const clientDataJSON=enc.encode(JSON.stringify({type,challenge,origin,crossOrigin:false}));
   const attestationObject=cbor(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]));
   const credential={id:b64u(id),rpId,userHandle:options.user?.id,counter:0};credentials.push(credential);
   return {id:credential.id,rawId:credential.id,type:'public-key',response:{clientDataJSON:b64u(clientDataJSON),attestationObject:b64u(attestationObject),transports:['internal']},clientExtensionResults:{},authenticatorAttachment:'platform'};
  },
  // A discoverable assertion with the chosen credential (default: the first). counter: what this authenticator reports.
  async get(options,{origin,rpId=options.rpId,uv=true,credential=credentials[0],counter=credential.counter,type='webauthn.get',challenge=options.challenge,userHandle=credential.userHandle}={}){
   credential.counter=counter;
   const authData=cat(await sha256(rpId),Uint8Array.of(flagsOf({uv})),u32(counter));
   const clientDataJSON=enc.encode(JSON.stringify({type,challenge,origin,crossOrigin:false}));
   const signature=der(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,cat(authData,await sha256(clientDataJSON)))));
   return {id:credential.id,rawId:credential.id,type:'public-key',response:{clientDataJSON:b64u(clientDataJSON),authenticatorData:b64u(authData),signature:b64u(signature),userHandle},clientExtensionResults:{},authenticatorAttachment:'platform'};
  }
 };
}
