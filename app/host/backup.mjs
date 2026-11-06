// Offline operator tool: encrypted snapshots include SQLite, attachments and any local installation keys.
import {DatabaseSync,backup} from 'node:sqlite';
import {scrypt as derive,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {gzipSync,gunzipSync} from 'node:zlib';
import {mkdtemp,mkdir,readFile,writeFile,readdir,lstat,rm,rename,rmdir,chmod} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
const scrypt=promisify(derive),MAX=250*1024*1024,AAD=Buffer.from('Bayit encrypted backup v1');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function key(passphrase,salt){if(typeof passphrase!=='string'||passphrase.trim().length<16)throw Error('Use a separate backup passphrase of at least 16 characters.');return scrypt(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})}
async function walk(base,relative,items){for(const entry of await readdir(join(base,relative),{withFileTypes:true})){const path=relative+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Backup refuses symbolic links.');if(entry.isDirectory())await walk(base,path,items);else if(entry.isFile())items.push(path)}}
export async function createBackup(dataDir,file,passphrase,{stopped=false}={}){
 if(!stopped)throw Error('Stop the household server before backing up and pass --stopped.');
 const data=resolve(dataDir),scratch=await mkdtemp(join(tmpdir(),'bayit-backup-'));await chmod(scratch,0o700);
 try{
  const snapshot=join(scratch,'bayit.sqlite'),db=new DatabaseSync(join(data,'bayit.sqlite'),{readOnly:true});try{await backup(db,snapshot)}finally{db.close()}await chmod(snapshot,0o600);
  const paths=['bayit.sqlite'];try{await lstat(join(data,'secrets.json'));paths.push('secrets.json')}catch(e){if(e.code!=='ENOENT')throw e}try{await walk(data,'files',paths)}catch(e){if(e.code!=='ENOENT')throw e}
  const entries=[];let size=0;for(const path of paths){const source=path==='bayit.sqlite'?snapshot:join(data,path),info=await lstat(source);if(!info.isFile()||info.isSymbolicLink())throw Error('Backup input is not a regular file.');size+=info.size;if(size>MAX)throw Error('This backup exceeds the local archive limit. Use the documented external backup procedure.');const bytes=await readFile(source);entries.push({path,hash:digest(bytes),data:bytes.toString('base64')})}
  const local=entries.find(e=>e.path==='secrets.json'),requiresExternalKeys=!local||['AUTH_SECRET','APP_ENCRYPTION_KEY','REMINDER_CRON_SECRET'].some(k=>!JSON.parse(Buffer.from(local.data,'base64').toString())[k]);
  const payload=gzipSync(Buffer.from(JSON.stringify({version:1,createdAt:new Date().toISOString(),requiresExternalKeys,entries}))),salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await key(passphrase,salt),iv);cipher.setAAD(AAD);const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
  await writeFile(file,JSON.stringify({version:1,kdf:'scrypt-32768-8-1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}),{mode:0o600,flag:'wx'});return {files:entries.length,requiresExternalKeys};
 }finally{await rm(scratch,{recursive:true,force:true})}
}
export async function restoreBackup(file,dataDir,passphrase,{stopped=false}={}){
 if(!stopped)throw Error('Stop the household server before restoring and pass --stopped.');
 const info=await lstat(file);if(!info.isFile()||info.size>MAX*2)throw Error('Invalid backup file.');const archive=JSON.parse(await readFile(file,'utf8'));
 if(archive.version!==1||archive.kdf!=='scrypt-32768-8-1')throw Error('Unsupported backup format.');
 const salt=Buffer.from(archive.salt||'','base64'),iv=Buffer.from(archive.iv||'','base64'),tag=Buffer.from(archive.tag||'','base64');if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error('Invalid backup header.');
 let payload;try{const decipher=createDecipheriv('aes-256-gcm',await key(passphrase,salt),iv);decipher.setAAD(AAD);decipher.setAuthTag(tag);payload=JSON.parse(gunzipSync(Buffer.concat([decipher.update(Buffer.from(archive.ciphertext,'base64')),decipher.final()]),{maxOutputLength:MAX*2}).toString())}catch{throw Error('Backup verification failed. Check the passphrase and file integrity.');}
 if(!Array.isArray(payload.entries)||payload.entries.length>100000)throw Error('Invalid backup manifest.');const names=new Set();let size=0;
 for(const entry of payload.entries){if(typeof entry.path!=='string'||! /^(bayit\.sqlite|secrets\.json|files\/[A-Za-z0-9_./-]+)$/.test(entry.path)||entry.path.split('/').some(p=>!p||p==='.'||p==='..')||names.has(entry.path))throw Error('Unsafe backup path.');names.add(entry.path);entry.bytes=Buffer.from(entry.data,'base64');size+=entry.bytes.length;if(size>MAX||digest(entry.bytes)!==entry.hash)throw Error('Backup content verification failed.');}
 if(!names.has('bayit.sqlite'))throw Error('Database is missing from backup.');
 const dest=resolve(dataDir);try{if((await readdir(dest)).length)throw Error('Restore only into an empty data directory.')}catch(e){if(e.code!=='ENOENT')throw e}await mkdir(dirname(dest),{recursive:true});const staging=await mkdtemp(dest+'.restore-');await chmod(staging,0o700);
 try{for(const entry of payload.entries){const target=join(staging,entry.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,entry.bytes,{mode:0o600,flag:'wx'})}const check=new DatabaseSync(join(staging,'bayit.sqlite'),{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored database failed its integrity check.')}finally{check.close()}await rmdir(dest).catch(e=>{if(e.code!=='ENOENT')throw e});await rename(staging,dest);return {files:payload.entries.length,requiresExternalKeys:payload.requiresExternalKeys===true}}catch(e){await rm(staging,{recursive:true,force:true});throw e}
}
