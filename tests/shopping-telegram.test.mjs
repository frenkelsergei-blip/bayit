// Smarter shopping in Telegram (2026-11-11), end to end through the real scheduler and the real Telegram channel with a
// fake Bot API: the morning summary says there is a shop today; while someone shops, what the others add reaches them
// once; the others hear once that a shop began; "תוסיף ..." without an AI key adds at once. Fictional data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {encryptKey,hash,localDate} from '../app/cloud/util.mjs';
import {CHANNELS} from '../app/cloud/channels.mjs';
import {deliverChannels} from '../app/cloud/channel-delivery.mjs';
import {blankState} from '../app/cloud/state.mjs';
import {dayReport} from '../app/cloud/telegram-format.mjs';
import {noonToday} from './channel-conformance.mjs';

async function household(stateFor){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const sends=[],address=new Map();let seq=7000;
 const env={DB,APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OUTBOUND_FETCH:async(url,options)=>{const method=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options?.body||'{}');if(method==='sendMessage'){sends.push({to:address.get(String(body.chat_id)),text:body.text,buttons:JSON.stringify(body.reply_markup||{})});return Response.json({ok:true,result:{message_id:sends.length}})}return Response.json({ok:true,result:true})}};
 const members=[{id:'mom',name:'Dana',role:'parent'},{id:'dad',name:'Avi',role:'parent'}];
 const state=blankState('h','Fictional',members[0]);state.members=members;state.profiles.mom={name:'Dana',locale:'en'};state.profiles.dad={name:'Avi',locale:'en'};
 stateFor(state);
 await DB.prepare('INSERT INTO household_data(household_id,state,revision) VALUES(?,?,0)').bind('h',JSON.stringify(state)).run();
 for(const m of members){await DB.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(m.id,m.name).run();await DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,?,?)').bind('h',m.id,m.id,'parent',new Date().toISOString()).run()}
 const token=(++seq)+':shopping-test-token-abcdefghijklmnopqrstu';
 await DB.prepare('INSERT INTO telegram_bots(household_id,ciphertext,bot_id,bot_username,hook_id,secret_hash,connected_by,connected_at) VALUES(?,?,?,?,?,?,?,?)').bind('h',await encryptKey(token,env,'telegram:h'),String(seq),'shopping_bot','hookshoppingtestxxxxxxxx',await hash('secret'),'mom',new Date().toISOString()).run();
 for(const m of members){const chat=String(++seq);address.set(chat,m.id);await DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) VALUES(?,?,?,?,?,?)').bind('h',m.id,chat,String(seq+1000),m.name,new Date().toISOString()).run()}
 return {env,sends};
}

test('while Dana shops, what Avi adds reaches Dana once, and Avi hears once that Dana started',async()=>{
 const now=noonToday(),ago=m=>new Date(now.getTime()-m*60000).toISOString();
 const {env,sends}=await household(s=>{const fam={ownerId:'mom',visibility:'family',allowedIds:[],listId:'week'};
  s.shopping=[{...fam,id:'a',title:'Bread',he:'Bread',quantity:'1',quantityValue:1,done:true,boughtAt:ago(4),boughtBy:'mom'},
   {...fam,id:'b',title:'Yellow cheese',he:'Yellow cheese',quantity:'1',quantityValue:1,done:false,ownerId:'dad',createdAt:ago(2),createdBy:'dad'},
   {...fam,id:'c',title:'Milk',he:'Milk',quantity:'1',quantityValue:1,done:false,createdAt:ago(600),createdBy:'mom'}]});
 await deliverChannels(env,now,CHANNELS);
 const toMom=sends.filter(s=>s.to==='mom'),toDad=sends.filter(s=>s.to==='dad');
 assert.equal(toMom.filter(s=>s.text.includes('Yellow cheese')).length,1,'Dana gets the new item');
 assert.ok(toMom.some(s=>s.buttons.includes('Bought')),'with a Bought button');
 assert.ok(!toMom.some(s=>s.text.includes('Milk')&&s.text.includes('Added')),'not what was there before the shop');
 assert.equal(toDad.filter(s=>s.text.includes('Dana is shopping now')).length,1,'Avi hears once');
 const before=sends.length;await deliverChannels(env,new Date(now.getTime()+60000),CHANNELS);
 assert.equal(sends.slice(before).filter(s=>s.text.includes('Yellow cheese')||s.text.includes('shopping now')).length,0,'each is sent once');
});

test('nothing while nobody is shopping, and the switch turns it off',async()=>{
 const now=noonToday(),ago=m=>new Date(now.getTime()-m*60000).toISOString();
 const {env,sends}=await household(s=>{const fam={ownerId:'mom',visibility:'family',allowedIds:[],listId:'week'};
  s.preferences.shoppingByUser={dad:{addsMessage:false}};
  s.shopping=[{...fam,id:'a',title:'Bread',he:'Bread',quantity:'1',quantityValue:1,done:true,boughtAt:ago(90),boughtBy:'mom'},{...fam,id:'b',title:'Cheese',he:'Cheese',quantity:'1',quantityValue:1,done:false,createdAt:ago(2),createdBy:'dad'}]});
 await deliverChannels(env,now,CHANNELS);
 assert.equal(sends.filter(s=>s.text.includes('Cheese')||s.text.includes('shopping now')).length,0);
});

test('the morning summary says there is a shop today, with the time and who goes',()=>{
 const date=localDate(),visible={members:[{id:'mom',name:'Dana'}],preferences:{},events:[],tasks:[{id:'t',kind:'shopping-trip',shoppingListId:'week',date,time:'17:30',memberId:'mom',ownerId:'mom',title:'Shopping: This week',visibility:'family',allowedIds:[]}],
  shoppingLists:[{id:'week',name:'This week',he:'השבוע',status:'active',visibility:'family',ownerId:'mom'}],shopping:[{id:'m',listId:'week',title:'Milk',he:'חלב',done:false}]};
 const en=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'en',members:[{id:'mom',name:'Dana',he:'דנה'}],greeting:true}).text;
 assert.match(en,/Shopping today · 17:30 · Dana · This week · 1 left/);
 const he=dayReport(visible,{memberId:'mom',role:'parent',date,lang:'he',members:[{id:'mom',name:'Dana',he:'דנה'}],greeting:true}).text;
 assert.match(he,/היום יש קניות · 17:30 · דנה · השבוע · נותרו 1/);
 const off=dayReport({...visible,preferences:{shoppingByUser:{mom:{dayMessage:false}}}},{memberId:'mom',role:'parent',date,lang:'en',members:[{id:'mom',name:'Dana'}],greeting:true}).text;
 assert.doesNotMatch(off,/Shopping today/);
});

test('"Add cucumbers and tomatoes" in Telegram without an AI key adds them at once, with Undo',async()=>{
 const {TELEGRAM_CHANNEL}=await import('../app/cloud/telegram.mjs');
 const {env,sends}=await household(s=>{});
 const chat=(await env.DB.prepare("SELECT chat_id,telegram_user_id FROM telegram_links WHERE member_id='dad'").first());
 const update={update_id:1,message:{message_id:1,date:1,chat:{id:Number(chat.chat_id),type:'private'},from:{id:Number(chat.telegram_user_id),language_code:'he'},text:'תוסיף מלפפונים ועגבניות'}};
 const request=new Request('https://home.example/api/telegram/hook/hookshoppingtestxxxxxxxx',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'secret'},body:JSON.stringify(update)});
 assert.equal((await TELEGRAM_CHANNEL.webhook(request,env,'hookshoppingtestxxxxxxxx')).status,200);
 const saved=JSON.parse((await env.DB.prepare("SELECT state FROM household_data WHERE household_id='h'").first()).state);
 const added=saved.shopping.filter(i=>i.listId==='week'&&!i.done).map(i=>i.title);
 assert.deepEqual(added.sort(),['מלפפונים','עגבניות'].sort());
 assert.ok(saved.shopping.every(i=>i.createdBy==='dad'&&i.createdAt),'stamped by the server');
 const reply=sends.filter(s=>s.to==='dad').at(-1);assert.match(reply.text,/Added to|נוסף לרשימה/);assert.match(reply.buttons,/Undo|ביטול/);
});
