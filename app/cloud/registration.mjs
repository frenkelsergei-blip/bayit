// A private installation admits existing members, the operator's allowlist, and valid invitations.
import {fail,json,bodyJSON,hash,base64,encoder,sameDigest} from './util.mjs';
const cookieName='bayit-invitation-permit';
const allowlist=env=>String(env.BAYIT_ALLOWED_EMAILS||env.BAYIT_BOOTSTRAP_EMAIL||'').split(/[\s,]+/).filter(Boolean).map(x=>x.toLowerCase());
const b64=value=>base64(encoder.encode(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function signature(env,value){const key=await crypto.subtle.importKey('raw',encoder.encode(env.AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function validInvite(env,tokenHash){return env.DB.prepare('SELECT token_hash FROM invitations WHERE token_hash=? AND expires_at>? AND used_by IS NULL').bind(tokenHash,Date.now()).first()}
export async function invitationPermit(request,env){
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)throw fail('Request origin is not allowed.',403);
 const body=await bodyJSON(request,3000);if(typeof body.token!=='string'||body.token.length>200)throw fail('Choose a valid invitation.');const tokenHash=await hash(body.token);if(!await validInvite(env,tokenHash))throw fail('This invitation has expired or was already used.',410);
 const payload=b64(JSON.stringify({hash:tokenHash,until:Date.now()+15*60000})),value=payload+'.'+await signature(env,payload),secure=new URL(request.url).protocol==='https:';
 return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookieName+'='+value+'; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=900'+(secure?'; Secure':'')}});
}
async function invited(request,env){try{const value=(request?.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'',[payload,sig]=value.split('.');if(!payload||!sig||!sameDigest(sig,await signature(env,payload)))return false;const data=JSON.parse(atob(payload.replaceAll('-','+').replaceAll('_','/')));return data.until>Date.now()&&!!await validInvite(env,data.hash)}catch{return false}}
export async function signInAllowed(env,profile,request){
 if(profile?.email_verified!==true||typeof profile.email!=='string')return false;
 if(env.BAYIT_REGISTRATION_MODE==='open'||allowlist(env).includes(profile.email.toLowerCase()))return true;
 const existing=await env.DB.prepare('SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE LOWER(u.email)=? LIMIT 1').bind(profile.email.toLowerCase()).first();return !!existing||await invited(request,env);
}
export async function canCreateHousehold(env,user){
 const parent=await env.DB.prepare("SELECT 1 FROM memberships WHERE user_id=? AND role='parent' LIMIT 1").bind(user.id).first();
 if(env.BAYIT_REGISTRATION_MODE!=='open'&&!allowlist(env).includes(String(user.email||'').toLowerCase())&&!parent)throw fail('The installation owner must allow your account before you can create a household.',403);
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first(),max=Math.min(100,Math.max(1,Number(env.BAYIT_MAX_HOUSEHOLDS)||1));if(count.n>=max)throw fail('This installation has reached its configured household limit.',409);return max;
}
export async function registrationStatus(env){const existing=env.DB?await env.DB.prepare('SELECT 1 FROM memberships LIMIT 1').first():null;return {mode:env.BAYIT_REGISTRATION_MODE==='open'?'open':'private',setupRequired:!!env.DB&&env.BAYIT_REGISTRATION_MODE!=='open'&&!allowlist(env).length&&!existing}}
