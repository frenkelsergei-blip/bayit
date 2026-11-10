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
 if(p.allowDangerousEmailAccountLinking||p.options?.allowDangerousEmailAccountLinking)throw Error(where+'may not link accounts by email.');
 return p;
}
// What the sign-in screen may show: only methods it can actually start.
export const signInChoices=env=>configuredSignInMethods(env).map(m=>({id:m.id,label:{en:m.label.en,he:m.label.he}}));
