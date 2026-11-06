// Resolve once, check every address, then pin that exact resolution to the TLS connection.
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import {Readable} from 'node:stream';
import {isPrivateAddress} from '../cloud/outbound.mjs';
export function createOutboundFetch(env,{resolve=lookup,httpsRequest=https.request,httpRequest=http.request}={}){
 const privateOrigins=new Set(String(env.AI_PRIVATE_ORIGINS||'').split(/[\s,]+/).filter(Boolean));
 const testOrigins=new Set(['TELEGRAM_API_ORIGIN','AI_TEST_ORIGIN','SPEECH_TEST_ORIGIN','RISEUP_TEST_ORIGIN','PUSH_TEST_ORIGIN'].map(k=>env[k]).filter(v=>/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(v||'')));
 return async function pinnedFetch(value,options={}){
  const url=new URL(value),test=testOrigins.has(url.origin),allowPrivate=test||privateOrigins.has(url.origin);
  if(url.username||url.password||url.protocol!=='https:'&&!(test&&url.protocol==='http:'))throw Error('Outbound address is not allowed.');
  const addresses=await resolve(url.hostname.replace(/^\[|\]$/g,''),{all:true,verbatim:true});
  if(!addresses.length||!allowPrivate&&addresses.some(r=>isPrivateAddress(r.address)))throw Error('Outbound DNS resolved to a private or reserved address.');
  const address=addresses[0],request=url.protocol==='https:'?httpsRequest:httpRequest;
  return new Promise((done,reject)=>{
   const headers=new Headers(options.headers);headers.set('accept-encoding','identity');
   const req=request(url,{method:options.method||'GET',headers:Object.fromEntries(headers),agent:false,signal:options.signal||AbortSignal.timeout(20000),lookup:(_host,opts,cb)=>opts.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
    const out=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)out.append(res.rawHeaders[i],res.rawHeaders[i+1]);
    if(res.statusCode>=300&&res.statusCode<400){res.destroy();reject(Error('Provider redirects are not allowed.'));return}
    done(new Response([204,205,304].includes(res.statusCode)?null:Readable.toWeb(res),{status:res.statusCode,headers:out}));
   });req.on('error',reject);if(options.body){if(typeof options.body==='string'||ArrayBuffer.isView(options.body))req.write(options.body);else{req.destroy();reject(Error('Unsupported outbound body.'));return}}req.end();
  });
 };
}
