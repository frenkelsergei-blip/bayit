// Shared by upload validation and the document viewer. Never trust a client-supplied MIME for navigation.
export function mediaType(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),has=(...sig)=>sig.every((v,i)=>b[i]===v);
 if(has(0x25,0x50,0x44,0x46,0x2d))return 'application/pdf';
 if(has(137,80,78,71,13,10,26,10))return 'image/png';
 if(has(255,216,255))return 'image/jpeg';
 if(has(82,73,70,70)&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';
 if(has(80,75,3,4))return 'application/zip';
 return '';
}
export const previewTypes=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
export function uploadType(bytes,declared='application/octet-stream'){
 const detected=mediaType(bytes);
 if(previewTypes.has(declared)){if(detected!==declared)throw Error('The file content does not match its type.');return detected}
 if(declared==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){if(detected!=='application/zip')throw Error('Choose a valid DOCX file.');return declared}
 if(declared==='text/plain'){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw Error()}catch{throw Error('Choose a UTF-8 text file.')}return declared}
 if(declared==='application/octet-stream')return declared; // Download only; never rendered as a document.
 throw Error('Use PDF, DOCX, PNG, JPG, WebP or TXT.');
}
export function safeSampleURL(value){return typeof value==='string'&&/^\/assets\/sample-documents\/[a-z0-9-]+\.pdf$/.test(value)?value:null}
export async function inertDocument(blob){
 if(!(blob instanceof Blob)||blob.size>10*1024*1024)throw Error('This document is unavailable.');
 const detected=mediaType(new Uint8Array(await blob.slice(0,32).arrayBuffer()));
 // A claimed image/png that contains HTML becomes an opaque DOWNLOAD, never a same-origin HTML Blob.
 return {blob:new Blob([blob],{type:previewTypes.has(detected)?detected:'application/octet-stream'}),canPreview:previewTypes.has(detected)};
}
