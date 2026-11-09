import React from 'react';
import './hero-life-sprite.css';
const kids=['itai','noa','maya','ari','lia','tom','dana','yoni'];
export function HeroLifeSprite({profile={},who='itai',row=3,label='',active=true,className=''}){
 const character=kids.includes(profile.character)?profile.character:who==='noa'?'noa':'itai';
 return <span className={'hero-life-sprite '+className+(active?' is-active':'')} role={label?'img':undefined} aria-label={label||undefined} data-character={character} data-action-row={row} style={{'--care-row':row}}><img src={'/assets/generated/hero-care-life/'+character+'-actions.png'} alt="" draggable="false"/></span>;
}
