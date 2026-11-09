import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindTestSession} from './fixtures/security-session.mjs';
import {blankState,visibleState} from '../app/cloud/state.mjs';
import {dueReminders} from '../app/cloud/reminders.mjs';
import {generateVapidKeys,vapidAuthorization,encryptPayload,pushMessages} from '../app/cloud/push.mjs';

const b64u=bytes=>Buffer.from(bytes).toString('base64url'),unb64u=s=>new Uint8Array(Buffer.from(s,'base64url'));
const concat=(...p)=>{const o=new Uint8Array(p.reduce((n,x)=>n+x.length,0));let i=0;for(const x of p){o.set(x,i);i+=x.length}return o};
const enc=new TextEncoder();
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data))}

// A browser-side decrypt (RFC 8291) to prove the server's message can be read by the subscribed device.
async function decrypt(message,uaPair,authSecret){
 const salt=message.slice(0,16),idlen=message[20],asPublic=message.slice(21,21+idlen),cipher=message.slice(21+idlen);
 const uaPublic=new Uint8Array(await crypto.subtle.exportKey('raw',uaPair.publicKey));
 const asKey=await crypto.subtle.importKey('raw',asPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:asKey},uaPair.privateKey,256));
 const ikm=await hmac(await hmac(authSecret,shared),concat(enc.encode('WebPush: info\0'),uaPublic,asPublic,new Uint8Array([1])));
 const prk=await hmac(salt,ikm),cek=(await hmac(prk,concat(enc.encode('Content-Encoding: aes128gcm\0'),new Uint8Array([1])))).slice(0,16),nonce=(await hmac(prk,concat(enc.encode('Content-Encoding: nonce\0'),new Uint8Array([1])))).slice(0,12);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),cipher));
 assert.equal(plain.at(-1),2,'last-record padding delimiter');
 return new TextDecoder().decode(plain.slice(0,-1));
}

test('push messages are encrypted so only the subscribed device can read them (RFC 8291)',async()=>{
 const ua=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),auth=crypto.getRandomValues(new Uint8Array(16));
 const sub={p256dh:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',ua.publicKey))),auth:b64u(auth)};
 const body=await encryptPayload(JSON.stringify({title:'שלום',body:'Bayit'}),sub);
 assert.equal(new DataView(body.buffer,body.byteOffset).getUint32(16),4096);
 assert.deepEqual(JSON.parse(await decrypt(body,ua,auth)),{title:'שלום',body:'Bayit'});
 const other=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 await assert.rejects(decrypt(body,other,auth));
});

test('VAPID authorization is a valid ES256 token for the push service origin',async()=>{
 const keys=await generateVapidKeys(),header=await vapidAuthorization('https://web.push.apple.com/abc',keys,'https://home.example',Date.UTC(2026,10,6)),[,token,k]=header.match(/^vapid t=([^,]+), k=(.+)$/);
 assert.equal(k,keys.publicKey);assert.equal(unb64u(k).length,65);
 const [h,c,s]=token.split('.'),claims=JSON.parse(Buffer.from(c,'base64url'));
 assert.deepEqual(JSON.parse(Buffer.from(h,'base64url')),{typ:'JWT',alg:'ES256'});
 assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.sub,'https://home.example');assert.ok(claims.exp>Date.UTC(2026,10,6)/1000);
 const pub=await crypto.subtle.importKey('raw',unb64u(k),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,unb64u(s),enc.encode(h+'.'+c)));
});

const date='2026-11-06',members=[{id:'mom',name:'Mom',role:'parent'},{id:'dad',name:'Dad',role:'parent'},{id:'kid',name:'Kid',role:'child'}];
function home(){
 const d=blankState('home','Home',members[0]);d.members=members;d.profiles.dad={name:'Dad',locale:'en'};d.profiles.kid={name:'Kid'};d.profiles.mom={name:'Mom',locale:'en'};
 const r=(id,extra)=>({id,title:id,he:id,ownerId:'mom',visibility:'family',allowedIds:[],date,...extra});
 d.tasks=[r('shared',{memberId:'mom',time:'09:00'}),r('dad-secret',{memberId:'dad',time:'09:00',ownerId:'dad',visibility:'private'}),r('own-lead',{memberId:'mom',time:'10:00',reminder:30}),r('no-reminder',{memberId:'mom',time:'09:05',reminder:'none'})];
 return d;
}

test('push uses the recipient’s visible records only, like the app and Telegram',()=>{
 const titles=pushMessages(home(),'mom',{date,time:'08:55'},'parent').map(m=>m.title);
 assert.ok(titles.includes('shared'));
 assert.ok(!titles.includes('dad-secret'),'someone else’s private task never reaches the lock screen');
 assert.ok(pushMessages(home(),'mom',{date,time:'08:55'},'parent').every(m=>m.url.startsWith('#')&&m.key));
});

test('an item’s own reminder wins over the person’s default; "none" means no reminder',()=>{
 const view=visibleState(home(),'mom');
 assert.deepEqual(dueReminders(view,'mom',{date,time:'09:30'}).map(r=>r.record.id),['own-lead']);
 assert.ok(!dueReminders(view,'mom',{date,time:'09:01'}).some(r=>r.record.id==='no-reminder'));
 const off=home();off.profiles.mom.notificationPrefs={categories:{tasks:{enabled:false}}};
 assert.deepEqual(dueReminders(visibleState(off,'mom'),'mom',{date,time:'09:30'}),[],'the recipient’s own off switch still wins');
});

test('the minute tick delivers once per device, and forgets a device the push service says is gone',async()=>{
 const {openD1,migrate}=await import('../app/host/d1-sqlite.mjs');const {deliverPush}=await import('../app/cloud/push.mjs');
 const {mkdtempSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const db=openD1(join(mkdtempSync(join(tmpdir(),'bayit-push-')),'db.sqlite'));migrate(db,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const env={DB:db,APP_ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const devices=[];for(const name of ['phone','old-tablet']){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),auth=crypto.getRandomValues(new Uint8Array(16));devices.push({name,pair,auth});
  await db.prepare('INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?,?)').bind(name,'home','mom','https://fcm.googleapis.com/qa/'+name,b64u(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),b64u(auth),0).run()}
 await bindTestSession(db,'home','mom');const state=home(),sent=[];
 const fetcher=async(url,init)=>{sent.push({url,init});return new Response('',{status:url.endsWith('old-tablet')?410:201})};
 const now=new Date('2026-11-06T06:55:00Z');// 08:55 in Israel
 const first=await deliverPush(env,now,{fetcher,loadHome:async()=>({state}),subject:'https://home.example'});
 assert.equal(first.removed,1);assert.ok(first.sent>=1);
 const phone=sent.filter(s=>s.url.endsWith('phone'));
 const msg=JSON.parse(await decrypt(new Uint8Array(phone[0].init.body),devices[0].pair,devices[0].auth));
 assert.equal(msg.title,'Bayit');assert.equal(msg.url,'#today');assert.doesNotMatch(msg.body,/shared|private/);
 assert.match(phone[0].init.headers.Authorization,/^vapid t=.+, k=.+/);assert.equal(phone[0].init.headers['Content-Encoding'],'aes128gcm');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first()).n,1,'the gone device is deleted');
 sent.length=0;const again=await deliverPush(env,now,{fetcher,loadHome:async()=>({state}),subject:'https://home.example'});
 assert.equal(sent.length,0,'nothing is sent twice');assert.equal(again.sent,0);
});

test('the server-only Push test origin rewrites transport while preserving the real endpoint audience',async()=>{
 const {sendPush}=await import('../app/cloud/push.mjs'),keys=await generateVapidKeys(),pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);let captured;
 const endpoint='https://fcm.googleapis.com/fcm/send/fictional';await sendPush({PUSH_TEST_ORIGIN:'http://127.0.0.1:8897'},{endpoint,p256dh:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),auth:b64u(crypto.getRandomValues(new Uint8Array(16)))},{title:'Fictional test'},{keys,fetcher:async(url,init)=>{captured={url,init};return new Response(null,{status:201})}});assert.equal(captured.url,'http://127.0.0.1:8897/fcm/send/fictional');const jwt=captured.init.headers.Authorization.match(/^vapid t=([^,]+),/)[1];assert.equal(JSON.parse(new TextDecoder().decode(unb64u(jwt.split('.')[1]))).aud,'https://fcm.googleapis.com');
});
