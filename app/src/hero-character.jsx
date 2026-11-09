import React from 'react';
import {HERO_BY_ID} from '../../shared/hero-catalog.mjs';
import {heroCharacterFile,heroLook} from '../../shared/hero-home.mjs';

export function PixelCharacter({profile={},who='itai',bust=false,className='',label=''}){
 const look=heroLook(profile),hat=HERO_BY_ID[look.hat],hand=HERO_BY_ID[look.hand],badge=HERO_BY_ID[look.badge];
 const character=profile.character||(who==='noa'?'noa':'itai'),kid=['itai','noa','maya','ari','lia','tom','dana','yoni'].includes(character),equipped=kid&&!!(hand||hat),suffix=bust?'-bust':'',art=item=>'/assets/generated/hero-home/equipment-v2/'+character+'-'+item+suffix+'.png';
 return <span className={'hero-character '+(bust?'hero-character-bust ':'')+(equipped?'is-equipped-art ':'')+className} data-held-item={kid?hand?.id:undefined} data-head-item={kid?hat?.id:undefined} data-character={character} role={label?'img':undefined} aria-label={label||undefined}>
  <span className="hero-character-canvas">
   {equipped&&look.outfit==='cape'&&!bust&&<img className="hero-character-cape" src="/assets/generated/hero-home/equipment-v2/cape-back.png" alt="" draggable="false"/>}
   <img className="hero-character-base" src={equipped?art(hand?.id||hat.id):'/assets/generated/'+heroCharacterFile(profile,who,bust)} alt="" draggable="false"/>
   {equipped&&hand&&hat&&<img className="hero-wearable-head-composite" src={art(hat.id)} alt="" draggable="false"/>}
   {kid&&badge&&<img className="hero-wearable hero-wearable-badge" src={badge.image} alt="" draggable="false"/>}
  </span>
 </span>;
}
export function HeroPortrait({profile,who,size,label}){return <span className="avatar pixel-avatar hero-portrait" style={{'--avatar-size':size+'px'}}><PixelCharacter profile={profile} who={who} bust label={label}/></span>}
