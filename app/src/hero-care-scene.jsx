import React from 'react';
import {HeroLifeSprite} from './hero-life-sprite';
import {HERO_BY_ID,heroFoodMeal} from '../../shared/hero-catalog.mjs';
const people=new Set(['itai','noa','maya','ari','lia','tom','dana','yoni']);
export function HeroCareScene({profile={},who='itai',action,label,food}){
 const character=people.has(profile.character)?profile.character:who==='noa'?'noa':'itai';
 const meal=heroFoodMeal(HERO_BY_ID[food]||{});
 const rig='/assets/generated/hero-home/care-room-v4/';
 return <>
  <img className="hero-care-room-curtain" data-furniture="shower" src={rig+'curtain-front-room.png'} alt="" draggable="false"/>
  {action==='sleep'&&<div className="hero-care-original-sleep" data-character={character} data-care-action="sleep"><span className="hero-sleep-cloud" aria-hidden="true"><img src="/assets/generated/hero-care-life/sleep-cloud.png" alt=""/></span><img className="hero-rig-sleep-head" src={rig+character+'-sleep-head.png'} alt={label} draggable="false"/><img className="hero-care-original-bed-front" data-furniture="bed" src={rig+'bed-front-room.png'} alt="" draggable="false"/><span className="hero-care-original-blanket" aria-hidden="true"><img className="hero-rig-blanket-breath" src={rig+'blanket-breathe.png'} alt="" draggable="false"/></span></div>}
  {action==='wash'&&<div className="hero-care-original-wash" data-character={character} data-care-action="wash"><img className="hero-rig-wash-head" src={rig+character+'-wash-body.png'} alt={label} draggable="false"/><span className="hero-rig-bubbles" aria-hidden="true">{[0,1,2].map(i=><img key={i} src={rig+'bubble.png'} alt="" style={{'--bubble':i}}/>)}</span></div>}
  {action==='feed'&&<div className="hero-care-scene-position hero-care-scene-feed" data-character={character} data-care-action="feed">
   <img className="hero-care-static-chair" src="/assets/generated/hero-home/dining-chair.png" alt="" draggable="false"/>
   <span className="hero-care-scene-sprite" role="img" aria-label={label}>{meal==='bowl'?<img className="hero-care-scene-frames" src={rig+character+'-feed.png'} alt="" draggable="false"/>:<HeroLifeSprite profile={profile} who={who} row={meal==='drink'?1:0}/>}</span>
   <img className="hero-care-static-table" src="/assets/generated/hero-home/care-layered/table.png" alt="" draggable="false"/>
  </div>}
  {['tidy','play','wake'].includes(action)&&<div className="hero-care-life-standing"><HeroLifeSprite profile={profile} who={who} row={action==='tidy'?2:3} label={label} active={action!=='wake'} className={action==='wake'?'hero-life-wake':''}/></div>}
 </>;
}
