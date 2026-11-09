import * as XLSX from 'xlsx';

// Run inside a disposable Worker. Do not upload reports, evaluate formulas, or keep identity columns.
export function readInsuranceWorkbook(buffer,filename='report.xlsx',{general=false}={}){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>5*1024*1024||!buffer.byteLength)throw Error('FILE_SIZE');
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 // Reject oversized XLSX archives before decompression (including ZIP64 archives).
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('FILE_FORMAT');const entries=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;
  if(entries>1500)throw Error('FILE_SIZE');
  for(let n=0;n<entries;n++){
   if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('FILE_FORMAT');
   const size=view.getUint32(pos+24,true);total+=size;if(size===0xffffffff||total>24*1024*1024)throw Error('FILE_SIZE');
   pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
 }
 let input=bytes,type='array';
 if(/\.(csv|tsv|txt)$/i.test(filename)){
  if(bytes[0]===255&&bytes[1]===254)input=new TextDecoder('utf-16le').decode(bytes);
  else if(bytes[0]===254&&bytes[1]===255)input=new TextDecoder('utf-16be').decode(bytes);
  else{try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{input=new TextDecoder('windows-1255').decode(bytes)}}type='string';
 }
 const book=XLSX.read(input,{type,raw:true,cellDates:false,cellFormula:false,cellHTML:false,cellStyles:false,cellNF:true,bookVBA:false,nodim:true,sheetRows:1001});
 if(!book.SheetNames.length||book.SheetNames.length>25)throw Error('FILE_SHEETS');
 return book.SheetNames.map(name=>{
  const sheet=book.Sheets[name];if(!sheet['!ref'])return {name,rows:[]};
  const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);if(range.e.r>1000||range.e.c>59)throw Error('FILE_ROWS');
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true,range:{s:{r:0,c:0},e:{r:range.e.r,c:range.e.c}}});
  // Excel's General display rounds long identifiers to scientific notation. Read the stored
  // integer, never its rounded display; preserve explicit text and zero-padding formats.
  const identifierColumns=new Set();for(const row of general?[]:rows.slice(0,80))for(let c=0;c<row.length;c++)if(/^(מספרפוליסה|מספוליסה|policynumber|policyno)$/i.test(String(row[c]).replace(/[^\p{L}\p{N}]/gu,'')))identifierColumns.add(c);
  const numericPolicyRows=[],unsafePolicyRows=[];
  for(let r=0;r<rows.length;r++)for(const c of identifierColumns){const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.t==='n'&&cell.v!=null){numericPolicyRows.push(r+1);if(!Number.isSafeInteger(cell.v)||cell.v<0||String(cell.v).length>15){unsafePolicyRows.push(r+1);rows[r][c]='';continue;}rows[r][c]=/^0+$/.test(cell.z||'')?String(cell.v).padStart(cell.z.length,'0'):String(cell.v);}}
  return {name,rows:rows.map(row=>row.map(v=>String(v??'').slice(0,500))),numericPolicyRows,unsafePolicyRows};
 }).filter(s=>s.rows.some(r=>r.some(Boolean)));
}
