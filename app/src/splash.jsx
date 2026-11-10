// Opening screen control. The screen itself lives in index.html so it paints before the bundle loads.
import React,{useEffect} from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import {EntrySurface} from './entry-surface';
export const hideSplash=()=>window.__bayitSplash?.hide();
export const showSplash=()=>window.__bayitSplash?.show();
// Keep the opening screen up while something is still loading (cloud household open / switch).
export function SplashHold(){useEffect(()=>{showSplash()},[]);return null}
export function SplashOff(){useEffect(()=>{hideSplash()},[]);return null}

// Title with the real underline and rays on the final word (same as the opening screen).
export function SunriseTitle({text,as:Tag='h1'}){const words=String(text).split(' '),tail=words.pop(),prefix=words.join(' ');return <Tag className="sunrise-title">{prefix}{prefix?' ':''}<span className="sunrise-end">{tail}<img className="sunrise-u" src="/assets/generated/title-underline-clean.png" alt=""/><img className="sunrise-r" src="/assets/generated/title-rays.png" alt=""/></span></Tag>}

// Signed-out entry screen in the same "Quiet sunrise" style as the opening screen.
// methods: the sign-in methods the server offers, [{id,label:{en,he}}]. With none, no button: the note says why.
export function SignInSunrise({T,language,setLanguage,busy,configured,methods=[],onSignIn,onDemo,error}){
 const google=methods.some(m=>m.id==='google');
 return <EntrySurface {...{T,language,setLanguage}}>
   <SunriseTitle text={T('A little more together.','קצת יותר ביחד.')}/>
   <p className="sunrise-sub">{T('One home. Your own accounts. All the little things, shared.','בית אחד. חשבון אישי לכל אחד. כל הדברים הקטנים, ביחד.')}</p>
   {methods.map(m=><button key={m.id} className="button sunrise-google" disabled={busy||!configured} aria-busy={busy||undefined} onClick={()=>onSignIn(m.id)}>{T(m.label.en,m.label.he)}<ArrowRight size={22}/></button>)}
   {error&&<p role="alert" className="entry-error">{error}</p>}
   {!configured&&<div className="cloud-setup-note sunrise-note"><strong>{google?T('Google sign-in is awaiting the owner’s setup.','כניסה עם Google ממתינה להגדרה של בעל ההתקנה.'):methods.length?T('Sign-in is awaiting the owner’s setup.','הכניסה ממתינה להגדרה של בעל ההתקנה.'):T('No sign-in is set up yet. The installation owner needs to finish setting it up.','עדיין לא הוגדרה דרך כניסה. בעל ההתקנה צריך להשלים את ההגדרה.')}</strong><p>{T('You can explore the interactive preview now. Shared family data becomes available after sign-in is connected.','אפשר להתנסות בתצוגה האינטראקטיבית כבר עכשיו. מידע משפחתי משותף יהיה זמין אחרי חיבור הכניסה.')}</p></div>}
   <button className="text-link entry-demo" onClick={onDemo}>{T('Explore with sample data','התנסות עם מידע לדוגמה')}</button>
  {methods.length>0&&<small className="sunrise-foot">{google?T('Sign in with your Google account to create your family or join an invitation.','היכנסו עם חשבון Google כדי ליצור משפחה או להצטרף להזמנה.'):T('Sign in to create your family or join an invitation.','היכנסו כדי ליצור משפחה או להצטרף להזמנה.')}</small>}
 </EntrySurface>;
}
