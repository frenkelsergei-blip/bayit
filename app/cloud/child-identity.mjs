import {fail,random,hash} from './util.mjs';
import {passkeysOn,relyingParty} from './passkey-config.mjs';

export function hasPrivateIdentityData(state,memberId){
 for(const value of Object.values(state||{}))if(Array.isArray(value)&&value.some(r=>r&&r.ownerId===memberId&&r.visibility!=='family'))return true;
 return Object.values(state.aiOperations||{}).some(r=>r?.ownerId===memberId)||!!state.preferences?.privateGoals?.[memberId];
}
export async function identityFor(env,home,memberId){return env.DB.prepare('SELECT * FROM member_identities WHERE household_id=? AND member_id=?').bind(home.id,memberId).first()}
const protectedMessage='This child must link their own identity from their existing account or Telegram /account. A parent can still manage their routines.';
export async function authorizeChildInvitation(env,home,memberId){
 const identity=await identityFor(env,home,memberId);
 if(identity?.user_id)return; // A subsequent claim is restricted to that SAME Google identity.
 if(identity?.telegram_user_id||hasPrivateIdentityData(home.state,memberId))throw fail(protectedMessage,403);
}
export async function authorizeChildJoin(env,home,invite,user){
 if(!invite.member_id)return;
 const member=home.state.members.find(m=>m.id===invite.member_id&&m.role==='child');if(!member)throw fail('This child profile is unavailable.',410);
 const identity=await identityFor(env,home,invite.member_id);
 if(identity?.user_id&&identity.user_id!==user.id)throw fail(protectedMessage,403);
 if(!identity?.user_id&&!invite.identity_verified&&(identity?.telegram_user_id||hasPrivateIdentityData(home.state,invite.member_id)))throw fail(protectedMessage,403);
}
export async function telegramLinkIdentity(env,home,memberId,requesterUserId){
 const identity=await identityFor(env,home,memberId),member=home.state.members.find(m=>m.id===memberId);
 if(member?.role==='child'&&!identity?.telegram_user_id&&identity?.user_id!==requesterUserId&&(identity?.user_id||hasPrivateIdentityData(home.state,memberId)))throw fail(protectedMessage,403);
 return identity?.telegram_user_id||null;
}
export async function authorizeTelegramClaim(env,home,row,telegramUserId){
 const identity=await identityFor(env,home,row.member_id),expected=identity?.telegram_user_id||row.expected_telegram_user_id;
 if(expected&&expected!==telegramUserId)throw fail('Use this family member’s already linked Telegram identity.',403);
 const member=home.state.members.find(m=>m.id===row.member_id);
 if(member?.role==='child'&&!expected&&identity?.user_id!==row.created_by&&(identity?.user_id||hasPrivateIdentityData(home.state,row.member_id)))throw fail(protectedMessage,403);
 const other=await env.DB.prepare('SELECT member_id FROM member_identities WHERE household_id=? AND telegram_user_id=? AND member_id<>?').bind(home.id,telegramUserId,row.member_id).first();
 if(other)throw fail('Each person links their own Telegram identity.',403);
}
export function bindGoogleIdentity(env,homeId,memberId,userId){return env.DB.prepare('INSERT INTO member_identities(household_id,member_id,user_id,bound_at) VALUES(?,?,?,?) ON CONFLICT(household_id,member_id) DO UPDATE SET user_id=COALESCE(member_identities.user_id,excluded.user_id) WHERE member_identities.user_id IS NULL OR member_identities.user_id=excluded.user_id').bind(homeId,memberId,userId,Date.now())}
export function bindTelegramIdentity(env,homeId,memberId,telegramId){return env.DB.prepare('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) VALUES(?,?,?,?) ON CONFLICT(household_id,member_id) DO UPDATE SET telegram_user_id=COALESCE(member_identities.telegram_user_id,excluded.telegram_user_id) WHERE member_identities.telegram_user_id IS NULL OR member_identities.telegram_user_id=excluded.telegram_user_id').bind(homeId,memberId,telegramId,Date.now())}
// Called only in the member's already authenticated, bound private Telegram chat. Parents never get this token.
export async function ownAccountInvitation(env,home,memberId,telegramUserId,origin){
 const member=home.state.members.find(m=>m.id===memberId&&m.role==='child'),identity=await identityFor(env,home,memberId);
 if(!member||identity?.telegram_user_id!==telegramUserId)throw fail('Use your own linked child chat.',403);
 const linked=await env.DB.prepare('SELECT user_id FROM memberships WHERE household_id=? AND member_id=?').bind(home.id,memberId).first();
 // Already linked: with passkeys on, the child's own verified chat may add a passkey to that same account (design §4.4),
 // through a recovery link for exactly that account, without the parent hold (the chat already proves the child).
 if(linked){if(!passkeysOn(env)||!relyingParty(env))throw fail('Your account is already linked.',409);const token=random(32),now=Date.now();await env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,identity_verified,purpose,target_user_id,usable_at) VALUES(?,?,'child',?,?,?,1,'recover',?,?)").bind(await hash(token),home.id,'telegram:'+memberId,now+15*60000,memberId,linked.user_id,now).run();return new URL('/#join?invite='+token,origin).href}
 const token=random(32);await env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,identity_verified) VALUES(?,?,'child',?,?,?,1)").bind(await hash(token),home.id,'telegram:'+memberId,Date.now()+15*60000,memberId).run();
 return new URL('/#join?invite='+token,origin).href;
}
// Token claim, account binding and link replacement share one database transaction.
// The revision guard closes the gap between checking private data and accepting a new identity.
export async function claimTelegramLink(env,home,row,tokenHash,telegramId,chatId,name){
 const nonce=random(18),now=Date.now();
 const permit='EXISTS(SELECT 1 FROM telegram_link_tokens WHERE token_hash=? AND claim_id=?)';
 const guarded=sql=>env.DB.prepare(sql);
 const result=await env.DB.batch([
  guarded('UPDATE telegram_link_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM household_data WHERE household_id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM member_identities WHERE household_id=? AND member_id=? AND ((telegram_user_id IS NOT NULL AND telegram_user_id<>?) OR (user_id IS NOT NULL AND user_id<>? AND COALESCE(telegram_user_id,\'\')<>?))) AND NOT EXISTS(SELECT 1 FROM member_identities WHERE household_id=? AND member_id<>? AND telegram_user_id=?)').bind(now,nonce,tokenHash,now,home.id,home.revision,home.id,row.member_id,telegramId,row.created_by,telegramId,home.id,row.member_id,telegramId),
  guarded('DELETE FROM telegram_links WHERE household_id=? AND (member_id=? OR chat_id=?) AND '+permit).bind(home.id,row.member_id,chatId,tokenHash,nonce),
  guarded('INSERT INTO telegram_links(household_id,member_id,chat_id,telegram_user_id,telegram_name,linked_at) SELECT ?,?,?,?,?,? WHERE '+permit).bind(home.id,row.member_id,chatId,telegramId,name,new Date(now).toISOString(),tokenHash,nonce),
  guarded('INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) SELECT ?,?,?,? WHERE '+permit+' ON CONFLICT(household_id,member_id) DO UPDATE SET telegram_user_id=COALESCE(member_identities.telegram_user_id,excluded.telegram_user_id)').bind(home.id,row.member_id,telegramId,now,tokenHash,nonce),
  guarded('UPDATE household_data SET revision=revision+1 WHERE household_id=? AND '+permit).bind(home.id,tokenHash,nonce)
 ]);return !!result[0].meta.changes;
}
