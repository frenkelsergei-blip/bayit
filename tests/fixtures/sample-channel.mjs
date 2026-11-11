// A test-only messaging channel (docs/channel-contract.md), kept in tests so the seam has a second user without
// shipping a feature. It keeps its "provider" state in memory per database and sends through externalFetch to a
// fictional address. tests/channels.test.mjs registers it through a copy of the local registry file and runs the
// same conformance suite as Telegram against it.
import {json,fail,random,hash,sameDigest,bodyJSON} from '../../app/cloud/util.mjs';
import {externalFetch} from '../../app/cloud/outbound.mjs';
import {loadHousehold,roleOf} from '../../app/cloud/assistant.mjs';

export const SAMPLE_ORIGIN='https://sample-channel.invalid';
const stores=new WeakMap();
const store=env=>{if(!stores.has(env.DB))stores.set(env.DB,{connections:new Map(),seen:new Set()});return stores.get(env.DB)};
const L=(lang,en,he)=>lang==='he'?he:en;
const titleOf=(r,lang)=>r?(lang==='he'?r.he||r.title||r.name:r.title||r.name||r.he):'';

// Test setup: a connected household. Only a hash of the webhook secret is kept.
export async function connectSample(env,householdId,links){
 const hookId=random(18),secret=random(32);
 store(env).connections.set(householdId,{householdId,hookId,secretHash:await hash(secret),links:links.map(l=>({...l,blocked:false}))});
 return {hookId,secret};
}
export const sampleConnection=(env,householdId)=>store(env).connections.get(householdId);

async function post(env,body){
 const response=await externalFetch(env,SAMPLE_ORIGIN+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(response.status===403)throw Object.assign(fail('Sample channel: recipient blocked.',502),{blocked:true});
 if(!response.ok)throw Object.assign(fail('Sample channel could not be reached.',502),{transient:true});
 return response.json();
}

function render(message,{lang}){
 const t=message.type,what=t==='reminder'?titleOf(message.item.record,lang):t==='change'?message.burst.itemId:t==='approval'||t==='completed'?titleOf(message.task,lang):t==='overdue'?titleOf(message.alert.task,lang):t==='digest'?L(lang,'Your day','היום שלך'):message.message?.title||'';
 return [L(lang,'Bayit','בית')+' · '+t+' · '+what,[]];
}

export const SAMPLE_CHANNEL={
 id:'sample',
 name:{en:'Sample channel',he:'ערוץ לדוגמה'},
 feature:'telegram',
 apiPath:'/api/sample/',
 hookPath:'/api/sample/hook/',
 async api(request,env,user,home,path){
  const c=store(env).connections.get(home.id),actor=home.membership.member_id;
  if(path==='/api/sample/status'&&request.method==='GET')return json({connected:!!c,canManage:home.membership.role==='parent',members:home.state.members.map(m=>({id:m.id,linked:!!c?.links.some(l=>l.memberId===m.id),canLink:m.id===actor}))});
  throw fail('Unknown sample endpoint.',404);
 },
 async webhook(request,env,hookId){
  const c=[...store(env).connections.values()].find(x=>x.hookId===hookId);if(!c)return json({error:'Not found.'},404);
  if(!sameDigest(await hash(request.headers.get('X-Sample-Signature')||''),c.secretHash))return json({error:'Unauthorized.'},401);
  const update=await bodyJSON(request,20000),seen=store(env).seen,key=c.householdId+':'+update.id;if(seen.has(key))return json({ok:true});seen.add(key);
  const link=c.links.find(l=>l.address===String(update.from)&&l.userId===String(update.user));
  try{
   if(!link){await post(env,{to:String(update.from),text:'This chat is not linked yet. Link it in Bayit settings.'});return json({ok:true})}
   const home=await loadHousehold(env,c.householdId);if(!roleOf(home.state,link.memberId))return json({ok:true});
   await post(env,{to:link.address,text:'Bayit here. Ask in the app for more.'});
  }catch(error){console.error('Bayit sample update failed:',error.status||'')}
  return json({ok:true});
 },
 delivery:{
  targets:async env=>[...store(env).connections.values()].map(c=>({householdId:c.householdId})),
  recipients:async(env,target)=>store(env).connections.get(target.householdId).links.filter(l=>!l.blocked),
  open:async(env,target)=>store(env).connections.get(target.householdId),
  render:async(message,ctx)=>render(message,ctx),
  send:async(env,connection,recipient,[text])=>{const r=await post(env,{to:recipient.address,text});return {messageId:r.id}},
  blocked:async(env,householdId,memberId)=>{for(const l of store(env).connections.get(householdId).links)if(l.memberId===memberId)l.blocked=true},
  cleanup:()=>[]
 }
};
