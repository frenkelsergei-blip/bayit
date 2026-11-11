// The Docker host's one-time codes for passkeys (docs/passkey-sign-in-design.md §2.3 and §4.3).
// Setup code: while nobody has set Bayit up, the host makes a code at start, keeps only its digest in data/secrets.json,
// writes the code itself to data/setup-code.txt (mode 0600) and prints it in the log. When setup completes, the file
// and the digest are removed and the code is never printed again. BAYIT_SETUP_CODE (or _FILE) from the operator wins.
// Recovery code: `node recovery-cli.mjs --data DIR` (recovery-cli.mjs) stores a fresh digest; the running server reads
// it on each use, so no restart is needed. Plain codes are never written anywhere else.
import {readFileSync} from 'node:fs';
import {readFile,writeFile,rename,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {makeCode,codeDigest} from '../cloud/passkeys.mjs';
import {relyingParty,passkeysOn} from '../cloud/signin-methods.mjs';

const SETUP='BAYIT_SETUP_CODE_HASH',RECOVERY='BAYIT_RECOVERY_CODE_HASH';
const secretsFile=data=>join(data,'secrets.json'),codeFile=data=>join(data,'setup-code.txt');
async function readSecrets(data){return JSON.parse(await readFile(secretsFile(data),'utf8'))}
// Same atomic replace as installation-secrets.mjs.
async function writeSecrets(data,saved){const file=secretsFile(data),temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,JSON.stringify(saved,null,1),{mode:0o600,flag:'wx'});await rename(temp,file);await chmod(file,0o600)}
async function forgetSetupCode(data){
 await rm(codeFile(data),{force:true});
 const saved=await readSecrets(data).catch(()=>null);if(saved&&SETUP in saved){delete saved[SETUP];await writeSecrets(data,saved)}
}
const setupOpen=db=>!db.raw.prepare('SELECT 1 AS x FROM installation_setup UNION ALL SELECT 1 FROM memberships LIMIT 1').get();

// Returns the env additions for the server and what to print once at start ('' when nothing).
export async function hostSetupCode(data,db,source=process.env){
 if(!setupOpen(db)){await forgetSetupCode(data);return {env:{},line:''}}
 if(source.BAYIT_SETUP_CODE&&source.BAYIT_SETUP_CODE_FILE)throw Error('Choose one source for BAYIT_SETUP_CODE.');
 if(source.BAYIT_SETUP_CODE_FILE)return {env:{BAYIT_SETUP_CODE:(await readFile(source.BAYIT_SETUP_CODE_FILE,'utf8')).trim()},line:''};
 if(source.BAYIT_SETUP_CODE)return {env:{BAYIT_SETUP_CODE:source.BAYIT_SETUP_CODE},line:''};
 // No code is made when passkeys are off, when the address cannot do passkeys, or when the owner chose the Google
 // path with BAYIT_BOOTSTRAP_EMAIL / BAYIT_ALLOWED_EMAILS (open question Q1, conservative choice; set BAYIT_SETUP_CODE
 // to offer both).
 if(!passkeysOn(source)||!relyingParty(source)||source.BAYIT_BOOTSTRAP_EMAIL||source.BAYIT_ALLOWED_EMAILS){await forgetSetupCode(data);return {env:{},line:''}}
 const saved=await readSecrets(data);
 let code=(await readFile(codeFile(data),'utf8').catch(()=>'')).trim();
 if(!code||saved[SETUP]!==await codeDigest(code)){
  code=makeCode(randomBytes(20));saved[SETUP]=await codeDigest(code);await writeSecrets(data,saved);
  const temp=codeFile(data)+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,code+'\n',{mode:0o600,flag:'wx'});await rename(temp,codeFile(data));
 }
 await chmod(codeFile(data),0o600);
 return {env:{[SETUP]:saved[SETUP]},line:'First-time setup code: '+code+' Open '+relyingParty(source).origin+' and enter it. (Also in '+codeFile(data)+'; it stops working once setup is done.)'};
}
// Called by the server right after the first owner finished setup.
export const setupCompleted=data=>async()=>{await forgetSetupCode(data)};
// A live view of the operator recovery digest, read from secrets.json on each use (written by recovery-cli.mjs).
export function recoveryDigestGetter(data){return ()=>{try{const v=JSON.parse(readFileSync(secretsFile(data),'utf8'))[RECOVERY];return typeof v==='string'?v:undefined}catch{return undefined}}}
// recovery-cli.mjs: a fresh one-time code; any earlier unused one stops working.
export async function newRecoveryCode(data){const saved=await readSecrets(data),code=makeCode(randomBytes(20));saved[RECOVERY]=await codeDigest(code);await writeSecrets(data,saved);return code}
