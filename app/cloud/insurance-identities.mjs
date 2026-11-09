import {bodyJSON,fail,json,encryptKey,decryptKey,hash,random} from './util.mjs';
import {normalizeInsuranceId} from '../../shared/insurance-identities.mjs';
export const insuranceIdentityAAD=(household,actor)=>'insurance-identities:'+household+':'+actor;
const authorize=home=>{const actor=home.membership.member_id,role=home.state.members.find(m=>m.id===actor)?.role;if(!['adult','parent'].includes(role)||!['adult','parent'].includes(home.membership.role))throw fail('Insurance identity links are available to authorized adults.',403);return actor};
const masked=entries=>entries.map(({id,last4,memberId})=>({id,last4,memberId}));
async function readVault(env,home,actor){const ciphertext=home.state.insuranceIdentityVaults?.[actor];return ciphertext?JSON.parse(await decryptKey(ciphertext,env,insuranceIdentityAAD(home.id,actor))):{salt:random(),entries:[]}}
async function writeVault(env,home,actor,vault){
 const ciphertext=await encryptKey(JSON.stringify(vault),env,insuranceIdentityAAD(home.id,actor)),next={...home.state,insuranceIdentityVaults:{...home.state.insuranceIdentityVaults,[actor]:ciphertext}};
 if(new TextEncoder().encode(JSON.stringify(next)).byteLength>1_600_000)throw fail('This household has reached its storage limit.',413);
 const result=await env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=?').bind(JSON.stringify(next),home.id,home.revision).run();if(!result.meta.changes)throw fail('This household changed. Refresh the identity links and try again.',409);
 return json({links:masked(vault.entries)});
}
export async function handleInsuranceIdentities(request,env,home){
 const actor=authorize(home),action=new URL(request.url).pathname.split('/').at(-1);
 if(action==='lookup'&&request.method!=='POST')throw fail('Method not allowed.',405);
 if(request.method==='GET'){if(!env.APP_ENCRYPTION_KEY)return json({available:false,links:[]});return json({available:true,links:masked((await readVault(env,home,actor)).entries)})}
 if(!['POST','PUT','DELETE'].includes(request.method))throw fail('Method not allowed.',405);
 if(!env.APP_ENCRYPTION_KEY)throw fail('Protected ID matching is not configured. Assign the insured person manually.',503);
 const body=await bodyJSON(request,6000),vault=await readVault(env,home,actor),validMember=id=>home.state.members.some(m=>m.id===id);
 if(action==='lookup'){
  if(request.method!=='POST'||!Array.isArray(body.ids)||body.ids.length>40||body.ids.some(id=>!normalizeInsuranceId(id)))throw fail('Supply up to 40 complete nine-digit report IDs.');
  const matches=[];for(let index=0;index<body.ids.length;index++){const fingerprint=await hash(vault.salt+'|'+normalizeInsuranceId(body.ids[index])),entry=vault.entries.find(e=>e.fingerprint===fingerprint&&validMember(e.memberId));if(entry)matches.push({index,...masked([entry])[0]})}
  return json({matches});
 }
 if(action!=='identities')throw fail('Unknown endpoint.',404);
 if(request.method==='POST'){
  const nationalId=normalizeInsuranceId(body.nationalId);if(!nationalId||!validMember(body.memberId))throw fail('Enter the complete nine-digit ID and choose a household member.');
  const fingerprint=await hash(vault.salt+'|'+nationalId),existing=vault.entries.find(e=>e.fingerprint===fingerprint);
  if(existing){if(existing.memberId!==body.memberId)throw fail('This ID is already linked. Edit its remembered match to change the person.',409);return json({links:masked(vault.entries)})}
  if(vault.entries.length>=100)throw fail('Remove an unused ID match before adding another.',413);
  vault.entries.push({id:crypto.randomUUID(),fingerprint,last4:nationalId.slice(-4),memberId:body.memberId});
 }else{
  const entry=vault.entries.find(e=>e.id===body.id);if(!entry)throw fail('This remembered match is unavailable.',404);
  if(request.method==='PUT'){if(!validMember(body.memberId))throw fail('Choose a household member.');entry.memberId=body.memberId}else vault.entries=vault.entries.filter(e=>e.id!==body.id);
 }
 return writeVault(env,home,actor,vault);
}
