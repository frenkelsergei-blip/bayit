import {encryptKey,decryptKey,fail} from './util.mjs';
import {insuranceIdentityAAD} from './insurance-identities.mjs';
import {voucherAAD} from './vouchers.mjs';
import {googleCalendarAAD,googleOAuthAAD} from './google-calendar.mjs';
const stores=[['household_secrets','ciphertext',r=>r.household_id],['telegram_bots','ciphertext',r=>'telegram:'+r.household_id],['finance_connections','ciphertext',r=>{if(r.provider!=='riseup')throw fail('This credential provider needs an updated rotation adapter.',409);return 'riseup:'+r.household_id+':'+r.member_id}],['push_config','private_ciphertext',r=>r.id],['maps_connections','places_ciphertext',r=>r.household_id+':maps:places'],['maps_connections','embed_ciphertext',r=>r.household_id+':maps:embed']];
// All plaintext stays in this server process. Changes raced by a connection update are left intact and counted.
export async function rotateStoredCredentials(env){
 const tables=new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name)),statements=[];
 for(const [table,column,aad]of [...stores,['vouchers','ciphertext',r=>voucherAAD(r.household_id,r.owner_id,r.id)],
  ['google_calendar_connections','ciphertext',r=>googleCalendarAAD(r.household_id,r.owner_id)],['google_calendar_oauth','ciphertext',r=>googleOAuthAAD(r.state_hash)]]){
  if(!tables.has(table))continue;const rows=(await env.DB.prepare('SELECT rowid AS security_rowid,* FROM '+table+' WHERE '+column+' IS NOT NULL LIMIT 1001').all()).results;if(rows.length>1000||statements.length+rows.length>1000)throw fail('This installation needs a staged operator rotation.',413);
  for(const row of rows){if(!row[column])continue;const context=aad(row),plaintext=await decryptKey(row[column],env,context),ciphertext=await encryptKey(plaintext,env,context);statements.push(env.DB.prepare('UPDATE '+table+' SET '+column+'=? WHERE rowid=? AND '+column+'=?').bind(ciphertext,row.security_rowid,row[column]))}
 }
 if(tables.has('household_data')){const homes=(await env.DB.prepare("SELECT household_id,state,revision FROM household_data WHERE json_type(state,'$.insuranceIdentityVaults') IS NOT NULL LIMIT 1001").all()).results;if(homes.length+statements.length>1000)throw fail('This installation needs a staged operator rotation.',413);
  for(const home of homes){const state=JSON.parse(home.state);for(const [actor,ciphertext]of Object.entries(state.insuranceIdentityVaults||{})){const context=insuranceIdentityAAD(home.household_id,actor);state.insuranceIdentityVaults[actor]=await encryptKey(await decryptKey(ciphertext,env,context),env,context)}statements.push(env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=?').bind(JSON.stringify(state),home.household_id,home.revision))}
 }
 const results=statements.length?await env.DB.batch(statements):[],rotated=results.reduce((n,r)=>n+(r.meta.changes===1?1:0),0);return {rotated,concurrent:statements.length-rotated,complete:rotated===statements.length};
}
