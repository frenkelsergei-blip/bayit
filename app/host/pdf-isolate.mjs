import {Worker} from 'node:worker_threads';
let active=0;
export async function isolatedPDFRows(bytes,{workerURL=new URL('./pdf-parser-worker.mjs',import.meta.url),timeout=15000}={}){
 if(active>=2)throw Object.assign(Error('The statement reader is busy. Try again shortly.'),{status:503});active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=new Worker(workerURL,{workerData:new Uint8Array(bytes),resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4},execArgv:[]});
  let finished=false;const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate().catch(()=>{});error?reject(error):resolve(result)};
  const timer=setTimeout(()=>finish(Object.assign(Error('This statement took too long to read.'),{status:422})),timeout);
  worker.once('error',()=>finish(Object.assign(Error('This PDF exceeded the isolated reader’s limits.'),{status:422})));
  worker.once('message',result=>result.error?finish(Object.assign(Error(result.error),{status:result.status||422})):finish(null,result.rows));
  worker.once('exit',code=>{if(!finished)finish(Object.assign(Error('The isolated PDF reader stopped.'),{status:422}))});
 })}finally{active--}
}
