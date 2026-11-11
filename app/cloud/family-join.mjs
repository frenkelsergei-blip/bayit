// Joining a household by invitation: the one function both sign-in methods use (docs/passkey-sign-in-design.md C7).
// Google (POST /api/family/join) calls it with nothing around it, so its statements are exactly what worker.mjs ran
// before; a passkey join adds the new person's user row before and their passkey and session after, inside the same
// guarded batch, so they exist only if the membership was created.
import {fail} from './util.mjs';
import {audit} from './security.mjs';
import {loadHousehold} from './assistant.mjs';
import {authorizeChildJoin} from './child-identity.mjs';

// The condition under which an invitation can still be used, for statements added around the join.
const VALID="token_hash=? AND purpose='join' AND used_by IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM household_data WHERE household_id=invitations.household_id AND revision=?)";

export async function joinHousehold(env,user,tokenHash,{before=null,after=null}={}){
 // Recovery links (purpose 'recover') are never a way into a household.
 const invite=await env.DB.prepare("SELECT * FROM invitations WHERE token_hash=? AND purpose='join'").bind(tokenHash).first();
 if(!invite||invite.expires_at<Date.now()||invite.used_by&&invite.used_by!==user.id)throw fail('This invitation has expired or has already been used.',410);
 const existing=await env.DB.prepare('SELECT * FROM memberships WHERE household_id=? AND user_id=?').bind(invite.household_id,user.id).first();
 if(existing)return {id:invite.household_id,existing:true};
 const invitedHome=await loadHousehold(env,invite.household_id);
 await authorizeChildJoin(env,invitedHome,invite,user);
 const now=Date.now(),statements=[
  env.DB.prepare('INSERT OR IGNORE INTO memberships(household_id,user_id,member_id,role,created_at) SELECT household_id,?,COALESCE(member_id,?),role,? FROM invitations WHERE '+VALID).bind(user.id,user.id,new Date().toISOString(),tokenHash,now,invitedHome.revision),
  env.DB.prepare('UPDATE invitations SET used_by=?,used_at=? WHERE token_hash=? AND used_by IS NULL AND EXISTS(SELECT 1 FROM memberships WHERE household_id=invitations.household_id AND user_id=?)').bind(user.id,Date.now(),tokenHash,user.id),
  env.DB.prepare('UPDATE household_data SET revision=revision+1 WHERE household_id=? AND EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND used_by=?)').bind(invite.household_id,tokenHash,user.id)
 ];
 // A child's own invitation from their private Telegram chat (identity_verified) keeps that chat as their way back
 // (security review finding 4). The 0009 trigger child_google_enrollment clears the chat when a child first gets an
 // account; for this invitation the same batch puts the identity and the link back. Other joins are unchanged.
 const keep=[];
 if(invite.identity_verified&&invite.member_id&&invite.role==='child'){
  const chat=await env.DB.prepare('SELECT * FROM telegram_links WHERE household_id=? AND member_id=?').bind(invite.household_id,invite.member_id).first(),identity=await env.DB.prepare('SELECT telegram_user_id FROM member_identities WHERE household_id=? AND member_id=?').bind(invite.household_id,invite.member_id).first();
  const joined='EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND used_by=?)';
  if(identity?.telegram_user_id)keep.push(env.DB.prepare('UPDATE member_identities SET telegram_user_id=? WHERE household_id=? AND member_id=? AND telegram_user_id IS NULL AND '+joined).bind(identity.telegram_user_id,invite.household_id,invite.member_id,tokenHash,user.id));
  if(chat&&chat.telegram_user_id===identity?.telegram_user_id)keep.push(env.DB.prepare('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at,blocked) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM telegram_links WHERE household_id=? AND member_id=?) AND '+joined).bind(chat.household_id,chat.member_id,chat.chat_id,chat.telegram_user_id,chat.telegram_name,chat.linked_at,chat.blocked||0,chat.household_id,chat.member_id,tokenHash,user.id));
 }
 const head=before?before({where:VALID,whereArgs:[tokenHash,now,invitedHome.revision]}):[],tail=[...keep,...(after?after():[])];
 const result=await env.DB.batch([...head,...statements,...tail]);
 if(!result[head.length].meta.changes)throw fail('This invitation or household changed. Open a fresh invitation.',410);
 await audit(env,{home:invite.household_id,actor:user.id,action:'member.join'}).catch(()=>{});
 return {id:invite.household_id};
}
