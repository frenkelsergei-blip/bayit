// Host e2e for Web Push: status, subscribe, a real encrypted test send to a loopback "push service", gone-device cleanup.
// Run against the Node host (dist/host) with APP_ENCRYPTION_KEY set and the fixture sessions loaded.
import assert from 'node:assert/strict';import http from 'node:http';
const base=process.env.BAYIT_TEST_ORIGIN||'http://127.0.0.1:8096';
const received=[];let reply=201;
const push=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{received.push({url:req.url,headers:req.headers,body:Buffer.concat(chunks)});res.writeHead(reply);res.end()})});
await new Promise(r=>push.listen(8897,'127.0.0.1',r));
let householdId='';
const call=async(path,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'authjs.session-token=fixture-session-one',Origin:base,...(householdId?{'X-Bayit-Household':householdId}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({}))}};
householdId=(await call('/api/households',{name:'Push QA family'})).body.id;assert.ok(householdId);
const status=await call('/api/push/status');assert.equal(status.status,200);assert.ok(status.body.available);assert.equal(Buffer.from(status.body.publicKey,'base64url').length,65);console.log('✔ status gives the installation public key');
const ua=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
// Only the test host explicitly allows this exact loopback origin via PUSH_TEST_ORIGIN.
const sub={endpoint:'http://127.0.0.1:8897/push/fixture-device-1',keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',ua.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
assert.equal((await call('/api/push/subscribe',{subscription:{endpoint:'ftp://x',keys:sub.keys}})).status,400);console.log('✔ rejects a non-https push address');
{const x=await call('/api/push/test',{endpoint:sub.endpoint});assert.equal(x.status,409,JSON.stringify(x.body))}console.log('✔ test needs a registered device');
{const s=await call('/api/push/subscribe',{subscription:sub,device:'iPhone'});assert.equal(s.status,200,JSON.stringify(s.body))}
assert.equal((await call('/api/push/status')).body.devices,1);console.log('✔ device registered');
const t=await call('/api/push/test',{endpoint:sub.endpoint,lang:'en'});assert.equal(t.status,200,JSON.stringify(t.body));
assert.equal(received.length,1);assert.equal(received[0].headers['content-encoding'],'aes128gcm');assert.match(received[0].headers.authorization,/^vapid t=/);console.log('✔ test was encrypted and delivered to the push service');
reply=502;assert.equal((await call('/api/push/test',{endpoint:sub.endpoint})).status,502);console.log('✔ a refused push is reported, not shown as sent');
reply=410;assert.equal((await call('/api/push/test',{endpoint:sub.endpoint})).status,410);assert.equal((await call('/api/push/status')).body.devices,0);console.log('✔ an expired device is removed');
const anon=await fetch(base+'/api/push/status');assert.equal(anon.status,401);console.log('✔ signed-out requests are refused');
push.close();console.log('push e2e passed');
