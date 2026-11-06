import {parentPort,workerData} from 'node:worker_threads';
import {boundedPDFRows} from '../cloud/statement-pdf.mjs';
try{parentPort.postMessage({rows:await boundedPDFRows(workerData)})}catch(e){parentPort.postMessage({error:e.status?e.message:'This PDF could not be read.',status:e.status||422})}
