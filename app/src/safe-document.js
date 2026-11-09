import {inertDocument,safeSampleURL} from '../../shared/safe-media.mjs';
import {getLocalFile} from './file-store.js';
export async function documentBlob(record,{demo=false}={}){
 if(record.fileId){const file=await getLocalFile(record.fileId);if(!(file instanceof Blob))throw Error('This file is unavailable.');return file}
 const sample=demo&&safeSampleURL(record.sampleUrl);if(!sample)throw Error('This document has no authorized file.');const response=await fetch(sample,{redirect:'error'});if(!response.ok)throw Error('This sample is unavailable.');return response.blob();
}
export function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=String(filename||'document').replace(/[\u0000-\u001f/\\]/g,'').slice(0,180)||'document';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
export async function openDocument(record,{download=false,demo=false}={}){
 if(!download){window.dispatchEvent(new CustomEvent('bayit-open-document',{detail:{record,demo}}));return}
 const {blob}=await inertDocument(await documentBlob(record,{demo}));downloadBlob(blob,record.filename);
}
