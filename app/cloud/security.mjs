import {fail,json,hash,random,bodyJSON} from './util.mjs';
import {maintainFiles} from './files.mjs';
export function sessionToken(request){for(const part of (request.headers.get('Cookie')||'').split(';')){const at=part.indexOf('=');if(['authjs.session-token','__Secure-authjs.session-token'].includes(part.slice(0,at).trim()))return decodeURIComponent(part.slice(at+1))}return ''}
export async function currentSession(request,env,user){const token=sessionToken(request);if(!token)return null;return env.DB.prepare('SELECT s.id,s.expires,a.authenticated_at FROM sessions s LEFT JOIN session_auth a ON a.session_token=s.sessionToken WHERE s.sessionToken=? AND s.userId=? AND s.expires>?').bind(token,user.id,new Date().toISOString()).first()}
// Recent-identity window: a change to accounts, connections or invitations needs a fresh confirmation on this session
// (Google sign-in again, or a passkey touch in place, passkeys.mjs) within
// this time. 30 minutes for everyone (user decision 2026-11-10, AGENTS.md); /api/security/sessions returns it so the client
// never keeps its own copy.
export const RECENT_IDENTITY_MS=30*60000;
// Passkey recovery guard (docs/audits/2026-11-10-passkey-security-review.md finding 3): for 72 hours after a recovery
// link or the operator code added a passkey, that person's older passkeys stay (passkeys.mjs); the newer one, which the
// link created, can still be removed by the real person. Sessions are not guarded (re-review R1): Auth.js rolls
// `expires` forward on use, so a session's age cannot be known, and signing someone out is undone by signing in again.
export const RECOVERY_GUARD_MS=72*3600000;
export async function recoveryGuardSince(env,userId,now=Date.now()){return (await env.DB.prepare("SELECT MAX(used_at) AS at FROM invitations WHERE purpose='recover' AND used_by=? AND used_at>?").bind(userId,now-RECOVERY_GUARD_MS).first())?.at||0}
export async function requireRecent(request,env,user){const session=await currentSession(request,env,user);if(!session?.authenticated_at||session.authenticated_at<Date.now()-RECENT_IDENTITY_MS)throw Object.assign(fail('Confirm it’s you before changing accounts, connections or invitations.',403),{code:'REAUTH_REQUIRED'});return session}
export async function limit(env,bucket,{max=120,period=60000}={}){
 const window=Math.floor(Date.now()/period),key=await hash(bucket);
 const result=await env.DB.prepare('INSERT INTO security_rate_limits(bucket,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window,expires_at=excluded.expires_at RETURNING count').bind(key,window,(window+1)*period).first();
 if(result.count>max)throw Object.assign(fail('Too many requests. Wait a little before trying again.',429),{code:'RATE_LIMITED'});
}
export function auditStatement(env,{home=null,actor,action,resource=null,result='ok'}){const parts=String(action).split('.'),services=new Set(['state','member','household','session','ai','telegram','maps','finance','family']),operations=new Set(['change','join','create','revoke','credentials','model','test','chat','link','links','media','speech','imports','connections','connect','disconnect','sync','apply','undo','preferences','insights','members','invitations','request']);action=(services.has(parts[0])?parts[0]:'session')+'.'+(operations.has(parts[1])?parts[1]:'request');return env.DB.prepare('INSERT INTO security_audit(id,household_id,actor_id,action,resource_id,result,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),home,actor,action,resource,result,Date.now())}
export async function audit(env,event){await auditStatement(env,event).run()}
export async function ownSessions(request,env,user){
 const current=await currentSession(request,env,user);
 if(request.method==='GET'){const sessions=(await env.DB.prepare('SELECT s.id,s.expires,a.authenticated_at FROM sessions s LEFT JOIN session_auth a ON a.session_token=s.sessionToken WHERE s.userId=? AND s.expires>? ORDER BY a.authenticated_at DESC LIMIT 100').bind(user.id,new Date().toISOString()).all()).results;const methods=[...new Set((await env.DB.prepare('SELECT provider FROM accounts WHERE userId=?').bind(user.id).all()).results.map(r=>r.provider))].sort((a,b)=>a==='passkey'?-1:b==='passkey'?1:0);return json({recent:!!current?.authenticated_at&&current.authenticated_at>Date.now()-RECENT_IDENTITY_MS,recentWindowMs:RECENT_IDENTITY_MS,methods,sessions:sessions.map(s=>({...s,current:s.id===current?.id}))})}
 if(request.method==='DELETE'){await requireRecent(request,env,user);const body=await bodyJSON(request,3000);if(typeof body.id!=='string')throw fail('Choose a session.');await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE id=? AND userId=?').bind(body.id,user.id),auditStatement(env,{actor:user.id,action:'session.revoke',resource:body.id})]);return json({ok:true})}throw fail('Method not allowed.',405);
}
export {lease} from './leases.mjs';
export async function maintenance(env,now=Date.now()){
 await env.DB.batch([
  env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(new Date(now).toISOString()),
  env.DB.prepare('DELETE FROM invitations WHERE expires_at<?').bind(now-86400000),
  env.DB.prepare('DELETE FROM finance_imports WHERE status<>\'applied\' AND created_at<?').bind(now-86400000),
  env.DB.prepare('UPDATE telegram_links SET turns=NULL,turns_at=NULL,turns_scope=NULL,turns_revision=NULL WHERE turns_at<?').bind(now-30*60000),
  env.DB.prepare('DELETE FROM security_audit WHERE created_at<?').bind(now-30*86400000),
  env.DB.prepare('DELETE FROM security_rate_limits WHERE expires_at<?').bind(now-86400000),
  env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at<?').bind(now), // passkey ceremonies: 5-minute single-use challenges
  env.DB.prepare("DELETE FROM notification_deliveries WHERE status='sending' AND created_at<?").bind(now-5*60000),
  env.DB.prepare('DELETE FROM push_subscriptions WHERE session_id IS NULL OR NOT EXISTS(SELECT 1 FROM sessions WHERE sessions.id=push_subscriptions.session_id AND sessions.expires>?)').bind(new Date(now).toISOString())
 ]);await maintainFiles(env,now);
}
export async function audited(env,event,operation){try{const result=await operation();await audit(env,{...event,result:result?.ok===false?'refused':'ok'}).catch(()=>{});return result}catch(e){await audit(env,{...event,result:'refused'}).catch(()=>{});throw e}}
export async function ownAudit(env,user,home){const events=(await env.DB.prepare('SELECT action,result,created_at FROM security_audit WHERE household_id=? AND (actor_id=? OR actor_id=?) ORDER BY created_at DESC LIMIT 30').bind(home.id,user.id,home.membership.member_id).all()).results;return json({events})}
