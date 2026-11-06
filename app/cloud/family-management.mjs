import {json,fail} from './util.mjs';
export async function handleFamilyManagement(request,env,home){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(!/^\/api\/family\/(invitations|members)(\/[^/]+)?$/.test(path)||method==='POST')return null;
 if(home.membership.role!=='parent')throw fail('A parent manages invitations and account access.',403);
 const parts=path.split('/'),kind=parts[3],id=parts[4];
 if(kind==='invitations'){
  if(method==='GET'&&!id){const rows=(await env.DB.prepare('SELECT token_hash,role,member_id,expires_at FROM invitations WHERE household_id=? AND used_by IS NULL ORDER BY expires_at DESC LIMIT 100').bind(home.id).all()).results;return json({invitations:rows.map(r=>({id:r.token_hash,role:r.role,memberId:r.member_id,expiresAt:new Date(r.expires_at).toISOString(),status:r.expires_at>Date.now()?'pending':'expired'}))})}
  if(method==='DELETE'&&/^[a-f0-9]{64}$/.test(id||'')){const result=await env.DB.prepare('DELETE FROM invitations WHERE household_id=? AND token_hash=? AND used_by IS NULL').bind(home.id,id).run();if(!result.meta.changes)throw fail('This invitation is unavailable or has already been used.',404);return json({revoked:true})}
 }
 if(kind==='members'){
  if(method==='GET'&&!id){const rows=(await env.DB.prepare('SELECT member_id,role FROM memberships WHERE household_id=?').bind(home.id).all()).results;return json({members:rows.map(r=>({id:r.member_id,role:r.role,self:r.member_id===home.membership.member_id,canDisconnect:r.role!=='parent'||rows.filter(m=>m.role==='parent').length>1}))})}
  if(method==='DELETE'&&id){
   const target=await env.DB.prepare('SELECT member_id,user_id,role FROM memberships WHERE household_id=? AND member_id=?').bind(home.id,id).first();if(!target)throw fail('This linked account is unavailable.',404);
   // The SQL condition preserves a parent even if two removal requests race.
   const statements=[env.DB.prepare("DELETE FROM memberships WHERE household_id=? AND member_id=? AND (role<>'parent' OR (SELECT COUNT(*) FROM memberships WHERE household_id=? AND role='parent')>1)").bind(home.id,id,home.id)];
   const absent=' AND NOT EXISTS(SELECT 1 FROM memberships WHERE household_id=? AND member_id=?)';
   for(const table of ['telegram_links','telegram_link_tokens','telegram_actions','telegram_snoozes','push_subscriptions','finance_connections'])statements.push(env.DB.prepare('DELETE FROM '+table+' WHERE household_id=? AND member_id=?'+absent).bind(home.id,id,home.id,id));
   statements.push(env.DB.prepare('DELETE FROM invitations WHERE household_id=? AND created_by=? AND used_by IS NULL'+absent).bind(home.id,target.user_id,home.id,id));
   statements.push(env.DB.prepare('UPDATE household_data SET revision=revision+1 WHERE household_id=?'+absent).bind(home.id,home.id,id));
   const results=await env.DB.batch(statements);if(!results[0].meta.changes)throw fail('Keep at least one parent connected to the household.',409);
   return json({disconnected:true,recordsPreserved:true});
  }
 }
 throw fail('Unknown family management action.',404);
}
