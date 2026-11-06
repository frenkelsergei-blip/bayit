// Private service binding only: no public route, database, file bucket or credentials.
import {boundedPDFRows,MAX_STATEMENT_BYTES} from './statement-pdf.mjs';
import {boundedBytes} from './outbound.mjs';
import {json,fail} from './util.mjs';
export default {async fetch(request){try{const path=new URL(request.url).pathname;if(path==='/health'&&request.method==='GET')return json({ok:true,service:'bayit-pdf-reader'});if(path!=='/parse'||request.method!=='POST')throw fail('Not found.',404);if(request.headers.get('Content-Type')!=='application/pdf')throw fail('Send a PDF.',415);const bytes=await boundedBytes(new Response(request.body,{headers:request.headers}),MAX_STATEMENT_BYTES);return json({rows:await boundedPDFRows(bytes)})}catch(error){return json({error:error.status?error.message:'The isolated PDF reader could not read this file.'},error.status||422)}}};
