import React,{useEffect,useRef,useState} from 'react';
import {Heart,Leaf,GameController,TShirt,Orange as Apple,Shower,Broom,Bed,Lightning,Smiley,ChartBar,CaretRight,X,Storefront} from '@phosphor-icons/react';
import {HERO_ITEMS} from '../../shared/hero-catalog.mjs';
import {heroNeedFull} from '../../shared/hero-home.mjs';
import './hero-organization.css';
import {HeroFridge} from './hero-fridge';

export function HeroPlaces({a,value,onChange,disabled}){
 const places=[['care','Care','מטפלים',Heart],['garden','Garden','הגינה',Leaf],['games','Games','משחקים',GameController],['dress','Dress up','מתלבשים',TShirt]];
 return <div className="hero-place-nav" role="group" aria-label={a.T('My Hero activities','פעילויות הגיבור שלי')}>{places.map(([id,en,he,Icon])=><button type="button" key={id} data-place={id} aria-pressed={value===id} disabled={disabled} onClick={()=>onChange(id)}><Icon size={25}/><span>{a.T(en,he)}</span></button>)}</div>;
}

export function HeroCareHome({a,profile,child,state,care,asleep,waiting,animation,notice,error,message,Room,onAct,onShop,onProgress,careBlock,world,balance,onBuy,onPlay}){
 const T=a.T,[foodOpen,setFoodOpen]=useState(false),[foodShop,setFoodShop]=useState(false),[action,setAction]=useState('feed'),dialog=useRef(null),opener=useRef(null);
 const food=HERO_ITEMS.filter(i=>i.category==='food'&&state.pantry[i.id]>0);
 useEffect(()=>{if(!foodOpen)return;opener.current=document.activeElement;dialog.current?.showModal();dialog.current?.querySelector('[data-close-food]')?.focus();return()=>opener.current?.focus?.()},[foodOpen]);
 const act=key=>{setAction(key);if(key==='play'){onPlay();return}if(key==='feed'){setFoodShop(false);setFoodOpen(true);return}void onAct(key==='sleep'&&asleep?'wake':key)};
 const feed=async id=>{if(await onAct('feed',id)){setFoodOpen(false);setAction('feed')}};
 const actions=[['feed','Eat','לאכול',Apple],['wash','Shower','להתקלח',Shower],['tidy','Tidy','לסדר',Broom],['play','Play with toys','משחקים בצעצועים',GameController],['sleep',asleep?'Wake up':'Rest',asleep?'להתעורר':'לנוח',Bed]];
 const canEat=!waiting&&!asleep&&!heroNeedFull(care.food);
 return <section className="hero-care-home" ref={world} aria-label={T('Care for my hero','מטפלים בגיבור שלי')}>
  <header className="hero-activity-heading"><div><h2>{T('My little home','הבית הקטן שלי')}</h2><p>{T('Eat, wash, tidy and rest with your hero.','אוכלים, מתקלחים, מסדרים ונחים עם הדמות.')}</p></div><button type="button" className="hero-progress-link" onClick={onProgress}><ChartBar size={20}/>{T('My progress','ההתקדמות שלי')}<CaretRight size={16}/></button></header>
  <div className="hero-care-meters">{[['food','Full tummy','שובע',Apple],['clean','Clean','ניקיון',Shower],['energy','Energy','אנרגיה',Lightning],['joy','Happy','שמחה',Smiley]].map(([key,en,he,Icon])=><div className={'hero-care-meter need-'+key} key={key}><Icon size={27}/><div><strong>{T(en,he)} <bdi className="hero-care-value" aria-hidden="true">{Math.round(care[key])}%</bdi></strong><div role="progressbar" aria-label={T(en,he)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(care[key])}><span style={{width:Math.round(care[key])+'%'}}/></div></div><span className="sr-only">{Math.round(care[key])}%</span></div>)}</div>
  <div className="hero-care-layout">
   <div className="hero-care-room-column"><Room a={a} who={child} profile={profile} care={care} animation={animation}/><div className="hero-care-button-row">{actions.map(([key,en,he,Icon])=>{const blocked=careBlock(key==='sleep'&&asleep?'wake':key);return <button type="button" key={key} data-care-control={key} aria-pressed={(key==='sleep'?asleep:action===key)&&!blocked} aria-disabled={waiting||!!blocked} disabled={waiting||!!blocked} onClick={()=>act(key)}><Icon size={30}/><span>{T(en,he)}</span>{blocked&&<small>{blocked.short}</small>}</button>})}</div></div>
   {asleep?<aside className="hero-rest-feedback" aria-label={T('Resting','נחים')}><h3>{T('Sweet dreams','חלומות נעימים')}</h3><strong><bdi>{Math.floor(Math.ceil((care.sleepRemaining||0)/1000)/60)}:{String(Math.ceil((care.sleepRemaining||0)/1000)%60).padStart(2,'0')}</bdi></strong><p>{T('until your hero wakes up','עד שהדמות מתעוררת')}</p><span>{T('Energy','אנרגיה')} · <bdi>{Math.round(care.energy)}%</bdi></span><p>{T('A little breathing, a cozy blanket. Wakes up at full energy.','נשימות קטנות ושמיכה נעימה. מתעוררים כשהאנרגיה מלאה.')}</p></aside>:<aside className="hero-food-panel" aria-label={T('Food for my hero','אוכל לגיבור שלי')}><h3>{T('Food for my hero','אוכל לגיבור שלי')}</h3><p>{T('Tap any food to eat.','לוחצים על אוכל כדי לאכול.')}</p><div className="hero-food-owned">{food.slice(0,4).map(i=><button type="button" className="hero-food-owned-row" key={i.id} disabled={!canEat} onClick={()=>feed(i.id)}><img src={i.image} alt=""/><span><strong>{T(i.en,i.he)}</strong><bdi>×{state.pantry[i.id]}</bdi></span><span className="hero-food-eat-label">{T('Eat','לאכול')}</span></button>)}</div>{!food.length&&<p className="hero-food-empty">{T('Your fridge is empty. Let’s get a snack.','המקרר ריק. נוסיף משהו טעים.')}</p>}{heroNeedFull(care.food)&&<p>{T('Full tummy! A snack can wait.','שבעים! אפשר לאכול אחר כך.')}</p>}<button type="button" className="hero-context-shop" onClick={()=>{setFoodShop(true);setFoodOpen(true)}}><Leaf size={21}/>{T('Get more food','מוסיפים אוכל')}</button></aside>}

  </div>
  <div className={'hero-care-notice'+(error?' is-error':'')} data-kind={notice?.kind||'idle'} role={notice?.kind==='error'||error?'alert':'status'} aria-live="polite">{waiting?T('Waiting for the household server…','ממתינים לאישור שרת הבית…'):notice?.text||error||message||T('Your hero is always safe while you’re away.','הדמות תמיד בטוחה גם כשלא משחקים.')}{notice?.shop&&<button type="button" className="hero-small-button" onClick={onShop}><Storefront size={18}/>{T('Get food','מוסיפים אוכל')}</button>}</div>
  <button type="button" className="hero-small-button hero-open-fridge" onClick={()=>{setFoodShop(false);setFoodOpen(true)}}><img src="/assets/icons/bayit/pixel/vegetable-basket-256.png" alt=""/>{T('My fridge','המקרר שלי')} · <bdi>{food.length}</bdi></button>
  {foodOpen&&<HeroFridge a={a} state={state} care={care} balance={balance} waiting={waiting} initialShop={foodShop} error={error||(notice?.kind==='error'?notice.text:'')} onClose={()=>setFoodOpen(false)} onFeed={feed} onBuy={onBuy}/>}

 </section>;
}

export function HeroFoodStore({a,balance,waiting,onChoose,onBack}){
 return <section className="hero-food-store"><header className="hero-activity-heading"><div><h2>{a.T('Something tasty','משהו טעים')}</h2><p>{a.T('Pretend food for your hero. Buy with earned stars.','אוכל במשחק לגיבור. קונים בכוכבים שצברתם.')}</p></div><button className="hero-small-button" type="button" onClick={onBack}>{a.T('Back to Care','חוזרים לטיפול')}</button></header><div className="hero-food-store-grid">{HERO_ITEMS.filter(i=>i.category==='food').map(i=><button type="button" key={i.id} disabled={waiting} onClick={()=>onChoose(i)}><img src={i.image} alt=""/><h3>{a.T(i.en,i.he)}</h3><span><img src="/assets/icons/bayit/pixel/yellow-star-256.png" alt=""/><bdi>{i.price}</bdi> {a.T('stars','כוכבים')}</span>{balance<i.price&&<small>{a.T('Earn more stars from routines or games','צוברים כוכבים במשימות ובמשחקים')}</small>}</button>)}</div></section>;
}
