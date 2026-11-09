import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {blankState} from '../app/cloud/state.mjs';
import {documentPeople,documentMatchesPerson} from '../shared/document-people.mjs';
import {DOCUMENT_CATEGORIES,validateDocumentCategories} from '../shared/document-categories.mjs';
import {validIcon} from '../shared/state-validation.mjs';
import {insuranceSourceDocument,sourceFingerprint} from '../shared/insurance-sources.mjs';

// Synthetic identities and file bytes only. Exercise the deployed worker entry point,
// its real sessions/membership guards, SQLite state commits and attachment handler.
const require=createRequire(new URL('../app/package.json',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'bayit-document-privacy-'));
await require('esbuild').build({entryPoints:[new URL('../app/cloud/worker.mjs',import.meta.url).pathname],outfile:join(scratch,'worker.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
const worker=(await import(pathToFileURL(join(scratch,'worker.mjs')))).default;
after(()=>rm(scratch,{recursive:true,force:true}));
const origin='http://127.0.0.1:55802',bytes=new TextEncoder().encode('Fictional personal document');
async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const members=[{id:'uploader',name:'Uploader',role:'parent'},{id:'partner',name:'Partner',role:'adult'},{id:'child',name:'Child',role:'child'}];
 const state=blankState('home','Fictional home',members[0]);state.members=members;for(const m of members)state.profiles[m.id]={name:m.name};
 const other=blankState('other-home','Other home',{id:'outsider',name:'Outsider',role:'parent'}),now=new Date().toISOString();
 for(const actor of [...members,{id:'outsider',name:'Outsider',role:'parent'}])await DB.batch([
  DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(actor.id,actor.name,actor.id+'@example.test'),
  DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('session-'+actor.id,'token-'+actor.id,actor.id,new Date(Date.now()+86400000).toISOString())]);
 await DB.batch([
  DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Fictional home','uploader',now),
  DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('other-home','Other home','outsider',now),
  ...members.map(m=>DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home',m.id,m.id,m.role,now)),
  DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('other-home','outsider','outsider','parent',now),
  DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(state)),
  DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('other-home',JSON.stringify(other))]);
 const objects=new Map(),FILES={async put(key,b){objects.set(key,new Uint8Array(b))},async get(key){const value=objects.get(key);return value?{body:new Response(value).body}:null},async delete(key){objects.delete(key)}};
 const env={DB,FILES,AUTH_SECRET:'synthetic-document-regression-secret',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('fixture')}};
 const request=(actor,path,{method='GET',body,home='home',headers={}}={})=>worker.fetch(new Request(origin+path,{method,headers:{Cookie:'authjs.session-token=token-'+actor,Origin:origin,'X-Bayit-Household':home,...(body instanceof Uint8Array?{}:body?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined}),env);
 const read=async(actor='uploader')=>{const response=await request(actor,'/api/households/home/state');assert.equal(response.status,200);return response.json()};
 const write=async(actor,record,{baseRevision}={})=>request(actor,'/api/households/home/changes',{method:'POST',body:{baseRevision:baseRevision??(await read()).revision,changes:[{collection:'documents',id:record.id,value:record}]}});
 const upload=async(actor='uploader')=>{const fileId=crypto.randomUUID(),response=await request(actor,'/api/files/'+fileId,{method:'PUT',body:bytes,headers:{'Content-Type':'text/plain','X-File-Name':'fictional.txt'}});assert.equal(response.status,201,await response.text());return fileId};
 return {DB,request,read,write,upload,objects,close:()=>DB.close()};
}
const doc=(fileId,extra={})=>({id:'document',fileId,title:'Fictional document',he:'מסמך בדוי',filename:'fictional.txt',mime:'text/plain',category:'Home',ownerId:'uploader',memberIds:['partner'],visibility:'private',allowedIds:[],...extra});

test('document subjects preserve unknown legacy assignment, household subjects and joint subjects',()=>{
 assert.equal(documentPeople({ownerId:'uploader'}),null);
 assert.deepEqual(documentPeople({memberIds:[]}),[]);
 assert.deepEqual(documentPeople({memberId:'child'}),['child']);
 assert.deepEqual(documentPeople({memberIds:['partner','child','partner']}),['partner','child']);
 assert.equal(documentMatchesPerson({memberIds:['partner']},'partner'),true);
 assert.equal(documentMatchesPerson({memberIds:['partner']},'uploader'),false);
 assert.equal(documentMatchesPerson({},'all'),true);
 assert.equal(documentMatchesPerson({},'child'),false);
});

test('private upload about another adult/child grants neither subject metadata nor direct file access',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload();assert.equal((await f.write('uploader',doc(fileId,{memberIds:['partner','child']}))).status,200);
  assert.deepEqual((await f.read()).data.documents[0].memberIds,['partner','child']);
  for(const actor of ['partner','child']){assert.equal((await f.read(actor)).data.documents.length,0);assert.equal((await f.request(actor,'/api/files/'+fileId)).status,404)}
  const own=await f.request('uploader','/api/files/'+fileId);assert.equal(own.status,200);assert.equal(await own.text(),new TextDecoder().decode(bytes));assert.equal(own.headers.get('Cache-Control'),'private, no-store');
 }finally{f.close()}
});

test('selected viewers can read bytes; other adults/children cannot; assigning the household does not widen selected access',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload(),record=doc(fileId,{memberIds:[],visibility:'selected',allowedIds:['partner']});assert.equal((await f.write('uploader',record)).status,200);
  assert.equal((await f.read('partner')).data.documents[0].id,record.id);assert.equal((await f.request('partner','/api/files/'+fileId)).status,200);
  assert.equal((await f.read('child')).data.documents.length,0);assert.equal((await f.request('child','/api/files/'+fileId)).status,404);
  assert.equal((await f.write('partner',{...record,title:'Changed by viewer'})).status,403);
  assert.equal((await f.write('partner',{...record,visibility:'family',allowedIds:[]})).status,403);
 }finally{f.close()}
});

test('family visibility includes children; revoking access and trashing revoke direct file links immediately',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload(),record=doc(fileId,{memberIds:['uploader'],visibility:'family'});assert.equal((await f.write('uploader',record)).status,200);
  for(const actor of ['partner','child']){assert.equal((await f.read(actor)).data.documents.length,1);assert.equal((await f.request(actor,'/api/files/'+fileId)).status,200)}
  assert.equal((await f.write('uploader',{...record,visibility:'private'})).status,200);
  for(const actor of ['partner','child'])assert.equal((await f.request(actor,'/api/files/'+fileId)).status,404);
  assert.equal((await f.write('uploader',{...record,deletedAt:new Date().toISOString()})).status,200);
  for(const actor of ['partner','child'])assert.equal((await f.request(actor,'/api/files/'+fileId)).status,404);
  assert.equal((await f.request('uploader','/api/files/'+fileId)).status,200);
 }finally{f.close()}
});

test('forged ownership, unknown subjects/viewers and attaching someone else’s file are refused without blocking a later valid save',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload(),record=doc(fileId);assert.equal((await f.write('uploader',record)).status,200);
  for(const bad of [{...record,ownerId:'partner'},{...record,memberIds:['not-in-home']},{...record,visibility:'selected',allowedIds:['not-in-home']},{...record,visibility:'selected',allowedIds:[]}])assert.ok((await f.write('uploader',bad)).status>=400);
  assert.equal((await f.read()).data.documents[0].visibility,'private');
  assert.equal((await f.write('partner',{...record,id:'stolen',ownerId:'partner',visibility:'family'})).status,403);
  assert.equal((await f.write('uploader',{...record,memberIds:['child'],visibility:'selected',allowedIds:['partner']})).status,200);
  assert.equal((await f.read()).data.documents[0].ownerId,'uploader');assert.equal((await f.read('partner')).data.documents.length,1);
 }finally{f.close()}
});

test('an outsider cannot use guessed file identifiers, household headers or copied private links',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload();assert.equal((await f.write('uploader',doc(fileId,{visibility:'family'}))).status,200);
  assert.equal((await f.request('outsider','/api/files/'+fileId)).status,403);
  assert.equal((await f.request('outsider','/api/files/'+fileId,{home:'other-home'})).status,404);
  assert.equal((await f.request('outsider','/api/households/home/state')).status,403);
 }finally{f.close()}
});

test('invalid legacy metadata cannot grant direct access to a hidden attachment',async()=>{
 const f=await fixture();try{
  const fileId=await f.upload();const snapshot=await f.read();snapshot.data.documents.push(doc(fileId,{title:{invalid:true},visibility:'family'}));
  await f.DB.prepare('UPDATE household_data SET state=? WHERE household_id=?').bind(JSON.stringify(snapshot.data),'home').run();
  assert.equal((await f.read('partner')).data.documents.length,0);assert.equal((await f.request('partner','/api/files/'+fileId)).status,404);
 }finally{f.close()}
});

test('custom category names stay private in profiles; document categories follow document access and cannot contain arbitrary icon URLs',async()=>{
 const f=await fixture();try{
  const category={id:crypto.randomUUID(),title:'Fictional private category',he:'קטגוריה בדויה',icon:'1F4C4'};
  let snapshot=await f.read();const response=await f.request('uploader','/api/households/home/changes',{method:'POST',body:{baseRevision:snapshot.revision,changes:[{collection:'profiles',id:'uploader',value:{...snapshot.data.profiles.uploader,documentCategories:[category]}}]}});assert.equal(response.status,200);
  assert.equal((await f.read()).data.profiles.uploader.documentCategories[0].id,category.id);assert.equal((await f.read('partner')).data.profiles.uploader.documentCategories,undefined);assert.equal((await f.read('child')).data.profiles.uploader.documentCategories,undefined);
  const fileId=await f.upload(),record=doc(fileId,{categories:[DOCUMENT_CATEGORIES[0],category]});assert.equal((await f.write('uploader',record)).status,200);assert.equal((await f.read('partner')).data.documents.length,0);
  assert.equal((await f.write('uploader',{...record,visibility:'selected',allowedIds:['partner']})).status,200);assert.equal((await f.read('partner')).data.documents[0].categories[1].title,category.title);
  for(const categories of [[{...category,icon:'https://tracker.example.test/pixel.png'}],[{...category,title:{invalid:true}}],[category,category]])assert.ok((await f.write('uploader',{...record,categories})).status>=400);
  validateDocumentCategories(DOCUMENT_CATEGORIES,validIcon);assert.throws(()=>validateDocumentCategories([...DOCUMENT_CATEGORIES,category],validIcon));
 }finally{f.close()}
});

test('parent profile management cannot read or change a child’s private custom category catalog',async()=>{
 const f=await fixture();try{
  const snapshot=await f.read(),category={id:'private-child',title:'Private',he:'פרטי',icon:'1F4C4'};
  const result=await f.request('uploader','/api/households/home/changes',{method:'POST',body:{baseRevision:snapshot.revision,changes:[{collection:'profiles',id:'child',value:{name:'Child',documentCategories:[category]}}]}});assert.equal(result.status,403);
 }finally{f.close()}
});

test('a retained Excel source is a private downloadable file, byte-identical to its upload and categorized separately from full policy terms',async()=>{
 const f=await fixture();try{
  const content=new Uint8Array([80,75,3,4,0,0,0,0,1,2,3,4]),fileId=crypto.randomUUID(),mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const upload=await f.request('uploader','/api/files/'+fileId,{method:'PUT',body:content,headers:{'Content-Type':mime,'X-File-Name':'fictional.xlsx'}});assert.equal(upload.status,201);
  const record=insuranceSourceDocument({fileId,filename:'fictional.xlsx',size:content.length,ownerId:'uploader',memberIds:['child'],sha256:await sourceFingerprint(content)});assert.equal((await f.write('uploader',record)).status,200);
  const stored=(await f.read()).data.documents[0];assert.equal(stored.category,'Insurance');assert.equal(stored.sourceKind,'insurance-report');assert.deepEqual(stored.memberIds,['child']);
  const download=await f.request('uploader','/api/files/'+fileId);assert.equal(download.headers.get('Content-Type'),mime);assert.match(download.headers.get('Content-Disposition'),/attachment/);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),content);
  for(const actor of ['partner','child'])assert.equal((await f.request(actor,'/api/files/'+fileId)).status,404);
 }finally{f.close()}
});
