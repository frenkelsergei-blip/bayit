import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {handleVouchers} from '../app/cloud/vouchers.mjs';
import {rotateStoredCredentials} from '../app/cloud/credential-rotation.mjs';
import {voucherStatus} from '../shared/vouchers.mjs';

test('private voucher API encrypts redemption and preserves lifecycle and write versions', async t => {
 const DB = openD1(':memory:');
 t.after(() => DB.close());
 migrate(DB,fileURLToPath(new URL('../app/cloud/migrations/',import.meta.url)));
 for (const id of ['one','two']) {
  await DB.prepare('INSERT INTO households(id,name,created_by,created_at) VALUES (?,?,?,?)').bind(id,id,'alice','2026-11-09').run();
 }
 const oldKey = Buffer.alloc(32,7).toString('base64');
 let env = {DB,APP_ENCRYPTION_KEY:oldKey};
 const id = crypto.randomUUID(), path = '/api/vouchers/'+id;
 const call = async (method,path,body,{owner='alice',member=owner,house='one'}={}) => {
  const request = new Request('https://example.test'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const home = {id:house,membership:{user_id:owner,member_id:member},state:{members:[{id:'alice'},{id:'bob'}]}};
  return (await handleVouchers(request,env,home,path)).json();
 };
 const payload = {version:0,merchant:'Example',title:'Groceries',balanceCents:15000,startsOn:'2026-11-01',expiresOn:'2026-11-16',
  secret:{code:'0000 1234',original:'https://example.test/sensitive-original'}};
 await assert.rejects(call('PUT',path,{...payload,expiresOn:'2026-11-31'}), {code:'VOUCHER_INVALID_DATES'});
 await assert.rejects(call('PUT',path,{...payload,secret:{original:'javascript:alert(1)'}}), {code:'VOUCHER_INVALID_LINK'});
 const created = (await call('PUT',path,payload)).record;
 assert.deepEqual((await call('PUT',path,payload)).record,created);
 const stored = await DB.prepare('SELECT metadata,ciphertext FROM vouchers').first();
 assert.match(stored.ciphertext,/^v2\.main\./);
 assert.doesNotMatch(JSON.stringify(stored),/0000 1234|sensitive-original/);
 const list = await call('GET','/api/vouchers');
 assert.deepEqual(list.records,[created]);
 assert.equal(created.hasRedemption,true);
 assert.doesNotMatch(JSON.stringify(list),/0000 1234|sensitive-original/);
 for (const scope of [{owner:'bob'},{owner:'bob',member:'alice'},{house:'two'}]) {
  assert.deepEqual(await call('GET','/api/vouchers',undefined,scope),{records:[]});
  await assert.rejects(call('GET',path+'/redeem',undefined,scope),{status:404});
  await assert.rejects(call('POST',path,{version:1,action:'trash'},scope),{status:404});
 }
 env = {...env,APP_ENCRYPTION_KEY:Buffer.alloc(32,8).toString('base64'),APP_ENCRYPTION_KEY_ID:'next',APP_ENCRYPTION_KEYS_JSON:JSON.stringify({main:oldKey})};
 assert.equal((await rotateStoredCredentials(env)).rotated,1);
 delete env.APP_ENCRYPTION_KEYS_JSON;
 assert.deepEqual(await call('GET',path+'/redeem'),payload.secret);
 const saved = (await call('PUT',path,{...payload,version:1,balanceCents:5500,secret:undefined})).record;
 assert.equal(saved.balanceCents,5500);
 assert.deepEqual(await call('GET',path+'/redeem'),payload.secret);
 await assert.rejects(call('POST',path,{version:1,action:'archive'}),{code:'VOUCHER_CHANGED'});
 await assert.rejects(call('DELETE',path,{version:2}),{status:409});
 const archived = (await call('POST',path,{version:2,action:'archive'})).record;
 assert.equal(archived.shelf,'archive');
 await assert.rejects(call('GET',path+'/redeem'),{status:404});
 const trashed = (await call('POST',path,{version:3,action:'trash'})).record;
 assert.equal(trashed.shelf,'trash');
 const restored = (await call('POST',path,{version:4,action:'restore'})).record;
 assert.equal(restored.shelf,'archive');
 const reopened = (await call('POST',path,{version:5,action:'restore'})).record;
 assert.equal(reopened.shelf,'active');
 const used = (await call('POST',path,{version:6,action:'use'})).record;
 assert.equal(used.shelf,'archive');
 assert.equal(used.balanceCents,0);
 assert.equal(voucherStatus(used,'2026-11-09'),'used');
 await call('POST',path,{version:7,action:'trash'});
 assert.deepEqual(await call('DELETE',path,{version:8}),{deleted:true});
 assert.deepEqual(await call('GET','/api/vouchers'),{records:[]});
});

test('expiry uses complete known dates and includes the end day', () => {
 assert.equal(voucherStatus({expiresOn:''},'2026-11-09'),'unknown');
 assert.equal(voucherStatus({startsOn:'2026-11-10',expiresOn:'2026-11-16'},'2026-11-09'),'upcoming');
 assert.equal(voucherStatus({expiresOn:'2026-11-16'},'2026-11-09'),'soon');
 assert.equal(voucherStatus({expiresOn:'2026-11-17'},'2026-11-09'),'valid');
 assert.equal(voucherStatus({expiresOn:'2026-11-09'},'2026-11-09'),'soon');
 assert.equal(voucherStatus({expiresOn:'2026-11-08'},'2026-11-09'),'expired');
});
