// Idempotent household changes: remembers the client operation ids a member's device already applied.
// Works without migration 0017 too (the table missing is treated as "not recorded").
import {validOpId} from '../../shared/offline-sync.mjs';
const KEEP_MS=30*24*60*60*1000;
const missingTable=error=>/no such table/i.test(String(error?.message||error));

export async function appliedOperation(env,householdId,memberId,opId){
 if(!validOpId(opId))return null;
 try{return await env.DB.prepare('SELECT revision FROM client_operations WHERE household_id=? AND member_id=? AND op_id=?').bind(householdId,memberId,opId).first()}catch{return null}
}

// Runs the household UPDATE and records the operation id in the same transaction, only if that UPDATE changed the row
// (changes() is the UPDATE just before it in the batch; a lost revision race records nothing).
// Returns the UPDATE's result, so callers keep checking meta.changes for a lost revision race.
export async function commitOperation(env,update,{householdId,memberId,opId,revision,now=Date.now()}){
 if(!validOpId(opId)||typeof env.DB.batch!=='function')return update.run();
 try{
  const [result]=await env.DB.batch([update,
   env.DB.prepare('INSERT OR IGNORE INTO client_operations(household_id,member_id,op_id,revision,applied_at) SELECT ?,?,?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM household_data WHERE household_id=? AND revision=?)').bind(householdId,memberId,opId,revision,now,householdId,revision),
   env.DB.prepare('DELETE FROM client_operations WHERE household_id=? AND applied_at<?').bind(householdId,now-KEEP_MS)]);
  return result;
 }catch(error){if(missingTable(error))return update.run();throw error}
}
