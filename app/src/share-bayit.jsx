// "Share Bayit": a public link to the app (or the fictional demo) for WhatsApp, Telegram, email or any share sheet.
// It never includes household data or an invitation; joining a family still needs a family invite.
import React,{useState} from 'react';
import {ShareNetwork,WhatsappLogo,TelegramLogo,EnvelopeSimple,Copy,Check,Play} from '@phosphor-icons/react';

export function ShareBayit({app:a}){
 const T=a.T,[demo,setDemo]=useState(true),[copied,setCopied]=useState(false);
 const url=location.origin+(demo?'/?demo=1':'/'),text=T('Bayit is our family app for the day, tasks, shopping, kids and expenses. Take a look:','Bayit היא האפליקציה המשפחתית שלנו ליום, למשימות, לקניות, לילדים ולהוצאות. הציצו:');
 const open=href=>window.open(href,'_blank','noopener,noreferrer');
 const copy=async()=>{try{await navigator.clipboard.writeText(text+' '+url);setCopied(true);setTimeout(()=>setCopied(false),2500)}catch{window.prompt(T('Copy this link','העתיקו את הקישור'),url)}};
 const native=typeof navigator!=='undefined'&&navigator.share;
 return <section className="share-bayit">
  <div className="share-bayit-head"><img src="/assets/icons/bayit/pixel/blue-house-128.png" alt="" width="72" height="72"/><div><h2>{T('Share Bayit','שתפו את Bayit')}</h2><p>{T('Send friends a link to try the app. It shows the welcome screen or a demo family; nothing from your household is shared.','שלחו לחברים קישור לנסות את האפליקציה. הוא מציג את מסך הפתיחה או משפחה לדוגמה; שום דבר מהבית שלכם לא משותף.')}</p></div></div>
  <div className="share-bayit-choice" role="radiogroup" aria-label={T('What to share','מה לשתף')}>
   <button type="button" role="radio" aria-checked={demo} className={demo?'on':''} onClick={()=>setDemo(true)}><Play size={20} weight="fill"/>{T('Demo tour','סיור לדוגמה')}<small>{T('No sign-in needed','בלי התחברות')}</small></button>
   <button type="button" role="radio" aria-checked={!demo} className={!demo?'on':''} onClick={()=>setDemo(false)}><ShareNetwork size={20} weight="fill"/>{T('Sign-in page','דף ההתחברות')}<small>{T('To start their own family','כדי לפתוח משפחה משלהם')}</small></button>
  </div>
  <div className="share-bayit-link" dir="ltr"><span>{url}</span></div>
  <div className="share-bayit-actions">
   <button type="button" className="share-btn whatsapp" onClick={()=>open('https://wa.me/?text='+encodeURIComponent(text+' '+url))}><WhatsappLogo size={24} weight="fill"/>WhatsApp</button>
   <button type="button" className="share-btn telegram" onClick={()=>open('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text))}><TelegramLogo size={24} weight="fill"/>Telegram</button>
   <button type="button" className="share-btn" onClick={()=>open('mailto:?subject='+encodeURIComponent('Bayit')+'&body='+encodeURIComponent(text+'\n'+url))}><EnvelopeSimple size={24} weight="fill"/>{T('Email','אימייל')}</button>
   <button type="button" className="share-btn" onClick={copy}>{copied?<Check size={24} weight="bold"/>:<Copy size={24}/>}{copied?T('Copied','הועתק'):T('Copy link','העתקת קישור')}</button>
   {native&&<button type="button" className="share-btn" onClick={()=>navigator.share({title:'Bayit',text,url}).catch(()=>{})}><ShareNetwork size={24}/>{T('More…','עוד…')}</button>}
  </div>
  <small className="muted">{T('To add someone to your own family, use “Invite family members” above.','כדי לצרף מישהו למשפחה שלכם, השתמשו ב„הזמנת בני משפחה” למעלה.')}</small>
 </section>;
}
