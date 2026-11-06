import {encryptKey,decryptKey,fail} from './util.mjs';
const stores=[['household_secrets','ciphertext',r=>r.household_id],['telegram_bots','ciphertext',r=>'telegram:'+r.household_id],['finance_connections','ciphertext',r=>{if(r.provider!=='riseup')throw fail('This credential provider needs an updated rotation adapter.',409);return 'riseup:'+r.household_id+':'+r.member_id}],['push_config','private_ciphertext',r=>r.id],['maps_connections','places_ciphertext',r=>r.household_id+':maps:places'],['maps_connections','embed_ciphertext',r=>r.household_id+':maps:embed']];
// All plaintext stays in this server process. Changes raced by a connection update are left intact and counted.
export async function rotateStoredCredentials(env){
 const tables=new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name)),statements=[];
 for(const [table,column,aad]of stores){if(!tables.has(table))continue;const rows=(await env.DB.prepare('SELECT rowid AS security_rowid,* FROM '+table+' WHERE '+column+' IS NOT NULL LIMIT 1001').all()).results;if(rows.length>1000||statements.length+rows.length>1000)throw fail('This installation needs a staged operator rotation.',413);
  for(const row of rows){if(!row[column])continue;const context=aad(row),plaintext=await decryptKey(row[column],env,context),ciphertext=await encryptKey(plaintext,env,context);statements.push(env.DB.prepare('UPDATE '+table+' SET '+column+'=? WHERE rowid=? AND '+column+'=?').bind(ciphertext,row.security_rowid,row[column]))}
 }
 const results=statements.length?await env.DB.batch(statements):[],rotated=results.reduce((n,r)=>n+(r.meta.changes===1?1:0),0);return {rotated,concurrent:statements.length-rotated,complete:rotated===statements.length};
}
