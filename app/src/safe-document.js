import {inertDocument,safeSampleURL} from '../../shared/safe-media.mjs';
import {getLocalFile} from './file-store.js';
export async function openDocument(record,{download=false,demo=false}={}){
 let original;
 if(record.fileId)original=await getLocalFile(record.fileId);
 else{const sample=demo&&safeSampleURL(record.sampleUrl);if(!sample)throw Error('This document has no authorized file.');const response=await fetch(sample,{redirect:'error'});if(!response.ok)throw Error('This sample is unavailable.');original=await response.blob()}
 const {blob,canPreview}=await inertDocument(original),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;
 if(download||!canPreview)link.download=String(record.filename||'document').replace(/[\u0000-\u001f/\\]/g,'').slice(0,180)||'document';
 else{link.target='_blank';link.rel='noopener noreferrer'}
 link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
