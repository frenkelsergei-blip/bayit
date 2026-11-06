import {limit} from './security.mjs';
import {lease} from './leases.mjs';
import {fail} from './util.mjs';
export const checkPDFBudget=env=>limit(env,'statement-reader-day',{max:Math.min(200,Math.max(1,Number(env.PDF_DAILY_LIMIT)||20)),period:86400000});
export async function withPDFSlot(env,operation){let release;for(let i=0;i<2&&!release;i++)release=await lease(env,'statement-admission:'+i,90000);if(!release)throw fail('The statement reader is busy. Try again shortly. No import was saved.',429);try{return await operation()}finally{await release()}}
