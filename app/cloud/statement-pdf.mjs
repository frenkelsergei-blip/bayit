// Turns a statement PDF into positioned text rows for the format parsers in shared/finance-parse.mjs.
// Runs in the Pages Worker and in Node tests. No AI is involved: known formats are parsed exactly.
import {getDocumentProxy} from 'unpdf';

import {MAX_STATEMENT_BYTES} from './pdf-limits.mjs';
import {readBoundPDF} from './pdf-binding.mjs';
export {MAX_STATEMENT_BYTES};

// Rows are ordered page by page, top to bottom; items inside a row are ordered right to left (Hebrew reading order).
let platformReader;
export function installPlatformPDFReader(reader){if(platformReader)throw Error('PDF reader is already configured.');platformReader=reader}
export function hasPlatformPDFReader(){return typeof platformReader==='function'}
export async function pdfRows(bytes,env){return platformReader?platformReader(bytes):readBoundPDF(env,bytes)}
export async function boundedPDFRows(bytes,factory=getDocumentProxy){
 if(bytes.length>MAX_STATEMENT_BYTES)throw Object.assign(Error('This statement is larger than 5 MB.'),{status:413});
 if(!(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46))throw Object.assign(Error('This file is not a PDF.'),{status:415});
 const pdf=await factory(bytes),rows=[],deadline=Date.now()+12000;let totalItems=0,totalText=0;
 try{
  if(pdf.numPages>40)throw Object.assign(Error('This statement has too many pages.'),{status:413});
  for(let p=1;p<=pdf.numPages;p++){
   if(Date.now()>deadline)throw Object.assign(Error('This statement took too long to read.'),{status:422});
   const content=await (await pdf.getPage(p)).getTextContent();totalItems+=content.items.length;
   if(content.items.length>15000||totalItems>100000)throw Object.assign(Error('This statement has too much text.'),{status:413});
   const items=content.items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>({x:i.transform[4],y:i.transform[5],s:i.str.trim()})).sort((a,b)=>b.y-a.y),pageRows=[];
   for(const item of items){totalText+=item.s.length;if(totalText>1000000||item.s.length>20000)throw Object.assign(Error('This statement has too much text.'),{status:413});const last=pageRows.at(-1);if(last&&Math.abs(last.y-item.y)<=2.5)last.items.push(item);else pageRows.push({page:p,y:item.y,items:[item]})}
   if(rows.length+pageRows.length>20000)throw Object.assign(Error('This statement has too many rows.'),{status:413});
   for(const row of pageRows){row.items.sort((a,b)=>b.x-a.x);row.text=row.items.map(i=>i.s).join(' ');rows.push(row)}
  }
  return rows;
 }finally{await pdf.destroy?.()}
}
