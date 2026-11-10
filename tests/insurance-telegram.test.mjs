import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import * as XLSX from '../app/node_modules/xlsx/xlsx.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,hash} from '../app/cloud/util.mjs';
import {blankState,visibleState} from '../app/cloud/state.mjs';
import {FEATURE_IDS} from '../shared/features.mjs';
import {stageInsuranceReport,readInsurancePreview,discardInsurancePreview,applyInsurancePreview} from '../app/cloud/insurance-import.mjs';

const require=createRequire(new URL('../app/package.json',import.meta.url)),scratch=await mkdtemp(join(tmpdir(),'bayit-insurance-telegram-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/telegram.mjs',import.meta.url).pathname,new URL('../app/cloud/assistant.mjs',import.meta.url).pathname],outdir:scratch,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const {commitAsMember}=await import(pathToFileURL(join(scratch,'assistant.mjs')));
const {handleTelegramWebhook}=await import(pathToFileURL(join(scratch,'telegram.mjs')));after(()=>rm(scratch,{recursive:true,force:true}));
function workbook(){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['חברת ביטוח','שם המוצר','מספר פוליסה','דמי ביטוח חודשיים'],['חברת בדיקה','כיסוי לבדיקה','00123456789',100],['חברת בדיקה','כיסוי נוסף','00123456789',50]]),'Test');return XLSX.write(w,{type:'buffer',bookType:'xlsx'});}
async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);const sent=[],files=[],bytes=workbook(),env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64')};
 const objects=new Map();env.FILES={async put(k,b){objects.set(k,new Uint8Array(b))},async get(k){const b=objects.get(k);return b?{body:new Response(b).body}:null},async delete(k){objects.delete(k)}};
 const state=blankState('home','Fictional household',{id:'a',name:'Adult A',role:'parent'});state.preferences.features=Object.fromEntries(FEATURE_IDS.map(id=>[id,true])); /* every feature on (features registry, 2026-11-09) */state.members.push({id:'b',name:'Adult B',role:'adult'},{id:'kid',name:'Child',role:'child'});state.profiles.b={name:'Adult B'};state.profiles.kid={name:'Child'};
 for(const [id,role,name]of [['a','parent','Adult A'],['b','adult','Adult B']]){await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,name).run();await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('home',id,id,role,new Date().toISOString()).run();}
 await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind('home',JSON.stringify(state)).run();
 const hook='test-hook-12345678901234',secret='test-webhook-secret';await DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind('home',await encryptKey('fictional-bot-token',env,'telegram:home'),'1','test_bot',hook,await hash(secret),'a',new Date().toISOString()).run();
 for(const [member,chat,user]of [['a','100','200'],['kid','101','201']])await DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,linked_at) VALUES(?,?,?,?,?)').bind('home',member,chat,user,new Date().toISOString()).run();
 env.OUTBOUND_FETCH=async(url,options)=>{if(String(url).includes('/file/bot'))return new Response(bytes);const method=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);if(method==='getFile'){files.push(body);return Response.json({ok:true,result:{file_path:'files/report.xlsx',file_size:bytes.length}});}sent.push({method,...body});return Response.json({ok:true,result:{message_id:sent.length}});};
 let update=0;const post=async content=>{const r=await handleTelegramWebhook(new Request('https://example.test/api/telegram/hook/'+hook,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:++update,...content})}),env,hook);assert.equal(r.status,200);};
 const upload=(child=false)=>post({message:{from:{id:child?201:200,language_code:'en'},chat:{id:child?101:100,type:'private'},document:{file_id:'test-file',file_name:'test-insurance.xlsx',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}});
 const callback=(data,user=200)=>post({callback_query:{id:'query-'+update,from:{id:user,language_code:'en'},message:{message_id:1,chat:{id:100,type:'private'}},data}});
 const load=async()=>JSON.parse((await DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind('home').first()).state);
 return {DB,env,state,sent,files,upload,callback,load,objects,bytes};
}
test('real Telegram webhook stages Excel, asks for insured identity, confirms privately and prevents replay or a forged sender',async()=>{
 const f=await fixture();try{
  await f.upload();assert.equal((await f.load()).insurances.length,0);const preview=f.sent.find(x=>x.method==='sendMessage');assert.match(preview.text,/2 coverage rows/);assert.match(preview.text,/1 policy number\b/);const chooseChild=preview.reply_markup.inline_keyboard.flat().find(x=>x.text.includes('Child'));assert.ok(chooseChild);
  const raw=(await f.DB.prepare("SELECT payload FROM telegram_actions WHERE id LIKE 'insurance-%'").first()).payload;assert.ok(!raw.includes('00123456789'));assert.ok(!raw.includes('חברת בדיקה'));
  await f.callback(chooseChild.callback_data,999);assert.equal((await f.load()).insurances.length,0);await f.callback(chooseChild.callback_data);const confirm=f.sent.filter(x=>x.method==='sendMessage').at(-1).reply_markup.inline_keyboard[0][0];assert.match(confirm.text,/Confirm insurance/);
  await f.callback(confirm.callback_data);const saved=await f.load();assert.equal(saved.insurances.length,2);assert.ok(saved.insurances.every(p=>p.ownerId==='a'&&p.visibility==='private'&&p.memberIds[0]==='kid'));assert.equal(visibleState(saved,'b').insurances.length,0);assert.equal(visibleState(saved,'kid').insurances.length,0);assert.equal(saved.documents.length,1);const source=saved.documents[0];assert.equal(source.sourceKind,'insurance-report');assert.equal(source.importChannel,'telegram');assert.deepEqual(source.memberIds,['kid']);assert.equal(source.visibility,'private');assert.ok(saved.insurances.every(p=>p.sourceDocumentIds[0]===source.id));assert.ok(saved.insurances.every(p=>p.documentIds.length===0),'Excel is not a full policy');assert.equal(visibleState(saved,'b').documents.length,0);assert.equal(visibleState(saved,'kid').documents.length,0);const row=await f.DB.prepare('SELECT * FROM files WHERE id=?').bind(source.fileId).first();assert.deepEqual(f.objects.get(row.object_key),new Uint8Array(f.bytes));
  await f.callback(confirm.callback_data);assert.equal((await f.load()).insurances.length,2);assert.match((await f.DB.prepare("SELECT payload FROM telegram_actions WHERE id LIKE 'insurance-%'").first()).payload,/insurance_consumed/);
  await f.upload(true);assert.equal(f.files.length,1,'child rejected before downloading the report');
 }finally{f.DB.close();}
});
test('staged reports are scoped, expire, discard securely, and a refused save releases confirmation for retry',async()=>{
 const f=await fixture();try{
  const home={id:'home',state:f.state},p=await stageInsuranceReport(f.env,home,'a',workbook(),'test.xlsx');await assert.rejects(readInsurancePreview(f.env,home,'b',p.id),/preview/);await assert.rejects(stageInsuranceReport(f.env,home,'kid',workbook(),'test.xlsx'),/adult/);
  await assert.rejects(applyInsurancePreview(f.env,home,'a',p.id,'a',async()=>{throw Error('refused');}),/refused/);assert.equal((await readInsurancePreview(f.env,home,'a',p.id)).rows.length,2);
  const beforeDiscard=await readInsurancePreview(f.env,home,'a',p.id);const discardedFile=await f.DB.prepare('SELECT * FROM files WHERE id=?').bind(beforeDiscard.document.fileId).first();await discardInsurancePreview(f.env,home,'a',p.id);assert.equal(f.objects.has(discardedFile.object_key),false);assert.equal((await f.DB.prepare('SELECT id FROM files WHERE id=?').bind(beforeDiscard.document.fileId).first()),null);await assert.rejects(readInsurancePreview(f.env,home,'a',p.id),/preview/);
  const expired=await stageInsuranceReport(f.env,home,'a',workbook(),'test.xlsx');await f.DB.prepare('UPDATE telegram_actions SET expires_at=0 WHERE id=?').bind(expired.id).run();await assert.rejects(readInsurancePreview(f.env,home,'a',expired.id),/expired/);
 }finally{f.DB.close();}
});


test('an original disappearing during Telegram confirmation refuses the entire import and releases the preview for recovery',async()=>{
 const f=await fixture();try{
  const home={id:'home',state:f.state,revision:0},preview=await stageInsuranceReport(f.env,home,'a',workbook(),'test.xlsx'),report=await readInsurancePreview(f.env,home,'a',preview.id);
  await assert.rejects(applyInsurancePreview(f.env,home,'a',preview.id,'kid',async mutate=>{await f.DB.prepare('UPDATE files SET deleting_at=1 WHERE id=?').bind(report.document.fileId).run();return commitAsMember(f.env,home,'a',mutate)}),/own file|same moment/);
  assert.equal((await f.load()).insurances.length,0);assert.equal((await f.load()).documents.length,0);assert.ok(await readInsurancePreview(f.env,home,'a',preview.id));
  await f.DB.prepare('UPDATE files SET deleting_at=NULL WHERE id=?').bind(report.document.fileId).run();await applyInsurancePreview(f.env,home,'a',preview.id,'kid',mutate=>commitAsMember(f.env,home,'a',mutate));assert.equal((await f.load()).documents.length,1);
 }finally{f.DB.close()}
});
