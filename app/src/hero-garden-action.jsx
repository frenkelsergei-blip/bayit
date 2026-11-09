import React,{useEffect,useRef,useState} from 'react';
import {PixelCharacter} from './hero-character';
import baskets from './hero-garden-basket.json';
import './hero-garden-action.css';

const ids=['itai','noa','maya','ari','lia','tom','dana','yoni'];
export const gardenWorkerCharacter=(profile,who)=>ids.includes(profile.character)?profile.character:who==='noa'?'noa':'itai';
export const gardenWorkerArt=(character,action)=>'/assets/generated/hero-garden/workers/'+character+'-'+(action==='water-all'?'water':action)+'.png';
const groceries={tomato:'tomatoes',strawberry:'strawberries',carrot:'carrot',lettuce:'lettuce',cucumber:'cucumber',pepper:'pepper',watermelon:'watermelon','apple-tree':'apple','banana-plant':'banana','orange-tree':'orange','lemon-tree':'lemon','pear-tree':'pear'};
const official={peas:'1FADB',pumpkin:'1F383',basil:'1F33F',mint:'1F33F',sunflower:'1F33B','pineapple-plant':'1F34D'};
export const gardenProduceArt=crop=>groceries[crop]?'/assets/icons/bayit/groceries/'+groceries[crop]+'-256.png':'/assets/icons/bayit/garden-produce/'+official[crop]+'.png';

// One actor changes pose after arriving. Its location comes from the actual soil,
// so responsive layouts and RTL cannot send it to a hard-coded screen position.
export function GardenActor({a,profile,who,field,fx,onStep,onDone}){
 const actor=useRef(null),callbacks=useRef({onStep,onDone}),[pose,setPose]=useState('idle'),[destination,setDestination]=useState(null),character=gardenWorkerCharacter(profile,who);
 callbacks.current={onStep,onDone};
 useEffect(()=>{if(pose!=='working'||!actor.current)return;const r=actor.current.getBoundingClientRect(),header=document.querySelector('.bayit-shell-header,.mobile-top')?.getBoundingClientRect(),footer=document.querySelector('.bayit-shell-nav[data-position=bottom],.mobile-bottom')?.getBoundingClientRect(),top=header?.height?header.bottom+8:8,bottom=footer?.height?footer.top-8:innerHeight-8;if(r.top<top||r.bottom>bottom)window.scrollTo({top:Math.max(0,scrollY+(r.top+r.bottom)/2-(top+bottom)/2),behavior:'instant'})},[pose,fx?.workPlot]);
 useEffect(()=>{
  if(!fx){setPose('idle');setDestination(null);return}
  let cancelled=false;const timers=new Set(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pause=ms=>new Promise(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve()},ms);timers.add(timer)});
  const locate=index=>{
   const scene=field.current,soil=scene?.querySelector('[data-plot="'+index+'"] .garden-soil');if(!scene||!soil||!actor.current)return null;
   const r=scene.getBoundingClientRect(),s=soil.getBoundingClientRect(),size=actor.current.getBoundingClientRect().width;
   return {x:Math.max(size/2+3,Math.min(r.width-size/2-3,s.x-r.x+s.width*.25)),y:Math.min(r.height-8,s.y-r.y+s.height*.67),size};
  };
  const perform=async()=>{
   for(const plot of fx.plots){
    if(cancelled)return;setPose('walking');setDestination(locate(plot));callbacks.current.onStep?.(null);
    await pause(reduced?30:560);if(cancelled)return;
    setPose('working');callbacks.current.onStep?.(plot);await pause(reduced?650:1250);if(cancelled)return;
   }
   callbacks.current.onStep?.(null);setPose('returning');setDestination(null);await pause(reduced?30:560);
   if(!cancelled){setPose('idle');callbacks.current.onDone?.()}
  };
  perform();
  const resize=()=>{if(!cancelled&&actor.current?.dataset.pose==='working'){const index=Number(actor.current.dataset.workPlot);setDestination(locate(index))}};
  const observer=new ResizeObserver(resize);if(field.current)observer.observe(field.current);
  return()=>{cancelled=true;for(const timer of timers)clearTimeout(timer);observer.disconnect()};
 },[fx?.id]);
 const working=pose==='working'&&!!fx,kind=fx?.kind==='water-all'?'water':fx?.kind,item=fx?.items.find(p=>p.index===fx.workPlot),basket=baskets[character],label=kind==='plant'?a.T('Planting our little seed','שותלים זרע קטן'):kind==='water'?a.T('A drink for our plant','משקים את הצמח'):a.T('Picking our harvest','קוטפים את התוצרת');
 return <div ref={actor} className={'garden-guide garden-actor'+(destination?' is-at-plot':'')} data-pose={pose} data-character={character} data-work-plot={fx?.workPlot??''} style={destination?{'--garden-actor-x':destination.x+'px','--garden-actor-y':destination.y+'px'}:undefined}>
  {working?<span className="garden-worker-pose" key={fx.id+'-'+fx.workPlot} role="img" aria-label={label}><img className="garden-worker-frames" src={gardenWorkerArt(character,kind)} alt="" draggable="false"/>{kind==='harvest'&&item&&<span className="garden-filled-basket"><img className="garden-basket-fruit" src={gardenProduceArt(item.crop)} alt="" style={{left:(basket.x/256*100-7)+'%',top:(basket.y/256*100-7)+'%'}}/><img className="garden-basket-front" src={'/assets/generated/hero-garden/workers/'+character+'-basket-front.png'} alt=""/></span>}</span>:<PixelCharacter who={who} profile={profile}/>}
 </div>;
}

export function GardenActionEffects({a,fx,index}){
 if(!fx||fx.workPlot!==index)return null;
 const item=fx.items.find(p=>p.index===index),water=['water','water-all'].includes(fx.kind);
 return <span className="garden-action-effects" key={fx.id+'-'+index} aria-hidden="true">
  {water&&<span className="garden-watering"><span className="garden-splash"><img src="/assets/generated/hero-garden/water-splash.png" alt=""/></span></span>}
  {fx.kind==='plant'&&<span className="garden-plant-spark"><img src="/assets/icons/bayit/pixel/yellow-star-256.png" alt=""/></span>}
  {fx.kind==='harvest'&&<><img className="garden-picked-produce" src={gardenProduceArt(item.crop)} alt=""/><span className="garden-pick-reward"><bdi>+{item.quantity}</bdi><small>+{item.xp} {a.T('garden XP','XP גינה')}</small></span></>}
 </span>;
}
