import React,{useEffect,useRef,useState,lazy,Suspense} from 'react';
import {ShoppingCart,Check,LockSimple,Eye,X,Plus,Minus,TShirt as Shirt,Hamburger,Medal,Sparkle,ArrowRight,ArrowsClockwise,UsersThree,GameController,Plant} from '@phosphor-icons/react';
import {HERO_ITEMS,HERO_BY_ID,HERO_SLOTS,HERO_STARTER_STARS,HERO_XP_PER_STAR} from '../../shared/hero-catalog.mjs';
import {heroState,heroBalance,heroOwned,heroCare,heroMood,heroLook,applyHeroCommand,HERO_ERROR_COPY,heroAchievements,heroNeedFull} from '../../shared/hero-home.mjs';
import {KID_CHARACTERS} from './member-details';
import {PixelCharacter} from './hero-character';
import {HeroCareScene} from './hero-care-scene';
import './hero-games-entry.css';
import './hero-core-polish.css';
import './hero-care-refinement.css';
import './hero-room-garden-polish.css';
import './hero-audit-08.css';
import {HeroShopControls} from './hero-shop-controls';
import {HeroItemDialog} from './hero-item-dialog';
import {HeroPlaces,HeroCareHome,HeroFoodStore} from './hero-organization';
import {HeroCollection,HeroRoomItems} from './hero-collection';
import {HeroCatalogGrid} from './hero-catalog-grid';
import {heroRoomDisplay,heroRoomSlot} from '../../shared/hero-room-layout.mjs';

const HeroGames=lazy(()=>import('./hero-games').then(module=>({default:module.HeroGames})));
const HeroGarden=lazy(()=>import('./hero-garden-world').then(module=>({default:module.HeroGardenWorld})));
const gameCommands=new Set(['start-game','game-progress','finish-game','cancel-game','garden','care','room-layout']);

const pixel=id=>'/assets/icons/bayit/pixel/'+id+'-256.png';
const moods={happy:['Happy to see you!','איזה כיף שבאתם!','smiling-sun'],hungry:['Something tasty?','משהו טעים?','apple'],tired:['A little sleepy…','קצת עייפים…','moon-badge'],wash:['Time to freshen up','זמן להתרענן','shower-badge'],tidy:['Let’s make room to play','נפנה מקום למשחק','toy-chest'],quiet:['Let’s play together','נשחק יחד','heart-badge'],sleeping:['Sweet dreams…','חלומות נעימים…','moon-badge']};
const actions=[['feed','Eat','לאכול','dinner-plate'],['wash','Shower','להתקלח','shower-badge'],['tidy','Tidy up','לסדר','toy-chest'],['play','Play','לשחק','football'],['sleep','Rest','לנוח','cozy-bed']];
const careCopy={feed:['Yum! Thank you.','יאמי! תודה.'],wash:['Fresh and ready!','נקיים ורעננים!'],tidy:['So much room to play!','עכשיו יש מקום לשחק!'],play:['That was fun!','איזה כיף היה!'],sleep:['Time for a little rest.','זמן למנוחה קטנה.'],wake:['Hello again!','בוקר טוב שוב!']};
const slotNames={hat:['Headwear','על הראש'],outfit:['Outfit','לבוש'],hand:['In my hand','ביד שלי'],badge:['Pin','סיכה'],pet:['Companion','חבר'],decor:['Room decoration','קישוט בחדר'],motion:['My move','התנועה שלי']};

export function HeroRoom({a,who,profile,care=heroCare(profile),animation,preview=false,compact=false}){
 const look=heroLook(profile),pet=HERO_BY_ID[look.pet],decor=HERO_BY_ID[look.decor],mood=heroMood(care),m=moods[mood],asleep=!!care.sleepingAt,type=animation?.type||'',scene=asleep?'sleep':['feed','wash','tidy','play','wake'].includes(type)?type:['clap','music','dance'].includes(type)?'play':null,particles=type==='heartburst'?'heart-badge':type==='music'?'musical-note':'yellow-star';
 return <div className={'hero-room'+(asleep?' is-sleeping':'')+(compact?' is-compact':'')+' mood-'+mood} data-animation={type||undefined} data-scenario={scene||undefined}>
  <div className="hero-room-camera">
  <img className="hero-room-background" src="/assets/generated/hero-home/care-room-v4/room.png" alt={a.T('A cozy room with a bed, fridge, toys and shower.','חדר נעים עם מיטה, מקרר, צעצועים ומקלחת.')} draggable="false"/>
  <span className="hero-room-shade" aria-hidden="true"/>
  <HeroRoomItems profile={profile}/>
  {pet&&<img className="hero-room-pet" src={pet.image} alt={a.T(pet.en,pet.he)} draggable="false"/>}
  <img className="hero-actor-shadow" src="/assets/generated/hero-home/equipment-v2/contact-shadow.png" alt="" draggable="false"/><div className="hero-actor-position"><div key={animation?.id||'idle'} className={'hero-actor hero-motion-'+type}><PixelCharacter profile={profile} who={who} label={a.name(who)}/></div></div>
  <HeroCareScene profile={profile} who={who} action={scene} food={animation?.food} label={a.name(who)+' · '+a.T(...(scene==='feed'?['Eating at the table','אוכלים ליד השולחן']:scene==='wash'?['Showering behind the curtain','מתקלחים מאחורי הווילון']:scene==='tidy'?['Putting toys away','מכניסים צעצועים לארגז']:scene==='play'?['Playing together','משחקים יחד']:scene==='wake'?['Waking up','מתעוררים']:['Sleeping covered in bed','ישנים מכוסים במיטה']))}/>
  {care.tidy<60&&!asleep&&<div className="hero-floor-toys" aria-hidden="true">{['football','puzzle','toy-chest'].map(id=><img key={id} src={pixel(id)} alt=""/>)}</div>}
  {type&&!scene&&<div key={'fx'+animation.id} className={'hero-room-particles hero-particles-'+type} aria-hidden="true">{Array.from({length:6},(_,i)=><img key={i} style={{'--i':i}} src={pixel(particles)} alt=""/>)}</div>}
  </div>
  <div className="hero-thought"><img src={pixel(scene==='wash'?'shower-badge':scene==='feed'?'dinner-plate':m[2])} alt=""/><span>{scene==='wash'?a.T('Bubbles, shampoo… all fresh!','בועות, שמפו… מתרעננים!'):scene==='feed'?a.T('Something tasty at our little table.','משהו טעים ליד השולחן הקטן.'):a.T(m[0],m[1])}</span></div>
  {preview&&<span className="hero-room-preview"><Eye size={15}/>{a.T('Try it on · not saved','מדידה בלבד · לא נשמר')}</span>}
 </div>;
}

function Stars({a,value}){return <span className="hero-stars"><img src={pixel('yellow-star')} alt=""/><strong dir="ltr">{value}</strong><span>{a.T('stars','כוכבים')}</span></span>}

export function HeroHome({a,ui,onBusyChange}){
 const {Heading,KidsNavigation,KidChooser,XPBar,Avatar,Button,Badge,Tabs}=ui,children=a.members.filter(m=>m.role==='child'),child=a.member(a.user).role==='child'?a.user:children.some(c=>c.id===a.selectedChild)?a.selectedChild:children[0]?.id;
 const profile=a.data.profiles[child]||{},state=heroState(profile),level=1+Math.floor((profile.xp||0)/100),editable=a.member(a.user).role==='parent'||a.user===child;
 const [tab,setTab]=useState('fridge'),[gardenView,setGardenView]=useState('garden'),[category,setCategory]=useState('all'),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[quantity,setQuantity]=useState(1),[busy,setBusy]=useState(false),[sync,setSync]=useState({pending:0,failed:0}),[now,setNow]=useState(Date.now()),[animation,setAnimation]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[showCharacters,setShowCharacters]=useState(false);
 const [careNotice,setCareNotice]=useState(null);
 const [collectionSection,setCollectionSection]=useState('character');
 const [newRoomItem,setNewRoomItem]=useState(null);
 const lock=useRef(false),timer=useRef(null),shelf=useRef(null),world=useRef(null),dialog=useRef(null),opener=useRef(null),care=heroCare(profile,now),asleep=!!care.sleepingAt,waiting=busy||sync.pending>0,look=heroLook(profile),balance=heroBalance(profile),cooling=now-Date.parse(state.lastActionAt||'1970-01-01')<1800,hasFood=Object.entries(state.pantry).some(([id,n])=>n>0&&HERO_BY_ID[id]?.category==='food');
 useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(tick);clearTimeout(timer.current)}},[]);
 useEffect(()=>{const who=profile.character|| (child==='noa'?'noa':'itai');for(const name of [who+'-feed.png',who+'-sleep-head.png',who+'-wash-body.png','curtain-front-room.png','room.png','bed-front-room.png','bubble.png']){const img=new Image();img.src='/assets/generated/hero-home/care-room-v4/'+name}const actions=new Image();actions.src='/assets/generated/hero-care-life/'+who+'-actions.png';},[profile.character,child]);
 useEffect(()=>a.cloud?.client.subscribeStatus(setSync),[a.cloud?.client]);
 useEffect(()=>{onBusyChange?.(waiting)},[waiting,onBusyChange]);
 useEffect(()=>()=>onBusyChange?.(false),[onBusyChange]);
 useEffect(()=>{setSelected(null);setMessage('');setError('');setAnimation(null);setCareNotice(null);setShowCharacters(false)},[child]);
 useEffect(()=>{if(!cooling&&careNotice?.code==='slow-down')setCareNotice(null)},[cooling,careNotice?.code]);
 useEffect(()=>{if(!selected)return;opener.current=document.activeElement;dialog.current?.showModal();return()=>opener.current?.focus?.()},[selected]);
 const animate=(type,extra={})=>{clearTimeout(timer.current);setAnimation({type,id:crypto.randomUUID(),...extra});timer.current=setTimeout(()=>setAnimation(null),type==='tidy'?6200:['feed','wash'].includes(type)?5400:3000)};
 const commit=async(payload,success)=>{
  if(lock.current||waiting||!editable)return false;lock.current=true;setBusy(true);setError('');
  const isCare=payload.kind==='care';if(isCare){setMessage('');setCareNotice({action:payload.action,kind:'pending',text:a.T('Waiting for the household server…','ממתינים לאישור שרת הבית…')})}else setCareNotice(null);
  try{
   await a.update(d=>{const p=d.profiles[child]||{},command={...payload,id:crypto.randomUUID(),revision:heroState(p).revision};d.profiles[child]={...(a.cloud&&gameCommands.has(payload.kind)?p:applyHeroCommand(p,command)),...(a.cloud?{heroRequest:command}:{})}});
   setNow(Date.now());if(isCare)setCareNotice({action:payload.action,kind:'success',text:success});else setMessage(success||a.T('Saved.','נשמר.'));return true;
  }catch(e){const copy=HERO_ERROR_COPY[e.code||e.message],text=copy?a.T(...copy):a.T(e.rejected?'The change was refused and undone. Please try again.':'Waiting for the household server. Your change is not confirmed yet.',e.rejected?'השינוי נדחה ובוטל. אפשר לנסות שוב.':'ממתינים לשרת הבית. השינוי עדיין לא אושר.');if(isCare)setCareNotice({action:payload.action,kind:'error',text});else setError(text);return false}
  finally{lock.current=false;setBusy(false)}
 };
 const previousRest=useRef({child,asleep});
 useEffect(()=>{if(previousRest.current.child===child&&previousRest.current.asleep&&!asleep){animate('wake');setMessage(a.T('Rested and ready!','נחים ומוכנים!'))}previousRest.current={child,asleep}},[child,asleep]);
 const openShelf=(next='fridge')=>{if(next==='shop')setCategory('gear');setTab(next);setShowCharacters(false)};
 const careBlock=action=>{
  if(asleep&&action!=='wake')return {code:'sleeping',short:a.T('Resting now','נחים עכשיו'),text:a.T('Your hero is resting. Wake up first, then choose an activity.','הדמות נחה עכשיו. קודם מתעוררים ואז בוחרים פעילות.')};
  if(action==='sleep'&&!asleep&&heroNeedFull(care.energy))return {code:'rested',short:a.T('Full of energy','מלאים באנרגיה'),text:a.T('Full of energy already. Ready to play!','כבר מלאים באנרגיה. אפשר לשחק!')};
  if(action==='feed'&&heroNeedFull(care.food))return {code:'full',short:a.T('Full tummy','כבר שבעים'),text:a.T('Full for now. Save this for later.','כרגע שבעים. נשמור לאחר כך.')};
  if(action==='wash'&&heroNeedFull(care.clean))return {code:'already-clean',short:a.T('Already clean','כבר נקיים'),text:a.T('Already fresh and clean! We can play or choose another activity.','כבר נקיים ורעננים! אפשר לשחק או לבחור פעילות אחרת.')};
  if(action==='tidy'&&heroNeedFull(care.tidy))return {code:'already-tidy',short:a.T('All tidy','כבר מסודר'),text:a.T('The room is already tidy. There is room to play!','החדר כבר מסודר. יש מקום לשחק!')};
  if(action==='play'&&care.energy<20)return {code:'tired',short:a.T('A little rest first','קודם נחים קצת'),text:a.T('A little rest will bring back energy for playing.','מנוחה קטנה תחזיר אנרגיה למשחק.')};
  if(action==='feed'&&!hasFood)return {code:'empty-fridge',short:a.T('Fridge is empty','המקרר ריק'),text:a.T('The virtual fridge is empty. Pick up some food in the shop.','המקרר הווירטואלי ריק. אפשר להוסיף אוכל מהחנות.'),shop:true};
  if(cooling&&action!=='wake')return {code:'slow-down',short:a.T('One moment','עוד רגע'),text:a.T('Let’s finish this little action. Another will be ready in a moment.','מסיימים את הפעולה הקטנה הזאת. עוד רגע אפשר לבחור פעולה נוספת.')};
  return null;
 };
 const act=async(action,food)=>{
  if(waiting||!editable)return;
  const reveal=()=>{const room=world.current?.querySelector('.hero-room');if(!room)return;const bar=document.querySelector('.bayit-shell-header,.mobile-top')?.getBoundingClientRect(),inset=bar?.height?Math.max(0,bar.bottom):0;window.scrollTo({top:Math.max(0,window.scrollY+room.getBoundingClientRect().top-inset-12),behavior:'instant'})},revealNotice=()=>{const note=world.current?.querySelector('.hero-care-notice');if(!note)return;const top=document.querySelector('.bayit-shell-header,.mobile-top')?.getBoundingClientRect(),bottom=document.querySelector('.bayit-shell-nav[data-position=bottom],.mobile-bottom')?.getBoundingClientRect(),r=note.getBoundingClientRect(),upper=(top?.height?Math.max(0,top.bottom):0)+10,lower=(bottom?.height?bottom.top:innerHeight)-10,delta=r.top<upper?r.top-upper:r.bottom>lower?r.bottom-lower:0;if(delta)window.scrollBy({top:delta,behavior:'instant'})},blocked=careBlock(action);
  if(blocked){setCareNotice({...blocked,action,kind:'info'});setMessage('');setError('');requestAnimationFrame(revealNotice);return}if(action==='feed'&&!food){setCareNotice({action,kind:'info',text:a.T('Choose something tasty from your fridge below.','בוחרים משהו טעים מהמקרר שמופיע בהמשך.')});openShelf('fridge');return}
  reveal();
  const ok=await commit({kind:'care',action,...(food?{food}:{})},a.T(...careCopy[action]));if(ok){requestAnimationFrame(()=>{reveal();animate(action==='play'?'play':action,food?{food}:{})})}else requestAnimationFrame(revealNotice);return ok;
 };
 const choose=item=>{setQuantity(1);setSelected(item)};
 const equip=async(item)=>{if(await commit(item.category==='room'?{kind:'room-layout',placements:{...heroRoomDisplay(profile),[heroRoomSlot(item.id)]:item.id}}:{kind:'equip',slot:item.slot,item:item.id},a.T('Looking good!','נראה נהדר!'))){setSelected(null);animate(item.slot==='motion'?item.id:'bounce')}};
 const buy=async item=>{if(await commit({kind:'buy',item:item.id,quantity:item.category==='food'?quantity:1},item.category==='food'?a.T('Added to your virtual fridge.','נוסף למקרר הווירטואלי שלכם.'):item.category==='room'?a.T('In My toybox. Choose its place in Room.','בארגז שלי. בוחרים מקום בתוך לחדר.'):a.T('Added to your collection and equipped!','נוסף לאוסף ומופיע על הדמות!'))){setSelected(null);if(item.category==='room'){setNewRoomItem(item.id);setCollectionSection('room');setTab('closet')}animate(item.slot==='motion'?item.id:'starburst')}};
 const previewProfile=selected?.slot?{...profile,hero:{...state,loadout:{...look,[selected.slot]:selected.id},...(selected.category==='room'?{owned:[...state.owned,selected.id],roomDisplay:{...heroRoomDisplay(profile),[heroRoomSlot(selected.id)]:selected.id}}:{})}}:profile;
 const shopItems=HERO_ITEMS.filter(i=>i.category!=='food'&&(category==='all'||i.category===category)&&(!search||[i.en,i.he].some(s=>s.toLowerCase().includes(search.toLowerCase())))&&(filter==='all'||filter==='affordable'&&i.price<=balance&&i.level<=level&&!heroOwned(profile,i)||filter==='owned'&&heroOwned(profile,i)));
 if(!child)return <><Heading title={a.T('A little world of your own.','עולם קטן משלכם.')} subtitle={a.T('Add a child to bring your first hero home.','הוסיפו ילד למשפחה כדי להתחיל את ההרפתקה.')}/><Button onClick={()=>a.go('family')}>{a.T('Add a family member','הוספת בן משפחה')}</Button></>;
 if(!editable)return <div className="hero-home"><div className="hero-readonly-room"><HeroRoom a={a} who={child} profile={profile}/></div><p className="hero-readonly">{a.T("The character’s look is shared with the family. Their fridge, needs and game history are available only to this child and their parents.","המראה של הדמות משותף עם המשפחה. המקרר, הצרכים והיסטוריית המשחק זמינים רק לילד ולהורים.")}</p></div>;
 return <div className="hero-home hero-organization">

  <div className="hero-home-toolbar"><div className="hero-wallet"><Stars a={a} value={balance}/><span>{a.T('Earned stars · only pretend purchases','כוכבים שצברתם · קניות במשחק בלבד')}</span></div></div>
  <HeroPlaces a={a} value={tab==='garden'?'garden':tab==='games'?'games':['closet','shop'].includes(tab)?'dress':'care'} disabled={waiting} onChange={v=>{setTab(v==='care'?'fridge':v==='dress'?'closet':v);setShowCharacters(false);setError('');setCareNotice(null)}}/>
  {tab==='fridge'&&<HeroCareHome key={child} a={a} profile={profile} child={child} state={state} care={care} asleep={asleep} waiting={waiting} animation={animation} notice={careNotice} error={error} message={message} Room={HeroRoom} onAct={act} onShop={()=>setTab('foodshop')} onProgress={()=>setTab('achievements')} careBlock={careBlock} world={world} balance={balance} onPlay={()=>setTab('games')} onBuy={(item,quantity)=>commit({kind:'buy',item,quantity},a.T('Added to your fridge.','נוסף למקרר שלכם.'))}/>}
  {tab==='foodshop'&&<HeroFoodStore a={a} balance={balance} waiting={waiting} onChoose={choose} onBack={()=>setTab('fridge')}/>}
  <section className="hero-shelf" ref={shelf}>
   {tab==='garden'&&<Suspense fallback={<p role="status">{a.T('Opening our garden…','פותחים את הגינה…')}</p>}><HeroGarden key={child} a={a} who={child} profile={profile} commit={commit} waiting={waiting} asleep={asleep} error={error} initialView={gardenView} onNavigate={openShelf}/></Suspense>}
   {tab==='games'&&<Suspense fallback={<p role="status">{a.T('Opening our little adventures…','פותחים את ההרפתקאות הקטנות…')}</p>}><HeroGames key={child} a={a} who={child} profile={profile} commit={commit} waiting={waiting} asleep={asleep} error={error} onNavigate={openShelf} onCelebrate={()=>animate('starburst')}/></Suspense>}
   {tab==='shop'&&<><div className="hero-section-heading"><div><h2>{category==='room'?a.T('For my room','לחדר שלי'):category==='moves'?a.T('New moves','תנועות חדשות'):a.T('Find a new look','מוצאים מראה חדש')}</h2><p>{category==='room'?a.T('New room things wait in My toybox. Choose where to display them.','דברים חדשים לחדר מחכים בארגז שלי. בוחרים היכן להציג אותם.'):category==='moves'?a.T('Preview a move, then choose it for your hero.','רואים תנועה ואז בוחרים אותה לדמות.'):a.T('Outfits and companions for your hero.','לבוש וחברים לגיבור שלכם.')}</p></div><Stars a={a} value={balance}/></div><div className="hero-shop-intro"><img src={pixel('gift-box')} alt=""/><p>{a.T(HERO_STARTER_STARS+' welcome stars + 2 stars for every 10 XP from real quests, with small daily game gifts too. Spending stars keeps your level. No real money.',HERO_STARTER_STARS+' כוכבי פתיחה + שני כוכבים לכל 10 XP ממשימות אמיתיות, וגם מתנות יומיות קטנות מהמשחקים. קניות לא מורידות רמה. ללא כסף אמיתי.')}</p></div><div className="hero-section-back"><Button secondary onClick={()=>setTab('closet')}>{a.T('Back to Dress up','חוזרים להתלבש')}</Button></div><HeroShopControls excludeFood a={a} category={category} onCategory={setCategory} search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} count={shopItems.length} onGarden={()=>{setGardenView('shop');setTab('garden')}}/><ol className="hero-shop-how"><li>{a.T('Choose a treasure','בוחרים פריט')}</li><li>{a.T('See it on your hero','רואים אותו על הדמות')}</li><li>{a.T('Get it with stars · it is equipped for you','קונים בכוכבים · הפריט מופיע על הדמות')}</li></ol><HeroCatalogGrid a={a} items={shopItems} profile={profile} look={look} level={level} onChoose={choose}/>{!shopItems.length&&<p className="hero-empty">{a.T('No treasures in this selection. Try another category or filter.','אין פריטים בבחירה הזאת. נסו קטגוריה או מסנן אחר.')}</p>}</>}
   {tab==='closet'&&<HeroCollection error={error} initialRoomItem={newRoomItem} initialSection={collectionSection} onSection={setCollectionSection} a={a} profile={profile} who={child} waiting={waiting} commit={commit} Room={HeroRoom} onChoose={choose} onShop={next=>{setCollectionSection(next==='room'?'room':next==='moves'?'moves':'character');setCategory(next);setSearch('');setFilter('all');setTab('shop')}}><Button secondary icon={UsersThree} onClick={()=>setShowCharacters(!showCharacters)}>{a.T('Choose character','בחירת דמות')}</Button>{showCharacters&&<div className="hero-character-picker">{KID_CHARACTERS.map(([id,en,he])=><button type="button" key={id} disabled={!editable||waiting} aria-pressed={(profile.character||(child==='noa'?'noa':'itai'))===id} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{await a.update(d=>{d.profiles[child].character=id});setMessage(a.T('Your character is ready.','הדמות שלכם מוכנה.'))}catch{setError(a.T('The character was not saved.','הדמות לא נשמרה.'))}finally{lock.current=false;setBusy(false)}}}><img src={'/assets/generated/avatar-'+id+'-bust.png'} alt=""/><span>{a.T(en,he)}</span></button>)}</div>}{error&&<p role="alert">{error}</p>}</HeroCollection>}
   {tab==='achievements'&&<><div className="hero-section-back"><Button secondary onClick={()=>setTab('fridge')}>{a.T('Back to Care','חוזרים לטיפול')}</Button><XPBar xp={profile.xp}/></div><div className="hero-section-heading"><div><h2>{a.T('Small acts of kindness.','מעשים קטנים של אכפתיות.')}</h2><p>{a.T('Your little wins grow as you care and collect.','ההישגים נאספים ככל שמטפלים ואוספים.')}</p></div></div><div className="hero-achievement-grid">{heroAchievements(profile).map(([id,en,he,icon,n,target])=><article key={id} className={'hero-achievement'+(n>=target?' is-earned':'')}><img src={pixel(icon)} alt=""/><h3>{a.T(en,he)}</h3><span>{n>=target?<><Check size={16}/>{a.T('Earned','הושג')}</>:<><LockSimple size={14}/><bdi>{Math.min(n,target)} / {target}</bdi></>}</span></article>)}</div><p className="hero-footnote">{a.T('Care actions are part of the game. Real routines keep their own completion and parent approval.','פעולות הטיפול שייכות למשחק. המשימות האמיתיות שומרות על סימון השלמה ואישור הורה משלהן.')}</p></>}
  </section>
  {selected&&<HeroItemDialog a={a} child={child} selected={selected} profile={profile} previewProfile={previewProfile} care={care} quantity={quantity} onQuantity={setQuantity} busy={busy} waiting={waiting} editable={editable} balance={balance} level={level} error={error} onClose={()=>setSelected(null)} onBuy={buy} onEquip={equip} dialogRef={dialog} Room={HeroRoom} Button={Button} Stars={Stars}/>}
 </div>;
}
