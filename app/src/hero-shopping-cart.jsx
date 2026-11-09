import React,{useEffect,useRef,useMemo,useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import {X,Coins} from '@phosphor-icons/react';
import './hero-shopping-cart.css';
import {settleCartPile,cartPileKeys,cartGroceryArt} from './hero-cart-pile.mjs';
export {cartGroceryArt,cartGrocerySourceBox} from './hero-cart-pile.mjs';

export const HERO_SHOPPING_CART_IMAGE='/assets/generated/hero-home/shopping-cart-open-v2.png';

export const cartReducedMotion=()=>document.documentElement.dataset.motion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function cartFlightTarget(cart,item,items){
 const art=cart?.querySelector('.hg-cart-art');if(!art)return null;const box=art.getBoundingClientRect();
 const old=[...art.querySelectorAll('.hg-cart-slot')].map(el=>({key:el.dataset.cartKey,x:Number(el.dataset.cartX),y:Number(el.dataset.cartY)}));
 const body=settleCartPile([...items,item],old,Number(cart.dataset.capacity)||5).at(-1);return {x:box.x+(body.x-body.width/2)*box.width,y:box.y+(body.y-body.height/2)*box.height,width:body.width*box.width,height:body.height*box.height,angle:body.angle};
}

export function HeroShoppingCart({items,capacity=3,flying=[],locked=false,T,onRemove,cartRef,total=null}){
 const previous=useRef([]),nodes=useRef(new Map()),animations=useRef(new Map()),signature=items.map(i=>i.id).join('|'),keys=cartPileKeys(items);
 const pile=useMemo(()=>settleCartPile(items,previous.current,capacity),[signature,capacity]);
 useLayoutEffect(()=>{const old=new Map(previous.current.map(b=>[b.key,b])),width=cartRef.current?.querySelector('.hg-cart-art')?.getBoundingClientRect().width||1;
  if(!cartReducedMotion())for(const b of pile){const node=nodes.current.get(b.key),p=old.get(b.key);if(!node||!p)continue;const dx=(p.x-b.x)*width,dy=(p.y-b.y)*width;if(Math.hypot(dx,dy)<.5)continue;animations.current.get(b.key)?.cancel();const animation=node.animate([{transform:`translate(${dx}px,${dy}px) rotate(${p.angle}deg)`},{transform:`translate(0,3px) rotate(${b.angle+1}deg)`,offset:.82},{transform:`translate(0,0) rotate(${b.angle}deg)`}],{duration:570,easing:'cubic-bezier(.35,.08,.4,1)'});animations.current.set(b.key,animation)}
  previous.current=pile;
 },[pile]);
 useEffect(()=>()=>{for(const animation of animations.current.values())animation.cancel()},[]);
 return <section className="hg-cart" ref={cartRef} data-capacity={capacity} aria-label={T('Our shopping cart','עגלת הקניות שלנו')}>
  <header><strong>{T('Our cart','העגלה שלנו')}</strong><span><bdi>{items.length}</bdi> {T('groceries','מוצרים')}</span></header>
  <div className="hg-cart-art" role="group" aria-label={T('Groceries inside the cart','המוצרים בתוך העגלה')} data-count={items.length}>
   <img className="hg-cart-back" src={HERO_SHOPPING_CART_IMAGE} alt="" draggable="false"/>
   {pile.map((body,index)=>{const item=items[index],moving=flying.some(f=>f.index===index);return <div ref={node=>{if(node)nodes.current.set(body.key,node);else nodes.current.delete(body.key)}} className={'hg-cart-slot is-filled'+(moving?' is-arriving':'')} data-cart-index={index} data-cart-key={keys[index]} data-cart-x={body.x} data-cart-y={body.y} key={body.key} style={{left:(body.x-body.width/2)*100+'%',top:(body.y-body.height/2)*100+'%',width:body.width*100+'%',height:body.height*100+'%',transform:`rotate(${body.angle}deg)`,zIndex:10+Math.round(body.y*100)}}>
    {item&&(onRemove?<button type="button" className="hg-cart-grocery" data-cart-product={item.id} disabled={locked||moving} aria-label={T('Remove '+item.en,'להוציא '+item.he)} title={T(item.en,item.he)} onClick={()=>onRemove(index)}><img src={cartGroceryArt(item)} alt={T(item.en,item.he)} draggable="false"/><span className="hg-cart-remove" aria-hidden="true"><X size={13}/></span></button>:<span className="hg-cart-grocery" data-cart-product={item.id} title={T(item.en,item.he)}><img src={cartGroceryArt(item)} alt={T(item.en,item.he)} draggable="false"/></span>)}
   </div>})}
   <img className="hg-cart-front" src={HERO_SHOPPING_CART_IMAGE} alt="" draggable="false"/>
  </div>
  <p className="hg-cart-caption">{items.length?onRemove?T('Tap a grocery in the cart to put it back.','לוחצים על מוצר בעגלה כדי להחזיר אותו למדף.'):T('Everything we found is right here in our cart.','כל מה שמצאנו נמצא כאן בתוך העגלה.'):T('Choose a grocery and watch it land in your cart.','בוחרים מוצר ורואים אותו נכנס לעגלה.')}</p>
  {total!==null&&<div className="hg-cart-total"><span>{T('Total','סך הכול')}</span><strong><bdi>{total}</bdi><Coins size={18}/></strong></div>}
 </section>;
}

export function CartFlyingGrocery({flight,onDone}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current;if(!el)return;let alive=true;
  if(cartReducedMotion()){onDone(flight.key);return}
  const {from,to}=flight,dx=to.x-from.x+(to.width-from.width)/2,dy=to.y-from.y+(to.height-from.height)/2,sx=to.width/from.width,sy=to.height/from.height;
  const animation=el.animate([
   {transform:'translate(0,0) scale(1) rotate(0deg)',opacity:1},
   {transform:`translate(${dx*.5}px,${dy*.5-55}px) scale(${(1+sx)*.56},${(1+sy)*.56}) rotate(-13deg)`,opacity:1,offset:.46},
   {transform:`translate(${dx}px,${dy}px) scale(${sx},${sy}) rotate(${to.angle||0}deg)`,opacity:1},
  ],{duration:720,easing:'cubic-bezier(.25,.65,.35,1)',fill:'forwards'});
  animation.onfinish=()=>{if(alive)onDone(flight.key)};
  return()=>{alive=false;animation.cancel()};
 },[flight.key]);
 return createPortal(<img ref={ref} className="hg-cart-flight" src={cartGroceryArt(flight.item)} alt="" aria-hidden="true" style={{left:flight.from.x,top:flight.from.y,width:flight.from.width,height:flight.from.height}}/>,document.body);
}
