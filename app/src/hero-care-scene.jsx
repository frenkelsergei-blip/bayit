import React from 'react';
import {heroLook} from '../../shared/hero-home.mjs';
import {HERO_BY_ID} from '../../shared/hero-catalog.mjs';
const people=new Set(['itai','noa','maya','ari','lia','tom','dana','yoni']);
export function HeroCareScene({profile={},who='itai',action,label,food,T=en=>en}){
 const character=people.has(profile.character)?profile.character:who==='noa'?'noa':'itai',look=heroLook(profile),gear=['hat','hand','badge','outfit'].map(slot=>HERO_BY_ID[look[slot]]).filter(Boolean),meal=['milk','apple','bread'].includes(food)?'meal-yogurt':food==='dinner'||food==='vegetables'?'meal-vegetables':'meal-rice';
 return <div className={'hero-care-scene-position hero-care-scene-'+action} data-character={character} data-care-action={action}>
  <span className="hero-care-scene-sprite" role="img" aria-label={label}><img className="hero-care-scene-frames" src={'/assets/generated/hero-home/care/'+character+'-'+action+'.png'} alt="" draggable="false"/></span>
  {action==='feed'&&food&&<img className="hero-scene-meal" src={'/assets/generated/hero-home/'+meal+'.png'} alt=""/>}
  {!!gear.length&&<span className="hero-care-keepsakes" aria-label={T('Your accessories are waiting beside you','האביזרים מחכים לצדכם')}>{gear.map(item=><img src={item.image} alt={T(item.en,item.he)} key={item.id}/>)}</span>}
 </div>;
}
