export async function spreadsheetTables(blob,name){
 if(blob.size>5*1024*1024)throw Error('Preview supports spreadsheets up to 5 MB. Download the original to open it.');
 const buffer=await blob.arrayBuffer();return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./insurance-reader.worker.js',import.meta.url),{type:'module'});const end=(error,tables)=>{clearTimeout(timer);worker.terminate();error?reject(Error(error)):resolve(tables)},timer=setTimeout(()=>end('This spreadsheet took too long to preview.'),20000);worker.onerror=()=>end('The spreadsheet could not be previewed.');worker.onmessage=({data})=>end(data.error?'This spreadsheet format could not be previewed.':null,data.tables);worker.postMessage({buffer,name,general:true},[buffer])});
}
