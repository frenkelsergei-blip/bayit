import {gardenGrowth,GARDEN_BY_ID} from '../../shared/hero-garden.mjs';

// UI affordances use the same growth state as the household command handler.
export function gardenTarget({plot,zone,tool,crop,hasSeed,now}){
 const growth=gardenGrowth(plot,now);
 const plantable=!plot&&hasSeed&&zone===(GARDEN_BY_ID[crop]?.zone||'beds');
 const actionable=tool==='water'?growth.waterable:tool==='harvest'?growth.ready:plantable;
 return {growth,plantable,actionable,inspectable:tool==='seeds'&&!!plot};
}
