// Virtual produce and stars. All dates, yields and prices are decided by the household server.
import {GARDEN_ORCHARD_CROPS,GARDEN_ORCHARD_START,GARDEN_ORCHARD_MAX} from './hero-orchard.mjs';
export {GARDEN_ORCHARD_CROPS} from './hero-orchard.mjs';
export const GARDEN_DAY=86400000,GARDEN_WATER_INTERVAL=12*3600000,GARDEN_MAX_PRODUCE=200;
const crop=(id,en,he,days,seedCost,yieldCount,sell,xp,regrowDays=0,cycles=1,food='vegetables')=>({id,en,he,days,seedCost,yield:yieldCount,sell,xp,regrowDays,cycles,food,seedlingCost:seedCost+2});
export const GARDEN_CROPS=[
 crop('tomato','Cherry tomatoes','עגבניות שרי',2,4,3,1,10,2,3),
 crop('strawberry','Strawberries','תותים',2,4,3,1,10,1,3,'garden-fruit'),
 crop('carrot','Carrots','גזרים',1,2,3,1,6),crop('lettuce','Lettuce','חסה',1,2,3,1,6),
 crop('cucumber','Cucumbers','מלפפונים',2,3,3,1,9,1,3),crop('pepper','Sweet peppers','פלפלים',3,4,4,1,12,2,3),
 crop('peas','Peas','אפונה',2,3,3,1,9,1,2),crop('pumpkin','Pumpkins','דלעות',4,6,4,2,18,0,1,'dinner'),
 crop('watermelon','Watermelons','אבטיחים',4,6,4,2,18,0,1,'garden-fruit'),
 crop('basil','Basil','בזיליקום',1,2,2,1,6,1,3),crop('mint','Mint','נענע',1,2,2,1,6,1,3),
 crop('sunflower','Sunflowers','חמניות',3,4,3,2,12,0,1,null),
];
export const GARDEN_ALL_CROPS=[...GARDEN_CROPS,...GARDEN_ORCHARD_CROPS];
export const GARDEN_BY_ID=Object.freeze(Object.assign(Object.create(null),Object.fromEntries(GARDEN_ALL_CROPS.map(c=>[c.id,c]))));
export const gardenArt=(id,stage=4)=>'/assets/generated/hero-garden/'+(GARDEN_BY_ID[id]?.zone==='orchard'?'orchard/':'')+id+'-stage-'+stage+'.png';
export const GARDEN_DECOR=[
 {id:'flowers',en:'Flowers by the fence',he:'פרחים ליד הגדר',price:6,image:'/assets/icons/bayit/pixel/flowerpot-256.png'},
 {id:'lantern',en:'A little garden lantern',he:'עששית לגינה',price:8,image:'/assets/icons/bayit/pixel/lantern-256.png'},
 {id:'bird',en:'A bluebird friend',he:'חבר ציפור כחולה',price:10,image:'/assets/icons/bayit/pixel/bird-256.png'},
];
const fail=code=>{throw Object.assign(Error(code),{code})},date=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function heroGardenState(profile={}){
 const saved=profile.hero?.garden||{};
 return {plots:Array.from({length:6},()=>null),seeds:{tomato:1,strawberry:1,carrot:1,lettuce:1,basil:1,sunflower:1},seedlings:{},produce:{},xp:0,harvests:0,planted:0,waterings:0,soldStars:0,decorOwned:[],decor:null,lastResult:null,...structuredClone(saved),version:2,orchardPlots:structuredClone(saved.orchardPlots??Array.from({length:GARDEN_ORCHARD_START},()=>null)),orchardSeeds:{'apple-tree':1,'banana-plant':1,'pineapple-plant':1,...structuredClone(saved.orchardSeeds||{})},orchardSeedlings:structuredClone(saved.orchardSeedlings||{})};
}
export const gardenLevel=garden=>1+Math.floor(Math.max(0,garden.xp||0)/40);
export function gardenGrowth(plot,now=Date.now()){
 if(!plot||!GARDEN_BY_ID[plot.crop])return {stage:0,progress:0,ready:false,remaining:0,waterable:false};
 const start=date(plot.plantedAt),end=date(plot.readyAt),progress=Math.max(0,Math.min(1,(now-start)/Math.max(1,end-start))),ready=now>=end;
 return {stage:ready?4:progress>=.6?3:progress>=.25?2:1,progress,ready,remaining:Math.max(0,end-now),waterable:!ready&&(plot.waterCount||0)<3&&(!plot.wateredAt||now-date(plot.wateredAt)>=GARDEN_WATER_INTERVAL)};
}
export function applyHeroGarden(profile,command,now=Date.now(),balance=0){
 const garden=heroGardenState(profile),time=new Date(now).toISOString();let cost=0,stars=0,food=null,summary='garden:'+command.action;
 const zone=command.zone??'beds';if(!['beds','orchard'].includes(zone))fail('garden-zone');
 const plots=zone==='orchard'?garden.orchardPlots:garden.plots;
 const getCrop=()=>{const c=GARDEN_BY_ID[command.crop];if(!c)fail('garden-crop');return c};
 const plotIndex=()=>{if(!Number.isInteger(command.plot)||command.plot<0||command.plot>=plots.length)fail('garden-plot');return command.plot};
 const stockKey=c=>c.zone==='orchard'?(command.seedling===true?'orchardSeedlings':'orchardSeeds'):(command.seedling===true?'seedlings':'seeds');
 const quantity=(max=5)=>{const n=command.quantity??1;if(!Number.isInteger(n)||n<1||n>max)fail('quantity');return n};
 const spend=n=>{if(balance<n)fail('funds');cost=n};
 const water=index=>{const p=plots[index];if(!p||(GARDEN_BY_ID[p.crop]?.zone||'beds')!==zone||!gardenGrowth(p,now).waterable)return false;plots[index]={...p,wateredAt:time,waterCount:(p.waterCount||0)+1};garden.waterings++;garden.xp++;return true};
 let details={};
 if(command.action==='buy-seeds'){
  const c=getCrop(),n=quantity(),key=stockKey(c);
  if(command.seedling!==undefined&&typeof command.seedling!=='boolean')fail('quantity');
  if((garden[key][c.id]||0)+n>99)fail('garden-seed-full');spend((command.seedling===true?c.seedlingCost:c.seedCost)*n);garden[key][c.id]=(garden[key][c.id]||0)+n;details={crop:c.id,quantity:n,seedling:command.seedling===true};
 }else if(command.action==='plant'){
  const c=getCrop(),index=plotIndex(),key=stockKey(c);if((c.zone||'beds')!==zone)fail('garden-zone');if(plots[index])fail('garden-occupied');if(!(garden[key][c.id]>0))fail('garden-no-seed');
  if(command.seedling!==undefined&&typeof command.seedling!=='boolean')fail('quantity');
  const duration=c.days*GARDEN_DAY,advance=command.seedling===true?.35:0;garden[key][c.id]--;
  plots[index]={id:command.id,crop:c.id,plantedAt:new Date(now-duration*advance).toISOString(),readyAt:new Date(now+duration*(1-advance)).toISOString(),wateredAt:null,waterCount:0,cycle:0};garden.planted++;details={plot:index,crop:c.id};
 }else if(command.action==='water'){
  const index=plotIndex();if(!water(index))fail('garden-watered');details={plot:index};
 }else if(command.action==='water-all'){
  const watered=plots.flatMap((_,i)=>water(i)?[i]:[]);if(!watered.length)fail('garden-watered');details={plots:watered};
 }else if(command.action==='harvest'){
  const index=plotIndex(),p=plots[index];if(!p)fail('garden-empty');if((GARDEN_BY_ID[p.crop]?.zone||'beds')!==zone)fail('garden-zone');if(!gardenGrowth(p,now).ready)fail('garden-growing');const c=GARDEN_BY_ID[p.crop],n=c.yield+((p.waterCount||0)>0?1:0);
  if((garden.produce[c.id]||0)+n>GARDEN_MAX_PRODUCE)fail('garden-basket-full');garden.produce[c.id]=(garden.produce[c.id]||0)+n;garden.xp+=c.xp;garden.harvests++;
  if((p.cycle||0)+1<c.cycles){const duration=c.regrowDays*GARDEN_DAY/.65;plots[index]={id:command.id,crop:c.id,plantedAt:new Date(now-duration*.35).toISOString(),readyAt:new Date(now+c.regrowDays*GARDEN_DAY).toISOString(),wateredAt:null,waterCount:0,cycle:(p.cycle||0)+1}}
  else plots[index]=null;details={plot:index,crop:c.id,quantity:n,xp:c.xp,regrowing:!!plots[index]};
 }else if(command.action==='sell'){
  const c=getCrop(),n=quantity(GARDEN_MAX_PRODUCE);if((garden.produce[c.id]||0)<n)fail('garden-no-produce');garden.produce[c.id]-=n;stars=c.sell*n;garden.soldStars+=stars;details={crop:c.id,quantity:n,stars};
 }else if(command.action==='fridge'){
  const c=getCrop();if(!c.food)fail('garden-not-food');if((garden.produce[c.id]||0)<2)fail('garden-no-produce');if((profile.hero?.pantry?.[c.food]||0)>=30)fail('pantry-full');garden.produce[c.id]-=2;food=c.food;details={crop:c.id,quantity:2,food};
 }else if(command.action==='buy-decor'){
  const item=GARDEN_DECOR.find(i=>i.id===command.item);if(!item)fail('unknown-item');if(garden.decorOwned.includes(item.id))fail('owned');spend(item.price);garden.decorOwned.push(item.id);garden.decor=item.id;details={item:item.id};
 }else if(command.action==='decor'){
  if(command.item!==null&&!garden.decorOwned.includes(command.item))fail('not-owned');garden.decor=command.item;details={item:command.item};
 }else if(command.action==='expand'){
  const max=zone==='orchard'?GARDEN_ORCHARD_MAX:12,required=zone==='orchard'?3:plots.length===6?2:4,price=zone==='orchard'?24:plots.length===6?20:30;
  if(plots.length>=max)fail('garden-full');if(gardenLevel(garden)<required)fail('garden-level');spend(price);plots.push(null,null,null);details={plots:plots.length};
 }else fail('action');
 garden.lastResult={id:command.id,action:command.action,zone,at:time,...details};return {garden,cost,stars,food,summary};
}
