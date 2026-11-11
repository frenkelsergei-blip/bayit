// Sign-in methods (Modular Bayit work package 2.4). Google is the first registered method; installed extensions add
// more in app/cloud/extensions/signin.mjs. The full contract, and what core still lacks for a passkey method, is in
// docs/sign-in-methods.md; tests/signin-methods.test.mjs checks every method against it.
//
// A method provides exactly these fields, nothing else:
//  id               lowercase id; also the Auth.js provider id, so its callback is /api/auth/callback/<id>.
//  label            {en, he} button text on the sign-in screen.
//  start            how it starts. Only 'authjs': the app posts the Auth.js CSRF form to /api/auth/signin/<id>.
//  configured(env)  true when the owner has set up everything the method needs. Unconfigured methods are not offered.
//  provider(env)    the Auth.js provider that proves identity. Its id must equal the method id. It may not be a
//                   'credentials' provider and may not turn on allowDangerousEmailAccountLinking.
//  verifiedAccount({profile,account,user})
//                   the verified account the provider returned, as {email, email_verified}. email_verified is true
//                   only when the method itself verified that address.
//  recentIdentity   how it supports the "confirm it's you" check before credential changes. Only 'sign-in-again':
//                   the signed-in person completes this method again; core checks the returned account belongs to
//                   the same user and only then marks that one session recent (security.mjs requireRecent).
//
// What stays in core and a method can never replace or skip: admission (signInAllowed: verified email, the owner's
// allowlist, existing members, invitations; canCreateHousehold and the household limit), session creation and
// lifetime (Auth.js database sessions), session listing and revocation, the recent-identity window, and rate limits.
// That is why a method has no callbacks, events, adapter or session fields: any other field is refused.
import Google from '@auth/core/providers/google';
import {joinRegistry} from '../../shared/extension-registry.mjs';
import {EXTRA_SIGNIN} from './extensions/signin.mjs';

export const GOOGLE_SIGNIN={
 id:'google',
 label:{en:'Continue with Google',he:'המשך עם Google'},
 start:'authjs',
 configured:env=>!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),
 provider:env=>Google({clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,checks:['pkce','state','nonce'],authorization:{params:{scope:'openid email profile',access_type:'online'}}}),
 // Google's OpenID profile already carries {email, email_verified}; admission reads it unchanged.
 verifiedAccount:({profile})=>profile,
 recentIdentity:'sign-in-again'
};
const CORE=[GOOGLE_SIGNIN];
export const SIGNIN_FIELDS=['id','label','start','configured','provider','verifiedAccount','recentIdentity'];
export function signInMethodProblem(m){
 const extra=Object.keys(m).filter(k=>!SIGNIN_FIELDS.includes(k));
 if(extra.length)return 'may not carry '+extra.join(', ')+'. Admission, sessions, the recent-identity check and rate limits stay in core.';
 if(typeof m.label?.en!=='string'||!m.label.en||typeof m.label?.he!=='string'||!m.label.he)return 'needs label {en, he}.';
 if(m.start!=='authjs')return "start must be 'authjs'.";
 if(typeof m.configured!=='function'||typeof m.provider!=='function'||typeof m.verifiedAccount!=='function')return 'needs configured(env), provider(env) and verifiedAccount({profile, account, user}).';
 if(m.recentIdentity!=='sign-in-again')return "recentIdentity must be 'sign-in-again'.";
 return '';
}
export const SIGNIN_METHODS=joinRegistry('sign-in method',CORE,EXTRA_SIGNIN,signInMethodProblem);
export const signInMethod=id=>SIGNIN_METHODS.find(m=>m.id===id)||null;
export const configuredSignInMethods=env=>SIGNIN_METHODS.filter(m=>m.configured(env));
// The Auth.js provider for a method, checked each time it is built: a provider cannot claim another method's
// callback, use password-style credentials outside database sessions, or link itself to existing accounts by email.
export function signInProvider(method,env){
 const p=method.provider(env),where='Bayit sign-in method "'+method.id+'": ';
 if(!p||typeof p!=='object'||p.id!==method.id)throw Error(where+'its provider id must be "'+method.id+'".');
 if(p.type==='credentials')throw Error(where+'credentials providers are not supported.');
 // Passkeys run in core (passkeys.mjs). An Auth.js WebAuthn flow would register keys outside Bayit's admission.
 if(p.type==='webauthn')throw Error(where+'webauthn providers are not supported; passkeys are a core method.');
 if(p.allowDangerousEmailAccountLinking||p.options?.allowDangerousEmailAccountLinking)throw Error(where+'may not link accounts by email.');
 return p;
}
// ---- Passkeys ("מפתח גישה"): whether they are on and which relying party they use. Only the configured public
// address counts (BAYIT_ORIGIN), never request headers. The ceremonies are in passkeys.mjs.
export const passkeysOn=env=>String(env.BAYIT_PASSKEYS||'').trim().toLowerCase()!=='off';
const isIP=host=>/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(':')||host.startsWith('[');
// The relying party from the configured public address: an HTTPS origin whose host is a name (never an IP address),
// or http://localhost for use on the same computer. Anything else cannot do passkeys, so the method is not offered.
export function relyingParty(env){
 let url;try{url=new URL(String(env.BAYIT_ORIGIN||''))}catch{return null}
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.hostname)return null;
 if(url.protocol==='https:'&&!isIP(url.hostname))return {origin:url.origin,rpID:url.hostname,secure:true};
 if(url.protocol==='http:'&&url.hostname==='localhost')return {origin:url.origin,rpID:'localhost',secure:false};
 return null;
}
// The core sign-in method record (signin-methods.mjs WEBAUTHN_METHODS). Not an Auth.js provider: its ceremony runs in
// passkeys.mjs. Offered only when switched on (default) and the public address can do passkeys.
export const PASSKEY_SIGNIN={id:'passkey',label:{en:'Sign in with a passkey',he:'כניסה עם מפתח גישה'},start:'webauthn',configured:env=>passkeysOn(env)&&!!relyingParty(env),recentIdentity:'assertion'};

// Core methods whose ceremony runs in core instead of Auth.js (start 'webauthn', recentIdentity 'assertion'): passkeys,
// docs/passkey-sign-in-design.md C2. Only core may register one; an extension's method still must start through Auth.js
// (signInMethodProblem above refuses anything else), so SIGNIN_METHODS stays the Auth.js provider list.
export const WEBAUTHN_FIELDS=['id','label','start','configured','recentIdentity'];
export function webauthnMethodProblem(m){
 const extra=Object.keys(m).filter(k=>!WEBAUTHN_FIELDS.includes(k));if(extra.length)return 'may not carry '+extra.join(', ')+'.';
 if(typeof m.label?.en!=='string'||!m.label.en||typeof m.label?.he!=='string'||!m.label.he)return 'needs label {en, he}.';
 if(m.start!=='webauthn'||m.recentIdentity!=='assertion')return "a core ceremony method has start 'webauthn' and recentIdentity 'assertion'.";
 if(typeof m.configured!=='function')return 'needs configured(env).';
 return '';
}
export const WEBAUTHN_METHODS=joinRegistry('core sign-in method',[PASSKEY_SIGNIN],[],webauthnMethodProblem);
if(WEBAUTHN_METHODS.some(m=>SIGNIN_METHODS.some(x=>x.id===m.id)))throw Error('Bayit sign-in: a core ceremony method id is already registered.');
export const configuredWebauthnMethods=env=>WEBAUTHN_METHODS.filter(m=>m.configured(env));
// What the sign-in screen may show: only methods it can actually start. Passkeys come first (concept A, 2026-11-10).
export const signInChoices=env=>[...configuredWebauthnMethods(env),...configuredSignInMethods(env)].map(m=>({id:m.id,label:{en:m.label.en,he:m.label.he}}));
