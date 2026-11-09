import {readInsuranceWorkbook} from './insurance-workbook.mjs';
self.onmessage=({data})=>{try{self.postMessage({tables:readInsuranceWorkbook(data.buffer,data.name,{general:!!data.general})})}catch(error){self.postMessage({error:/^FILE_/.test(error.message)?error.message:'FILE_FORMAT'})}};
