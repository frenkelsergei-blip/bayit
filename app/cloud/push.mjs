// Web Push for Bayit: VAPID (RFC 8292) + message encryption (RFC 8291, aes128gcm), WebCrypto only,
// so it runs in Cloudflare Workers and in the Node.js host alike. Each installation generates its own key pair.
// Payloads are built from visibleState(state, recipient), the same access rules as the app and Telegram.
import {json,fail,bodyJSON,hash,encryptKey,decryptKey,localDate,localTime,encoder} from './util.mjs';
import {visibleState} from './state.mjs';
import {dueReminders,digestDue,approvalRequests,childUpdates,ownerDoneUpdates,overdueAlerts,notificationPrefs,inQuietHours,minutes} from './reminders.mjs';

const b64u=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const unb64u=value=>{const s=String(value).replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))};
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data))}
const MAX_PER_MEMBER_TICK=10,KEY_ID='vapid';

export async function generateVapidKeys(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 return {publicKey:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),privateJwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};
}

// The installation's key pair, created on first use. Returns null when credential encryption is not configured.
export async function vapidKeys(env){
 if(!env.APP_ENCRYPTION_KEY)return null;
 let row=await env.DB.prepare('SELECT * FROM push_config WHERE id=?').bind(KEY_ID).first();
 if(!row){const keys=await generateVapidKeys();await env.DB.prepare('INSERT OR IGNORE INTO push_config(id,public_key,private_ciphertext,created_at) VALUES(?,?,?,?)').bind(KEY_ID,keys.publicKey,await encryptKey(JSON.stringify(keys.privateJwk),env,KEY_ID),Date.now()).run();row=await env.DB.prepare('SELECT * FROM push_config WHERE id=?').bind(KEY_ID).first()}
 return {publicKey:row.public_key,privateJwk:JSON.parse(await decryptKey(row.private_ciphertext,env,KEY_ID))};
}

export async function vapidAuthorization(endpoint,keys,subject,now=Date.now()){
 const header=b64u(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64u(encoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:subject})));
 const key=await crypto.subtle.importKey('jwk',keys.privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(header+'.'+claims)));
 return 'vapid t='+header+'.'+claims+'.'+b64u(signature)+', k='+keys.publicKey;
}

// RFC 8291: a single aes128gcm record for one subscription.
export async function encryptPayload(plaintext,{p256dh,auth},{salt=crypto.getRandomValues(new Uint8Array(16)),serverKeys}={}){
 const uaPublic=unb64u(p256dh),authSecret=unb64u(auth);
 const local=serverKeys||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',local.publicKey));
 const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},local.privateKey,256));
 const prkKey=await hmac(authSecret,shared),ikm=await hmac(prkKey,concat(encoder.encode('WebPush: info\0'),uaPublic,asPublic,new Uint8Array([1])));
 const prk=await hmac(salt,ikm),cek=(await hmac(prk,concat(encoder.encode('Content-Encoding: aes128gcm\0'),new Uint8Array([1])))).slice(0,16),nonce=(await hmac(prk,concat(encoder.encode('Content-Encoding: nonce\0'),new Uint8Array([1])))).slice(0,12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const body=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,concat(typeof plaintext==='string'?encoder.encode(plaintext):plaintext,new Uint8Array([2]))));
 const rs=new Uint8Array([0,0,16,0]);// record size 4096
 return concat(salt,rs,new Uint8Array([asPublic.length]),asPublic,body);
}

// Sends one notification. Returns {ok, status, gone}: gone means the device unsubscribed or expired.
export async function sendPush(env,subscription,message,{keys,subject,fetcher=fetch}={}){
 keys=keys||await vapidKeys(env);if(!keys)throw fail('Server credential encryption is not configured.',503);
 const body=await encryptPayload(JSON.stringify(message),subscription);
 const response=await fetcher(subscription.endpoint,{method:'POST',headers:{Authorization:await vapidAuthorization(subscription.endpoint,keys,subject||'mailto:bayit@users.noreply.github.com'),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(message.ttl??3600),Urgency:message.urgency||'normal'},body});
 return {ok:response.ok,status:response.status,gone:response.status===404||response.status===410};
}

const allowedEndpoint=value=>{try{const u=new URL(value);return u.protocol==='https:'||/^http:\/\/127\.0\.0\.1:\d+$/.test(u.origin)}catch{return false}};
const subjectFor=request=>{const origin=new URL(request.url).origin;return origin.startsWith('https:')?origin:'mailto:bayit@users.noreply.github.com'};

// /api/push/*: the app asks for the public key, registers or removes this device, and can send itself a real test.
export async function handlePushAPI(request,env,user,home,path){
 const memberId=home.membership.member_id,action=path.split('/').at(-1);
 if(action==='status'&&request.method==='GET'){const keys=await vapidKeys(env);const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE household_id=? AND member_id=?').bind(home.id,memberId).first())?.n||0;return json({available:!!keys,publicKey:keys?.publicKey||'',devices:count})}
 if(request.method!=='POST')throw fail('Unknown push endpoint.',404);
 const body=await bodyJSON(request,20000),sub=body.subscription||{},endpoint=String(sub.endpoint||body.endpoint||'');
 if(!allowedEndpoint(endpoint)||endpoint.length>2000)throw fail('This device did not provide a valid push address.');
 const id=await hash(endpoint);
 if(action==='unsubscribe'){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND household_id=? AND member_id=?').bind(id,home.id,memberId).run();return json({ok:true})}
 const p256dh=String(sub.keys?.p256dh||''),auth=String(sub.keys?.auth||'');
 if(action==='subscribe'){
  if(!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh)||!/^[A-Za-z0-9_-]{16,32}$/.test(auth))throw fail('This device did not provide valid push keys.');
  await env.DB.prepare('INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,device,created_at,failures) VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(endpoint_hash) DO UPDATE SET household_id=excluded.household_id,member_id=excluded.member_id,p256dh=excluded.p256dh,auth=excluded.auth,device=excluded.device,failures=0').bind(id,home.id,memberId,endpoint,p256dh,auth,String(body.device||'').slice(0,80),Date.now()).run();
  return json({ok:true});
 }
 if(action==='test'){
  const row=await env.DB.prepare('SELECT * FROM push_subscriptions WHERE endpoint_hash=? AND household_id=? AND member_id=?').bind(id,home.id,memberId).first();if(!row)throw fail('Turn on notifications on this device first.',409);
  const he=(home.state.profiles?.[memberId]?.locale||body.lang)==='he';
  const result=await sendPush(env,row,{title:he?'Bayit עובד':'Bayit works',body:he?'ההתראות במכשיר הזה פעילות.':'Notifications on this device are on.',url:'#settings/notifications',tag:'bayit-test',ttl:300},{subject:subjectFor(request)});
  if(result.gone){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=?').bind(id).run();throw fail('This device is no longer registered. Turn notifications on again.',410)}
  if(!result.ok)throw fail('The push service refused the test ('+result.status+'). Nothing was delivered.',502);
  await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at=?,failures=0 WHERE endpoint_hash=?').bind(Date.now(),id).run();
  return json({ok:true,status:result.status});
 }
 throw fail('Unknown push endpoint.',404);
}

const L=(lang,en,he)=>lang==='he'?he:en;
const title=(record,lang)=>(lang==='he'?record.he||record.title||record.name:record.title||record.name||record.he)||'';
const nameIn=(state,lang)=>id=>{const m=state.members.find(x=>x.id===id);return (lang==='he'?m?.he||m?.name:m?.name)||''};

// The notifications one member should get now, as plain push messages (same sources and rules as Telegram).
export function pushMessages(state,memberId,{date,time},role){
 const visible=visibleState(state,memberId),lang=state.profiles?.[memberId]?.locale||'he',prefs=notificationPrefs(state.profiles?.[memberId]),quiet=inQuietHours(time,prefs.quietStart,prefs.quietEnd),nameOf=nameIn(state,lang),out=[];
 const open=(kind,id,day)=>kind==='event'?'#calendar?date='+day+'&event='+id:'#tasks?date='+day+'&task='+id;
 for(const item of dueReminders(visible,memberId,{date,time})){const left=minutes(item.time)-minutes(time);out.push({key:item.key,title:title(item.record,lang),body:(item.kind==='event'?L(lang,'Event','אירוע'):L(lang,'Task','משימה'))+' · '+item.time+(left>0?L(lang,' · in '+left+' min',' · בעוד '+left+' דקות'):''),url:open(item.kind,item.record.id,item.date),tag:item.kind+':'+item.record.id,urgency:'high'})}
 const digest=digestDue(visible,memberId,{date,time});if(digest)out.push({key:digest.key,title:L(lang,'Good morning! Your day','בוקר טוב! היום שלכם'),body:digest.items.length?digest.items.slice(0,6).map(i=>(i.time?i.time+' ':'')+title(i.record,lang)).join('\n'):L(lang,'Nothing planned today.','אין תוכניות להיום.'),url:'#today',tag:'digest'});
 if(!quiet){
  const childPrefs=Object.fromEntries(state.members.filter(m=>m.role==='child').map(m=>[m.id,notificationPrefs(state.profiles?.[m.id]).parentUpdates!==false]));
  for(const r of approvalRequests(visible,memberId,{date},role))out.push({key:r.key,title:L(lang,'Approval needed','נדרש אישור'),body:nameOf(r.task.memberId)+' · '+title(r.task,lang),url:open('task',r.task.id,r.date),tag:r.key});
  const updates=childUpdates(visible,memberId,{date,time},role,childPrefs),reported=new Set(updates.map(u=>u.entry.taskId+':'+u.entry.date));
  for(const u of ownerDoneUpdates(visible,memberId,{date}))if(!reported.has(u.task.id+':'+u.date))out.push({key:u.key,title:L(lang,'Done ✓','בוצע ✓'),body:nameOf(u.actorId)+' '+L(lang,'completed','השלים/ה')+': '+title(u.task,lang),url:open('task',u.task.id,u.date),tag:u.key});
  for(const a of overdueAlerts(visible,memberId,{date,time}))out.push({key:a.key,title:L(lang,'Not done yet','עדיין לא בוצע'),body:title(a.task,lang)+(a.assignee?'':' · '+nameOf(a.task.memberId))+' · '+a.date+(a.task.time?' '+a.task.time:''),url:open('task',a.task.id,a.date),tag:a.key});
  for(const u of updates)out.push({key:u.key,title:L(lang,'Done ✓','בוצע ✓'),body:nameOf(u.entry.memberId)+' '+L(lang,'completed','השלים/ה')+': '+title(u.entry,lang),url:'#kids',tag:u.key});
 }
 return out;
}

// Called by the minute reminder tick. Each message is claimed once per member+key in notification_deliveries (channel 'push').
export async function deliverPush(env,now,{fetcher=fetch,subject,loadHome}={}){
 const summary={households:0,sent:0,failed:0,removed:0};
 const subs=(await env.DB.prepare('SELECT * FROM push_subscriptions ORDER BY household_id,member_id').all()).results||[];if(!subs.length)return summary;
 const keys=await vapidKeys(env);if(!keys)return {...summary,failed:subs.length};
 const date=localDate(now),time=localTime(now),byHome=new Map();
 for(const s of subs){if(!byHome.has(s.household_id))byHome.set(s.household_id,new Map());const m=byHome.get(s.household_id);if(!m.has(s.member_id))m.set(s.member_id,[]);m.get(s.member_id).push(s)}
 subject=subject||(env.BAYIT_ORIGIN?.startsWith('https:')?env.BAYIT_ORIGIN:'mailto:bayit@users.noreply.github.com');
 for(const [householdId,members] of byHome){
  let home;try{home=loadHome?await loadHome(householdId):await (await import('./assistant.mjs')).loadHousehold(env,householdId)}catch{summary.failed++;continue}summary.households++;
  for(const [memberId,devices] of members){
   const role=home.state.members.find(m=>m.id===memberId)?.role;if(!role)continue;
   for(const message of pushMessages(home.state,memberId,{date,time},role).slice(0,MAX_PER_MEMBER_TICK)){
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,'push',?,'sending',?)").bind(householdId,memberId,message.key,now.getTime()).run();
    if(!(claim.meta?.changes>0))continue;
    let delivered=0;
    for(const device of devices){if(device.gone)continue;
     try{const r=await sendPush(env,device,{title:message.title,body:message.body,url:message.url,tag:message.tag,urgency:message.urgency},{keys,subject,fetcher});
      if(r.gone){device.gone=true;await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=?').bind(device.endpoint_hash).run();summary.removed++}
      else if(r.ok){delivered++;await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at=?,failures=0 WHERE endpoint_hash=?').bind(now.getTime(),device.endpoint_hash).run()}
      else await env.DB.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint_hash=?').bind(device.endpoint_hash).run();
     }catch{await env.DB.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint_hash=?').bind(device.endpoint_hash).run()}}
    await env.DB.prepare("UPDATE notification_deliveries SET status=? WHERE household_id=? AND member_id=? AND channel='push' AND delivery_key=?").bind(delivered?'sent':'failed',householdId,memberId,message.key).run();
    delivered?summary.sent++:summary.failed++;
   }
  }
 }
 return summary;
}
