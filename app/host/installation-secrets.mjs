import {readFile,writeFile,rename,stat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export async function installationSecrets(data,source=process.env){
 const file=join(data,'secrets.json'),inputs={};
 const generators={AUTH_SECRET:()=>randomBytes(32).toString('base64url'),APP_ENCRYPTION_KEY:()=>randomBytes(32).toString('base64'),REMINDER_CRON_SECRET:()=>randomBytes(24).toString('base64url')};
 for(const name of [...Object.keys(generators),'APP_ENCRYPTION_KEYS_JSON']){
  if(source[name]&&source[name+'_FILE'])throw Error('Choose one source for '+name+'.');
  inputs[name]=source[name+'_FILE']?(await readFile(source[name+'_FILE'],'utf8')).trim():source[name];if(inputs[name]?.length>20000)throw Error('Installation secret input is too large.');
 }
 let saved={},exists=false;
 try{saved=JSON.parse(await readFile(file,'utf8'));exists=true;if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('invalid')}catch(e){if(e.code!=='ENOENT')throw Error('Installation secrets could not be read. Restore the original secrets.json; no replacement keys were generated.');if((await stat(join(data,'bayit.sqlite')).catch(()=>null))?.size&&Object.keys(generators).some(k=>!inputs[k]))throw Error('Existing database is missing its installation key file. Restore the original secrets or supply every original key externally.')}
 let changed=false;for(const [name,make]of Object.entries(generators))if(!inputs[name]&&!saved[name]){if(exists)throw Error('The installation secret file is incomplete. Restore the original file.');saved[name]=make();changed=true}
 const result=Object.fromEntries(Object.keys(generators).map(k=>[k,inputs[k]||saved[k]]));if(inputs.APP_ENCRYPTION_KEYS_JSON)result.APP_ENCRYPTION_KEYS_JSON=inputs.APP_ENCRYPTION_KEYS_JSON;
 if(typeof result.AUTH_SECRET!=='string'||result.AUTH_SECRET.length<32||typeof result.REMINDER_CRON_SECRET!=='string'||result.REMINDER_CRON_SECRET.length<24||Buffer.from(result.APP_ENCRYPTION_KEY||'','base64').length!==32)throw Error('Installation keys have invalid lengths. Restore the original keys.');
 if(changed){const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,JSON.stringify(saved,null,1),{mode:0o600,flag:'wx'});await rename(temp,file)}if(exists||changed)await chmod(file,0o600);return result;
}
