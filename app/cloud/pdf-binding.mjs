import {boundedJSON} from './outbound.mjs';
import {checkPDFBudget} from './pdf-budget.mjs';
import {fail} from './util.mjs';
import {MAX_STATEMENT_BYTES} from './pdf-limits.mjs';
// Select this request's deployment binding; never cache an env/service across configuration changes.
export async function readBoundPDF(env,bytes){
 if(!env?.PDF_READER)throw Object.assign(fail('The installation owner must deploy the private PDF reader before importing statements. No import was saved.',503),{code:'PDF_READER_SETUP_REQUIRED'});
 await checkPDFBudget(env);if(bytes.length>MAX_STATEMENT_BYTES)throw fail('This statement is larger than 5 MB.',413);
 let response;try{response=await env.PDF_READER.fetch(new Request('https://pdf.internal/parse',{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(20000)}))}catch{throw fail('The isolated statement reader is unavailable. No import was saved.',503)}
 const result=await boundedJSON(response,8_000_000);if(!response.ok)throw fail(result.error||'The isolated statement reader could not read this PDF.',response.status);if(!Array.isArray(result.rows)||result.rows.length>20000)throw fail('The statement reader returned an invalid response.',502);return result.rows;
}
