// A Cloudflare R2-compatible file store on a local folder, for running Bayit outside Cloudflare.
// Implements put/get/head/delete with httpMetadata, which is what Bayit's private document storage uses.
import {mkdir,readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';

export function openFileStore(root){
 const base=resolve(root);
 const pathFor=key=>{const p=resolve(base,String(key));if(!p.startsWith(base+sep))throw new Error('Invalid file key.');return p};
 const bytesOf=async value=>value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(await new Response(value).arrayBuffer());
 const meta=async p=>{try{return JSON.parse(await readFile(p+'.meta.json','utf8'))}catch{return null}};
 const object=(key,info,buffer)=>({key,size:info.size,uploaded:new Date(info.uploaded),httpMetadata:info.httpMetadata||{},customMetadata:info.customMetadata||{},
  writeHttpMetadata(headers){if(info.httpMetadata?.contentType)headers.set('Content-Type',info.httpMetadata.contentType)},
  ...(buffer?{get body(){return new Response(buffer).body},arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),text:async()=>new TextDecoder().decode(buffer),json:async()=>JSON.parse(new TextDecoder().decode(buffer))}:{})});
 return {
  async put(key,value,options={}){
   const p=pathFor(key),bytes=await bytesOf(value),info={size:bytes.byteLength,uploaded:new Date().toISOString(),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}};
   await mkdir(dirname(p),{recursive:true});await writeFile(p+'.part',bytes);await rename(p+'.part',p);await writeFile(p+'.meta.json',JSON.stringify(info));
   return object(key,info);
  },
  async get(key){const p=pathFor(key),info=await meta(p);if(!info)return null;try{return object(key,info,await readFile(p))}catch{return null}},
  async head(key){const p=pathFor(key),info=await meta(p);if(!info)return null;try{await stat(p);return object(key,info)}catch{return null}},
  async delete(keys){for(const key of [].concat(keys)){const p=pathFor(key);await rm(p,{force:true});await rm(p+'.meta.json',{force:true})}}
 };
}
