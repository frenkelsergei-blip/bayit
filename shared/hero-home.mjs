import {HERO_BY_ID,HERO_SLOTS,HERO_STARTER_STARS,HERO_XP_PER_STAR} from './hero-catalog.mjs';
const clamp=n=>Math.max(0,Math.min(100,n));
const fail=code=>{throw Object.assign(Error(code),{code})};
const ms=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
const level=profile=>1+Math.floor(Math.max(0,Number(profile.xp)||0)/100);
export function heroState(profile={},now=Date.now()){
 const saved=profile.hero||{},care=saved.care||{},old=profile.equipped;
 return {version:1,revision:0,spent:0,owned:['cap','cape'].includes(old)?[old]:[],loadout:{...(old==='cap'?{hat:'cap'}:old==='cape'?{outfit:'cape'}:{}),motion:'bounce'},pantry:{apple:2,bread:1,milk:1},counts:{},receipts:[],commands:[],...saved,care:{food:75,clean:80,energy:75,joy:80,tidy:65,updatedAt:new Date(now).toISOString(),sleepingAt:null,...care}};
}
export function heroOwned(profile={},item){return item&&item.category!=='food'&&(heroState(profile).owned.includes(item.id)||item.price===0&&level(profile)>=item.level)}
export function heroBalance(profile={}){return Math.max(0,HERO_STARTER_STARS+Math.floor(Math.max(0,Number(profile.xp)||0)/HERO_XP_PER_STAR)-(heroState(profile).spent||0))}
export function heroCare(profile={},now=Date.now()){
 const care={...heroState(profile,now).care},elapsed=Math.max(0,now-ms(care.updatedAt)),hours=Math.min(8,elapsed/3600000);
 // Absence never harms the character. Needs stop at a gentle floor, and do not accumulate debt.
 for(const [key,rate]of [['food',3],['clean',2],['energy',2],['joy',1],['tidy',1]])care[key]=Math.min(care[key],Math.max(35,care[key]-hours*rate));
 if(care.sleepingAt)care.energy=clamp((heroState(profile,now).care.energy||0)+elapsed/1000*.65);
 return care;
}
export function heroMood(care){return care.sleepingAt?'sleeping':care.energy<40?'tired':care.food<45?'hungry':care.clean<45?'wash':care.tidy<40?'tidy':care.joy<50?'quiet':'happy'}
export function heroLook(profile={}){const state=heroState(profile),loadout={};for(const slot of HERO_SLOTS){const id=state.loadout?.[slot],item=HERO_BY_ID[id];if(item?.slot===slot)loadout[slot]=id}return loadout}
export function heroCharacterFile(profile={},who='itai',bust=false){
 const base=profile.character|| (who==='noa'?'noa':'itai'),look=heroLook(profile),variant=base.startsWith('adult-')?'':look.outfit==='cape'?'cape':look.hat==='cap'?'cap':'';
 return 'avatar-'+base+(variant?'-'+variant:'')+(bust?'-bust':'')+'.png';
}
// The exact same rules run in preview and on the household server. The server ignores client hero snapshots.
// Commands carry a revision and id: retries are idempotent; stale purchases cannot double-spend.
export function applyHeroCommand(profile,command,now=Date.now()){
 if(!command||typeof command.id!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(command.id))fail('invalid-command');
 const next=structuredClone(profile),state=heroState(next,now);
 if(state.commands.includes(command.id))return next;
 if(command.revision!==state.revision)fail('stale');
 const care=heroCare(next,now),counts={...state.counts},time=new Date(now).toISOString();let summary=command.kind;
 if(command.kind==='buy'){
  const item=HERO_BY_ID[command.item];if(!item)fail('unknown-item');if(level(next)<item.level)fail('level');
  const quantity=command.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>5||item.category!=='food'&&quantity!==1)fail('quantity');
  if(item.category!=='food'&&heroOwned(next,item))fail('owned');if(heroBalance(next)<item.price*quantity)fail('funds');
  if(item.category==='food'){if((state.pantry[item.id]||0)+quantity>30)fail('pantry-full');state.pantry={...state.pantry,[item.id]:(state.pantry[item.id]||0)+quantity}}
  else{state.owned=[...state.owned,item.id];state.loadout={...state.loadout,[item.slot]:item.id}}
  state.spent+=item.price*quantity;summary='buy:'+item.id;counts.buys=(counts.buys||0)+1;
 }else if(command.kind==='equip'){
  if(!HERO_SLOTS.includes(command.slot))fail('slot');const item=HERO_BY_ID[command.item];
  if(command.item&&(!item||item.slot!==command.slot||!heroOwned(next,item)))fail('not-owned');
  state.loadout={...state.loadout,[command.slot]:command.item||null};if(item&&!state.owned.includes(item.id))state.owned=[...state.owned,item.id];summary='equip:'+(command.item||command.slot);
 }else if(command.kind==='care'){
  const action=command.action;if(!['feed','wash','tidy','play','sleep','wake'].includes(action))fail('action');
  if(care.sleepingAt&&action!=='wake')fail('sleeping');if(!care.sleepingAt&&action==='wake')fail('awake');
  if(action!=='wake'&&now-ms(state.lastActionAt)<1800)fail('slow-down');
  if(action==='feed'){
   const food=HERO_BY_ID[command.food];if(food?.category!=='food'||!(state.pantry[food.id]>0))fail('no-food');if(care.food>=98)fail('full');
   state.pantry={...state.pantry,[food.id]:state.pantry[food.id]-1};care.food=clamp(care.food+food.nutrition);care.joy=clamp(care.joy+5);
  }else if(action==='wash'){if(care.clean>=98)fail('clean');care.clean=clamp(care.clean+45);care.joy=clamp(care.joy+6)}
  else if(action==='tidy'){if(care.tidy>=98)fail('tidy');care.tidy=clamp(care.tidy+45);care.joy=clamp(care.joy+10);care.energy=clamp(care.energy-3)}
  else if(action==='play'){if(care.energy<20)fail('tired');care.joy=clamp(care.joy+25);care.energy=clamp(care.energy-7);care.food=clamp(care.food-4)}
  else if(action==='sleep')care.sleepingAt=time;
  else care.sleepingAt=null;
  counts[action]=(counts[action]||0)+1;state.lastActionAt=time;summary=action;
 }else fail('action');
 state.care={...care,updatedAt:time};state.counts=counts;state.revision++;state.commands=[...state.commands,command.id].slice(-100);
 state.receipts=[{id:command.id,kind:summary,at:time,...(command.kind==='buy'?{cost:HERO_BY_ID[command.item].price*(command.quantity||1)}:{})},...state.receipts].slice(0,40);
 next.hero=state;next.equipped=state.loadout.outfit==='cape'?'cape':state.loadout.hat==='cap'?'cap':'';return next;
}
export function publicHero(profile){return {version:1,loadout:heroLook(profile)}}
export const HERO_ERROR_COPY={
 'invalid-command':['Please try again.','נסו שוב.'],stale:['Your hero changed on another screen. Try again.','הדמות השתנתה במסך אחר. נסו שוב.'],
 level:['A few more quests will unlock this level.','עוד כמה משימות יפתחו את הרמה הזאת.'],funds:['Earn more stars by completing real routines.','אפשר לצבור עוד כוכבים מהשלמת משימות אמיתיות.'],
 owned:['This is already in your collection.','הפריט כבר באוסף שלכם.'],'not-owned':['Add this to your collection first.','קודם צריך להשיג את הפריט.'],
 'pantry-full':['There is enough of this in the fridge.','יש כבר מספיק מזה במקרר.'],'no-food':['Pick something from the fridge first.','בחרו קודם משהו מהמקרר.'],
 sleeping:['Let’s wake up first.','קודם נתעורר.'],awake:['Already awake!','כבר ערים!'],'slow-down':['One little thing at a time.','דבר קטן אחד בכל פעם.'],
 full:['Full for now. Save this for later.','כרגע שבעים. נשמור את זה לאחר כך.'],clean:['Already nice and clean.','כבר נקיים ורעננים.'],tidy:['The room is already tidy.','החדר כבר מסודר.'],tired:['A little rest will help.','מנוחה קצרה תעזור.'],
};
export const heroAchievements=profile=>{const h=heroState(profile),c=h.counts;return [
 ['first-meal','First meal','ארוחה ראשונה','dinner-plate',(c.feed||0),1],['fresh','Fresh and clean','נקיים ורעננים','shower-badge',c.wash||0,1],
 ['tidy-room','A cozy room','חדר נעים','toy-chest',c.tidy||0,1],['rest','Sweet dreams','חלומות נעימים','moon-badge',c.sleep||0,1],
 ['friend','A new friend','חבר חדש','dog',h.owned.some(id=>HERO_BY_ID[id]?.category==='pets')?1:0,1],
 ['collector','Little collector','אספנות קטנה','gift-box',h.owned.length,5],['care','Helping hands','ידיים עוזרות','helping-hand-badge',(c.feed||0)+(c.wash||0)+(c.tidy||0),10],
 ['explorer','Level five explorer','הרפתקנים ברמה חמש','gold-medal',level(profile),5],
 ]};
