import {HOME_TIMEZONE} from './home-config.mjs';

export const HERO_GAME_STARS=2;
export const HERO_GAME_REWARDS=Object.freeze({puzzle:{xp:40,coins:8},rhythm:{xp:20,coins:4},shopping:{xp:15,coins:3},market:{xp:10,coins:2}});
export const heroGameReward=kind=>HERO_GAME_REWARDS[kind]||{xp:0,coins:0};
export const HERO_GAME_MAX_AGE=24*60*60*1000;
export const HERO_PUZZLE_ART=[
 ['room','My cozy room','החדר הנעים שלי','/assets/generated/hero-home/room.png'],
 ['garden','Garden adventure','הרפתקה בגינה','/assets/generated/hero-puzzles/garden.png'],
 ['moon','Moonlight garden','גינה לאור ירח','/assets/generated/hero-puzzles/moon.png'],
 ...[['forest','Woodland picnic','פיקניק ביער'],['beach','Sandcastle beach','ארמון בחוף'],['space','Space explorers','חוקרים בחלל'],['bakery','The little bakery','המאפייה הקטנה'],['aquarium','Under the sea','מתחת לים'],['farm','A day at the farm','יום בחווה'],['library','The cozy library','הספרייה הנעימה'],['train','All aboard!','עולים לרכבת'],['snow','Snowy adventures','הרפתקאות בשלג']].map(([id,en,he])=>[id,en,he,'/assets/generated/hero-puzzles/'+id+'.png']),
];
export const heroPuzzleThumbnail=id=>'/assets/generated/hero-puzzles/thumbs/'+id+'.png';
export const HERO_MARKET_ITEMS=[
 ['tomatoes','Tomatoes','עגבניות',2],['apple','Apples','תפוחים',2],['banana','Bananas','בננות',2],['carrot','Carrots','גזרים',2],
 ['milk-carton','Milk','חלב',3],['bread','Bread','לחם',3],['eggs','Eggs','ביצים',4],['cheese','Cheese','גבינה',4],['yogurt','Yogurt','יוגורט',2],
 ['rice','Rice','אורז',3],['pasta','Pasta','פסטה',3],['cucumber','Cucumbers','מלפפונים',2],['lettuce','Lettuce','חסה',2],
 ['pepper','Peppers','פלפלים',2],['onion','Onions','בצלים',2],['potato','Potatoes','תפוחי אדמה',3],['broccoli','Broccoli','ברוקולי',3],
 ['lemon','Lemons','לימונים',2],['orange','Oranges','תפוזים',2],['pear','Pears','אגסים',2],['peach','Peaches','אפרסקים',2],
 ['grapes','Grapes','ענבים',3],['strawberries','Strawberries','תותים',4],['watermelon','Watermelon','אבטיח',4],['avocado','Avocado','אבוקדו',3],
 ['mushrooms','Mushrooms','פטריות',3],['olive-oil','Olive oil','שמן זית',5],['honey','Honey','דבש',4],['cereal','Cereal','דגני בוקר',4],
 ['oats','Oats','שיבולת שועל',3],['flour','Flour','קמח',3],['sugar','Sugar','סוכר',3],['salt','Salt','מלח',1],['tea','Tea','תה',3],
 ['chocolate','Chocolate','שוקולד',3],['orange-juice','Orange juice','מיץ תפוזים',3],['pita','Pita bread','פיתות',3],
 ['chickpeas','Chickpeas','גרגרי חומוס',3],['lentils','Lentils','עדשים',3],['beans','Beans','שעועית',3],['water','Water','מים',1],
].map(([id,en,he,price])=>({id,en,he,price,image:'/assets/icons/bayit/groceries/'+id+'-128.png'}));
export const HERO_MARKET_BY_ID=Object.freeze(Object.assign(Object.create(null),Object.fromEntries(HERO_MARKET_ITEMS.map(i=>[i.id,i]))));
export const HERO_RHYTHM_PADS=[
 ['wash','Bubbles','בועות','shower-badge',262],['eat','Breakfast','ארוחת בוקר','dinner-plate',330],
 ['tidy','Toys away','אוספים צעצועים','toy-chest',392],['rest','Sweet dreams','חלומות נעימים','moon-badge',523],
];
const recipes=[
 {id:'breakfast',en:'Breakfast together',he:'ארוחת בוקר יחד',items:['bread','milk-carton','apple'],food:'bread'},
 {id:'picnic',en:'A little picnic',he:'פיקניק קטן',items:['pita','cucumber','cheese'],food:'vegetables'},
 {id:'dinner',en:'Dinner at home',he:'ארוחת ערב בבית',items:['rice','carrot','broccoli'],food:'rice'},
 {id:'fruit',en:'A colorful fruit bowl',he:'קערת פירות צבעונית',items:['apple','banana','orange'],food:'apple'},
];
export const heroGameDay=now=>new Date(now).toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE});
export const heroGameGroup=kind=>['shopping','market'].includes(kind)?'market':kind;
export const heroGameRewardKey=(kind,now)=>heroGameDay(now)+':'+heroGameGroup(kind);
function random(seed){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function shuffle(items,rng){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
export function makeHeroGame(kind,{art='room',now=Date.now(),entropy=crypto.randomUUID(),lastBudget=0}={}){
 if(!['puzzle','shopping','market','rhythm'].includes(kind)||kind==='puzzle'&&!HERO_PUZZLE_ART.some(a=>a[0]===art))throw Object.assign(Error('game'),{code:'game'});
 const rng=random(entropy),base={id:entropy,kind,startedAt:new Date(now).toISOString(),progress:[]};
 if(kind==='puzzle'){let pieces=shuffle(Array.from({length:16},(_,i)=>i),rng);if(pieces.every((v,i)=>v===i))pieces.reverse();return {...base,art,pieces}}
 if(kind==='rhythm'){const pattern=[];for(let i=0;i<5;i++){let pad=Math.floor(rng()*4);if(pad===pattern[i-1])pad=(pad+1+Math.floor(rng()*3))%4;pattern.push(pad)}return {...base,rounds:[1,2,3,4,5].map(n=>pattern.slice(0,n))}};
 if(kind==='shopping'){
  const items=shuffle(HERO_MARKET_ITEMS.map(i=>i.id),rng).slice(0,12);let solution=[],budget=0;
  for(let attempt=0;attempt<100;attempt++){solution=shuffle(items,rng).slice(0,3+Math.floor(rng()*3));budget=solution.reduce((n,id)=>n+HERO_MARKET_BY_ID[id].price,0);if(budget>=7&&budget<=18&&budget!==lastBudget)break}
  if(budget===lastBudget){const first=items.find(id=>!solution.includes(id));solution=solution.length<5?[...solution,first]:solution.slice(0,4);budget=solution.reduce((n,id)=>n+HERO_MARKET_BY_ID[id].price,0)}
  return {...base,goal:'budget',items,title:['Right on budget!','בול בתקציב!'],required:solution.map(id=>({id,quantity:1})),budget,maxItems:5,food:'vegetables'};
 }
 const recipe=recipes[Math.floor(rng()*recipes.length)],required=recipe.items.map(id=>({id,quantity:1}));
 const other=shuffle(HERO_MARKET_ITEMS.filter(i=>!recipe.items.includes(i.id)).map(i=>i.id),rng);
 // Supermarket detectives: 20 products, five on each of the four painted shelves (audit 08 removed the floating top row).
 const count=kind==='market'?20:24,items=shuffle([...recipe.items,...other.slice(0,count-recipe.items.length)],rng),targets=shuffle(Array.from({length:count},(_,i)=>i),rng).slice(0,5);
 return {...base,items,...(kind==='market'?{targets,food:'apple'}:{recipe:recipe.id,title:[recipe.en,recipe.he],required,budget:required.reduce((n,i)=>n+HERO_MARKET_BY_ID[i.id].price*i.quantity,0)+2,food:recipe.food})};
}
export function heroGameTotal(game){return game?.kind==='puzzle'?16:game?.kind==='market'?5:game?.kind==='rhythm'?game.rounds?.reduce((n,r)=>n+r.length,0)||0:game?.kind==='shopping'?game.goal==='budget'?game.maxItems:game.required?.reduce((n,r)=>n+r.quantity,0)||0:0}
export const heroShoppingSpent=trace=>trace.reduce((n,id)=>n+(HERO_MARKET_BY_ID[id]?.price||0),0);
export function heroBudgetRemainder(game,trace=[]){
 if(game?.goal!=='budget')return null;const available=game.items.filter(id=>!trace.includes(id)),left=game.budget-heroShoppingSpent(trace),slots=game.maxItems-trace.length;
 const find=(from,amount,room)=>{if(amount===0)return [];if(amount<0||room<=0)return null;for(let i=from;i<available.length;i++){const tail=find(i+1,amount-HERO_MARKET_BY_ID[available[i]].price,room-1);if(tail)return [available[i],...tail]}return null};return find(0,left,slots);
}
export function heroGameSolution(game){
 if(game?.kind==='puzzle')return game.pieces.map((target,piece)=>({piece,target}));
 if(game?.kind==='market')return [...game.targets];
 if(game?.kind==='rhythm')return game.rounds.flat();
 if(game?.kind==='shopping')return game.required.flatMap(i=>Array(i.quantity).fill(i.id));
 return [];
}
export function validHeroGameProgress(game,trace,{complete=false}={}){
 if(!game||!Array.isArray(trace)||trace.length>heroGameTotal(game))return false;
 if(complete&&!(game.kind==='shopping'&&game.goal==='budget')&&trace.length!==heroGameTotal(game))return false;
 if(game.kind==='market')return trace.every((slot,i)=>Number.isInteger(slot)&&slot===game.targets[i]);
 if(game.kind==='rhythm'){const solution=game.rounds.flat();return trace.every((pad,i)=>Number.isInteger(pad)&&pad===solution[i])}
 if(game.kind==='shopping'){
  if(game.goal==='budget')return trace.every(id=>typeof id==='string'&&game.items.includes(id)&&!!HERO_MARKET_BY_ID[id])&&new Set(trace).size===trace.length&&heroShoppingSpent(trace)<=game.budget&&(!complete||trace.length>0&&heroShoppingSpent(trace)===game.budget);
  if(trace.some(id=>typeof id!=='string'||!game.items.includes(id)||!game.required.some(i=>i.id===id)))return false;
  return game.required.every(item=>trace.filter(id=>id===item.id).length<=item.quantity)&&trace.reduce((n,id)=>n+HERO_MARKET_BY_ID[id].price,0)<=game.budget;
 }
 if(game.kind!=='puzzle')return false;const pieces=new Set(),targets=new Set();
 for(const move of trace){if(!Number.isInteger(move?.piece)||!Number.isInteger(move?.target)||move.piece<0||move.piece>15||move.target<0||move.target>15||pieces.has(move.piece)||targets.has(move.target)||game.pieces[move.piece]!==move.target)return false;pieces.add(move.piece);targets.add(move.target)}
 return true;
}
export function validHeroGameFinish(game,trace){return validHeroGameProgress(game,trace,{complete:true})}
