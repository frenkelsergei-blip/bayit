import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');

test('Workers outbound requests reach providers and refuse redirects without following them',async()=>{
 const {outputFiles}=await build({stdin:{contents:`import {externalFetch} from './app/cloud/outbound.mjs';
 export default {async fetch(request){try{const response=await externalFetch({},'https://provider.example.test'+new URL(request.url).pathname,{headers:{Authorization:'Bearer fictional-test-only'}});return Response.json({status:response.status,text:await response.text()})}catch(error){return Response.json({error:error.message},{status:error.status||500})}}};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const requests=[],mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:outputFiles[0].text,compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],outboundService:request=>{
  requests.push({url:request.url,authorization:request.headers.get('Authorization')});
  return new URL(request.url).pathname==='/redirect'?new Response('redirect body',{status:302,headers:{Location:'https://different-provider.example.test/secret'}}):Response.json({ok:true});
 }}));
 try{
  const success=await mf.dispatchFetch('http://localhost/success');assert.equal(success.status,200);assert.deepEqual(await success.json(),{status:200,text:'{"ok":true}'});
  assert.equal(requests.length,1);assert.equal(requests[0].authorization,'Bearer fictional-test-only');
  const redirect=await mf.dispatchFetch('http://localhost/redirect');assert.equal(redirect.status,502);assert.match((await redirect.json()).error,/redirects are not allowed/);
  assert.deepEqual(requests.map(r=>r.url),['https://provider.example.test/success','https://provider.example.test/redirect']);
 }finally{await mf.dispose()}
});
