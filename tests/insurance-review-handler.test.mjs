import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {blankState} from '../app/cloud/state.mjs';
import {encryptKey} from '../app/cloud/util.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url)),{build}=require('esbuild');
const scratch=await mkdtemp(join(tmpdir(),'bayit-insurance-review-'));
await build({entryPoints:[new URL('../app/cloud/insurance-review.mjs',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:join(scratch,'handler.mjs'),logLevel:'silent'});
const {handleInsuranceReview}=await import(pathToFileURL(join(scratch,'handler.mjs')).href);
const policy=(id,ownerId,extra={})=>({id,ownerId,visibility:'private',allowedIds:[],title:'Coverage '+id,he:'כיסוי '+id,insurer:'Fictional insurer',policyNumber:'PRIVATE-NUMBER-999',insuredName:'PRIVATE INSURED NAME',memberIds:[ownerId],premiumCents:10000,premiumPeriod:'monthly',currency:'ILS',status:'active',startDate:'2026-01-01',endDate:'2027-01-01',documentIds:[],paymentIds:['PRIVATE PAYMENT'],note:'PRIVATE NOTE',...extra});
const state=()=>{const d=blankState('home','Fictional home',{id:'alice',role:'parent',name:'Alice'});d.members.push({id:'bob',name:'Bob',role:'adult'},{id:'kid',name:'Kid',role:'child'});d.profiles.bob={};d.profiles.kid={};d.insurances=[policy('own','alice',{title:'Coverage own PRIVATE-NUMBER-999 for PRIVATE INSURED NAME',documentIds:['secret-doc']}),policy('secret','bob',{title:'PRIVATE OTHER POLICY'}),policy('shared','bob',{visibility:'selected',allowedIds:['alice'],documentIds:['secret-doc','visible-doc']})];d.documents=[{id:'secret-doc',title:'Secret document',ownerId:'bob',visibility:'private',allowedIds:[]},{id:'visible-doc',title:'Shared document',ownerId:'bob',visibility:'selected',allowedIds:['alice']}];return d};
const req=ids=>new Request('https://bayit.example/api/ai/insurance-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policyIds:ids,language:'en'})});
const home=(d,actor='alice',role='parent')=>({id:'home',state:d,membership:{member_id:actor,role}});
test('real insurance review handler enforces visibility before provider access and validates output',async t=>{
 const originalFetch=globalThis.fetch;let calls=0,captured='',responseInput={summary:'Check the original documents.',findings:[{kind:'document_check',policyIds:['own'],title:'Verify document dates',explanation:'No currently accessible document is linked.'}]};
 const env={APP_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')},key='not-a-real-provider-key';
 const ciphertext=await encryptKey(key,env,'home'),queries=[];let usage=1;
 env.DB={prepare(sql){queries.push(sql);return {bind(){return this},async run(){return {meta:{changes:1}}},async first(){return /household_secrets/.test(sql)?{ciphertext,verified:1,model:'fictional-model',provider:'anthropic'}:{requests:usage}}}}};
 globalThis.fetch=async(url,options)=>{calls++;captured=JSON.stringify(JSON.parse(options.body));return new Response(JSON.stringify({content:[{type:'tool_use',name:'review_insurance_records',input:responseInput}],stop_reason:'tool_use'}),{headers:{'Content-Type':'application/json'}})};
 try{
  await t.test('child refused without loading credentials',async()=>{queries.length=0;await assert.rejects(handleInsuranceReview(req(['own']),env,home(state(),'kid','child')),e=>e.status===403);assert.equal(queries.length,0);assert.equal(calls,0)});
  await t.test('private or foreign IDs refused before credentials, with one generic error',async()=>{for(const ids of [['secret'],['another-household'],['own','secret']]){queries.length=0;await assert.rejects(handleInsuranceReview(req(ids),env,home(state())),e=>e.status===403&&e.code==='POLICY_UNAVAILABLE');assert.equal(queries.length,0)}assert.equal(calls,0)});
  await t.test('own and explicitly shared rows work without exposing private fields or hidden document IDs',async()=>{const d=state(),before=JSON.stringify(d),r=await handleInsuranceReview(req(['own','shared']),env,home(d)),body=await r.json();assert.equal(body.policyCount,2);assert.equal(body.findings.length,1);assert.equal(JSON.stringify(d),before);for(const secret of ['PRIVATE OTHER POLICY','PRIVATE NOTE','PRIVATE PAYMENT','PRIVATE-NUMBER','PRIVATE INSURED NAME','secret-doc'])assert.ok(!captured.includes(secret));const prompt=JSON.parse(JSON.parse(captured).messages.at(-1).content);assert.deepEqual(prompt.rows.map(p=>p.accessibleDocumentCount),[0,1]);assert.ok(!queries.some(q=>/UPDATE household_data|DELETE|INSERT INTO household_data/.test(q)))});
  await t.test('provider cannot return a link to another private policy',async()=>{responseInput={summary:'Review',findings:[{kind:'possible_overlap',policyIds:['secret'],title:'Check',explanation:'Compare'}]};await assert.rejects(handleInsuranceReview(req(['own']),env,home(state())),e=>e.status===502&&e.code==='AI_REVIEW_INVALID')});
  await t.test('selection size and usage limits stop requests',async()=>{const before=calls;await assert.rejects(handleInsuranceReview(req([]),env,home(state())),e=>e.status===400);await assert.rejects(handleInsuranceReview(req(Array(201).fill('own')),env,home(state())),e=>e.status===400);usage=101;await assert.rejects(handleInsuranceReview(req(['own']),env,home(state())),e=>e.status===429);assert.equal(calls,before)});
 }finally{globalThis.fetch=originalFetch;await rm(scratch,{recursive:true,force:true})}
});
