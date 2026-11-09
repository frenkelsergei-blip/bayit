import React from 'react';
import {Check,LockSimple,Minus,Plus,ShoppingCart,X} from '@phosphor-icons/react';
import {heroOwned} from '../../shared/hero-home.mjs';

export function HeroItemDialog({a,child,selected,profile,previewProfile,care,quantity,onQuantity,busy,waiting,editable,balance,level,error,onClose,onBuy,onEquip,dialogRef,Room,Button,Stars}){
 const T=a.T,owned=heroOwned(profile,selected),locked=!owned&&level<selected.level;
 return <dialog className="hero-item-dialog" ref={dialogRef} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}} aria-labelledby="hero-item-title">
  <div className="hero-item-dialog-inner">
   <header><h2 id="hero-item-title">{T(selected.en,selected.he)}</h2><button className="icon-button" type="button" disabled={busy} aria-label={T('Close','סגירה')} onClick={onClose}><X size={22}/></button></header>
   <div className="hero-item-dialog-body" role="region" aria-label={T('Item details','פרטי הפריט')} tabIndex={0}>
    {selected.slot?<Room a={a} who={child} profile={previewProfile} care={{...care,sleepingAt:null}} preview compact animation={selected.slot==='motion'?{type:selected.id,id:selected.id}:null}/>:<div className="hero-food-preview"><img src={selected.image} alt=""/><p>{T('For your virtual fridge · +'+selected.nutrition+' fullness','למקרר הווירטואלי · תוספת '+selected.nutrition+' לשובע')}</p></div>}
    <p className="hero-dialog-note">{selected.slot?a.cloud?T('Preview first. It becomes yours after the household confirms.','קודם מודדים. הפריט שלכם רק אחרי אישור השמירה.'):T('Try it on first. Preview purchases are saved on this device.','קודם מודדים. קניות בתצוגה הזאת נשמרות במכשיר.'):T('Buy here, then choose Eat from your fridge.','קונים כאן, ואז בוחרים לאכול מתוך המקרר.')}</p>
    {selected.category==='food'&&<div className="hero-quantity"><span>{T('Quantity','כמות')}</span><button type="button" aria-label={T('Less','פחות')} disabled={quantity<=1||busy} onClick={()=>onQuantity(n=>n-1)}><Minus size={19}/></button><strong dir="ltr">{quantity}</strong><button type="button" aria-label={T('More','עוד')} disabled={quantity>=5||busy} onClick={()=>onQuantity(n=>n+1)}><Plus size={19}/></button></div>}
    <div className="hero-dialog-balance"><span>{T('Your stars','הכוכבים שלכם')}</span><Stars a={a} value={balance}/></div>
   </div>
   <footer className="hero-item-dialog-footer">
    {locked?<p className="hero-locked-note"><LockSimple size={20}/>{T('Unlocks at level '+selected.level+'. Keep going with real quests!','נפתח ברמה '+selected.level+'. ממשיכים עם המשימות האמיתיות!')}</p>:owned?<Button disabled={!editable||waiting} icon={Check} onClick={()=>onEquip(selected)}>{selected.category==='room'?T('Place in my room','למקם בחדר'):T('Use this','לבחור בזה')}</Button>:<Button disabled={!editable||waiting||balance<selected.price*quantity} icon={ShoppingCart} onClick={()=>onBuy(selected)}>{busy?T('Saving…','שומרים…'):T('Get for '+selected.price*quantity+' stars','לקנות ב־'+selected.price*quantity+' כוכבים')}</Button>}
    {!locked&&!owned&&balance<selected.price*quantity&&<p className="hero-locked-note">{T('A few more real quests will get you there.','עוד כמה משימות אמיתיות ותוכלו להשיג את זה.')}</p>}
    {error&&<p className="hero-dialog-error" role="alert">{error}</p>}
   </footer>
  </div>
 </dialog>;
}
