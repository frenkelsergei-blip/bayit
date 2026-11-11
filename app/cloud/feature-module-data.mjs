// Feature modules: data kept after an extension is removed, its download, and a parent's deliberate delete
// (user's answer 1, 2026-11-10: "it stays, hidden; reinstalling brings it back; a parent can delete it on purpose
// later, after downloading a copy"). Records themselves are written only through /changes (state.mjs).
//   GET  /api/households/<id>/extensions                      parents: [{id, installed, bytes}] of stored slices
//   GET  /api/households/<id>/extensions/<module>/export      the records of that module this member may see
//   POST /api/households/<id>/extensions/<module>/delete      parents, recent sign-in, body {confirm:<module>, baseRevision}
// The household was already resolved with membership checks (worker.mjs chosenHousehold), so every read and write
// is scoped to this household_id; the delete uses the same revision-checked UPDATE as /changes.
import {json,fail,bodyJSON} from './util.mjs';
import {requireRecent,audit} from './security.mjs';
import {visibleState} from './state.mjs';
import {keptModules,moduleExport,dropModuleData} from '../../shared/feature-modules.mjs';

export const MODULE_DATA_PATH=/^\/api\/households\/([^/]+)\/extensions(?:\/([a-z][a-z0-9-]{1,39})\/(export|delete))?$/;
const status=message=>/parent|adult|unavailable/i.test(message)?403:/no stored data/i.test(message)?404:400;

export async function handleModuleData(request,env,user,home,match){
 const actor=home.membership.member_id,role=home.membership.role,[,,moduleId,action]=match;
 if(!moduleId){
  if(request.method!=='GET')throw fail('Method not allowed.',405);
  if(role!=='parent')throw fail('A parent manages extension data.',403);
  return json({kept:keptModules(home.state,actor)});
 }
 if(action==='export'){
  if(request.method!=='GET')throw fail('Method not allowed.',405);
  if(!home.state.extensions||!Object.hasOwn(home.state.extensions,moduleId))throw fail('There is no stored data for this extension.',404);
  try{return json(moduleExport(home.state,moduleId,actor))}catch(error){throw fail(error.message,status(error.message))}
 }
 if(request.method!=='POST')throw fail('Method not allowed.',405);
 if(role!=='parent')throw fail('A parent deletes an extension’s data.',403);
 await requireRecent(request,env,user);
 const body=await bodyJSON(request,2000);
 if(body.baseRevision!==home.revision)throw fail('This household changed on another device. Refresh before retrying.',409);
 let next;try{next=dropModuleData(home.state,moduleId,{role,confirm:body.confirm})}catch(error){throw fail(error.message,status(error.message))}
 const saved=await env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=?').bind(JSON.stringify(next),home.id,home.revision).run();
 if(!saved.meta.changes)throw fail('This household changed on another device. Refresh before retrying.',409);
 await audit(env,{home:home.id,actor,action:'state.change',resource:'ext:'+moduleId}).catch(()=>{});
 return json({deleted:moduleId,data:visibleState(next,actor),revision:home.revision+1,actorId:actor});
}
