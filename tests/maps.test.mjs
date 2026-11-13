import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {handleMapsAPI} from '../app/cloud/maps.mjs';
import {blankState} from '../app/cloud/state.mjs';
import {decryptKey} from '../app/cloud/util.mjs';
import {steadyClock} from './fixtures/steady-clock.mjs';

// Synthetic keys and a loopback provider only. No real Google account, location or credential is used.
const placesKey='fixture-places-key-000000000',embedKey='fixture-embed-key-000000000';
async function fixture(){
 const calls=[],server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):undefined;calls.push({url:req.url,key:req.headers['x-goog-api-key'],mask:req.headers['x-goog-fieldmask'],body});
  if(req.headers['x-goog-api-key']==='fixture-rejected-key-000000'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Never echo '+req.headers['x-goog-api-key']}}));return}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.url.includes('autocomplete')?{suggestions:[{placePrediction:{placeId:'fixture-place',structuredFormat:{mainText:{text:'A street 12'},secondaryText:{text:'Fixture city'}}}}]}:{id:'fixture-place',formattedAddress:'A street 12, Fixture city'}));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),MAPS_TEST_ORIGIN:'http://127.0.0.1:'+server.address().port},state=blankState('h','Fixture',{id:'parent',name:'Parent',role:'parent'});state.members.push({id:'child',name:'Child',role:'child'});state.profiles.child={};
 const home={id:'h',state,membership:{member_id:'parent',role:'parent'}};
 const call=(action,body,method=body===undefined?'GET':'POST',which=home)=>handleMapsAPI(new Request('https://example.invalid/api/maps/'+action,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,which,'/api/maps/'+action);
 return {env,home,call,calls,close:()=>{DB.close();server.close()}};
}
test('connection is optional; search is gated; status returns no credentials',async()=>{
 const f=await fixture();try{const s=await(await f.call('status')).json();assert.equal(s.configured,false);assert.equal(s.canManage,true);assert.equal(f.calls.length,0);await assert.rejects(f.call('autocomplete',{input:'Address',sessionToken:crypto.randomUUID()}),e=>e.code==='MAPS_NOT_CONFIGURED');assert.equal(f.calls.length,0)}finally{f.close()}
});
test('only parent can configure; failed validation leaves the prior connection intact; keys are encrypted',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.call('credentials',{placesKey,embedKey},'POST',{...f.home,membership:{member_id:'child',role:'child'}}),e=>e.status===403);
  const r=await(await f.call('credentials',{placesKey,embedKey,language:'he'})).json();assert.equal(r.configured,true);assert.equal(r.mapVerified,false);assert.ok(r.searchVerifiedAt);assert.ok(!JSON.stringify(r).includes(placesKey));assert.ok(!JSON.stringify(r).includes(embedKey));
  const row=await f.env.DB.prepare('SELECT * FROM maps_connections WHERE household_id=?').bind('h').first();assert.ok(!JSON.stringify(row).includes(placesKey));assert.equal(await decryptKey(row.places_ciphertext,f.env,'h:maps:places'),placesKey);assert.equal(await decryptKey(row.embed_ciphertext,f.env,'h:maps:embed'),embedKey);
  await assert.rejects(f.call('credentials',{placesKey:'fixture-rejected-key-000000',embedKey}),e=>e.code==='MAPS_REJECTED'&&!e.message.includes('fixture-rejected-key'));
  assert.equal((await(await f.call('status')).json()).searchVerifiedAt,r.searchVerifiedAt);assert.equal((await f.env.DB.prepare('SELECT * FROM maps_connections WHERE household_id=?').bind('h').first()).places_ciphertext,row.places_ciphertext);
 }finally{f.close()}
});
test('autocomplete keeps sessions and global language; place lookup requests only essential fields',async()=>{
 const f=await fixture();try{await f.call('credentials',{placesKey,embedKey});const sessionToken=crypto.randomUUID();const result=await(await f.call('autocomplete',{input:'פריז',language:'he',sessionToken})).json();assert.equal(result.suggestions[0].placeId,'fixture-place');assert.equal(f.calls.at(-1).body.languageCode,'he');assert.equal(f.calls.at(-1).body.sessionToken,sessionToken);assert.equal(f.calls.at(-1).body.includedRegionCodes,undefined);
  const detail=await(await f.call('place',{placeId:'fixture-place',language:'he',sessionToken})).json();assert.equal(detail.address,'A street 12, Fixture city');assert.equal(f.calls.at(-1).mask,'id,formattedAddress,attributions');assert.ok(f.calls.at(-1).url.includes(sessionToken));assert.equal(detail.location,undefined);
 }finally{f.close()}
});
test('record-backed place requests refuse private records before calling the provider',async()=>{
 const f=await fixture();try{await f.call('credentials',{placesKey,embedKey});f.home.state.events=[{id:'secret',ownerId:'child',visibility:'private',location:{placeId:'fixture-place'}}];const before=f.calls.length;
  await assert.rejects(f.call('place',{collection:'events',recordId:'secret',placeId:'fixture-place'}),e=>e.status===404);assert.equal(f.calls.length,before);
  f.home.state.places=[{id:'hidden-place',ownerId:'child',visibility:'private',location:{placeId:'fixture-place'}}];await assert.rejects(f.call('place',{collection:'places',recordId:'hidden-place'}),e=>e.status===404);
 }finally{f.close()}
});
test('map frame uses only the Embed key; record access, encoding and no-store are enforced',async()=>{
 const f=await fixture();try{await f.call('credentials',{placesKey,embedKey});let response;
  // Routing passes the URL and pathname separately, as the real worker does.
  const url=new URL('https://example.invalid/api/maps/embed?placeId=fixture-place&language=he');response=await handleMapsAPI(new Request(url),f.env,f.home,'/api/maps/embed',url);const html=await response.text();assert.ok(html.includes(embedKey));assert.ok(!html.includes(placesKey));assert.ok(html.includes('place_id%3Afixture-place'));assert.ok(html.includes('language=he'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);
  f.home.state.events=[{id:'private',ownerId:'child',visibility:'private',location:{placeId:'fixture-place'}}];const privateURL=new URL('https://example.invalid/api/maps/embed?collection=events&recordId=private');await assert.rejects(handleMapsAPI(new Request(privateURL),f.env,f.home,'/api/maps/embed',privateURL),e=>e.status===404);
 }finally{f.close()}
});
test('request shape and rate limits stop unbounded provider calls; disconnect leaves activity data intact',async()=>{
 const f=await fixture();try{await f.call('credentials',{placesKey,embedKey});await assert.rejects(f.call('autocomplete',{input:'A',sessionToken:crypto.randomUUID()}),e=>e.code==='MAPS_QUERY');await assert.rejects(f.call('autocomplete',{input:'Address',sessionToken:'bad'}),e=>e.code==='MAPS_SESSION');
  // The usage row and the refused call must fall in the same minute (fixtures/steady-clock.mjs).
  await steadyClock(async()=>{await f.env.DB.prepare('INSERT INTO maps_usage VALUES(?,?,?,?)').bind('h','parent',Math.floor(Date.now()/60000),60).run();const before=f.calls.length;await assert.rejects(f.call('autocomplete',{input:'Address',sessionToken:crypto.randomUUID()}),e=>e.status===429);assert.equal(f.calls.length,before)});
  f.home.state.events=[{id:'e',location:{label:'Home',placeId:'fixture-place'}}];const result=await(await f.call('credentials',undefined,'DELETE')).json();assert.equal(result.configured,false);assert.equal(f.home.state.events[0].location.placeId,'fixture-place');
 }finally{f.close()}
});

// Deploy transitions must not make optional manual locations depend on a newly created table.
test('a pending Maps migration is a controlled optional-service error',async()=>{
 const DB=openD1(':memory:'),env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64')},home={id:'h',state:blankState('h','Fixture',{id:'parent',role:'parent'}),membership:{member_id:'parent',role:'parent'}};
 try{await assert.rejects(handleMapsAPI(new Request('https://example.invalid/api/maps/status'),env,home,'/api/maps/status'),e=>e.status===503&&e.code==='MAPS_SETUP_PENDING'&&!e.message.includes('SQLITE'));
 const manual={id:'manual',ownerId:'parent',visibility:'family',title:'Manual location',memberIds:['parent'],date:'2026-11-06',time:'18:00',location:{label:'At home'}};const {applyChanges}=await import('../app/cloud/state.mjs');assert.equal(applyChanges(home.state,[{collection:'events',id:'manual',value:manual}],'parent','parent').events[0].location.label,'At home');
 }finally{DB.close()}
});
