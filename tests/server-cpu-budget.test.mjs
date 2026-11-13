// Cloudflare's free tier stops a request after about 10 ms of CPU. On 2026-11-12 a family with photos and 340 KB of household
// data saw saves stay "waiting to sync" and Today's Expenses fail, because every read re-decoded each stored photo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {imageData,safePhoto} from '../shared/state-validation.mjs';

const src=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
// A real-shaped JPEG of about 100 KB: SOI, filler APP1 segments, then the frame header with its size.
function jpeg(width,height,filler=100000){
 const parts=[[0xFF,0xD8]];
 for(let left=filler;left>0;left-=65000){const n=Math.min(65000,left);parts.push([0xFF,0xE1,(n+2)>>8,(n+2)&255],new Array(n).fill(7))}
 parts.push([0xFF,0xC0,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x22,0,2,0x11,1,3,0x11,1],[0xFF,0xD9]);
 return 'data:image/jpeg;base64,'+Buffer.from(parts.flat()).toString('base64');
}

test('a stored photo is decoded once, not on every read of the household',()=>{
 const photo=jpeg(640,480),realAtob=globalThis.atob;let decoded=0;
 globalThis.atob=s=>{decoded++;return realAtob(s)};
 try{
  for(let i=0;i<5;i++)assert.equal(imageData(photo),true);
  assert.equal(safePhoto(photo),photo);
 }finally{globalThis.atob=realAtob}
 assert.equal(decoded,1,'five reads and a safePhoto check decode the photo once');
});

test('remembered verdicts never let a bad image through',()=>{
 assert.equal(imageData(jpeg(4000,300)),false,'too wide');
 assert.equal(imageData(jpeg(4000,300)),false,'still too wide the second time');
 assert.equal(imageData(jpeg(0,10)),false);
 const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,40,0,0,0,30,8,6,0,0,0]).toString('base64');
 assert.equal(imageData(png),false,'PNG only where it is allowed');
 assert.equal(imageData(png,{png:true}),true,'the same picture where PNG is allowed');
 assert.equal(imageData(png),false,'and the answer for JPEG-only is not mixed up with it');
 assert.equal(imageData('data:image/jpeg;base64,'+Buffer.from([0x89,0x50,0x4E,0x47]).toString('base64')),false,'a PNG pretending to be a JPEG');
 assert.throws(()=>safePhoto('data:image/jpeg;base64,AAAA'));
});

test('a save serialises the new household data once',()=>{
 const handler=src('app/cloud/worker.mjs').split("if(match[2]==='changes'")[1].split("action:'state.change'")[0];
 assert.equal((handler.match(/JSON\.stringify\(next\)/g)||[]).length,1);
});

test('Today’s money widgets say they could not load, offer Try again, and stay readable on the money card',()=>{
 const money=src('app/src/money-detail.jsx'),widgets=money.split('// Today widgets share one request per household.')[1].split('export function',3).slice(0,3).join('');
 assert.doesNotMatch(widgets,/after signing in|לאחר התחברות/,'only signed-in adults see these widgets');
 assert.match(widgets,/Bayit’s server could not be reached, so expenses did not load\./);assert.match(widgets,/Bayit’s server could not be reached, so bills did not load\./);
 assert.match(widgets,/'Try again','לנסות שוב'/);
 assert.match(widgets,/if\(financeCache\.promise===promise\)financeCache\.promise=null/,'a failed answer is not cached for a minute');
 const css=src('app/src/today-density.css');
 assert.match(css,/\.today-money :is\([^)]*\.widget-load-failed p[^)]*\)\{color:rgba\(255,255,255,\.92\)\}/,'light text on the money gradient');
});

// The 1.74.0 photo check, verbatim, as the reference: the remembered verdicts must agree with it on every kind of input.
import {mediaType} from '../shared/safe-media.mjs';
function referenceImageData(value,{png=false}={}){
 if(typeof value!=='string'||value.length>180000)return false;
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match||match[1]==='png'&&!png)return false;
 let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))}catch{return false}
 if(mediaType(bytes)!=='image/'+match[1])return false;
 if(match[1]==='png'){if(bytes.length<24)return false;const dv=new DataView(bytes.buffer);const w=dv.getUint32(16),h=dv.getUint32(20);return w>0&&h>0&&w<=2048&&h<=2048}
 let i=2,steps=0;while(i+8<bytes.length&&steps++<512){if(bytes[i++]!==255)return false;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;const n=bytes[i]*256+bytes[i+1];if(n<2||i+n>bytes.length)return false;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){const h=bytes[i+3]*256+bytes[i+4],w=bytes[i+5]*256+bytes[i+6];return w>0&&h>0&&w<=2048&&h<=2048}i+=n}
 return false;
}
const pngOf=(w,h)=>'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,w>>24&255,w>>16&255,w>>8&255,w&255,h>>24&255,h>>16&255,h>>8&255,h&255,8,6,0,0,0]).toString('base64');
const corpus=()=>[jpeg(512,512),jpeg(2048,2048),jpeg(2049,10),jpeg(10,0),jpeg(300,200,60000),jpeg(300,200,190000),pngOf(64,64),pngOf(4000,4),pngOf(0,5),
 'data:image/jpeg;base64,'+Buffer.from([0xFF,0xD8,0xFF,0xE1,0,40]).toString('base64'),'data:image/jpeg;base64,'+Buffer.from([0xFF,0xD8,0xFF,0xC0,0,17,8,0,10,0,10]).toString('base64'),
 'data:image/jpeg;base64,!!!!','data:image/gif;base64,R0lGODlh','data:image/jpeg;base64,'+Buffer.from([0x25,0x50,0x44,0x46,0x2d,1,2,3,4,5,6,7,8,9]).toString('base64'),'',null,42,'https://example.com/a.jpg',' '+jpeg(10,10)];

test('remembered photo verdicts agree with the 1.74.0 check on every kind of input, JPEG-only and PNG-allowed, first and second time',()=>{
 for(const png of [false,true])for(let round=0;round<2;round++)for(const [i,value] of corpus().entries())assert.equal(imageData(value,{png}),referenceImageData(value,{png}),`input ${i}, png ${png}, round ${round}`);
});

// A household of the owner's shape (two parents, a child, photos, private and child-hidden records): what each person
// is sent is the same on the first read and on every later read, with the photo verdicts remembered.
import {visibleState} from '../app/cloud/state.mjs';
test('what a parent, a second parent and a child are sent does not change when photo verdicts are remembered',()=>{
 const member=(id,role)=>({id,name:id,he:id,role,color:'blue',avatar:'',accountLinked:role==='parent'});
 const state={householdId:'h',members:[member('p1','parent'),member('p2','parent'),member('c1','child')],
  profiles:{p1:{name:'p1',photo:jpeg(400,400),displayMode:'photo'},p2:{name:'p2',photo:jpeg(5000,10),displayMode:'photo'},c1:{name:'c1',photo:pngOf(64,64),displayMode:'photo'}},
  preferences:{householdName:'Shape test',familyPhoto:jpeg(640,480,87000),appearanceByUser:{p1:{densityByPage:{today:'compact'}},c1:{density:'compact'}}},
  tasks:[{id:'t1',title:'family',ownerId:'p1',visibility:'family',allowedIds:[]},{id:'t2',title:'mine',ownerId:'p1',visibility:'private',allowedIds:[]},{id:'t3',title:'kid',ownerId:'p2',memberId:'c1',visibility:'family',allowedIds:[]}],
  events:[],notes:[],shopping:[],history:[],purchases:[],documents:[],contacts:[],shoppingLists:[],meals:[],expenses:[{id:'e1',title:'rent',ownerId:'p1',visibility:'family',allowedIds:[],amount:1}],pantry:[],bills:[],taskLists:[],places:[],insurances:[],shoppingMarks:[],favourites:[],receipts:[]};
 for(const actor of ['p1','p2','c1']){const first=JSON.stringify(visibleState(structuredClone(state),actor)),again=JSON.stringify(visibleState(structuredClone(state),actor));
  assert.equal(again,first,actor);
  const view=JSON.parse(first);
  assert.equal(view.preferences.familyPhoto,state.preferences.familyPhoto,'a valid family photo is sent');
  assert.equal(!!view.tasks.find(t=>t.id==='t2'),actor==='p1','a private task only to its owner');
  assert.equal(view.expenses.length,actor==='c1'?0:1,'expenses never to a child')}
});

test('an unchanged poll is answered from membership and revision, with the same refusal as before for anyone else',()=>{
 const worker=src('app/cloud/worker.mjs'),route=worker.split("const match=path.match(/^\\/api\\/households\\/([^/]+)\\/(state|changes)$/);if(match){")[1];
 const fast=route.split('const home=await chosenHousehold(')[0];
 assert.match(fast,/SELECT 1 FROM memberships WHERE household_id=\? AND user_id=\?/,'membership is checked first');
 assert.match(fast,/throw fail\('This household is unavailable\.',403\)/,'same refusal as household()');
 assert.match(fast,/status:304/);assert.doesNotMatch(fast,/loadHousehold|JSON\.parse/,'no household load for a 304');
 assert.match(worker,/async function household\(env,user,id\)\{const membership=await env\.DB\.prepare\('SELECT \* FROM memberships WHERE household_id=\? AND user_id=\?'\)\.bind\(id,user\.id\)\.first\(\);if\(!membership\)throw fail\('This household is unavailable\.',403\)/,'the rule it mirrors is unchanged');
});
