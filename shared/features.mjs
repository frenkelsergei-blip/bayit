// Feature registry: the single source of truth for which parts of Bayit a household and each person use
// (user decision 2026-11-09, concept B in concept/explorations/features-20261109/).
// - Family level: preferences.features = {[id]: boolean}; parents change it on the server. Missing ids use `defaultOn`.
// - Personal level: preferences.featuresByUser[memberId] = {hidden: [id]}; each person hides features in their own app only.
// - "Off" hides a feature everywhere (menus, Today, Statistics, Telegram, AI, reminders, links). Data is never deleted.
// Every route, Today widget, Statistics tab, Telegram command, AI action and reminder kind must be mapped here or listed
// as neutral; tests/features.test.mjs fails when a new one is added without a mapping.
// Installed extensions add features in shared/extensions/features.mjs; they pass the same checks as core ones.
import {joinRegistry} from './extension-registry.mjs';
import {EXTRA_FEATURES} from './extensions/features.mjs';

export const FEATURE_GROUPS=[
 {id:'everyday',en:'Everyday',he:'כל יום'},
 {id:'home',en:'Home',he:'הבית'},
 {id:'family',en:'Family',he:'המשפחה'},
 {id:'helpers',en:'Helpers',he:'עוזרים'},
];

// icon: a Phosphor icon name; the client maps it to a component.
const CORE_FEATURES=[
 {id:'today',group:'everyday',icon:'Sun',always:true,defaultOn:true,en:'Today',he:'היום',
  description:{en:'Your day at a glance.',he:'היום שלכם במבט אחד.'},routes:['today']},
 {id:'tasks',group:'everyday',icon:'CheckCircle',defaultOn:true,en:'Tasks',he:'משימות',
  description:{en:'To-dos, lists and who does what.',he:'משימות, רשימות ומי עושה מה.'},
  routes:['tasks'],widgets:['tasks','priorities'],stats:['tasks'],telegram:['tasks'],aiTools:['prepare_tasks'],aiActions:['task.create'],aiSources:['Tasks'],reminders:['tasks','overdue','taskDone'],notificationCategories:['tasks']},
 {id:'calendar',group:'everyday',icon:'CalendarDots',defaultOn:true,en:'Calendar',he:'לוח שנה',
  description:{en:'Family events and reminders.',he:'אירועים ותזכורות של המשפחה.'},
  routes:['calendar'],widgets:['agenda'],stats:['calendar'],telegram:['week'],aiTools:['prepare_calendar_events'],aiActions:['event.create'],aiSources:['Calendar'],reminders:['events'],notificationCategories:['events']},
 {id:'shopping',group:'everyday',icon:'ShoppingCart',defaultOn:true,en:'Shopping',he:'קניות',
  description:{en:'Shared shopping lists.',he:'רשימות קניות משותפות.'},
  routes:['shopping'],widgets:['shopping'],stats:['shopping'],telegram:['shopping','lists'],telegramCallbacks:['buy','shoplist'],aiTools:['prepare_shopping_items','prepare_shopping_lists'],aiActions:['shopping.add','shopping.list.create'],aiSources:['Shopping']},
 {id:'mine',group:'everyday',icon:'LockSimple',defaultOn:true,en:'My space',he:'המקום שלי',
  description:{en:'Private notes, tasks and events.',he:'פתקים, משימות ואירועים פרטיים.'},routes:['mine'],telegram:['mine']},
 {id:'journal',group:'home',icon:'BookOpen',defaultOn:false,en:'Home journal',he:'יומן הבית',
  description:{en:'Notes and memories for the family.',he:'פתקים וזיכרונות של המשפחה.'},
  routes:['journal'],widgets:['notes'],telegram:['note'],aiTools:['prepare_notes'],aiActions:['note.create'],aiSources:['Home journal']},
 {id:'expenses',group:'home',icon:'ChartBar',adult:true,defaultOn:false,keepWhenInferring:true,en:'Expenses',he:'הוצאות',
  description:{en:'Spending, income and limits. Adults only.',he:'הוצאות, הכנסות ומגבלות. למבוגרים בלבד.'},
  routes:['household/expenses'],widgets:['money','bills'],stats:['money'],telegram:['expenses','statement'],telegramCallbacks:['finance_apply'],aiTools:['prepare_expenses'],aiActions:['expense.create'],aiSources:['Expenses'],reminders:['finance'],notificationCategories:['finance']},
 {id:'documents',group:'home',icon:'FileText',defaultOn:false,en:'Documents',he:'מסמכים',
  description:{en:'IDs, warranties and contacts.',he:'תעודות, אחריות ואנשי קשר.'},routes:['household/documents'],widgets:['documents']},
 {id:'insurance',group:'home',icon:'ShieldCheck',adult:true,defaultOn:false,en:'Insurance',he:'ביטוחים',
  description:{en:'Policies and renewals. Adults only.',he:'פוליסות וחידושים. למבוגרים בלבד.'},
  routes:['household/insurance'],widgets:['insurance'],telegram:['insurance','insuranceFile'],telegramCallbacks:['insurance_subject','insurance_apply','insurance_discard'],reminders:['insurance']},
 {id:'vouchers',group:'home',icon:'Ticket',defaultOn:false,keepWhenInferring:true,en:'Vouchers',he:'שוברים',
  description:{en:'Gift cards and vouchers before they expire.',he:'שוברים וכרטיסי מתנה לפני שהם פגים.'},routes:['household/vouchers'],widgets:['vouchers'],reminders:['vouchers']},
 {id:'maintenance',group:'home',icon:'Wrench',defaultOn:false,en:'Maintenance',he:'תחזוקה',
  description:{en:'Home care and service dates.',he:'טיפולים ותאריכי שירות בבית.'},routes:['household/maintenance'],widgets:['maintenance'],reminders:['maintenance']},
 {id:'pantry',group:'home',icon:'Package',defaultOn:false,en:'Pantry',he:'מזווה',
  description:{en:'What’s at home and what runs out.',he:'מה יש בבית ומה נגמר.'},routes:['household/pantry'],widgets:['pantry']},
 {id:'meals',group:'home',icon:'ForkKnife',defaultOn:false,en:'Meals',he:'ארוחות',
  description:{en:'Recipes and weekly meal plans.',he:'מתכונים ותכנון ארוחות.'},routes:['household/meals'],widgets:['meals']},
 {id:'kids',group:'family',icon:'UsersThree',defaultOn:false,en:'Kids & My Hero',he:'ילדים והגיבור שלי',
  description:{en:'Routines, rewards and the kids’ game.',he:'שגרות, פרסים והמשחק של הילדים.'},
  routes:['kids','settings/kids'],stats:['kids'],telegramCallbacks:['approve'],aiActions:['routine.create'],reminders:['routines','approval','childUpdates'],notificationCategories:['routines']},
 {id:'statistics',group:'family',icon:'ChartBar',defaultOn:false,keepWhenInferring:true,en:'Statistics',he:'סטטיסטיקה',
  description:{en:'How the week went, by area.',he:'איך עבר השבוע, לפי תחום.'},routes:['statistics'],stats:['overview']},
 {id:'ai',group:'helpers',icon:'Sparkle',defaultOn:false,keepWhenInferring:true,en:'Bayit AI',he:'בית AI',
  description:{en:'Questions and suggestions you approve first.',he:'שאלות והצעות שמחכות לאישור שלכם.'},
  routes:['ai'],widgets:['ai'],telegram:['ask','photo','voice'],telegramCallbacks:['apply','undo'],aiTools:['answer_from_records','prepare_changes']},
 {id:'telegram',group:'helpers',icon:'TelegramLogo',defaultOn:false,keepWhenInferring:true,en:'Telegram bot',he:'בוט טלגרם',
  description:{en:'Reminders and quick adds in Telegram.',he:'תזכורות והוספה מהירה בטלגרם.'},routes:[],telegram:['start','help','account','stop','today']},
];

// Routes that belong to no feature: always available (Settings, Profile, sign-in, the family hub, assets, notifications).
export const NEUTRAL_ROUTES=['settings','profile','family','welcome','signup','signin','join','assets','notifications'];
// Mapping lists an entry may carry; each value belongs to exactly one feature.
export const FEATURE_MAPPINGS=['routes','widgets','stats','telegram','telegramCallbacks','aiTools','aiActions','aiSources','reminders','notificationCategories'];
const text=v=>typeof v==='string'&&v.trim()!=='';
function featureProblem(f,all){
 if(!FEATURE_GROUPS.some(g=>g.id===f.group))return 'group must be one of '+FEATURE_GROUPS.map(g=>g.id).join(', ')+'.';
 if(!text(f.icon)||!text(f.en)||!text(f.he)||!text(f.description?.en)||!text(f.description?.he))return 'needs an icon and English and Hebrew names and descriptions.';
 if(typeof f.defaultOn!=='boolean')return 'needs defaultOn: true or false.';
 for(const key of FEATURE_MAPPINGS){
  if(f[key]===undefined)continue;
  if(!Array.isArray(f[key])||!f[key].every(text))return key+' must be a list of names.';
  for(const v of f[key]){
   const owner=all.slice(0,all.indexOf(f)).find(o=>o[key]?.includes(v));if(owner)return key+' "'+v+'" already belongs to "'+owner.id+'".';
   if(key==='routes'&&NEUTRAL_ROUTES.includes(v))return 'route "'+v+'" is a neutral core route.';
   // Feature modules live under x/<id> (docs/feature-module-design.md §2.3); no other feature may use that namespace.
   if(key==='routes'&&(v==='x'||v.startsWith('x/'))&&v!=='x/'+f.id&&!v.startsWith('x/'+f.id+'/'))return 'route "'+v+'" must be "x/'+f.id+'" or "x/'+f.id+'/<view>".';
  }
 }
 return '';
}
// Core features first, then the ones installed extensions add in shared/extensions/features.mjs.
export const FEATURES=joinRegistry('feature',CORE_FEATURES,EXTRA_FEATURES,featureProblem);

export const FEATURE_IDS=FEATURES.map(f=>f.id);
export const featureById=id=>FEATURES.find(f=>f.id===id);
// Household tabs; the Household page exists while at least one of them is on.
export const HOUSEHOLD_FEATURES=FEATURES.filter(f=>f.routes?.some(r=>r.startsWith('household/'))).map(f=>f.id);
// Today widgets that are not owned by one feature; pins are filtered by the pinned record's feature instead.
export const NEUTRAL_WIDGETS=['pins'];

// New households (Core 5): Today, Tasks, Calendar, Shopping and My space. Everything else is offered as "Add".
export function featureDefaults(){return Object.fromEntries(FEATURES.map(f=>[f.id,!!(f.always||f.defaultOn)]))}

const has=v=>Array.isArray(v)?v.some(r=>r&&!r.deletedAt):!!v;
// Existing households (no saved choice yet): keep everything that has data or may be used outside this state
// (Expenses/RiseUp, Vouchers, AI, Telegram, Statistics); turn off only features that are visibly empty.
export function inferFeatures(state={}){
 const p=state.preferences||{},tasks=(state.tasks||[]).filter(t=>t&&!t.deletedAt),out=featureDefaults();
 for(const f of FEATURES)if(f.keepWhenInferring)out[f.id]=true;
 out.journal=has(state.notes);
 out.documents=has(state.documents)||has(state.contacts);
 out.insurance=has(state.insurances);
 out.maintenance=tasks.some(t=>t.category==='maintenance')||!!p.maintenanceDate;
 out.pantry=has(state.pantry)||has(p.inventory);
 out.meals=has(state.meals);
 out.kids=(state.members||[]).some(m=>m.role==='child')||tasks.some(t=>t.routine);
 out.expenses=true;
 return out;
}

// The family's choices, with defaults for ids saved before a feature existed.
export function resolveFeatures(saved,state){
 const base=saved&&typeof saved==='object'&&!Array.isArray(saved)?{...featureDefaults(),...saved}:inferFeatures(state);
 const out={};for(const f of FEATURES)out[f.id]=f.always?true:base[f.id]===true;return out;
}

export function validateFeatures(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid features.');
 for(const [k,v]of Object.entries(value)){if(!FEATURE_IDS.includes(k)||typeof v!=='boolean')throw Error('Choose valid features.');if(featureById(k).always&&v!==true)throw Error('Today is always on.')}
}
export function validateFeaturesByUser(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid personal settings.');
 for(const entry of Object.values(value)){if(entry===undefined)continue;if(!entry||typeof entry!=='object'||!Array.isArray(entry.hidden)||entry.hidden.length>FEATURE_IDS.length||entry.hidden.some(id=>!FEATURE_IDS.includes(id)||featureById(id).always))throw Error('Choose valid personal settings.')}
}

// One rule for every surface: is this feature on for this person?
// family: resolved family map; hidden: this person's hidden ids; role: parent|adult|child.
export function featureOn({family,hidden=[],role}={},id){
 const f=featureById(id);if(!f)return true;if(f.always)return true;
 if(family&&family[id]!==true)return false;
 if(f.adult&&role==='child')return false;
 return !hidden.includes(id);
}
// Is the family using it at all (ignores the person's own hiding)? Used for server-side refusals of family data.
export const familyFeatureOn=(family,id)=>featureOn({family},id);

export function featureContext(preferences={},memberId,role,state){
 const family=preferences.features&&typeof preferences.features==='object'?resolveFeatures(preferences.features):resolveFeatures(undefined,state||{});
 const hidden=preferences.featuresByUser?.[memberId]?.hidden||[];
 const ctx={family,hidden,role};
 // used(): the family uses it and this person hasn't hidden it; role limits (adults only) are answered by their own checks.
 return {...ctx,on:id=>featureOn(ctx,id),used:id=>featureOn({family,hidden},id),route:route=>routeAllowed(ctx,route)};
}

const lookup=(key,value)=>FEATURES.find(f=>f[key]?.includes(value))?.id||null;
export const widgetFeature=id=>lookup('widgets',id);
export const statsFeature=id=>lookup('stats',id);
export const telegramFeature=command=>lookup('telegram',command);
export const telegramCallbackFeature=action=>lookup('telegramCallbacks',action);
export const aiToolFeature=name=>lookup('aiTools',name);
export const aiSourceFeature=label=>lookup('aiSources',label);
export const reminderFeature=kind=>lookup('reminders',kind);
export const notificationCategoryFeature=category=>lookup('notificationCategories',category);

// Which feature owns a stored record (for AI context, Telegram, pins, reminders and links).
export function recordFeature(collection,record={}){
 if(collection==='tasks'||collection==='history')return record.routine?'kids':record.category==='maintenance'?'maintenance':'tasks';
 return ({events:'calendar',notes:'journal',shopping:'shopping',purchases:'shopping',shoppingLists:'shopping',shoppingMarks:'shopping',favourites:'shopping',receipts:'shopping',taskLists:'tasks',documents:'documents',contacts:'documents',meals:'meals',pantry:'pantry',expenses:'expenses',bills:'expenses',insurances:'insurance',vouchers:'vouchers'})[collection]||null;
}
// Notes are shown by the Home journal and, for one's own private notes, by My space.
export function recordOn(ctx,collection,record={},actorId){
 const id=recordFeature(collection,record);if(!id)return true;
 if(collection==='notes'&&record.visibility==='private'&&record.ownerId===actorId&&featureOn(ctx,'mine'))return true;
 return featureOn(ctx,id);
}
// AI/Telegram actions: {kind:'task.create'} or {kind:'record.update',collection,record}.
export function actionFeature(action={}){
 if(/^record\./.test(action.kind||''))return recordFeature(action.collection,action.record||action.value||{});
 if(action.kind==='task.create'&&(action.routine||action.value?.routine))return 'kids';
 return lookup('aiActions',action.kind);
}

// Routes: "root" or "root/view" (hash without '#', query ignored).
export function routeFeature(route){
 const [path]=String(route||'').replace(/^#/,'').split('?'),[root,view]=path.split('/');
 if(!root)return 'today';
 if(root==='settings')return view==='kids'?'kids':null;
 if(NEUTRAL_ROUTES.includes(root))return null;
 if(root==='household')return view&&lookup('routes','household/'+view)||'household';
 if(root==='x')return view?lookup('routes','x/'+view):null; // feature modules (shared/feature-modules.mjs)
 return lookup('routes',root);
}
export function routeAllowed(ctx,route){
 const id=routeFeature(route);if(!id)return true;
 if(id==='household')return HOUSEHOLD_FEATURES.some(h=>featureOn(ctx,h));
 return featureOn(ctx,id);
}
export const featureLabel=(id,lang)=>{const f=featureById(id);return f?(lang==='he'?f.he:f.en):''};
// Server side: the same rule from a stored household state for one member.
export function stateFeatureContext(state,memberId){
 const role=(state?.members||[]).find(m=>m.id===memberId)?.role;
 return featureContext({features:state?.preferences?.features,featuresByUser:state?.preferences?.featuresByUser},memberId,role,state);
}
// Server delivery (Telegram, Push, reminders, AI context): a member's visibleState() without the records of
// features that are off for that member. Used only for reading and sending; stored data is never changed.
const DELIVERY_COLLECTIONS=['tasks','events','notes','shopping','purchases','history','documents','contacts','meals','pantry','expenses','bills','insurances'];
export function deliveryView(visible,memberId){
 if(!visible||typeof visible!=='object')return visible;
 const ctx=featureContext(visible.preferences||{},memberId,(visible.members||[]).find(m=>m.id===memberId)?.role,visible),out={...visible};
 for(const c of DELIVERY_COLLECTIONS)if(Array.isArray(visible[c]))out[c]=visible[c].filter(r=>recordOn(ctx,c,r,memberId));
 // Feature modules: a module whose feature is off for this member is dropped (stored data is untouched).
 if(visible.extensions&&typeof visible.extensions==='object')out.extensions=Object.fromEntries(Object.entries(visible.extensions).filter(([id])=>featureOn(ctx,id)));
 if(Array.isArray(visible.changeNotices))out.changeNotices=visible.changeNotices.filter(n=>{const f=recordFeature(n.collection,n.record||n.value||{});return !f||ctx.on(f)});
 Object.defineProperty(out,'features',{value:ctx,enumerable:false});
 return out;
}
