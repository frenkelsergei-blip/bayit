// Turns a statement PDF into positioned text rows for the format parsers in shared/finance-parse.mjs.
// Runs in the Pages Worker and in Node tests. No AI is involved: known formats are parsed exactly.
import {getDocumentProxy} from 'unpdf';

export const MAX_STATEMENT_BYTES=5_000_000;

// Rows are ordered page by page, top to bottom; items inside a row are ordered right to left (Hebrew reading order).
export async function pdfRows(bytes){
 if(bytes.length>MAX_STATEMENT_BYTES)throw Object.assign(Error('This statement is larger than 5 MB.'),{status:413});
 if(!(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46))throw Object.assign(Error('This file is not a PDF.'),{status:415});
 const pdf=await getDocumentProxy(bytes),rows=[];
 if(pdf.numPages>40)throw Object.assign(Error('This statement has too many pages.'),{status:413});
 for(let p=1;p<=pdf.numPages;p++){
  const content=await (await pdf.getPage(p)).getTextContent(),items=content.items.filter(i=>i.str&&i.str.trim()).map(i=>({x:i.transform[4],y:i.transform[5],s:i.str.trim()})).sort((a,b)=>b.y-a.y);
  const pageRows=[];for(const item of items){const row=pageRows.find(r=>Math.abs(r.y-item.y)<=2.5);if(row)row.items.push(item);else pageRows.push({page:p,y:item.y,items:[item]})}
  for(const row of pageRows){row.items.sort((a,b)=>b.x-a.x);row.text=row.items.map(i=>i.s).join(' ');rows.push(row)}
 }
 await pdf.destroy?.();
 return rows;
}
