// Getting back in after losing every passkey (docs/passkey-sign-in-design.md §4, C8).
// A parent creates a recovery link for another member. It works only after a 24-hour hold, during which the person
// is told on every channel Bayit already has for them and can cancel it. A child with private data or their own
// Telegram identity is refused, as for child invitations. The owner's operator code (passkeys.mjs) has no hold.
import {json,fail,random,hash,bodyJSON} from './util.mjs';
import {limit,auditStatement} from './security.mjs';
import {hasPrivateIdentityData,identityFor} from './child-identity.mjs';
import {loadHousehold} from './assistant.mjs';
import {sendPush} from './push.mjs';
import {sendTelegramNotice} from './telegram.mjs';

export const RECOVERY_HOLD_MS=24*3600000,RECOVERY_VALID_MS=24*3600000;
// For 72 hours after a passkey is added by a recovery link or the operator code, that person's older passkeys cannot
// be removed and their older sessions cannot be signed out (security review finding 3): whoever used the link cannot
// erase the real person's way back, while the real person can still remove the new passkey and its session.
export {RECOVERY_GUARD_MS,recoveryGuardSince} from './security.mjs';
// A person who also belongs to another household cannot be recovered by one household's parent (review finding 1):
// the new passkey would open the other household too. They use the operator code, or a parent of each household.
async function inOtherHousehold(env,userId,householdId){return !!await env.DB.prepare('SELECT 1 FROM memberships WHERE user_id=? AND household_id<>? LIMIT 1').bind(userId,householdId).first()}
const otherHousehold=()=>Object.assign(fail('This person also belongs to another household on this installation, so one household cannot give them a new passkey. The installation owner can, with a recovery code.',409),{code:'OTHER_HOUSEHOLD'});
const protectedChild='This child must get back in from their own Telegram chat (/account). A parent cannot recover a child account that has its own private data.';

async function childProtected(env,home,memberId){
 const member=home.state.members.find(m=>m.id===memberId);if(member?.role!=='child')return false;
 const identity=await identityFor(env,home,memberId);
 return !!identity?.telegram_user_id||hasPrivateIdentityData(home.state,memberId);
}

// What people see on their phone and in Telegram (and, in the app, as a banner from /api/passkeys/recovery).
export function recoveryNotice(by,lang,{kind='requested',target=''}={}){
 const he=lang==='he';
 if(kind==='used')return he?{title:'נעשה שימוש בקישור חזרה',body:(target?'נוסף מפתח גישה חדש לחשבון של '+target+'.':'נוסף מפתח גישה חדש לחשבון שלכם.')+' לא אתם? פתחו את Bayit, הסירו את המפתח החדש ופנו להורה במשפחה. ב־72 השעות הקרובות אי אפשר למחוק את המפתחות הקודמים. אם איבדתם טלפון, גם מפתח הגישה שלו נשאר ל־72 שעות; נתקו את הכניסות שלו באבטחת החשבון.'}
  :{title:'A way-back link was used',body:(target?'A new passkey was added to '+target+'’s account.':'A new passkey was added to your account.')+' Not you? Open Bayit, remove the new passkey and tell a parent. For the next 72 hours the older passkeys cannot be removed. If you lost a phone, its passkey also stays for those 72 hours; sign out its sessions in Account security.'};
 if(target)return he?{title:'בקשה למפתח גישה חדש',body:by+' ביקש/ה מפתח גישה חדש לחשבון של '+target+'. הקישור יעבוד רק מחר. לא נראה לכם נכון? בטלו בהגדרות › משפחה.'}
  :{title:'A new passkey was requested',body:by+' asked for a new passkey for '+target+'’s account. The link works only tomorrow. Doesn’t look right? Cancel it in Settings › Family.'};
 return he?{title:'בקשה למפתח גישה חדש',body:by+' ביקש/ה מפתח גישה חדש לחשבון שלכם. הקישור יעבוד רק מחר. לא ביקשתם? פתחו את Bayit ובטלו.'}
  :{title:'A new passkey was requested',body:by+' asked for a new passkey for your account. The link works only tomorrow. Not you? Open Bayit and cancel it.'};
}
// One person, every channel Bayit has for them in this household. Best effort; returns whether anything was sent.
async function tell(env,home,memberId,notice){
 let sent=0;
 const subs=(await env.DB.prepare('SELECT p.* FROM push_subscriptions p JOIN sessions s ON s.id=p.session_id WHERE p.household_id=? AND p.member_id=? AND s.expires>?').bind(home.id,memberId,new Date().toISOString()).all()).results||[];
 for(const s of subs.slice(0,10)){try{if((await sendPush(env,s,{title:notice.title,body:notice.body,url:'/#today',key:'recovery:'+Date.now(),urgency:'high'})).ok)sent++}catch{}}
 try{if(await sendTelegramNotice(env,home,memberId,notice))sent++}catch{}
 return sent>0;
}
const nameOf=(home,memberId)=>home.state.members.find(m=>m.id===memberId)?.name||'';
const langOf=(home,memberId)=>home.state.profiles?.[memberId]?.locale||'he';
// At creation: the person and every other parent (review finding 5). Returns who was reached.
async function notify(env,home,memberId,byName,byMember){
 const reached=await tell(env,home,memberId,recoveryNotice(byName,langOf(home,memberId))).catch(()=>false);let parentsNotified=0;
 for(const p of home.state.members.filter(m=>m.role==='parent'&&m.id!==memberId&&m.id!==byMember))if(await tell(env,home,p.id,recoveryNotice(byName,langOf(home,p.id),{target:nameOf(home,memberId)})).catch(()=>false))parentsNotified++;
 return {reached,parentsNotified};
}
// When a recovery link or the operator code is USED (review findings 3 and 9): the person and the other parents of
// every household they belong to, except the parent who made the link.
export async function noticeRecoveryUsed(env,userId,{exceptUserId=null}={}){
 for(const m of (await env.DB.prepare('SELECT household_id,member_id FROM memberships WHERE user_id=?').bind(userId).all()).results){
  let home;try{home=await loadHousehold(env,m.household_id)}catch{continue}
  const except=exceptUserId&&(await env.DB.prepare('SELECT member_id FROM memberships WHERE household_id=? AND user_id=?').bind(m.household_id,exceptUserId).first())?.member_id;
  await tell(env,home,m.member_id,recoveryNotice('',langOf(home,m.member_id),{kind:'used'})).catch(()=>{});
  for(const p of home.state.members.filter(x=>x.role==='parent'&&x.id!==m.member_id&&x.id!==except))await tell(env,home,p.id,recoveryNotice('',langOf(home,p.id),{kind:'used',target:nameOf(home,m.member_id)})).catch(()=>{});
 }
}

// POST /api/family/invitations/recovery {memberId}: a parent, with recent identity (worker.mjs applies requireRecent).
export async function recoveryInvitation(request,env,user,home){
 if(home.membership.role!=='parent')throw fail('A parent can help someone get back in.',403);
 const body=await bodyJSON(request,3000),memberId=String(body.memberId||'');
 const target=await env.DB.prepare('SELECT user_id,member_id,role FROM memberships WHERE household_id=? AND member_id=?').bind(home.id,memberId).first();
 if(!target)throw fail('This person has no account to recover. Invite them instead.',404);
 if(target.user_id===user.id)throw fail('You are signed in. Add a passkey in Account security instead.',409);
 if(await childProtected(env,home,memberId))throw fail(protectedChild,403);
 if(await inOtherHousehold(env,target.user_id,home.id))throw otherHousehold();
 const pending=await env.DB.prepare("SELECT 1 FROM invitations WHERE purpose='recover' AND target_user_id=? AND household_id=? AND used_by IS NULL AND expires_at>?").bind(target.user_id,home.id,Date.now()).first();
 if(pending)throw fail('A recovery link for this person is already waiting. Cancel it first to make a new one.',409);
 await limit(env,'invites:'+home.id,{max:20,period:86400000});
 const token=random(),now=Date.now(),usableAt=now+RECOVERY_HOLD_MS,expiresAt=usableAt+RECOVERY_VALID_MS;
 await env.DB.batch([
  env.DB.prepare("INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id,purpose,target_user_id,usable_at) VALUES(?,?,?,?,?,?,'recover',?,?)").bind(await hash(token),home.id,target.role,user.id,expiresAt,memberId,target.user_id,usableAt),
  auditStatement(env,{home:home.id,actor:user.id,action:'family.invitations',resource:'recovery'})
 ]);
 const byName=home.state.members.find(m=>m.id===home.membership.member_id)?.name||user.name||'';
 const {reached,parentsNotified}=await notify(env,home,memberId,byName,home.membership.member_id).catch(()=>({reached:false,parentsNotified:0}));
 return json({url:new URL(request.url).origin+'/#join?invite='+token,usableAt:new Date(usableAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),reached,parentsNotified,notified:reached},201);
}

// Checked when the link is opened and again when the passkey is saved.
export async function authorizeRecoveryUse(env,tokenHash){
 const invite=await env.DB.prepare("SELECT * FROM invitations WHERE token_hash=? AND purpose='recover' AND used_by IS NULL AND expires_at>?").bind(tokenHash,Date.now()).first();
 if(!invite)throw fail('This link has expired or was already used.',410);
 if(invite.usable_at>Date.now())throw Object.assign(fail('This link starts working later.',409),{code:'RECOVERY_NOT_YET'});
 const member=await env.DB.prepare('SELECT member_id FROM memberships WHERE household_id=? AND user_id=?').bind(invite.household_id,invite.target_user_id).first();
 if(!member)throw fail('This link has expired or was already used.',410);
 if(await inOtherHousehold(env,invite.target_user_id,invite.household_id))throw otherHousehold();
 // A child's own link from their private Telegram chat is already proof of that child (identity_verified).
 if(!invite.identity_verified&&await childProtected(env,await loadHousehold(env,invite.household_id),member.member_id))throw fail(protectedChild,403);
 return invite;
}
