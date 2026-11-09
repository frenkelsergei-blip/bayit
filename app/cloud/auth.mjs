import {Auth} from '@auth/core';
import Google from '@auth/core/providers/google';
import {D1Adapter} from '@auth/d1-adapter';
import {signInAllowed} from './registration.mjs';
import {sessionToken} from './security.mjs';
const googleCallback=(request,account)=>new URL(request.url).pathname==='/api/auth/callback/google'&&account?.provider==='google';
async function allowSignIn(env,request,base,{profile,account}){
 if(!await signInAllowed(env,profile,request))return false;
 if(googleCallback(request,account)){
  const token=sessionToken(request),current=token?await base.getSessionAndUser(token):null;
  // Confirm the existing identity; a different Google identity must not link itself
  // to this signed-in account or make its sensitive actions recent.
  if(current&&new Date(current.session.expires).getTime()>Date.now())return (await base.getUserByAccount({provider:'google',providerAccountId:account.providerAccountId}))?.id===current.user.id;
 }
 return true;
}
async function verifiedSignIn(env,request,{user,account}){
 if(!googleCallback(request,account)||!user?.id)return;
 const token=sessionToken(request);if(!token)return;
 // Auth.js emits signIn only after successful provider verification and login.
 // Its same-account path reuses the existing session instead of INSERTing one.
 await env.DB.prepare("INSERT INTO session_auth(session_token,user_id,authenticated_at) SELECT s.sessionToken,s.userId,? FROM sessions s JOIN accounts a ON a.userId=s.userId WHERE s.sessionToken=? AND s.userId=? AND s.expires>? AND a.provider='google' AND a.providerAccountId=? ON CONFLICT(session_token) DO UPDATE SET authenticated_at=excluded.authenticated_at WHERE session_auth.user_id=excluded.user_id").bind(Date.now(),token,user.id,new Date().toISOString(),account.providerAccountId).run();
}
export const authReady=env=>!!(env.DB&&env.AUTH_SECRET&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
export function authConfig(env,request){const base=D1Adapter(env.DB);return {basePath:'/api/auth',trustHost:true,secret:env.AUTH_SECRET,adapter:{...base,getSessionAndUser:async token=>{const current=await base.getSessionAndUser(token);if(current&&new Date(current.session.expires).getTime()<=Date.now()){await base.deleteSession(token);return null}return current},linkAccount:account=>base.linkAccount({...account,access_token:null,refresh_token:null,id_token:null,oauth_token:null,oauth_token_secret:null})},providers:[Google({clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,checks:['pkce','state','nonce'],authorization:{params:{scope:'openid email profile',access_type:'online'}}})],session:{strategy:'database',maxAge:60*60*24*14},callbacks:{signIn:values=>allowSignIn(env,request,base,values),session:({session,user})=>({...session,user:{id:user.id,name:user.name,email:user.email,image:user.image}})},events:{signIn:values=>verifiedSignIn(env,request,values)},logger:{error:error=>console.error('Bayit authentication error:',error.name||'AuthError'),warn:code=>console.warn('Bayit authentication:',code),debug:()=>{}}}}
export async function sessionFor(request,env){if(!authReady(env))return null;const url=new URL('/api/auth/session',request.url),response=await Auth(new Request(url,{headers:request.headers}),authConfig(env,request));if(!response.ok)return null;const session=await response.json();return session?.user?.id?session:null}
export const authHandler=(request,env)=>Auth(request,authConfig(env,request));
