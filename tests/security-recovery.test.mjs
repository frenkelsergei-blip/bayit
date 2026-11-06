import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openD1} from '../app/host/d1-sqlite.mjs';
import {installationSecrets} from '../app/host/installation-secrets.mjs';
import {createBackup,restoreBackup} from '../app/host/backup.mjs';
import {encryptKey,decryptKey} from '../app/cloud/util.mjs';
import {isolatedPDFRows} from '../app/host/pdf-isolate.mjs';

test('SEC-19: damaged or missing keys never silently regenerate for an existing installation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bayit-keys-'));try{const first=await installationSecrets(dir,{}),second=await installationSecrets(dir,{});assert.deepEqual(first,second);assert.equal((await stat(join(dir,'secrets.json'))).mode&0o777,0o600);await writeFile(join(dir,'secrets.json'),'{broken');await assert.rejects(installationSecrets(dir,{}),/no replacement/);assert.equal(await readFile(join(dir,'secrets.json'),'utf8'),'{broken');await rm(join(dir,'secrets.json'));await writeFile(join(dir,'bayit.sqlite'),'existing');await assert.rejects(installationSecrets(dir,{}),/missing/)}finally{await rm(dir,{recursive:true,force:true})}
});

test('SEC-19: versioned credential rotation reads prior keys and legacy ciphertext, and rejects missing keys or different household AAD',async()=>{
 const old=Buffer.alloc(32,1).toString('base64'),next=Buffer.alloc(32,2).toString('base64'),legacy={APP_ENCRYPTION_KEY:old},cipher=await encryptKey('synthetic secret',legacy,'home');assert.match(cipher,/^v2\.main\./);
 const rotated={APP_ENCRYPTION_KEY:next,APP_ENCRYPTION_KEY_ID:'next',APP_ENCRYPTION_KEYS_JSON:JSON.stringify({main:old,legacy:old})};assert.equal(await decryptKey(cipher,rotated,'home'),'synthetic secret');assert.equal(await decryptKey(cipher.split('.').slice(2).join('.'),rotated,'home'),'synthetic secret');assert.match(await encryptKey('new secret',rotated,'home'),/^v2\.next\./);await assert.rejects(decryptKey(cipher,rotated,'other-home'));await assert.rejects(decryptKey(cipher,{APP_ENCRYPTION_KEY:next,APP_ENCRYPTION_KEY_ID:'next'},'home'),/original/);
});

test('SEC-19: encrypted offline backup restores SQLite, files and keys; wrong passwords, tampering and nonempty destinations fail safely',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bayit-recovery-'));try{const data=join(root,'data');await mkdir(join(data,'files','home'),{recursive:true});await installationSecrets(data,{});const db=openD1(join(data,'bayit.sqlite'));await db.exec('CREATE TABLE evidence(value TEXT)');await db.prepare('INSERT INTO evidence VALUES(?)').bind('PRIVATE RECOVERY SENTINEL').run();db.close();await writeFile(join(data,'files','home','fixture'),'private attachment');const file=join(root,'archive.bayit'),pass='a separate fictional backup passphrase';await createBackup(data,file,pass,{stopped:true});assert.doesNotMatch(await readFile(file,'utf8'),/PRIVATE RECOVERY SENTINEL|private attachment|APP_ENCRYPTION_KEY/);assert.equal((await stat(file)).mode&0o777,0o600);
 await assert.rejects(restoreBackup(file,join(root,'wrong'),'this is the wrong passphrase',{stopped:true}),/verification/);await restoreBackup(file,join(root,'restored'),pass,{stopped:true});const restored=openD1(join(root,'restored','bayit.sqlite'));assert.equal((await restored.prepare('SELECT value FROM evidence').first()).value,'PRIVATE RECOVERY SENTINEL');restored.close();assert.equal(await readFile(join(root,'restored','files','home','fixture'),'utf8'),'private attachment');assert.equal(await readFile(join(root,'restored','secrets.json'),'utf8'),await readFile(join(data,'secrets.json'),'utf8'));await assert.rejects(restoreBackup(file,data,pass,{stopped:true}),/empty/);
 const envelope=JSON.parse(await readFile(file,'utf8'));envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1);await writeFile(join(root,'bad.bayit'),JSON.stringify(envelope));await assert.rejects(restoreBackup(join(root,'bad.bayit'),join(root,'bad'),pass,{stopped:true}),/verification/);assert.equal((await readdir(data)).includes('secrets.json'),true);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('SEC-20: the isolated PDF worker is terminated at its hard timeout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bayit-reader-timeout-'));try{const path=join(dir,'stuck.mjs');await writeFile(path,'while(true){}');const start=Date.now();await assert.rejects(isolatedPDFRows(new Uint8Array([1]),{workerURL:new URL('file://'+path),timeout:150}),/too long/);assert.ok(Date.now()-start<2500)}finally{await rm(dir,{recursive:true,force:true})}
});

test('SEC-19: offline rotation re-encrypts all selected credentials atomically with their original context',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bayit-rotation-'));try{const {rotateCredentials}=await import('../app/host/rotate-credentials.mjs'),oldKey=Buffer.alloc(32,4).toString('base64'),newKey=Buffer.alloc(32,5).toString('base64'),env={APP_ENCRYPTION_KEY:oldKey},db=openD1(join(root,'bayit.sqlite'));await db.exec('CREATE TABLE household_secrets(household_id TEXT PRIMARY KEY,ciphertext TEXT);CREATE TABLE push_config(id TEXT PRIMARY KEY,private_ciphertext TEXT)');await db.prepare('INSERT INTO household_secrets VALUES(?,?)').bind('home',await encryptKey('synthetic API credential',env,'home')).run();await db.prepare('INSERT INTO push_config VALUES(?,?)').bind('vapid',await encryptKey('synthetic push key',env,'vapid')).run();db.close();const next={APP_ENCRYPTION_KEY:newKey,APP_ENCRYPTION_KEY_ID:'next',APP_ENCRYPTION_KEYS_JSON:JSON.stringify({main:oldKey})};assert.equal((await rotateCredentials(root,next,{stopped:true})).rotated,2);const check=openD1(join(root,'bayit.sqlite'));try{const api=(await check.prepare('SELECT ciphertext FROM household_secrets').first()).ciphertext;assert.match(api,/^v2\.next\./);assert.equal(await decryptKey(api,next,'home'),'synthetic API credential');await assert.rejects(decryptKey(api,next,'other'));const push=(await check.prepare('SELECT private_ciphertext FROM push_config').first()).private_ciphertext;assert.equal(await decryptKey(push,next,'vapid'),'synthetic push key')}finally{check.close()}
 }finally{await rm(root,{recursive:true,force:true})}
});
