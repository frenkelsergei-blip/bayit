import {json,fail,bodyJSON,random,hash,sameDigest,encoder,base64,unbase64} from './util.mjs';
import {currentSession,limit} from './security.mjs';
import {validateKidsBonus,applyKidsBonus} from '../../shared/kids-bonus.mjs';
import {visibleState} from './state.mjs';

const readySchemas=new WeakSet();
async function ensureTables(env){
 if(readySchemas.has(env.DB))return;
 try{const rows=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kids_parent_controls','kids_bonus_grants')").all()).results;if(rows.length!==2)throw Error();readySchemas.add(env.DB)}catch{throw fail('Update the household server before using the parent area.',503)}
}
const ttl=5*60000;
const b64=bytes=>base64(bytes).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=value=>unbase64(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4));
const pin=value=>{if(typeof value!=='string'||!/^\d{4}$/.test(value))throw fail('Enter four digits.');return value};
async function pinHash(value,salt,env){
 const key=await crypto.subtle.importKey('raw',encoder.encode(value+'|'+env.AUTH_SECRET),'PBKDF2',false,['deriveBits']);
 return b64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256)));
}
async function signingKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function unlockToken(env,claims){const body=b64(encoder.encode(JSON.stringify(claims)));return body+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(body))))}
async function verifyUnlock(request,env,user,home,version){
 try{
  const token=request.headers.get('X-Bayit-Parent-Unlock')||'',parts=token.split('.');if(parts.length!==2||token.length>2000)throw Error();
  if(!await crypto.subtle.verify('HMAC',await signingKey(env),decode(parts[1]),encoder.encode(parts[0])))throw Error();
  const c=JSON.parse(new TextDecoder().decode(decode(parts[0]))),session=await currentSession(request,env,user);
  if(c.home!==home.id||c.user!==user.id||c.session!==session?.id||c.v!==version||!Number.isFinite(c.exp)||c.exp<=Date.now()||c.exp>Date.now()+ttl+1000)throw Error();
 }catch{throw fail('Unlock the parent area again.',403)}
}
const grantView=r=>({id:r.id,childId:r.child_id,actorId:r.actor_id,amount:r.amount,reason:r.reason,createdAt:r.created_at});
export async function handleKidsParent(request,env,user,home,path,url){
 const parent=home.membership.role==='parent',actor=home.membership.member_id,action=path.split('/').at(-1);
 // History belongs to the child and the household's authenticated parents.
 if(action==='history'&&request.method==='GET'){
  const childId=url.searchParams.get('childId');if(!home.state.members.some(m=>m.id===childId&&m.role==='child')||!parent&&actor!==childId)throw fail('This child history is private.',403);
  await ensureTables(env);const before=url.searchParams.get('before')||'9999',rows=(await env.DB.prepare('SELECT * FROM kids_bonus_grants WHERE household_id=? AND child_id=? AND (created_at || \'|\' || id)<? ORDER BY created_at DESC,id DESC LIMIT 21').bind(home.id,childId,before).all()).results;
  const shown=rows.slice(0,20);return json({grants:shown.map(grantView),next:rows.length>20?shown.at(-1).created_at+'|'+shown.at(-1).id:null});
 }
 if(!parent)throw fail('An authenticated parent manages bonuses and the parent code.',403);
 await ensureTables(env);
 const config=await env.DB.prepare('SELECT * FROM kids_parent_controls WHERE household_id=?').bind(home.id).first(),version=config?.version||0;
 if(action==='status'&&request.method==='GET')return json({configured:!!config});
 if(request.method!=='POST')throw fail('Method not allowed.',405);
 const body=await bodyJSON(request,4000);
 if(action==='unlock'){
  await limit(env,'kids-pin:'+home.id+':'+user.id,{max:5,period:5*60000});
  const value=pin(body.pin),valid=config?sameDigest(await pinHash(value,config.salt,env),config.pin_hash):sameDigest(await hash(value),await hash('0000'));
  if(!valid)throw fail('The parent code is incorrect.',403);
  const session=await currentSession(request,env,user);if(!session)throw fail('Sign in again.',401);
  const expiresAt=Date.now()+ttl;return json({token:await unlockToken(env,{home:home.id,user:user.id,session:session.id,v:version,exp:expiresAt}),expiresAt});
 }
 await verifyUnlock(request,env,user,home,version);
 if(action==='pin'){
  const value=pin(body.pin),salt=random(24),digest=await pinHash(value,salt,env);
  const changed=await env.DB.prepare('INSERT INTO kids_parent_controls(household_id,salt,pin_hash,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(household_id) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash,version=kids_parent_controls.version+1,updated_at=excluded.updated_at WHERE kids_parent_controls.version=?').bind(home.id,salt,digest,new Date().toISOString(),version).run();
  if(!changed.meta.changes)throw fail('The parent code changed elsewhere. Unlock again.',409);return json({ok:true});
 }
 if(action==='grant'){
  let bonus;try{bonus=validateKidsBonus(body,home.state.members)}catch(e){throw fail(e.message)}
  const existing=await env.DB.prepare('SELECT * FROM kids_bonus_grants WHERE household_id=? AND id=?').bind(home.id,bonus.id).first();
  if(existing){if(existing.actor_id!==actor||existing.child_id!==bonus.childId||existing.amount!==bonus.amount||existing.reason!==bonus.reason)throw fail('This bonus request was already used.',409);return json({grant:grantView(existing),data:visibleState(home.state,actor),revision:home.revision})}
  const next=structuredClone(home.state),createdAt=new Date().toISOString();try{next.profiles[bonus.childId]=applyKidsBonus(next.profiles[bonus.childId],bonus)}catch(e){throw fail(e.message)}
  const results=await env.DB.batch([
   env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=?').bind(JSON.stringify(next),home.id,home.revision),
   env.DB.prepare('INSERT INTO kids_bonus_grants(household_id,id,child_id,actor_id,amount,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM household_data WHERE household_id=? AND revision=? AND json_extract(state,?)=?)').bind(home.id,bonus.id,bonus.childId,actor,bonus.amount,bonus.reason,createdAt,home.id,home.revision+1,'$.profiles."'+bonus.childId+'".hero.lastBonusGrant',bonus.id)
  ]);
  if(!results[0].meta.changes||!results[1].meta.changes)throw fail('The household changed. Refresh and retry this bonus.',409);
  return json({grant:{...bonus,actorId:actor,createdAt},data:visibleState(next,actor),revision:home.revision+1},201);
 }
 throw fail('Unknown parent action.',404);
}
