import {HERO_BY_ID,HERO_SLOTS,HERO_STARTER_STARS,HERO_XP_PER_STAR} from './hero-catalog.mjs';
import {makeHeroGame,validHeroGameProgress,validHeroGameFinish,heroGameRewardKey,heroGameReward,HERO_PUZZLE_ART,HERO_GAME_MAX_AGE} from './hero-games.mjs';
import {applyHeroGarden,heroGardenState} from './hero-garden.mjs';
import {validateHeroRoom} from './hero-room-layout.mjs';
import {heroGameDay} from './hero-games.mjs';
export const HERO_REST_MS=5*60*1000;
const clamp=n=>Math.max(0,Math.min(100,n));
// A need counts as full only when its meter shows 100%. The Care buttons, their reasons and the
// household server all use this one rule, so a meter below 100% never says "already full".
export const heroNeedFull=value=>Math.round(Number(value)||0)>=100;
const fail=code=>{throw Object.assign(Error(code),{code})};
const ms=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
const level=profile=>1+Math.floor(Math.max(0,Number(profile.xp)||0)/100);
export function heroState(profile={},now=Date.now()){
 const saved=profile.hero||{},care=saved.care||{},old=profile.equipped;
 return {version:1,revision:0,spent:0,gameStars:0,bonusStars:0,gameRewards:{},gameStats:{},savedGames:{},activeGame:null,lastGameResult:null,owned:['cap','cape'].includes(old)?[old]:[],loadout:{...(old==='cap'?{hat:'cap'}:old==='cape'?{outfit:'cape'}:{}),motion:'bounce'},pantry:{apple:2,bread:1,milk:1},counts:{},receipts:[],commands:[],...saved,care:{food:75,clean:80,energy:75,joy:80,tidy:65,updatedAt:new Date(now).toISOString(),sleepingAt:null,...care}};
}
export function heroOwned(profile={},item){return item&&item.category!=='food'&&(heroState(profile).owned.includes(item.id)||item.price===0&&level(profile)>=item.level)}
export function heroBalance(profile={}){const h=heroState(profile),routineXp=Math.max(0,(Number(profile.xp)||0)-(Number(h.gameXp)||0));return Math.max(0,HERO_STARTER_STARS+Math.floor(routineXp/HERO_XP_PER_STAR)+Math.max(0,Number(h.gameStars)||0)+Math.max(0,Number(h.bonusStars)||0)-(h.spent||0))}
export function heroCare(profile={},now=Date.now()){
 const care={...heroState(profile,now).care},elapsed=Math.max(0,now-ms(care.updatedAt)),hours=Math.min(8,elapsed/3600000);
 // Absence never harms the character. Needs stop at a gentle floor, and do not accumulate debt.
 for(const [key,rate]of [['food',3],['clean',2],['energy',2],['joy',1]])care[key]=Math.min(care[key],Math.max(35,care[key]-hours*rate));
 if(care.sleepingAt){const start=ms(care.sleepingAt),end=ms(care.sleepEndsAt)||start+HERO_REST_MS,initial=Number.isFinite(care.sleepStartEnergy)?care.sleepStartEnergy:heroState(profile,now).care.energy;care.energy=clamp(initial+(100-initial)*Math.max(0,Math.min(1,(now-start)/Math.max(1,end-start))));care.sleepRemaining=Math.max(0,end-now);if(now>=end||care.energy>=100){care.energy=100;care.sleepingAt=null;care.sleepEndsAt=null;
  // After an automatic wake, energy rests at 100 and then follows the same gentle hourly rate from the wake time.
  if(now>end)care.energy=Math.max(35,100-Math.min(8,(now-end)/3600000)*2)}}
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
 const care=heroCare(next,now),counts={...state.counts},time=new Date(now).toISOString();let summary=command.kind,extraReceipt={};
 if(command.kind==='garden'){
  if(care.sleepingAt)fail('sleeping');next.hero=state;const result=applyHeroGarden(next,command,now,heroBalance(next));state.garden=result.garden;state.spent+=result.cost;state.gameStars+=result.stars;if(result.food)state.pantry={...state.pantry,[result.food]:(state.pantry[result.food]||0)+1};summary=result.summary;extraReceipt={...(result.cost?{cost:result.cost}:{}),...(result.stars?{stars:result.stars}:{})};
 }else if(command.kind==='buy'){
  const item=HERO_BY_ID[command.item];if(!item)fail('unknown-item');if(level(next)<item.level)fail('level');
  const quantity=command.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>5||item.category!=='food'&&quantity!==1)fail('quantity');
  if(item.category!=='food'&&heroOwned(next,item))fail('owned');if(heroBalance(next)<item.price*quantity)fail('funds');
  if(item.category==='food'){if((state.pantry[item.id]||0)+quantity>30)fail('pantry-full');state.pantry={...state.pantry,[item.id]:(state.pantry[item.id]||0)+quantity}}
  else{state.owned=[...state.owned,item.id];if(item.category!=='room')state.loadout={...state.loadout,[item.slot]:item.id}}
  state.spent+=item.price*quantity;summary='buy:'+item.id;counts.buys=(counts.buys||0)+1;
 }else if(command.kind==='room-layout'){
  next.hero=state;try{state.roomDisplay=validateHeroRoom(command.placements,next)}catch{fail('room-layout')}summary='room:arrange';
 }else if(command.kind==='equip'){
  if(!HERO_SLOTS.includes(command.slot))fail('slot');const item=HERO_BY_ID[command.item];
  if(command.item&&(!item||item.slot!==command.slot||!heroOwned(next,item)))fail('not-owned');
  state.loadout={...state.loadout,[command.slot]:command.item||null};if(item&&!state.owned.includes(item.id))state.owned=[...state.owned,item.id];summary='equip:'+(command.item||command.slot);
 }else if(command.kind==='start-game'){
  if(care.sleepingAt)fail('sleeping');
  if(!['puzzle','shopping','market','rhythm'].includes(command.game)||command.restart!==undefined&&typeof command.restart!=='boolean')fail('game');
  const saved={...state.savedGames};
  if(state.activeGame)saved[state.activeGame.kind]=state.activeGame;
  const previous=saved[command.game],fresh=previous&&now>=ms(previous.startedAt)&&now-ms(previous.startedAt)<=HERO_GAME_MAX_AGE&&validHeroGameProgress(previous,previous.progress||[]);
  const nextArt=HERO_PUZZLE_ART.find(([id])=>!(state.puzzleCompleted||[]).includes(id))?.[0]||'room';
  state.activeGame=command.restart!==true&&fresh?previous:makeHeroGame(command.game,{art:command.art||nextArt,now,entropy:command.id,lastBudget:state.lastShoppingBudget||0});
  delete saved[command.game];state.savedGames=saved;
  if(command.game==='shopping')state.lastShoppingBudget=state.activeGame.budget;summary='game:'+command.game+':'+(state.activeGame===previous?'resume':'start');
 }else if(['game-progress','finish-game','cancel-game'].includes(command.kind)){
  const game=state.activeGame;if(!game||command.session!==game.id)fail('game-changed');
  if(command.kind==='cancel-game'){state.activeGame=null;summary='game:leave'}
  else{
   if(care.sleepingAt)fail('sleeping');if(now-ms(game.startedAt)>HERO_GAME_MAX_AGE||now<ms(game.startedAt))fail('game-expired');
   if(!validHeroGameProgress(game,command.trace))fail('game-proof');
   if(command.kind==='game-progress'){state.activeGame={...game,progress:structuredClone(command.trace)};summary='game:'+game.kind+':progress'}
   else{
    if(!validHeroGameFinish(game,command.trace))fail('game-proof');
    const key=heroGameRewardKey(game.kind,now),prize=heroGameReward(game.kind),stars=prize.coins,xp=prize.xp;
    // Game XP advances the same level; its coins are awarded explicitly once,
    // so it is excluded from the separate routine-XP-to-coins calculation.
    next.xp=Math.max(0,Number(next.xp)||0)+xp;state.gameXp=(Number(state.gameXp)||0)+xp;
    let food=null;if(stars){
     state.gameStars+=stars;state.gameRewards={...state.gameRewards,[key]:time};
     const cutoff=new Date(now-7*86400000).toISOString().slice(0,10);state.gameRewards=Object.fromEntries(Object.entries(state.gameRewards).filter(([k])=>k.slice(0,10)>=cutoff));
     if(['shopping','market'].includes(game.kind)&&HERO_BY_ID[game.food]?.category==='food'&&(state.pantry[game.food]||0)<30){food=game.food;state.pantry={...state.pantry,[food]:(state.pantry[food]||0)+1}}
    }
    state.gameStats={...state.gameStats,[game.kind]:(state.gameStats[game.kind]||0)+1};
    if(game.kind==='puzzle')state.puzzleCompleted=[...new Set([...(state.puzzleCompleted||[]),game.art])];
    state.lastGameResult={session:game.id,kind:game.kind,stars,xp,food,at:time,...(game.kind==='puzzle'?{art:game.art}:{}),...(game.kind==='shopping'&&game.goal==='budget'?{budget:game.budget,spent:game.budget}:{})};state.activeGame=null;counts.games=(counts.games||0)+1;
    extraReceipt={session:game.id,xp,stars,...(game.kind==='puzzle'?{art:game.art}:{})};
    care.joy=clamp(care.joy+6);summary='game:'+game.kind+':complete';
   }
  }
 }else if(command.kind==='care'){
  const action=command.action;if(!['feed','wash','tidy','play','sleep','wake'].includes(action))fail('action');
  if(care.sleepingAt&&action!=='wake')fail('sleeping');if(!care.sleepingAt&&action==='wake')fail('awake');
  if(action!=='wake'&&now-ms(state.lastActionAt)<1800)fail('slow-down');
  if(action==='feed'){
   const food=HERO_BY_ID[command.food];if(food?.category!=='food'||!(state.pantry[food.id]>0))fail('no-food');if(heroNeedFull(care.food))fail('full');
   state.pantry={...state.pantry,[food.id]:state.pantry[food.id]-1};care.food=clamp(care.food+food.nutrition);care.joy=clamp(care.joy+5);
  }else if(action==='wash'){if(heroNeedFull(care.clean))fail('clean');care.clean=clamp(care.clean+45);care.joy=clamp(care.joy+6)}
  else if(action==='tidy'){if(heroNeedFull(care.tidy))fail('tidy');care.tidy=clamp(care.tidy+45);care.joy=clamp(care.joy+10);care.energy=clamp(care.energy-3)}
  else if(action==='play'){if(care.energy<20)fail('tired');care.joy=clamp(care.joy+25);care.energy=clamp(care.energy-7);care.food=clamp(care.food-4)}
  else if(action==='sleep'){if(heroNeedFull(care.energy))fail('rested');care.sleepingAt=time;care.sleepEndsAt=new Date(now+HERO_REST_MS).toISOString();care.sleepStartEnergy=care.energy}
  else{care.sleepingAt=null;care.sleepEndsAt=null}
  counts[action]=(counts[action]||0)+1;state.lastActionAt=time;summary=action;
 }else fail('action');
 if(command.kind==='finish-game'||command.kind==='care'&&command.action==='play'){const day=heroGameDay(now);if(state.messDay!==day){care.tidy=Math.min(care.tidy,55);state.messDay=day}}
 state.care={...care,updatedAt:time};state.counts=counts;state.revision++;state.commands=[...state.commands,command.id].slice(-100);
 state.receipts=[{id:command.id,kind:summary,at:time,...extraReceipt,...(command.kind==='buy'?{cost:HERO_BY_ID[command.item].price*(command.quantity||1)}:{})},...state.receipts].slice(0,40);
 next.hero=state;next.equipped=state.loadout.outfit==='cape'?'cape':state.loadout.hat==='cap'?'cap':'';return next;
}
export function publicHero(profile){return {version:1,loadout:heroLook(profile)}}
export const HERO_ERROR_COPY={
 rested:['Full of energy already. Ready to play!','כבר מלאים באנרגיה. אפשר לשחק!'],
 'room-layout':['Choose an owned room item for its matching place. Your collection is safe.','בוחרים פריט חדר שבבעלותכם למקום המתאים. האוסף שלכם נשמר.'],
 'garden-zone':['Choose an orchard spot for fruit trees, or a garden bed for vegetables.','עצים וצמחי פרי שותלים במטע, וירקות בערוגות.'],
 'garden-crop':['Choose one of our garden crops.','בחרו אחד מהגידולים בגינה.'],'garden-plot':['Choose a plot in your garden.','בחרו ערוגה בגינה.'],
 'garden-occupied':['Something is already growing here.','כבר צומח כאן משהו.'],'garden-no-seed':['Pick up seeds or a seedling from the garden shop.','אפשר להשיג זרעים או שתיל בחנות הגינה.'],
 'garden-watered':['The plants have enough water for now.','לצמחים יש כרגע מספיק מים.'],'garden-empty':['Plant something here first.','קודם נשתול כאן משהו.'],'garden-growing':['Still growing. Your plant will be waiting safely.','עדיין צומח. הצמח יחכה לכם בבטחה.'],
 'garden-no-produce':['A little more produce is needed.','צריך עוד קצת תוצרת.'],'garden-basket-full':['Sell some produce or share it with your fridge first.','קודם נמכור קצת תוצרת או נעביר למקרר.'],'garden-seed-full':['There are plenty of these seeds already.','יש כבר מספיק זרעים מהסוג הזה.'],
 'garden-not-food':['These flowers can be sold at the garden stand.','את הפרחים אפשר למכור בדוכן הגינה.'],'garden-full':['All growing spots in this area are already open.','כל חלקות הגידול באזור הזה כבר פתוחות.'],'garden-level':['A few more garden harvests will unlock these plots.','עוד כמה קטיפים בגינה יפתחו את הערוגות האלה.'],
 game:['Choose one of the little adventures.','בחרו אחת מההרפתקאות הקטנות.'],'game-proof':['A few pieces are still missing. Try again.','עוד לא הכול במקום. נסו שוב.'],
 'game-changed':['This round changed on another screen. Open your saved game.','הסיבוב השתנה במסך אחר. פתחו את המשחק השמור.'],'game-expired':['Time for a fresh round. Your collected rewards are safe.','זמן לסיבוב חדש. הפרסים שכבר נאספו נשמרו.'],
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
 ['puzzle-player','Piece by piece','חלק אחרי חלק','puzzle',h.gameStats.puzzle||0,1],
 ['market-player','Little shopper','קניות קטנות','vegetable-basket',(h.gameStats.shopping||0)+(h.gameStats.market||0),1],
 ['rhythm-player','Home rhythm','קצב הבית','musical-note',h.gameStats.rhythm||0,1],
 ['first-seed','A little seed','זרע קטן','watering-can',heroGardenState(profile).planted,1],['first-harvest','My first harvest','הקטיף הראשון שלי','vegetable-basket',heroGardenState(profile).harvests,1],
 ]};
