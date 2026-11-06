import React from 'react';
import {HERO_BY_ID} from '../../shared/hero-catalog.mjs';
import {heroCharacterFile,heroLook} from '../../shared/hero-home.mjs';

export function PixelCharacter({profile={},who='itai',bust=false,className='',label=''}){
 const look=heroLook(profile),hat=HERO_BY_ID[look.hat],hand=HERO_BY_ID[look.hand],badge=HERO_BY_ID[look.badge];
 const overlayHat=hat&&(hat.id!=='cap'||look.outfit==='cape');
 return <span className={'hero-character '+(bust?'hero-character-bust ':'')+className} role={label?'img':undefined} aria-label={label||undefined}>
  <img className="hero-character-base" src={'/assets/generated/'+heroCharacterFile(profile,who,bust)} alt="" draggable="false"/>
  {overlayHat&&<img className={'hero-wearable hero-wearable-hat hero-hat-'+hat.id} src={hat.image} alt="" draggable="false"/>}
  {hand&&<img className="hero-wearable hero-wearable-hand" src={hand.image} alt="" draggable="false"/>}
  {badge&&<img className="hero-wearable hero-wearable-badge" src={badge.image} alt="" draggable="false"/>}
 </span>;
}
export function HeroPortrait({profile,who,size,label}){return <span className="avatar pixel-avatar hero-portrait" style={{width:size,height:size}}><PixelCharacter profile={profile} who={who} bust label={label}/></span>}
